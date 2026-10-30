#!/usr/bin/env node
/* global document, window */
// Runtime fixture, not proof of the installed app. A non-supporting runtime exits
// nonzero rather than silently accepting a policy attribute it ignores.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium, _electron } from 'playwright-core';

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
    if(e.data === 'window') window.focus();
    if(e.data === 'autofocus') {
      const d = document.createElement('dialog');
      d.innerHTML = '<input autofocus>';
      document.body.append(d);
      d.showModal();
    }
    if(e.data === 'nested') {
      const f = document.createElement('iframe');
      f.allow = 'focus-without-user-activation *';
      f.srcdoc = '<button id="b">Nested target</button><script>setTimeout(()=>b.focus(),100)<'+ '/script>';
      document.body.append(f);
    }
  };</script>`;
const server = createServer((request, response) => {
  response.setHeader('content-type', 'text/html');
  if (request.url === '/child' || request.url === '/loading-child') {
    response.end(request.url === '/loading-child'
      ? child.replace('onmessage = e => {', "document.querySelector('dialog').showModal(); onmessage = e => {")
      : child);
    return;
  }
  const preview = request.url.includes('preview');
  const control = request.url.includes('control');
  const iframe = (control ? frame.replace("focus-without-user-activation 'none'", 'focus-without-user-activation *') : frame)
    .replace('src="/child"', request.url.includes('loading') ? 'src="about:blank"' : 'src="/child"')
    .replace('<iframe ', preview ? '<iframe name="wayfinder-preview" ' : '<iframe ');
  response.end(`<!doctype html><button id="host">Host focus target</button>${iframe}
    <script>window.events=[];addEventListener('blur',()=>events.push('blur'));
    document.addEventListener('focusin',e=>events.push(e.target.id||e.target.tagName));</script>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const results = [];
let browser;
let desktop;
let version = 'unknown';
try {
  const base = `http://127.0.0.1:${server.address().port}`;
  let page;
  if (process.env.ELECTRON_PATH) {
    const main = join(artifacts, 'electron-probe.cjs');
    await writeFile(main, `const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const window=new BrowserWindow({width:1280,height:800});window.loadURL(process.env.PROTOTYPE_FOCUS_URL);});`);
    const env = { ...process.env, PROTOTYPE_FOCUS_URL: base };
    delete env.ELECTRON_RUN_AS_NODE;
    desktop = await _electron.launch({ executablePath: process.env.ELECTRON_PATH, args: [main], env });
    version = `electron-${await desktop.evaluate(({ app }) => app.getVersion())}`;
    page = await desktop.firstWindow();
  } else {
    browser = await chromium.launch({ headless: false, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }) });
    version = browser.version();
    page = await browser.newPage();
  }
  const focusHost = async () => {
    await page.bringToFront();
    if (desktop) {
      const targetWindow = await desktop.browserWindow(page);
      await targetWindow.evaluate(targetWindow => { targetWindow.show(); targetWindow.focus(); });
    }
    await page.locator('#host').click();
    await page.waitForFunction(() => document.hasFocus() && document.activeElement.id === 'host');
  };
  const support = await page.evaluate(() => ({ userAgent: window.navigator.userAgent, policy: document.featurePolicy.features().includes('focus-without-user-activation') }));
  console.log(JSON.stringify(support));
  results.push(support);
  for (const control of [true, false]) {
    await page.goto(`${base}/loading-${control ? 'control' : 'deny'}`);
    await focusHost();
    await page.evaluate(() => { document.querySelector('iframe').src = '/loading-child'; });
    await page.frames()[1].waitForURL('**/loading-child');
    await page.frames()[1].waitForLoadState();
    await page.waitForTimeout(500);
    const observation = await page.evaluate(() => ({ active: document.activeElement.tagName, events: window.events }));
    const result = { loading: 'parser-opened modal with autofocus', control, ...observation };
    results.push(result);
    console.log(JSON.stringify(result));
    assert.equal(observation.active, control ? 'IFRAME' : 'BUTTON', JSON.stringify(result));
    assert.equal(observation.events.includes('blur'), control, JSON.stringify(result));
  }
  for (const preview of [false, true]) for (const control of [true, false]) for (const method of ['html', 'svg', 'dialog', 'autofocus', 'window', 'nested']) {
    await page.goto(`${base}/${preview ? 'preview' : 'viewer'}-${control ? 'control' : 'deny'}`);
    await page.frames()[1].waitForLoadState();
    await focusHost();
    await page.evaluate(method => document.querySelector('iframe').contentWindow.postMessage(method, '*'), method);
    if (control) await page.waitForFunction(() => document.activeElement.tagName === 'IFRAME');
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
  await desktop?.close();
  server.close();
}
