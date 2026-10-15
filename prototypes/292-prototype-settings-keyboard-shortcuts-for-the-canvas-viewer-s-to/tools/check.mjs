#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkCanvas, checkPageHtml, checkSharedCanvasCopies, loadConfig } from '../../canvas/tools/check.mjs';
export { checkCanvas, checkPageHtml, checkSharedCanvasCopies, loadConfig };

// Follow the page's local script/style dependencies, rather than only its inline code.
export function checkLinkedAssets(entry, read, exists, visited = new Set()) {
  if (visited.has(entry)) return [];
  visited.add(entry);
  const source = read(entry);
  const errors = checkPageHtml(source).map(message => `${entry}: ${message}`);
  if (/\.(?:js|css)$/.test(entry) && /(?:^|[;\n])\s*(?:import\s|export\s)|\bimport\s*\(|@import\s|url\(\s*["']?\//m.test(source)) errors.push(`${entry}: module import or root CSS path is not sandbox compatible`);
  if (/\.html$/.test(entry)) {
    for (const match of source.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
      const href = match[1].split(/[?#]/)[0];
      if (/^(?:[a-z]+:|\/\/)/i.test(href)) continue;
      const linked = join(dirname(entry), href);
      if (!exists(linked)) errors.push(`${entry}: missing linked asset ${href}`);
      else errors.push(...checkLinkedAssets(linked, read, exists, visited));
    }
  }
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const read = path => readFileSync(join(dir, path), 'utf8');
  const exists = path => existsSync(join(dir, path));
  const config = loadConfig(read('config.js'));
  const result = checkCanvas(config, { read, exists });
  const visited = new Set();
  for (const page of config.pages) for (const section of page.sections) for (const item of section.items) {
    if (item.src && !/^[a-z]+:/i.test(item.src)) result.errors.push(...checkLinkedAssets(item.src.split(/[?#]/)[0], read, exists, visited));
  }
  result.errors.push(...checkSharedCanvasCopies(dirname(dir)));
  for (const message of result.warnings) console.log(`warn ${message}`);
  for (const message of result.errors) console.log(`error ${message}`);
  console.log(result.errors.length ? `${result.errors.length} error(s).` : 'Canvas config OK.');
  process.exitCode = result.errors.length ? 1 : 0;
}