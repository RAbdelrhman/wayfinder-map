import { autoDecisionBody, pickAuto, proposalLine, rateByRules } from '../autoPick.js';
import type { AutoProposal, ProviderUsage, Rating } from '../autoPick.js';
import type { HandOffStatusDto } from '../handOffTracking.js';
import { isLiveHandOff } from '../handOffLiveness.js';
import { scopedApiPath } from '../repoRoutes.js';
import { DEFAULT_HAND_OFF_CAP, normalizeCap, planStartNext, startNextFooter, startNextLabel } from '../startNext.js';
import type { StartNextPlan, StartNextRow } from '../startNext.js';
import type { Batch, BatchItem } from '../startNextRunner.js';
import type { Ticket, TicketType, WayfinderMap } from '../types.js';
import { handOffPresentation, handOffTime } from './handOffs.js';
import type { HandOffUiState } from './handOffs.js';
import * as icons from './icons.js';
import { icon } from './icons.js';
import { escapeHtml } from './markdown.js';
import { autoRater, currentCatalog, findModel, liveChoice, loadCatalog, TIER_LABEL, TIERS, tierDefaults } from './models.js';
import type { ModelChoice, Tier } from './models.js';
import type { ModelCatalog } from '../models.js';

/* Start next (#129): hand off every ticket that is next, up to the machine's cap, from one confirm list. */

const CAP_KEY = 'wayfinder-map:hand-off-cap:v1';
export const HAND_OFF_CAPS = [2, 4, 6, 8] as const;
const POLL_MS = 3_000;

/** How many hand-offs may run at once on this machine. Set in Settings. */
export function handOffCap(storage: Pick<Storage, 'getItem'> = localStorage): number {
  try {
    const saved = storage.getItem(CAP_KEY);
    return saved === null ? DEFAULT_HAND_OFF_CAP : normalizeCap(Number(saved));
  } catch {
    return DEFAULT_HAND_OFF_CAP;
  }
}

export function saveHandOffCap(cap: number, storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(CAP_KEY, String(normalizeCap(cap)));
}

/* ---------- plan ---------- */

/** The plan for a map: its next tickets, what is live in T3 Code, and how full the machine is. */
export function mapStartPlan(input: {
  repo: string;
  map: WayfinderMap;
  handOffs: readonly HandOffStatusDto[];
  batches: readonly Batch[];
  cap: number;
  ticked?: ReadonlyMap<number, boolean>;
  now?: number;
}): StartNextPlan {
  const live = new Map<number, string>();
  for (const handOff of input.handOffs) {
    if (handOff.ticketNumber === null || handOff.repo.toLowerCase() !== input.repo.toLowerCase() || !isLiveHandOff(handOff)) continue;
    live.set(handOff.ticketNumber, `${handOffPresentation(handOff).label.toLowerCase()} ${handOffTime(handOff, input.now)}`);
  }
  const inBatch = new Set<number>();
  for (const batch of input.batches) {
    if (batch.status !== 'running' || batch.repo.toLowerCase() !== input.repo.toLowerCase()) continue;
    for (const item of batch.items) if (item.status === 'queued' || item.status === 'starting') inBatch.add(item.ticketNumber);
  }
  return planStartNext({
    tickets: input.map.tickets,
    live,
    inBatch,
    running: input.handOffs.filter((handOff) => isLiveHandOff(handOff)).length,
    cap: input.cap,
    ...(input.ticked === undefined ? {} : { ticked: input.ticked }),
  });
}

/* ---------- batch progress ---------- */

export type BatchTone = 'starting' | 'working' | 'queued' | 'needs-you' | 'done' | 'failed' | 'skipped' | 'back';

export interface BatchItemView {
  item: BatchItem;
  word: string;
  tone: BatchTone;
}

export interface BatchView {
  batch: Batch;
  items: BatchItemView[];
  /** Starting or working: using a slot. */
  running: number;
  queued: number;
  failed: number;
  /** Queued tickets a stop sent back to next. */
  back: number;
  /** Tickets the batch actually tried: everything but the skipped. */
  total: number;
  usageLimit: boolean;
}

const TONE_OF: Record<HandOffUiState, BatchTone> = {
  starting: 'starting',
  working: 'working',
  'needs-you': 'needs-you',
  'pr-ready': 'done',
  merged: 'done',
  failed: 'failed',
};

/** What each ticket of a batch is doing now: its own hand-off's state once it has one. */
export function batchView(batch: Batch, handOffs: readonly HandOffStatusDto[]): BatchView {
  const queue = batch.items.filter((item) => item.status === 'queued');
  const items = batch.items.map((item): BatchItemView => {
    if (batch.stop?.kind === 'usage-limit' && batch.stop.ticketNumber === item.ticketNumber) return { item, word: 'Usage limit', tone: 'failed' };
    switch (item.status) {
      case 'queued':
        return { item, word: `Queued ${String(queue.indexOf(item) + 1)}`, tone: 'queued' };
      case 'starting':
        return { item, word: 'Starting', tone: 'starting' };
      case 'started': {
        const record = handOffs.find((handOff) => handOff.id === item.handOffId);
        if (record === undefined) return { item, word: 'Starting', tone: 'starting' };
        const presentation = handOffPresentation(record);
        return { item, word: presentation.label, tone: TONE_OF[presentation.state] };
      }
      case 'failed':
        return { item, word: 'Could not start', tone: 'failed' };
      case 'skipped':
        return { item, word: 'Skipped', tone: 'skipped' };
      case 'back-to-next':
        return { item, word: 'Back to next', tone: 'back' };
    }
  });
  const count = (...tones: BatchTone[]): number => items.filter((view) => tones.includes(view.tone)).length;
  return {
    batch,
    items,
    running: count('starting', 'working', 'needs-you'),
    queued: count('queued'),
    failed: count('failed'),
    back: count('back'),
    total: items.filter((view) => view.tone !== 'skipped').length,
    usageLimit: batch.stop?.kind === 'usage-limit',
  };
}

/** The batch the topbar shows for a map: one still running, or one a usage limit stopped until it is dismissed. */
export function visibleBatch(batches: readonly Batch[], repo: string, mapNumber: number): Batch | undefined {
  return batches.find(
    (batch) =>
      batch.repo.toLowerCase() === repo.toLowerCase() &&
      batch.mapNumber === mapNumber &&
      (batch.status === 'running' || (batch.status === 'stopped' && batch.stop?.kind === 'usage-limit')),
  );
}

/** A card's chip while its ticket waits in a batch or is being handed off, or null once a hand-off pill takes over. */
export function batchCardChip(batches: readonly Batch[], repo: string, mapNumber: number, ticketNumber: number): string | null {
  const batch = batches.find((candidate) => candidate.repo.toLowerCase() === repo.toLowerCase() && candidate.mapNumber === mapNumber && candidate.status === 'running');
  if (batch === undefined) return null;
  const queue = batch.items.filter((item) => item.status === 'queued');
  const item = batch.items.find((candidate) => candidate.ticketNumber === ticketNumber);
  if (item?.status === 'queued') {
    const word = `Queued ${String(queue.indexOf(item) + 1)}`;
    return `<span class="chip node-handoff-pill is-queued" title="${escapeHtml(`${word}: starts when a slot frees`)}" aria-label="${escapeHtml(word)}">${icon(icons.QUEUE)}<span>${escapeHtml(word)}</span></span>`;
  }
  if (item?.status === 'starting') {
    return '<span class="chip node-handoff-pill is-starting" title="Starting" aria-label="Starting"><span class="handoff-spinner" aria-hidden="true"></span><span>Starting</span></span>';
  }
  return null;
}

const TONE_ICON: Record<BatchTone, string> = {
  starting: '<span class="handoff-spinner" aria-hidden="true"></span>',
  working: icon(icons.PLAY),
  queued: icon(icons.QUEUE),
  'needs-you': icon(icons.PERSON),
  done: icon(icons.CHECK),
  failed: icon(icons.ALERT),
  skipped: icon(icons.CLOSE),
  back: icon(icons.ARROW),
};

function ticketLabel(item: BatchItem): string {
  return `#${String(item.ticketNumber)} ${item.title}`;
}

/** The topbar control's label: "2 running · 3 queued", or the stop. */
export function batchTriggerLabel(view: BatchView): string {
  return view.usageLimit ? 'Stopped: usage limit' : `${String(view.running)} running · ${String(view.queued)} queued`;
}

function bar(view: BatchView): string {
  const width = (count: number): string => String(view.total === 0 ? 0 : Math.round((count / view.total) * 100));
  const done = Math.max(0, view.total - view.running - view.queued - view.failed - view.back);
  return `<span class="batch-bar" aria-hidden="true"><i class="is-done" style="width:${width(done)}%"></i><i class="is-run" style="width:${width(view.running)}%"></i><i class="is-failed" style="width:${width(view.failed)}%"></i><i class="is-queue" style="width:${width(view.queued)}%"></i></span>`;
}

export function batchTriggerHtml(view: BatchView): string {
  return `${view.usageLimit ? icon(icons.ALERT) : bar(view)}<span>${escapeHtml(batchTriggerLabel(view))}</span>`;
}

/** The list the topbar control opens: one row per ticket, then Stop the queue, or what a usage limit did. */
export function batchPanelHtml(view: BatchView): string {
  const rows = view.items
    .map(
      ({ item, word, tone }) =>
        `<li class="batch-row is-${tone}"><span class="batch-status">${TONE_ICON[tone]}${escapeHtml(word)}</span><span class="batch-title" title="${escapeHtml(ticketLabel(item))}">${escapeHtml(ticketLabel(item))}</span>${item.reason === null ? '' : `<span class="batch-reason">${escapeHtml(item.reason)}</span>`}</li>`,
    )
    .join('');
  const { stop } = view.batch;
  let notice = '';
  let actions = `<button type="button" class="ghost" data-batch-action="stop">Stop the queue</button>`;
  if (stop?.kind === 'usage-limit') {
    const still = view.items.filter(({ tone }) => tone === 'working' || tone === 'starting' || tone === 'needs-you').map(({ item }) => `#${String(item.ticketNumber)}`);
    const back = view.items.filter(({ tone }) => tone === 'back').map(({ item }) => `#${String(item.ticketNumber)}`);
    const parts = [
      `<b>${escapeHtml(stop.message)}</b> The batch stopped at #${String(stop.ticketNumber)}.`,
      still.length === 0 ? '' : ` ${escapeHtml(list(still))} ${still.length === 1 ? 'is' : 'are'} still running.`,
      back.length === 0 ? '' : ` ${escapeHtml(list(back))} went back to next.`,
    ].join('');
    notice = `<div class="batch-stop" role="status">${icon(icons.ALERT)}<p>${parts}${stop.resetsAt === null ? '' : `<span>Resets ${escapeHtml(stop.resetsAt)}.</span>`}</p></div>`;
    actions = `<button type="button" class="ghost" data-batch-action="dismiss">Dismiss</button><button type="button" class="primary" data-batch-action="again">${icon(icons.REFRESH)}Start again…</button>`;
  }
  return `${notice}<ol class="batch-list">${rows}</ol><div class="batch-actions">${actions}</div>`;
}

function list(numbers: readonly string[]): string {
  return numbers.length < 2 ? numbers.join('') : `${numbers.slice(0, -1).join(', ')} and ${numbers.at(-1) ?? ''}`;
}

/* ---------- confirm list ---------- */

const TYPE_ICON: Record<TicketType, string> = { research: icons.LENS, prototype: icons.BEAKER, grilling: icons.GRILL, task: icons.LIST };

function typeGlyph(ticket: Pick<Ticket, 'type'>): string {
  const label = ticket.type ?? 'untyped';
  return `<span class="glyph" title="${label}">${icon(ticket.type === null ? icons.BLANK : TYPE_ICON[ticket.type])}</span>`;
}

/** The status word beside a row: Starts now, Queued 2, Needs you, Not starting or Skipped. */
export function startRowWord(row: StartNextRow): string {
  switch (row.kind) {
    case 'start':
      return 'Starts now';
    case 'queue':
      return `Queued ${String(row.queuePosition)}`;
    case 'skipped':
      return 'Skipped';
    case 'unticked':
      return row.group === 'needs-you' ? 'Needs you' : 'Not starting';
  }
}

/* ---------- auto (#166) ---------- */

/** A row's choice: Auto, the default, or a tier the user picked over it. */
export type RowChoice = Tier | 'auto';
const ROW_CHOICES: readonly RowChoice[] = ['auto', ...TIERS];

const CHOICE_LABEL: Record<RowChoice, string> = { auto: 'Auto', ...TIER_LABEL };

/** What Auto reads beyond the tickets: each ticket's rating, provider usage, and whether a model is still rating. */
export interface AutoState {
  ratings: ReadonlyMap<number, Rating>;
  usage: Readonly<Record<string, ProviderUsage>>;
  pending: boolean;
}

export const NO_AUTO: AutoState = { ratings: new Map(), usage: {}, pending: false };

/** The tier and model Auto proposes for a ticket. A ticket the rater has not answered for yet is rated by the rules. */
export function proposalFor(ticket: Ticket, auto: AutoState, catalog: ModelCatalog | null, tierModels: Partial<Record<Tier, ModelChoice>>): AutoProposal {
  return pickAuto({ rating: auto.ratings.get(ticket.number) ?? rateByRules(ticket), catalog, tierModels, usage: auto.usage });
}

/** One ticket of the start request: what it starts with, and Auto's record of its proposal and the final choice. */
export function startRequestEntry(
  ticket: Ticket,
  choice: RowChoice,
  proposal: AutoProposal,
  catalog: ModelCatalog | null,
  tierModels: Partial<Record<Tier, ModelChoice>>,
): { ticket: number; tier: Tier; model: ModelChoice | null; auto: Record<string, unknown> } {
  const final = choice === 'auto' ? { tier: proposal.tier, choice: proposal.choice } : { tier: choice, choice: catalog === null ? null : liveChoice(catalog, tierModels[choice]) };
  return { ticket: ticket.number, tier: final.tier, model: final.choice, auto: autoDecisionBody(proposal, final) };
}

function ratedBy(rating: Rating): string {
  return rating.by === 'logic' ? 'logic' : rating.version.split(':').slice(1).join(':') || 'a model';
}

function modelLine(tier: Tier): string {
  const state = currentCatalog();
  const name = state.status === 'ready' ? (findModel(state.catalog, liveChoice(state.catalog, tierDefaults()[tier]))?.name ?? 'T3 Code default') : 'T3 Code default';
  return `<span class="start-model"><b>${TIER_LABEL[tier]}</b> · ${escapeHtml(name)}<i>your pick</i></span>`;
}

function autoLine(proposal: AutoProposal | null, pending: boolean): string {
  if (proposal === null || pending) return '<span class="start-model is-auto"><b>Auto</b> · rating…</span>';
  return `<span class="start-model is-auto"><b>${escapeHtml(proposalLine(proposal, TIER_LABEL[proposal.tier]))}</b><i>Rated by ${escapeHtml(ratedBy(proposal.rating))}</i></span>`;
}

function rowHtml(row: StartNextRow, choice: RowChoice, proposal: AutoProposal | null, pending: boolean): string {
  const { ticket } = row;
  const id = `start-cb-${String(ticket.number)}`;
  const box =
    row.kind === 'skipped'
      ? '<span class="start-box is-none" aria-hidden="true"></span>'
      : `<input type="checkbox" class="start-cb" id="${id}" data-start-toggle="${String(ticket.number)}"${row.ticked ? ' checked' : ''} aria-describedby="${id}-status">`;
  const tiers =
    row.kind === 'skipped'
      ? ''
      : `<div class="start-tiers"><div class="segmented" role="group" aria-label="Tier for #${String(ticket.number)}">${ROW_CHOICES.map(
          (candidate) =>
            `<button type="button" class="seg${candidate === choice ? ' is-on' : ''}" data-start-tier="${candidate}" data-start-ticket="${String(ticket.number)}" aria-pressed="${String(candidate === choice)}">${CHOICE_LABEL[candidate]}</button>`,
        ).join('')}</div>${choice === 'auto' ? autoLine(proposal, pending) : modelLine(choice)}</div>`;
  return `<li class="start-row is-${row.kind}">${box}<label class="start-main" for="${id}"><span class="start-head">${typeGlyph(ticket)}<span class="num">#${String(ticket.number)}</span><span class="start-title">${escapeHtml(ticket.title)}</span></span><span class="start-sub" id="${id}-status"><span class="start-status is-${row.kind}">${escapeHtml(startRowWord(row))}</span>${row.reason === null ? '' : `<span class="start-reason">${escapeHtml(row.reason)}</span>`}</span></label>${tiers}</li>`;
}

const GROUPS: ReadonlyArray<readonly [StartNextRow['group'], string]> = [
  ['ready', 'Ready'],
  ['needs-you', 'Needs you'],
  ['skipped', 'Skipped'],
];

/** The dialog's body: the Ready, Needs you and Skipped groups, then the footer with the Start button. */
export function startDialogHtml(plan: StartNextPlan, view: { choices: ReadonlyMap<number, RowChoice>; proposals: ReadonlyMap<number, AutoProposal>; pending: boolean }): string {
  const groups = GROUPS.flatMap(([group, label]) => {
    const rows = plan.rows.filter((row) => row.group === group);
    if (rows.length === 0) return [];
    return [`<section class="start-group"><h3>${label} <span>${String(rows.length)}</span></h3><ul>${rows.map((row) => rowHtml(row, view.choices.get(row.ticket.number) ?? 'auto', view.proposals.get(row.ticket.number) ?? null, view.pending)).join('')}</ul></section>`];
  });
  const footer = startNextFooter(plan);
  return `<div class="dialog-head"><h2 id="start-title">Start next</h2><button type="button" class="detail-close" data-start-cancel aria-label="Close">×</button></div>
    <p class="hint">Each ticket gets its own thread and worktree in T3 Code. Over ${String(plan.cap)} running on this machine, the rest queue.</p>
    <div class="start-groups">${groups.join('') || '<p class="hint">No ticket is next on this map.</p>'}</div>
    <div class="start-foot"><span class="start-count">${escapeHtml(footer.counts)} <span class="muted">· ${escapeHtml(footer.machine)}</span></span><button type="button" class="ghost" data-start-cancel>Cancel</button><button type="button" class="primary" data-start-go${plan.picked === 0 || view.pending ? ' disabled' : ''}>${icon(icons.PLAY)}Start ${String(plan.picked)}</button></div>`;
}

/* ---------- mount ---------- */

export interface StartNextOptions {
  /** The repository and map on screen, or null while the page loads. */
  context: () => { repo: string; map: WayfinderMap } | null;
  handOffs: () => readonly HandOffStatusDto[];
  /** Called when the batches changed, so cards and the topbar can repaint. */
  onChange: () => void;
  refreshHandOffs: () => Promise<void>;
  toast: (message: string, ms?: number) => void;
}

export interface StartNextSurface {
  /** The map-name menu's item label, or null when no ticket is next. */
  menuLabel(): string | null;
  open(): void;
  /** Hand off or queue these tickets without the confirm list. Resolves to the ones the batch took. */
  startTickets(ticketNumbers: readonly number[]): Promise<number[]>;
  batches(): readonly Batch[];
  /** Auto's tier, model and record for each of these tickets of a map, without the confirm list (the auto map, #166). */
  autoEntries(context: { repo: string; map: WayfinderMap }, ticketNumbers: readonly number[]): Promise<Map<number, ReturnType<typeof startRequestEntry>>>;
  /** Read the server's batches now, e.g. after the auto map submitted one. */
  refresh(): Promise<void>;
  /** Repaint the topbar control after hand-off records changed. */
  render(): void;
}

export function mountStartNext(options: StartNextOptions): StartNextSurface {
  let batches: Batch[] = [];
  let ticked = new Map<number, boolean>();
  let choices = new Map<number, RowChoice>();
  let auto: AutoState = NO_AUTO;
  let timer: number | undefined;
  let signature = '';

  const anchor = document.getElementById('batch-anchor');
  const trigger = document.getElementById('batch-trigger');
  const panel = document.getElementById('batch-list');
  const body = document.getElementById('batch-list-body');
  const dialog = document.createElement('dialog');
  dialog.className = 'dialog start-dialog';
  dialog.setAttribute('aria-labelledby', 'start-title');
  document.body.append(dialog);
  let panelOpen = false;

  const plan = (): StartNextPlan | null => {
    const context = options.context();
    return context === null ? null : mapStartPlan({ repo: context.repo, map: context.map, handOffs: options.handOffs(), batches, cap: handOffCap(), ticked });
  };

  const drawDialog = (): void => {
    const context = options.context();
    const current = plan();
    if (context === null || current === null) return;
    const active = document.activeElement instanceof HTMLElement && dialog.contains(document.activeElement) ? document.activeElement.id || null : null;
    const state = currentCatalog();
    const byNumber = new Map(context.map.tickets.map((ticket) => [ticket.number, ticket]));
    const proposals = new Map<number, AutoProposal>();
    for (const row of current.rows) {
      const ticket = byNumber.get(row.ticket.number);
      if (ticket !== undefined && row.kind !== 'skipped') proposals.set(ticket.number, proposalFor(ticket, auto, state.status === 'ready' ? state.catalog : null, tierDefaults()));
    }
    dialog.innerHTML = startDialogHtml(current, { choices, proposals, pending: auto.pending });
    if (active !== null) dialog.querySelector<HTMLElement>(`#${CSS.escape(active)}`)?.focus();
  };

  const render = (): void => {
    if (!(anchor instanceof HTMLElement) || !(trigger instanceof HTMLButtonElement) || !(panel instanceof HTMLElement) || !(body instanceof HTMLElement)) return;
    const context = options.context();
    const batch = context === null ? undefined : visibleBatch(batches, context.repo, context.map.number);
    anchor.hidden = batch === undefined;
    if (batch === undefined) {
      panelOpen = false;
      panel.hidden = true;
      return;
    }
    const view = batchView(batch, options.handOffs());
    trigger.classList.toggle('is-stopped', view.usageLimit);
    trigger.setAttribute('aria-expanded', String(panelOpen));
    trigger.setAttribute('aria-label', `Start next batch: ${batchTriggerLabel(view)}`);
    trigger.innerHTML = batchTriggerHtml(view);
    panel.hidden = !panelOpen;
    body.innerHTML = batchPanelHtml(view);
  };

  const apply = (next: Batch[]): void => {
    batches = next;
    const key = JSON.stringify(next.map((batch) => [batch.id, batch.status, batch.items.map((item) => [item.status, item.handOffId])]));
    const changed = key !== signature;
    signature = key;
    if (changed) options.onChange();
    render();
    schedule();
  };

  const refresh = async (): Promise<void> => {
    try {
      const response = await fetch('/api/start-next');
      if (!response.ok) return;
      apply(((await response.json()) as { batches: Batch[] }).batches);
      if (batches.some((batch) => batch.status === 'running')) void options.refreshHandOffs();
    } catch {
      // The next poll tries again.
    }
  };

  function schedule(): void {
    window.clearTimeout(timer);
    if (batches.some((batch) => batch.status === 'running')) timer = window.setTimeout(() => void refresh(), POLL_MS);
  }

  const post = async (path: string, payload: unknown): Promise<{ ok: boolean; body: Record<string, unknown> }> => {
    const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    return { ok: response.ok, body: (await response.json()) as Record<string, unknown> };
  };

  /** Rate the tickets and read provider usage: by the rules at once, and by the user's model when Settings says so. */
  const loadAuto = async (context: { repo: string; map: WayfinderMap }, numbers: readonly number[]): Promise<AutoState> => {
    const tickets = context.map.tickets.filter((ticket) => numbers.includes(ticket.number));
    const ratings = new Map<number, Rating>(tickets.map((ticket) => [ticket.number, rateByRules(ticket)]));
    const rater = autoRater();
    const usage = fetch('/api/provider-usage')
      .then(async (response) => (response.ok ? ((await response.json()) as { providers: Record<string, ProviderUsage> }).providers : {}))
      .catch(() => ({}));
    const rated =
      rater.kind === 'model' && tickets.length > 0
        ? post(scopedApiPath(context.repo, 'auto-rate'), { map: context.map.number, tickets: numbers, model: rater.choice }).catch(() => null)
        : Promise.resolve(null);
    const [providers, reply] = await Promise.all([usage, rated]);
    if (rater.kind === 'model') {
      const answers = (reply?.ok === true ? (reply.body['ratings'] as Array<{ ticket: number; ok: boolean; rating?: Rating; error?: string }>) : []) ?? [];
      for (const answer of answers) {
        const fallback = ratings.get(answer.ticket);
        if (fallback === undefined) continue;
        if (answer.ok && answer.rating !== undefined) ratings.set(answer.ticket, answer.rating);
        else ratings.set(answer.ticket, { ...fallback, reason: `${fallback.reason} (${answer.error ?? 'the model could not rate'}; logic rated it)` });
      }
    }
    return { ratings, usage: providers, pending: false };
  };

  /** The tickets a plan starts or queues. */
  const startable = (current: StartNextPlan): number[] => current.rows.filter((row) => row.kind === 'start' || row.kind === 'queue').map((row) => row.ticket.number);

  /** Post the rows a plan starts or queues as one batch. Returns whether the server accepted it. */
  const submit = async (context: { repo: string; map: WayfinderMap }, current: StartNextPlan): Promise<boolean> => {
    const state = currentCatalog();
    const catalog = state.status === 'ready' ? state.catalog : null;
    const models = tierDefaults();
    const byNumber = new Map(context.map.tickets.map((ticket) => [ticket.number, ticket]));
    const tickets = startable(current).flatMap((number) => {
      const ticket = byNumber.get(number);
      return ticket === undefined ? [] : [startRequestEntry(ticket, choices.get(number) ?? 'auto', proposalFor(ticket, auto, catalog, models), catalog, models)];
    });
    try {
      const result = await post(scopedApiPath(context.repo, 'start-next'), { map: context.map.number, cap: handOffCap(), tickets });
      if (!result.ok) {
        options.toast(typeof result.body['error'] === 'string' ? result.body['error'] : 'Start next failed.', 9000);
        return false;
      }
      options.toast(`Starting ${String(tickets.length)} ticket${tickets.length === 1 ? '' : 's'} in T3 Code.`, 4000);
      await refresh();
      return true;
    } catch (error) {
      options.toast((error as Error).message, 9000);
      return false;
    }
  };

  const go = async (): Promise<void> => {
    const context = options.context();
    const current = plan();
    if (context === null || current === null || current.picked === 0) return;
    const button = dialog.querySelector<HTMLButtonElement>('[data-start-go]');
    if (button !== null) button.disabled = true;
    if (await submit(context, current)) {
      dialog.close();
      ticked = new Map();
      choices = new Map();
    } else if (button !== null) {
      button.disabled = false;
    }
  };

  /** Start just these tickets, as the "ready" notice's Start does. Returns the ones handed off or queued. */
  const startTickets = async (ticketNumbers: readonly number[]): Promise<number[]> => {
    const context = options.context();
    if (context === null) return [];
    await loadCatalog();
    const wanted = new Set(ticketNumbers);
    const all = mapStartPlan({ repo: context.repo, map: context.map, handOffs: options.handOffs(), batches, cap: handOffCap() });
    const only = mapStartPlan({ repo: context.repo, map: context.map, handOffs: options.handOffs(), batches, cap: handOffCap(), ticked: new Map(all.rows.map((row) => [row.ticket.number, wanted.has(row.ticket.number)])) });
    const picked = only.rows.filter((row) => row.kind === 'start' || row.kind === 'queue').map((row) => row.ticket.number);
    if (picked.length === 0) return [];
    const previous = auto;
    auto = await loadAuto(context, picked);
    const started = await submit(context, only);
    auto = previous;
    return started ? picked : [];
  };

  const open = (): void => {
    if (options.context() === null) return;
    const context = options.context();
    ticked = new Map();
    choices = new Map();
    auto = { ...NO_AUTO, pending: autoRater().kind === 'model' };
    drawDialog();
    if (!dialog.open) dialog.showModal();
    void loadCatalog().then(() => {
      if (dialog.open) drawDialog();
    });
    const numbers = (plan()?.rows ?? []).filter((row) => row.kind !== 'skipped').map((row) => row.ticket.number);
    if (context !== null) {
      void loadAuto(context, numbers).then((loaded) => {
        auto = loaded;
        if (dialog.open) drawDialog();
      });
    }
  };

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      dialog.close();
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (target === null) return;
    if (target.closest('[data-start-cancel]') !== null) dialog.close();
    else if (target.closest('[data-start-go]') !== null) void go();
    else {
      const tierButton = target.closest<HTMLElement>('[data-start-tier]');
      const tier = tierButton?.dataset['startTier'];
      const ticket = Number(tierButton?.dataset['startTicket']);
      if (tier !== undefined && (ROW_CHOICES as readonly string[]).includes(tier) && Number.isSafeInteger(ticket)) {
        choices.set(ticket, tier as RowChoice);
        drawDialog();
      }
    }
  });
  dialog.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const ticket = Number(target.dataset['startToggle']);
    if (!Number.isSafeInteger(ticket)) return;
    ticked.set(ticket, target.checked);
    drawDialog();
  });

  if (trigger instanceof HTMLButtonElement && panel instanceof HTMLElement && anchor instanceof HTMLElement) {
    trigger.addEventListener('click', () => {
      panelOpen = !panelOpen;
      render();
    });
    panel.querySelector('.handoff-close')?.addEventListener('click', () => {
      panelOpen = false;
      render();
      trigger.focus();
    });
    document.addEventListener('click', (event) => {
      if (panelOpen && event.target instanceof Node && !anchor.contains(event.target)) {
        panelOpen = false;
        render();
      }
    });
    panel.addEventListener('click', (event) => {
      const action = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-batch-action]')?.dataset['batchAction'] : undefined;
      const context = options.context();
      const batch = context === null ? undefined : visibleBatch(batches, context.repo, context.map.number);
      if (action === undefined || batch === undefined) return;
      if (action === 'again') {
        panelOpen = false;
        render();
        open();
        return;
      }
      void post('/api/start-next/stop', { id: batch.id }).then((result) => {
        if (action === 'stop') options.toast('Stopped the queue. Queued tickets went back to next.', 5000);
        if (result.ok) apply((result.body['batches'] as Batch[] | undefined) ?? []);
        void options.refreshHandOffs();
      });
    });
  }

  void refresh();

  return {
    menuLabel: () => {
      const current = plan();
      return current === null ? null : startNextLabel(current);
    },
    open,
    startTickets,
    autoEntries: async (context, ticketNumbers) => {
      await loadCatalog();
      const state = currentCatalog();
      const catalog = state.status === 'ready' ? state.catalog : null;
      const models = tierDefaults();
      const loaded = await loadAuto(context, ticketNumbers);
      const entries = new Map<number, ReturnType<typeof startRequestEntry>>();
      for (const ticket of context.map.tickets) {
        if (ticketNumbers.includes(ticket.number)) entries.set(ticket.number, startRequestEntry(ticket, 'auto', proposalFor(ticket, loaded, catalog, models), catalog, models));
      }
      return entries;
    },
    batches: () => batches,
    refresh,
    render,
  };
}
