#!/usr/bin/env node
/* global document, requestAnimationFrame */
import { createServer } from 'node:http';
import { readFile, mkdir, realpath, stat } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

export const POSTER_VIEWPORT = { width: 1280, height: 800 };

export async function canvasDirectory(root, directory) {
  const base = await realpath(join(root, 'prototypes'));
  const canvas = await realpath(resolve(root, directory));
  const rel = relative(base, canvas);
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || resolve(base, rel) !== canvas) throw new Error('Choose a canvas directory inside prototypes/.');
  if (!(await stat(join(canvas, 'index.html'))).isFile()) throw new Error('Canvas index.html is missing.');
  return canvas;
}

export async function checkPoster(directory) {
  const file = join(directory, 'assets', 'poster.webp');
  const metadata = await sharp(await readFile(file)).metadata();
  if (metadata.format !== 'webp' || metadata.width !== POSTER_VIEWPORT.width || metadata.height !== POSTER_VIEWPORT.height) {
    throw new Error('Recapture assets/poster.webp at 1280 × 800.');
  }
  return file;
}

/** Capture the authored board; never contact GitHub or change a branch. */
export async function capturePoster(root, directory) {
  const canvas = await canvasDirectory(root, directory);
  const base = await realpath(root);
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      const file = await realpath(resolve(base, `.${pathname}`));
      const rel = relative(base, file);
      const type = types[extname(file)];
      if (rel.startsWith(`..${sep}`) || rel === '..' || rel.split(sep).some(part => part.startsWith('.')) || !type || !(await stat(file)).isFile()) { response.writeHead(404).end(); return; }
      response.writeHead(200, { 'content-type': type });
      response.end(await readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  let browser;
  try {
    await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Capture server did not start.');
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: POSTER_VIEWPORT, colorScheme: 'light', reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const path = relative(base, join(canvas, 'index.html')).split(sep).map(encodeURIComponent).join('/');
    await page.goto(`http://127.0.0.1:${address.port}/${path}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    // Give the engine's fit-to-board layout and child-page paints two frames to settle.
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    if (errors.length) throw new Error(`Canvas failed to render: ${errors.join('; ')}`);
    const output = join(canvas, 'assets', 'poster.webp');
    await mkdir(join(canvas, 'assets'), { recursive: true });
    await sharp(await page.screenshot()).webp({ quality: 80 }).toFile(output);
    return await checkPoster(canvas);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(done => server.close(done));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const args = process.argv.slice(2);
    const check = args[0] === '--check';
    const directory = args[check ? 1 : 0];
    if (!directory || args.length !== (check ? 2 : 1)) throw new Error('Usage: bun run canvas:poster [--check] prototypes/<task-id>');
    const root = process.cwd();
    const file = check ? await checkPoster(await canvasDirectory(root, directory)) : await capturePoster(root, directory);
    console.log(`${check ? 'Checked' : 'Captured'} ${relative(root, file)}. Commit it with this canvas on its prototype branch.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
