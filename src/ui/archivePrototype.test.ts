import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { setTrustedHtml } from './trustedHtml.js';

function preview(option: 'a' | 'b'): Window {
  const window = new Window({ settings: { enableJavaScriptEvaluation: true } });
  const variants = '../../prototypes/288-prototype-the-archive-controls-and-the-archived-maps-view/variants/';
  const html = readFileSync(new URL(`${variants}${option}.html`, import.meta.url), 'utf8');
  setTrustedHtml(window.document.body, html.replace(/<script[^>]*>[\s\S]*?<\/script>/g, ''));
  window.document.body.dataset.option = option.toUpperCase();
  window.eval('window.Kit = { esc: (text) => String(text), toast: () => {} };');
  window.eval(readFileSync(new URL(`${variants}archive.js`, import.meta.url), 'utf8'));
  return window;
}

describe.each(['a', 'b'] as const)('Archive option %s', (option) => {
  it('archives, opens without restoring, and restores a finished map', () => {
    const window = preview(option);
    const document = window.document;
    const click = (selector: string): void => {
      const button = document.querySelector(selector);
      expect(button).not.toBeNull();
      (button as unknown as { click(): void }).click();
    };
    click('main [data-action="archive-map"][data-number="236"]');
    expect(document.querySelector('main [data-number="236"]')).toBeNull();
    click('main [data-action="archive"]');
    for (const reason of ['Closed', 'Finished', 'Idle 30 days', 'Archived by you']) {
      expect(document.querySelector('main')?.textContent).toContain(reason);
    }
    click('[data-action="open"][data-number="208"]');
    expect(document.querySelector('.notice')?.textContent).toContain('Opening this map keeps it archived');
    click('[data-action="back"]');
    expect(document.querySelector('[data-action="restore"][data-number="208"]')).not.toBeNull();
    click('[data-action="restore"][data-number="208"]');
    click('[data-action="active"]');
    expect(document.querySelector('[data-action="archive-map"][data-number="208"]')).not.toBeNull();
    void window.happyDOM.abort();
  });

  it('keeps a map in its list when saving the archive preference fails', () => {
    const window = preview(option);
    const document = window.document;
    const select = document.getElementById('fixture') as unknown as { value: string; dispatchEvent(event: Event): void };
    select.value = 'save-error';
    select.dispatchEvent(new window.Event('change') as unknown as Event);
    const archive = document.querySelector('[data-action="archive-map"][data-number="236"]');
    (archive as unknown as { click(): void }).click();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("This map hasn't moved");
    expect(document.querySelector('[data-action="archive-map"][data-number="236"]')).not.toBeNull();
    void window.happyDOM.abort();
  });
});
