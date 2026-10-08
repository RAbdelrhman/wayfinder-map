export const REFRESH_INTERVAL_MS = 5_000;
export const MAX_RETRY_DELAY_MS = 5 * 60_000;

export interface AutoRefreshOptions {
  refresh: () => Promise<boolean>;
  isVisible: () => boolean;
  intervalMs?: number;
  now?: () => number;
  setTimer?: (callback: () => void, delay: number) => number;
  clearTimer?: (timer: number) => void;
}

/**
 * Refreshes only while the page is visible. The next timer is installed after a
 * request settles, so timers can never overlap. Failed background requests use
 * an exponential, bounded delay and leave it to the caller to retain its view.
 */
export class AutoRefresh {
  private readonly now: () => number;
  private readonly setTimer: (callback: () => void, delay: number) => number;
  private readonly clearTimer: (timer: number) => void;
  private readonly intervalMs: number;
  private timer: number | null = null;
  private running: Promise<void> | null = null;
  private lastSuccessfulSnapshot: number | null = null;
  private nextDelay: number;
  private stopped = true;

  constructor(private readonly options: AutoRefreshOptions) {
    this.intervalMs = options.intervalMs ?? REFRESH_INTERVAL_MS;
    if (!Number.isFinite(this.intervalMs) || this.intervalMs <= 0 || this.intervalMs > MAX_RETRY_DELAY_MS) throw new Error('Invalid automatic refresh interval.');
    this.nextDelay = this.intervalMs;
    this.now = options.now ?? Date.now;
    this.setTimer = options.setTimer ?? ((callback, delay) => window.setTimeout(callback, delay));
    this.clearTimer = options.clearTimer ?? ((timer) => window.clearTimeout(timer));
  }

  markSuccessfulSnapshot(): void {
    this.lastSuccessfulSnapshot = this.now();
    this.nextDelay = this.intervalMs;
  }

  start(): void {
    this.stopped = false;
    this.visibilityChanged();
  }

  visibilityChanged(checkNow = false): void {
    if (this.stopped) return;
    if (!this.options.isVisible()) {
      this.cancelTimer();
      return;
    }

    const age = this.lastSuccessfulSnapshot === null ? Infinity : this.now() - this.lastSuccessfulSnapshot;
    if (checkNow || age >= this.intervalMs) {
      this.cancelTimer();
      void this.refresh();
      return;
    }
    this.schedule(this.intervalMs - age);
  }

  stop(): void {
    this.stopped = true;
    this.cancelTimer();
  }

  private schedule(delay: number): void {
    this.cancelTimer();
    this.timer = this.setTimer(() => {
      this.timer = null;
      void this.refresh();
    }, delay);
  }

  private cancelTimer(): void {
    if (this.timer === null) return;
    this.clearTimer(this.timer);
    this.timer = null;
  }

  private refresh(): Promise<void> {
    if (this.stopped || !this.options.isVisible()) return Promise.resolve();
    if (this.running !== null) return this.running;
    this.running = this.options
      .refresh()
      .then((successful) => {
        if (successful) this.markSuccessfulSnapshot();
        else this.nextDelay = Math.min(this.nextDelay * 2, MAX_RETRY_DELAY_MS);
      })
      .catch(() => {
        this.nextDelay = Math.min(this.nextDelay * 2, MAX_RETRY_DELAY_MS);
      })
      .finally(() => {
        this.running = null;
        if (this.stopped || !this.options.isVisible()) return;
        this.schedule(this.nextDelay);
      });
    return this.running;
  }
}
