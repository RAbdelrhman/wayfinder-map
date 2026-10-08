import { describe, expect, it } from 'vitest';

import { AutoRefresh, MAX_RETRY_DELAY_MS, REFRESH_INTERVAL_MS } from './autoRefresh.js';

interface Timer {
  callback: () => void;
  delay: number;
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('AutoRefresh', () => {
  it('keeps a separate draft cadence through return checks, failures and recovery', async () => {
    let now = 0;
    let successful = false;
    const timers = new Map<number, Timer>();
    const refresh = new AutoRefresh({
      intervalMs: 30_000,
      refresh: async () => successful,
      isVisible: () => true,
      now: () => now,
      setTimer: (callback, delay) => { timers.set(1, { callback, delay }); return 1; },
      clearTimer: (id) => timers.delete(id),
    });
    refresh.markSuccessfulSnapshot();
    refresh.start();
    expect(timers.get(1)?.delay).toBe(30_000);
    now = 5_000;
    refresh.visibilityChanged();
    expect(timers.get(1)?.delay).toBe(25_000);
    refresh.visibilityChanged(true);
    await settle();
    expect(timers.get(1)?.delay).toBe(60_000);
    successful = true;
    refresh.visibilityChanged(true);
    await settle();
    expect(timers.get(1)?.delay).toBe(30_000);
    refresh.stop();
  });

  it('polls visible pages every five seconds and never overlaps requests', async () => {
    const visible = true;
    let now = 0;
    const timers = new Map<number, Timer>();
    let nextTimer = 0;
    const first = deferred<boolean>();
    let calls = 0;
    const refresh = new AutoRefresh({
      refresh: () => {
        calls += 1;
        return calls === 1 ? first.promise : Promise.resolve(true);
      },
      isVisible: () => visible,
      now: () => now,
      setTimer: (callback, delay) => {
        const id = nextTimer++;
        timers.set(id, { callback, delay });
        return id;
      },
      clearTimer: (id) => timers.delete(id),
    });

    refresh.markSuccessfulSnapshot();
    refresh.start();
    expect([...timers.values()].map((timer) => timer.delay)).toEqual([REFRESH_INTERVAL_MS]);

    const firstTimer = [...timers.entries()][0];
    if (firstTimer !== undefined) {
      timers.delete(firstTimer[0]);
      firstTimer[1].callback();
    }
    refresh.visibilityChanged();
    expect(calls).toBe(1);

    now = REFRESH_INTERVAL_MS;
    first.resolve(true);
    await settle();
    expect([...timers.values()].map((timer) => timer.delay)).toEqual([REFRESH_INTERVAL_MS]);
  });

  it('pauses while hidden and refreshes once on a stale return', async () => {
    let visible = true;
    let now = 0;
    const timers = new Map<number, Timer>();
    let calls = 0;
    const refresh = new AutoRefresh({
      refresh: async () => {
        calls += 1;
        return true;
      },
      isVisible: () => visible,
      now: () => now,
      setTimer: (callback, delay) => {
        timers.set(1, { callback, delay });
        return 1;
      },
      clearTimer: (id) => timers.delete(id),
    });

    refresh.markSuccessfulSnapshot();
    refresh.start();
    visible = false;
    refresh.visibilityChanged();
    expect(timers.size).toBe(0);

    now = REFRESH_INTERVAL_MS;
    visible = true;
    refresh.visibilityChanged();
    await settle();
    expect(calls).toBe(1);
  });

  it('backs off failed refreshes without exceeding five minutes', async () => {
    let visible = true;
    const timers = new Map<number, Timer>();
    let nextTimer = 0;
    const refresh = new AutoRefresh({
      refresh: async () => false,
      isVisible: () => visible,
      setTimer: (callback, delay) => {
        const id = nextTimer++;
        timers.set(id, { callback, delay });
        return id;
      },
      clearTimer: (id) => timers.delete(id),
    });

    refresh.markSuccessfulSnapshot();
    refresh.start();
    for (let index = 0; index < 8; index += 1) {
      const timer = [...timers.values()][0];
      timers.clear();
      timer?.callback();
      await settle();
    }

    expect([...timers.values()][0]?.delay).toBe(MAX_RETRY_DELAY_MS);
    visible = false;
  });

  it('stays stopped when an in-flight read finishes and resumes with a stale check', async () => {
    let now = 0;
    const timers = new Map<number, Timer>();
    const read = deferred<boolean>();
    let calls = 0;
    const refresh = new AutoRefresh({
      refresh: () => { calls += 1; return calls === 1 ? read.promise : Promise.resolve(true); },
      isVisible: () => true,
      now: () => now,
      setTimer: (callback, delay) => { timers.set(1, { callback, delay }); return 1; },
      clearTimer: (id) => timers.delete(id),
    });
    refresh.markSuccessfulSnapshot();
    refresh.start();
    const timer = timers.get(1);
    timers.clear();
    timer?.callback();
    refresh.stop();
    refresh.visibilityChanged();
    read.resolve(true);
    await settle();
    expect(timers.size).toBe(0);
    expect(calls).toBe(1);
    now = REFRESH_INTERVAL_MS;
    refresh.start();
    await settle();
    expect(calls).toBe(2);
    expect(timers.get(1)?.delay).toBe(REFRESH_INTERVAL_MS);
  });

  it('does not read if the page becomes hidden before its timer fires', async () => {
    let visible = true;
    let timer: (() => void) | undefined;
    let calls = 0;
    const refresh = new AutoRefresh({
      refresh: async () => { calls += 1; return true; },
      isVisible: () => visible,
      setTimer: (callback) => { timer = callback; return 1; },
      clearTimer: () => undefined,
    });
    refresh.markSuccessfulSnapshot();
    refresh.start();
    visible = false;
    timer?.();
    await settle();
    expect(calls).toBe(0);
  });

  it('checks immediately on return even when the last successful read is recent', async () => {
    let calls = 0;
    const read = deferred<boolean>();
    const refresh = new AutoRefresh({
      refresh: () => { calls += 1; return read.promise; },
      isVisible: () => true,
      now: () => 0,
      setTimer: () => 1,
      clearTimer: () => undefined,
    });
    refresh.markSuccessfulSnapshot();
    refresh.start();
    refresh.visibilityChanged(true);
    refresh.visibilityChanged(true);
    expect(calls).toBe(1);
    read.resolve(true);
    await settle();
    refresh.stop();
  });
});
