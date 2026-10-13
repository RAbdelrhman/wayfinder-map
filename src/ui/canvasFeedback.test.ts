// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanvasFeedback } from './canvasFeedback.js';
import type { FeedbackContext } from './canvasFeedback.js';
import { setTrustedHtml } from './trustedHtml.js';

const SHA = 'a'.repeat(40);
const URL_ = `/proto/octo/repo/prototype%2F42-home/${SHA}/viewer-7/prototypes/42/index.html`;
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
