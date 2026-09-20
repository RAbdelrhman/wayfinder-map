import { describe, expect, it, vi } from 'vitest';

import type { Config } from './config.js';
import type { HomeState } from './home.js';
import { DEFAULT_TEMPLATE, startServer } from './server.js';
import type { ServerT3 } from './server.js';
import type { RepositoryFetcher } from './repositoryStore.js';
import type { Ticket, WayfinderMap } from './types.js';

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
  version: '0.0.0-dev',
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

const sampleTicket: Ticket = {
  number: 11,
  title: 'Retire API agents',
  url: 'https://github.com/octo/one/issues/11',
  body: 'Body text here',
  type: 'task',
  labels: ['wayfinder:task'],
  open: true,
  assignee: null,
  blockedBy: [],
  openBlockers: [],
  state: 'frontier',
};

const sampleMap: WayfinderMap = {
  number: 5,
  title: 'Roadmap v1',
  url: 'https://github.com/octo/one/issues/5',
  body: '## Destination\nLaunch product',
  open: true,
  sections: {
    destination: 'Launch product',
    notes: '',
    decisions: '',
    fog: '',
    outOfScope: '',
  },
  tickets: [sampleTicket],
};

describe('repository-scoped server', () => {
  it('serves Home, repository, and map page routes', async () => {
    const running = await startServer({
      config,
      repo: null,
      template: DEFAULT_TEMPLATE,
      workspaceRoot: null,
      t3,
      homeLoader: async () => home,
    });

    try {
      const homePage = await fetch(`${running.url}/`);
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
      template: DEFAULT_TEMPLATE,
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

  it('inspects a ticket and returns its ticket data and parent map info', async () => {
    const fetcher: RepositoryFetcher = vi.fn(async () => ({
      maps: [sampleMap],
      warnings: [],
    }));
    const running = await startServer({
      config,
      repo: null,
      template: DEFAULT_TEMPLATE,
      workspaceRoot: null,
      t3,
      fetcher,
      homeLoader: async () => home,
    });

    try {
      const res = await fetch(`${running.url}/api/repos/octo/one/ticket?number=11`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { ticket: Ticket; map: { number: number; title: string } | null };
      expect(data.ticket.number).toBe(11);
      expect(data.ticket.title).toBe('Retire API agents');
      expect(data.map).toEqual({ number: 5, title: 'Roadmap v1' });
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  it('handles hand-off with a goal to start a new map interview', async () => {
    const fetcher: RepositoryFetcher = vi.fn(async () => ({
      maps: [],
      warnings: [],
    }));
    const running = await startServer({
      config,
      repo: null,
      template: DEFAULT_TEMPLATE,
      workspaceRoot: null,
      t3,
      fetcher,
      homeLoader: async () => home,
    });

    try {
      const res = await fetch(`${running.url}/api/repos/octo/one/hand-off`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: running.url,
        },
        body: JSON.stringify({ goal: 'Build offline mode', copyOnly: true }),
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { prompt: string; copied: boolean };
      expect(data.prompt).toContain('Build offline mode');
      expect(data.prompt).toContain('octo/one');
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  it('handles hand-off for a singular ticket without specifying map', async () => {
    const fetcher: RepositoryFetcher = vi.fn(async () => ({
      maps: [sampleMap],
      warnings: [],
    }));
    const running = await startServer({
      config,
      repo: null,
      template: DEFAULT_TEMPLATE,
      workspaceRoot: null,
      t3,
      fetcher,
      homeLoader: async () => home,
    });

    try {
      const res = await fetch(`${running.url}/api/repos/octo/one/hand-off`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: running.url,
        },
        body: JSON.stringify({ ticket: 11, copyOnly: true }),
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { prompt: string; copied: boolean };
      expect(data.prompt).toContain('#11 Retire API agents');
      expect(data.prompt).toContain('octo/one');
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  it('keeps the Home shell available when discovery reports an account error', async () => {
    const signedOut = { ...home, account: { ...home.account, status: 'signed-out' as const, login: null } };
    const running = await startServer({
      config,
      repo: null,
      template: DEFAULT_TEMPLATE,
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
      template: DEFAULT_TEMPLATE,
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
