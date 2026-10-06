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
      document: { readyState: 'loading', addEventListener: (name: string, fn: (event: unknown) => void) => listeners.set(name, fn) },
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
  it('injects only scripts into HTML and does not change other assets', () => {
    const bytes = Buffer.from('<html><body>snapshot</body></html>');
    expect(viewerPrototypeBytes('prototype-snapshot.html', bytes).toString()).toContain(CANVAS_BRIDGE_SCRIPT);
    expect(viewerPrototypeBytes('canvas.css', bytes)).toBe(bytes);
  });
  it('validates the parent and known options; exposes no API operation', () => {
    const listeners = new Map<string, (event?: unknown) => void>();
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
        addEventListener: (name: string, fn: (event?: unknown) => void) => listeners.set(name, fn),
      },
      URL,
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
    listeners.get('keydown')?.({ key: 'Escape' });
    expect(parent.postMessage).toHaveBeenLastCalledWith({ wf: 1, type: 'key', key: 'Escape' }, '*');
  });
});
