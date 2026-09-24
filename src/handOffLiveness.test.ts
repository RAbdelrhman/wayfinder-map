import { describe, expect, it } from 'vitest';

import { isLiveHandOff } from './handOffLiveness.js';
import type { HandOffStatus } from './handOffTracking.js';

describe('isLiveHandOff', () => {
  it.each<[HandOffStatus, boolean]>([
    ['starting', true],
    ['running', true],
    ['waiting', true],
    ['ready', true],
    ['finished', false],
    ['failed', false],
    ['interrupted', false],
  ])('treats a %s thread as live: %s', (status, live) => {
    expect(isLiveHandOff({ threadId: 'thread', status })).toBe(live);
  });

  it('never counts a hand-off without a thread', () => {
    expect(isLiveHandOff({ threadId: null, status: 'untracked' })).toBe(false);
    expect(isLiveHandOff({ threadId: null, status: 'running' })).toBe(false);
  });
});
