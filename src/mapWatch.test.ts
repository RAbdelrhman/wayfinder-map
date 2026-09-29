import { describe, expect, it, vi } from 'vitest';

import {
  LOW_BUDGET_SHARE,
  MAX_BACKOFF_MS,
  branchTicket,
  diffMap,
  needsPullRequests,
  nextPollDelay,
  parseHttpResponse,
  branchCommitsByTicket,
  checkCounts,
  markPullRequests,
  pullRequestsByTicket,
  rateLimitOf,
  ticketPullRequests,
  trackedPullRequestsByTicket,
  watchedTickets,
} from './mapWatch.js';
import type { TrackedPullRequestRef, WatchedPullRequest, WatchedTicket } from './mapWatch.js';
import type { MapSnapshot, TicketState } from './types.js';

function ticket(number: number, state: TicketState, pullRequests: WatchedPullRequest[] = []): WatchedTicket {
  return { number, title: `Ticket ${String(number)}`, state, pullRequests };
}

function pr(number: number, overrides: Partial<WatchedPullRequest> = {}): WatchedPullRequest {
  return { number, url: `https://github.com/o/r/pull/${String(number)}`, state: 'open', checks: 'pending', review: null, ...overrides };
}

describe('diffMap', () => {
  it('reports a ticket that closed', () => {
    expect(diffMap([ticket(1, 'claimed')], [ticket(1, 'done')])).toEqual([
      { type: 'ticket-closed', ticket: { number: 1, title: 'Ticket 1' } },
    ]);
  });

  it('reports a ticket that became next, and where it came from', () => {
    expect(diffMap([ticket(2, 'blocked'), ticket(3, 'claimed')], [ticket(2, 'frontier'), ticket(3, 'frontier')])).toEqual([
      { type: 'ticket-next', ticket: { number: 2, title: 'Ticket 2' }, from: 'blocked' },
      { type: 'ticket-next', ticket: { number: 3, title: 'Ticket 3' }, from: 'claimed' },
    ]);
  });

  it('reports a pull request that opened', () => {
    const opened = pr(10);
    expect(diffMap([ticket(1, 'claimed')], [ticket(1, 'claimed', [opened])])).toEqual([
      { type: 'pr-opened', ticket: { number: 1, title: 'Ticket 1' }, pullRequest: opened },
    ]);
  });

  it('reports a pull request that merged, including one opened and merged between reads', () => {
    const merged = pr(10, { state: 'merged' });
    expect(diffMap([ticket(1, 'claimed', [pr(10)])], [ticket(1, 'claimed', [merged])]).map((change) => change.type)).toEqual(['pr-merged']);
    expect(diffMap([ticket(1, 'claimed')], [ticket(1, 'claimed', [merged])]).map((change) => change.type)).toEqual(['pr-merged']);
  });

  it('reports a change in CI', () => {
    const passing = pr(10, { checks: 'passing' });
    expect(diffMap([ticket(1, 'claimed', [pr(10)])], [ticket(1, 'claimed', [passing])])).toEqual([
      { type: 'ci-changed', ticket: { number: 1, title: 'Ticket 1' }, pullRequest: passing, from: 'pending', to: 'passing' },
    ]);
  });

  it('reports a change in review', () => {
    const approved = pr(10, { review: 'approved' });
    expect(diffMap([ticket(1, 'claimed', [pr(10)])], [ticket(1, 'claimed', [approved])])).toEqual([
      { type: 'review-changed', ticket: { number: 1, title: 'Ticket 1' }, pullRequest: approved, from: null, to: 'approved' },
    ]);
  });

  it('puts ticket changes before pull request changes', () => {
    const merged = pr(10, { state: 'merged', checks: 'passing' });
    expect(diffMap([ticket(1, 'claimed', [pr(10)]), ticket(2, 'blocked')], [ticket(1, 'done', [merged]), ticket(2, 'frontier')]).map((change) => change.type)).toEqual([
      'ticket-closed',
      'ticket-next',
      'pr-merged',
      'ci-changed',
    ]);
  });

  it('says nothing when nothing changed, a ticket just joined, or a closed ticket reopened', () => {
    expect(diffMap([ticket(1, 'claimed', [pr(10)])], [ticket(1, 'claimed', [pr(10)])])).toEqual([]);
    expect(diffMap([], [ticket(4, 'frontier')])).toEqual([]);
    expect(diffMap([ticket(5, 'done')], [ticket(5, 'frontier')])).toEqual([]);
  });
});

describe('watchedTickets', () => {
  it('reads state from a sub_issues response, blockers from the dependency summary', () => {
    expect(
      watchedTickets([
        { number: 1, title: 'Closed', state: 'closed', assignees: [{ login: 'a' }] },
        { number: 2, title: 'Blocked', state: 'open', assignees: [], issue_dependencies_summary: { blocked_by: 1, total_blocked_by: 2 } },
        { number: 3, title: 'Unblocked', state: 'open', assignees: [], issue_dependencies_summary: { blocked_by: 0, total_blocked_by: 2 } },
        { number: 4, title: 'Claimed', state: 'open', assignee: { login: 'b' } },
        { title: 'No number' },
      ]).map(({ number, state }) => [number, state]),
    ).toEqual([
      [1, 'done'],
      [2, 'blocked'],
      [3, 'frontier'],
      [4, 'claimed'],
    ]);
  });

  it('reads anything else as no tickets', () => {
    expect(watchedTickets({ message: 'Not Found' })).toEqual([]);
  });
});

describe('needsPullRequests', () => {
  it('asks for pull requests only while a ticket is claimed or has one open', () => {
    expect(needsPullRequests([ticket(1, 'frontier'), ticket(2, 'done', [pr(9, { state: 'merged' })])])).toBe(false);
    expect(needsPullRequests([ticket(1, 'claimed')])).toBe(true);
    expect(needsPullRequests([ticket(1, 'done', [pr(9)])])).toBe(true);
  });
});

describe('branchCommitsByTicket', () => {
  it('keys the newest commit on each wayfinder branch by its ticket', () => {
    expect(
      branchCommitsByTicket([
        { name: '160-detect-stalled-tickets', target: { committedDate: '2026-09-20T00:00:00Z' } },
        { name: '160-detect-stalled-tickets-retry', target: { committedDate: '2026-09-25T00:00:00Z' } },
        { name: '42-older', target: { committedDate: '2026-09-01T00:00:00Z' } },
        { name: 'no-ticket', target: { committedDate: '2026-09-25T00:00:00Z' } },
        { name: '43-not-a-commit', target: {} },
        null,
      ]),
    ).toEqual(
      new Map([
        [160, '2026-09-25T00:00:00Z'],
        [42, '2026-09-01T00:00:00Z'],
      ]),
    );
    expect(branchCommitsByTicket(undefined)).toEqual(new Map());
  });
});

describe('pullRequestsByTicket', () => {
  it('groups pull requests by the ticket their wayfinder branch names', () => {
    const byTicket = pullRequestsByTicket([
      {
        number: 111,
        url: 'https://github.com/o/r/pull/111',
        state: 'CLOSED',
        headRefName: 'wayfinder/98-first-try',
        reviewDecision: null,
        commits: { nodes: [{ commit: { statusCheckRollup: { state: 'FAILURE' } } }] },
      },
      {
        number: 113,
        url: 'https://github.com/o/r/pull/113',
        state: 'MERGED',
        headRefName: 'wayfinder/98-second-try',
        reviewDecision: 'APPROVED',
        commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] },
      },
      { number: 120, url: 'https://github.com/o/r/pull/120', state: 'OPEN', headRefName: 'wayfinder/99-x', reviewDecision: 'REVIEW_REQUIRED', commits: { nodes: [] } },
      { number: 121, url: 'https://github.com/o/r/pull/121', state: 'OPEN', headRefName: 'feature/unrelated' },
      null,
    ]);
    expect(byTicket.get(98)).toEqual([
      { number: 111, url: 'https://github.com/o/r/pull/111', state: 'closed', checks: 'failing', review: null, draft: false, checkCounts: null, reviewer: null },
      { number: 113, url: 'https://github.com/o/r/pull/113', state: 'merged', checks: 'passing', review: 'approved', draft: false, checkCounts: null, reviewer: null },
    ]);
    expect(byTicket.get(99)).toEqual([
      { number: 120, url: 'https://github.com/o/r/pull/120', state: 'open', checks: null, review: 'review_required', draft: false, checkCounts: null, reviewer: null },
    ]);
    expect(byTicket.size).toBe(2);
  });

  it('reads the ticket number from the branch prefix only', () => {
    expect(branchTicket('wayfinder/127-watch-maps')).toBe(127);
    expect(branchTicket('feature/wayfinder/127-x')).toBeNull();
    expect(branchTicket('wayfinder/draft')).toBeNull();
  });
});

describe('parseHttpResponse', () => {
  it('reads the status, headers and body gh api -i prints', () => {
    expect(parseHttpResponse('HTTP/2.0 200 OK\r\nEtag: W/"abc"\r\nX-Ratelimit-Remaining: 4990\r\n\r\n[{"number":1}]')).toEqual({
      status: 200,
      headers: { etag: 'W/"abc"', 'x-ratelimit-remaining': '4990' },
      body: '[{"number":1}]',
    });
  });

  it('reads a 304 with no body', () => {
    expect(parseHttpResponse('HTTP/2.0 304 Not Modified\nEtag: W/"abc"\n')).toEqual({ status: 304, headers: { etag: 'W/"abc"' }, body: '' });
  });

  it('returns null for anything else', () => {
    expect(parseHttpResponse('gh: Not Found (HTTP 404)')).toBeNull();
  });
});

describe('rateLimitOf', () => {
  it('reads the budget from the headers', () => {
    expect(
      rateLimitOf({ 'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '12', 'x-ratelimit-reset': '1790000000', 'x-ratelimit-resource': 'core' }),
    ).toEqual({ resource: 'core', limit: 5000, remaining: 12, resetAt: 1_790_000_000_000 });
  });

  it('returns null when the headers are missing', () => {
    expect(rateLimitOf({})).toBeNull();
  });
});

describe('nextPollDelay', () => {
  const now = 1_000_000;
  const budget = (remaining: number, resetIn: number) => ({ resource: 'core', limit: 5000, remaining, resetAt: now + resetIn });

  it('waits the interval while the budget is healthy', () => {
    expect(nextPollDelay({ intervalMs: 120_000, now, rateLimits: [budget(4000, 600_000)], failures: 0 })).toBe(120_000);
  });

  it('waits for the reset once the budget runs low', () => {
    const low = 5000 * LOW_BUDGET_SHARE;
    expect(nextPollDelay({ intervalMs: 120_000, now, rateLimits: [budget(low, 1_800_000)], failures: 0 })).toBe(1_800_000);
    expect(nextPollDelay({ intervalMs: 120_000, now, rateLimits: [budget(0, 60_000)], failures: 0 })).toBe(120_000);
  });

  it('ignores a low budget that has already reset', () => {
    expect(nextPollDelay({ intervalMs: 120_000, now, rateLimits: [budget(0, -1)], failures: 0 })).toBe(120_000);
  });

  it('doubles the wait after each failure, up to a cap', () => {
    expect(nextPollDelay({ intervalMs: 120_000, now, rateLimits: [], failures: 1 })).toBe(240_000);
    expect(nextPollDelay({ intervalMs: 120_000, now, rateLimits: [], failures: 2 })).toBe(480_000);
    expect(nextPollDelay({ intervalMs: 120_000, now, rateLimits: [], failures: 10 })).toBe(MAX_BACKOFF_MS);
  });

  it('respects the poll interval GitHub asks for', () => {
    expect(nextPollDelay({ intervalMs: 30_000, now, rateLimits: [], failures: 0, pollIntervalSeconds: 60 })).toBe(60_000);
  });
});

describe('trackedPullRequestsByTicket', () => {
  const ref = (overrides: Partial<TrackedPullRequestRef> = {}): TrackedPullRequestRef => ({
    number: 42,
    url: 'https://github.com/o/r/pull/42',
    state: 'open',
    checksState: 'passing',
    reviewDecision: 'approved',
    hasSnapshot: true,
    syncedAt: null,
    ...overrides,
  });

  it('keys T3 Code PR snapshots by ticket, in the words the watcher uses', () => {
    expect(
      trackedPullRequestsByTicket([
        { ticketNumber: 7, pullRequests: [ref(), ref({ number: null, url: 'https://github.com/o/r/pull/43', state: 'MERGED', checksState: 'failing', reviewDecision: 'CHANGES_REQUESTED' })] },
        { ticketNumber: 8, pullRequests: [ref({ number: 50, url: 'https://github.com/o/r/pull/50', state: 'closed', checksState: 'none', reviewDecision: null })] },
      ]),
    ).toEqual(
      new Map([
        [7, [
          { number: 42, url: 'https://github.com/o/r/pull/42', state: 'open', checks: 'passing', review: 'approved' },
          { number: 43, url: 'https://github.com/o/r/pull/43', state: 'merged', checks: 'failing', review: 'changes_requested' },
        ]],
        [8, [{ number: 50, url: 'https://github.com/o/r/pull/50', state: 'closed', checks: null, review: null }]],
      ]),
    );
  });

  it('leaves out PRs without a snapshot, hand-offs without a ticket, and duplicates across hand-offs', () => {
    const tracked = trackedPullRequestsByTicket([
      { ticketNumber: null, pullRequests: [ref()] },
      { ticketNumber: 7, pullRequests: [ref({ hasSnapshot: false })] },
      { ticketNumber: 9, pullRequests: [ref()] },
      { ticketNumber: 9, pullRequests: [ref({ checksState: 'pending' })] },
    ]);
    expect([...tracked.keys()]).toEqual([9]);
    expect(tracked.get(9)).toHaveLength(1);
  });

  it('takes the most recently synced snapshot when two hand-offs carry the same PR', () => {
    const tracked = trackedPullRequestsByTicket([
      { ticketNumber: 9, pullRequests: [ref({ checksState: 'pending', syncedAt: '2026-09-27T10:00:00Z' })] },
      { ticketNumber: 9, pullRequests: [ref({ checksState: 'failing', syncedAt: '2026-09-27T12:00:00Z' })] },
      { ticketNumber: 9, pullRequests: [ref({ checksState: 'passing', syncedAt: '2026-09-27T11:00:00Z' })] },
    ]);
    expect(tracked.get(9)?.map((pullRequest) => pullRequest.checks)).toEqual(['failing']);
  });
});

describe('pull request details for the page (#130)', () => {
  it('counts check runs and commit statuses by outcome, and names the reviewer behind the decision', () => {
    const [changes] = pullRequestsByTicket([
      {
        number: 232,
        url: 'https://github.com/o/r/pull/232',
        state: 'OPEN',
        isDraft: true,
        headRefName: 'wayfinder/130-x',
        reviewDecision: 'CHANGES_REQUESTED',
        latestReviews: { nodes: [{ state: 'APPROVED', author: { login: 'ann' } }, { state: 'CHANGES_REQUESTED', author: { login: 'sam-k' } }] },
        reviewRequests: { nodes: [{ requestedReviewer: { login: 'lee' } }] },
        commits: {
          nodes: [
            {
              commit: {
                statusCheckRollup: {
                  state: 'FAILURE',
                  contexts: {
                    checkRunCountsByState: [{ state: 'SUCCESS', count: 2 }, { state: 'FAILURE', count: 1 }, { state: 'CANCELLED', count: 1 }, { state: 'QUEUED', count: 0 }],
                    statusContextCountsByState: [{ state: 'SUCCESS', count: 1 }],
                  },
                },
              },
            },
          ],
        },
      },
    ]).get(130) ?? [];
    expect(changes).toMatchObject({ draft: true, checks: 'failing', checkCounts: { passed: 3, failed: 2, pending: 0 }, review: 'changes_requested', reviewer: 'sam-k' });

    const requested = pullRequestsByTicket([
      { number: 5, url: 'u', state: 'OPEN', headRefName: 'wayfinder/7-y', reviewDecision: 'REVIEW_REQUIRED', reviewRequests: { nodes: [{ requestedReviewer: { slug: 'core' } }] } },
    ]).get(7)?.[0];
    expect(requested).toMatchObject({ reviewer: 'core', checkCounts: null });
  });

  it('reports no counts when GitHub has none', () => {
    expect(checkCounts({ state: 'SUCCESS', contexts: { checkRunCountsByState: [{ state: 'SUCCESS', count: 0 }] } })).toBeNull();
    expect(checkCounts(null)).toBeNull();
    expect(checkCounts({ contexts: { checkRunCountsByState: [{ state: 'IN_PROGRESS', count: 2 }, { state: 'NEUTRAL', count: 1 }] } })).toEqual({ passed: 1, failed: 0, pending: 2 });
  });

  it('shows one PR per open ticket: open first, then the newest merged, then the newest closed', () => {
    const byTicket = new Map<number, WatchedPullRequest[]>([
      [1, [pullRequest(10, 'closed'), pullRequest(11, 'open'), pullRequest(12, 'merged')]],
      [2, [pullRequest(20, 'closed'), pullRequest(22, 'merged'), pullRequest(21, 'merged')]],
      [3, [pullRequest(30, 'closed'), pullRequest(31, 'closed')]],
      [4, [pullRequest(40, 'open')]],
    ]);
    const tickets = [
      { number: 1, state: 'claimed' as const },
      { number: 2, state: 'claimed' as const },
      { number: 3, state: 'frontier' as const },
      { number: 4, state: 'done' as const },
      { number: 5, state: 'claimed' as const },
    ];
    expect(ticketPullRequests(tickets, byTicket).map((shown) => [shown.ticket, shown.number])).toEqual([[1, 11], [2, 22], [3, 31]]);
  });

  it('marks each loaded map on a snapshot, and asks for nothing when every ticket is done', async () => {
    const map = (number: number, tickets: Array<{ number: number; state: TicketState }>, ticketsLoaded = true) =>
      ({ number, tickets, ticketsLoaded, pullRequests: [] }) as unknown as MapSnapshot['maps'][number];
    const source = vi.fn(async () => new Map([[1, [pullRequest(9, 'open')]], [2, [pullRequest(8, 'open')]]]));
    const snapshot = { repo: 'o/r', maps: [map(100, [{ number: 1, state: 'claimed' }]), map(200, [{ number: 2, state: 'claimed' }], false)] } as unknown as MapSnapshot;

    const marked = await markPullRequests(snapshot, source);
    expect(marked.maps.map((each) => each.pullRequests.map((shown) => shown.number))).toEqual([[9], []]);
    expect(source).toHaveBeenCalledWith('o/r', [{ number: 1, state: 'claimed' }]);

    const quiet = vi.fn(async () => new Map());
    await markPullRequests({ repo: 'o/r', maps: [map(100, [{ number: 1, state: 'done' }])] } as unknown as MapSnapshot, quiet);
    expect(quiet).not.toHaveBeenCalled();

    const failing = await markPullRequests(snapshot, () => Promise.reject(new Error('offline')));
    expect(failing.maps[0]?.pullRequests).toEqual([]);
  });
});

function pullRequest(number: number, state: WatchedPullRequest['state']): WatchedPullRequest {
  return { number, url: `https://github.com/o/r/pull/${String(number)}`, state, checks: null, review: null };
}
