import { describe, expect, it, vi } from 'vitest';

import type { AutoMapSetting } from '../autoMap.js';
import type { AutoMapNotice } from '../autoMapStore.js';
import type { AutoMapView } from '../autoMapService.js';
import type { MapEvent } from '../mapWatch.js';
import { AutoMapClient, autoCardNote, autoMapMarkHtml, autoMapMenuHtml, autoMapSetupHtml, LEGACY_AUTO_MAP_KEY } from './autoMap.js';
import type { AutoMapClientDeps, AutoMapStop } from './autoMap.js';

const NOW = new Date('2026-10-01T10:00:00.000Z');
const ON: AutoMapSetting = { enabled: true, tier: 'auto', setUp: true, enabledAt: NOW.toISOString() };

function next(ticket: number, extra: Partial<MapEvent> = {}): MapEvent {
  return { type: 'ticket-next', from: 'blocked', ticket: { number: ticket, title: `Ticket ${String(ticket)}` }, id: ticket, repo: 'octo/one', mapNumber: 5, at: '2026-10-01T10:05:00.000Z', ...extra } as MapEvent;
}

function view(maps: AutoMapView['maps'] = [], notices: AutoMapNotice[] = []): AutoMapView {
  return { maps, settings: { cap: null, tierModels: null, rater: null, calibration: null }, notices };
}

function entry(extra: Partial<AutoMapView['maps'][number]> = {}): AutoMapView['maps'][number] {
  return { repo: 'octo/one', mapNumber: 5, stop: null, ...ON, ...extra };
}

function memoryStorage(initial: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const items = new Map(Object.entries(initial));
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value), removeItem: (key) => void items.delete(key) };
}

/** A server that answers with a view the test sets, or does not answer at all. */
function harness(extra: Partial<AutoMapClientDeps> = {}) {
  const requests: Array<{ path: string; body: unknown }> = [];
  const notices: AutoMapNotice[][] = [];
  const turnedOff: AutoMapStop[][] = [];
  const changed = vi.fn();
  const server = { view: view(), reachable: true };
  const client = new AutoMapClient({
    request: async (path, body) => {
      requests.push({ path, body });
      return server.reachable ? server.view : null;
    },
    now: () => NOW,
    notices: (items) => notices.push([...items]),
    turnedOff: (stops) => turnedOff.push([...stops]),
    changed,
    ...extra,
  });
  return { client, requests, notices, turnedOff, changed, server };
}

const settled = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('AutoMapClient', () => {
  it('is off for a map the server knows nothing about', () => {
    expect(harness().client.setting('octo/one', 5)).toEqual({ enabled: false, tier: 'auto', setUp: false, enabledAt: null });
  });

  it('reads every map’s setting from the server, whatever the repository’s case', async () => {
    const h = harness();
    h.server.view = view([entry({ tier: 'hard' }), entry({ mapNumber: 6, enabled: false })]);
    await h.client.refresh();
    expect(h.requests).toEqual([{ path: '/api/auto-map', body: undefined }]);
    expect(h.client.setting('Octo/One', 5)).toMatchObject({ enabled: true, tier: 'hard' });
    expect(h.client.setting('octo/one', 6).enabled).toBe(false);
    expect(h.changed).toHaveBeenCalledOnce();
    await h.client.refresh();
    // Nothing differs, so nothing repaints.
    expect(h.changed).toHaveBeenCalledOnce();
  });

  it('shows a change at once and writes it to the server', async () => {
    const h = harness();
    expect(h.client.enable('octo/one', 5, 'hard')).toEqual({ enabled: true, tier: 'hard', setUp: true, enabledAt: NOW.toISOString() });
    expect(h.client.setting('octo/one', 5).enabled).toBe(true);
    expect(h.requests).toEqual([{ path: '/api/auto-map/map', body: { repo: 'octo/one', map: 5, op: 'enable', tier: 'hard' } }]);
    h.client.disable('octo/one', 5);
    h.client.setTier('octo/one', 5, 'simple');
    expect(h.client.setting('octo/one', 5)).toMatchObject({ enabled: false, tier: 'simple', setUp: true });
    expect(h.requests.slice(1).map((request) => request.body)).toEqual([
      { repo: 'octo/one', map: 5, op: 'disable' },
      { repo: 'octo/one', map: 5, op: 'tier', tier: 'simple' },
    ]);
    await settled();
  });

  it('takes the server’s answer over its own guess', async () => {
    const h = harness();
    h.server.view = view([entry({ enabledAt: '2026-10-01T10:00:00.250Z' })]);
    h.client.enable('octo/one', 5);
    await settled();
    expect(h.client.setting('octo/one', 5).enabledAt).toBe('2026-10-01T10:00:00.250Z');
  });

  it('keeps its own guess when the server does not answer', async () => {
    const h = harness();
    h.server.reachable = false;
    h.client.enable('octo/one', 5);
    await settled();
    expect(h.client.setting('octo/one', 5).enabled).toBe(true);
    await h.client.refresh();
    expect(h.client.setting('octo/one', 5).enabled).toBe(true);
  });

  it('survives a request that throws', async () => {
    const h = harness({
      request: async () => {
        throw new Error('offline');
      },
    });
    h.client.enable('octo/one', 5);
    await h.client.refresh();
    await settled();
    expect(h.client.setting('octo/one', 5).enabled).toBe(true);
  });

  describe('covers', () => {
    it('is true for a ticket the server’s auto map starts, so the page does not announce it', async () => {
      const h = harness();
      h.server.view = view([entry()]);
      await h.client.refresh();
      expect(h.client.covers(next(12))).toBe(true);
    });

    it('is false while the map is off, for what became next while the app was closed, and for other events', async () => {
      const h = harness();
      expect(h.client.covers(next(12))).toBe(false);
      h.server.view = view([entry()]);
      await h.client.refresh();
      expect(h.client.covers(next(12, { whileYouWereAway: true }))).toBe(false);
      expect(h.client.covers(next(12, { at: '2026-10-01T09:00:00.000Z' }))).toBe(false);
      expect(h.client.covers(next(12, { mapNumber: 6 }))).toBe(false);
      expect(h.client.covers({ ...next(12), type: 'ticket-closed' } as unknown as MapEvent)).toBe(false);
    });
  });

  describe('what the server left while no page was open', () => {
    it('hands the notices to the inbox', async () => {
      const h = harness();
      const notice: AutoMapNotice = { id: 'automap:b1', kind: 'handOffError', repo: 'octo/one', mapNumber: 5, mapTitle: 'Roadmap', ticketNumber: 11, ticketTitle: 'Ticket 11', createdAt: NOW.toISOString() };
      h.server.view = view([], [notice]);
      await h.client.refresh();
      expect(h.notices).toEqual([[notice]]);
    });

    it('reports a map the server turned off on a usage limit, once', async () => {
      const h = harness();
      h.server.view = view([entry()]);
      await h.client.refresh();
      expect(h.turnedOff).toEqual([]);
      const off = entry({ enabled: false, stop: { message: 'Usage limit reached.', resetsAt: '4:00 PM' } });
      h.server.view = view([off]);
      await h.client.refresh();
      expect(h.turnedOff).toEqual([[off]]);
      expect(h.client.setting('octo/one', 5).enabled).toBe(false);
      await h.client.refresh();
      expect(h.turnedOff).toHaveLength(1);
    });

    it('does not report a map the user turned off', async () => {
      const h = harness();
      h.server.view = view([entry()]);
      await h.client.refresh();
      h.server.view = view([entry({ enabled: false })]);
      await h.client.refresh();
      expect(h.turnedOff).toEqual([]);
    });
  });

  describe('settings this browser kept before the server held them', () => {
    const saved = { 'octo/one#5': ON, 'octo/two#9': { ...ON, tier: 'hard' }, nonsense: ON, 'octo/one#x': ON };

    it('sends each to the server once and forgets them', async () => {
      const h = harness();
      const storage = memoryStorage({ [LEGACY_AUTO_MAP_KEY]: JSON.stringify(saved) });
      await h.client.importLegacy(storage);
      expect(h.requests.map((request) => request.body)).toEqual([
        { repo: 'octo/one', map: 5, op: 'import', setting: ON },
        { repo: 'octo/two', map: 9, op: 'import', setting: { ...ON, tier: 'hard' } },
      ]);
      expect(storage.getItem(LEGACY_AUTO_MAP_KEY)).toBeNull();
    });

    it('keeps them for the next load when the server does not answer', async () => {
      const h = harness();
      h.server.reachable = false;
      const storage = memoryStorage({ [LEGACY_AUTO_MAP_KEY]: JSON.stringify(saved) });
      await h.client.importLegacy(storage);
      expect(storage.getItem(LEGACY_AUTO_MAP_KEY)).not.toBeNull();
      expect(h.requests).toHaveLength(1);
    });

    it('does nothing when there are none, or they are garbage', async () => {
      const h = harness();
      await h.client.importLegacy(memoryStorage());
      const storage = memoryStorage({ [LEGACY_AUTO_MAP_KEY]: '{nope' });
      await h.client.importLegacy(storage);
      expect(h.requests).toEqual([]);
      expect(storage.getItem(LEGACY_AUTO_MAP_KEY)).toBeNull();
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
    expect(html).toContain('even with no window open');
    for (const tier of ['auto', 'simple', 'mid', 'hard']) expect(html).toContain(`data-am-tier="${tier}"`);
    expect(autoMapSetupHtml(5, true, 'mid', 4)).toContain('Auto map settings · #5');
  });
});
