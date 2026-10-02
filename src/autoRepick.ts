import type { AutoDecision } from './autoDecision.js';
import { pickAuto, pickOf } from './autoPick.js';
import type { ProviderUsage, Rating } from './autoPick.js';
import { USAGE_FRESH_MS } from './providerUsage.js';
import type { ModelCatalog, ModelChoice, Tier } from './models.js';

/**
 * Re-picking a queued Auto ticket's model (#189). Auto picks when the user confirms Start next, and a queued
 * ticket keeps that model however long it waits (#166). Once it has waited past a reading's life (#165: 60 seconds)
 * and its provider now reads `limited`, the pick is run again against a fresh reading, as at confirm time: a harder
 * tier's model on another provider, never an easier one. Pure: the runner feeds it everything it reads.
 */

/** How long a queued ticket waits before its provider is checked again. A reading is usable for this long. */
export const REPICK_AFTER_MS = USAGE_FRESH_MS;

export type Repick =
  /** Start with the model the ticket already has. */
  | { kind: 'keep' }
  /** Start on another provider's model. `auto` is the decision to record, with the change as a dispatch substitution. */
  | { kind: 'switch'; model: ModelChoice | null; auto: AutoDecision; note: string }
  /** Its provider is limited and no other is set, so it stays queued for the user to decide. */
  | { kind: 'hold'; note: string };

export interface RepickInput {
  /** The queued ticket as the runner holds it. */
  item: { tier: Tier; model: ModelChoice | null; auto: AutoDecision | null };
  catalog: ModelCatalog | null;
  /** The model Settings maps to each tier now. */
  tierModels: Partial<Record<Tier, ModelChoice>>;
  /** A usage reading no older than `REPICK_AFTER_MS`. */
  usage: Readonly<Record<string, ProviderUsage>>;
  now: Date;
}

/** The tier rating Auto made, rebuilt from the decision it saved. */
function ratingOf(auto: AutoDecision): Rating {
  return { tier: auto.proposed.tier, reason: auto.scoring.reason, by: auto.scoring.version.startsWith('model') ? 'model' : 'logic', version: auto.scoring.version };
}

/**
 * What to do with a queued ticket about to start. Only a ticket Auto picked and the user left alone is re-picked:
 * a tier, model or effort the user chose stays. A provider that reads `available` or `unknown` changes nothing.
 */
export function repickQueued(input: RepickInput): Repick {
  const { item, catalog, tierModels, usage, now } = input;
  const { auto, model } = item;
  if (auto === null || model === null || auto.selection !== 'auto' || auto.overrides.length > 0) return { kind: 'keep' };
  if (usage[model.instanceId]?.state !== 'limited') return { kind: 'keep' };

  const proposal = pickAuto({ rating: ratingOf(auto), catalog, tierModels, usage });
  const stillLimited = proposal.choice === null || proposal.blocked !== null;
  if (stillLimited) {
    return { kind: 'hold', note: `Held: ${proposal.blocked ?? `${model.instanceId} is at its usage limit`}, and no other provider is set for this tier` };
  }
  const pick = pickOf(proposal.tier, proposal.choice);
  const moved = proposal.choice?.instanceId !== model.instanceId || proposal.choice.model !== model.model || proposal.choice.effort?.value !== model.effort?.value;
  if (!moved) return { kind: 'keep' };
  return {
    kind: 'switch',
    model: proposal.choice,
    note: `Moved to ${proposal.modelName ?? pick.model ?? 'another model'} while queued: ${proposal.reason}`,
    // A substitution, not a user override: the proposal moves with the final pick, so `overrides` stays empty.
    auto: {
      ...auto,
      decidedAt: now.toISOString(),
      proposed: pick,
      final: pick,
      overrides: [],
      substitution: proposal.substitution,
      usage: proposal.usage,
      current: pick.model === null ? null : { provider: pick.provider, model: pick.model, effort: pick.effort },
    },
  };
}
