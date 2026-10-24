import { shortcutAria, shortcutAssignments, shortcutFromEvent } from '../canvasShortcuts.js';
/**
 * D4 from #210 (kept in PR #290, recorded in #211): pins, elements, colours and notes on a canvas
 * option, collected in a closable feedback panel, reviewed there and posted as one comment on the
 * prototype ticket. There is no pick here: the pick is made in the T3 Code thread for the pick ticket.
 */
import { CANVAS_NOTES_MARKER, canvasNotesComment, canvasNotesThreadMessage, markOrder, markScope, markTitle } from '../canvasNotes.js';
import type { CanvasMark, CanvasNotesContext, CanvasNotesSource } from '../canvasNotes.js';
import { parsePrototypeFilePath } from '../prototypes.js';
import { scopedApiPath } from '../repoRoutes.js';
import { BASIC_COLORS, PROJECT_COLOR_TOKENS, clamp, fromHsv, parseColor, rgbText, toHsv } from './canvasColor.js';
import type { Hsv } from './canvasColor.js';
import type { CanvasSize } from './canvasPreference.js';
import { icon, CHECK, CLOSE, COPY, EXTERNAL, INFO, PLAY, PLUS, REFRESH } from './icons.js';
import { escapeHtml, renderMarkdown } from './markdown.js';
import { setTrustedHtml } from './trustedHtml.js';

export const FEEDBACK_ICONS = {
  pin: '<path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  cursor: '<path d="M5 3l14 7-6 2-2 6z"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  note: '<path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.5-5.6A8.5 8.5 0 1 1 21 12z"/><path d="M9 11h6M9 14h4"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  send: '<path d="M21 3 10 14"/><path d="M21 3 14 21l-4-7-7-4z"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
};

export type FeedbackTool = 'pin' | 'element' | 'color';
type ToolId = FeedbackTool | 'note';
/** Default tool metadata; actual keys come from the saved #292 D assignments. */
export const FEEDBACK_TOOLS: readonly { id: ToolId; name: string; icon: string; key: string; mode: boolean }[] = [
  { id: 'pin', name: 'Pin', icon: FEEDBACK_ICONS.pin, key: 'P', mode: true },
  { id: 'element', name: 'Select element', icon: FEEDBACK_ICONS.cursor, key: 'E', mode: true },
  { id: 'color', name: 'Color picker', icon: FEEDBACK_ICONS.drop, key: 'C', mode: true },
  { id: 'note', name: 'Note', icon: FEEDBACK_ICONS.note, key: 'N', mode: false },
];
export const PANEL_KEY = 'F';

/** What the viewer knows about the open canvas. */
export interface FeedbackContext {
  /** The canvas route's URL, which keys its unsent feedback. */
  url: string;
  title: string;
  ticket: number | null;
  pick: number | null;
  /** The prototype's variants, for snapshots and canvases that never answer. */
  variants: readonly { id: string; name: string }[];
  /** The variant the canvas was opened from, if any. */
  variant: string | null;
  source: 'loading' | CanvasNotesSource;
  pages: readonly { id: string; title: string; options: readonly { id: string; name: string }[] }[];
  page: string | null;
  option: string | null;
  size: CanvasSize;
}

export interface FeedbackHost {
  context(): FeedbackContext | null;
  /** To the canvas frame. */
  send(message: Record<string, unknown>): void;
  /** Repaint the toolbar, which asks `toolbarParts` again. */
  repaintToolbar(): void;
  post?: (url: string, body: unknown) => Promise<unknown>;
}

interface Mark extends CanvasMark {
  id: number;
  /** Pins: the element under the pin and the place inside it, for tracking only (not posted). */
  anchor?: { selector: string; ax: number; ay: number };
}
/** A comment on GitHub, and the ticket's tracked T3 Code thread when the post found one. */
interface Posted {
  url: string;
  body: string;
  at: number;
  handOffId: string | null;
}
/** Send to T3 Code, from the bar over the canvas (#322, E in #314). Only the button sends. */
type ThreadSend = { state: 'idle' } | { state: 'sending' } | { state: 'sent'; handOffId: string } | { state: 'failed'; reason: string };
interface Session {
  marks: Mark[];
  /** Set when the marks as they stand are exactly what was posted. */
  posted: Posted | null;
  /** The last post, kept through edits, so posting the same notes again asks first. */
  last: Posted | null;
  posting: boolean;
  /** Why the last post did not reach GitHub. */
  failed: string | null;
  /** The posted bar over the canvas, until it is dismissed. */
  bar: boolean;
  send: ThreadSend;
  copied: boolean;
  /** No bridge: the option the person says is showing. */
  chosen: string | null;
}
type Rect = { left: number; top: number; width: number; height: number };
export type CanvasHit =
  | { requestId: number; miss: true }
  | {
      requestId: number;
      miss?: false;
      x: number;
      y: number;
      name: string | null;
      selector: string | null;
      color: string | null;
      rect: Rect | null;
      /** Where inside the element under the point, so a pin follows it. */
      ax?: number;
      ay?: number;
      palette?: [string, string][];
    };

const NO_BRIDGE = 'This canvas did not answer, so Wayfinder cannot tell where you are pointing.';
const HEX = /^#[0-9a-f]{6}$/;
const plural = (n: number, one: string): string => `${String(n)} ${one}${n === 1 ? '' : 's'}`;
const safeColor = (value: string | undefined): string => (value && HEX.test(value) ? value : '#000000');

async function postJson(url: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const value = (await response.json().catch(() => ({}))) as { error?: string; reason?: string };
  if (!response.ok) throw Object.assign(new Error(value.error ?? 'The server did not answer.'), { reason: value.reason });
  return value;
}

/** How long ago a post was, for the post-again check. */
export function postedAgo(at: number, now = Date.now()): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${plural(minutes, 'minute')} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${plural(hours, 'hour')} ago`;
  return `on ${new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

const SPIN = '<span class="cf-spin" aria-hidden="true"></span>';
const T3_NEXT = 'Return to your T3 Code thread to continue.';

/** The comment as GitHub shows it: the hidden block for agents is left out of the preview. */
export function commentPreviewHtml(markdown: string): string {
  // The block is always last, and `--` inside it is escaped, so the last marker is the real one.
  const at = markdown.lastIndexOf(CANVAS_NOTES_MARKER);
  const visible = at < 0 ? markdown : markdown.slice(0, at).trimEnd();
  return renderMarkdown(visible.replace(/&lt;/g, '<'));
}

export class CanvasFeedback {
  private readonly sessions = new Map<string, Session>();
  private nextId = 1;
  private nextRequest = 1;
  private readonly requests = new Map<number, { purpose: 'hover' | 'near' | FeedbackTool; where: string; mark?: number }>();
  /** Keyed by the element's selector, which the canvas sends: it survives filtering and scrolling. */
  private targets: { key: string; name: string; rect: Rect }[] = [];
  /** Each moved pin's latest movement question; older answers are dropped. */
  private readonly latestNear = new Map<number, number>();
  private hoverPending = false;
  private hoverAgain: { x: number; y: number } | null = null;
  private tool: FeedbackTool | null = null;
  private editing: number | null = null;
  private panelOpen = true;
  private panel: 'edit' | 'review' | 'posted' = 'edit';
  paneTab: 'canvas' | 'feedback' = 'canvas';
  private fmt: 'hex' | 'rgb' = 'hex';
  private ptab: 'canvas' | 'project' | 'basic' = 'canvas';
  private hsv: Hsv | null = null;
  private markdownView = false;
  private notice: string | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  private hover: { rect: Rect; name: string } | null = null;
  private layout = new Map<number, Rect | null>();
  private viewport: Rect | null = null;
  private palette: [string, string][] = [];
  private readonly marksLayer: HTMLElement;
  private marksHtml: string | null = null;
  private readonly popLayer: HTMLElement;
  private readonly live: HTMLElement;
  /** The bar over the canvas: posted, sending, sent, not sent, not posted. */
  private readonly barSlot: HTMLElement;
  private dialog: HTMLDialogElement | null = null;

  constructor(
    private readonly host: FeedbackHost,
    private readonly canvas: HTMLElement,
    private readonly aside: HTMLElement,
  ) {
    this.marksLayer = document.createElement('div');
    this.marksLayer.className = 'cf-layer';
    this.popLayer = document.createElement('div');
    this.popLayer.className = 'cf-poplayer';
    this.live = document.createElement('div');
    this.live.className = 'cf-live';
    this.live.setAttribute('role', 'status');
    this.live.setAttribute('aria-live', 'polite');
    this.barSlot = document.createElement('div');
    this.barSlot.className = 'cf-barslot';
    this.barSlot.hidden = true;
    canvas.append(this.marksLayer, this.popLayer);
    canvas.before(this.barSlot);
    // Beside the canvas, not in it: the side pane hides the canvas on the Feedback tab, where posting happens.
    (canvas.parentElement ?? canvas).append(this.live);
    this.wire();
  }

  // ---------- session and where things are ----------
  private session(): Session | null {
    const context = this.host.context();
    if (!context) return null;
    let session = this.sessions.get(context.url);
    if (!session) {
      session = { marks: [], posted: null, last: null, posting: false, failed: null, bar: false, send: { state: 'idle' }, copied: false, chosen: null };
      this.sessions.set(context.url, session);
    }
    return session;
  }
  private get marks(): Mark[] {
    return this.session()?.marks ?? [];
  }
  /** The file the viewer opened, for snapshots and canvases that never answered. */
  private file(context: FeedbackContext): string {
    return parsePrototypeFilePath(context.url.split(/[?#]/)[0] ?? '')?.file ?? context.url;
  }
  private bridged(context: FeedbackContext): boolean {
    return context.source === 'dom' || context.source === 'engine';
  }
  private currentPage(context: FeedbackContext): { id: string; title: string; options: readonly { id: string; name: string }[] } {
    if (this.bridged(context)) {
      const page = context.pages.find((candidate) => candidate.id === context.page) ?? context.pages[0];
      if (page) return page;
    }
    const file = this.file(context);
    return { id: file, title: file, options: context.variants };
  }
  /** The option showing: from the canvas, from the tile for a snapshot, or as the person said. */
  private currentOption(context: FeedbackContext): string | null {
    if (this.bridged(context)) return context.option;
    if (context.source === 'page') return null;
    const session = this.session();
    return session?.chosen ?? context.variant ?? context.variants[0]?.id ?? null;
  }
  private optionName(context: FeedbackContext, page: string, option: string | null): string | null {
    if (option === null) return null;
    const pages = this.bridged(context) ? context.pages : [this.currentPage(context)];
    return pages.find((p) => p.id === page)?.options.find((o) => o.id === option)?.name ?? option;
  }
  private notesContext(context: FeedbackContext): CanvasNotesContext {
    const parsed = parsePrototypeFilePath(context.url.split(/[?#]/)[0] ?? '');
    const pages = this.bridged(context) ? context.pages : [this.currentPage(context)];
    return {
      branch: parsed?.branch ?? '',
      sha: parsed?.sha ?? null,
      source: context.source === 'loading' ? 'none' : context.source,
      pages: pages.map((page) => page.id),
      options: Object.fromEntries(pages.map((page) => [page.id, page.options.map((option) => option.id)])),
    };
  }
  private order(context: FeedbackContext): number[] {
    return markOrder(this.marks, this.notesContext(context));
  }
  private num(context: FeedbackContext, index: number): number {
    return this.order(context).indexOf(index) + 1;
  }
  private title(context: FeedbackContext, index: number): string {
    const source = context.source === 'loading' ? 'none' : context.source;
    return markTitle(this.marks[index]!, this.num(context, index), source);
  }
  private onCanvas(mark: Mark): boolean {
    return mark.type !== 'note';
  }
  /** Marks drawn on the canvas right now: the option showing, or the whole snapshot. */
  private shown(context: FeedbackContext): number[] {
    const page = this.currentPage(context).id;
    const option = this.currentOption(context);
    return [...this.marks.keys()].filter((index) => {
      const mark = this.marks[index]!;
      if (!this.onCanvas(mark) || mark.page !== page) return false;
      return context.source === 'page' || (this.bridged(context) && mark.option === option && option !== null);
    });
  }
  offReason(id: ToolId, context = this.host.context()): string {
    if (!context || id === 'note') return '';
    if (context.source === 'loading') return 'The canvas is still loading';
    if (context.source === 'none') return NO_BRIDGE;
    if (context.source === 'page') return id === 'pin' ? '' : 'Snapshots do not report their elements or colours';
    return context.option === null ? 'Open an option first' : '';
  }

  // ---------- the toolbar ----------
  toolbarParts(size: CanvasSize): { bar: string; row: string; tabs: string } {
    const context = this.host.context();
    const session = this.session();
    if (!context || !session) return { bar: '', row: '', tabs: '' };
    const compact = size !== 'full';
    const n = session.marks.length;
    const badge = n ? `<span class="badge cf-badge">${String(n)}</span>` : '';
    const assignments = shortcutAssignments();
    const tools = `<div class="segmented cf-toolgroup" role="group" aria-label="Feedback tools">${FEEDBACK_TOOLS.map((defaultTool) => {
      const tool = { ...defaultTool, key: assignments[defaultTool.id] };
      const off = this.offReason(tool.id, context);
      const on = tool.mode && this.tool === tool.id;
      return `<button type="button" class="seg${on ? ' is-on' : ''}" data-fb-tool="${tool.id}" aria-label="${tool.name}" aria-keyshortcuts="${shortcutAria(tool.key)}"${tool.mode ? ` aria-pressed="${String(on)}"` : ''}${off ? ` aria-disabled="true" title="${escapeHtml(off)}"` : ` title="${tool.name} (${tool.key})"`}>${icon(tool.icon)}${compact ? '' : `<span class="vw-lbl">${tool.name}</span><kbd>${tool.key}</kbd>`}</button>`;
    }).join('')}</div>`;
    const why =
      context.source === 'none'
        ? `<span class="cf-chip is-warn" title="${NO_BRIDGE}">${icon(INFO)}${compact ? 'Notes only' : 'Notes only: this canvas did not answer'}</span>`
        : '';
    const row = `<div class="cf-toolrow" role="toolbar" aria-label="Annotate">${tools}${why}<span class="topbar-spacer"></span><button type="button" class="ghost cf-shortcuts" data-canvas-shortcuts title="Change these keys in Settings &rsaquo; Keyboard shortcuts">${icon('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 15h10"/>')}Shortcuts</button></div>`;
    if (compact) {
      const tab = (id: 'canvas' | 'feedback', label: string): string =>
        `<button type="button" role="tab" class="seg${this.paneTab === id ? ' is-on' : ''}" aria-selected="${String(this.paneTab === id)}" data-fb-tab="${id}"${id === 'feedback' ? ` aria-keyshortcuts="${shortcutAria(shortcutAssignments().panel)}"` : ''}>${label}${id === 'feedback' && n ? ` ${badge}` : ''}</button>`;
      return { bar: '', row, tabs: `<div class="segmented cf-tabs" role="tablist" aria-label="Pane view">${tab('canvas', 'Canvas')}${tab('feedback', 'Feedback')}</div>` };
    }
    const chip = session.posted && context.ticket !== null ? `<span class="cf-chip is-ok">${icon(CHECK)}Posted to GitHub · #${String(context.ticket)}</span>` : '';
    const toggle = `<button type="button" class="ghost cf-toggle${this.panelOpen ? ' is-on' : ''}" data-fb-act="panel" aria-pressed="${String(this.panelOpen)}" aria-controls="vw-feedback" aria-keyshortcuts="${shortcutAria(shortcutAssignments().panel)}" title="Feedback panel (${shortcutAssignments().panel})">${icon(FEEDBACK_ICONS.panel)}<span class="vw-lbl">Feedback</span>${badge}<kbd>${shortcutAssignments().panel}</kbd></button>`;
    return { bar: `${chip}${toggle}<span class="vw-sep"></span>`, row, tabs: '' };
  }

  // ---------- paint ----------
  /** Whether the panel and the canvas show, for the viewer's stage layout. */
  visibility(size: CanvasSize): { panel: boolean; canvas: boolean } {
    if (size === 'full') return { panel: this.panelOpen, canvas: true };
    return { panel: this.paneTab === 'feedback', canvas: this.paneTab === 'canvas' };
  }
  paint(): void {
    const context = this.host.context();
    if (!context) return;
    const focus = document.activeElement instanceof HTMLElement && [this.aside, this.popLayer, this.barSlot].some((part) => part.contains(document.activeElement))
      ? [...document.activeElement.attributes].find((attr) => attr.name.startsWith('data-fb-'))
      : undefined;
    const textField = (el: Element | null | undefined): el is HTMLTextAreaElement | HTMLInputElement =>
      el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type === 'text');
    const caret = textField(document.activeElement) ? ([document.activeElement.selectionStart, document.activeElement.selectionEnd] as const) : null;
    const { panel, canvas } = this.visibility(context.size);
    this.aside.hidden = !panel;
    this.canvas.hidden = !canvas;
    this.canvas.parentElement?.classList.toggle('has-feedback', panel && canvas);
    this.canvas.classList.toggle('is-pinning', this.tool === 'pin');
    this.canvas.classList.toggle('is-selecting', this.tool === 'element' || this.tool === 'color');
    if (panel) setTrustedHtml(this.aside, this.panelHtml(context));
    this.paintBar(context, canvas);
    this.paintMarks();
    this.paintPopover();
    this.track();
    if (focus) {
      const target = [...document.querySelectorAll<HTMLElement>(`#canvas-viewer [${focus.name}]`)].find((el) => el.getAttribute(focus.name) === focus.value);
      target?.focus({ preventScroll: true });
      if (caret && textField(target)) target.setSelectionRange(caret[0], caret[1]);
    }
  }
  private repaint(): void {
    this.host.repaintToolbar();
    this.paint();
  }

  // ---------- the bar over the canvas (#322, E in #314) ----------
  private paintBar(context: FeedbackContext, canvasShown: boolean): void {
    const html = canvasShown ? this.barHtml(context) : '';
    if (html === this.barSlot.dataset['html']) return;
    // Keyed on the markup, so a repaint for a mark or a hover leaves the bar and its focus alone.
    this.barSlot.dataset['html'] = html;
    setTrustedHtml(this.barSlot, html);
    this.barSlot.hidden = html === '';
  }
  private ticketUrl(context: FeedbackContext): string | null {
    const repo = parsePrototypeFilePath(context.url.split(/[?#]/)[0] ?? '')?.repo;
    return repo && context.ticket !== null ? `https://github.com/${repo}/issues/${String(context.ticket)}` : null;
  }
  private viewLink(url: string, label = 'View comment'): string {
    return `<a class="ghost cf-sm" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${icon(EXTERNAL)}${label}</a>`;
  }
  /** "Not posted" for GitHub's answer, said where the person will see it. */
  private failedText(context: FeedbackContext, session: Session, where: 'bar' | 'panel'): string {
    const ticket = `#${String(context.ticket)}`;
    const reason = session.failed ? ` ${session.failed.replace(/\.?$/, '.')}` : '';
    const notes = plural(session.marks.length, 'note');
    return where === 'bar'
      ? `GitHub did not answer.${reason} Your ${notes} ${session.marks.length === 1 ? 'is' : 'are'} still here. If the connection dropped while posting, check ${ticket} before you try again from the panel.`
      : `GitHub did not answer.${reason} Your ${notes} ${session.marks.length === 1 ? 'is' : 'are'} still here. If the connection dropped while posting, check ${ticket} before you try again so it isn’t posted twice.`;
  }
  private barHtml(context: FeedbackContext): string {
    const session = this.session();
    if (!session || context.ticket === null) return '';
    const where = `GitHub · #${String(context.ticket)}`;
    const check = this.ticketUrl(context);
    if (session.failed !== null && !session.posting)
      return `<div class="cf-bar is-warn" role="alert"><span class="cf-bar-ic">${icon(INFO)}</span><div class="cf-bar-t"><b>Not posted to ${where}</b><span>${escapeHtml(this.failedText(context, session, 'bar'))}</span></div><div class="cf-bar-row">${check ? this.viewLink(check, `Check #${String(context.ticket)}`) : ''}</div></div>`;
    const posted = session.posted;
    if (!posted || !session.bar) return '';
    const ticket = `#${String(context.ticket)}`;
    const message = canvasNotesThreadMessage(context.ticket, posted.url);
    const close = `<button type="button" class="iconbtn" data-fb-act="bar-close" aria-label="Dismiss the posted message">${icon(CLOSE)}</button>`;
    const ok = `<span class="cf-ok">${icon(CHECK)}</span>`;
    const shell = (warn: boolean, head: string, text: string, row: string): string =>
      `<div class="cf-bar${warn ? ' is-warn' : ''}" role="${warn ? 'alert' : 'status'}" aria-labelledby="cf-bar-h">${warn ? `<span class="cf-bar-ic">${icon(INFO)}</span>` : ok}<div class="cf-bar-t"><b id="cf-bar-h" tabindex="-1">${head}</b>${text}</div><div class="cf-bar-row">${row}</div>${close}</div>`;
    const view = this.viewLink(posted.url);
    const copy = `<button type="button" class="primary cf-sm" data-fb-act="bar-copy">${icon(COPY)}${session.copied ? 'Copied' : 'Copy message for T3 Code'}</button>`;
    const quote = (verb: string): string => `<span class="cf-msg">${verb}: “${escapeHtml(message)}”</span>`;
    if (posted.handOffId === null)
      return shell(false, `Posted to ${where}`, `<span>${T3_NEXT} Wayfinder doesn’t know this ticket’s thread, so paste the message there yourself.</span>${quote('Copies')}`, `${view}${copy}`);
    const send = session.send;
    if (send.state === 'sending')
      return shell(false, `Posted to ${where}`, `<span>Sending the link to your T3 Code thread for ${ticket}…</span>${quote('Sends')}`, `${view}<button type="button" class="primary cf-sm" data-fb-act="bar-send" disabled aria-busy="true">${SPIN}Sending…</button>`);
    if (send.state === 'sent')
      return shell(false, `Posted to ${where} · sent to T3 Code`, `<span>Your T3 Code thread for ${ticket} has the link, and the agent is reading it. Continue there.</span>`, `${view}<button type="button" class="primary cf-sm" data-open-handoff="${escapeHtml(send.handOffId)}">${icon(PLAY)}Open T3 Code thread</button>`);
    if (send.state === 'failed')
      return shell(true, `Posted to ${where} · not sent to T3 Code`, `<span>${escapeHtml(send.reason)} The notes are safe on GitHub.</span>${quote('Sends')}`, `${copy}<button type="button" class="ghost cf-sm" data-fb-act="bar-send">${icon(REFRESH)}Try sending again</button>`);
    return shell(false, `Posted to ${where}`, `<span>${T3_NEXT} Send the link so the agent picks up these notes.</span>${quote('Sends')}`, `${view}<button type="button" class="primary cf-sm" data-fb-act="bar-send">${icon(FEEDBACK_ICONS.send)}Send to T3 Code</button>`);
  }
  private focusBar(selector = '#cf-bar-h'): void {
    this.barSlot.querySelector<HTMLElement>(selector)?.focus();
  }
  /** Moves marks with the canvas's scroll; cheap enough for every layout message. */
  private paintMarks(): void {
    const context = this.host.context();
    if (!context) return;
    const session = this.session();
    const posted = session?.posted ? ' is-posted' : '';
    const view = this.viewport;
    const inside = (rect: Rect): boolean =>
      !view || (rect.left + rect.width >= view.left && rect.left <= view.left + view.width && rect.top + rect.height >= view.top && rect.top <= view.top + view.height);
    const marks = this.shown(context)
      .map((index) => {
        const mark = this.marks[index]!;
        const rect = this.layout.get(mark.id);
        if (!rect || !inside(rect)) return '';
        const open = this.editing === mark.id ? ' is-open' : '';
        const label = escapeHtml(`${this.title(context, index)}: ${mark.note.trim() || 'no note yet'}`);
        const n = String(this.num(context, index));
        if (mark.type === 'pin')
          return `<button type="button" class="cf-pin${open}${posted}" style="left:${String(rect.left)}px;top:${String(rect.top)}px" data-fb-mark="${String(mark.id)}" aria-label="${label}. Arrow keys move it."><span>${n}</span></button>`;
        const chip =
          mark.type === 'color'
            ? `<span class="cf-el-colors" aria-hidden="true"><i style="background:${safeColor(mark.from)}"></i><i style="background:${safeColor(mark.to)}"></i></span>`
            : '';
        return `<button type="button" class="cf-el${open}${posted}" style="left:${String(rect.left)}px;top:${String(rect.top)}px;width:${String(rect.width)}px;height:${String(rect.height)}px" data-fb-mark="${String(mark.id)}" aria-label="${label}"><span class="cf-el-n">${n}</span>${chip}</button>`;
      })
      .join('');
    const hover =
      this.hover && (this.tool === 'element' || this.tool === 'color')
        ? `<div class="cf-hover" style="left:${String(this.hover.rect.left)}px;top:${String(this.hover.rect.top)}px;width:${String(this.hover.rect.width)}px;height:${String(this.hover.rect.height)}px"><span>${escapeHtml(this.hover.name)}</span></div>`
        : '';
    const capture = this.tool && !this.offReason(this.tool, context)
      ? `<div class="cf-capture" data-fb-capture tabindex="-1" aria-hidden="true"></div>`
      : '';
    const selecting = (this.tool === 'element' || this.tool === 'color') && capture;
    const verb = this.tool === 'color' ? 'Pick the colour of' : 'Select';
    const targets = selecting
      ? this.targets
          .filter((target) => inside(target.rect))
          .map(
            (target) =>
              `<button type="button" class="cf-target" style="left:${String(target.rect.left)}px;top:${String(target.rect.top)}px;width:${String(target.rect.width)}px;height:${String(target.rect.height)}px" data-fb-target="${escapeHtml(target.key)}" aria-label="${verb} ${escapeHtml(target.name)}"><span>${escapeHtml(target.name)}</span></button>`,
          )
          .join('')
      : '';
    const hint = this.hintHtml(context);
    const focused =
      document.activeElement instanceof HTMLElement && this.marksLayer.contains(document.activeElement)
        ? [...document.activeElement.attributes].find((attr) => attr.name.startsWith('data-fb-'))
        : undefined;
    const html = `${capture}${hover}${marks}${targets}${hint}`;
    // A board scroll still reports layout with no marks. Keep the unchanged hint
    // mounted instead of rebuilding its DOM on every frame.
    if (html !== this.marksHtml) {
      setTrustedHtml(this.marksLayer, html);
      this.marksHtml = html;
      if (focused) [...this.marksLayer.querySelectorAll<HTMLElement>(`[${focused.name}]`)].find((el) => el.getAttribute(focused.name) === focused.value)?.focus({ preventScroll: true });
    }
    this.placePopover();
  }
  private hintHtml(context: FeedbackContext): string {
    if (this.notice) return `<div class="cf-hint is-soft" role="status">${icon(INFO)}${escapeHtml(this.notice)}</div>`;
    if (this.editing !== null) return '';
    if (this.tool === 'pin') return `<div class="cf-hint" role="status">${icon(FEEDBACK_ICONS.pin)}Click to drop a pin. Enter drops one in the middle; arrow keys move it. <kbd>Esc</kbd> stops.</div>`;
    if (this.tool === 'element') return `<div class="cf-hint" role="status">${icon(FEEDBACK_ICONS.cursor)}Hover or Tab to an element, then click or press Enter. <kbd>Esc</kbd> stops.</div>`;
    if (this.tool === 'color') return `<div class="cf-hint" role="status">${icon(FEEDBACK_ICONS.drop)}Pick an element to change its colour. <kbd>Esc</kbd> stops.</div>`;
    if (this.bridged(context) && context.option === null && context.source !== 'loading')
      return `<div class="cf-hint is-soft" role="status">${icon(INFO)}Open an option to pin it. Notes work here too.</div>`;
    return '';
  }
  private paintPopover(): void {
    const context = this.host.context();
    const index = this.marks.findIndex((mark) => mark.id === this.editing);
    const mark = this.marks[index];
    if (!context || !mark || !this.onCanvas(mark) || this.session()?.posted || !this.shown(context).includes(index)) {
      setTrustedHtml(this.popLayer, '');
      return;
    }
    const title = escapeHtml(this.title(context, index));
    const variants = this.currentPage(context).options;
    const optionField =
      context.source === 'page' && mark.type === 'pin' && variants.length
        ? `<label class="cf-field">Option<select class="input" data-fb-option="${String(mark.id)}">${variants.map((v) => `<option value="${escapeHtml(v.id)}"${v.id === mark.option ? ' selected' : ''}>${escapeHtml(`${v.id} · ${v.name}`)}</option>`).join('')}</select></label>`
        : '';
    const color = mark.type === 'color' ? this.colorEditor(mark) : '';
    setTrustedHtml(
      this.popLayer,
      `<div class="cf-pop${mark.type === 'color' ? ' is-color' : ''}" role="dialog" aria-label="${title}">
        <div class="cf-pop-head"><b>${title}</b><span>${escapeHtml(markScope(mark))}</span></div>
        ${optionField}${color}
        <textarea class="input" rows="2" data-fb-note="${String(mark.id)}" aria-label="Note for ${title}" placeholder="${mark.type === 'color' ? 'Why this colour? (optional)' : 'What should change here?'}">${escapeHtml(mark.note)}</textarea>
        <div class="cf-pop-foot"><button type="button" class="iconbtn" data-fb-del="${String(mark.id)}" aria-label="Delete ${title}">${icon(FEEDBACK_ICONS.trash)}</button><span class="topbar-spacer"></span><button type="button" class="primary" data-fb-act="done">Done</button></div>
      </div>`,
    );
    this.placePopover();
  }
  /** Beside its mark, inside the canvas. */
  private placePopover(): void {
    const pop = this.popLayer.querySelector<HTMLElement>('.cf-pop');
    const rect = this.editing === null ? undefined : this.layout.get(this.editing);
    if (!pop) return;
    if (!rect) {
      pop.style.left = '8px';
      pop.style.top = '8px';
      return;
    }
    const box = this.canvas.getBoundingClientRect();
    const small = rect.width < 60;
    let x = (small ? rect.left + 18 : rect.left + Math.min(rect.width, 120)) + 10;
    if (x + pop.offsetWidth > box.width - 8) x = rect.left - pop.offsetWidth - 14;
    const y = small ? rect.top - 30 : rect.top + 8;
    pop.style.left = `${String(clamp(x, 8, box.width - pop.offsetWidth - 8))}px`;
    pop.style.top = `${String(clamp(y, 8, box.height - pop.offsetHeight - 8))}px`;
  }
  private colorEditor(mark: Mark): string {
    const to = safeColor(mark.to),
      from = safeColor(mark.from);
    const hsv = this.hsv ?? toHsv(to);
    const id = String(mark.id);
    const value = this.fmt === 'hex' ? to : rgbText(to);
    const presets = this.presets();
    const tab = (key: 'canvas' | 'project' | 'basic', name: string): string =>
      `<button type="button" class="seg${this.ptab === key ? ' is-on' : ''}" role="tab" aria-selected="${String(this.ptab === key)}" data-fb-ptab="${key}">${name}</button>`;
    const group = this.ptab === 'canvas' ? 'Colours on this canvas' : this.ptab === 'project' ? 'Project colours' : 'Basic colours';
    return `<div class="cf-cmp"><span class="cf-sw" style="background:${from}" aria-hidden="true"></span><code>${from}</code><span aria-hidden="true">→</span><span class="cf-sw" data-fb-tosw style="background:${to}" aria-hidden="true"></span><code data-fb-tocode>${to}</code></div>
      <div class="cf-sv" data-fb-sv="${id}" style="background-color:hsl(${String(Math.round(hsv.h))} 100% 50%)"><span class="cf-sv-dot" tabindex="0" role="slider" aria-label="Saturation and brightness" aria-valuetext="saturation ${String(Math.round(hsv.s * 100))}%, brightness ${String(Math.round(hsv.v * 100))}%" data-fb-svdot="${id}" style="left:${String(hsv.s * 100)}%;top:${String((1 - hsv.v) * 100)}%"></span></div>
      <input type="range" class="cf-hue" min="0" max="359" value="${String(Math.round(hsv.h))}" data-fb-hue="${id}" aria-label="Hue" />
      <div class="cf-val"><div class="segmented" role="group" aria-label="Colour format"><button type="button" class="seg${this.fmt === 'hex' ? ' is-on' : ''}" aria-pressed="${String(this.fmt === 'hex')}" data-fb-fmt="hex">Hex</button><button type="button" class="seg${this.fmt === 'rgb' ? ' is-on' : ''}" aria-pressed="${String(this.fmt === 'rgb')}" data-fb-fmt="rgb">RGB</button></div><input class="input" data-fb-colorval="${id}" value="${value}" aria-label="Colour, as hex or rgb. Paste either." spellcheck="false" /></div>
      <div class="segmented cf-ptabs" role="tablist" aria-label="Preset colours">${tab('canvas', 'This canvas')}${tab('project', 'Project')}${tab('basic', 'Basic')}</div>
      <div class="cf-swatches" role="group" aria-label="${group}">${presets.map(([c, n]) => `<button type="button" class="cf-swatch${c === to ? ' is-on' : ''}" style="background:${c}" data-fb-swatch="${id}" data-fb-color="${c}" aria-pressed="${String(c === to)}" aria-label="${escapeHtml(n)}, ${c}" title="${escapeHtml(n)} · ${c}"></button>`).join('')}</div>`;
  }
  private presets(): (readonly [string, string])[] {
    if (this.ptab === 'basic') return [...BASIC_COLORS];
    if (this.ptab === 'project') {
      const style = getComputedStyle(document.body);
      return PROJECT_COLOR_TOKENS.map(([token, name]) => [parseColor(cssHex(style.getPropertyValue(token)) ?? '') ?? '', `${name} (${token})`] as const).filter(([c]) => c);
    }
    return this.palette.filter(([c]) => HEX.test(c));
  }

  // ---------- the feedback panel ----------
  private markerHtml(context: FeedbackContext, index: number): string {
    const mark = this.marks[index]!;
    const n = String(this.num(context, index));
    if (mark.type === 'pin') return `<span class="cf-mk is-pin" aria-hidden="true">${n}</span>`;
    if (mark.type === 'element') return `<span class="cf-mk is-el" aria-hidden="true">${n}</span>`;
    if (mark.type === 'color') return `<span class="cf-mk is-color" aria-hidden="true" style="--to:${safeColor(mark.to)}">${n}</span>`;
    return `<span class="cf-mk is-plain" aria-hidden="true">${icon(FEEDBACK_ICONS.note)}</span>`;
  }
  private rowHtml(context: FeedbackContext, index: number): string {
    const mark = this.marks[index]!;
    const title = escapeHtml(this.title(context, index));
    const id = String(mark.id);
    const meta =
      mark.type === 'color'
        ? `<span class="cf-row-colors"><i style="background:${safeColor(mark.from)}"></i><code>${safeColor(mark.from)}</code>→<i style="background:${safeColor(mark.to)}"></i><code>${safeColor(mark.to)}</code></span>`
        : '';
    const kind = this.onCanvas(mark)
      ? `<button type="button" class="cf-row-kind" data-fb-show="${id}" title="Show it on the canvas">${title}</button>`
      : `<span class="cf-row-kind">${title}</span>`;
    return `<div class="cf-row${this.editing === mark.id ? ' is-open' : ''}">${this.markerHtml(context, index)}<div class="cf-row-main">${kind}${meta}<textarea class="input" rows="2" data-fb-note="${id}" aria-label="Note for ${title}" placeholder="What should change?">${escapeHtml(mark.note)}</textarea></div><button type="button" class="iconbtn" data-fb-del="${id}" aria-label="Delete ${title}">${icon(FEEDBACK_ICONS.trash)}</button></div>`;
  }
  comment(context = this.host.context()): string {
    if (!context) return '';
    return canvasNotesComment(this.notesContext(context), this.marks);
  }
  private card(context: FeedbackContext, posted: boolean): string {
    const ticket = context.ticket === null ? '' : `#${String(context.ticket)}`;
    const sent = posted ? this.session()?.posted : null;
    const md = sent ? sent.body : this.comment(context);
    const url = sent?.url ?? null;
    const open = posted && url !== null ? `<a class="ghost cf-sm" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${icon(EXTERNAL)}Open</a>` : '';
    return `<article class="cf-gh" aria-label="${posted ? 'Posted' : 'Comment'} on ${ticket}">
      <header class="cf-gh-head"><span>${posted ? 'Posted' : 'Comment'} on <b>${escapeHtml(context.title)}</b></span>${open}</header>
      <div class="cf-gh-tabs segmented" role="group" aria-label="Preview of the comment on ${ticket}"><button type="button" class="seg${this.markdownView ? '' : ' is-on'}" aria-pressed="${String(!this.markdownView)}" data-fb-view="rendered">Preview</button><button type="button" class="seg${this.markdownView ? ' is-on' : ''}" aria-pressed="${String(this.markdownView)}" data-fb-view="markdown">Markdown</button></div>
      ${this.markdownView ? `<pre class="cf-gh-md">${escapeHtml(md)}</pre>` : `<div class="cf-gh-body">${commentPreviewHtml(md)}</div>`}
    </article>`;
  }
  private panelHtml(context: FeedbackContext): string {
    const ticket = context.ticket === null ? 'the prototype ticket' : `#${String(context.ticket)}`;
    const close = `<button type="button" class="iconbtn" data-fb-act="panel-close" aria-label="Close the feedback panel (${shortcutAssignments().panel})" title="Close (${shortcutAssignments().panel})">${icon(CLOSE)}</button>`;
    if (this.panel === 'review') {
      const session = this.session();
      const posting = session?.posting ?? false;
      const failed = !posting && session?.failed != null;
      const where = context.ticket === null ? 'GitHub' : `GitHub · #${String(context.ticket)}`;
      const check = this.ticketUrl(context);
      // The side pane and the floating window hide the canvas on this tab, so the bar's explanation shows here.
      const error =
        failed && session && context.size !== 'full' && context.ticket !== null
          ? `<div class="cf-banner" role="alert">${icon(INFO)}<div class="cf-banner-t"><b>Not posted to ${where}</b><span>${escapeHtml(this.failedText(context, session, 'panel'))}</span>${check ? this.viewLink(check, `Check #${String(context.ticket)}`) : ''}</div></div>`
          : '';
      const disabled = context.ticket === null ? ' disabled title="Wayfinder does not know this canvas’s ticket"' : posting ? ' disabled aria-busy="true"' : '';
      const label = posting ? `${SPIN}Posting to GitHub…` : failed ? `${icon(REFRESH)}Try again` : `${icon(FEEDBACK_ICONS.send)}Post to ${where}`;
      return `<header class="cf-panel-head"><button type="button" class="iconbtn" data-fb-act="panel-edit" aria-label="Back to edit">${icon(FEEDBACK_ICONS.left)}</button><h2>Review before posting</h2><span class="topbar-spacer"></span>${close}</header>
        <div class="cf-panel-body"><p class="cf-muted">Exactly what goes to GitHub, as a comment on ${ticket}. It does not go to your T3 Code thread. Your marks stay on the canvas while you read.</p>${this.card(context, false)}${error}</div>
        <footer class="cf-panel-foot"><button type="button" class="ghost" data-fb-act="panel-edit">Edit</button><span class="topbar-spacer"></span><button type="button" class="primary" data-fb-act="post"${disabled}>${label}</button></footer>`;
    }
    if (this.panel === 'posted' && this.session()?.posted) {
      return `<header class="cf-panel-head"><span class="cf-ok">${icon(CHECK)}</span><h2>Posted to GitHub · ${ticket}</h2><span class="topbar-spacer"></span>${close}</header>
        <div class="cf-panel-body"><p class="cf-muted">${T3_NEXT}</p>${this.card(context, true)}</div>
        <footer class="cf-panel-foot"><span class="topbar-spacer"></span><button type="button" class="ghost" data-fb-act="panel-fresh">Start new feedback</button></footer>`;
    }
    const page = this.currentPage(context);
    const current = this.currentOption(context);
    const all = [...this.marks.keys()];
    const group = (title: string, rows: number[], add: string): string =>
      `<section class="cf-group"><h3>${title}</h3>${rows.map((index) => this.rowHtml(context, index)).join('')}${add}</section>`;
    const sorted = (rows: number[]): number[] => rows.sort((a, b) => this.num(context, a) - this.num(context, b));
    const pageRows = sorted(all.filter((index) => this.marks[index]!.option === null && this.marks[index]!.page === page.id));
    const showing = (id: string): string => (id === current ? ' <span class="cf-tag">Showing</span>' : '');
    const groups = page.options
      .map((option) => {
        const rows = sorted(all.filter((index) => this.marks[index]!.option === option.id && this.marks[index]!.page === page.id));
        if (!rows.length && option.id !== current) return '';
        return group(
          `${escapeHtml(markScope({ option: option.id, optionName: option.name }))}${showing(option.id)}`,
          rows,
          `<button type="button" class="cf-add" data-fb-addnote="${escapeHtml(option.id)}">${icon(PLUS)}Note on ${escapeHtml(option.id)}</button>`,
        );
      })
      .join('');
    const elsewhere = [...new Set(this.marks.filter((mark) => mark.page !== page.id).map((mark) => mark.page))]
      .map((other) => {
        const rows = sorted(all.filter((index) => this.marks[index]!.page === other));
        return group(escapeHtml(this.marks[rows[0]!]!.pageTitle), rows, '');
      })
      .join('');
    const chooser =
      context.source === 'none' && page.options.length
        ? `<label class="cf-field">Which option is showing? This canvas does not say.<select class="input" data-fb-cur>${page.options.map((o) => `<option value="${escapeHtml(o.id)}"${o.id === current ? ' selected' : ''}>${escapeHtml(`${o.id} · ${o.name}`)}</option>`).join('')}</select></label>`
        : '';
    const warn =
      context.source === 'none'
        ? `<div class="cf-banner">${icon(INFO)}<span>This canvas did not answer, so pins, elements and colours are off. Notes still work on a whole option or the whole page.</span></div>`
        : context.source === 'page'
          ? `<div class="cf-banner is-info">${icon(INFO)}<span>Snapshot: pins mark the page. Elements and colours are off.</span></div>`
          : '';
    const n = this.marks.length;
    return `<header class="cf-panel-head"><h2>Feedback</h2>${n ? `<span class="badge">${String(n)}</span>` : ''}<span class="topbar-spacer"></span><span class="cf-muted">Notes for ${ticket}</span>${close}</header>
      <div class="cf-panel-body">${warn}${chooser}${group('Whole page', pageRows, `<button type="button" class="cf-add" data-fb-addnote="">${icon(PLUS)}Note on the whole page</button>`)}${groups}${elsewhere}</div>
      <footer class="cf-panel-foot"><span class="cf-muted">${plural(n, 'note')}</span><span class="topbar-spacer"></span><button type="button" class="primary" data-fb-act="panel-review"${n ? '' : ' disabled title="Add a note first"'}>Review</button></footer>`;
  }

  // ---------- the canvas bridge ----------
  /** Tell the canvas which marks to report positions for. */
  track(): void {
    const context = this.host.context();
    if (!context || !(context.source === 'dom' || context.source === 'engine' || context.source === 'page')) return;
    const marks = this.shown(context).map((index) => {
      const mark = this.marks[index]!;
      if (mark.type !== 'pin') return { id: mark.id, selector: mark.selector ?? '' };
      return { id: mark.id, x: mark.x ?? 0, y: mark.y ?? 0, ...(mark.anchor ?? {}) };
    });
    this.host.send({ type: 'marks', marks });
  }
  onLayout(marks: readonly { id: number; rect: Rect | null }[], viewport: Rect): void {
    this.layout = new Map(marks.map((mark) => [mark.id, mark.rect]));
    this.viewport = viewport;
    // The canvas moved: what can be selected moved with it.
    this.askTargets();
    this.paintMarks();
  }
  onTargets(items: readonly { name: string; selector: string; rect: Rect }[]): void {
    this.targets = items.map((item) => ({ key: item.selector, name: item.name, rect: item.rect }));
    if (this.tool === 'element' || this.tool === 'color') this.paintMarks();
  }
  private askTargets(): void {
    if (this.tool === 'element' || this.tool === 'color') this.host.send({ type: 'targets' });
  }
  /** A tool key pressed while focus was inside the canvas, which the canvas left alone. */
  canvasKey(key: string): void {
    const assignments = shortcutAssignments();
    const tool = FEEDBACK_TOOLS.find((candidate) => assignments[candidate.id] === key);
    if (tool) this.useTool(tool.id);
    else if (key === assignments.panel) this.togglePanel();
  }
  onHit(hit: CanvasHit): void {
    const asked = this.requests.get(hit.requestId);
    this.requests.delete(hit.requestId);
    const context = this.host.context();
    if (!asked || !context) return;
    const purpose = asked.purpose;
    if (purpose === 'hover') this.hoverPending = false;
    // A late answer about another canvas, page or option describes nothing on screen.
    if (asked.where !== this.where(context)) return;
    if (purpose === 'hover') {
      this.hover = !hit.miss && hit.rect && hit.name ? { rect: hit.rect, name: hit.name } : null;
      this.paintMarks();
      if (this.hoverAgain) {
        const { x, y } = this.hoverAgain;
        this.hoverAgain = null;
        this.hoverAt(x, y);
      }
      return;
    }
    if (hit.miss) return;
    if (hit.palette) this.palette = hit.palette;
    if (purpose === 'near') {
      // A moved pin takes the name of whatever it now sits on.
      const mark = this.marks.find((candidate) => candidate.id === asked.mark);
      if (mark && this.latestNear.get(mark.id) === hit.requestId) {
        this.latestNear.delete(mark.id);
        mark.near = hit.name;
        mark.x = clamp(hit.x, 0, 1);
        mark.y = clamp(hit.y, 0, 1);
        const anchor = anchorOf(hit);
        if (anchor) mark.anchor = anchor;
        else delete mark.anchor;
      }
      this.paint();
      return;
    }
    if (purpose !== this.tool) return;
    const page = this.currentPage(context);
    // A snapshot's pin starts on the option its tile opened, or the first; the popover can change it.
    const option =
      context.source === 'page' ? ((page.options.find((o) => o.id === context.variant) ?? page.options[0])?.id ?? null) : this.currentOption(context);
    const base = { page: page.id, pageTitle: page.title, option, optionName: this.optionName(context, page.id, option), note: '' };
    if (purpose === 'pin') {
      const anchor = anchorOf(hit);
      return this.add({ ...base, type: 'pin', x: clamp(hit.x, 0, 1), y: clamp(hit.y, 0, 1), near: hit.name, ...(anchor ? { anchor } : {}) });
    }
    if (!hit.selector) return this.say('Pick an element on the option, not the space around it.');
    const element = hit.name ?? 'element';
    if (purpose === 'element') return this.add({ ...base, type: 'element', element, selector: hit.selector });
    const color = hit.color && HEX.test(hit.color) ? hit.color : '#000000';
    return this.add({ ...base, type: 'color', element, selector: hit.selector, from: color, to: color });
  }
  private where(context: FeedbackContext): string {
    return JSON.stringify([context.url, this.currentPage(context).id, this.currentOption(context)]);
  }
  private request(purpose: 'hover' | 'near' | FeedbackTool, x: number, y: number, mark?: number): void {
    const requestId = this.nextRequest++;
    const context = this.host.context();
    if (!context) return;
    this.requests.set(requestId, { purpose, where: this.where(context), ...(mark === undefined ? {} : { mark }) });
    if (purpose === 'near' && mark !== undefined) this.latestNear.set(mark, requestId);
    this.host.send({ type: 'hitTest', requestId, x, y, ...(purpose === 'color' ? { palette: true } : {}) });
  }
  private hoverAt(x: number, y: number): void {
    if (this.hoverPending) {
      this.hoverAgain = { x, y };
      return;
    }
    this.hoverPending = true;
    this.request('hover', x, y);
  }

  // ---------- actions ----------
  private say(text: string): void {
    this.live.textContent = text;
  }
  private flash(text: string): void {
    this.notice = text;
    this.say(text);
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      this.notice = null;
      this.paintMarks();
    }, 3000);
    this.paintMarks();
  }
  private add(mark: Omit<Mark, 'id'>): void {
    const session = this.session();
    const context = this.host.context();
    if (!session || !context) return;
    const added = { ...mark, id: this.nextId++ } as Mark;
    session.marks.push(added);
    this.say(`${this.title(context, session.marks.length - 1)} added.`);
    this.edit(added.id);
  }
  private edit(id: number, focusNote = true): void {
    const session = this.session();
    const context = this.host.context();
    if (!session || !context) return;
    this.editing = id;
    session.posted = null;
    // Editing from Review or Posted goes back to the list, so Review never shows a stale comment.
    this.panel = 'edit';
    const mark = session.marks.find((candidate) => candidate.id === id);
    this.hsv = mark?.type === 'color' ? toHsv(safeColor(mark.to)) : null;
    if (mark && !this.onCanvas(mark)) {
      if (context.size === 'full') this.panelOpen = true;
      else this.paneTab = 'feedback';
    }
    this.repaint();
    if (focusNote && mark)
      (this.onCanvas(mark) ? this.popLayer : this.aside).querySelector<HTMLElement>(`[data-fb-note="${String(id)}"]`)?.focus();
  }
  private remove(id: number): void {
    const session = this.session();
    if (!session) return;
    session.marks = session.marks.filter((mark) => mark.id !== id);
    if (this.editing === id) this.editing = null;
    this.say('Deleted.');
    this.repaint();
  }
  useTool(id: ToolId): void {
    const context = this.host.context();
    if (!context) return;
    const off = this.offReason(id, context);
    if (off) return this.flash(off);
    if (context.size !== 'full') this.paneTab = id === 'note' ? 'feedback' : 'canvas';
    if (id === 'note') {
      const page = this.currentPage(context);
      const option = context.source === 'page' ? null : this.currentOption(context);
      return this.add({ type: 'note', page: page.id, pageTitle: page.title, option, optionName: this.optionName(context, page.id, option), note: '' });
    }
    this.tool = this.tool === id ? null : id;
    this.hover = null;
    this.editing = null;
    this.targets = [];
    this.askTargets();
    this.repaint();
    this.marksLayer.querySelector<HTMLElement>('[data-fb-capture]')?.focus({ preventScroll: true });
  }
  togglePanel(): void {
    const context = this.host.context();
    if (!context) return;
    if (context.size === 'full') this.panelOpen = !this.panelOpen;
    else this.paneTab = this.paneTab === 'feedback' ? 'canvas' : 'feedback';
    this.repaint();
  }
  /** Esc stops a tool or closes a popover before the viewer uses it. */
  escape(): boolean {
    if (this.editing === null && this.tool === null) return false;
    this.editing = null;
    this.tool = null;
    this.hover = null;
    this.repaint();
    return true;
  }
  /** The canvas moved to another page or option: drop what belonged to the old one. */
  stateChanged(): void {
    const context = this.host.context();
    if (context && this.tool && this.offReason(this.tool, context)) this.tool = null;
    this.hover = null;
    this.hoverPending = false;
    this.hoverAgain = null;
    this.requests.clear();
    this.targets = [];
    this.askTargets();
    this.layout.clear();
    this.palette = [];
    if (context && this.editing !== null) {
      const index = this.marks.findIndex((mark) => mark.id === this.editing);
      const mark = this.marks[index];
      if (mark && this.onCanvas(mark) && !this.shown(context).includes(index)) this.editing = null;
    }
  }
  /** A new canvas opened in the viewer. */
  reset(): void {
    this.tool = null;
    this.editing = null;
    this.hover = null;
    this.panel = this.session()?.posted ? 'posted' : 'edit';
    this.dialog?.close();
    this.layout.clear();
    this.viewport = null;
  }
  /** Post, or ask first when these exact notes are already on GitHub. */
  private requestPost(): void {
    const context = this.host.context();
    const session = this.session();
    if (!context || !session || session.posting) return;
    if (session.last && session.last.body === this.comment(context)) return this.openPostAgain(context, session.last);
    void this.post();
  }
  private async post(): Promise<void> {
    const context = this.host.context();
    const session = this.session();
    if (!context || !session || context.ticket === null || session.posting || !session.marks.length) return;
    const repo = parsePrototypeFilePath(context.url.split(/[?#]/)[0] ?? '')?.repo;
    if (!repo) return;
    const ticket = context.ticket;
    const body = this.comment(context);
    session.posting = true;
    session.failed = null;
    this.say(`Posting to GitHub, #${String(ticket)}…`);
    this.repaint();
    // The person may edit, or open another canvas, while GitHub answers: only the sent body counts.
    const here = (): boolean => this.session() === session;
    let focus: 'bar' | 'post' | null = null;
    try {
      const result = (await (this.host.post ?? postJson)(scopedApiPath(repo, 'canvas-notes'), { ticket, body })) as { url?: unknown; handOffId?: unknown };
      const url = typeof result.url === 'string' && result.url.startsWith('https://github.com/') ? result.url : `https://github.com/${repo}/issues/${String(ticket)}`;
      const sent: Posted = { url, body, at: Date.now(), handOffId: typeof result.handOffId === 'string' ? result.handOffId : null };
      session.last = sent;
      const current = here() ? this.host.context() : null;
      if (current && this.comment(current) === body) {
        session.posted = sent;
        session.bar = true;
        session.send = { state: 'idle' };
        session.copied = false;
        if (this.panel === 'review') this.panel = 'posted';
        this.editing = null;
        this.tool = null;
        // E: the panel closes and the bar over the canvas says where the notes went.
        if (current.size === 'full') this.panelOpen = false;
        else this.paneTab = 'canvas';
        focus = 'bar';
        this.say(`Posted to GitHub, #${String(ticket)}. ${T3_NEXT}`);
      } else if (here()) this.say(`Posted to GitHub, #${String(ticket)}. Your later edits are not in it yet.`);
    } catch (error) {
      if (here()) {
        session.failed = (error as Error).message;
        focus = 'post';
        this.say(`Not posted to #${String(ticket)}. Your notes are still here.`);
      }
    } finally {
      session.posting = false;
      this.repaint();
    }
    if (focus === 'bar') this.focusBar();
    if (focus === 'post') this.aside.querySelector<HTMLElement>('[data-fb-act="post"]')?.focus();
  }

  /** The post-again check: a modal with Cancel focused. Closing it returns focus to Post. */
  private openPostAgain(context: FeedbackContext, last: Posted): void {
    this.dialog?.close();
    const dialog = document.createElement('dialog');
    dialog.className = 'cf-dialog';
    dialog.setAttribute('aria-labelledby', 'cf-dialog-h');
    dialog.setAttribute('aria-describedby', 'cf-dialog-d');
    const where = `GitHub · #${String(context.ticket)}`;
    setTrustedHtml(
      dialog,
      `<h2 id="cf-dialog-h">Post these notes again?</h2>
      <p id="cf-dialog-d">These exact notes are already a comment on ${where}, posted ${escapeHtml(postedAgo(last.at))}. Posting again adds a second copy. Nothing goes to your T3 Code thread either way.</p>
      <div class="cf-dialog-row">${this.viewLink(last.url)}<span class="topbar-spacer"></span><button type="button" class="ghost" data-fb-act="dialog-cancel" autofocus>Cancel</button><button type="button" class="ghost cf-danger" data-fb-act="dialog-post">Post a second copy</button></div>`,
    );
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (this.dialog === dialog) this.dialog = null;
      if (dialog.returnValue !== 'post') this.aside.querySelector<HTMLElement>('[data-fb-act="post"]')?.focus();
    });
    (this.canvas.closest('#canvas-viewer') ?? document.body).append(dialog);
    this.dialog = dialog;
    dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-fb-act="dialog-cancel"]')?.focus();
  }

  /** Send to T3 Code: the comment link into the prototype ticket's tracked thread, queued behind any running turn. */
  private async sendToThread(): Promise<void> {
    const context = this.host.context();
    const session = this.session();
    const posted = session?.posted;
    const repo = context ? parsePrototypeFilePath(context.url.split(/[?#]/)[0] ?? '')?.repo : undefined;
    if (!context || !session || !posted || !repo || context.ticket === null || session.send.state === 'sending') return;
    const ticket = `#${String(context.ticket)}`;
    session.send = { state: 'sending' };
    this.say(`Sending to your T3 Code thread for ${ticket}…`);
    this.paint();
    this.focusBar();
    try {
      const result = (await (this.host.post ?? postJson)(scopedApiPath(repo, 'canvas-thread'), { ticket: context.ticket, url: posted.url })) as { handOffId?: unknown };
      session.send = { state: 'sent', handOffId: typeof result.handOffId === 'string' ? result.handOffId : (posted.handOffId ?? '') };
      this.say(`Sent to your T3 Code thread for ${ticket}.`);
    } catch (error) {
      const { message, reason } = error as Error & { reason?: unknown };
      if (reason === 'no-thread') {
        // The thread was forgotten since the post: offer the copy instead.
        posted.handOffId = null;
        session.send = { state: 'idle' };
        this.say('Wayfinder doesn’t know this ticket’s thread. Copy the message instead.');
      } else {
        session.send = {
          state: 'failed',
          reason: reason === 'not-running' ? 'T3 Code isn’t running, so the message didn’t reach the thread.' : `T3 Code didn’t take the message (${message.replace(/\.$/, '')}).`,
        };
        this.say('Not sent to T3 Code. The notes are safe on GitHub.');
      }
    }
    if (this.session() !== session) return;
    this.paint();
    this.focusBar();
  }

  private async copyMessage(): Promise<void> {
    const context = this.host.context();
    const session = this.session();
    if (!context || !session?.posted || context.ticket === null) return;
    try {
      await navigator.clipboard.writeText(canvasNotesThreadMessage(context.ticket, session.posted.url));
      session.copied = true;
      this.say('Copied. Paste it in your T3 Code thread.');
    } catch {
      this.say('Could not copy. Select the message and copy it yourself.');
    }
    this.paint();
    this.focusBar('[data-fb-act="bar-copy"]');
  }

  /** Open T3 Code thread: the same hand-off control Home uses, which selects that thread in T3 Code. */
  private async openThread(id: string): Promise<void> {
    try {
      await (this.host.post ?? postJson)('/api/hand-offs/focus', { id });
      this.say('Opened your T3 Code thread.');
    } catch (error) {
      this.flash((error as Error).message);
    }
  }

  private moveSelected(mark: Mark): void {
    // Ask the canvas what the pin now sits on, once the arrow keys settle. A question already out
    // describes where the pin was, so its answer must not move it back.
    this.latestNear.delete(mark.id);
    clearTimeout(this.nearTimer);
    this.nearTimer = setTimeout(() => {
      const rect = this.layout.get(mark.id);
      if (!rect) return;
      this.request('near', rect.left, rect.top, mark.id);
    }, 200);
  }
  private nearTimer: ReturnType<typeof setTimeout> | undefined;
  private setColor(id: number, hex: string, hsv: Hsv = toHsv(hex), repaint = true): void {
    const mark = this.marks.find((candidate) => candidate.id === id);
    if (!mark) return;
    mark.to = hex;
    this.hsv = hsv;
    if (repaint) return this.repaintKeepingPopover();
    // Light update while dragging, so the pointer keeps its capture.
    const pop = this.popLayer.querySelector<HTMLElement>('.cf-pop');
    if (!pop) return;
    pop.querySelector<HTMLElement>('[data-fb-sv]')!.style.backgroundColor = `hsl(${String(Math.round(hsv.h))} 100% 50%)`;
    const dot = pop.querySelector<HTMLElement>('[data-fb-svdot]')!;
    dot.style.left = `${String(hsv.s * 100)}%`;
    dot.style.top = `${String((1 - hsv.v) * 100)}%`;
    pop.querySelector<HTMLElement>('[data-fb-tosw]')!.style.background = hex;
    pop.querySelector<HTMLElement>('[data-fb-tocode]')!.textContent = hex;
    const value = pop.querySelector<HTMLInputElement>('[data-fb-colorval]')!;
    if (document.activeElement !== value) value.value = this.fmt === 'hex' ? hex : rgbText(hex);
    const chip = this.marksLayer.querySelector<HTMLElement>(`[data-fb-mark="${String(id)}"] .cf-el-colors i:last-child`);
    if (chip) chip.style.background = hex;
  }
  private repaintKeepingPopover(): void {
    this.paint();
  }

  /** Keys the viewer hands over while the canvas is open. Returns true when it used the key. */
  key(event: KeyboardEvent): boolean {
    const context = this.host.context();
    if (!context) return false;
    const target = event.target instanceof Element ? event.target : null;
    if (this.dialog?.open) return this.dialogKey(event, this.dialog);
    if (event.key === 'Escape') return this.escape();
    const dot = target?.closest<HTMLElement>('[data-fb-svdot]');
    if (dot && event.key.startsWith('Arrow')) {
      const step = event.shiftKey ? 0.1 : 0.02;
      const hsv = { ...(this.hsv ?? { h: 0, s: 0, v: 0 }) };
      if (event.key === 'ArrowLeft') hsv.s = clamp(hsv.s - step, 0, 1);
      if (event.key === 'ArrowRight') hsv.s = clamp(hsv.s + step, 0, 1);
      if (event.key === 'ArrowUp') hsv.v = clamp(hsv.v + step, 0, 1);
      if (event.key === 'ArrowDown') hsv.v = clamp(hsv.v - step, 0, 1);
      this.setColor(Number(dot.dataset['fbSvdot']), fromHsv(hsv), hsv);
      return true;
    }
    const typing = target?.closest('textarea, input:not([type=range]), select, [contenteditable]') !== null && target !== null;
    if (typing || event.defaultPrevented || event.isComposing || event.repeat) return false;
    const letter = shortcutFromEvent(event);
    const assignments = shortcutAssignments();
    const tool = FEEDBACK_TOOLS.find((candidate) => assignments[candidate.id] === letter);
    if (tool) {
      this.useTool(tool.id);
      return true;
    }
    if (letter === assignments.panel) {
      this.togglePanel();
      return true;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    if (event.key === 'Enter' && this.tool === 'pin' && !target?.matches('button, a')) {
      const box = this.canvas.getBoundingClientRect();
      this.request('pin', box.width / 2, box.height / 2);
      return true;
    }
    const markEl = target?.closest<HTMLElement>('[data-fb-mark]');
    const mark = markEl ? this.marks.find((candidate) => candidate.id === Number(markEl.dataset['fbMark'])) : undefined;
    if (mark?.type === 'pin' && event.key.startsWith('Arrow')) {
      const step = event.shiftKey ? 0.05 : 0.01;
      if (event.key === 'ArrowLeft') mark.x = clamp((mark.x ?? 0) - step, 0, 1);
      if (event.key === 'ArrowRight') mark.x = clamp((mark.x ?? 0) + step, 0, 1);
      if (event.key === 'ArrowUp') mark.y = clamp((mark.y ?? 0) - step, 0, 1);
      if (event.key === 'ArrowDown') mark.y = clamp((mark.y ?? 0) + step, 0, 1);
      this.session()!.posted = null;
      delete mark.anchor;
      this.track();
      this.moveSelected(mark);
      return true;
    }
    return false;
  }

  /** The post-again dialog keeps Esc and Tab to itself; Enter and Space still press its buttons. */
  private dialogKey(event: KeyboardEvent, dialog: HTMLDialogElement): boolean {
    if (event.key === 'Escape') {
      dialog.close();
      return true;
    }
    if (event.key === 'Tab') {
      const items = [...dialog.querySelectorAll<HTMLElement>('a[href], button')];
      const at = items.indexOf(document.activeElement as HTMLElement);
      items[(at + (event.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
      return true;
    }
    return event.key !== 'Enter' && event.key !== ' ';
  }

  private wire(): void {
    const root = this.canvas.closest<HTMLElement>('#canvas-viewer') ?? document.body;
    root.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const capture = target?.closest('[data-fb-capture]');
      if (capture && this.tool) {
        const box = this.canvas.getBoundingClientRect();
        this.request(this.tool, (event as MouseEvent).clientX - box.left, (event as MouseEvent).clientY - box.top);
        return;
      }
      const button = target?.closest<HTMLElement>('button');
      if (!button) return;
      const d = button.dataset;
      if (d['openHandoff'] !== undefined && this.barSlot.contains(button)) return void this.openThread(d['openHandoff']);
      if (d['fbTarget'] !== undefined && (this.tool === 'element' || this.tool === 'color')) {
        const picked = this.targets.find((candidate) => candidate.key === d['fbTarget']);
        if (picked) this.request(this.tool, picked.rect.left + picked.rect.width / 2, picked.rect.top + picked.rect.height / 2);
        return;
      }
      if (d['fbTool']) return this.useTool(d['fbTool'] as ToolId);
      if (d['fbTab']) {
        this.paneTab = d['fbTab'] === 'feedback' ? 'feedback' : 'canvas';
        return this.repaint();
      }
      if (d['fbMark']) {
        const id = Number(d['fbMark']);
        if (this.editing === id) {
          this.editing = null;
          return this.repaint();
        }
        return this.edit(id, false);
      }
      if (d['fbShow']) {
        const mark = this.marks.find((candidate) => candidate.id === Number(d['fbShow']));
        const context = this.host.context();
        if (!mark || !context) return;
        if (this.bridged(context) && (mark.option !== context.option || mark.page !== context.page))
          this.host.send({ type: 'go', page: mark.page, option: mark.option });
        if (context.size !== 'full') this.paneTab = 'canvas';
        return this.edit(mark.id, false);
      }
      if (d['fbDel']) return this.remove(Number(d['fbDel']));
      if (d['fbAddnote'] !== undefined) {
        const context = this.host.context();
        if (!context) return;
        const page = this.currentPage(context);
        const option = d['fbAddnote'] || null;
        return this.add({ type: 'note', page: page.id, pageTitle: page.title, option, optionName: this.optionName(context, page.id, option), note: '' });
      }
      if (d['fbSwatch'] && d['fbColor'] && HEX.test(d['fbColor'])) return this.setColor(Number(d['fbSwatch']), d['fbColor']);
      if (d['fbFmt']) {
        this.fmt = d['fbFmt'] === 'rgb' ? 'rgb' : 'hex';
        return this.paint();
      }
      if (d['fbPtab']) {
        this.ptab = d['fbPtab'] === 'project' ? 'project' : d['fbPtab'] === 'basic' ? 'basic' : 'canvas';
        return this.paint();
      }
      if (d['fbView']) {
        this.markdownView = d['fbView'] === 'markdown';
        return this.paint();
      }
      switch (d['fbAct']) {
        case 'done':
          this.editing = null;
          return this.repaint();
        case 'panel':
          return this.togglePanel();
        case 'panel-close': {
          const context = this.host.context();
          if (context?.size === 'full') this.panelOpen = false;
          else this.paneTab = 'canvas';
          return this.repaint();
        }
        case 'panel-review': {
          this.panel = 'review';
          this.tool = null;
          this.editing = null;
          const session = this.session();
          if (session) session.failed = null;
          return this.repaint();
        }
        case 'panel-edit':
          this.panel = 'edit';
          return this.repaint();
        case 'post':
          return this.requestPost();
        case 'dialog-cancel':
          return this.dialog?.close();
        case 'dialog-post':
          this.dialog?.close('post');
          return void this.post();
        case 'bar-close': {
          const session = this.session();
          if (session) session.bar = false;
          this.paint();
          // The chip in the toolbar still says it posted.
          const size = this.host.context()?.size;
          document.querySelector<HTMLElement>(size === 'full' ? '#canvas-viewer .cf-toggle' : '#canvas-viewer [data-fb-tab="feedback"]')?.focus();
          return;
        }
        case 'bar-send':
          return void this.sendToThread();
        case 'bar-copy':
          return void this.copyMessage();
        case 'panel-fresh': {
          const session = this.session();
          if (session) {
            session.marks = [];
            session.posted = null;
            session.last = null;
          }
          this.panel = 'edit';
          return this.repaint();
        }
      }
    });
    root.addEventListener('pointermove', (event) => {
      if (!(this.tool === 'element' || this.tool === 'color') || !(event.target instanceof Element) || !event.target.closest('[data-fb-capture], [data-fb-target]')) return;
      const box = this.canvas.getBoundingClientRect();
      this.hoverAt(event.clientX - box.left, event.clientY - box.top);
    });
    root.addEventListener(
      'wheel',
      (event) => {
        if (!(event.target instanceof Element) || !event.target.closest('[data-fb-capture], [data-fb-target]')) return;
        event.preventDefault();
        const box = this.canvas.getBoundingClientRect();
        this.host.send({ type: 'scroll', dx: event.deltaX, dy: event.deltaY, x: event.clientX - box.left, y: event.clientY - box.top });
      },
      { passive: false },
    );
    // The saturation and brightness square: drag or click.
    root.addEventListener('pointerdown', (event) => {
      const sv = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-fb-sv]') : null;
      if (!sv) return;
      event.preventDefault();
      const id = Number(sv.dataset['fbSv']);
      const move = (ev: PointerEvent): void => {
        const r = sv.getBoundingClientRect();
        const hsv = { h: this.hsv?.h ?? 0, s: clamp((ev.clientX - r.left) / r.width, 0, 1), v: 1 - clamp((ev.clientY - r.top) / r.height, 0, 1) };
        this.setColor(id, fromHsv(hsv), hsv, false);
      };
      move(event);
      sv.setPointerCapture(event.pointerId);
      sv.addEventListener('pointermove', move);
      sv.addEventListener('pointerup', () => {
        sv.removeEventListener('pointermove', move);
        this.repaintKeepingPopover();
      }, { once: true });
    });
    root.addEventListener('input', (event) => {
      const t = event.target;
      if (!(t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement)) return;
      const d = t.dataset;
      if (d['fbNote']) {
        const mark = this.marks.find((candidate) => candidate.id === Number(d['fbNote']));
        if (mark) {
          mark.note = t.value;
          // The popover and the panel row edit the same note.
          for (const other of root.querySelectorAll<HTMLTextAreaElement>(`textarea[data-fb-note="${String(mark.id)}"]`)) if (other !== t) other.value = t.value;
          const session = this.session();
          if (session?.posted) {
            session.posted = null;
            this.host.repaintToolbar();
          }
        }
      }
      if (d['fbHue']) {
        const hsv = { ...(this.hsv ?? { h: 0, s: 1, v: 1 }), h: Number(t.value) };
        this.setColor(Number(d['fbHue']), fromHsv(hsv), hsv, false);
      }
      if (d['fbColorval']) {
        const hex = parseColor(t.value);
        t.setAttribute('aria-invalid', String(!hex));
        if (hex) this.setColor(Number(d['fbColorval']), hex, toHsv(hex), false);
      }
    });
    root.addEventListener('change', (event) => {
      const t = event.target;
      if (!(t instanceof HTMLInputElement || t instanceof HTMLSelectElement)) return;
      const d = t.dataset;
      const context = this.host.context();
      if (!context) return;
      if (d['fbHue'] || (d['fbColorval'] && parseColor(t.value))) this.repaintKeepingPopover();
      const page = this.currentPage(context);
      const chosen = page.options.find((option) => option.id === t.value)?.id ?? null;
      if (d['fbOption'] !== undefined) {
        const mark = this.marks.find((candidate) => candidate.id === Number(d['fbOption']));
        if (mark) {
          mark.option = chosen;
          mark.optionName = this.optionName(context, page.id, chosen);
          this.paint();
        }
      }
      if (d['fbCur'] !== undefined && chosen) {
        const session = this.session();
        if (session) session.chosen = chosen;
        this.paint();
      }
    });
  }
}

function anchorOf(hit: Extract<CanvasHit, { x: number }>): Mark['anchor'] {
  return hit.selector && hit.ax !== undefined && hit.ay !== undefined ? { selector: hit.selector, ax: clamp(hit.ax, 0, 1), ay: clamp(hit.ay, 0, 1) } : undefined;
}

/** A CSS colour value as #rrggbb, through the canvas 2D context's own parser. */
function cssHex(value: string): string | null {
  const context = document.createElement('canvas').getContext('2d');
  if (!context || !value.trim()) return null;
  context.fillStyle = '#000';
  context.fillStyle = value.trim();
  return typeof context.fillStyle === 'string' && HEX.test(context.fillStyle) ? context.fillStyle : null;
}
