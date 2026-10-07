import { fetchMapDetails, fetchMaps, haveMapTicketsChanged } from './github.js';
import type { FetchOptions, FetchResult, MapListOptions } from './github.js';
import { normalizeRepo } from './repoRoutes.js';
import type { SettleChoices } from './settling.js';
import type { Viewer } from './visibility.js';
import type { MapSettlement, MapSnapshot, WayfinderMap } from './types.js';
import type { SnapshotPersistence } from './repositorySnapshotCache.js';

export type RepositoryFetcher = (options: MapListOptions) => Promise<FetchResult>;
export type MapDetailFetcher = (options: FetchOptions, maps: readonly WayfinderMap[]) => Promise<FetchResult>;

interface RepositoryEntry {
  snapshot: MapSnapshot | null;
  inFlight: Promise<MapSnapshot> | null;
  refreshInFlight: Promise<MapSnapshot> | null;
  restoreInFlight?: Promise<MapSnapshot | null>;
  restored?: boolean;
  choiceRevision?: number;
  settleOverrides?: Map<number, MapSettlement | null>;
  persistedScope?: string | null;
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
  persistence?: SnapshotPersistence;
  /** Verified GitHub host and login. No signed-in identity means no disk-cache reuse. */
  identity?: () => Promise<string | null>;
}

export class RepositoryStore {
  private readonly entries = new Map<string, RepositoryEntry>();
  private readonly limit: number;
  private readonly fetcher: RepositoryFetcher;
  private readonly changeChecker: RepositoryChangeChecker;
  private readonly detailer: MapDetailFetcher;
  private readonly now: () => Date;

  constructor(private readonly options: RepositoryStoreOptions) {
    this.limit = options.limit ?? 32;
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
    const entry = this.touch(normalized);
    const snapshot = await this.listed(normalized, force);
    this.requireCurrent(normalized, entry);
    return this.withTickets(normalized, snapshot, open);
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
    entry.choiceRevision = (entry.choiceRevision ?? 0) + 1;
    entry.settleOverrides ??= new Map();
    entry.settleOverrides.set(mapNumber, settled);
    entry.persistedScope = null;
    entry.snapshot = {
      ...entry.snapshot,
      maps: entry.snapshot.maps.map((map) => (map.number === mapNumber ? { ...map, settled } : map)),
    };
    return settled === null ? this.withTickets(normalized, entry.snapshot, [mapNumber]) : entry.snapshot;
  }

  clear(): void {
    this.entries.clear();
  }

  invalidate(repo: string): void {
    const normalized = normalizeRepo(repo);
    if (normalized !== null) this.entries.delete(normalized);
  }

  private requireCurrent(repo: string, entry: RepositoryEntry): void {
    if (this.entries.get(repo) !== entry) throw new Error('Repository cache changed during a read. Please retry.');
  }

  private async listed(repo: string, force: boolean): Promise<MapSnapshot> {
    const entry = this.touch(repo);
    if (!force && entry.snapshot !== null) return entry.snapshot;
    if (!force && entry.inFlight === null && this.options.persistence !== undefined) {
      entry.restoreInFlight ??= this.restore(repo, entry);
      const restored = await entry.restoreInFlight;
      if (restored !== null) return restored;
    }
    return this.fetchSnapshot(repo, entry);
  }

  /** A saved snapshot can render a page, but starting work must await its first live read. */
  async currentForAction(repo: string, open: readonly number[] = []): Promise<MapSnapshot> {
    const normalized = normalizeRepo(repo);
    if (normalized === null) throw new Error(`Invalid repository: ${repo}`);
    const entry = this.touch(normalized);
    const snapshot = await this.snapshot(repo, false, open);
    this.requireCurrent(normalized, entry);
    if (entry.restored !== true) return entry.snapshot ?? snapshot;
    const current = await this.fetchSnapshot(snapshot.repo, entry);
    this.requireCurrent(normalized, entry);
    return this.withTickets(snapshot.repo, current, open);
  }

  private async scope(repo: string): Promise<string | null> {
    const identity = await this.options.identity?.();
    if (identity == null) return null;
    const [choices, viewer] = await Promise.all([this.options.choices?.(repo) ?? {}, this.options.viewer?.(repo) ?? null]);
    return JSON.stringify([identity, this.options.mapLabel, this.options.typePrefix, choices, viewer]);
  }

  private async restore(repo: string, entry: RepositoryEntry): Promise<MapSnapshot | null> {
    const scope = await this.scope(repo);
    if (scope === null) return null;
    const snapshot = await this.options.persistence?.load(repo, scope) ?? null;
    if (snapshot === null || this.entries.get(repo) !== entry) return null;
    // A forced read may finish while the saved snapshot is being loaded.
    if (entry.snapshot !== null) return entry.snapshot;
    entry.snapshot = snapshot;
    entry.restored = true;
    entry.persistedScope = scope;
    // Restore the view now and rebuild GitHub's conditional-read baseline in the background.
    void this.fetchSnapshot(repo, entry).catch(() => undefined);
    return snapshot;
  }

  /**
   * Re-reads the repository only if a map's tickets changed. Only active maps, and the settled
   * ones in `open`, are asked: a settled map costs nothing until it is opened.
   */
  async refreshIfChanged(repo: string, open: readonly number[] = []): Promise<MapSnapshot> {
    const normalized = normalizeRepo(repo);
    if (normalized === null) throw new Error(`Invalid repository: ${repo}`);

    const entry = this.touch(normalized);
    if (entry.inFlight !== null) return this.withTickets(normalized, await entry.inFlight, open);
    if (entry.refreshInFlight !== null) return this.withTickets(normalized, await entry.refreshInFlight, open);
    if (entry.snapshot === null) return this.snapshot(normalized, false, open);

    const snapshot = entry.snapshot;
    const watched = snapshot.maps.filter((map) => map.ticketsLoaded && (map.settled === null || open.includes(map.number)));
    entry.refreshInFlight = (async () => {
      const changed = await this.changeChecker(normalized, watched.map((map) => map.number));
      this.requireCurrent(normalized, entry);
      const current = changed ? await (entry.inFlight ?? this.fetchSnapshot(normalized, entry)) : await (entry.inFlight ?? entry.snapshot ?? snapshot);
      return this.withTickets(normalized, current, open);
    })().finally(() => {
      entry.refreshInFlight = null;
    });

    return entry.refreshInFlight;
  }

  private fetchSnapshot(repo: string, entry: RepositoryEntry): Promise<MapSnapshot> {
    if (entry.inFlight !== null) return entry.inFlight;
    const startedAt = this.now().toISOString();
    const choiceRevision = entry.choiceRevision ?? 0;

    // Tickets read last time let the idle rule see a map's tickets without reading them again.
    const knownTickets = new Map(
      (entry.snapshot?.maps ?? []).filter((map) => map.ticketsLoaded).map((map) => [map.number, map.tickets.map((ticket) => ticket.number)]),
    );
    let persistedScope: string | null = null;
    const list = (choices: SettleChoices, viewer: Viewer | null): Promise<FetchResult> => {
      const read = (): Promise<FetchResult> => this.fetcher({ repo, mapLabel: this.options.mapLabel, typePrefix: this.options.typePrefix, choices, knownTickets, now: this.now(), viewer });
      if (this.options.persistence === undefined) return read();
      return Promise.resolve(this.options.identity?.()).then((identity) => {
        if (identity != null) persistedScope = JSON.stringify([identity, this.options.mapLabel, this.options.typePrefix, choices, viewer]);
        return read();
      });
    };
    const { choices, viewer } = this.options;
    entry.inFlight = (
      choices === undefined && viewer === undefined
        ? list({}, null)
        : Promise.all([choices?.(repo) ?? {}, viewer?.(repo) ?? null]).then(([forRepo, who]) => list(forRepo, who))
    )
      .then(({ maps, hiddenMaps, publicMaps, warnings }) => {
        this.requireCurrent(repo, entry);
        const choicesChanged = (entry.choiceRevision ?? 0) !== choiceRevision;
        if (choicesChanged) maps = maps.map((map) => entry.settleOverrides?.has(map.number) ? { ...map, settled: entry.settleOverrides.get(map.number) ?? null } : map);
        const snapshot = { repo, fetchedAt: startedAt, maps, hiddenMaps: hiddenMaps ?? 0, publicMaps: publicMaps ?? [], warnings };
        entry.snapshot = snapshot;
        entry.restored = false;
        entry.persistedScope = choicesChanged ? null : persistedScope;
        if (this.options.persistence !== undefined && persistedScope !== null && !choicesChanged) {
          void this.options.persistence.save(snapshot, persistedScope).catch(() => undefined);
        }
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
    const entry = this.entries.get(repo);
    const { maps, warnings } = await this.detailer(
      { repo, mapLabel: this.options.mapLabel, typePrefix: this.options.typePrefix },
      unread,
    );
    const read = new Map(maps.map((map) => [map.number, map]));
    if (entry === undefined || this.entries.get(repo) !== entry) throw new Error('Repository cache changed while reading ticket details. Please retry.');
    const current = entry.snapshot ?? snapshot;
    const next = {
      ...current,
      maps: current.maps.map((map) => {
        const details = read.get(map.number);
        if (details === undefined || map.ticketsLoaded) return map;
        // A settle choice can arrive while tickets are being read.
        // Only merge ticket details, leaving the current map issue and settlement intact.
        return { ...map, tickets: details.tickets, outside: details.outside, criticalPath: details.criticalPath, ticketsLoaded: details.ticketsLoaded };
      }),
      warnings: [...current.warnings, ...warnings],
    };
    entry.snapshot = next;
    if (this.options.persistence !== undefined && entry.persistedScope != null) void this.options.persistence.save(next, entry.persistedScope).catch(() => undefined);
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
