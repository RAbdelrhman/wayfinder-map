import { fetchMaps, haveMapSubIssuesChanged } from './github.js';
import type { FetchOptions, FetchResult } from './github.js';
import { normalizeRepo } from './repoRoutes.js';
import type { MapSnapshot } from './types.js';

export type RepositoryFetcher = (options: FetchOptions) => Promise<FetchResult>;

interface RepositoryEntry {
  snapshot: MapSnapshot | null;
  inFlight: Promise<MapSnapshot> | null;
  refreshInFlight: Promise<MapSnapshot> | null;
}

export type RepositoryChangeChecker = (repo: string, mapNumbers: readonly number[]) => Promise<boolean>;

export interface RepositoryStoreOptions {
  mapLabel: string;
  typePrefix: string;
  limit?: number;
  fetcher?: RepositoryFetcher;
  changeChecker?: RepositoryChangeChecker;
  now?: () => Date;
}

export class RepositoryStore {
  private readonly entries = new Map<string, RepositoryEntry>();
  private readonly limit: number;
  private readonly fetcher: RepositoryFetcher;
  private readonly changeChecker: RepositoryChangeChecker;
  private readonly now: () => Date;

  constructor(private readonly options: RepositoryStoreOptions) {
    this.limit = options.limit ?? 10;
    if (!Number.isInteger(this.limit) || this.limit <= 0) throw new Error('Repository cache limit must be positive.');
    this.fetcher = options.fetcher ?? fetchMaps;
    this.changeChecker = options.changeChecker ?? haveMapSubIssuesChanged;
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

    return this.fetchSnapshot(normalized, entry);
  }

  async refreshIfChanged(repo: string): Promise<MapSnapshot> {
    const normalized = normalizeRepo(repo);
    if (normalized === null) throw new Error(`Invalid repository: ${repo}`);

    const entry = this.touch(normalized);
    if (entry.inFlight !== null) return entry.inFlight;
    if (entry.refreshInFlight !== null) return entry.refreshInFlight;
    if (entry.snapshot === null) return this.snapshot(normalized);

    const snapshot = entry.snapshot;
    entry.refreshInFlight = (async () => {
      const changed = await this.changeChecker(normalized, snapshot.maps.map((map) => map.number));
      if (!changed) return entry.inFlight ?? entry.snapshot ?? snapshot;
      return entry.inFlight ?? this.fetchSnapshot(normalized, entry);
    })().finally(() => {
      entry.refreshInFlight = null;
    });

    return entry.refreshInFlight;
  }

  private fetchSnapshot(repo: string, entry: RepositoryEntry): Promise<MapSnapshot> {
    if (entry.inFlight !== null) return entry.inFlight;

    entry.inFlight = this.fetcher({
      repo,
      mapLabel: this.options.mapLabel,
      typePrefix: this.options.typePrefix,
    })
      .then(({ maps, warnings }) => {
        const snapshot = { repo, fetchedAt: this.now().toISOString(), maps, warnings };
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
    const existing = this.entries.get(repo) ?? { snapshot: null, inFlight: null, refreshInFlight: null };
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
