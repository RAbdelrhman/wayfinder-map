// @vitest-environment happy-dom
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { paintIcons } from './chrome.js';
import { ARROW, icon } from './icons.js';
import { setTrustedHtml } from './trustedHtml.js';

afterEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe('shared icon alignment', () => {
  it('centers hydrated icons without baseline space across shared controls', async () => {
    const style = document.createElement('style');
    style.textContent = await readFile(resolve('src/ui/styles.css'), 'utf8');
    document.head.append(style);
    setTrustedHtml(document.body, `<div class="viz-root">
      <span class="chip"><span data-icon="arrow"></span>next</span>
      <a class="chip needs-you-chip"><span data-icon="bell"></span>3 needs you</a>
      <span class="wf-vis-label"><span data-icon="lock"></span>Private</span>
      <label class="search"><span data-icon="lens"></span><input /></label>
      <button class="primary">Open<span data-icon="arrow"></span></button>
      <button class="wf-settled-toggle"><span data-icon="right"></span>Show settled</button>
      <button class="map-inbox-trigger"><span data-icon="bell"></span>Inbox</button>
      <a class="inline-icon">${icon(ARROW)}Ticket</a>
    </div>`);
    paintIcons();
    const placeholders = document.querySelectorAll<HTMLElement>('[data-icon]');
    expect(placeholders).toHaveLength(7);
    for (const placeholder of placeholders) {
      const computed = getComputedStyle(placeholder);
      expect(computed.display).toBe('inline-flex');
      expect(computed.alignItems).toBe('center');
      expect(computed.justifyContent).toBe('center');
      expect(computed.flexShrink).toBe('0');
      expect(placeholder.querySelector('svg.i')).not.toBeNull();
    }
    const direct = document.querySelector('.inline-icon .i');
    expect(direct).not.toBeNull();
    expect(getComputedStyle(direct!).verticalAlign).toBe('middle');
  });
});
