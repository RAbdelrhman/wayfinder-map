// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanvasFeedback } from './canvasFeedback.js';
import type { FeedbackContext } from './canvasFeedback.js';
import { PROTOTYPE_HOST_VERSION } from '../prototypes.js';
import { setTrustedHtml } from './trustedHtml.js';
import { Window } from 'happy-dom';
import { resetShortcuts, saveShortcut } from '../canvasShortcuts.js';

const SHA = 'a'.repeat(40);
const URL_ = `/proto/octo/repo/prototype%2F42-home/${SHA}/${PROTOTYPE_HOST_VERSION}/prototypes/42/index.html`;
const variants = [
  { id: 'A', name: 'Greeting' },
  { id: 'B', name: 'Split hero' },
];

function mount(overrides: Partial<FeedbackContext>) {
  const context: FeedbackContext = {
    url: URL_,
    title: '#42 Home',
    ticket: 42,
    pick: 43,
    variants,
    variant: null,
    source: 'dom',
    pages: [{ id: 'home', title: 'Home', options: variants }],
    page: 'home',
    option: 'B',
    size: 'full',
    ...overrides,
  };
  document.body.replaceChildren();
  const viewer = document.createElement('section');
  viewer.id = 'canvas-viewer';
  setTrustedHtml(viewer, '<div id="vw-toolbar"></div><div class="vw-stage"><div class="vw-canvas"></div><aside id="vw-feedback" hidden></aside></div>');
  document.body.append(viewer);
  const toolbar = viewer.querySelector<HTMLElement>('#vw-toolbar')!;
  const send = vi.fn<(message: Record<string, unknown>) => void>();
  const post = vi.fn(async (_url: string, _body: unknown): Promise<unknown> => ({ url: 'https://github.com/octo/repo/issues/42#issuecomment-1' }));
  const feedback: CanvasFeedback = new CanvasFeedback(
    {
      context: () => context,
      send,
      repaintToolbar: () => {
        const parts = feedback.toolbarParts(context.size);
        setTrustedHtml(toolbar, parts.bar + parts.row + parts.tabs);
      },
      post,
    },
    viewer.querySelector<HTMLElement>('.vw-canvas')!,
    viewer.querySelector<HTMLElement>('#vw-feedback')!,
  );
  const repaint = (): void => {
    const parts = feedback.toolbarParts(context.size);
    setTrustedHtml(toolbar, parts.bar + parts.row + parts.tabs);
    feedback.paint();
  };
  repaint();
  const $ = <T extends Element = HTMLElement>(selector: string): T | null => document.querySelector<T>(selector);
  const click = (selector: string): void => {
    const el = $(selector);
    if (!el) throw new Error(`No ${selector}`);
    (el as HTMLElement).click();
  };
  const type = (selector: string, value: string): void => {
    const el = $<HTMLTextAreaElement>(selector)!;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const key = (k: string, target: Element = document.body): boolean =>
    feedback.key(Object.defineProperty(new KeyboardEvent('keydown', { key: k }), 'target', { value: target }));
  return { context, feedback, send, post, $, click, type, key, repaint };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('scrolling without changed feedback', () => {
  it('keeps saved hints, exact modifier handlers and nested canvas keys consistent without firing in text', async () => {
    vi.stubGlobal('localStorage', new Window().localStorage);
    try {
      const view = mount({});
      await saveShortcut('element', 'Shift+Q');
      await saveShortcut('panel', 'Shift+F');
      view.repaint();
      expect(view.$('[data-fb-tool="element"]')?.getAttribute('aria-keyshortcuts')).toBe('Shift+Q');
      expect(view.$('[data-fb-act="panel"]')?.getAttribute('title')).toBe('Feedback panel (Shift+F)');
      expect(view.key('E')).toBe(false);
      expect(view.key('q')).toBe(false);
      const event = new KeyboardEvent('keydown', { key: 'q', shiftKey: true });
      expect(view.feedback.key(event)).toBe(true);
      expect(view.$('[data-fb-tool="element"]')?.getAttribute('aria-pressed')).toBe('true');
      view.feedback.canvasKey('Shift+Q');
      expect(view.$('[data-fb-tool="element"]')?.getAttribute('aria-pressed')).toBe('false');
      const editable = document.createElement('div');
      editable.contentEditable = 'true';
      const child = document.createElement('span');
      editable.append(child);
      document.body.append(editable);
      for (const target of [child, document.createElement('input'), document.createElement('textarea')]) {
        const typed = Object.defineProperty(new KeyboardEvent('keydown', { key: 'q', shiftKey: true }), 'target', { value: target });
        expect(view.feedback.key(typed)).toBe(false);
      }
      await resetShortcuts();
      view.repaint();
      expect(view.$('[data-fb-tool="element"]')?.getAttribute('aria-keyshortcuts')).toBe('E');
      expect(view.key('E')).toBe(true);
    } finally { vi.unstubAllGlobals(); }
  });
  it('keeps the board hint mounted across layout messages and updates it when the context changes', () => {
    const view = mount({ option: null });
    const hint = view.$('.cf-hint');
    expect(hint).not.toBeNull();
    const observer = new MutationObserver(() => undefined);
    observer.observe(view.$('.cf-layer')!, { childList: true, subtree: true });
    for (let i = 0; i < 60; i++)
      view.feedback.onLayout([], { left: 0, top: 0, width: 800, height: 600 });
    expect(view.$('.cf-hint')).toBe(hint);
    expect(observer.takeRecords()).toHaveLength(0);
    view.context.option = 'B';
    view.repaint();
    expect(view.$('.cf-hint')).toBeNull();
    observer.disconnect();
  });
});

describe('D4 without the bridge: notes only, with the option chooser', () => {
  it('turns off pins, elements and colours, and posts notes on the chosen option without errors', async () => {
    const view = mount({ source: 'none', pages: [], page: null, option: null });
    const why = 'This canvas did not answer, so Wayfinder cannot tell where you are pointing.';
    for (const tool of ['pin', 'element', 'color']) {
      const button = view.$(`[data-fb-tool="${tool}"]`)!;
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(button.getAttribute('title')).toBe(why);
    }
    expect(view.$('[data-fb-tool="note"]')!.hasAttribute('aria-disabled')).toBe(false);
    expect(view.$('.cf-chip.is-warn')!.textContent).toBe('Notes only: this canvas did not answer');
    expect(view.$('.cf-banner')!.textContent).toContain('Notes still work on a whole option or the whole page.');

    view.click('[data-fb-tool="pin"]');
    expect(view.$('[data-fb-capture]')).toBeNull();
    expect(view.$('.cf-hint')!.textContent).toContain(why);
    expect(view.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'hitTest' }));

    const chooser = view.$<HTMLSelectElement>('[data-fb-cur]')!;
    expect(chooser.closest('label')!.textContent).toContain('Which option is showing? This canvas does not say.');
    expect([...chooser.options].map((option) => option.value)).toEqual(['A', 'B']);
    chooser.value = 'B';
    chooser.dispatchEvent(new Event('change', { bubbles: true }));
    expect(view.key('n')).toBe(true);
    view.type('#vw-feedback [data-fb-note]', 'Too tall.');
    view.click('[data-fb-addnote=""]');
    view.type('#vw-feedback .cf-group [data-fb-note]', 'Too much padding.');

    view.click('[data-fb-act="panel-review"]');
    expect(view.$('#vw-feedback h2')!.textContent).toBe('Review before posting');
    view.click('[data-fb-act="post"]');
    await vi.waitFor(() => expect(view.$('#vw-feedback h2')!.textContent).toBe('Posted to #42'));
    expect(view.post).toHaveBeenCalledOnce();
    const [url, body] = view.post.mock.calls[0]!;
    expect(url).toBe('/api/repos/octo/repo/canvas-notes');
    expect(body).toMatchObject({ ticket: 42 });
    const comment = (body as { body: string }).body;
    expect(comment).toContain('`prototype/42-home` @ `aaaaaaa` · `prototypes/42/index.html`');
    expect(comment).toContain('1. **Whole page**, note: Too much padding.');
    expect(comment).toContain('2. **B · Split hero**, note on the whole option: Too tall.');
    expect(view.$('#vw-feedback')!.textContent).toContain('make the pick in the T3 Code thread for #43');
    expect(view.$('.cf-chip.is-ok')!.textContent).toBe('Posted to #42');
  });

  it('keeps the notes and says why when GitHub refuses the comment', async () => {
    const view = mount({ source: 'none', pages: [], page: null, option: null });
    view.post.mockRejectedValueOnce(new Error('HTTP 403.'));
    view.key('n');
    view.type('#vw-feedback [data-fb-note]', 'Too tall.');
    view.click('[data-fb-act="panel-review"]');
    view.click('[data-fb-act="post"]');
    await vi.waitFor(() => expect(view.$('[role="alert"]')).not.toBeNull());
    expect(view.$('[role="alert"]')!.textContent).toBe("Couldn't post to #42: HTTP 403. Your notes are still here; try again.");
    expect(view.$('#vw-feedback h2')!.textContent).toBe('Review before posting');
  });
});

describe('D4 with the bridge', () => {
  it('drops a pin where the canvas says, tracks it, and writes its page, option and place', () => {
    const view = mount({});
    view.click('[data-fb-tool="pin"]');
    expect(view.$('[data-fb-tool="pin"]')!.getAttribute('aria-pressed')).toBe('true');
    view.$<HTMLElement>('[data-fb-capture]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 100, clientY: 80 }));
    const hitTest = view.send.mock.calls.map(([message]) => message).find((message) => message['type'] === 'hitTest')!;
    expect(hitTest).toMatchObject({ x: 100, y: 80 });
    view.feedback.onHit({ requestId: hitTest['requestId'] as number, x: 0.25, y: 0.5, name: 'Continue card', selector: '#go', color: '#2f6fd0', rect: null });

    expect(view.send).toHaveBeenLastCalledWith({ type: 'marks', marks: [{ id: 1, x: 0.25, y: 0.5 }] });
    view.feedback.onLayout([{ id: 1, rect: { left: 100, top: 80, width: 0, height: 0 } }], { left: 0, top: 0, width: 800, height: 600 });
    const pin = view.$<HTMLElement>('.cf-pin')!;
    expect(pin.style.left).toBe('100px');
    expect(pin.getAttribute('aria-label')).toBe('Pin 1 · on Continue card: no note yet. Arrow keys move it.');
    expect(view.$('.cf-pop b')!.textContent).toBe('Pin 1 · on Continue card');
    view.type('.cf-pop [data-fb-note]', 'Too tall.');
    expect(view.$<HTMLTextAreaElement>('#vw-feedback [data-fb-note="1"]')!.value).toBe('Too tall.');

    const comment = view.feedback.comment();
    expect(comment).toContain('`prototype/42-home` @ `aaaaaaa` · page **Home**');
    expect(comment).toContain('1. **B · Split hero**, pin on "Continue card": Too tall.');
    expect(comment).toContain('{"type":"pin","page":"home","option":"B","x":0.25,"y":0.5,"near":"Continue card","note":"Too tall."}');
  });

  it('picks an element’s colour and suggests another', () => {
    const view = mount({});
    view.click('[data-fb-tool="color"]');
    view.$<HTMLElement>('[data-fb-capture]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }));
    const hitTest = view.send.mock.calls.map(([message]) => message).find((message) => message['type'] === 'hitTest')!;
    expect(hitTest['palette']).toBe(true);
    view.feedback.onHit({
      requestId: hitTest['requestId'] as number,
      x: 0,
      y: 0,
      name: 'Continue button',
      selector: '#go',
      color: '#2f6fd0',
      rect: { left: 0, top: 0, width: 120, height: 40 },
      palette: [['#2f6fd0', 'Continue button']],
    });
    const value = view.$<HTMLInputElement>('[data-fb-colorval]')!;
    value.value = 'rgb(22, 89, 168)';
    value.dispatchEvent(new Event('input', { bubbles: true }));
    expect(view.feedback.comment()).toContain('colour of "Continue button": `#2f6fd0` → `#1659a8`');
    expect(view.$('[data-fb-swatch][data-fb-color="#2f6fd0"]')).not.toBeNull();
  });

  it('waits for an open option before pins, and keeps tool keys out of text fields', () => {
    const view = mount({ option: null });
    expect(view.$('[data-fb-tool="pin"]')!.getAttribute('title')).toBe('Open an option first');
    expect(view.$('.cf-hint')!.textContent).toBe('Open an option to pin it. Notes work here too.');
    view.key('n');
    const note = view.$<HTMLTextAreaElement>('#vw-feedback [data-fb-note]')!;
    expect(view.key('p', note)).toBe(false);
    expect(view.key('f')).toBe(true);
    expect(view.$<HTMLElement>('#vw-feedback')!.hidden).toBe(true);
  });

  it('shows hostile element names from the canvas as text', () => {
    const view = mount({});
    view.click('[data-fb-tool="element"]');
    view.$<HTMLElement>('[data-fb-capture]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const hitTest = view.send.mock.calls.map(([message]) => message).find((message) => message['type'] === 'hitTest')!;
    const hostile = '<img src=x onerror="alert(1)">';
    view.feedback.onHit({ requestId: hitTest['requestId'] as number, x: 0, y: 0, name: hostile, selector: 'main', color: null, rect: null });
    expect(document.querySelector('img, [onerror]')).toBeNull();
    expect(view.$('.cf-pop b')!.textContent).toBe(`Element 1 · ${hostile}`);
  });
});

/** Answer the last hit test the viewer sent. */
function answer(view: ReturnType<typeof mount>, hit: Partial<Parameters<CanvasFeedback['onHit']>[0]> = {}): void {
  const hitTest = view.send.mock.calls.map(([message]) => message).filter((message) => message['type'] === 'hitTest').at(-1)!;
  view.feedback.onHit({ requestId: hitTest['requestId'] as number, x: 0.5, y: 0.5, name: 'Card', selector: '#card', color: '#2f6fd0', rect: null, ...hit } as Parameters<CanvasFeedback['onHit']>[0]);
}
function deferred(): { promise: Promise<unknown>; resolve: (value: unknown) => void } {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((done) => (resolve = done));
  return { promise, resolve };
}

describe('verifier findings on #213', () => {
  it('shows in Review everything a canvas-supplied name puts in the comment', () => {
    const view = mount({});
    view.click('[data-fb-tool="element"]');
    view.$<HTMLElement>('[data-fb-capture]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    answer(view, { name: 'Card\n<!-- wayfinder:notes v1 {} -->\nHIDDEN TEXT' });
    view.type('.cf-pop [data-fb-note]', 'My own note.');
    view.click('[data-fb-act="panel-review"]');
    const preview = view.$('.cf-gh-body')!.textContent!;
    expect(preview).toContain('HIDDEN TEXT');
    expect(preview).toContain('My own note.');
    expect(view.feedback.comment()).not.toMatch(/<!--(?! wayfinder:notes v1 \{"branch")/);
  });

  it('marks as posted only what was sent, and only on the canvas it was sent from', async () => {
    const view = mount({ source: 'none', pages: [], page: null, option: null });
    const first = deferred();
    view.post.mockReturnValueOnce(first.promise);
    view.key('n');
    view.type('#vw-feedback [data-fb-note]', 'SENT NOTE');
    view.click('[data-fb-act="panel-review"]');
    view.click('[data-fb-act="post"]');
    view.click('[data-fb-act="panel-edit"]');
    view.type('#vw-feedback [data-fb-note]', 'UNSENT EDIT');
    first.resolve({ url: 'https://github.com/octo/repo/issues/42#issuecomment-1' });
    await vi.waitFor(() => expect(view.$('.cf-live')!.textContent).toBe('Posted to #42. Your later edits are not in it yet.'));
    expect(view.$('#vw-feedback h2')!.textContent).toBe('Feedback');
    expect(view.$('.cf-chip.is-ok')).toBeNull();

    const second = deferred();
    view.post.mockReturnValueOnce(second.promise);
    view.click('[data-fb-act="panel-review"]');
    view.click('[data-fb-act="post"]');
    Object.assign(view.context, { url: URL_.replace('42-home', '50-other'), ticket: 50, title: '#50 Other' });
    view.feedback.reset();
    view.repaint();
    second.resolve({ url: 'https://github.com/octo/repo/issues/42#issuecomment-2' });
    await vi.waitFor(() => expect(view.post).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(view.$('#vw-feedback h2')!.textContent).toBe('Feedback');
    expect(view.$('.cf-chip.is-ok')).toBeNull();
    expect((view.post.mock.calls[1]![1] as { ticket: number }).ticket).toBe(42);
  });

  it('drops a hit answer that arrives after the option changed', () => {
    const view = mount({});
    view.click('[data-fb-tool="pin"]');
    view.$<HTMLElement>('[data-fb-capture]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    view.context.option = 'A';
    view.feedback.stateChanged();
    answer(view);
    expect(view.feedback.comment()).not.toContain('"type":"pin"');
  });

  it('repaints with the hue slider focused', () => {
    const view = mount({});
    view.click('[data-fb-tool="color"]');
    view.$<HTMLElement>('[data-fb-capture]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    answer(view, { palette: [['#2f6fd0', 'Card']] });
    const hue = view.$<HTMLInputElement>('[data-fb-hue]')!;
    hue.focus();
    hue.value = '120';
    expect(() => hue.dispatchEvent(new Event('change', { bubbles: true }))).not.toThrow();
  });

  it('keeps a focused pin focused when the canvas lays it out again', () => {
    const view = mount({});
    view.click('[data-fb-tool="pin"]');
    view.$<HTMLElement>('[data-fb-capture]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    answer(view);
    view.click('[data-fb-act="done"]');
    const layout = (top: number): void => view.feedback.onLayout([{ id: 1, rect: { left: 10, top, width: 0, height: 0 } }], { left: 0, top: 0, width: 800, height: 600 });
    layout(50);
    expect(view.$<HTMLElement>('.cf-pin')!.style.top).toBe('50px');
    view.$<HTMLElement>('.cf-pin')!.focus();
    layout(60);
    expect(view.$<HTMLElement>('.cf-pin')!.style.top).toBe('60px');
    expect(document.activeElement?.getAttribute('data-fb-mark')).toBe('1');
  });

  it('gives each moved pin its own answer, whatever order the answers arrive in', async () => {
    vi.useFakeTimers();
    try {
      const view = mount({});
      view.click('[data-fb-tool="pin"]');
      for (const x of [0.1, 0.6]) {
        view.$<HTMLElement>('[data-fb-capture]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        answer(view, { x, y: 0.5, name: `Start ${String(x)}` });
        view.click('[data-fb-act="done"]');
        view.click('[data-fb-tool="pin"]');
        view.click('[data-fb-tool="pin"]');
      }
      view.feedback.onLayout(
        [
          { id: 1, rect: { left: 10, top: 10, width: 0, height: 0 } },
          { id: 2, rect: { left: 300, top: 10, width: 0, height: 0 } },
        ],
        { left: 0, top: 0, width: 800, height: 600 },
      );
      const asks: number[] = [];
      for (const id of [1, 2]) {
        view.key('ArrowRight', view.$(`[data-fb-mark="${String(id)}"]`)!);
        await vi.advanceTimersByTimeAsync(250);
        asks.push(view.send.mock.calls.map(([message]) => message).filter((message) => message['type'] === 'hitTest').at(-1)!['requestId'] as number);
      }
      const reply = (requestId: number, x: number, name: string): void =>
        view.feedback.onHit({ requestId, x, y: 0.4, name, selector: null, color: null, rect: null });
      reply(asks[1]!, 0.7, 'Second');
      reply(asks[0]!, 0.2, 'First');
      const pins = JSON.parse(view.feedback.comment().split('wayfinder:notes v1 ')[1]!.replace(/ -->$/, '')).pins as { x: number; near: string }[];
      expect(pins.map((pin) => [pin.near, pin.x])).toEqual([
        ['First', 0.2],
        ['Second', 0.7],
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets Tab and Enter pick an element the canvas named, and keeps focus as the canvas moves', () => {
    const view = mount({ size: 'pane' });
    view.click('[data-fb-tool="element"]');
    expect(view.send).toHaveBeenCalledWith({ type: 'targets' });
    expect(view.$('.cf-hint')!.textContent).toBe('Hover or Tab to an element, then click or press Enter. Esc stops.');
    view.$<HTMLElement>('[data-fb-capture]')!.focus();
    const layout = (): void => view.feedback.onLayout([], { left: 0, top: 0, width: 800, height: 600 });
    layout();
    expect(document.activeElement?.hasAttribute('data-fb-capture')).toBe(true);
    view.feedback.onTargets([{ name: 'Continue card', selector: '#continue', rect: { left: 100, top: 40, width: 200, height: 80 } }]);
    const target = view.$<HTMLButtonElement>('[data-fb-target="#continue"]')!;
    expect(target.getAttribute('aria-label')).toBe('Select Continue card');
    target.focus();
    layout();
    expect(document.activeElement?.getAttribute('data-fb-target')).toBe('#continue');
    view.send.mockClear();
    view.click('[data-fb-target="#continue"]');
    expect(view.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'hitTest', x: 200, y: 80 }));
  });

  it('picks the target clicked, and keeps its focus when scrolling drops others, even with repeated names', () => {
    const view = mount({ size: 'pane' });
    view.click('[data-fb-tool="element"]');
    view.feedback.onLayout([], { left: 0, top: 0, width: 800, height: 600 });
    const save = (n: number, left: number) => ({ name: 'Save', selector: `main > button:nth-of-type(${String(n)})`, rect: { left, top: 20, width: 100, height: 30 } });
    const second = '[data-fb-target="main > button:nth-of-type(2)"]';
    view.feedback.onTargets([{ name: 'Off screen', selector: '#far', rect: { left: 1000, top: 20, width: 100, height: 30 } }, save(1, 0), save(2, 100), save(3, 300)]);
    view.$<HTMLElement>(second)!.focus();
    // The first Save scrolled away: the second keeps its identity and its focus.
    view.feedback.onTargets([save(2, 100), save(3, 300)]);
    expect(document.activeElement?.getAttribute('data-fb-target')).toBe('main > button:nth-of-type(2)');
    view.send.mockClear();
    view.click(second);
    expect(view.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'hitTest', x: 150, y: 35 }));
  });

  it('keeps a pin where it was moved last, whatever order its answers arrive in', async () => {
    vi.useFakeTimers();
    try {
      const view = mount({});
      view.click('[data-fb-tool="pin"]');
      view.$<HTMLElement>('[data-fb-capture]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      answer(view, { x: 0.1, name: 'Start' });
      view.click('[data-fb-act="done"]');
      view.feedback.onLayout([{ id: 1, rect: { left: 10, top: 10, width: 0, height: 0 } }], { left: 0, top: 0, width: 800, height: 600 });
      const asks: number[] = [];
      for (let i = 0; i < 2; i++) {
        view.key('ArrowRight', view.$('[data-fb-mark="1"]')!);
        await vi.advanceTimersByTimeAsync(250);
        asks.push(view.send.mock.calls.map(([message]) => message).filter((message) => message['type'] === 'hitTest').at(-1)!['requestId'] as number);
      }
      const reply = (requestId: number, x: number, name: string): void => view.feedback.onHit({ requestId, x, y: 0.4, name, selector: null, color: null, rect: null });
      reply(asks[1]!, 0.12, 'Latest');
      reply(asks[0]!, 0.11, 'Old');
      expect(view.feedback.comment()).toContain('"x":0.12,"y":0.4,"near":"Latest"');
    } finally {
      vi.useRealTimers();
    }
  });

  it('puts the selection layer above existing marks, as D4 does, so a marked element can be picked again', async () => {
    const { readFile } = await import('node:fs/promises');
    const css = await readFile(`${process.cwd()}/src/ui/styles.css`, 'utf8');
    const literal = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const z = (selector: string): number => Number(new RegExp(`${literal(selector)} \\{[^}]*z-index: (\\d+)`).exec(css)?.[1]);
    expect(z('.vw-canvas.is-selecting .cf-capture')).toBeGreaterThan(z('.cf-pin'));
    expect(z('.cf-target')).toBeGreaterThan(z('.cf-el'));
  });

  it('takes tool keys the canvas left alone while focus was inside it', () => {
    const view = mount({});
    view.feedback.canvasKey('E');
    expect(view.$('[data-fb-tool="element"]')!.getAttribute('aria-pressed')).toBe('true');
    view.feedback.canvasKey('F');
    expect(view.$<HTMLElement>('#vw-feedback')!.hidden).toBe(true);
  });

  it('offers a snapshot pin only the canvas’s options, starting on the one the tile opened', () => {
    const view = mount({ source: 'page', pages: [], page: null, option: null, variant: 'B' });
    view.click('[data-fb-tool="pin"]');
    view.$<HTMLElement>('[data-fb-capture]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    answer(view, { name: null, selector: null, rect: null });
    const select = view.$<HTMLSelectElement>('[data-fb-option]')!;
    expect([...select.options].map((option) => option.value)).toEqual(['A', 'B']);
    expect(select.value).toBe('B');
  });
});
