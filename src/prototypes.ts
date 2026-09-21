import { normalizeRepo } from './repoRoutes.js';

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
