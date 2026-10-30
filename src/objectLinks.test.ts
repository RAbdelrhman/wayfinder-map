import { describe, expect, it } from 'vitest';
import { objectAppLink, objectWebPath, parseObjectAppLink, parseObjectWebPath } from './objectLinks.js';

describe('Wayfinder object destinations', () => {
  it.each(['repo', 'map', 'ticket'] as const)('round trips the opaque %s ID on desktop and web', kind => {
    const target = { kind, id: 'opaque/id%:with+spelling=' };
    const url = objectAppLink(target);
    expect(parseObjectAppLink(url)).toEqual(target);
    expect(parseObjectWebPath(objectWebPath(target))).toEqual(target);
    expect(url).not.toMatch(/localhost|127\.0\.0\.1/);
  });

  it('defaults to the newest prototype and can identify a fixed revision, page and frame', () => {
    const latest = { kind: 'prototype', id: 'ticket-node-id', canvas: 'prototypes/replies/index.html' } as const;
    expect(parseObjectAppLink(objectAppLink(latest))).toEqual(latest);
    const revision = { ...latest, revision: 'a'.repeat(40), page: 'Reply page', item: 'R2-confirm' };
    // Authored page IDs must not contain spaces; display names stay separate.
    expect(() => objectAppLink(revision)).toThrow();
    expect(parseObjectAppLink(objectAppLink({ ...revision, page: 'reply-page' }))).toEqual({ ...revision, page: 'reply-page' });
  });

  it.each([
    'wayfinder://settings/id',
    'wayfinder://map/id?command=run',
    'wayfinder://map/id/other',
    'wayfinder://map/%00',
    'wayfinder://map/%ZZ',
    'wayfinder://user@map/id',
    'wayfinder://map:42/id',
    'wayfinder://map/id#other',
    'wayfinder://prototype/id?canvas=../secret.html',
    'wayfinder://prototype/id?canvas=prototypes/../../secret.html',
    'wayfinder://prototype/id?canvas=prototypes/%252e%252e/secret.html',
    'wayfinder://prototype/id?canvas=https://evil.test/index.html',
    'wayfinder://prototype/id?canvas=prototypes/a/index.html&canvas=prototypes/b/index.html',
    'wayfinder://prototype/id?canvas=prototypes/a/index.html&rev=main',
  ])('rejects ambiguous or executable destination %s', value => {
    expect(parseObjectAppLink(value)).toBeNull();
  });
});
