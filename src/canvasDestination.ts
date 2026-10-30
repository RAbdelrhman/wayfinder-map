import { canvasData } from './canvasData.js';
import type { ObjectLink } from './objectLinks.js';
import type { ObjectDestination } from './objectLookup.js';
import { isSelfContained, prototypeFileUrl } from './prototypes.js';

export interface PinnedCanvasRoute {
  url: string;
  title: string;
  github: string;
  file: null;
  ticket: number;
  page?: string;
  variant?: string;
}

/** Resolve immutable files independently of today's branches, tiles or board paths. */
export async function pinnedCanvasRoute(
  link: Extract<ObjectLink, { kind: 'prototype' }>,
  destination: Extract<ObjectDestination, { kind: 'ticket' | 'prototype' }>,
  readFile: (repo: string, revision: string, path: string) => Promise<Buffer>,
): Promise<PinnedCanvasRoute | null> {
  if (!link.revision || destination.kind !== 'prototype') return null;
  const revision = link.revision.toLowerCase();
  const [board, config] = await Promise.all([
    readFile(destination.repo, revision, link.canvas),
    readFile(destination.repo, revision, link.canvas.replace(/[^/]+$/, 'config.js')),
  ]);
  const metadata = canvasData(config.toString('utf8'));
  if (!isSelfContained(board.toString('utf8')) || metadata?.['ticket'] !== destination.ticketNumber) return null;
  // The route's ticket namespace does not require a surviving Git branch; SHA selects every file.
  return {
    url: prototypeFileUrl(destination.repo, `prototype/${destination.ticketNumber}`, link.canvas, revision),
    title: `#${destination.ticketNumber} ${typeof metadata['title'] === 'string' ? metadata['title'] : 'Canvas'}`,
    github: `https://github.com/${destination.repo}/tree/${revision}/${link.canvas.split('/').map(encodeURIComponent).join('/')}`,
    file: null,
    ticket: destination.ticketNumber,
    ...(link.page ? { page: link.page } : {}),
    ...(link.item ? { variant: link.item } : {}),
  };
}
