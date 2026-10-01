import { afterEach, describe, expect, it } from 'vitest';

import { parseUsageLimit, StartNextRunner } from './startNextRunner.js';
import type { BatchRequestItem, StartOutcome } from './startNextRunner.js';

function item(ticketNumber: number, extra: Partial<BatchRequestItem> = {}): BatchRequestItem {
  return { ticketNumber, title: `Ticket ${String(ticketNumber)}`, tier: 'mid', model: null, ...extra };
}

interface Harness {
  runner: StartNextRunner;
  /** Ticket numbers handed to T3 Code, in order. */
  started: number[];
  /** Hand-offs live on the machine, which a test moves to free a slot. */
  live: { count: number };
  errors: Map<string, string>;
  maxInFlight: () => number;
  outcomes: Map<number, StartOutcome | Error>;
}

const runners: StartNextRunner[] = [];

function harness(): Harness {
  const started: number[] = [];
  const live = { count: 0 };
  const errors = new Map<string, string>();
  const outcomes = new Map<number, StartOutcome | Error>();
  let inFlight = 0;
  let maxInFlight = 0;
  const runner = new StartNextRunner({
    intervalMs: 1_000_000,
    running: async () => live.count,
    lastErrors: async (ids) => new Map(ids.flatMap((id) => (errors.has(id) ? [[id, errors.get(id) ?? ''] as const] : []))),
    startTicket: async ({ item: requested }) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      started.push(requested.ticketNumber);
      const outcome = outcomes.get(requested.ticketNumber);
      if (outcome instanceof Error) throw outcome;
      if (outcome !== undefined) return outcome;
      live.count += 1;
      return { kind: 'started', handOffId: `hand-off-${String(requested.ticketNumber)}` };
    },
  });
  runners.push(runner);
  return { runner, started, live, errors, maxInFlight: () => maxInFlight, outcomes };
}

afterEach(() => {
  for (const runner of runners.splice(0)) runner.close();
});

const statuses = (h: Harness, index = 0): string[] => h.runner.snapshot()[index]?.items.map((entry) => `${String(entry.ticketNumber)}:${entry.status}`) ?? [];

describe('StartNextRunner', () => {
  it('hands off a batch of 3 as 3 separate starts, each ticket once', async () => {
    const h = harness();
    h.runner.submit({ repo: 'o/r', mapNumber: 1, cap: 4, items: [item(10), item(11), item(12)] });
    await h.runner.tick();
    expect([...h.started].sort()).toEqual([10, 11, 12]);
    expect(h.maxInFlight()).toBe(3);
    const [batch] = h.runner.snapshot();
    expect(batch?.status).toBe('done');
    expect(batch?.items.map((entry) => entry.handOffId)).toEqual(['hand-off-10', 'hand-off-11', 'hand-off-12']);
  });

  it('starts only what fits under the cap, counting what already runs on the machine', async () => {
    const h = harness();
    h.live.count = 2;
    h.runner.submit({ repo: 'o/r', mapNumber: 1, cap: 4, items: [1, 2, 3, 4, 5].map((number) => item(number)) });
    await h.runner.tick();
    expect(h.started).toEqual([1, 2]);
    expect(statuses(h)).toEqual(['1:started', '2:started', '3:queued', '4:queued', '5:queued']);
    expect(h.runner.snapshot()[0]?.status).toBe('running');
  });

  it('starts the next queued tickets as running hand-offs end', async () => {
    const h = harness();
    h.runner.submit({ repo: 'o/r', mapNumber: 1, cap: 2, items: [1, 2, 3, 4].map((number) => item(number)) });
    await h.runner.tick();
    expect(h.started).toEqual([1, 2]);

    await h.runner.tick();
    expect(h.started).toEqual([1, 2]);

    h.live.count = 1;
    await h.runner.tick();
    expect(h.started).toEqual([1, 2, 3]);

    h.live.count = 0;
    await h.runner.tick();
    expect(h.started).toEqual([1, 2, 3, 4]);
    expect(h.runner.snapshot()[0]?.status).toBe('done');
  });

  it('stops the whole batch on the first usage-limit error and sends what is queued back to next', async () => {
    const h = harness();
    h.runner.submit({ repo: 'o/r', mapNumber: 1, cap: 2, items: [1, 2, 3, 4].map((number) => item(number)) });
    await h.runner.tick();
    h.errors.set('hand-off-2', "You've hit your usage limit. It resets at 4:00 PM.\nTry again later.");
    h.live.count = 0;
    await h.runner.tick();

    const [batch] = h.runner.snapshot();
    expect(batch?.status).toBe('stopped');
    expect(batch?.stop).toEqual({ kind: 'usage-limit', ticketNumber: 2, message: "You've hit your usage limit. It resets at 4:00 PM.", resetsAt: '4:00 PM' });
    expect(statuses(h)).toEqual(['1:started', '2:started', '3:back-to-next', '4:back-to-next']);
    expect(h.runner.snapshot()[0]?.items[2]?.reason).toBe('Went back to next when the batch stopped');
    expect(h.started).toEqual([1, 2]);

    await h.runner.tick();
    expect(h.started).toEqual([1, 2]);
  });

  it('stops on a usage-limit error raised while starting a thread', async () => {
    const h = harness();
    h.outcomes.set(1, { kind: 'failed', reason: 'Could not start the thread (Claude usage limit reached, resets in 3 hours).' });
    h.runner.submit({ repo: 'o/r', mapNumber: 1, cap: 1, items: [item(1), item(2)] });
    await h.runner.tick();
    const [batch] = h.runner.snapshot();
    expect(batch?.status).toBe('stopped');
    expect(batch?.stop).toMatchObject({ kind: 'usage-limit', ticketNumber: 1, resetsAt: '3 hours' });
    expect(statuses(h)).toEqual(['1:failed', '2:back-to-next']);
  });

  it('hands each ticket its Auto decision when it starts', async () => {
    const seen: Array<[number, unknown]> = [];
    const runner = new StartNextRunner({
      intervalMs: 1_000_000,
      running: async () => 0,
      lastErrors: async () => new Map(),
      startTicket: async ({ item: requested }) => {
        seen.push([requested.ticketNumber, requested.auto]);
        return { kind: 'started', handOffId: null };
      },
    });
    runners.push(runner);
    const auto = { decidedAt: '2026-10-01T12:00:00.000Z' } as unknown as NonNullable<BatchRequestItem['auto']>;
    runner.submit({ repo: 'o/r', mapNumber: 1, cap: 4, items: [item(1, { auto }), item(2)] });
    await runner.tick();
    expect(seen).toEqual([[1, auto], [2, null]]);
  });

  it('remembers which provider a usage limit hit, for Auto to steer clear of', async () => {
    const h = harness();
    expect(h.runner.usageLimits()).toEqual([]);
    h.outcomes.set(1, { kind: 'failed', reason: 'Usage limit reached.' });
    h.runner.submit({ repo: 'o/r', mapNumber: 1, cap: 1, items: [item(1, { model: { instanceId: 'codex', model: 'gpt-5.6-sol' } }), item(2)] });
    await h.runner.tick();
    expect(h.runner.usageLimits()).toEqual([{ instanceId: 'codex', at: expect.any(String) as string }]);
  });

  it('records nothing for a usage limit on a ticket with no chosen model', async () => {
    const h = harness();
    h.outcomes.set(1, { kind: 'failed', reason: 'Usage limit reached.' });
    h.runner.submit({ repo: 'o/r', mapNumber: 1, cap: 1, items: [item(1)] });
    await h.runner.tick();
    expect(h.runner.usageLimits()).toEqual([]);
  });

  it('ignores errors that are not usage limits', async () => {
    const h = harness();
    h.runner.submit({ repo: 'o/r', mapNumber: 1, cap: 4, items: [item(1), item(2)] });
    await h.runner.tick();
    h.errors.set('hand-off-1', 'Tool call failed');
    await h.runner.tick();
    expect(h.runner.snapshot()[0]?.status).toBe('done');
  });

  it('marks a failed or skipped start and carries on with the rest', async () => {
    const h = harness();
    h.outcomes.set(1, new Error('no model to use yet'));
    h.outcomes.set(2, { kind: 'skipped', reason: 'Already in T3 Code' });
    h.runner.submit({ repo: 'o/r', mapNumber: 1, cap: 4, items: [item(1), item(2), item(3)] });
    await h.runner.tick();
    const [batch] = h.runner.snapshot();
    expect(batch?.items.map((entry) => [entry.status, entry.reason])).toEqual([
      ['failed', 'no model to use yet'],
      ['skipped', 'Already in T3 Code'],
      ['started', null],
    ]);
    expect(batch?.status).toBe('done');
  });

  it('skips a ticket another running batch has queued, a repeat in the same batch and a preset skip', async () => {
    const h = harness();
    h.live.count = 4;
    h.runner.submit({ repo: 'o/r', mapNumber: 1, cap: 4, items: [item(1), item(2)] });
    const second = h.runner.submit({ repo: 'O/R', mapNumber: 1, cap: 4, items: [item(2), item(3), item(3), item(4, { skip: 'Ticket 4 is no longer next.' })] });
    expect(second.items.map((entry) => [entry.status, entry.reason])).toEqual([
      ['skipped', 'Already in a running batch'],
      ['queued', null],
      ['skipped', 'Already in a running batch'],
      ['skipped', 'Ticket 4 is no longer next.'],
    ]);
    expect([...h.runner.pendingTickets('o/r')].sort()).toEqual([1, 2, 3]);
  });

  it('does not start a batch where every ticket is skipped', async () => {
    const h = harness();
    const batch = h.runner.submit({ repo: 'o/r', mapNumber: 1, cap: 4, items: [item(1, { skip: 'Closed' })] });
    expect(batch.status).toBe('done');
    await h.runner.tick();
    expect(h.started).toEqual([]);
  });

  it('stops the queue on request, keeping what already started, then clears the ended batch', async () => {
    const h = harness();
    h.runner.submit({ repo: 'o/r', mapNumber: 1, cap: 1, items: [1, 2, 3].map((number) => item(number)) });
    await h.runner.tick();
    const id = h.runner.snapshot()[0]?.id ?? '';
    expect(h.runner.stop(id)).toBe(true);
    expect(statuses(h)).toEqual(['1:started', '2:back-to-next', '3:back-to-next']);
    expect(h.runner.snapshot()[0]).toMatchObject({ status: 'stopped', stop: { kind: 'user' } });
    expect(h.runner.snapshot()[0]?.items[1]?.reason).toBe('Queue stopped');

    h.live.count = 0;
    await h.runner.tick();
    expect(h.started).toEqual([1]);

    expect(h.runner.stop(id)).toBe(true);
    expect(h.runner.snapshot()).toEqual([]);
    expect(h.runner.stop(id)).toBe(false);
  });

  it('lists batches newest first and keeps only the latest few ended ones', async () => {
    const h = harness();
    for (let index = 1; index <= 8; index += 1) {
      h.runner.submit({ repo: 'o/r', mapNumber: index, cap: 4, items: [item(index)] });
      await h.runner.tick();
      h.live.count = 0;
    }
    const batches = h.runner.snapshot();
    expect(batches).toHaveLength(5);
    expect(batches.map((batch) => batch.mapNumber)).toEqual([8, 7, 6, 5, 4]);
  });
});

describe('usage limit text', () => {
  it('keeps the first line and finds the reset time when there is one', () => {
    expect(parseUsageLimit('Usage limit reached. Resets at 4:00 PM.\nmore')).toEqual({ message: 'Usage limit reached. Resets at 4:00 PM.', resetsAt: '4:00 PM' });
    expect(parseUsageLimit('Usage limit reached (resets on Monday)')).toEqual({ message: 'Usage limit reached (resets on Monday)', resetsAt: 'Monday' });
    expect(parseUsageLimit('Quota exceeded')).toEqual({ message: 'Quota exceeded', resetsAt: null });
  });
});
