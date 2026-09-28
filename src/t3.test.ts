import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { T3HandOff, handOff, worktreePathFor } from './t3.js';
import type { HandOffInput, HandOffSteps, T3Runtime } from './t3.js';

const t3Mocks = vi.hoisted(() => ({
  serverCommand: vi.fn<(pid: number) => Promise<{ exe: string; script: string } | null>>(),
  apiCreated: vi.fn<() => void>(),
  issueSession: vi.fn<() => void>(),
}));

vi.mock('./t3Api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./t3Api.js')>();

  class MockT3Api {
    private session: Promise<void> | null = null;

    constructor(_origin: string, _command: { exe: string; script: string }) {
      t3Mocks.apiCreated();
    }

    revoke(): void {}

    snapshot(): Promise<{ projects: never[] }> {
      this.session ??= Promise.resolve().then(t3Mocks.issueSession);
      return this.session.then(() => ({ projects: [] }));
    }
  }

  return { ...actual, serverCommand: t3Mocks.serverCommand, T3Api: MockT3Api };
});

const runtime: T3Runtime = { origin: 'http://127.0.0.1:3773', pid: 42, stateDir: '/t3/userdata' };

beforeEach(() => {
  t3Mocks.serverCommand.mockReset();
  t3Mocks.apiCreated.mockReset();
  t3Mocks.issueSession.mockReset();
});

const input = (workspaceRoot: string | null): HandOffInput => ({
  title: '#1 Thing',
  workspaceRoot,
  branch: 'wayfinder/1-thing',
  model: null,
  prompt: (worktree) => (worktree === null ? 'plain' : `ready on ${worktree.branch}`),
});

function steps(overrides: Partial<HandOffSteps> = {}): HandOffSteps {
  return {
    startThread: vi.fn(async () => ({ threadId: 't1', prompt: 'ready on wayfinder/1-thing' })),
    openApp: vi.fn(async () => undefined),
    copy: vi.fn(async () => undefined),
    ...overrides,
  };
}

const boom = (message: string) => async (): Promise<never> => {
  throw new Error(message);
};

describe('handOff', () => {
  it('starts a running thread and leaves the clipboard alone', async () => {
    const s = steps();
    const result = await handOff(input('/repo'), s);

    expect(result).toMatchObject({ rung: 'thread', threadId: 't1', prompt: 'ready on wayfinder/1-thing', notice: null });
    expect(s.copy).not.toHaveBeenCalled();
    expect(s.openApp).not.toHaveBeenCalled();
  });

  it('falls back to a new thread plus the clipboard, and says why', async () => {
    const s = steps({ startThread: boom('401') });
    const result = await handOff(input('/repo'), s);

    expect(result.rung).toBe('app');
    expect(result.copied).toBe(true);
    expect(result.notice).toContain('401');
    expect(s.copy).toHaveBeenCalledWith('plain');
    expect(s.openApp).toHaveBeenCalledWith('/repo');
  });

  it('ends on the clipboard when the app is unreachable too', async () => {
    const result = await handOff(input('/repo'), steps({ startThread: boom('down'), openApp: boom('no pipe') }));

    expect(result).toMatchObject({ rung: 'clipboard', copied: true, prompt: 'plain' });
    expect(result.notice).toContain('down');
  });

  it('skips straight to the clipboard outside a checkout of the repo', async () => {
    const s = steps();
    const result = await handOff(input(null), s);

    expect(result.rung).toBe('clipboard');
    expect(result.notice).toContain('clone of this repo');
    expect(s.startThread).not.toHaveBeenCalled();
    expect(s.openApp).not.toHaveBeenCalled();
  });

  it('reports a clipboard failure when nothing else worked', async () => {
    const result = await handOff(input(null), steps({ copy: boom('no xclip') }));

    expect(result).toMatchObject({ rung: null, copied: false });
    expect(result.error).toContain('no xclip');
  });
});

describe('worktreePathFor', () => {
  it("follows T3 Code's own layout", () => {
    expect(worktreePathFor(join('home', '.t3'), join('src', 'wayfinder-map'), 'wayfinder/12-do-it')).toBe(
      join('home', '.t3', 'worktrees', 'wayfinder-map', 'wayfinder-12-do-it'),
    );
  });
});

describe('T3HandOff connection', () => {
  it('shares one cold connection and session across concurrent callers', async () => {
    let resolveCommand!: (command: { exe: string; script: string } | null) => void;
    const command = new Promise<{ exe: string; script: string } | null>((resolve) => {
      resolveCommand = resolve;
    });
    t3Mocks.serverCommand.mockReturnValue(command);

    const handOff = new T3HandOff();
    const starts = Array.from({ length: 8 }, () => handOff.projects(runtime));

    expect(t3Mocks.serverCommand).toHaveBeenCalledTimes(1);
    resolveCommand({ exe: 't3', script: 'server.mjs' });
    await expect(Promise.all(starts)).resolves.toEqual(Array.from({ length: 8 }, () => []));
    expect(t3Mocks.apiCreated).toHaveBeenCalledTimes(1);
    expect(t3Mocks.issueSession).toHaveBeenCalledTimes(1);
  });

  it('clears a rejected connection so a later call can retry', async () => {
    t3Mocks.serverCommand.mockResolvedValueOnce(null).mockResolvedValue({ exe: 't3', script: 'server.mjs' });
    const handOff = new T3HandOff();

    await expect(handOff.projects(runtime)).rejects.toThrow('could not find the T3 Code binary');
    await expect(handOff.projects(runtime)).resolves.toEqual([]);

    expect(t3Mocks.serverCommand).toHaveBeenCalledTimes(2);
    expect(t3Mocks.apiCreated).toHaveBeenCalledTimes(1);
    expect(t3Mocks.issueSession).toHaveBeenCalledTimes(1);
  });
});
