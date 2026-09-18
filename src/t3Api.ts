import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** How the running T3 Code server was launched, so its own CLI can be run the same way. */
export interface ServerCommand {
  exe: string;
  script: string;
}

/**
 * Split a process command line into the executable and the script it runs. Pass `exe`
 * when it is known, because an unquoted path with spaces (macOS `ps`) is otherwise ambiguous.
 */
export function parseServerCommand(line: string, exe?: string): ServerCommand | null {
  let bin: string;
  let rest: string;
  if (exe !== undefined && line.startsWith(exe)) {
    bin = exe;
    rest = line.slice(exe.length);
  } else {
    const head = /^\s*(?:"([^"]*)"|(\S+))(.*)$/s.exec(line);
    if (head === null) return null;
    bin = head[1] ?? head[2] ?? '';
    rest = head[3] ?? '';
  }
  const script = /^\s*(?:"([^"]+\.[mc]?js)"|(.+?\.[mc]?js))(?=\s|$)/.exec(rest);
  if (script === null) return null;
  return { exe: bin, script: script[1] ?? script[2] ?? '' };
}

/** Look up the command line of the T3 Code server process named in server-runtime.json. */
export async function serverCommand(pid: number): Promise<ServerCommand | null> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await run(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${String(pid)}").CommandLine`],
        { windowsHide: true },
      );
      return parseServerCommand(stdout.trim());
    }
    if (process.platform === 'linux') {
      const argv = (await readFile(`/proc/${String(pid)}/cmdline`, 'utf8')).split('\0');
      const script = argv.slice(1).find((arg) => /\.[mc]?js$/.test(arg));
      return argv[0] && script ? { exe: argv[0], script } : null;
    }
    const [comm, args] = await Promise.all([
      run('ps', ['-o', 'comm=', '-p', String(pid)]),
      run('ps', ['-o', 'command=', '-p', String(pid)]),
    ]);
    return parseServerCommand(args.stdout.trim(), comm.stdout.trim());
  } catch {
    return null;
  }
}

/** Run the T3 Code CLI through the same binary the server runs on. Electron needs to be told to act as Node. */
function t3Cli(command: ServerCommand, args: string[]): Promise<{ stdout: string }> {
  return run(command.exe, [command.script, ...args], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    windowsHide: true,
    timeout: 30_000,
  });
}

export interface T3Project {
  id: string;
  workspaceRoot: string;
  defaultModelSelection: unknown;
  deletedAt: string | null;
}

export interface T3Thread {
  projectId: string;
  modelSelection: unknown;
  runtimeMode: string;
  interactionMode: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface T3Snapshot {
  projects: T3Project[];
  threads: T3Thread[];
}

/**
 * Talks to the local T3 Code server with a bearer session minted by T3 Code's own
 * `t3 auth session issue`. The token lives in memory only and is revoked on exit.
 */
export class T3Api {
  private session: Promise<{ id: string; token: string }> | null = null;
  private issuedId: string | null = null;

  constructor(
    private readonly origin: string,
    private readonly command: ServerCommand,
  ) {}

  private issue(): Promise<{ id: string; token: string }> {
    this.session ??= t3Cli(this.command, ['auth', 'session', 'issue', '--json', '--ttl', '12h', '--label', 'wayfinder-map'])
      .then(({ stdout }) => {
        const issued = JSON.parse(stdout.slice(stdout.indexOf('{'))) as { sessionId?: unknown; token?: unknown };
        if (typeof issued.token !== 'string' || typeof issued.sessionId !== 'string') {
          throw new Error('T3 Code issued no session token');
        }
        this.issuedId = issued.sessionId;
        return { id: issued.sessionId, token: issued.token };
      })
      .catch((error: unknown) => {
        this.session = null;
        throw error;
      });
    return this.session;
  }

  private async request(path: string, body?: unknown, retried = false): Promise<unknown> {
    const { token } = await this.issue();
    const response = await fetch(new URL(path, this.origin), {
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(120_000),
    });
    if (response.status === 401 && !retried) {
      // Expired or revoked. Mint a fresh one once.
      this.session = null;
      return this.request(path, body, true);
    }
    const text = await response.text();
    if (!response.ok) throw new Error(`T3 Code answered ${String(response.status)}: ${text.slice(0, 300)}`);
    return text.length === 0 ? null : (JSON.parse(text) as unknown);
  }

  snapshot(): Promise<T3Snapshot> {
    return this.request('/api/orchestration/snapshot') as Promise<T3Snapshot>;
  }

  dispatch(command: Record<string, unknown>): Promise<unknown> {
    return this.request('/api/orchestration/dispatch', command);
  }

  /** Revoke the session synchronously, so it also works from an exit handler. */
  revoke(): void {
    if (this.issuedId === null) return;
    try {
      execFileSync(this.command.exe, [this.command.script, 'auth', 'session', 'revoke', this.issuedId], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        windowsHide: true,
        stdio: 'ignore',
        timeout: 10_000,
      });
    } catch {
      // It expires on its own.
    }
    this.issuedId = null;
    this.session = null;
  }
}

/** Paths compare case-insensitively where the filesystem does, and T3 Code stores native separators. */
export function samePath(a: string, b: string, platform: NodeJS.Platform = process.platform): boolean {
  const normalize = (path: string): string => {
    const native = platform === 'win32' ? path.replace(/\//g, '\\') : path;
    const trimmed = native.replace(/[\\/]+$/, '');
    return platform === 'win32' || platform === 'darwin' ? trimmed.toLowerCase() : trimmed;
  };
  return normalize(a) === normalize(b);
}

export interface ThreadDefaults {
  modelSelection: unknown;
  runtimeMode: string;
  interactionMode: string;
}

/**
 * Which model and modes a new thread gets. The project's default if it has one,
 * otherwise whatever the newest thread used, in this project first, then anywhere.
 */
export function threadDefaults(snapshot: T3Snapshot, projectId: string | null): ThreadDefaults | null {
  const live = snapshot.threads
    .filter((thread) => thread.deletedAt === null && thread.modelSelection !== null && thread.modelSelection !== undefined)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const newest = live.find((thread) => thread.projectId === projectId) ?? live[0];
  const project = snapshot.projects.find((candidate) => candidate.id === projectId);
  const modelSelection = project?.defaultModelSelection ?? newest?.modelSelection;
  if (modelSelection === null || modelSelection === undefined) return null;
  return {
    modelSelection,
    runtimeMode: newest?.runtimeMode ?? 'full-access',
    interactionMode: newest?.interactionMode ?? 'default',
  };
}

export interface ThreadInput {
  projectId: string;
  title: string;
  prompt: string;
  defaults: ThreadDefaults;
  /** The worktree the thread runs in, already created. Null runs in the project checkout. */
  worktree: { branch: string; path: string } | null;
  now?: string;
}

/**
 * The two commands T3 Code's composer sends for a new thread: create it, then start
 * its first turn. Its one-shot `bootstrap` form only works over the WebSocket RPC,
 * not the HTTP dispatch route, so the worktree is made beforehand instead.
 */
export function threadCommands(input: ThreadInput): { threadId: string; create: Record<string, unknown>; start: Record<string, unknown> } {
  const threadId = randomUUID();
  const createdAt = input.now ?? new Date().toISOString();
  const { modelSelection, runtimeMode, interactionMode } = input.defaults;

  return {
    threadId,
    create: {
      type: 'thread.create',
      commandId: randomUUID(),
      threadId,
      projectId: input.projectId,
      title: input.title,
      modelSelection,
      runtimeMode,
      interactionMode,
      branch: input.worktree?.branch ?? null,
      worktreePath: input.worktree?.path ?? null,
      createdAt,
    },
    start: {
      type: 'thread.turn.start',
      commandId: randomUUID(),
      threadId,
      message: { messageId: randomUUID(), role: 'user', text: input.prompt, attachments: [] },
      modelSelection,
      runtimeMode,
      interactionMode,
      createdAt,
    },
  };
}
