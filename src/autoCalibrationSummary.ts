import { CALIBRATION_TYPES, isPaired } from './autoCalibration.js';
import { RETENTION_MS } from './handOffTracking.js';
import type { StoredHandOff } from './handOffTracking.js';

/**
 * How #173 counts eligible completions from the local hand-off store (#186), by ticket type. Counts only: no
 * ticket text, no predictions. The store drops a hand-off 30 days after it ends, so `earliestExpiresAt` says
 * when the oldest eligible record goes and the counts have to be reported by then.
 */

export type CalibrationType = (typeof CALIBRATION_TYPES)[number];

export interface CalibrationTypeSummary {
  /** Completed hand-offs with both predictions made on the same input, no usage-limit error, and a verified result. */
  eligible: number;
  /** Distinct tickets among them. A retried ticket is not independent evidence. */
  tickets: number;
  /** Eligible hand-offs where both methods produced a tier, so they can be compared. */
  bothPredicted: number;
  /** Eligible hand-offs where the shadow model timed out, failed or gave no tier. */
  shadowFailed: number;
  /** Eligible hand-offs where the user's rating model failed and the rules rated instead. */
  fallback: number;
  /** Eligible hand-offs where the user chose a tier by hand and it differs from the proposal: an explicit tier correction. */
  tierCorrected: number;
  /** Eligible hand-offs where provider readiness or a limit moved the model. Not a difficulty correction. */
  substituted: number;
}

export interface CalibrationSummary {
  byType: Record<CalibrationType, CalibrationTypeSummary>;
  /** Opted-in hand-offs left out, each in the first group that applies. */
  excluded: {
    notPaired: number;
    /** Still running, or untracked. They may become eligible. */
    active: number;
    failedOrInterrupted: number;
    usageLimited: number;
    /** A pull request without a merged state or a finished session. A pull request alone is not a completion. */
    unverifiedPullRequest: number;
  };
  /** When the oldest eligible record leaves the store. Null with none. */
  earliestExpiresAt: string | null;
}

const empty = (): CalibrationTypeSummary => ({ eligible: 0, tickets: 0, bothPredicted: 0, shadowFailed: 0, fallback: 0, tierCorrected: 0, substituted: 0 });

function isMerged(handOff: StoredHandOff): boolean {
  return handOff.pullRequests.some((ref) => ref.state?.toUpperCase() === 'MERGED');
}

export function summarizeCalibration(handOffs: readonly StoredHandOff[], scope: { repo?: string; mapNumber?: number } = {}): CalibrationSummary {
  const byType: Record<CalibrationType, CalibrationTypeSummary> = { task: empty(), research: empty() };
  const excluded: CalibrationSummary['excluded'] = { notPaired: 0, active: 0, failedOrInterrupted: 0, usageLimited: 0, unverifiedPullRequest: 0 };
  const tickets: Record<CalibrationType, Set<number>> = { task: new Set(), research: new Set() };
  let earliest: number | null = null;

  for (const handOff of handOffs) {
    const { auto } = handOff;
    if (auto === undefined || auto.calibration === null) continue;
    if (scope.repo !== undefined && handOff.repo.toLowerCase() !== scope.repo.toLowerCase()) continue;
    if (scope.mapNumber !== undefined && handOff.mapNumber !== scope.mapNumber) continue;
    const type = CALIBRATION_TYPES.find((candidate) => candidate === auto.ticketType);
    if (type === undefined) continue;

    const result = auto.outcome?.result ?? null;
    if (!isPaired(auto.calibration)) excluded.notPaired += 1;
    else if (result === null || result === 'untracked') excluded.active += 1;
    else if (result === 'failed' || result === 'interrupted') excluded.failedOrInterrupted += 1;
    else if (auto.usageLimitErrors.length > 0) excluded.usageLimited += 1;
    else if (result === 'pull-request' && !isMerged(handOff)) excluded.unverifiedPullRequest += 1;
    else {
      const { rules, shadow } = auto.calibration;
      const summary = byType[type];
      summary.eligible += 1;
      if (handOff.ticketNumber !== null) tickets[type].add(handOff.ticketNumber);
      if (rules.tier !== null && shadow.tier !== null) summary.bothPredicted += 1;
      if (shadow.status !== 'ok' || shadow.tier === null) summary.shadowFailed += 1;
      if (auto.calibration.fallback) summary.fallback += 1;
      if (auto.selection === 'user' && auto.overrides.includes('tier')) summary.tierCorrected += 1;
      if (auto.substitution !== null) summary.substituted += 1;
      const ended = Date.parse(handOff.terminalAt ?? '');
      if (Number.isFinite(ended) && (earliest === null || ended < earliest)) earliest = ended;
    }
  }
  for (const type of CALIBRATION_TYPES) byType[type].tickets = tickets[type].size;
  return { byType, excluded, earliestExpiresAt: earliest === null ? null : new Date(earliest + RETENTION_MS).toISOString() };
}
