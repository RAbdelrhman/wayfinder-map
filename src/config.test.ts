import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULTS, USAGE, resolveConfig } from './config.js';

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'wayfinder-config-'));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe('resolveConfig', () => {
  it('answers help and version before reading anything else', async () => {
    await expect(resolveConfig(['--help'])).resolves.toBe('help');
    await expect(resolveConfig(['-h'])).resolves.toBe('help');
    await expect(resolveConfig(['--version'])).resolves.toBe('version');
    await expect(resolveConfig(['-v'])).resolves.toBe('version');
  });

  it('documents every flag it reads', () => {
    for (const flag of ['--repo', '--cwd', '--port', '--map-label', '--type-prefix', '--prompt', '--no-open', '--version', '--help']) {
      expect(USAGE).toContain(flag);
    }
  });

  it('falls back to the defaults', async () => {
    const config = await resolveConfig(['--cwd', cwd]);
    expect(config).toEqual({ ...DEFAULTS, repo: null, cwd });
  });

  it('reads flags', async () => {
    const config = await resolveConfig(['--cwd', cwd, '--repo', 'owner/name', '--port', '0', '--prompt', 'p.txt', '--no-open']);
    expect(config).toMatchObject({ repo: 'owner/name', port: 0, promptFile: 'p.txt', open: false });
  });

  it('lets flags beat the config file', async () => {
    await writeFile(join(cwd, 'wayfinder-map.config.json'), JSON.stringify({ repo: 'file/repo', port: 5000, open: false }));
    expect(await resolveConfig(['--cwd', cwd])).toMatchObject({ repo: 'file/repo', port: 5000, open: false });
    expect(await resolveConfig(['--cwd', cwd, '--repo', 'flag/repo', '--port', '6000'])).toMatchObject({ repo: 'flag/repo', port: 6000 });
  });

  it('rejects a port outside 0 to 65535', async () => {
    await expect(resolveConfig(['--cwd', cwd, '--port', '65536'])).rejects.toThrow('--port');
    await expect(resolveConfig(['--cwd', cwd, '--port', 'abc'])).rejects.toThrow('--port');  });
});
