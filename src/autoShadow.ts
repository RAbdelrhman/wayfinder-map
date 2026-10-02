import { isCalibrationType, RATING_RUBRIC_VERSION, RULES_COST, ratingInputId } from './autoCalibration.js';
import type { Calibration, MethodPrediction } from './autoCalibration.js';
import { MODEL_RATING_VERSION, rateByRules } from './autoPick.js';
import type { RatableTicket, Rating } from './autoPick.js';
import type { ModelChoice } from './models.js';

/**
 * The shadow side of calibration mode (#186): the rules' prediction with its measurement, the pairing of it with a
 * shadow model's, and the rule that a shadow only exists for task and research tickets. Nothing here reads back
 * into the pick: the pick is made from the active rating alone.
 */

/** The tickets calibration mode makes an extra model call for. */
export function shadowTickets<T extends { type: string | null }>(tickets: readonly T[]): T[] {
  return tickets.filter((ticket) => isCalibrationType(ticket.type));
}

/** Rate by the rules and time it, so the rules have a latency to set against the model's. */
export async function rateByRulesTimed(ticket: RatableTicket): Promise<{ rating: Rating; prediction: MethodPrediction }> {
  const inputId = await ratingInputId(ticket);
  const started = performance.now();
  const rating = rateByRules(ticket);
  const elapsedMs = Math.round((performance.now() - started) * 100) / 100;
  return {
    rating,
    prediction: { tier: rating.tier, version: rating.version, rubric: null, rater: null, inputId, elapsedMs, status: 'ok', tokens: null, cost: RULES_COST },
  };
}

/** A shadow that never got an answer, e.g. the rating request itself failed. Unmeasured, so no time or input id. */
export function missingShadow(choice: ModelChoice): MethodPrediction {
  return {
    tier: null,
    version: `${MODEL_RATING_VERSION}:${choice.model}`,
    rubric: RATING_RUBRIC_VERSION,
    rater: { provider: choice.instanceId, model: choice.model, effort: null },
    inputId: null,
    elapsedMs: null,
    status: 'failed',
    tokens: null,
    cost: { kind: 'unavailable' },
  };
}

/** One ticket of the auto-rate reply: the model's rating, or why it gave none, with what the run measured. */
export interface RatingAnswer {
  ticket: number;
  ok: boolean;
  rating?: Rating;
  error?: string;
  prediction?: MethodPrediction;
}

/** The user's rating model, or none when Auto rates by the rules alone. */
export type ActiveRater = { kind: 'logic' } | { kind: 'model'; choice: ModelChoice };

/** The shadow model is the one already rating, so its answer serves as both and needs no second call. */
export function sharesRatingModel(rater: ActiveRater, shadow: ModelChoice): boolean {
  return rater.kind === 'model' && rater.choice.instanceId === shadow.instanceId && rater.choice.model === shadow.model;
}

/**
 * Pair each ticket's timed rules prediction with the shadow model's answer. A ticket the shadow did not answer
 * for (the request failed, or the server's per-request cap left it out) gets an unmeasured failure, which is
 * not a pair. `ratings` are the ratings Auto proposed from, already settled with any fallback to the rules.
 */
export function buildCalibrations(input: {
  shadow: ModelChoice;
  rater: ActiveRater;
  rules: ReadonlyMap<number, { rating: Rating; prediction: MethodPrediction }>;
  ratings: ReadonlyMap<number, Rating>;
  /** The rating model's answers, and the shadow model's own when it is a different model. Null when asked for none. */
  answers: readonly RatingAnswer[] | null;
  shadowAnswers: readonly RatingAnswer[] | null;
}): Map<number, Calibration> {
  const predictions = new Map<number, MethodPrediction>();
  for (const answer of (sharesRatingModel(input.rater, input.shadow) ? input.answers : input.shadowAnswers) ?? []) {
    if (answer.prediction !== undefined) predictions.set(answer.ticket, answer.prediction);
  }
  const calibrations = new Map<number, Calibration>();
  for (const [number, rules] of input.rules) {
    const shadow = predictions.get(number) ?? missingShadow(input.shadow);
    calibrations.set(number, pairPredictions(rules.prediction, shadow, { requested: input.rater.kind, rating: input.ratings.get(number) ?? rules.rating }));
  }
  return calibrations;
}

/**
 * Pair the rules' prediction with the shadow's. `active` is the rating Auto proposed from: when it is a model
 * rating, `fallback` says it came from the rules because the model could not rate.
 */
export function pairPredictions(rules: MethodPrediction, shadow: MethodPrediction, active: { requested: 'logic' | 'model'; rating: Rating }): Calibration {
  return {
    rules,
    shadow,
    proposedBy: active.rating.by,
    fallback: active.requested === 'model' && active.rating.by === 'logic',
  };
}
