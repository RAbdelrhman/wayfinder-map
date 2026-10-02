import { randomUUID } from 'node:crypto';

import { isUsageLimitError } from './autoDecision.js';
import type { AutoDecision } from './autoDecision.js';
import type { ModelChoice, Tier } from './models.js';
import { normalizeCap } from './startNext.js';

const MAX_LIMITS = 50;

/** One ticket in a Start next batch, as the confirm list chose it. */
export interface BatchRequestItem {
  ticketNumber: number;
  title: string;
  tier: Tier;
  /** The model the tier resolves to, or null to let T3 Code decide. */
  model: ModelChoice | null;
  /** What Auto proposed and the user confirmed, saved on the hand-off for calibration (#172). Null for a plain tier. */
  auto?: AutoDecision | null;
  /** Set when the ticket is already known not to start, e.g. it is no longer next. */
  skip?: string;
}

/**
 * `queued` waits for a slot, `starting` is being handed off, `started` has a T3 Code thread.
 * `back-to-next` is a queued ticket the batch stopped before reaching.
 */
export type BatchItemStatus = 'queued' | 'starting' | 'started' | 'skipped' | 'failed' | 'back-to-next';

export interface BatchItem {
  ticketNumber: number;
  title: string;
  tier: Tier;
  model: ModelChoice | null;
  auto: AutoDecision | null;
  status: BatchItemStatus;
  handOffId: string | null;
  /** Why it was skipped or failed, or why it went back to next. */
  reason: string | null;
}

export interface UsageLimit {
  message: string;
  /** When the provider says the limit resets, in its own words ("4:00 PM"), or null. */
  resetsAt: string | null;
}

/** A provider instance a batch saw hit its usage limit, so Auto can steer clear of it for a while. */
export interface UsageLimitSeen {
  instanceId: string;
  at: string;
}

export type BatchStop = ({ kind: 'usage-limit'; ticketNumber: number } & UsageLimit) | { kind: 'user' };

export interface Batch {
  id: string;
  repo: string;
  mapNumber: number;
  /** Running hand-offs allowed on this machine while the batch drains. */
  cap: number;
  createdAt: string;
  /** `done` once nothing is queued or starting. `stopped` by the user or a usage limit. */
  status: 'running' | 'done' | 'stopped';
  stop: BatchStop | null;
  /** Started by a map's auto map rather than from the confirm list (#164). */
  auto: boolean;
  items: BatchItem[];
}

export type StartOutcome = { kind: 'started'; handOffId: string | null } | { kind: 'skipped'; reason: string } | { kind: 'failed'; reason: string };

export interface RunnerDeps {
  startTicket: (input: { repo: string; mapNumber: number; item: BatchRequestItem }) => Promise<StartOutcome>;
  /** Live hand-offs on this machine, across every repository and map. */
  running: () => Promise<number>;
  /** The last error of each given hand-off that has one. */
  lastErrors: (handOffIds: readonly string[]) => Promise<ReadonlyMap<string, string>>;
  /** Called once when a usage-limit error stops a batch. The batch is a copy. */
  onUsageStop?: (batch: Batch) => void;
  intervalMs?: number;
  /** How many finished batches to keep for the page to read. */
  keep?: number;
  now?: () => Date;
}

/** The first line of a provider's error and, when it says so, when the limit resets. */
export function parseUsageLimit(message: string): UsageLimit {
  const line = message.trim().split(/\r?\n/)[0] ?? '';
  const resets = /resets?\s+(?:at\s+|on\s+|in\s+)?(.+?)\s*(?:[.)]|$)/i.exec(line)?.[1] ?? null;
  return { message: line.slice(0, 200), resetsAt: resets === null ? null : resets.slice(0, 60) };
}

/**
 * Starts a batch of tickets without passing the machine's cap: as many as fit now, the rest queued
 * and started as slots free. The first usage-limit error stops the batch and sends what is still
 * queued back to next, because every later start would hit the same limit (#123).
 */
export class StartNextRunner {
  private readonly batches: Batch[] = [];
  private readonly limits: UsageLimitSeen[] = [];
  private readonly intervalMs: number;
  private readonly keep: number;
  private readonly now: () => Date;
  private timer: NodeJS.Timeout | null = null;
  private ticking: Promise<void> | null = null;
  private again = false;
  private closed = false;

  constructor(private readonly deps: RunnerDeps) {
    this.intervalMs = deps.intervalMs ?? 5_000;
    this.keep = deps.keep ?? 5;
    this.now = deps.now ?? (() => new Date());
  }

  /** Every batch, newest first. */
  snapshot(): Batch[] {
    return this.batches.map((batch) => structuredClone(batch)).reverse();
  }

  /** Usage limits the batches have hit since Wayfinder started, oldest first. */
  usageLimits(): UsageLimitSeen[] {
    return [...this.limits];
  }

  /** Tickets in `repo` that a running batch has queued or is starting. */
  pendingTickets(repo: string): Set<number> {
    const pending = new Set<number>();
    for (const batch of this.batches) {
      if (batch.status !== 'running' || batch.repo.toLowerCase() !== repo.toLowerCase()) continue;
      for (const item of batch.items) if (item.status === 'queued' || item.status === 'starting') pending.add(item.ticketNumber);
    }
    return pending;
  }

  /** Create a batch and start what fits right away. The returned batch is its state before any start finishes. */
  submit(input: { repo: string; mapNumber: number; cap: number; items: readonly BatchRequestItem[]; auto?: boolean }): Batch {
    const pending = this.pendingTickets(input.repo);
    const seen = new Set<number>();
    const items = input.items.map((item): BatchItem => {
      const duplicate = seen.has(item.ticketNumber);
      seen.add(item.ticketNumber);
      const skip = item.skip ?? (pending.has(item.ticketNumber) || duplicate ? 'Already in a running batch' : null);
      return {
        ticketNumber: item.ticketNumber,
        title: item.title,
        tier: item.tier,
        model: item.model,
        auto: item.auto ?? null,
        status: skip === null ? 'queued' : 'skipped',
        handOffId: null,
        reason: skip,
      };
    });
    const batch: Batch = {
      id: randomUUID(),
      repo: input.repo,
      mapNumber: input.mapNumber,
      cap: normalizeCap(input.cap),
      createdAt: this.now().toISOString(),
      status: items.some((item) => item.status === 'queued') ? 'running' : 'done',
      stop: null,
      auto: input.auto === true,
      items,
    };
    this.batches.push(batch);
    if (batch.status === 'running') {
      this.ensureTimer();
      void this.tick();
    } else {
      this.trim();
    }
    return structuredClone(batch);
  }

  /** Stop a running batch, sending its queued tickets back to next, or clear one that has ended. */
  stop(id: string): boolean {
    const index = this.batches.findIndex((batch) => batch.id === id);
    const batch = this.batches[index];
    if (batch === undefined) return false;
    if (batch.status !== 'running') {
      this.batches.splice(index, 1);
      return true;
    }
    this.backToNext(batch, 'Queue stopped');
    batch.status = 'stopped';
    batch.stop = { kind: 'user' };
    return true;
  }

  /** One pass over every running batch. Passes never overlap: a call during one runs again right after it. */
  tick(): Promise<void> {
    if (this.ticking !== null) {
      this.again = true;
      return this.ticking;
    }
    this.ticking = (async () => {
      do {
        this.again = false;
        for (const batch of this.batches) if (batch.status === 'running') await this.advance(batch);
      } while (this.again && !this.closed);
    })().finally(() => {
      this.ticking = null;
      this.trim();
      if (!this.batches.some((batch) => batch.status === 'running')) this.clearTimer();
    });
    return this.ticking;
  }

  close(): void {
    this.closed = true;
    this.clearTimer();
  }

  private async advance(batch: Batch): Promise<void> {
    const started = batch.items.filter((item) => item.status === 'started' && item.handOffId !== null);
    if (started.length > 0) {
      const errors = await this.deps.lastErrors(started.map((item) => item.handOffId ?? ''));
      for (const item of started) {
        const error = errors.get(item.handOffId ?? '');
        if (error !== undefined && isUsageLimitError(error)) {
          this.stopForUsageLimit(batch, item, parseUsageLimit(error));
          return;
        }
      }
    }

    if (batch.items.some((item) => item.status === 'queued')) {
      const free = batch.cap - (await this.deps.running());
      // The batch may have been stopped while the count was read.
      const next = batch.status === 'running' ? batch.items.filter((item) => item.status === 'queued').slice(0, Math.max(0, free)) : [];
      for (const item of next) item.status = 'starting';
      await Promise.all(next.map((item) => this.startOne(batch, item)));
    }

    if (batch.status === 'running' && !batch.items.some((item) => item.status === 'queued' || item.status === 'starting')) batch.status = 'done';
  }

  private async startOne(batch: Batch, item: BatchItem): Promise<void> {
    let outcome: StartOutcome;
    try {
      outcome = await this.deps.startTicket({
        repo: batch.repo,
        mapNumber: batch.mapNumber,
        item: { ticketNumber: item.ticketNumber, title: item.title, tier: item.tier, model: item.model, auto: item.auto },
      });
    } catch (error) {
      outcome = { kind: 'failed', reason: (error as Error).message };
    }
    // The queue may have been stopped while this start was in flight. The thread still exists.
    if (outcome.kind === 'started') {
      item.status = 'started';
      item.handOffId = outcome.handOffId;
      return;
    }
    item.status = outcome.kind === 'skipped' ? 'skipped' : 'failed';
    item.reason = outcome.reason;
    if (outcome.kind === 'failed' && isUsageLimitError(outcome.reason) && batch.status === 'running') {
      this.stopForUsageLimit(batch, item, parseUsageLimit(outcome.reason));
    }
  }

  private stopForUsageLimit(batch: Batch, item: BatchItem, limit: UsageLimit): void {
    if (item.model !== null) {
      this.limits.push({ instanceId: item.model.instanceId, at: this.now().toISOString() });
      this.limits.splice(0, Math.max(0, this.limits.length - MAX_LIMITS));
    }
    this.backToNext(batch, 'Went back to next when the batch stopped');
    batch.status = 'stopped';
    batch.stop = { kind: 'usage-limit', ticketNumber: item.ticketNumber, ...limit };
    this.deps.onUsageStop?.(structuredClone(batch));
  }

  private backToNext(batch: Batch, reason: string): void {
    for (const item of batch.items) {
      if (item.status !== 'queued') continue;
      item.status = 'back-to-next';
      item.reason = reason;
    }
  }

  private trim(): void {
    const ended = this.batches.filter((batch) => batch.status !== 'running');
    for (const batch of ended.slice(0, Math.max(0, ended.length - this.keep))) this.batches.splice(this.batches.indexOf(batch), 1);
  }

  private ensureTimer(): void {
    if (this.timer !== null || this.closed) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref();
  }

  private clearTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
