import { describe, expect, it, vi } from 'vitest';

import { RepositoryStore } from './repositoryStore.js';
import type { RepositoryFetcher } from './repositoryStore.js';

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
