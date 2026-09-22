import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { copyToClipboard } from './clipboard.js';
import { appControlAddress, openWorkspace, stateDirFor } from './t3App.js';
import { T3Api, samePath, serverCommand, threadCommands, threadDefaults } from './t3Api.js';
import type { ServerCommand } from './t3Api.js';
import { hiddenModelsFromSettings, toCatalog, toModelSelection } from './models.js';
import type { HiddenModels, ModelCatalog, ModelChoice } from './models.js';
import type { PreparedWorktree } from './prompt.js';
import type { T3HandOffSnapshot } from './handOffTracking.js';

const run = promisify(execFile);

export interface T3Runtime {
  /** Origin of the local T3 Code server, e.g. http://127.0.0.1:3773. */
  origin: string | null;
  /** The server's process id, used to find the binary that can run T3 Code's CLI. */
  pid: number | null;
  /** `<T3CODE_HOME or ~/.t3>/userdata`, which also names the desktop app's control socket. */
  stateDir: string;
}

function t3Home(): string {
  const configured = process.env['T3CODE_HOME']?.trim();
  if (!configured) return join(homedir(), '.t3');
  return resolve(configured.replace(/^~(?=$|[\\/])/, homedir()));
}

/**
 * Where T3 Code is reachable on this machine. The server writes its port and pid to
 * <state>/server-runtime.json on every start, so this survives a port change.
 */
export async function detectT3(): Promise<T3Runtime> {
  const stateDir = stateDirFor(t3Home(), process.platform);
  let origin: string | null = null;
  let pid: number | null = null;
  try {
    const raw = JSON.parse(await readFile(join(stateDir, 'server-runtime.json'), 'utf8')) as {
      origin?: unknown;
      port?: unknown;
      pid?: unknown;
    };
    if (typeof raw.origin === 'string') origin = raw.origin;
    else if (typeof raw.port === 'number') origin = `http://127.0.0.1:${String(raw.port)}`;
    if (typeof raw.pid === 'number') pid = raw.pid;
  } catch {
    // Not running, or never installed. The clipboard path still works.
  }
  return { origin, pid, stateDir };
}

/** Hand a URL to the OS: the browser for http(s). */
export async function openExternal(target: string): Promise<void> {
  if (process.platform === 'win32') {
    await run('cmd', ['/c', 'start', '', target], { windowsHide: true });
    return;
  }
  await run(process.platform === 'darwin' ? 'open' : 'xdg-open', [target]);
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run('git', args, { cwd, windowsHide: true });
  return stdout.trim();
}

/** The checkout T3 Code should work in: the launch directory's repo root, if it is a clone of `repo`. */
export async function resolveWorkspace(cwd: string, repo: string, repoOfCwd: () => Promise<string>): Promise<string | null> {
  try {
    const root = resolve(await git(cwd, ['rev-parse', '--show-toplevel']));
    return (await repoOfCwd()).toLowerCase() === repo.toLowerCase() ? root : null;
  } catch {
    return null;
  }
}

/** Where T3 Code keeps its own worktrees: `<T3 home>/worktrees/<repo dir>/<branch, slashes as dashes>`. */
export function worktreePathFor(t3Home: string, workspaceRoot: string, branch: string): string {
  return join(t3Home, 'worktrees', basename(workspaceRoot), branch.replace(/\//g, '-'));
}

/** `wayfinder/12-x`, or `wayfinder/12-x-2` and up when an earlier attempt already took the name. */
async function freeBranch(root: string, branch: string): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    const candidate = attempt === 1 ? branch : `${branch}-${String(attempt)}`;
    try {
      await git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${candidate}`]);
    } catch {
      return candidate;
    }
  }
}

export type HandOffRung = 'thread' | 'app' | 'clipboard';

export interface HandOffResult {
  /** How far the hand-off got: a running thread, a new empty thread, or the clipboard alone. */
  rung: HandOffRung | null;
  copied: boolean;
  threadId: string | null;
  /** The prompt that went out, which differs when T3 Code made the worktree. */
  prompt: string;
  /** One line on why it fell short of starting the thread, for the UI to show. */
  notice: string | null;
  /** Filled when even the clipboard failed. */
  error: string | null;
  /** Server-only metadata for durable tracking; callers should keep it out of the renderer response. */
  tracking: T3HandOffMetadata | null;
}

export interface T3HandOffMetadata {
  environmentId: string | null;
  projectId: string;
  branch: string | null;
  worktreePath: string | null;
}

export interface HandOffInput {
  title: string;
  /** Null when the launch directory is not a checkout of the repo. */
  workspaceRoot: string | null;
  /** The ticket's branch name, before any `-2` suffix. */
  branch: string;
  /** The model picked in the UI, or null to let T3 Code's defaults decide. */
  model: ModelChoice | null;
  prompt: (worktree: PreparedWorktree | null) => string;
}

/** Each rung of the ladder, injectable so the fallback order can be tested without T3 Code. */
export interface HandOffSteps {
  startThread: (input: HandOffInput & { workspaceRoot: string }) => Promise<{
    threadId: string;
    prompt: string;
    tracking?: T3HandOffMetadata;
  }>;
  openApp: (workspaceRoot: string) => Promise<void>;
  copy: (text: string) => Promise<void>;
}

/**
 * Try the best hand-off first and fall back one rung at a time:
 * start a running thread, else open a fresh thread with the prompt on the clipboard,
 * else just the clipboard.
 */
export async function handOff(input: HandOffInput, steps: HandOffSteps): Promise<HandOffResult> {
  const plain = input.prompt(null);
  let notice: string | null = null;

  if (input.workspaceRoot === null) {
    notice = 'T3 Code needs a local clone of this repo to start a thread.';
  } else {
    try {
      const { threadId, prompt, tracking } = await steps.startThread({ ...input, workspaceRoot: input.workspaceRoot });
      return { rung: 'thread', copied: false, threadId, prompt, notice: null, error: null, tracking: tracking ?? null };
    } catch (error) {
      notice = `Could not start the thread (${(error as Error).message}).`;
    }
  }

  let copied = false;
  let error: string | null = null;
  try {
    await steps.copy(plain);
    copied = true;
  } catch (copyError) {
    error = `Clipboard: ${(copyError as Error).message}`;
  }

  if (input.workspaceRoot !== null) {
    try {
      await steps.openApp(input.workspaceRoot);
      return { rung: 'app', copied, threadId: null, prompt: plain, notice: `${notice} Opened a new thread; paste the prompt.`, error, tracking: null };
    } catch {
      // Desktop app not running or too old for the control socket. The clipboard still has it.
    }
  }

  return { rung: copied ? 'clipboard' : null, copied, threadId: null, prompt: plain, notice, error, tracking: null };
}

/** Bring T3 Code forward. A second launch of the desktop app just focuses the first. */
function reveal(command: ServerCommand | null, origin: string): void {
  if (command !== null && /server\.asar/.test(command.script)) {
    const env = { ...process.env };
    delete env['ELECTRON_RUN_AS_NODE'];
    spawn(command.exe, [], { detached: true, stdio: 'ignore', env, windowsHide: false }).unref();
    return;
  }
  void openExternal(origin).catch(() => undefined);
}

interface T3Config {
  catalog: ModelCatalog;
  defaultModelSelection: unknown;
}

/** Models the user turned off in T3 Code's picker live in client settings, not in `server.getConfig`. */
async function readClientModelHides(stateDir: string): Promise<{ hidden: HiddenModels; stamp: string }> {
  const path = join(stateDir, 'client-settings.json');
  try {
    const [text, info] = await Promise.all([readFile(path, 'utf8'), stat(path)]);
    return { hidden: hiddenModelsFromSettings(JSON.parse(text) as unknown), stamp: String(info.mtimeMs) };
  } catch {
    return { hidden: new Map(), stamp: '' };
  }
}

/** The real ladder steps, bound to whatever T3 Code is running right now. */
export class T3HandOff {
  private api: { key: string; api: T3Api; command: ServerCommand } | null = null;
  private config: { key: string; at: number; value: Promise<T3Config> } | null = null;

  private async connect(runtime: T3Runtime): Promise<{ api: T3Api; command: ServerCommand; origin: string }> {
    if (runtime.origin === null || runtime.pid === null) throw new Error('T3 Code is not running');
    const key = `${runtime.origin}#${String(runtime.pid)}`;
    if (this.api?.key !== key) {
      this.api?.api.revoke();
      const command = await serverCommand(runtime.pid);
      if (command === null) throw new Error('could not find the T3 Code binary');
      this.api = { key, api: new T3Api(runtime.origin, command), command };
    }
    return { api: this.api.api, command: this.api.command, origin: runtime.origin };
  }

  /** T3 Code's providers and settings, cached for a minute: the reply is large and rarely changes. */
  private async t3Config(runtime: T3Runtime): Promise<T3Config> {
    const { api } = await this.connect(runtime);
    const hides = await readClientModelHides(runtime.stateDir);
    const key = `${this.api?.key ?? ''}#${hides.stamp}`;
    if (this.config === null || this.config.key !== key || Date.now() - this.config.at > 60_000) {
      const value = api.rpc('server.getConfig').then((raw) => {
        const config = raw as { providers?: unknown; settings?: { defaultModelSelection?: unknown } };
        return {
          catalog: toCatalog(Array.isArray(config.providers) ? config.providers : [], hides.hidden),
          defaultModelSelection: config.settings?.defaultModelSelection ?? null,
        };
      });
      value.catch(() => {
        this.config = null;
      });
      this.config = { key, at: Date.now(), value };
    }
    return this.config.value;
  }

  /** The models T3 Code can run right now. */
  async models(runtime: T3Runtime): Promise<ModelCatalog> {
    return (await this.t3Config(runtime)).catalog;
  }

  /** The workspace roots T3 Code already holds projects for: every clone it knows about. */
  async projects(runtime: T3Runtime): Promise<string[]> {
    const { api } = await this.connect(runtime);
    const snapshot = await api.snapshot();
    return snapshot.projects
      .filter((project) => project.deletedAt === null && typeof project.workspaceRoot === 'string' && project.workspaceRoot.length > 0)
      .map((project) => project.workspaceRoot);
  }

  async readHandOffSnapshot(): Promise<T3HandOffSnapshot> {
    const runtime = await detectT3();
    const { api, origin } = await this.connect(runtime);
    const [snapshot, descriptor] = await Promise.all([
      api.shell(),
      api.environment().catch(() => null),
    ]);
    const environment = typeof descriptor === 'object' && descriptor !== null ? descriptor as Record<string, unknown> : null;
    const environmentId = typeof environment?.['environmentId'] === 'string' ? environment['environmentId'] : null;
    return { environmentId, origin, snapshot };
  }

  async subscribeShell(
    afterSequence: number | null,
    onValue: (value: unknown) => void,
    onClose: () => void,
  ): Promise<() => void> {
    const runtime = await detectT3();
    const { api } = await this.connect(runtime);
    return api.subscribeShell(afterSequence, onValue, onClose);
  }

  steps(runtime: T3Runtime): HandOffSteps {
    return {
      startThread: async (input) => {
        const { api, command, origin } = await this.connect(runtime);
        const snapshot = await api.snapshot();
        const project = snapshot.projects.find(
          (candidate) => candidate.deletedAt === null && samePath(candidate.workspaceRoot, input.workspaceRoot),
        );
        let projectId = project?.id ?? null;
        const globalDefault = await this.t3Config(runtime)
          .then((config) => config.defaultModelSelection)
          .catch(() => null);
        const defaults = threadDefaults(snapshot, projectId, {
          chosen: input.model === null ? null : toModelSelection(input.model),
          globalDefault,
        });
        if (defaults === null) throw new Error('no model to use yet; start one thread in T3 Code first');

        if (projectId === null) {
          projectId = randomUUID();
          await api.dispatch({
            type: 'project.create',
            commandId: randomUUID(),
            projectId,
            title: basename(input.workspaceRoot),
            workspaceRoot: input.workspaceRoot,
            createdAt: new Date().toISOString(),
          });
        }

        let worktree: (PreparedWorktree & { path: string }) | null = null;
        const baseBranch = await git(input.workspaceRoot, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => 'HEAD');
        if (baseBranch !== 'HEAD') {
          const branch = await freeBranch(input.workspaceRoot, input.branch);
          const path = worktreePathFor(dirname(runtime.stateDir), input.workspaceRoot, branch);
          await git(input.workspaceRoot, ['worktree', 'add', '-b', branch, path, baseBranch]);
          worktree = { branch, baseBranch, path };
        }

        const prompt = input.prompt(worktree);
        const { threadId, create, start } = threadCommands({ projectId, title: input.title, prompt, defaults, worktree });
        try {
          await api.dispatch(create);
          await api.dispatch(start);
        } catch (error) {
          // Leave nothing half-made behind for the fallback rung to trip over.
          await api.dispatch({ type: 'thread.delete', commandId: randomUUID(), threadId }).catch(() => undefined);
          if (worktree !== null) {
            await git(input.workspaceRoot, ['worktree', 'remove', '--force', worktree.path]).catch(() => undefined);
            await git(input.workspaceRoot, ['branch', '-D', worktree.branch]).catch(() => undefined);
          }
          throw error;
        }
        reveal(command, origin);
        const descriptor = await api.environment().catch(() => null);
        const environment = typeof descriptor === 'object' && descriptor !== null ? descriptor as Record<string, unknown> : null;
        return {
          threadId,
          prompt,
          tracking: {
            environmentId: typeof environment?.['environmentId'] === 'string' ? environment['environmentId'] : null,
            projectId,
            branch: worktree?.branch ?? null,
            worktreePath: worktree?.path ?? null,
          },
        };
      },
      openApp: (workspaceRoot) =>
        openWorkspace(
          appControlAddress({ platform: process.platform, stateDir: runtime.stateDir, tempDir: tmpdir(), uid: process.getuid?.() }),
          workspaceRoot,
          process.platform,
        ).then(() => undefined),
      copy: copyToClipboard,
    };
  }

  /** Revoke the session token. Called on exit. */
  close(): void {
    this.api?.api.revoke();
    this.api = null;
  }
}
