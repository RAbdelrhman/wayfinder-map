import type { HomeState } from '../home.js';
import { normalizeRepo } from '../repoRoutes.js';
import { readHomeRecency } from './homeRecency.js';
import type { HomeRecency, HomeStorage } from './homeRecency.js';

export interface HandOffActivity {
  repo: string;
  createdAt: string;
}

export interface WayfinderRepositorySources {
  /** Repositories GitHub reports holding at least one Wayfinder map. */
  mapRepositories: readonly string[];
  recency: Pick<HomeRecency, 'repositories' | 'repositoryOpenedAt'>;
  handOffs: readonly HandOffActivity[];
}

function timeValue(value: string | undefined): number {
  const parsed = value === undefined ? Number.NaN : Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * The repositories the sidebar and Home list: ones with a Wayfinder map or opened in Wayfinder.
 * Most recent Wayfinder activity (opening a repository or map, starting a hand-off) comes first,
 * then repositories with maps by name, then any other opened repository.
 */
export function orderWayfinderRepositories({ mapRepositories, recency, handOffs }: WayfinderRepositorySources): string[] {
  const names = new Map<string, string>();
  const activity = new Map<string, number>();
  const withMaps = new Set<string>();
  const add = (value: string): string | null => {
    const repo = normalizeRepo(value);
    if (repo === null) return null;
    const key = repo.toLocaleLowerCase();
    if (!names.has(key)) names.set(key, repo);
    return key;
  };
  const touch = (key: string | null, at: number): void => {
    if (key !== null && at > (activity.get(key) ?? 0)) activity.set(key, at);
  };

  const recentPosition = new Map<string, number>();
  recency.repositories.forEach((repo, index) => {
    const key = add(repo);
    if (key !== null && !recentPosition.has(key)) recentPosition.set(key, index);
  });
  for (const [repo, openedAt] of Object.entries(recency.repositoryOpenedAt)) touch(add(repo), timeValue(openedAt));
  for (const handOff of handOffs) touch(add(handOff.repo), timeValue(handOff.createdAt));
  for (const repo of mapRepositories) {
    const key = add(repo);
    if (key !== null) withMaps.add(key);
  }

  const tier = (key: string): number => (activity.has(key) ? 0 : withMaps.has(key) ? 1 : 2);
  return [...names.keys()]
    .sort((left, right) => {
      const byTier = tier(left) - tier(right);
      if (byTier !== 0) return byTier;
      const byActivity = (activity.get(right) ?? 0) - (activity.get(left) ?? 0);
      if (byActivity !== 0) return byActivity;
      const byRecent = (recentPosition.get(left) ?? Number.MAX_SAFE_INTEGER) - (recentPosition.get(right) ?? Number.MAX_SAFE_INTEGER);
      return byRecent !== 0 ? byRecent : left.localeCompare(right);
    })
    .map((key) => names.get(key) ?? key);
}

type GetJson = <T>(url: string) => Promise<T>;

/** Loads the sources and orders them; each source is optional so the list survives GitHub or T3 Code being offline. */
export async function loadWayfinderRepositories(storage: HomeStorage, getJson: GetJson): Promise<string[]> {
  const [home, handOffs] = await Promise.allSettled([
    getJson<HomeState>('/api/home'),
    getJson<{ handOffs: HandOffActivity[] }>('/api/hand-offs'),
  ]);
  const mapRepositories = home.status === 'fulfilled' && Array.isArray(home.value.repositories) ? home.value.repositories : [];
  const activity = handOffs.status === 'fulfilled' && Array.isArray(handOffs.value.handOffs) ? handOffs.value.handOffs : [];
  const recency = readHomeRecency(storage);
  if (home.status === 'rejected' && recency.repositories.length === 0 && Object.keys(recency.repositoryOpenedAt).length === 0) {
    throw home.reason instanceof Error ? home.reason : new Error(String(home.reason));
  }
  return orderWayfinderRepositories({ mapRepositories, recency, handOffs: activity });
}
