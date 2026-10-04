import type { Calibration } from './autoCalibration.js';
import { autoDecisionBody, pickAuto, rateByRules, tierMappingOf } from './autoPick.js';
import type { ProviderUsage, Rating } from './autoPick.js';
import { buildCalibrations, rateByRulesTimed, shadowTickets, sharesRatingModel } from './autoShadow.js';
import type { RatingAnswer } from './autoShadow.js';
import type { ModelRatingResult } from './autoRater.js';
import { autoMapKey, autoMapUsageStop, autoStartTickets, AUTO_MAP_TIERS, parseAutoMapSetting, resolveAutoMapTier, turnedOff, turnedOn } from './autoMap.js';
import type { AutoMapSetting, AutoMapStartBody, AutoMapTier } from './autoMap.js';
import { repickQueued } from './autoRepick.js';
import type { Repick } from './autoRepick.js';
import { NOTICE_LIMIT } from './autoMapStore.js';
import type { AutoMapEntry, AutoMapMachineSettings, AutoMapNotice, AutoMapStateStore } from './autoMapStore.js';
import type { MapEvent } from './mapWatch.js';
import type { MapWatcher } from './mapWatcher.js';
import { liveChoice, parseAutoRater, parseCalibrationMode, parseTierModels } from './models.js';
import type { ModelCatalog, ModelChoice } from './models.js';
import type { DesktopNotification, NotificationKind } from './notifications.js';
import { normalizeCap } from './startNext.js';
import type { Batch, BatchItem, UsageLimit } from './startNextRunner.js';
import type { Ticket, WayfinderMap } from './types.js';

/* The auto map's trigger, run in the server (#182): it keeps watching a map while no page is open, hands off what becomes next, and turns itself off on a usage limit. */

const BATCH_MS = 400;
/** The most tickets one batch asks a model to rate, as the auto-rate route allows. */
const MAX_RATED = 16;
/** A notice the page has not picked up in this long is stale news. */
const NOTICE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface AutoMapServiceDeps {
  store: AutoMapStateStore;
  watcher: Pick<MapWatcher, 'watch' | 'catchUp'>;
  /** The map as it is now, or null when it cannot be read. */
  loadMap: (repo: string, mapNumber: number) => Promise<WayfinderMap | null>;
  /** Hands one batch to the Start next runner. `ok` is false when it did not accept the request. */
  submit: (repo: string, body: AutoMapStartBody) => Promise<{ ok: boolean; error: string | null }>;
  /** What T3 Code can run, or null while it cannot be reached. */
  catalog: () => Promise<ModelCatalog | null>;
  usage: () => Promise<Readonly<Record<string, ProviderUsage>>>;
  rate: (ticket: Ticket, choice: ModelChoice) => Promise<ModelRatingResult>;
  /** Whether Settings lets this kind of notification through. */
  notificationOn: (kind: NotificationKind) => Promise<boolean>;
  /** The desktop app's OS notification. Absent in the CLI. */
  desktop?: (notification: DesktopNotification) => void;
  now?: () => Date;
  batchMs?: number;
}

/** What the page reads: every map's setting, the machine settings, and the notices to put in its inbox. */
export interface AutoMapView {
  maps: Array<{ repo: string; mapNumber: number; stop: UsageLimit | null } & AutoMapSetting>;
  settings: AutoMapMachineSettings;
  notices: AutoMapNotice[];
}

export type AutoMapChange =
  | { op: 'enable'; tier?: AutoMapTier }
  | { op: 'disable' }
  | { op: 'tier'; tier: AutoMapTier }
  /** A setting the page kept in its browser before the server held them. Taken only for a map the server has none for. */
  | { op: 'import'; setting: AutoMapSetting };

export function parseAutoMapChange(value: unknown): AutoMapChange | null {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const tier = AUTO_MAP_TIERS.find((candidate) => candidate === raw['tier']);
  if (raw['op'] === 'enable') return tier === undefined ? { op: 'enable' } : { op: 'enable', tier };
  if (raw['op'] === 'disable') return { op: 'disable' };
  if (raw['op'] === 'tier') return tier === undefined ? null : { op: 'tier', tier };
  if (raw['op'] === 'import') return { op: 'import', setting: parseAutoMapSetting(raw['setting']) };
  return null;
}

interface Pending {
  repo: string;
  mapNumber: number;
  setting: AutoMapSetting;
  events: Map<number, MapEvent>;
}

function desktopNotificationOf(notice: AutoMapNotice): DesktopNotification {
  const ticket = `#${String(notice.ticketNumber)} ${notice.ticketTitle}`;
  return {
    kind: notice.kind,
    title: `${notice.repo} · Map #${String(notice.mapNumber)} ${notice.mapTitle}`,
    body: notice.kind === 'unblocked' ? `Ready to start: ${ticket}` : `Auto map turned off by a usage limit: ${ticket}`,
    repo: notice.repo,
    mapNumber: notice.mapNumber,
    ticketNumber: notice.ticketNumber,
  };
}

/**
 * Starts the tickets that become next on every map whose auto map is on, with or without a page. It collects
 * a map's events for a moment, then hands them to Start next as one batch, so the cap and the queue work as they do
 * for Start next. Events from a catch-up after a quit start nothing (#124).
 */
export class AutoMapService {
  private readonly entries = new Map<string, AutoMapEntry>();
  private readonly stops = new Map<string, () => void>();
  /** Why each map's auto map last turned itself off. Kept in memory only: it is the provider's own words. */
  private readonly limits = new Map<string, UsageLimit>();
  private readonly pending = new Map<string, Pending>();
  private settings: AutoMapMachineSettings = { cap: null, tierModels: null, rater: null, calibration: null };
  private notices: AutoMapNotice[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private persistTail: Promise<void> = Promise.resolve();
  private closed = false;
  private readonly now: () => Date;

  constructor(private readonly deps: AutoMapServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /** Load what was saved and start watching every map that is on, so a quit and restart keeps it going. */
  async init(): Promise<void> {
    const state = await this.deps.store.load();
    this.settings = state.settings;
    this.notices = this.fresh(state.notices);
    for (const entry of state.maps) this.entries.set(autoMapKey(entry.repo, entry.mapNumber), entry);
    const repos = new Set<string>();
    for (const entry of this.entries.values()) {
      if (!entry.setting.enabled) continue;
      this.watch(entry);
      repos.add(entry.repo);
    }
    for (const repo of repos) void this.deps.watcher.catchUp(repo).catch(() => undefined);
  }

  view(): AutoMapView {
    return {
      maps: [...this.entries.values()].map((entry) => ({ repo: entry.repo, mapNumber: entry.mapNumber, ...entry.setting, stop: this.limits.get(autoMapKey(entry.repo, entry.mapNumber)) ?? null })),
      settings: structuredClone(this.settings),
      notices: structuredClone(this.notices),
    };
  }

  setting(repo: string, mapNumber: number): AutoMapSetting {
    return this.entries.get(autoMapKey(repo, mapNumber))?.setting ?? parseAutoMapSetting(undefined);
  }

  /** Change one map's setting. Turning it on starts watching the map, with no page needed. */
  async change(repo: string, mapNumber: number, change: AutoMapChange): Promise<void> {
    const id = autoMapKey(repo, mapNumber);
    const known = this.entries.get(id);
    const current = known?.setting ?? parseAutoMapSetting(undefined);
    let next: AutoMapSetting;
    if (change.op === 'enable') {
      next = turnedOn(current, this.now(), change.tier);
      this.limits.delete(id);
    } else if (change.op === 'disable') {
      next = turnedOff(current);
    } else if (change.op === 'tier') {
      next = { ...current, tier: change.tier };
    } else {
      if (known !== undefined) return;
      next = change.setting;
    }
    const entry: AutoMapEntry = { repo, mapNumber, setting: next };
    this.entries.set(id, entry);
    if (next.enabled) {
      this.watch(entry);
      void this.deps.watcher.catchUp(repo).catch(() => undefined);
    } else {
      this.unwatch(id);
    }
    await this.persist();
  }

  /** Save the machine-wide settings the trigger reads. Returns false when the patch held nothing usable. */
  async updateSettings(patch: unknown): Promise<boolean> {
    const raw = typeof patch === 'object' && patch !== null ? (patch as Record<string, unknown>) : {};
    const next = { ...this.settings };
    let changed = false;
    if (typeof raw['cap'] === 'number' && normalizeCap(raw['cap']) === raw['cap']) {
      next.cap = raw['cap'];
      changed = true;
    }
    if (typeof raw['tierModels'] === 'object' && raw['tierModels'] !== null) {
      next.tierModels = parseTierModels(raw['tierModels']);
      changed = true;
    }
    if (typeof raw['rater'] === 'object' && raw['rater'] !== null) {
      next.rater = parseAutoRater(raw['rater']);
      changed = true;
    }
    if (typeof raw['calibration'] === 'object' && raw['calibration'] !== null) {
      next.calibration = parseCalibrationMode(raw['calibration']);
      changed = true;
    }
    if (!changed) return false;
    this.settings = next;
    await this.persist();
    return true;
  }

  /**
   * A page loaded a map's snapshot: watch the on maps in it that lost their watch when a page closed or the
   * map was settled, so the trigger keeps running after the page leaves.
   */
  reconcile(repo: string, activeMaps: ReadonlySet<number>): void {
    for (const entry of this.entries.values()) {
      if (entry.repo.toLowerCase() === repo.toLowerCase() && entry.setting.enabled && activeMaps.has(entry.mapNumber)) this.watch(entry);
    }
  }

  /** The runner stopped a batch on a usage limit. The first one turns that map's auto map off and says so. */
  async usageStopped(batch: Batch): Promise<void> {
    const id = autoMapKey(batch.repo, batch.mapNumber);
    const entry = this.entries.get(id);
    if (entry === undefined) return;
    const stopped = autoMapUsageStop([batch], batch.repo, batch.mapNumber, entry.setting);
    const stop = stopped?.stop?.kind === 'usage-limit' ? stopped.stop : null;
    if (stop === null) return;
    this.entries.set(id, { ...entry, setting: turnedOff(entry.setting) });
    this.limits.set(id, { message: stop.message, resetsAt: stop.resetsAt });
    this.unwatch(id);
    await this.persistUsageStop();
    if (this.closed) return;
    const item = batch.items.find((candidate) => candidate.ticketNumber === stop.ticketNumber) ?? batch.items[0];
    if (item === undefined) return;
    const map = await this.deps.loadMap(batch.repo, batch.mapNumber).catch(() => null);
    if (this.closed) return;
    await this.publish({
      id: `automap:${batch.id}`,
      kind: 'handOffError',
      repo: batch.repo,
      mapNumber: batch.mapNumber,
      mapTitle: map?.title ?? `Map #${String(batch.mapNumber)}`,
      ticketNumber: item.ticketNumber,
      ticketTitle: item.title,
      createdAt: this.now().toISOString(),
    });
  }

  /**
   * A queued Auto ticket has waited past a usage reading's life: pick its model again from a fresh reading and the
   * tier mapping in Settings (#189). Without the mapping, or when a reading cannot be taken, it keeps its model.
   */
  async repick(item: Readonly<BatchItem>): Promise<Repick> {
    const tierModels = this.settings.tierModels;
    if (tierModels === null) return { kind: 'keep' };
    const [catalog, usage] = await Promise.all([this.deps.catalog().catch(() => null), this.deps.usage()]);
    return repickQueued({ item, catalog, tierModels, usage, now: this.now() });
  }

  /** Hand off everything collected so far. */
  async flush(): Promise<void> {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const batches = [...this.pending.values()];
    this.pending.clear();
    await Promise.all(batches.map((batch) => this.start(batch)));
  }

  close(): void {
    this.closed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.pending.clear();
    for (const id of [...this.stops.keys()]) this.unwatch(id);
  }

  private watch(entry: AutoMapEntry): void {
    const id = autoMapKey(entry.repo, entry.mapNumber);
    if (this.closed || this.stops.has(id)) return;
    // The watcher drops a settled or closed map and every listener on it, which ends this watch too.
    this.stops.set(id, this.deps.watcher.watch(entry.repo, entry.mapNumber, (event) => this.take(event), () => void this.stops.delete(id)));
  }

  private unwatch(id: string): void {
    this.stops.get(id)?.();
    this.stops.delete(id);
  }

  private take(event: MapEvent): void {
    if (event.type !== 'ticket-next' || autoStartTickets([event], this.setting(event.repo, event.mapNumber)).length === 0) return;
    const id = autoMapKey(event.repo, event.mapNumber);
    const setting = this.setting(event.repo, event.mapNumber);
    const existing = this.pending.get(id);
    const batch = existing?.setting === setting ? existing : { repo: event.repo, mapNumber: event.mapNumber, setting, events: new Map<number, MapEvent>() };
    batch.events.set(event.ticket.number, event);
    this.pending.set(id, batch);
    if (this.timer === null) {
      this.timer = setTimeout(() => void this.flush().catch(() => undefined), this.deps.batchMs ?? BATCH_MS);
      this.timer.unref();
    }
  }

  private async start(batch: Pending): Promise<void> {
    if (this.closed) return;
    const events = [...batch.events.values()].sort((a, b) => a.ticket.number - b.ticket.number);
    // It may have been turned off while the tickets waited to be batched.
    const setting = this.setting(batch.repo, batch.mapNumber);
    const map = await this.deps.loadMap(batch.repo, batch.mapNumber).catch(() => null);
    if (setting.enabled && batch.setting === setting && !this.closed && this.setting(batch.repo, batch.mapNumber) === setting) {
      const tickets = await this.entriesFor(setting.tier, map, events.map((event) => event.ticket.number));
      // A change replaces the setting object even if a disable/re-enable has the same timestamp.
      if (this.closed || this.setting(batch.repo, batch.mapNumber) !== setting) return;
      const result = await this.deps
        .submit(batch.repo, { map: batch.mapNumber, cap: normalizeCap(this.settings.cap), auto: true, tickets })
        .catch((error: unknown) => ({ ok: false, error: (error as Error).message }));
      if (result.ok) return;
    }
    if (this.closed) return;
    // The ticket goes back to the ordinary "ready" notification, so a start that failed is not silent.
    for (const event of events) {
      await this.publish({
        id: `map:${event.repo.toLowerCase()}#${String(event.mapNumber)}:${String(event.id)}:${event.at}`,
        kind: 'unblocked',
        repo: event.repo,
        mapNumber: event.mapNumber,
        mapTitle: map?.title ?? `Map #${String(event.mapNumber)}`,
        ticketNumber: event.ticket.number,
        ticketTitle: event.ticket.title,
        createdAt: event.at,
      });
    }
  }

  /** What each ticket starts on: the map's tier, or for Auto the tier and model it rates the ticket to. Auto runs on Mid when it cannot rate. */
  private async entriesFor(tierSetting: AutoMapTier, map: WayfinderMap | null, numbers: readonly number[]): Promise<AutoMapStartBody['tickets']> {
    const catalog = await this.deps.catalog().catch(() => null);
    const tierModels = this.settings.tierModels ?? {};
    const tier = resolveAutoMapTier(tierSetting);
    const fixed = (ticket: number): AutoMapStartBody['tickets'][number] => ({ ticket, tier, model: catalog === null ? null : liveChoice(catalog, tierModels[tier]) });
    if (tierSetting !== 'auto' || map === null) return numbers.map(fixed);
    try {
      const wanted = map.tickets.filter((ticket) => numbers.includes(ticket.number));
      const { ratings, calibrations } = await this.rate(wanted);
      const usage = await this.deps.usage().catch(() => ({}));
      const byNumber = new Map(wanted.map((ticket) => [ticket.number, ticket]));
      const tierMapping = tierMappingOf(catalog, tierModels);
      return numbers.map((number) => {
        const ticket = byNumber.get(number);
        if (ticket === undefined) return fixed(number);
        const proposal = pickAuto({ rating: ratings.get(number) ?? rateByRules(ticket), catalog, tierModels, usage });
        const context = { selection: 'auto' as const, tierMapping, calibration: calibrations.get(number) ?? null };
        return { ticket: number, tier: proposal.tier, model: proposal.choice, auto: autoDecisionBody(proposal, { tier: proposal.tier, choice: proposal.choice }, context) };
      });
    } catch {
      return numbers.map(fixed);
    }
  }

  /**
   * Each ticket's rating: by the rules, and by the user's model when Settings says so. A model that cannot rate leaves
   * the rules' rating, and says so. In calibration mode a task or research ticket is also rated by the shadow model,
   * and both predictions are paired for the record (#186); they never change the pick.
   */
  private async rate(tickets: readonly Ticket[]): Promise<{ ratings: Map<number, Rating>; calibrations: Map<number, Calibration> }> {
    const ratings = new Map<number, Rating>(tickets.map((ticket) => [ticket.number, rateByRules(ticket)]));
    const rater = this.settings.rater ?? { kind: 'logic' as const };
    const mode = this.settings.calibration ?? { kind: 'off' as const };
    const shadowed = mode.kind === 'shadow' ? shadowTickets(tickets) : [];
    // A shadow model equal to the rating model needs no second call: its answer is both the proposal and the shadow.
    const shared = mode.kind === 'shadow' && sharesRatingModel(rater, mode.choice);
    const ask = async (choice: ModelChoice, wanted: readonly Ticket[]): Promise<RatingAnswer[]> =>
      Promise.all(
        wanted.slice(0, MAX_RATED).map(async (ticket): Promise<RatingAnswer> => {
          const answer = await this.deps.rate(ticket, choice);
          return answer.ok ? { ticket: ticket.number, ok: true, rating: answer.rating, prediction: answer.prediction } : { ticket: ticket.number, ok: false, error: answer.error, prediction: answer.prediction };
        }),
      );
    const [answers, shadowAnswers, rulesRuns] = await Promise.all([
      rater.kind === 'model' ? ask(rater.choice, tickets) : Promise.resolve(null),
      mode.kind === 'shadow' && !shared ? ask(mode.choice, shadowed) : Promise.resolve(null),
      Promise.all(shadowed.map(async (ticket) => [ticket.number, await rateByRulesTimed(ticket)] as const)),
    ]);
    for (const answer of answers ?? []) {
      const fallback = ratings.get(answer.ticket);
      if (fallback === undefined) continue;
      if (answer.ok && answer.rating !== undefined) ratings.set(answer.ticket, answer.rating);
      else ratings.set(answer.ticket, { ...fallback, reason: `${fallback.reason} (${answer.error ?? 'the model could not rate'}; logic rated it)` });
    }
    const calibrations = mode.kind === 'shadow' ? buildCalibrations({ shadow: mode.choice, rater, rules: new Map(rulesRuns), ratings, answers, shadowAnswers }) : new Map<number, Calibration>();
    return { ratings, calibrations };
  }

  /** Put a notice where the page's inbox will find it, and show it as an OS notification in the desktop app. */
  private async publish(notice: AutoMapNotice): Promise<void> {
    if (!(await this.deps.notificationOn(notice.kind).catch(() => true)) || this.notices.some((existing) => existing.id === notice.id)) return;
    this.notices = this.fresh([notice, ...this.notices]);
    await this.persist();
    this.deps.desktop?.(desktopNotificationOf(notice));
  }

  private fresh(notices: readonly AutoMapNotice[]): AutoMapNotice[] {
    const oldest = this.now().getTime() - NOTICE_MAX_AGE_MS;
    return notices.filter((notice) => Date.parse(notice.createdAt) >= oldest).slice(0, NOTICE_LIMIT);
  }

  /** A transient failed save must not leave Auto enabled on disk after a usage stop. */
  private async persistUsageStop(): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        // Capture current state on every attempt, preserving a concurrent settings change.
        await this.persist();
        return;
      } catch (error) {
        if (this.closed || attempt === 2) throw error;
      }
    }
  }

  private persist(): Promise<void> {
    const state = { maps: [...this.entries.values()], settings: this.settings, notices: this.notices };
    const save = this.persistTail.then(() => this.deps.store.save(structuredClone(state)));
    this.persistTail = save.then(() => undefined, () => undefined);
    return save;
  }
}
