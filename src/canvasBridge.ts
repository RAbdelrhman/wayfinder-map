/** Runs in the prototype's opaque origin. No API or privileged operation is exposed. */
function canvasBridge(): void {
  const historyState = window.history?.state as Record<string, unknown> | null;
  const documentId = typeof historyState?.['wfDocument'] === 'string' ? historyState['wfDocument'] : `${Date.now()}-${Math.random()}`;
  if (window.history) window.history.replaceState({ ...historyState, wfDocument: documentId }, '');
  const childHistory = new Map<MessageEventSource, { ids: string[]; index: number }>();
  // Nested documents share the browser's joint session history. Anchor tabs and
  // client-side page routers must replace their entry, just like engine options.
  if (window.history)
    window.history.pushState = (data: unknown, unused: string, url?: string | URL | null): void => {
      window.history.replaceState({ ...(typeof data === 'object' && data !== null ? data : {}), wfDocument: documentId }, unused, url);
    };
  document.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
      const next = new URL(anchor.href, location.href);
      const current = new URL(location.href);
      if (next.origin !== current.origin || next.pathname !== current.pathname || next.search !== current.search) return;
      event.preventDefault();
      location.replace(next.href);
    },
    true,
  );
  type Item = { id?: string; name?: string; src?: string; kind?: string; styles?: string[] };
  type Page = { id?: string; title?: string; name?: string; sections?: { items?: Item[] }[]; items?: Item[] };
  type Config = {
    pages?: Page[];
    title?: string;
    sections?: { items?: Item[] }[];
    variants?: Item[];
    styles?: Record<string, { label?: string }>;
  };
  type NormalPage = { id: string; title: string; items: { id: string; name: string; src?: string; kind: string }[] };
  const post = (message: object): void => parent.postMessage({ wf: 1, ...message }, '*');
  const pages = (): NormalPage[] => {
    const cfg = (window as unknown as { CANVAS?: Config }).CANVAS;
    if (!cfg) return [];
    let autoId = 0;
    const slug = (title: string): string =>
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'page';
    // Old copied engines fill in IDs and expand style comparisons at runtime.
    return (cfg.pages ?? [{ title: cfg.title ?? 'Canvas', sections: cfg.sections ?? [{ items: cfg.variants ?? [] }] }]).map(
      (page, index) => {
        const items = [...(page.items ?? []), ...(page.sections ?? []).flatMap((section) => section.items ?? [])].flatMap((item) => {
          const kind = item.kind ?? (item.src ? 'page' : 'note');
          const id = item.id ?? `${kind}-${++autoId}`;
          const base = { ...item, kind, id, name: item.name ?? id };
          return item.styles
            ? item.styles.map((style) => ({
                ...base,
                id: `${id}-${style}`,
                name: `${item.name ?? kind} · ${cfg.styles?.[style]?.label ?? style}`,
              }))
            : [base];
        });
        return { id: page.id ?? slug(page.title ?? `page-${index + 1}`), title: page.title ?? page.name ?? page.id ?? 'Canvas', items };
      },
    );
  };
  const options = (page: NormalPage): NormalPage['items'] => page.items.filter((item) => item.kind !== 'note');
  const state = (): void => {
    let parts: string[] = [];
    try {
      parts = location.hash.slice(1).split('/').map(decodeURIComponent);
    } catch {
      /* Malformed hash. */
    }
    const page = pages().find((candidate) => candidate.id === parts[0]) ?? pages()[0];
    post({
      type: 'state',
      page: page?.id ?? null,
      option: parts[1] ?? null,
      presenting: !!document.querySelector('#present-view:not([hidden])'),
    });
  };
  const ready = (): void => {
    post({ type: 'document', id: documentId });
    post({
      type: 'ready',
      source: pages().length ? 'dom' : 'page',
      pages: pages().map((page) => ({
        id: page.id,
        title: page.title,
        options: options(page).map((item) => ({
          id: item.id,
          name: item.name ?? item.id,
          file: item.src ? new URL(item.src, location.href).pathname + new URL(item.src, location.href).search : null,
        })),
      })),
    });
    state();
  };
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (typeof event.data !== 'object' || event.data === null) return;
    const message = event.data as Record<string, unknown>;
    if (event.source !== parent) {
      // Escape from an option document does not bubble through an iframe.
      const child = [...document.querySelectorAll('iframe')].some((frame) => frame.contentWindow === event.source);
      if (child && event.source && message['wf'] === 1 && message['type'] === 'document' && typeof message['id'] === 'string') {
        const trail = childHistory.get(event.source) ?? { ids: [], index: -1 };
        const index = trail.ids.indexOf(message['id']);
        if (index >= 0) {
          if (index < trail.index) post({ type: 'back' });
          trail.index = index;
        } else {
          trail.ids = trail.ids.slice(0, trail.index + 1);
          trail.index = trail.ids.push(message['id']) - 1;
        }
        childHistory.set(event.source, trail);
        return;
      }
      if (child && message['wf'] === 1 && message['type'] === 'back') {
        post({ type: 'back' });
        return;
      }
      if (!child || message['wf'] !== 1 || message['type'] !== 'key' || message['key'] !== 'Escape') return;
      if (document.querySelector('#present-view:not([hidden])')) location.replace('#' + location.hash.slice(1).split('/')[0]);
      else post({ type: 'key', key: 'Escape' });
      return;
    }
    if (message['wf'] !== 1 || message['type'] !== 'go' || typeof message['page'] !== 'string') return;
    const page = pages().find((candidate) => candidate.id === message['page']);
    if (!page || (message['option'] !== null && !options(page).some((item) => item.id === message['option']))) return;
    location.replace(
      '#' + encodeURIComponent(page.id) + (typeof message['option'] === 'string' ? '/' + encodeURIComponent(message['option']) : ''),
    );
  });
  window.addEventListener('hashchange', state);
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) post({ type: 'document', id: documentId });
  });
  window.addEventListener('canvas:change', state);
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape') return;
      // The engine uses Escape first for its page menu and presentation mode.
      if (document.querySelector('#present-view:not([hidden]), #pages-menu:not([hidden]), dialog[open]')) return;
      post({ type: 'key', key: 'Escape' });
    },
    true,
  );
  // Waiting for load also waits for every option iframe and its network requests.
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', ready);
  else ready();
}

export const CANVAS_BRIDGE_SCRIPT = `;(${canvasBridge.toString()})();`;

/** Old copied engines assign location.hash. Replace that assignment without changing repo files. */
export function viewerPrototypeBytes(file: string, bytes: Buffer): Buffer {
  if (/(?:^|\/)canvas\.js$/.test(file)) {
    const replacementNavigation = `function loadFrame(frame, item, present) {
      if (present && frame.contentWindow) {
        if (item.kind === 'page') frame.contentWindow.location.replace(pageSrc(item));
        else {
          const html = srcdoc(item, present).replace(/<head([^>]*)>/i, '<head$1><base href="' + esc(location.href) + '">');
          const bridge = '<script>' + ${JSON.stringify(CANVAS_BRIDGE_SCRIPT)} + '<' + '/script>';
          frame.contentWindow.location.replace('data:text/html;charset=utf-8,' + encodeURIComponent(html + bridge));
        }
        return;
      }`;
    const source = bytes
      .toString('utf8')
      .replace(/\blocation\.hash\s*=\s*([^;\n]+);/g, "location.replace('#' + ($1));")
      // The nested presentation document shares the browser's joint history too.
      .replace(/function loadFrame\(frame, item, present\)\s*\{/, () => replacementNavigation);
    return Buffer.from(source);
  }
  if (!/\.html?$/i.test(file)) return bytes;
  const script = `<script>${CANVAS_BRIDGE_SCRIPT}</script>`;
  const html = bytes.toString('utf8');
  return Buffer.from(/<\/body>/i.test(html) ? html.replace(/<\/body>/i, script + '</body>') : html + script);
}
