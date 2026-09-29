import { gh, ghIncludingHeaders, ghProblem, RATE_LIMIT_WARNING } from './github.js';
import { branchCommitsByTicket, diffMap, needsPullRequests, nextPollDelay, parseHttpResponse, pullRequestsByTicket, rateLimitOf, watchedTickets } from './mapWatch.js';
import type { MapEvent, RateLimit, WatchedPullRequest, WatchedTicket } from './mapWatch.js';
import type { TicketActivity } from './stalled.js';

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

interface WatchedMap {
  repo: string;
  mapNumber: number;
  etag: string | null;
  tickets: WatchedTicket[] | null;
  history: MapEvent[];
  listeners: Set<MapEventListener>;
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
}

/**
 * Re-reads the maps someone is watching and tells them what changed. A map is polled only
 * while it has a listener; its last read and a short history stay, so a page that comes
 * back picks up where it left off.
 */
export class MapWatcher {
  private readonly maps = new Map<string, WatchedMap>();
  private readonly rateLimits = new Map<string, RateLimit>();
  private readonly pullRequestReads = new Map<string, { at: number; read: Promise<PullRequestRead> }>();
  private readonly intervalMs: number;
  private readonly now: () => number;
  private readonly tracked: TrackedPullRequests | null;
  private nextId = 1;
  private closed = false;

  constructor(
    private readonly reader: MapWatchReader = githubMapWatchReader,
    options: { intervalMs?: number; now?: () => number; trackedPullRequests?: TrackedPullRequests } = {},
  ) {
    this.intervalMs = options.intervalMs ?? WATCH_INTERVAL_MS;
    this.now = options.now ?? Date.now;
    this.tracked = options.trackedPullRequests ?? null;
  }

  /** Start watching a map for `listener`. Returns the call that stops it. */
  watch(repo: string, mapNumber: number, listener: MapEventListener): () => void {
    if (this.closed) return () => undefined;
    const map = this.entry(repo, mapNumber);
    map.listeners.add(listener);
    if (map.timer === null && !map.polling) this.schedule(map, 0);
    return () => {
      map.listeners.delete(listener);
      if (map.listeners.size === 0 && map.timer !== null) {
        clearTimeout(map.timer);
        map.timer = null;
      }
    };
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
      map = { repo, mapNumber, etag: null, tickets: null, history: [], listeners: new Set(), timer: null, dueAt: 0, polledAt: Number.NEGATIVE_INFINITY, nudged: false, polling: false, failures: 0, pollIntervalSeconds: null, pullRequestsRead: new Set() };
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
      void this.poll(map).then((delay) => {
        map.polling = false;
        const nudged = map.nudged && map.failures === 0;
        map.nudged = false;
        this.schedule(map, nudged ? Math.min(delay, Math.max(0, map.polledAt + NUDGE_GAP_MS - this.now())) : delay);
      });
    }, delayMs);
    map.timer.unref();
  }

  /** Read the map if the budget allows, and say how long to wait before the next read. */
  private async poll(map: WatchedMap): Promise<number> {
    // The budget is per account, so a low one found by any map holds every map back.
    const wait = nextPollDelay({ intervalMs: 0, now: this.now(), rateLimits: [...this.rateLimits.values()], failures: 0 });
    if (wait > 0) return wait;
    try {
      await this.read(map);
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

  private async read(map: WatchedMap): Promise<void> {
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
    if (previous === null || this.closed) return;
    const at = new Date(this.now()).toISOString();
    for (const change of diffMap(previous, tickets)) {
      const event: MapEvent = { ...change, id: this.nextId++, repo: map.repo, mapNumber: map.mapNumber, at };
      map.history = [...map.history, event].slice(-HISTORY_SIZE);
      for (const listener of map.listeners) listener(event);
    }
  }

  /** One read per repository per half interval, shared by every map in it. */
  private pullRequests(repo: string): Promise<PullRequestRead> {
    const cached = this.pullRequestReads.get(repo);
    if (cached !== undefined && this.now() - cached.at < this.intervalMs / 2) return cached.read;
    const read = this.reader.readPullRequests(repo).then((result) => {
      this.noteRateLimit(result.rateLimit);
      return result;
    });
    this.pullRequestReads.set(repo, { at: this.now(), read });
    read.catch(() => this.pullRequestReads.delete(repo));
    return read;
  }

  private noteRateLimit(rateLimit: RateLimit | null): void {
    if (rateLimit !== null) this.rateLimits.set(rateLimit.resource, rateLimit);
  }
}

function key(repo: string, mapNumber: number): string {
  return `${repo.toLowerCase()}#${String(mapNumber)}`;
}

const PULL_REQUESTS_QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: 50, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes { number url state headRefName reviewDecision commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } }
    }
    refs(refPrefix: "refs/heads/wayfinder/", first: 100) { nodes { name target { ... on Commit { committedDate } } } }
  }
  rateLimit { limit remaining resetAt }
}`;

/** The reads #122 recommends: a conditional `sub_issues` request, and one GraphQL query per repository for pull requests. */
export const githubMapWatchReader: MapWatchReader = {
  async readMap(repo, mapNumber, etag) {
    const args = ['api', '-i', `repos/${repo}/issues/${String(mapNumber)}/sub_issues?per_page=100`];
    if (etag !== null) args.push('-H', `If-None-Match: ${etag}`);
    const response = parseHttpResponse(await ghIncludingHeaders(args));
    if (response === null) throw new Error(`GitHub gave no answer for map #${String(mapNumber)}.`);
    const rateLimit = rateLimitOf(response.headers);
    const pollInterval = Number(response.headers['x-poll-interval']);
    const pollIntervalSeconds = Number.isFinite(pollInterval) && pollInterval > 0 ? pollInterval : null;
    if (response.status === 304) return { status: 'unchanged', rateLimit, pollIntervalSeconds };
    if (response.status !== 200) {
      const remaining = rateLimit?.remaining;
      throw new Error(remaining === 0 ? RATE_LIMIT_WARNING : `GitHub answered ${String(response.status)} for map #${String(mapNumber)}.`);
    }
    return { status: 'changed', etag: response.headers['etag'] ?? null, tickets: watchedTickets(JSON.parse(response.body)), rateLimit, pollIntervalSeconds };
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
