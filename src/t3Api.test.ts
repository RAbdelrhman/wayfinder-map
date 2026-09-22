import { describe, expect, it, vi } from 'vitest';

import { T3Api, parseServerCommand, samePath, threadCommands, threadDefaults } from './t3Api.js';
import type { T3Snapshot, T3Thread } from './t3Api.js';

describe('parseServerCommand', () => {
  it('reads a quoted Windows executable and its script', () => {
    const line =
      '"C:\\Programs\\t3code\\T3 Code (Nightly).exe" C:\\Programs\\t3code\\resources\\server.asar\\apps\\server\\dist\\bin.mjs --bootstrap-fd 3';
    expect(parseServerCommand(line)).toEqual({
      exe: 'C:\\Programs\\t3code\\T3 Code (Nightly).exe',
      script: 'C:\\Programs\\t3code\\resources\\server.asar\\apps\\server\\dist\\bin.mjs',
    });
  });

  it('uses the known executable to split an unquoted path with spaces', () => {
    const exe = '/Applications/T3 Code.app/Contents/MacOS/T3 Code';
    const line = `${exe} /Applications/T3 Code.app/Contents/Resources/server.asar/apps/server/dist/bin.mjs --bootstrap-fd 3`;
    expect(parseServerCommand(line, exe)).toEqual({
      exe,
      script: '/Applications/T3 Code.app/Contents/Resources/server.asar/apps/server/dist/bin.mjs',
    });
  });

  it('handles a plain node server', () => {
    expect(parseServerCommand('node /usr/lib/node_modules/t3/dist/bin.mjs serve')).toEqual({
      exe: 'node',
      script: '/usr/lib/node_modules/t3/dist/bin.mjs',
    });
  });

  it('gives up when there is no script', () => {
    expect(parseServerCommand('/usr/bin/t3code --flag')).toBeNull();
  });
});

describe('samePath', () => {
  it('ignores case and separators on Windows', () => {
    expect(samePath('C:/Users/A/repo/', 'c:\\users\\a\\repo', 'win32')).toBe(true);
  });

  it('respects case on Linux', () => {
    expect(samePath('/home/a/Repo', '/home/a/repo', 'linux')).toBe(false);
  });
});

const thread = (overrides: Partial<T3Thread>): T3Thread => ({
  projectId: 'p1',
  modelSelection: { instanceId: 'codex', model: 'm-old' },
  runtimeMode: 'full-access',
  interactionMode: 'default',
  createdAt: '2026-09-01T00:00:00.000Z',
  deletedAt: null,
  ...overrides,
});

describe('threadDefaults', () => {
  it("prefers the project's default model", () => {
    const snapshot: T3Snapshot = {
      projects: [{ id: 'p1', workspaceRoot: '/r', defaultModelSelection: { model: 'fixed' }, deletedAt: null }],
      threads: [thread({})],
    };
    expect(threadDefaults(snapshot, 'p1')?.modelSelection).toEqual({ model: 'fixed' });
  });

  it("takes the newest thread's model in the project, then anywhere", () => {
    const snapshot: T3Snapshot = {
      projects: [{ id: 'p1', workspaceRoot: '/r', defaultModelSelection: null, deletedAt: null }],
      threads: [
        thread({ modelSelection: { model: 'p1-new' }, createdAt: '2026-09-02T00:00:00.000Z', runtimeMode: 'approval-required' }),
        thread({ projectId: 'p2', modelSelection: { model: 'p2-newest' }, createdAt: '2026-09-03T00:00:00.000Z' }),
        thread({ modelSelection: { model: 'p1-deleted' }, createdAt: '2026-09-04T00:00:00.000Z', deletedAt: '2026-09-05T00:00:00.000Z' }),
      ],
    };
    expect(threadDefaults(snapshot, 'p1')).toEqual({
      modelSelection: { model: 'p1-new' },
      runtimeMode: 'approval-required',
      interactionMode: 'default',
    });
    expect(threadDefaults(snapshot, null)?.modelSelection).toEqual({ model: 'p2-newest' });
  });

  it('puts a picked model first, and T3 Code’s own default after the project’s', () => {
    const snapshot: T3Snapshot = {
      projects: [{ id: 'p1', workspaceRoot: '/r', defaultModelSelection: null, deletedAt: null }],
      threads: [thread({})],
    };
    expect(threadDefaults(snapshot, 'p1', { chosen: { model: 'picked' }, globalDefault: { model: 'global' } })?.modelSelection).toEqual({
      model: 'picked',
    });
    expect(threadDefaults(snapshot, 'p1', { globalDefault: { model: 'global' } })?.modelSelection).toEqual({ model: 'global' });
  });

  it('has nothing to offer on a fresh install', () => {
    expect(threadDefaults({ projects: [], threads: [] }, null)).toBeNull();
  });
});

describe('threadCommands', () => {
  const defaults = { modelSelection: { model: 'm' }, runtimeMode: 'full-access', interactionMode: 'default' };

  it('creates the thread on its worktree, then starts the first turn', () => {
    const { threadId, create, start } = threadCommands({
      projectId: 'p1',
      title: '#12 Do it',
      prompt: 'hello',
      defaults,
      worktree: { branch: 'wayfinder/12-do-it', path: '/t3/worktrees/repo/wayfinder-12-do-it' },
      now: '2026-09-18T00:00:00.000Z',
    });

    expect(create).toMatchObject({
      type: 'thread.create',
      threadId,
      projectId: 'p1',
      title: '#12 Do it',
      modelSelection: { model: 'm' },
      runtimeMode: 'full-access',
      interactionMode: 'default',
      branch: 'wayfinder/12-do-it',
      worktreePath: '/t3/worktrees/repo/wayfinder-12-do-it',
      createdAt: '2026-09-18T00:00:00.000Z',
    });
    expect(start).toMatchObject({
      type: 'thread.turn.start',
      threadId,
      message: { role: 'user', text: 'hello', attachments: [] },
      runtimeMode: 'full-access',
      interactionMode: 'default',
    });
    expect(start['bootstrap']).toBeUndefined();
  });

  it('runs in the project checkout when there is no worktree', () => {
    const { create } = threadCommands({ projectId: 'p1', title: 't', prompt: 'p', defaults, worktree: null });
    expect(create).toMatchObject({ branch: null, worktreePath: null });
  });
});

describe('T3 shell stream', () => {
  it('resumes after a sequence, forwards chunks, and reports a dropped connection', async () => {
    const sockets: Array<{
      url: URL;
      sent: string[];
      onopen: ((event: Event) => void) | null;
      onmessage: ((event: MessageEvent) => void) | null;
      onerror: (() => void) | null;
      onclose: (() => void) | null;
      send(data: string): void;
      close(): void;
    }> = [];
    class TestSocket {
      readonly sent: string[] = [];
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;

      constructor(readonly url: URL) {
        sockets.push(this);
      }

      send(data: string): void {
        this.sent.push(data);
      }

      close(): void {
        this.onclose?.();
      }
    }
    vi.stubGlobal('WebSocket', TestSocket as unknown as typeof WebSocket);
    const api = new T3Api('http://127.0.0.1:3773', { exe: 't3', script: 'server.mjs' });
    vi.spyOn(api as unknown as { request: (path: string, body?: unknown) => Promise<unknown> }, 'request').mockResolvedValue({
      ticket: 'short-lived-ticket',
    });
    const values: unknown[] = [];
    const onClose = vi.fn();

    try {
      const subscribing = api.subscribeShell(23, (value) => values.push(value), onClose);
      await vi.waitFor(() => expect(sockets).toHaveLength(1));
      const socket = sockets[0];
      expect(socket).toBeDefined();
      socket?.onopen?.(new Event('open'));
      const stop = await subscribing;
      expect(socket?.url.searchParams.get('wsTicket')).toBe('short-lived-ticket');
      expect(JSON.parse(socket?.sent[0] ?? '{}')).toMatchObject({
        tag: 'orchestration.subscribeShell',
        payload: { afterSequence: 23, requestCompletionMarker: true },
      });

      socket?.onmessage?.({
        data: JSON.stringify({ _tag: 'Chunk', requestId: 'shell', chunk: { value: { type: 'thread-upserted', sequence: 24 } } }),
      } as MessageEvent);
      expect(values).toEqual([{ type: 'thread-upserted', sequence: 24 }]);
      socket?.onclose?.();
      expect(onClose).toHaveBeenCalledOnce();
      stop();
    } finally {
      api.revoke();
      vi.unstubAllGlobals();
    }
  });
});
