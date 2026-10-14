import { setTrustedHtml, insertTrustedHtml } from './trustedHtml.js';
import { parsePrototypeFilePath } from '../prototypes.js';
import { canvasSize, isCanvasSize } from './canvasPreference.js';
import type { CanvasSize } from './canvasPreference.js';
import { escapeHtml } from './markdown.js';
import { icon, BEAKER, CLOSE, EXTERNAL, CHEVRON, CHEVRON_RIGHT, CHECK } from './icons.js';
import { CanvasFeedback } from './canvasFeedback.js';
import type { CanvasHit } from './canvasFeedback.js';

export interface CanvasRoute {
  url: string;
  title: string;
  github: string;
  file: string | null;
  /** The prototype ticket notes are posted to, and the pick ticket the posted panel points at. */
  ticket?: number;
  pick?: number;
  /** The prototype's variants, for snapshots and canvases that never answer, and the one opened. */
  variants?: { id: string; name: string }[];
  variant?: string;
}
export interface CanvasPage {
  id: string;
  title: string;
  options: { id: string; name: string; file: string | null }[];
}
export function isCanvasClick(event: Pick<MouseEvent, 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>): boolean {
  return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
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
  | { wf: 1; type: 'document'; id: string }
  | { wf: 1; type: 'key'; key: 'Escape' | 'P' | 'E' | 'C' | 'N' | 'F' }
  | { wf: 1; type: 'targets'; items: { name: string; selector: string; rect: CanvasRect }[] }
  | ({ wf: 1; type: 'hit' } & CanvasHit)
  | { wf: 1; type: 'layout'; marks: { id: number; rect: CanvasRect | null }[]; viewport: CanvasRect };
export interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const textOrNull = (value: unknown): value is string | null => value === null || typeof value === 'string';
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isRect = (value: unknown): value is CanvasRect =>
  record(value) && finite(value['left']) && finite(value['top']) && finite(value['width']) && finite(value['height']);
const HEX_COLOR = /^#[0-9a-f]{6}$/;
const shortText = (value: unknown): value is string | null => value === null || (typeof value === 'string' && value.length <= 200);

/** A hit test's answer. Names and colours come from the prototype, so each is checked before use. */
function readHit(value: Record<string, unknown>): CanvasMessage | null {
  const requestId = value['requestId'];
  if (!finite(requestId)) return null;
  if (value['miss'] === true) return { wf: 1, type: 'hit', requestId, miss: true };
  const { x, y, name, selector, color, rect, palette } = value;
  if (!finite(x) || !finite(y) || !shortText(name) || !(selector === null || (typeof selector === 'string' && selector.length <= 2000))) return null;
  if (!(color === null || (typeof color === 'string' && HEX_COLOR.test(color))) || !(rect === null || isRect(rect))) return null;
  const colors =
    Array.isArray(palette) && palette.length <= 24
      ? palette.filter(
          (entry: unknown): entry is [string, string] =>
            Array.isArray(entry) && typeof entry[0] === 'string' && HEX_COLOR.test(entry[0]) && typeof entry[1] === 'string' && entry[1].length <= 200,
        )
      : undefined;
  const { ax, ay } = value;
  const anchor = finite(ax) && finite(ay) ? { ax, ay } : {};
  return { wf: 1, type: 'hit', requestId, x, y, name, selector, color, rect, ...anchor, ...(colors ? { palette: colors } : {}) };
}

export function readCanvasMessage(value: unknown): CanvasMessage | null {
  if (!record(value) || value['wf'] !== 1) return null;
  if (value['type'] === 'back') return { wf: 1, type: 'back' };
  if (value['type'] === 'document' && typeof value['id'] === 'string') return { wf: 1, type: 'document', id: value['id'] };
  if (value['type'] === 'key' && ['Escape', 'P', 'E', 'C', 'N', 'F'].includes(String(value['key']))) return value as CanvasMessage;
  if (value['type'] === 'targets') {
    const items = value['items'];
    if (!Array.isArray(items) || items.length > 200) return null;
    if (
      !items.every(
        (item: unknown) =>
          record(item) &&
          typeof item['name'] === 'string' &&
          item['name'].length <= 200 &&
          typeof item['selector'] === 'string' &&
          item['selector'].length <= 2000 &&
          isRect(item['rect']),
      )
    )
      return null;
    return { wf: 1, type: 'targets', items: items as { name: string; selector: string; rect: CanvasRect }[] };
  }
  if (value['type'] === 'hit') return readHit(value);
  if (value['type'] === 'layout') {
    const marks = value['marks'];
    if (!Array.isArray(marks) || marks.length > 500 || !isRect(value['viewport'])) return null;
    if (!marks.every((mark: unknown) => record(mark) && finite(mark['id']) && (mark['rect'] === null || isRect(mark['rect'])))) return null;
    return { wf: 1, type: 'layout', marks: marks as { id: number; rect: CanvasRect | null }[], viewport: value['viewport'] };
  }
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

/** A canvas entry's data attributes (see canvasEntryAttrs), as the raw route readCanvasRoute checks. */
export function canvasEntryRoute(data: DOMStringMap, url: string | undefined): Record<string, unknown> {
  let variants: unknown = undefined;
  try {
    variants = data['canvasVariants'] ? JSON.parse(data['canvasVariants']) : undefined;
  } catch {
    /* Not a list: the viewer has no variants to offer. */
  }
  return {
    url,
    title: data['canvasTitle'],
    github: data['canvasGithub'],
    file: data['canvasFile'] ?? null,
    ticket: Number(data['canvasTicket']),
    pick: Number(data['canvasPick']),
    variants,
    variant: data['canvasVariant'],
  };
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
    const ticket = value['ticket'],
      pick = value['pick'],
      variant = value['variant'];
    const positive = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
    const variants = Array.isArray(value['variants'])
      ? value['variants']
          .filter((v: unknown): v is { id: string; name: string } => record(v) && typeof v['id'] === 'string' && typeof v['name'] === 'string')
          .slice(0, 100)
          .map((v) => ({ id: v.id, name: v.name }))
      : [];
    return {
      url: url.pathname + url.search + url.hash,
      title: value['title'],
      github: github.href,
      file: value['file'],
      ...(positive(ticket) ? { ticket } : {}),
      ...(positive(pick) ? { pick } : {}),
      ...(variants.length ? { variants } : {}),
      ...(typeof variant === 'string' && variant ? { variant } : {}),
    };
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
  feedback: { bar: string; row: string; tabs: string } = { bar: '', row: '', tabs: '' },
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
    ? `<div class="vw-menu-anchor"><button type="button" class="ghost" data-menu aria-haspopup="menu" aria-expanded="${menu}" aria-label="Canvas page: ${escapeHtml(page.title)}">${escapeHtml(page.title)}${icon(CHEVRON)}</button><div class="vw-menu" role="menu" aria-label="Canvas pages"${menu ? '' : ' hidden'}>${pages.map((p) => `<button type="button" role="menuitemradio" aria-checked="${p.id === page.id}" data-page="${escapeHtml(p.id)}">${p.id === page.id ? icon(CHECK) : '<span class="i"></span>'}${escapeHtml(p.title)}<span class="vw-count">${p.options.length}</span></button>`).join('')}</div></div><div class="vw-strip"><button type="button" class="vw-strip-btn" data-scroll="-1" tabindex="-1" aria-hidden="true"><span class="vw-flip">${icon(CHEVRON_RIGHT)}</span></button><div class="segmented vw-options" role="group" aria-label="Show the board, or open one option full size"><button type="button" class="seg${optionId === null ? ' is-on' : ''}" data-go="" aria-pressed="${optionId === null}">Board</button>${page.options.map((o) => `<button type="button" class="seg${optionId === o.id ? ' is-on' : ''}" data-go="${escapeHtml(o.id)}" aria-pressed="${optionId === o.id}" title="${escapeHtml(o.name)}">${escapeHtml(o.id)}</button>`).join('')}</div><button type="button" class="vw-strip-btn" data-scroll="1" tabindex="-1" aria-hidden="true">${icon(CHEVRON_RIGHT)}</button></div>${optionId ? `<button type="button" class="iconbtn vw-step" data-step="-1" aria-label="Previous option"><span class="vw-flip">${icon(CHEVRON_RIGHT)}</span></button><button type="button" class="iconbtn vw-step" data-step="1" aria-label="Next option">${icon(CHEVRON_RIGHT)}</button><span class="vw-optname">${escapeHtml(page.options.find((o) => o.id === optionId)?.name ?? '')}</span>` : ''}`
    : `<span class="vw-status" role="status">${source === 'loading' ? 'Loading the canvas…' : source === 'page' ? 'Snapshot' : 'View only'}</span>`;
  return size === 'full'
    ? `<div class="vw-bar is-a">${close}${title}<span class="vw-sep"></span>${controls}<span class="topbar-spacer"></span>${feedback.bar}${github}${sizes}</div>${feedback.row}`
    : `<div class="vw-bar is-c"><div class="vw-c-row${size === 'float' ? ' vw-drag' : ''}">${title}<span class="topbar-spacer"></span>${github}${sizes}${close}</div><div class="vw-c-row">${controls}${feedback.tabs ? `<span class="topbar-spacer"></span>${feedback.tabs}` : ''}</div></div>${feedback.row}`;
}

/** Which ends of the option strip hide options; 1px of slack absorbs subpixel widths. */
export function stripEdges(scrollLeft: number, clientWidth: number, scrollWidth: number): { start: boolean; end: boolean } {
  return { start: scrollLeft > 1, end: scrollLeft + clientWidth < scrollWidth - 1 };
}

/** The smallest scroll that shows an option in full, clear of the strip's fade by `inset`. */
export function revealScroll(scrollLeft: number, clientWidth: number, left: number, width: number, inset: number): number {
  if (left - inset < scrollLeft) return Math.max(0, left - inset);
  if (left + width + inset > scrollLeft + clientWidth) return left + width + inset - clientWidth;
  return scrollLeft;
}
const STRIP_FADE = 36;
/** Long enough that sweeping the pointer across tiles prepares nothing, short enough to lead the click by most of a second. */
const PREPARE_DWELL_MS = 120;

/** Mounted outside the app, which remains mounted underneath all three sizes. */
export function mountCanvasViewer(app: HTMLElement, captureState?: () => () => void): { isOpen: () => boolean } {
  const viewer = document.createElement('section');
  viewer.id = 'canvas-viewer';
  viewer.hidden = true;
  viewer.setAttribute('aria-labelledby', 'vw-title');
  setTrustedHtml(viewer, '<div id="vw-toolbar"></div><div class="vw-stage"><div class="vw-canvas"></div><aside class="cf-panel" id="vw-feedback" aria-label="Feedback" hidden></aside></div>' +
    ['nw', 'ne', 'sw', 'se']
      .map((corner) => `<span class="vw-grip" data-corner="${corner}" title="Drag to resize" aria-hidden="true"></span>`)
      .join(''));
  document.body.append(viewer);
  const toolbar = viewer.querySelector<HTMLElement>('#vw-toolbar')!;
  const stage = viewer.querySelector<HTMLElement>('.vw-canvas')!;
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
  let documentIds: string[] = [], documentIndex = -1;
  let stripScroll = 0,
    stripPage: string | null = null,
    stripOption: string | null = null;
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
  const feedback = new CanvasFeedback(
    {
      context: () => {
        const route = routing.current;
        if (!route) return null;
        return {
          url: route.url,
          title: route.title,
          ticket: route.ticket ?? null,
          pick: route.pick ?? null,
          variants: route.variants ?? [],
          variant: route.variant ?? null,
          source: source === 'dom' || source === 'engine' || source === 'page' || source === 'none' ? source : 'loading',
          pages,
          page: pageId,
          option: optionId,
          size,
        };
      },
      send: (message) => frame?.contentWindow?.postMessage({ wf: 1, ...message }, '*'),
      repaintToolbar: () => paint(),
    },
    stage,
    viewer.querySelector<HTMLElement>('#vw-feedback')!,
  );
  const syncStrip = (reveal: HTMLElement | null = null): void => {
    const strip = toolbar.querySelector<HTMLElement>('.vw-options');
    if (!strip) return;
    if (reveal) {
      const left = reveal.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft;
      strip.scrollLeft = revealScroll(strip.scrollLeft, strip.clientWidth, left, reveal.offsetWidth, STRIP_FADE);
    }
    const edges = stripEdges(strip.scrollLeft, strip.clientWidth, strip.scrollWidth);
    strip.parentElement?.classList.toggle('has-start', edges.start);
    strip.parentElement?.classList.toggle('has-end', edges.end);
    stripScroll = strip.scrollLeft;
  };
  const paint = (): void => {
    if (!routing.current) return;
    const focused =
      document.activeElement instanceof HTMLElement && toolbar.contains(document.activeElement)
        ? [...document.activeElement.attributes].find((attr) => attr.name.startsWith('data-'))
        : undefined;
    setTrustedHtml(toolbar, canvasToolbarHtml(routing.current, size, pages, pageId, optionId, source, menu, feedback.toolbarParts(size)));
    // Repainting replaces the strip: keep its scroll on the same page, and bring a newly shown option into view.
    const strip = toolbar.querySelector<HTMLElement>('.vw-options');
    if (strip) strip.scrollLeft = pageId === stripPage ? stripScroll : 0;
    syncStrip(pageId === stripPage && optionId === stripOption ? null : (strip?.querySelector<HTMLElement>('.is-on') ?? null));
    stripPage = pageId;
    stripOption = optionId;
    if (focused)
      [...toolbar.querySelectorAll<HTMLElement>(`[${focused.name}]`)]
        .find((el) => el.getAttribute(focused.name) === focused.value)
        ?.focus({ preventScroll: true });
    feedback.paint();
  };
  /** `live` is false while the viewer is only laid out for a canvas prepared ahead of the click. */
  const applySize = (live = true): void => {
    viewer.className = `vw is-${size === 'full' ? 'a' : size === 'pane' ? 'c' : 'f'} has-corner-grips`;
    viewer.setAttribute('role', size === 'full' ? 'dialog' : 'region');
    if (size === 'full') viewer.setAttribute('aria-modal', 'true');
    else viewer.removeAttribute('aria-modal');
    viewer.inert = !live;
    if (live) {
      app.inert = size === 'full';
      app.classList.toggle('has-canvas-pane', size === 'pane');
    }
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
  /** The tile's own picture, kept under the canvas until it paints. Tiles that preview a live page have none. */
  const posterFor = (from: Element | null): HTMLImageElement | null => {
    const image = from?.closest('.wf-var, .proto-tile, .wf-proto')?.querySelector<HTMLImageElement>('img');
    if (!image) return null;
    const copy = image.cloneNode() as HTMLImageElement;
    copy.className = 'vw-poster-image';
    return copy;
  };
  /** A prepared canvas is laid out but invisible; once it has loaded the viewer goes back to hidden, frame kept. */
  const settle = (): void => {
    if (routing.current || !viewer.classList.contains('is-warm')) return;
    viewer.classList.remove('is-warm');
    viewer.hidden = true;
  };
  const mountFrame = (route: CanvasRoute, from: Element | null): void => {
    documentIds = [];
    documentIndex = -1;
    mountedUrl = route.url;
    pages = [];
    pageId = null;
    optionId = null;
    source = 'loading';
    for (const old of stage.querySelectorAll('.vw-poster-image, .vw-frame')) old.remove();
    const poster = posterFor(from);
    if (poster) stage.prepend(poster);
    insertTrustedHtml(poster ?? stage, poster ? 'afterend' : 'afterbegin', canvasFrameHtml(route));
    const mounted = stage.querySelector<HTMLIFrameElement>('.vw-frame')!;
    frame = mounted;
    mounted.addEventListener('load', () => {
      mounted.classList.add('is-ready');
      if (frame === mounted) settle();
    });
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (source === 'loading') {
        source = 'none';
        frame?.classList.add('is-ready');
        paint();
      }
      settle();
    }, 3000);
  };
  const openFrame = (route: CanvasRoute): void => {
    pendingFile = route.file;
    if (mountedUrl !== route.url) {
      mountFrame(route, origin);
      return;
    }
    // Prepared ahead of the click but still loading: show the tile's picture meanwhile.
    if (frame && !frame.classList.contains('is-ready') && !stage.querySelector('.vw-poster-image')) {
      const poster = posterFor(origin);
      if (poster) stage.prepend(poster);
    }
    chooseFile();
  };
  /** Loads a canvas ahead of the click, at the size it will open at, so opening it finds it ready. */
  const prepare = (target: HTMLElement): void => {
    if (routing.current || document.hidden) return;
    const route = readCanvasRoute(canvasEntryRoute(target.dataset, target.dataset['canvasUrl']), location.origin);
    if (!route || route.url === mountedUrl) return;
    size = canvasSize();
    viewer.hidden = false;
    applySize(false);
    viewer.classList.add('is-warm');
    mountFrame(route, target);
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
      feedback.reset();
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
      if (!isCanvasClick(event)) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-canvas-url]') : null;
      if (!target) return;
      const route = readCanvasRoute(canvasEntryRoute(target.dataset, target.dataset['canvasUrl']), location.origin);
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
  // Load the canvas while the pointer settles on a tile or focus lands on it, so the click finds it ready.
  let prepareTimer: ReturnType<typeof setTimeout> | undefined;
  const entryAt = (event: Event): HTMLElement | null =>
    event.target instanceof Element ? event.target.closest<HTMLElement>('[data-canvas-url]') : null;
  const prepareSoon = (event: Event): void => {
    const target = entryAt(event);
    if (!target) return;
    clearTimeout(prepareTimer);
    prepareTimer = setTimeout(() => prepare(target), PREPARE_DWELL_MS);
  };
  document.addEventListener('pointerover', prepareSoon, true);
  document.addEventListener('focusin', prepareSoon, true);
  document.addEventListener(
    'pointerout',
    (event) => {
      if (entryAt(event)) clearTimeout(prepareTimer);
    },
    true,
  );
  document.addEventListener(
    'pointerdown',
    (event) => {
      const target = entryAt(event);
      if (!target) return;
      clearTimeout(prepareTimer);
      prepare(target);
    },
    true,
  );
  // A live tile preview can focus itself while the viewer is open, and Esc would then go to that hidden frame.
  window.addEventListener('blur', () => {
    if (!routing.current) return;
    setTimeout(() => {
      const active = document.activeElement;
      if (routing.current && active instanceof HTMLIFrameElement && !viewer.contains(active) && active.getAttribute('aria-hidden') === 'true')
        toolbar.querySelector<HTMLElement>('[data-close]')?.focus({ preventScroll: true });
    });
  });
  toolbar.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('button') : null;
    if (!button) return;
    if (button.dataset['scroll']) {
      const strip = toolbar.querySelector<HTMLElement>('.vw-options');
      strip?.scrollBy({
        left: Number(button.dataset['scroll']) * strip.clientWidth * 0.8,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
      return;
    }
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
  // Scroll does not bubble, so the toolbar listens in the capture phase.
  toolbar.addEventListener(
    'scroll',
    (event) => {
      if (event.target instanceof HTMLElement && event.target.classList.contains('vw-options')) syncStrip();
    },
    true,
  );
  toolbar.addEventListener('focusin', (event) => {
    if (event.target instanceof HTMLElement && event.target.parentElement?.classList.contains('vw-options')) syncStrip(event.target);
  });
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (!frame || event.source !== frame.contentWindow) return;
    const message = readCanvasMessage(event.data);
    if (!message) return;
    if (message.type === 'document') {
      const index = documentIds.indexOf(message.id);
      if (index >= 0) {
        if (index < documentIndex && routing.current) routing.close();
        documentIndex = index;
      } else {
        documentIds = documentIds.slice(0, documentIndex + 1);
        documentIndex = documentIds.push(message.id) - 1;
      }
    }
    if (message.type === 'ready') {
      pages = message.pages;
      source = message.source;
      clearTimeout(timer);
      frame.classList.add('is-ready');
      if (routing.current) chooseFile();
    }
    if (message.type === 'hit') return feedback.onHit(message);
    if (message.type === 'layout') return feedback.onLayout(message.marks, message.viewport);
    if (message.type === 'state' && (pageId !== message.page || optionId !== message.option)) {
      pageId = message.page;
      optionId = message.option;
      feedback.stateChanged();
    }
    if (message.type === 'targets') return feedback.onTargets(message.items);
    if (message.type === 'key' && message.key !== 'Escape') return feedback.canvasKey(message.key);
    if (message.type === 'key' && feedback.escape()) return;
    if ((message.type === 'key' || message.type === 'back') && routing.current) routing.close();
    paint();
  });
  document.addEventListener(
    'keydown',
    (event) => {
      if (!routing.current) return;
      // In the pane and the floating window the map stays live, so its keys stay its own.
      const inViewer = size === 'full' || (event.target instanceof Node && viewer.contains(event.target));
      if (inViewer && !menu && feedback.key(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
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
        const items = [...viewer.querySelectorAll<HTMLElement>('button, a[href], iframe, textarea, input, select, [tabindex="0"]')].filter((el) => !el.closest('[hidden]'));
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
    if (!routing.current) return;
    applySize();
    // A narrower window can push the open option out of the strip.
    syncStrip(toolbar.querySelector<HTMLElement>('.vw-options .is-on'));
  });
  // A copied/reloaded viewer URL waits for its real originating tile to load.
  const requested = new URL(location.href).searchParams.get('canvas');
  if (requested) {
    const observer = new MutationObserver(() => {
      const target = [...app.querySelectorAll<HTMLElement>('[data-canvas-url]')].find((el) => el.dataset['canvasUrl'] === requested);
      if (!target) return;
      const route = readCanvasRoute(canvasEntryRoute(target.dataset, requested), location.origin);
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
