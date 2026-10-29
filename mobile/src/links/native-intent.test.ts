import { describe, expect, it } from 'vitest';
import { redirectSystemPath } from '../app/+native-intent';

describe('incoming map links', () => {
  it.each([true, false])('opens the same map when initial=%s', (initial) => {
    expect(redirectSystemPath({ path: 'wayfinder://map?repo=owner%2Frepo&number=217', initial })).toBe('/map?repo=owner%2Frepo&number=217');
  });
  it('does not crash on invalid OS input or open arbitrary routes', () => {
    for (const path of ['wayfinder://map?repo=owner%2Frepo&number=0', 'wayfinder://map?repo=o%2Fr&number=1&number=2', 'wayfinder://settings', 'wayfinder:%%%']) {
      expect(redirectSystemPath({ path, initial: true })).toBe('/');
    }
    expect(redirectSystemPath({ path: '/settings', initial: false })).toBe('/settings');
  });
});
