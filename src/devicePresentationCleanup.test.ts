import { access, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { closeDevicePresentation } from '../scripts/close-device-presentation.mjs';

it('closes the real local server and removes its fixture when browser shutdown rejects', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'phone-cleanup-'));
  await writeFile(join(fixture, 'page.html'), 'fixture');
  const server = createServer();
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const failure = new Error('Browser disconnected');
  try {
    await expect(closeDevicePresentation({ close: async () => { throw failure; } }, server, fixture)).rejects.toBe(failure);
    expect(server.listening).toBe(false);
    await expect(access(fixture)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    // Idempotent cleanup also covers an assertion failure without leaking handles.
    await closeDevicePresentation(undefined, server.listening ? server : undefined, fixture);
  }
});

it('removes the fixture even when server shutdown reports an error', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'phone-cleanup-'));
  const server = createServer();
  try {
    await expect(closeDevicePresentation(undefined, server, fixture)).rejects.toMatchObject({ code: 'ERR_SERVER_NOT_RUNNING' });
    await expect(access(fixture)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await closeDevicePresentation(undefined, undefined, fixture);
  }
});
