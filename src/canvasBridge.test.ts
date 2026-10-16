import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { CANVAS_BRIDGE_SCRIPT, viewerPrototypeBytes } from './canvasBridge.js';
import { readCanvasMessage } from './ui/canvasViewer.js';
import ts from 'typescript';

describe('sandboxed canvas bridge', () => {
  it('distinguishes child Back from Forward and ignores spoofed document messages', () => {
    const listeners = new Map<string, (event: unknown) => void>();
    const parent = { postMessage: vi.fn() };
    const child = {};
    runInNewContext(CANVAS_BRIDGE_SCRIPT, {
      window: { addEventListener: (name: string, fn: (event: unknown) => void) => listeners.set(name, fn) },
      parent,
      location: { href: 'http://localhost/proto/o/r/prototype%2F1/option.html', hash: '' },
      document: { readyState: 'interactive', querySelector: () => null, querySelectorAll: () => [{ contentWindow: child }], addEventListener: vi.fn() },
      URL,
    });
    const visit = (id: string, source: object = child): void => listeners.get('message')?.({ source, data: { wf: 1, type: 'document', id } });
    parent.postMessage.mockClear();
    visit('old');
    visit('new');
    expect(parent.postMessage).not.toHaveBeenCalled();
    visit('old', {});
    expect(parent.postMessage).not.toHaveBeenCalled();
    visit('old');
    expect(parent.postMessage).toHaveBeenCalledWith({ wf: 1, type: 'back' }, '*');
    parent.postMessage.mockClear();
    visit('new');
    expect(parent.postMessage).not.toHaveBeenCalled();
    listeners.get('pageshow')?.({ persisted: true });
    expect(parent.postMessage.mock.calls[0]?.[0]).toMatchObject({ wf: 1, type: 'document' });
  });
  it('uses replacement navigation for option-page anchor tabs and client-side routers', () => {
    const listeners = new Map<string, (event: unknown) => void>();
    const replace = vi.fn(),
      replaceState = vi.fn(),
      pushState = vi.fn();
    const window = { history: { replaceState, pushState }, addEventListener: vi.fn() };
    class Anchor {
      target = '';
      constructor(readonly href: string) {}
      closest(): Anchor {
        return this;
      }
      hasAttribute(): boolean {
        return false;
      }
    }
    runInNewContext(CANVAS_BRIDGE_SCRIPT, {
      window,
      Element: Anchor,
      URL,
      parent: { postMessage: vi.fn() },
      location: { href: 'http://localhost/proto/o/r/prototype%2F1/option.html', hash: '', replace },
      document: { readyState: 'loading', querySelector: () => null, addEventListener: (name: string, fn: (event: unknown) => void) => listeners.set(name, fn) },
    });
    const preventDefault = vi.fn();
    const click = {
      button: 0,
      defaultPrevented: false,
      preventDefault,
      target: new Anchor('http://localhost/proto/o/r/prototype%2F1/option.html#tab-2'),
    };
    listeners.get('click')?.(click);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith(click.target.href);
    window.history.pushState({ tab: 2 }, '', '#tab-2');
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledWith(expect.objectContaining({ tab: 2, wfDocument: expect.any(String) }), '', '#tab-2');
    replace.mockClear();
    preventDefault.mockClear();
    listeners.get('click')?.({ ...click, target: new Anchor('https://example.com/') });
    expect(replace).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });
  it('replaces presentation-frame navigation for page and generated options without setting src/srcdoc', () => {
    const source = viewerPrototypeBytes('canvas.js', readFileSync(new URL('../prototypes/canvas/canvas.js', import.meta.url))).toString();
    const parsed = ts.createSourceFile('canvas.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    let functionSource = '';
    const visit = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === 'loadFrame') functionSource = node.getText(parsed);
      ts.forEachChild(node, visit);
    };
    visit(parsed);
    const replace = vi.fn(),
      setAttribute = vi.fn(),
      removeAttribute = vi.fn();
    const context = {
      frame: { contentWindow: { location: { replace } }, setAttribute, removeAttribute },
      pageSrc: () => 'option.html',
      srcdoc: () => '<html><head></head><body>Components</body></html>',
      esc: (value: string) => value,
      location: { href: 'http://localhost/proto/o/r/prototype%2F1/index.html' },
    };
    runInNewContext(functionSource + '; loadFrame(frame, {kind: "page"}, true); loadFrame(frame, {kind: "components"}, true);', context);
    expect(replace.mock.calls[0]?.[0]).toBe('option.html');
    const data = String(replace.mock.calls[1]?.[0]);
    expect(data).toMatch(/^data:text\/html;charset=utf-8,/);
    const html = decodeURIComponent(data.slice(data.indexOf(',') + 1));
    expect(html).toContain('<base href="http://localhost/proto/o/r/prototype%2F1/index.html">');
    expect(html).toContain(CANVAS_BRIDGE_SCRIPT);
    expect(setAttribute).not.toHaveBeenCalled();
    expect(removeAttribute).not.toHaveBeenCalled();
  });
  it('supports old configs without page/item IDs, shorthand variants and expanded styles', () => {
    const parent = { postMessage: vi.fn() };
    const config = {
      title: 'Old Canvas',
      variants: [
        { src: 'a.html', styles: ['light', 'dark'] },
        { kind: 'note', name: 'Notes' },
      ],
    };
    runInNewContext(CANVAS_BRIDGE_SCRIPT, {
      window: { CANVAS: config, addEventListener: vi.fn() },
      parent,
      location: { hash: '', href: 'http://127.0.0.1/proto/o/r/prototype%2F1/index.html' },
      document: { readyState: 'interactive', querySelector: () => null, addEventListener: vi.fn() },
      URL,
    });
    const message: unknown = parent.postMessage.mock.calls.find(([value]) => value.type === 'ready')?.[0];
    expect(readCanvasMessage(message)).not.toBeNull();
    expect(message).toMatchObject({
      type: 'ready',
      pages: [{ id: 'old-canvas', options: [{ id: 'page-1-light' }, { id: 'page-1-dark' }] }],
    });
  });
  it('replaces legacy engine hash pushes, without modifying files on disk', () => {
    const original = readFileSync(new URL('../prototypes/canvas/canvas.js', import.meta.url));
    const served = viewerPrototypeBytes('prototypes/canvas/canvas.js', original).toString();
    expect(original.toString()).toContain('location.hash =');
    expect(served).not.toContain('location.hash =');
    expect(served).toContain("location.replace('#' + (encodeURIComponent(page)");
    expect(served).toContain('frame.contentWindow.location.replace(pageSrc(item))');
    expect(served).toContain("frame.contentWindow.location.replace('data:text/html;charset=utf-8,'");
    expect(() => new Function(served)).not.toThrow();
  });
  describe('smooth pan on a canvas board (#214)', () => {
    const inject = (stage: unknown) => {
      const append = vi.fn();
      const style: { textContent?: string } = {};
      runInNewContext(CANVAS_BRIDGE_SCRIPT, {
        window: { CANVAS: { title: 'T', variants: [] }, addEventListener: vi.fn() },
        parent: { postMessage: vi.fn() },
        location: { hash: '', href: 'http://127.0.0.1/proto/o/r/prototype%2F1/index.html' },
        document: {
          readyState: 'interactive',
          querySelector: (selector: string) => (selector === '#stage' ? stage : null),
          createElement: () => style,
          head: { append },
          addEventListener: vi.fn(),
        },
        URL,
      });
      return { append, style };
    };
    it('gives each option frame a compositor layer, so scrolling does not repaint the pages inside', () => {
      const { append, style } = inject({});
      expect(append).toHaveBeenCalledWith(style);
      expect(style.textContent).toBe('#stage .frame { will-change: transform; } #stage.wf-zoomed-in .frame { will-change: auto; }');
    });
    it('leaves snapshots and option pages, which have no board, alone', () => {
      expect(inject(null).append).not.toHaveBeenCalled();
    });
  });
  describe('zoom by transform (#214)', () => {
    const served = (): string =>
      viewerPrototypeBytes('prototypes/canvas/canvas.js', readFileSync(new URL('../prototypes/canvas/canvas.js', import.meta.url))).toString();
    /** Runs the served engine's zoom helper against a stand-in stage. */
    const zoomed = (levels: number[], size = { offsetWidth: 2000, offsetHeight: 3000 }) => {
      const observed: Array<() => void> = [];
      const classes = new Set<string>();
      const stage = { ...size, style: {} as Record<string, string>, dataset: {} as Record<string, string>, classList: { toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)) } };
      const context = { stage, levels, ResizeObserver: class { constructor(callback: () => void) { observed.push(callback); } observe(): void {} }, String, Number, snapshots: [] as unknown[] };
      runInNewContext(
        `${served().slice(0, served().indexOf('/*'))}
         for (const level of levels) { stageZoom(stage, level); snapshots.push({ ...stage.style }); }`,
        context,
      );
      return { stage, classes, snapshots: context.snapshots as Array<Record<string, string>>, observed };
    };
    it('serves the engine with the helper and no CSS zoom assignment', () => {
      const original = readFileSync(new URL('../prototypes/canvas/canvas.js', import.meta.url)).toString();
      expect(original).toContain("$('stage').style.zoom = String(state.zoom);");
      expect(served()).not.toContain("style.zoom = String(");
      expect(served()).toContain("stageZoom($('stage'), state.zoom);");
      expect(() => new Function(served())).not.toThrow();
    });
    it('leaves engines without the zoom line alone', () => {
      const bytes = Buffer.from('(() => { const x = 1; })();');
      expect(viewerPrototypeBytes('canvas.js', bytes).toString()).toBe(bytes.toString());
    });
    it('scales from the top left and pulls the scroll area in while zoomed out', () => {
      const { snapshots } = zoomed([0.5, 1, 1.5]);
      expect(snapshots[0]).toMatchObject({ transform: 'scale(0.5)', transformOrigin: '0 0', marginRight: '-1000px', marginBottom: '-1500px', zoom: '' });
      expect(snapshots[1]).toMatchObject({ transform: '', marginRight: '', marginBottom: '' });
      expect(snapshots[2]).toMatchObject({ transform: 'scale(1.5)', marginRight: '', marginBottom: '' });
    });
    it('follows the stage as options report their height', () => {
      const { stage, observed } = zoomed([0.5]);
      expect(observed).toHaveLength(1);
      stage.offsetHeight = 4000;
      observed[0]!();
      expect(stage.style['marginBottom']).toBe('-2000px');
    });
    it('holds the pages in layers only at 100% or zoomed out, because a layer keeps the scale it was rastered at', () => {
      const { classes } = zoomed([0.5]);
      expect(classes.has('wf-zoomed-in')).toBe(false);
      expect(zoomed([1]).classes.has('wf-zoomed-in')).toBe(false);
      expect(zoomed([1.25]).classes.has('wf-zoomed-in')).toBe(true);
      expect(zoomed([2, 1]).classes.has('wf-zoomed-in')).toBe(false);
    });
    it('watches the stage once however often it zooms', () => {
      expect(zoomed([0.5, 0.8, 0.5, 1]).observed).toHaveLength(1);
    });
  });
  it('injects only scripts into HTML and does not change other assets', () => {
    const bytes = Buffer.from('<html><body>snapshot</body></html>');
    expect(viewerPrototypeBytes('prototype-snapshot.html', bytes).toString()).toContain(CANVAS_BRIDGE_SCRIPT);
    expect(viewerPrototypeBytes('canvas.css', bytes)).toBe(bytes);
  });
  it('validates the parent and known options; exposes no API operation', () => {
    const listeners = new Map<string, (event?: unknown) => void>();
    const documentListeners = new Map<string, (event?: unknown) => void>();
    const parent = { postMessage: vi.fn() },
      replace = vi.fn();
    const window = {
      CANVAS: { pages: [{ id: 'p', title: 'Page', sections: [{ items: [{ id: 'B', name: 'Blue', src: 'variants/b.html' }] }] }] },
      addEventListener: (name: string, fn: (event?: unknown) => void) => listeners.set(name, fn),
    };
    runInNewContext(CANVAS_BRIDGE_SCRIPT, {
      window,
      parent,
      location: { hash: '#p', href: 'http://127.0.0.1/proto/o/r/prototype%2F1/index.html', replace },
      document: {
        readyState: 'loading',
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: (name: string, fn: (event?: unknown) => void) => documentListeners.set(name, fn),
      },
      URL,
      Element: class {},
    });
    listeners.get('DOMContentLoaded')?.();
    expect(parent.postMessage.mock.calls.find(([message]) => message.type === 'ready')?.[0]).toMatchObject({
      wf: 1,
      type: 'ready',
      source: 'dom',
      pages: [{ id: 'p', options: [{ id: 'B', file: '/proto/o/r/prototype%2F1/variants/b.html' }] }],
    });
    listeners.get('message')?.({ source: {}, data: { wf: 1, type: 'go', page: 'p', option: 'B' } });
    listeners.get('message')?.({ source: parent, data: { wf: 1, type: 'go', page: 'p', option: 'unknown' } });
    listeners.get('message')?.({ source: parent, data: { wf: 1, type: 'fetch', url: '/api/shutdown' } });
    expect(replace).not.toHaveBeenCalled();
    listeners.get('message')?.({ source: parent, data: { wf: 1, type: 'go', page: 'p', option: 'B' } });
    expect(replace).toHaveBeenCalledWith('#p/B');
    documentListeners.get('keydown')?.({ key: 'Escape' });
    expect(parent.postMessage).toHaveBeenLastCalledWith({ wf: 1, type: 'key', key: 'Escape' }, '*');
    // A tool key the canvas left alone goes to the viewer; one the canvas used (P, its page menu) does not.
    listeners.get('keydown')?.({ key: 'e', defaultPrevented: false, target: null });
    expect(parent.postMessage).toHaveBeenLastCalledWith({ wf: 1, type: 'key', key: 'E' }, '*');
    parent.postMessage.mockClear();
    listeners.get('keydown')?.({ key: 'p', defaultPrevented: true, target: null });
    listeners.get('keydown')?.({ key: 'f', ctrlKey: true, defaultPrevented: false, target: null });
    expect(parent.postMessage).not.toHaveBeenCalled();
  });
});
