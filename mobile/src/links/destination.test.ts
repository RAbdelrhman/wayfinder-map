import { describe, expect, it } from 'vitest';
import { mobileDestination } from './destination';
import { redirectSystemPath } from '../app/+native-intent';
import { objectHttpsLink, WAYFINDER_LINK_ORIGIN } from '../../../src/httpsLinks';

describe('phone destination links', () => {
  it('opens verified HTTPS links on cold and warm starts and rejects untrusted hosts', () => {
    const link = { kind: 'prototype', id: 'node', canvas: 'prototypes/replies/index.html', revision: 'a'.repeat(40), page: 'r1', item: 'confirm' } as const;
    for (const initial of [true, false]) {
      const result = redirectSystemPath({ path: objectHttpsLink(link), initial });
      expect(result).toContain('/open/prototype/node?canvas=');
      expect(result).toContain(`&rev=${link.revision}&page=r1&item=confirm`);
      expect(redirectSystemPath({ path: 'https://evil.test/open/map/node', initial })).toBe('/');
      expect(redirectSystemPath({ path: `${WAYFINDER_LINK_ORIGIN}/open/map/node?command=run`, initial })).toBe('/');
    }
  });
  it('keeps object identity and the exact prototype address on native open', () => {
    const path = 'wayfinder://prototype/node?canvas=prototypes%2Freplies%2Findex.html&rev=' + 'a'.repeat(40) + '&page=r1&item=confirm';
    expect(redirectSystemPath({ path, initial: true })).toBe(path.replace('wayfinder://', '/open/'));
    expect(redirectSystemPath({ path, initial: false })).toBe(path.replace('wayfinder://', '/open/'));
    expect(redirectSystemPath({ path: 'wayfinder://ticket/node?command=run', initial: true })).toBe('/');
  });
  it('opens the current repository and owning map, with newest the default', () => {
    const target = { kind: 'prototype', id: 'node', repo: 'new/name', mapNumber: 217, ticketNumber: 366 } as const;
    const link = { kind: 'prototype', id: 'node', canvas: 'prototypes/replies/index.html' } as const;
    expect(mobileDestination(link, target)).toEqual({ pathname: '/canvas', params: { repo: 'new/name', mapNumber: '217', number: '366', board: link.canvas } });
    expect(mobileDestination({ ...link, revision: 'b'.repeat(40), page: 'r1', item: 'confirm' }, target).params)
      .toMatchObject({ rev: 'b'.repeat(40), page: 'r1', item: 'confirm' });
    expect(mobileDestination({ kind: 'repo', id: 'repo' }, { kind: 'repo', id: 'repo', repo: 'new/name' }))
      .toEqual({ pathname: '/', params: { repo: 'new/name' } });
  });
});
