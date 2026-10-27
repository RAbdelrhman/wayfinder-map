import { describe, expect, it } from 'vitest';
import { cacheKey, parseFollows, readCache, writeCache } from './cache';
import { isMapList } from './validate';

describe('account-scoped map storage', () => {
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
