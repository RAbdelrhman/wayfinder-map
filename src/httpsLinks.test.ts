import { describe, expect, it } from 'vitest';
import { objectHttpsLink, parseHttpsObjectLink, WAYFINDER_LINK_ORIGIN } from './httpsLinks.js';
import { wayfinderOpenPath } from './appLinks.js';

describe('public HTTPS destinations', () => {
  it.each(['repo', 'map', 'ticket'] as const)('round-trips an opaque %s ID into the existing app route', kind => {
    const target = { kind, id: 'opaque:ID/part' };
    const link = objectHttpsLink(target);
    expect(link).toBe(`${WAYFINDER_LINK_ORIGIN}/open/${kind}/opaque%3AID%2Fpart`);
    expect(parseHttpsObjectLink(link)).toEqual(target);
    expect(wayfinderOpenPath(link)).toBe(`/open/${kind}/opaque%3AID%2Fpart`);
  });

  it('preserves newest and exact revision/page/item destinations', () => {
    const target = { kind: 'prototype', id: 'ticket-id', canvas: 'prototypes/replies/index.html', page: 'r1', item: 'R1-compose' } as const;
    expect(parseHttpsObjectLink(objectHttpsLink(target))).toEqual(target);
    const pinned = { ...target, revision: 'a'.repeat(40) };
    expect(parseHttpsObjectLink(objectHttpsLink(pinned))).toEqual(pinned);
  });

  it.each([
    'http://wayfinder-links-pearl.vercel.app/open/map/id',
    'https://evil.test/open/map/id',
    'https://wayfinder-links-pearl.vercel.app.evil.test/open/map/id',
    'https://user@wayfinder-links-pearl.vercel.app/open/map/id',
    `${WAYFINDER_LINK_ORIGIN}:444/open/map/id`,
    `${WAYFINDER_LINK_ORIGIN}/open/map/id#other`,
    `${WAYFINDER_LINK_ORIGIN}/open/map/id?url=https://evil.test`,
    `${WAYFINDER_LINK_ORIGIN}/open/settings/id`,
    `${WAYFINDER_LINK_ORIGIN}/open/map/id/other`,
    `${WAYFINDER_LINK_ORIGIN}/open/prototype/id?canvas=prototypes/../../secret.html`,
    `${WAYFINDER_LINK_ORIGIN}/open/prototype/id?canvas=prototypes/a/index.html&rev=main`,
    `${WAYFINDER_LINK_ORIGIN}/open/prototype/id?canvas=prototypes/a/index.html&canvas=prototypes/b/index.html`,
  ])('rejects untrusted or ambiguous destinations: %s', value => {
    expect(parseHttpsObjectLink(value)).toBeNull();
    expect(wayfinderOpenPath(value)).toBeNull();
  });
});
