#!/usr/bin/env node
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { USAGE, resolveConfig } from './config.js';
import { WayfinderStartupError, startWayfinder } from './runtime.js';
import { openExternal } from './t3.js';
import { WAYFINDER_VERSION } from './version.js';

async function main(): Promise<number> {
  const config = await resolveConfig(process.argv.slice(2));
  if (config === 'help') {
    process.stdout.write(USAGE);
    return 0;
  }

  let runtime;
  try {
    runtime = await startWayfinder(config, {}, { uiDir: join(dirname(fileURLToPath(import.meta.url)), 'ui') });
  } catch (error) {
    if (!(error instanceof WayfinderStartupError)) throw error;
    process.stderr.write(`${error.message}\n`);
    return 1;
  }

  // The T3 Code session token is revoked on the way out rather than left to expire.
  process.once('exit', () => void runtime.close());
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.once(signal, () => {
      void runtime.close().then(
        () => process.exit(0),
        (closeError: unknown) => {
          process.stderr.write(`Could not stop Wayfinder cleanly: ${(closeError as Error).message}\n`);
          process.exit(1);
        },
      );
    });
  }

  process.stdout.write(`wayfinder-map  ${runtime.repo ?? 'Home'}\n`);
  process.stdout.write(`  serving   ${runtime.url}\n`);
  process.stdout.write(
    `  T3 Code   ${runtime.t3Origin ?? 'not detected (clipboard still works)'}\n`,
  );
  process.stdout.write(
    `  threads   ${runtime.workspaceRoot ?? 'in a verified clone, found per repository or chosen in the app'}\n`,
  );

  if (config.open) await openExternal(runtime.url).catch(() => undefined);
  return 0;
}

const code = await main();
if (code !== 0) process.exit(code);
