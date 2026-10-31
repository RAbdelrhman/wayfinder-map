import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountCanvasViewer } from './canvasViewer.js';
import { PROTOTYPE_HOST_VERSION } from '../prototypes.js';
import { setTrustedHtml } from './trustedHtml.js';
import type { PosterLoader } from './canvasPoster.js';

const SHA = 'a'.repeat(40);
const board = (n: number): string => `/proto/octo/repo/prototype%2F${String(n)}-home/${SHA}/${PROTOTYPE_HOST_VERSION}/prototypes/canvas/index.html`;
const entry = (n: number): string =>
  `<a class="entry" href="${board(n)}" data-canvas-url="${board(n)}" data-canvas-title="#${String(n)} Home" data-canvas-github="https://github.com/octo/repo/tree/prototype/${String(n)}">Canvas ${String(n)}</a>`;

const GLOBALS = [
  'document', 'history', 'location', 'navigator', 'localStorage', 'sessionStorage', 'matchMedia', 'innerWidth', 'innerHeight', 'CSS',
  'Node', 'Element', 'HTMLElement', 'HTMLIFrameElement', 'HTMLImageElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLButtonElement',
  'HTMLSelectElement', 'HTMLAnchorElement', 'SVGElement', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'MutationObserver',
  'requestAnimationFrame', 'cancelAnimationFrame',
] as const;

let browser: Window;
/** Each test gets its own window: the viewer registers document and window listeners that cannot be removed. */
function setup(loadPoster?: PosterLoader, withPoster = false): { app: HTMLElement; viewer: HTMLElement } {
  browser = new Window({ url: 'http://127.0.0.1:4479/repos/octo/repo/maps/205', settings: { disableIframePageLoading: true } });
  for (const name of GLOBALS) vi.stubGlobal(name, browser[name]);
  vi.stubGlobal('window', browser);
  const app = document.createElement('div');
  app.id = 'app';
  setTrustedHtml(app, `${entry(42)}${entry(43)}<iframe class="decision-variant-page" tabindex="-1" aria-hidden="true" title=""></iframe>`);
  document.body.append(app);
  if (withPoster) app.querySelector<HTMLElement>('[data-canvas-url]')!.dataset['canvasPoster'] = board(42).replace('index.html', 'assets/poster.webp');
  mountCanvasViewer(app, undefined, loadPoster ? { loadPoster } : {});
  return { app, viewer: document.querySelector<HTMLElement>('#canvas-viewer')! };
}
const on = (target: Element, type: string): void => {
  target.dispatchEvent(new browser.Event(type, { bubbles: true }) as unknown as Event);
};
const entryFor = (app: HTMLElement, n: number): HTMLElement => app.querySelector<HTMLElement>(`[data-canvas-url="${board(n)}"]`)!;
const frames = (): HTMLIFrameElement[] => [...document.querySelectorAll<HTMLIFrameElement>('.vw-frame')];
/** happy-dom does not move focus into an iframe, as a browser does when the page inside calls focus(). */
const focusInto = (element: Element): void => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => element });
  browser.dispatchEvent(new browser.Event('blur'));
};

describe('unprepared loading stage (#304)', () => {
  it('shows named bones synchronously, keeps them on timeout, and replaces them on readiness', () => {
    const { app, viewer } = setup();
    const target = entryFor(app, 42);
    target.dataset['canvasVariants'] = JSON.stringify([{ id: 'A', name: 'Actual <name>' }]);
    target.click();
    expect(viewer.querySelector('.vw-skeleton')?.textContent).toContain('Actual <name>');
    expect(viewer.querySelector('.vw-skeleton .wf-bone')).not.toBeNull();
    vi.advanceTimersByTime(3100);
    expect(viewer.querySelector('.vw-skeleton')).not.toBeNull();
    expect(frames()[0]!.classList.contains('is-ready')).toBe(false);
    on(frames()[0]!, 'load');
    expect(viewer.querySelector('.vw-skeleton')).toBeNull();
    expect(frames()[0]!.classList.contains('is-ready')).toBe(true);
  });

  it('requests a stored poster with its card and keeps the skeleton when decoding fails', async () => {
    const load = vi.fn<PosterLoader>().mockRejectedValue(new Error('invalid image'));
    const { app, viewer } = setup(load, true);
    expect(load).toHaveBeenCalledTimes(1);
    entryFor(app, 42).click();
    await Promise.resolve(); await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    expect(viewer.querySelector('.vw-poster-image')).toBeNull();
    expect(viewer.querySelector('.vw-skeleton')).not.toBeNull();
  });

  it('puts the card-decoded poster on the stage synchronously at an unprepared click', async () => {
    const load = vi.fn<PosterLoader>().mockImplementation(async () => document.createElement('img'));
    const { app, viewer } = setup(load, true);
    await Promise.resolve();
    entryFor(app, 42).click();
    expect(load).toHaveBeenCalledTimes(1);
    expect(viewer.querySelector('.vw-poster-image')).not.toBeNull();
    expect(viewer.querySelector('.vw-skeleton')).not.toBeNull();
  });

  it('puts a decoded poster above the bones and rejects a late poster after live readiness', async () => {
    let decode!: (image: HTMLImageElement) => void;
    const load: PosterLoader = () => new Promise(resolve => { decode = resolve; });
    const { app, viewer } = setup(load);
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    entryFor(app, 42).dataset['canvasPoster'] = board(42).replace('index.html', 'assets/poster.png');
    entryFor(app, 42).click();
    const image = document.createElement('img');
    image.src = board(42).replace('index.html', 'assets/poster.png');
    decode(image);
    await Promise.resolve(); await Promise.resolve();
    expect(viewer.querySelector('.vw-poster-image')).not.toBeNull();
    expect(viewer.querySelector('.vw-skeleton')).not.toBeNull();
    on(frames()[0]!, 'load');
    document.querySelector<HTMLButtonElement>('[data-close]')!.click();
    vi.advanceTimersByTime(300);
    entryFor(app, 43).dataset['canvasPoster'] = board(43).replace('index.html', 'assets/poster.png');
    entryFor(app, 43).click();
    on(frames()[0]!, 'load');
    decode(image);
    await Promise.resolve(); await Promise.resolve();
    expect(viewer.querySelector('.vw-poster-image')).toBeNull();
    expect(viewer.querySelector('.vw-skeleton')).toBeNull();
  });
});

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await browser.happyDOM.close();
});

describe('keyboard focus while the viewer is open', () => {
  it('returns focus to Close when a hidden tile preview takes it, so Esc keeps working', () => {
    const { app } = setup();
    entryFor(app, 42).click();
    const refocus = vi.spyOn(document.querySelector<HTMLElement>('[data-close]')!, 'focus');
    focusInto(app.querySelector('.decision-variant-page')!);
    vi.runAllTimers();
    expect(refocus).toHaveBeenCalledTimes(1);
  });

  it('gives focus back to where it was in the viewer, such as a posted bar’s heading (#322)', () => {
    const { app, viewer } = setup();
    entryFor(app, 42).click();
    const heading = document.createElement('b');
    heading.tabIndex = -1;
    viewer.querySelector('.vw-stage')!.prepend(heading);
    heading.focus();
    const back = vi.spyOn(heading, 'focus');
    const close = vi.spyOn(document.querySelector<HTMLElement>('[data-close]')!, 'focus');
    focusInto(app.querySelector('.decision-variant-page')!);
    vi.runAllTimers();
    expect(back).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it('leaves deliberate focus entry in the canvas itself alone', () => {
    const { app } = setup();
    entryFor(app, 42).click();
    const close = document.querySelector<HTMLElement>('[data-close]')!;
    const refocus = vi.spyOn(close, 'focus');
    Object.defineProperty(document, 'activeElement', { configurable: true, get: () => frames()[0]! });
    browser.dispatchEvent(new browser.MessageEvent('message', { source: frames()[0]!.contentWindow as unknown as Window, data: { wf: 1, type: 'focus-entry' } }));
    focusInto(frames()[0]!);
    vi.runAllTimers();
    expect(refocus).not.toHaveBeenCalled();
  });

  it('does not pull focus anywhere once the viewer is closed', () => {
    const { app } = setup();
    const close = vi.spyOn(HTMLElement.prototype, 'focus');
    focusInto(app.querySelector('.decision-variant-page')!);
    vi.runAllTimers();
    expect(close).not.toHaveBeenCalled();
  });
});

describe('preparing the canvas before the click', () => {
  it('mounts the canvas after a short hover, without opening the viewer or touching history', () => {
    const { app, viewer } = setup();
    const push = vi.spyOn(history, 'pushState');
    on(entryFor(app, 42), 'pointerover');
    expect(frames()).toHaveLength(0);
    vi.advanceTimersByTime(200);
    expect(frames()).toHaveLength(1);
    expect(frames()[0]!.getAttribute('src')).toBe(board(42));
    expect(frames()[0]!.getAttribute('sandbox')).toBe('allow-scripts');
    expect(push).not.toHaveBeenCalled();
    expect(app.inert).toBe(false);
    // Laid out so the canvas can boot at its opening size, but unseen and out of reach.
    expect(viewer.hidden).toBe(false);
    expect(viewer.inert).toBe(true);
    expect(viewer.classList.contains('is-warm')).toBe(true);
  });

  it('opens on the frame it prepared instead of loading the canvas again', () => {
    const { app, viewer } = setup();
    on(entryFor(app, 42), 'pointerover');
    vi.advanceTimersByTime(200);
    const prepared = frames()[0]!;
    entryFor(app, 42).click();
    expect(frames()).toEqual([prepared]);
    expect(viewer.hidden).toBe(false);
    expect(viewer.classList.contains('is-warm')).toBe(false);
    expect(app.inert).toBe(true);
  });

  it('does nothing when the pointer only passes over a tile', () => {
    const { app } = setup();
    on(entryFor(app, 42), 'pointerover');
    vi.advanceTimersByTime(60);
    on(entryFor(app, 42), 'pointerout');
    vi.advanceTimersByTime(500);
    expect(frames()).toHaveLength(0);
  });

  it('prepares at once on pointer down, so a quick tap still gets a head start', () => {
    const { app } = setup();
    on(entryFor(app, 43), 'pointerdown');
    expect(frames()).toHaveLength(1);
    expect(frames()[0]!.getAttribute('src')).toBe(board(43));
  });

  it('prepares on keyboard focus too', () => {
    const { app } = setup();
    on(entryFor(app, 43), 'focusin');
    vi.advanceTimersByTime(200);
    expect(frames()[0]?.getAttribute('src')).toBe(board(43));
  });

  it('keeps the one it has when the same canvas is hovered again', () => {
    const { app } = setup();
    on(entryFor(app, 42), 'pointerover');
    vi.advanceTimersByTime(200);
    const prepared = frames()[0]!;
    on(entryFor(app, 42), 'pointerover');
    vi.advanceTimersByTime(1000);
    expect(frames()).toEqual([prepared]);
  });

  it('does not swap the canvas while the viewer is open', () => {
    const { app } = setup();
    entryFor(app, 42).click();
    const open = frames()[0]!;
    on(entryFor(app, 43), 'pointerover');
    vi.advanceTimersByTime(1000);
    expect(frames()).toEqual([open]);
  });

  it('settles back to hidden once the prepared canvas has loaded', () => {
    const { app, viewer } = setup();
    on(entryFor(app, 42), 'pointerover');
    vi.advanceTimersByTime(200);
    const prepared = frames()[0]!;
    on(prepared, 'load');
    expect(viewer.classList.contains('is-warm')).toBe(false);
    expect(viewer.hidden).toBe(true);
    expect(prepared.classList.contains('is-ready')).toBe(true);
    expect(frames()).toEqual([prepared]);
  });

  it('settles after a few seconds even if the canvas never finishes loading', () => {
    const { app, viewer } = setup();
    on(entryFor(app, 42), 'pointerover');
    vi.advanceTimersByTime(200);
    vi.advanceTimersByTime(3100);
    expect(viewer.hidden).toBe(true);
    expect(viewer.classList.contains('is-warm')).toBe(false);
  });

  it('still settles when the canvas announced itself but a stalled resource keeps it from finishing loading', () => {
    const { app, viewer } = setup();
    on(entryFor(app, 42), 'pointerover');
    vi.advanceTimersByTime(200);
    const prepared = frames()[0]!;
    browser.dispatchEvent(
      Object.assign(new browser.Event('message'), {
        source: prepared.contentWindow,
        data: { wf: 1, type: 'ready', source: 'dom', pages: [] },
      }),
    );
    expect(viewer.classList.contains('is-warm')).toBe(true);
    vi.advanceTimersByTime(3100);
    expect(viewer.classList.contains('is-warm')).toBe(false);
    expect(viewer.hidden).toBe(true);
    expect(viewer.inert).toBe(true);
  });
});
