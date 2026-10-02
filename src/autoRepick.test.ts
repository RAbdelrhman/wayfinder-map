import { describe, expect, it } from 'vitest';

import { buildAutoDecision } from './autoDecision.js';
import type { AutoDecision } from './autoDecision.js';
import { autoDecisionBody, pickAuto } from './autoPick.js';
import type { Rating } from './autoPick.js';
import { repickQueued } from './autoRepick.js';
import type { RepickInput } from './autoRepick.js';
import type { ModelCatalog, ModelChoice, Tier } from './models.js';

const NOW = new Date('2026-10-01T12:05:00.000Z');
const READ_AT = '2026-10-01T12:04:30.000Z';

function model(slug: string): ModelCatalog['providers'][number]['models'][number] {
  return { slug, name: slug, isDefault: false, effort: { id: 'reasoningEffort', label: 'Reasoning', options: [{ id: 'high', label: 'High' }], defaultValue: 'high' } };
}

const CATALOG: ModelCatalog = {
  providers: [
    { instanceId: 'codex', name: 'Codex', ready: true, models: [model('gpt-5.6-luna'), model('gpt-5.6-terra'), model('gpt-5.6-sol')] },
    { instanceId: 'claudeAgent', name: 'Claude', ready: true, models: [model('sonnet-5'), model('opus-4.8'), model('fable-5')] },
  ],
};

type TierModels = Partial<Record<Tier, ModelChoice>>;

const SPLIT: TierModels = {
  simple: { instanceId: 'codex', model: 'gpt-5.6-luna' },
  mid: { instanceId: 'codex', model: 'gpt-5.6-terra' },
  hard: { instanceId: 'claudeAgent', model: 'fable-5' },
};
const CODEX_ONLY: TierModels = {
  simple: { instanceId: 'codex', model: 'gpt-5.6-luna' },
  mid: { instanceId: 'codex', model: 'gpt-5.6-terra' },
  hard: { instanceId: 'codex', model: 'gpt-5.6-sol' },
};

const reading = (state: 'available' | 'limited'): { state: 'available' | 'limited'; observedAt: string } => ({ state, observedAt: READ_AT });

/** What the confirm list sent for a ticket Auto rated at `tier`, as the runner holds it. */
function queued(tier: Tier, tierModels: TierModels, selection: 'auto' | 'user' = 'auto'): RepickInput['item'] {
  const rating: Rating = { tier, reason: 'waits on 2 tickets', by: 'logic', version: 'rules-1' };
  const proposal = pickAuto({ rating, catalog: CATALOG, tierModels, usage: {} });
  const body = autoDecisionBody(proposal, { tier: proposal.tier, choice: proposal.choice }, { selection });
  return { tier, model: proposal.choice, auto: buildAutoDecision(body, new Date('2026-10-01T12:00:00.000Z')) };
}

function repick(item: RepickInput['item'], usage: RepickInput['usage'], tierModels: TierModels = SPLIT): ReturnType<typeof repickQueued> {
  return repickQueued({ item, catalog: CATALOG, tierModels, usage, now: NOW });
}

describe('repickQueued', () => {
  it("moves a limited provider's ticket to a harder tier's model on another provider, as a dispatch substitution", () => {
    const result = repick(queued('mid', SPLIT), { codex: reading('limited'), claudeAgent: reading('available') });
    expect(result.kind).toBe('switch');
    if (result.kind !== 'switch') return;
    expect(result.model).toEqual({ instanceId: 'claudeAgent', model: 'fable-5' });
    expect(result.note).toBe('Moved to fable-5 while queued: waits on 2 tickets; Codex is at its usage limit');
    expect(result.auto).toMatchObject({
      decidedAt: NOW.toISOString(),
      selection: 'auto',
      // The proposal moves with the final pick, so nothing counts as a user correction.
      overrides: [],
      proposed: { tier: 'mid', provider: 'claudeAgent', model: 'fable-5' },
      final: { tier: 'mid', provider: 'claudeAgent', model: 'fable-5' },
      current: { provider: 'claudeAgent', model: 'fable-5' },
      usage: { state: 'available', observedAt: READ_AT },
      substitution: {
        reason: 'usage-limit',
        from: { provider: 'codex', model: 'gpt-5.6-terra', effort: null },
        to: { provider: 'claudeAgent', model: 'fable-5', effort: null },
        toTier: 'hard',
      },
    });
    // The rating Auto made is untouched.
    expect(result.auto.scoring).toEqual({ version: 'rules-1', reason: 'waits on 2 tickets' });
  });

  it('moves a ticket whose provider is limited even when the other provider has no reading', () => {
    const result = repick(queued('mid', SPLIT), { codex: reading('limited') });
    expect(result).toMatchObject({ kind: 'switch', model: { instanceId: 'claudeAgent' }, auto: { usage: { state: 'unknown', observedAt: null } } });
  });

  it('changes nothing while the provider reads available', () => {
    expect(repick(queued('mid', SPLIT), { codex: reading('available') })).toEqual({ kind: 'keep' });
  });

  it('changes nothing while the provider reads unknown, whatever the other one reads', () => {
    expect(repick(queued('mid', SPLIT), {})).toEqual({ kind: 'keep' });
    expect(repick(queued('mid', SPLIT), { codex: { state: 'unknown', observedAt: null }, claudeAgent: reading('limited') })).toEqual({ kind: 'keep' });
  });

  it("holds the ticket when its provider is limited and no harder tier's model is on another provider", () => {
    const result = repick(queued('mid', CODEX_ONLY), { codex: reading('limited') }, CODEX_ONLY);
    expect(result).toEqual({ kind: 'hold', note: 'Held: Codex is at its usage limit, and no other provider is set for this tier' });
  });

  it('holds when the other provider is limited too', () => {
    expect(repick(queued('mid', SPLIT), { codex: reading('limited'), claudeAgent: reading('limited') }).kind).toBe('hold');
  });

  it("never takes an easier tier's model to get past a limit", () => {
    const easierElsewhere: TierModels = { ...CODEX_ONLY, simple: { instanceId: 'claudeAgent', model: 'sonnet-5' } };
    expect(repick(queued('hard', easierElsewhere), { codex: reading('limited') }, easierElsewhere).kind).toBe('hold');
  });

  it('holds when T3 Code reports no models to pick from', () => {
    const result = repickQueued({ item: queued('mid', CODEX_ONLY), catalog: null, tierModels: CODEX_ONLY, usage: { codex: reading('limited') }, now: NOW });
    expect(result).toEqual({ kind: 'hold', note: 'Held: codex is at its usage limit, and no other provider is set for this tier' });
  });

  it('leaves a tier, model or effort the user chose alone', () => {
    const limited = { codex: reading('limited') };
    expect(repick(queued('mid', SPLIT, 'user'), limited).kind).toBe('keep');
    const item = queued('mid', SPLIT);
    const corrected = { ...item, auto: item.auto === null ? null : { ...item.auto, overrides: ['model' as const] } };
    expect(repick(corrected, limited).kind).toBe('keep');
  });

  it('leaves a plain-tier ticket, with no Auto decision or no model, alone', () => {
    const limited = { codex: reading('limited') };
    expect(repick({ tier: 'mid', model: SPLIT.mid ?? null, auto: null }, limited).kind).toBe('keep');
    expect(repick({ ...queued('mid', SPLIT), model: null }, limited).kind).toBe('keep');
  });

  it("keeps a model's rating version when it re-picks", () => {
    const item = queued('mid', SPLIT);
    const rated = { ...item, auto: item.auto === null ? null : ({ ...item.auto, scoring: { version: 'model-1:gpt-5.6-luna', reason: 'spans modules' } } satisfies AutoDecision) };
    expect(repick(rated, { codex: reading('limited') })).toMatchObject({ kind: 'switch', auto: { scoring: { version: 'model-1:gpt-5.6-luna' } } });
  });
});
