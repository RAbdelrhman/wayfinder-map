import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  applyStallSettings,
  DEFAULT_STALL_SETTINGS,
  markStalls,
  memoryStallSettings,
  readStallSettings,
  stalledTickets,
  StallSettingsStore,
} from './stalled.js';
import type { StallHandOff, StallTicket, TicketActivity } from './stalled.js';
import type { MapSnapshot, WayfinderMap } from './types.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-28T12:00:00.000Z');
const ago = (ms: number): string => new Date(NOW.getTime() - ms).toISOString();

function ticket(number: number, state: StallTicket['state'], updatedAt: string | null): StallTicket {
  return { number, state, updatedAt };
}

function handOff(ticketNumber: number, overrides: Partial<StallHandOff> = {}): StallHandOff {
  return {
    ticketNumber,
    threadId: 'thread-1',
    status: 'failed',
    createdAt: ago(10 * DAY),
    updatedAt: ago(10 * DAY),
    terminalAt: ago(9 * DAY),
    pullRequests: [],
    ...overrides,
  };
}

const none = new Map<number, TicketActivity>();

describe('untouched claim', () => {
  it('marks a claim at exactly 7 days, not a moment before', () => {
    expect(stalledTickets([ticket(1, 'claimed', ago(7 * DAY))], [], none, DEFAULT_STALL_SETTINGS, NOW)).toEqual([
      { ticket: 1, kind: 'untouched-claim', since: ago(7 * DAY) },
    ]);
    expect(stalledTickets([ticket(1, 'claimed', ago(7 * DAY - 1))], [], none, DEFAULT_STALL_SETTINGS, NOW)).toEqual([]);
  });

  it('only marks claimed tickets', () => {
    const tickets = (['frontier', 'blocked', 'done'] as const).map((state, index) => ticket(index + 1, state, ago(30 * DAY)));
    expect(stalledTickets(tickets, [], none, DEFAULT_STALL_SETTINGS, NOW)).toEqual([]);
  });

  it('follows its setting', () => {
    const tickets = [ticket(1, 'claimed', ago(4 * DAY))];
    expect(stalledTickets(tickets, [], none, DEFAULT_STALL_SETTINGS, NOW)).toEqual([]);
    expect(stalledTickets(tickets, [], none, { ...DEFAULT_STALL_SETTINGS, untouchedClaimDays: 3 }, NOW)).toEqual([
      { ticket: 1, kind: 'untouched-claim', since: ago(4 * DAY) },
    ]);
    expect(stalledTickets([ticket(1, 'claimed', ago(10 * DAY))], [], none, { ...DEFAULT_STALL_SETTINGS, untouchedClaimDays: 14 }, NOW)).toEqual([]);
  });

  it('counts a commit on its branch as activity', () => {
    const tickets = [ticket(1, 'claimed', ago(20 * DAY))];
    const recent = new Map([[1, { pullRequest: false, lastCommitAt: ago(2 * DAY) }]]);
    expect(stalledTickets(tickets, [], recent, DEFAULT_STALL_SETTINGS, NOW)).toEqual([]);
    const old = new Map([[1, { pullRequest: false, lastCommitAt: ago(8 * DAY) }]]);
    expect(stalledTickets(tickets, [], old, DEFAULT_STALL_SETTINGS, NOW)).toEqual([{ ticket: 1, kind: 'untouched-claim', since: ago(8 * DAY) }]);
  });

  it('never marks a ticket with a PR, from GitHub or from a hand-off', () => {
    const tickets = [ticket(1, 'claimed', ago(20 * DAY))];
    expect(stalledTickets(tickets, [], new Map([[1, { pullRequest: true, lastCommitAt: null }]]), DEFAULT_STALL_SETTINGS, NOW)).toEqual([]);
    const withPullRequest = handOff(1, { status: 'finished', pullRequests: [{ url: 'https://github.com/o/r/pull/2' }] });
    expect(stalledTickets(tickets, [withPullRequest], none, DEFAULT_STALL_SETTINGS, NOW)).toEqual([]);
  });

  it('never marks a ticket with a live hand-off', () => {
    const live = handOff(1, { status: 'running', createdAt: ago(20 * DAY), terminalAt: null });
    expect(stalledTickets([ticket(1, 'claimed', ago(20 * DAY))], [live], none, DEFAULT_STALL_SETTINGS, NOW)).toEqual([]);
  });

  it('clears when the ticket becomes active again', () => {
    const stalled = [ticket(1, 'claimed', ago(9 * DAY))];
    expect(stalledTickets(stalled, [], none, DEFAULT_STALL_SETTINGS, NOW)).toHaveLength(1);
    const commented = [ticket(1, 'claimed', ago(1 * DAY))];
    expect(stalledTickets(commented, [], none, DEFAULT_STALL_SETTINGS, NOW)).toEqual([]);
  });

  it('leaves a ticket alone when GitHub did not say when it changed', () => {
    expect(stalledTickets([ticket(1, 'claimed', null)], [], none, DEFAULT_STALL_SETTINGS, NOW)).toEqual([]);
  });
});

describe('dead hand-off', () => {
  it('marks a hand-off failed exactly 7 days ago, not a moment before', () => {
    const tickets = [ticket(1, 'claimed', ago(10 * DAY))];
    expect(stalledTickets(tickets, [handOff(1, { terminalAt: ago(7 * DAY) })], none, DEFAULT_STALL_SETTINGS, NOW)).toEqual([
      { ticket: 1, kind: 'dead-hand-off', since: ago(7 * DAY) },
    ]);
    expect(stalledTickets(tickets, [handOff(1, { terminalAt: ago(7 * DAY - 1) })], none, DEFAULT_STALL_SETTINGS, NOW)).toEqual([]);
  });

  it('marks a hand-off that never got a thread, from when it was made', () => {
    const noThread = handOff(1, { threadId: null, status: 'untracked', createdAt: ago(8 * DAY), terminalAt: null });
    expect(stalledTickets([ticket(1, 'frontier', ago(8 * DAY))], [noThread], none, DEFAULT_STALL_SETTINGS, NOW)).toEqual([
      { ticket: 1, kind: 'dead-hand-off', since: ago(8 * DAY) },
    ]);
  });

  it('falls back to when the record last changed for a failure without an end time', () => {
    const failed = handOff(1, { terminalAt: null, updatedAt: ago(8 * DAY) });
    expect(stalledTickets([ticket(1, 'frontier', ago(10 * DAY))], [failed], none, DEFAULT_STALL_SETTINGS, NOW)).toEqual([
      { ticket: 1, kind: 'dead-hand-off', since: ago(8 * DAY) },
    ]);
  });

  it('follows its own setting, apart from the claim one', () => {
    const tickets = [ticket(1, 'frontier', ago(10 * DAY))];
    const failed = [handOff(1, { terminalAt: ago(4 * DAY) })];
    expect(stalledTickets(tickets, failed, none, DEFAULT_STALL_SETTINGS, NOW)).toEqual([]);
    expect(stalledTickets(tickets, failed, none, { ...DEFAULT_STALL_SETTINGS, deadHandOffDays: 3 }, NOW)).toEqual([
      { ticket: 1, kind: 'dead-hand-off', since: ago(4 * DAY) },
    ]);
    expect(stalledTickets(tickets, failed, none, { untouchedClaimDays: 3, deadHandOffDays: 7 }, NOW)).toEqual([]);
  });

  it('clears once the hand-off is retried', () => {
    const tickets = [ticket(1, 'claimed', ago(10 * DAY))];
    const failed = handOff(1);
    const retry = handOff(1, { threadId: 'thread-2', status: 'running', createdAt: ago(1 * DAY), terminalAt: null });
    expect(stalledTickets(tickets, [failed], none, DEFAULT_STALL_SETTINGS, NOW)).toHaveLength(1);
    expect(stalledTickets(tickets, [failed, retry], none, DEFAULT_STALL_SETTINGS, NOW)).toEqual([]);
  });

  it('judges only the newest attempt, so a retry that failed too counts from its own failure', () => {
    const tickets = [ticket(1, 'frontier', ago(20 * DAY))];
    const first = handOff(1, { createdAt: ago(20 * DAY), terminalAt: ago(19 * DAY) });
    const second = handOff(1, { threadId: 'thread-2', createdAt: ago(3 * DAY), terminalAt: ago(3 * DAY) });
    expect(stalledTickets(tickets, [first, second], none, DEFAULT_STALL_SETTINGS, NOW)).toEqual([]);
  });

  it('clears when someone works on the ticket after the hand-off died', () => {
    const failed = [handOff(1, { terminalAt: ago(9 * DAY) })];
    expect(stalledTickets([ticket(1, 'claimed', ago(2 * DAY))], failed, none, DEFAULT_STALL_SETTINGS, NOW)).toEqual([]);
    const committed = new Map([[1, { pullRequest: false, lastCommitAt: ago(8 * DAY) }]]);
    expect(stalledTickets([ticket(1, 'claimed', ago(10 * DAY))], failed, committed, DEFAULT_STALL_SETTINGS, NOW)).toEqual([
      { ticket: 1, kind: 'untouched-claim', since: ago(8 * DAY) },
    ]);
  });

  it('never marks a hand-off that opened a PR, or a closed ticket', () => {
    const withPullRequest = handOff(1, { pullRequests: [{ url: 'https://github.com/o/r/pull/3' }] });
    expect(stalledTickets([ticket(1, 'claimed', ago(10 * DAY))], [withPullRequest], none, DEFAULT_STALL_SETTINGS, NOW)).toEqual([]);
    expect(stalledTickets([ticket(1, 'done', ago(10 * DAY))], [handOff(1)], none, DEFAULT_STALL_SETTINGS, NOW)).toEqual([]);
  });

  it('ignores hand-offs for other tickets', () => {
    expect(stalledTickets([ticket(1, 'frontier', ago(10 * DAY))], [handOff(2)], none, DEFAULT_STALL_SETTINGS, NOW)).toEqual([]);
  });
});

function map(number: number, tickets: WayfinderMap['tickets'], ticketsLoaded = true): WayfinderMap {
  return {
    number,
    title: `Map ${String(number)}`,
    url: '',
    body: '',
    open: true,
    author: 'octo',
    visibility: 'private',
    sections: { destination: '', notes: '', decisions: '', fog: '', outOfScope: '' },
    tickets,
    outside: [],
    criticalPath: { tickets: [], remaining: 0 },
    stalled: [],
    pullRequests: [],
    settled: null,
    ticketsLoaded,
  };
}

function mapTicket(number: number, state: 'claimed' | 'frontier', updatedAt: string): WayfinderMap['tickets'][number] {
  return { number, title: '', url: '', body: '', type: 'task', labels: [], open: true, assignee: state === 'claimed' ? 'octo' : null, blockedBy: [], openBlockers: [], state, updatedAt };
}

describe('markStalls', () => {
  const snapshot = (maps: WayfinderMap[]): MapSnapshot => ({ repo: 'o/r', fetchedAt: NOW.toISOString(), maps, hiddenMaps: 0, publicMaps: [], warnings: [] });

  it('marks each loaded map, asking GitHub for branches and PRs only when something looks stalled', async () => {
    const activity = vi.fn(() => Promise.resolve(new Map([[2, { pullRequest: true, lastCommitAt: null }]])));
    const marked = await markStalls(snapshot([map(1, [mapTicket(1, 'claimed', ago(8 * DAY)), mapTicket(2, 'claimed', ago(8 * DAY))])]), {
      handOffs: () => Promise.resolve([]),
      activity,
      settings: DEFAULT_STALL_SETTINGS,
      now: NOW,
    });
    expect(activity).toHaveBeenCalledWith('o/r');
    expect(marked.maps[0]?.stalled).toEqual([{ ticket: 1, kind: 'untouched-claim', since: ago(8 * DAY) }]);
  });

  it('skips GitHub when nothing could have stalled', async () => {
    const activity = vi.fn(() => Promise.resolve(new Map<number, TicketActivity>()));
    const marked = await markStalls(snapshot([map(1, [mapTicket(1, 'claimed', ago(1 * DAY))]), map(2, [], false)]), {
      handOffs: () => Promise.resolve([]),
      activity,
      settings: DEFAULT_STALL_SETTINGS,
      now: NOW,
    });
    expect(activity).not.toHaveBeenCalled();
    expect(marked.maps.map((each) => each.stalled)).toEqual([[], []]);
  });

  it('changes with the settings it is given', async () => {
    const input = snapshot([map(1, [mapTicket(1, 'claimed', ago(5 * DAY))])]);
    const sources = { handOffs: () => Promise.resolve([]), activity: () => Promise.resolve(new Map<number, TicketActivity>()), now: NOW };
    expect((await markStalls(input, { ...sources, settings: DEFAULT_STALL_SETTINGS })).maps[0]?.stalled).toEqual([]);
    expect((await markStalls(input, { ...sources, settings: { ...DEFAULT_STALL_SETTINGS, untouchedClaimDays: 3 } })).maps[0]?.stalled).toHaveLength(1);
  });

  it('still marks from hand-offs and issues when GitHub cannot be read', async () => {
    const marked = await markStalls(snapshot([map(1, [mapTicket(1, 'claimed', ago(8 * DAY))])]), {
      handOffs: () => Promise.resolve([]),
      activity: () => Promise.reject(new Error('rate limited')),
      settings: DEFAULT_STALL_SETTINGS,
      now: NOW,
    });
    expect(marked.maps[0]?.stalled).toHaveLength(1);
  });
});

describe('stall settings', () => {
  it('reads saved settings, with 7 days for anything missing or unknown', () => {
    expect(readStallSettings(undefined)).toEqual({ untouchedClaimDays: 7, deadHandOffDays: 7 });
    expect(readStallSettings({ untouchedClaimDays: 14, deadHandOffDays: 5 })).toEqual({ untouchedClaimDays: 14, deadHandOffDays: 7 });
  });

  it('applies a patch of known choices, and refuses anything else', () => {
    expect(applyStallSettings(DEFAULT_STALL_SETTINGS, { deadHandOffDays: 3 })).toEqual({ untouchedClaimDays: 7, deadHandOffDays: 3 });
    expect(applyStallSettings(DEFAULT_STALL_SETTINGS, { deadHandOffDays: 4 })).toBeNull();
    expect(applyStallSettings(DEFAULT_STALL_SETTINGS, {})).toBeNull();
  });

  it('keeps them in a file', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'stalls-')), 'nested', 'stalls.json');
    const store = new StallSettingsStore(path);
    expect(await store.get()).toEqual(DEFAULT_STALL_SETTINGS);
    expect(await store.update({ untouchedClaimDays: 30 })).toEqual({ untouchedClaimDays: 30, deadHandOffDays: 7 });
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ untouchedClaimDays: 30, deadHandOffDays: 7 });
    expect(await new StallSettingsStore(path).get()).toEqual({ untouchedClaimDays: 30, deadHandOffDays: 7 });
  });

  it('keeps them in memory for tests', async () => {
    const store = memoryStallSettings();
    await store.update({ deadHandOffDays: 14 });
    expect(await store.get()).toEqual({ untouchedClaimDays: 7, deadHandOffDays: 14 });
  });
});
