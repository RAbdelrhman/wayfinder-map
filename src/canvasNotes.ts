/**
 * Canvas notes (#213): the pins, elements, colours and notes a person leaves on a prototype
 * canvas in the viewer, and the one GitHub comment they are posted as on the prototype ticket.
 * The comment format is stable: agents read the hidden `wayfinder:notes v1` block.
 */

export type CanvasMarkType = 'pin' | 'element' | 'color' | 'note';

export interface CanvasMark {
  type: CanvasMarkType;
  /** The canvas page's ID, or the file for a snapshot or a canvas that never answered. */
  page: string;
  pageTitle: string;
  /** The option's ID, or null for a note on the whole page. */
  option: string | null;
  optionName: string | null;
  /** Pins: where, as fractions (0–1) across and down the option's document. */
  x?: number;
  y?: number;
  /** Pins: the named element under the pin, when the canvas reported one. */
  near?: string | null;
  /** Elements and colours: the element's name, and a selector that finds it again. */
  element?: string;
  selector?: string;
  /** Colours: the element's colour now, and the suggested one, as #rrggbb. */
  from?: string;
  to?: string;
  note: string;
}

/** Where the viewer got its page and option, as the bridge reported it. `none`: the canvas never answered. */
export type CanvasNotesSource = 'engine' | 'dom' | 'page' | 'none';

export interface CanvasNotesContext {
  branch: string;
  sha: string | null;
  source: CanvasNotesSource;
  /** Page IDs in the canvas's order, so the comment lists them as the canvas does. */
  pages: readonly string[];
  /** Option IDs per page, in the canvas's order. */
  options: Readonly<Record<string, readonly string[]>>;
}

export const CANVAS_NOTES_HEADING = '### Canvas notes from Wayfinder';
export const CANVAS_NOTES_MARKER = '<!-- wayfinder:notes v1 ';

const KIND: Record<CanvasMarkType, string> = { pin: 'Pin', element: 'Element', color: 'Colour', note: 'Note' };

/** Mark indices in reading order: by page, the whole page first, then options in the canvas's order, then as added. */
export function markOrder(marks: readonly CanvasMark[], context: Pick<CanvasNotesContext, 'pages' | 'options'>): number[] {
  const pageRank = (page: string): number => {
    const index = context.pages.indexOf(page);
    return index < 0 ? context.pages.length : index;
  };
  const optionRank = (mark: CanvasMark): number => {
    if (mark.option === null) return 0;
    const index = (context.options[mark.page] ?? []).indexOf(mark.option);
    return 1 + (index < 0 ? 10_000 : index);
  };
  return [...marks.keys()].sort((a, b) => {
    const left = marks[a]!,
      right = marks[b]!;
    return pageRank(left.page) - pageRank(right.page) || optionRank(left) - optionRank(right) || a - b;
  });
}

/** "Pin 1 · on Continue card", "Element 2 · Hero card", "Note 3". */
export function markTitle(mark: CanvasMark, n: number, source: CanvasNotesSource): string {
  const label = `${KIND[mark.type]} ${String(n)}`;
  if (mark.type === 'pin') {
    if (mark.near) return `${label} · on ${mark.near}`;
    return `${label} · ${source === 'page' || mark.option === null ? 'on the page' : `on ${mark.option}`}`;
  }
  if (mark.type === 'element' || mark.type === 'color') return `${label} · ${mark.element ?? 'element'}`;
  return label;
}

/** "B · Split hero", or "Whole page". */
export function markScope(mark: Pick<CanvasMark, 'option' | 'optionName'>): string {
  if (mark.option === null) return 'Whole page';
  return mark.optionName && mark.optionName !== mark.option ? `${mark.option} · ${mark.optionName}` : mark.option;
}

/**
 * Visible text as GitHub will show it. Names come from the canvas, so no `<` reaches GitHub as HTML:
 * an HTML comment or tag in a name could hide the rest of the comment, there and in Review.
 */
function text(value: string): string {
  return value.replace(/</g, '&lt;');
}
/** A name, on one line. */
function name(value: string): string {
  return text(value.replace(/\s+/g, ' ').trim());
}

/** Inline code that survives backticks inside the value. */
function code(value: string): string {
  const ticks = '`'.repeat(Math.max(0, ...[...value.matchAll(/`+/g)].map((match) => match[0].length)) + 1);
  return ticks.length > 1 ? `${ticks} ${value} ${ticks}` : `\`${value}\``;
}

function where(mark: CanvasMark, source: CanvasNotesSource): string {
  if (mark.type === 'pin') return mark.near ? `pin on "${name(mark.near)}"` : source === 'page' ? 'pin on the page' : 'pin';
  if (mark.type === 'element') return `element "${name(mark.element ?? '')}"`;
  if (mark.type === 'color') return `colour of "${name(mark.element ?? '')}": ${code(mark.from ?? '')} → ${code(mark.to ?? '')}`;
  return mark.option === null ? 'note' : 'note on the whole option';
}

/** A note's text as list-item content: later lines are indented so they stay inside the item. */
function noteText(note: string): string {
  const trimmed = note.trim();
  return trimmed ? text(trimmed).replace(/\r\n?/g, '\n').replace(/\n/g, '\n   ') : '_(no note)_';
}

const round = (value: number): number => Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000;

/** The data block for agents. `--` is escaped so a note can never close the HTML comment. */
export function canvasNotesData(context: CanvasNotesContext, marks: readonly CanvasMark[]): string {
  const pins = markOrder(marks, context).map((index) => {
    const mark = marks[index]!;
    return {
      type: mark.type,
      page: mark.page,
      option: mark.option,
      ...(mark.type === 'pin' && mark.x !== undefined && mark.y !== undefined ? { x: round(mark.x), y: round(mark.y) } : {}),
      ...(mark.near ? { near: mark.near } : {}),
      ...(mark.element !== undefined ? { element: mark.element } : {}),
      ...(mark.selector !== undefined ? { selector: mark.selector } : {}),
      ...(mark.type === 'color' ? { from: mark.from, to: mark.to } : {}),
      note: mark.note.trim(),
    };
  });
  return JSON.stringify({ branch: context.branch, sha: context.sha, source: context.source, pins }).replace(/--/g, '-\\u002d');
}

/** The one comment posted to the prototype ticket. */
export function canvasNotesComment(context: CanvasNotesContext, marks: readonly CanvasMark[]): string {
  const order = markOrder(marks, context);
  const pages = [...new Set(order.map((index) => marks[index]!.page))];
  const onePage = pages.length <= 1;
  const first = order.length ? marks[order[0]!]! : null;
  // A screenshot on the default branch has no prototype branch: its file name on each note is the provenance.
  const at = context.branch ? `${code(context.branch)}${context.sha ? ` @ ${code(context.sha.slice(0, 7))}` : ''}` : '';
  const pageLabel = (mark: CanvasMark): string =>
    context.source === 'page' || context.source === 'none' ? code(mark.page) : `page **${name(mark.pageTitle)}**`;
  const head = [at, context.source === 'page' ? 'snapshot' : onePage && first ? pageLabel(first) : ''].filter(Boolean).join(' · ');
  const lines = order.map((index, k) => {
    const mark = marks[index]!;
    const scope = onePage ? `**${name(markScope(mark))}**` : `**${name(mark.pageTitle)} · ${name(markScope(mark))}**`;
    const file = context.source === 'page' && mark.option !== null ? `${code(mark.page)} · option **${name(mark.option)}**` : scope;
    return `${String(k + 1)}. ${file}, ${where(mark, context.source)}: ${noteText(mark.note)}`;
  });
  return `${CANVAS_NOTES_HEADING}\n${head}\n\n${lines.join('\n')}\n\n${CANVAS_NOTES_MARKER}${canvasNotesData(context, marks)} -->`;
}

/** What the server accepts: a canvas-notes comment, nothing else, under GitHub's size limit. */
export function isCanvasNotesComment(body: unknown): body is string {
  return typeof body === 'string' && body.length <= 65_000 && body.startsWith(`${CANVAS_NOTES_HEADING}\n`) && body.includes(CANVAS_NOTES_MARKER);
}

/** What Send to T3 Code posts into the ticket's thread (#322, E in #314). */
export function canvasNotesThreadMessage(ticket: number, url: string): string {
  return `Canvas notes are posted on #${String(ticket)}: ${url}`;
}

/** Only a link to the ticket on GitHub, or to one comment on it, goes into a thread. */
export function isTicketCommentUrl(repo: string, ticket: number, url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const base = `https://github.com/${repo}/issues/${String(ticket)}`.toLowerCase();
  const [head, fragment, ...rest] = url.split('#');
  return rest.length === 0 && head?.toLowerCase() === base && (fragment === undefined || /^issuecomment-\d+$/.test(fragment));
}
