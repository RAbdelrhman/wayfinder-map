// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { CANVAS_BRIDGE_SCRIPT } from './canvasBridge.js';
import { setTrustedHtml } from './ui/trustedHtml.js';

/** Runs the wrapper as the option document would, with the viewer as its parent. */
function boot(html: string) {
  setTrustedHtml(document.body, html);
  const parent = { postMessage: vi.fn<(message: Record<string, unknown>, target: string) => void>() };
  Object.defineProperty(window, 'parent', { value: parent, configurable: true });
  new Function(CANVAS_BRIDGE_SCRIPT)();
  const send = (data: Record<string, unknown>): void => {
    window.dispatchEvent(new MessageEvent('message', { data: { wf: 1, ...data } }));
  };
  // happy-dom's MessageEvent drops `source`; the wrapper only takes requests from its parent.
  const from = (data: Record<string, unknown>): void => {
    const event = new MessageEvent('message', { data: { wf: 1, ...data } });
    Object.defineProperty(event, 'source', { value: parent });
    window.dispatchEvent(event);
  };
  const sent = (type: string): Record<string, unknown>[] =>
    parent.postMessage.mock.calls.map(([message]) => message).filter((message) => message['type'] === type);
  return { parent, send, from, sent };
}

describe('wrapper hit tests and marks (#213)', () => {
  it('names what is under the pointer, finds it again, and reads its colour', () => {
    const page = boot(`<main><div class="card"><h3>Continue</h3><p id="long">A paragraph that runs well past forty characters, so it is no name.</p></div>
      <button aria-label="Close the hero">×</button><span style="background-color: rgb(47, 111, 208)">Go</span></main>`);
    const hit = (el: Element, requestId: number, palette = false): Record<string, unknown> => {
      document.elementFromPoint = () => el;
      page.from({ type: 'hitTest', requestId, x: 10, y: 20, palette });
      return page.sent('hit').find((message) => message['requestId'] === requestId)!;
    };
    const card = hit(document.querySelector('#long')!, 1);
    expect(card).toMatchObject({ wf: 1, name: 'Continue card', selector: '#long' });
    expect(hit(document.querySelector('button')!, 2)['name']).toBe('Close the hero');
    const span = hit(document.querySelector('span')!, 3, true);
    expect(span).toMatchObject({ name: 'Go', color: '#2f6fd0', selector: 'body > main > span' });
    expect(document.querySelector(span['selector'] as string)).toBe(document.querySelector('span'));
    expect(span['palette']).toEqual(expect.arrayContaining([['#2f6fd0', 'Go']]));
    const bare = hit(document.body, 4);
    expect(bare).toMatchObject({ name: null, selector: null, color: null, rect: null });
    expect(typeof bare['x']).toBe('number');
  });

  it('keeps a pin on its element, and scrolls the inner pane under the pointer', async () => {
    const page = boot('<main id="pane" style="overflow: auto; height: 100px"><p id="row">Row</p></main>');
    const row = document.querySelector('#row')!;
    let top = 100;
    row.getBoundingClientRect = () => ({ left: 10, top, width: 200, height: 40, right: 210, bottom: top + 40, x: 10, y: top, toJSON: () => ({}) });
    document.elementFromPoint = () => row;
    page.from({ type: 'hitTest', requestId: 1, x: 60, y: 110, palette: false });
    expect(page.sent('hit').at(-1)).toMatchObject({ selector: '#row', ax: 0.25, ay: 0.25 });

    const pane = document.querySelector<HTMLElement>('#pane')!;
    Object.defineProperty(pane, 'scrollHeight', { value: 500 });
    Object.defineProperty(pane, 'clientHeight', { value: 100 });
    const scrollBy = vi.fn();
    pane.scrollBy = scrollBy as unknown as HTMLElement['scrollBy'];
    page.from({ type: 'scroll', dx: 0, dy: 120, x: 60, y: 110 });
    expect(scrollBy).toHaveBeenCalledWith(0, 120);

    top = 40; // the pane scrolled the row up
    page.from({ type: 'marks', marks: [{ id: 1, x: 0.9, y: 0.9, selector: '#row', ax: 0.25, ay: 0.25 }] });
    await vi.waitFor(() => expect(page.sent('layout').length).toBeGreaterThan(0));
    expect((page.sent('layout').at(-1)!['marks'] as { rect: { left: number; top: number } }[])[0]!.rect).toMatchObject({ left: 60, top: 50 });
  });

  it('hands points on the presented option to it, and misses the canvas’s own chrome over it', () => {
    const page = boot('<div id="present-view"><aside id="side-note">Notes</aside><iframe id="present-frame"></iframe></div>');
    const frame = document.querySelector<HTMLIFrameElement>('#present-frame')!;
    const child = { postMessage: vi.fn() };
    Object.defineProperty(frame, 'contentWindow', { value: child });
    frame.getBoundingClientRect = () => ({ left: 0, top: 40, width: 800, height: 600, right: 800, bottom: 640, x: 0, y: 40, toJSON: () => ({}) });
    document.elementFromPoint = () => frame;
    page.from({ type: 'hitTest', requestId: 1, x: 100, y: 140, palette: false });
    expect(child.postMessage).toHaveBeenCalledWith({ wf: 1, type: 'hitTest', requestId: 1, x: 100, y: 100, palette: false }, '*');
    document.elementFromPoint = () => document.querySelector('#side-note');
    page.from({ type: 'hitTest', requestId: 2, x: 700, y: 140, palette: false });
    expect(page.sent('hit').at(-1)).toEqual({ wf: 1, type: 'hit', requestId: 2, miss: true });
  });

  it('lists the named elements on screen for keyboard selection', () => {
    const page = boot('<main><article><h3>Continue</h3><p>Text</p></article><button aria-label="Close">×</button><span>tiny</span></main>');
    for (const el of document.querySelectorAll('main *'))
      (el as HTMLElement).getBoundingClientRect = () => ({ left: 10, top: 20, width: el.tagName === 'SPAN' ? 4 : 120, height: 30, right: 130, bottom: 50, x: 10, y: 20, toJSON: () => ({}) });
    page.from({ type: 'targets' });
    const names = (page.sent('targets').at(-1)!['items'] as { name: string }[]).map((item) => item.name);
    expect(names).toEqual(expect.arrayContaining(['Continue', 'Continue card', 'Close']));
    expect(names).not.toContain('tiny');
    const items = page.sent('targets').at(-1)!['items'] as { name: string; selector: string }[];
    expect(items.find((item) => item.name === 'Close')?.selector).toBe('body > main > button');
  });

  it('reports where tracked marks are, and ignores requests from anything but its parent', async () => {
    const page = boot('<main><p id="a">A</p></main>');
    page.send({ type: 'marks', marks: [{ id: 7, x: 0, y: 0 }] });
    page.from({ type: 'marks', marks: [{ id: 1, x: 0.5, y: 0.5 }, { id: 2, selector: '#a' }, { id: 3, selector: '###' }, { nope: true }] });
    // Every wrapper booted in this window answers; each reports the same marks.
    await vi.waitFor(() => expect(page.sent('layout').length).toBeGreaterThan(0));
    const layout = page.sent('layout').at(-1)!;
    expect(page.sent('layout').every((message) => (message['marks'] as unknown[]).length === 3)).toBe(true);
    expect((layout['marks'] as { id: number; rect: unknown }[]).map((mark) => [mark.id, mark.rect === null])).toEqual([
      [1, false],
      [2, false],
      [3, true],
    ]);
    expect(layout['viewport']).toMatchObject({ left: 0, top: 0 });
  });
});
