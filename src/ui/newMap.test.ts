import { describe, expect, it } from 'vitest';

import { composerState, consumeNewMapRetryGoal, DEFAULT_NEW_MAP_TIER, draftToMapPath, initialRepository, isNewMapHandOff, newMapPath, rememberNewMapRetry, repositoryOptions } from './newMap.js';
import type { ComposerInput } from './newMap.js';

function fakeStorage(): Pick<Storage, 'getItem' | 'removeItem' | 'setItem'> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe('newMapPath', () => {
  it('opens on the repository it is given', () => {
    expect(newMapPath('octo/one')).toBe('/new-map?repo=octo%2Fone');
  });

  it('opens without one from Home or for a bad name', () => {
    expect(newMapPath(null)).toBe('/new-map');
    expect(newMapPath('not a repo')).toBe('/new-map');
  });
});

describe('draft map routing', () => {
  const handOff = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    repo: 'octo/one',
    mapNumber: null,
    mapTitle: 'Build offline mode',
    ticketNumber: null,
    title: 'Build offline mode',
    branch: null,
    pullRequests: [],
    threadId: 'thread-7',
    rung: 'thread' as const,
    status: 'running' as const,
    acknowledged: false,
    createdAt: '2026-09-22T12:00:00.000Z',
    updatedAt: '2026-09-22T12:00:00.000Z',
    lastSeenAt: null,
    sequence: null,
    pendingApproval: false,
    pendingUserInput: false,
    stale: false,
  };

  it('recognizes a persisted new-map hand-off while its map issue is missing', () => {
    expect(isNewMapHandOff(handOff)).toBe(true);
    expect(draftToMapPath('octo/one', handOff, [])).toBeNull();
  });

  it('moves to the matching real map route when its issue appears', () => {
    expect(draftToMapPath('octo/one', handOff, [{ number: 51, title: 'Build offline mode' }, { number: 62, title: 'Build offline mode' }])).toBe(
      '/repos/octo/one/maps/62?planning=123e4567-e89b-12d3-a456-426614174000',
    );
    expect(draftToMapPath('OCTO/ONE', handOff, [{ number: 62, title: 'Build   offline\nmode' }])).toBe(
      '/repos/OCTO/ONE/maps/62?planning=123e4567-e89b-12d3-a456-426614174000',
    );
    expect(draftToMapPath('octo/two', handOff, [{ number: 62, title: 'Build offline mode' }])).toBeNull();
  });
});

describe('initialRepository', () => {
  it('preselects only the repository the composer was opened from', () => {
    expect(initialRepository('octo/two')).toBe('octo/two');
    expect(initialRepository(null)).toBe('');
    expect(initialRepository('not a repo')).toBe('');
  });

  it('defaults the model chip to the existing Mid tier', () => {
    expect(DEFAULT_NEW_MAP_TIER).toBe('mid');
  });
});

describe('new map retry', () => {
  it('restores a retry goal once for the matching repository', () => {
    const storage = fakeStorage();
    rememberNewMapRetry('octo/one', 'Build offline mode', storage);
    expect(consumeNewMapRetryGoal('OCTO/ONE', storage)).toBe('Build offline mode');
    expect(consumeNewMapRetryGoal('octo/one', storage)).toBeNull();
  });

  it('does not restore a goal for another repository and clears the one-shot value', () => {
    const storage = fakeStorage();
    rememberNewMapRetry('octo/one', 'Build offline mode', storage);
    expect(consumeNewMapRetryGoal('octo/two', storage)).toBeNull();
    expect(consumeNewMapRetryGoal('octo/one', storage)).toBeNull();
  });

  it('rejects invalid repositories', () => {
    expect(() => rememberNewMapRetry('invalid', 'Build offline mode', fakeStorage())).toThrow('Enter a valid repository');
  });
});

describe('repositoryOptions', () => {
  it('searches recent and known repositories with recents first and case-insensitive deduplication', () => {
    expect(repositoryOptions('OCTO', ['octo/one', 'other/repo'], ['OCTO/ONE', 'octo/two'])).toEqual(['octo/one', 'octo/two']);
    expect(repositoryOptions('', ['octo/one'], ['octo/two'])).toEqual(['octo/one', 'octo/two']);
    expect(repositoryOptions('missing', ['octo/one'], ['octo/two'])).toEqual([]);
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
    expect(composerState({ ...ready, repo: null })).toEqual({
      canStart: false,
      canCopy: false,
      reason: 'Pick a repository to start.',
    });
  });

  it('keeps Copy prompt and asks for a clone when there is none', () => {
    expect(composerState({ ...ready, workspace: { status: 'choose', candidates: [], canChoose: false } })).toEqual({
      canStart: false,
      canCopy: true,
      reason: 'Run Wayfinder inside a clone of this repository to start in T3 Code.',
    });
    expect(composerState({ ...ready, workspace: { status: 'choose', candidates: [], canChoose: true } }).reason).toBe(
      'Choose a local clone or clone this repository for me.',
    );
  });

  it('asks the user to choose when there are several clones', () => {
    expect(composerState({ ...ready, workspace: { status: 'choose', candidates: ['/one', '/two'], canChoose: true } })).toMatchObject({
      canStart: false,
      canCopy: true,
      reason: 'Choose a local clone below before starting.',
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

  it('leaves the helper empty when the goal is the only missing input', () => {
    expect(composerState({ ...ready, goal: '' })).toEqual({ canStart: false, canCopy: false, reason: null });
  });
});
