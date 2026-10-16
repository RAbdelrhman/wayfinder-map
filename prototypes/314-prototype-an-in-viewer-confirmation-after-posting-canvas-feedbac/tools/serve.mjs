#!/usr/bin/env node
/*
  Preview the canvas under a sandbox CSP (opaque origin: no fetch, no localStorage, no module
  scripts), the strictest way it may be hosted. Serves only this board's explicit assets,
  including its shared canvas engine, viewer stylesheet and two screenshot fixtures.
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

const CANVAS_PATH = relative(ROOT, CANVAS).split(sep).join('/');
const ASSETS = new Set([
  `${CANVAS_PATH}/index.html`, `${CANVAS_PATH}/config.js`,
  ...['viewer.html', 'viewer.js', 'viewer.css'].map(file => `${CANVAS_PATH}/variants/${file}`),
  'src/ui/styles.css', 'prototypes/canvas/canvas.js', 'prototypes/canvas/canvas.css',
  'prototypes/canvas/kit/kit.js', 'prototypes/canvas/assets/protos/39-board.jpg',
  'prototypes/canvas/assets/protos/42-B.jpg',
]);

export function createPreviewHandler({ root = ROOT, port = PORT } = {}) {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  return async (request, response) => {
    if (!hosts.has(request.headers?.host)) return response.writeHead(403).end('Forbidden host');
    if (!['GET', 'HEAD'].includes(request.method)) return response.writeHead(405).end('Method not allowed');
    let path;
    try {
      path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname).slice(1);
    } catch {
      return response.writeHead(400).end('Invalid path');
    }
    if (!ASSETS.has(path)) return response.writeHead(403).end('Forbidden asset');
    try {
      const realRoot = await realpath(root);
      const target = await realpath(resolve(root, path));
      if (!target.startsWith(realRoot + sep)) return response.writeHead(403).end('Forbidden target');
      if (!ASSETS.has(relative(realRoot, target).split(sep).join('/'))) return response.writeHead(403).end('Forbidden target asset');
      const body = await readFile(target);
      response.writeHead(200, {
        'content-type': MIME[extname(path).toLowerCase()] ?? 'application/octet-stream',
        'content-security-policy': CSP,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
    }
  };
}

export const previewResponse = createPreviewHandler();
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) createServer(previewResponse).listen(PORT, '127.0.0.1', () => {
  const path = relative(ROOT, join(CANVAS, 'index.html')).split(sep).map(encodeURIComponent).join('/');
  console.log(`Canvas: http://127.0.0.1:${PORT}/${path}`);
});
