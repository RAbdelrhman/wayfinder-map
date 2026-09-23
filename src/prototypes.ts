import { normalizeRepo } from './repoRoutes.js';
import type { PrototypeVariant } from './types.js';

/**
 * Prototypes live on `prototype/<ticket>-<slug>` branches, one per prototype ticket. The
 * hand-off prompt tells agents to push there, and the page finds them by that prefix.
 * Pure, so the page can share it.
 */
export const PROTOTYPE_BRANCH_PREFIX = 'prototype/';

/**
 * A runnable copy of the prototype, saved at the branch root when it is captured: one HTML
 * file with its styles and script inlined, so it opens without the app that built it.
 */
export const PROTOTYPE_SNAPSHOT_FILE = 'prototype-snapshot.html';

/** Where the page serves a file off a prototype branch. */
export const PROTOTYPE_ROUTE = '/proto/';

/** The ticket a prototype branch belongs to, or null when the name does not follow the convention. */
export function prototypeTicketNumber(branch: string): number | null {
  const match = /^prototype\/(\d+)(?:-|$)/.exec(branch);
  return match === null ? null : Number(match[1]);
}

/** HTML is the only thing worth opening live. Whether it *can* be is `isSelfContained`. */
export function isHtml(file: string): boolean {
  return /\.html?$/i.test(file);
}

/**
 * A page the server can serve on its own. A UI prototype that lives inside the real app
 * pulls its assets from the app's root (`src="/app.js"`), and those are built, not on the
 * branch: serving it would draw a broken page, so it gets a branch link instead.
 */
export function isSelfContained(html: string): boolean {
  return !/<(?:script|link|img)\s[^>]*(?:src|href)\s*=\s*["']\//i.test(html);
}

/**
 * A design canvas's board: an `index.html` with the canvas's `config.js` beside it. When a
 * prototype is a canvas, that board is the thing to open, not one of the pages inside it.
 */
export function canvasEntry(openable: readonly string[], files: readonly string[]): string | null {
  const all = new Set(files);
  return openable.find((file) => /(?:^|\/)index\.html$/i.test(file) && all.has(file.replace(/index\.html$/i, 'config.js'))) ?? null;
}

/**
 * Canvas boards the branch changed without touching their `index.html`. The canvas engine
 * lives on the default branch, so a prototype usually only edits `config.js` and its pages,
 * and the diff never lists the board. These are worth reading off the branch directly.
 */
export function unlistedCanvasBoards(files: readonly string[]): string[] {
  const all = new Set(files);
  return files
    .filter((file) => /(?:^|\/)config\.js$/.test(file))
    .map((file) => file.replace(/config\.js$/, 'index.html'))
    .filter((board) => !all.has(board));
}

/**
 * The page a prototype shows running: its design canvas when it has one, then its saved
 * snapshot, which is built to run anywhere, otherwise the first HTML file that stands alone.
 */
export function pickPreview(hasSnapshot: boolean, openable: readonly string[], files: readonly string[] = []): string | null {
  const canvas = canvasEntry(openable, files);
  if (canvas !== null) return canvas;
  if (hasSnapshot) return PROTOTYPE_SNAPSHOT_FILE;
  return openable[0] ?? null;
}

/**
 * The local URL for one file on a prototype branch. The repository is named in the path
 * because a page can be looking at any repository, not only the one Wayfinder launched in.
 * Owner, name and branch are one encoded segment each, so relative links resolve under them.
 */
export function prototypeFileUrl(repo: string, branch: string, file: string): string {
  const [owner = '', name = ''] = repo.split('/', 2);
  const prefix = `${PROTOTYPE_ROUTE}${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  return `${prefix}/${encodeURIComponent(branch)}/${file.split('/').map(encodeURIComponent).join('/')}`;
}

/** What a `/proto/...` path asks for, or null for anything off a prototype branch or climbing out of it. */
export function parsePrototypeFilePath(pathname: string): { repo: string; branch: string; file: string } | null {
  if (!pathname.startsWith(PROTOTYPE_ROUTE)) return null;
  const [rawOwner, rawName, rawBranch, ...rawFile] = pathname.slice(PROTOTYPE_ROUTE.length).split('/');
  try {
    const repo = normalizeRepo(`${decodeURIComponent(rawOwner ?? '')}/${decodeURIComponent(rawName ?? '')}`);
    const branch = decodeURIComponent(rawBranch ?? '');
    const parts = rawFile.map(decodeURIComponent);
    if (repo === null) return null;
    if (!branch.startsWith(PROTOTYPE_BRANCH_PREFIX) || branch.includes('..')) return null;
    if (parts.length === 0 || parts.some((part) => part === '' || part === '.' || part === '..')) return null;
    return { repo, branch, file: parts.join('/') };
  } catch {
    return null;
  }
}

/** Where a repository keeps screenshots of its prototype variants, on its default branch (#81). */
export const PROTOTYPE_SHOTS_DIR = 'prototypes/canvas/assets/protos';

/** Where the page serves one of those screenshots. */
export const PROTOTYPE_SHOT_ROUTE = '/proto-shot/';

const SHOT_FILE = /^[\w.-]+\.(?:avif|gif|jpe?g|png|webp)$/i;
const VARIANT_ID = /^[A-Z]{1,2}$/;
/** A label a canvas gives one direction, like "B · Terrain". */
const LETTER_LABEL = /^([A-Z]{1,2})\s+·\s+(.+)$/;

/** One variant of a prototype as the board shows it: its letter, its name, and what to show and open. */
export type PrototypeVariantInfo = PrototypeVariant;

/** The local URL of a variant screenshot on the repository's default branch. */
export function prototypeShotUrl(repo: string, file: string): string {
  const [owner = '', name = ''] = repo.split('/', 2);
  return `${PROTOTYPE_SHOT_ROUTE}${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${encodeURIComponent(file)}`;
}

/** What a `/proto-shot/...` path asks for, or null for anything but a plain image file name. */
export function parsePrototypeShotPath(pathname: string): { repo: string; file: string } | null {
  if (!pathname.startsWith(PROTOTYPE_SHOT_ROUTE)) return null;
  const parts = pathname.slice(PROTOTYPE_SHOT_ROUTE.length).split('/');
  if (parts.length !== 3) return null;
  try {
    const [rawOwner = '', rawName = '', rawFile = ''] = parts.map(decodeURIComponent);
    const repo = normalizeRepo(`${rawOwner}/${rawName}`);
    if (repo === null || !SHOT_FILE.test(rawFile)) return null;
    return { repo, file: rawFile };
  } catch {
    return null;
  }
}

/**
 * The variants a ticket's screenshots stand for. `43-B.jpg` is variant B of #43, and a lone
 * `17.jpg` is #17's only variant. Screenshots of other tickets are ignored.
 */
export function shotVariants(ticketNumber: number, shots: readonly string[]): Array<{ id: string; shot: string }> {
  const found: Array<{ id: string; shot: string }> = [];
  for (const shot of shots) {
    if (!SHOT_FILE.test(shot)) continue;
    const stem = shot.replace(/\.[^.]+$/, '');
    if (stem === String(ticketNumber)) {
      found.push({ id: 'A', shot });
      continue;
    }
    const match = /^(\d+)-(.+)$/.exec(stem);
    if (match === null || Number(match[1]) !== ticketNumber) continue;
    const suffix = match[2] ?? '';
    found.push({ id: VARIANT_ID.test(suffix.toUpperCase()) ? suffix.toUpperCase() : suffix, shot });
  }
  return found.sort((a, b) => a.id.localeCompare(b.id));
}

interface ConfigToken {
  key: string | null;
  value: string;
}

/**
 * Every plain string literal in a canvas config, with the object key it is the value of.
 * A small lexer rather than a pattern, so an apostrophe in a comment cannot pair up with a
 * quote in the code. Template literals with substitutions are skipped: their text is not known.
 */
function configTokens(source: string): ConfigToken[] {
  const tokens: ConfigToken[] = [];
  let index = 0;
  const keyBefore = (at: number): string | null => {
    const match = /([A-Za-z_$][\w$]*)\s*:\s*$/.exec(source.slice(Math.max(0, at - 80), at));
    return match?.[1] ?? null;
  };
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', index);
      index = end < 0 ? source.length : end;
      continue;
    }
    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      index = end < 0 ? source.length : end + 2;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      const start = index;
      let value = '';
      let substituted = false;
      index += 1;
      while (index < source.length && source[index] !== char) {
        if (source[index] === '\\') {
          value += source[index + 1] ?? '';
          index += 2;
          continue;
        }
        if (char === '`' && source[index] === '$' && source[index + 1] === '{') substituted = true;
        value += source[index];
        index += 1;
      }
      index += 1;
      if (!substituted) tokens.push({ key: keyBefore(start), value });
      continue;
    }
    index += 1;
  }
  return tokens;
}

function cleanTitle(title: string): string {
  return title.replace(/\s*\((?:not chosen|default|chosen)\)\s*$/i, '').trim();
}

/**
 * The name and page of each lettered direction on a design canvas, read from its `config.js`
 * without running it. A canvas labels directions "A · Cards" (on items, helper calls and page
 * titles) or gives an item a lettered `id` with its `name`. The name used most wins, with page
 * and section titles counting most, so "D · Your mix" beats the single "D · Home" frame.
 */
export function canvasVariantNames(source: string): Map<string, CanvasVariantName> {
  const tokens = configTokens(source);
  const candidates = new Map<string, Array<{ title: string; weight: number; page: string | null }>>();
  const add = (id: string, title: string, weight: number, page: string | null): void => {
    const clean = cleanTitle(title);
    if (clean === '') return;
    const list = candidates.get(id) ?? [];
    list.push({ title: clean, weight, page });
    candidates.set(id, list);
  };

  let item: { id: string | null; name: string | null; src: string | null } | null = null;
  const flush = (): void => {
    if (item === null) return;
    const page = item.src !== null && /\.html?(?:[?#]|$)/i.test(item.src) ? item.src : null;
    if (item.id !== null && VARIANT_ID.test(item.id) && item.name !== null) add(item.id, item.name, 2, page);
    else if (item.name !== null) {
      const label = LETTER_LABEL.exec(item.name);
      if (label !== null) add(label[1] ?? '', label[2] ?? '', 1, page);
    }
    item = null;
  };

  for (const token of tokens) {
    if (token.key === 'id') {
      flush();
      item = { id: token.value, name: null, src: null };
    } else if (token.key === 'name' && item !== null && item.name === null) {
      item.name = token.value;
    } else if (token.key === 'name') {
      const label = LETTER_LABEL.exec(token.value);
      if (label !== null) add(label[1] ?? '', label[2] ?? '', 2, null);
    } else if (token.key === 'src' && item !== null && item.src === null) {
      item.src = token.value;
    } else if (token.key === 'title') {
      const label = LETTER_LABEL.exec(token.value);
      const combined = /^([A-Z])\s*\+\s*([A-Z])(?![a-z])/.exec(token.value);
      if (label !== null) add(label[1] ?? '', label[2] ?? '', 3, null);
      else if (combined !== null) add(`${combined[1] ?? ''}${combined[2] ?? ''}`, token.value, 3, null);
    } else if (token.key === null) {
      const label = LETTER_LABEL.exec(token.value);
      if (label !== null) add(label[1] ?? '', label[2] ?? '', 1, null);
    }
  }
  flush();

  const names = new Map<string, CanvasVariantName>();
  for (const [id, list] of candidates) {
    const totals = new Map<string, number>();
    for (const candidate of list) totals.set(candidate.title, (totals.get(candidate.title) ?? 0) + candidate.weight);
    let best = list[0]?.title ?? id;
    for (const [title, total] of totals) if (total > (totals.get(best) ?? 0)) best = title;
    const page = list.find((candidate) => candidate.title === best && candidate.page !== null)?.page ?? null;
    names.set(id, { title: best, page, anyPage: list.find((candidate) => candidate.page !== null)?.page ?? null });
  }
  return names;
}

/** A lettered direction on a canvas: the name it goes by, its page under that name, and any page it has. */
export interface CanvasVariantName {
  title: string;
  page: string | null;
  anyPage: string | null;
}

/** A variant page on the branch for a letter the canvas names without a page, like `variants/nav-d.html`. */
function pageForId(id: string, pages: readonly string[]): string | null {
  const suffix = new RegExp(`(?:^|[-_/])${id.toLowerCase()}\\.html?$`, 'i');
  return pages.find((page) => /(?:^|\/)variants?\//i.test(page) && suffix.test(page)) ?? null;
}

/**
 * The variants the decision board shows for one prototype. Screenshots on the default branch
 * say which variants exist; without any, the canvas's lettered directions do. Names come from
 * the canvas, and pages are relative to the canvas folder unless found among the branch's files.
 */
export function prototypeVariantInfo(
  ticketNumber: number,
  shots: readonly string[],
  configSource: string | null,
  canvasDir: string,
  branchPages: readonly string[],
): PrototypeVariantInfo[] {
  const names = configSource === null ? new Map<string, CanvasVariantName>() : canvasVariantNames(configSource);
  const fromShots = shotVariants(ticketNumber, shots);
  const ids = fromShots.length > 0
    ? fromShots.map((entry) => entry.id)
    : [...names.keys()].filter((id) => names.get(id)?.anyPage !== null || pageForId(id, branchPages) !== null).sort((a, b) => a.localeCompare(b));
  return ids.map((id, index) => {
    const lettered = VARIANT_ID.test(id);
    const named = lettered ? names.get(id) : undefined;
    const canvasPage = named?.page ?? null;
    const branchPage = lettered ? pageForId(id, branchPages) : null;
    const fallback = named?.anyPage ?? null;
    const shot = fromShots.find((entry) => entry.id === id)?.shot ?? null;
    return {
      id: lettered ? id : String.fromCharCode(65 + index),
      title: named?.title ?? (lettered ? `Variant ${id}` : sentenceCase(id)),
      page: canvasPage !== null ? `${canvasDir}${canvasPage}` : branchPage ?? (fallback === null ? null : `${canvasDir}${fallback}`),
      shot,
    };
  });
}

function sentenceCase(value: string): string {
  const words = value.replace(/[-_]+/g, ' ').trim();
  return words.length === 0 ? '' : `${words[0]?.toUpperCase() ?? ''}${words.slice(1)}`;
}

/** A comment that records a decision: it opens with, or has a heading for, the answer or verdict. */
const DECISION_COMMENT = /^\s*(?:#+\s*|\*\*)?(?:answer|verdict|decision|decided)\b/im;

/**
 * The comment that holds a closed prototype ticket's decision. Usually the last one, but a
 * follow-up note ("Follow-ups filed: …") often lands after the answer, so the last comment that
 * reads as an answer wins over it.
 */
export function verdictComment(bodies: readonly (string | null | undefined)[]): string | null {
  const comments = bodies.map((body) => body?.trim() ?? '').filter((body) => body.length > 0);
  return [...comments].reverse().find((body) => DECISION_COMMENT.test(body)) ?? comments.at(-1) ?? null;
}
