import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
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
  it('rejects duplicate and unsupported mobile options before creating a board', async () => {
    const root = await fixture();
    for (const options of [['--mobile', '--mobile'], ['--ticket', '1', '--ticket', '2'], ['--mobile', 'tablet']]) {
      await expect(run(process.execPath, [script, 'phone', ...options], { cwd: root })).rejects.toThrow('Usage:');
    }
    expect(await readdir(join(root, 'prototypes'))).toEqual(['canvas']);
  }, 15000);

  it.each([['--mobile', '--ticket', '42'], ['--ticket', '42', '--mobile']])('creates a phone board with the shared frame using %j', async (...options) => {
    const root = await fixture();
    await mkdir(join(root, 'src/ui'), { recursive: true });
    await cp(resolve('src/ui/styles.css'), join(root, 'src/ui/styles.css'));
    await run(process.execPath, [script, '42-phone', ...options], { cwd: root });
    const board = join(root, 'prototypes/42-phone');
    const config = await readFile(join(board, 'config.js'), 'utf8');
    expect(config).toContain('ticket: 42');
    expect(config).toContain('width: 390, height: 844, boardWidth: 240');
    const phone = await readFile(join(board, 'variants/phone.html'), 'utf8');
    expect(phone).toContain('data-canvas-device="phone"');
    expect(phone).toContain('src="../../canvas/device.js"');
    expect(phone.indexOf('kit/kit.js')).toBeLessThan(phone.indexOf('canvas/device.js'));
    expect(await readdir(board)).not.toContain('device.js');
    await run(process.execPath, [join(board, 'tools/check.mjs')], { cwd: root });
  }, 30000);

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
    for (const board of [first, second]) {
      const files = await readdir(board);
      expect(files).not.toContain('canvas.js');
      expect(files).not.toContain('canvas.css');
      expect(files).not.toContain('kit');
      const index = await readFile(join(board, 'index.html'), 'utf8');
      expect(index).toContain('src="../canvas/canvas.js"');
      expect(index).toContain('href="../canvas/canvas.css"');
      expect(await readFile(join(board, 'README.md'), 'utf8')).toContain('../../canvas/kit/kit.js');
    }
    await run(process.execPath, [join(first, 'tools/check.mjs')], { cwd: root });
    await run(process.execPath, [join(second, 'tools/check.mjs')], { cwd: root });
  }, 30000);

  it('refuses to overwrite an existing task or the legacy canvas', async () => {
    const root = await fixture();
    await run(process.execPath, [script, 'onboarding'], { cwd: root });
    const config = join(root, 'prototypes/onboarding/config.js');
    await writeFile(config, 'My approved options');
    await expect(run(process.execPath, [script, 'onboarding'], { cwd: root })).rejects.toThrow();
    expect(await readFile(config, 'utf8')).toBe('My approved options');
    await expect(run(process.execPath, [script, 'canvas'], { cwd: root })).rejects.toThrow('legacy canvas is reserved');
  }, 30000);

  it('rejects traversal, absolute paths, invalid IDs, and invalid ticket metadata before writing', async () => {
    const root = await fixture();
    for (const args of [['../outside'], ['C:\\outside'], ['/outside'], ['a/b'], ['A'], [''], ['home', '--ticket', '0'], ['home', '--ticket', '1.5'], ['home', '--other'], ['home', '--ticket', '9007199254740992']]) {
      await expect(run(process.execPath, [script, ...args], { cwd: root })).rejects.toThrow();
    }
    expect(await readdir(join(root, 'prototypes'))).toEqual(['canvas']);
  }, 15000);

  it('refuses a prototypes directory redirected outside the checkout', async () => {
    // Rejection happens before the shared canvas is read, so no full canvas copy is needed.
    const outside = await mkdtemp(join(tmpdir(), 'wayfinder-canvas-outside-'));
    temporary.push(outside);
    await mkdir(join(outside, 'prototypes/canvas'), { recursive: true });
    const root = await mkdtemp(join(tmpdir(), 'wayfinder-canvas-link-'));
    temporary.push(root);
    await symlink(join(outside, 'prototypes'), join(root, 'prototypes'), 'junction');
    await expect(run(process.execPath, [script, 'onboarding'], { cwd: root })).rejects.toThrow('without symlinks');
    expect(await readdir(join(outside, 'prototypes'))).toEqual(['canvas']);
  });
});
