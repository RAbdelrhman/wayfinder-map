import { autoMapKey, autoMapUsageStop, autoStartTickets, AUTO_MAP_TIERS, DEFAULT_AUTO_MAP, parseAutoMapSetting, resolveAutoMapTier } from '../autoMap.js';
import type { AutoMapSetting, AutoMapTier } from '../autoMap.js';
import type { MapEvent } from '../mapWatch.js';
import type { Batch } from '../startNextRunner.js';
import type { TicketType } from '../types.js';
import * as icons from './icons.js';
import { icon } from './icons.js';
import { escapeHtml } from './markdown.js';
import type { ModelChoice, Tier } from './models.js';
import { TIER_LABEL } from './models.js';

/* The auto map (#164): the page side. Settings live in this browser, next to the hand-off cap and tier defaults. */

export const AUTO_MAP_KEY = 'wayfinder-map:auto-maps:v1';
const BATCH_MS = 400;

export const AUTO_MAP_HINT = 'Starts tickets as they become next. Grilling and prototype threads start, then wait for your choices.';

export const AUTO_TIER_LABEL: Record<AutoMapTier, string> = { auto: 'Auto', ...TIER_LABEL };

type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'getItem' | 'setItem'>;

function readAll(storage: Reader): Record<string, unknown> {
  try {
    const stored: unknown = JSON.parse(storage.getItem(AUTO_MAP_KEY) ?? '{}');
    return typeof stored === 'object' && stored !== null && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** A map's auto map setting. Off, with Auto as the tier, until someone sets it up. */
export function readAutoMap(storage: Reader, repo: string, mapNumber: number): AutoMapSetting {
  return parseAutoMapSetting(readAll(storage)[autoMapKey(repo, mapNumber)] ?? DEFAULT_AUTO_MAP);
}

export function saveAutoMap(storage: Writer, repo: string, mapNumber: number, setting: AutoMapSetting): void {
  storage.setItem(AUTO_MAP_KEY, JSON.stringify({ ...readAll(storage), [autoMapKey(repo, mapNumber)]: setting }));
}

/** The setting after the toggle or the setup dialog's confirm turned it on. */
export function turnedOn(setting: AutoMapSetting, now: Date, tier: AutoMapTier = setting.tier): AutoMapSetting {
  return { enabled: true, tier, setUp: true, enabledAt: now.toISOString() };
}

export function turnedOff(setting: AutoMapSetting): AutoMapSetting {
  return { ...setting, enabled: false };
}

/* ---------- starting ---------- */

export interface AutoMapStartBody {
  map: number;
  cap: number;
  auto: true;
  tickets: Array<{ ticket: number; tier: Tier; model: ModelChoice | null; auto?: Record<string, unknown> }>;
}

/** What Auto chose for one ticket: its tier and model, and the record of the proposal. */
export type AutoEntry = { tier: Tier; model: ModelChoice | null; auto: Record<string, unknown> };

export interface AutoMapDeps {
  storage: Writer;
  /** Sends one batch to the server. `ok` is false when it did not accept the request. */
  post: (repo: string, body: AutoMapStartBody) => Promise<{ ok: boolean; error: string | null }>;
  /** The model the tier resolves to in Settings, or null to let T3 Code decide. */
  model: (tier: Tier) => Promise<ModelChoice | null>;
  /** Auto's pick for each ticket (#166), by ticket number. Without it, or when it fails, Auto runs on Mid. */
  autoPicks?: (repo: string, mapNumber: number, tickets: readonly number[]) => Promise<ReadonlyMap<number, AutoEntry>>;
  cap: () => number;
  now?: () => Date;
  batchMs?: number;
  /** Tells the user the auto map started tickets or could not. */
  toast: (message: string) => void;
  /** An event the auto map could not start goes back to the ordinary "ready" notification. */
  fallback: (event: MapEvent) => void;
}

/**
 * Collects the tickets that became next on auto maps, then hands each map's tickets to the
 * Start next runner in one batch, so the cap and the queue work as they do for Start next.
 */
export class AutoMapStarter {
  private readonly pending = new Map<string, { repo: string; mapNumber: number; events: Map<number, MapEvent> }>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly now: () => Date;

  constructor(private readonly deps: AutoMapDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  setting(repo: string, mapNumber: number): AutoMapSetting {
    return readAutoMap(this.deps.storage, repo, mapNumber);
  }

  save(repo: string, mapNumber: number, setting: AutoMapSetting): void {
    saveAutoMap(this.deps.storage, repo, mapNumber, setting);
  }

  /** Turn it on, now or after the setup dialog. Only events after this moment start anything. */
  enable(repo: string, mapNumber: number, tier?: AutoMapTier): AutoMapSetting {
    const next = turnedOn(this.setting(repo, mapNumber), this.now(), tier);
    this.save(repo, mapNumber, next);
    return next;
  }

  disable(repo: string, mapNumber: number): AutoMapSetting {
    const next = turnedOff(this.setting(repo, mapNumber));
    this.save(repo, mapNumber, next);
    return next;
  }

  /** Take a map event. True when the auto map will start the ticket, so the page need not announce it. */
  take(event: MapEvent): boolean {
    if (autoStartTickets([event], this.setting(event.repo, event.mapNumber)).length === 0) return false;
    const key = autoMapKey(event.repo, event.mapNumber);
    const entry = this.pending.get(key) ?? { repo: event.repo, mapNumber: event.mapNumber, events: new Map<number, MapEvent>() };
    entry.events.set(event.ticket.number, event);
    this.pending.set(key, entry);
    this.timer ??= setTimeout(() => void this.flush(), this.deps.batchMs ?? BATCH_MS);
    return true;
  }

  /** Hand off everything collected so far. */
  async flush(): Promise<void> {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const entries = [...this.pending.values()];
    this.pending.clear();
    await Promise.all(entries.map((entry) => this.start(entry)));
  }

  private async start(entry: { repo: string; mapNumber: number; events: Map<number, MapEvent> }): Promise<void> {
    // It may have been turned off while the tickets waited to be batched.
    const setting = this.setting(entry.repo, entry.mapNumber);
    const events = [...entry.events.values()].sort((a, b) => a.ticket.number - b.ticket.number);
    if (!setting.enabled) {
      for (const event of events) this.deps.fallback(event);
      return;
    }
    const tier = resolveAutoMapTier(setting.tier);
    const model = await this.deps.model(tier);
    const picks =
      setting.tier === 'auto' && this.deps.autoPicks !== undefined
        ? await this.deps.autoPicks(entry.repo, entry.mapNumber, events.map((event) => event.ticket.number)).catch(() => new Map<number, AutoEntry>())
        : new Map<number, AutoEntry>();
    const result = await this.deps
      .post(entry.repo, {
        map: entry.mapNumber,
        cap: this.deps.cap(),
        auto: true,
        tickets: events.map((event) => {
          const pick = picks.get(event.ticket.number);
          return pick === undefined ? { ticket: event.ticket.number, tier, model } : { ticket: event.ticket.number, ...pick };
        }),
      })
      .catch((error: unknown) => ({ ok: false, error: (error as Error).message }));
    if (result.ok) {
      this.deps.toast(`Auto map started ${events.map((event) => `#${String(event.ticket.number)}`).join(', ')}.`);
      return;
    }
    this.deps.toast(result.error ?? 'Auto map could not start the ticket.');
    for (const event of events) this.deps.fallback(event);
  }

  /**
   * Turn off every auto map a usage limit stopped, and return those stops so the page can say so.
   * The first usage-limit error stops the batch; the map stays off until someone turns it back on.
   */
  checkBatches(batches: readonly Batch[]): Batch[] {
    const stops: Batch[] = [];
    const seen = new Set<string>();
    for (const batch of batches) {
      const key = autoMapKey(batch.repo, batch.mapNumber);
      if (!batch.auto || seen.has(key)) continue;
      seen.add(key);
      const stop = autoMapUsageStop(batches, batch.repo, batch.mapNumber, this.setting(batch.repo, batch.mapNumber));
      if (stop === undefined) continue;
      this.disable(stop.repo, stop.mapNumber);
      stops.push(stop);
    }
    return stops;
  }
}

/* ---------- markup ---------- */

const HITL: ReadonlySet<TicketType | null> = new Set<TicketType | null>(['grilling', 'prototype']);

/** What a next card says while its map's auto map is on, or null when it won't start by itself. */
export function autoCardNote(ticketState: string, ticketType: TicketType | null, setting: AutoMapSetting): string | null {
  if (!setting.enabled || ticketState !== 'frontier') return null;
  return HITL.has(ticketType) ? 'auto map starts this, then waits for you' : 'auto map will start this';
}

export function autoCardMetaHtml(note: string): string {
  return `<span class="c-automark-meta">${icon(icons.BOLT)}${escapeHtml(note)}</span>`;
}

/** The blue mark beside the map name while the auto map is on. */
export function autoMapMarkHtml(enabled: boolean): string {
  return enabled ? `<span class="c-automark" title="${escapeHtml(AUTO_MAP_HINT)}">${icon(icons.BOLT)}auto</span>` : '';
}

export interface AutoMapMenuState {
  enabled: boolean;
  setUp: boolean;
  tier: AutoMapTier;
}

/** The map-name menu's toggle, its one-line state and, once set up, the settings link. */
export function autoMapMenuHtml(state: AutoMapMenuState): string {
  const hint = state.setUp ? `${AUTO_MAP_HINT} Tier: ${AUTO_TIER_LABEL[state.tier]}.` : 'The first time, you choose how it runs.';
  return `<div class="menu-sep"></div><button type="button" class="st-switch" role="switch" aria-checked="${String(state.enabled)}" data-nav-auto-map><span class="st-knob" aria-hidden="true"></span><span>Auto map</span></button><p class="c-menu-note">${escapeHtml(hint)}</p>${state.setUp ? '<button type="button" class="linkish c-setlink" data-nav-auto-settings>Auto map settings…</button>' : ''}`;
}

const TIER_HINT_COPY: Record<AutoMapTier, string> = {
  auto: 'Wayfinder rates each ticket and picks its tier and model.',
  simple: 'Every ticket it starts runs on the model you set for Simple.',
  mid: 'Every ticket it starts runs on the model you set for Mid.',
  hard: 'Every ticket it starts runs on the model you set for Hard.',
};

export function autoMapTierHint(tier: AutoMapTier): string {
  return TIER_HINT_COPY[tier];
}

/** The setup dialog's body: what the auto map does, one Tier choice, and the turn-on button. */
export function autoMapSetupHtml(mapNumber: number, setUp: boolean, tier: AutoMapTier, cap: number): string {
  const seg = AUTO_MAP_TIERS.map(
    (candidate) => `<button type="button" class="seg${candidate === tier ? ' is-on' : ''}" aria-pressed="${String(candidate === tier)}" data-am-tier="${candidate}">${AUTO_TIER_LABEL[candidate]}</button>`,
  ).join('');
  return `<div class="dialog-head"><div><h2 id="am-title">${setUp ? 'Auto map settings' : 'Turn on auto map'} · #${String(mapNumber)}</h2><p class="hint">Wayfinder starts tickets on this map by itself, without a click.</p></div><button type="button" class="detail-close" data-am-close aria-label="Close">×</button></div>
    <ul class="am-list">
      <li>${icon(icons.PLAY)}<span><b>Task and research tickets</b> start in T3 Code as soon as they become next.</span></li>
      <li>${icon(icons.PERSON)}<span><b>Grilling and prototype tickets</b> start too, then stop at the first question or design choice and wait for you. You get a “needs you” notification, and nothing goes on without your answer.</span></li>
      <li>${icon(icons.QUEUE)}<span>They count toward the <b>${String(cap)} running on this machine</b>. Over that, they queue.</span></li>
      <li>${icon(icons.ALERT)}<span>It turns itself off on a <b>usage limit</b> until you turn it back on, and only runs while the app is open.</span></li>
    </ul>
    <div class="st-autoctl"><span class="st-lbl" id="am-tier-lbl">Tier</span><div class="segmented" role="group" aria-labelledby="am-tier-lbl">${seg}</div><span class="st-hint">${escapeHtml(autoMapTierHint(tier))}</span></div>
    <div class="start-foot"><span class="start-count"></span><button type="button" class="ghost" data-am-close>Cancel</button><button type="button" class="primary" data-am-on>${setUp ? 'Save' : `${icon(icons.BOLT)}Turn on auto map`}</button></div>`;
}

/* ---------- dialog ---------- */

export interface AutoMapDialogOptions {
  starter: AutoMapStarter;
  /** The map on screen, or null while the page loads. */
  context: () => { repo: string; mapNumber: number } | null;
  cap: () => number;
  /** The setting changed, so the menu, the map name and the cards repaint. */
  onChange: () => void;
}

export interface AutoMapDialog {
  /** The menu toggle: off to on opens the setup dialog the first time, then flips directly. */
  toggle(): void;
  /** Auto map settings…: the same dialog, to change the tier. */
  open(): void;
}

export function mountAutoMapDialog(options: AutoMapDialogOptions): AutoMapDialog {
  const dialog = document.createElement('dialog');
  dialog.className = 'dialog am-dialog';
  dialog.setAttribute('aria-labelledby', 'am-title');
  document.body.append(dialog);
  let tier: AutoMapTier = 'auto';

  const draw = (): void => {
    const context = options.context();
    if (context === null) return;
    const setting = options.starter.setting(context.repo, context.mapNumber);
    dialog.innerHTML = autoMapSetupHtml(context.mapNumber, setting.setUp, tier, options.cap());
  };

  const open = (): void => {
    const context = options.context();
    if (context === null) return;
    tier = options.starter.setting(context.repo, context.mapNumber).tier;
    draw();
    if (!dialog.open) dialog.showModal();
  };

  const confirm = (): void => {
    const context = options.context();
    if (context === null) return;
    const setting = options.starter.setting(context.repo, context.mapNumber);
    // Saving the tier of a map that is off leaves it off.
    if (setting.setUp && !setting.enabled) options.starter.save(context.repo, context.mapNumber, { ...setting, tier });
    else options.starter.enable(context.repo, context.mapNumber, tier);
    dialog.close();
    options.onChange();
  };

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      dialog.close();
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (target === null) return;
    if (target.closest('[data-am-close]') !== null) {
      dialog.close();
      return;
    }
    if (target.closest('[data-am-on]') !== null) {
      confirm();
      return;
    }
    const picked = AUTO_MAP_TIERS.find((candidate) => candidate === target.closest<HTMLElement>('[data-am-tier]')?.dataset['amTier']);
    if (picked !== undefined) {
      tier = picked;
      draw();
    }
  });

  return {
    open,
    toggle() {
      const context = options.context();
      if (context === null) return;
      const setting = options.starter.setting(context.repo, context.mapNumber);
      if (setting.enabled) {
        options.starter.disable(context.repo, context.mapNumber);
        options.onChange();
      } else if (setting.setUp) {
        options.starter.enable(context.repo, context.mapNumber);
        options.onChange();
      } else {
        open();
      }
    },
  };
}
