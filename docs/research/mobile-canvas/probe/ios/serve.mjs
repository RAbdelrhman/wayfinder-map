// #221 research probe. Serves a folder with the desktop app's PROTOTYPE_CSP and nosniff headers.
// Usage: node serve.mjs <root> <port>
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const CSP = 'sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads';
const [root, port] = process.argv.slice(2);

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    const bytes = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream', 'content-security-policy': CSP, 'x-content-type-options': 'nosniff' });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(Number(port));
