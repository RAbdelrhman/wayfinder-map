import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
/*
  The version and the auto-update switch are stamped in at build time: a packaged app has
  no package.json to read, and updates only ever run against a signed release.
*/
const define = {
  __WAYFINDER_VERSION__: JSON.stringify(packageJson.version),
  __WAYFINDER_AUTO_UPDATE__: JSON.stringify(process.env.WAYFINDER_SIGNED_RELEASE === '1'),
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

for (const file of ['index.html', 'styles.css', 'home.html']) {
  await cp(join(root, 'src', 'ui', file), join(dist, 'ui', file));
}
// The app logo: the sidebar's brand mark and every page's favicon.
await cp(join(root, 'assets', 'wayfinder-icon.svg'), join(dist, 'ui', 'wayfinder-icon.svg'));

process.stdout.write('built dist/\n');
