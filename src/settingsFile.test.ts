import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import * as filesystem from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { NotificationSettingsStore } from './notifications.js';
import { ProgressSettingsStore } from './progress.js';
import { SettingsFileWriter } from './settingsFile.js';
import { StallSettingsStore } from './stalled.js';

vi.mock('node:fs/promises', { spy: true });

const directories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'wayfinder-settings-'));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('SettingsFileWriter', () => {
  it('keeps the previous JSON readable while its replacement is incomplete', async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, 'settings.json');
    const previous = { version: 'previous', data: 'a'.repeat(512_000) };
    const next = { version: 'next', data: 'b'.repeat(512_000) };
    await writeFile(path, JSON.stringify(previous), 'utf8');
    const writer = new SettingsFileWriter(path);

    const originalWrite = (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).writeFile;
    let resume: () => void = () => undefined;
    let notifyPartial: () => void = () => undefined;
    const paused = new Promise<void>((resolve) => { resume = resolve; });
    const partialWritten = new Promise<void>((resolve) => { notifyPartial = resolve; });
    const write = vi.mocked(filesystem.writeFile).mockImplementation(async (file, data, options) => {
      // Pause the real filesystem write with incomplete JSON. A direct destination
      // write would expose this partial content; a temporary file must not.
      await originalWrite(file, '{', options);
      notifyPartial();
      await paused;
      // The first write already created the file exclusively.
      await originalWrite(file, data, { encoding: 'utf8', flag: 'w' });
    });
    const saving = writer.write(next);
    try {
      await partialWritten;
      expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(previous);
      const temporary = (await readdir(directory)).find((file) => file.endsWith('.tmp'));
      expect(temporary).toBeDefined();
      expect(await readFile(join(directory, temporary ?? ''), 'utf8')).toBe('{');
    } finally {
      resume();
      try {
        await saving;
      } finally {
        write.mockImplementation(originalWrite);
      }
    }

    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(next);
    expect(await readdir(directory)).toEqual(['settings.json']);
  });

  it('removes the temporary file after a failed replacement and accepts the next queued write', async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, 'settings.json');
    await mkdir(path);
    const writer = new SettingsFileWriter(path);

    const failed = writer.update(() => writer.write({ goal: 3 }));
    const failedAssertion = expect(failed).rejects.toThrow();
    const succeeding = writer.update(async () => {
      await rm(path, { recursive: true });
      await writer.write({ goal: 8 });
    });

    await failedAssertion;
    await succeeding;
    expect(await readdir(directory)).toEqual(['settings.json']);
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ goal: 8 });
  });
});

describe('settings store write failure recovery', () => {
  const stores: Array<{
    name: string;
    create: (path: string) => { update: (patch: unknown) => Promise<unknown>; get: () => Promise<unknown> };
    patch: unknown;
    expected: Record<string, unknown>;
  }> = [
    {
      name: 'progress',
      create: (path) => {
        const store = new ProgressSettingsStore(path);
        return { update: (patch) => store.update('octo', patch), get: () => store.get('octo') };
      },
      patch: { style: 'hex', goal: 8 },
      expected: { style: 'hex', goal: 8 },
    },
    {
      name: 'notifications',
      create: (path) => new NotificationSettingsStore(path),
      patch: { unblocked: false },
      expected: { unblocked: false },
    },
    {
      name: 'stalls',
      create: (path) => new StallSettingsStore(path),
      patch: { untouchedClaimDays: 30, deadHandOffDays: 3 },
      expected: { untouchedClaimDays: 30, deadHandOffDays: 3 },
    },
  ];

  it.each(stores)('$name accepts an update after an earlier filesystem failure', async ({ create, patch, expected }) => {
    const directory = await temporaryDirectory();
    const parent = join(directory, 'blocked');
    await writeFile(parent, 'this is a file, not a directory', 'utf8');
    const store = create(join(parent, 'settings.json'));

    await expect(store.update(patch)).rejects.toThrow();
    await rm(parent);

    await expect(store.update(patch)).resolves.toMatchObject(expected);
    expect(await store.get()).toMatchObject(expected);
  });
});
