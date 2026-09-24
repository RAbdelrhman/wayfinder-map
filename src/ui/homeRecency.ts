import { normalizeRepo } from '../repoRoutes.js';

export const RECENT_REPOSITORIES_KEY = 'wayfinder-map:recent-repositories';
export const REPOSITORY_OPENED_KEY = 'wayfinder-map:repository-opened-at';
export const LAST_OPENED_MAP_KEY = 'wayfinder-map:last-opened-map';

export interface HomeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface LastOpenedMap {
  repo: string;
  mapNumber: number;
  openedAt: string;
}

export interface HomeRecency {
  repositories: string[];
  repositoryOpenedAt: Record<string, string>;
  lastOpenedMap: LastOpenedMap | null;
}

function readJson(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function repoKey(repo: string): string {
  return repo.toLocaleLowerCase();
}

export function readHomeRecency(storage: HomeStorage): HomeRecency {
  try {
    const recentValue = readJson(storage.getItem(RECENT_REPOSITORIES_KEY));
    const repositories = Array.isArray(recentValue)
      ? recentValue
          .filter((value): value is string => typeof value === 'string')
          .map((value) => normalizeRepo(value))
          .filter((value): value is string => value !== null)
          .filter((repo, index, all) => all.findIndex((candidate) => repoKey(candidate) === repoKey(repo)) === index)
      : [];
    const openedValue = readJson(storage.getItem(REPOSITORY_OPENED_KEY));
    const repositoryOpenedAt: Record<string, string> = {};
    if (typeof openedValue === 'object' && openedValue !== null && !Array.isArray(openedValue)) {
      for (const [repoValue, timestamp] of Object.entries(openedValue)) {
        const repo = normalizeRepo(repoValue);
        if (repo !== null && typeof timestamp === 'string' && !Number.isNaN(Date.parse(timestamp))) {
          repositoryOpenedAt[repoKey(repo)] = timestamp;
        }
      }
    }

    const mapValue = readJson(storage.getItem(LAST_OPENED_MAP_KEY));
    let lastOpenedMap: LastOpenedMap | null = null;
    if (typeof mapValue === 'object' && mapValue !== null && !Array.isArray(mapValue)) {
      const record = mapValue as Record<string, unknown>;
      const repo = typeof record['repo'] === 'string' ? normalizeRepo(record['repo']) : null;
      if (
        repo !== null &&
        typeof record['mapNumber'] === 'number' &&
        Number.isSafeInteger(record['mapNumber']) &&
        record['mapNumber'] > 0 &&
        typeof record['openedAt'] === 'string' &&
        !Number.isNaN(Date.parse(record['openedAt']))
      ) {
        lastOpenedMap = { repo, mapNumber: record['mapNumber'], openedAt: record['openedAt'] };
      }
    }

    return { repositories, repositoryOpenedAt, lastOpenedMap };
  } catch {
    return { repositories: [], repositoryOpenedAt: {}, lastOpenedMap: null };
  }
}

export function recordRepositoryOpened(repoValue: string, now: number, storage: HomeStorage): void {
  const repo = normalizeRepo(repoValue);
  if (repo === null || !Number.isFinite(now)) return;
  try {
    const current = readHomeRecency(storage);
    const openedAt = { ...current.repositoryOpenedAt, [repoKey(repo)]: new Date(now).toISOString() };
    const repositories = [repo, ...current.repositories.filter((candidate) => repoKey(candidate) !== repoKey(repo))];
    storage.setItem(RECENT_REPOSITORIES_KEY, JSON.stringify(repositories));
    storage.setItem(REPOSITORY_OPENED_KEY, JSON.stringify(openedAt));
  } catch {
    // Recency improves Home but is not required to open a repository.
  }
}

export function recordMapOpened(repoValue: string, mapNumber: number, now: number, storage: HomeStorage): void {
  const repo = normalizeRepo(repoValue);
  if (repo === null || !Number.isSafeInteger(mapNumber) || mapNumber <= 0 || !Number.isFinite(now)) return;
  try {
    recordRepositoryOpened(repo, now, storage);
    storage.setItem(LAST_OPENED_MAP_KEY, JSON.stringify({ repo, mapNumber, openedAt: new Date(now).toISOString() }));
  } catch {
    // Recency improves Home but is not required to open a map.
  }
}
