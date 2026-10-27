#!/usr/bin/env node
/*
  Captures assets/shots/*.jpg: one picture of each exact canvas item the #347 boards draw.
  Branch sources are read with `git archive` from origin/prototype/<ticket>-… (run `git fetch origin` first);
  `local` sources are this canvas's own variant pages. Run from the repo root:
    node prototypes/347-prototype-how-the-prototypes-board-shows-the-chosen-canvas-it/tools/capture-shots.mjs [id-prefix]
  Round 1's 163-*, 224-* and 225-* captures (except 225-*-dark-inbox and 163-M-running) were taken earlier and are not listed here.
*/
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const CANVAS = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(CANVAS, '../..');
const PHONE = { width: 390, height: 844 };
const WIDE = { width: 1280, height: 800 };
const DESKTOP = { width: 1440, height: 900 };

const B316 = { ref: 'origin/prototype/316-prototype-the-account-control-who-is-signed-in-and-sign-out', dir: 'prototypes/316-prototype-the-account-control-who-is-signed-in-and-sign-out' };
const B314 = { ref: 'origin/prototype/314-prototype-an-in-viewer-confirmation-after-posting-canvas-feedbac', dir: 'prototypes/314-prototype-an-in-viewer-confirmation-after-posting-canvas-feedbac' };
const B223 = { ref: 'origin/prototype/223-prototype-the-following-screens-sign-in-repos-map-view-ticket-de', dir: 'prototypes/canvas' };
const B225 = { ref: 'origin/prototype/225-prototype-mobile-notifications-inbox-alert-types-settings', dir: 'prototypes/225-prototype-mobile-notifications-inbox-alert-types-settings' };
const B163 = { ref: 'origin/prototype/163-where-do-start-next-auto-and-the-auto-map-toggle-go-on-the-map', dir: 'prototypes/canvas' };
const B44 = { ref: 'origin/prototype/44-what-should-starting-a-new-map-feel-like', dir: 'prototypes/canvas' };

const m316 = (q) => `variants/mobile.html?v=C&remix=filter&screen=${q}`;
export const SHOTS = [
  ...[
    ['A', 'repos&acct=A&open=menu'], ['B-confirm', 'repos&acct=B&open=confirm'], ['C', 'account&acct=C'], ['D', 'settings&acct=D'],
    ['E', 'settings&acct=E'], ['F', 'settings&acct=F'],
    ['G-a', 'settings&acct=G&names=a'], ['G-b', 'settings&acct=G&names=b'], ['G-c', 'settings&acct=G&names=c'], ['G-confirm', 'settings&acct=G&names=a&open=confirm'],
  ].map(([id, q]) => ({ id: `316-${id}`, ...B316, src: m316(q), size: PHONE })),
  ...[['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'B2'], ['E', 'B3']].map(([id, dir]) => ({ id: `314-${id}`, ...B314, src: `variants/viewer.html?dir=${dir}&state=posted`, size: WIDE })),
  ...['A', 'B', 'C'].flatMap((v) => [['S', 'signin'], ['R', 'repos'], ['M', 'map'], ['T', 'ticket']].map(([q, screen]) => ({ id: `223-${q}-${v}`, ...B223, src: `variants/mobile.html?v=${v}&screen=${screen}`, size: PHONE }))),
  ...['A', 'B', 'C'].map((v) => ({ id: `225-${v}-dark-inbox`, ...B225, src: `variants/mobile.html?theme=dark&v=C&remix=filter&acct=G&names=a&nt=${v}&screen=inbox`, size: PHONE })),
  { id: '163-M-running', ...B163, src: 'variants/start-menu.html?phase=running', size: DESKTOP },
  { id: '223-R-C2', ...B223, src: 'variants/mobile.html?v=C&screen=repos&remix=filter', size: PHONE },
  ...[['C', 'variants/new-map-c.html'], ['R', 'variants/new-map-c.html?repo=RAbdelrhman/wayfinder-map'], ['P', 'variants/new-map-planning.html'], ['A', 'variants/new-map-a.html'], ['B', 'variants/new-map-b.html']]
    .map(([id, src]) => ({ id: `44-${id}`, ...B44, src, size: DESKTOP })),
  ...['A', 'B', 'C', 'D'].map((o) => ({ id: `347-${o}`, local: true, src: `variants/board.html?o=${o}`, size: { width: 1280, height: 1000 } })),
  ...['A', 'B', 'C', 'D'].map((o) => ({ id: `347-${o}2`, local: true, src: `variants/board2.html?o=${o}`, size: { width: 1280, height: 1000 } })),
];

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`git ${args[0]} failed`);
}

async function main() {
  const prefix = process.argv[2] || '';
  const shots = SHOTS.filter((s) => s.id.startsWith(prefix));
  const temp = await mkdtemp(join(tmpdir(), 'wf347-'));
  const trees = new Map();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const shot of shots) {
      let base = CANVAS;
      if (!shot.local) {
        if (!trees.has(shot.ref)) {
          const out = join(temp, String(trees.size));
          await mkdir(out, { recursive: true });
          git(['archive', '--format=tar', '--output', join(out, 's.tar'), shot.ref], ROOT);
          const t = spawnSync('tar', ['-xf', 's.tar'], { cwd: out, stdio: 'inherit' });
          if (t.status !== 0) throw new Error('tar failed');
          trees.set(shot.ref, out);
        }
        base = join(trees.get(shot.ref), shot.dir);
      }
      const [path, query] = shot.src.split('?');
      const url = `${pathToFileURL(join(base, path)).href}${query ? `?${query}` : ''}`;
      const page = await browser.newPage({ viewport: shot.size, colorScheme: 'light', reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(url, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      if (errors.length) throw new Error(`${shot.id}: ${errors.join('; ')}`);
      const png = await page.screenshot();
      await sharp(png).jpeg({ quality: 78 }).toFile(join(CANVAS, 'assets', 'shots', `${shot.id}.jpg`));
      await page.close();
      console.log(`captured ${shot.id}`);
    }
  } finally {
    await browser.close();
    await rm(temp, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
