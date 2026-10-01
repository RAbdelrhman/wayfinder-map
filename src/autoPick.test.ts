import { describe, expect, it } from 'vitest';

import { buildAutoDecision } from './autoDecision.js';
import { autoDecisionBody, LIMITED_FOR_MS, pickAuto, proposalLine, rateByRules, supportsModelRating, usageFromLimitEvents } from './autoPick.js';
import type { AutoPickInput, RatableTicket, Rating } from './autoPick.js';
import type { ModelCatalog, Tier } from './models.js';

function ticket(body: string, extra: Partial<RatableTicket> = {}): RatableTicket {
  return { number: 1, title: 'A ticket', type: 'task', body, blockedBy: [], ...extra };
}

describe('rateByRules', () => {
  it('starts at Mid when the ticket names little scope', () => {
    expect(rateByRules(ticket(''))).toMatchObject({ tier: 'mid', by: 'logic', version: 'rules-1', reason: 'the ticket names little scope, so Auto starts at Mid' });
    expect(rateByRules(ticket('Make the thing better and faster.'))).toMatchObject({ tier: 'mid' });
  });

  it('rates a clearly localized task Simple', () => {
    expect(rateByRules(ticket('Change the empty-state wording in `src/ui/home.ts`.'))).toMatchObject({ tier: 'simple', reason: 'touches 1 file' });
    expect(rateByRules(ticket('Fix a typo in the settings hint.'))).toMatchObject({ tier: 'simple', reason: 'a small, local change' });
  });

  it('rates a task that touches many files and a risky area Hard, and says why', () => {
    const body = 'Touches `src/a.ts`, `src/b.ts`, `src/c.ts`, src/d.ts, src/e.ts and src/f.ts. Concurrent starts share one connection and need a rollback.';
    expect(rateByRules(ticket(body))).toEqual({ tier: 'hard', reason: 'touches 6 files, concurrency, failure handling', by: 'logic', version: 'rules-1' });
  });

  it('rates open-ended research Hard only with more behind it, otherwise Mid', () => {
    expect(rateByRules(ticket('Find out how providers report usage.', { type: 'research' })).tier).toBe('mid');
    const heavy = ticket('Compare `src/a.ts` and `src/b.ts`; a webhook and an oauth flow are involved.', { type: 'research', blockedBy: [2, 3] });
    expect(rateByRules(heavy)).toMatchObject({ tier: 'hard' });
  });

  it('never rates a prototype or grilling ticket Simple, however short', () => {
    expect(rateByRules(ticket('Fix a typo in `src/a.ts`.', { type: 'prototype' })).tier).not.toBe('simple');
    expect(rateByRules(ticket('Fix a typo in `src/a.ts`.', { type: 'grilling' })).tier).not.toBe('simple');
  });

  it('does not count prose words as code references', () => {
    expect(rateByRules(ticket('Use `Start next` and `the map` here, plus `a`.')).tier).toBe('mid');
  });

  it('lets length break a tie at the edge of Hard only', () => {
    const filler = 'word '.repeat(320);
    const edge = ticket(`Touches \`src/a.ts\`, \`src/b.ts\`; concurrency matters; waits on two tickets. ${filler}`, { blockedBy: [2, 3] });
    expect(rateByRules(edge).tier).toBe('hard');
    expect(rateByRules(ticket(`Touches \`src/a.ts\`, \`src/b.ts\`; concurrency matters. ${filler}`)).tier).toBe('mid');
  });
});

function model(slug: string, name = slug): ModelCatalog['providers'][number]['models'][number] {
  return { slug, name, isDefault: false, effort: { id: 'reasoningEffort', label: 'Reasoning', options: [{ id: 'high', label: 'High' }], defaultValue: 'high' } };
}

const CATALOG: ModelCatalog = {
  providers: [
    { instanceId: 'codex', name: 'Codex', ready: true, models: [model('gpt-5.6-luna'), model('gpt-5.6-terra'), model('gpt-5.6-sol')] },
    { instanceId: 'claudeAgent', name: 'Claude', ready: true, models: [model('sonnet-5'), model('opus-4.8'), model('fable-5')] },
  ],
};

const rating = (tier: Tier, reason = 'touches 6 files'): Rating => ({ tier, reason, by: 'logic', version: 'rules-1' });

function input(patch: Partial<AutoPickInput> = {}): AutoPickInput {
  return {
    rating: rating('hard'),
    catalog: CATALOG,
    tierModels: {
      simple: { instanceId: 'codex', model: 'gpt-5.6-luna' },
      mid: { instanceId: 'codex', model: 'gpt-5.6-terra' },
      hard: { instanceId: 'codex', model: 'gpt-5.6-sol', effort: { id: 'reasoningEffort', value: 'high' } },
    },
    usage: {},
    ...patch,
  };
}

const limited = (instanceId: string): AutoPickInput['usage'] => ({ [instanceId]: { state: 'limited', observedAt: '2026-10-01T10:00:00.000Z' } });

describe('pickAuto', () => {
  it('resolves the rated tier to the model Settings maps it to, with its configured effort', () => {
    const pick = pickAuto(input());
    expect(pick).toMatchObject({ tier: 'hard', modelName: 'gpt-5.6-sol', reason: 'touches 6 files', usage: { state: 'unknown', observedAt: null } });
    expect(pick.choice).toEqual({ instanceId: 'codex', model: 'gpt-5.6-sol', effort: { id: 'reasoningEffort', value: 'high' } });
    expect(proposalLine(pick, 'Hard')).toBe('Hard → gpt-5.6-sol: touches 6 files');
  });

  it("keeps the tier's own model when its provider is available", () => {
    expect(pickAuto(input({ rating: rating('simple', 'touches 1 file') })).choice?.model).toBe('gpt-5.6-luna');
  });

  it("avoids a provider over its usage limit by using a harder tier's model on another provider", () => {
    const pick = pickAuto(
      input({
        rating: rating('mid', 'waits on 2 tickets'),
        usage: limited('codex'),
        tierModels: {
          simple: { instanceId: 'codex', model: 'gpt-5.6-luna' },
          mid: { instanceId: 'codex', model: 'gpt-5.6-terra' },
          hard: { instanceId: 'claudeAgent', model: 'fable-5' },
        },
      }),
    );
    expect(pick.tier).toBe('mid');
    expect(pick.choice).toEqual({ instanceId: 'claudeAgent', model: 'fable-5' });
    expect(pick.reason).toBe('waits on 2 tickets; Codex is at its usage limit');
  });

  it("never moves a ticket to an easier tier's model to stretch a limit", () => {
    const pick = pickAuto(
      input({
        usage: limited('codex'),
        tierModels: { simple: { instanceId: 'claudeAgent', model: 'sonnet-5' }, hard: { instanceId: 'codex', model: 'gpt-5.6-sol' } },
      }),
    );
    expect(pick.choice?.model).toBe('gpt-5.6-sol');
    expect(pick.reason).toContain('Codex is at its usage limit and no other provider is set for this tier, so pick one');
  });

  it('avoids a provider T3 Code reports as not ready', () => {
    const catalog: ModelCatalog = { providers: CATALOG.providers.map((provider) => (provider.instanceId === 'codex' ? { ...provider, ready: false } : provider)) };
    const pick = pickAuto(input({ catalog, tierModels: { hard: { instanceId: 'codex', model: 'gpt-5.6-sol' } } }));
    expect(pick.reason).toContain('Codex is not ready');
    expect(pick.choice?.model).toBe('gpt-5.6-sol');
  });

  it("starts on T3 Code's default when the models are unavailable or the tier maps to none", () => {
    expect(pickAuto(input({ catalog: null }))).toMatchObject({ choice: null, modelName: null });
    expect(pickAuto(input({ tierModels: {} }))).toMatchObject({ choice: null, modelName: null });
    expect(proposalLine(pickAuto(input({ tierModels: {} })), 'Hard')).toBe('Hard → T3 Code default: touches 6 files');
  });

  it('drops a mapped model T3 Code no longer offers', () => {
    expect(pickAuto(input({ tierModels: { hard: { instanceId: 'codex', model: 'gone' } } })).choice).toBeNull();
  });

  it('reports the usage reading of the provider it picked', () => {
    const usage = { codex: { state: 'available' as const, observedAt: '2026-10-01T10:00:00.000Z' } };
    expect(pickAuto(input({ usage })).usage).toEqual(usage.codex);
  });
});

describe('usageFromLimitEvents', () => {
  const now = new Date('2026-10-01T12:00:00.000Z');

  it('marks a provider limited for a while after its latest usage-limit error', () => {
    const events = [
      { instanceId: 'codex', at: '2026-10-01T11:00:00.000Z' },
      { instanceId: 'codex', at: '2026-10-01T11:50:00.000Z' },
    ];
    expect(usageFromLimitEvents(events, now)).toEqual({ codex: { state: 'limited', observedAt: '2026-10-01T11:50:00.000Z' } });
  });

  it('forgets a limit once it is older than the window, and ignores bad times', () => {
    const old = new Date(now.getTime() - LIMITED_FOR_MS - 1).toISOString();
    expect(usageFromLimitEvents([{ instanceId: 'codex', at: old }, { instanceId: 'claudeAgent', at: 'soon' }], now)).toEqual({});
  });
});

describe('autoDecisionBody', () => {
  it('builds what the hand-off record stores, so an override shows up as one', () => {
    const proposal = pickAuto(input());
    const body = autoDecisionBody(proposal, { tier: 'mid', choice: { instanceId: 'codex', model: 'gpt-5.6-terra' } });
    const decision = buildAutoDecision(body, new Date('2026-10-01T12:00:00.000Z'));
    expect(decision).toMatchObject({
      scoring: { version: 'rules-1', reason: 'touches 6 files' },
      proposed: { tier: 'hard', provider: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
      final: { tier: 'mid', provider: 'codex', model: 'gpt-5.6-terra', effort: null },
      overrides: ['tier', 'model', 'effort'],
      usage: { state: 'unknown', observedAt: null },
    });
  });
});

describe('supportsModelRating', () => {
  it('covers the providers Wayfinder can run headless', () => {
    expect(['codex', 'codex-2', 'claudeAgent'].map(supportsModelRating)).toEqual([true, true, true]);
    expect(supportsModelRating('opencode')).toBe(false);
  });
});
