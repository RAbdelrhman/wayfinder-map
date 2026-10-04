import { gh, ghIncludingHeaders, ghProblem, RATE_LIMIT_WARNING } from './github.js';
import { branchCommitsByTicket, diffMap, needsPullRequests, nextPollDelay, parseHttpResponse, pullRequestsByTicket, rateLimitOf, watchedTickets, withGithubDetail } from './mapWatch.js';
import type { MapEvent, RateLimit, WatchedPullRequest, WatchedTicket } from './mapWatch.js';
import type { MapWatchStateStore, StoredMapWatch } from './mapWatchStore.js';
import type { TicketActivity } from './stalled.js';
import type { TicketState } from './types.js';
import { parseChildNumbers } from './mapBody.js';

/** #122's interval: a `304` is free, and list responses are cached for 60 s anyway. */
export const WATCH_INTERVAL_MS = 2 * 60 * 1000;
const HISTORY_SIZE = 50;
/** The closest two reads of one map get when T3 Code keeps nudging it. */
export const NUDGE_GAP_MS = 10 * 1000;

export type MapRead =
  | { status: 'unchanged'; rateLimit: RateLimit | null; pollIntervalSeconds: number | null }
  | { status: 'changed'; etag: string | null; tickets: WatchedTicket[]; rateLimit: RateLimit | null; pollIntervalSeconds: number | null };

export interface PullRequestRead {
  byTicket: Map<number, WatchedPullRequest[]>;
  /** The newest commit on each ticket's `wayfinder/<n>-…` branch, for stall detection (#160). */
  lastCommits: Map<number, string>;
  rateLimit: RateLimit | null;
}

/** Where the watcher's GitHub reads come from. Tests replace it. */
export interface MapWatchReader {
  /** The map's tickets, or `unchanged` when GitHub answers the ETag with a `304`. */
  readMap: (repo: string, mapNumber: number, etag: string | null) => Promise<MapRead>;
  /** Every recent pull request in the repository, keyed by the ticket its branch names. */
  readPullRequests: (repo: string) => Promise<PullRequestRead>;
}

/**
 * PRs T3 Code already tracks, keyed by ticket, for tickets with a hand-off (#135). They cost no
 * GitHub call, so the watcher reads GitHub only for the tickets this leaves out.
 */
export type TrackedPullRequests = (repo: string) => Promise<Map<number, WatchedPullRequest[]>>;

export type MapEventListener = (event: MapEvent) => void;
export type MapWatchStopListener = () => void;

interface WatchedMap {
  repo: string;
  mapNumber: number;
  etag: string | null;
  tickets: WatchedTicket[] | null;
  history: MapEvent[];
  listeners: Map<MapEventListener, MapWatchStopListener | null>;
  timer: NodeJS.Timeout | null;
  /** When `timer` fires, in `now()` milliseconds. */
  dueAt: number;
  /** When the last read started, in `now()` milliseconds. */
  polledAt: number;
  /** A nudge arrived during a read, so the next read comes early. */
  nudged: boolean;
  /** A read is in flight. It schedules the next one itself. */
  polling: boolean;
  failures: number;
  pollIntervalSeconds: number | null;
  /** Tickets whose pull requests have been read. Each ticket's first read is a baseline, not news. */
  pullRequestsRead: Set<number>;
  /** A restored map gets one startup read against its saved ticket snapshot. */
  needsCatchUp: boolean;
}

/**
 * Re-reads maps the user has opened and tells the page what changed. A map is polled only
 * while a page is connected; its last read and short history survive a full app restart.
 */
export class MapWatcher {
  private readonly maps = new Map<string, WatchedMap>();
  private readonly rateLimits = new Map<string, RateLimit>();
  private readonly pullRequestReads = new Map<string, { at: number; read: Promise<PullRequestRead> }>();
  private readonly pullRequestResults = new Map<string, { at: number; result: PullRequestRead }>();
  private readonly intervalMs: number;
  private readonly now: () => number;
  private readonly tracked: TrackedPullRequests | null;
  private readonly stateStore: MapWatchStateStore | null;
  private persistTail: Promise<void> = Promise.resolve();
  private nextId = 1;
  private closed = false;
  private restored = false;

  constructor(
    private readonly reader: MapWatchReader = githubMapWatchReader,
    options: { intervalMs?: number; now?: () => number; trackedPullRequests?: TrackedPullRequests; stateStore?: MapWatchStateStore } = {},
  ) {
    this.intervalMs = options.intervalMs ?? WATCH_INTERVAL_MS;
    this.now = options.now ?? Date.now;
    this.tracked = options.trackedPullRequests ?? null;
    this.stateStore = options.stateStore ?? null;
  }

  /** Restore the last saved watch set before the server begins accepting event streams. */
  async restore(): Promise<void> {
    if (this.restored) return;
    this.restored = true;
    const state = await this.stateStore?.load().catch(() => null);
    if (state === null || state === undefined) return;
    this.nextId = Math.max(state.nextEventId, ...state.maps.flatMap((map) => map.history.map((event) => event.id + 1)));
    for (const stored of state.maps) {
      const map = this.fromStored(stored);
      this.maps.set(key(map.repo, map.mapNumber), map);
    }
  }

  /** One conditional read per restored map; subsequent reads need a connected page. */
  async catchUp(repo?: string): Promise<void> {
    const normalizedRepo = repo?.toLowerCase();
    for (const map of this.maps.values()) {
      if (!map.needsCatchUp || map.polling || (normalizedRepo !== undefined && map.repo.toLowerCase() !== normalizedRepo)) continue;
      if (map.timer !== null) clearTimeout(map.timer);
      map.timer = null;
      map.polling = true;
      map.polledAt = this.now();
      const delay = await this.poll(map, true);
      map.polling = false;
      if (map.listeners.size > 0) this.schedule(map, delay);
    }
  }

  /** Start watching a map for `listener`. Returns the call that stops this listener. */
  watch(repo: string, mapNumber: number, listener: MapEventListener, onStop?: MapWatchStopListener): () => void {
    if (this.closed) return () => undefined;
    const map = this.entry(repo, mapNumber);
    map.listeners.set(listener, onStop ?? null);
    if (map.timer === null && !map.polling && !map.needsCatchUp) {
      this.schedule(map, map.tickets === null ? 0 : Math.max(0, map.polledAt + this.intervalMs - this.now()));
    }
    return () => {
      map.listeners.delete(listener);
      if (map.listeners.size === 0 && map.timer !== null) {
        clearTimeout(map.timer);
        map.timer = null;
      }
    };
  }

  /** Stop a settled or closed map, including its persisted baseline and any open event streams. */
  stop(repo: string, mapNumber: number): void {
    const id = key(repo, mapNumber);
    const map = this.maps.get(id);
    if (map === undefined) return;
    if (map.timer !== null) clearTimeout(map.timer);
    map.timer = null;
    this.maps.delete(id);
    for (const onStop of map.listeners.values()) onStop?.();
    map.listeners.clear();
    void this.persist();
  }

  /** Drop watches not present in the repository's latest open, unsettled snapshot. */
  reconcile(repo: string, activeMaps: ReadonlySet<number>): void {
    for (const map of this.maps.values()) {
      if (map.repo.toLowerCase() === repo.toLowerCase() && !activeMaps.has(map.mapNumber)) this.stop(repo, map.mapNumber);
    }
  }

  /**
   * Read a watched map soon instead of at its next interval: T3 Code saw one of its threads
   * change. Reads stay `NUDGE_GAP_MS` apart, and a map backing off after failures waits.
   */
  nudge(repo: string, mapNumber: number): void {
    const map = this.maps.get(key(repo, mapNumber));
    if (this.closed || map === undefined || map.listeners.size === 0 || map.failures > 0) return;
    if (map.polling) {
      map.nudged = true;
      return;
    }
    const delay = Math.max(0, map.polledAt + NUDGE_GAP_MS - this.now());
    if (map.timer !== null) {
      if (map.dueAt <= this.now() + delay) return;
      clearTimeout(map.timer);
    }
    this.schedule(map, delay);
  }

  /**
   * Each ticket's pull requests and newest branch commit, from the same repository read the
   * watcher polls with, so asking costs at most one GraphQL call per half interval.
   */
  async activity(repo: string): Promise<Map<number, TicketActivity>> {
    const read = await this.pullRequests(repo);
    const activity = new Map<number, TicketActivity>();
    for (const number of new Set([...read.byTicket.keys(), ...read.lastCommits.keys()])) {
      activity.set(number, { pullRequest: (read.byTicket.get(number) ?? []).length > 0, lastCommitAt: read.lastCommits.get(number) ?? null });
    }
    return activity;
  }

  /**
   * Each ticket's pull requests for the page (#130): T3 Code's snapshots first, then the shared
   * repository read, which runs only when a ticket T3 Code has no snapshot for is claimed.
   */
  async ticketPullRequests(repo: string, tickets: ReadonlyArray<{ number: number; state: TicketState }>): Promise<Map<number, WatchedPullRequest[]>> {
    const tracked = (await this.tracked?.(repo).catch(() => null)) ?? new Map<number, WatchedPullRequest[]>();
    // T3 Code's snapshot has no check counts or reviewer, so those come from the shared read, but only when it is already fresh.
    if (!tickets.some((ticket) => ticket.state === 'claimed' && !tracked.has(ticket.number))) {
      return withGithubDetail(tracked, this.freshPullRequests(repo)?.byTicket);
    }
    const github = await this.pullRequests(repo).catch(() => null);
    return new Map([...(github?.byTicket ?? []), ...withGithubDetail(tracked, github?.byTicket)]);
  }

  /** The map's recent events, oldest first, after `afterId` when given. */
  history(repo: string, mapNumber: number, afterId = 0): MapEvent[] {
    return (this.maps.get(key(repo, mapNumber))?.history ?? []).filter((event) => event.id > afterId);
  }

  close(): void {
    this.closed = true;
    for (const map of this.maps.values()) {
      if (map.timer !== null) clearTimeout(map.timer);
      map.timer = null;
      map.listeners.clear();
    }
  }

  private entry(repo: string, mapNumber: number): WatchedMap {
    const id = key(repo, mapNumber);
    let map = this.maps.get(id);
    if (map === undefined) {
      map = { repo, mapNumber, etag: null, tickets: null, history: [], listeners: new Map(), timer: null, dueAt: 0, polledAt: Number.NEGATIVE_INFINITY, nudged: false, polling: false, failures: 0, pollIntervalSeconds: null, pullRequestsRead: new Set(), needsCatchUp: false };
      this.maps.set(id, map);
    }
    return map;
  }

  private schedule(map: WatchedMap, delayMs: number): void {
    if (this.closed || map.listeners.size === 0) return;
    map.dueAt = this.now() + delayMs;
    map.timer = setTimeout(() => {
      map.timer = null;
      map.polling = true;
      map.nudged = false;
      map.polledAt = this.now();
      void this.poll(map, map.needsCatchUp).then((delay) => {
        map.polling = false;
        const nudged = map.nudged && map.failures === 0;
        map.nudged = false;
        this.schedule(map, nudged ? Math.min(delay, Math.max(0, map.polledAt + NUDGE_GAP_MS - this.now())) : delay);
      });
    }, delayMs);
    map.timer.unref();
  }

  /** Read the map if the budget allows, and say how long to wait before the next read. */
  private async poll(map: WatchedMap, whileYouWereAway = false): Promise<number> {
    // The budget is per account, so a low one found by any map holds every map back.
    const wait = nextPollDelay({ intervalMs: 0, now: this.now(), rateLimits: [...this.rateLimits.values()], failures: 0 });
    if (wait > 0) return wait;
    try {
      await this.read(map, whileYouWereAway);
      map.failures = 0;
    } catch (error) {
      map.failures += 1;
      // gh sometimes reports the limit only in words, without the headers to wait on.
      if (ghProblem(error) === RATE_LIMIT_WARNING) map.failures = Math.max(map.failures, 3);
    }
    return nextPollDelay({
      intervalMs: this.intervalMs,
      now: this.now(),
      rateLimits: [...this.rateLimits.values()],
      failures: map.failures,
      pollIntervalSeconds: map.pollIntervalSeconds,
    });
  }

  private async read(map: WatchedMap, whileYouWereAway = false): Promise<void> {
    const read = await this.reader.readMap(map.repo, map.mapNumber, map.tickets === null ? null : map.etag);
    this.noteRateLimit(read.rateLimit);
    map.pollIntervalSeconds = read.pollIntervalSeconds;
    let previous = map.tickets;
    let tickets: WatchedTicket[];
    if (read.status === 'changed') {
      map.etag = read.etag;
      const pullRequestsBefore = new Map((previous ?? []).map((ticket) => [ticket.number, ticket.pullRequests]));
      tickets = read.tickets.map((ticket) => ({ ...ticket, pullRequests: pullRequestsBefore.get(ticket.number) ?? [] }));
    } else {
      tickets = previous ?? [];
    }
    // A pull request doesn't change the map's ETag, so this runs even after a `304`. T3 Code costs
    // nothing, so it is read even for a frontier ticket just handed off; GitHub only when needed.
    const tracked = (await this.tracked?.(map.repo).catch(() => null)) ?? new Map<number, WatchedPullRequest[]>();
    if (tracked.size > 0 || needsPullRequests(tickets)) {
      const untracked = tickets.filter((ticket) => !tracked.has(ticket.number));
      const github = needsPullRequests(untracked) ? await this.pullRequests(map.repo).catch(() => null) : null;
      const read = new Map<number, WatchedPullRequest[]>();
      for (const ticket of tickets) {
        const found = tracked.get(ticket.number) ?? (github === null ? undefined : (github.byTicket.get(ticket.number) ?? ticket.pullRequests));
        if (found !== undefined) read.set(ticket.number, found);
      }
      const withPullRequests = (ticket: WatchedTicket): WatchedTicket => ({ ...ticket, pullRequests: read.get(ticket.number) ?? ticket.pullRequests });
      tickets = tickets.map(withPullRequests);
      // Without this, every PR merged before watching began would arrive as just merged.
      previous = previous?.map((ticket) => (map.pullRequestsRead.has(ticket.number) ? ticket : withPullRequests(ticket))) ?? null;
      for (const number of read.keys()) map.pullRequestsRead.add(number);
    }
    map.tickets = tickets;
    map.needsCatchUp = false;
    if (previous !== null && !this.closed) {
      const at = new Date(this.now()).toISOString();
      for (const change of diffMap(previous, tickets)) {
        const event: MapEvent = { ...change, id: this.nextId++, repo: map.repo, mapNumber: map.mapNumber, at, ...(whileYouWereAway ? { whileYouWereAway: true } : {}) };
        map.history = [...map.history, event].slice(-HISTORY_SIZE);
        for (const listener of map.listeners.keys()) listener(event);
      }
    }
    await this.persist();
  }

  /** One read per repository per half interval, shared by every map in it. */
  private pullRequests(repo: string): Promise<PullRequestRead> {
    const cached = this.pullRequestReads.get(repo);
    if (cached !== undefined && this.now() - cached.at < this.intervalMs / 2) return cached.read;
    const at = this.now();
    const read = this.reader.readPullRequests(repo).then((result) => {
      this.noteRateLimit(result.rateLimit);
      this.pullRequestResults.set(repo, { at, result });
      return result;
    });
    this.pullRequestReads.set(repo, { at, read });
    read.catch(() => this.pullRequestReads.delete(repo));
    return read;
  }

  /** The shared read if one finished within its sharing window. Never makes a GitHub call. */
  private freshPullRequests(repo: string): PullRequestRead | null {
    const done = this.pullRequestResults.get(repo);
    return done !== undefined && this.now() - done.at < this.intervalMs / 2 ? done.result : null;
  }

  private noteRateLimit(rateLimit: RateLimit | null): void {
    if (rateLimit !== null) this.rateLimits.set(rateLimit.resource, rateLimit);
  }

  private fromStored(stored: StoredMapWatch): WatchedMap {
    return {
      repo: stored.repo,
      mapNumber: stored.mapNumber,
      etag: stored.etag,
      tickets: stored.tickets,
      history: stored.history,
      listeners: new Map(),
      timer: null,
      dueAt: 0,
      polledAt: stored.lastPolledAt,
      nudged: false,
      polling: false,
      failures: 0,
      pollIntervalSeconds: null,
      pullRequestsRead: new Set(stored.pullRequestsRead),
      needsCatchUp: true,
    };
  }

  private persist(): Promise<void> {
    if (this.stateStore === null) return Promise.resolve();
    const state = {
      nextEventId: this.nextId,
      maps: [...this.maps.values()].flatMap((map) => map.tickets === null ? [] : [{
        repo: map.repo,
        mapNumber: map.mapNumber,
        etag: map.etag,
        tickets: map.tickets,
        history: map.history,
        pullRequestsRead: [...map.pullRequestsRead],
        lastPolledAt: map.polledAt,
      }]),
    };
    const save = this.persistTail.then(() => this.stateStore?.save(state));
    this.persistTail = save.then(() => undefined, () => undefined);
    return this.persistTail;
  }
}

function key(repo: string, mapNumber: number): string {
  return `${repo.toLowerCase()}#${String(mapNumber)}`;
}

const PULL_REQUESTS_QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: 50, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes {
        number url state headRefName isDraft reviewDecision
        latestReviews(first: 5) { nodes { state author { login } } }
        reviewRequests(first: 3) { nodes { requestedReviewer { ... on User { login } ... on Team { slug } } } }
        commits(last: 1) { nodes { commit { statusCheckRollup { state contexts(first: 0) { checkRunCountsByState { state count } statusContextCountsByState { state count } } } } } }
      }
    }
    refs(refPrefix: "refs/heads/wayfinder/", first: 100) { nodes { name target { ... on Commit { committedDate } } } }
  }
  rateLimit { limit remaining resetAt }
}`;

interface CachedWatchResource {
  value: unknown;
  etag: string | null;
  next: boolean;
}

interface CachedWatchRead {
  token: string;
  parent: CachedWatchResource;
  pages: Map<number, CachedWatchResource>;
  bodyIssues: Map<number, CachedWatchResource>;
}

/** Every membership resource has its own conditional read, so later pages and body-only tickets can change independently. */
export function createGithubMapWatchReader(runApi: (args: string[]) => Promise<string> = ghIncludingHeaders): MapWatchReader {
  const cachedMaps = new Map<string, CachedWatchRead>();
  return {
    async readMap(repo, mapNumber, etag) {
      const id = key(repo, mapNumber);
      const known = cachedMaps.get(id);
      // A restored watcher has no reader cache. Build its complete baseline instead of accepting a partial 304.
      const previous = etag !== null && known?.token === etag ? known : undefined;
      let changed = previous === undefined;
      let rateLimit: RateLimit | null = null;
      let pollIntervalSeconds: number | null = null;
      const read = async (route: string, cached?: CachedWatchResource, page?: number): Promise<CachedWatchResource> => {
        const args = ['api', '-i', '-X', 'GET'];
        if (cached?.etag !== null && cached?.etag !== undefined) args.push('-H', `If-None-Match: ${cached.etag}`);
        if (page !== undefined) args.push('-F', 'per_page=100', '-F', `page=${String(page)}`);
        args.push(route);
        const response = parseHttpResponse(await runApi(args));
        if (response === null) throw new Error(`GitHub gave no answer for map #${String(mapNumber)}.`);
        rateLimit = rateLimitOf(response.headers) ?? rateLimit;
        const interval = Number(response.headers['x-poll-interval']);
        if (Number.isFinite(interval) && interval > 0) pollIntervalSeconds = Math.max(pollIntervalSeconds ?? 0, interval);
        if (response.status === 304 && cached !== undefined) return cached;
        // A missing native endpoint still permits body membership, as the visible map loader does.
        if (response.status === 404 && page !== undefined && rateLimit?.remaining !== 0) {
          changed = true;
          return { value: [], etag: null, next: false };
        }
        if (response.status !== 200) throw new Error(rateLimit?.remaining === 0 ? RATE_LIMIT_WARNING : `GitHub answered ${String(response.status)} for map #${String(mapNumber)}.`);
        changed = true;
        const value: unknown = JSON.parse(response.body);
        if (page !== undefined ? !Array.isArray(value) : typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('GitHub returned invalid map membership.');
        return {
          value,
          etag: response.headers['etag'] ?? null,
          next: /;\s*rel="?next"?(?:,|\s|$)/i.test(response.headers['link'] ?? '') || (page !== undefined && Array.isArray(value) && value.length === 100),
        };
      };
      const parent = await read(`repos/${repo}/issues/${String(mapNumber)}`, previous?.parent);
      const pages = new Map<number, CachedWatchResource>();
      const native: unknown[] = [];
      for (let page = 1; ; page += 1) {
        const resource = await read(`repos/${repo}/issues/${String(mapNumber)}/sub_issues`, previous?.pages.get(page), page);
        pages.set(page, resource);
        native.push(...resource.value as unknown[]);
        if (!resource.next) break;
      }
      const nativeTickets = watchedTickets(native);
      const attached = new Set(nativeTickets.map((ticket) => ticket.number));
      const body = (parent.value as Record<string, unknown>)['body'];
      const bodyIssues = new Map<number, CachedWatchResource>();
      for (const number of parseChildNumbers(typeof body === 'string' ? body : '', repo)) {
        if (number === mapNumber || attached.has(number)) continue;
        bodyIssues.set(number, await read(`repos/${repo}/issues/${String(number)}`, previous?.bodyIssues.get(number)));
      }
      const token = JSON.stringify([parent.etag, [...pages].map(([page, resource]) => [page, resource.etag]), [...bodyIssues].map(([number, resource]) => [number, resource.etag])]);
      cachedMaps.delete(id);
      cachedMaps.set(id, { token, parent, pages, bodyIssues });
      // Eviction changes only the next baseline's cost; it never returns incomplete membership.
      if (cachedMaps.size > 100) cachedMaps.delete(cachedMaps.keys().next().value ?? '');
      return changed
        ? { status: 'changed', etag: token, tickets: [...nativeTickets, ...watchedTickets([...bodyIssues.values()].map((resource) => resource.value))], rateLimit, pollIntervalSeconds }
        : { status: 'unchanged', rateLimit, pollIntervalSeconds };
    },
    async readPullRequests(repo) {
      const [owner = '', name = ''] = repo.split('/', 2);
      const result = JSON.parse(
        await gh(['api', 'graphql', '-f', `query=${PULL_REQUESTS_QUERY}`, '-f', `owner=${owner}`, '-f', `name=${name}`]),
      ) as { data?: { repository?: { pullRequests?: { nodes?: unknown }; refs?: { nodes?: unknown } }; rateLimit?: { limit?: number; remaining?: number; resetAt?: string } } };
      const budget = result.data?.rateLimit;
      const resetAt = budget?.resetAt === undefined ? Number.NaN : Date.parse(budget.resetAt);
      return {
        byTicket: pullRequestsByTicket(result.data?.repository?.pullRequests?.nodes),
        lastCommits: branchCommitsByTicket(result.data?.repository?.refs?.nodes),
        rateLimit:
          typeof budget?.limit === 'number' && typeof budget.remaining === 'number' && Number.isFinite(resetAt)
            ? { resource: 'graphql', limit: budget.limit, remaining: budget.remaining, resetAt }
            : null,
      };
    },
  };
}

export const githubMapWatchReader: MapWatchReader = createGithubMapWatchReader();
