import { describe, expect, it } from 'vitest';
import { CANVAS_NOTES_MARKER, canvasNotesComment, isCanvasNotesComment, markOrder, markTitle } from './canvasNotes.js';
import type { CanvasMark, CanvasNotesContext } from './canvasNotes.js';

const SHA = '0123456789abcdef0123456789abcdef01234567';
const dom: CanvasNotesContext = {
  branch: 'prototype/42-home',
  sha: SHA,
  source: 'dom',
  pages: ['home', 'settings'],
  options: { home: ['A', 'B', 'C'], settings: ['A'] },
};
const page = { page: 'home', pageTitle: 'Home' };
const b = { ...page, option: 'B', optionName: 'Split hero' };

/** The hidden block for agents, parsed. */
function data(comment: string): { branch: string; sha: string | null; source: string; pins: Record<string, unknown>[] } {
  const start = comment.indexOf(CANVAS_NOTES_MARKER) + CANVAS_NOTES_MARKER.length;
  return JSON.parse(comment.slice(start, comment.lastIndexOf(' -->'))) as ReturnType<typeof data>;
}

describe('canvas notes comment', () => {
  const marks: CanvasMark[] = [
    { ...b, type: 'pin', x: 0.3412, y: 0.3, near: 'Continue card', note: 'The hero card is too tall.' },
    { ...page, option: null, optionName: null, type: 'note', note: 'Every option uses too much padding.' },
    { ...b, type: 'color', element: 'Continue button', selector: '#go', from: '#2f6fd0', to: '#1659a8', note: 'A shade darker.' },
    { ...page, option: 'A', optionName: 'Greeting', type: 'element', element: 'Greeting card', selector: 'main > div', note: '' },
    { ...b, type: 'pin', x: 0.84, y: 0.16, note: 'Keep the switch.' },
  ];

  it('writes each pin’s page, option and location in the stable v1 format', () => {
    const comment = canvasNotesComment(dom, marks);
    expect(comment).toBe(
      [
        '### Canvas notes from Wayfinder',
        '`prototype/42-home` @ `0123456` · page **Home**',
        '',
        '1. **Whole page**, note: Every option uses too much padding.',
        '2. **A · Greeting**, element "Greeting card": _(no note)_',
        '3. **B · Split hero**, pin on "Continue card": The hero card is too tall.',
        '4. **B · Split hero**, colour of "Continue button": `#2f6fd0` → `#1659a8`: A shade darker.',
        '5. **B · Split hero**, pin: Keep the switch.',
        '',
        `<!-- wayfinder:notes v1 ${JSON.stringify({
          branch: 'prototype/42-home',
          sha: SHA,
          source: 'dom',
          pins: [
            { type: 'note', page: 'home', option: null, note: 'Every option uses too much padding.' },
            { type: 'element', page: 'home', option: 'A', element: 'Greeting card', selector: 'main > div', note: '' },
            { type: 'pin', page: 'home', option: 'B', x: 0.341, y: 0.3, near: 'Continue card', note: 'The hero card is too tall.' },
            { type: 'color', page: 'home', option: 'B', element: 'Continue button', selector: '#go', from: '#2f6fd0', to: '#1659a8', note: 'A shade darker.' },
            { type: 'pin', page: 'home', option: 'B', x: 0.84, y: 0.16, note: 'Keep the switch.' },
          ],
        })} -->`,
      ].join('\n'),
    );
  });

  it('names the page on every line when notes span pages', () => {
    const comment = canvasNotesComment(dom, [
      { page: 'settings', pageTitle: 'Settings', option: 'A', optionName: 'Tabs', type: 'pin', x: 0.5, y: 0.5, note: 'Here.' },
      { ...b, type: 'note', note: 'Closest.' },
    ]);
    expect(comment).toContain('`prototype/42-home` @ `0123456`\n\n');
    expect(comment).toContain('1. **Home · B · Split hero**, note on the whole option: Closest.');
    expect(comment).toContain('2. **Settings · A · Tabs**, pin: Here.');
    expect(data(comment).pins.map((pin) => pin['page'])).toEqual(['home', 'settings']);
  });

  it('keeps notes inside their list item and a note from closing the hidden block', () => {
    const comment = canvasNotesComment(dom, [{ ...b, type: 'note', note: 'First line\r\nsecond --> line' }]);
    expect(comment).toContain('1. **B · Split hero**, note on the whole option: First line\n   second --> line');
    const hidden = comment.slice(comment.indexOf(CANVAS_NOTES_MARKER));
    expect(hidden.indexOf('-->')).toBe(hidden.length - 3);
    expect(data(comment).pins[0]!['note']).toBe('First line\r\nsecond --> line');
  });

  it('never lets a name or note reach GitHub as HTML or break the line', () => {
    const comment = canvasNotesComment(dom, [
      { ...b, type: 'element', element: 'Card\n<!-- hide -->\n<img src=x>', selector: '#c', note: 'a < b' },
    ]);
    const visible = comment.slice(0, comment.indexOf(CANVAS_NOTES_MARKER));
    expect(visible).toContain('1. **B · Split hero**, element "Card &lt;!-- hide --> &lt;img src=x>": a &lt; b');
    expect(visible).not.toContain('<');
    expect(data(comment).pins[0]!['element']).toBe('Card\n<!-- hide -->\n<img src=x>');
  });

  it('writes the snapshot file and the option from the tile for a snapshot', () => {
    const snapshot: CanvasNotesContext = { branch: 'prototype/8-x', sha: SHA, source: 'page', pages: ['prototype-snapshot.html'], options: { 'prototype-snapshot.html': ['A'] } };
    const at = { page: 'prototype-snapshot.html', pageTitle: 'prototype-snapshot.html' };
    const comment = canvasNotesComment(snapshot, [
      { ...at, option: 'A', optionName: 'Recovery', type: 'pin', x: 0.5, y: 0.42, near: null, note: 'Needs a status colour.' },
      { ...at, option: null, optionName: null, type: 'note', note: 'Reads well.' },
    ]);
    expect(comment).toContain('`prototype/8-x` @ `0123456` · snapshot');
    expect(comment).toContain('1. **Whole page**, note: Reads well.');
    expect(comment).toContain('2. `prototype-snapshot.html` · option **A**, pin on the page: Needs a status colour.');
    expect(data(comment).pins[1]).toEqual({ type: 'pin', page: 'prototype-snapshot.html', option: 'A', x: 0.5, y: 0.42, note: 'Needs a status colour.' });
  });

  it('writes notes only, against the chosen option, for a canvas without the bridge', () => {
    const fallback: CanvasNotesContext = { branch: 'prototype/42-home', sha: null, source: 'none', pages: ['prototypes/42/index.html'], options: { 'prototypes/42/index.html': ['A', 'B'] } };
    const at = { page: 'prototypes/42/index.html', pageTitle: 'prototypes/42/index.html' };
    const comment = canvasNotesComment(fallback, [
      { ...at, option: 'B', optionName: 'Split hero', type: 'note', note: 'Too tall.' },
      { ...at, option: null, optionName: null, type: 'note', note: 'Too much padding.' },
    ]);
    expect(comment.split('\n').slice(0, 5)).toEqual([
      '### Canvas notes from Wayfinder',
      '`prototype/42-home` · `prototypes/42/index.html`',
      '',
      '1. **Whole page**, note: Too much padding.',
      '2. **B · Split hero**, note on the whole option: Too tall.',
    ]);
    expect(data(comment)).toMatchObject({ sha: null, source: 'none', pins: [{ type: 'note', option: null }, { type: 'note', option: 'B' }] });
    expect(isCanvasNotesComment(comment)).toBe(true);
  });

  it('orders by page, whole page first, then the canvas’s option order, then as added', () => {
    expect(markOrder(marks, dom)).toEqual([1, 3, 0, 2, 4]);
  });

  it('titles marks by element name, never by position', () => {
    expect(markTitle(marks[0]!, 1, 'dom')).toBe('Pin 1 · on Continue card');
    expect(markTitle(marks[4]!, 2, 'dom')).toBe('Pin 2 · on B');
    expect(markTitle(marks[2]!, 3, 'dom')).toBe('Colour 3 · Continue button');
    expect(markTitle({ ...marks[4]!, near: null }, 4, 'page')).toBe('Pin 4 · on the page');
    expect(markTitle(marks[1]!, 5, 'dom')).toBe('Note 5');
  });

  it('accepts only a canvas-notes comment on the server', () => {
    expect(isCanvasNotesComment(canvasNotesComment(dom, marks))).toBe(true);
    expect(isCanvasNotesComment('Closing this ticket.')).toBe(false);
    expect(isCanvasNotesComment(`### Canvas notes from Wayfinder\n${'x'.repeat(70_000)}${CANVAS_NOTES_MARKER}{} -->`)).toBe(false);
    expect(isCanvasNotesComment(42)).toBe(false);
  });
});
