import { prototypeFileUrl } from '../prototypes.js';
import type { Prototype } from '../types.js';
import { escapeHtml } from './markdown.js';

/** Shared by tile, board and ticket detail. The href remains a usable fallback. */
export function canvasEntryAttrs(repo: string, prototype: Prototype, title: string, file?: string | null, imageUrl?: string | null): string {
  if (prototype.preview === null && !imageUrl) return 'target="_blank" rel="noreferrer"';
  const url = imageUrl ?? prototypeFileUrl(repo, prototype.branch, prototype.preview!, prototype.sha);
  return `data-canvas-url="${escapeHtml(url)}" data-canvas-title="${escapeHtml(`#${String(prototype.ticketNumber)} ${title}`)}" data-canvas-github="${escapeHtml(prototype.url)}"${file ? ` data-canvas-file="${escapeHtml(file)}"` : ''}`;
}
