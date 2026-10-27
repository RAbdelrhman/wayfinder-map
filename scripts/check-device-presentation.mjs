#!/usr/bin/env node
/* global document, getComputedStyle, innerWidth, innerHeight */
// Browser layout evidence, not a native or real-device test. Uses only disposable
// generated content and the current viewer/bridge; never reads another worktree.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, relative, resolve, sep } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

const root = process.cwd();
const artifacts = join(root, '.shots/device-presentation');
const fixture = await realpath(await mkdtemp(join(tmpdir(), 'wayfinder-phone-layout-')));
let browser;
let server;
try {
  await cp(join(root, 'prototypes/canvas'), join(fixture, 'prototypes/canvas'), { recursive: true });
  await mkdir(join(fixture, 'src/ui'), { recursive: true });
  await cp(join(root, 'src/ui/styles.css'), join(fixture, 'src/ui/styles.css'));
  execFileSync(process.execPath, [join(root, 'scripts/create-canvas.mjs'), 'phone-check', '--mobile'], { cwd: fixture });
  const phonePath = join(fixture, 'prototypes/phone-check/variants/phone.html');
  const phone = (await readFile(phonePath, 'utf8')).replace('<!-- Author this task\'s chosen screen options here. -->',
    '<span id="canvas-device-style" hidden></span><button id="first">First</button><button id="last" style="margin-top:auto">Last</button>');
  await writeFile(phonePath, phone);
  const bundle = async (options) => (await build({ bundle: true, write: false, format: 'esm', ...options })).outputFiles[0].text;
  const bridgeSource = await bundle({ entryPoints: [join(root, 'src/canvasBridge.ts')], platform: 'node' });
  const { viewerPrototypeBytes } = await import(`data:text/javascript;base64,${Buffer.from(bridgeSource).toString('base64')}`);
  const viewer = await bundle({ stdin: {
    contents: "import { mountCanvasViewer } from './src/ui/canvasViewer.ts'; mountCanvasViewer(document.getElementById('app'));",
    resolveDir: root,
  } });
  const prefix = '/proto/o/r/prototype%2F999/';
  const boardPath = `${prefix}prototypes/phone-check/index.html`;
  const host = `<!doctype html><html><head><link rel="stylesheet" href="/src/ui/styles.css"></head>
    <body class="viz-root"><main id="app"><a id="open" href="${boardPath}" data-canvas-url="${boardPath}"
    data-canvas-title="Phone layout fixture" data-canvas-github="https://github.com/o/r">Open</a></main>
    <script type="module" src="/viewer.js"></script></body></html>`;
  server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (pathname === '/') { response.setHeader('content-type', 'text/html'); response.end(host); return; }
      if (pathname === '/viewer.js') { response.setHeader('content-type', 'text/javascript'); response.end(viewer); return; }
      if (pathname.startsWith('/api/')) { response.setHeader('content-type', 'application/json'); response.end('{}'); return; }
      const proto = pathname.startsWith(prefix);
      const file = decodeURIComponent(proto ? pathname.slice(prefix.length) : pathname.slice(1));
      const path = await realpath(resolve(fixture, file));
      const rel = relative(fixture, path);
      if (rel === '..' || rel.startsWith(`..${sep}`) || rel.split(sep).some(part => part.startsWith('.'))) throw new Error('Outside fixture');
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
      const type = types[extname(path)];
      if (!type) throw new Error('Unsupported fixture asset');
      response.setHeader('content-type', type);
      if (proto) response.setHeader('content-security-policy', 'sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads');
      response.end(viewerPrototypeBytes(file, await readFile(path)));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.CHROME_PATH;
  browser = await chromium.launch(executablePath === undefined ? { channel: 'chrome' } : { executablePath });
  await mkdir(artifacts, { recursive: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const measure = async (frame) => frame.evaluate(() => {
    const app = document.getElementById('app');
    const rect = app.getBoundingClientRect();
    const css = getComputedStyle(app);
    const probe = document.createElement('span');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.backgroundColor = 'color-mix(in srgb, var(--plane) 88%, var(--text-primary))';
    document.body.append(probe);
    const expectedBackdrop = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { x: rect.x, y: rect.y, w: rect.width, h: rect.height, width: innerWidth, height: innerHeight,
      radius: css.borderRadius, transform: css.transform, backdrop: getComputedStyle(document.body).backgroundColor, expectedBackdrop,
      scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight,
      styles: document.head.querySelectorAll('style[data-canvas-device-style="phone"]').length };
  });
  const check = (box, framed) => {
    assert.equal(box.styles, 1);
    if (framed) {
      const scale = Math.min(1, (box.height - 24) / 844, (box.width - 24) / 390);
      assert.ok(Math.abs(box.w - 390 * scale) < 1, JSON.stringify(box));
      assert.ok(Math.abs(box.h - 844 * scale) < 1, JSON.stringify(box));
      assert.ok(Math.abs(box.x + box.w / 2 - box.width / 2) < 1, JSON.stringify(box));
      assert.ok(Math.abs(box.y + box.h / 2 - box.height / 2) < 1, JSON.stringify(box));
      assert.equal(box.radius, '36px');
      assert.equal(box.backdrop, box.expectedBackdrop, 'framed backdrop must match the chosen 88% plane / 12% text mix');
    } else {
      assert.equal(box.radius, '0px');
      assert.equal(box.transform, 'none');
      assert.equal(box.w, box.width);
    }
    assert.equal(box.scrollW, box.width);
    assert.equal(box.scrollH, box.height);
  };
  const backdrops = [];
  for (const theme of ['light', 'dark']) {
    let backdrop;
    for (const [width, height] of [[1280, 1000], [1280, 800], [600, 400], [844, 390], [520, 844], [519, 844], [390, 844], [320, 640]]) {
      await page.setViewportSize({ width, height });
      await page.goto(`${base}${prefix}prototypes/phone-check/variants/phone.html?theme=${theme}`);
      const box = await measure(page);
      check(box, width >= 520);
      if (width === 1280 && height === 800) await page.screenshot({ path: join(artifacts, `${theme}.png`) });
      if (width === 1280) backdrop = box.backdrop;
    }
    backdrops.push(backdrop);
    console.log(`${theme}: direct page passed at 8 viewports; backdrop ${backdrop}`);
  }
  assert.notEqual(backdrops[0], backdrops[1]);
  // Live resize must update the scale without reloading or replacing content.
  await page.setViewportSize({ width: 600, height: 400 });
  await page.waitForFunction(() => Number(document.documentElement.style.getPropertyValue('--device-fit')) < 0.5);
  check(await measure(page), true);
  await page.locator('#first').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#last').evaluate(el => el === document.activeElement), true);

  // Standalone engine: thumbnails remain unframed; Present adds one frame.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${base}${prefix}prototypes/phone-check/index.html`);
  const thumb = page.frameLocator('[data-frame="A"]');
  await thumb.locator('#first').waitFor();
  const thumbnail = page.frames().find(frame => frame.url().includes('phone.html'));
  check(await measure(thumbnail), false);
  await page.locator('[data-play="A"]').first().click();
  await page.frameLocator('#present-frame').locator('#first').waitFor();
  let presented = page.frames().find(frame => frame.url().includes('phone.html') && frame !== thumbnail);
  check(await measure(presented), true);
  await page.keyboard.press('Escape');
  await page.locator('#present-view').waitFor({ state: 'hidden' });

  // Actual Wayfinder viewer module, bridge, engine adaptation and sandbox. The
  // outer host and branch-file provider are local fixtures, not the installed app.
  await page.goto(base);
  await page.locator('#open').click();
  await page.locator('#canvas-viewer [data-go="A"]').click();
  await page.frameLocator('.vw-frame').frameLocator('#present-frame').locator('#first').waitFor();
  // Board thumbnails have data-frame; select the presentation by its element.
  const engine = page.frames().find(frame => frame.parentFrame() === page.mainFrame());
  presented = await (await engine.$('#present-frame')).contentFrame();
  check(await measure(presented), true);
  await page.screenshot({ path: join(artifacts, 'viewer.png') });
  await presented.locator('#first').focus();
  await page.keyboard.press('Tab');
  assert.equal(await presented.locator('#last').evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Escape');
  await page.locator('#canvas-viewer [data-go=""][aria-pressed="true"]').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('#canvas-viewer').waitFor({ state: 'hidden' });
  assert.deepEqual(errors, []);
  console.log('Board, Present, sandboxed Wayfinder viewer, resize, focus and Escape passed. Layout evidence only; real devices Not Verified.');
} finally {
  await browser?.close();
  if (server) {
    server.closeAllConnections();
    await new Promise(done => server.close(done));
  }
  // fixture is a mkdtemp-created absolute directory, never a computed repo path.
  await rm(fixture, { recursive: true, force: true });
}
