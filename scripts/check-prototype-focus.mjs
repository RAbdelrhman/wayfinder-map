#!/usr/bin/env node
/* global document, window */
// Runtime fixture, not proof of the installed app. A non-supporting runtime exits
// nonzero rather than silently accepting a policy attribute it ignores.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

const artifacts = join(process.cwd(), '.shots/focus-360');
await mkdir(artifacts, { recursive: true });
const bundle = await build({ entryPoints: ['src/ui/canvasViewer.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { canvasFrameHtml } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const frame = canvasFrameHtml({ url: '/child', title: 'Focus fixture', github: '' });
const child = `<!doctype html><button id="target">Canvas target</button>
  <svg><a id="svg" tabindex="0">SVG target</a></svg>
  <dialog><button autofocus>Cancel</button><button>Confirm</button></dialog>
  <script>onmessage = e => {
    if(e.data === 'html') target.focus();
    if(e.data === 'svg') document.querySelector('#svg').focus();
    if(e.data === 'dialog') document.querySelector('dialog').showModal();
    if(e.data === 'nested') {
      const f = document.createElement('iframe');
      f.allow = 'focus-without-user-activation *';
      f.srcdoc = '<button id="b">Nested target</button><script>setTimeout(()=>b.focus(),100)<'+ '/script>';
      document.body.append(f);
    }
  };</script>`;
const server = createServer((request, response) => {
  response.setHeader('content-type', 'text/html');
  if (request.url === '/child') { response.end(child); return; }
  const preview = request.url.includes('preview');
  const control = request.url.includes('control');
  const iframe = (control ? frame.replace("focus-without-user-activation 'none'", 'focus-without-user-activation *') : frame)
    .replace('<iframe ', preview ? '<iframe name="wayfinder-preview" ' : '<iframe ');
  response.end(`<!doctype html><button id="host">Host focus target</button>${iframe}
    <script>window.events=[];addEventListener('blur',()=>events.push('blur'));
    document.addEventListener('focusin',e=>events.push(e.target.id||e.target.tagName));</script>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const results = [];
let browser;
let version = 'unknown';
try {
  browser = await chromium.launch({ headless: false, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }) });
  version = browser.version();
  const page = await browser.newPage();
  const base = `http://127.0.0.1:${server.address().port}`;
  const support = await page.evaluate(() => ({ userAgent: window.navigator.userAgent, policy: document.featurePolicy.features().includes('focus-without-user-activation') }));
  console.log(JSON.stringify(support));
  results.push(support);
  for (const preview of [false, true]) for (const control of [true, false]) for (const method of ['html', 'svg', 'dialog', 'nested']) {
    await page.goto(`${base}/${preview ? 'preview' : 'viewer'}-${control ? 'control' : 'deny'}`);
    await page.frames()[1].waitForLoadState();
    await page.bringToFront();
    await page.locator('#host').click();
    await page.evaluate(method => document.querySelector('iframe').contentWindow.postMessage(method, '*'), method);
    await page.waitForTimeout(500);
    const observation = await page.evaluate(() => ({ active: document.activeElement.tagName, focused: document.hasFocus(), events: window.events }));
    const result = { preview, control, method, ...observation };
    results.push(result);
    console.log(JSON.stringify(result));
    assert.equal(observation.focused, true, 'probe window must be focused');
    assert.equal(observation.active, control ? 'IFRAME' : 'BUTTON', JSON.stringify(result));
    assert.equal(observation.events.includes('blur'), control, JSON.stringify(result));
  }
  // User interaction must still enter a denied frame; native dialog focus, Tab
  // navigation and Escape must continue to work after that deliberate entry.
  await page.goto(`${base}/viewer-deny`);
  const canvas = page.frameLocator('iframe');
  await canvas.locator('#target').click();
  await page.evaluate(() => document.querySelector('iframe').contentWindow.postMessage('dialog', '*'));
  await canvas.locator('dialog').waitFor({ state: 'visible' });
  assert.equal(await page.frames()[1].evaluate(() => document.activeElement.textContent), 'Cancel');
  await page.keyboard.press('Tab');
  assert.equal(await page.frames()[1].evaluate(() => document.activeElement.textContent), 'Confirm');
  await page.keyboard.press('Escape');
  assert.equal(await canvas.locator('dialog').evaluate(element => element.open), false);
  results.push({ interaction: 'click, modal autofocus, Tab, Escape', pass: true });
  assert.equal(support.policy, true, 'runtime must support the policy without experimental launch flags');
} finally {
  await writeFile(join(artifacts, `runtime-${version}.json`), JSON.stringify(results, null, 2));
  await browser?.close();
  server.close();
}
