import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
/*
  The version and the auto-update switch are stamped in at build time: a packaged app has
  no package.json to read, and updates only ever run against a stable release.
*/
const define = {
  __WAYFINDER_VERSION__: JSON.stringify(packageJson.version),
  __WAYFINDER_AUTO_UPDATE__: JSON.stringify(process.env.WAYFINDER_STABLE_RELEASE === '1'),
};

await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, 'ui'), { recursive: true });

await esbuild.build({
  entryPoints: [join(root, 'src', 'cli.ts')],
  outfile: join(dist, 'cli.js'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  define,
  logLevel: 'info',
});

await esbuild.build({
  entryPoints: [join(root, 'src', 'desktop', 'main.ts')],
  // CommonJS, because electron-updater's dependency graph is not loadable as ESM.
  outfile: join(dist, 'desktop.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['electron'],
  define,
  logLevel: 'info',
});

await esbuild.build({
  entryPoints: [join(root, 'src', 'ui', 'app.ts')],
  outfile: join(dist, 'ui', 'app.js'),
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  format: 'esm',
  logLevel: 'info',
});

await esbuild.build({
  entryPoints: [join(root, 'src', 'ui', 'home.ts')],
  outfile: join(dist, 'ui', 'home.js'),
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  format: 'esm',
  logLevel: 'info',
});

await esbuild.build({
  entryPoints: [join(root, 'src', 'ui', 'theme.ts')],
  outfile: join(dist, 'ui', 'theme.js'),
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  format: 'iife',
  logLevel: 'info',
});

await esbuild.build({
  entryPoints: [join(root, 'src', 'ui', 'settingsPage.ts')],
  outfile: join(dist, 'ui', 'settingsPage.js'),
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  format: 'esm',
  logLevel: 'info',
});

for (const file of ['index.html', 'styles.css', 'home.html', 'settings.html']) {
  await cp(join(root, 'src', 'ui', file), join(dist, 'ui', file));
}

const canvasApp = await esbuild.build({
  entryPoints: [join(root, 'src', 'ui', 'inlineCanvasEntry.ts')],
  bundle: true, platform: 'browser', target: 'es2022', format: 'iife', write: false, minify: true,
});
const canvasStyle = await readFile(join(root, 'src', 'ui', 'styles.css'), 'utf8');
const embeddedStyle = `html,body{margin:0;height:auto;overflow:visible}body{background:transparent}#canvas-viewer{position:relative;inset:auto;width:100%;height:800px;max-height:none;border:0;box-shadow:none;transform:none}#canvas-viewer .vw-sizes [data-size="float"],#canvas-viewer .vw-close,#canvas-viewer .cf-shortcuts{display:none}#canvas-viewer .vw-stage{min-height:0}`;
const compactCanvasStyle = (await esbuild.transform(canvasStyle + embeddedStyle, { loader: 'css', minify: true })).code;
await writeFile(join(dist, 'canvas-app.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wayfinder canvas</title><style>${compactCanvasStyle.replace(/<\/style/gi, '<\\/style')}</style></head><body class="viz-root"><p role="status">Loading the canvas…</p><script>${canvasApp.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script></body></html>`);
// The app logo: the sidebar's brand mark and every page's favicon.
await cp(join(root, 'assets', 'wayfinder-icon.svg'), join(dist, 'ui', 'wayfinder-icon.svg'));

process.stdout.write('built dist/\n');
