import { afterEach, describe, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';
import { mountCanvasFocus } from './canvasFocus.js';
import { setTrustedHtml } from './trustedHtml.js';

afterEach(() => { vi.useRealTimers(); });

function setup() {
  vi.useFakeTimers();
  const window = new Window();
  const document = window.document;
  setTrustedHtml(document.body as unknown as HTMLElement, '<main><input id="map"><iframe aria-hidden="true"></iframe></main><section><button data-close>Close</button><textarea>abcdef</textarea><iframe></iframe></section>');
  const viewer = document.querySelector('section')!;
  const canvas = viewer.querySelector('iframe')!;
  const tile = document.querySelector('iframe')!;
  const field = viewer.querySelector('textarea')!;
  let open = true;
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  mountCanvasFocus(viewer as unknown as HTMLElement, () => open, () => canvas as unknown as HTMLIFrameElement);
  const steal = (frame = tile) => {
    frame.focus();
    window.dispatchEvent(new window.Event('blur'));
    vi.advanceTimersByTime(60);
  };
  const enter = (source = canvas.contentWindow) => {
    if (source === canvas.contentWindow) canvas.focus();
    window.dispatchEvent(new window.MessageEvent('message', { source: source as Window, data: { wf: 1, type: 'focus-entry' } }));
  };
  return { window, document, viewer, canvas, tile, field, steal, enter, close: () => { open = false; } };
}

describe('canvas focus restoration', () => {
  it('restores the selected host input and its selection after a background frame takes focus', () => {
    const { document, field, steal } = setup();
    field.focus();
    field.setSelectionRange(2, 4, 'backward');
    steal();
    expect(document.activeElement).toBe(field);
    expect([field.selectionStart, field.selectionEnd, field.selectionDirection]).toEqual([2, 4, 'backward']);
  });
  it('restores deliberate pane/float map focus rather than an older viewer target', () => {
    const { document, field, steal } = setup();
    field.focus();
    const map = document.querySelector('input')!;
    map.focus();
    steal();
    expect(document.activeElement).toBe(map);
  });
  it('restores the host when the loading open canvas takes focus', () => {
    const { document, field, canvas, steal } = setup();
    field.focus();
    steal(canvas);
    expect(document.activeElement).toBe(field);
  });
  it('keeps deliberate canvas pointer entry and returns there after a tile takes focus', () => {
    const { document, field, canvas, steal, enter } = setup();
    field.focus();
    enter();
    steal(canvas);
    expect(document.activeElement).toBe(canvas);
    steal();
    expect(document.activeElement).toBe(canvas);
  });
  it('does not let a background tile authorize viewer focus', () => {
    const { document, field, canvas, tile, steal, enter } = setup();
    field.focus();
    enter(tile.contentWindow);
    steal(canvas);
    expect(document.activeElement).toBe(field);
  });
  it('ignores a delayed entry message once the user has selected a host field', () => {
    const { window, document, field, canvas, steal } = setup();
    field.focus();
    window.dispatchEvent(new window.MessageEvent('message', { source: canvas.contentWindow as Window, data: { wf: 1, type: 'focus-entry' } }));
    steal();
    expect(document.activeElement).toBe(field);
  });
  it('honours a genuine pointer entry reported after recovery without a renderer timing deadline', () => {
    const { window, document, field, canvas, steal } = setup();
    field.focus();
    const at = Date.now();
    steal(canvas);
    expect(document.activeElement).toBe(field);
    vi.advanceTimersByTime(1000);
    window.dispatchEvent(new window.MessageEvent('message', { source: canvas.contentWindow as Window, data: { wf: 1, type: 'focus-entry', at } }));
    expect(document.activeElement).toBe(canvas);
  });
  it('does not honour a late click report after a newer host action', () => {
    const { window, document, field, canvas, steal } = setup();
    field.focus();
    const at = Date.now();
    steal(canvas);
    vi.advanceTimersByTime(1000);
    field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'z', bubbles: true }));
    window.dispatchEvent(new window.MessageEvent('message', { source: canvas.contentWindow as Window, data: { wf: 1, type: 'focus-entry', at } }));
    expect(document.activeElement).toBe(field);
  });
  it('clears Tab intent when focus leaves for browser chrome before a later canvas load', () => {
    const { window, document, field, canvas, steal } = setup();
    field.focus();
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    window.dispatchEvent(new window.Event('blur'));
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    steal(canvas);
    expect(document.activeElement).toBe(field);
  });
  it('restores canvas ownership on a child-to-child transfer without a host window blur', () => {
    const { window, document, canvas, tile, enter } = setup();
    enter();
    tile.focus();
    window.dispatchEvent(new window.MessageEvent('message', { source: canvas.contentWindow as Window, data: { wf: 1, type: 'focus-leave' } }));
    vi.runOnlyPendingTimers();
    expect(document.activeElement).toBe(canvas);
  });
  it('allows Tab entry after an asynchronous renderer focus transfer', () => {
    const { window, document, field, canvas, steal } = setup();
    field.focus();
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    vi.advanceTimersByTime(250);
    steal(canvas);
    expect(document.activeElement).toBe(canvas);
  });
  it('cancels a pending Tab entry when the user selects another host control', () => {
    const { window, document, field, canvas, steal } = setup();
    field.focus();
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    const map = document.querySelector('input')!;
    map.focus();
    vi.advanceTimersByTime(250);
    steal(canvas);
    expect(document.activeElement).toBe(map);
  });
  it('preserves prevented Tab when the viewer focus trap deliberately focuses its canvas', async () => {
    const { window, document, field, canvas, steal } = setup();
    field.focus();
    document.addEventListener('keydown', event => { canvas.focus(); event.preventDefault(); }, { once: true });
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    await Promise.resolve();
    steal(canvas);
    expect(document.activeElement).toBe(canvas);
  });
  it('does not restore after close or when another OS window is active', () => {
    const { document, field, tile, steal, close } = setup();
    field.focus();
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    steal();
    expect(document.activeElement).toBe(tile);
    field.focus();
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    close();
    steal();
    expect(document.activeElement).toBe(tile);
  });
  it('falls back to Close when the selected control has been removed', () => {
    const { document, viewer, field, steal } = setup();
    field.focus();
    field.remove();
    steal();
    expect(document.activeElement).toBe(viewer.querySelector('button'));
  });
});
