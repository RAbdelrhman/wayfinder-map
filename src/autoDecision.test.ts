import { describe, expect, it } from 'vitest';

import {
  autoResultOf,
  buildAutoDecision,
  confirmModelChange,
  isUsageLimitError,
  observeModelSelection,
  observeThread,
  parseStoredAutoDecision,
  usageAgeMs,
} from './autoDecision.js';
import type { AutoDecision, ThreadObservation } from './autoDecision.js';

const now = new Date('2026-09-30T12:00:00.000Z');

const request = {
  scoring: { version: 'rules-1', reason: 'Mid: touches the store and the tracker' },
  proposed: { tier: 'mid', provider: 'codex', model: 'gpt-5.6-terra', effort: 'medium' },
  final: { tier: 'mid', provider: 'codex', model: 'gpt-5.6-terra', effort: 'medium' },
  usage: { state: 'available', observedAt: '2026-09-30T11:59:30.000Z' },
};

function decision(overrides: Record<string, unknown> = {}): AutoDecision {
  const built = buildAutoDecision({ ...request, ...overrides }, now);
  if (built === null) throw new Error('expected a decision');
  return built;
}

const observation = (overrides: Partial<ThreadObservation> = {}): ThreadObservation => ({
  at: '2026-09-30T12:05:00.000Z',
  model: { provider: 'codex', model: 'gpt-5.6-terra', effort: 'medium' },
  error: null,
  previousError: null,
  result: null,
  resultAt: null,
  ...overrides,
});

describe('buildAutoDecision', () => {
  it('keeps the proposal, the final pick and the usage reading, and finds no override when they match', () => {
    expect(decision()).toEqual({
      decidedAt: '2026-09-30T12:00:00.000Z',
      scoring: { version: 'rules-1', reason: 'Mid: touches the store and the tracker' },
      proposed: request.proposed,
      final: request.final,
      ticketType: null,
      selection: 'auto',
      overrides: [],
      tierMapping: {},
      substitution: null,
      calibration: null,
      usage: { state: 'available', observedAt: '2026-09-30T11:59:30.000Z' },
      current: { provider: 'codex', model: 'gpt-5.6-terra', effort: 'medium' },
      modelChanges: [],
      usageLimitErrors: [],
      outcome: null,
    });
  });

  it('names what the user changed from the proposal', () => {
    const tierOnly = decision({ final: { ...request.final, tier: 'hard' } });
    expect(tierOnly.overrides).toEqual(['tier']);
    const modelAndEffort = decision({ final: { ...request.final, model: 'gpt-5.6-sol', effort: 'high' } });
    expect(modelAndEffort.overrides).toEqual(['model', 'effort']);
    expect(modelAndEffort.proposed).toEqual(request.proposed);
  });

  it('computes the override itself instead of trusting the caller', () => {
    expect(decision({ overrides: [], userOverrode: false, final: { ...request.final, tier: 'simple' } }).overrides).toEqual(['tier']);
  });

  it('drops quota values, account ids and credentials sent alongside', () => {
    const built = decision({
      accountId: 'acct-123',
      token: 'sk-secret',
      scoring: { ...request.scoring, apiKey: 'sk-secret' },
      proposed: { ...request.proposed, usedPercent: 91, accountId: 'acct-123' },
      usage: { ...request.usage, usedPercent: 91, resetsAt: '2026-10-01T00:00:00Z', windows: [{ usedPercent: 91 }] },
    });
    const saved = JSON.stringify(built);
    for (const leaked of ['acct-123', 'sk-secret', '91', 'resetsAt', 'windows', 'usedPercent']) {
      expect(saved).not.toContain(leaked);
    }
  });

  it('reads a limit or a missing reading as unknown unless it has a time', () => {
    expect(decision({ usage: { state: 'limited', observedAt: '2026-09-30T11:59:59.000Z' } }).usage.state).toBe('limited');
    expect(decision({ usage: { state: 'limited' } }).usage).toEqual({ state: 'unknown', observedAt: null });
    expect(decision({ usage: { state: 'plenty', observedAt: request.usage.observedAt } }).usage.state).toBe('unknown');
    expect(decision({ usage: undefined }).usage).toEqual({ state: 'unknown', observedAt: null });
  });

  it('refuses a decision with no reason, scoring version, or valid tier', () => {
    expect(buildAutoDecision({ ...request, scoring: { version: 'rules-1' } }, now)).toBeNull();
    expect(buildAutoDecision({ ...request, scoring: { reason: 'x' } }, now)).toBeNull();
    expect(buildAutoDecision({ ...request, final: { ...request.final, tier: 'extreme' } }, now)).toBeNull();
    expect(buildAutoDecision(undefined, now)).toBeNull();
  });

  it('measures how old the usage reading was when the pick was made', () => {
    expect(usageAgeMs(decision())).toBe(30_000);
    expect(usageAgeMs(decision({ usage: { state: 'unknown' } }))).toBeNull();
  });
});

const calibration = {
  rules: { tier: 'mid', version: 'rules-1', rubric: null, rater: null, inputId: 'in-1', elapsedMs: 0.3, status: 'ok', tokens: null, cost: { kind: 'actual', usd: 0 } },
  shadow: {
    tier: 'hard',
    version: 'model-1:gpt-5.6-luna',
    rubric: 'rubric-1',
    rater: { provider: 'codex', model: 'gpt-5.6-luna', effort: 'low' },
    inputId: 'in-1',
    elapsedMs: 6_970,
    status: 'ok',
    tokens: { input: null, cachedInput: null, output: null, total: 18_660 },
    cost: { kind: 'unavailable' },
  },
  proposedBy: 'logic',
  fallback: false,
};

describe('calibration fields (#186)', () => {
  it('saves the paired predictions, the type and the dispatch context for a task', () => {
    const built = buildAutoDecision(
      { ...request, selection: 'user', tierMapping: { mid: request.final }, substitution: { reason: 'usage-limit', from: request.final, to: { ...request.final, model: 'fable-5' }, toTier: 'hard' }, calibration },
      now,
      'task',
    );
    expect(built).toMatchObject({ ticketType: 'task', selection: 'user', tierMapping: { mid: { model: 'gpt-5.6-terra' } }, substitution: { reason: 'usage-limit', toTier: 'hard' }, calibration });
  });

  it('takes the ticket type from the server, not the request', () => {
    expect(buildAutoDecision({ ...request, ticketType: 'task', calibration }, now, 'research')?.ticketType).toBe('research');
    expect(buildAutoDecision({ ...request, ticketType: 'task' }, now)?.ticketType).toBeNull();
  });

  it('drops the pair for a ticket that is not a task or research, so no shadow record exists for it', () => {
    for (const type of ['prototype', 'grilling', null]) expect(buildAutoDecision({ ...request, calibration }, now, type)?.calibration).toBeNull();
    expect(buildAutoDecision({ ...request, calibration }, now, 'research')?.calibration).not.toBeNull();
  });

  it('records no pair when calibration was off, and defaults a selection it was not told to Auto', () => {
    expect(decision().calibration).toBeNull();
    expect(decision({ selection: 'whatever' }).selection).toBe('auto');
  });

  it('saves a user-chosen tier equal to the proposal as a selection, not as an override', () => {
    const explicit = decision({ selection: 'user' });
    expect(explicit).toMatchObject({ selection: 'user', overrides: [] });
  });

  it('survives a round trip through the store, secrets and all unknown fields dropped', () => {
    const stored = buildAutoDecision({ ...request, calibration, accountId: 'acct-1' }, now, 'task');
    if (stored === null) throw new Error('expected a decision');
    const reread = parseStoredAutoDecision(JSON.parse(JSON.stringify(stored)));
    expect(reread).toEqual(stored);
    expect(reread?.calibration?.shadow.rater).toEqual({ provider: 'codex', model: 'gpt-5.6-luna', effort: 'low' });
    expect(JSON.stringify(reread)).not.toContain('acct-1');
  });
});

describe('model change reasons (#186)', () => {
  const changed = () => observeThread(decision(), observation({ model: { provider: 'claude', model: 'opus', effort: null } }));
  const at = '2026-09-30T12:05:00.000Z';

  it('leaves the reason unknown: a different, even stronger, model name does not say why', () => {
    expect(changed().modelChanges[0]).toMatchObject({ reason: 'unknown', confirmedAt: null, askedAt: null });
  });

  it('records a reason the user confirmed, and can set it back to unknown', () => {
    const confirmed = confirmModelChange(changed(), at, 'harder-ticket', new Date('2026-09-30T13:00:00.000Z'));
    expect(confirmed?.modelChanges[0]).toMatchObject({ reason: 'harder-ticket', confirmedAt: '2026-09-30T13:00:00.000Z', askedAt: '2026-09-30T13:00:00.000Z' });
    expect(confirmed?.overrides).toEqual([]);
    const reset = confirmModelChange(confirmed ?? changed(), at, 'unknown', new Date('2026-09-30T13:05:00.000Z'));
    expect(reset?.modelChanges[0]).toMatchObject({ reason: 'unknown', confirmedAt: null });
  });

  it('counts Not sure as an answer: the reason stays unknown and the user is not asked again', () => {
    const answered = confirmModelChange(changed(), at, 'unknown', new Date('2026-09-30T13:00:00.000Z'));
    expect(answered?.modelChanges[0]).toMatchObject({ reason: 'unknown', confirmedAt: null, askedAt: '2026-09-30T13:00:00.000Z' });
    const reread = parseStoredAutoDecision(JSON.parse(JSON.stringify(answered)));
    expect(reread?.modelChanges[0]).toMatchObject({ reason: 'unknown', confirmedAt: null, askedAt: '2026-09-30T13:00:00.000Z' });
  });

  it('finds no change to confirm at a time it did not happen', () => {
    expect(confirmModelChange(changed(), '2026-09-30T12:06:00.000Z', 'preference', now)).toBeNull();
    expect(confirmModelChange(decision(), at, 'preference', now)).toBeNull();
  });

  it('keeps a confirmed reason across a read, and reads an old change with no reason as unknown', () => {
    const confirmed = confirmModelChange(changed(), at, 'provider-limit', now);
    if (confirmed === null) throw new Error('expected a change');
    expect(parseStoredAutoDecision(JSON.parse(JSON.stringify(confirmed)))?.modelChanges[0]).toMatchObject({ reason: 'provider-limit', confirmedAt: now.toISOString() });
    const old = JSON.parse(JSON.stringify(confirmed)) as { modelChanges: Array<Record<string, unknown>> };
    delete old.modelChanges[0]?.['reason'];
    delete old.modelChanges[0]?.['confirmedAt'];
    expect(parseStoredAutoDecision(old)?.modelChanges[0]).toMatchObject({ reason: 'unknown', confirmedAt: null });
    old.modelChanges[0] = { ...old.modelChanges[0], reason: 'because', confirmedAt: now.toISOString() };
    expect(parseStoredAutoDecision(old)?.modelChanges[0]).toMatchObject({ reason: 'unknown', confirmedAt: null });
  });
});

describe('observeThread', () => {
  it('records a model change from inside the session apart from the proposal', () => {
    const changed = observeThread(decision(), observation({ model: { provider: 'claude', model: 'opus', effort: null } }));
    expect(changed.modelChanges).toEqual([
      {
        at: '2026-09-30T12:05:00.000Z',
        from: { provider: 'codex', model: 'gpt-5.6-terra', effort: 'medium' },
        to: { provider: 'claude', model: 'opus', effort: null },
        reason: 'unknown',
        confirmedAt: null,
        askedAt: null,
      },
    ]);
    expect(changed.current).toMatchObject({ model: 'opus' });
    expect(changed.proposed).toEqual(request.proposed);
    expect(changed.final).toEqual(request.final);
    expect(changed.overrides).toEqual([]);
  });

  it('notes no change while the thread keeps running the picked model', () => {
    const same = observeThread(decision(), observation());
    expect(same.modelChanges).toEqual([]);
    expect(observeThread(same, observation({ model: { provider: 'codex', model: 'gpt-5.6-terra', effort: null } })).modelChanges).toEqual([]);
  });

  it('records an effort change on the same model', () => {
    const changed = observeThread(decision(), observation({ model: { provider: 'codex', model: 'gpt-5.6-terra', effort: 'high' } }));
    expect(changed.modelChanges).toHaveLength(1);
  });

  it('takes the first model T3 reports as the baseline when none was picked', () => {
    const open = decision({ final: { tier: 'mid', provider: null, model: null, effort: null } });
    expect(open.current).toBeNull();
    const first = observeThread(open, observation());
    expect(first.modelChanges).toEqual([]);
    expect(first.current).toMatchObject({ model: 'gpt-5.6-terra' });
  });

  it('records a usage-limit error once, without keeping its text', () => {
    const message = 'You have hit your usage limit (91% of 5h window). Account acct-123.';
    const first = observeThread(decision(), observation({ error: message, previousError: null }));
    expect(first.usageLimitErrors).toEqual([{ at: '2026-09-30T12:05:00.000Z', model: 'gpt-5.6-terra' }]);
    const again = observeThread(first, observation({ error: message, previousError: message }));
    expect(again.usageLimitErrors).toHaveLength(1);
    expect(JSON.stringify(again)).not.toContain('acct-123');
    expect(JSON.stringify(again)).not.toContain('91%');
    expect(observeThread(decision(), observation({ error: 'tool crashed' })).usageLimitErrors).toEqual([]);
  });

  it('follows the terminal result, and clears it when the thread goes on', () => {
    const done = observeThread(decision(), observation({ result: 'finished', resultAt: '2026-09-30T12:30:00.000Z' }));
    expect(done.outcome).toEqual({ result: 'finished', at: '2026-09-30T12:30:00.000Z' });
    expect(observeThread(done, observation()).outcome).toBeNull();
  });

  it('keeps the most recent events only', () => {
    let current = decision();
    for (let index = 0; index < 25; index += 1) {
      current = observeThread(current, observation({ model: { provider: 'codex', model: `m-${String(index)}`, effort: null } }));
    }
    expect(current.modelChanges).toHaveLength(20);
    expect(current.modelChanges.at(-1)?.to.model).toBe('m-24');
  });
});

describe('helpers', () => {
  it('reads the model and effort from a T3 modelSelection', () => {
    expect(observeModelSelection({ instanceId: 'codex', model: 'm', options: [{ id: 'reasoningEffort', value: 'high' }, { id: 'fast', value: true }] })).toEqual({
      provider: 'codex',
      model: 'm',
      effort: 'high',
    });
    expect(observeModelSelection({ model: 'm' })).toEqual({ provider: null, model: 'm', effort: null });
    expect(observeModelSelection({ instanceId: 'codex' })).toBeNull();
    expect(observeModelSelection(null)).toBeNull();
  });

  it('recognises provider usage-limit errors', () => {
    for (const message of ['You hit your usage limit', 'rate_limit_exceeded', 'Quota exceeded', 'HTTP 429', 'Too many requests']) {
      expect(isUsageLimitError(message)).toBe(true);
    }
    expect(isUsageLimitError('Cannot find module')).toBe(false);
    expect(isUsageLimitError(null)).toBe(false);
  });

  it('counts a pull request as the result of a thread that has not ended', () => {
    expect(autoResultOf('failed', true)).toBe('failed');
    expect(autoResultOf('running', true)).toBe('pull-request');
    expect(autoResultOf('running', false)).toBeNull();
  });

  it('reads a stored decision back and drops one that is not valid', () => {
    const stored = decision();
    expect(parseStoredAutoDecision(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
    expect(parseStoredAutoDecision({ ...stored, proposed: 'mid' })).toBeNull();
    expect(parseStoredAutoDecision({ ...stored, modelChanges: [{ at: 'never' }, 4], outcome: { result: 'exploded', at: stored.decidedAt } })).toMatchObject({
      modelChanges: [],
      outcome: null,
    });
  });
});
