// Captures the README screenshots of the in-app canvas viewer.
// Run: node docs/verification/215/capture.mjs [origin]  (a Wayfinder server must be running)
// The canvas is a real board from this repo (prototypes/settings-page), served through
// the real viewer bridge at the network boundary so no GitHub branch is needed.
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve, extname, join } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';

const origin = process.argv[2] ?? 'http://127.0.0.1:4488';
const out = resolve('docs/images');
await mkdir(out, { recursive: true });
await build({ entryPoints: ['src/canvasBridge.ts'], outfile: '.generated/215-bridge.mjs', bundle: true, platform: 'node', format: 'esm' });
const { viewerPrototypeBytes } = await import(pathToFileURL(resolve('.generated/215-bridge.mjs')).href);

const board = 'prototypes/settings-page';
const sha = 'a'.repeat(40);
const base = `/proto/RAbdelrhman/wayfinder-map/prototype%2F215-demo/${sha}/viewer-11`;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(20000);
await page.route(`**${base}/**`, async (route) => {
  const rel = decodeURIComponent(new URL(route.request().url()).pathname.slice(base.length + 1));
  const bytes = await readFile(resolve(rel)).catch(() => null);
  if (!bytes) return route.fulfill({ status: 404, body: 'missing' });
  const type = types[extname(rel)] ?? 'application/octet-stream';
  const html = type === 'text/html' || rel.endsWith('canvas.js');
  return route.fulfill({ contentType: type, body: html ? viewerPrototypeBytes(rel.split('/').pop(), bytes) : bytes });
});
await page.goto(`${origin}/repos/RAbdelrhman/wayfinder-map/maps/205?view=map`, { waitUntil: 'domcontentloaded' });
await page.locator('#canvas-viewer').waitFor({ state: 'attached' });
const canvas = `${base}/${board}/index.html`;
await page.evaluate(({ canvas }) => {
  const a = document.createElement('a');
  a.textContent = 'open';
  a.href = canvas;
  Object.assign(a.dataset, { canvasUrl: canvas, canvasTitle: 'Settings page', canvasGithub: 'https://github.com/RAbdelrhman/wayfinder-map/tree/prototype/215-demo', canvasTicket: '215' });
  document.querySelector('#app').append(a);
}, { canvas });
await page.getByRole('link', { name: 'open', exact: true }).click();
await page.locator('#canvas-viewer .vw-frame.is-ready').waitFor();
await page.waitForTimeout(1500);
await page.screenshot({ path: join(out, 'in-app-canvas-board.png') });

// Open one option full size, drop a pin and write the note.
await page.locator('#vw-toolbar [data-go=settings-A]').click();
await page.waitForTimeout(1500);
await page.locator('#vw-toolbar [data-fb-tool=pin]').click();
const stage = await page.locator('.vw-canvas').boundingBox();
await page.mouse.move(stage.x + stage.width * 0.52, stage.y + stage.height * 0.4);
await page.mouse.click(stage.x + stage.width * 0.52, stage.y + stage.height * 0.4);
await page.waitForTimeout(500);
const note = page.locator('textarea[data-fb-note]').first();
await note.waitFor();
await note.fill('Give Calibration its own entry instead of hiding it.');
await page.waitForTimeout(800);
await page.screenshot({ path: join(out, 'in-app-canvas-pin.png') });
await browser.close();
