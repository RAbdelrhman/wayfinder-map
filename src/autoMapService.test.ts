import { describe, expect, it, vi } from 'vitest';

import type { MethodPrediction } from './autoCalibration.js';
import type { AutoMapStartBody } from './autoMap.js';
import { AutoMapService, parseAutoMapChange } from './autoMapService.js';
import type { AutoMapServiceDeps } from './autoMapService.js';
import { memoryAutoMapStore } from './autoMapStore.js';
import { buildAutoDecision } from './autoDecision.js';
import { autoDecisionBody, pickAuto } from './autoPick.js';
import type { MapEvent } from './mapWatch.js';
import type { ModelRatingResult } from './autoRater.js';
import type { ModelCatalog, ModelChoice } from './models.js';
import type { DesktopNotification } from './notifications.js';
import type { Batch, BatchItem } from './startNextRunner.js';
import type { Ticket, WayfinderMap } from './types.js';

const NOW = new Date('2026-10-01T10:00:00.000Z');
const SOL: ModelChoice = { instanceId: 'codex', model: 'gpt-5.6-sol' };
const LUNA: ModelChoice = { instanceId: 'codex', model: 'gpt-5.6-luna' };
const CATALOG: ModelCatalog = {
  providers: [
    {
      instanceId: 'codex',
      name: 'Codex',
      ready: true,
      models: [SOL, LUNA].map((choice) => ({ slug: choice.model, name: choice.model, isDefault: false, effort: null })),
    },
  ],
};

function next(ticket: number, extra: Partial<MapEvent> = {}): MapEvent {
  return { type: 'ticket-next', from: 'blocked', ticket: { number: ticket, title: `Ticket ${String(ticket)}` }, id: ticket, repo: 'octo/one', mapNumber: 5, at: '2026-10-01T10:05:00.000Z', ...extra } as MapEvent;
}

function ticket(number: number, extra: Partial<Ticket> = {}): Ticket {
  return {
    number,
    title: `Ticket ${String(number)}`,
    url: `https://github.com/octo/one/issues/${String(number)}`,
    body: 'Small change.',
    type: 'task',
    labels: [],
    open: true,
    assignee: null,
    blockedBy: [],
    openBlockers: [],
    state: 'frontier',
    updatedAt: null,
    ...extra,
  } as Ticket;
}

function mapOf(tickets: Ticket[], extra: Partial<WayfinderMap> = {}): WayfinderMap {
  return { number: 5, title: 'Roadmap v1', open: true, settled: null, tickets, ...extra } as WayfinderMap;
}

function prediction(tier: 'simple' | 'mid' | 'hard' | null, status: MethodPrediction['status'] = 'ok'): MethodPrediction {
  return { tier, version: 'model-1:gpt-5.6-luna', rubric: 'rubric-1', rater: { provider: 'codex', model: 'gpt-5.6-luna', effort: 'low' }, inputId: 'abc', elapsedMs: 40, status, tokens: null, cost: { kind: 'unavailable' } };
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
    items: [{ ticketNumber: 11, title: 'Ticket 11', tier: 'mid', model: null, auto: null, status: 'failed', handOffId: null, reason: null }],
    ...extra,
  };
}

interface Harness {
  service: AutoMapService;
  store: ReturnType<typeof memoryAutoMapStore>;
  /** The listeners the service registered with the watcher, by `repo#map`. */
  watching: Map<string, { listener: (event: MapEvent) => void; onStop: (() => void) | undefined }>;
  catchUps: string[];
  submits: Array<{ repo: string; body: AutoMapStartBody }>;
  desktop: DesktopNotification[];
  reply: { ok: boolean; error: string | null };
  emit: (event: MapEvent) => void;
}

function harness(extra: Partial<AutoMapServiceDeps> = {}, tickets: Ticket[] = [ticket(11), ticket(12)]): Harness {
  const watching: Harness['watching'] = new Map();
  const catchUps: string[] = [];
  const submits: Harness['submits'] = [];
  const desktop: DesktopNotification[] = [];
  const reply = { ok: true, error: null as string | null };
  const store = memoryAutoMapStore();
  // Until an event says a ticket became next, the map shows it blocked, so turning the map on finds nothing next yet.
  let emitted = false;
  const service = new AutoMapService({
    store,
    watcher: {
      watch: (repo, mapNumber, listener, onStop) => {
        const id = `${repo}#${String(mapNumber)}`;
        watching.set(id, { listener, onStop });
        return () => void watching.delete(id);
      },
      catchUp: async (repo) => void catchUps.push(repo ?? ''),
    },
    loadMap: async () => mapOf(emitted ? tickets : tickets.map((item) => ({ ...item, state: 'blocked' }))),
    submit: async (repo, body) => {
      submits.push({ repo, body });
      return reply;
    },
    catalog: async () => CATALOG,
    usage: async () => ({}),
    rate: async () => ({ ok: false, error: 'no model', prediction: prediction(null, 'failed') }),
    notificationOn: async () => true,
    desktop: (notification) => desktop.push(notification),
    now: () => NOW,
    batchMs: 0,
    ...extra,
  });
  return { service, store, watching, catchUps, submits, desktop, reply, emit: (event) => {
      emitted = true;
      watching.get(`${event.repo}#${String(event.mapNumber)}`)?.listener(event);
    },
  };
}

describe('AutoMapService', () => {
  describe('watching', () => {
    it('watches nothing until a map is turned on, then watches it with no page involved', async () => {
      const h = harness();
      await h.service.init();
      expect(h.watching.size).toBe(0);
      await h.service.change('octo/one', 5, { op: 'enable' });
      expect([...h.watching.keys()]).toEqual(['octo/one#5']);
      expect(h.catchUps).toEqual(['octo/one']);
      await h.service.change('octo/one', 5, { op: 'disable' });
      expect(h.watching.size).toBe(0);
    });

    it('keeps watching every map that was on after a restart, and catches each one up', async () => {
      const first = harness();
      await first.service.change('octo/one', 5, { op: 'enable', tier: 'hard' });
      await first.service.change('octo/two', 9, { op: 'enable' });
      await first.service.change('octo/two', 9, { op: 'disable' });
      first.service.close();

      const restarted = harness();
      await restarted.store.save(await first.store.load());
      await restarted.service.init();
      expect([...restarted.watching.keys()]).toEqual(['octo/one#5']);
      expect(restarted.catchUps).toEqual(['octo/one']);
      expect(restarted.service.setting('octo/one', 5)).toMatchObject({ enabled: true, tier: 'hard', setUp: true, enabledAt: NOW.toISOString() });
      expect(restarted.service.setting('octo/two', 9)).toMatchObject({ enabled: false, setUp: true });
    });

    it('stops watching when the watcher drops a settled map, and picks it up again when a page loads it', async () => {
      const h = harness();
      await h.service.change('octo/one', 5, { op: 'enable' });
      h.watching.get('octo/one#5')?.onStop?.();
      h.watching.delete('octo/one#5');
      h.service.reconcile('octo/one', new Set([6]));
      expect(h.watching.size).toBe(0);
      h.service.reconcile('octo/one', new Set([5, 6]));
      expect([...h.watching.keys()]).toEqual(['octo/one#5']);
      // Reconciling a map that is already watched does not register a second listener.
      const [first] = [...h.watching.values()];
      h.service.reconcile('octo/one', new Set([5]));
      expect([...h.watching.values()][0]).toBe(first);
    });

    it('is quiet after close', async () => {
      const h = harness();
      await h.service.change('octo/one', 5, { op: 'enable' });
      h.service.close();
      expect(h.watching.size).toBe(0);
      await h.service.change('octo/one', 6, { op: 'enable' });
      expect(h.watching.size).toBe(0);
    });
  });

  describe('starting what is next already', () => {
    it('starts every ticket that was next when the map was turned on', async () => {
      const h = harness({ loadMap: async () => mapOf([ticket(11), ticket(12, { state: 'blocked' }), ticket(13, { type: 'prototype' })]) });
      await h.service.change('octo/one', 5, { op: 'enable', tier: 'hard' });
      await vi.waitFor(() => expect(h.submits).toHaveLength(1));
      expect(h.submits[0]?.body.tickets.map((item) => [item.ticket, item.tier])).toEqual([[11, 'hard'], [13, 'hard']]);
    });

    it('starts nothing again when a map that is on is turned on, or after a restart', async () => {
      const h = harness({ loadMap: async () => mapOf([ticket(11)]) });
      await h.service.change('octo/one', 5, { op: 'enable' });
      await vi.waitFor(() => expect(h.submits).toHaveLength(1));
      await h.service.change('octo/one', 5, { op: 'enable', tier: 'hard' });
      const restarted = harness({ loadMap: async () => mapOf([ticket(11)]) });
      await restarted.store.save(await h.store.load());
      await restarted.service.init();
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(h.submits).toHaveLength(1);
      expect(restarted.submits).toEqual([]);
    });

    it('reads the map again when the first read fails', async () => {
      let reads = 0;
      const h = harness({ retryMs: 0, loadMap: async () => { reads += 1; if (reads === 1) throw new Error('offline'); return reads === 2 ? null : mapOf([ticket(11)]); } });
      await h.service.change('octo/one', 5, { op: 'enable' });
      await vi.waitFor(() => expect(h.submits).toHaveLength(1));
      expect(h.submits[0]?.body.tickets.map((item) => item.ticket)).toEqual([11]);
    });

    it('still starts them when saving the setting fails', async () => {
      const store = memoryAutoMapStore();
      store.save = async () => Promise.reject(new Error('disk full'));
      const h = harness({ store, loadMap: async () => mapOf([ticket(11)]) });
      await expect(h.service.change('octo/one', 5, { op: 'enable' })).rejects.toThrow('disk full');
      await vi.waitFor(() => expect(h.submits).toHaveLength(1));
    });

    it.each([{ open: false }, { settled: { at: '2026-10-01T09:00:00.000Z' } }])('starts nothing on a map that is closed or settled: %o', async (extra) => {
      const h = harness({ loadMap: async () => mapOf([ticket(11)], extra as Partial<WayfinderMap>) });
      await h.service.change('octo/one', 5, { op: 'enable' });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(h.submits).toEqual([]);
    });

    it('starts nothing when the map is turned off before it is read', async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const h = harness({ loadMap: async () => { await gate; return mapOf([ticket(11)]); } });
      await h.service.change('octo/one', 5, { op: 'enable' });
      await h.service.change('octo/one', 5, { op: 'disable' });
      release();
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(h.submits).toEqual([]);
    });
  });

  describe('starting what becomes next', () => {
    it.each(['disable', 'restart', 'tier', 'close'] as const)('invalidates a prepared start after %s while catalog loading waits', async (change) => {
      let release!: () => void;
      let entered!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const reading = new Promise<void>((resolve) => { entered = resolve; });
      const h = harness({ catalog: async () => { entered(); await gate; return CATALOG; } });
      await h.service.change('octo/one', 5, { op: 'enable', tier: 'mid' });
      h.emit(next(11));
      const flushing = h.service.flush();
      await reading;
      if (change === 'close') h.service.close();
      else if (change === 'tier') await h.service.change('octo/one', 5, { op: 'tier', tier: 'hard' });
      else {
        await h.service.change('octo/one', 5, { op: 'disable' });
        if (change === 'restart') await h.service.change('octo/one', 5, { op: 'enable' });
      }
      release();
      await flushing;
      expect(h.submits).toEqual([]);
      expect(h.service.view().notices.map((notice) => [notice.kind, notice.ticketNumber]))
        .toEqual(change === 'close' ? [] : [['unblocked', 11]]);
      h.service.close();
    });

    it.each(['tier', 'restart'] as const)('preserves every pending event when %s precedes another ticket becoming next', async (change) => {
      const h = harness({ batchMs: 400 });
      await h.service.change('octo/one', 5, { op: 'enable', tier: 'mid' });
      h.emit(next(11));
      if (change === 'tier') await h.service.change('octo/one', 5, { op: 'tier', tier: 'hard' });
      else {
        await h.service.change('octo/one', 5, { op: 'disable' });
        await h.service.change('octo/one', 5, { op: 'enable' });
      }
      h.emit(next(12));
      await h.service.flush();
      const accounted = [
        ...h.submits.flatMap((submit) => submit.body.tickets.map((entry) => entry.ticket)),
        ...h.service.view().notices.map((notice) => notice.ticketNumber),
      ].sort();
      expect(accounted).toEqual([11, 12]);
      expect(h.submits).toEqual([]);
      expect(h.service.view().notices.map((notice) => notice.ticketNumber).sort()).toEqual([11, 12]);
      await h.service.flush();
      expect(h.service.view().notices).toHaveLength(2);
      h.emit(next(13));
      await h.service.flush();
      expect(h.submits).toHaveLength(1);
      expect(h.submits[0]?.body.tickets).toEqual([{ ticket: 13, tier: change === 'tier' ? 'hard' : 'mid', model: null }]);
      h.service.close();
    });

    it('hands off the tickets that became next as one batch, with the cap, once the events settle', async () => {
      const h = harness({ batchMs: 5 });
      await h.service.updateSettings({ cap: 2 });
      await h.service.change('octo/one', 5, { op: 'enable' });
      h.emit(next(12));
      h.emit(next(11));
      h.emit(next(12));
      expect(h.submits).toEqual([]);
      await vi.waitFor(() => expect(h.submits).toHaveLength(1));
      expect(h.submits[0]).toMatchObject({ repo: 'octo/one', body: { map: 5, cap: 2, auto: true } });
      expect(h.submits[0]?.body.tickets.map((entry) => entry.ticket)).toEqual([11, 12]);
    });

    it('uses the default cap until one is saved', async () => {
      const h = harness();
      await h.service.change('octo/one', 5, { op: 'enable' });
      h.emit(next(11));
      await h.service.flush();
      expect(h.submits[0]?.body.cap).toBe(4);
    });

    it('batches each map on its own', async () => {
      const h = harness();
      await h.service.change('octo/one', 5, { op: 'enable' });
      await h.service.change('octo/one', 6, { op: 'enable' });
      h.emit(next(12));
      h.emit(next(40, { mapNumber: 6 }));
      await h.service.flush();
      expect(h.submits.map((submit) => [submit.body.map, submit.body.tickets.map((entry) => entry.ticket)]).sort()).toEqual([[5, [12]], [6, [40]]]);
    });

    it('starts grilling and prototype tickets too, which wait for the user in their thread', async () => {
      const h = harness({}, [ticket(30, { type: 'grilling' })]);
      await h.service.change('octo/one', 5, { op: 'enable', tier: 'mid' });
      h.emit(next(30));
      await h.service.flush();
      expect(h.submits[0]?.body.tickets.map((entry) => entry.ticket)).toEqual([30]);
    });

    it('starts nothing for a map that is off', async () => {
      const h = harness();
      await h.service.change('octo/one', 5, { op: 'enable' });
      await h.service.change('octo/one', 5, { op: 'disable' });
      h.emit(next(11));
      await h.service.flush();
      expect(h.submits).toEqual([]);
    });

    it('starts nothing for what became next while the app was closed, or before the map was turned on', async () => {
      const h = harness();
      await h.service.change('octo/one', 5, { op: 'enable' });
      h.emit(next(11, { whileYouWereAway: true }));
      h.emit(next(12, { at: '2026-10-01T09:59:59.000Z' }));
      await h.service.flush();
      expect(h.submits).toEqual([]);
      expect(h.service.view().notices).toEqual([]);
    });

    it('ignores every event but a ticket becoming next', async () => {
      const h = harness();
      await h.service.change('octo/one', 5, { op: 'enable' });
      h.emit({ type: 'ticket-closed', ticket: { number: 3, title: 'Blocker' }, id: 1, repo: 'octo/one', mapNumber: 5, at: '2026-10-01T10:05:00.000Z' } as MapEvent);
      await h.service.flush();
      expect(h.submits).toEqual([]);
    });

    it('starts nothing for a ticket whose map was turned off while it waited to be batched, and says it is ready instead', async () => {
      const h = harness();
      await h.service.change('octo/one', 5, { op: 'enable' });
      h.emit(next(12));
      await h.service.change('octo/one', 5, { op: 'disable' });
      await h.service.flush();
      expect(h.submits).toEqual([]);
      expect(h.service.view().notices.map((notice) => [notice.kind, notice.ticketNumber])).toEqual([['unblocked', 12]]);
    });
  });

  describe('tier and model', () => {
    it('runs a fixed tier on the model Settings maps it to', async () => {
      const h = harness();
      await h.service.updateSettings({ tierModels: { hard: SOL, simple: LUNA } });
      await h.service.change('octo/one', 5, { op: 'enable', tier: 'hard' });
      h.emit(next(11));
      await h.service.flush();
      expect(h.submits[0]?.body.tickets).toEqual([{ ticket: 11, tier: 'hard', model: SOL }]);
    });

    it('lets T3 Code decide when the tier has no model, its model is gone, or T3 Code cannot be reached', async () => {
      const h = harness();
      await h.service.change('octo/one', 5, { op: 'enable', tier: 'mid' });
      h.emit(next(11));
      await h.service.flush();
      await h.service.updateSettings({ tierModels: { mid: { instanceId: 'codex', model: 'retired' } } });
      h.emit(next(12));
      await h.service.flush();
      const offline = harness({ catalog: async () => Promise.reject(new Error('offline')) });
      await offline.service.updateSettings({ tierModels: { mid: SOL } });
      await offline.service.change('octo/one', 5, { op: 'enable', tier: 'mid' });
      offline.emit(next(11));
      await offline.service.flush();
      expect([h.submits[0], h.submits[1], offline.submits[0]].map((submit) => submit?.body.tickets[0]?.model)).toEqual([null, null, null]);
    });

    it('starts each Auto ticket on the tier and model it rates to, with the record of the proposal', async () => {
      const risky = ticket(11, { body: 'Touches `src/a.ts`, `src/b.ts`, `src/c.ts`, `src/d.ts`, `src/e.ts`. Needs a retry and a queue around concurrency, plus a data migration.', type: 'research' });
      const h = harness({}, [risky, ticket(12)]);
      await h.service.updateSettings({ tierModels: { simple: LUNA, mid: LUNA, hard: SOL } });
      await h.service.change('octo/one', 5, { op: 'enable', tier: 'auto' });
      h.emit(next(11));
      h.emit(next(12));
      await h.service.flush();
      const [hard, easy] = h.submits[0]?.body.tickets ?? [];
      expect(hard).toMatchObject({ ticket: 11, tier: 'hard', model: SOL, auto: { scoring: { version: 'rules-1' }, proposed: { tier: 'hard', model: 'gpt-5.6-sol' }, final: { tier: 'hard' } } });
      expect(easy).toMatchObject({ ticket: 12, tier: 'mid', model: LUNA });
    });

    it('rates with the chosen model, and falls back to the rules when it cannot, saying so', async () => {
      const rate = vi.fn(async (forTicket: Ticket): Promise<ModelRatingResult> =>
        forTicket.number === 11
          ? { ok: true, rating: { tier: 'hard', reason: 'touches 6 files', by: 'model', version: 'model-1:gpt-5.6-luna' }, prediction: prediction('hard') }
          : { ok: false, error: 'gpt-5.6-luna did not answer with a tier', prediction: prediction(null, 'unparseable') },
      );
      const h = harness({ rate });
      await h.service.updateSettings({ tierModels: { mid: LUNA, hard: SOL }, rater: { kind: 'model', choice: LUNA } });
      await h.service.change('octo/one', 5, { op: 'enable', tier: 'auto' });
      h.emit(next(11));
      h.emit(next(12));
      await h.service.flush();
      expect(rate).toHaveBeenCalledTimes(2);
      const [rated, fallback] = h.submits[0]?.body.tickets ?? [];
      expect(rated).toMatchObject({ tier: 'hard', model: SOL, auto: { scoring: { version: 'model-1:gpt-5.6-luna', reason: 'touches 6 files' } } });
      expect(fallback).toMatchObject({ tier: 'mid', auto: { scoring: { version: 'rules-1' } } });
      expect(JSON.stringify(fallback)).toContain('logic rated it');
    });

    it('records the paired predictions in calibration mode, without letting the shadow change the pick', async () => {
      const calls: string[] = [];
      const rate = vi.fn(async (forTicket: Ticket, choice: ModelChoice): Promise<ModelRatingResult> => {
        calls.push(`${choice.model}#${String(forTicket.number)}`);
        // The shadow model says Hard, but Auto proposes from the rules (Mid).
        return { ok: true, rating: { tier: 'hard', reason: 'shadow says hard', by: 'model', version: 'model-1:gpt-5.6-luna' }, prediction: prediction('hard') };
      });
      const h = harness({ rate }, [ticket(12), ticket(30, { type: 'grilling' })]);
      await h.service.updateSettings({ tierModels: { mid: LUNA, hard: SOL }, calibration: { kind: 'shadow', choice: LUNA } });
      await h.service.change('octo/one', 5, { op: 'enable', tier: 'auto' });
      h.emit(next(12));
      h.emit(next(30));
      await h.service.flush();
      // Only the task ticket is shadowed; a grilling ticket is not.
      expect(calls).toEqual(['gpt-5.6-luna#12']);
      const [task, grilling] = h.submits[0]?.body.tickets ?? [];
      expect(task).toMatchObject({ ticket: 12, tier: 'mid', model: LUNA, auto: { selection: 'auto', calibration: { proposedBy: 'logic', fallback: false, shadow: { tier: 'hard' }, rules: { tier: 'mid' } }, tierMapping: { mid: { model: 'gpt-5.6-luna' } } } });
      expect(grilling?.auto).not.toHaveProperty('calibration');
    });

    it('uses one call for both when the shadow model is the rating model', async () => {
      const rate = vi.fn(async (): Promise<ModelRatingResult> => ({ ok: true, rating: { tier: 'hard', reason: 'r', by: 'model', version: 'model-1:gpt-5.6-luna' }, prediction: prediction('hard') }));
      const h = harness({ rate }, [ticket(12)]);
      await h.service.updateSettings({ tierModels: { mid: LUNA, hard: SOL }, rater: { kind: 'model', choice: LUNA }, calibration: { kind: 'shadow', choice: LUNA } });
      await h.service.change('octo/one', 5, { op: 'enable', tier: 'auto' });
      h.emit(next(12));
      await h.service.flush();
      expect(rate).toHaveBeenCalledTimes(1);
      expect(h.submits[0]?.body.tickets[0]).toMatchObject({ tier: 'hard', model: SOL, auto: { calibration: { proposedBy: 'model', fallback: false } } });
    });

    it('moves an Auto ticket off a provider that just hit its usage limit', async () => {
      const claude: ModelChoice = { instanceId: 'claudeAgent', model: 'sonnet' };
      const catalog: ModelCatalog = { providers: [...CATALOG.providers, { instanceId: 'claudeAgent', name: 'Claude', ready: true, models: [{ slug: 'sonnet', name: 'Sonnet', isDefault: false, effort: null }] }] };
      const h = harness({ catalog: async () => catalog, usage: async () => ({ codex: { state: 'limited', observedAt: NOW.toISOString() } }) });
      await h.service.updateSettings({ tierModels: { mid: SOL, hard: claude } });
      await h.service.change('octo/one', 5, { op: 'enable', tier: 'auto' });
      h.emit(next(12));
      await h.service.flush();
      expect(h.submits[0]?.body.tickets[0]).toMatchObject({ tier: 'mid', model: claude });
    });

    it('runs Auto on Mid when the map cannot be read', async () => {
      const h = harness({ loadMap: async () => null });
      await h.service.updateSettings({ tierModels: { mid: LUNA } });
      await h.service.change('octo/one', 5, { op: 'enable', tier: 'auto' });
      h.emit(next(12));
      await h.service.flush();
      expect(h.submits[0]?.body.tickets).toEqual([{ ticket: 12, tier: 'mid', model: LUNA }]);
    });
  });

  describe('when the start fails', () => {
    it('persists and announces every invalidated event after a transient notice save failure', async () => {
      const store = memoryAutoMapStore();
      const save = vi.spyOn(store, 'save');
      const h = harness({ store, batchMs: 400 });
      await h.service.change('octo/one', 5, { op: 'enable' });
      h.emit(next(11));
      h.emit(next(12));
      await h.service.change('octo/one', 5, { op: 'tier', tier: 'hard' });
      save.mockRejectedValueOnce(new Error('Temporary file contention'));
      await h.service.flush();
      expect(h.submits).toEqual([]);
      expect((await store.load()).notices.map((notice) => notice.ticketNumber).sort()).toEqual([11, 12]);
      expect(h.desktop.map((notice) => notice.ticketNumber).sort()).toEqual([11, 12]);
      h.service.close();
    });

    it('attempts every ready notice when persistent storage failure exhausts retries', async () => {
      const store = memoryAutoMapStore();
      const save = vi.spyOn(store, 'save');
      const h = harness({ store, batchMs: 400 });
      await h.service.change('octo/one', 5, { op: 'enable' });
      h.emit(next(11));
      h.emit(next(12));
      await h.service.change('octo/one', 5, { op: 'tier', tier: 'hard' });
      save.mockClear().mockRejectedValue(new Error('Storage unavailable'));
      await expect(h.service.flush()).rejects.toThrow('Could not save ready notifications');
      expect(save).toHaveBeenCalledTimes(6);
      expect(h.service.view().notices.map((notice) => notice.ticketNumber).sort()).toEqual([11, 12]);
      expect(h.desktop).toEqual([]);
      h.service.close();
    });

    it('leaves the ordinary "ready" notice in the inbox and shows it as an OS notification', async () => {
      const h = harness();
      h.reply.ok = false;
      h.reply.error = 'Choose a local clone of octo/one before starting in T3 Code.';
      await h.service.change('octo/one', 5, { op: 'enable' });
      h.emit(next(12));
      await h.service.flush();
      expect(h.service.view().notices).toEqual([
        { id: 'map:octo/one#5:12:2026-10-01T10:05:00.000Z', kind: 'unblocked', repo: 'octo/one', mapNumber: 5, mapTitle: 'Roadmap v1', ticketNumber: 12, ticketTitle: 'Ticket 12', createdAt: '2026-10-01T10:05:00.000Z' },
      ]);
      expect(h.desktop).toEqual([
        { kind: 'unblocked', title: 'octo/one · Map #5 Roadmap v1', body: 'Ready to start: #12 Ticket 12', repo: 'octo/one', mapNumber: 5, ticketNumber: 12 },
      ]);
    });

    it('does the same when the request itself throws', async () => {
      const h = harness({ submit: async () => Promise.reject(new Error('offline')) });
      await h.service.change('octo/one', 5, { op: 'enable' });
      h.emit(next(12));
      await h.service.flush();
      expect(h.service.view().notices.map((notice) => notice.ticketNumber)).toEqual([12]);
    });

    it('respects the notification choice, and keeps the same ticket from being announced twice', async () => {
      const off = harness({ notificationOn: async (kind) => kind !== 'unblocked' });
      off.reply.ok = false;
      await off.service.change('octo/one', 5, { op: 'enable' });
      off.emit(next(12));
      await off.service.flush();
      expect(off.service.view().notices).toEqual([]);
      expect(off.desktop).toEqual([]);

      const twice = harness();
      twice.reply.ok = false;
      await twice.service.change('octo/one', 5, { op: 'enable' });
      twice.emit(next(12));
      await twice.service.flush();
      twice.emit(next(12));
      await twice.service.flush();
      expect(twice.service.view().notices).toHaveLength(1);
      expect(twice.desktop).toHaveLength(1);
    });
  });

  describe('usage limit', () => {
    it('persists a usage-limit disable after a transient save failure, so restart keeps it off', async () => {
      const store = memoryAutoMapStore();
      const save = vi.spyOn(store, 'save');
      const h = harness({ store });
      await h.service.change('octo/one', 5, { op: 'enable' });
      save.mockRejectedValueOnce(new Error('Temporary file contention'));
      await h.service.usageStopped(stopped());
      expect(h.service.setting('octo/one', 5).enabled).toBe(false);
      expect((await store.load()).maps[0]?.setting.enabled).toBe(false);
      const restarted = harness({ store });
      await restarted.service.init();
      expect(restarted.service.setting('octo/one', 5).enabled).toBe(false);
      expect(restarted.watching.size).toBe(0);
      expect(h.desktop).toHaveLength(1);
      h.service.close();
      restarted.service.close();
    });

    it('bounds usage-stop save retries and leaves the map unwatched after persistent failure', async () => {
      const store = memoryAutoMapStore();
      const save = vi.spyOn(store, 'save');
      const h = harness({ store });
      await h.service.change('octo/one', 5, { op: 'enable' });
      save.mockClear();
      save.mockRejectedValue(new Error('Storage unavailable'));
      await expect(h.service.usageStopped(stopped())).rejects.toThrow('Storage unavailable');
      expect(save).toHaveBeenCalledTimes(3);
      expect(h.service.setting('octo/one', 5).enabled).toBe(false);
      expect(h.watching.size).toBe(0);
      h.service.close();
    });

    it('retains a settings change queued during a failed usage-stop save', async () => {
      const store = memoryAutoMapStore();
      const save = vi.spyOn(store, 'save');
      const h = harness({ store });
      await h.service.change('octo/one', 5, { op: 'enable' });
      let settingsChange: Promise<boolean> | undefined;
      save.mockImplementationOnce(async () => {
        settingsChange = h.service.updateSettings({ cap: 2 });
        throw new Error('Temporary file contention');
      });
      await h.service.usageStopped(stopped());
      await settingsChange;
      const saved = await store.load();
      expect(saved.settings.cap).toBe(2);
      expect(saved.maps[0]?.setting.enabled).toBe(false);
      h.service.close();
    });

    it('does not retry a failed usage-stop save after the service closes', async () => {
      const store = memoryAutoMapStore();
      const save = vi.spyOn(store, 'save');
      const h = harness({ store });
      await h.service.change('octo/one', 5, { op: 'enable' });
      save.mockClear();
      save.mockImplementationOnce(async () => {
        h.service.close();
        throw new Error('Closed during save');
      });
      await expect(h.service.usageStopped(stopped())).rejects.toThrow('Closed during save');
      expect(save).toHaveBeenCalledTimes(1);
      expect(h.desktop).toEqual([]);
    });

    it('does not publish a usage-stop notice after closing during its map lookup', async () => {
      let release!: () => void;
      let entered!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const reading = new Promise<void>((resolve) => { entered = resolve; });
      const h = harness({ loadMap: async () => { entered(); await gate; return mapOf([ticket(11)]); } });
      await h.service.change('octo/one', 5, { op: 'enable' });
      const stopping = h.service.usageStopped(stopped());
      await reading;
      h.service.close();
      release();
      await stopping;
      expect(h.desktop).toEqual([]);
      expect(h.service.view().notices).toEqual([]);
      expect((await h.store.load()).maps[0]?.setting.enabled).toBe(false);
    });

    it('turns the map off on the first usage-limit stop, stops watching it and tells the user', async () => {
      const h = harness();
      await h.service.change('octo/one', 5, { op: 'enable' });
      await h.service.usageStopped(stopped());
      expect(h.service.setting('octo/one', 5)).toMatchObject({ enabled: false, setUp: true });
      expect(h.watching.size).toBe(0);
      expect(h.service.view().maps[0]).toMatchObject({ enabled: false, stop: { message: 'Usage limit reached.', resetsAt: '4:00 PM' } });
      expect(h.service.view().notices).toEqual([
        { id: 'automap:b1', kind: 'handOffError', repo: 'octo/one', mapNumber: 5, mapTitle: 'Roadmap v1', ticketNumber: 11, ticketTitle: 'Ticket 11', createdAt: NOW.toISOString() },
      ]);
      expect(h.desktop).toEqual([
        { kind: 'handOffError', title: 'octo/one · Map #5 Roadmap v1', body: 'Auto map turned off by a usage limit: #11 Ticket 11', repo: 'octo/one', mapNumber: 5, ticketNumber: 11 },
      ]);
      // It stays off however many times the same stop is reported, and starts nothing.
      await h.service.usageStopped(stopped());
      expect(h.service.view().notices).toHaveLength(1);
      h.emit(next(12));
      await h.service.flush();
      expect(h.submits).toEqual([]);
    });

    it('stays off until the user turns it back on, then ignores the old stop', async () => {
      let clock = NOW;
      const h = harness({ now: () => clock });
      await h.service.change('octo/one', 5, { op: 'enable' });
      await h.service.usageStopped(stopped());
      clock = new Date('2026-10-01T11:00:00.000Z');
      await h.service.change('octo/one', 5, { op: 'enable' });
      expect(h.service.view().maps[0]?.stop).toBeNull();
      await h.service.usageStopped(stopped());
      expect(h.service.setting('octo/one', 5).enabled).toBe(true);
      expect(h.watching.size).toBe(1);
    });

    it('leaves a map alone when the stopped batch was not its own', async () => {
      const h = harness();
      await h.service.change('octo/one', 5, { op: 'enable' });
      await h.service.usageStopped(stopped({ auto: false }));
      await h.service.usageStopped(stopped({ stop: { kind: 'user' } }));
      await h.service.usageStopped(stopped({ mapNumber: 6 }));
      await h.service.usageStopped(stopped({ createdAt: '2026-10-01T09:00:00.000Z' }));
      expect(h.service.setting('octo/one', 5).enabled).toBe(true);
      expect(h.service.view().notices).toEqual([]);
    });

    it('does not keep the provider’s words after a restart, but does keep the notice and the off state', async () => {
      const h = harness();
      await h.service.change('octo/one', 5, { op: 'enable' });
      await h.service.usageStopped(stopped());
      const saved = JSON.stringify(await h.store.load());
      expect(saved).not.toContain('Usage limit reached.');
      const restarted = harness();
      await restarted.store.save(await h.store.load());
      await restarted.service.init();
      expect(restarted.service.view().maps[0]).toMatchObject({ enabled: false, stop: null });
      expect(restarted.service.view().notices).toHaveLength(1);
      expect(restarted.watching.size).toBe(0);
    });

    it('does not announce a stop when the notification is off, but still turns the map off', async () => {
      const h = harness({ notificationOn: async () => false });
      await h.service.change('octo/one', 5, { op: 'enable' });
      await h.service.usageStopped(stopped());
      expect(h.service.setting('octo/one', 5).enabled).toBe(false);
      expect(h.service.view().notices).toEqual([]);
      expect(h.desktop).toEqual([]);
    });
  });

  describe('settings', () => {
    it('is off, set to Auto and not set up for a map nobody touched', () => {
      expect(harness().service.setting('octo/one', 5)).toEqual({ enabled: false, tier: 'auto', setUp: false, enabledAt: null });
    });

    it('changes the tier of a map without turning it on or off', async () => {
      const h = harness();
      await h.service.change('octo/one', 5, { op: 'enable' });
      await h.service.change('octo/one', 5, { op: 'tier', tier: 'simple' });
      expect(h.service.setting('octo/one', 5)).toMatchObject({ enabled: true, tier: 'simple' });
      await h.service.change('octo/one', 5, { op: 'disable' });
      await h.service.change('octo/one', 5, { op: 'tier', tier: 'hard' });
      expect(h.service.setting('octo/one', 5)).toMatchObject({ enabled: false, tier: 'hard', setUp: true });
    });

    it('keeps one setting per map, whatever the repository’s case', async () => {
      const h = harness();
      await h.service.change('Octo/One', 5, { op: 'enable', tier: 'hard' });
      expect(h.service.setting('octo/one', 5).tier).toBe('hard');
      expect(h.service.setting('octo/one', 6).enabled).toBe(false);
    });

    it('imports a setting the browser kept only for a map the server has none for', async () => {
      const h = harness();
      const kept = { enabled: true, tier: 'hard' as const, setUp: true, enabledAt: '2026-09-30T08:00:00.000Z' };
      await h.service.change('octo/one', 5, { op: 'import', setting: kept });
      expect(h.service.setting('octo/one', 5)).toEqual(kept);
      expect([...h.watching.keys()]).toEqual(['octo/one#5']);
      await h.service.change('octo/one', 5, { op: 'disable' });
      await h.service.change('octo/one', 5, { op: 'import', setting: kept });
      expect(h.service.setting('octo/one', 5).enabled).toBe(false);
    });

    it('keeps the machine settings the trigger reads, and rejects a patch with nothing usable', async () => {
      const h = harness();
      expect(h.service.view().settings).toEqual({ cap: null, tierModels: null, rater: null, calibration: null });
      expect(await h.service.updateSettings({ cap: 6, tierModels: { hard: SOL, mid: 'nope', extra: SOL }, rater: { kind: 'model', choice: LUNA }, calibration: { kind: 'shadow', choice: SOL } })).toBe(true);
      expect(h.service.view().settings).toEqual({ cap: 6, tierModels: { hard: SOL }, rater: { kind: 'model', choice: LUNA }, calibration: { kind: 'shadow', choice: SOL } });
      expect(await h.service.updateSettings({ cap: 99 })).toBe(false);
      expect(await h.service.updateSettings({ cap: 'many' })).toBe(false);
      expect(await h.service.updateSettings(null)).toBe(false);
      expect(h.service.view().settings.cap).toBe(6);
      const restarted = harness();
      await restarted.store.save(await h.store.load());
      await restarted.service.init();
      expect(restarted.service.view().settings.tierModels).toEqual({ hard: SOL });
    });
  });
});

describe('parseAutoMapChange', () => {
  it('reads what to change from a request body', () => {
    expect(parseAutoMapChange({ op: 'enable' })).toEqual({ op: 'enable' });
    expect(parseAutoMapChange({ op: 'enable', tier: 'hard' })).toEqual({ op: 'enable', tier: 'hard' });
    expect(parseAutoMapChange({ op: 'enable', tier: 'huge' })).toEqual({ op: 'enable' });
    expect(parseAutoMapChange({ op: 'disable' })).toEqual({ op: 'disable' });
    expect(parseAutoMapChange({ op: 'tier', tier: 'auto' })).toEqual({ op: 'tier', tier: 'auto' });
    expect(parseAutoMapChange({ op: 'tier' })).toBeNull();
    expect(parseAutoMapChange({ op: 'import', setting: { enabled: true, tier: 'mid', setUp: true, enabledAt: '2026-09-30T08:00:00.000Z' } })).toEqual({
      op: 'import',
      setting: { enabled: true, tier: 'mid', setUp: true, enabledAt: '2026-09-30T08:00:00.000Z' },
    });
    expect(parseAutoMapChange({ op: 'nope' })).toBeNull();
    expect(parseAutoMapChange(null)).toBeNull();
  });
});

describe('AutoMapService.repick (#189)', () => {
  const FABLE: ModelChoice = { instanceId: 'claudeAgent', model: 'fable-5' };
  const both: ModelCatalog = {
    providers: [
      ...CATALOG.providers,
      { instanceId: 'claudeAgent', name: 'Claude', ready: true, models: [{ slug: FABLE.model, name: FABLE.model, isDefault: false, effort: null }] },
    ],
  };
  const limited = { codex: { state: 'limited' as const, observedAt: '2026-10-01T09:59:40.000Z' } };

  function queued(): BatchItem {
    const rating = { tier: 'mid' as const, reason: 'waits on 2 tickets', by: 'logic' as const, version: 'rules-1' };
    const proposal = pickAuto({ rating, catalog: both, tierModels: { mid: SOL, hard: SOL }, usage: {} });
    const auto = buildAutoDecision(autoDecisionBody(proposal, { tier: proposal.tier, choice: proposal.choice }), NOW);
    return { ticketNumber: 11, title: 'Ticket 11', tier: 'mid', model: SOL, auto, status: 'queued', handOffId: null, reason: null };
  }

  it('changes nothing until Settings holds a tier mapping, and reads no usage for it', async () => {
    const usage = vi.fn(async () => limited);
    const h = harness({ catalog: async () => both, usage });
    expect(await h.service.repick(queued())).toEqual({ kind: 'keep' });
    expect(usage).not.toHaveBeenCalled();
  });

  it("re-picks from the saved tier mapping and a usage reading taken now, moving a limited provider's ticket", async () => {
    const usage = vi.fn(async () => limited);
    const h = harness({ catalog: async () => both, usage });
    await h.service.updateSettings({ tierModels: { mid: SOL, hard: FABLE } });
    const result = await h.service.repick(queued());
    expect(usage).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ kind: 'switch', model: FABLE, auto: { overrides: [], substitution: { reason: 'usage-limit', toTier: 'hard' } } });
  });

  it('holds the ticket while no other provider is mapped, and keeps it when the provider reads available', async () => {
    const h = harness({ catalog: async () => both, usage: async () => limited });
    await h.service.updateSettings({ tierModels: { mid: SOL, hard: SOL } });
    expect(await h.service.repick(queued())).toMatchObject({ kind: 'hold' });

    const free = harness({ catalog: async () => both, usage: async () => ({ codex: { state: 'available' as const, observedAt: '2026-10-01T09:59:40.000Z' } }) });
    await free.service.updateSettings({ tierModels: { mid: SOL, hard: FABLE } });
    expect(await free.service.repick(queued())).toEqual({ kind: 'keep' });
  });
});
