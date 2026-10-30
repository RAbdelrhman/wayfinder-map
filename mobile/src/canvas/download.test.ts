import { describe, expect, it } from 'vitest';
import { downloadCanvas } from './download';
import type { CanvasStorage } from './download';
import { allowedCanvasNavigation, canvasHost } from './host';
import { embeddedCanvas } from './embed';

function fixture(extra: Record<string, string> = {}) {
  const sources: Record<string, string> = {
    'prototypes/366-replies/index.html': '<script src="config.js"></script>',
    'prototypes/366-replies/config.js': `const W={width:390,height:844};window.CANVAS={ticket:366,title:'Replies',question:'Choose a reply',pages:[{id:'r1',title:'Reply bar',items:[{id:'A',name:'Compose',src:'variants/phone.html?state=compose',...W,note:{idea:'Write',pros:['One step'],cons:['Small']}}]},{id:'r2',title:'Reply page',items:[{id:'B',src:'variants/phone.html?state=confirm',...W}]}]};`,
    'prototypes/366-replies/variants/phone.html': '<!doctype html><html><head><link href="../../../src/ui/styles.css"></head><body><script src="phone.js"></script></body></html>',
    'prototypes/366-replies/variants/phone.js': 'window.loaded=true;',
    'src/ui/styles.css': 'body{color:red}', ...extra,
  };
  const stored = new Map<string, string | Uint8Array>();
  const storage: CanvasStorage = {
    has: path => stored.has(path),
    text: async path => { const value = stored.get(path); if (value === undefined) throw new Error('Missing'); return typeof value === 'string' ? value : new TextDecoder().decode(value); },
    base64: async path => { const value = stored.get(path); if (value === undefined) throw new Error('Missing'); return Buffer.from(value).toString('base64'); },
    write: (path, data) => { stored.set(path, data); }, uri: path => `file:///cache/canvas/${path}`,
  };
  const tree = Object.entries(sources).map(([path, value], index) => ({ path, sha: String(index).padStart(40, '0'), size: new TextEncoder().encode(value).length }));
  const source = { prototypeTree: async () => tree,
    prototypeBlob: async (_repo: string, sha: string) => Buffer.from(sources[tree.find(file => file.sha === sha)?.path ?? ''] ?? '').toString('base64') };
  return { source, storage, stored, tree };
}
const ref = { repo: 'owner/repo', mapNumber: 217, ticket: 366, branch: 'prototype/366-replies', sha: 'a'.repeat(40) };

describe('native canvas downloads', () => {
  it('accepts a directly linked archived board by its config identity, and rejects another ticket’s config', async () => {
    const board = 'prototypes/archived-board/index.html';
    const files = { [board]: '<html></html>', 'prototypes/archived-board/config.js': 'window.CANVAS={ticket:366,pages:[{id:"old",items:[{id:"A",src:"view.html"}]}]};', 'prototypes/archived-board/view.html': '<html></html>' };
    const valid = fixture(files);
    expect((await downloadCanvas(valid.source, valid.storage, { ...ref, board }, new AbortController().signal)).board).toBe(board);
    const foreign = fixture({ ...files, 'prototypes/archived-board/config.js': files['prototypes/archived-board/config.js'].replace('ticket:366', 'ticket:999') });
    await expect(downloadCanvas(foreign.source, foreign.storage, { ...ref, board }, new AbortController().signal)).rejects.toThrow('No canvas');
  });
  it('pins files to a revision, expands real config expressions, preserves variant queries and includes shared assets', async () => {
    const f = fixture();
    const canvas = await downloadCanvas(f.source, f.storage, ref, new AbortController().signal);
    expect(canvas.title).toBe('Replies');
    expect(canvas.pages.map(page => page.id)).toEqual(['r1', 'r2']);
    expect(canvas.pages[0]?.items[0]).toMatchObject({ width: 390, height: 844, src: 'variants/phone.html?state=compose' });
    expect(canvas.notes.A).toContain('One step');
    expect(f.stored.has('src/ui/styles.css')).toBe(true);
    expect(f.stored.has('prototypes/366-replies/variants/phone.js')).toBe(true);
    expect(await f.storage.text('assets.json')).toContain("connect-src 'none'");
    const host = canvasHost(embeddedCanvas(JSON.parse(await f.storage.text('assets.json')), canvas.board, canvas.pages[1]?.items[0]?.src ?? '', 'dark'), 390, 844, 'dark');
    expect(host).toContain('state=confirm&amp;theme=dark');
    expect(host).toContain('sandbox="allow-scripts"');
    expect(host).not.toContain('allow-same-origin');
  });
  it('rejects an unrelated board and incomplete or oversized downloads', async () => {
    const f = fixture();
    await expect(downloadCanvas(f.source, f.storage, { ...ref, board: 'prototypes/999-foreign/index.html' }, new AbortController().signal)).rejects.toThrow('No canvas');
    f.tree[0]!.size = 6 * 1024 * 1024;
    await expect(downloadCanvas(f.source, f.storage, ref, new AbortController().signal)).rejects.toThrow('too large');
    const broken = fixture();
    broken.source.prototypeBlob = async () => '';
    await expect(downloadCanvas(broken.source, broken.storage, ref, new AbortController().signal)).rejects.toThrow('incomplete');
  });
  it('denies external navigation and app-private files outside the package', () => {
    for (const url of ['https://evil.test', 'intent://foo', 'file:///cache/auth/token', 'file:///cache/canvas/%2e%2e/auth/token'])
      expect(allowedCanvasNavigation(url)).toBe(false);
    expect(allowedCanvasNavigation('file:///cache/canvas/variants/phone.html?state=1')).toBe(false);
    expect(allowedCanvasNavigation('data:text/html;charset=utf-8,%3Chtml%3E?state=1')).toBe(true);
  });
});
