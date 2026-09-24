import { describe, expect, it } from 'vitest';

import { recordMapOpened, recordRepositoryOpened } from './homeRecency.js';
import type { HomeStorage } from './homeRecency.js';
import { loadWayfinderRepositories, orderWayfinderRepositories } from './wayfinderRepositories.js';

function memoryStorage(): HomeStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

const NO_RECENCY = { repositories: [], repositoryOpenedAt: {} };

describe('Wayfinder repository list', () => {
  it('lists only repositories with maps or opened in Wayfinder', () => {
    expect(orderWayfinderRepositories({ mapRepositories: [], recency: NO_RECENCY, handOffs: [] })).toEqual([]);
    expect(
      orderWayfinderRepositories({
        mapRepositories: ['octo/maps'],
        recency: { repositories: ['octo/opened'], repositoryOpenedAt: { 'octo/opened': '2026-09-20T12:00:00Z' } },
        handOffs: [],
      }),
    ).toEqual(['octo/opened', 'octo/maps']);
  });

  it('puts the most recent activity first, then repositories with maps, then the rest', () => {
    expect(
      orderWayfinderRepositories({
        mapRepositories: ['octo/zeta', 'octo/alpha', 'octo/opened-older'],
        recency: {
          repositories: ['octo/opened-newer', 'octo/legacy', 'octo/opened-older'],
          repositoryOpenedAt: {
            'octo/opened-newer': '2026-09-22T12:00:00Z',
            'octo/opened-older': '2026-09-20T12:00:00Z',
          },
        },
        handOffs: [{ repo: 'octo/handed-off', createdAt: '2026-09-21T12:00:00Z' }],
      }),
    ).toEqual(['octo/opened-newer', 'octo/handed-off', 'octo/opened-older', 'octo/alpha', 'octo/zeta', 'octo/legacy']);
  });

  it('lets a newer hand-off lift a repository above a later-opened one and merges case variants', () => {
    expect(
      orderWayfinderRepositories({
        mapRepositories: ['Octo/Wayfinder'],
        recency: {
          repositories: ['octo/other', 'octo/wayfinder'],
          repositoryOpenedAt: { 'octo/other': '2026-09-21T12:00:00Z', 'octo/wayfinder': '2026-09-19T12:00:00Z' },
        },
        handOffs: [{ repo: 'OCTO/wayfinder', createdAt: '2026-09-23T12:00:00Z' }, { repo: 'not a repo', createdAt: '2026-09-24T12:00:00Z' }],
      }),
    ).toEqual(['octo/wayfinder', 'octo/other']);
  });

  it('keeps every opened repository, not just the most recent eight, even when GitHub is offline', async () => {
    const storage = memoryStorage();
    for (let index = 0; index < 12; index += 1) recordRepositoryOpened(`octo/repo-${String(index)}`, Date.UTC(2026, 8, 1 + index), storage);
    const repos = await loadWayfinderRepositories(storage, () => Promise.reject(new Error('offline')));
    expect(repos).toHaveLength(12);
    expect(repos[0]).toBe('octo/repo-11');
    expect(repos.at(-1)).toBe('octo/repo-0');
  });

  it('loads map repositories, hand-offs and local recency into one list', async () => {
    const storage = memoryStorage();
    recordMapOpened('octo/opened', 4, Date.UTC(2026, 8, 20), storage);
    const responses: Record<string, unknown> = {
      '/api/home': { repositories: ['octo/maps', 'octo/opened'] },
      '/api/hand-offs': { handOffs: [{ repo: 'octo/handed-off', createdAt: '2026-09-22T00:00:00Z' }] },
    };
    const getJson = <T,>(url: string): Promise<T> => Promise.resolve(responses[url] as T);
    await expect(loadWayfinderRepositories(storage, getJson)).resolves.toEqual(['octo/handed-off', 'octo/opened', 'octo/maps']);
  });

  it('fails only when GitHub is unreachable and nothing was opened locally', async () => {
    await expect(loadWayfinderRepositories(memoryStorage(), () => Promise.reject(new Error('GitHub is down')))).rejects.toThrow('GitHub is down');
  });
});
