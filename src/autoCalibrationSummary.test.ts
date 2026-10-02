import { describe, expect, it } from 'vitest';

import { buildAutoDecision } from './autoDecision.js';
import type { AutoDecision, AutoResult } from './autoDecision.js';
import { summarizeCalibration } from './autoCalibrationSummary.js';
import type { PullRequestRef, StoredHandOff } from './handOffTracking.js';

const method = (patch: Record<string, unknown> = {}) => ({ tier: 'mid', version: 'rules-1', rubric: null, rater: null, inputId: 'in', elapsedMs: 1, status: 'ok', tokens: null, cost: { kind: 'unavailable' }, ...patch });

function decision(patch: { type?: string; shadow?: Record<string, unknown>; rules?: Record<string, unknown>; selection?: string; tier?: string; substituted?: boolean; fallback?: boolean; result?: AutoResult | null; limited?: boolean } = {}): AutoDecision {
  const pick = { tier: 'mid', provider: 'codex', model: 'gpt-5.6-terra', effort: null };
  const built = buildAutoDecision(
    {
      scoring: { version: 'rules-1', reason: 'x' },
      proposed: pick,
      final: { ...pick, tier: patch.tier ?? 'mid' },
      usage: { state: 'unknown', observedAt: null },
      selection: patch.selection ?? 'auto',
      substitution: patch.substituted === true ? { reason: 'usage-limit', from: pick, to: { ...pick, model: 'fable-5' }, toTier: 'hard' } : null,
      calibration: { rules: method(patch.rules), shadow: method({ tier: 'hard', version: 'model-1:m', rubric: 'rubric-1', ...patch.shadow }), proposedBy: 'logic', fallback: patch.fallback === true },
    },
    new Date('2026-10-01T00:00:00.000Z'),
    patch.type ?? 'task',
  );
  if (built === null) throw new Error('expected a decision');
  const result = patch.result === undefined ? 'finished' : patch.result;
  return {
    ...built,
    usageLimitErrors: patch.limited === true ? [{ at: '2026-10-01T01:00:00.000Z', model: 'gpt-5.6-terra' }] : [],
    outcome: result === null ? null : { result, at: '2026-10-02T00:00:00.000Z' },
  };
}

let next = 1;
function handOff(auto: AutoDecision | undefined, patch: Partial<StoredHandOff> = {}): StoredHandOff {
  next += 1;
  return {
    id: `h-${String(next)}`,
    repo: 'octo/one',
    mapNumber: 5,
    mapTitle: null,
    ticketNumber: next,
    title: null,
    ...(auto === undefined ? {} : { auto }),
    environmentId: null,
    t3Origin: null,
    projectId: null,
    threadId: 't',
    requestedBranch: null,
    branch: null,
    worktreePath: null,
    rung: 'thread',
    status: 'finished',
    acknowledged: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    lastSeenAt: null,
    terminalAt: '2026-10-02T00:00:00.000Z',
    sequence: null,
    rawSessionStatus: null,
    rawTurnState: null,
    lastError: null,
    pendingApproval: false,
    pendingUserInput: false,
    pullRequests: [],
    ...patch,
  };
}

const pullRequest = (state: string | null): PullRequestRef => ({ number: 1, url: 'https://github.com/octo/one/pull/1', state, checksState: null, reviewDecision: null, isDraft: null, hasSnapshot: true, mergedAt: null, syncedAt: null, source: 't3' });

describe('summarizeCalibration', () => {
  it('counts eligible completions by ticket type and when the oldest leaves the store', () => {
    const summary = summarizeCalibration([
      handOff(decision()),
      handOff(decision({ type: 'research' })),
      handOff(decision({ type: 'research' }), { terminalAt: '2026-10-05T00:00:00.000Z' }),
    ]);
    expect(summary.byType.task).toMatchObject({ eligible: 1, tickets: 1, bothPredicted: 1 });
    expect(summary.byType.research).toMatchObject({ eligible: 2, tickets: 2 });
    expect(summary.earliestExpiresAt).toBe('2026-11-01T00:00:00.000Z');
  });

  it('counts a retried ticket once in tickets and every attempt in eligible', () => {
    const retry = [handOff(decision(), { ticketNumber: 9 }), handOff(decision(), { ticketNumber: 9 })];
    expect(summarizeCalibration(retry).byType.task).toMatchObject({ eligible: 2, tickets: 1 });
  });

  it('leaves out records that are not completions or not pairs, each counted once', () => {
    const summary = summarizeCalibration([
      handOff(decision({ shadow: { inputId: 'other' } })),
      handOff(decision({ result: null }), { terminalAt: null }),
      handOff(decision({ result: 'untracked' })),
      handOff(decision({ result: 'failed' })),
      handOff(decision({ result: 'interrupted' })),
      handOff(decision({ limited: true })),
      handOff(decision({ result: 'pull-request' })),
      handOff(decision({ result: 'pull-request' }), { pullRequests: [pullRequest('OPEN')] }),
      handOff(decision({ type: 'prototype' })),
      handOff(undefined),
    ]);
    expect([summary.byType.task.eligible, summary.byType.research.eligible]).toEqual([0, 0]);
    expect(summary.excluded).toEqual({ notPaired: 1, active: 2, failedOrInterrupted: 2, usageLimited: 1, unverifiedPullRequest: 2 });
    expect(summary.earliestExpiresAt).toBeNull();
  });

  it('counts a pull request as a completion only once it is merged', () => {
    const merged = handOff(decision({ result: 'pull-request' }), { pullRequests: [pullRequest('merged')] });
    expect(summarizeCalibration([merged]).byType.task.eligible).toBe(1);
  });

  it('reports shadow failures, fallbacks, substitutions and explicit tier corrections separately', () => {
    const summary = summarizeCalibration([
      handOff(decision({ shadow: { tier: null, status: 'timeout' } })),
      handOff(decision({ fallback: true })),
      handOff(decision({ substituted: true })),
      handOff(decision({ selection: 'user', tier: 'hard' })),
      handOff(decision({ selection: 'user' })),
      handOff(decision({ tier: 'hard' })),
    ]);
    expect(summary.byType.task).toEqual({ eligible: 6, tickets: 6, bothPredicted: 5, shadowFailed: 1, fallback: 1, tierCorrected: 1, substituted: 1 });
  });

  it('can be limited to one repository and map', () => {
    const records = [handOff(decision()), handOff(decision(), { repo: 'octo/two' }), handOff(decision(), { mapNumber: 6 })];
    expect(summarizeCalibration(records, { repo: 'OCTO/one', mapNumber: 5 }).byType.task.eligible).toBe(1);
    expect(summarizeCalibration(records).byType.task.eligible).toBe(3);
  });

  it('holds counts only: no ticket text, prediction or measurement', () => {
    const text = JSON.stringify(summarizeCalibration([handOff(decision())]));
    expect(text).not.toMatch(/rules-1|model-1|elapsedMs|inputId|octo/);
  });
});
