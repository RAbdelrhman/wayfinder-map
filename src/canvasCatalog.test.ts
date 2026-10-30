import { describe, expect, it } from 'vitest';
import { canvasCatalog } from './canvasCatalog.js';
import { readFileSync } from 'node:fs';

describe('canvasCatalog', () => {
  it('keeps rounds and repeated option IDs on their own pages without executing config', () => {
    const source = `const PHONE = { width: 390, height: 844 }; window.CANVAS = { pages: [
      { id: 'light', title: 'Light', round: 1, sections: [{ items: [{ id: 'D', name: 'Old', src: 'same.html' }] }] },
      { id: 'dark', title: 'Dark', round: 1, sections: [{ items: [{ id: 'D', name: 'Dark', src: 'same.html' }] }] },
      { id: 'round-2', title: 'Remix', round: 2, sections: [{ items: [{ id: 'D', name: 'New', src: 'new.html', ...PHONE, note: { basedOn: ['A', 'B'], disposition: 'keep', feedback: 'Approved D' } }, { id: 'review', kind: 'note', name: 'Review' }] }] }
    ] }; throw new Error('must not run');`;
    const pages = canvasCatalog(source);
    expect(pages.map((page) => page.id)).toEqual(['light', 'dark', 'round-2']);
    expect(pages[2]?.items[0]).toMatchObject({ id: 'D', disposition: 'keep', basedOn: ['A', 'B'], width: 390, height: 844 });
    expect(pages[2]?.items).toHaveLength(1);
  });
  it('returns no metadata for malformed or executable-only config', () => {
    expect(canvasCatalog('window.CANVAS = makeConfig()')).toEqual([]);
    expect(canvasCatalog('window.CANVAS = {')).toEqual([]);
  });

  it('reads helper-generated pages, frames, notes and later appended rounds from the reported canvases', () => {
    const load = (ticket: number) => canvasCatalog(readFileSync(new URL(`./__fixtures__/canvas-catalog/${String(ticket)}.txt`, import.meta.url), 'utf8'));
    const loading = load(310);
    expect(loading).toHaveLength(7);
    expect(loading.find((page) => page.round === 2)?.items.find((item) => item.id === 'AB')).toMatchObject({
      src: 'variants/viewer.html?dir=AB&ready=440', disposition: 'keep', basedOn: ['A', 'B'], width: 1280, height: 800,
    });
    expect(loading.flatMap((page) => page.items).some((item) => item.id === 'AB-d200')).toBe(true);
    const reset = load(292).find((page) => page.round === 3);
    expect(reset?.items.map((item) => item.id)).toEqual(['D', 'D0', 'D1', 'D2']);
    expect(reset?.items[2]?.src).toBe('variants/shortcuts.html?dir=d&state=reset-one');
    const feedback = load(314).find((page) => page.round === 2);
    expect(feedback?.items.find((item) => item.id === 'E')).toMatchObject({
      src: 'variants/viewer.html?dir=B3&state=posted', disposition: 'keep', basedOn: ['B', 'A'],
    });
    expect(feedback?.items.find((item) => item.id === 'E-failed-pane')?.src).toBe('variants/viewer.html?dir=B3&state=failed&size=pane');
  });

  it('never calls host functions or reads host prototypes', () => {
    const source = `const escape = window.constructor.constructor('return process')();
      window.CANVAS = { pages: [{ id: 'safe', items: [{ id: 'A', src: escape.env.SECRET }] }] };`;
    expect(canvasCatalog(source)).toEqual([]);
    expect(canvasCatalog(`window.CANVAS = {pages: []}; process.exit(1);`)).toEqual([]);
  });

  it('withholds stale decisions when an unsupported write could change the canvas', () => {
    const initial = `window.CANVAS = { pages: [{ items: [{ id: 'A', note: { disposition: 'keep' } }] }] };`;
    expect(canvasCatalog(initial + `window.CANVAS.pages[0].items[0].note.disposition = 'change';`)).toEqual([]);
    expect(canvasCatalog(initial + `if (true) window.CANVAS.pages = [];`)).toEqual([]);
    expect(canvasCatalog(initial + `window.CANVAS.pages.push(...unknownPages());`)).toEqual([]);
    expect(canvasCatalog(initial + `window.CANVAS.pages.push(unknownPage());`)).toEqual([]);
    expect(canvasCatalog(`window.CANVAS = { pages: [{ items: [{ id: 'A' }] }, ...unknownPages()] };`)).toEqual([]);
  });

  it('bounds recursive helpers and expanding data', () => {
    expect(canvasCatalog(`const recurse = () => recurse(); window.CANVAS = recurse();`)).toEqual([]);
    const declarations = ['const x0 = "1234567890";'];
    for (let index = 1; index < 25; index++) declarations.push(`const x${index} = x${index - 1} + x${index - 1};`);
    expect(canvasCatalog(declarations.join('\n') + `window.CANVAS = { pages: [{title: x24}] };`)).toEqual([]);
  });

  it('withholds the complete catalog when a page, section or item is unresolved', () => {
    const kept = `{ items: [{ id: 'A', note: { disposition: 'keep', feedback: 'Keep A' } }] }`;
    expect(canvasCatalog(`window.CANVAS = { pages: [${kept}, unknownPage()] };`)).toEqual([]);
    expect(canvasCatalog(`window.CANVAS = { pages: [{ sections: [${kept}, unknownSection()] }] };`)).toEqual([]);
    expect(canvasCatalog(`window.CANVAS = { pages: [{ items: [{id: 'A', note: {disposition: 'keep'}}, unknownItem()] }] };`)).toEqual([]);
    expect(canvasCatalog(`window.CANVAS = { pages: [1].map(() => unknownPage()) };`)).toEqual([]);
  });

  it('withholds computed records whose unknown key could override a Keep', () => {
    expect(canvasCatalog(`const key = unknownKey(); window.CANVAS = { pages: [{ items: [{ id: 'A',
      note: { disposition: 'keep', feedback: 'Keep A', [key]: 'change' } }] }] };`)).toEqual([]);
    expect(canvasCatalog(`const key = { toString: () => 'disposition' }; window.CANVAS = { pages: [{ items: [{ id: 'A',
      note: { disposition: 'keep', feedback: 'Keep A', [key]: 'change' } }] }] };`)).toEqual([]);
    expect(canvasCatalog(`const key = 'disposition'; window.CANVAS = { pages: [{ items: [{ id: 'A',
      note: { disposition: 'keep', [key]: 'change' } }] }] };`)[0]?.items[0]?.disposition).toBe('change');
  });

  it('withholds the catalog for writes nested anywhere inside a const initializer', () => {
    const initial = `window.CANVAS = { pages: [{ items: [{ id: 'A', note: { disposition: 'keep' } }] }] };`;
    for (const mutation of [
      `(window.CANVAS.pages[0].items[0].note.disposition = 'change')`,
      `({ value: (window.CANVAS.pages[0].items[0].note.disposition = 'change') })`,
      `(0, window.CANVAS.pages[0].items[0].note.disposition = 'change')`,
      `delete window.CANVAS.pages[0].items[0].note.disposition`,
      `window.CANVAS.pages[0].round++`,
      `window.CANVAS.pages.push({ items: [{id: 'B', note: {disposition: 'keep'}}] })`,
      `(0, unknownMutation(window.CANVAS))`,
      `(() => { unknownMutation(window.CANVAS); })()`,
      `(() => 'unused')(...unknownMutation(window.CANVAS))`,
    ]) expect(canvasCatalog(`${initial} const result = ${mutation};`)).toEqual([]);
  });

  it('never reads a canvas assignment after a throw', () => {
    const initial = `window.CANVAS = { pages: [{ items: [{ id: 'A' }] }] };`;
    expect(canvasCatalog(`throw new Error(); ${initial}`)).toEqual([]);
    expect(canvasCatalog(`${initial} throw new Error(); window.CANVAS = { pages: [] };`)[0]?.items[0]?.id).toBe('A');
  });
});
