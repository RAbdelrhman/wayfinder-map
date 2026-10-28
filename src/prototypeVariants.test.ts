import { describe, expect, it } from 'vitest';

import { canvasVariantNames, parsePrototypeShotPath, prototypeShotUrl, prototypeVariantInfo, shotVariants, verdictComment } from './prototypes.js';

/* Shapes taken from real canvases: a lookup of directions, generated frames, explicit items, and a mix page. */
const LOOKUP_CANVAS = `
/* Three directions for a map's Prototypes tab. The apostrophe here must not open a string. */
const DIRECTIONS = {
  A: { name: 'A · Cards', note: { idea: 'Cards. It’s calm.' } },
  B: { name: 'B · Terrain' },
  C: { name: 'C · Ledger' },
};
const frame = (d, view) => ({ id: \`\${d}\${view}\`, name: \`\${d} · \${DIRECTIONS[d].name}\`, src: \`variants/\${d.toLowerCase()}.html?view=\${view}\` });
window.CANVAS = {
  pages: [
    { title: 'Your mix', sections: [{ items: [{ id: 'M5', name: 'A · Gallery', src: 'variants/a.html?view=map' }] }] },
  ],
};
`;

const EXPLICIT_CANVAS = `
window.CANVAS = {
  pages: [{
    title: 'Directions',
    sections: [
      { title: 'A + B, with the list in the topbar', items: [{ id: 'AB', name: 'Closed: the topbar button', src: 'variants/after-ab.html?state=input' }] },
      { title: 'The three directions', items: [
        { id: 'A', name: 'Stays on the ticket', src: 'variants/after-a.html?state=working' },
        { id: 'B', name: 'A tray that follows you', src: 'variants/after-b.html' },
        { id: 'C', name: 'Each hand-off gets a page (not chosen)', src: 'variants/after-c.html' },
        { id: 'A-off', name: 'A · offline', src: 'variants/after-a.html?state=offline' },
      ] },
    ],
  }],
};
`;

const MIX_PAGE_CANVAS = `
const variant = (id, view, name) => ({ id: id + view, name, src: 'variants/nav-' + id.toLowerCase() + '.html' });
window.CANVAS = { pages: [
  { title: 'D · Your mix', sections: [{ items: [
    { id: 'D1', name: 'D · Home', src: 'variants/nav-d.html?view=home' },
    { id: 'D2', name: 'D · Repository', src: 'variants/nav-d.html?view=repo' },
  ] }] },
  { title: 'Home', sections: [{ items: [variant('A', 1, 'A · Path bar'), variant('B', 1, 'B · Scope and tabs')] }] },
] };
`;

describe('canvasVariantNames', () => {
  it('reads names from a lookup object and prefers the most used name over a one-off frame', () => {
    const names = canvasVariantNames(LOOKUP_CANVAS);

    expect(names.get('A')?.title).toBe('Cards');
    expect(names.get('B')?.title).toBe('Terrain');
    expect(names.get('C')?.title).toBe('Ledger');
  });

  it('names explicit lettered items, drops "(not chosen)", and names a combined variant from its section', () => {
    const names = canvasVariantNames(EXPLICIT_CANVAS);

    expect(names.get('A')).toMatchObject({ title: 'Stays on the ticket', page: 'variants/after-a.html?state=working' });
    expect(names.get('C')?.title).toBe('Each hand-off gets a page');
    expect(names.get('AB')?.title).toBe('A + B, with the list in the topbar');
  });

  it('lets a lettered page title outweigh the single frames under it', () => {
    const names = canvasVariantNames(MIX_PAGE_CANVAS);

    expect(names.get('D')).toMatchObject({ title: 'Your mix', anyPage: 'variants/nav-d.html?view=home' });
    expect(names.get('A')?.title).toBe('Path bar');
  });
});

describe('prototypeVariantInfo', () => {
  const shots = ['42-A.jpg', '42-D.jpg', '45-A.jpg', '45-AB.jpg', '45-B.jpg', '45-C.jpg', '17.jpg', '39-board.jpg', 'notes.txt'];

  it('lists exactly the screenshotted variants, named and paged from the canvas', () => {
    const variants = prototypeVariantInfo(45, shots, EXPLICIT_CANVAS, 'prototypes/canvas/', []);

    expect(variants.map(({ id, title }) => `${id} · ${title}`)).toEqual([
      'A · Stays on the ticket',
      'AB · A + B, with the list in the topbar',
      'B · A tray that follows you',
      'C · Each hand-off gets a page',
    ]);
    expect(variants[0]).toMatchObject({ page: 'prototypes/canvas/variants/after-a.html?state=working', shot: '45-A.jpg' });
  });

  it('finds a page on the branch when the canvas only names the letter', () => {
    const variants = prototypeVariantInfo(42, shots, MIX_PAGE_CANVAS, 'prototypes/canvas/', ['prototypes/canvas/variants/nav-a.html']);

    expect(variants.find((variant) => variant.id === 'A')?.page).toBe('prototypes/canvas/variants/nav-a.html');
    expect(variants.find((variant) => variant.id === 'D')?.title).toBe('Your mix');
  });

  it('letters a single screenshot and names it from its file when there is no canvas', () => {
    expect(prototypeVariantInfo(17, shots, null, '', [])).toEqual([{ id: 'A', title: 'Variant A', page: null, shot: '17.jpg' }]);
    expect(prototypeVariantInfo(39, shots, null, '', [])).toEqual([{ id: 'A', title: 'Board', page: null, shot: '39-board.jpg' }]);
  });

  it('falls back to the canvas directions when no screenshots exist', () => {
    expect(prototypeVariantInfo(45, [], EXPLICIT_CANVAS, 'c/', []).map((variant) => variant.id)).toEqual(['A', 'AB', 'B', 'C']);
  });
});

describe('prototype screenshots', () => {
  it('matches only a ticket’s own screenshots', () => {
    expect(shotVariants(4, ['4-A.jpg', '42-A.jpg', '4.png'])).toEqual([
      { id: 'A', shot: '4-A.jpg' },
      { id: 'A', shot: '4.png' },
    ]);
  });

  it('serves a screenshot by plain file name only', () => {
    const url = prototypeShotUrl('octo/wayfinder', '43-B.jpg');

    expect(url).toBe('/proto-shot/octo/wayfinder/43-B.jpg');
    expect(parsePrototypeShotPath(url)).toEqual({ repo: 'octo/wayfinder', file: '43-B.jpg' });
    expect(parsePrototypeShotPath('/proto-shot/octo/wayfinder/..%2Fsecret.jpg')).toBeNull();
    expect(parsePrototypeShotPath('/proto-shot/octo/wayfinder/a/b.jpg')).toBeNull();
    expect(parsePrototypeShotPath('/proto-shot/octo/wayfinder/config.js')).toBeNull();
  });
});

describe('verdictComment', () => {
  it('prefers the answer over a later follow-up note', () => {
    expect(verdictComment(['Question noted.', '**Answer:** C, goal first.', 'Follow-ups filed: #68 and #69.'])).toBe('**Answer:** C, goal first.');
    expect(verdictComment(['## Verdict\n\nDirection D.', 'Thanks!'])).toBe('## Verdict\n\nDirection D.');
  });

  it('falls back to the last comment, and to nothing without comments', () => {
    expect(verdictComment(['First', 'Last'])).toBe('Last');
    expect(verdictComment([null, '  '])).toBeNull();
  });
});
