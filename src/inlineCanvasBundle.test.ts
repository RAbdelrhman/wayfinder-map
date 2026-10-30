import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import { bundleInlineCanvas, inlineCanvasDocument } from './inlineCanvasBundle.js';
import { setTrustedHtml } from './ui/trustedHtml.js';

const entry = 'prototypes/42/index.html';
const files: Record<string, string> = {
  [entry]: '<html><head><script src="config.js"></script><script src="../canvas/canvas.js"></script></head><body><div id="stage"></div><div id="present-view"><aside id="side-note">Popup</aside><button id="notes">Notes</button></div><aside class="note">Board note</aside></body></html>',
  'prototypes/42/config.js': 'window.CANVAS={ticket:42,pages:[{id:"home",title:"Home",sections:[{items:[{id:"A",src:"variants/a.html?s=compose"}]}]}]};',
  'prototypes/canvas/canvas.js': 'function loadFrame(frame, item, present) { frame.src = item.src; }',
  'prototypes/42/variants/a.html': '<html><head><link rel="stylesheet" href="a.css"></head><body><main id="app"></main><script src="a.js"></script></body></html>',
  'prototypes/42/variants/a.css': '#app{color:red}',
  'prototypes/42/variants/a.js': 'document.getElementById("app").textContent=new URLSearchParams(location.search).get("s");',
};

describe('self-contained sandboxed canvas bundle', () => {
  it('collects relative assets at one revision and runs the authored frame with its query', async () => {
    const bundle = await bundleInlineCanvas(entry, async path => { if (!(path in files)) throw new Error(path); return Buffer.from(files[path]!); });
    expect(Object.keys(bundle.files)).toHaveLength(6);
    const html = inlineCanvasDocument(bundle, 'prototypes/42/variants/a.html?s=compose');
    expect(html).not.toContain('src="a.js"');
    const window = new Window();
    setTrustedHtml(window.document.body as unknown as HTMLElement, '<main id="app"></main>');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    for (const script of scripts.slice(0, -1)) window.eval(script[1]!);
    expect(window.document.getElementById('app')?.textContent).toBe('compose');
    // Screens have only their own assets; the engine owns the shared frame factory.
    expect(html).not.toContain('window.__wfDocument=');
    const engine = inlineCanvasDocument(bundle);
    expect(engine).toContain('window.__wfDocument=');
    expect(html).toContain('https://canvas.invalid/prototypes/42/variants/a.html?s=compose');
    expect(html).toContain("location.replace(location.href.split('#')[0]+next.hash)");
    await window.happyDOM.abort();
  });
  it('does not execute config or download foreign assets', async () => {
    const malicious: Record<string, string> = { ...files, 'prototypes/42/config.js': 'window.CANVAS=fetch("https://evil.test/")' };
    await expect(bundleInlineCanvas(entry, async path => Buffer.from(malicious[path]!))).rejects.toThrow('metadata');
    await expect(bundleInlineCanvas(entry, async () => Buffer.from('<script src="https://evil.test/a.js"></script>'))).rejects.toThrow('repository-local');
  });
  it('keeps repo scripts isolated and board notes visible while suppressing the popup', async () => {
    const bundle = await bundleInlineCanvas(entry, async path => Buffer.from(files[path]!));
    const html = inlineCanvasDocument(bundle);
    expect(html).toContain('#present-view #side-note, #present-view #notes { display: none !important; }');
    expect(html).toContain('Board note');
    expect(readFileSync('prototypes/canvas/canvas.css', 'utf8')).toMatch(/#present-view #side-note,\s*#present-view #notes\s*\{\s*display: none !important/);
    expect(html).not.toContain('callServerTool');
  });
  it('bundles generated component sheets without rewriting HTML templates inside scripts', async () => {
    const bundle = await bundleInlineCanvas(entry, async path => Buffer.from(files[path]!));
    const generated = '<html><head><link rel="stylesheet" href="variants/a.css"></head><body><p>Component sheet</p><script>const template=\'<img src="untouched.png">\';</script></body></html>';
    const html = inlineCanvasDocument(bundle, entry, 1, generated);
    expect(html).toContain('#app{color:red}');
    expect(html).toContain('Component sheet');
    expect(html).toContain('<img src="untouched.png">');
    expect(html).toContain('__wfNavigate');
  });
  it('keeps feedback IDs aligned with named styles and generated legacy frame IDs', async () => {
    const legacy: Record<string, string> = { ...files, 'prototypes/42/config.js': 'window.CANVAS={title:"Legacy board",styles:{light:{label:"Light"},dark:{label:"Dark"}},variants:[{kind:"note",text:"Board notes"},{id:"A",name:"Card",kind:"components",styles:["light","dark"]},{kind:"compose"}]};' };
    const bundle = await bundleInlineCanvas(entry, async path => Buffer.from(legacy[path]!));
    expect(bundle.pages[0]?.id).toBe('legacy-board');
    expect(bundle.pages[0]?.items.map(item => item.id)).toEqual(['A-light', 'A-dark', 'compose-2']);
    expect(bundle.pages[0]?.items[0]?.name).toBe('Card · Light');
  });
  it('retains self-contained image data without fetching or replacing it', async () => {
    const bundle = await bundleInlineCanvas(entry, async path => Buffer.from(files[path]!));
    const generated = '<html><head></head><body><img src="data:image/png;base64,aGVsbG8=" alt="Fixture"></body></html>';
    expect(inlineCanvasDocument(bundle, entry, 1, generated)).toContain('src="data:image/png;base64,aGVsbG8="');
  });
});
