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
  it('polls visible pages every 30 seconds and never overlaps requests', async () => {
    let visible = true;
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

    refresh.start();
    for (let index = 0; index < 5; index += 1) {
      const timer = [...timers.values()][0];
      timers.clear();
      timer?.callback();
      await settle();
    }

    expect([...timers.values()][0]?.delay).toBe(MAX_RETRY_DELAY_MS);
    visible = false;
  });
});
