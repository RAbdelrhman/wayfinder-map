import { isCalibrationType, parseCalibration, parseSubstitution, parseTierMapping } from './autoCalibration.js';
import type { Calibration, Substitution, TierMapping } from './autoCalibration.js';
import { EFFORT_IDS, TIERS } from './models.js';
import type { Tier } from './models.js';
import { isoTime, oneOf, record, text } from './parseValue.js';

/**
 * What Auto proposed for a ticket, what the user finally started it with, and what happened after.
 * Saved on the local hand-off record only, for calibration (#171, #173, #186). Fields are parsed
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

/** Why a model changed in the session. Only the user can say; `unknown` stays unknown, and a model name never implies `harder-ticket`. */
export const MODEL_CHANGE_REASONS = ['unknown', 'harder-ticket', 'provider-limit', 'provider-problem', 'preference'] as const;
export type ModelChangeReason = (typeof MODEL_CHANGE_REASONS)[number];

export interface ModelChange {
  at: string;
  from: ModelObservation;
  to: ModelObservation;
  reason: ModelChangeReason;
  /** When the user confirmed the reason. Null while it is unknown. */
  confirmedAt: string | null;
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
  /** The ticket's type when Auto decided. The type can be relabelled later. */
  ticketType: string | null;
  /** Whether the user left the row on Auto or chose a tier themselves, even one equal to the proposal. */
  selection: 'auto' | 'user';
  /** Which of tier, model and effort the user changed from the proposal. Empty when they kept it. A provider substitution is not one: it is in `proposed`. */
  overrides: AutoOverride[];
  /** The model Settings mapped to each tier when Auto decided. */
  tierMapping: TierMapping;
  /** Set when readiness or a usage limit moved the proposal off the tier's own model. */
  substitution: Substitution | null;
  /** The paired rules and shadow predictions. Null unless the user opted in and the ticket is a task or research. */
  calibration: Calibration | null;
  /** Coarse provider usage when the pick was made, with when Wayfinder saw it. No quota values. */
  usage: { state: UsageState; observedAt: string | null };
  /** The model the thread was last seen running. Null until T3 reports one. */
  current: ModelObservation | null;
  /** Changes made inside the session, after the start. Not user overrides of the proposal. */
  modelChanges: ModelChange[];
  usageLimitErrors: UsageLimitError[];
  outcome: AutoOutcome | null;
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

/**
 * Validate a request's decision and stamp it. Returns null when it lacks a scored proposal or a final pick.
 * `ticketType` is the type the server read for the ticket when it dispatched, not one the request claims.
 */
export function buildAutoDecision(value: unknown, now: Date, ticketType: string | null = null): AutoDecision | null {
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
    ticketType: text(ticketType, MAX_VERSION_LENGTH),
    selection: item?.['selection'] === 'user' ? 'user' : 'auto',
    overrides: overridesOf(proposed, final),
    tierMapping: parseTierMapping(item?.['tierMapping']),
    substitution: parseSubstitution(item?.['substitution']),
    // The shadow call only runs for task and research tickets, so a record for another type is not kept.
    calibration: isCalibrationType(ticketType) ? parseCalibration(item?.['calibration']) : null,
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
      next.modelChanges = [...next.modelChanges, { at: observation.at, from: decision.current, to: seen, reason: 'unknown' as const, confirmedAt: null }].slice(-MAX_EVENTS);
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

/** Record the reason a user confirmed for the model change made at `at`. Null when the decision has no such change. */
export function confirmModelChange(decision: AutoDecision, at: string, reason: ModelChangeReason, now: Date): AutoDecision | null {
  if (!decision.modelChanges.some((change) => change.at === at)) return null;
  const confirmedAt = reason === 'unknown' ? null : now.toISOString();
  return { ...decision, modelChanges: decision.modelChanges.map((change) => (change.at === at ? { ...change, reason, confirmedAt } : change)) };
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
    ticketType: text(item?.['ticketType'], MAX_VERSION_LENGTH),
    selection: item?.['selection'] === 'user' ? 'user' : 'auto',
    overrides: overridesOf(proposed, final),
    tierMapping: parseTierMapping(item?.['tierMapping']),
    substitution: parseSubstitution(item?.['substitution']),
    calibration: parseCalibration(item?.['calibration']),
    usage: parseUsage(item?.['usage']),
    current: parseObservation(item?.['current']),
    modelChanges: events(item?.['modelChanges'], (entry) => {
      const at = isoTime(entry['at']);
      const from = parseObservation(entry['from']);
      const to = parseObservation(entry['to']);
      if (at === null || from === null || to === null) return null;
      // A change saved before reasons existed, or with a reason that is not one, stays unknown.
      const reason = oneOf(MODEL_CHANGE_REASONS, entry['reason']) ?? 'unknown';
      return { at, from, to, reason, confirmedAt: reason === 'unknown' ? null : isoTime(entry['confirmedAt']) };
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
