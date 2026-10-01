import { EFFORT_IDS, TIERS } from './models.js';
import type { Tier } from './models.js';

/**
 * What Auto proposed for a ticket, what the user finally started it with, and what happened after.
 * Saved on the local hand-off record only, for calibration (#171, #173). Fields are parsed
 * one by one, so a quota percentage, account id or token handed in alongside is never kept.
 */

export const USAGE_STATES = ['available', 'limited', 'unknown'] as const;
export type UsageState = (typeof USAGE_STATES)[number];

export type AutoOverride = 'tier' | 'model' | 'effort';
export type AutoResult = 'finished' | 'failed' | 'interrupted' | 'pull-request' | 'untracked';

const MAX_REASON_LENGTH = 300;
const MAX_VERSION_LENGTH = 40;
const MAX_EVENTS = 20;
const OVERRIDES: readonly AutoOverride[] = ['tier', 'model', 'effort'];
const RESULTS: readonly AutoResult[] = ['finished', 'failed', 'interrupted', 'pull-request', 'untracked'];
const USAGE_LIMIT_PATTERN = /usage limit|rate.?limit|quota|limit (?:reached|exceeded)|too many requests|\b429\b/i;

/** A tier with the model and effort it resolved to. Provider is the T3 provider instance, not an account. */
export interface AutoPick {
  tier: Tier;
  provider: string | null;
  model: string | null;
  effort: string | null;
}

/** The model and effort a T3 thread reports it is running. */
export interface ModelObservation {
  provider: string | null;
  model: string;
  effort: string | null;
}

export interface ModelChange {
  at: string;
  from: ModelObservation;
  to: ModelObservation;
}

export interface UsageLimitError {
  at: string;
  model: string | null;
}

export interface AutoOutcome {
  result: AutoResult;
  at: string;
}

export interface AutoDecision {
  decidedAt: string;
  scoring: { version: string; reason: string };
  proposed: AutoPick;
  final: AutoPick;
  /** Which of tier, model and effort the user changed from the proposal. Empty when they kept it. */
  overrides: AutoOverride[];
  /** Coarse provider usage when the pick was made, with when Wayfinder saw it. No quota values. */
  usage: { state: UsageState; observedAt: string | null };
  /** The model the thread was last seen running. Null until T3 reports one. */
  current: ModelObservation | null;
  /** Changes made inside the session, after the start. Not user overrides of the proposal. */
  modelChanges: ModelChange[];
  usageLimitErrors: UsageLimitError[];
  outcome: AutoOutcome | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown, max = 200): string | null {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, max) : null;
}

function isoTime(value: unknown): string | null {
  const raw = text(value, 40);
  return raw !== null && Number.isFinite(Date.parse(raw)) ? raw : null;
}

function parsePick(value: unknown): AutoPick | null {
  const item = record(value);
  const tier = TIERS.find((candidate) => candidate === item?.['tier']);
  if (item === null || tier === undefined) return null;
  return { tier, provider: text(item['provider']), model: text(item['model']), effort: text(item['effort']) };
}

function parseObservation(value: unknown): ModelObservation | null {
  const item = record(value);
  const model = text(item?.['model']);
  if (item === null || model === null) return null;
  return { provider: text(item['provider']), model, effort: text(item['effort']) };
}

/** The model a T3 thread's `modelSelection` names: `{ instanceId, model, options: [{ id, value }] }`. */
export function observeModelSelection(value: unknown): ModelObservation | null {
  const selection = record(value);
  const model = text(selection?.['model']);
  if (selection === null || model === null) return null;
  const options = Array.isArray(selection['options']) ? selection['options'] : [];
  let effort: string | null = null;
  for (const option of options) {
    const item = record(option);
    if (item !== null && EFFORT_IDS.includes(String(item['id']))) effort = text(item['value']);
  }
  return { provider: text(selection['instanceId']), model, effort };
}

function overridesOf(proposed: AutoPick, final: AutoPick): AutoOverride[] {
  const changed: Record<AutoOverride, boolean> = {
    tier: proposed.tier !== final.tier,
    model: proposed.provider !== final.provider || proposed.model !== final.model,
    effort: proposed.effort !== final.effort,
  };
  return OVERRIDES.filter((field) => changed[field]);
}

function parseUsage(value: unknown): AutoDecision['usage'] {
  const item = record(value);
  const state = USAGE_STATES.find((candidate) => candidate === item?.['state']);
  const observedAt = isoTime(item?.['observedAt']);
  // A state with no observation time can't be aged, so it is no better than unknown.
  return state === undefined || observedAt === null ? { state: 'unknown', observedAt: null } : { state, observedAt };
}

/** Validate a request's decision and stamp it. Returns null when it lacks a scored proposal or a final pick. */
export function buildAutoDecision(value: unknown, now: Date): AutoDecision | null {
  const item = record(value);
  const scoring = record(item?.['scoring']);
  const version = text(scoring?.['version'], MAX_VERSION_LENGTH);
  const reason = text(scoring?.['reason'], MAX_REASON_LENGTH);
  const proposed = parsePick(item?.['proposed']);
  const final = parsePick(item?.['final']);
  if (version === null || reason === null || proposed === null || final === null) return null;
  const usage = parseUsage(item?.['usage']);
  return {
    decidedAt: now.toISOString(),
    scoring: { version, reason },
    proposed,
    final,
    overrides: overridesOf(proposed, final),
    usage,
    current: final.model === null ? null : { provider: final.provider, model: final.model, effort: final.effort },
    modelChanges: [],
    usageLimitErrors: [],
    outcome: null,
  };
}

/** How old the usage reading was when the pick was made, or null when none was taken. */
export function usageAgeMs(decision: AutoDecision): number | null {
  if (decision.usage.observedAt === null) return null;
  return Math.max(0, Date.parse(decision.decidedAt) - Date.parse(decision.usage.observedAt));
}

export function isUsageLimitError(message: string | null): boolean {
  return message !== null && USAGE_LIMIT_PATTERN.test(message);
}

/** The result a thread's state counts as: ended, or handed on as a pull request. Null while it is still going. */
export function autoResultOf(status: string, hasPullRequest: boolean): AutoResult | null {
  if (status === 'finished' || status === 'failed' || status === 'interrupted') return status;
  return hasPullRequest ? 'pull-request' : null;
}

export interface ThreadObservation {
  at: string;
  model: ModelObservation | null;
  /** The thread's error now, and the one the store held before this read. */
  error: string | null;
  previousError: string | null;
  result: AutoResult | null;
  /** When the hand-off became terminal, kept stable across reads. */
  resultAt: string | null;
}

function sameModel(a: ModelObservation, b: ModelObservation): boolean {
  return a.model === b.model && a.provider === b.provider && (a.effort === null || b.effort === null || a.effort === b.effort);
}

/** Fold one read of the T3 thread into the decision: model changes, a new usage-limit error, the outcome. */
export function observeThread(decision: AutoDecision, observation: ThreadObservation): AutoDecision {
  const next: AutoDecision = {
    ...decision,
    modelChanges: [...decision.modelChanges],
    usageLimitErrors: [...decision.usageLimitErrors],
    outcome: observation.result === null || observation.resultAt === null ? null : { result: observation.result, at: observation.resultAt },
  };
  const seen = observation.model;
  if (seen !== null) {
    if (decision.current === null) {
      next.current = seen;
    } else if (!sameModel(decision.current, seen)) {
      next.modelChanges = [...next.modelChanges, { at: observation.at, from: decision.current, to: seen }].slice(-MAX_EVENTS);
      next.current = seen;
    } else if (decision.current.effort === null && seen.effort !== null) {
      next.current = { ...decision.current, effort: seen.effort };
    }
  }
  if (isUsageLimitError(observation.error) && observation.error !== observation.previousError) {
    next.usageLimitErrors = [...next.usageLimitErrors, { at: observation.at, model: (seen ?? decision.current)?.model ?? null }].slice(-MAX_EVENTS);
  }
  return next;
}

/** A decision read back from disk, or null when it is not one. Anything unknown in it is dropped. */
export function parseStoredAutoDecision(value: unknown): AutoDecision | null {
  const item = record(value);
  const scoring = record(item?.['scoring']);
  const version = text(scoring?.['version'], MAX_VERSION_LENGTH);
  const reason = text(scoring?.['reason'], MAX_REASON_LENGTH);
  const proposed = parsePick(item?.['proposed']);
  const final = parsePick(item?.['final']);
  const decidedAt = isoTime(item?.['decidedAt']);
  if (version === null || reason === null || proposed === null || final === null || decidedAt === null) return null;
  const outcome = record(item?.['outcome']);
  const result = RESULTS.find((candidate) => candidate === outcome?.['result']);
  const outcomeAt = isoTime(outcome?.['at']);
  return {
    decidedAt,
    scoring: { version, reason },
    proposed,
    final,
    overrides: overridesOf(proposed, final),
    usage: parseUsage(item?.['usage']),
    current: parseObservation(item?.['current']),
    modelChanges: events(item?.['modelChanges'], (entry) => {
      const at = isoTime(entry['at']);
      const from = parseObservation(entry['from']);
      const to = parseObservation(entry['to']);
      return at === null || from === null || to === null ? null : { at, from, to };
    }),
    usageLimitErrors: events(item?.['usageLimitErrors'], (entry) => {
      const at = isoTime(entry['at']);
      return at === null ? null : { at, model: text(entry['model']) };
    }),
    outcome: result === undefined || outcomeAt === null ? null : { result, at: outcomeAt },
  };
}

function events<T>(value: unknown, parse: (entry: Record<string, unknown>) => T | null): T[] {
  const parsed: T[] = [];
  for (const entry of Array.isArray(value) ? value : []) {
    const item = record(entry);
    const event = item === null ? null : parse(item);
    if (event !== null) parsed.push(event);
  }
  return parsed.slice(-MAX_EVENTS);
}
