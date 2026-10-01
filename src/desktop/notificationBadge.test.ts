import { describe, expect, it } from 'vitest';

import { notificationBadgePng } from './notificationBadge.js';

describe('notificationBadgePng', () => {
  it('builds a valid-sized PNG tray badge with the unread count in its mark', () => {
    const one = notificationBadgePng(1);
    const five = notificationBadgePng(5);

    expect(one.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(one.readUInt32BE(16)).toBe(32);
    expect(one.readUInt32BE(20)).toBe(32);
    expect(five).not.toEqual(one);
  });
});
