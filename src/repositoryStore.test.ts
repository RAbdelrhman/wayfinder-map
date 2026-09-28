import { describe, expect, it, vi } from 'vitest';

import { RepositoryStore } from './repositoryStore.js';
import type { MapDetailFetcher, RepositoryFetcher } from './repositoryStore.js';
import type { SettleChoices } from './settling.js';
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
    tickets: ticketsLoaded ? [{ number: number * 10, title: 'Ticket', url: '', body: '', type: 'task', labels: [], open: true, assignee: null, blockedBy: [], openBlockers: [], state: 'frontier' }] : [],
    outside: [],
    criticalPath: { tickets: [], remaining: 0 },
    settled,
    ticketsLoaded,
  };
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

  it('has nothing to settle before a repository is read', async () => {
    const { cache } = settlingStore([]);
    expect(await cache.settle('owner/repo', 1, null)).toBeNull();
  });
});
