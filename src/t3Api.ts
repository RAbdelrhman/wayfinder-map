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
  // Newer builds preload a compile cache (`--require …compileCache.cjs`) before the script. The CLI does not need it.
  rest = rest.replace(/^(?:\s*(?:--require|-r)\s+(?:"[^"]+"|.+?\.[mc]?js)(?=\s|$))+/, '');
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
      const script = argv.find((arg, i) => i > 0 && /\.[mc]?js$/.test(arg) && !['--require', '-r'].includes(argv[i - 1] ?? ''));
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
  private readonly streams = new Set<WebSocket>();

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

  private async request(path: string, body?: unknown, retried = false, timeoutMs = 120_000): Promise<unknown> {
    const { token } = await this.issue();
    const response = await fetch(new URL(path, this.origin), {
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 401 && !retried) {
      // Expired or revoked. Mint a fresh one once.
      this.session = null;
      return this.request(path, body, true, timeoutMs);
    }
    const text = await response.text();
    if (!response.ok) throw new Error(`T3 Code answered ${String(response.status)}: ${text.slice(0, 300)}`);
    return text.length === 0 ? null : (JSON.parse(text) as unknown);
  }

  snapshot(): Promise<T3Snapshot> {
    return this.request('/api/orchestration/snapshot') as Promise<T3Snapshot>;
  }

  shell(): Promise<unknown> {
    return this.request('/api/orchestration/shell', undefined, false, 20_000);
  }

  async environment(): Promise<unknown> {
    const response = await fetch(new URL('/.well-known/t3/environment', this.origin), {
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`T3 Code environment answered ${String(response.status)}`);
    return (await response.json()) as unknown;
  }

  dispatch(command: Record<string, unknown>): Promise<unknown> {
    return this.request('/api/orchestration/dispatch', command);
  }

  /**
   * One call over T3 Code's WebSocket RPC, for what the HTTP API does not expose
   * (the provider and model list lives only there). The socket authenticates with a
   * short-lived ticket minted over HTTP, since a WebSocket cannot carry a bearer header.
   */
  async rpc(tag: string, payload: unknown = {}): Promise<unknown> {
    const { ticket } = (await this.request('/api/auth/websocket-ticket', {})) as { ticket?: unknown };
    if (typeof ticket !== 'string') throw new Error('T3 Code issued no WebSocket ticket');
    const url = new URL('/ws', this.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('wsTicket', ticket);

    return new Promise<unknown>((resolve, reject) => {
      const socket = new WebSocket(url);
      let settled = false;
      const settle = (outcome: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.close();
        outcome();
      };
      const timer = setTimeout(() => settle(() => reject(new Error(`${tag} timed out`))), 20_000);

      socket.onopen = () => socket.send(JSON.stringify({ _tag: 'Request', id: '1', tag, payload, headers: [] }));
      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as { _tag?: string; requestId?: string; exit?: { _tag?: string; value?: unknown } };
        if (message._tag === 'Ping') return socket.send(JSON.stringify({ _tag: 'Pong' }));
        if (message._tag !== 'Exit' || message.requestId !== '1') return;
        settle(() => (message.exit?._tag === 'Success' ? resolve(message.exit.value) : reject(new Error(`${tag} failed`))));
      };
      socket.onerror = () => settle(() => reject(new Error('T3 Code WebSocket failed')));
      socket.onclose = () => settle(() => reject(new Error('T3 Code closed the WebSocket')));
    });
  }

  /** Keep a resumable shell subscription open and forward every streamed chunk. */
  async subscribeShell(
    afterSequence: number | null,
    onValue: (value: unknown) => void,
    onClose: () => void,
  ): Promise<() => void> {
    const ticketResult = await this.request('/api/auth/websocket-ticket', {}, false, 20_000);
    const ticket = (ticketResult as { ticket?: unknown } | null)?.ticket;
    if (typeof ticket !== 'string') throw new Error('T3 Code issued no WebSocket ticket');
    const url = new URL('/ws', this.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('wsTicket', ticket);

    return new Promise<() => void>((resolve, reject) => {
      const socket = new WebSocket(url);
      this.streams.add(socket);
      let opened = false;
      let stopped = false;
      const timer = setTimeout(() => {
        stop();
        if (!opened) reject(new Error('T3 Code WebSocket timed out'));
      }, 20_000);
      const stop = (): void => {
        if (stopped) return;
        stopped = true;
        clearTimeout(timer);
        this.streams.delete(socket);
        socket.close();
      };
      const closeFromServer = (): void => {
        if (stopped) return;
        const wasOpened = opened;
        stop();
        if (wasOpened) onClose();
        else reject(new Error('T3 Code closed the WebSocket'));
      };

      socket.onopen = () => {
        opened = true;
        try {
          socket.send(
            JSON.stringify({
              _tag: 'Request',
              id: 'shell',
              tag: 'orchestration.subscribeShell',
              payload: { ...(afterSequence === null ? {} : { afterSequence }), requestCompletionMarker: true },
              headers: [],
            }),
          );
          clearTimeout(timer);
          resolve(stop);
        } catch {
          stop();
          reject(new Error('Could not start the T3 Code shell subscription'));
        }
      };
      socket.onmessage = (event) => {
        let message: Record<string, unknown>;
        try {
          const parsed: unknown = JSON.parse(String(event.data));
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return;
          message = parsed as Record<string, unknown>;
        } catch {
          return;
        }
        if (message['_tag'] === 'Ping') {
          socket.send(JSON.stringify({ _tag: 'Pong' }));
          return;
        }
        if (message['_tag'] === 'Exit' && message['requestId'] === 'shell') {
          closeFromServer();
          return;
        }
        if (message['_tag'] !== 'Chunk' || message['requestId'] !== 'shell') return;
        const emit = (value: unknown): void => {
          if (Array.isArray(value)) {
            for (const item of value) onValue(item);
          } else {
            onValue(value);
          }
        };
        const chunk = message['chunk'];
        if (Array.isArray(chunk)) {
          emit(chunk);
        } else if (typeof chunk === 'object' && chunk !== null && !Array.isArray(chunk)) {
          const chunkRecord = chunk as Record<string, unknown>;
          if (Array.isArray(chunkRecord['values'])) {
            emit(chunkRecord['values']);
          } else if ('value' in chunkRecord) {
            emit(chunkRecord['value']);
          } else {
            emit(chunk);
          }
        } else if ('value' in message) {
          emit(message['value']);
        } else if (Array.isArray(message['values'])) {
          emit(message['values']);
        }
      };
      socket.onerror = () => closeFromServer();
      socket.onclose = () => closeFromServer();
    });
  }

  /** Revoke the session synchronously, so it also works from an exit handler. */
  revoke(): void {
    for (const stream of this.streams) stream.close();
    this.streams.clear();
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
 * Which model and modes a new thread gets. A model picked in wayfinder-map wins, then
 * the project's default, then T3 Code's own default, then whatever the newest thread
 * used, in this project first, then anywhere. Modes follow the newest thread.
 */
export function threadDefaults(
  snapshot: T3Snapshot,
  projectId: string | null,
  preferred: { chosen?: unknown; globalDefault?: unknown } = {},
): ThreadDefaults | null {
  const live = snapshot.threads
    .filter((thread) => thread.deletedAt === null && thread.modelSelection !== null && thread.modelSelection !== undefined)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const newest = live.find((thread) => thread.projectId === projectId) ?? live[0];
  const project = snapshot.projects.find((candidate) => candidate.id === projectId);
  const modelSelection =
    preferred.chosen ?? project?.defaultModelSelection ?? preferred.globalDefault ?? newest?.modelSelection;
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
