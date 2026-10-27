import { describe, expect, it, vi } from 'vitest';
import { cacheKey, writeCache } from './cache';
import { GithubError } from './github';
import { resourceFailure } from './resourceFailure';

describe('resource refresh failures', () => {
  it.each([401, 404])(
    'discards inaccessible content and its account-scoped cache on %s',
    async (status) => {
      const removeItem = vi.fn(async () => undefined);
      const previous = { data: { private: 'content' }, savedAt: 123 };
      const next = {
        ...previous,
        ...(await resourceFailure(
          { removeItem },
          'Ramon',
          'ticket:1',
          new GithubError(status, 'Access denied'),
        )),
      };
      expect(next.data).toBeNull();
      expect(next.savedAt).toBeNull();
      expect(next.error).toBe('Access denied');
      expect(removeItem).toHaveBeenCalledWith(cacheKey('Ramon', 'ticket:1'));
    },
  );
  it.each([403, 429, 500, 503])(
    'keeps saved data on transient or rate-limited %s',
    async (status) => {
      const removeItem = vi.fn(async () => undefined);
      const previous = { data: { private: 'content' }, savedAt: 123 };
      const next = {
        ...previous,
        ...(await resourceFailure(
          { removeItem },
          'Ramon',
          'maps',
          new GithubError(status, 'Try later'),
        )),
      };
      expect(next.data).toEqual(previous.data);
      expect(next.savedAt).toBe(123);
      expect(removeItem).not.toHaveBeenCalled();
    },
  );
  it('keeps saved data while offline', async () => {
    const removeItem = vi.fn(async () => undefined);
    expect(
      await resourceFailure({ removeItem }, 'me', 'maps', new Error('Offline')),
    ).not.toHaveProperty('data');
    expect(removeItem).not.toHaveBeenCalled();
  });
  it('clears memory even when device cache removal fails', async () => {
    const result = await resourceFailure(
      {
        removeItem: async () => {
          throw new Error('Storage unavailable');
        },
      },
      'me',
      'maps',
      new GithubError(404, 'Missing'),
    );
    expect(result).toMatchObject({
      data: null,
      savedAt: null,
      loading: false,
      refreshing: false,
    });
  });
  it('evicts after an older queued write completes', async () => {
    let unblock: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const values = new Map<string, string>();
    const storage = {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        await gate;
        values.set(key, value);
      },
      removeItem: async (key: string) => {
        values.delete(key);
      },
    };
    const oldWrite = writeCache(storage, 'me', 'maps', { secret: 'old' });
    const denied = resourceFailure(
      storage,
      'me',
      'maps',
      new GithubError(401, 'Expired'),
    );
    unblock();
    await Promise.all([oldWrite, denied]);
    expect(values.has(cacheKey('me', 'maps'))).toBe(false);
  });
});
