import { parsePrototypeFilePath } from '../prototypes.js';
import { canvasSize, isCanvasSize } from './canvasPreference.js';
import type { CanvasSize } from './canvasPreference.js';
import { escapeHtml } from './markdown.js';
import { icon, BEAKER, CLOSE, EXTERNAL, CHEVRON, CHEVRON_RIGHT, CHECK } from './icons.js';

export interface CanvasRoute {
  url: string;
  title: string;
  github: string;
  file: string | null;
}
export interface CanvasPage {
  id: string;
  title: string;
  options: { id: string; name: string; file: string | null }[];
}
/** Every viewer frame retains the existing opaque-origin capabilities. */
export function canvasFrameHtml(route: CanvasRoute): string {
  return `<iframe class="vw-frame" sandbox="allow-scripts" title="Canvas: ${escapeHtml(route.title)}" src="${escapeHtml(route.url)}"></iframe>`;
}

export function canvasOptionForFile(pages: readonly CanvasPage[], file: string | null): { page: string; option: string } | null {
  if (!file) return null;
  const candidates = pages.flatMap((page) =>
    page.options.filter((option) => option.file !== null).map((option) => ({ page: page.id, option })),
  );
  const exact = candidates.find((candidate) => candidate.option.file === file);
  // Older config parsers retain the variant's path but not its runtime query.
  const match = exact ?? candidates.find((candidate) => candidate.option.file?.split(/[?#]/)[0] === file.split(/[?#]/)[0]);
  return match ? { page: match.page, option: match.option.id } : null;
}
export type CanvasMessage =
  | { wf: 1; type: 'ready'; source: 'dom' | 'engine' | 'page'; pages: CanvasPage[] }
  | { wf: 1; type: 'state'; page: string | null; option: string | null; presenting: boolean }
  | { wf: 1; type: 'back' }
  | { wf: 1; type: 'key'; key: 'Escape' };

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const textOrNull = (value: unknown): value is string | null => value === null || typeof value === 'string';

export function readCanvasMessage(value: unknown): CanvasMessage | null {
  if (!record(value) || value['wf'] !== 1) return null;
  if (value['type'] === 'back') return { wf: 1, type: 'back' };
  if (value['type'] === 'key' && value['key'] === 'Escape') return value as CanvasMessage;
  if (value['type'] === 'state' && textOrNull(value['page']) && textOrNull(value['option']) && typeof value['presenting'] === 'boolean')
    return value as CanvasMessage;
  if (
    value['type'] !== 'ready' ||
    !['dom', 'engine', 'page'].includes(String(value['source'])) ||
    !Array.isArray(value['pages']) ||
    value['pages'].length > 100
  )
    return null;
  if (
    !value['pages'].every(
      (page: unknown) =>
        record(page) &&
        typeof page['id'] === 'string' &&
        typeof page['title'] === 'string' &&
        Array.isArray(page['options']) &&
        page['options'].length <= 200 &&
        page['options'].every(
          (option: unknown) =>
            record(option) && typeof option['id'] === 'string' && typeof option['name'] === 'string' && textOrNull(option['file']),
        ),
    )
  )
    return null;
  return value as CanvasMessage;
}

export function readCanvasRoute(value: unknown, origin: string): CanvasRoute | null {
  if (
    !record(value) ||
    typeof value['url'] !== 'string' ||
    typeof value['title'] !== 'string' ||
    typeof value['github'] !== 'string' ||
    !textOrNull(value['file'])
  )
    return null;
  try {
    const url = new URL(value['url'], origin);
    const github = new URL(value['github']);
    if (
      url.origin !== origin ||
      parsePrototypeFilePath(url.pathname) === null ||
      github.protocol !== 'https:' ||
      github.hostname !== 'github.com'
    )
      return null;
    return { url: url.pathname + url.search + url.hash, title: value['title'], github: github.href, file: value['file'] };
  } catch {
    return null;
  }
}

/** Owns one history entry. Options and size never push another one. */
export class CanvasRouting {
  current: CanvasRoute | null = null;
  private closing = false;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(
    private readonly history: Pick<History, 'pushState' | 'back'>,
    private readonly changed: (route: CanvasRoute | null) => void,
  ) {}
  open(route: CanvasRoute, href: string, state: unknown): void {
    if (this.current !== null) return;
    const url = new URL(href);
    url.searchParams.set('canvas', route.url);
    this.history.pushState({ ...(record(state) ? state : {}), wfCanvas: route }, '', url.pathname + url.search + url.hash);
    this.current = route;
    this.changed(route);
  }
  close(): void {
    if (this.current !== null && !this.closing) {
      this.closing = true;
      this.stepBack();
    }
  }
  private stepBack(): void {
    this.history.back();
    // A prototype can navigate an opaque child frame to another document. That
    // joint-history step has no parent popstate. Continue until the map entry
    // arrives, rather than leaving Close permanently locked after that step.
    if (this.closing) this.closeTimer = setTimeout(() => this.stepBack(), 300);
  }
  pop(state: unknown, origin: string): boolean {
    if (this.closeTimer !== null) clearTimeout(this.closeTimer);
    this.closeTimer = null;
    const next = readCanvasRoute(record(state) ? state['wfCanvas'] : null, origin);
    if (this.closing && next !== null) {
      this.closeTimer = setTimeout(() => this.stepBack(), 300);
      return true;
    }
    this.closing = false;
    if (next === null && this.current === null) return false;
    this.current = next;
    this.changed(next);
    return true;
  }
}

export interface FloatRect {
  left: number;
  top: number;
  width: number;
  height: number;
}
export function floatGeometry(start: FloatRect, corner: string | null, dx: number, dy: number, width: number, height: number): FloatRect {
  const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));
  const r = { ...start };
  const minWidth = Math.min(360, width),
    minHeight = Math.min(240, height);
  if (!corner) {
    r.left = clamp(r.left + dx, 0, width - r.width);
    r.top = clamp(r.top + dy, 0, height - r.height);
  } else {
    if (corner.includes('e')) r.width = clamp(r.width + dx, minWidth, width - r.left);
    if (corner.includes('s')) r.height = clamp(r.height + dy, minHeight, height - r.top);
    if (corner.includes('w')) {
      const right = r.left + r.width;
      r.left = clamp(r.left + dx, 0, right - minWidth);
      r.width = right - r.left;
    }
    if (corner.includes('n')) {
      const bottom = r.top + r.height;
      r.top = clamp(r.top + dy, 0, bottom - minHeight);
      r.height = bottom - r.top;
    }
  }
  return r;
}

const SIZE_ICON = {
  full: '<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/>',
  pane: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M13 4v16"/>',
  float: '<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="11.5" y="11.5" width="6.5" height="5.5" rx="1"/>',
};
const SIZE_LABEL = { full: 'Full window', pane: 'Side pane', float: 'Floating window' };

export function canvasToolbarHtml(
  route: CanvasRoute,
  size: CanvasSize,
  pages: readonly CanvasPage[],
  pageId: string | null,
  optionId: string | null,
  source: string,
  menu: boolean,
): string {
  const page = pages.find((candidate) => candidate.id === pageId) ?? pages[0];
  const sizes = `<div class="segmented vw-sizes" role="group" aria-label="Canvas size">${(['full', 'pane', 'float'] as const).map((value) => `<button type="button" class="seg${value === size ? ' is-on' : ''}" data-size="${value}" aria-pressed="${value === size}" aria-label="${SIZE_LABEL[value]}" title="${SIZE_LABEL[value]}">${icon(SIZE_ICON[value])}</button>`).join('')}</div>`;
  const title = `<span class="vw-title" id="vw-title">${icon(BEAKER)}<span class="vw-title-t">${escapeHtml(route.title)}</span></span>`;
  const github =
    size === 'float'
      ? ''
      : `<a class="iconbtn" href="${escapeHtml(route.github)}" target="_blank" rel="noreferrer" aria-label="Open the branch on GitHub">${icon(EXTERNAL)}</a>`;
  const close = `<button type="button" class="${size === 'full' ? 'ghost' : 'iconbtn'} vw-close" data-close aria-label="Close the canvas">${icon(CLOSE)}${size === 'full' ? '<span class="vw-lbl">Close</span><kbd>Esc</kbd>' : ''}</button>`;
  const controls = page
    ? `<div class="vw-menu-anchor"><button type="button" class="ghost" data-menu aria-haspopup="menu" aria-expanded="${menu}" aria-label="Canvas page: ${escapeHtml(page.title)}">${escapeHtml(page.title)}${icon(CHEVRON)}</button><div class="vw-menu" role="menu" aria-label="Canvas pages"${menu ? '' : ' hidden'}>${pages.map((p) => `<button type="button" role="menuitemradio" aria-checked="${p.id === page.id}" data-page="${escapeHtml(p.id)}">${p.id === page.id ? icon(CHECK) : '<span class="i"></span>'}${escapeHtml(p.title)}<span class="vw-count">${p.options.length}</span></button>`).join('')}</div></div><div class="segmented vw-options" role="group" aria-label="Show the board, or open one option full size"><button type="button" class="seg${optionId === null ? ' is-on' : ''}" data-go="" aria-pressed="${optionId === null}">Board</button>${page.options.map((o) => `<button type="button" class="seg${optionId === o.id ? ' is-on' : ''}" data-go="${escapeHtml(o.id)}" aria-pressed="${optionId === o.id}" title="${escapeHtml(o.name)}">${escapeHtml(o.id)}</button>`).join('')}</div>${optionId ? `<button type="button" class="iconbtn vw-step" data-step="-1" aria-label="Previous option"><span class="vw-flip">${icon(CHEVRON_RIGHT)}</span></button><button type="button" class="iconbtn vw-step" data-step="1" aria-label="Next option">${icon(CHEVRON_RIGHT)}</button><span class="vw-optname">${escapeHtml(page.options.find((o) => o.id === optionId)?.name ?? '')}</span>` : ''}`
    : `<span class="vw-status" role="status">${source === 'loading' ? 'Loading the canvas…' : source === 'page' ? 'Snapshot' : 'View only'}</span>`;
  return size === 'full'
    ? `<div class="vw-bar is-a">${close}${title}<span class="vw-sep"></span>${controls}<span class="topbar-spacer"></span>${github}${sizes}</div>`
    : `<div class="vw-bar is-c"><div class="vw-c-row${size === 'float' ? ' vw-drag' : ''}">${title}<span class="topbar-spacer"></span>${github}${sizes}${close}</div><div class="vw-c-row">${controls}</div></div>`;
}

/** Mounted outside the app, which remains mounted underneath all three sizes. */
export function mountCanvasViewer(app: HTMLElement, captureState?: () => () => void): { isOpen: () => boolean } {
  const viewer = document.createElement('section');
  viewer.id = 'canvas-viewer';
  viewer.hidden = true;
  viewer.setAttribute('aria-labelledby', 'vw-title');
  viewer.innerHTML =
    '<div id="vw-toolbar"></div><div class="vw-stage"></div>' +
    ['nw', 'ne', 'sw', 'se']
      .map((corner) => `<span class="vw-grip" data-corner="${corner}" title="Drag to resize" aria-hidden="true"></span>`)
      .join('');
  document.body.append(viewer);
  const toolbar = viewer.querySelector<HTMLElement>('#vw-toolbar')!;
  const stage = viewer.querySelector<HTMLElement>('.vw-stage')!;
  let size = canvasSize(),
    rect: FloatRect | null = null;
  let frame: HTMLIFrameElement | null = null,
    mountedUrl: string | null = null;
  let pages: CanvasPage[] = [],
    pageId: string | null = null,
    optionId: string | null = null,
    source = 'loading',
    menu = false;
  let origin: HTMLElement | null = null,
    restoreState: (() => void) | undefined;
  let scrolls: { element: HTMLElement; selector: string | null; left: number; top: number }[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingFile: string | null = null;
  const findOrigin = (): HTMLElement | null => {
    if (origin?.isConnected) return origin;
    return (
      [...app.querySelectorAll<HTMLElement>('[data-canvas-url]')].find(
        (el) =>
          el.dataset['canvasUrl'] === origin?.dataset['canvasUrl'] &&
          el.dataset['canvasFile'] === origin?.dataset['canvasFile'] &&
          el.className === origin?.className,
      ) ?? null
    );
  };
  const send = (page: string, option: string | null): void => frame?.contentWindow?.postMessage({ wf: 1, type: 'go', page, option }, '*');
  const paint = (): void => {
    if (!routing.current) return;
    const focused =
      document.activeElement instanceof HTMLElement && toolbar.contains(document.activeElement)
        ? [...document.activeElement.attributes].find((attr) => attr.name.startsWith('data-'))
        : undefined;
    toolbar.innerHTML = canvasToolbarHtml(routing.current, size, pages, pageId, optionId, source, menu);
    if (focused)
      [...toolbar.querySelectorAll<HTMLElement>(`[${focused.name}]`)]
        .find((el) => el.getAttribute(focused.name) === focused.value)
        ?.focus({ preventScroll: true });
  };
  const applySize = (): void => {
    viewer.className = `vw is-${size === 'full' ? 'a' : size === 'pane' ? 'c' : 'f'} has-corner-grips`;
    viewer.setAttribute('role', size === 'full' ? 'dialog' : 'region');
    if (size === 'full') viewer.setAttribute('aria-modal', 'true');
    else viewer.removeAttribute('aria-modal');
    app.inert = size === 'full';
    app.classList.toggle('has-canvas-pane', size === 'pane');
    viewer.removeAttribute('style');
    if (size === 'float') {
      const width = Math.min(560, innerWidth - 32),
        height = Math.min(380, innerHeight - 32);
      rect ??= { width, height, left: innerWidth - width - 16, top: innerHeight - height - 16 };
      rect.width = Math.min(rect.width, innerWidth);
      rect.height = Math.min(rect.height, innerHeight);
      rect = floatGeometry(rect, null, 0, 0, innerWidth, innerHeight);
      Object.assign(viewer.style, Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, `${value}px`])));
    }
  };
  const animateFrom = (from: DOMRect, reverse = false): void => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !viewer.animate) return;
    const to = viewer.getBoundingClientRect();
    const small = {
      transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`,
      opacity: 0.2,
    };
    const large = { transform: 'none', opacity: 1 };
    viewer.animate(reverse ? [large, small] : [small, large], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
  };
  const openFrame = (route: CanvasRoute): void => {
    pendingFile = route.file;
    if (mountedUrl !== route.url) {
      mountedUrl = route.url;
      pages = [];
      pageId = null;
      optionId = null;
      source = 'loading';
      stage.replaceChildren();
      const poster = origin?.closest('.wf-var, .proto-tile, .wf-proto')?.querySelector<HTMLImageElement>('img');
      if (poster) {
        const copy = poster.cloneNode() as HTMLImageElement;
        copy.className = 'vw-poster-image';
        stage.append(copy);
      }
      stage.insertAdjacentHTML('beforeend', canvasFrameHtml(route));
      frame = stage.querySelector<HTMLIFrameElement>('.vw-frame')!;
      frame.addEventListener('load', () => frame?.classList.add('is-ready'));
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (source === 'loading') {
          source = 'none';
          frame?.classList.add('is-ready');
          paint();
        }
      }, 3000);
    } else chooseFile();
  };
  const chooseFile = (): void => {
    if (!pages.length) return;
    const match = canvasOptionForFile(pages, pendingFile);
    if (match) {
      send(match.page, match.option);
      pendingFile = null;
      return;
    }
    send(pages[0]!.id, null);
    pendingFile = null;
  };
  const routing = new CanvasRouting(window.history, (route) => {
    if (route) {
      for (const ghost of document.querySelectorAll('.vw-close-ghost')) ghost.remove();
      restoreState = captureState?.();
      scrolls = [app, ...app.querySelectorAll<HTMLElement>('*')]
        .filter((el) => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight)
        .map((element) => ({
          element,
          selector: element.id ? '#' + CSS.escape(element.id) : element.classList.contains('insp-panel') ? '.insp-panel' : null,
          left: element.scrollLeft,
          top: element.scrollTop,
        }));
      size = canvasSize();
      menu = false;
      for (const animation of viewer.getAnimations()) animation.cancel();
      viewer.hidden = false;
      applySize();
      openFrame(route);
      paint();
      if (origin) animateFrom(origin.getBoundingClientRect());
      toolbar.querySelector<HTMLElement>('[data-close]')?.focus({ preventScroll: true });
    } else {
      clearTimeout(timer);
      menu = false;
      app.inert = false;
      app.classList.remove('has-canvas-pane');
      if (origin?.isConnected) animateFrom(origin.getBoundingClientRect(), true);
      // A noninteractive picture shrinks back while the live, warm iframe is hidden.
      const target = findOrigin();
      if (target && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const ghost = document.createElement('div');
        ghost.className = 'vw-close-ghost';
        const bounds = viewer.getBoundingClientRect();
        Object.assign(ghost.style, {
          left: `${bounds.left}px`,
          top: `${bounds.top}px`,
          width: `${bounds.width}px`,
          height: `${bounds.height}px`,
        });
        const poster = stage.querySelector('img');
        if (poster) ghost.append(poster.cloneNode());
        document.body.append(ghost);
        const to = target.getBoundingClientRect();
        const animation = ghost.animate(
          [
            { transform: 'none', opacity: 1 },
            {
              transform: `translate(${to.left - bounds.left}px, ${to.top - bounds.top}px) scale(${to.width / bounds.width}, ${to.height / bounds.height})`,
              opacity: 0,
            },
          ],
          { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' },
        );
        void animation.finished.then(
          () => ghost.remove(),
          () => ghost.remove(),
        );
      }
      viewer.hidden = true;
      restoreState?.();
      restoreState = undefined;
      for (const scroll of scrolls) {
        const element = scroll.element.isConnected
          ? scroll.element
          : scroll.selector
            ? app.querySelector<HTMLElement>(scroll.selector)
            : null;
        if (element) {
          element.scrollLeft = scroll.left;
          element.scrollTop = scroll.top;
        }
      }
      origin = findOrigin();
      origin?.focus({ preventScroll: true });
    }
  });
  window.addEventListener(
    'popstate',
    (event) => {
      if (routing.pop(event.state, location.origin)) event.stopImmediatePropagation();
    },
    true,
  );
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-canvas-url]') : null;
      if (!target) return;
      const route = readCanvasRoute(
        {
          url: target.dataset['canvasUrl'],
          title: target.dataset['canvasTitle'],
          github: target.dataset['canvasGithub'],
          file: target.dataset['canvasFile'] ?? null,
        },
        location.origin,
      );
      if (!route) return;
      if (routing.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      origin = target;
      routing.open(route, location.href, history.state);
    },
    true,
  );
  toolbar.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('button') : null;
    if (!button) return;
    if (button.hasAttribute('data-close')) {
      routing.close();
      return;
    }
    if (isCanvasSize(button.dataset['size'])) {
      size = button.dataset['size'];
      const before = viewer.getBoundingClientRect();
      applySize();
      paint();
      animateFrom(before);
      return;
    }
    if (button.hasAttribute('data-menu')) {
      menu = !menu;
      paint();
      return;
    }
    const page = pages.find((p) => p.id === pageId) ?? pages[0];
    if (button.dataset['page']) {
      send(button.dataset['page'], null);
      menu = false;
      paint();
      return;
    }
    if (!page) return;
    if (button.hasAttribute('data-go')) send(page.id, button.dataset['go'] || null);
    if (button.dataset['step']) {
      const index = page.options.findIndex((o) => o.id === optionId);
      const option = page.options[(index + Number(button.dataset['step']) + page.options.length) % page.options.length];
      if (option) send(page.id, option.id);
    }
  });
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (!frame || event.source !== frame.contentWindow) return;
    const message = readCanvasMessage(event.data);
    if (!message) return;
    if (message.type === 'ready') {
      pages = message.pages;
      source = message.source;
      clearTimeout(timer);
      frame.classList.add('is-ready');
      if (routing.current) chooseFile();
    }
    if (message.type === 'state') {
      pageId = message.page;
      optionId = message.option;
    }
    if ((message.type === 'key' || message.type === 'back') && routing.current) routing.close();
    paint();
  });
  document.addEventListener(
    'keydown',
    (event) => {
      if (!routing.current) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (menu) {
          menu = false;
          paint();
          toolbar.querySelector<HTMLElement>('[data-menu]')?.focus();
        } else if (optionId && pageId) send(pageId, null);
        else routing.close();
      }
      if (event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        routing.close();
      }
      if (menu && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
        const items = [...toolbar.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
        const index = items.indexOf(document.activeElement as HTMLElement);
        items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
        event.preventDefault();
      }
      if (size === 'full' && event.key === 'Tab') {
        const items = [...viewer.querySelectorAll<HTMLElement>('button, a[href], iframe')].filter((el) => !el.closest('[hidden]'));
        if (event.shiftKey && document.activeElement === items[0]) {
          items.at(-1)?.focus();
          event.preventDefault();
        }
        if (!event.shiftKey && document.activeElement === items.at(-1)) {
          items[0]?.focus();
          event.preventDefault();
        }
      }
    },
    true,
  );
  let drag: { start: FloatRect; x: number; y: number; corner: string | null; pointerId: number } | null = null;
  viewer.addEventListener('pointerdown', (event) => {
    if (size !== 'float' || !rect || event.button !== 0 || !(event.target instanceof Element)) return;
    const grip = event.target.closest<HTMLElement>('[data-corner]');
    if (!grip && (!event.target.closest('.vw-drag') || event.target.closest('button, a'))) return;
    event.preventDefault();
    viewer.setPointerCapture(event.pointerId);
    drag = { start: { ...rect }, x: event.clientX, y: event.clientY, corner: grip?.dataset['corner'] ?? null, pointerId: event.pointerId };
    viewer.classList.add('is-dragging');
  });
  viewer.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    rect = floatGeometry(drag.start, drag.corner, event.clientX - drag.x, event.clientY - drag.y, innerWidth, innerHeight);
    Object.assign(viewer.style, Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, `${value}px`])));
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    viewer.addEventListener(type, () => {
      drag = null;
      viewer.classList.remove('is-dragging');
    });
  window.addEventListener('resize', () => {
    if (routing.current) applySize();
  });
  // A copied/reloaded viewer URL waits for its real originating tile to load.
  const requested = new URL(location.href).searchParams.get('canvas');
  if (requested) {
    const observer = new MutationObserver(() => {
      const target = [...app.querySelectorAll<HTMLElement>('[data-canvas-url]')].find((el) => el.dataset['canvasUrl'] === requested);
      if (!target) return;
      const route = readCanvasRoute(
        {
          url: requested,
          title: target.dataset['canvasTitle'],
          github: target.dataset['canvasGithub'],
          file: target.dataset['canvasFile'] ?? null,
        },
        location.origin,
      );
      if (!route) {
        observer.disconnect();
        return;
      }
      observer.disconnect();
      const base = new URL(location.href);
      base.searchParams.delete('canvas');
      const state = record(history.state) ? { ...history.state } : {};
      delete state['wfCanvas'];
      history.replaceState(state, '', base.pathname + base.search + base.hash);
      origin = target;
      routing.open(route, location.href, history.state);
    });
    observer.observe(app, { childList: true, subtree: true });
  }
  return { isOpen: () => routing.current !== null };
}
