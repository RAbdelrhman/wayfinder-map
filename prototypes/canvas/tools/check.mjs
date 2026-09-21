#!/usr/bin/env node
/*
  Validate the canvas before sharing it: config shape, pages, ids, styles, and every file it
  points at. Also flags pages that won't run when served sandboxed (opaque origin).
  Usage: node <canvas>/tools/check.mjs   (exits 1 on errors)
*/
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

export const KINDS = ['page', 'compose', 'components', 'swatches', 'type', 'image', 'note'];
const LAYERS = ['image', 'text', 'rect', 'html'];

/** Local file part of a path, or null for remote URLs. */
function localPath(path) {
  if (/^(?:[a-z]+:|\/\/)/i.test(path)) return null;
  return path.split(/[?#]/)[0];
}

/** Rules a page must follow to run when served sandboxed (e.g. Wayfinder's prototype viewer). */
export function checkPageHtml(html) {
  const problems = [];
  if (/<script[^>]*type\s*=\s*["']module["']/i.test(html)) problems.push('uses a module script, which fails CORS at an opaque origin');
  if (/<(?:script|link|img)\s[^>]*(?:src|href)\s*=\s*["']\//i.test(html)) problems.push('uses a root path (/...); use a path relative to the file');
  if (/\bfetch\s*\(/.test(html)) problems.push('calls fetch(), which fails CORS at an opaque origin');
  if (/\blocalStorage\b|\bsessionStorage\b/.test(html)) problems.push('uses web storage, which throws at an opaque origin');
  return problems;
}

/**
 * Everything wrong with a config. `exists(path)` and `read(path)` take paths relative to the
 * canvas directory, so the checks run without touching disk in tests.
 */
export function checkCanvas(cfg, { exists, read }) {
  const errors = [];
  const warnings = [];
  if (!cfg || typeof cfg !== 'object') return { errors: ['config.js must set window.CANVAS'], warnings };
  if (typeof cfg.title !== 'string' || cfg.title === '') errors.push('title: required');
  if (typeof cfg.question !== 'string' || cfg.question === '') errors.push('question: required, say what the user is deciding');

  const styles = cfg.styles ?? {};
  const pages = cfg.pages ?? [{ title: cfg.title, sections: cfg.sections ?? (cfg.variants ? [{ items: cfg.variants }] : null) }];
  if (!Array.isArray(pages) || pages.length === 0 || pages.some((page) => !Array.isArray(page.sections) || page.sections.length === 0)) {
    errors.push('pages: every page needs sections with items (or use top-level sections for one page)');
    return { errors, warnings };
  }

  const ids = new Set();
  const pageIds = new Set();
  const checkFile = (where, path) => {
    if (typeof path !== 'string' || path === '') return errors.push(`${where}: path required`);
    if (path.startsWith('/')) return errors.push(`${where}: "${path}" is a root path; make it relative to index.html`);
    const local = localPath(path);
    if (local !== null && !exists(local)) errors.push(`${where}: "${path}" does not exist`);
  };
  const checkStyle = (where, key) => {
    if (!(key in styles)) errors.push(`${where}: no style named "${key}" in styles`);
  };

  (cfg.base?.stylesheets ?? []).forEach((href, i) => checkFile(`base.stylesheets[${i}]`, href));
  for (const [key, style] of Object.entries(styles))
    (style.stylesheets ?? []).forEach((href, i) => checkFile(`styles.${key}.stylesheets[${i}]`, href));

  pages.forEach((page, p) => {
    const pageId =
      page.id ??
      String(page.title ?? `page-${p + 1}`)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    if (pages.length > 1 && !page.title) errors.push(`pages[${p}]: title required when there is more than one page`);
    if (pageIds.has(pageId)) errors.push(`pages[${p}]: duplicate page id "${pageId}"; give it an id`);
    pageIds.add(pageId);
    checkSections(page.sections);
  });
  return { errors, warnings };

  function checkSections(sections) {
    sections.forEach((section, s) => {
      if (!Array.isArray(section.items)) return errors.push(`sections[${s}].items: required`);
      section.items.forEach((item, i) => {
        const kind = item.kind ?? (item.src ? 'page' : 'note');
        const where = `${item.id ?? `sections[${s}].items[${i}]`} (${kind})`;
        if (!KINDS.includes(kind)) return errors.push(`${where}: unknown kind; use one of ${KINDS.join(', ')}`);
        const expanded = Array.isArray(item.styles) ? item.styles.map((key) => `${item.id}-${key}`) : [item.id];
        for (const id of expanded) {
          if (id === undefined) continue;
          if (ids.has(id)) errors.push(`${where}: duplicate id "${id}"`);
          ids.add(id);
        }
        if (item.style !== undefined) checkStyle(where, item.style);
        if (Array.isArray(item.styles)) {
          if (item.id === undefined) errors.push(`${where}: an item with styles needs an id`);
          item.styles.forEach((key) => checkStyle(where, key));
        }
        if (kind !== 'note' && item.note === undefined) warnings.push(`${where}: no note; say what the option is and its trade-offs`);

        switch (kind) {
          case 'page': {
            checkFile(where, item.src);
            const local = typeof item.src === 'string' ? localPath(item.src) : null;
            if (local && exists(local)) for (const problem of checkPageHtml(read(local))) errors.push(`${where}: ${local} ${problem}`);
            break;
          }
          case 'compose':
            if (!(item.width > 0) || !(item.height > 0)) errors.push(`${where}: width and height required`);
            if (!Array.isArray(item.layers)) errors.push(`${where}: layers required`);
            else
              item.layers.forEach((layer, l) => {
                const at = `${where} layers[${l}]`;
                if (!LAYERS.includes(layer.type)) errors.push(`${at}: type must be one of ${LAYERS.join(', ')}`);
                if (layer.type === 'image') checkFile(at, layer.src);
                if (layer.type === 'text' && typeof layer.text !== 'string') errors.push(`${at}: text required`);
              });
            break;
          case 'components':
            if (!Array.isArray(item.items) || item.items.length === 0) errors.push(`${where}: items required`);
            else item.items.forEach((c, n) => typeof c.html !== 'string' && errors.push(`${where} items[${n}]: html required`));
            break;
          case 'swatches':
            if (!Array.isArray(item.colors) && item.style === undefined) errors.push(`${where}: colors or style required`);
            break;
          case 'image':
            checkFile(where, item.src);
            break;
          case 'note':
            if (!item.text && !item.note) errors.push(`${where}: text required`);
            break;
        }
      });
    });
  }
}

/** Runs config.js the way the browser does and returns window.CANVAS, as plain data from this realm. */
export function loadConfig(code) {
  const window = {};
  vm.runInNewContext(code, { window });
  return window.CANVAS === undefined ? undefined : JSON.parse(JSON.stringify(window.CANVAS));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const result = checkCanvas(loadConfig(readFileSync(join(dir, 'config.js'), 'utf8')), {
    exists: (path) => existsSync(join(dir, path)),
    read: (path) => readFileSync(join(dir, path), 'utf8'),
  });
  for (const warning of result.warnings) console.log(`warn  ${warning}`);
  for (const error of result.errors) console.log(`error ${error}`);
  console.log(result.errors.length === 0 ? 'Canvas config OK.' : `${result.errors.length} error(s).`);
  process.exitCode = result.errors.length === 0 ? 0 : 1;
}
