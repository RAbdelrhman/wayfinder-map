// #221 research probe. Run from a scratch folder with `npm i playwright`; fetch.mjs <branch> <dir> first.
// Load real canvases at phone size in WebKit (iOS WKWebView engine) and Chromium (Android WebView engine).
import { chromium, webkit, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const CSP = 'sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads'; // same as desktop PROTOTYPE_CSP
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    const bytes = await readFile(join(process.cwd(), path));
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream', 'content-security-policy': CSP, 'x-content-type-options': 'nosniff' });
    res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;

const canvases = { c223: 'c223/prototypes/canvas/index.html', c207: 'c207/prototypes/canvas/index.html' };
const engines = { ios: [webkit, devices['iPhone 13']], android: [chromium, devices['Pixel 7']] };
const modes = {
  http: (p) => `http://127.0.0.1:${port}/${p}`,
  file: (p) => pathToFileURL(resolve(p)).href,
};
await mkdir('shots', { recursive: true });
const results = [];
for (const [ename, [type, device]] of Object.entries(engines)) {
  const browser = await type.launch();
  for (const [cname, p] of Object.entries(canvases)) {
    for (const [mname, url] of Object.entries(modes)) {
      const ctx = await browser.newContext({ ...device });
      const page = await ctx.newPage();
      const problems = [];
      page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text().slice(0, 160)}`));
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 160)}`));
      page.on('requestfailed', (r) => problems.push(`failed: ${r.url().slice(-80)} ${r.failure()?.errorText}`));
      await page.goto(url(p), { waitUntil: 'load' });
      await page.waitForTimeout(2500);
      const tag = `${cname}-${ename}-${mname}`;
      await page.screenshot({ path: `shots/${tag}-board.png` });
      const layout = await page.evaluate(() => {
        const vw = innerWidth;
        const over = [...document.querySelectorAll('header *, .bar *, #bar *')].filter((el) => el.getClientRects().length && el.getBoundingClientRect().right > vw + 1).map((el) => el.id || el.className || el.tagName).slice(0, 8);
        const board = document.getElementById('board');
        return {
          vw, docScrollWidth: document.documentElement.scrollWidth,
          zoomLabel: document.getElementById('zoom-fit')?.textContent,
          stageWidth: document.getElementById('stage')?.scrollWidth,
          boardScroll: board ? [board.scrollWidth, board.clientWidth] : null,
          boardTouchAction: board ? getComputedStyle(board).touchAction : null,
          chromeOverflow: over,
          frames: document.querySelectorAll('iframe[data-frame]').length,
        };
      });
      // Did each board iframe actually render content?
      const frameText = [];
      for (const f of page.frames().slice(1)) {
        try { frameText.push(await f.evaluate(() => document.body?.innerText.trim().length ?? 0)); } catch { frameText.push(-1); }
      }
      layout.framesWithContent = frameText.filter((n) => n > 0).length;
      // Present the first item full screen.
      const hit = page.locator('button.hit').first();
      if (await hit.count()) {
        await hit.click();
        await page.waitForTimeout(1500);
        await page.screenshot({ path: `shots/${tag}-present.png` });
        layout.presentOverflow = await page.evaluate(() => [...document.querySelectorAll('*')].filter((el) => el.closest('dialog,[id^=present],.present') && el.getClientRects().length && el.getBoundingClientRect().right > innerWidth + 1).map((el) => el.id || el.className || el.tagName).slice(0, 8));
      }
      results.push({ tag, ...layout, problems: [...new Set(problems)].slice(0, 8) });
      await ctx.close();
    }
  }
  await browser.close();
}
server.close();
await writeFile('results.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 1));
