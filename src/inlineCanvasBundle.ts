import { posix } from 'node:path';
import { canvasData } from './canvasData.js';
import { canvasCatalog } from './canvasCatalog.js';
import { CANVAS_BRIDGE_SCRIPT } from './canvasBridge.js';
import type { CanvasCatalogPage } from './types.js';

export interface InlineCanvasBundle {
  entry: string;
  files: Record<string, string>;
  pages: CanvasCatalogPage[];
  bridge: string;
}

const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', gif: 'image/gif', woff2: 'font/woff2' };

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

/** Match the sandbox bridge's generated IDs and named-style expansion, including legacy shorthand. */
function feedbackCatalog(source: string): CanvasCatalogPage[] {
  const config = canvasData(source);
  if (!config) return [];
  let autoId = 0;
  const styles = object(config['styles']);
  const rawPages = config['pages'] ?? [{ title: config['title'] ?? 'Canvas', sections: config['sections'] ?? [{ items: config['variants'] ?? [] }] }];
  const pages = array(rawPages).map((raw, index) => {
    const page = object(raw);
    const slug = String(page['title'] ?? `page-${index + 1}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page';
    const items = [...array(page['items']), ...array(page['sections']).flatMap(section => array(object(section)['items']))].flatMap(raw => {
      const item = object(raw);
      const kind = item['kind'] ?? (item['src'] ? 'page' : 'note');
      const id = item['id'] ?? `${String(kind)}-${++autoId}`;
      const base = { ...item, kind, id };
      return Array.isArray(item['styles']) ? item['styles'].map((style: unknown) => ({ ...base, id: `${String(id)}-${String(style)}`, name: `${String(item['name'] ?? kind)} · ${String(object(styles[String(style)])['label'] ?? style)}` })) : [base];
    });
    return { ...page, id: page['id'] ?? slug, title: page['title'] ?? page['name'] ?? page['id'] ?? 'Canvas', items, sections: [] };
  });
  return canvasCatalog(`window.CANVAS=${JSON.stringify({ ...config, pages })};`);
}

/** Collect only repo files at the caller's one immutable commit. Never execute config. */
export async function bundleInlineCanvas(entry: string, read: (path: string) => Promise<Buffer>): Promise<InlineCanvasBundle> {
  const files: Record<string, string> = Object.create(null) as Record<string, string>;
  const pending = new Set([entry, posix.join(posix.dirname(entry), 'config.js')]);
  let total = 0;
  const add = (relative: string, from: string): void => {
    if (!relative || relative.startsWith('#') || relative.startsWith('data:')) return;
    const url = new URL(relative, `https://canvas.invalid/${from}`);
    if (url.origin !== 'https://canvas.invalid') throw new Error('Inline canvases require repository-local assets.');
    const path = decodeURIComponent(url.pathname.slice(1));
    if (!path || path.includes('\\') || path.includes('\0') || path.split('/').some(part => part === '..' || part === '.')) throw new Error('Invalid canvas asset.');
    if (!Object.hasOwn(files, path)) pending.add(path);
  };
  const configPath = posix.join(posix.dirname(entry), 'config.js');
  while (pending.size) {
    const path = pending.values().next().value!;
    pending.delete(path);
    if (Object.hasOwn(files, path)) continue;
    if (Object.keys(files).length >= 256) throw new Error('Canvas has too many assets to embed.');
    const bytes = await read(path);
    total += bytes.length;
    if (bytes.length > 2_000_000 || total > 6_000_000) throw new Error('Canvas is too large to embed.');
    const type = TYPES[posix.extname(path).slice(1).toLowerCase()];
    const text = bytes.toString('utf8');
    files[path] = type ? `data:${type};base64,${bytes.toString('base64')}` : text;
    if (type) continue;
    if (/\.html?$/i.test(path)) {
      for (const match of text.matchAll(/<(?:script|link|img|iframe)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) add(match[1]!, path);
    }
    if (/\.css$/i.test(path)) {
      for (const match of text.matchAll(/url\(\s*["']?([^'"\s)]+)["']?\s*\)/gi)) add(match[1]!, path);
    }
    if (path === configPath) {
      const data = canvasData(text);
      if (!data) throw new Error('Canvas metadata is not readable.');
      const walk = (value: unknown, key = ''): void => {
        if (typeof value === 'string' && ['src', 'stylesheets', 'fonts'].includes(key)) add(value, entry);
        else if (Array.isArray(value)) value.forEach(item => walk(item, key));
        else if (value && typeof value === 'object') Object.entries(value).forEach(([name, item]) => walk(item, name));
      };
      walk(data);
    }
  }
  const pages = feedbackCatalog(files[configPath]!);
  if (!pages.length) throw new Error('Canvas has no readable pages.');
  return { entry, files, pages, bridge: CANVAS_BRIDGE_SCRIPT };
}

export { inlineCanvasDocument } from './inlineCanvasDocument.js';
