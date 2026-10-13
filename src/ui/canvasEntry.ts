import { prototypeFileUrl } from '../prototypes.js';
import type { Prototype } from '../types.js';
import { escapeHtml } from './markdown.js';

/**
 * Shared by tile, board and ticket detail. The href remains a usable fallback.
 * The ticket, pick ticket and variants let the viewer post notes (#213); `variant` is the one this entry opens.
 */
export function canvasEntryAttrs(
  repo: string,
  prototype: Prototype,
  title: string,
  file?: string | null,
  imageUrl?: string | null,
  notes: { pick?: number | null; variant?: string | null; variants?: readonly { id: string; name: string }[] } = {},
): string {
  if (prototype.preview === null && !imageUrl) return 'target="_blank" rel="noreferrer"';
  const url = imageUrl ?? prototypeFileUrl(repo, prototype.branch, prototype.preview!, prototype.sha);
  const variants = notes.variants ?? (prototype.variants ?? []).map((variant) => ({ id: variant.id, name: variant.title }));
  return `data-canvas-url="${escapeHtml(url)}" data-canvas-title="${escapeHtml(`#${String(prototype.ticketNumber)} ${title}`)}" data-canvas-github="${escapeHtml(prototype.url)}"${file ? ` data-canvas-file="${escapeHtml(file)}"` : ''} data-canvas-ticket="${String(prototype.ticketNumber)}"${notes.pick ? ` data-canvas-pick="${String(notes.pick)}"` : ''}${variants.length ? ` data-canvas-variants="${escapeHtml(JSON.stringify(variants))}"` : ''}${notes.variant ? ` data-canvas-variant="${escapeHtml(notes.variant)}"` : ''}`;
}
