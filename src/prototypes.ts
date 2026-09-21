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
 * The page a prototype shows running: its saved snapshot when there is one, which is
 * built to run anywhere, otherwise the first HTML file on the branch that stands alone.
 */
export function pickPreview(hasSnapshot: boolean, openable: readonly string[]): string | null {
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
