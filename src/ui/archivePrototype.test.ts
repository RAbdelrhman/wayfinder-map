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

/** Round 2 options load the real canvas kit and the shared fixtures; saves complete at once. */
function roundTwo(option: 'c' | 'd' | 'e' | 'f' | 'g', extraClosedMap = false): { window: Window; click: (selector: string) => void; text: (selector: string) => string; fixture: (value: string) => void } {
  const window = new Window({ settings: { enableJavaScriptEvaluation: true } });
  const variants = '../../prototypes/288-prototype-the-archive-controls-and-the-archived-maps-view/variants/';
  const html = readFileSync(new URL(`${variants}${option}.html`, import.meta.url), 'utf8');
  setTrustedHtml(window.document.body, html.replace(/<script[^>]*>[\s\S]*?<\/script>/g, ''));
  window.eval('window.R2_SAVE_DELAY = 0;');
  window.eval(readFileSync(new URL('../../prototypes/canvas/kit/kit.js', import.meta.url), 'utf8'));
  window.eval(readFileSync(new URL(`${variants}r2-shared.js`, import.meta.url), 'utf8'));
  if (extraClosedMap) {
    window.eval(`(() => {
      const original = R2.fresh;
      R2.fresh = () => {
        const maps = original();
        const closed = maps.find((map) => map.number === 121);
        maps.push({ ...closed, number: 122, title: 'Another closed map', archive: { ...closed.archive } });
        return maps;
      };
    })();`);
  }
  window.eval(readFileSync(new URL(`${variants}${option}.js`, import.meta.url), 'utf8'));
  const document = window.document;
  return {
    window,
    click: (selector) => {
      const element = document.querySelector(selector);
      expect(element, selector).not.toBeNull();
      (element as unknown as { click(): void }).click();
    },
    text: (selector) => document.querySelector(selector)?.textContent ?? '',
    fixture: (value) => {
      const select = document.getElementById('fixture') as unknown as { value: string; dispatchEvent(event: Event): void };
      select.value = value;
      select.dispatchEvent(new window.Event('change') as unknown as Event);
    },
  };
}

const REASONS = ['Archived by you', 'Closed', 'Finished', 'Idle 30 days'];

describe('Archive option G: active maps use the same layout', () => {
  it.each(['.r2f-identity', '.r2g-destination', '.r2g-progress', ''])('selects an active map from %s without opening', (part) => {
    const { window, click, text } = roundTwo('g');
    click(`#r2g-opt-236${part ? ` ${part}` : ''}`);
    expect(window.document.querySelector('#r2g-opt-236')?.getAttribute('aria-selected')).toBe('true');
    expect(text('#r2d-detail-title')).toBe('Help new users understand Wayfinder');
    expect(window.document.querySelector('.r2d-mapwrap')).toBeNull();
    expect(window.document.querySelectorAll('.r2d-detail [data-open]')).toHaveLength(1);
    expect(window.document.querySelector('.r2e-preview [data-archive]')).toBeNull();
    expect(window.document.querySelector('.r2d-detail [data-archive="236"]')).not.toBeNull();
    void window.happyDOM.abort();
  });

  it('filters to a valid selection and removes the preview when no maps match', () => {
    const { window, click, text } = roundTwo('g');
    click('#r2g-opt-236');
    const filter = (value: string): void => {
      const input = window.document.getElementById('r2-search') as unknown as { value: string; dispatchEvent(event: Event): void };
      input.value = value;
      input.dispatchEvent(new window.Event('input', { bubbles: true }) as unknown as Event);
    };
    filter('Review canvas');
    expect(window.document.querySelector('#r2g-opt-210')?.getAttribute('aria-selected')).toBe('true');
    expect(text('#r2d-detail-title')).toBe('Review canvas options together');
    filter('no-such-map');
    expect(window.document.querySelector('.r2d-detail')).toBeNull();
    expect(text('[role="status"]')).toContain('No active maps match');
    filter('');
    expect(window.document.querySelector('[role="option"][aria-selected="true"]')).not.toBeNull();
    void window.happyDOM.abort();
  });

  it('opens the selected active map without changing its archive state', () => {
    const { window, click, text } = roundTwo('g');
    click('#r2g-opt-236');
    click('.r2e-preview');
    expect(text('h1')).toContain('Map #236: Help new users understand Wayfinder');
    expect(window.document.querySelector('.r2d-float')).toBeNull();
    click('[data-view="active"]');
    expect(window.document.querySelector('#r2g-opt-236')).not.toBeNull();
    void window.happyDOM.abort();
  });

  it('archives the selected active map, opens it without restoring, and restores it to the active list', () => {
    const { window, click, text } = roundTwo('g');
    click('#r2g-opt-236');
    click('.r2d-detail [data-archive="236"]');
    expect(window.document.querySelector('#r2g-opt-236')).toBeNull();
    expect(window.document.querySelector('#r2g-opt-210')?.getAttribute('aria-selected')).toBe('true');
    expect(window.document.querySelector('.r2d-mapwrap')).toBeNull();
    click('.r2d-door');
    click('#r2d-opt-236 .r2f-explanation');
    for (const reason of REASONS) expect(text('.r2d-listbox')).toContain(reason);
    click('.r2e-preview');
    expect(text('.r2d-float')).toContain('Opening it keeps it archived');
    click('.r2d-float [data-view="archived"]');
    click('.r2d-detail [data-restore="236"]');
    expect(window.document.querySelector('#r2d-opt-236')).toBeNull();
    click('[data-view="active"]');
    expect(window.document.querySelector('#r2g-opt-236')).not.toBeNull();
    void window.happyDOM.abort();
  });

  it('clears the preview when every active map has been archived', () => {
    const { window, click, text } = roundTwo('g');
    for (const number of [251, 236, 210]) {
      click(`#r2g-opt-${number}`);
      click(`.r2d-detail [data-archive="${number}"]`);
    }
    expect(window.document.querySelector('.r2d-detail')).toBeNull();
    expect(text('[role="status"]')).toContain('Every map here is archived');
    expect(window.document.querySelector('.r2d-door')).not.toBeNull();
    void window.happyDOM.abort();
  });

  it('keeps the selected active map in place after a failed archive and retries it', () => {
    const { window, click, text, fixture } = roundTwo('g');
    fixture('save-error');
    click('#r2g-opt-236');
    click('.r2d-detail [data-archive="236"]');
    expect(text('[role="alert"]')).toContain("It's still in your active maps");
    expect(window.document.querySelector('#r2g-opt-236')?.getAttribute('aria-selected')).toBe('true');
    click('[data-retry]');
    expect(window.document.querySelector('#r2g-opt-236')).toBeNull();
    void window.happyDOM.abort();
  });
});

describe('Archive option F: select the whole map block', () => {
  it.each(['.r2f-reason', '.r2f-explanation', '.r2f-identity', ''])('selects from %s without opening or restoring', (part) => {
    const { window, click, text } = roundTwo('f');
    click('.r2d-door');
    click(`#r2d-opt-121${part ? ` ${part}` : ''}`);
    expect(window.document.querySelector('#r2d-opt-121')?.getAttribute('aria-selected')).toBe('true');
    expect(text('#r2d-detail-title')).toBe('Watch maps and stay up to date');
    expect(text('.r2d-detail')).toContain('Closed');
    expect(window.document.querySelector('.r2d-float')).toBeNull();
    expect(window.document.querySelector('.r2d-detail [data-restore="121"]')).not.toBeNull();
    void window.happyDOM.abort();
  });

  it('selects the specific map when several maps have the same reason', () => {
    const { window, click, text } = roundTwo('f', true);
    click('.r2d-door');
    click('#r2d-opt-122 .r2f-explanation');
    expect(text('#r2d-detail-title')).toBe('Another closed map');
    expect(window.document.querySelector('#r2d-opt-122')?.getAttribute('aria-selected')).toBe('true');
    expect(window.document.querySelector('#r2d-opt-121')?.getAttribute('aria-selected')).toBe('false');
    click('#r2d-opt-121 .r2f-explanation');
    expect(text('#r2d-detail-title')).toBe('Watch maps and stay up to date');
    expect(window.document.querySelector('#r2d-opt-122')?.getAttribute('aria-selected')).toBe('false');
    expect(window.document.querySelector('.r2d-float')).toBeNull();
    click('.r2e-preview');
    expect(text('.r2d-float')).toContain('Opening it keeps it archived');
    click('.r2d-float [data-view="archived"]');
    click('.r2d-detail [data-restore="121"]');
    expect(window.document.querySelector('#r2d-opt-121')).toBeNull();
    expect(window.document.querySelector('#r2d-opt-122')).not.toBeNull();
    void window.happyDOM.abort();
  });
});

describe('Archive option E: open from the preview', () => {
  it.each(['.r2d-detail-graph', '#r2d-detail-title', '.r2e-preview .dest'])(
    'opens from %s while keeping the selected map archived', (target) => {
      const { window, click, text } = roundTwo('e');
      click('.r2d-door');
      click('#r2d-opt-121');
      expect(window.document.querySelector('.r2d-float')).toBeNull();
      const preview = window.document.querySelector('.r2e-preview');
      expect(preview?.tagName).toBe('A');
      expect(preview?.getAttribute('data-open')).toBe('121');
      expect(window.document.querySelectorAll('.r2d-detail [data-open]')).toHaveLength(1);
      expect(preview?.querySelector('button, a, input, select')).toBeNull();
      click(target);
      expect(text('.r2d-float')).toContain('Opening it keeps it archived');
      click('.r2d-float [data-view="archived"]');
      expect(window.document.querySelector('#r2d-opt-121')).not.toBeNull();
      void window.happyDOM.abort();
    },
  );

  it('restores separately without opening the map', () => {
    const { window, click, text } = roundTwo('e');
    click('.r2d-door');
    click('#r2d-opt-208');
    const restore = window.document.querySelector('.r2d-detail [data-restore="208"]');
    expect(restore?.closest('[data-open]')).toBeNull();
    click('.r2d-detail [data-restore="208"]');
    expect(window.document.querySelector('.r2d-float')).toBeNull();
    expect(window.document.querySelector('#r2d-opt-208')).toBeNull();
    expect(text('#r2-toast')).toContain('It stays active until you archive it again.');
    click('[data-view="active"]');
    expect(window.document.querySelector('[data-map-card="208"]')).not.toBeNull();
    void window.happyDOM.abort();
  });
});

describe('Archive option C: one list, two views', () => {
  it('archives from a card, opens an archived map without restoring it, and restores it from the map', () => {
    const { window, click, text } = roundTwo('c');
    const document = window.document;
    click('[data-archive="251"]');
    expect(document.querySelector('[data-map-card="251"]')).toBeNull();
    expect(text('#r2c-tab-archived .badge')).toBe('5');
    click('#r2c-tab-archived');
    for (const reason of REASONS) expect(text('.r2c-ledger')).toContain(reason);
    expect(text('[data-row="251"]')).toContain('Archived by you');
    expect(text('[data-row="208"]')).toContain('Comes back if a ticket reopens');
    click('[data-open="208"]');
    expect(text('.r2c-strip')).toContain('Opening it keeps it archived');
    expect(text('.topbar')).toContain('Archived');
    click('.r2c-strip [data-restore="208"]');
    expect(text('.r2c-strip.is-restored')).toContain('Back in your active maps');
    click('.r2c-strip [data-view="active"]');
    expect(document.querySelector('[data-archive="208"]')).not.toBeNull();
    void window.happyDOM.abort();
  });

  it('filters archived maps by reason', () => {
    const { window, click } = roundTwo('c');
    click('#r2c-tab-archived');
    click('[data-reason="idle"]');
    const rows = [...window.document.querySelectorAll('.r2-row')].map((row) => row.getAttribute('data-row'));
    expect(rows).toEqual(['165']);
    void window.happyDOM.abort();
  });

  it('keeps a map in place and offers a retry when saving fails', () => {
    const { window, click, text, fixture } = roundTwo('c');
    fixture('save-error');
    click('[data-archive="236"]');
    expect(text('[role="alert"]')).toContain("Couldn't archive #236. It's still in your active maps.");
    expect(window.document.querySelector('[data-map-card="236"]')).not.toBeNull();
    click('[data-retry]');
    expect(window.document.querySelector('[data-map-card="236"]')).toBeNull();
    void window.happyDOM.abort();
  });
});

describe('Archive option D: archive is a place', () => {
  it('archives from a card, browses Archived maps by reason, opens without restoring, and restores', () => {
    const { window, click, text } = roundTwo('d');
    const document = window.document;
    click('[data-archive="251"]');
    expect(document.querySelector('[data-map-card="251"]')).toBeNull();
    expect(text('.r2d-door')).toContain('5 maps');
    click('.r2d-door');
    const groups = [...document.querySelectorAll('.r2d-group-h b')].map((label) => label.textContent);
    expect(groups).toEqual(REASONS);
    expect(text('#r2d-g-manual')).toContain('2');
    click('#r2d-opt-208');
    expect(text('.r2d-detail')).toContain('All 9 tickets are done.');
    expect(text('.r2d-detail')).toContain('If a ticket reopens or an open ticket is added');
    click('.r2d-detail [data-open="208"]');
    expect(text('.r2d-float')).toContain('Opening it keeps it archived');
    click('.r2d-float [data-view="archived"]');
    expect(document.querySelector('#r2d-opt-208')?.getAttribute('aria-selected')).toBe('true');
    click('.r2d-detail [data-restore="208"]');
    expect(document.querySelector('#r2d-opt-208')).toBeNull();
    expect(text('#r2-toast')).toContain('It stays active until you archive it again.');
    click('[data-view="active"]');
    expect(document.querySelector('[data-map-card="208"]')).not.toBeNull();
    void window.happyDOM.abort();
  });

  it('shows what keeps running while a map is archived', () => {
    const { window, click, text } = roundTwo('d');
    click('.r2d-door');
    click('#r2d-opt-134');
    expect(text('.r2d-detail')).toContain('Auto map paused; your setting is kept');
    expect(text('.r2d-detail')).toContain('1 hand-off still running in T3 Code and tracked');
    void window.happyDOM.abort();
  });

  it('keeps a map archived when restoring fails', () => {
    const { window, click, text, fixture } = roundTwo('d');
    fixture('save-error');
    click('[data-view="archived"]');
    click('#r2d-opt-121');
    click('.r2d-detail [data-restore="121"]');
    expect(text('.r2d-detail [role="alert"]')).toContain("Couldn't restore #121. It's still archived.");
    expect(window.document.querySelector('#r2d-opt-121')).not.toBeNull();
    void window.happyDOM.abort();
  });
});
