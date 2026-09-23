#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The current board fixture's screenshot IDs paired with the live variant pages they represent. */
export const THUMBNAIL_SOURCES = [
  {
    id: '43-A',
    ref: 'origin/prototype/43-what-should-the-home-repository-and-prototypes-views-look-like',
    page: 'prototypes/canvas/variants/a.html?view=home&data=many',
  },
  {
    id: '43-B',
    ref: 'origin/prototype/43-what-should-the-home-repository-and-prototypes-views-look-like',
    page: 'prototypes/canvas/variants/b.html?view=home&data=many',
  },
  {
    id: '43-C',
    ref: 'origin/prototype/43-what-should-the-home-repository-and-prototypes-views-look-like',
    page: 'prototypes/canvas/variants/c.html?view=home&data=many',
  },
  {
    id: '45-A',
    ref: 'origin/prototype/45-what-does-the-user-see-after-handing-off-to-t3-code',
    page: 'prototypes/canvas/variants/after-a.html?state=working',
  },
  {
    id: '45-B',
    ref: 'origin/prototype/45-what-does-the-user-see-after-handing-off-to-t3-code',
    page: 'prototypes/canvas/variants/after-b.html?state=input',
  },
  {
    id: '45-C',
    ref: 'origin/prototype/45-what-does-the-user-see-after-handing-off-to-t3-code',
    page: 'prototypes/canvas/variants/after-c.html?state=done',
  },
  {
    id: '45-AB',
    ref: 'origin/prototype/45-what-does-the-user-see-after-handing-off-to-t3-code',
    page: 'prototypes/canvas/variants/after-ab.html?state=input',
  },
  {
    id: '44-A',
    ref: 'origin/prototype/44-what-should-starting-a-new-map-feel-like',
    page: 'prototypes/canvas/variants/new-map-a.html',
  },
  {
    id: '44-B',
    ref: 'origin/prototype/44-what-should-starting-a-new-map-feel-like',
    page: 'prototypes/canvas/variants/new-map-b.html',
  },
  {
    id: '44-C',
    ref: 'origin/prototype/44-what-should-starting-a-new-map-feel-like',
    page: 'prototypes/canvas/variants/new-map-c.html',
  },
  {
    id: '42-A',
    ref: 'origin/prototype/42-how-should-navigation-show-where-you-are-and-where-you-can-go',
    page: 'prototypes/canvas/variants/nav-a.html?view=home',
  },
  {
    id: '42-B',
    ref: 'origin/prototype/42-how-should-navigation-show-where-you-are-and-where-you-can-go',
    page: 'prototypes/canvas/variants/nav-b.html?view=repo',
  },
  {
    id: '42-C',
    ref: 'origin/prototype/42-how-should-navigation-show-where-you-are-and-where-you-can-go',
    page: 'prototypes/canvas/variants/nav-c.html?view=home',
  },
  {
    id: '42-D',
    ref: 'origin/prototype/42-how-should-navigation-show-where-you-are-and-where-you-can-go',
    page: 'prototypes/canvas/variants/nav-d.html?view=map&mapview=prototypes&side=open',
  },
  {
    id: '39-board',
    ref: 'origin/prototype/39-what-should-the-prototype-canvas-look-like-modelled-on-claude-de',
    page: 'prototypes/canvas/index.html',
  },
  {
    id: '17',
    ref: 'origin/prototype/17-prototype-desktop-launch-and-first-run-states',
    page: 'prototype-snapshot.html',
  },
  {
    id: '8',
    ref: 'origin/prototype/8-what-does-the-home-page-look-like-and-how-does-it-lead-into-the',
    page: 'prototype-snapshot.html',
  },
];

export const VIEWPORT = { width: 1280, height: 720 };

const CANVAS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(CANVAS_DIR, '../..');
const OUTPUT_DIR = join(CANVAS_DIR, 'assets', 'protos');

function runCommand(command, args) {
  const result = spawnSync(command, args, { cwd: REPO_ROOT, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args[0]} failed with exit code ${result.status}`);
}

async function archiveSourceBranch(ref, archiveDir) {
  await mkdir(archiveDir, { recursive: true });
  const archivePath = join(archiveDir, 'source.tar');
  const check = spawnSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd: REPO_ROOT, stdio: 'ignore' });
  if (check.error) throw check.error;
  if (check.status !== 0) throw new Error(`Missing ${ref}. Fetch source branches with: git fetch origin`);

  runCommand('git', ['archive', '--format=tar', '--output', archivePath, ref]);
  runCommand('tar', ['-xf', archivePath, '-C', archiveDir]);
}

function runScreenshot(url, output) {
  const args = [
    '--yes',
    'playwright',
    'screenshot',
    '--browser',
    'chromium',
    '--color-scheme',
    'light',
    '--viewport-size',
    `${VIEWPORT.width},${VIEWPORT.height}`,
    '--wait-for-timeout',
    '500',
    url,
    output,
  ];
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const windowsCommand = [command, ...args.map((arg) => `"${arg.replaceAll('"', '""')}"`)].join(' ');
  const result = spawnSync(process.platform === 'win32' ? windowsCommand : command, process.platform === 'win32' ? [] : args, {
    cwd: REPO_ROOT,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Playwright could not capture ${url}. Install Chromium with: npx playwright install chromium`);
  }
}

export async function captureThumbnails() {
  const tempDir = await mkdtemp(join(tmpdir(), 'wayfinder-prototype-thumbnails-'));
  try {
    const sourceRoots = new Map();
    for (const { ref } of THUMBNAIL_SOURCES) {
      if (sourceRoots.has(ref)) continue;
      const sourceRoot = join(tempDir, `source-${sourceRoots.size + 1}`);
      await archiveSourceBranch(ref, sourceRoot);
      sourceRoots.set(ref, sourceRoot);
    }

    for (const { id, ref, page } of THUMBNAIL_SOURCES) {
      const sourceRoot = sourceRoots.get(ref);
      const [sourcePath] = page.split('?');
      const sourceFile = join(sourceRoot, sourcePath);
      const sourceInfo = await stat(sourceFile).catch(() => null);
      if (!sourceInfo?.isFile()) throw new Error(`Missing screenshot source page ${sourcePath} in ${ref}`);

      const sourceUrl = new URL(page, pathToFileURL(join(sourceRoot, 'index.html')));
      const tempOutput = join(tempDir, `${id}.jpg`);
      runScreenshot(sourceUrl.href, tempOutput);
      const result = await stat(tempOutput);
      if (result.size === 0) throw new Error(`Playwright produced an empty thumbnail for ${id}`);
    }

    await mkdir(OUTPUT_DIR, { recursive: true });
    for (const { id } of THUMBNAIL_SOURCES) {
      await copyFile(join(tempDir, `${id}.jpg`), join(OUTPUT_DIR, `${id}.jpg`));
      console.log(`Captured ${id} -> prototypes/canvas/assets/protos/${id}.jpg`);
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await captureThumbnails();
}
