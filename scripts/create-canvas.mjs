#!/usr/bin/env node
import { accessSync, cpSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Each board owns its content and tools, but loads the shared runtime.
const BOARD_FILES = ['README.md', 'tools'];
const SHARED_FILES = ['index.html', 'canvas.js', 'canvas.css', 'kit/kit.js'];

try {
  const [taskId, flag, rawTicket, ...extra] = process.argv.slice(2);
  if (!taskId || taskId.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(taskId) || taskId === 'canvas') {
    throw new Error('Use a distinct task ID, such as onboarding-flow. The legacy canvas is reserved.');
  }
  if (extra.length > 0 || (flag !== undefined && (flag !== '--ticket' || !/^[1-9]\d*$/.test(rawTicket ?? ''))) || (flag === undefined && rawTicket !== undefined)) {
    throw new Error('Usage: bun run canvas:create <task-id> [--ticket <number>]');
  }
  const ticket = rawTicket === undefined ? null : Number(rawTicket);
  if (ticket !== null && !Number.isSafeInteger(ticket)) throw new Error('Ticket must be a positive safe integer.');
  const root = realpathSync(process.cwd());
  const prototypes = join(root, 'prototypes');
  if (realpathSync(prototypes) !== prototypes) throw new Error('The prototypes directory must be inside this checkout, without symlinks.');
  const target = resolve(prototypes, taskId);
  for (const name of [...BOARD_FILES, ...SHARED_FILES]) accessSync(join(prototypes, 'canvas', name));
  // Non-recursive mkdir refuses every existing directory, file, or symlink before writing.
  mkdirSync(target);
  for (const name of BOARD_FILES) cpSync(join(prototypes, 'canvas', name), join(target, name), { recursive: true });
  const index = readFileSync(join(prototypes, 'canvas', 'index.html'), 'utf8')
    .replace('href="canvas.css"', 'href="../canvas/canvas.css"')
    .replace('src="canvas.js"', 'src="../canvas/canvas.js"');
  writeFileSync(join(target, 'index.html'), index);
  const readme = readFileSync(join(target, 'README.md'), 'utf8').replaceAll('../kit/kit.js', '../../canvas/kit/kit.js');
  writeFileSync(join(target, 'README.md'), readme);
  mkdirSync(join(target, 'variants'));
  mkdirSync(join(target, 'assets'));
  const title = taskId.replace(/-/g, ' ');
  writeFileSync(join(target, 'config.js'), `window.CANVAS = {
  title: '${title}',
  question: 'What should ${title} look like?',
${ticket === null ? '' : `  ticket: ${String(ticket)},\n`}  sections: [{
    title: 'Design options',
    items: [{
      id: 'review',
      kind: 'note',
      name: 'Design review',
      text: 'Not checked. Add options for this task, then record source, visual, and accessibility checks here.',
    }],
  }],
};
`);
  const dir = `prototypes/${taskId}`;
  console.log(`Created ${dir}/index.html. Existing canvases were preserved.`);
  console.log(`Edit ${dir}/config.js and add options in ${dir}/variants/.`);
  console.log(`Check: node ${dir}/tools/check.mjs`);
  console.log(`Preview: node ${dir}/tools/serve.mjs [unused-port]`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
