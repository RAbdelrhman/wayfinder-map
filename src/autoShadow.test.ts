import { describe, expect, it } from 'vitest';

import { ratingInputId } from './autoCalibration.js';
import type { MethodPrediction } from './autoCalibration.js';
import { buildCalibrations, missingShadow, pairPredictions, rateByRulesTimed, shadowTickets, sharesRatingModel } from './autoShadow.js';
import type { Rating } from './autoPick.js';

const ticket = { number: 7, title: 'Fix a typo in the settings hint', type: 'task' as const, body: 'Fix a typo in `src/ui/settings.ts`.', blockedBy: [] };

const shadow = (patch: Partial<MethodPrediction> = {}): MethodPrediction => ({
  tier: 'hard',
  version: 'model-1:gpt-5.6-luna',
  rubric: 'rubric-1',
  rater: { provider: 'codex', model: 'gpt-5.6-luna', effort: 'low' },
  inputId: 'x',
  elapsedMs: 7_000,
  status: 'ok',
  tokens: null,
  cost: { kind: 'unavailable' },
  ...patch,
});

describe('shadowTickets', () => {
  it('keeps task and research tickets, so prototype, grilling and untyped tickets get no extra model call', () => {
    const tickets = ['task', 'research', 'prototype', 'grilling', null].map((type) => ({ type }));
    expect(shadowTickets(tickets).map((item) => item.type)).toEqual(['task', 'research']);
  });
});

describe('rateByRulesTimed', () => {
  it('returns the rules rating with a measured prediction for the same input a model would read', async () => {
    const { rating, prediction } = await rateByRulesTimed(ticket);
    expect(rating).toMatchObject({ by: 'logic', version: 'rules-1' });
    expect(prediction).toMatchObject({ tier: rating.tier, version: 'rules-1', rubric: null, rater: null, status: 'ok', tokens: null, cost: { kind: 'actual', usd: 0 } });
    expect(prediction.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(prediction.inputId).toBe(await ratingInputId(ticket));
  });
});

describe('missingShadow', () => {
  it('is an unmeasured failure with no input id, so it can never count as a pair', () => {
    expect(missingShadow({ instanceId: 'codex', model: 'gpt-5.6-luna' })).toMatchObject({ tier: null, status: 'failed', inputId: null, elapsedMs: null, rater: { provider: 'codex', model: 'gpt-5.6-luna' } });
  });
});

describe('buildCalibrations', () => {
  const luna = { instanceId: 'codex', model: 'gpt-5.6-luna' };
  const logicRater = { kind: 'logic' } as const;
  const answer = (number: number, patch: Partial<MethodPrediction> = {}) => ({ ticket: number, ok: true, prediction: shadow(patch) });

  async function rulesFor(...numbers: number[]) {
    const runs = await Promise.all(numbers.map(async (number) => [number, await rateByRulesTimed({ ...ticket, number })] as const));
    return { rules: new Map(runs), ratings: new Map(runs.map(([number, run]) => [number, run.rating])) };
  }

  it('pairs the rules with the separate shadow call and never changes the rating Auto proposed from', async () => {
    const { rules, ratings } = await rulesFor(7);
    const calibrations = buildCalibrations({ shadow: luna, rater: logicRater, rules, ratings, answers: null, shadowAnswers: [answer(7, { tier: 'hard' })] });
    expect(calibrations.get(7)).toMatchObject({ rules: { version: 'rules-1' }, shadow: { tier: 'hard', status: 'ok' }, proposedBy: 'logic', fallback: false });
    expect(ratings.get(7)?.by).toBe('logic');
  });

  it('reuses the rating model as the shadow when they are the same model, with no second call', async () => {
    const { rules, ratings } = await rulesFor(7);
    expect(sharesRatingModel({ kind: 'model', choice: luna }, luna)).toBe(true);
    expect(sharesRatingModel({ kind: 'model', choice: { ...luna, model: 'other' } }, luna)).toBe(false);
    expect(sharesRatingModel(logicRater, luna)).toBe(false);
    const calibrations = buildCalibrations({ shadow: luna, rater: { kind: 'model', choice: luna }, rules, ratings, answers: [answer(7, { tier: 'mid' })], shadowAnswers: [answer(7, { tier: 'hard' })] });
    expect(calibrations.get(7)?.shadow.tier).toBe('mid');
  });

  it('marks a fallback when the rating model was asked and the rules rated', async () => {
    const { rules, ratings } = await rulesFor(7);
    const calibrations = buildCalibrations({ shadow: luna, rater: { kind: 'model', choice: { instanceId: 'codex', model: 'gpt-5.6-sol' } }, rules, ratings, answers: [], shadowAnswers: [answer(7)] });
    expect(calibrations.get(7)).toMatchObject({ proposedBy: 'logic', fallback: true });
  });

  it('gives a ticket the shadow did not answer for an unmeasured failure that is not a pair', async () => {
    const { rules, ratings } = await rulesFor(7, 8);
    const calibrations = buildCalibrations({ shadow: luna, rater: logicRater, rules, ratings, answers: null, shadowAnswers: [answer(7)] });
    expect(calibrations.get(8)?.shadow).toMatchObject({ tier: null, status: 'failed', inputId: null });
    const none = buildCalibrations({ shadow: luna, rater: logicRater, rules, ratings, answers: null, shadowAnswers: null });
    expect([...none.values()].map((pair) => pair.shadow.status)).toEqual(['failed', 'failed']);
  });

  it('builds nothing without a rules run, so a ticket outside calibration gets no pair', () => {
    expect(buildCalibrations({ shadow: luna, rater: logicRater, rules: new Map(), ratings: new Map(), answers: null, shadowAnswers: [answer(7)] }).size).toBe(0);
  });
});

describe('pairPredictions', () => {
  const rules = async () => (await rateByRulesTimed(ticket)).prediction;
  const logic: Rating = { tier: 'mid', reason: 'x', by: 'logic', version: 'rules-1' };
  const model: Rating = { tier: 'hard', reason: 'x', by: 'model', version: 'model-1:gpt-5.6-sol' };

  it('records that the rules proposed when the rater is logic only', async () => {
    expect(pairPredictions(await rules(), shadow(), { requested: 'logic', rating: logic })).toMatchObject({ proposedBy: 'logic', fallback: false });
  });

  it("records a model proposal, and a fallback when the model was asked and the rules rated", async () => {
    expect(pairPredictions(await rules(), shadow(), { requested: 'model', rating: model })).toMatchObject({ proposedBy: 'model', fallback: false });
    expect(pairPredictions(await rules(), shadow(), { requested: 'model', rating: logic })).toMatchObject({ proposedBy: 'logic', fallback: true });
  });

  it('keeps a shadow that disagrees with the proposal out of it: the proposal is the active rating', async () => {
    const pair = pairPredictions(await rules(), shadow({ tier: 'hard' }), { requested: 'logic', rating: logic });
    expect(pair.shadow.tier).toBe('hard');
    expect(pair.proposedBy).toBe('logic');
  });
});
