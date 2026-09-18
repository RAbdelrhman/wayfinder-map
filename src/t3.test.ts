import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { handOff, worktreePathFor } from './t3.js';
import type { HandOffInput, HandOffSteps } from './t3.js';

const input = (workspaceRoot: string | null): HandOffInput => ({
  title: '#1 Thing',
  workspaceRoot,
  branch: 'wayfinder/1-thing',
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
