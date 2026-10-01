import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MapEvent } from '../mapWatch.js';
import type { Batch } from '../startNextRunner.js';
import { AutoMapStarter, autoCardNote, autoMapMarkHtml, autoMapMenuHtml, autoMapSetupHtml, readAutoMap, saveAutoMap } from './autoMap.js';
import type { AutoMapDeps, AutoMapStartBody } from './autoMap.js';
import type { ModelChoice } from './models.js';

const NOW = new Date('2026-10-01T10:00:00.000Z');
const MODEL: ModelChoice = { instanceId: 'codex', model: 'gpt-5.6-sol' };

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const items = new Map<string, string>();
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value) };
}

function next(ticket: number, extra: Partial<MapEvent> = {}): MapEvent {
  return { type: 'ticket-next', from: 'blocked', ticket: { number: ticket, title: `Ticket ${String(ticket)}` }, id: ticket, repo: 'octo/one', mapNumber: 5, at: '2026-10-01T10:05:00.000Z', ...extra } as MapEvent;
}

interface Harness {
  starter: AutoMapStarter;
  posts: Array<{ repo: string; body: AutoMapStartBody }>;
  toasts: string[];
  fallbacks: number[];
  reply: { ok: boolean; error: string | null };
}

function harness(extra: Partial<AutoMapDeps> = {}): Harness {
  const posts: Harness['posts'] = [];
  const toasts: string[] = [];
  const fallbacks: number[] = [];
  const reply = { ok: true, error: null as string | null };
  const starter = new AutoMapStarter({
    storage: memoryStorage(),
    post: async (repo, body) => {
      posts.push({ repo, body });
      return reply;
    },
    model: async (tier) => (tier === 'mid' ? MODEL : null),
    cap: () => 4,
    now: () => NOW,
    toast: (message) => toasts.push(message),
    fallback: (event) => fallbacks.push(event.ticket.number),
    ...extra,
  });
  return { starter, posts, toasts, fallbacks, reply };
}

function stopped(extra: Partial<Batch> = {}): Batch {
  return {
    id: 'b1',
    repo: 'octo/one',
    mapNumber: 5,
    cap: 4,
    createdAt: '2026-10-01T10:06:00.000Z',
    status: 'stopped',
    stop: { kind: 'usage-limit', ticketNumber: 11, message: 'Usage limit reached.', resetsAt: '4:00 PM' },
    auto: true,
    items: [],
    ...extra,
  };
}

describe('auto map storage', () => {
  it('is off for a map nobody set up', () => {
    expect(readAutoMap(memoryStorage(), 'octo/one', 5)).toEqual({ enabled: false, tier: 'auto', setUp: false, enabledAt: null });
  });

  it('saves one setting per map', () => {
    const storage = memoryStorage();
    saveAutoMap(storage, 'octo/one', 5, { enabled: true, tier: 'hard', setUp: true, enabledAt: NOW.toISOString() });
    expect(readAutoMap(storage, 'Octo/One', 5).tier).toBe('hard');
    expect(readAutoMap(storage, 'octo/one', 6).enabled).toBe(false);
  });

  it('survives garbage in storage', () => {
    expect(readAutoMap({ getItem: () => '{nope' }, 'octo/one', 5).enabled).toBe(false);
  });
});

describe('AutoMapStarter', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is off by default and takes no event', () => {
    const h = harness();
    expect(h.starter.take(next(12))).toBe(false);
  });

  it('hands off the tickets that became next as one batch, once the watcher events settle', async () => {
    const h = harness();
    h.starter.enable('octo/one', 5);
    expect(h.starter.take(next(14))).toBe(true);
    expect(h.starter.take(next(12))).toBe(true);
    expect(h.starter.take(next(12))).toBe(true);
    expect(h.posts).toEqual([]);
    await vi.advanceTimersByTimeAsync(500);
    expect(h.posts).toEqual([
      {
        repo: 'octo/one',
        body: { map: 5, cap: 4, auto: true, tickets: [{ ticket: 12, tier: 'mid', model: MODEL }, { ticket: 14, tier: 'mid', model: MODEL }] },
      },
    ]);
    expect(h.toasts).toEqual(['Auto map started #12, #14.']);
    expect(h.fallbacks).toEqual([]);
  });

  it('starts grilling and prototype tickets too, which wait for the user in their thread', async () => {
    // The auto map starts every ticket type (#124 amended in #163), so nothing filters on the ticket's type.
    const h = harness();
    h.starter.enable('octo/one', 5);
    expect(h.starter.take(next(30))).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(h.posts[0]?.body.tickets.map((entry) => entry.ticket)).toEqual([30]);
  });

  it('uses the map tier, and Auto runs on Mid', async () => {
    const h = harness({ model: async (tier) => ({ instanceId: 'x', model: tier }) });
    h.starter.enable('octo/one', 5, 'hard');
    h.starter.take(next(12));
    await vi.advanceTimersByTimeAsync(500);
    expect(h.posts[0]?.body.tickets).toEqual([{ ticket: 12, tier: 'hard', model: { instanceId: 'x', model: 'hard' } }]);
    h.starter.enable('octo/one', 5, 'auto');
    h.starter.take(next(13));
    await vi.advanceTimersByTimeAsync(500);
    expect(h.posts[1]?.body.tickets[0]).toMatchObject({ ticket: 13, tier: 'mid' });
  });

  it('sends the per-machine cap with the batch so the server queues what does not fit', async () => {
    const h = harness({ cap: () => 2 });
    h.starter.enable('octo/one', 5);
    h.starter.take(next(12));
    await vi.advanceTimersByTimeAsync(500);
    expect(h.posts[0]?.body.cap).toBe(2);
  });

  it('batches each map on its own', async () => {
    const h = harness();
    h.starter.enable('octo/one', 5);
    h.starter.enable('octo/one', 6);
    h.starter.take(next(12));
    h.starter.take(next(40, { mapNumber: 6 }));
    await vi.advanceTimersByTimeAsync(500);
    expect(h.posts.map((post) => [post.body.map, post.body.tickets.map((entry) => entry.ticket)])).toEqual([[5, [12]], [6, [40]]]);
  });

  it('does not start what became next while the app was closed', () => {
    const h = harness();
    h.starter.enable('octo/one', 5);
    expect(h.starter.take(next(12, { whileYouWereAway: true }))).toBe(false);
    expect(h.posts).toEqual([]);
  });

  it('hands a ticket back to the ordinary notification when the server refuses the batch', async () => {
    const h = harness();
    h.reply.ok = false;
    h.reply.error = 'Choose a local clone of octo/one before starting in T3 Code.';
    h.starter.enable('octo/one', 5);
    h.starter.take(next(12));
    await vi.advanceTimersByTimeAsync(500);
    expect(h.fallbacks).toEqual([12]);
    expect(h.toasts).toEqual(['Choose a local clone of octo/one before starting in T3 Code.']);
  });

  it('hands tickets back when the request itself fails', async () => {
    const h = harness({
      post: async () => {
        throw new Error('offline');
      },
    });
    h.starter.enable('octo/one', 5);
    h.starter.take(next(12));
    await vi.advanceTimersByTimeAsync(500);
    expect(h.fallbacks).toEqual([12]);
    expect(h.toasts).toEqual(['offline']);
  });

  it('starts nothing for a ticket whose map was turned off while it waited to be batched', async () => {
    const h = harness();
    h.starter.enable('octo/one', 5);
    h.starter.take(next(12));
    h.starter.disable('octo/one', 5);
    await vi.advanceTimersByTimeAsync(500);
    expect(h.posts).toEqual([]);
    expect(h.fallbacks).toEqual([12]);
  });

  describe('usage limit', () => {
    it('turns the auto map off on the first usage-limit stop and says which batch stopped it', () => {
      const h = harness();
      h.starter.enable('octo/one', 5);
      const batch = stopped();
      expect(h.starter.checkBatches([batch])).toEqual([batch]);
      expect(h.starter.setting('octo/one', 5)).toMatchObject({ enabled: false, setUp: true });
      // Off stays off, however many times the page re-reads the stopped batch.
      expect(h.starter.checkBatches([batch])).toEqual([]);
      expect(h.starter.take(next(12))).toBe(false);
      expect(h.posts).toEqual([]);
    });

    it('stays off until the user turns it back on, then ignores the old stop', () => {
      let clock = NOW;
      const h = harness({ now: () => clock });
      h.starter.enable('octo/one', 5);
      const old = stopped();
      h.starter.checkBatches([old]);
      expect(h.starter.setting('octo/one', 5).enabled).toBe(false);
      clock = new Date('2026-10-01T11:00:00.000Z');
      h.starter.enable('octo/one', 5);
      expect(h.starter.checkBatches([old])).toEqual([]);
      expect(h.starter.setting('octo/one', 5).enabled).toBe(true);
    });

    it('leaves a map alone when the stopped batch was started from the confirm list or by the user', () => {
      const h = harness();
      h.starter.enable('octo/one', 5);
      expect(h.starter.checkBatches([stopped({ auto: false }), stopped({ stop: { kind: 'user' } })])).toEqual([]);
      expect(h.starter.setting('octo/one', 5).enabled).toBe(true);
    });
  });
});

describe('auto map markup', () => {
  const on = { enabled: true, tier: 'auto' as const, enabledAt: NOW.toISOString(), setUp: true };

  it('says what a next card will do, and that a conversation ticket then waits for you', () => {
    expect(autoCardNote('frontier', 'task', on)).toBe('auto map will start this');
    expect(autoCardNote('frontier', null, on)).toBe('auto map will start this');
    expect(autoCardNote('frontier', 'grilling', on)).toBe('auto map starts this, then waits for you');
    expect(autoCardNote('frontier', 'prototype', on)).toBe('auto map starts this, then waits for you');
  });

  it('says nothing on cards that are not next, or while it is off', () => {
    expect(autoCardNote('blocked', 'task', on)).toBeNull();
    expect(autoCardNote('claimed', 'task', on)).toBeNull();
    expect(autoCardNote('frontier', 'task', { ...on, enabled: false })).toBeNull();
  });

  it('marks the map name only while it is on', () => {
    expect(autoMapMarkHtml(true)).toContain('auto');
    expect(autoMapMarkHtml(false)).toBe('');
  });

  it('shows the switch, and the settings link only once it was set up', () => {
    const fresh = autoMapMenuHtml({ enabled: false, setUp: false, tier: 'auto' });
    expect(fresh).toContain('role="switch" aria-checked="false"');
    expect(fresh).toContain('The first time, you choose how it runs.');
    expect(fresh).not.toContain('data-nav-auto-settings');
    const done = autoMapMenuHtml({ enabled: true, setUp: true, tier: 'hard' });
    expect(done).toContain('aria-checked="true"');
    expect(done).toContain('Tier: Hard.');
    expect(done).toContain('data-nav-auto-settings');
  });

  it('explains the auto map in the setup dialog, with one Auto, Simple, Mid, Hard tier choice', () => {
    const html = autoMapSetupHtml(5, false, 'auto', 4);
    expect(html).toContain('Turn on auto map · #5');
    expect(html).toContain('Grilling and prototype tickets');
    expect(html).toContain('4 running on this machine');
    expect(html).toContain('usage limit');
    expect(html).toContain('only runs while the app is open');
    for (const tier of ['auto', 'simple', 'mid', 'hard']) expect(html).toContain(`data-am-tier="${tier}"`);
    expect(autoMapSetupHtml(5, true, 'mid', 4)).toContain('Auto map settings · #5');
  });
});
