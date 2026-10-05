import { describe, expect, it, vi } from 'vitest';

import { pickAuto, rateByRules } from './autoPick.js';
import { CLAUDE_INSTANCE, CODEX_INSTANCE, USAGE_FRESH_MS, UsageReadings, combineUsage, readingFromClaudeStatusLine, readingFromCodexLimits } from './providerUsage.js';
import type { ModelCatalog } from './models.js';
import type { UsageReading } from './providerUsage.js';

const now = new Date('2026-10-01T12:00:00.000Z');
const later = (ms: number): Date => new Date(now.getTime() + ms);
const epoch = (ms: number): number => Math.floor((now.getTime() + ms) / 1000);

const codexResult = (primary: number, secondary: number, extra: Record<string, unknown> = {}, reached: string | null = null) => ({
  accountId: 'acct-secret',
  ordinaryUsageAllowed: true,
  rateLimits: {
    planType: 'pro',
    rateLimitReachedType: reached,
    primary: { usedPercent: primary, windowDurationMins: 300, resetsAt: epoch(3_600_000) },
    secondary: { usedPercent: secondary, windowDurationMins: 10_080, resetsAt: epoch(86_400_000) },
  },
  ...extra,
});

describe('readingFromCodexLimits', () => {
  it('reads available while every window has room, with no percentages kept', () => {
    const reading = readingFromCodexLimits(codexResult(96, 40), now);
    expect(reading).toEqual({ state: 'available', observedAt: now.toISOString(), resetsAt: null });
    expect(JSON.stringify(reading)).not.toMatch(/acct-secret|96|pro/);
  });

  it('reads limited when a window is used up, until that window resets', () => {
    expect(readingFromCodexLimits(codexResult(100, 40), now)).toEqual({ state: 'limited', observedAt: now.toISOString(), resetsAt: (epoch(3_600_000)) * 1000 });
  });

  it('keeps exhaustion until every exhausted window has reset', () => {
    const reading = readingFromCodexLimits(codexResult(100, 100), now);
    expect(reading?.resetsAt).toBe(epoch(86_400_000) * 1000);
    expect(combineUsage([], { codex: reading! }, later(3_600_001)).codex?.state).toBe('limited');
    expect(combineUsage([], { codex: reading! }, later(86_400_001))).toEqual({});
  });

  it('keeps the reset unknown when an exhausted window gives no reset time', () => {
    const result = { rateLimits: { primary: { usedPercent: 100, resetsAt: epoch(3_600_000) }, secondary: { usedPercent: 100 } } };
    const reading = readingFromCodexLimits(result, now);
    expect(reading).toEqual({ state: 'limited', observedAt: now.toISOString(), resetsAt: null });
    expect(combineUsage([], { codex: reading! }, later(USAGE_FRESH_MS + 1))).toEqual({});
  });

  it('reads limited when Codex says ordinary usage is not allowed or names a reached limit', () => {
    expect(readingFromCodexLimits(codexResult(10, 10, { ordinaryUsageAllowed: false }), now)?.state).toBe('limited');
    expect(readingFromCodexLimits(codexResult(10, 10, {}, 'rate_limit_reached'), now)?.state).toBe('limited');
  });

  it('ignores a window that already reset, and reads unknown without any usable window', () => {
    const reset = codexResult(100, 100);
    reset.rateLimits.primary.resetsAt = epoch(-1000);
    reset.rateLimits.secondary.resetsAt = epoch(-1000);
    expect(readingFromCodexLimits(reset, now)).toBeNull();
    expect(readingFromCodexLimits({ rateLimits: {} }, now)).toBeNull();
    expect(readingFromCodexLimits({ error: 'nope' }, now)).toBeNull();
    expect(readingFromCodexLimits(null, now)).toBeNull();
  });
});

describe('readingFromClaudeStatusLine', () => {
  const payload = (fiveHour: number, sevenDay: number) => ({
    model: { display_name: 'Opus' },
    rate_limits: { five_hour: { used_percentage: fiveHour, resets_at: epoch(3_600_000) }, seven_day: { used_percentage: sevenDay, resets_at: epoch(86_400_000) } },
  });

  it('reads available, and limited once either window reaches 100%', () => {
    expect(readingFromClaudeStatusLine(payload(23.5, 41.2), now)?.state).toBe('available');
    expect(readingFromClaudeStatusLine(payload(23.5, 100), now)).toMatchObject({ state: 'limited', resetsAt: epoch(86_400_000) * 1000 });
  });

  it('is unknown when rate_limits is missing or holds no windows', () => {
    expect(readingFromClaudeStatusLine({ model: {} }, now)).toBeNull();
    expect(readingFromClaudeStatusLine({ rate_limits: {} }, now)).toBeNull();
    expect(readingFromClaudeStatusLine('garbage', now)).toBeNull();
  });
});

describe('combineUsage', () => {
  const reading = (state: UsageReading['state'], observedAt: Date, resetsAt: number | null = null): UsageReading => ({ state, observedAt: observedAt.toISOString(), resetsAt });
  const error = (at: Date) => ({ instanceId: CODEX_INSTANCE, at: at.toISOString() });

  it('reports a fresh reading with its Wayfinder timestamp', () => {
    expect(combineUsage([], { [CODEX_INSTANCE]: reading('available', later(-10_000)) }, now)).toEqual({ [CODEX_INSTANCE]: { state: 'available', observedAt: later(-10_000).toISOString() } });
  });

  it('leaves a stale available reading out, so the provider stays unknown', () => {
    expect(combineUsage([], { [CODEX_INSTANCE]: reading('available', later(-USAGE_FRESH_MS - 1)) }, now)).toEqual({});
  });

  it('keeps a stale limited reading until its window resets', () => {
    const stale = later(-10 * 60_000);
    expect(combineUsage([], { [CODEX_INSTANCE]: reading('limited', stale, later(60_000).getTime()) }, now)[CODEX_INSTANCE]?.state).toBe('limited');
    expect(combineUsage([], { [CODEX_INSTANCE]: reading('limited', stale, later(-1).getTime()) }, now)).toEqual({});
    // With no reset time it ages out like any other reading.
    expect(combineUsage([], { [CODEX_INSTANCE]: reading('limited', stale) }, now)).toEqual({});
  });

  it('lets the newest observation win between an error and a reading', () => {
    expect(combineUsage([error(later(-5_000))], { [CODEX_INSTANCE]: reading('available', later(-20_000)) }, now)[CODEX_INSTANCE]?.state).toBe('limited');
    expect(combineUsage([error(later(-20_000))], { [CODEX_INSTANCE]: reading('available', later(-5_000)) }, now)[CODEX_INSTANCE]?.state).toBe('available');
  });

  it('reports no provider when nothing was read', () => {
    expect(combineUsage([], {}, now)).toEqual({});
  });
});

describe('UsageReadings', () => {
  it('refreshes Codex only when the reading is stale, sharing one read between callers', async () => {
    // A reading is stamped with the clock, so pin it to the windows' day.
    vi.useFakeTimers({ toFake: ['Date'], now });
    try {
      const read = vi.fn(async () => codexResult(10, 10));
      const readings = new UsageReadings(read);
      await Promise.all([readings.refresh(now), readings.refresh(now)]);
      expect(read).toHaveBeenCalledTimes(1);
      expect(readings.snapshot()[CODEX_INSTANCE]?.state).toBe('available');
      await readings.refresh(new Date());
      expect(read).toHaveBeenCalledTimes(1);
      await readings.refresh(later(USAGE_FRESH_MS * 2));
      expect(read).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays unknown when Codex cannot be read', async () => {
    const readings = new UsageReadings(async () => {
      throw new Error('codex: not found');
    });
    await readings.refresh();
    expect(readings.snapshot()).toEqual({});
  });

  it('never reads Codex when none is given, and records Claude only when the payload has limits', async () => {
    const read = vi.fn(async () => codexResult(1, 1));
    const readings = new UsageReadings(null);
    await readings.refresh();
    expect(read).not.toHaveBeenCalled();
    expect(readings.recordClaudeStatusLine({ model: {} })).toBe(false);
    expect(readings.recordClaudeStatusLine({ rate_limits: { five_hour: { used_percentage: 100, resets_at: Math.floor(Date.now() / 1000) + 600 } } })).toBe(true);
    expect(readings.snapshot()[CLAUDE_INSTANCE]?.state).toBe('limited');
  });
});

describe('Auto with a real reading', () => {
  it('avoids a provider reported limited before any error', () => {
    const catalog: ModelCatalog = {
      providers: [
        { instanceId: 'codex', name: 'Codex', ready: true, models: [{ slug: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', isDefault: false, effort: null }] },
        { instanceId: 'claudeAgent', name: 'Claude', ready: true, models: [{ slug: 'opus', name: 'Opus', isDefault: false, effort: null }] },
      ],
    };
    const usage = combineUsage([], { [CODEX_INSTANCE]: { state: 'limited', observedAt: now.toISOString(), resetsAt: later(60_000).getTime() } }, now);
    const proposal = pickAuto({
      rating: rateByRules({ number: 1, title: 'x', type: 'task', body: '', blockedBy: [] }),
      catalog,
      tierModels: { mid: { instanceId: 'codex', model: 'gpt-5.6-sol' }, hard: { instanceId: 'claudeAgent', model: 'opus' } },
      usage,
    });
    expect(proposal.choice?.instanceId).toBe('claudeAgent');
    expect(proposal.reason).toContain('at its usage limit');
  });
});
