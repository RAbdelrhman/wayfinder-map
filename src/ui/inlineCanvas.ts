import { App } from '@modelcontextprotocol/ext-apps';
import { CanvasFeedback } from './canvasFeedback.js';
import type { FeedbackContext } from './canvasFeedback.js';
import { canvasToolbarHtml, readCanvasMessage } from './canvasViewer.js';
import type { CanvasPage } from './canvasViewer.js';
import { setTrustedHtml } from './trustedHtml.js';
import { inlineCanvasDocument } from '../inlineCanvasDocument.js';
import type { InlineCanvasSession } from '../inlineCanvasService.js';

export type InlineToolCall = (name: string, args: Record<string, unknown>) => Promise<unknown>;

/** Trusted controls surround an opaque iframe. Prototype messages can only describe canvas state. */
export function mountInlineCanvas(session: InlineCanvasSession, call: InlineToolCall, display: (mode: 'inline' | 'fullscreen') => void): () => void {
  const controller = new AbortController();
  const viewer = document.createElement('section');
  viewer.id = 'canvas-viewer';
  viewer.className = 'vw is-a';
  setTrustedHtml(viewer, '<div id="vw-toolbar"></div><div class="vw-stage"><div class="vw-canvas"></div><aside class="cf-panel" id="vw-feedback" aria-label="Feedback" hidden></aside></div>');
  document.body.replaceChildren(viewer);
  const toolbar = viewer.querySelector<HTMLElement>('#vw-toolbar')!;
  const canvas = viewer.querySelector<HTMLElement>('.vw-canvas')!;
  const aside = viewer.querySelector<HTMLElement>('#vw-feedback')!;
  const frame = document.createElement('iframe');
  frame.className = 'vw-frame';
  frame.title = `Canvas: ${session.route.title}`;
  frame.setAttribute('sandbox', 'allow-scripts');
  const context: FeedbackContext = { ...session.route, ticket: session.ticketNumber, pick: null, variants: [], variant: null, source: 'loading', pages: [], page: null, option: null, size: innerWidth < 640 ? 'pane' : 'full' };
  let menu = false;
  let pages: CanvasPage[] = [];
  const requests = new Map<string, string>();
  const send = (message: Record<string, unknown>): void => frame.contentWindow?.postMessage(message, '*');
  const feedback = new CanvasFeedback({
    context: () => context,
    send,
    repaintToolbar: () => paint(),
    post: async (url, input) => {
      const data = input as { body?: unknown; url?: unknown };
      if (url === `/api/repos/${session.repo}/canvas-thread` && typeof data.url === 'string') return call('notify_canvas_thread', { session: session.id, url: data.url });
      if (url !== `/api/repos/${session.repo}/canvas-notes` || typeof data.body !== 'string') throw new Error('Invalid canvas feedback request.');
      const requestId = requests.get(data.body) ?? crypto.randomUUID();
      requests.set(data.body, requestId);
      const result = await call('post_canvas_feedback', { session: session.id, requestId, body: data.body });
      requests.delete(data.body);
      return result;
    },
  }, canvas, aside);
  function paint(): void {
    viewer.className = context.size === 'full' ? 'vw is-a' : 'vw is-c';
    setTrustedHtml(toolbar, canvasToolbarHtml(session.route, context.size, pages, context.page, context.option, context.source, menu, feedback.toolbarParts(context.size)));
    feedback.paint();
  }
  toolbar.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('button') : null;
    if (!target) return;
    if (target.hasAttribute('data-menu')) { menu = !menu; paint(); }
    if (target.dataset['scroll']) {
      const strip = toolbar.querySelector<HTMLElement>('.vw-options');
      strip?.scrollBy({ left: Number(target.dataset['scroll']) * strip.clientWidth * 0.8, behavior: 'smooth' });
    }
    const page = target.dataset['page'];
    if (page) { menu = false; send({ wf: 1, type: 'go', page, option: null }); paint(); }
    if (target.hasAttribute('data-go') && context.page) send({ wf: 1, type: 'go', page: context.page, option: target.dataset['go'] || null });
    if (target.hasAttribute('data-step')) {
      const options = context.pages.find(page => page.id === context.page)?.options ?? [];
      const at = options.findIndex(option => option.id === context.option);
      const next = options[(at + Number(target.dataset['step']) + options.length) % options.length];
      if (next) send({ wf: 1, type: 'go', page: context.page, option: next.id });
    }
    if (target.dataset['size'] === 'full') display('fullscreen');
    if (target.dataset['size'] === 'pane') display('inline');
  });
  window.addEventListener('message', event => {
    // A nested prototype cannot impersonate the host or invoke a save tool.
    if (event.source !== frame.contentWindow) return;
    const message = readCanvasMessage(event.data);
    if (!message) return;
    if (message.type === 'ready') {
      frame.classList.add('is-ready');
      context.pages = message.pages;
      pages = message.pages;
      context.source = message.source;
      send({ wf: 1, type: 'shortcuts', keys: ['P', 'E', 'C', 'N', 'F'] });
      send({ wf: 1, type: 'go', page: session.target.page ?? message.pages[0]?.id, option: session.target.item ?? null });
    } else if (message.type === 'state') {
      context.page = message.page; context.option = message.option; feedback.stateChanged();
    } else if (message.type === 'hit') feedback.onHit(message);
    else if (message.type === 'targets') feedback.onTargets(message.items);
    else if (message.type === 'layout') feedback.onLayout(message.marks, message.viewport);
    else if (message.type === 'key') feedback.canvasKey(message.key);
    paint();
  }, { signal: controller.signal });
  document.addEventListener('keydown', event => {
    if (feedback.key(event)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, { capture: true, signal: controller.signal });
  addEventListener('resize', () => { context.size = innerWidth < 640 ? 'pane' : 'full'; paint(); }, { signal: controller.signal });
  canvas.prepend(frame);
  paint();
  frame.srcdoc = inlineCanvasDocument(session.bundle);
  return () => { controller.abort(); viewer.remove(); };
}

export async function startInlineCanvas(): Promise<void> {
  const app = new App({ name: 'Wayfinder canvas', version: '1.0.0' }, {});
  let dispose: (() => void) | null = null;
  let generation = 0;
  const call: InlineToolCall = async (name, args) => {
    const result = await app.callServerTool({ name, arguments: args });
    if (result.isError) throw new Error(result.content.filter(item => item.type === 'text').map(item => item.text).join('\n'));
    return result.structuredContent;
  };
  app.ontoolresult = async result => {
    const current = ++generation;
    const session = (result.structuredContent as { session?: unknown } | undefined)?.session;
    if (typeof session !== 'string') return;
    const resource = await app.readServerResource({ uri: `wayfinder-canvas://session/${session}` });
    const first = resource.contents[0];
    if (!first || !('text' in first) || typeof first.text !== 'string') throw new Error('Canvas data is unavailable.');
    if (current !== generation) return;
    dispose?.();
    dispose = mountInlineCanvas(JSON.parse(first.text) as InlineCanvasSession, call, mode => { void app.requestDisplayMode({ mode }); });
    void app.sendSizeChanged({ height: 800 });
  };
  const applyHostContext = (context: NonNullable<ReturnType<App['getHostContext']>>): void => {
    if (context.theme) document.documentElement.dataset['theme'] = context.theme;
    const variables = context.styles?.variables;
    if (variables) for (const [key, value] of Object.entries(variables)) if (key.startsWith('--') && typeof value === 'string') document.documentElement.style.setProperty(key, value);
  };
  app.onhostcontextchanged = applyHostContext;
  await app.connect();
  const initial = app.getHostContext();
  if (initial) applyHostContext(initial);
}
