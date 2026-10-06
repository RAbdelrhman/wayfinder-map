import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const script = resolve('scripts/create-canvas.mjs');
const temporary: string[] = [];

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'wayfinder-canvases-'));
  temporary.push(root);
  await cp(resolve('prototypes/canvas'), join(root, 'prototypes/canvas'), { recursive: true });
  return root;
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('canvas:create', () => {
  it('creates separate boards without copying or changing legacy content', async () => {
    const root = await fixture();
    const legacy = join(root, 'prototypes/canvas/config.js');
    const before = await readFile(legacy, 'utf8');
    await run(process.execPath, [script, 'onboarding-flow'], { cwd: root });
    await run(process.execPath, [script, '42-home-page', '--ticket', '42'], { cwd: root });
    const first = join(root, 'prototypes/onboarding-flow');
    const second = join(root, 'prototypes/42-home-page');
    const firstConfig = await readFile(join(first, 'config.js'), 'utf8');
    expect(firstConfig).toContain("title: 'onboarding flow'");
    expect(firstConfig).not.toContain('ticket:');
    expect(await readFile(join(second, 'config.js'), 'utf8')).toContain('ticket: 42');
    expect(await readFile(legacy, 'utf8')).toBe(before);
    expect(await readdir(join(first, 'variants'))).toEqual([]);
    expect(await readdir(join(first, 'assets'))).toEqual([]);
    await run(process.execPath, [join(first, 'tools/check.mjs')], { cwd: root });
    await run(process.execPath, [join(second, 'tools/check.mjs')], { cwd: root });
  });

  it('refuses to overwrite an existing task or the legacy canvas', async () => {
    const root = await fixture();
    await run(process.execPath, [script, 'onboarding'], { cwd: root });
    const config = join(root, 'prototypes/onboarding/config.js');
    await writeFile(config, 'My approved options');
    await expect(run(process.execPath, [script, 'onboarding'], { cwd: root })).rejects.toThrow();
    expect(await readFile(config, 'utf8')).toBe('My approved options');
    await expect(run(process.execPath, [script, 'canvas'], { cwd: root })).rejects.toThrow('legacy canvas is reserved');
  });

  it('rejects traversal, absolute paths, invalid IDs, and invalid ticket metadata before writing', async () => {
    const root = await fixture();
    for (const args of [['../outside'], ['C:\\outside'], ['/outside'], ['a/b'], ['A'], [''], ['home', '--ticket', '0'], ['home', '--ticket', '1.5'], ['home', '--other'], ['home', '--ticket', '9007199254740992']]) {
      await expect(run(process.execPath, [script, ...args], { cwd: root })).rejects.toThrow();
    }
    expect(await readdir(join(root, 'prototypes'))).toEqual(['canvas']);
  }, 15000);

  it('refuses a prototypes directory redirected outside the checkout', async () => {
    const outside = await fixture();
    const root = await mkdtemp(join(tmpdir(), 'wayfinder-canvas-link-'));
    temporary.push(root);
    await symlink(join(outside, 'prototypes'), join(root, 'prototypes'), 'junction');
    await expect(run(process.execPath, [script, 'onboarding'], { cwd: root })).rejects.toThrow('without symlinks');
    expect(await readdir(join(outside, 'prototypes'))).toEqual(['canvas']);
  });
});
