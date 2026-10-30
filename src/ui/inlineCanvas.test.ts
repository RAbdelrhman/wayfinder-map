// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, McpUiHostStylesSchema } from '@modelcontextprotocol/ext-apps';
import { mountInlineCanvas, startInlineCanvas } from './inlineCanvas.js';
import type { InlineToolCall } from './inlineCanvas.js';
import type { InlineCanvasSession } from '../inlineCanvasService.js';
import { prototypeFileUrl } from '../prototypes.js';

const sha = 'a'.repeat(40);
const session: InlineCanvasSession = {
  id: '00000000-0000-4000-8000-000000000042',
  repo: 'octo/repo', mapNumber: 20, ticketNumber: 42,
  target: { kind: 'prototype', id: 'test-id', canvas: 'prototypes/42/index.html', revision: sha },
  route: { url: prototypeFileUrl('octo/repo', 'prototype/42', 'prototypes/42/index.html', sha), title: '#42 Home', github: 'https://github.com/octo/repo/issues/42', file: null, ticket: 42 },
  bundle: { entry: 'prototypes/42/index.html', files: { 'prototypes/42/index.html': '<html><head></head><body>Canvas</body></html>' }, bridge: '', pages: [{ id: 'home', title: 'Home', round: null, items: [{ id: 'A', name: 'First', src: 'a.html', disposition: null, feedback: null, basedOn: [] }] }] },
};
const disposers: (() => void)[] = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount() {
  const call = vi.fn<InlineToolCall>(async () => ({ url: 'https://github.com/octo/repo/issues/42#issuecomment-123', handOffId: null }));
  disposers.push(mountInlineCanvas(session, call, vi.fn()));
  const frame = document.querySelector('iframe')!;
  const message = (data: unknown, source: MessageEventSource | null = frame.contentWindow) => window.dispatchEvent(new MessageEvent('message', { data, source }));
  message({ wf: 1, type: 'ready', source: 'engine', pages: [{ id: 'home', title: 'Home', options: [{ id: 'A', name: 'First', file: 'a.html' }] }] });
  message({ wf: 1, type: 'state', page: 'home', option: 'A', presenting: true });
  const click = (selector: string) => { const target = document.querySelector<HTMLElement>(selector); if (!target) throw new Error(selector); target.click(); };
  return { frame, message, call, click };
}
describe('trusted inline feedback controls', () => {
  it('reuses Review/Post and reports success only after the save tool responds', async () => {
    const view = mount();
    expect(view.frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(view.frame.classList.contains('is-ready')).toBe(true);
    expect(view.frame.srcdoc).not.toContain('callServerTool');
    view.click('[data-fb-tool="note"]');
    const field = document.querySelector<HTMLTextAreaElement>('#vw-feedback [data-fb-note]')!;
    field.value = 'Saved from the inline canvas';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    view.click('[data-fb-act="panel-review"]');
    let complete!: (value: { url: string; handOffId: null }) => void;
    view.call.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    view.click('[data-fb-act="post"]');
    expect(document.body.textContent).not.toContain('Posted to GitHub · #42');
    expect(view.call).toHaveBeenCalledWith('post_canvas_feedback', expect.objectContaining({ session: session.id, body: expect.stringContaining('Saved from the inline canvas') }));
    complete({ url: 'https://github.com/octo/repo/issues/42#issuecomment-123', handOffId: null });
    await vi.waitFor(() => expect(document.body.textContent).toContain('Posted to GitHub · #42'));
    expect(view.call).toHaveBeenCalledOnce();
  });
  it('ignores forged tool calls from prototypes and state messages from unrelated windows', () => {
    const view = mount();
    view.message({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'post_canvas_feedback', arguments: { session: session.id } } });
    view.message({ wf: 1, type: 'state', page: 'other', option: 'evil', presenting: true }, window);
    expect(view.call).not.toHaveBeenCalled();
    expect(document.querySelector('[data-go="A"]')?.getAttribute('aria-pressed')).toBe('true');
  });
  it('handles annotation replies without sending marks back and creating a layout echo', () => {
    const view = mount();
    const post = vi.spyOn(view.frame.contentWindow!, 'postMessage');
    view.message({ wf: 1, type: 'layout', marks: [], viewport: { left: 0, top: 0, width: 390, height: 600 } });
    view.message({ wf: 1, type: 'targets', items: [] });
    view.message({ wf: 1, type: 'hit', requestId: 999, miss: true });
    expect(post).not.toHaveBeenCalled();
  });
  it('posts without randomUUID and retains the request ID after a failed mobile save', async () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    vi.stubGlobal('innerWidth', 390);
    const view = mount();
    view.click('[data-fb-tool="note"]');
    const field = document.querySelector<HTMLTextAreaElement>('#vw-feedback [data-fb-note]')!;
    field.value = 'Mobile sandbox feedback';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    view.click('[data-fb-act="panel-review"]');
    view.call.mockRejectedValueOnce(new Error('Host rejected the first request'));
    view.click('[data-fb-act="post"]');
    await vi.waitFor(() => expect(document.body.textContent).toContain('Host rejected the first request'));
    const firstId = view.call.mock.calls[0]?.[1]['requestId'];
    expect(firstId).toMatch(/^[0-9a-f]{32}$/);
    view.click('[data-fb-act="post"]');
    await vi.waitFor(() => expect(document.body.textContent).toContain('Posted to GitHub'));
    expect(view.call.mock.calls[1]?.[1]['requestId']).toBe(firstId);
  });
  it.each(['pin', 'element', 'color'] as const)('sends bridge-compatible %s requests and posts the resulting mobile annotation', async tool => {
    vi.stubGlobal('innerWidth', 390);
    const view = mount();
    const post = vi.spyOn(view.frame.contentWindow!, 'postMessage');
    view.click(`[data-fb-tool="${tool}"]`);
    if (tool !== 'pin') expect(post).toHaveBeenCalledWith({ wf: 1, type: 'targets' }, '*');
    document.querySelector('[data-fb-capture]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 40, clientY: 50 }));
    const request = post.mock.calls.find(([message]) => message?.type === 'hitTest')?.[0] as { wf?: number; requestId: number } | undefined;
    expect(request).toMatchObject({ wf: 1, type: 'hitTest', x: 40, y: 50 });
    view.message({ wf: 1, type: 'hit', requestId: request!.requestId, x: 0.1, y: 0.2, name: 'Hero', selector: '[data-wf="hero"]', color: '#336699', rect: { left: 10, top: 10, width: 100, height: 40 } });
    view.click('[data-fb-tab="feedback"]');
    view.click('[data-fb-act="panel-review"]');
    view.click('[data-fb-act="post"]');
    await vi.waitFor(() => expect(view.call).toHaveBeenCalledWith('post_canvas_feedback', expect.objectContaining({ body: expect.stringContaining(`"type":"${tool}"`) })));
    await vi.waitFor(() => expect(document.body.textContent).toContain('Posted to GitHub'));
  });
  it('applies the handshake theme and style variables before a later host-context change', async () => {
    vi.spyOn(App.prototype, 'connect').mockResolvedValue(undefined);
    const changed = vi.spyOn(App.prototype, 'onhostcontextchanged', 'set');
    const styles = (color: string) => ({ variables: McpUiHostStylesSchema.parse({ variables: { '--color-text-primary': color } }).variables! });
    vi.spyOn(App.prototype, 'getHostContext').mockReturnValue({ theme: 'dark', styles: styles('#abcdef') });
    await startInlineCanvas();
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(document.documentElement.style.getPropertyValue('--color-text-primary')).toBe('#abcdef');
    changed.mock.calls[0]![0]!({ theme: 'light', styles: styles('#123456') });
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(document.documentElement.style.getPropertyValue('--color-text-primary')).toBe('#123456');
    delete document.documentElement.dataset['theme'];
    document.documentElement.style.removeProperty('--color-text-primary');
  });
});
