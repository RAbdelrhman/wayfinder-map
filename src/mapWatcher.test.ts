import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MapWatcher, NUDGE_GAP_MS } from './mapWatcher.js';
import type { MapRead, MapWatchReader, PullRequestRead } from './mapWatcher.js';
import type { MapEvent, RateLimit, WatchedPullRequest, WatchedTicket } from './mapWatch.js';
import type { TicketState } from './types.js';

const INTERVAL = 120_000;

function ticket(number: number, state: TicketState): WatchedTicket {
  return { number, title: `Ticket ${String(number)}`, state, pullRequests: [] };
}

function pr(number: number, overrides: Partial<WatchedPullRequest> = {}): WatchedPullRequest {
  return { number, url: `https://github.com/o/r/pull/${String(number)}`, state: 'open', checks: 'pending', review: null, ...overrides };
}

/** A reader that answers from queues, falling back to `unchanged` and the last pull requests. */
function fakeReader() {
  const maps: Array<MapRead | Error> = [];
  let pullRequests: PullRequestRead = { byTicket: new Map(), rateLimit: null };
  const etags: Array<string | null> = [];
  const reader: MapWatchReader & { mapReads: number; pullRequestReads: number } = {
    mapReads: 0,
    pullRequestReads: 0,
    readMap: (_repo, _map, etag) => {
      reader.mapReads += 1;
      etags.push(etag);
      const next = maps.shift() ?? { status: 'unchanged', rateLimit: null, pollIntervalSeconds: null };
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
    readPullRequests: () => {
      reader.pullRequestReads += 1;
      return Promise.resolve(pullRequests);
    },
  };
  return {
    reader,
    etags,
    changed(tickets: WatchedTicket[], etag = 'W/"1"', rateLimit: RateLimit | null = null): void {
      maps.push({ status: 'changed', etag, tickets, rateLimit, pollIntervalSeconds: null });
    },
    fail(error: Error): void {
      maps.push(error);
    },
    setPullRequests(entries: Array<[number, WatchedPullRequest[]]>): void {
      pullRequests = { byTicket: new Map(entries), rateLimit: null };
    },
  };
}

describe('MapWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  const make = (reader: MapWatchReader): MapWatcher => new MapWatcher(reader, { intervalMs: INTERVAL, now: () => Date.now() });

  it('takes the first read as a baseline, then reports what changed', async () => {
    const fake = fakeReader();
    fake.changed([ticket(1, 'claimed'), ticket(2, 'blocked')]);
    const watcher = make(fake.reader);
    const events: MapEvent[] = [];
    watcher.watch('o/r', 121, (event) => events.push(event));

    await vi.advanceTimersByTimeAsync(0);
    expect(events).toEqual([]);

    fake.changed([ticket(1, 'done'), ticket(2, 'frontier')], 'W/"2"');
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(events.map((event) => [event.id, event.type, event.ticket.number, event.repo, event.mapNumber])).toEqual([
      [1, 'ticket-closed', 1, 'o/r', 121],
      [2, 'ticket-next', 2, 'o/r', 121],
    ]);
    expect(events[0]?.at).toBe('2026-09-26T12:02:00.000Z');
    // The second read sends the first read's ETag.
    expect(fake.etags).toEqual([null, 'W/"1"']);
    watcher.close();
  });

  it('keeps reading pull requests after a 304, and does not report ones that merged before watching began', async () => {
    const fake = fakeReader();
    fake.changed([ticket(1, 'claimed'), ticket(2, 'done')]);
    fake.setPullRequests([[2, [pr(9, { state: 'merged' })]]]);
    const watcher = make(fake.reader);
    const events: MapEvent[] = [];
    watcher.watch('o/r', 121, (event) => events.push(event));
    await vi.advanceTimersByTimeAsync(0);

    fake.setPullRequests([
      [1, [pr(10)]],
      [2, [pr(9, { state: 'merged' })]],
    ]);
    await vi.advanceTimersByTimeAsync(INTERVAL);
    fake.setPullRequests([[1, [pr(10, { checks: 'passing', review: 'approved' })]]]);
    await vi.advanceTimersByTimeAsync(INTERVAL);

    expect(events.map((event) => event.type)).toEqual(['pr-opened', 'ci-changed', 'review-changed']);
    expect(fake.reader.mapReads).toBe(3);
    watcher.close();
  });

  it('reads no pull requests while nothing on the map is being worked on', async () => {
    const fake = fakeReader();
    fake.changed([ticket(1, 'frontier'), ticket(2, 'done')]);
    const watcher = make(fake.reader);
    watcher.watch('o/r', 121, () => undefined);
    await vi.advanceTimersByTimeAsync(INTERVAL * 3);
    expect(fake.reader.pullRequestReads).toBe(0);
    watcher.close();
  });

  it('shares one pull request read between maps in the same repository', async () => {
    const fake = fakeReader();
    fake.changed([ticket(1, 'claimed')]);
    fake.changed([ticket(2, 'claimed')]);
    const watcher = make(fake.reader);
    watcher.watch('o/r', 121, () => undefined);
    watcher.watch('o/r', 35, () => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.reader.mapReads).toBe(2);
    expect(fake.reader.pullRequestReads).toBe(1);
    watcher.close();
  });

  it('takes T3-tracked pull requests without a GraphQL read', async () => {
    const fake = fakeReader();
    fake.changed([ticket(1, 'claimed'), ticket(2, 'done')]);
    let tracked = new Map<number, WatchedPullRequest[]>([[1, [pr(10)]], [2, [pr(9, { state: 'merged' })]]]);
    const watcher = new MapWatcher(fake.reader, { intervalMs: INTERVAL, now: () => Date.now(), trackedPullRequests: () => Promise.resolve(tracked) });
    const events: MapEvent[] = [];
    watcher.watch('o/r', 121, (event) => events.push(event));
    await vi.advanceTimersByTimeAsync(0);

    tracked = new Map([[1, [pr(10, { checks: 'passing', review: 'approved' })]], [2, [pr(9, { state: 'merged' })]]]);
    await vi.advanceTimersByTimeAsync(INTERVAL);

    expect(events.map((event) => [event.type, event.ticket.number])).toEqual([
      ['ci-changed', 1],
      ['review-changed', 1],
    ]);
    expect(fake.reader.pullRequestReads).toBe(0);
    watcher.close();
  });

  it('reads GitHub for the tickets T3 Code does not track, and takes T3 first for the rest', async () => {
    const fake = fakeReader();
    fake.changed([ticket(1, 'claimed'), ticket(2, 'claimed')]);
    fake.setPullRequests([[1, [pr(10, { checks: 'failing' })]], [2, [pr(20)]]]);
    const watcher = new MapWatcher(fake.reader, {
      intervalMs: INTERVAL,
      now: () => Date.now(),
      trackedPullRequests: () => Promise.resolve(new Map([[1, [pr(10, { checks: 'passing' })]]])),
    });
    const events: MapEvent[] = [];
    watcher.watch('o/r', 121, (event) => events.push(event));
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.reader.pullRequestReads).toBe(1);

    fake.setPullRequests([[1, [pr(10, { checks: 'failing' })]], [2, [pr(20, { state: 'merged' })]]]);
    await vi.advanceTimersByTimeAsync(INTERVAL);
    // Ticket 1 stays on T3 Code's passing CI; only ticket 2's merge comes from GitHub.
    expect(events.map((event) => [event.type, event.ticket.number])).toEqual([['pr-merged', 2]]);
    watcher.close();
  });

  it('does not report a PR that merged before T3 Code first showed it', async () => {
    const fake = fakeReader();
    fake.changed([ticket(1, 'claimed'), ticket(2, 'done')]);
    fake.setPullRequests([[1, [pr(10)]]]);
    let tracked = new Map<number, WatchedPullRequest[]>([[1, [pr(10)]]]);
    const watcher = new MapWatcher(fake.reader, { intervalMs: INTERVAL, now: () => Date.now(), trackedPullRequests: () => Promise.resolve(tracked) });
    const events: MapEvent[] = [];
    watcher.watch('o/r', 121, (event) => events.push(event));
    await vi.advanceTimersByTimeAsync(0);

    // T3 Code comes online with an old hand-off whose PR merged long ago.
    tracked = new Map([[1, [pr(10)]], [2, [pr(9, { state: 'merged' })]]]);
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(events).toEqual([]);
    watcher.close();
  });

  it('reads a map straight away when nudged, at most once per gap', async () => {
    const fake = fakeReader();
    fake.changed([ticket(1, 'claimed')]);
    const watcher = make(fake.reader);
    watcher.watch('o/r', 121, () => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.reader.mapReads).toBe(1);

    await vi.advanceTimersByTimeAsync(NUDGE_GAP_MS);
    watcher.nudge('O/R', 121);
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.reader.mapReads).toBe(2);

    // A burst of thread changes costs one more read, NUDGE_GAP_MS after the last.
    watcher.nudge('o/r', 121);
    watcher.nudge('o/r', 121);
    await vi.advanceTimersByTimeAsync(NUDGE_GAP_MS - 1);
    expect(fake.reader.mapReads).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.reader.mapReads).toBe(3);

    // Then back to the interval.
    await vi.advanceTimersByTimeAsync(INTERVAL - 1);
    expect(fake.reader.mapReads).toBe(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.reader.mapReads).toBe(4);

    // Maps nobody watches are not read.
    watcher.nudge('o/r', 35);
    await vi.advanceTimersByTimeAsync(NUDGE_GAP_MS);
    expect(fake.reader.mapReads).toBe(4);
    watcher.close();
  });

  it('reads again soon when nudged during a read', async () => {
    let finish: (read: MapRead) => void = () => undefined;
    let reads = 0;
    const watcher = make({
      readMap: () => {
        reads += 1;
        return reads === 1 ? new Promise<MapRead>((resolve) => (finish = resolve)) : Promise.resolve({ status: 'unchanged', rateLimit: null, pollIntervalSeconds: null });
      },
      readPullRequests: () => Promise.resolve({ byTicket: new Map(), rateLimit: null }),
    });
    watcher.watch('o/r', 121, () => undefined);
    await vi.advanceTimersByTimeAsync(0);
    watcher.nudge('o/r', 121);
    finish({ status: 'changed', etag: null, tickets: [ticket(1, 'claimed')], rateLimit: null, pollIntervalSeconds: null });
    await vi.advanceTimersByTimeAsync(NUDGE_GAP_MS);
    expect(reads).toBe(2);
    watcher.close();
  });

  it('keeps a short history, replayed after a given id', async () => {
    const fake = fakeReader();
    fake.changed([ticket(1, 'claimed'), ticket(2, 'blocked')]);
    const watcher = make(fake.reader);
    const stop = watcher.watch('o/r', 121, () => undefined);
    await vi.advanceTimersByTimeAsync(0);
    fake.changed([ticket(1, 'done'), ticket(2, 'frontier')]);
    await vi.advanceTimersByTimeAsync(INTERVAL);
    stop();

    expect(watcher.history('O/R', 121).map((event) => event.id)).toEqual([1, 2]);
    expect(watcher.history('o/r', 121, 1).map((event) => event.type)).toEqual(['ticket-next']);
    expect(watcher.history('o/r', 35)).toEqual([]);
    watcher.close();
  });

  it('stops reading once nobody is watching', async () => {
    const fake = fakeReader();
    fake.changed([ticket(1, 'claimed')]);
    const watcher = make(fake.reader);
    const stop = watcher.watch('o/r', 121, () => undefined);
    await vi.advanceTimersByTimeAsync(0);
    stop();
    await vi.advanceTimersByTimeAsync(INTERVAL * 5);
    expect(fake.reader.mapReads).toBe(1);
    watcher.close();
  });

  it('keeps one read loop when a page leaves and comes back during a read', async () => {
    let finish: (read: MapRead) => void = () => undefined;
    let reads = 0;
    const watcher = make({
      readMap: () => {
        reads += 1;
        return reads === 1 ? new Promise<MapRead>((resolve) => (finish = resolve)) : Promise.resolve({ status: 'unchanged', rateLimit: null, pollIntervalSeconds: null });
      },
      readPullRequests: () => Promise.resolve({ byTicket: new Map(), rateLimit: null }),
    });
    const stop = watcher.watch('o/r', 121, () => undefined);
    await vi.advanceTimersByTimeAsync(0);
    stop();
    watcher.watch('o/r', 121, () => undefined);
    finish({ status: 'changed', etag: null, tickets: [ticket(1, 'frontier')], rateLimit: null, pollIntervalSeconds: null });
    await vi.advanceTimersByTimeAsync(INTERVAL * 3);
    expect(reads).toBe(4);
    watcher.close();
  });

  it('stops every timer and listener on close', async () => {
    const fake = fakeReader();
    fake.changed([ticket(1, 'claimed')]);
    const watcher = make(fake.reader);
    const events: MapEvent[] = [];
    watcher.watch('o/r', 121, (event) => events.push(event));
    await vi.advanceTimersByTimeAsync(0);
    watcher.close();
    fake.changed([ticket(1, 'done')]);
    await vi.advanceTimersByTimeAsync(INTERVAL * 5);
    expect(fake.reader.mapReads).toBe(1);
    expect(events).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    // Watching after close does nothing.
    watcher.watch('o/r', 121, () => undefined);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('backs off until the reset when the budget runs low, for every map', async () => {
    const fake = fakeReader();
    const resetAt = Date.now() + 30 * 60_000;
    fake.changed([ticket(1, 'claimed')], 'W/"1"', { resource: 'core', limit: 5000, remaining: 100, resetAt });
    const watcher = make(fake.reader);
    watcher.watch('o/r', 121, () => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.reader.mapReads).toBe(1);

    // A second map is held back too: the budget belongs to the account.
    watcher.watch('o/r', 35, () => undefined);
    await vi.advanceTimersByTimeAsync(29 * 60_000);
    expect(fake.reader.mapReads).toBe(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(fake.reader.mapReads).toBe(3);
    watcher.close();
  });

  it('backs off after failed reads and returns to the interval once one succeeds', async () => {
    const fake = fakeReader();
    fake.fail(new Error('network down'));
    fake.fail(new Error('network down'));
    const watcher = make(fake.reader);
    watcher.watch('o/r', 121, () => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.reader.mapReads).toBe(1);
    await vi.advanceTimersByTimeAsync(INTERVAL * 2 - 1);
    expect(fake.reader.mapReads).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.reader.mapReads).toBe(2);
    await vi.advanceTimersByTimeAsync(INTERVAL * 4);
    expect(fake.reader.mapReads).toBe(3);
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(fake.reader.mapReads).toBe(4);
    watcher.close();
  });

  it('backs off hard when gh reports the rate limit only in words', async () => {
    const fake = fakeReader();
    fake.fail(new Error('API rate limit exceeded for user ID 1.'));
    const watcher = make(fake.reader);
    watcher.watch('o/r', 121, () => undefined);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(INTERVAL * 8 - 1);
    expect(fake.reader.mapReads).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.reader.mapReads).toBe(2);
    watcher.close();
  });
});
