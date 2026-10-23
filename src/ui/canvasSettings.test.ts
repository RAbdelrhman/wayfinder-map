// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { mountCanvasSettings } from './canvasSettings.js';

it('suspends the live viewer in all sizes and restores its exact context, focus callback and history', () => {
  // Keep the Settings frame at about:blank in this unit test; browser checks load the real page.
  const src = vi.spyOn(HTMLIFrameElement.prototype, 'src', 'set').mockImplementation(function (this: HTMLIFrameElement, value: string) { this.dataset['requestedSrc'] = value; });
  const app = document.createElement('main');
  const viewer = document.createElement('section');
  const liveCanvas = document.createElement('iframe');
  liveCanvas.dataset['option'] = 'B';
  viewer.append(liveCanvas);
  document.body.append(app, viewer);
  const returned = vi.fn();
  const settings = mountCanvasSettings(viewer, app, returned);
  const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
  for (const size of ['full', 'pane', 'float']) {
    const href = `${location.origin}/?canvas=test-${size}`;
    history.replaceState({ wfCanvas: { url: `test-${size}` } }, '', href);
    viewer.className = `vw is-${size}`;
    app.inert = size === 'full';
    settings.open();
    expect(settings.isOpen()).toBe(true);
    expect(viewer.hidden).toBe(true);
    expect(viewer.inert).toBe(true);
    expect(app.inert).toBe(true);
    const frame = document.querySelector<HTMLIFrameElement>('.canvas-settings-frame')!;
    vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => undefined);
    expect(frame.dataset['requestedSrc']).toBe('/settings?section=shortcuts&canvas=1');
    const heading = frame.contentDocument!.createElement('h2');
    heading.id = 'settings-category-title';
    heading.tabIndex = -1;
    frame.contentDocument!.body.append(heading);
    frame.dispatchEvent(new Event('load'));
    expect(frame.contentDocument!.activeElement).toBe(heading);
    back.mockClear();
    window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: liveCanvas.contentWindow, data: { type: 'wayfinder:canvas-return' } }));
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://evil.example', source: frame.contentWindow, data: { type: 'wayfinder:canvas-return' } }));
    expect(back).not.toHaveBeenCalled();
    window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: frame.contentWindow, data: { type: 'wayfinder:canvas-return' } }));
    expect(back).toHaveBeenCalledOnce();
    history.replaceState({ wfCanvas: { url: `test-${size}` } }, '', href);
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    expect(settings.isOpen()).toBe(false);
    expect(viewer.hidden).toBe(false);
    expect(viewer.inert).toBe(false);
    expect(app.inert).toBe(size === 'full');
    expect(viewer.firstChild).toBe(liveCanvas);
    expect(liveCanvas.dataset['option']).toBe('B');
    expect(viewer.className).toBe(`vw is-${size}`);
  }
  expect(returned).toHaveBeenCalledTimes(3);
  back.mockRestore();
  src.mockRestore();
});
