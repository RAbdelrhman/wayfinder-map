import { describe, expect, it, vi } from 'vitest';

import { RepositoryStore } from './repositoryStore.js';
import type { MapDetailFetcher, RepositoryFetcher } from './repositoryStore.js';
import type { SettleChoices } from './settling.js';
import type { FetchResult } from './github.js';
import type { MapSettlement, WayfinderMap } from './types.js';

function store(fetcher: RepositoryFetcher, limit = 10, changeChecker?: (repo: string, mapNumbers: readonly number[]) => Promise<boolean>): RepositoryStore {
  return new RepositoryStore({
    mapLabel: 'wayfinder:map',
    typePrefix: 'wayfinder:',
    fetcher,
    limit,
    ...(changeChecker === undefined ? {} : { changeChecker }),
    now: () => new Date('2026-09-19T12:00:00.000Z'),
  });
}

describe('RepositoryStore', () => {
  it('keeps the last successful snapshot when a dependency refresh fails', async () => {
    const fetcher = vi.fn<RepositoryFetcher>()
      .mockResolvedValueOnce({ maps: [], warnings: [] })
      .mockRejectedValueOnce(new Error('HTTP 503 reading dependencies'));
    const cache = store(fetcher);
    const initial = await cache.snapshot('owner/repo');

    await expect(cache.snapshot('owner/repo', true)).rejects.toThrow('HTTP 503');
    expect(cache.cached('owner/repo')).toBe(initial);
  });

  it('isolates cached snapshots by repository', async () => {
    const fetcher = vi.fn<RepositoryFetcher>(async ({ repo }) => ({ maps: [], warnings: [repo] }));
    const cache = store(fetcher);

    await cache.snapshot('one/repo');
    await cache.snapshot('two/repo');
    const first = await cache.snapshot('one/repo');

    expect(first.warnings).toEqual(['one/repo']);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent loads for one repository', async () => {
    let resolveFetch: ((value: { maps: []; warnings: [] }) => void) | undefined;
    const fetcher = vi.fn<RepositoryFetcher>(() => new Promise((resolve) => { resolveFetch = resolve; }));
    const cache = store(fetcher);

    const first = cache.snapshot('owner/repo');
    const second = cache.snapshot('owner/repo');
    resolveFetch?.({ maps: [], warnings: [] });

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps the cached snapshot when a background check finds no map changes', async () => {
    const fetcher = vi.fn<RepositoryFetcher>(async () => ({ maps: [], warnings: [] }));
    const changeChecker = vi.fn(async () => false);
    const cache = store(fetcher, 10, changeChecker);

    const initial = await cache.snapshot('owner/repo');
    const checked = await cache.refreshIfChanged('owner/repo');

    expect(checked).toBe(initial);
    expect(changeChecker).toHaveBeenCalledWith('owner/repo', []);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('re-reads the repository when a background check finds a map change', async () => {
    let version = 0;
    const fetcher = vi.fn<RepositoryFetcher>(async () => ({ maps: [], warnings: [`version ${String(++version)}`] }));
    const changeChecker = vi.fn(async () => true);
    const cache = store(fetcher, 10, changeChecker);

    const initial = await cache.snapshot('owner/repo');
    const refreshed = await cache.refreshIfChanged('owner/repo');

    expect(initial.warnings).toEqual(['version 1']);
    expect(refreshed.warnings).toEqual(['version 2']);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('evicts the least recently used repository', async () => {
    const fetcher = vi.fn<RepositoryFetcher>(async () => ({ maps: [], warnings: [] }));
    const cache = store(fetcher, 2);

    await cache.snapshot('one/repo');
    await cache.snapshot('two/repo');
    await cache.snapshot('one/repo');
    await cache.snapshot('three/repo');

    expect(cache.repositories()).toEqual(['three/repo', 'one/repo']);
    await cache.snapshot('two/repo');
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});

function map(number: number, settled: MapSettlement | null, ticketsLoaded: boolean): WayfinderMap {
  return {
    number,
    title: `Map ${String(number)}`,
    url: `https://github.com/owner/repo/issues/${String(number)}`,
    body: '',
    open: settled?.reason !== 'closed',
    author: 'octocat',
    visibility: 'private',
    sections: { destination: '', notes: '', decisions: '', fog: '', outOfScope: '' },
    tickets: ticketsLoaded ? [{ number: number * 10, title: 'Ticket', url: '', body: '', type: 'task', labels: [], open: true, assignee: null, blockedBy: [], openBlockers: [], state: 'frontier', updatedAt: null }] : [],
    outside: [],
    criticalPath: { tickets: [], remaining: 0 },
    stalled: [],
    pullRequests: [],
    settled,
    ticketsLoaded,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('RepositoryStore settling', () => {
  const closed: MapSettlement = { reason: 'closed', since: '2026-08-01T00:00:00.000Z' };

  function settlingStore(maps: WayfinderMap[], choices: SettleChoices = {}) {
    const fetcher = vi.fn<RepositoryFetcher>(async () => ({ maps, warnings: [] }));
    const detailer = vi.fn<MapDetailFetcher>(async (_options, unread) => ({
      maps: unread.map((candidate) => ({ ...map(candidate.number, candidate.settled, true) })),
      warnings: [],
    }));
    const cache = new RepositoryStore({
      mapLabel: 'wayfinder:map',
      typePrefix: 'wayfinder:',
      fetcher,
      detailer,
      choices: async () => choices,
      now: () => new Date('2026-09-26T12:00:00.000Z'),
    });
    return { cache, fetcher, detailer };
  }

  it('passes the viewer to the map list and keeps the hidden count on the snapshot', async () => {
    const fetcher = vi.fn<RepositoryFetcher>(async () => ({ maps: [map(1, null, true)], hiddenMaps: 4, warnings: [] }));
    const viewer = { login: 'ramon', follows: [9] };
    const cache = new RepositoryStore({ mapLabel: 'wayfinder:map', typePrefix: 'wayfinder:', fetcher, viewer: async () => viewer });
    const snapshot = await cache.snapshot('owner/repo');
    expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({ viewer }));
    expect(snapshot.hiddenMaps).toBe(4);
  });

  it('passes the hand-made choices to the map list', async () => {
    const choices = { 3: { settled: true, at: '2026-09-25T00:00:00.000Z' } };
    const { cache, fetcher } = settlingStore([], choices);
    await cache.snapshot('owner/repo');
    expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({ choices }));
  });

  it("reads a settled map's tickets only when it is opened, and only once", async () => {
    const { cache, detailer } = settlingStore([map(1, null, true), map(2, closed, false)]);

    expect((await cache.snapshot('owner/repo')).maps[1]).toMatchObject({ ticketsLoaded: false });
    expect(detailer).not.toHaveBeenCalled();

    const opened = await cache.snapshot('owner/repo', false, [2]);
    expect(opened.maps[1]).toMatchObject({ number: 2, ticketsLoaded: true, settled: closed });
    await cache.snapshot('owner/repo', false, [2]);
    expect(detailer).toHaveBeenCalledTimes(1);
    expect(detailer.mock.calls[0]?.[1].map((candidate) => candidate.number)).toEqual([2]);
  });

  it('remembers tickets it read so the idle rule can see them on the next refresh', async () => {
    const { cache, fetcher } = settlingStore([map(1, null, true), map(2, closed, false)]);
    await cache.snapshot('owner/repo');
    await cache.snapshot('owner/repo', true);
    expect(fetcher.mock.calls[1]?.[0].knownTickets).toEqual(new Map([[1, [10]]]));
  });

  it('reads tickets when a map is unsettled and keeps them when one is settled', async () => {
    const { cache, detailer } = settlingStore([map(1, null, true), map(2, closed, false)]);
    await cache.snapshot('owner/repo');

    const manual: MapSettlement = { reason: 'manual', since: '2026-09-26T12:00:00.000Z' };
    const settled = await cache.settle('owner/repo', 1, manual);
    expect(settled?.maps[0]).toMatchObject({ settled: manual, ticketsLoaded: true });
    expect(detailer).not.toHaveBeenCalled();

    const unsettled = await cache.settle('owner/repo', 2, null);
    expect(unsettled?.maps[1]).toMatchObject({ settled: null, ticketsLoaded: true });
    expect(detailer).toHaveBeenCalledTimes(1);
  });

  it('asks the background check only about active maps and the opened one', async () => {
    const changeChecker = vi.fn(async () => false);
    const cache = new RepositoryStore({
      mapLabel: 'wayfinder:map',
      typePrefix: 'wayfinder:',
      fetcher: async () => ({ maps: [map(1, null, true), map(2, closed, false), map(3, closed, true)], warnings: [] }),
      detailer: async (_options, unread) => ({ maps: unread.map((candidate) => map(candidate.number, candidate.settled, true)), warnings: [] }),
      changeChecker,
    });
    await cache.snapshot('owner/repo');

    await cache.refreshIfChanged('owner/repo');
    expect(changeChecker).toHaveBeenLastCalledWith('owner/repo', [1]);
    const opened = await cache.refreshIfChanged('owner/repo', [3]);
    expect(changeChecker).toHaveBeenLastCalledWith('owner/repo', [1, 3]);
    expect(opened.maps.find((candidate) => candidate.number === 2)?.ticketsLoaded).toBe(false);
  });

  it('asks whether a finished check still holds on each background check, so a reopened ticket returns the map to the list', async () => {
    const finished: MapSettlement = { reason: 'finished', since: '2026-09-25T00:00:00.000Z' };
    const watch = { 2: { basis: 'list-1', unattached: {}, retryAt: null } };
    let reopened = false;
    const fetcher = vi.fn<RepositoryFetcher>(async () => ({
      maps: [map(1, null, true), map(2, reopened ? null : finished, reopened)],
      finishedWatch: reopened ? {} : watch,
      warnings: [],
    }));
    const finishedChecker = vi.fn(async () => reopened);
    const cache = new RepositoryStore({ mapLabel: 'wayfinder:map', typePrefix: 'wayfinder:', fetcher, changeChecker: async () => false, finishedChecker });
    await cache.snapshot('owner/repo');

    const quiet = await cache.refreshIfChanged('owner/repo');
    expect(finishedChecker).toHaveBeenLastCalledWith({ repo: 'owner/repo', mapLabel: 'wayfinder:map' }, watch, expect.any(Date));
    expect(quiet.maps[1]?.settled).toEqual(finished);
    expect(fetcher).toHaveBeenCalledTimes(1);

    reopened = true;
    const returned = await cache.refreshIfChanged('owner/repo');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(returned.maps[1]).toMatchObject({ settled: null, ticketsLoaded: true });
    // Nothing is left to watch, so the next check asks about nothing more than the list says.
    await cache.refreshIfChanged('owner/repo');
    expect(finishedChecker).toHaveBeenLastCalledWith(expect.anything(), {}, expect.any(Date));
  });

  it('stops watching a finished map once the user archives or restores it', async () => {
    const finished: MapSettlement = { reason: 'finished', since: '2026-09-25T00:00:00.000Z' };
    const watch = { 1: { basis: 'a', unattached: {}, retryAt: null }, 2: { basis: 'b', unattached: {}, retryAt: null } };
    const fetcher = vi.fn<RepositoryFetcher>(async () => ({ maps: [map(1, finished, false), map(2, finished, false)], finishedWatch: watch, warnings: [] }));
    const finishedChecker = vi.fn(async () => false);
    const detailer = vi.fn<MapDetailFetcher>(async (_options, unread) => ({
      maps: unread.map((candidate) => map(candidate.number, candidate.settled, true)),
      warnings: [],
    }));
    const cache = new RepositoryStore({ mapLabel: 'wayfinder:map', typePrefix: 'wayfinder:', fetcher, changeChecker: async () => false, finishedChecker, detailer });
    await cache.snapshot('owner/repo');

    await cache.settle('owner/repo', 1, { reason: 'manual', since: '2026-10-01T00:00:00.000Z' });
    await cache.refreshIfChanged('owner/repo');
    expect(finishedChecker).toHaveBeenLastCalledWith(expect.anything(), { 2: watch[2] }, expect.any(Date));
    expect(detailer).not.toHaveBeenCalled();

    const restored = await cache.settle('owner/repo', 2, null);
    expect(detailer).toHaveBeenCalledExactlyOnceWith(
      { repo: 'owner/repo', mapLabel: 'wayfinder:map', typePrefix: 'wayfinder:' },
      [expect.objectContaining({ number: 2, settled: null, ticketsLoaded: false })],
    );
    expect(restored?.maps[1]).toEqual(map(2, null, true));
    await cache.refreshIfChanged('owner/repo');
    expect(finishedChecker).toHaveBeenLastCalledWith(expect.anything(), {}, expect.any(Date));
  });

  it('applies a settle saved while the first read is in flight with the old choices', async () => {
    const listed = deferred<FetchResult>();
    const cache = new RepositoryStore({ mapLabel: 'wayfinder:map', typePrefix: 'wayfinder:', fetcher: () => listed.promise, choices: async () => ({}) });
    const first = cache.snapshot('owner/repo');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const manual: MapSettlement = { reason: 'manual', since: '2026-09-26T12:00:00.000Z' };
    expect(await cache.settle('owner/repo', 1, manual)).toBeNull();
    listed.resolve({ maps: [map(1, null, true)], warnings: [] });
    expect((await first).maps[0]?.settled).toEqual(manual);
  });

  it('has nothing to settle before a repository is read', async () => {
    const { cache } = settlingStore([]);
    expect(await cache.settle('owner/repo', 1, null)).toBeNull();
  });

  it('does not merge delayed ticket details into a replacement account cache', async () => {
    const details = deferred<FetchResult>();
    const detailer = vi.fn<MapDetailFetcher>(() => details.promise);
    const cache = new RepositoryStore({ mapLabel: 'wayfinder:map', typePrefix: 'wayfinder:', fetcher: async () => ({ maps: [map(2, closed, false)], warnings: [] }), detailer });
    await cache.snapshot('owner/repo');
    const opened = cache.snapshot('owner/repo', false, [2]);
    const rejected = expect(opened).rejects.toThrow('Repository cache changed');
    await vi.waitFor(() => expect(detailer).toHaveBeenCalledTimes(1));
    cache.clear();
    await cache.snapshot('owner/repo');
    details.resolve({ maps: [map(2, closed, true)], warnings: [] });
    await rejected;
    expect(cache.cached('owner/repo')?.maps[0]?.ticketsLoaded).toBe(false);
  });

  it('rejects an action read when its repository is invalidated during the live fetch', async () => {
    const listing = deferred<FetchResult>();
    const cache = store(() => listing.promise);
    const pending = cache.currentForAction('owner/repo');
    const rejected = expect(pending).rejects.toThrow('Repository cache changed');
    cache.clear();
    listing.resolve({ maps: [], warnings: [] });
    await rejected;
    expect(cache.cached('owner/repo')).toBeNull();
  });

  it('preserves a settlement made while a restored snapshot refreshes', async () => {
    const listing = deferred<FetchResult>();
    const saved = { repo: 'owner/repo', fetchedAt: new Date().toISOString(), maps: [map(2, null, true)], hiddenMaps: 0, publicMaps: [], warnings: [] };
    const persistence = { load: async () => saved, save: vi.fn(async () => undefined) };
    const cache = new RepositoryStore({ mapLabel: 'wayfinder:map', typePrefix: 'wayfinder:', identity: async () => 'a', persistence, fetcher: () => listing.promise });
    await cache.snapshot('owner/repo');
    const settled = { reason: 'manual' as const, since: '2026-10-07T00:00:00Z' };
    await cache.settle('owner/repo', 2, settled);
    listing.resolve({ maps: [map(2, null, true)], warnings: [] });
    await vi.waitFor(() => expect(cache.cached('owner/repo')?.maps[0]?.settled).toEqual(settled));
    await cache.currentForAction('owner/repo');
    expect(cache.cached('owner/repo')?.maps[0]?.settled).toEqual(settled);
    expect(persistence.save).not.toHaveBeenCalled();
  });

  it('shows a finished map from the saved snapshot after a restart, then returns it if a ticket reopened while the app was closed', async () => {
    const finished: MapSettlement = { reason: 'finished', since: '2026-09-25T00:00:00.000Z' };
    const saved = { repo: 'owner/repo', fetchedAt: new Date().toISOString(), maps: [map(2, finished, false)], hiddenMaps: 0, publicMaps: [], warnings: [] };
    const persistence = { load: async () => saved, save: vi.fn(async () => undefined) };
    const fetcher = vi.fn<RepositoryFetcher>(async () => ({ maps: [map(2, null, true)], warnings: [] }));
    const cache = new RepositoryStore({ mapLabel: 'wayfinder:map', typePrefix: 'wayfinder:', identity: async () => 'a', persistence, fetcher });

    expect((await cache.snapshot('owner/repo')).maps[0]?.settled).toEqual(finished);

    await vi.waitFor(() => expect(cache.cached('owner/repo')?.maps[0]).toMatchObject({ settled: null, ticketsLoaded: true }));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('persists ticket details loaded after the repository listing', async () => {
    const persistence = { load: async () => null, save: vi.fn(async () => undefined) };
    const cache = new RepositoryStore({ mapLabel: 'wayfinder:map', typePrefix: 'wayfinder:', identity: async () => 'a', persistence, fetcher: async () => ({ maps: [map(2, closed, false)], warnings: [] }), detailer: async () => ({ maps: [map(2, closed, true)], warnings: [] }) });
    await cache.snapshot('owner/repo', false, [2]);
    expect(persistence.save).toHaveBeenLastCalledWith(expect.objectContaining({ maps: [expect.objectContaining({ ticketsLoaded: true })] }), expect.any(String));
  });

  it.each([null, { reason: 'manual', since: '2026-09-27T00:00:00.000Z' } satisfies MapSettlement])(
    'keeps a newer settle choice when delayed ticket details return: %j',
    async (settled) => {
      const details = deferred<FetchResult>();
      const detailer = vi.fn<MapDetailFetcher>(() => details.promise);
      const cache = new RepositoryStore({
        mapLabel: 'wayfinder:map',
        typePrefix: 'wayfinder:',
        fetcher: async () => ({ maps: [map(2, closed, false)], warnings: [] }),
        detailer,
      });
      await cache.snapshot('owner/repo');
      const opened = cache.snapshot('owner/repo', false, [2]);
      await vi.waitFor(() => expect(detailer).toHaveBeenCalledTimes(1));
      const choice = cache.settle('owner/repo', 2, settled);
      details.resolve({ maps: [map(2, closed, true)], warnings: ['detail warning'] });

      await choice;
      expect((await opened).maps[0]).toMatchObject({ settled, ticketsLoaded: true });
      expect(cache.cached('owner/repo')?.maps[0]).toMatchObject({ settled, ticketsLoaded: true });
      expect(cache.cached('owner/repo')?.warnings).toContain('detail warning');
    },
  );

  it('loads each caller\'s opened maps after sharing an initial repository load', async () => {
    const listing = deferred<FetchResult>();
    const detailer = vi.fn<MapDetailFetcher>(async (_options, unread) => ({
      maps: unread.map((candidate) => map(candidate.number, candidate.settled, true)), warnings: [],
    }));
    const cache = new RepositoryStore({
      mapLabel: 'wayfinder:map', typePrefix: 'wayfinder:', fetcher: () => listing.promise, detailer,
    });
    const first = cache.snapshot('owner/repo', false, [2]);
    const second = cache.refreshIfChanged('owner/repo', [3]);
    listing.resolve({ maps: [map(2, closed, false), map(3, closed, false)], warnings: [] });

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.maps.find((candidate) => candidate.number === 2)?.ticketsLoaded).toBe(true);
    expect(secondResult.maps.find((candidate) => candidate.number === 3)?.ticketsLoaded).toBe(true);
    expect(cache.cached('owner/repo')?.maps.every((candidate) => candidate.ticketsLoaded)).toBe(true);
  });

  it('loads each caller\'s opened maps after sharing a pending change check', async () => {
    const changed = deferred<boolean>();
    const changeChecker = vi.fn(() => changed.promise);
    const detailer = vi.fn<MapDetailFetcher>(async (_options, unread) => ({
      maps: unread.map((candidate) => map(candidate.number, candidate.settled, true)), warnings: [],
    }));
    const fetcher = vi.fn<RepositoryFetcher>(async () => ({ maps: [map(2, closed, false), map(3, closed, false)], warnings: [] }));
    const cache = new RepositoryStore({
      mapLabel: 'wayfinder:map', typePrefix: 'wayfinder:', fetcher, detailer, changeChecker,
    });
    await cache.snapshot('owner/repo');
    const first = cache.refreshIfChanged('owner/repo', [2]);
    const second = cache.refreshIfChanged('owner/repo', [3]);
    changed.resolve(true);

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.maps.find((candidate) => candidate.number === 2)?.ticketsLoaded).toBe(true);
    expect(secondResult.maps.find((candidate) => candidate.number === 3)?.ticketsLoaded).toBe(true);
    expect(cache.cached('owner/repo')?.maps.every((candidate) => candidate.ticketsLoaded)).toBe(true);
    expect(changeChecker).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
