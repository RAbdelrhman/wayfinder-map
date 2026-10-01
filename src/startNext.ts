import type { TicketState, TicketType } from './types.js';

/** Running hand-offs per machine before Start next queues the rest (#123). Settings can change it. */
export const DEFAULT_HAND_OFF_CAP = 4;
export const MAX_HAND_OFF_CAP = 16;

/** Ticket types that wait on a person in the thread, so Start next leaves them unticked (#124). */
const NEEDS_YOU_TYPES: ReadonlySet<TicketType> = new Set(['grilling', 'prototype']);

export interface StartNextTicket {
  number: number;
  title: string;
  type: TicketType | null;
  state: TicketState;
}

export interface StartNextInput {
  tickets: readonly StartNextTicket[];
  /** Tickets with a live hand-off (#98), by number, with what it is doing, e.g. "working". */
  live: ReadonlyMap<number, string>;
  /** Tickets an earlier batch has queued or is starting, which have no hand-off record yet. */
  inBatch: ReadonlySet<number>;
  /** Live hand-offs on this machine across every repository and map. */
  running: number;
  cap: number;
  /** The user's ticks and unticks. A ticket not listed keeps its default: ticked unless it needs you. */
  ticked?: ReadonlyMap<number, boolean>;
}

export type StartNextGroup = 'ready' | 'needs-you' | 'skipped';
/** `unticked` is a row the user (or the default) left out. */
export type StartNextKind = 'start' | 'queue' | 'unticked' | 'skipped';

export interface StartNextRow {
  ticket: StartNextTicket;
  group: StartNextGroup;
  ticked: boolean;
  kind: StartNextKind;
  /** 1 for the first ticket to start when a slot frees. Null unless `kind` is `queue`. */
  queuePosition: number | null;
  /** Why it is skipped, left out or queued. Null for a plain start. */
  reason: string | null;
}

export interface StartNextPlan {
  rows: StartNextRow[];
  /** Hand-offs that start right away. */
  start: number;
  /** Hand-offs that wait for a slot. */
  queued: number;
  /** `start` plus `queued`: what the Start button will hand off. */
  picked: number;
  /** Rows a plain Start next would hand off: ready and not skipped. */
  ready: number;
  needsYou: number;
  skipped: number;
  running: number;
  cap: number;
}

/** A usable cap from a saved or requested value, or the default. */
export function normalizeCap(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_HAND_OFF_CAP ? value : DEFAULT_HAND_OFF_CAP;
}

function needsYouReason(type: TicketType): string {
  return `${type === 'grilling' ? 'Grilling' : 'Prototype'} tickets wait for you in the thread`;
}

/**
 * What "Start next" would do on a map: every `next` ticket, grouped as ready, needs you
 * or skipped, with the first tickets starting and the rest queued once the cap is reached.
 */
export function planStartNext(input: StartNextInput): StartNextPlan {
  const next = input.tickets.filter((ticket) => ticket.state === 'frontier').sort((a, b) => a.number - b.number);
  const skipReason = (ticket: StartNextTicket): string | null => {
    const live = input.live.get(ticket.number);
    if (live !== undefined) return `Already in T3 Code · ${live}`;
    return input.inBatch.has(ticket.number) ? 'Already in a running batch' : null;
  };
  const isNeedsYou = (ticket: StartNextTicket): boolean => ticket.type !== null && NEEDS_YOU_TYPES.has(ticket.type);

  const ready = next.filter((ticket) => skipReason(ticket) === null && !isNeedsYou(ticket));
  const needsYou = next.filter((ticket) => skipReason(ticket) === null && isNeedsYou(ticket));
  const skipped = next.filter((ticket) => skipReason(ticket) !== null);

  const cap = normalizeCap(input.cap);
  let free = Math.max(0, cap - input.running);
  let queued = 0;
  const row = (ticket: StartNextTicket, group: StartNextGroup): StartNextRow => {
    if (group === 'skipped') return { ticket, group, ticked: false, kind: 'skipped', queuePosition: null, reason: skipReason(ticket) };
    const ticked = input.ticked?.get(ticket.number) ?? group === 'ready';
    const reason = ticket.type !== null && group === 'needs-you' ? needsYouReason(ticket.type) : null;
    if (!ticked) return { ticket, group, ticked, kind: 'unticked', queuePosition: null, reason };
    if (free > 0) {
      free -= 1;
      return { ticket, group, ticked, kind: 'start', queuePosition: null, reason };
    }
    queued += 1;
    return { ticket, group, ticked, kind: 'queue', queuePosition: queued, reason: 'Starts when a slot frees' };
  };

  const rows = [...ready.map((ticket) => row(ticket, 'ready')), ...needsYou.map((ticket) => row(ticket, 'needs-you')), ...skipped.map((ticket) => row(ticket, 'skipped'))];
  const start = rows.filter((candidate) => candidate.kind === 'start').length;
  return {
    rows,
    start,
    queued,
    picked: start + queued,
    ready: ready.length,
    needsYou: needsYou.length,
    skipped: skipped.length,
    running: input.running,
    cap,
  };
}

/** The menu item's label, "Start next · 3 ready", or null when no ticket is next. */
export function startNextLabel(plan: StartNextPlan): string | null {
  if (plan.ready + plan.needsYou + plan.skipped === 0) return null;
  return `Start next · ${String(plan.ready)} ready`;
}

/** The confirm list's footer: "2 start now · 3 queued · 2 of 4 running on this machine". */
export function startNextFooter(plan: StartNextPlan): { counts: string; machine: string } {
  return {
    counts: `${String(plan.start)} start now${plan.queued > 0 ? ` · ${String(plan.queued)} queued` : ''}`,
    machine: `${String(plan.running)} of ${String(plan.cap)} running on this machine`,
  };
}
