import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { nextTabIndex, tabAttrs, tabPanelAttrs } from './tabs.js';

describe('tabAttrs', () => {
  it('ties a tab to its panel and keeps only the selected tab in the Tab order', () => {
    expect(tabAttrs('t-brief', 'p', true)).toBe('role="tab" id="t-brief" aria-selected="true" aria-controls="p" tabindex="0"');
    expect(tabAttrs('t-ticket', 'p', false)).toBe('role="tab" id="t-ticket" aria-selected="false" aria-controls="p" tabindex="-1"');
    expect(tabPanelAttrs('p', 't-brief')).toBe('role="tabpanel" id="p" aria-labelledby="t-brief"');
  });
});

describe('nextTabIndex', () => {
  it('moves with the arrows, wraps at the ends and jumps with Home and End', () => {
    expect(nextTabIndex('ArrowRight', 0, 3)).toBe(1);
    expect(nextTabIndex('ArrowRight', 2, 3)).toBe(0);
    expect(nextTabIndex('ArrowLeft', 0, 3)).toBe(2);
    expect(nextTabIndex('ArrowDown', 1, 3)).toBe(2);
    expect(nextTabIndex('ArrowUp', 1, 3)).toBe(0);
    expect(nextTabIndex('Home', 2, 3)).toBe(0);
    expect(nextTabIndex('End', 0, 3)).toBe(2);
  });

  it('ignores other keys and empty tablists', () => {
    expect(nextTabIndex('Enter', 0, 3)).toBeNull();
    expect(nextTabIndex('ArrowRight', 0, 0)).toBeNull();
  });
});

describe('map page markup', () => {
  it('names the table view as a focusable region so it can be scrolled from the keyboard', async () => {
    const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
    expect(html).toMatch(/<div class="tablewrap" id="tablewrap" role="region" aria-label="Tickets" tabindex="0" hidden><\/div>/);
  });

  it('builds every tablist in the inspector from tabAttrs', async () => {
    const source = await readFile(new URL('./app.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/<button[^>]*role="tab"/);
    expect(source.match(/role="tablist" aria-label=/g)?.length).toBe(2);
    expect(source.match(/tabPanelAttrs\(/g)?.length).toBe(2);
  });
});
