import { describe, expect, it, vi } from 'vitest';

import type { Config } from './config.js';
import type { HomeState } from './home.js';
import { DEFAULT_PROGRESS_SETTINGS, ProgressError } from './progress.js';
import type { ProgressState } from './progress.js';
import { DEFAULT_TEMPLATE, startServer } from './server.js';
import type { ServerT3 } from './server.js';
import type { RepositoryFetcher } from './repositoryStore.js';
import { WorkspaceResolver } from './workspaces.js';
import type { WorkspaceDependencies } from './workspaces.js';
import type { Ticket, WayfinderMap } from './types.js';
import { HandOffStore } from './handOffTracking.js';

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
  projects: async () => [],
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
  outside: [],
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

  it('lists the account repositories once and relists on refresh', async () => {
    const repoLister = vi.fn(async () => ['octo/one', 'acme/two']);
    const running = await startServer({
      config,
      repo: null,
      template: DEFAULT_TEMPLATE,
      workspaceRoot: null,
      t3,
      homeLoader: async () => home,
      repoLister,
    });

    try {
      await expect((await fetch(`${running.url}/api/repositories`)).json()).resolves.toEqual(['octo/one', 'acme/two']);
      await fetch(`${running.url}/api/repositories`);
      expect(repoLister).toHaveBeenCalledTimes(1);
      await fetch(`${running.url}/api/repositories?refresh=1`);
      expect(repoLister).toHaveBeenCalledTimes(2);
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

  it('serves updater status and handles check and install requests', async () => {
    const check = vi.fn(async () => ({
      status: 'available' as const,
      currentVersion: '0.1.0',
      latestVersion: '0.2.0',
    }));
    const install = vi.fn(async () => undefined);
    const status = vi.fn(() => ({
      status: 'ready' as const,
      currentVersion: '0.1.0',
      latestVersion: '0.2.0',
    }));

    const running = await startServer({
      config,
      repo: null,
      template: DEFAULT_TEMPLATE,
      workspaceRoot: null,
      t3,
      homeLoader: async () => home,
      updater: { check, install, status },
    });

    try {
      const getRes = await fetch(`${running.url}/api/updater`);
      expect(getRes.status).toBe(200);
      await expect(getRes.json()).resolves.toEqual({
        status: 'ready',
        currentVersion: '0.1.0',
        latestVersion: '0.2.0',
      });
      expect(status).toHaveBeenCalledTimes(1);

      const checkRes = await fetch(`${running.url}/api/updater/check`, {
        method: 'POST',
        headers: { origin: running.url },
      });
      expect(checkRes.status).toBe(200);
      await expect(checkRes.json()).resolves.toEqual({
        status: 'available',
        currentVersion: '0.1.0',
        latestVersion: '0.2.0',
      });
      expect(check).toHaveBeenCalledTimes(1);

      const installRes = await fetch(`${running.url}/api/updater/install`, {
        method: 'POST',
        headers: { origin: running.url },
      });
      expect(installRes.status).toBe(200);
      await expect(installRes.json()).resolves.toEqual({ installing: true });
      expect(install).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  it('provides default updater when none configured', async () => {
    const running = await startServer({
      config,
      repo: null,
      template: DEFAULT_TEMPLATE,
      workspaceRoot: null,
      t3,
      homeLoader: async () => home,
    });

    try {
      const getRes = await fetch(`${running.url}/api/updater`);
      expect(getRes.status).toBe(200);
      const data = (await getRes.json()) as { status: string; currentVersion: string };
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('currentVersion');
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });
});

describe('local clone for a hand-off', () => {
  /** A resolver that knows the given checkouts and remembers in memory, never touching disk. */
  function resolver(clones: Record<string, string>, projects: string[]): WorkspaceResolver {
    const remembered: Record<string, string> = {};
    const dependencies: WorkspaceDependencies = {
      knownProjects: async () => projects,
      verify: async (path, repo) => (repo === 'octo/one' ? (clones[path] ?? null) : null),
      readRemembered: async () => ({ ...remembered }),
      writeRemembered: async (all) => {
        Object.assign(remembered, all);
      },
    };
    return new WorkspaceResolver(dependencies);
  }

  async function serve(options: Partial<Parameters<typeof startServer>[0]> = {}) {
    return startServer({
      config,
      repo: null,
      template: DEFAULT_TEMPLATE,
      workspaceRoot: null,
      t3,
      fetcher: async () => ({ maps: [sampleMap], warnings: [] }),
      homeLoader: async () => home,
      handOffStore: new HandOffStore({ filePath: null }),
      ...options,
    });
  }

  it('reports the clone T3 Code already has a project for', async () => {
    const running = await serve({ workspaces: resolver({ '/clone': '/clone' }, ['/clone']) });

    try {
      const response = await fetch(`${running.url}/api/repos/octo/one/workspace`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: 'ready', path: '/clone', canChoose: false });
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  it('offers a folder picker when nothing verifies, and takes what it answers', async () => {
    const chooseDirectory = vi.fn(async () => '/picked');
    const running = await serve({ workspaces: resolver({ '/picked': '/picked' }, []), chooseDirectory });

    try {
      const before = await fetch(`${running.url}/api/repos/octo/one/workspace`);
      await expect(before.json()).resolves.toEqual({ status: 'choose', candidates: [], canChoose: true });

      const picked = await fetch(`${running.url}/api/repos/octo/one/workspace`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: running.url },
        body: JSON.stringify({ choose: true }),
      });
      expect(picked.status).toBe(200);
      await expect(picked.json()).resolves.toEqual({ status: 'ready', path: '/picked', canChoose: true });
      expect(chooseDirectory).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  it('leaves the state alone when the picker is cancelled', async () => {
    const running = await serve({ workspaces: resolver({}, []), chooseDirectory: async () => null });

    try {
      const response = await fetch(`${running.url}/api/repos/octo/one/workspace`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: running.url },
        body: JSON.stringify({ choose: true }),
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ cancelled: true, status: 'choose' });
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  it('refuses a folder that is not a checkout of the repository', async () => {
    const running = await serve({ workspaces: resolver({ '/clone': '/clone' }, []) });

    try {
      const response = await fetch(`${running.url}/api/repos/octo/one/workspace`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: running.url },
        body: JSON.stringify({ path: '/downloads' }),
      });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: 'That folder is not a checkout of octo/one.', status: 'choose' });
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  it('starts the thread in the verified clone rather than the launch directory', async () => {
    const startThread = vi.fn(async () => ({ threadId: 'thread', prompt: 'prompt' }));
    const running = await serve({
      t3: { ...t3, steps: () => ({ startThread, openApp: async () => undefined, copy: async () => undefined }) },
      workspaces: resolver({ '/clone': '/clone' }, ['/clone']),
    });

    try {
      const response = await fetch(`${running.url}/api/repos/octo/one/hand-off`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: running.url },
        body: JSON.stringify({ ticket: 11 }),
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ rung: 'thread' });
      expect(startThread).toHaveBeenCalledWith(expect.objectContaining({ workspaceRoot: '/clone' }));
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  it('records ticket hand-offs and exposes current T3 status through /api/hand-offs', async () => {
    const trackingT3: ServerT3 = {
      ...t3,
      steps: () => ({
        startThread: async () => ({ threadId: 'tracked-thread', prompt: 'do not expose this prompt' }),
        openApp: async () => undefined,
        copy: async () => undefined,
      }),
      readHandOffSnapshot: async () => ({
        environmentId: 't3-env',
        origin: 'http://127.0.0.1:3773',
        snapshot: {
          snapshotSequence: 8,
          threads: [
            {
              id: 'tracked-thread',
              projectId: 't3-project',
              branch: 'wayfinder/11-retire-api-agents-2',
              session: { status: 'running' },
              pullRequests: [{ number: 42, url: 'https://github.com/octo/one/pull/42', state: 'open' }],
            },
          ],
        },
      }),
      subscribeShell: async () => () => undefined,
    };
    const running = await serve({ t3: trackingT3, workspaces: resolver({ '/clone': '/clone' }, ['/clone']) });

    try {
      const handOffResponse = await fetch(`${running.url}/api/repos/octo/one/hand-off`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: running.url },
        body: JSON.stringify({ map: 5, ticket: 11 }),
      });
      expect(handOffResponse.status).toBe(200);
      await expect(handOffResponse.json()).resolves.toMatchObject({ rung: 'thread', threadId: 'tracked-thread', handOffId: expect.any(String) });

      const statusResponse = await fetch(`${running.url}/api/hand-offs`, { headers: { origin: running.url } });
      const status = (await statusResponse.json()) as { handOffs: Array<Record<string, unknown>>; t3: { available: boolean } };
      expect(statusResponse.status).toBe(200);
      expect(status.t3.available).toBe(true);
      expect(status.handOffs).toMatchObject([
        {
          repo: 'octo/one',
          mapNumber: 5,
          ticketNumber: 11,
          threadId: 'tracked-thread',
          status: 'running',
          stale: false,
          branch: 'wayfinder/11-retire-api-agents-2',
          pullRequests: [{ number: 42, url: 'https://github.com/octo/one/pull/42' }],
        },
      ]);
      expect(JSON.stringify(status)).not.toContain('do not expose this prompt');
      expect(status.handOffs[0]).not.toHaveProperty('worktreePath');
      expect(status.handOffs[0]).not.toHaveProperty('environmentId');
      expect(status.handOffs[0]).not.toHaveProperty('projectId');
      expect(status.handOffs[0]).not.toHaveProperty('lastError');
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  it('records a T3-down hand-off as untracked without failing the copy fallback', async () => {
    const steps = {
      startThread: async (): Promise<never> => {
        throw new Error('T3 Code is not running');
      },
      openApp: async (): Promise<never> => {
        throw new Error('desktop app is not running');
      },
      copy: async () => undefined,
    };
    const running = await serve({
      t3: { ...t3, steps: () => steps },
      workspaces: resolver({ '/clone': '/clone' }, ['/clone']),
    });

    try {
      const handOffResponse = await fetch(`${running.url}/api/repos/octo/one/hand-off`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: running.url },
        body: JSON.stringify({ map: 5, ticket: 11 }),
      });
      await expect(handOffResponse.json()).resolves.toMatchObject({ rung: 'clipboard', handOffId: expect.any(String) });
      const statusResponse = await fetch(`${running.url}/api/hand-offs`, { headers: { origin: running.url } });
      await expect(statusResponse.json()).resolves.toMatchObject({
        t3: { available: false },
        handOffs: [{ status: 'untracked', stale: false, threadId: null }],
      });
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  describe('Start a new map', () => {
    const newMap = (url: string, body: unknown) =>
      fetch(`${url}/api/repos/octo/one/new-map`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: url },
        body: JSON.stringify(body),
      });

    it('previews the prompt without touching the clipboard or T3 Code', async () => {
      const copy = vi.fn(async () => undefined);
      const startThread = vi.fn(async () => ({ threadId: 'thread', prompt: 'prompt' }));
      const running = await serve({ t3: { ...t3, steps: () => ({ startThread, openApp: async () => undefined, copy }) } });

      try {
        const response = await newMap(running.url, { goal: '  Build offline mode  ', preview: true });
        expect(response.status).toBe(200);
        const { prompt } = (await response.json()) as { prompt: string };
        expect(prompt).toContain('Start a new wayfinder map in octo/one.');
        expect(prompt).toContain('  Build offline mode');
        expect(copy).not.toHaveBeenCalled();
        expect(startThread).not.toHaveBeenCalled();
      } finally {
        await new Promise<void>((resolve) => running.server.close(() => resolve()));
      }
    });

    it('requires a goal', async () => {
      const running = await serve();

      try {
        const response = await newMap(running.url, { goal: '   ' });
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({ error: 'Say what you want to accomplish first.' });
      } finally {
        await new Promise<void>((resolve) => running.server.close(() => resolve()));
      }
    });

    it('will not start without a verified clone, but still returns the prompt to copy', async () => {
      const startThread = vi.fn(async () => ({ threadId: 'thread', prompt: 'prompt' }));
      const running = await serve({
        t3: { ...t3, steps: () => ({ startThread, openApp: async () => undefined, copy: async () => undefined }) },
        workspaces: resolver({}, []),
      });

      try {
        const response = await newMap(running.url, { goal: 'Build offline mode' });
        expect(response.status).toBe(409);
        await expect(response.json()).resolves.toMatchObject({
          error: 'Choose a local clone of octo/one before starting in T3 Code.',
          prompt: expect.stringContaining('Build offline mode') as unknown,
        });
        expect(startThread).not.toHaveBeenCalled();
      } finally {
        await new Promise<void>((resolve) => running.server.close(() => resolve()));
      }
    });

    it('starts a planning thread in the verified clone with the new-map prompt', async () => {
      const startThread = vi.fn(async (input: { prompt: (worktree: null) => string }) => ({ threadId: 'thread-7', prompt: input.prompt(null) }));
      const running = await serve({
        t3: { ...t3, steps: () => ({ startThread, openApp: async () => undefined, copy: async () => undefined }) },
        workspaces: resolver({ '/clone': '/clone' }, ['/clone']),
      });

      try {
        const response = await newMap(running.url, { goal: 'Build offline\nmode', model: { instanceId: 'codex', model: 'gpt' } });
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({ rung: 'thread', threadId: 'thread-7', notice: null });
        expect(startThread).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'New map: Build offline mode',
            workspaceRoot: '/clone',
            branch: 'wayfinder/new-map',
            model: { instanceId: 'codex', model: 'gpt' },
          }),
        );
        const [input] = startThread.mock.calls[0] ?? [];
        expect(input?.prompt(null)).toContain('Run the wayfinder workflow');
      } finally {
        await new Promise<void>((resolve) => running.server.close(() => resolve()));
      }
    });
  });
});

describe('progress panel endpoints', () => {
  it('serves the panel state and saves a choice for the signed-in user', async () => {
    const state: ProgressState = { login: 'octo', settings: DEFAULT_PROGRESS_SETTINGS, days: [0, 2], streak: 1, warning: null };
    const save = vi.fn(async (patch: unknown) => {
      if (typeof patch === 'object' && patch !== null && 'goal' in patch && patch.goal === 4) throw new ProgressError(400, 'Choose a goal of 3, 5, 8.');
      return { style: 'hex', goal: 5 } as const;
    });
    const running = await startServer({
      config,
      repo: null,
      template: DEFAULT_TEMPLATE,
      workspaceRoot: null,
      t3,
      homeLoader: async () => home,
      progress: { state: async () => state, save },
    });

    try {
      await expect(fetch(`${running.url}/api/progress`).then((response) => response.json())).resolves.toEqual(state);
      const post = (body: unknown) => fetch(`${running.url}/api/progress/settings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const saved = await post({ style: 'hex' });
      expect(saved.status).toBe(200);
      await expect(saved.json()).resolves.toEqual({ style: 'hex', goal: 5 });
      expect(save).toHaveBeenCalledWith({ style: 'hex' });
      const rejected = await post({ goal: 4 });
      expect(rejected.status).toBe(400);
      await expect(rejected.json()).resolves.toEqual({ error: 'Choose a goal of 3, 5, 8.' });
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });
});
