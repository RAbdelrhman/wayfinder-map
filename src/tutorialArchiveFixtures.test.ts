import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const readOnlyApi = require('../docs/verification/244/read-only-api.cjs') as { requireReadOnlyApi(args: string[]): void };

const directory = path.resolve('docs/verification/244');

async function fixture(kind: string) {
  const writes: Array<Record<string, unknown[]>> = [];
  const context = vm.createContext({
    Buffer, console, __dirname: directory,
    readOnlyApi, writeFile: async (_file: string, value: string) => { writes.push(JSON.parse(value)); },
    require(name: string) {
      if (name === './read-only-api.cjs') return readOnlyApi;
      if (name === 'electron') return { app: { setPath() {}, setAppPath() {} } };
      if (name === 'node:fs') return { mkdirSync() {}, writeFileSync(_file: string, value: string) { writes.push(JSON.parse(value)); } };
      if (name === 'node:os') return {};
      if (name === 'node:child_process') return {};
      if (name === 'node:module') return { syncBuiltinESMExports() {} };
      if (path.isAbsolute(name)) return {}; // Never load the application in these boundary tests.
      return require(name);
    },
  });
  let source = await readFile(path.join(directory, `${kind}-fixture.${kind === 'desktop' ? 'cjs' : 'mjs'}`), 'utf8');
  if (kind === 'browser') {
    source = source.slice(source.indexOf("let login = 'alice'"), source.indexOf('await build('));
  }
  vm.runInContext(source, context);
  return { call: (args: string[]) => vm.runInContext(`fake('gh', ${JSON.stringify(args)})`, context) as Promise<{ stdout: Buffer }>, writes };
}

describe.each(['browser', 'desktop'])('%s fixture boundaries', kind => {
  it.each([
    ['-X', 'POST'], ['--method', 'PATCH'], ['--method=PUT'], ['-XDELETE'],
    ['-f', 'body=x'], ['-F', 'body=x'], ['--input', 'body.json'],
    ['-X', 'GET', '-XPOST'], ['--method=GET', '--method', 'DELETE'],
  ])('rejects a write to a recognized route: %j', async (...flags: string[]) => {
    const boundary = await fixture(kind);
    await expect(boundary.call(['api', ...flags, '--include', 'repos/fixture/tutorial/issues/11'])).rejects.toThrow('Blocked fixture API write method');
    const log = boundary.writes.at(-1)!;
    expect(log[kind === 'browser' ? 'forbidden' : 'rejected']).toHaveLength(1);
  });

  it('accepts explicit GET with fields on a recognized route', async () => {
    const boundary = await fixture(kind);
    const result = await boundary.call(['api', '-X', 'GET', '-F', 'page=1', 'repos/fixture/tutorial/issues/11']);
    expect(JSON.parse(result.stdout.toString()).number).toBe(11);
  });

  it.each([['-H', 'Accept: application/json'], ['--include']])('rejects unknown header-bearing routes: %j', async (...flags: string[]) => {
    const boundary = await fixture(kind);
    await expect(boundary.call(['api', ...flags, 'repos/fixture/tutorial/unknown'])).rejects.toThrow('Blocked fixture call');
    expect(boundary.writes.at(-1)![kind === 'browser' ? 'forbidden' : 'rejected']).toHaveLength(1);
  });
});

it('closes Electron when firstWindow rejects after launch', async () => {
  let closed = false;
  const fakeProcess = { env: {}, exitCode: 0 };
  const source = (await readFile(path.join(directory, 'desktop.mjs'), 'utf8')).replace(/^import .*;\r?\n/gm, '');
  await vm.runInNewContext(`(async () => { ${source} })()`, {
    electron: { launch: async () => ({ firstWindow: async () => { throw new Error('Window startup failed'); }, close: async () => { closed = true; } }) },
    process: fakeProcess, console: { error() {}, log() {} },
  });
  expect(closed).toBe(true);
  expect(fakeProcess.exitCode).toBe(1);
});
