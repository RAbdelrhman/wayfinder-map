#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { USAGE, resolveConfig } from './config.js';
import { currentRepo } from './github.js';
import { DEFAULT_TEMPLATE } from './prompt.js';
import { startServer } from './server.js';
import { detectT3, openExternal } from './t3.js';

async function main(): Promise<number> {
  const config = await resolveConfig(process.argv.slice(2));
  if (config === 'help') {
    process.stdout.write(USAGE);
    return 0;
  }

  let repo = config.repo;
  if (repo === null) {
    try {
      repo = await currentRepo(config.cwd);
    } catch {
      process.stderr.write(
        `Could not work out the repo from ${config.cwd}. Pass --repo owner/name, or run this inside a git checkout with gh set up.\n`,
      );
      return 1;
    }
  }

  const template =
    config.promptFile === null ? DEFAULT_TEMPLATE : await readFile(resolve(config.cwd, config.promptFile), 'utf8');

  const { url } = await startServer({ config, repo, template });
  const runtime = await detectT3();

  process.stdout.write(`wayfinder-map  ${repo}\n`);
  process.stdout.write(`  serving   ${url}\n`);
  process.stdout.write(
    `  T3 Code   ${runtime.hasDesktopApp ? 'desktop app' : runtime.origin !== null ? runtime.origin : 'not detected (clipboard still works)'}\n`,
  );

  if (config.open) await openExternal(url).catch(() => undefined);
  return 0;
}

const code = await main();
if (code !== 0) process.exit(code);
