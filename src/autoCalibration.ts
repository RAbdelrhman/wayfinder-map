import { TIERS } from './models.js';
import type { Tier } from './models.js';
import { amount, isoTime, oneOf, record, text } from './parseValue.js';

/**
 * What #173 needs to compare the rules with a shadow model (#186): both predictions for the same ticket input,
 * what each rating cost and how long it took, and how Auto's dispatch differed from the tier mapping.
 * Saved on the local hand-off record only, under its 30-day retention. Everything here is parsed field by
 * field, so an account id, a credential, a quota value or a raw provider error is never kept.
 */

/** The rubric the rating prompt states. Change it whenever `ratingPrompt`'s criteria change. */
export const RATING_RUBRIC_VERSION = 'rubric-1';

/** Ticket types the shadow calibration runs for. Prototype and grilling tickets get no extra model call. */
export const CALIBRATION_TYPES = ['task', 'research'] as const;

export function isCalibrationType(type: string | null): boolean {
  return (CALIBRATION_TYPES as readonly (string | null)[]).includes(type);
}

/** A provider instance, model and effort. The provider is the T3 provider instance, never an account. */
export interface ModelRef {
  provider: string | null;
  model: string | null;
  effort: string | null;
}

/** Tokens one rating used, when the CLI reported them. Null where it did not say. */
export interface TokenUsage {
  input: number | null;
  cachedInput: number | null;
  output: number | null;
  total: number | null;
}

/** A charge, a price estimate with the date its rate was read, or no figure. A subscription run has no per-call charge. */
export type RatingCost = { kind: 'actual'; usd: number } | { kind: 'estimate'; usd: number; pricedOn: string } | { kind: 'unavailable' };

export const RATING_STATUSES = ['ok', 'failed', 'timeout', 'unparseable', 'unsupported'] as const;
export type RatingStatus = (typeof RATING_STATUSES)[number];

/** What one rating run measured. Never the CLI's output or error text. */
export interface RatingMeasurement {
  /** Wall-clock time of the rating, in milliseconds. Null when it was not measured. */
  elapsedMs: number | null;
  status: RatingStatus;
  tokens: TokenUsage | null;
  cost: RatingCost;
}

export interface MethodPrediction extends RatingMeasurement {
  /** Null when the method failed to rate. */
  tier: Tier | null;
  /** `rules-1`, or `model-1:<slug>`. */
  version: string;
  /** The rating prompt's rubric version. Null for the rules, which have no prompt. */
  rubric: string | null;
  /** The model and effort that rated. Null for the rules. */
  rater: ModelRef | null;
  /** Hash of the ticket fields this method read (`ratingInputId`). Equal ids mean the same input. */
  inputId: string | null;
}

export interface Calibration {
  rules: MethodPrediction;
  shadow: MethodPrediction;
  /** Which method's tier Auto proposed: the rules by default. The shadow never decides dispatch. */
  proposedBy: 'logic' | 'model';
  /** True when the user's rating model could not rate and the rules did instead. */
  fallback: boolean;
}

export type SubstitutionReason = 'provider-not-ready' | 'usage-limit';
export const SUBSTITUTION_REASONS: readonly SubstitutionReason[] = ['provider-not-ready', 'usage-limit'];

/** Auto used another provider's model than the rated tier maps to. Provider state caused it; the user did not. */
export interface Substitution {
  reason: SubstitutionReason;
  from: ModelRef;
  to: ModelRef;
  /** The harder tier whose mapped model was used. */
  toTier: Tier;
}

/** The model Settings mapped to each tier when Auto decided. */
export type TierMapping = Partial<Record<Tier, ModelRef>>;

/* ---------- input identity ---------- */

/**
 * A hash of the ticket fields a rating reads: type, blocker count, title and body. It stands in for the ticket
 * text, so two predictions can be shown to have read the same input without keeping the text.
 */
export async function ratingInputId(ticket: { type: string | null; title: string; body: string; blockedBy: readonly unknown[] }): Promise<string> {
  const canonical = JSON.stringify([ticket.type, ticket.blockedBy.length, ticket.title, ticket.body]);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

/** Both methods read the same input: each has an id, and the ids match. */
export function isPaired(calibration: Calibration): boolean {
  const { rules, shadow } = calibration;
  return rules.inputId !== null && rules.inputId === shadow.inputId;
}

/* ---------- cost ---------- */

interface Rate {
  /** US dollars per million tokens. */
  input: number;
  cachedInput: number;
  output: number;
  /** The date the rate was read, kept so an estimate can be told from today's price. */
  pricedOn: string;
  source: string;
}

/** Published API list prices. Wayfinder estimates only for a model listed here and only when the CLI split input from output. */
export const RATE_CARD: Readonly<Record<string, Rate>> = {
  'gpt-6-luna': { input: 0.1, cachedInput: 0.01, output: 0.5, pricedOn: '2026-09-29', source: 'https://developers.openai.com/api/docs/pricing' },
};

export const RULES_COST: RatingCost = { kind: 'actual', usd: 0 };

/**
 * The cost of one rating. An actual charge when the CLI reported one; otherwise a dated estimate when the
 * model's rate is known and its input and output tokens were split; otherwise unavailable. A subscription
 * run reports no charge, so it stays unavailable rather than becoming zero.
 */
export function ratingCost(run: { model: string | null; tokens: TokenUsage | null; chargedUsd?: number | null }): RatingCost {
  if (run.chargedUsd !== undefined && run.chargedUsd !== null && Number.isFinite(run.chargedUsd) && run.chargedUsd >= 0) return { kind: 'actual', usd: run.chargedUsd };
  const rate = run.model === null ? undefined : RATE_CARD[run.model];
  const { tokens } = run;
  if (rate === undefined || tokens === null || tokens.input === null || tokens.output === null) return { kind: 'unavailable' };
  const cached = Math.min(tokens.cachedInput ?? 0, tokens.input);
  const usd = ((tokens.input - cached) * rate.input + cached * rate.cachedInput + tokens.output * rate.output) / 1_000_000;
  return { kind: 'estimate', usd, pricedOn: rate.pricedOn };
}

/* ---------- parsing ---------- */

export function parseModelRef(value: unknown): ModelRef | null {
  const item = record(value);
  if (item === null) return null;
  return { provider: text(item['provider']), model: text(item['model']), effort: text(item['effort']) };
}

function parseTokens(value: unknown): TokenUsage | null {
  const item = record(value);
  if (item === null) return null;
  const tokens = { input: amount(item['input']), cachedInput: amount(item['cachedInput']), output: amount(item['output']), total: amount(item['total']) };
  return Object.values(tokens).every((count) => count === null) ? null : tokens;
}

function parseCost(value: unknown): RatingCost {
  const item = record(value);
  const usd = amount(item?.['usd']);
  if (item?.['kind'] === 'actual' && usd !== null) return { kind: 'actual', usd };
  const pricedOn = isoTime(item?.['pricedOn']);
  if (item?.['kind'] === 'estimate' && usd !== null && pricedOn !== null) return { kind: 'estimate', usd, pricedOn };
  return { kind: 'unavailable' };
}

function parsePrediction(value: unknown): MethodPrediction | null {
  const item = record(value);
  const status = oneOf(RATING_STATUSES, item?.['status']);
  const version = text(item?.['version'], 80);
  if (item === null || status === undefined || version === null) return null;
  return {
    tier: oneOf(TIERS, item['tier']) ?? null,
    version,
    rubric: text(item['rubric'], 40),
    rater: parseModelRef(item['rater']),
    inputId: text(item['inputId'], 64),
    elapsedMs: amount(item['elapsedMs']),
    status,
    tokens: parseTokens(item['tokens']),
    cost: parseCost(item['cost']),
  };
}

export function parseCalibration(value: unknown): Calibration | null {
  const item = record(value);
  const rules = parsePrediction(item?.['rules']);
  const shadow = parsePrediction(item?.['shadow']);
  if (item === null || rules === null || shadow === null) return null;
  return { rules, shadow, proposedBy: item['proposedBy'] === 'model' ? 'model' : 'logic', fallback: item['fallback'] === true };
}

export function parseSubstitution(value: unknown): Substitution | null {
  const item = record(value);
  const reason = oneOf(SUBSTITUTION_REASONS, item?.['reason']);
  const from = parseModelRef(item?.['from']);
  const to = parseModelRef(item?.['to']);
  const toTier = oneOf(TIERS, item?.['toTier']);
  return reason === undefined || from === null || to === null || toTier === undefined ? null : { reason, from, to, toTier };
}

export function parseTierMapping(value: unknown): TierMapping {
  const item = record(value);
  const mapping: TierMapping = {};
  for (const tier of TIERS) {
    const ref = parseModelRef(item?.[tier]);
    if (ref !== null && ref.model !== null) mapping[tier] = ref;
  }
  return mapping;
}
