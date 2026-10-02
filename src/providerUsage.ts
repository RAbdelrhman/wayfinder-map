import { execFile, spawn } from 'node:child_process';

import { usageFromLimitEvents } from './autoPick.js';
import type { ProviderUsage, UsageLimitEvent } from './autoPick.js';

/**
 * Real provider usage for Auto (#184), from #165's two signals: Codex's app-server `account/rateLimits/read`
 * and the `rate_limits` of Claude Code's status-line payload. Each is reduced on receipt to a state and a
 * Wayfinder timestamp. Percentages, plan names and account IDs are dropped here, so nothing past this file
 * (the API, the page, the hand-off record, GitHub) can carry them. No near-limit threshold: #165 found the
 * sample too small, so a provider is `limited` only when its own data says a window is used up.
 */

/** How long a reading counts as current. #165: usable for at most 60 seconds. */
export const USAGE_FRESH_MS = 60_000;
/** The default instance ids T3 Code gives the two providers. Custom instances may be other accounts, so they stay unknown. */
export const CODEX_INSTANCE = 'codex';
export const CLAUDE_INSTANCE = 'claudeAgent';

export interface UsageReading {
  state: 'available' | 'limited';
  /** When Wayfinder received the reading, never the provider's own clock. */
  observedAt: string;
  /** Epoch ms the exhausted window resets, kept so a limited reading stays true until then. Never sent out. */
  resetsAt: number | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const numberOf = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

interface Window {
  percent: number;
  /** Epoch ms, or null when the provider gave none. */
  resetsAt: number | null;
}

/** A reading from usage windows: limited when one is used up and has not reset, available when some window reports usage. */
function readingFromWindows(windows: readonly Window[], reachedFlag: boolean, observedAt: Date): UsageReading | null {
  const live = windows.filter((window) => window.resetsAt === null || window.resetsAt > observedAt.getTime());
  const full = live.filter((window) => window.percent >= 100);
  if (full.length === 0 && !reachedFlag) {
    return live.length === 0 ? null : { state: 'available', observedAt: observedAt.toISOString(), resetsAt: null };
  }
  const resets = full.flatMap((window) => (window.resetsAt === null ? [] : [window.resetsAt]));
  return { state: 'limited', observedAt: observedAt.toISOString(), resetsAt: resets.length === 0 ? null : Math.min(...resets) };
}

/** Codex's `account/rateLimits/read` result, or null when it holds no usable limit data (so the provider stays unknown). */
export function readingFromCodexLimits(result: unknown, observedAt: Date): UsageReading | null {
  if (!isRecord(result) || !isRecord(result['rateLimits'])) return null;
  const snapshot = result['rateLimits'];
  const windows = [snapshot['primary'], snapshot['secondary']].flatMap((window): Window[] => {
    if (!isRecord(window)) return [];
    const percent = numberOf(window['usedPercent']);
    const resetsAt = numberOf(window['resetsAt']);
    return percent === null ? [] : [{ percent, resetsAt: resetsAt === null ? null : resetsAt * 1000 }];
  });
  // `ordinaryUsageAllowed: false` and a reached type are Codex saying so directly; a missing field says nothing.
  const reached = result['ordinaryUsageAllowed'] === false || (typeof snapshot['rateLimitReachedType'] === 'string' && snapshot['rateLimitReachedType'] !== '');
  return readingFromWindows(windows, reached, observedAt);
}

/** Claude Code's status-line payload, or null when `rate_limits` is absent (before a session's first response, or not a subscriber). */
export function readingFromClaudeStatusLine(payload: unknown, observedAt: Date): UsageReading | null {
  if (!isRecord(payload) || !isRecord(payload['rate_limits'])) return null;
  const limits = payload['rate_limits'];
  const windows = [limits['five_hour'], limits['seven_day']].flatMap((window): Window[] => {
    if (!isRecord(window)) return [];
    const percent = numberOf(window['used_percentage']);
    const resetsAt = numberOf(window['resets_at']);
    return percent === null ? [] : [{ percent, resetsAt: resetsAt === null ? null : resetsAt * 1000 }];
  });
  return readingFromWindows(windows, false, observedAt);
}

/**
 * Each provider's usage from the limit errors Wayfinder saw and the latest readings. The newest observation
 * wins, so a fresh `available` reading overrides an older error. A stale `available` reading is dropped and the
 * provider stays out of the result, which the page reads as unknown; a `limited` one holds until its window resets.
 */
export function combineUsage(events: readonly UsageLimitEvent[], readings: Readonly<Record<string, UsageReading>>, now: Date): Record<string, ProviderUsage> {
  const usage = usageFromLimitEvents(events, now);
  for (const [instanceId, reading] of Object.entries(readings)) {
    const at = Date.parse(reading.observedAt);
    const fresh = now.getTime() - at <= USAGE_FRESH_MS;
    const holds = reading.state === 'limited' ? (reading.resetsAt === null ? fresh : now.getTime() < reading.resetsAt) : fresh;
    if (!holds) continue;
    const seen = usage[instanceId];
    if (seen === undefined || at >= Date.parse(seen.observedAt ?? '')) usage[instanceId] = { state: reading.state, observedAt: reading.observedAt };
  }
  return usage;
}

/** Reads Codex's rate limits and returns the `account/rateLimits/read` result. Rejects when it cannot. */
export type CodexLimitsReader = () => Promise<unknown>;

const CODEX_READ_TIMEOUT_MS = 10_000;

/** Ask `codex app-server` for the account's limits over its JSON-RPC stdio, then stop it. */
export const readCodexRateLimits: CodexLimitsReader = () =>
  new Promise((resolve, reject) => {
    // Windows installs Codex as a .cmd shim, which only a shell can start. The arguments are fixed.
    const child = spawn('codex', ['app-server'], { shell: process.platform === 'win32', windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let pending = '';
    let finished = false;
    const finish = (settle: () => void): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (process.platform === 'win32' && child.pid !== undefined) execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }, () => undefined);
      else child.kill();
      settle();
    };
    const timer = setTimeout(() => finish(() => reject(new Error('Codex did not answer in time'))), CODEX_READ_TIMEOUT_MS);
    const send = (message: unknown): void => {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    };
    child.on('error', (error) => finish(() => reject(error)));
    child.on('exit', () => finish(() => reject(new Error('Codex app-server exited'))));
    child.stdout.on('data', (chunk: Buffer) => {
      pending += chunk.toString('utf8');
      for (let end = pending.indexOf('\n'); end >= 0; end = pending.indexOf('\n')) {
        const line = pending.slice(0, end).trim();
        pending = pending.slice(end + 1);
        if (line === '') continue;
        let message: unknown;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        if (!isRecord(message)) continue;
        if (message['id'] === 1) {
          send({ method: 'initialized' });
          send({ id: 2, method: 'account/rateLimits/read' });
        } else if (message['id'] === 2) {
          const result = message['result'];
          finish(() => (result === undefined ? reject(new Error('Codex could not read its limits')) : resolve(result)));
        }
      }
    });
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'wayfinder-map', version: '0' } } });
  });

/** The latest reading per provider, refreshed from Codex on demand and fed Claude's by the status line. */
export class UsageReadings {
  private readonly readings = new Map<string, UsageReading>();
  private inFlight: Promise<void> | null = null;

  /** `readCodex` is null where Wayfinder must not start Codex (tests). */
  constructor(private readonly readCodex: CodexLimitsReader | null = readCodexRateLimits) {}

  snapshot(): Record<string, UsageReading> {
    return Object.fromEntries(this.readings);
  }

  /** Read Codex's limits unless the last reading is still fresh. A failed read leaves the provider unknown once the old one goes stale. */
  async refresh(now: Date = new Date()): Promise<void> {
    if (this.readCodex === null) return;
    const last = this.readings.get(CODEX_INSTANCE);
    if (last !== undefined && now.getTime() - Date.parse(last.observedAt) <= USAGE_FRESH_MS) return;
    this.inFlight ??= this.readCodex()
      .then((result) => {
        const reading = readingFromCodexLimits(result, new Date());
        if (reading === null) this.readings.delete(CODEX_INSTANCE);
        else this.readings.set(CODEX_INSTANCE, reading);
      })
      .catch(() => undefined)
      .finally(() => {
        this.inFlight = null;
      });
    await this.inFlight;
  }

  /** Record a status-line payload stamped now. Returns whether it held rate limits. */
  recordClaudeStatusLine(payload: unknown, now: Date = new Date()): boolean {
    const reading = readingFromClaudeStatusLine(payload, now);
    if (reading === null) return false;
    this.readings.set(CLAUDE_INSTANCE, reading);
    return true;
  }
}
