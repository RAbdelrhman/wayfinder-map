#!/usr/bin/env node
/*
  Preview the canvas exactly as Wayfinder will serve it: files straight off disk, under the
  same sandbox CSP (opaque origin: no fetch, no localStorage, no module scripts).
  Usage: node prototypes/canvas/tools/serve.mjs [port]
*/
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PORT = Number(process.argv[2] ?? 4390);
/** Wayfinder's PROTOTYPE_CSP in src/server.ts. Keep the two in step. */
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

createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  const file = resolve(join(ROOT, path));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'content-security-policy': CSP,
      'cache-control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end(`Not found: ${path}`);
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Canvas: http://127.0.0.1:${PORT}/prototypes/canvas/index.html`);
});
