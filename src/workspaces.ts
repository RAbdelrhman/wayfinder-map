import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { currentRepo } from './github.js';
import { normalizeRepo } from './repoRoutes.js';
import { samePath } from './t3Api.js';

const run = promisify(execFile);

/**
 * Where T3 Code runs a thread for a repository. A hand-off needs a checkout on disk, and the
 * desktop app is launched from the Start Menu rather than from one, so the checkout is found
 * rather than assumed: T3 Code's own projects first, then a folder the user picked, and every
 * candidate is confirmed to resolve to the repository before it counts.
 */
export type WorkspaceState =
  | { status: 'ready'; path: string }
  /** Nothing verified, or several did and only the user can say which. */
  | { status: 'choose'; candidates: string[] };

export interface WorkspaceDependencies {
  /** Workspace roots T3 Code already holds projects for. */
  knownProjects: () => Promise<string[]>;
  /** The checkout root at `path` when it is a clone of `repo`, else null. */
  verify: (path: string, repo: string) => Promise<string | null>;
  readRemembered: () => Promise<Record<string, string>>;
  writeRemembered: (all: Record<string, string>) => Promise<void>;
}

/** The checkout the CLI was launched in, already verified at startup. */
export interface LaunchWorkspace {
  repo: string | null;
  root: string | null;
}

function key(repo: string): string {
  return repo.toLowerCase();
}

function sameRepo(a: string, b: string): boolean {
  return key(a) === key(b);
}

/** `owner/name` from a GitHub remote URL in any of the forms git writes, or null. */
export function repoFromRemoteUrl(url: string): string | null {
  const match = /github\.com[:/]+([^/]+)\/(.+?)(?:\.git)?\/?$/i.exec(url.trim());
  return match === null ? null : normalizeRepo(`${match[1] ?? ''}/${match[2] ?? ''}`);
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run('git', args, { cwd, windowsHide: true });
  return stdout.trim();
}

/** Every GitHub repository this checkout's remotes point at, `origin` first. */
async function remoteRepos(root: string): Promise<string[]> {
  const lines = (await git(root, ['remote', '-v'])).split(/\r?\n/);
  const found = new Map<string, string>();
  for (const line of lines) {
    const [name = '', rest = ''] = line.split('\t', 2);
    const repo = repoFromRemoteUrl(rest.split(' ')[0] ?? '');
    if (repo !== null && !found.has(name)) found.set(name, repo);
  }
  const ordered = [...found.entries()].sort(([a], [b]) => rank(a) - rank(b));
  return [...new Set(ordered.map(([, repo]) => repo))];
}

function rank(remote: string): number {
  return remote === 'origin' ? 0 : remote === 'upstream' ? 1 : 2;
}

/**
 * The checkout root at `path` when it is a clone of `repo`, else null. Remotes answer this
 * without a network call; `gh` is only asked when no remote names a github.com repository,
 * which is how a GitHub Enterprise checkout still verifies.
 */
export async function verifyCheckout(path: string, repo: string): Promise<string | null> {
  let root: string;
  try {
    root = resolve(await git(path, ['rev-parse', '--show-toplevel']));
  } catch {
    return null;
  }
  try {
    const remotes = await remoteRepos(root);
    if (remotes.length > 0) return remotes.some((candidate) => sameRepo(candidate, repo)) ? root : null;
  } catch {
    // No remotes to read. Fall through to gh, which knows the configured host.
  }
  try {
    return sameRepo(await currentRepo(root), repo) ? root : null;
  } catch {
    return null;
  }
}

/** `~/.wayfinder-map/clones.json`: the clone the user picked for a repository, by `owner/name`. */
export function clonesFile(): string {
  return join(homedir(), '.wayfinder-map', 'clones.json');
}

export function fileStore(path: string): Pick<WorkspaceDependencies, 'readRemembered' | 'writeRemembered'> {
  return {
    readRemembered: async () => {
      try {
        const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
        if (typeof parsed !== 'object' || parsed === null) return {};
        return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
      } catch {
        return {};
      }
    },
    writeRemembered: async (all) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(all, null, 2)}\n`, 'utf8');
    },
  };
}

export const DEFAULT_WORKSPACE_DEPENDENCIES: Pick<WorkspaceDependencies, 'verify'> = { verify: verifyCheckout };

export class WorkspaceResolver {
  private remembered: Promise<Record<string, string>> | null = null;

  constructor(
    private readonly dependencies: WorkspaceDependencies,
    private readonly launch: LaunchWorkspace = { repo: null, root: null },
  ) {}

  /**
   * Where a hand-off for `repo` should run, and what to offer when there is nowhere yet.
   * Re-checked on every call, since a remembered clone can be moved or deleted between two.
   */
  async state(repo: string): Promise<WorkspaceState> {
    if (this.launch.root !== null && this.launch.repo !== null && sameRepo(this.launch.repo, repo)) {
      return { status: 'ready', path: this.launch.root };
    }

    const saved = (await this.read())[key(repo)];
    if (saved !== undefined) {
      const verified = await this.dependencies.verify(saved, repo).catch(() => null);
      if (verified !== null) return { status: 'ready', path: verified };
      await this.forget(repo);
    }

    const projects = await this.dependencies.knownProjects().catch(() => []);
    const verified: string[] = [];
    for (const path of await Promise.all(projects.map((project) => this.dependencies.verify(project, repo).catch(() => null)))) {
      if (path !== null && !verified.some((seen) => samePath(seen, path))) verified.push(path);
    }

    const only = verified[0];
    if (verified.length === 1 && only !== undefined) {
      await this.remember(repo, only);
      return { status: 'ready', path: only };
    }
    return { status: 'choose', candidates: verified };
  }

  /** The checkout for a hand-off, or null to fall back to the clipboard. */
  async resolve(repo: string): Promise<string | null> {
    const state = await this.state(repo);
    return state.status === 'ready' ? state.path : null;
  }

  /** Take the clone the user picked. Throws when it is not a checkout of `repo`. */
  async choose(repo: string, path: string): Promise<string> {
    const verified = await this.dependencies.verify(path, repo);
    if (verified === null) throw new Error(`That folder is not a checkout of ${repo}.`);
    await this.remember(repo, verified);
    return verified;
  }

  private read(): Promise<Record<string, string>> {
    this.remembered ??= this.dependencies.readRemembered().catch(() => ({}));
    return this.remembered;
  }

  private async remember(repo: string, path: string): Promise<void> {
    const all = { ...(await this.read()), [key(repo)]: path };
    this.remembered = Promise.resolve(all);
    await this.dependencies.writeRemembered(all).catch(() => undefined);
  }

  private async forget(repo: string): Promise<void> {
    const all = { ...(await this.read()) };
    delete all[key(repo)];
    this.remembered = Promise.resolve(all);
    await this.dependencies.writeRemembered(all).catch(() => undefined);
  }
}
