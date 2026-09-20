/**
 * Prototypes live on `prototype/<ticket>-<slug>` branches, one per prototype ticket. The
 * hand-off prompt tells agents to push there, and the page finds them by that prefix.
 * Pure, so the page can share it.
 */
export const PROTOTYPE_BRANCH_PREFIX = 'prototype/';

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

/** The local URL for one file on a prototype branch. The branch is one encoded segment, so relative links resolve under it. */
export function prototypeFileUrl(branch: string, file: string): string {
  return `${PROTOTYPE_ROUTE}${encodeURIComponent(branch)}/${file.split('/').map(encodeURIComponent).join('/')}`;
}

/** The branch and file a `/proto/...` path asks for, or null for anything off a prototype branch or climbing out of it. */
export function parsePrototypeFilePath(pathname: string): { branch: string; file: string } | null {
  if (!pathname.startsWith(PROTOTYPE_ROUTE)) return null;
  const [rawBranch, ...rawFile] = pathname.slice(PROTOTYPE_ROUTE.length).split('/');
  try {
    const branch = decodeURIComponent(rawBranch ?? '');
    const parts = rawFile.map(decodeURIComponent);
    if (!branch.startsWith(PROTOTYPE_BRANCH_PREFIX) || branch.includes('..')) return null;
    if (parts.length === 0 || parts.some((part) => part === '' || part === '.' || part === '..')) return null;
    return { branch, file: parts.join('/') };
  } catch {
    return null;
  }
}
