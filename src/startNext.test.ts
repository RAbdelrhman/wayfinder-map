import { describe, expect, it } from 'vitest';

import { DEFAULT_HAND_OFF_CAP, normalizeCap, planStartNext, startNextFooter, startNextLabel } from './startNext.js';
import type { StartNextInput, StartNextTicket } from './startNext.js';
import type { TicketState, TicketType } from './types.js';

function ticket(number: number, type: TicketType | null = 'task', state: TicketState = 'frontier'): StartNextTicket {
  return { number, title: `Ticket ${String(number)}`, type, state };
}

function plan(overrides: Partial<StartNextInput> & Pick<StartNextInput, 'tickets'>) {
  return planStartNext({ live: new Map(), inBatch: new Set(), running: 0, cap: 4, ...overrides });
}

const kinds = (result: ReturnType<typeof plan>): string[] => result.rows.map((row) => `${String(row.ticket.number)}:${row.kind}`);

describe('planStartNext ticket selection', () => {
  it('takes only tickets that are next, in number order', () => {
    const result = plan({ tickets: [ticket(9), ticket(3, 'research'), ticket(4, 'task', 'blocked'), ticket(5, 'task', 'claimed'), ticket(6, 'task', 'done'), ticket(1)] });
    expect(result.rows.map((row) => row.ticket.number)).toEqual([1, 3, 9]);
  });

  it('starts task, research and untyped tickets', () => {
    const result = plan({ tickets: [ticket(1, 'task'), ticket(2, 'research'), ticket(3, null)] });
    expect(kinds(result)).toEqual(['1:start', '2:start', '3:start']);
    expect(result.ready).toBe(3);
  });

  it('leaves grilling and prototype tickets unticked as "needs you", after the ready ones', () => {
    const result = plan({ tickets: [ticket(1, 'grilling'), ticket(2, 'prototype'), ticket(3, 'task')] });
    expect(result.rows.map((row) => [row.ticket.number, row.group, row.kind])).toEqual([
      [3, 'ready', 'start'],
      [1, 'needs-you', 'unticked'],
      [2, 'needs-you', 'unticked'],
    ]);
    expect(result.rows[1]?.reason).toBe('Grilling tickets wait for you in the thread');
    expect(result.rows[2]?.reason).toBe('Prototype tickets wait for you in the thread');
    expect(result.needsYou).toBe(2);
    expect(result.picked).toBe(1);
  });

  it('lets the user tick a needs-you ticket or untick a ready one', () => {
    const result = plan({
      tickets: [ticket(1, 'grilling'), ticket(2, 'task'), ticket(3, 'task')],
      ticked: new Map([[1, true], [2, false]]),
    });
    expect(kinds(result)).toEqual(['2:unticked', '3:start', '1:start']);
    expect(result.picked).toBe(2);
  });

  it('skips a ticket that already has a live hand-off and says why', () => {
    const result = plan({ tickets: [ticket(1), ticket(2)], live: new Map([[2, 'working 12m ago']]) });
    const skipped = result.rows.find((row) => row.ticket.number === 2);
    expect(skipped).toMatchObject({ group: 'skipped', kind: 'skipped', ticked: false, reason: 'Already in T3 Code · working 12m ago' });
    expect(result.skipped).toBe(1);
    expect(result.picked).toBe(1);
  });

  it('skips a live ticket even when it is a grilling ticket the user ticked', () => {
    const result = plan({ tickets: [ticket(1, 'grilling')], live: new Map([[1, 'needs you']]), ticked: new Map([[1, true]]) });
    expect(result.rows[0]).toMatchObject({ kind: 'skipped', group: 'skipped' });
    expect(result.needsYou).toBe(0);
  });

  it('skips a ticket an earlier batch has queued, which has no hand-off yet', () => {
    const result = plan({ tickets: [ticket(1), ticket(2)], inBatch: new Set([1]) });
    expect(result.rows.find((row) => row.ticket.number === 1)).toMatchObject({ kind: 'skipped', reason: 'Already in a running batch' });
    expect(result.picked).toBe(1);
  });

  it('keeps skipped rows last and out of the ready count', () => {
    const result = plan({ tickets: [ticket(1), ticket(2, 'grilling'), ticket(3)], live: new Map([[1, 'working']]) });
    expect(result.rows.map((row) => row.group)).toEqual(['ready', 'needs-you', 'skipped']);
    expect(result.ready).toBe(1);
  });
});

describe('planStartNext cap', () => {
  const six = [1, 2, 3, 4, 5, 6].map((number) => ticket(number));

  it('starts everything while it fits under the cap', () => {
    const result = plan({ tickets: six.slice(0, 3), running: 1 });
    expect(kinds(result)).toEqual(['1:start', '2:start', '3:start']);
    expect(result.queued).toBe(0);
  });

  it('starts up to the free slots and queues the rest in order', () => {
    const result = plan({ tickets: six, running: 2 });
    expect(kinds(result)).toEqual(['1:start', '2:start', '3:queue', '4:queue', '5:queue', '6:queue']);
    expect(result.rows.filter((row) => row.kind === 'queue').map((row) => row.queuePosition)).toEqual([1, 2, 3, 4]);
    expect(result.rows[2]?.reason).toBe('Starts when a slot frees');
    expect(result).toMatchObject({ start: 2, queued: 4, picked: 6, running: 2, cap: 4 });
  });

  it('queues all of them when the machine is already at the cap', () => {
    const result = plan({ tickets: six.slice(0, 2), running: 4 });
    expect(kinds(result)).toEqual(['1:queue', '2:queue']);
    expect(result.start).toBe(0);
  });

  it('treats running over the cap as no free slots, never negative', () => {
    const result = plan({ tickets: six.slice(0, 1), running: 9 });
    expect(kinds(result)).toEqual(['1:queue']);
  });

  it('does not let unticked or skipped rows use a slot', () => {
    const result = plan({
      tickets: [ticket(1), ticket(2, 'grilling'), ticket(3), ticket(4)],
      live: new Map([[1, 'working']]),
      running: 2,
      cap: 3,
    });
    expect(kinds(result)).toEqual(['3:start', '4:queue', '2:unticked', '1:skipped']);
  });

  it('counts ticked needs-you tickets against the cap after the ready ones', () => {
    const result = plan({ tickets: [ticket(1, 'prototype'), ticket(2)], cap: 1, ticked: new Map([[1, true]]) });
    expect(kinds(result)).toEqual(['2:start', '1:queue']);
  });

  it('honours a custom cap and falls back to 4 for an unusable one', () => {
    expect(plan({ tickets: six, cap: 6 }).queued).toBe(0);
    expect(plan({ tickets: six, cap: 1 }).start).toBe(1);
    expect(plan({ tickets: six, cap: 0 }).cap).toBe(DEFAULT_HAND_OFF_CAP);
    expect(plan({ tickets: six, cap: 2.5 }).cap).toBe(DEFAULT_HAND_OFF_CAP);
  });
});

describe('normalizeCap', () => {
  it('accepts whole numbers from 1 to 16 and defaults the rest', () => {
    expect([1, 4, 16].map(normalizeCap)).toEqual([1, 4, 16]);
    expect([0, 17, -1, 3.5, Number.NaN, '4', null, undefined].map(normalizeCap)).toEqual(Array(8).fill(DEFAULT_HAND_OFF_CAP));
  });
});

describe('start next wording', () => {
  it('labels the menu item with how many are ready, or nothing when no ticket is next', () => {
    expect(startNextLabel(plan({ tickets: [ticket(1), ticket(2), ticket(3, 'grilling')] }))).toBe('Start next · 2 ready');
    expect(startNextLabel(plan({ tickets: [ticket(3, 'grilling')] }))).toBe('Start next · 0 ready');
    expect(startNextLabel(plan({ tickets: [ticket(1)], live: new Map([[1, 'working']]) }))).toBe('Start next · 0 ready');
    expect(startNextLabel(plan({ tickets: [ticket(1, 'task', 'blocked')] }))).toBeNull();
  });

  it('writes the footer with the machine load', () => {
    const result = plan({ tickets: [1, 2, 3, 4, 5].map((number) => ticket(number)), running: 2 });
    expect(startNextFooter(result)).toEqual({ counts: '2 start now · 3 queued', machine: '2 of 4 running on this machine' });
    expect(startNextFooter(plan({ tickets: [ticket(1)] }))).toEqual({ counts: '1 start now', machine: '0 of 4 running on this machine' });
  });
});
