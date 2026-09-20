import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, 'ui'), { recursive: true });

await esbuild.build({
  entryPoints: [join(root, 'src', 'cli.ts')],
  outfile: join(dist, 'cli.js'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
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

for (const file of ['index.html', 'styles.css']) {
  await cp(join(root, 'src', 'ui', file), join(dist, 'ui', file));
}

process.stdout.write('built dist/\n');
