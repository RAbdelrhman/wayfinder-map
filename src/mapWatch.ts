import { ticketStateOf } from './github.js';
import type { CheckCounts, ChecksState, MapSnapshot, PullRequestState, ReviewState, TicketPullRequest, TicketState } from './types.js';

export type { ChecksState, ReviewState };

/**
 * The pure half of map watching: what one read of a map looks like, what changed between
 * two reads, and how long to wait before the next one. `mapWatcher.ts` does the reading.
 * See docs/design/map-watching.md for why the reads are shaped this way.
 */

export type WatchedPullRequest = PullRequestState;

export interface WatchedTicket {
  number: number;
  title: string;
  state: TicketState;
  pullRequests: WatchedPullRequest[];
}

export type MapChange = { ticket: { number: number; title: string } } & (
  | { type: 'ticket-closed' }
  /** Open, unblocked and unassigned: the frontier, which the UI calls next. */
  | { type: 'ticket-next'; from: TicketState }
  | { type: 'pr-opened'; pullRequest: WatchedPullRequest }
  | { type: 'pr-merged'; pullRequest: WatchedPullRequest }
  | { type: 'ci-changed'; pullRequest: WatchedPullRequest; from: ChecksState | null; to: ChecksState | null }
  | { type: 'review-changed'; pullRequest: WatchedPullRequest; from: ReviewState | null; to: ReviewState | null }
);

export type MapEventType = MapChange['type'];

/** A change on a watched map, as the server sends it to the page. */
export type MapEvent = MapChange & { id: number; repo: string; mapNumber: number; at: string };

/** Everything that changed on a map between two reads, ticket changes before pull request changes. */
export function diffMap(previous: readonly WatchedTicket[], next: readonly WatchedTicket[]): MapChange[] {
  const before = new Map(previous.map((ticket) => [ticket.number, ticket]));
  const changes: MapChange[] = [];
  const pullRequestChanges: MapChange[] = [];
  for (const ticket of next) {
    const old = before.get(ticket.number);
    // A ticket that just joined the map has nothing to compare with.
    if (old === undefined) continue;
    const ref = { number: ticket.number, title: ticket.title };
    if (old.state !== 'done' && ticket.state === 'done') changes.push({ type: 'ticket-closed', ticket: ref });
    if (old.state !== 'done' && old.state !== 'frontier' && ticket.state === 'frontier') {
      changes.push({ type: 'ticket-next', ticket: ref, from: old.state });
    }
    const oldPullRequests = new Map(old.pullRequests.map((pullRequest) => [pullRequest.number, pullRequest]));
    for (const pullRequest of ticket.pullRequests) {
      const was = oldPullRequests.get(pullRequest.number);
      if (was === undefined) {
        if (pullRequest.state === 'open') pullRequestChanges.push({ type: 'pr-opened', ticket: ref, pullRequest });
        if (pullRequest.state === 'merged') pullRequestChanges.push({ type: 'pr-merged', ticket: ref, pullRequest });
        continue;
      }
      if (was.state !== 'merged' && pullRequest.state === 'merged') pullRequestChanges.push({ type: 'pr-merged', ticket: ref, pullRequest });
      if (was.checks !== pullRequest.checks) {
        pullRequestChanges.push({ type: 'ci-changed', ticket: ref, pullRequest, from: was.checks, to: pullRequest.checks });
      }
      if (was.review !== pullRequest.review) {
        pullRequestChanges.push({ type: 'review-changed', ticket: ref, pullRequest, from: was.review, to: pullRequest.review });
      }
    }
  }
  return [...changes, ...pullRequestChanges];
}

interface RawSubIssue {
  number?: unknown;
  title?: unknown;
  state?: unknown;
  assignee?: { login?: unknown } | null;
  assignees?: Array<{ login?: unknown }> | null;
  issue_dependencies_summary?: { blocked_by?: unknown } | null;
}

/**
 * A map's tickets from one `sub_issues` read. The summary's `blocked_by` counts open
 * blockers only, so it is enough to tell blocked from next without another request.
 */
export function watchedTickets(subIssues: unknown): WatchedTicket[] {
  if (!Array.isArray(subIssues)) return [];
  return (subIssues as RawSubIssue[]).flatMap((raw) => {
    if (typeof raw.number !== 'number' || typeof raw.title !== 'string') return [];
    const open = raw.state !== 'closed';
    const login = raw.assignee?.login ?? raw.assignees?.[0]?.login;
    const assignee = typeof login === 'string' ? login : null;
    const blockedBy = raw.issue_dependencies_summary?.blocked_by;
    const openBlockers = typeof blockedBy === 'number' && blockedBy > 0 ? [0] : [];
    return [{ number: raw.number, title: raw.title, state: ticketStateOf(open, openBlockers, assignee), pullRequests: [] }];
  });
}

/** Whether a read has any use for pull request state: something is being worked on, or has a PR still open. */
export function needsPullRequests(tickets: readonly WatchedTicket[]): boolean {
  return tickets.some(
    (ticket) => ticket.state === 'claimed' || ticket.pullRequests.some((pullRequest) => pullRequest.state === 'open'),
  );
}

/** The ticket a `wayfinder/<n>-<slug>` branch was made for, or null. */
export function branchTicket(branch: string): number | null {
  const match = /^wayfinder\/(\d+)-/.exec(branch);
  return match?.[1] === undefined ? null : Number(match[1]);
}

interface RawPullRequestNode {
  number?: unknown;
  url?: unknown;
  state?: unknown;
  headRefName?: unknown;
  isDraft?: unknown;
  reviewDecision?: unknown;
  latestReviews?: { nodes?: Array<{ state?: unknown; author?: { login?: unknown } | null } | null> | null } | null;
  reviewRequests?: { nodes?: Array<{ requestedReviewer?: { login?: unknown; slug?: unknown } | null } | null> | null } | null;
  commits?: { nodes?: Array<{ commit?: { statusCheckRollup?: RawRollup | null } | null } | null> | null } | null;
}

interface RawRollup {
  state?: unknown;
  contexts?: { checkRunCountsByState?: RawCount[] | null; statusContextCountsByState?: RawCount[] | null } | null;
}

type RawCount = { state?: unknown; count?: unknown } | null;

const PASSED = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED', 'COMPLETED']);
const FAILED = new Set(['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'STALE']);

/** Check runs and commit statuses together, by outcome. Null when GitHub reported none. */
export function checkCounts(rollup: RawRollup | null | undefined): CheckCounts | null {
  const counts: CheckCounts = { passed: 0, failed: 0, pending: 0 };
  const all = [...(rollup?.contexts?.checkRunCountsByState ?? []), ...(rollup?.contexts?.statusContextCountsByState ?? [])];
  for (const item of all) {
    if (typeof item?.state !== 'string' || typeof item.count !== 'number' || item.count <= 0) continue;
    counts[PASSED.has(item.state) ? 'passed' : FAILED.has(item.state) ? 'failed' : 'pending'] += item.count;
  }
  return counts.passed + counts.failed + counts.pending === 0 ? null : counts;
}

/** Who stands behind the review decision: the latest reviewer who made it, or else the first one asked. */
function reviewerOf(node: RawPullRequestNode, review: ReviewState | null): string | null {
  const decided = review === 'approved' ? 'APPROVED' : review === 'changes_requested' ? 'CHANGES_REQUESTED' : null;
  const login = decided === null ? undefined : node.latestReviews?.nodes?.find((item) => item?.state === decided)?.author?.login;
  if (typeof login === 'string') return login;
  for (const item of node.reviewRequests?.nodes ?? []) {
    const name = item?.requestedReviewer?.login ?? item?.requestedReviewer?.slug;
    if (typeof name === 'string') return name;
  }
  return null;
}

const CHECKS: Record<string, ChecksState> = {
  SUCCESS: 'passing',
  FAILURE: 'failing',
  ERROR: 'failing',
  PENDING: 'pending',
  EXPECTED: 'pending',
};

const REVIEWS: Record<string, ReviewState> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes_requested',
  REVIEW_REQUIRED: 'review_required',
};

/** A repository's pull requests from one GraphQL read, grouped by the ticket their branch names. */
export function pullRequestsByTicket(nodes: unknown): Map<number, WatchedPullRequest[]> {
  const byTicket = new Map<number, WatchedPullRequest[]>();
  if (!Array.isArray(nodes)) return byTicket;
  for (const node of nodes as Array<RawPullRequestNode | null>) {
    if (node === null || typeof node.number !== 'number' || typeof node.url !== 'string' || typeof node.headRefName !== 'string') continue;
    const ticket = branchTicket(node.headRefName);
    if (ticket === null) continue;
    const state = node.state === 'MERGED' ? 'merged' : node.state === 'CLOSED' ? 'closed' : 'open';
    const rollup = node.commits?.nodes?.[node.commits.nodes.length - 1]?.commit?.statusCheckRollup;
    const review = typeof node.reviewDecision === 'string' ? (REVIEWS[node.reviewDecision] ?? null) : null;
    const pullRequest: WatchedPullRequest = {
      number: node.number,
      url: node.url,
      state,
      checks: typeof rollup?.state === 'string' ? (CHECKS[rollup.state] ?? null) : null,
      review,
      draft: node.isDraft === true,
      checkCounts: checkCounts(rollup),
      reviewer: reviewerOf(node, review),
    };
    byTicket.set(ticket, [...(byTicket.get(ticket) ?? []), pullRequest]);
  }
  return byTicket;
}

/**
 * The newest commit on each ticket's branch, from GraphQL `refs` under `refs/heads/wayfinder/`,
 * whose names come without that prefix. Two branches for one ticket: the later commit wins.
 */
export function branchCommitsByTicket(nodes: unknown): Map<number, string> {
  const byTicket = new Map<number, string>();
  if (!Array.isArray(nodes)) return byTicket;
  for (const node of nodes as Array<{ name?: unknown; target?: { committedDate?: unknown } | null } | null>) {
    const date = node?.target?.committedDate;
    if (typeof node?.name !== 'string' || typeof date !== 'string' || Number.isNaN(Date.parse(date))) continue;
    const ticket = branchTicket(`wayfinder/${node.name}`);
    if (ticket === null) continue;
    const seen = byTicket.get(ticket);
    if (seen === undefined || Date.parse(date) > Date.parse(seen)) byTicket.set(ticket, date);
  }
  return byTicket;
}

/** A PR as T3 Code's shell reports it on a hand-off, after `parsePullRequest` in `handOffTracking.ts`. */
export interface TrackedPullRequestRef {
  number: number | null;
  url: string;
  state: string | null;
  checksState: string | null;
  reviewDecision: string | null;
  isDraft?: boolean | null;
  hasSnapshot: boolean;
  syncedAt: string | null;
}

/**
 * The PRs T3 Code has a snapshot for, keyed by ticket. Only a PR with a snapshot counts:
 * without one T3 Code knows the URL but not the state, CI or review.
 */
export function trackedPullRequestsByTicket(
  handOffs: ReadonlyArray<{ ticketNumber: number | null; pullRequests: readonly TrackedPullRequestRef[] }>,
): Map<number, WatchedPullRequest[]> {
  const byTicket = new Map<number, WatchedPullRequest[]>();
  const syncedAt = new Map<string, number>();
  for (const handOff of handOffs) {
    if (handOff.ticketNumber === null) continue;
    for (const ref of handOff.pullRequests) {
      const number = ref.number ?? Number(/\/pull\/(\d+)/.exec(ref.url)?.[1]);
      if (!ref.hasSnapshot || !Number.isSafeInteger(number)) continue;
      // The same PR on two hand-offs: the snapshot T3 Code synced last wins.
      const id = `${String(handOff.ticketNumber)}#${String(number)}`;
      const synced = ref.syncedAt === null ? Number.NEGATIVE_INFINITY : Date.parse(ref.syncedAt) || Number.NEGATIVE_INFINITY;
      const seen = syncedAt.get(id);
      if (seen !== undefined && seen >= synced) continue;
      syncedAt.set(id, synced);
      const known = (byTicket.get(handOff.ticketNumber) ?? []).filter((pullRequest) => pullRequest.number !== number);
      const state = ref.state?.toUpperCase();
      known.push({
        number,
        url: ref.url,
        state: state === 'MERGED' ? 'merged' : state === 'CLOSED' ? 'closed' : 'open',
        checks: T3_CHECKS[ref.checksState?.toLowerCase() ?? ''] ?? CHECKS[ref.checksState?.toUpperCase() ?? ''] ?? null,
        review: REVIEWS[ref.reviewDecision?.toUpperCase() ?? ''] ?? null,
        ...(ref.isDraft === true ? { draft: true } : {}),
      });
      byTicket.set(handOff.ticketNumber, known);
    }
  }
  return byTicket;
}

/**
 * The one pull request each open ticket shows (#130): an open one first, then the newest merged,
 * then the newest closed. Closed tickets show none; their card already says done.
 */
export function ticketPullRequests(
  tickets: ReadonlyArray<{ number: number; state: TicketState }>,
  byTicket: ReadonlyMap<number, readonly WatchedPullRequest[]>,
): TicketPullRequest[] {
  const rank = { open: 0, merged: 1, closed: 2 } as const;
  return tickets.flatMap((ticket) => {
    if (ticket.state === 'done') return [];
    const [shown] = [...(byTicket.get(ticket.number) ?? [])].sort((a, b) => rank[a.state] - rank[b.state] || b.number - a.number);
    return shown === undefined ? [] : [{ ticket: ticket.number, ...shown }];
  });
}

/** Reads a repository's pull requests by ticket for the tickets given. `MapWatcher.ticketPullRequests` in the server. */
export type PullRequestSource = (
  repo: string,
  tickets: ReadonlyArray<{ number: number; state: TicketState }>,
) => Promise<ReadonlyMap<number, readonly WatchedPullRequest[]>>;

/**
 * Fill each map's `pullRequests` on a snapshot about to be served. Like stalls, they change
 * without the map's issues changing, so they are marked on every snapshot rather than cached.
 */
export async function markPullRequests(snapshot: MapSnapshot, source: PullRequestSource): Promise<MapSnapshot> {
  const tickets = snapshot.maps.filter((map) => map.ticketsLoaded).flatMap((map) => map.tickets);
  const byTicket = tickets.some((ticket) => ticket.state !== 'done')
    ? await source(snapshot.repo, tickets).catch(() => new Map<number, WatchedPullRequest[]>())
    : new Map<number, WatchedPullRequest[]>();
  return {
    ...snapshot,
    maps: snapshot.maps.map((map) => ({ ...map, pullRequests: map.ticketsLoaded ? ticketPullRequests(map.tickets, byTicket) : [] })),
  };
}

/** T3 Code's own `checksState` words. GitHub's rollup states are accepted too. */
const T3_CHECKS: Record<string, ChecksState> = { passing: 'passing', failing: 'failing', pending: 'pending' };

export interface HttpResponse {
  status: number;
  /** Header names in lower case. */
  headers: Record<string, string>;
  body: string;
}

/** `gh api -i` output: a status line, headers, a blank line, then the body. Null when it isn't that shape. */
export function parseHttpResponse(output: string): HttpResponse | null {
  const status = /^HTTP\/[\d.]+ (\d{3})/.exec(output);
  if (status?.[1] === undefined) return null;
  const split = /\r?\n\r?\n/.exec(output);
  const head = split === null ? output : output.slice(0, split.index);
  const body = split === null ? '' : output.slice(split.index + split[0].length);
  const headers: Record<string, string> = {};
  for (const line of head.split(/\r?\n/).slice(1)) {
    const colon = line.indexOf(':');
    if (colon > 0) headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }
  return { status: Number(status[1]), headers, body };
}

export interface RateLimit {
  /** `core` for REST, `graphql` for GraphQL: GitHub budgets them separately. */
  resource: string;
  limit: number;
  remaining: number;
  /** When the budget refills, in epoch milliseconds. */
  resetAt: number;
}

/** The budget a REST response reports in its `x-ratelimit-*` headers, or null. */
export function rateLimitOf(headers: Record<string, string>): RateLimit | null {
  const limit = Number(headers['x-ratelimit-limit']);
  const remaining = Number(headers['x-ratelimit-remaining']);
  const reset = Number(headers['x-ratelimit-reset']);
  if (![limit, remaining, reset].every(Number.isFinite) || headers['x-ratelimit-limit'] === undefined) return null;
  return { resource: headers['x-ratelimit-resource'] ?? 'core', limit, remaining, resetAt: reset * 1000 };
}

/** Below this share of a budget, the watcher leaves the rest to the user's own `gh` use and waits for the reset. */
export const LOW_BUDGET_SHARE = 0.1;
/** The longest a run of failed reads backs off, short of waiting for a rate-limit reset. */
export const MAX_BACKOFF_MS = 30 * 60 * 1000;

export interface PollDelayInput {
  intervalMs: number;
  now: number;
  /** The latest budget seen for each resource. */
  rateLimits: readonly RateLimit[];
  /** Failed reads in a row for this map. */
  failures: number;
  /** GitHub's `x-poll-interval`, in seconds, when it sent one. */
  pollIntervalSeconds?: number | null;
}

/** How long to wait before reading a map again. */
export function nextPollDelay({ intervalMs, now, rateLimits, failures, pollIntervalSeconds = null }: PollDelayInput): number {
  let delay = failures > 0 ? Math.min(Math.max(intervalMs, 1000) * 2 ** failures, MAX_BACKOFF_MS) : intervalMs;
  if (pollIntervalSeconds !== null) delay = Math.max(delay, pollIntervalSeconds * 1000);
  for (const budget of rateLimits) {
    if (budget.resetAt > now && budget.remaining <= budget.limit * LOW_BUDGET_SHARE) {
      delay = Math.max(delay, budget.resetAt - now);
    }
  }
  return delay;
}
