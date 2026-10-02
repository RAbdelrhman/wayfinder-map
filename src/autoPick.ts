import type { Calibration, ModelRef, Substitution, SubstitutionReason, TierMapping } from './autoCalibration.js';
import type { UsageState } from './autoDecision.js';
import { findModel, liveChoice, TIERS } from './models.js';
import type { ModelCatalog, ModelChoice, Tier } from './models.js';
import type { Ticket } from './types.js';

/**
 * Auto's two steps for a map-level start (#166), following #165's policy: rate how hard a ticket is,
 * then resolve that tier to a model through the user's Settings mapping, skipping a provider that is
 * not ready or has just hit its usage limit. Pure: the page and the tests feed it everything it reads.
 */

export const RULES_VERSION = 'rules-1';
export const MODEL_RATING_VERSION = 'model-1';
/** Wayfinder only learns a provider is limited from an error, and the error does not say for how long. */
export const LIMITED_FOR_MS = 30 * 60 * 1000;

/** Provider instances whose models Wayfinder can ask to rate a ticket: it runs their CLI headless. */
export function supportsModelRating(instanceId: string): boolean {
  const id = instanceId.toLowerCase();
  return id.startsWith('codex') || id.startsWith('claude');
}

export type RatableTicket = Pick<Ticket, 'number' | 'title' | 'type' | 'body' | 'blockedBy'>;

export interface Rating {
  tier: Tier;
  /** One short clause, e.g. "touches 6 files, concurrency". */
  reason: string;
  by: 'logic' | 'model';
  /** `rules-1`, or `model-1:<slug>` for a model's rating. Saved with the decision. */
  version: string;
}

const FILE_PATTERN = /[\w.-]+(?:\/[\w.-]+)*\.(?:tsx?|jsx?|mjs|cjs|css|html|json|md|ya?ml|sql)\b/g;
const INLINE_PATTERN = /`([^`\s]+)`/g;
const CODE_NAME = /^[A-Za-z_$][\w$]*(?:[./][\w$.-]+)*$/;
const CAMEL = /[a-z][A-Z]/;

const RISKS: ReadonlyArray<readonly [string, RegExp]> = [
  ['concurrency', /concurren|race condition|in parallel|parallel (?:start|run|hand-?off)|\block(?:s|ing)?\b|\bqueue/i],
  ['data migration', /migrat|schema change|backfill/i],
  ['external integration', /webhook|oauth|websocket|third-party|\bsdk\b|external (?:api|service)/i],
  ['failure handling', /rollback|retry|retries|clean-?up|recover|idempotent|failure/i],
  ['security', /\bsecurity|credential|\bauth(?:entication|orization)?\b|privacy|permission/i],
];
const LOCALIZED = /\b(?:typo|rename|copy change|wording|docs? only|tweak|padding|tooltip)\b/i;

const TYPE_POINTS: Record<string, number> = { research: 2, prototype: 2, grilling: 1 };

function codeReferences(body: string): Set<string> {
  const found = new Set<string>(body.match(FILE_PATTERN) ?? []);
  for (const match of body.matchAll(INLINE_PATTERN)) {
    const name = match[1] ?? '';
    // An inline name is a module when it looks like code: a path, a file, or camelCase.
    if (CODE_NAME.test(name) && (name.includes('/') || name.includes('.') || CAMEL.test(name))) found.add(name);
  }
  return found;
}

/** Rate a ticket from its type, named code, risk words and blockers. Starts at Mid when the ticket says little. */
export function rateByRules(ticket: RatableTicket): Rating {
  const words = ticket.body.split(/\s+/).filter(Boolean).length;
  const references = codeReferences(ticket.body).size;
  const risks = RISKS.filter(([, pattern]) => pattern.test(ticket.body)).map(([label]) => label);
  const blockers = ticket.blockedBy.length;
  const openEnded = ticket.type === 'research' || ticket.type === 'prototype' || ticket.type === 'grilling';

  let score = TYPE_POINTS[ticket.type ?? ''] ?? 0;
  score += references >= 5 ? 2 : references >= 2 ? 1 : 0;
  score += Math.min(risks.length, 2);
  score += blockers >= 2 ? 1 : 0;
  // Length only breaks a tie at the edge of Hard.
  if (score === 3 && words > 300) score += 1;

  const why = [
    openEnded ? `${ticket.type ?? ''} ticket` : null,
    references >= 2 ? `touches ${String(references)} files` : null,
    ...risks.slice(0, 2),
    blockers >= 2 ? `waits on ${String(blockers)} tickets` : null,
  ].filter((part): part is string => part !== null);

  const localized = !openEnded && risks.length === 0 && blockers < 2 && words <= 200 && (references === 1 || LOCALIZED.test(`${ticket.title} ${ticket.body}`));
  if (score >= 4) return { tier: 'hard', reason: why.slice(0, 3).join(', '), by: 'logic', version: RULES_VERSION };
  if (localized) return { tier: 'simple', reason: references === 1 ? 'touches 1 file' : 'a small, local change', by: 'logic', version: RULES_VERSION };
  const reason = why.length === 0 ? 'the ticket names little scope, so Auto starts at Mid' : why.slice(0, 3).join(', ');
  return { tier: 'mid', reason, by: 'logic', version: RULES_VERSION };
}

/* ---------- provider usage ---------- */

export interface ProviderUsage {
  state: UsageState;
  observedAt: string | null;
}

const UNKNOWN: ProviderUsage = { state: 'unknown', observedAt: null };

/** A usage-limit error Wayfinder saw on a provider instance. */
export interface UsageLimitEvent {
  instanceId: string;
  at: string;
}

/** Each provider's usage from the limit errors seen so far: limited for a while after the latest one, otherwise unknown. */
export function usageFromLimitEvents(events: readonly UsageLimitEvent[], now: Date): Record<string, ProviderUsage> {
  const latest = new Map<string, number>();
  for (const event of events) {
    const at = Date.parse(event.at);
    if (Number.isFinite(at) && at > (latest.get(event.instanceId) ?? 0)) latest.set(event.instanceId, at);
  }
  const usage: Record<string, ProviderUsage> = {};
  for (const [instanceId, at] of latest) {
    if (now.getTime() - at <= LIMITED_FOR_MS) usage[instanceId] = { state: 'limited', observedAt: new Date(at).toISOString() };
  }
  return usage;
}

/* ---------- pick ---------- */

const BLOCKED_WORDS: Record<SubstitutionReason, string> = { 'provider-not-ready': 'is not ready', 'usage-limit': 'is at its usage limit' };

function refOf(choice: ModelChoice | null): ModelRef {
  return { provider: choice?.instanceId ?? null, model: choice?.model ?? null, effort: choice?.effort?.value ?? null };
}

/** The model Settings maps to each tier that T3 Code still offers, as the record keeps it. */
export function tierMappingOf(catalog: ModelCatalog | null, tierModels: Partial<Record<Tier, ModelChoice>>): TierMapping {
  const mapping: TierMapping = {};
  if (catalog === null) return mapping;
  for (const tier of TIERS) {
    const choice = liveChoice(catalog, tierModels[tier]);
    if (choice !== null) mapping[tier] = refOf(choice);
  }
  return mapping;
}

export interface AutoPickInput {
  rating: Rating;
  /** Null while T3 Code's models are not loaded: T3 Code then picks the model. */
  catalog: ModelCatalog | null;
  /** The model Settings maps to each tier. */
  tierModels: Partial<Record<Tier, ModelChoice>>;
  usage: Readonly<Record<string, ProviderUsage>>;
}

export interface AutoProposal {
  tier: Tier;
  /** Null when no model is mapped or T3 Code's models are unavailable. */
  choice: ModelChoice | null;
  modelName: string | null;
  /** The rating's reason, plus why a model other than the tier's own was used. One line. */
  reason: string;
  rating: Rating;
  /** The usage reading of the provider picked, or unknown. */
  usage: ProviderUsage;
  /** Set when the tier's own provider was skipped for being not ready or at its limit. */
  substitution: Substitution | null;
}

/**
 * The model for a rated ticket: the tier's own, or when its provider is not ready or is limited, a model
 * Settings maps to a harder tier on another provider. Never an easier one, so a quota is not stretched
 * by under-powering a ticket. When nothing else is usable the tier's own model stays, with the reason saying so.
 */
export function pickAuto(input: AutoPickInput): AutoProposal {
  const { rating, catalog, tierModels, usage } = input;
  const base = { tier: rating.tier, rating, reason: rating.reason, substitution: null };
  if (catalog === null) return { ...base, choice: null, modelName: null, usage: UNKNOWN };

  const candidates = TIERS.slice(TIERS.indexOf(rating.tier)).flatMap((tier) => {
    const choice = liveChoice(catalog, tierModels[tier]);
    const provider = choice === null ? undefined : catalog.providers.find((candidate) => candidate.instanceId === choice.instanceId);
    return choice === null || provider === undefined ? [] : [{ tier, choice, provider, reading: usage[choice.instanceId] ?? UNKNOWN }];
  });
  const named = (choice: ModelChoice): string => findModel(catalog, choice)?.name ?? choice.model;
  const first = candidates[0];
  if (first === undefined) return { ...base, choice: null, modelName: null, usage: UNKNOWN };

  const blocked = (candidate: (typeof candidates)[number]): SubstitutionReason | null =>
    !candidate.provider.ready ? 'provider-not-ready' : candidate.reading.state === 'limited' ? 'usage-limit' : null;
  const usable = candidates.find((candidate) => blocked(candidate) === null);
  const firstReason = blocked(first);
  const firstWhy = firstReason === null ? '' : BLOCKED_WORDS[firstReason];
  if (usable === undefined) {
    return {
      ...base,
      choice: first.choice,
      modelName: named(first.choice),
      reason: `${rating.reason}; ${first.provider.name} ${firstWhy} and no other provider is set for this tier, so pick one`,
      usage: first.reading,
    };
  }
  const substitution: Substitution | null =
    usable === first || firstReason === null ? null : { reason: firstReason, from: refOf(first.choice), to: refOf(usable.choice), toTier: usable.tier };
  return {
    ...base,
    choice: usable.choice,
    modelName: named(usable.choice),
    reason: substitution === null ? rating.reason : `${rating.reason}; ${first.provider.name} ${firstWhy}`,
    usage: usable.reading,
    substitution,
  };
}

/** The "Hard → gpt-5.6-sol: touches 6 files" line a confirm-list row shows under Auto. */
export function proposalLine(proposal: AutoProposal, tierLabel: string): string {
  return `${tierLabel} → ${proposal.modelName ?? 'T3 Code default'}: ${proposal.reason}`;
}

function pickOf(tier: Tier, choice: ModelChoice | null): { tier: Tier; provider: string | null; model: string | null; effort: string | null } {
  return { tier, provider: choice?.instanceId ?? null, model: choice?.model ?? null, effort: choice?.effort?.value ?? null };
}

/** What a start request adds to the `auto` block beyond the proposal and the final choice (#186). */
export interface DecisionContext {
  /** `user` when the row was set to a tier by hand, even one equal to the proposal. */
  selection?: 'auto' | 'user';
  tierMapping?: TierMapping;
  /** The paired predictions. Recorded, never read back into the pick. */
  calibration?: Calibration | null;
}

/** The `auto` block a start request carries: what Auto proposed and what the user finally chose, for #172's record. */
export function autoDecisionBody(proposal: AutoProposal, final: { tier: Tier; choice: ModelChoice | null }, context: DecisionContext = {}): Record<string, unknown> {
  return {
    scoring: { version: proposal.rating.version, reason: proposal.rating.reason },
    proposed: pickOf(proposal.tier, proposal.choice),
    final: pickOf(final.tier, final.choice),
    usage: proposal.usage,
    selection: context.selection ?? 'auto',
    tierMapping: context.tierMapping ?? {},
    substitution: proposal.substitution,
    ...(context.calibration === undefined || context.calibration === null ? {} : { calibration: context.calibration }),
  };
}
