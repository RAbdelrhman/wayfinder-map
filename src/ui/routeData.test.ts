import { describe, expect, it, vi } from 'vitest';
import { RouteDataCache, ROUTE_SCOPE_KEY } from './routeData.js';

function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
function response(value: unknown, scope = 'account-a') {
  return new Response(JSON.stringify(value), { headers: { 'x-wayfinder-cache-scope': scope } });
}
const endpoint = '/api/repos/owner/repo/snapshot';

describe('route data across navigation', () => {
  it('calls native fetch with its browser receiver', async () => {
    vi.stubGlobal('fetch', vi.fn(function (this: unknown) {
      expect(this).toBe(globalThis);
      return Promise.resolve(response({ maps: [] }));
    }));
    try { await new RouteDataCache('account-a', storage(), storage()).read(endpoint); }
    finally { vi.unstubAllGlobals(); }
  });
  it('shares one snapshot between Home, repository, map and ticket views across module reloads', async () => {
    const tab = storage(); const shared = storage();
    const request = vi.fn<typeof fetch>().mockResolvedValue(response({ maps: [{ number: 5 }] }));
    await new RouteDataCache('account-a', tab, shared, request).read(endpoint);
    const nextPage = new RouteDataCache('account-a', tab, shared, request);
    expect(nextPage.peek(`${endpoint}?map=5`)).toEqual({ maps: [{ number: 5 }] });
    await nextPage.read(`${endpoint}?map=5`);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('keeps repositories and prototype maps separate', () => {
    const cache = new RouteDataCache('account-a', storage(), storage());
    cache.remember(endpoint, { repo: 'owner/repo' });
    cache.remember('/api/repos/owner/repo/prototypes?map=1', ['one']);
    expect(cache.peek('/api/repos/other/repo/snapshot')).toBeNull();
    expect(cache.peek('/api/repos/owner/repo/prototypes?map=2')).toBeNull();
  });

  it('paints older successful data while a new read is pending and retains it on failure', async () => {
    let now = 0;
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error('GitHub unavailable'));
    const cache = new RouteDataCache('account-a', storage(), storage(), request, () => now);
    cache.remember(endpoint, { maps: ['last known'] });
    now = 20_000;
    expect(cache.peek(endpoint)).toEqual({ maps: ['last known'] });
    await expect(cache.read(endpoint)).rejects.toThrow('GitHub unavailable');
    expect(cache.peek(endpoint)).toEqual({ maps: ['last known'] });
    now = 300_000;
    expect(cache.peek(endpoint)).toBeNull();
  });

  it('deduplicates repeated reads but manual Sync bypasses the fresh cache', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => response({ maps: [] }));
    const cache = new RouteDataCache('account-a', storage(), storage(), request);
    await Promise.all([cache.read(endpoint), cache.read(endpoint)]);
    await cache.read(`${endpoint}?refresh=1`, true);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenLastCalledWith(`${endpoint}?refresh=1`);
  });

  it('does not allow a slow background read to overwrite a newer Sync', async () => {
    let finish: (value: Response) => void = () => undefined;
    const request = vi.fn<typeof fetch>().mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValueOnce(response({ maps: ['new'] }));
    const cache = new RouteDataCache('account-a', storage(), storage(), request);
    const old = cache.read(`${endpoint}?check=1`, true);
    const rejected = expect(old).rejects.toThrow('newer change');
    await cache.read(`${endpoint}?refresh=1`, true);
    finish(response({ maps: ['old'] }));
    await rejected;
    expect(cache.peek(endpoint)).toEqual({ maps: ['new'] });
  });

  it('invalidates pending reads after a mutation and retains the mutation response', async () => {
    let finish: (value: Response) => void = () => undefined;
    const cache = new RouteDataCache('account-a', storage(), storage(), vi.fn<typeof fetch>().mockImplementation(() => new Promise((resolve) => { finish = resolve; })));
    const old = cache.read(endpoint);
    const rejected = expect(old).rejects.toThrow('newer change');
    cache.remember(endpoint, { maps: ['settled'] });
    finish(response({ maps: ['active'] }));
    await rejected;
    expect(cache.peek(endpoint)).toEqual({ maps: ['settled'] });
  });

  it('drops access to old account data in another tab and rejects late responses', async () => {
    const shared = storage(); const tab = storage();
    let finish: (value: Response) => void = () => undefined;
    const cache = new RouteDataCache('account-a', tab, shared, vi.fn<typeof fetch>().mockImplementation(() => new Promise((resolve) => { finish = resolve; })));
    cache.remember(endpoint, { private: 'a' });
    const old = cache.read(endpoint, true);
    const rejected = expect(old).rejects.toThrow('account changed');
    shared.setItem(ROUTE_SCOPE_KEY, 'account-b');
    expect(cache.peek(endpoint)).toBeNull();
    finish(response({ private: 'a' }));
    await rejected;
    expect(new RouteDataCache('account-b', tab, shared).peek(endpoint)).toBeNull();
  });

  it('never caches authentication, workspace checks or action responses', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => response({ state: 'ready' }));
    const tab = storage();
    const cache = new RouteDataCache('account-a', tab, storage(), request);
    for (const url of ['/api/auth/status', '/api/auth/flow', '/api/repos/owner/repo/workspace', '/api/repos/owner/repo/hand-off']) {
      await cache.read(url);
      expect(cache.peek(url)).toBeNull();
      expect(tab.values.size).toBe(0);
    }
  });

  it('publishes a changed response scope and prevents old account cache reuse', async () => {
    const shared = storage();
    const tab = storage();
    const cache = new RouteDataCache('account-a', tab, shared, vi.fn<typeof fetch>().mockImplementation(async () => response({ maps: ['b'] }, 'account-b')));
    cache.remember(endpoint, { maps: ['a'] });
    await expect(cache.read(endpoint, true)).rejects.toThrow('account changed');
    expect(shared.getItem(ROUTE_SCOPE_KEY)).toBe('account-b');
    expect(cache.peek(endpoint)).toBeNull();
    await expect(cache.read(endpoint)).resolves.toEqual({ maps: ['b'] });
  });

  it('still loads normally when storage is unavailable', async () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
    const cache = new RouteDataCache('account-a', broken, broken, vi.fn<typeof fetch>().mockResolvedValue(response({ maps: [] })));
    await expect(cache.read(endpoint)).resolves.toEqual({ maps: [] });
  });
});
