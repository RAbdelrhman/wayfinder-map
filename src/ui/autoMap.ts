import { autoMapKey, autoStartTickets, AUTO_MAP_TIERS, parseAutoMapSetting, turnedOff, turnedOn } from '../autoMap.js';
import type { AutoMapSetting, AutoMapTier } from '../autoMap.js';
import type { AutoMapNotice } from '../autoMapStore.js';
import type { AutoMapView } from '../autoMapService.js';
import type { MapEvent } from '../mapWatch.js';
import { normalizeRepo } from '../repoRoutes.js';
import type { TicketType } from '../types.js';
import * as icons from './icons.js';
import { icon } from './icons.js';
import { escapeHtml } from './markdown.js';
import { TIER_LABEL } from './models.js';

/* The auto map (#164) on the page. The server keeps each map's setting and runs the trigger (#182), so it starts tickets with no page open; this side reads and changes the settings there. */

/** Where this browser kept the settings before the server held them. They are imported once, then removed. */
export const LEGACY_AUTO_MAP_KEY = 'wayfinder-map:auto-maps:v1';

export const AUTO_MAP_HINT = 'Starts tickets as they become next. Grilling and prototype threads start, then wait for your choices.';

export const AUTO_TIER_LABEL: Record<AutoMapTier, string> = { auto: 'Auto', ...TIER_LABEL };

type Reader = Pick<Storage, 'getItem'>;
type Remover = Pick<Storage, 'getItem' | 'removeItem'>;

/** A map the server turned the auto map off on, and why. */
export type AutoMapStop = AutoMapView['maps'][number];

export interface AutoMapClientDeps {
  /** One call to the server's auto map routes: a GET without a body, a POST with one. Null when it did not answer. */
  request: (path: string, body?: unknown) => Promise<AutoMapView | null>;
  now?: () => Date;
  /** The server's notices for the inbox, which it raised while no page was there. The inbox ignores one it already has. */
  notices: (notices: readonly AutoMapNotice[]) => void;
  /** The server turned these maps off on a usage limit since the last answer. */
  turnedOff: (stops: readonly AutoMapStop[]) => void;
  /** The settings changed, so the menu, the map name and the cards repaint. */
  changed: () => void;
}

/** The page's view of the auto map settings the server keeps. Changes show at once and are sent in the background. */
export class AutoMapClient {
  private settings = new Map<string, AutoMapSetting>();
  private readonly now: () => Date;

  constructor(private readonly deps: AutoMapClientDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /** A map's auto map setting. Off, with Auto as the tier, until someone sets it up. */
  setting(repo: string, mapNumber: number): AutoMapSetting {
    return this.settings.get(autoMapKey(repo, mapNumber)) ?? parseAutoMapSetting(undefined);
  }

  /** True when the server's auto map starts the ticket this event reports, so the page need not announce it. */
  covers(event: MapEvent): boolean {
    return event.type === 'ticket-next' && autoStartTickets([event], this.setting(event.repo, event.mapNumber)).length > 0;
  }

  /** Read the settings, and the notices and stops that came up since. */
  async refresh(): Promise<void> {
    const view = await this.deps.request('/api/auto-map').catch(() => null);
    if (view !== null) this.adopt(view);
  }

  /** Turn it on, now or after the setup dialog. Only events after this moment start anything. */
  enable(repo: string, mapNumber: number, tier?: AutoMapTier): AutoMapSetting {
    const next = turnedOn(this.setting(repo, mapNumber), this.now(), tier);
    this.settings.set(autoMapKey(repo, mapNumber), next);
    this.send(repo, mapNumber, { op: 'enable', ...(tier === undefined ? {} : { tier }) });
    return next;
  }

  disable(repo: string, mapNumber: number): AutoMapSetting {
    const next = turnedOff(this.setting(repo, mapNumber));
    this.settings.set(autoMapKey(repo, mapNumber), next);
    this.send(repo, mapNumber, { op: 'disable' });
    return next;
  }

  /** Change the tier without turning the map on or off. */
  setTier(repo: string, mapNumber: number, tier: AutoMapTier): AutoMapSetting {
    const next = { ...this.setting(repo, mapNumber), tier };
    this.settings.set(autoMapKey(repo, mapNumber), next);
    this.send(repo, mapNumber, { op: 'tier', tier });
    return next;
  }

  /** Send up the settings this browser kept before the server held them. The server keeps its own where it has one. */
  async importLegacy(storage: Remover): Promise<void> {
    let saved: unknown;
    try {
      saved = JSON.parse(storage.getItem(LEGACY_AUTO_MAP_KEY) ?? 'null');
    } catch {
      saved = null;
    }
    if (typeof saved === 'object' && saved !== null && !Array.isArray(saved)) {
      for (const [key, value] of Object.entries(saved)) {
        const split = key.lastIndexOf('#');
        const repo = normalizeRepo(key.slice(0, Math.max(0, split)));
        const mapNumber = Number(key.slice(split + 1));
        if (repo === null || !Number.isSafeInteger(mapNumber) || mapNumber <= 0) continue;
        const view = await this.deps.request('/api/auto-map/map', { repo, map: mapNumber, op: 'import', setting: parseAutoMapSetting(value) }).catch(() => null);
        // Keep the browser's copy if the server did not answer, so the next load tries again.
        if (view === null) return;
        this.adopt(view);
      }
    }
    storage.removeItem(LEGACY_AUTO_MAP_KEY);
  }

  private send(repo: string, mapNumber: number, change: Record<string, unknown>): void {
    void this.deps
      .request('/api/auto-map/map', { repo, map: mapNumber, ...change })
      .then((view) => {
        if (view !== null) this.adopt(view);
      })
      .catch(() => undefined);
  }

  private adopt(view: AutoMapView): void {
    const before = this.settings;
    this.settings = new Map(view.maps.map((map) => [autoMapKey(map.repo, map.mapNumber), parseAutoMapSetting(map)]));
    const stops = view.maps.filter((map) => !map.enabled && map.stop !== null && before.get(autoMapKey(map.repo, map.mapNumber))?.enabled === true);
    this.deps.notices(view.notices);
    if (stops.length > 0) this.deps.turnedOff(stops);
    if (JSON.stringify([...before]) !== JSON.stringify([...this.settings])) this.deps.changed();
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
      <li>${icon(icons.ALERT)}<span>It turns itself off on a <b>usage limit</b> until you turn it back on. It keeps going while Wayfinder runs, even with no window open.</span></li>
    </ul>
    <div class="st-autoctl"><span class="st-lbl" id="am-tier-lbl">Tier</span><div class="segmented" role="group" aria-labelledby="am-tier-lbl">${seg}</div><span class="st-hint">${escapeHtml(autoMapTierHint(tier))}</span></div>
    <div class="start-foot"><span class="start-count"></span><button type="button" class="ghost" data-am-close>Cancel</button><button type="button" class="primary" data-am-on>${setUp ? 'Save' : `${icon(icons.BOLT)}Turn on auto map`}</button></div>`;
}

/* ---------- dialog ---------- */

export interface AutoMapDialogOptions {
  autoMaps: AutoMapClient;
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
    const setting = options.autoMaps.setting(context.repo, context.mapNumber);
    dialog.innerHTML = autoMapSetupHtml(context.mapNumber, setting.setUp, tier, options.cap());
  };

  const open = (): void => {
    const context = options.context();
    if (context === null) return;
    tier = options.autoMaps.setting(context.repo, context.mapNumber).tier;
    draw();
    if (!dialog.open) dialog.showModal();
  };

  const confirm = (): void => {
    const context = options.context();
    if (context === null) return;
    const setting = options.autoMaps.setting(context.repo, context.mapNumber);
    // Saving the tier of a map that is off leaves it off.
    if (setting.setUp && !setting.enabled) options.autoMaps.setTier(context.repo, context.mapNumber, tier);
    else options.autoMaps.enable(context.repo, context.mapNumber, tier);
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
      const setting = options.autoMaps.setting(context.repo, context.mapNumber);
      if (setting.enabled) {
        options.autoMaps.disable(context.repo, context.mapNumber);
        options.onChange();
      } else if (setting.setUp) {
        options.autoMaps.enable(context.repo, context.mapNumber);
        options.onChange();
      } else {
        open();
      }
    },
  };
}
