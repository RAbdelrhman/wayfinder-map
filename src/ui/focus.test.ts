import { describe, expect, it } from 'vitest';

import type { Ticket } from '../types.js';
import { lineage, matchesFilter, matchesQuery, onLineage, syncedLabel } from './focus.js';

function ticket(number: number, blockedBy: number[] = [], extra: Partial<Ticket> = {}): Ticket {
  return {
    number,
    title: `#${String(number)}`,
    url: '',
    body: '',
    type: 'task',
    labels: [],
    open: true,
    assignee: null,
    blockedBy,
    openBlockers: blockedBy,
    state: blockedBy.length > 0 ? 'blocked' : 'frontier',
    ...extra,
  };
}

// 4 ─┐
// 5 ─┼─> 7 ─> 8
// 6 ─┘        ^
// 4 ──────────┘      9 stands alone, 10 only waits on an off-map issue
const MAP = [ticket(4), ticket(5), ticket(6), ticket(7, [4, 5, 6]), ticket(8, [4, 7]), ticket(9), ticket(10, [99])];

describe('lineage', () => {
  it('walks upstream and downstream through the whole chain', () => {
    const chain = lineage(MAP, 7);
    expect([...chain.upstream].sort()).toEqual([4, 5, 6]);
    expect([...chain.downstream]).toEqual([8]);
  });

  it('reaches indirect blockers', () => {
    expect([...lineage(MAP, 8).upstream].sort()).toEqual([4, 5, 6, 7]);
    expect([...lineage(MAP, 5).downstream].sort()).toEqual([7, 8]);
  });

  it('ignores blockers that are not on the map', () => {
    expect(lineage(MAP, 10).upstream.size).toBe(0);
  });

  it('survives a cycle', () => {
    const chain = lineage([ticket(1, [2]), ticket(2, [1])], 1);
    expect([...chain.upstream]).toEqual([2]);
    expect([...chain.downstream]).toEqual([2]);
  });
});

describe('onLineage', () => {
  it('keeps the edges that lead into and out of the focus', () => {
    const chain = lineage(MAP, 7);
    expect(onLineage({ from: 5, to: 7 }, 7, chain)).toBe(true);
    expect(onLineage({ from: 7, to: 8 }, 7, chain)).toBe(true);
  });

  it('drops a side edge between two related tickets that skips the focus', () => {
    expect(onLineage({ from: 4, to: 8 }, 7, lineage(MAP, 7))).toBe(false);
  });

  it('keeps side edges that still end at the focus', () => {
    expect(onLineage({ from: 4, to: 8 }, 8, lineage(MAP, 8))).toBe(true);
  });
});

describe('matchesFilter', () => {
  it('matches by state, type or missing type', () => {
    expect(matchesFilter(ticket(1), null)).toBe(true);
    expect(matchesFilter(ticket(1), 'frontier')).toBe(true);
    expect(matchesFilter(ticket(1), 'blocked')).toBe(false);
    expect(matchesFilter(ticket(1), 'task')).toBe(true);
    expect(matchesFilter(ticket(1, [], { type: null }), 'untyped')).toBe(true);
    expect(matchesFilter(ticket(1), 'untyped')).toBe(false);
    expect(matchesFilter(ticket(1), 'in-t3', new Set([1]))).toBe(true);
    expect(matchesFilter(ticket(2), 'in-t3', new Set([1]))).toBe(false);
  });
});

describe('matchesQuery', () => {
  const home = ticket(18, [], { title: 'What does the home page look like?' });

  it('matches everything when empty', () => {
    expect(matchesQuery(home, '  ')).toBe(true);
  });

  it('matches numbers by prefix, with or without a hash', () => {
    expect(matchesQuery(home, '1')).toBe(true);
    expect(matchesQuery(home, '#18')).toBe(true);
    expect(matchesQuery(home, '8')).toBe(false);
  });

  it('matches words in the title, ignoring case', () => {
    expect(matchesQuery(home, 'Home Page')).toBe(true);
    expect(matchesQuery(home, 'server')).toBe(false);
  });
});

describe('syncedLabel', () => {
  it('rounds down to coarse steps', () => {
    expect(syncedLabel(20_000)).toBe('Synced just now');
    expect(syncedLabel(5 * 60_000 + 10)).toBe('Synced 5m ago');
    expect(syncedLabel(3 * 3_600_000)).toBe('Synced 3h ago');
  });
});
