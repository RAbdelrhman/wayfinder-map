import { normalizeShortcut, shortcutFromEvent } from './canvasShortcuts.js';

/** Runs in the prototype's opaque origin. No API or privileged operation is exposed. */
function canvasBridge(normalize: typeof normalizeShortcut, fromEvent: typeof shortcutFromEvent): void {
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
  let toolKeys = ['P', 'E', 'C', 'N', 'F'];
  let toolsConfigured = false;
  let focusToken: string | null = null;
  const configureChild = (child: Window): void => {
    if (toolsConfigured) child.postMessage({ wf: 1, type: 'shortcuts', keys: toolKeys }, '*');
    if (focusToken) child.postMessage({ wf: 1, type: 'focus-config', token: focusToken }, '*');
  };
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
  const focusChanged = (type: 'focus-entry' | 'focus-leave'): void => {
    if (focusToken) window.top?.postMessage({ wf: 1, type, token: focusToken, at: Date.now() }, '*');
  };
  document.addEventListener('pointerdown', (event) => {
    if (event.isTrusted) focusChanged('focus-entry');
  }, true);
  // Moving between two child frames need not blur the host window again.
  window.addEventListener('blur', () => focusChanged('focus-leave'));
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
    // A newly presented option has not seen the marks yet.
    document.querySelector('#present-frame')?.addEventListener('load', queueLayout);
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
  // ---------- annotation (#213): hit tests, tracked marks and scrolling ----------
  // Each document answers for itself, or hands the request to the option it is presenting.
  type Rect = { left: number; top: number; width: number; height: number };
  // A pin keeps its place on the element under it (ax, ay inside that element), so it follows inner scrollers too.
  type Tracked = { id: number; x?: number; y?: number; selector?: string; ax?: number; ay?: number };
  let tracked: Tracked[] = [];
  let layoutQueued = false;
  // Once the viewer asks, every scroll reports a layout, so targets move even with no marks yet.
  let tracking = false;
  const presentFrame = (): HTMLIFrameElement | null => {
    if (!document.querySelector('#present-view:not([hidden])')) return null;
    const frame = document.querySelector<HTMLIFrameElement>('#present-frame');
    return frame?.contentWindow ? frame : null;
  };
  const clip = (text: string): string => {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > 40 ? `${flat.slice(0, 39)}…` : flat;
  };
  const LEAF = /^(BUTTON|A|H[1-6]|LABEL|SUMMARY|LEGEND|TH|TD|LI|P|SPAN|STRONG|B|EM|SMALL|DT|DD|FIGCAPTION|CAPTION|OPTION)$/;
  const BOX = /^(SECTION|ARTICLE|ASIDE|NAV|HEADER|FOOTER|MAIN|FORM|DIALOG|LI|DIV|FIELDSET)$/;
  /** A name a person would use: its label, its short text, or "<heading> card" for a box with a heading. */
  const nameOf = (start: Element | null): string | null => {
    if (!start || start === document.body || start === document.documentElement) return null;
    for (let node: Element | null = start; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
      const label = node.getAttribute('aria-label') ?? node.getAttribute('title') ?? node.getAttribute('alt');
      if (label?.trim()) return clip(label);
      const text = (node.textContent ?? '').trim();
      if (text && text.length <= 40 && LEAF.test(node.tagName)) return clip(text);
      const heading = BOX.test(node.tagName) ? node.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]') : null;
      if (heading?.textContent?.trim()) {
        const kind = /^(DIV|LI|ARTICLE)$/.test(node.tagName) ? 'card' : node.tagName.toLowerCase();
        return clip(`${heading.textContent} ${kind}`);
      }
    }
    return start.tagName.toLowerCase();
  };
  const selectorOf = (start: Element): string => {
    const parts: string[] = [];
    for (let node: Element | null = start; node && node !== document.documentElement; node = node.parentElement) {
      if (node.id && document.querySelectorAll('#' + CSS.escape(node.id)).length === 1) {
        parts.unshift('#' + CSS.escape(node.id));
        break;
      }
      const tag = node.tagName;
      const same = node.parentElement ? [...node.parentElement.children].filter((child) => child.tagName === tag) : [];
      parts.unshift(tag.toLowerCase() + (same.length > 1 ? `:nth-of-type(${String(same.indexOf(node) + 1)})` : ''));
    }
    return parts.join(' > ');
  };
  const hexOf = (value: string): string | null => {
    const m = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:\s*[,/]\s*([\d.]+%?))?/.exec(value);
    if (!m || (m[4] !== undefined && parseFloat(m[4]) === 0)) return null;
    return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
  };
  const colorOf = (el: Element): string => {
    const style = getComputedStyle(el);
    return hexOf(style.backgroundColor) ?? hexOf(style.color) ?? '#000000';
  };
  /** The colours this option uses most, each named by the first element that uses it. */
  const palette = (): [string, string][] => {
    const seen = new Map<string, { name: string; count: number }>();
    for (const el of [...document.body.querySelectorAll('*')].slice(0, 800)) {
      const style = getComputedStyle(el);
      for (const hex of [hexOf(style.backgroundColor), hexOf(style.color)]) {
        if (!hex) continue;
        const entry = seen.get(hex);
        if (entry) entry.count++;
        else seen.set(hex, { name: nameOf(el) ?? hex, count: 1 });
      }
    }
    return [...seen]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 12)
      .map(([hex, entry]) => [hex, entry.name]);
  };
  const docSize = (): { width: number; height: number } => {
    const root = document.documentElement;
    return { width: Math.max(root.scrollWidth, innerWidth), height: Math.max(root.scrollHeight, innerHeight) };
  };
  const rectOf = (rect: Rect): Rect => ({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
  const offset = (rect: Rect, by: Rect): Rect => ({ ...rect, left: rect.left + by.left, top: rect.top + by.top });
  const hitHere = (requestId: number, x: number, y: number, colors: boolean): void => {
    const hit = document.elementFromPoint(x, y);
    const size = docSize();
    const element = hit && hit !== document.body && hit !== document.documentElement ? hit : null;
    const box = element?.getBoundingClientRect();
    post({
      type: 'hit',
      requestId,
      x: (x + scrollX) / size.width,
      y: (y + scrollY) / size.height,
      name: nameOf(element),
      selector: element ? selectorOf(element) : null,
      color: element ? colorOf(element) : null,
      rect: element ? rectOf(element.getBoundingClientRect()) : null,
      ...(box && box.width > 0 && box.height > 0 ? { ax: (x - box.left) / box.width, ay: (y - box.top) / box.height } : {}),
      ...(colors ? { palette: palette() } : {}),
    });
  };
  /** Named elements on screen, for Tab and Enter while selecting (D4: "Hover or Tab to an element"). */
  const targetsHere = (): void => {
    const seen = new Set<string>();
    const items: { name: string; selector: string; rect: Rect }[] = [];
    for (const el of document.body.querySelectorAll('h1, h2, h3, h4, h5, h6, button, a, label, input, select, textarea, img, [aria-label], [role], li, article, section, nav, header, footer, aside, form, figure, table')) {
      const box = el.getBoundingClientRect();
      if (box.width < 8 || box.height < 8 || box.bottom < 0 || box.right < 0 || box.top > innerHeight || box.left > innerWidth) continue;
      const name = nameOf(el);
      const key = `${name ?? ''}|${String(Math.round(box.left))}|${String(Math.round(box.top))}`;
      if (!name || seen.has(key)) continue;
      seen.add(key);
      items.push({ name, selector: selectorOf(el), rect: rectOf(box) });
      if (items.length >= 150) break;
    }
    post({ type: 'targets', items });
  };
  const layoutHere = (): void => {
    layoutQueued = false;
    const size = docSize();
    post({
      type: 'layout',
      marks: tracked.map((mark) => {
        if (mark.selector !== undefined) {
          let el: Element | null = null;
          try {
            el = document.querySelector(mark.selector);
          } catch {
            /* A selector from another revision. */
          }
          const rect = el ? rectOf(el.getBoundingClientRect()) : null;
          if (rect && typeof mark.ax === 'number' && typeof mark.ay === 'number')
            return { id: mark.id, rect: { left: rect.left + mark.ax * rect.width, top: rect.top + mark.ay * rect.height, width: 0, height: 0 } };
          if (rect || mark.x === undefined) return { id: mark.id, rect };
        }
        return { id: mark.id, rect: { left: (mark.x ?? 0) * size.width - scrollX, top: (mark.y ?? 0) * size.height - scrollY, width: 0, height: 0 } };
      }),
      viewport: { left: 0, top: 0, width: innerWidth, height: innerHeight },
    });
  };
  const queueLayout = (): void => {
    const frame = presentFrame();
    if (frame) {
      frame.contentWindow?.postMessage({ wf: 1, type: 'marks', marks: tracked }, '*');
      return;
    }
    if (layoutQueued || !tracking) return;
    layoutQueued = true;
    requestAnimationFrame(layoutHere);
  };
  window.addEventListener('scroll', queueLayout, { capture: true, passive: true });
  window.addEventListener('resize', queueLayout);
  const annotate = (message: Record<string, unknown>): boolean => {
    const frame = presentFrame();
    const box = frame ? frame.getBoundingClientRect() : null;
    if (message['type'] === 'hitTest' && typeof message['requestId'] === 'number' && typeof message['x'] === 'number' && typeof message['y'] === 'number') {
      const { requestId, x, y } = message as { requestId: number; x: number; y: number };
      const colors = message['palette'] === true;
      if (frame && box) {
        // The canvas's own chrome (its notes, its toolbar) can sit over the option: that point is not on it.
        if (x < box.left || y < box.top || x > box.right || y > box.bottom || document.elementFromPoint(x, y) !== frame)
          post({ type: 'hit', requestId, miss: true });
        else frame.contentWindow?.postMessage({ wf: 1, type: 'hitTest', requestId, x: x - box.left, y: y - box.top, palette: colors }, '*');
      } else hitHere(requestId, x, y, colors);
      return true;
    }
    if (message['type'] === 'marks' && Array.isArray(message['marks'])) {
      tracking = true;
      tracked = (message['marks'] as unknown[]).filter(
        (mark): mark is Tracked => typeof mark === 'object' && mark !== null && typeof (mark as Tracked).id === 'number',
      ).slice(0, 500);
      queueLayout();
      return true;
    }
    if (message['type'] === 'targets') {
      if (frame) frame.contentWindow?.postMessage({ wf: 1, type: 'targets' }, '*');
      else targetsHere();
      return true;
    }
    if (message['type'] === 'scroll' && typeof message['dx'] === 'number' && typeof message['dy'] === 'number') {
      const { dx, dy } = message as { dx: number; dy: number };
      const x = typeof message['x'] === 'number' ? message['x'] : 0,
        y = typeof message['y'] === 'number' ? message['y'] : 0;
      if (frame && box) frame.contentWindow?.postMessage({ wf: 1, type: 'scroll', dx, dy, x: x - box.left, y: y - box.top }, '*');
      else {
        // The wheel goes to whatever would scroll under the pointer: an inner pane, or the page.
        let node: Element | null = document.elementFromPoint(x, y);
        for (; node && node !== document.documentElement && node !== document.body; node = node.parentElement) {
          const style = getComputedStyle(node);
          const overflow = `${style.overflow} ${style.overflowY} ${style.overflowX}`;
          if (/auto|scroll/.test(overflow) && (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth)) break;
        }
        if (node && node !== document.documentElement && node !== document.body) node.scrollBy(dx, dy);
        else window.scrollBy(dx, dy);
      }
      return true;
    }
    return false;
  };
  /** Hits and layouts from the presented option, moved into this document's coordinates. */
  const relay = (message: Record<string, unknown>): void => {
    const box = presentFrame()?.getBoundingClientRect();
    if (!box) return;
    const by = { left: box.left, top: box.top, width: 0, height: 0 };
    if (message['type'] === 'hit') {
      const rect = message['rect'] as Rect | null | undefined;
      post({ ...message, ...(rect ? { rect: offset(rect, by) } : {}) });
    }
    if (message['type'] === 'targets' && Array.isArray(message['items'])) {
      const items = (message['items'] as { name: string; selector: string; rect: Rect }[]).map((item) => ({
        name: item.name,
        selector: item.selector,
        rect: offset(item.rect, by),
      }));
      post({ type: 'targets', items });
    }
    if (message['type'] === 'layout' && Array.isArray(message['marks'])) {
      const marks = (message['marks'] as { id: number; rect: Rect | null }[]).map((mark) => ({ id: mark.id, rect: mark.rect ? offset(mark.rect, by) : null }));
      post({ type: 'layout', marks, viewport: { left: box.left, top: box.top, width: box.width, height: box.height } });
    }
  };

  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (typeof event.data !== 'object' || event.data === null) return;
    const message = event.data as Record<string, unknown>;
    if (event.source === parent && message['wf'] === 1 && message['type'] === 'focus-config' && typeof message['token'] === 'string' && message['token'].length <= 100) {
      focusToken = message['token'];
      for (const child of document.querySelectorAll('iframe')) if (child.contentWindow) configureChild(child.contentWindow);
      return;
    }
    if (event.source === parent && message['wf'] === 1 && message['type'] === 'shortcuts') {
      const keys = message['keys'];
      if (!Array.isArray(keys) || keys.length !== 5 || !keys.every((key: unknown) => typeof key === 'string' && normalize(key) === key) || new Set(keys).size !== 5) return;
      toolKeys = keys as string[];
      toolsConfigured = true;
      for (const child of document.querySelectorAll('iframe')) if (child.contentWindow) configureChild(child.contentWindow);
      return;
    }
    if (event.source !== parent && message['wf'] === 1 && (message['type'] === 'hit' || message['type'] === 'layout' || message['type'] === 'targets')) {
      if (event.source === presentFrame()?.contentWindow) relay(message);
      return;
    }
    if (event.source === parent && message['wf'] === 1 && annotate(message)) return;
    if (event.source !== parent) {
      // Escape from an option document does not bubble through an iframe.
      const child = [...document.querySelectorAll('iframe')].some((frame) => frame.contentWindow === event.source);
      if (child && event.source && message['wf'] === 1 && message['type'] === 'ready') {
        configureChild(event.source as Window);
        return;
      }
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
      if (child && message['wf'] === 1 && message['type'] === 'key' && typeof message['key'] === 'string' && toolKeys.includes(message['key'])) {
        post({ type: 'key', key: message['key'] });
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
  // #318: saved viewer assignments win over the engine's document-level commands.
  // Window capture runs first even when the engine registered its listener before this bridge.
  window.addEventListener('keydown', (event) => {
    const key = fromEvent(event, true);
    if (!toolsConfigured || !key || !toolKeys.includes(key) || event.defaultPrevented) return;
    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) post({ type: 'key', key });
  }, true);
  // On a canvas board, each option page repaints on every scroll step unless the compositor holds it in a layer of its own.
  const onBoard = (): void => {
    if (!document.querySelector('#stage')) return;
    const layers = document.createElement('style');
    layers.textContent = '#stage .frame { will-change: transform; } #stage.wf-zoomed-in .frame { will-change: auto; }' +
      // Wayfinder owns feedback. Keep board notes, but suppress the legacy presentation sidebar and its toggle,
      // including in canvases served from older prototype branches.
      ' #present-view #side-note, #present-view #notes { display: none !important; }';
    document.head.append(layers);
  };
  // Waiting for load also waits for every option iframe and its network requests.
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', ready);
  else ready();
  onBoard();
}

export const CANVAS_BRIDGE_SCRIPT = `;(${canvasBridge.toString()})(${normalizeShortcut.toString()}, ${shortcutFromEvent.toString()});`;

/** Board srcdoc options need focus reporting without adding history or keyboard routing. */
function canvasOptionFocusBridge(): void {
  let token: string | null = null;
  const configure = (child: Window): void => { if (token) child.postMessage({ wf: 1, type: 'focus-config', token }, '*'); };
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (typeof event.data !== 'object' || event.data === null) return;
    const data = event.data as Record<string, unknown>;
    if (event.source === parent && data['wf'] === 1 && data['type'] === 'focus-config' && typeof data['token'] === 'string') {
      token = data['token'];
      for (const frame of document.querySelectorAll('iframe')) if (frame.contentWindow) configure(frame.contentWindow);
    }
    if (data['wf'] === 1 && data['type'] === 'ready') {
      for (const frame of document.querySelectorAll('iframe')) if (frame.contentWindow && frame.contentWindow === event.source) configure(frame.contentWindow);
    }
  });
  document.addEventListener('load', event => { if (event.target instanceof HTMLIFrameElement && event.target.contentWindow) configure(event.target.contentWindow); }, true);
  document.addEventListener('pointerdown', event => {
    if (token && event.isTrusted) window.top?.postMessage({ wf: 1, type: 'focus-entry', token, at: Date.now() }, '*');
  }, true);
  window.addEventListener('blur', () => { if (token) window.top?.postMessage({ wf: 1, type: 'focus-leave', token }, '*'); });
  parent.postMessage({ wf: 1, type: 'ready' }, '*');
}
export const CANVAS_OPTION_FOCUS_SCRIPT = `;(${canvasOptionFocusBridge.toString()})();`;

/** Tiles are pictures, not interactive documents. Their scripts must not move keyboard focus. */
export const PREVIEW_FOCUS_GUARD = `if (window.name === 'wayfinder-preview') { HTMLElement.prototype.focus = function () {}; window.focus = function () {}; }`;

/**
 * Runs in the engine's own document, in place of its `stage.style.zoom = …`. CSS zoom lays out every embedded
 * option again on each step; a scale transform only repaints them. The transform leaves the layout box at full
 * size, so while zoomed out the margins pull the scrollable area in to the scaled size, as CSS zoom did.
 */
function stageZoom(stage: HTMLElement, zoom: number): void {
  const hold = (level: number): void => {
    stage.style.marginRight = level < 1 ? `${String((level - 1) * stage.offsetWidth)}px` : '';
    stage.style.marginBottom = level < 1 ? `${String((level - 1) * stage.offsetHeight)}px` : '';
  };
  stage.dataset['wfZoom'] = String(zoom);
  stage.style.zoom = '';
  stage.style.transformOrigin = '0 0';
  stage.style.transform = zoom === 1 ? '' : `scale(${String(zoom)})`;
  hold(zoom);
  // A layer keeps the scale it was rastered at, so zoomed in the pages would go soft. They are held in layers (for smooth panning)
  // only while zoomed out or at 100%, where a stale raster is at worst scaled down.
  stage.classList.toggle('wf-zoomed-in', zoom > 1);
  // Options report their height as they load, which changes the size the margins are taken from.
  if (stage.dataset['wfZoomWatch'] === undefined) {
    stage.dataset['wfZoomWatch'] = '';
    new ResizeObserver(() => hold(Number(stage.dataset['wfZoom']))).observe(stage);
  }
}
/** The engine line that sets the zoom is the same in every copied engine. */
const ENGINE_ZOOM = /\$\('stage'\)\.style\.zoom\s*=\s*String\(state\.zoom\);/;

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
      .replace(/function loadFrame\(frame, item, present\)\s*\{/, () => replacementNavigation)
      // Composed option documents do not pass through the HTML response wrapper.
      .replace('frame.srcdoc = srcdoc(item, present);', () => `frame.srcdoc = srcdoc(item, present) + '<script>' + ${JSON.stringify(CANVAS_OPTION_FOCUS_SCRIPT)} + '<' + '/script>';`)
      .replace(ENGINE_ZOOM, () => `stageZoom($('stage'), state.zoom);`);
    return Buffer.from(ENGINE_ZOOM.test(bytes.toString('utf8')) ? `const stageZoom = ${stageZoom.toString()};\n${source}` : source);
  }
  if (!/\.html?$/i.test(file)) return bytes;
  const script = `<script>${CANVAS_BRIDGE_SCRIPT}</script>`;
  const original = bytes.toString('utf8');
  const guard = `<script>${PREVIEW_FOCUS_GUARD}</script>`;
  const html = /<head\b[^>]*>/i.test(original)
    ? original.replace(/<head([^>]*)>/i, `<head$1>${guard}`)
    : original.replace(/^(\s*<!doctype[^>]*>)?/i, `$&${guard}`);
  return Buffer.from(/<\/body>/i.test(html) ? html.replace(/<\/body>/i, script + '</body>') : html + script);
}
