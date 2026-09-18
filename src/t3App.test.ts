import { createServer } from 'node:net';
import type { Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { appControlAddress, openWorkspace, stateDirFor } from './t3App.js';

describe('appControlAddress', () => {
  it('matches the named pipe the desktop app listens on', () => {
    // Observed from a running T3 Code (Nightly) on Windows.
    expect(appControlAddress({ platform: 'win32', stateDir: 'C:\\Users\\supie\\.t3\\userdata', tempDir: 'unused', uid: undefined })).toBe(
      '\\\\.\\pipe\\t3code-app-02d19d60c3db2db12d5bded7',
    );
  });

  it('puts the unix socket in a per-user directory under the temp dir', () => {
    expect(appControlAddress({ platform: 'linux', stateDir: '/home/a/.t3/userdata', tempDir: '/tmp', uid: 1000 })).toMatch(
      /^\/tmp\/t3code-1000\/[0-9a-f]{24}\.sock$/,
    );
  });

  it('keys the directory by the state hash when there is no uid', () => {
    const address = appControlAddress({ platform: 'darwin', stateDir: '/Users/a/.t3/userdata', tempDir: '/tmp', uid: undefined });
    const [, dirKey, fileKey] = /t3code-([0-9a-f]+)\/([0-9a-f]+)\.sock$/.exec(address) ?? [];
    expect(dirKey).toBe(fileKey?.slice(0, 12));
  });
});

describe('stateDirFor', () => {
  it('appends userdata to the T3 home', () => {
    expect(stateDirFor('C:\\Users\\a\\.t3', 'win32')).toBe('C:\\Users\\a\\.t3\\userdata');
    expect(stateDirFor('/home/a/.t3', 'linux')).toBe('/home/a/.t3/userdata');
  });
});

describe('openWorkspace', () => {
  let server: Server | null = null;
  afterEach(() => {
    server?.close();
    server = null;
  });

  let count = 0;
  let address = '';
  beforeEach(() => {
    // A fresh address per test, since a closing server can still hold the last one.
    const name = `wayfinder-map-test-${String(process.pid)}-${String((count += 1))}`;
    address = process.platform === 'win32' ? `\\\\.\\pipe\\${name}` : join(tmpdir(), `${name}.sock`);
  });

  /** A stand-in desktop app that answers one line per connection. */
  function fakeApp(reply: (request: Record<string, unknown>) => unknown): Promise<Array<Record<string, unknown>>> {
    const seen: Array<Record<string, unknown>> = [];
    server = createServer((socket) => {
      let buffer = '';
      socket.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        if (!buffer.includes('\n')) return;
        const request = JSON.parse(buffer.slice(0, buffer.indexOf('\n'))) as Record<string, unknown>;
        seen.push(request);
        socket.end(`${JSON.stringify(reply(request))}\n`);
      });
    });
    return new Promise((resolve) => server?.listen(address, () => resolve(seen)));
  }

  it('sends an open-workspace request and returns the new thread', async () => {
    const seen = await fakeApp((request) => ({ version: 1, requestId: request['requestId'], ok: true, projectId: 'p1', threadId: 't1' }));

    await expect(openWorkspace(address, 'C:\\repo', 'win32')).resolves.toEqual({ projectId: 'p1', threadId: 't1' });
    expect(seen[0]).toMatchObject({ version: 1, type: 'open-workspace', workspaceRoot: 'C:\\repo', platform: 'win32' });
  });

  it('surfaces the app refusing', async () => {
    await fakeApp((request) => ({ version: 1, requestId: request['requestId'], ok: false, code: 'renderer-unavailable', message: 'no window' }));

    await expect(openWorkspace(address, '/repo', 'linux')).rejects.toThrow('no window');
  });

  it('fails when nothing is listening', async () => {
    await expect(openWorkspace(`${address}-missing`, '/repo', 'linux')).rejects.toThrow('desktop app unreachable');
  });
});
