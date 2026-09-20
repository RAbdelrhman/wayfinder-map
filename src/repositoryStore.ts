import { fetchMaps } from './github.js';
import type { FetchOptions, FetchResult } from './github.js';
import { normalizeRepo } from './repoRoutes.js';
import type { MapSnapshot } from './types.js';

export type RepositoryFetcher = (options: FetchOptions) => Promise<FetchResult>;

interface RepositoryEntry {
  snapshot: MapSnapshot | null;
  inFlight: Promise<MapSnapshot> | null;
}

export interface RepositoryStoreOptions {
  mapLabel: string;
  typePrefix: string;
  limit?: number;
  fetcher?: RepositoryFetcher;
  now?: () => Date;
}

export class RepositoryStore {
  private readonly entries = new Map<string, RepositoryEntry>();
  private readonly limit: number;
  private readonly fetcher: RepositoryFetcher;
  private readonly now: () => Date;

  constructor(private readonly options: RepositoryStoreOptions) {
    this.limit = options.limit ?? 10;
    if (!Number.isInteger(this.limit) || this.limit <= 0) throw new Error('Repository cache limit must be positive.');
    this.fetcher = options.fetcher ?? fetchMaps;
    this.now = options.now ?? (() => new Date());
  }

  repositories(): string[] {
    return [...this.entries.keys()].reverse();
  }

  async snapshot(repo: string, force = false): Promise<MapSnapshot> {
    const normalized = normalizeRepo(repo);
    if (normalized === null) throw new Error(`Invalid repository: ${repo}`);

    const entry = this.touch(normalized);
    if (!force && entry.snapshot !== null) return entry.snapshot;
    if (entry.inFlight !== null) return entry.inFlight;

    entry.inFlight = this.fetcher({
      repo: normalized,
      mapLabel: this.options.mapLabel,
      typePrefix: this.options.typePrefix,
    })
      .then(({ maps, warnings }) => {
        const snapshot = { repo: normalized, fetchedAt: this.now().toISOString(), maps, warnings };
        entry.snapshot = snapshot;
        return snapshot;
      })
      .finally(() => {
        entry.inFlight = null;
      });

    return entry.inFlight;
  }

  clear(): void {
    this.entries.clear();
  }

  private touch(repo: string): RepositoryEntry {
    const existing = this.entries.get(repo) ?? { snapshot: null, inFlight: null };
    this.entries.delete(repo);
    this.entries.set(repo, existing);
    while (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    return existing;
  }
}
