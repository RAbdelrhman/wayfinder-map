import { describe, expect, it, vi } from 'vitest';

import type { Config } from './config.js';
import type { HomeState } from './home.js';
import { startServer } from './server.js';
import type { ServerT3 } from './server.js';
import type { RepositoryFetcher } from './repositoryStore.js';

const config: Config = {
  repo: null,
  cwd: process.cwd(),
  port: 0,
  host: '127.0.0.1',
  mapLabel: 'wayfinder:map',
  typePrefix: 'wayfinder:',
  promptFile: null,
  open: false,
};

const t3: ServerT3 = {
  models: async () => ({ providers: [] }),
  steps: () => ({
    startThread: async () => ({ threadId: 'thread', prompt: 'prompt' }),
    openApp: async () => undefined,
    copy: async () => undefined,
  }),
};

const home: HomeState = {
  account: {
    status: 'ready',
    host: 'github.com',
    login: 'octo',
    accounts: ['octo'],
    missingScopes: [],
    tokenSource: 'keyring',
    message: null,
  },
  repositories: ['octo/one'],
  skippedOrganizations: [],
  warning: null,
};

describe('repository-scoped server', () => {
  it('serves Home, repository, and map page routes', async () => {
    const running = await startServer({
      config,
      repo: null,
      template: 'prompt',
      workspaceRoot: null,
      t3,
      fetcher: async () => ({ maps: [], warnings: [] }),
      homeLoader: async () => home,
    });

    try {
      const homePage = await fetch(running.url);
      const repositoryPage = await fetch(`${running.url}/repos/octo/one`);
      const mapPage = await fetch(`${running.url}/repos/octo/one/maps/12`);
      expect(await homePage.text()).toContain('src="/home.js"');
      expect(await repositoryPage.text()).toContain('src="/home.js"');
      expect(await mapPage.text()).toContain('src="/app.js"');
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  it('isolates snapshots for repositories requested through scoped endpoints', async () => {
    const fetcher: RepositoryFetcher = vi.fn(async ({ repo }) => ({
      maps: [],
      warnings: [`loaded ${repo}`],
    }));
    const running = await startServer({
      config,
      repo: null,
      template: 'prompt',
      workspaceRoot: null,
      t3,
      fetcher,
      homeLoader: async () => home,
    });

    try {
      const one = await fetch(`${running.url}/api/repos/octo/one/snapshot`).then((response) => response.json());
      const two = await fetch(`${running.url}/api/repos/octo/two/snapshot`).then((response) => response.json());
      const oneAgain = await fetch(`${running.url}/api/repos/octo/one/snapshot`).then((response) => response.json());
      expect(one).toMatchObject({ repo: 'octo/one', warnings: ['loaded octo/one'] });
      expect(two).toMatchObject({ repo: 'octo/two', warnings: ['loaded octo/two'] });
      expect(oneAgain).toEqual(one);
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  it('keeps the Home shell available when discovery reports an account error', async () => {
    const signedOut = { ...home, account: { ...home.account, status: 'signed-out' as const, login: null } };
    const running = await startServer({
      config,
      repo: null,
      template: 'prompt',
      workspaceRoot: null,
      t3,
      homeLoader: async () => signedOut,
    });

    try {
      const response = await fetch(`${running.url}/api/home`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ account: { status: 'signed-out' } });
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  it('hands an explicit shutdown to the desktop owner after responding', async () => {
    const onShutdown = vi.fn();
    const running = await startServer({
      config,
      repo: null,
      template: 'prompt',
      workspaceRoot: null,
      t3,
      homeLoader: async () => home,
      onShutdown,
    });

    try {
      const response = await fetch(`${running.url}/api/shutdown`, {
        method: 'POST',
        headers: { origin: running.url },
      });
      expect(response.status).toBe(200);
      await vi.waitFor(() => expect(onShutdown).toHaveBeenCalledTimes(1));
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });
});
