import { describe, expect, it } from 'vitest';

import { composerState, initialRepository, newMapPath } from './newMap.js';
import type { ComposerInput } from './newMap.js';

describe('newMapPath', () => {
  it('opens on the repository it is given', () => {
    expect(newMapPath('octo/one')).toBe('/new-map?repo=octo%2Fone');
  });

  it('opens without one from Home or for a bad name', () => {
    expect(newMapPath(null)).toBe('/new-map');
    expect(newMapPath('not a repo')).toBe('/new-map');
  });
});

describe('initialRepository', () => {
  it('preselects the repository the composer was opened from', () => {
    expect(initialRepository('octo/two', ['octo/one'], ['octo/three'])).toBe('octo/two');
  });

  it('falls back to the most recent repository, then the first known one', () => {
    expect(initialRepository(null, ['octo/one'], ['octo/three'])).toBe('octo/one');
    expect(initialRepository('not a repo', [], ['octo/three'])).toBe('octo/three');
    expect(initialRepository(null, [], [])).toBe('');
  });
});

describe('composerState', () => {
  const ready: ComposerInput = {
    repo: 'octo/one',
    goal: 'Build offline mode',
    workspace: { status: 'ready', path: '/clone', canChoose: true },
    t3Unavailable: null,
  };

  it('starts when there is a goal, a verified clone, and T3 Code', () => {
    expect(composerState(ready)).toEqual({ canStart: true, canCopy: true, reason: null });
  });

  it('requires the goal for both actions', () => {
    expect(composerState({ ...ready, goal: '  \n ' })).toEqual({ canStart: false, canCopy: false, reason: null });
  });

  it('requires a repository', () => {
    expect(composerState({ ...ready, repo: null })).toMatchObject({ canStart: false, canCopy: false });
  });

  it('keeps Copy prompt and says why when no clone is verified', () => {
    expect(composerState({ ...ready, workspace: { status: 'choose', candidates: [], canChoose: false } })).toEqual({
      canStart: false,
      canCopy: true,
      reason: 'T3 Code needs a verified local clone of octo/one to start a thread. Choose one, or copy the prompt.',
    });
  });

  it('waits for the clone lookup, and falls back to copying when it fails', () => {
    expect(composerState({ ...ready, workspace: 'loading' })).toMatchObject({ canStart: false, canCopy: true });
    expect(composerState({ ...ready, workspace: null })).toMatchObject({ canStart: false, canCopy: true });
  });

  it('keeps Copy prompt and says why when T3 Code is not reachable', () => {
    expect(composerState({ ...ready, t3Unavailable: 'T3 Code is not running' })).toEqual({
      canStart: false,
      canCopy: true,
      reason: 'T3 Code is not reachable (T3 Code is not running). Copy the prompt and paste it into a new thread.',
    });
  });

  it('shows the reason before a goal is typed', () => {
    expect(composerState({ ...ready, goal: '', t3Unavailable: 'down' })).toMatchObject({ canStart: false, canCopy: false, reason: expect.stringContaining('down') as unknown });
  });
});
