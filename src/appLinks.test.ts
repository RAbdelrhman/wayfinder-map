import { describe, expect, it } from 'vitest';
import { isOpenableLink, isT3ThreadLink, mapAppLink, parseMapAppLink } from './appLinks.js';

describe('installed app destinations', () => {
  it('round-trips a map without a machine-specific hostname or port', () => {
    const link = mapAppLink('RAbdelrhman/wayfinder-map', 217);
    expect(link).toBe('wayfinder://map?repo=RAbdelrhman%2Fwayfinder-map&number=217');
    expect(parseMapAppLink(link)).toEqual({ repo: 'RAbdelrhman/wayfinder-map', mapNumber: 217 });
    expect(isOpenableLink(link)).toBe(true);
  });

  it.each([
    'wayfinder://map?repo=o%2Fr&number=0',
    'wayfinder://map?repo=o%2Fr&number=-1',
    'wayfinder://map?repo=o%2Fr&number=1e2',
    'wayfinder://map?repo=o%2Fr&number=9007199254740992',
    'wayfinder://map?repo=o%2Fr&number=1&number=2',
    'wayfinder://map?repo=o%2Fr&repo=x%2Fy&number=1',
    'wayfinder://map?repo=..%2Fr&number=1',
    'wayfinder://map?repo=o%2Fr%2Fx&number=1',
    'wayfinder://map?repo=o%2Fr&number=1&url=https://evil.test',
    'wayfinder://map/path?repo=o%2Fr&number=1',
    'wayfinder://user@map?repo=o%2Fr&number=1',
    'wayfinder://map:42?repo=o%2Fr&number=1',
    'wayfinder://map?repo=o%2Fr&number=1#other',
    'wayfinder://settings',
    'https://map?repo=o%2Fr&number=1',
    'not a URL',
  ])('rejects ambiguous or non-map destination %s', (value) => {
    expect(parseMapAppLink(value)).toBeNull();
  });

  it.each(['o/r/x', '../r', 'o/..', ' o/r', 'o/r '])('does not generate an invalid repository link %s', (repo) => {
    expect(() => mapAppLink(repo, 1)).toThrow('Invalid map destination');
  });

  it('permits exact native T3 threads but no other native app commands', () => {
    expect(isT3ThreadLink('t3code://threads/env/thread%3A123')).toBe(true);
    for (const link of ['t3code://threads/env/', 't3code://threads/env/thread?command=run', 't3code://threads/env/%00', 't3code://threads/env/%ZZ', 't3code://settings', 'file:///C:/Windows/System32/calc.exe', 'javascript:alert(1)', 'data:text/html,hello']) {
      expect(isOpenableLink(link), link).toBe(false);
    }
  });
});
