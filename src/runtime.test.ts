import { createServer } from 'node:http';
import type { Server } from 'node:http';

import { describe, expect, it, vi } from 'vitest';

import type { Config } from './config.js';
import { startWayfinder, WayfinderStartupError } from './runtime.js';
import type { ManagedT3, RuntimeDependencies } from './runtime.js';
import { startServer } from './server.js';

const config = (overrides: Partial<Config> = {}): Config => ({
  repo: 'owner/repo',
  cwd: process.cwd(),
  port: 0,
  host: '127.0.0.1',
  mapLabel: 'wayfinder:map',
  typePrefix: 'wayfinder:',
  promptFile: null,
  open: false,
  ...overrides,
});

function fakeT3(close = vi.fn()): ManagedT3 {
  return {
    models: async () => ({ providers: [] }),
    steps: () => ({
      startThread: async () => ({ threadId: 'thread', prompt: 'prompt' }),
      openApp: async () => undefined,
      copy: async () => undefined,
    }),
    close,
  };
}

async function listen(): Promise<Server> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function unusedPort(): Promise<number> {
  const server = await listen();
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Test server did not report a TCP port');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

function dependencies(
  overrides: Partial<RuntimeDependencies> = {},
): Partial<RuntimeDependencies> {
  return {
    currentRepo: async () => 'owner/repo',
    resolveWorkspace: async () => 'C:\\repo',
    detectT3: async () => ({ origin: 'http://127.0.0.1:3773', pid: 1, stateDir: 'C:\\t3' }),
    ...overrides,
  };
}

describe('startWayfinder', () => {
  it('starts once and closes the server and T3 session once', async () => {
    const server = await listen();
    const closeT3 = vi.fn();
    const runtime = await startWayfinder(
      config(),
      dependencies({
        createT3: () => fakeT3(closeT3),
        startServer: async () => ({ server, url: 'http://127.0.0.1:49152' }),
      }),
    );

    expect(runtime).toMatchObject({
      repo: 'owner/repo',
      url: 'http://127.0.0.1:49152',
      workspaceRoot: 'C:\\repo',
      t3Origin: 'http://127.0.0.1:3773',
    });

    await Promise.all([runtime.close(), runtime.close()]);
    expect(server.listening).toBe(false);
    expect(closeT3).toHaveBeenCalledTimes(1);
  });

  it('cleans up T3 when server startup fails', async () => {
    const closeT3 = vi.fn();
    const failure = new Error('address in use');

    await expect(
      startWayfinder(
        config({ port: 4478 }),
        dependencies({
          createT3: () => fakeT3(closeT3),
          startServer: async () => Promise.reject(failure),
        }),
      ),
    ).rejects.toMatchObject({ stage: 'server', cause: failure });
    expect(closeT3).toHaveBeenCalledTimes(1);
  });

  it('cleans up the server and T3 when runtime detection fails', async () => {
    const server = await listen();
    const closeT3 = vi.fn();

    await expect(
      startWayfinder(
        config(),
        dependencies({
          createT3: () => fakeT3(closeT3),
          startServer: async () => ({ server, url: 'http://127.0.0.1:49152' }),
          detectT3: async () => Promise.reject(new Error('bad state file')),
        }),
      ),
    ).rejects.toBeInstanceOf(WayfinderStartupError);
    expect(server.listening).toBe(false);
    expect(closeT3).toHaveBeenCalledTimes(1);
  });

  it('returns a typed repository failure before creating T3 state', async () => {
    const createT3 = vi.fn(() => fakeT3());

    await expect(
      startWayfinder(
        config({ repo: null }),
        dependencies({
          currentRepo: async () => Promise.reject(new Error('not a checkout')),
          createT3,
        }),
      ),
    ).rejects.toMatchObject({ stage: 'repository' });
    expect(createT3).not.toHaveBeenCalled();
  });
});

describe('startServer port selection', () => {
  it('uses an operating-system-selected port in its URL and origin check', async () => {
    const running = await startServer({
      config: config(),
      repo: 'owner/repo',
      template: 'prompt',
      workspaceRoot: null,
      t3: fakeT3(),
    });

    try {
      const parsed = new URL(running.url);
      expect(Number(parsed.port)).toBeGreaterThan(0);

      const rejected = await fetch(`${running.url}/api/models`, {
        headers: { origin: 'http://127.0.0.1:1' },
      });
      expect(rejected.status).toBe(403);

      const accepted = await fetch(`${running.url}/api/models`, {
        headers: { origin: running.url },
      });
      expect(accepted.status).toBe(200);
      await expect(accepted.json()).resolves.toEqual({ providers: [] });
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  it('keeps an explicitly selected port', async () => {
    const port = await unusedPort();
    const running = await startServer({
      config: config({ port }),
      repo: 'owner/repo',
      template: 'prompt',
      workspaceRoot: null,
      t3: fakeT3(),
    });

    try {
      expect(running.url).toBe(`http://127.0.0.1:${String(port)}`);
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });
});
