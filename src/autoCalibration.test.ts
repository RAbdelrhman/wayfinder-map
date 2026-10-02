import { describe, expect, it } from 'vitest';

import { isPaired, parseCalibration, parseSubstitution, parseTierMapping, ratingCost, ratingInputId, RATE_CARD } from './autoCalibration.js';
import type { Calibration, MethodPrediction } from './autoCalibration.js';

const ticket = { type: 'task', title: 'Queue hand-offs', body: 'Touches `src/a.ts`.', blockedBy: [1, 2] };

const prediction =(patch: Partial<MethodPrediction> = {}): MethodPrediction => ({
  tier: 'mid',
  version: 'rules-1',
  rubric: null,
  rater: null,
  inputId: 'same-input',
  elapsedMs: 0.4,
  status: 'ok',
  tokens: null,
  cost: { kind: 'actual', usd: 0 },
  ...patch,
});

describe('ratingInputId', () => {
  it('is stable for the same input and differs when any field a rating reads changes', async () => {
    const id = await ratingInputId(ticket);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(await ratingInputId({ ...ticket })).toBe(id);
    for (const edit of [{ type: 'research' }, { title: 'Queue more' }, { body: 'Touches `src/b.ts`.' }, { blockedBy: [1] }]) {
      expect(await ratingInputId({ ...ticket, ...edit })).not.toBe(id);
    }
  });

  it('stands in for the ticket text without containing it', async () => {
    expect(await ratingInputId(ticket)).not.toContain('Queue');
  });
});

describe('ratingCost', () => {
  const tokens = { input: 1_000_000, cachedInput: 400_000, output: 100_000, total: 1_100_000 };

  it('is an actual charge when the CLI reported one', () => {
    expect(ratingCost({ model: 'gpt-5.6-luna', tokens: null, chargedUsd: 0.0123 })).toEqual({ kind: 'actual', usd: 0.0123 });
  });

  it('is a dated estimate only for a model with a known rate and split tokens', () => {
    const rate = RATE_CARD['gpt-6-luna'];
    expect(rate?.pricedOn).toBe('2026-09-29');
    expect(ratingCost({ model: 'gpt-6-luna', tokens })).toEqual({ kind: 'estimate', usd: expect.closeTo(0.06 + 0.004 + 0.05, 6) as number, pricedOn: '2026-09-29' });
  });

  it('stays unavailable for a subscription run: no tokens, a total only, or an unpriced model', () => {
    expect(ratingCost({ model: 'gpt-6-luna', tokens: null })).toEqual({ kind: 'unavailable' });
    expect(ratingCost({ model: 'gpt-6-luna', tokens: { input: null, cachedInput: null, output: null, total: 18_660 } })).toEqual({ kind: 'unavailable' });
    expect(ratingCost({ model: 'sonnet-5', tokens })).toEqual({ kind: 'unavailable' });
    expect(ratingCost({ model: 'gpt-6-luna', tokens: null, chargedUsd: -1 })).toEqual({ kind: 'unavailable' });
  });
});

describe('parseCalibration', () => {
  const calibration: Calibration = {
    rules: prediction(),
    shadow: prediction({
      tier: 'hard',
      version: 'model-1:gpt-5.6-luna',
      rubric: 'rubric-1',
      rater: { provider: 'codex', model: 'gpt-5.6-luna', effort: 'low' },
      elapsedMs: 7_030,
      tokens: { input: null, cachedInput: null, output: null, total: 18_660 },
      cost: { kind: 'unavailable' },
    }),
    proposedBy: 'logic',
    fallback: false,
  };

  it('reads a valid record back unchanged', () => {
    expect(parseCalibration(JSON.parse(JSON.stringify(calibration)))).toEqual(calibration);
  });

  it('keeps only known fields, so a credential, account id, quota or raw error never survives', () => {
    const dirty = JSON.parse(JSON.stringify(calibration)) as Record<string, Record<string, unknown>>;
    Object.assign(dirty['shadow'] ?? {}, { apiKey: 'sk-live-secret', accountId: 'acct-9f3a', usedPercent: 91.5, error: 'You hit your usage limit, resets 5pm', output: 'raw reply' });
    Object.assign((dirty['shadow']?.['rater'] ?? {}) as Record<string, unknown>, { accountId: 'acct-9f3a' });
    const kept = JSON.stringify(parseCalibration(dirty));
    for (const leaked of ['sk-live-secret', 'acct-9f3a', '91.5', 'usage limit', 'raw reply']) expect(kept).not.toContain(leaked);
  });

  it('drops a record missing a prediction or with a status it does not know', () => {
    expect(parseCalibration({ ...calibration, shadow: undefined })).toBeNull();
    expect(parseCalibration({ ...calibration, shadow: { ...calibration.shadow, status: 'exploded' } })).toBeNull();
    expect(parseCalibration('shadow')).toBeNull();
  });

  it('treats a bad cost or token count as missing, never as zero', () => {
    const parsed = parseCalibration({ ...calibration, shadow: { ...calibration.shadow, cost: { kind: 'estimate', usd: 1 }, tokens: { total: -4, input: 'many' }, elapsedMs: -1 } });
    expect(parsed?.shadow).toMatchObject({ cost: { kind: 'unavailable' }, tokens: null, elapsedMs: null });
  });
});

describe('isPaired', () => {
  it('needs both methods to carry the same input id', () => {
    const pair = (rules: string | null, shadow: string | null) => ({ rules: prediction({ inputId: rules }), shadow: prediction({ inputId: shadow }), proposedBy: 'logic' as const, fallback: false });
    expect(isPaired(pair('a', 'a'))).toBe(true);
    expect(isPaired(pair('a', 'b'))).toBe(false);
    expect(isPaired(pair('a', null))).toBe(false);
    expect(isPaired(pair(null, null))).toBe(false);
  });
});

describe('substitution and tier mapping', () => {
  it('reads a substitution and a mapping, and drops what is not one', () => {
    const from = { provider: 'codex', model: 'gpt-5.6-terra', effort: null };
    const to = { provider: 'claudeAgent', model: 'fable-5', effort: null };
    expect(parseSubstitution({ reason: 'usage-limit', from, to, toTier: 'hard', usedPercent: 90 })).toEqual({ reason: 'usage-limit', from, to, toTier: 'hard' });
    expect(parseSubstitution({ reason: 'cheaper', from, to, toTier: 'hard' })).toBeNull();
    expect(parseSubstitution(null)).toBeNull();
    expect(parseTierMapping({ simple: from, hard: { ...to, accountId: 'acct-1' }, mid: { provider: 'codex' }, extra: from })).toEqual({ simple: from, hard: to });
  });
});
