/* global document, window, performance */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { chromium, _electron } from 'playwright-core';
import electron from 'electron';

// Run after `bun run build` and a branch CLI server. This loads the COMPLETE app,
// its real #205 prototype list and the actual #314 canvas, not a viewer fixture.
const desktop = process.argv.includes('--desktop');
const control = process.argv.includes('--control');
const entryDelay = process.argv.includes('--slow-entry') ? 350 : 0;
const duration = process.argv.includes('--smoke') ? 2000 : 30000;
const artifacts = process.env.FOCUS_ARTIFACTS ?? '.shots/focus-385';
await mkdir(artifacts, { recursive: true });
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const app = desktop ? await _electron.launch({ executablePath: electron, args: ['.', `--user-data-dir=${resolve(artifacts, `desktop-profile-${Date.now()}`)}`], env, timeout: 60000 }) : null;
const browser = app ? null : await chromium.launch({ channel: 'chrome', headless: false });
const page = app ? await app.firstWindow() : await browser.newPage({ viewport: { width: 1440, height: 960 } });
const evidence = { startedAt: Date.now(), surface: desktop ? 'branch-built Electron' : 'localhost Chrome', control, duration, probes: [] };
evidence.entryMessageDelayMs = entryDelay;
evidence.sourceHead = (await promisify(execFile)('git', ['rev-parse', 'HEAD'])).stdout.trim();
evidence.buildHashes = Object.fromEntries(await Promise.all(['dist/cli.js', 'dist/desktop.cjs', 'dist/ui/app.js'].map(async file => [file, createHash('sha256').update(await readFile(file)).digest('hex')])));
const label = `${desktop ? 'electron' : 'chrome'}-${control ? 'control' : 'restoration'}`;
try {
  let origin = process.env.FOCUS_APP_ORIGIN ?? 'http://127.0.0.1:56439';
  if (app) {
    await page.waitForURL(url => url.protocol === 'http:', { timeout: 90000 });
    origin = new URL(page.url()).origin;
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1440, 960); w.show(); w.focus(); });
  }
  evidence.origin = origin;
  evidence.userAgent = await page.evaluate(() => window.navigator.userAgent);
  page.setDefaultTimeout(90000);
  evidence.applicationErrors = [];
  page.on('pageerror', error => { evidence.applicationErrors.push(error.stack); console.log('application error:', error.stack); });
  await page.bringToFront();
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      if (location.protocol === 'http:' && location.pathname.startsWith('/proto/')) document.body.dataset.focus385Ready = 'true';
      if (window !== window.top) return;
      const eager = () => document.querySelectorAll('iframe[name="wayfinder-preview"]').forEach(frame => { frame.loading = 'eager'; });
      eager();
      new MutationObserver(eager).observe(document.documentElement, { childList: true, subtree: true });
    });
  });
  if (entryDelay) await page.addInitScript(delay => {
    if (window !== window.top) return;
    const add = window.addEventListener.bind(window);
    window.addEventListener = function(type, listener, options) {
      if (type !== 'message' || typeof listener !== 'function') return add(type, listener, options);
      add(type, event => {
        if (event.data?.type === 'focus-entry') setTimeout(() => listener.call(window, event), delay);
        else listener.call(window, event);
      }, options);
    };
  }, entryDelay);
  if (process.env.FOCUS_PROTOTYPES_FILE) {
    const body = await readFile(process.env.FOCUS_PROTOTYPES_FILE, 'utf8');
    const recorded = JSON.parse(body.replace(/^\uFEFF/, ''));
    assert.ok(recorded.some(p => p.ticketNumber === 314) && recorded.some(p => p.ticketNumber === 347), 'recording must include actual #314 and AC3');
    await page.route('**/api/repos/RAbdelrhman/wayfinder-map/prototypes?*', route => route.fulfill({ json: recorded }));
    evidence.prototypeMetadataReplay = { sha256: createHash('sha256').update(body).digest('hex'), tickets: recorded.map(p => ({ number: p.ticketNumber, sha: p.sha })) };
  }
  if (control) await page.route('**/app.js', async route => {
    const response = await route.fetch();
    const body = await response.text();
    const call = 'mountCanvasFocus(viewer, () => routing.current !== null, () => frame);';
    assert.equal(body.split(call).length, 2, 'control must remove exactly one focus-restoration mount');
    await route.fulfill({ response, body: body.replace(call, '/* independent unguarded control */') });
  });
  // Exercise the shipped image-error fallback so the decision board uses LIVE
  // frames. The fallback itself, layout and click handlers remain production code.
  await page.route('**/proto-shot/**', route => route.abort());
  await page.goto(`${origin}/repos/RAbdelrhman/wayfinder-map/maps/205?view=prototypes`);
  const entry = page.locator('[data-canvas-ticket="314"]').filter({ hasText: 'All rounds' }).first();
  await entry.waitFor({ state: 'attached' });
  // Cards use content-visibility. Scroll to the real card before asking for its
  // visible button; offscreen descendants may have no layout until then.
  await entry.scrollIntoViewIfNeeded();
  page.setDefaultTimeout(15000);
  evidence.entry = await entry.getAttribute('data-canvas-url');
  // Hold the real document response to select Close before #314's parsing and
  // nested native modal/autofocus run. No prototype source is replaced.
  await page.route(url => url.pathname.endsWith('/314-prototype-an-in-viewer-confirmation-after-posting-canvas-feedbac/index.html'), async route => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    await route.fallback();
  });
  await page.evaluate(() => {
    window.focusEvents = [];
    window.focusMessages = [];
    window.addEventListener('message', event => { if (event.data?.type?.startsWith('focus-')) window.focusMessages.push({ type: event.data.type, token: !!event.data.token, root: event.source === document.querySelector('.vw-frame')?.contentWindow, at: performance.now() }); });
    document.addEventListener('focusin', event => window.focusEvents.push({ type: 'focusin', target: event.target.tagName, at: performance.now() }));
    window.addEventListener('blur', () => {
      const record = type => window.focusEvents.push({ type, active: document.activeElement?.tagName, background: document.activeElement?.matches('.decision-variant-page'), at: performance.now() });
      record('blur');
      // Chromium may update activeElement after dispatching blur. Capture runs
      // before the controller's listener, so this samples the completed transfer
      // in the next task before its queued recovery. It never changes focus.
      setTimeout(() => record('takeover'), 0);
    }, true);
  });
  await entry.click();
  const close = page.locator('#vw-toolbar [data-close]');
  await close.focus();
  await page.locator('.vw-frame.is-ready').waitFor({ timeout: 90000 });
  await page.locator('#vw-toolbar [data-go]').first().waitFor({ timeout: 90000 });
  console.log(JSON.stringify({ options: await page.locator('#vw-toolbar [data-go]').evaluateAll(es => es.map(e => e.dataset.go)) }));
  // B4 is the original #314 B repost document. Its real paint() calls
  // showModal() with an autofocus Cancel button during document loading.
  await page.route(url => url.pathname.endsWith('/variants/viewer.html') && url.searchParams.get('state') === 'repost', async route => {
    await new Promise(resolve => setTimeout(resolve, 1200));
    await route.fallback();
  });
  const engine = page.frameLocator('.vw-frame');
  const nested = engine.frameLocator('#present-frame');
  await page.locator('#vw-toolbar [data-go="B4"]').press('Enter');
  await close.focus();
  await nested.locator('#p314-dialog[open]').waitFor({ timeout: 90000 });
  await page.waitForTimeout(300);
  evidence.loading314 = await page.evaluate(() => ({ selectedClose: document.activeElement?.hasAttribute('data-close'), events: window.focusEvents }));
  evidence.loading314.flow = 'actual B4 repost document load';
  assert.equal(evidence.loading314.selectedClose, !control, '#314 native loading autofocus must steal in the control and restore Close when guarded');
  console.log(JSON.stringify({ label, loading314: evidence.loading314.selectedClose }));
  const previewBody = page.frameLocator('.decision-variant-page:not([hidden])').first().locator('body[data-focus385-ready="true"]');
  await previewBody.waitFor({ timeout: 90000 });
  evidence.livePreview = await previewBody.evaluate(body => ({ url: location.href, title: document.title, textLength: body.innerText.length }));
  assert.ok(evidence.livePreview.textLength > 0, 'live preview must render');
  const attack = async method => {
    // The live map can repaint its cards while the viewer stays mounted. Resolve
    // the current preview, not an OOPIF handle from an earlier board render.
    return previewBody.evaluate((_body, method) => {
    for (const old of document.querySelectorAll('[data-focus-385]')) old.remove();
    const marker = node => { node.setAttribute('data-focus-385', ''); document.body.append(node); return node; };
    if (method === 'svg') {
      const svg = marker(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
      const a = document.createElementNS(svg.namespaceURI, 'a'); a.setAttribute('tabindex', '0'); svg.append(a); a.focus();
    } else if (method === 'dialog' || method === 'autofocus') {
      const dialog = marker(document.createElement('dialog'));
      dialog.innerHTML = method === 'autofocus' ? '<input autofocus>' : '<button>Dialog target</button>';
      dialog.showModal();
    } else {
      const frame = document.createElement('iframe');
      const script = method === 'nested-svg' ? "document.querySelector('a').focus()" : method === 'window' ? 'window.focus()' : method === 'native-load' ? "document.querySelector('dialog').showModal()" : "document.querySelector('input').focus()";
      // Await the child document instead of assuming it parsed within 150 ms.
      return new Promise(resolve => {
        frame.addEventListener('load', () => resolve(), { once: true });
        frame.srcdoc = '<input><svg><a tabindex="0">SVG</a></svg><dialog><input autofocus></dialog><script>' + script + '<' + '/script>';
        marker(frame);
      });
    }
    }, method);
  };
  const methods = ['svg', 'dialog', 'autofocus', 'nested', 'nested-svg', 'native-load', 'window'];
  for (const size of ['full', 'pane', 'float']) {
    await page.locator(`#vw-toolbar [data-size="${size}"]`).click();
    await page.locator('[data-fb-tool="note"]').click();
    const field = page.locator('[data-fb-note]').filter({ visible: true }).first();
    await field.waitFor();
    const started = Date.now();
    const observations = [];
    do {
      for (const method of methods) {
        await field.fill('abcdef');
        await field.evaluate(node => node.setSelectionRange(2, 4, 'backward'));
        const before = await page.evaluate(() => window.focusEvents.length);
        await attack(method);
        if (control) {
          await page.waitForFunction(() => document.activeElement?.matches('.decision-variant-page'), { timeout: 3000 });
          observations.push({ method, stole: true });
        } else {
          await page.waitForTimeout(150);
          assert.equal(await field.evaluate(node => document.activeElement === node), true, `${size}/${method}: exact control`);
          assert.deepEqual(await field.evaluate(node => [node.selectionStart, node.selectionEnd, node.selectionDirection]), [2, 4, 'backward']);
          await page.keyboard.type('Z');
          assert.equal(await field.inputValue(), 'abZef', `${size}/${method}: continued typing at selection`);
          const events = await page.evaluate(before => window.focusEvents.slice(before), before);
          assert.ok(events.some(event => (event.type === 'blur' || event.type === 'takeover') && event.background), `${size}/${method}: background takeover observed before restoration`);
          observations.push({ method, restored: true, takeoverObserved: true, events });
        }
        await page.waitForTimeout(200);
      }
    } while (Date.now() - started < duration);
    evidence.probes.push({ size, elapsedMs: Date.now() - started, observations });
    console.log(JSON.stringify({ label, size, elapsedMs: Date.now() - started, attempts: observations.length }));
    await page.screenshot({ path: `${artifacts}/${label}-${size}.png` });
    if (!control) {
      if (size !== 'full') {
        const mapControl = page.locator('#app button').filter({ visible: true }).first();
        await mapControl.focus();
        await attack('native-load');
        await page.waitForTimeout(150);
        assert.equal(await mapControl.evaluate(node => document.activeElement === node), true, 'deliberate map focus');
        await page.locator('[data-fb-tab="canvas"]').click();
      }
      // Actual #314 click, native modal autofocus, Tab and Escape. No simulated
      // dialog markup is used for the interaction acceptance check.
      console.log(`${label}/${size}: enter actual dialog`);
      if (await nested.locator('#p314-dialog[open]').count()) await nested.locator('[data-act="dlg-cancel"]').click();
      console.log(`${label}/${size}: open dialog again`);
      await nested.locator('[data-act="post"]').click();
      await nested.locator('#p314-dialog[open]').waitFor();
      await page.waitForTimeout(entryDelay + 150);
      console.log(JSON.stringify({ size, nestedFocus: await nested.locator('body').evaluate(() => ({ active: document.activeElement?.outerHTML.slice(0, 220), focused: document.hasFocus() })), hostFocus: await page.evaluate(() => ({ active: document.activeElement?.outerHTML.slice(0, 140), focused: document.hasFocus(), messages: window.focusMessages.slice(-12), events: window.focusEvents.slice(-8) })) }));
      assert.equal(await nested.locator('[data-act="dlg-cancel"]').evaluate(node => document.activeElement === node), true, `${size}: native dialog autofocus after click`);
      assert.equal(await page.locator('.vw-frame').evaluate(node => document.activeElement === node), true, `${size}: deliberate pointer entry`);
      await page.keyboard.press('Tab');
      assert.equal(await nested.locator('[data-act="dlg-post"]').evaluate(node => document.activeElement === node), true, `${size}: dialog Tab`);
      await page.keyboard.press('Escape');
      console.log(`${label}/${size}: dialog Escape`);
      await nested.locator('#p314-dialog[open]').waitFor({ state: 'hidden' });
      console.log(`${label}/${size}: restore canvas owner`);
      await attack('svg');
      await page.waitForTimeout(150);
      assert.equal(await page.locator('.vw-frame').evaluate(node => document.activeElement === node), true, `${size}: restore interactive canvas after tile theft`);
      await page.locator('#vw-toolbar button').filter({ visible: true }).last().focus();
      await page.keyboard.press('Tab');
      await page.waitForTimeout(150);
      assert.equal(await page.locator('.vw-frame').evaluate(node => document.activeElement === node), true, `${size}: deliberate keyboard entry`);
      if (size === 'full') {
        await page.locator('#vw-toolbar .cf-toggle').click();
        await page.locator('#vw-toolbar [data-close]').focus();
        await page.keyboard.press('Shift+Tab');
        await page.waitForTimeout(150);
        assert.equal(await page.locator('.vw-frame').evaluate(node => document.activeElement === node), true, 'full: existing Shift+Tab wrap into canvas');
        await page.locator('#vw-toolbar .cf-toggle').click();
      }
      evidence.probes.at(-1).interaction = { actual314Dialog: true, pointerEntry: true, tab: true, escape: true, keyboardEntry: true, mapFocus: size !== 'full' };
    }
  }
  if (!control) {
    await page.locator('#vw-toolbar [data-close]').click();
    const tile = page.locator('a.decision-variant:has(iframe.decision-variant-page:not([hidden]))').filter({ visible: true }).first();
    await tile.scrollIntoViewIfNeeded();
    const url = await tile.getAttribute('data-canvas-url');
    const pages = page.context().pages().length;
    await tile.click();
    await page.locator('.vw-frame.is-ready').waitFor({ timeout: 90000 });
    assert.equal(await page.locator('.vw-frame').getAttribute('src'), url, 'live decision preview opens its canvas inside the app');
    assert.equal(page.context().pages().length, pages, 'preview click stays in the application');
    evidence.livePreview.clickThrough = { canvas: url, insideApplication: true };
  }
  await writeFile(`${artifacts}/${label}.json`, JSON.stringify(evidence, null, 2));
  await writeFile(`${artifacts}/${label}-${evidence.startedAt}.json`, JSON.stringify(evidence, null, 2));
} catch (error) {
  console.log('matrix failure:', String(error));
  evidence.error = String(error);
  evidence.failureFocus = await page.evaluate(() => ({ events: window.focusEvents?.slice(-20), messages: window.focusMessages?.slice(-10), active: document.activeElement?.outerHTML.slice(0, 250) })).catch(() => null);
  evidence.frames = await Promise.race([Promise.all(page.frames().slice(0, 8).map(async f => ({ url: f.url(), diagnostics: await f.evaluate(() => ({ canvas: !!window.CANVAS, text: document.body?.innerText.slice(0, 400), styles: document.styleSheets.length })).catch(() => null) }))), new Promise(resolve => setTimeout(() => resolve('diagnostic timeout'), 5000))]);
  await writeFile(`${artifacts}/${label}-failure.json`, JSON.stringify(evidence, null, 2));
  await writeFile(`${artifacts}/${label}-failure-${evidence.startedAt}.json`, JSON.stringify(evidence, null, 2));
  await page.screenshot({ path: `${artifacts}/${label}-failure.png`, timeout: 5000 }).catch(() => undefined);
  throw error;
} finally {
  await app?.close();
  await browser?.close();
}
