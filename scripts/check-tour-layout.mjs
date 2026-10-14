#!/usr/bin/env node
/*
  Rendered check for the product tour (#296): in a real Chromium, the Spotlight card never
  covers the target it points at, at desktop and narrow widths, through every step and
  every state a step goes through. Demo controls are pressed with real pointer clicks, so
  a control the card covers fails the run too.

  Uses installed Google Chrome (or CHROME_PATH). Run with `bun run test:tour-layout`; set
  TOUR_LAYOUT_SHOTS to a folder to keep a screenshot of every checked state.
*/
/* global document, getComputedStyle, window -- page.evaluate runs these callbacks in the browser. */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = process.env.TOUR_LAYOUT_SHOTS;

export const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 900, height: 600 },
  { width: 761, height: 700 },
  { width: 760, height: 700 },
  { width: 600, height: 800 },
  { width: 390, height: 844 },
  { width: 360, height: 640 },
];

/** Whether two rectangles share any area. */
export function overlaps(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

async function pageHtml() {
  const entry = `
    import { mountTour } from './src/ui/tour.ts';
    let tick = null;
    const scheduler = { every(_ms, fn) { tick = fn; return () => { if (tick === fn) tick = null; }; } };
    window.tour = mountTour({ toast() {}, app: document.getElementById('app'), scheduler, storage: null, navigate() {} });
    window.runScript = () => { for (let i = 0; i < 20 && tick !== null; i += 1) tick(); };
  `;
  const bundle = await esbuild.build({
    stdin: { contents: entry, resolveDir: root, loader: 'ts', sourcefile: 'tour-layout-entry.ts' },
    bundle: true,
    write: false,
    platform: 'browser',
    target: 'es2022',
    format: 'iife',
  });
  const css = await readFile(join(root, 'src', 'ui', 'styles.css'), 'utf8');
  const js = bundle.outputFiles[0].text.replaceAll('</script', '<\\/script');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${css}</style></head>
    <body class="viz-root"><div id="app"></div><script>${js}</script></body></html>`;
}

/**
 * The card, the highlight, and the part of the step's target that can be seen (cut by scrolling
 * ancestors and the window), measured from the target itself rather than from the highlight.
 */
function measure(targetSelector) {
  const rect = (element) => {
    if (element === null) return null;
    const { left, top, right, bottom } = element.getBoundingClientRect();
    return { left, top, right, bottom };
  };
  const layer = document.getElementById('tour-layer');
  const pop = layer.querySelector('.tour-pop');
  const target = targetSelector === null ? null : layer.querySelector(`.tour-shell ${targetSelector}`);
  let seen = rect(target);
  for (let parent = target?.parentElement ?? null; seen !== null && parent !== null; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
    const clip = parent.getBoundingClientRect();
    seen = { left: Math.max(seen.left, clip.left), top: Math.max(seen.top, clip.top), right: Math.min(seen.right, clip.right), bottom: Math.min(seen.bottom, clip.bottom) };
  }
  if (seen !== null) seen = { left: Math.max(seen.left, 0), top: Math.max(seen.top, 0), right: Math.min(seen.right, window.innerWidth), bottom: Math.min(seen.bottom, window.innerHeight) };
  return {
    step: pop?.dataset.tourStep ?? 'none',
    // A card cut to fit must scroll its contents, not paint them past its edge onto the target.
    spills: pop !== null && pop.scrollHeight > pop.clientHeight && getComputedStyle(pop).overflowY === 'visible',
    pop: rect(pop),
    hole: rect(layer.querySelector('.tour-hole')),
    found: target !== null,
    seen,
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function assertClear(m, where, targetSelector) {
  assert.ok(m.pop !== null, `${where}: no card`);
  const inside = (r) => r.left >= 0 && r.top >= 0 && r.right <= m.width && r.bottom <= m.height;
  assert.ok(inside(m.pop), `${where}: card ${JSON.stringify(m.pop)} leaves the ${m.width}×${m.height} window`);
  assert.ok(!m.spills, `${where}: the card's contents spill past its ${JSON.stringify(m.pop)} box`);
  if (targetSelector === null) {
    assert.equal(m.hole, null, `${where}: a step with no target shows a highlight`);
    return;
  }
  assert.ok(m.found, `${where}: no ${targetSelector} in the demo`);
  assert.ok(m.hole !== null, `${where}: no highlight around ${targetSelector}`);
  const { seen, hole } = m;
  assert.ok(seen.right - seen.left >= 1 && seen.bottom - seen.top >= 1, `${where}: ${targetSelector} cannot be seen`);
  assert.ok(inside(hole), `${where}: highlight ${JSON.stringify(hole)} is not fully in the ${m.width}×${m.height} window`);
  // Whole pixels around a padded box: the highlight may round outwards by a pixel, never fall short.
  const covers = hole.left <= seen.left + 1 && hole.top <= seen.top + 1 && hole.right >= seen.right - 1 && hole.bottom >= seen.bottom - 1;
  assert.ok(covers, `${where}: highlight ${JSON.stringify(hole)} does not cover ${targetSelector} ${JSON.stringify(seen)}`);
  assert.ok(!overlaps(m.pop, seen) && !overlaps(m.pop, hole), `${where}: card ${JSON.stringify(m.pop)} covers ${targetSelector} ${JSON.stringify(seen)}`);
}

describe('the Spotlight card stays clear of its target', { timeout: 120_000 }, () => {
  let browser;
  let html;

  before(async () => {
    html = await pageHtml();
    const executablePath = process.env.CHROME_PATH;
    browser = await chromium.launch(executablePath === undefined ? { channel: 'chrome' } : { executablePath });
  });

  after(async () => { await browser?.close(); });

  for (const viewport of VIEWPORTS) {
    it(`at ${String(viewport.width)}×${String(viewport.height)}`, async () => {
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(3000);
      await page.setContent(html);
      await page.evaluate(() => { window.tour.start(); });
      /** Checks the card against the target this state should highlight, or none. */
      const check = async (state, target = null) => {
        const m = await page.evaluate(measure, target);
        const where = `${String(viewport.width)}x${String(viewport.height)} ${m.step} (${state})`;
        if (shots !== undefined) await page.screenshot({ path: join(shots, `${where.replaceAll(/[^\w-]+/g, '-')}.png`) });
        assertClear(m, where, target);
      };
      const press = (selector) => page.click(`#tour-layer ${selector}`);
      const next = () => press('[data-tour-act="next"]');

      await check('purpose');
      await next();
      await check('goal', '.demo-composer');
      await press('#demo-start');
      await check('planning, running', '#demo-plan');
      await page.evaluate(() => { window.runScript(); });
      await check('planning, done', '#demo-plan');
      await press('#demo-open-map');
      await check('map', '.demo-canvas-inner');
      await next();
      await check('types', '#demo-types');
      await next();
      await check('blockers', '[data-ticket="6"]');
      await press('[data-ticket="6"]');
      await check('blockers, #6 selected', '.demo-waiting');
      await next();
      await check('handoff', '[data-ticket="5"]');
      await press('[data-ticket="5"]');
      await check('handoff, #5 selected', '#demo-open');
      await press('#demo-open');
      await check('handoff, running', '#demo-handoff');
      await page.evaluate(() => { window.runScript(); });
      await check('handoff, done', '#demo-handoff');
      await next();
      assert.equal(await page.locator('#tour-layer .tour-done-icon').count(), 1, 'the tour did not reach its completion card');
      await check('completion');
      await page.close();
    });
  }
});
