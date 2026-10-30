/* global document, window */
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const origin = 'https://wayfinder-links-pearl.vercel.app';
const root = path.resolve('.generated/link-host/public');
await mkdir('.generated/link-host/screenshots', { recursive: true });
const config = JSON.parse(await readFile('.generated/link-host/vercel.json', 'utf8'));
const headers = Object.fromEntries(config.headers.find(value => value.source === '/(.*)').headers.map(value => [value.key, value.value]));
const entries = [
  ['/open/repo/R_kgDOUfX94g', 'Open this repository in Wayfinder'],
  ['/open/map/I_kwDOUfX94s8AAAABU1Jndg', 'Open this map in Wayfinder'],
  ['/open/ticket/I_kwDOUfX94s8AAAABbH5m2w', 'Open this ticket in Wayfinder'],
  ['/open/prototype/I_kwDOUfX94s8AAAABbH5m2w?canvas=prototypes%2F373-https-open-in-wayfinder%2Findex.html', 'Open this prototype in Wayfinder'],
  ['/open/prototype/I_kwDOUfX94s8AAAABbCjQ-A?canvas=prototypes%2F366-prototype-typed-replies-with-confirmation-from-the-phone%2Findex.html&rev=5a63a2a269ef95d430a5f85f1007b2bf2b6da40d&page=r1&item=R1-compose', 'Open this prototype in Wayfinder'],
  ['/open/prototype/I_kwDOUfX94s8AAAABbCjQ-A', 'This link can’t be opened'],
];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let checked = 0;
try {
  for (const colorScheme of ['light', 'dark']) {
    for (const [width, height] of [[1280,800],[390,844],[320,568],[844,390]]) {
      const context = await browser.newContext({ viewport: { width, height }, colorScheme });
      const page = await context.newPage();
      const errors = [];
      const unexpected = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) { unexpected.push(url.href); return route.abort(); }
        let file = url.pathname.startsWith('/open/') || url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        if (!['index.html','landing.css','landing.js','wayfinder-icon.svg'].includes(file)) return route.fulfill({status:404,body:''});
        const contentType = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'application/javascript' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html';
        await route.fulfill({status:200,body:await readFile(path.join(root,file)),contentType,headers});
      });
      for (const [destination, title] of entries) {
        await page.goto(origin + destination);
        await page.waitForFunction(() => document.querySelector('h1')?.textContent?.startsWith('Open this') || document.querySelector('#open-wayfinder')?.hidden);
        assert.equal(await page.locator('h1').textContent(), title);
        const valid = !title.startsWith('This link');
        assert.equal(await page.locator('#open-wayfinder').isVisible(), valid);
        if (valid) {
          const native = await page.locator('#open-wayfinder').getAttribute('href');
          assert(native.startsWith('wayfinder://'));
          assert(!native.includes('https://evil'));
          if (destination.includes('&rev=')) assert(native.includes('rev=5a63a2a269ef95d430a5f85f1007b2bf2b6da40d'));
          await page.keyboard.press('Tab');
          assert.equal(await page.locator('#open-wayfinder').evaluate(element => element === document.activeElement), true);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
        assert.equal(page.url(), origin + destination);
        if (destination.startsWith('/open/map/')) await page.screenshot({path:`.generated/link-host/screenshots/https-A-${colorScheme}-${width}.png`});
        checked++;
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(unexpected, []);
      await context.close();
    }
  }
  console.log(JSON.stringify({passed:checked, themes:2, viewports:4, pageErrors:0, unexpectedRequests:0, proof:'built static artifact in installed Chrome; native OS launch not exercised'}));
} finally { await browser.close(); }
