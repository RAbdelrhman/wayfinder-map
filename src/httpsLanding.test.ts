// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableCSSFileLoading":true,"disableJavaScriptFileLoading":true,"handleDisabledFileLoadingAsSuccess":true}}
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderHttpsLanding } from './httpsLanding.js';
import { objectHttpsLink, WAYFINDER_LINK_ORIGIN } from './httpsLinks.js';
import { objectAppLink } from './objectLinks.js';

function page() {
  return new DOMParser().parseFromString(readFileSync('link-host/index.html', 'utf8'), 'text/html');
}

describe('approved A HTTPS landing page', () => {
  it('renders the explicit native launch link and preserves the pinned canvas address', () => {
    const document = page();
    const link = { kind: 'prototype', id: 'node', canvas: 'prototypes/replies/index.html', revision: 'a'.repeat(40), page: 'r1', item: 'compose' } as const;
    renderHttpsLanding(document, objectHttpsLink(link));
    expect(document.querySelector('h1')?.textContent).toBe('Open this prototype in Wayfinder');
    expect(document.getElementById('destination-context')?.textContent).toBe('Version aaaaaaa · page r1 · compose');
    const open = document.getElementById('open-wayfinder')!;
    expect(open.hidden).toBe(false);
    expect(open.getAttribute('href')).toBe(objectAppLink(link));
    expect(document.getElementById('destination-fallback')?.hidden).toBe(false);
    expect(document.querySelector('meta[http-equiv="refresh"]')).toBeNull();
  });

  it('shows newest by default and treats authored page/item names as text', () => {
    const document = page();
    renderHttpsLanding(document, objectHttpsLink({ kind: 'prototype', id: 'node', canvas: 'prototypes/replies/index.html', page: '<img/src=x>', item: '<svg/onload=alert(1)>' }));
    expect(document.getElementById('destination-context')?.textContent).toContain('Newest version · page <img/src=x> · <svg/onload=alert(1)>');
    expect(document.querySelector('[onload]')).toBeNull();
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });

  it.each([
    'https://evil.test/open/map/node',
    `${WAYFINDER_LINK_ORIGIN}/open/settings/node`,
    `${WAYFINDER_LINK_ORIGIN}/open/map/node?url=https://evil.test`,
    `${WAYFINDER_LINK_ORIGIN}/open/prototype/node`,
  ])('leaves no launch action for invalid link %s, including after a valid render', url => {
    const document = page();
    renderHttpsLanding(document, objectHttpsLink({ kind: 'map', id: 'node' }));
    renderHttpsLanding(document, url);
    expect(document.querySelector('h1')?.textContent).toBe('This link can’t be opened');
    expect(document.getElementById('open-wayfinder')?.hidden).toBe(true);
    expect(document.getElementById('open-wayfinder')?.hasAttribute('href')).toBe(false);
    expect(document.getElementById('destination-fallback')?.hidden).toBe(true);
  });
});
