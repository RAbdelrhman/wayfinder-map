import { fetchMapDetails, fetchMaps, haveMapTicketsChanged } from './github.js';
import type { FetchOptions, FetchResult, MapListOptions } from './github.js';
import { normalizeRepo } from './repoRoutes.js';
import type { SettleChoices } from './settling.js';
import type { Viewer } from './visibility.js';
import type { MapSettlement, MapSnapshot, WayfinderMap } from './types.js';

export type RepositoryFetcher = (options: MapListOptions) => Promise<FetchResult>;
export type MapDetailFetcher = (options: FetchOptions, maps: readonly WayfinderMap[]) => Promise<FetchResult>;

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
  /** Reads the tickets of settled maps once someone opens one. */
  detailer?: MapDetailFetcher;
  /** The signed-in user's hand-made settle choices for a repository. */
  choices?: (repo: string) => Promise<SettleChoices>;
  /** The signed-in login and the public maps it follows here. Null or absent lists every map. */
  viewer?: (repo: string) => Promise<Viewer | null>;
  now?: () => Date;
}

export class RepositoryStore {
  private readonly entries = new Map<string, RepositoryEntry>();
  private readonly limit: number;
  private readonly fetcher: RepositoryFetcher;
  private readonly changeChecker: RepositoryChangeChecker;
  private readonly detailer: MapDetailFetcher;
  private readonly now: () => Date;

  constructor(private readonly options: RepositoryStoreOptions) {
    this.limit = options.limit ?? 10;
    if (!Number.isInteger(this.limit) || this.limit <= 0) throw new Error('Repository cache limit must be positive.');
    this.fetcher = options.fetcher ?? fetchMaps;
    this.changeChecker = options.changeChecker ?? haveMapTicketsChanged;
    this.detailer = options.detailer ?? fetchMapDetails;
    this.now = options.now ?? (() => new Date());
  }

  repositories(): string[] {
    return [...this.entries.keys()].reverse();
  }

  /** The repository's maps. Settled maps named in `open` come with their tickets; the rest stay unread. */
  async snapshot(repo: string, force = false, open: readonly number[] = []): Promise<MapSnapshot> {
    const normalized = normalizeRepo(repo);
    if (normalized === null) throw new Error(`Invalid repository: ${repo}`);
    return this.withTickets(normalized, await this.listed(normalized, force), open);
  }

  /** The snapshot already read, without reading anything. */
  cached(repo: string): MapSnapshot | null {
    const normalized = normalizeRepo(repo);
    return normalized === null ? null : (this.entries.get(normalized)?.snapshot ?? null);
  }

  /** Records a settle or unsettle on the cached snapshot. Unsettling a map whose tickets were never read reads them. */
  async settle(repo: string, mapNumber: number, settled: MapSettlement | null): Promise<MapSnapshot | null> {
    const normalized = normalizeRepo(repo);
    const entry = normalized === null ? undefined : this.entries.get(normalized);
    if (normalized === null || entry?.snapshot === null || entry === undefined) return null;
    entry.snapshot = {
      ...entry.snapshot,
      maps: entry.snapshot.maps.map((map) => (map.number === mapNumber ? { ...map, settled } : map)),
    };
    return settled === null ? this.withTickets(normalized, entry.snapshot, [mapNumber]) : entry.snapshot;
  }

  clear(): void {
    this.entries.clear();
  }

  private async listed(repo: string, force: boolean): Promise<MapSnapshot> {
    const entry = this.touch(repo);
    if (!force && entry.snapshot !== null) return entry.snapshot;
    return this.fetchSnapshot(repo, entry);
  }

  /**
   * Re-reads the repository only if a map's tickets changed. Only active maps, and the settled
   * ones in `open`, are asked: a settled map costs nothing until it is opened.
   */
  async refreshIfChanged(repo: string, open: readonly number[] = []): Promise<MapSnapshot> {
    const normalized = normalizeRepo(repo);
    if (normalized === null) throw new Error(`Invalid repository: ${repo}`);

    const entry = this.touch(normalized);
    if (entry.inFlight !== null) return entry.inFlight;
    if (entry.refreshInFlight !== null) return entry.refreshInFlight;
    if (entry.snapshot === null) return this.snapshot(normalized, false, open);

    const snapshot = entry.snapshot;
    const watched = snapshot.maps.filter((map) => map.ticketsLoaded && (map.settled === null || open.includes(map.number)));
    entry.refreshInFlight = (async () => {
      const changed = await this.changeChecker(normalized, watched.map((map) => map.number));
      const current = changed ? await (entry.inFlight ?? this.fetchSnapshot(normalized, entry)) : await (entry.inFlight ?? entry.snapshot ?? snapshot);
      return this.withTickets(normalized, current, open);
    })().finally(() => {
      entry.refreshInFlight = null;
    });

    return entry.refreshInFlight;
  }

  private fetchSnapshot(repo: string, entry: RepositoryEntry): Promise<MapSnapshot> {
    if (entry.inFlight !== null) return entry.inFlight;

    // Tickets read last time let the idle rule see a map's tickets without reading them again.
    const knownTickets = new Map(
      (entry.snapshot?.maps ?? []).filter((map) => map.ticketsLoaded).map((map) => [map.number, map.tickets.map((ticket) => ticket.number)]),
    );
    const list = (choices: SettleChoices, viewer: Viewer | null): Promise<FetchResult> =>
      this.fetcher({ repo, mapLabel: this.options.mapLabel, typePrefix: this.options.typePrefix, choices, knownTickets, now: this.now(), viewer });
    const { choices, viewer } = this.options;
    entry.inFlight = (
      choices === undefined && viewer === undefined
        ? list({}, null)
        : Promise.all([choices?.(repo) ?? {}, viewer?.(repo) ?? null]).then(([forRepo, who]) => list(forRepo, who))
    )
      .then(({ maps, hiddenMaps, warnings }) => {
        const snapshot = { repo, fetchedAt: this.now().toISOString(), maps, hiddenMaps: hiddenMaps ?? 0, warnings };
        entry.snapshot = snapshot;
        return snapshot;
      })
      .finally(() => {
        entry.inFlight = null;
      });

    return entry.inFlight;
  }

  /** Reads the tickets of any map in `open` that was listed without them, and keeps them on the cached snapshot. */
  private async withTickets(repo: string, snapshot: MapSnapshot, open: readonly number[]): Promise<MapSnapshot> {
    const unread = snapshot.maps.filter((map) => !map.ticketsLoaded && open.includes(map.number));
    if (unread.length === 0) return snapshot;
    const { maps, warnings } = await this.detailer(
      { repo, mapLabel: this.options.mapLabel, typePrefix: this.options.typePrefix },
      unread,
    );
    const read = new Map(maps.map((map) => [map.number, map]));
    const entry = this.touch(repo);
    const current = entry.snapshot ?? snapshot;
    const next = {
      ...current,
      maps: current.maps.map((map) => read.get(map.number) ?? map),
      warnings: [...current.warnings, ...warnings],
    };
    entry.snapshot = next;
    return next;
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
