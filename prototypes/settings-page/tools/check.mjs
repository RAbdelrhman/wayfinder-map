import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCanvas, loadConfig } from '../../canvas/tools/check.mjs';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = checkCanvas(loadConfig(readFileSync(join(dir, 'config.js'), 'utf8')), {
  exists: (path) => existsSync(join(dir, path)),
  read: (path) => readFileSync(join(dir, path), 'utf8'),
});
for (const warning of result.warnings) console.log(`warn  ${warning}`);
for (const error of result.errors) console.log(`error ${error}`);
console.log(result.errors.length === 0 ? 'Canvas config OK.' : `${result.errors.length} error(s).`);
process.exitCode = result.errors.length === 0 ? 0 : 1;
