import { canvasData } from './canvasData.js';
import type { CanvasCatalogPage } from './types.js';

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const string = (value: unknown): string | null => typeof value === 'string' ? value : null;

/** Read canvas metadata from data expressions without executing repository-supplied JavaScript. */
export function canvasCatalog(source: string): CanvasCatalogPage[] {
  return array(canvasData(source)?.pages).flatMap((value, index) => {
    const page = object(value);
    if (Object.keys(page).length === 0) return [];
    const title = string(page.title) ?? string(page.name) ?? `Page ${index + 1}`;
    const id = string(page.id) ?? (title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page');
    const sections = array(page.sections).flatMap((entry) => array(object(entry).items));
    const items = [...array(page.items), ...sections].flatMap((entry) => {
      const item = object(entry);
      const itemId = string(item.id);
      if (!itemId || item.kind === 'note') return [];
      const note = object(item.note);
      const sources = string(note.basedOn);
      return [{ id: itemId, name: string(item.name) ?? itemId, src: string(item.src),
        disposition: string(note.disposition), feedback: string(note.feedback),
        ...(typeof item.width === 'number' && item.width > 0 ? { width: item.width } : {}),
        ...(typeof item.height === 'number' && item.height > 0 ? { height: item.height } : {}),
        basedOn: sources ? [sources] : array(note.basedOn).filter((x): x is string => typeof x === 'string') }];
    });
    return [{ id, title, round: typeof page.round === 'string' || typeof page.round === 'number' ? page.round : null, items }];
  });
}
