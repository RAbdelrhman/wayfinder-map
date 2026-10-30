import { describe, expect, it } from 'vitest';
import { mobileDestination } from './destination';
import { redirectSystemPath } from '../app/+native-intent';

describe('phone destination links', () => {
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
