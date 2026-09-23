import { describe, expect, it } from 'vitest';

import type { Prototype } from '../types.js';
import { previewUrl, prototypeTileHtml, verdictGist } from './prototypeTile.js';

const base: Prototype = {
  branch: 'prototype/8-home',
  ticketNumber: 8,
  mapNumber: 3,
  url: 'https://github.com/octo/one/tree/prototype/8-home',
  updatedAt: null,
  files: ['src/ui/prototype.html'],
  openable: [],
  preview: 'prototype-snapshot.html',
  verdict: null,
};

describe('verdictGist', () => {
  it('skips headings and rules to reach the first line of prose', () => {
    expect(verdictGist('## Decided spec\n\n### Flow\n\n- Home is `/`. Its default tab is **Recent**.')).toBe(
      'Home is /. Its default tab is Recent.',
    );
    expect(verdictGist('---\n\nPrototype kept on a branch.')).toBe('Prototype kept on a branch.');
  });

  it('falls back to a heading when that is all there is', () => {
    expect(verdictGist('## Approved')).toBe('Approved');
  });

  it('trims a long line', () => {
    expect(verdictGist('x'.repeat(400))).toHaveLength(161);
  });
});

describe('prototypeTileHtml', () => {
  it('shows the prototype running, sandboxed, and opens it full size', () => {
    const html = prototypeTileHtml('octo/one', base, { eyebrow: '#8', title: 'Home page' });
    const url = previewUrl('octo/one', base);
    expect(url).toBe('/proto/octo/one/prototype%2F8-home/prototype-snapshot.html');
    expect(html).toContain(`<iframe src="${url ?? ''}" sandbox="allow-scripts"`);
    expect(html).toContain(`href="${url ?? ''}" target="_blank"`);
  });

  it('says so plainly when nothing can be shown, instead of a broken frame', () => {
    const html = prototypeTileHtml('octo/one', { ...base, preview: null }, { eyebrow: '#8', title: 'Home page' });
    expect(html).not.toContain('<iframe');
    expect(html).toContain('No preview saved for this prototype');
  });

  it('gives an open prototype a status line rather than an empty verdict', () => {
    expect(prototypeTileHtml('octo/one', base, { eyebrow: '#8', title: 'Home page' })).toContain('Still being worked on.');
  });

  it('escapes what comes from GitHub', () => {
    const html = prototypeTileHtml('octo/one', { ...base, verdict: '<img src=x onerror=alert(1)>' }, { eyebrow: '#8', title: '<b>x</b>' });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>x</b>');
  });
});
