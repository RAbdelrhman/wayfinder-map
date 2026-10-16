#!/usr/bin/env node
/*
  Preview the canvas under a sandbox CSP (opaque origin: no fetch, no localStorage, no module
  scripts), the strictest way it may be hosted. Serves the git repository the canvas lives in,
  so paths that climb out of the canvas folder (a project's own stylesheet) resolve.
  Usage: node <canvas>/tools/serve.mjs [port]
*/
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const CANVAS = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = (() => {
  try {
    return resolve(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: CANVAS, encoding: 'utf8' }).trim());
  } catch {
    return CANVAS;
  }
})();
const PORT = Number(process.argv[2] ?? 4390);
/** The same policy Wayfinder serves prototypes under. */
const CSP = 'sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

const REAL_ROOT = await realpath(ROOT);
export async function previewResponse(request, response) {
  let path;
  try {
    path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('Invalid path');
    return;
  }
  const file = resolve(join(ROOT, path));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const target = await realpath(file);
    if (target !== REAL_ROOT && !target.startsWith(REAL_ROOT + sep)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const body = await readFile(target);
    response.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'content-security-policy': CSP,
      'cache-control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end(`Not found: ${path}`);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) createServer(previewResponse).listen(PORT, '127.0.0.1', () => {
  const path = relative(ROOT, join(CANVAS, 'index.html')).split(sep).map(encodeURIComponent).join('/');
  console.log(`Canvas: http://127.0.0.1:${PORT}/${path}`);
});
