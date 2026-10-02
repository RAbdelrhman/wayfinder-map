import { describe, expect, it } from 'vitest';

import { autoMapKey, autoMapUsageStop, autoStartTickets, DEFAULT_AUTO_MAP, parseAutoMapSetting, resolveAutoMapTier, turnedOff, turnedOn } from './autoMap.js';
import type { AutoMapSetting } from './autoMap.js';
import type { MapEvent } from './mapWatch.js';
import type { Batch } from './startNextRunner.js';

const ON_AT = '2026-10-01T10:00:00.000Z';
const on: AutoMapSetting = { enabled: true, tier: 'auto', setUp: true, enabledAt: ON_AT };

function next(ticket: number, extra: Partial<MapEvent> = {}): MapEvent {
  return { type: 'ticket-next', from: 'blocked', ticket: { number: ticket, title: `Ticket ${String(ticket)}` }, id: ticket, repo: 'octo/one', mapNumber: 5, at: '2026-10-01T10:05:00.000Z', ...extra } as MapEvent;
}

function batch(extra: Partial<Batch> = {}): Batch {
  return {
    id: 'b1',
    repo: 'octo/one',
    mapNumber: 5,
    cap: 4,
    createdAt: '2026-10-01T10:06:00.000Z',
    status: 'stopped',
    stop: { kind: 'usage-limit', ticketNumber: 11, message: 'Usage limit reached.', resetsAt: null },
    auto: true,
    items: [],
    ...extra,
  };
}

describe('auto map setting', () => {
  it('is off, set to Auto and not yet set up by default', () => {
    expect(parseAutoMapSetting(undefined)).toEqual({ enabled: false, tier: 'auto', setUp: false, enabledAt: null });
    expect(DEFAULT_AUTO_MAP.enabled).toBe(false);
  });

  it('keeps a saved setting and drops anything odd', () => {
    expect(parseAutoMapSetting(on)).toEqual(on);
    expect(parseAutoMapSetting({ enabled: true, tier: 'hard', setUp: true, enabledAt: ON_AT }).tier).toBe('hard');
    expect(parseAutoMapSetting({ enabled: true, tier: 'huge', setUp: true, enabledAt: ON_AT }).tier).toBe('auto');
    // Nothing can be on without a moment it was turned on.
    expect(parseAutoMapSetting({ enabled: true, tier: 'mid', setUp: true, enabledAt: 'later' }).enabled).toBe(false);
    expect(parseAutoMapSetting('yes')).toEqual(DEFAULT_AUTO_MAP);
  });

  it('keys a map by lower-cased repository and number', () => {
    expect(autoMapKey('Octo/One', 5)).toBe('octo/one#5');
  });

  it('falls back to Mid for Auto when a ticket cannot be rated', () => {
    expect(resolveAutoMapTier('auto')).toBe('mid');
    expect(resolveAutoMapTier('simple')).toBe('simple');
    expect(resolveAutoMapTier('hard')).toBe('hard');
  });
});

describe('autoStartTickets', () => {
  it('starts every ticket that became next, in ticket order and once each', () => {
    expect(autoStartTickets([next(14), next(12), next(14)], on)).toEqual([12, 14]);
  });

  it('starts nothing while the auto map is off', () => {
    expect(autoStartTickets([next(12)], { ...on, enabled: false })).toEqual([]);
    expect(autoStartTickets([next(12)], DEFAULT_AUTO_MAP)).toEqual([]);
  });

  it('ignores events that are not a ticket becoming next', () => {
    const closed = { type: 'ticket-closed', ticket: { number: 3, title: 'Closed' }, id: 1, repo: 'octo/one', mapNumber: 5, at: '2026-10-01T10:05:00.000Z' } as MapEvent;
    expect(autoStartTickets([closed, next(12)], on)).toEqual([12]);
  });

  it('starts nothing from a catch-up after a quit, which only reports what became next', () => {
    expect(autoStartTickets([next(12, { whileYouWereAway: true }), next(13)], on)).toEqual([13]);
  });

  it('ignores events from before it was turned on', () => {
    expect(autoStartTickets([next(12, { at: '2026-10-01T09:59:59.000Z' }), next(13, { at: ON_AT })], on)).toEqual([13]);
  });
});

describe('autoMapUsageStop', () => {
  it('finds the usage-limit stop of an auto batch since the map was turned on', () => {
    const stopped = batch();
    expect(autoMapUsageStop([batch({ id: 'other', mapNumber: 6 }), stopped], 'Octo/One', 5, on)).toBe(stopped);
  });

  it('ignores a stop from before the map was turned back on', () => {
    expect(autoMapUsageStop([batch({ createdAt: '2026-10-01T09:00:00.000Z' })], 'octo/one', 5, on)).toBeUndefined();
  });

  it('ignores a batch started from the confirm list, a user stop and another map', () => {
    expect(autoMapUsageStop([batch({ auto: false })], 'octo/one', 5, on)).toBeUndefined();
    expect(autoMapUsageStop([batch({ stop: { kind: 'user' } })], 'octo/one', 5, on)).toBeUndefined();
    expect(autoMapUsageStop([batch({ mapNumber: 6 })], 'octo/one', 5, on)).toBeUndefined();
  });

  it('has nothing to turn off when the auto map is already off', () => {
    expect(autoMapUsageStop([batch()], 'octo/one', 5, { ...on, enabled: false })).toBeUndefined();
  });
});

describe('turning it on and off', () => {
  const now = new Date('2026-10-02T09:00:00.000Z');

  it('turning it on sets it up and stamps the moment, so only later events count', () => {
    expect(turnedOn(DEFAULT_AUTO_MAP, now)).toEqual({ enabled: true, tier: 'auto', setUp: true, enabledAt: now.toISOString() });
    expect(turnedOn(on, now, 'hard')).toEqual({ enabled: true, tier: 'hard', setUp: true, enabledAt: now.toISOString() });
    expect(autoStartTickets([next(12)], turnedOn(DEFAULT_AUTO_MAP, now))).toEqual([]);
  });

  it('keeps the tier it had when none is given', () => {
    expect(turnedOn({ ...on, tier: 'simple' }, now).tier).toBe('simple');
  });

  it('turning it off keeps the rest, so the toggle flips back on directly', () => {
    expect(turnedOff(on)).toEqual({ ...on, enabled: false });
  });
});
