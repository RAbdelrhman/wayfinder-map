import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HandOffStatusDto } from '../handOffTracking.js';
import type { Batch, BatchItem } from '../startNextRunner.js';
import type { Ticket, TicketState, TicketType, WayfinderMap } from '../types.js';
import type { AutoProposal } from '../autoPick.js';
import {
  batchCardChip,
  batchPanelHtml,
  batchTriggerLabel,
  batchView,
  handOffCap,
  mapStartPlan,
  proposalFor,
  saveHandOffCap,
  startRequestEntry,
  startDialogHtml,
  startRowWord,
  visibleBatch,
} from './startNext.js';
import type { AutoState } from './startNext.js';
import type { ModelCatalog, ModelChoice, Tier } from '../models.js';

const NOW = Date.parse('2026-09-30T12:00:00.000Z');

function model(slug: string, name: string): ModelCatalog['providers'][number]['models'][number] {
  return { slug, name, isDefault: false, effort: null };
}

const CATALOG: ModelCatalog = {
  providers: [
    { instanceId: 'codex', name: 'Codex', ready: true, models: [model('s', 'GPT Simple'), model('m', 'GPT Mid'), model('h', 'GPT Hard')] },
    { instanceId: 'claude', name: 'Claude', ready: true, models: [model('c', 'Claude')] },
  ],
};
const TIER_MODELS: Partial<Record<Tier, ModelChoice>> = {
  simple: { instanceId: 'codex', model: 's' },
  mid: { instanceId: 'codex', model: 'm' },
  hard: { instanceId: 'codex', model: 'h' },
};
const NO_AUTO: AutoState = { ratings: new Map(), usage: {}, pending: false };

function ticket(number: number, type: TicketType | null = 'task', state: TicketState = 'frontier'): Ticket {
  return {
    number,
    title: `Ticket ${String(number)}`,
    url: '',
    body: '',
    type,
    labels: [],
    open: state !== 'done',
    assignee: null,
    blockedBy: [],
    openBlockers: [],
    state,
    updatedAt: '2026-09-30T00:00:00.000Z',
  };
}

function map(tickets: Ticket[]): WayfinderMap {
  return { number: 5, title: 'Map', tickets } as unknown as WayfinderMap;
}

function handOff(ticketNumber: number, overrides: Partial<HandOffStatusDto> = {}): HandOffStatusDto {
  return {
    id: `hand-off-${String(ticketNumber)}`,
    repo: 'octo/one',
    mapNumber: 5,
    mapTitle: 'Map',
    ticketNumber,
    title: `Ticket ${String(ticketNumber)}`,
    threadId: `thread-${String(ticketNumber)}`,
    rung: 'thread',
    status: 'running',
    acknowledged: false,
    createdAt: '2026-09-30T11:48:00.000Z',
    updatedAt: '2026-09-30T11:48:00.000Z',
    lastSeenAt: '2026-09-30T11:48:00.000Z',
    stale: false,
    sequence: null,
    branch: null,
    pendingApproval: false,
    pendingUserInput: false,
    pullRequests: [],
    ...overrides,
  };
}

function item(ticketNumber: number, status: BatchItem['status'], extra: Partial<BatchItem> = {}): BatchItem {
  return { ticketNumber, title: `Ticket ${String(ticketNumber)}`, tier: 'mid', model: null, auto: null, status, handOffId: null, reason: null, ...extra };
}

function batch(items: BatchItem[], extra: Partial<Batch> = {}): Batch {
  return { id: 'b1', repo: 'octo/one', mapNumber: 5, cap: 4, createdAt: '', status: 'running', stop: null, items, ...extra };
}

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value) };
}

describe('hand-off cap setting', () => {
  it('defaults to 4 and keeps the cap chosen in Settings', () => {
    const storage = memoryStorage();
    expect(handOffCap(storage)).toBe(4);
    saveHandOffCap(6, storage);
    expect(handOffCap(storage)).toBe(6);
  });

  it('falls back to 4 for a bad saved value or unreadable storage', () => {
    const storage = memoryStorage();
    storage.setItem('wayfinder-map:hand-off-cap:v1', 'lots');
    expect(handOffCap(storage)).toBe(4);
    expect(handOffCap({ getItem: () => { throw new Error('blocked'); } })).toBe(4);
  });
});

describe('mapStartPlan', () => {
  const base = { repo: 'octo/one', cap: 4, batches: [], now: NOW };

  it('skips a ticket whose hand-off is live and says what it is doing', () => {
    const plan = mapStartPlan({ ...base, map: map([ticket(1), ticket(2)]), handOffs: [handOff(2)] });
    expect(plan.rows.find((row) => row.ticket.number === 2)).toMatchObject({ kind: 'skipped', reason: 'Already in T3 Code · working 12m ago' });
    expect(plan.rows.find((row) => row.ticket.number === 1)?.kind).toBe('start');
  });

  it('starts a ticket again once its hand-off has ended, and ignores other repositories', () => {
    const plan = mapStartPlan({ ...base, map: map([ticket(1), ticket(2)]), handOffs: [handOff(1, { status: 'finished' }), handOff(2, { repo: 'octo/other' })] });
    expect(plan.rows.map((row) => row.kind)).toEqual(['start', 'start']);
  });

  it('counts live hand-offs on every map against the cap', () => {
    const elsewhere = [10, 11, 12].map((number) => handOff(number, { mapNumber: 9, repo: 'octo/other' }));
    const plan = mapStartPlan({ ...base, map: map([ticket(1), ticket(2)]), handOffs: elsewhere });
    expect(plan.rows.map((row) => row.kind)).toEqual(['start', 'queue']);
    expect(plan).toMatchObject({ running: 3, cap: 4 });
  });

  it('skips tickets a running batch has queued, but not those of a finished one', () => {
    const running = batch([item(1, 'queued'), item(2, 'starting')]);
    const finished = batch([item(3, 'queued')], { status: 'stopped' });
    const plan = mapStartPlan({ ...base, map: map([ticket(1), ticket(2), ticket(3)]), handOffs: [], batches: [running, finished] });
    expect(plan.rows.map((row) => [row.ticket.number, row.kind])).toEqual([[3, 'start'], [1, 'skipped'], [2, 'skipped']]);
  });
});

describe('start next confirm list', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const plan = mapStartPlan({
    repo: 'octo/one',
    cap: 2,
    batches: [],
    now: NOW,
    map: map([ticket(1), ticket(2, 'research'), ticket(3, 'grilling'), ticket(4), ticket(5, 'prototype')]),
    handOffs: [handOff(4)],
  });

  const view = (choices: Map<number, 'auto' | Tier> = new Map(), pending = false): Parameters<typeof startDialogHtml>[1] => ({
    choices,
    proposals: new Map(plan.rows.filter((row) => row.kind !== 'skipped').map((row) => [row.ticket.number, proposalFor(ticket(row.ticket.number, row.ticket.type), NO_AUTO, CATALOG, TIER_MODELS)])),
    pending,
  });

  it('groups Ready, Needs you and Skipped, each row saying what will happen', () => {
    const html = startDialogHtml(plan, view());
    expect(html.indexOf('Ready')).toBeLessThan(html.indexOf('Needs you'));
    expect(html.indexOf('Needs you')).toBeLessThan(html.indexOf('Skipped'));
    expect(html).toContain('Starts now');
    expect(html).toContain('Needs you');
    expect(html).toContain('Already in T3 Code · working 12m ago');
    expect(html).toContain('Grilling tickets wait for you in the thread');
    expect(html).toContain('Prototype tickets wait for you in the thread');
  });

  it('writes the footer and a Start button for what is picked', () => {
    const html = startDialogHtml(plan, view());
    expect(html).toContain('1 start now · 1 queued');
    expect(html).toContain('1 of 2 running on this machine');
    expect(html).toContain('Start 2</button>');
    expect(html).not.toContain('data-start-go disabled');
  });

  it('offers Auto, Simple, Mid and Hard per startable row, on Auto by default, and none for a skipped one', () => {
    const html = startDialogHtml(plan, view(new Map([[1, 'hard']])));
    expect(html).toContain('data-start-tier="hard" data-start-ticket="1" aria-pressed="true"');
    expect(html).toContain('data-start-tier="auto" data-start-ticket="2" aria-pressed="true"');
    expect(html).toContain('data-start-tier="auto" data-start-ticket="1" aria-pressed="false"');
    expect(html).not.toContain('data-start-ticket="4"');
    expect(html).not.toContain('Mid for all');
  });

  it("shows Auto's pick, a one-line reason and who rated it, and 'your pick' once the user overrides", () => {
    const html = startDialogHtml(plan, view(new Map([[1, 'hard']])));
    expect(html).toContain('Mid → GPT Mid: research ticket');
    expect(html).toContain('Rated by logic');
    expect(html).toContain('<b>Hard</b> · T3 Code default<i>your pick</i>');
  });

  it('says the rating is on its way while a model rates, and holds Start back', () => {
    const html = startDialogHtml(plan, view(new Map(), true));
    expect(html).toContain('rating…');
    expect(html).toContain('data-start-go disabled');
  });

  it('unticks grilling and prototype rows and ticks the rest', () => {
    const html = startDialogHtml(plan, view());
    expect(html).toMatch(/data-start-toggle="1" checked/);
    expect(html).toMatch(/data-start-toggle="3"(?! checked)/);
  });

  it('disables Start when nothing is picked', () => {
    const empty = mapStartPlan({ repo: 'octo/one', cap: 4, batches: [], handOffs: [], map: map([ticket(3, 'grilling')]) });
    expect(startDialogHtml(empty, { choices: new Map(), proposals: new Map(), pending: false })).toContain('data-start-go disabled');
  });

  it('names the status of each kind of row', () => {
    const word = (index: number): string => startRowWord(plan.rows[index] ?? plan.rows[0]!);
    expect(plan.rows.map((_, index) => word(index))).toEqual(['Starts now', 'Queued 1', 'Needs you', 'Needs you', 'Skipped']);
    const queued = mapStartPlan({ repo: 'octo/one', cap: 1, batches: [], handOffs: [], map: map([ticket(1), ticket(2), ticket(3)]) });
    expect(queued.rows.map(startRowWord)).toEqual(['Starts now', 'Queued 1', 'Queued 2']);
  });
});

describe('batch progress', () => {
  it('counts what runs, what waits and what failed, from each ticket\'s own hand-off', () => {
    const view = batchView(
      batch([item(1, 'started', { handOffId: 'hand-off-1' }), item(2, 'started', { handOffId: 'hand-off-2' }), item(3, 'starting'), item(4, 'queued'), item(5, 'queued'), item(6, 'skipped', { reason: 'Already in T3 Code' })]),
      [handOff(1), handOff(2, { status: 'finished', pullRequests: [{ number: 9, url: 'u', state: 'OPEN', checksState: null, reviewDecision: null, isDraft: false, hasSnapshot: true, mergedAt: null, syncedAt: null, source: 't3' }] })],
    );
    expect(view.items.map((entry) => [entry.item.ticketNumber, entry.word, entry.tone])).toEqual([
      [1, 'Working', 'working'],
      [2, 'PR ready', 'done'],
      [3, 'Starting', 'starting'],
      [4, 'Queued 1', 'queued'],
      [5, 'Queued 2', 'queued'],
      [6, 'Skipped', 'skipped'],
    ]);
    expect(view).toMatchObject({ running: 2, queued: 2, failed: 0, total: 5, usageLimit: false });
    expect(batchTriggerLabel(view)).toBe('2 running · 2 queued');
  });

  it('shows a started ticket as Starting until its hand-off record arrives', () => {
    const view = batchView(batch([item(1, 'started', { handOffId: 'hand-off-1' })]), []);
    expect(view.items[0]).toMatchObject({ word: 'Starting', tone: 'starting' });
  });

  it('turns red on a usage limit and says what is still running, what went back and when it resets', () => {
    const stopped = batch([item(1, 'started', { handOffId: 'hand-off-1' }), item(2, 'started', { handOffId: 'hand-off-2' }), item(3, 'back-to-next', { reason: 'Went back to next when the batch stopped' }), item(4, 'back-to-next')], {
      status: 'stopped',
      stop: { kind: 'usage-limit', ticketNumber: 2, message: 'Usage limit reached.', resetsAt: '4:00 PM' },
    });
    const view = batchView(stopped, [handOff(1), handOff(2, { status: 'failed' })]);
    expect(batchTriggerLabel(view)).toBe('Stopped: usage limit');
    expect(view.items.map((entry) => entry.word)).toEqual(['Working', 'Usage limit', 'Back to next', 'Back to next']);
    const html = batchPanelHtml(view);
    expect(html).toContain('Usage limit reached.');
    expect(html).toContain('#1 is still running.');
    expect(html).toContain('#3 and #4 went back to next.');
    expect(html).toContain('Resets 4:00 PM.');
    expect(html).toContain('data-batch-action="again"');
    expect(html).not.toContain('Stop the queue');
  });

  it('offers Stop the queue while the batch runs', () => {
    const html = batchPanelHtml(batchView(batch([item(1, 'queued')]), []));
    expect(html).toContain('data-batch-action="stop"');
    expect(html).toContain('Queued 1');
  });

  it('shows the topbar control only for this map\'s running or usage-limit-stopped batch', () => {
    const running = batch([item(1, 'queued')]);
    const limited = batch([item(1, 'started')], { id: 'b2', status: 'stopped', stop: { kind: 'usage-limit', ticketNumber: 1, message: 'm', resetsAt: null } });
    const userStopped = batch([item(1, 'started')], { id: 'b3', status: 'stopped', stop: { kind: 'user' } });
    const done = batch([item(1, 'started')], { id: 'b4', status: 'done' });
    expect(visibleBatch([running], 'octo/one', 5)).toBe(running);
    expect(visibleBatch([limited], 'OCTO/one', 5)).toBe(limited);
    expect(visibleBatch([userStopped, done], 'octo/one', 5)).toBeUndefined();
    expect(visibleBatch([running], 'octo/one', 6)).toBeUndefined();
    expect(visibleBatch([running], 'octo/other', 5)).toBeUndefined();
  });

  it('puts a dashed Queued chip on a waiting card and Starting on one being handed off', () => {
    const running = batch([item(1, 'started', { handOffId: 'h' }), item(2, 'starting'), item(3, 'queued'), item(4, 'queued')]);
    expect(batchCardChip([running], 'octo/one', 5, 4)).toContain('is-queued');
    expect(batchCardChip([running], 'octo/one', 5, 4)).toContain('Queued 2');
    expect(batchCardChip([running], 'octo/one', 5, 3)).toContain('Queued 1');
    expect(batchCardChip([running], 'octo/one', 5, 2)).toContain('is-starting');
    expect(batchCardChip([running], 'octo/one', 5, 1)).toBeNull();
    expect(batchCardChip([running], 'octo/one', 5, 99)).toBeNull();
    expect(batchCardChip([batch([item(3, 'queued')], { status: 'stopped' })], 'octo/one', 5, 3)).toBeNull();
  });
});

describe('start request entries', () => {
  const hardTicket: Ticket = { ...ticket(7, 'research'), body: 'See `src/a.ts`, `src/b.ts`, `src/c.ts`, `src/d.ts`, `src/e.ts` and `src/f.ts`; the queue runs concurrent starts.' };
  const proposal: AutoProposal = proposalFor(hardTicket, NO_AUTO, CATALOG, TIER_MODELS);

  it('starts an Auto row on the proposed tier and model, and records the proposal', () => {
    const entry = startRequestEntry(hardTicket, 'auto', proposal, CATALOG, TIER_MODELS);
    expect(entry).toMatchObject({ ticket: 7, tier: 'hard', model: { instanceId: 'codex', model: 'h' } });
    expect(entry.auto).toMatchObject({
      scoring: { version: 'rules-1' },
      proposed: { tier: 'hard', provider: 'codex', model: 'h' },
      final: { tier: 'hard', provider: 'codex', model: 'h' },
      usage: { state: 'unknown', observedAt: null },
    });
  });

  it("honours an override: the chosen tier's model starts, and the record keeps both the proposal and the final choice", () => {
    const entry = startRequestEntry(hardTicket, 'simple', proposal, CATALOG, TIER_MODELS);
    expect(entry).toMatchObject({ tier: 'simple', model: { instanceId: 'codex', model: 's' } });
    expect(entry.auto).toMatchObject({ proposed: { tier: 'hard', model: 'h' }, final: { tier: 'simple', model: 's' } });
  });

  it("starts on T3 Code's default when the models are not loaded", () => {
    const offline = proposalFor(hardTicket, NO_AUTO, null, TIER_MODELS);
    expect(startRequestEntry(hardTicket, 'auto', offline, null, TIER_MODELS)).toMatchObject({ tier: 'hard', model: null });
    expect(startRequestEntry(hardTicket, 'mid', offline, null, TIER_MODELS)).toMatchObject({ tier: 'mid', model: null });
  });
});
