import { describe, expect, it } from 'vitest';
import {
  cacheKey,
  parseFollows,
  readCache,
  writeCache,
  readFollows,
  updateFollow,
  removeFollowSnapshots,
  removeMapContents,
} from './cache';
import { isMapList } from './validate';

describe('account-scoped map storage', () => {
  it('evicts a map and its queued ticket writes without touching other maps or accounts', async () => {
    let unblock: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const values = new Map<string, string>();
    const storage = {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        if (key.includes('ticket-map:a/b#1:2')) await gate;
        values.set(key, value);
      },
      removeItem: async (key: string) => {
        values.delete(key);
      },
      getAllKeys: async () => [...values.keys()],
    };
    await writeCache(storage, 'me', 'map:a/b#1', { value: 1 });
    await writeCache(storage, 'me', 'map:a/b#3', { value: 3 });
    await writeCache(storage, 'other', 'map:a/b#1', { value: 4 });
    const pending = writeCache(storage, 'me', 'ticket-map:a/b#1:2', {
      value: 2,
    });
    const removal = removeMapContents(storage, 'me', {
      repo: 'a/b',
      number: 1,
    });
    unblock();
    await Promise.all([pending, removal]);
    expect(values.has(cacheKey('me', 'map:a/b#1'))).toBe(false);
    expect(values.has(cacheKey('me', 'ticket-map:a/b#1:2'))).toBe(false);
    expect(values.has(cacheKey('me', 'map:a/b#3'))).toBe(true);
    expect(values.has(cacheKey('other', 'map:a/b#1'))).toBe(true);
  });
  it('evicts only the confirmed unavailable followed maps for the active account', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: async (key: string) => {
        values.delete(key);
      },
      getAllKeys: async () => [...values.keys()],
    };
    for (const [login, resource] of [
      ['me', 'followed:a/repo#1'],
      ['me', 'followed:b/repo#2'],
      ['other', 'followed:a/repo#1'],
    ])
      await writeCache(storage, login!, resource!, { title: 'saved' });
    await removeFollowSnapshots(storage, 'me', [{ repo: 'A/Repo', number: 1 }]);
    expect(values.has(cacheKey('me', 'followed:a/repo#1'))).toBe(false);
    expect(values.has(cacheKey('me', 'followed:b/repo#2'))).toBe(true);
    expect(values.has(cacheKey('other', 'followed:a/repo#1'))).toBe(true);
  });
  it('scrubs denied maps from every aggregate and detail cache while retaining unrelated maps and accounts', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => { values.set(key, value); },
      removeItem: async (key: string) => { values.delete(key); },
      getAllKeys: async () => [...values.keys()],
    };
    const denied = { repo: 'other/repo', number: 9, title: 'Denied title', body: 'Denied body' };
    const kept = { repo: 'kept/repo', number: 2, title: 'Keep title', body: 'Keep body' };
    for (const resource of ['followed:other/repo#9', 'map:other/repo#9', 'ticket-map:other/repo#9:12']) await writeCache(storage, 'me', resource, denied);
    await writeCache(storage, 'me', 'maps', { maps: [denied, kept], hidden: [denied] });
    await writeCache(storage, 'me', 'public-maps:other/repo', { groups: [{ repo: 'other/repo', maps: [denied] }, { repo: 'kept/repo', maps: [kept] }], hidden: [denied], follows: [denied] });
    await writeCache(storage, 'other-account', 'map:other/repo#9', denied);
    await removeFollowSnapshots(storage, 'me', [denied]);
    expect(values.has(cacheKey('me', 'map:other/repo#9'))).toBe(false);
    expect(values.has(cacheKey('me', 'ticket-map:other/repo#9:12'))).toBe(false);
    const maps = JSON.parse(values.get(cacheKey('me', 'maps'))!).data;
    expect(maps).toEqual({ maps: [kept], hidden: [] });
    const discovery = JSON.parse(values.get(cacheKey('me', 'public-maps:other/repo'))!).data;
    expect(discovery.groups[0].maps).toEqual([]);
    expect(discovery.groups[1].maps).toEqual([kept]);
    expect(values.has(cacheKey('other-account', 'map:other/repo#9'))).toBe(true);
  });
  it('preserves accounts and serializes concurrent follow changes, including seeded unfollows', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const seed = JSON.stringify({ Ramon: { 'one/repo': [1] } });
    await Promise.all([
      updateFollow(
        storage,
        'Ramon',
        { repo: 'one/repo', number: 1 },
        false,
        seed,
      ),
      updateFollow(
        storage,
        'Other',
        { repo: 'two/repo', number: 2 },
        true,
        seed,
      ),
      updateFollow(
        storage,
        'ramon',
        { repo: 'three/repo', number: 3 },
        true,
        seed,
      ),
    ]);
    expect(await readFollows(storage, 'RAMON', seed)).toEqual([
      { repo: 'three/repo', number: 3 },
    ]);
    expect(await readFollows(storage, 'other', seed)).toEqual([
      { repo: 'two/repo', number: 2 },
    ]);
  });
  it('does not overwrite corrupt saved follows', async () => {
    const storage = {
      getItem: async () => '{',
      setItem: async () => {
        throw new Error('unexpected write');
      },
    };
    await expect(
      updateFollow(storage, 'me', { repo: 'one/repo', number: 1 }, true),
    ).rejects.toThrow();
  });
  it('does not overwrite an unreadable account entry', async () => {
    const storage = {
      getItem: async () => '{"me":"broken"}',
      setItem: async () => {
        throw new Error('unexpected write');
      },
    };
    await expect(readFollows(storage, 'me')).rejects.toThrow('unreadable');
    await expect(
      updateFollow(storage, 'me', { repo: 'one/repo', number: 1 }, true),
    ).rejects.toThrow('unreadable');
  });
  it('serializes overlapping writes so a slower old write cannot replace newer data', async () => {
    let unblock: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    let calls = 0;
    let stored = '';
    const storage = {
      getItem: async () => stored,
      setItem: async (_key: string, value: string) => {
        if (++calls === 1) await gate;
        stored = value;
      },
    };
    const first = writeCache(storage, 'me', 'maps', {
      maps: [],
      warnings: ['old'],
    });
    const last = writeCache(storage, 'me', 'maps', {
      maps: [],
      warnings: ['new'],
    });
    unblock();
    await Promise.all([first, last]);
    expect(
      (await readCache(storage, 'me', 'maps', isMapList))?.data.warnings,
    ).toEqual(['new']);
  });
  it('never reuses one account’s cached private maps for another', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const snapshot = { maps: [], warnings: ['Owned by Ramon'] };
    await writeCache(storage, 'Ramon', 'maps', snapshot);
    expect(
      (await readCache(storage, 'RAMON', 'maps', isMapList))?.data,
    ).toEqual(snapshot);
    expect(
      await readCache(storage, 'SomeoneElse', 'maps', isMapList),
    ).toBeNull();
  });
  it('ignores corrupt and incompatible snapshots', async () => {
    for (const value of [
      '{',
      'null',
      '{"savedAt":123,"data":{"maps":[{}],"warnings":[]}}',
    ]) {
      expect(
        await readCache(
          { getItem: async () => value, setItem: async () => undefined },
          'me',
          'maps',
          isMapList,
        ),
      ).toBeNull();
    }
  });
  it('reads the desktop follow format only for the signed-in account and rejects invalid references', () => {
    expect(
      parseFollows(
        JSON.stringify({
          Ramon: { 'owner/repo': [12, '13', -1], 'bad/repo/path': [1] },
          other: { 'private/repo': [99] },
        }),
        'RAMON',
      ),
    ).toEqual([{ repo: 'owner/repo', number: 12 }]);
    expect(parseFollows('broken', 'Ramon')).toEqual([]);
    expect(cacheKey('RAMON', 'maps')).toBe(cacheKey('ramon', 'maps'));
  });
});
