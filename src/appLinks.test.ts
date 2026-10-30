import { describe, expect, it } from 'vitest';
import { isOpenableLink, isT3ThreadLink, mapAppLink, nativeThreadLink, parseMapAppLink, wayfinderOpenPath } from './appLinks.js';

describe('installed app destinations', () => {
  it('routes global IDs through the local resolver on cold and warm opens', () => {
    for (const kind of ['repo', 'map', 'ticket']) {
      const link = `wayfinder://${kind}/opaque-ID`;
      expect(wayfinderOpenPath(link)).toBe(`/open/${kind}/opaque-ID`);
      expect(isOpenableLink(link)).toBe(true);
    }
    const link = 'wayfinder://prototype/node?canvas=prototypes%2Freplies%2Findex.html&rev=' + 'a'.repeat(40);
    expect(wayfinderOpenPath(link)).toBe(link.replace('wayfinder://', '/open/'));
    expect(wayfinderOpenPath('wayfinder://ticket/node?command=run')).toBeNull();
  });
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
  it('opens T3-supplied scoped references in the native app without inventing an environment', () => {
    expect(nativeThreadLink('t3-thread://v2/env-1/thread%3A123')).toBe('t3code://threads/env-1/thread%253A123');
    expect(nativeThreadLink('t3-thread://v2/env-1/thread:123')).toBe('t3code://threads/env-1/thread%3A123');
    expect(isOpenableLink('t3-thread://v2/env-1/thread%3A123')).toBe(true);
    expect(nativeThreadLink('t3-thread://v1/thread-only')).toBeNull();
  });
});
