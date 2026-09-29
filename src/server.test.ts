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
import { RepositoryCloneError } from './clone.js';
import type { MapSnapshot, Ticket, WayfinderMap } from './types.js';
import { HandOffStore } from './handOffTracking.js';
import { MapWatcher } from './mapWatcher.js';
import type { MapRead } from './mapWatcher.js';
import { memoryNotificationSettings } from './notifications.js';

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
  updatedAt: null,
};

const sampleMap: WayfinderMap = {
  number: 5,
  title: 'Roadmap v1',
  url: 'https://github.com/octo/one/issues/5',
  body: '## Destination\nLaunch product',
  open: true,
  author: 'octocat',
  visibility: 'private',
  sections: {
    destination: 'Launch product',
    notes: '',
    decisions: '',
    fog: '',
    outOfScope: '',
  },
  tickets: [sampleTicket],
  outside: [],
  criticalPath: { tickets: [], remaining: 0 },
  stalled: [],
  settled: null,
  ticketsLoaded: true,
};

describe('repository-scoped server', () => {
  it('serves notification choices and bridges notifications to the desktop shell when present', async () => {
    const desktopNotification = vi.fn();
    const notificationsRead = vi.fn();
    const running = await startServer({
      config,
      repo: null,
      template: DEFAULT_TEMPLATE,
      workspaceRoot: null,
      t3,
      homeLoader: async () => home,
      notificationSettings: memoryNotificationSettings(),
      onDesktopNotification: desktopNotification,
      onNotificationsRead: notificationsRead,
    });

    try {
      const defaults = await fetch(running.url + '/api/notification-settings').then((response) => response.json());
      expect(defaults).toMatchObject({ unblocked: true, stalled: true });
      const saved = await fetch(running.url + '/api/notification-settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ unblocked: false }),
      });
      expect(saved.status).toBe(200);
      expect(await saved.json()).toMatchObject({ unblocked: false });

      const notice = {
        kind: 'unblocked',
        title: 'octo/one · Map #5',
        body: '#11 Retire API agents',
        repo: 'octo/one',
        mapNumber: 5,
        ticketNumber: 11,
      };
      expect((await fetch(running.url + '/api/desktop/notification', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(notice),
      })).status).toBe(200);
      expect(desktopNotification).toHaveBeenCalledWith(notice);
      await fetch(running.url + '/api/desktop/notifications/read', { method: 'POST' });
      expect(notificationsRead).toHaveBeenCalledOnce();
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  it('keeps browser-only CLI notifications local when there is no desktop shell', async () => {
    const running = await startServer({
      config,
      repo: null,
      template: DEFAULT_TEMPLATE,
      workspaceRoot: null,
      t3,
      homeLoader: async () => home,
      notificationSettings: memoryNotificationSettings(),
    });

    try {
      const response = await fetch(running.url + '/api/desktop/notification', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'unblocked',
          title: 'octo/one · Map #5',
          body: '#11 Retire API agents',
          repo: 'octo/one',
          mapNumber: 5,
          ticketNumber: 11,
        }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ shown: false });
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

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
      const draftPage = await fetch(`${running.url}/repos/octo/one/maps/draft-123e4567-e89b-12d3-a456-426614174000`);
      expect(await homePage.text()).toContain('src="/home.js"');
      expect(await repositoryPage.text()).toContain('src="/home.js"');
      expect(await draftPage.text()).toContain('src="/home.js"');
      expect(await mapPage.text()).toContain('src="/app.js"');
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  it('streams a watched map’s events and stops watching when the server closes', async () => {
    const reads: MapRead[] = [
      { status: 'changed', etag: 'W/"1"', tickets: [{ number: 11, title: 'Retire API agents', state: 'blocked', pullRequests: [] }], rateLimit: null, pollIntervalSeconds: null },
      { status: 'changed', etag: 'W/"2"', tickets: [{ number: 11, title: 'Retire API agents', state: 'frontier', pullRequests: [] }], rateLimit: null, pollIntervalSeconds: null },
    ];
    const readMap = vi.fn(async (): Promise<MapRead> => reads.shift() ?? { status: 'unchanged', rateLimit: null, pollIntervalSeconds: null });
    const mapWatcher = new MapWatcher(
      { readMap, readPullRequests: async () => ({ byTicket: new Map(), lastCommits: new Map(), rateLimit: null }) },
      { intervalMs: 10 },
    );
    const running = await startServer({ config, repo: null, template: DEFAULT_TEMPLATE, workspaceRoot: null, t3, homeLoader: async () => home, mapWatcher });

    try {
      expect((await fetch(`${running.url}/api/repos/octo/one/events`)).status).toBe(400);
      const response = await fetch(`${running.url}/api/repos/octo/one/events?map=5`);
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      const reader = response.body!.getReader();
      let text = '';
      while (!text.includes('\n\n')) text += new TextDecoder().decode((await reader.read()).value);
      expect(text.startsWith('id: 1\nevent: map\ndata: ')).toBe(true);
      expect(JSON.parse(text.split('data: ')[1]!.trim())).toMatchObject({ type: 'ticket-next', repo: 'octo/one', mapNumber: 5, ticket: { number: 11 }, from: 'blocked' });
      void reader.cancel().catch(() => undefined);

      // A page that reconnects gets the history after the last id it saw.
      const again = await fetch(`${running.url}/api/repos/octo/one/events?map=5`, { headers: { 'last-event-id': '0' } });
      const replay = again.body!.getReader();
      expect(new TextDecoder().decode((await replay.read()).value)).toContain('id: 1\n');
      void replay.cancel().catch(() => undefined);
    } finally {
      await new Promise<void>((resolve) => {
        running.server.close(() => resolve());
        running.server.closeAllConnections();
      });
    }
    const readsAtClose = readMap.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(readMap.mock.calls.length).toBe(readsAtClose);
  });

  it('marks stalled tickets on the snapshot and follows the stall settings', async () => {
    const claimed = { ...sampleTicket, assignee: 'octo', state: 'claimed' as const, updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() };
    const fetcher: RepositoryFetcher = vi.fn(async () => ({ maps: [{ ...sampleMap, tickets: [claimed] }], warnings: [] }));
    const readPullRequests = vi.fn(async () => ({ byTicket: new Map(), lastCommits: new Map(), rateLimit: null }));
    const mapWatcher = new MapWatcher({ readMap: async () => ({ status: 'unchanged', rateLimit: null, pollIntervalSeconds: null }), readPullRequests });
    const running = await startServer({
      config,
      repo: null,
      template: DEFAULT_TEMPLATE,
      workspaceRoot: null,
      t3,
      fetcher,
      homeLoader: async () => home,
      handOffStore: new HandOffStore({ filePath: null }),
      mapWatcher,
    });
    const stalled = async (): Promise<unknown> =>
      ((await fetch(`${running.url}/api/repos/octo/one/snapshot`).then((response) => response.json())) as { maps: WayfinderMap[] }).maps[0]?.stalled;
    const save = (body: unknown): Promise<Response> =>
      fetch(`${running.url}/api/stall-settings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

    try {
      expect(await fetch(`${running.url}/api/stall-settings`).then((response) => response.json())).toEqual({ untouchedClaimDays: 7, deadHandOffDays: 7 });
      expect(await stalled()).toEqual([]);
      expect(readPullRequests).not.toHaveBeenCalled();

      expect((await save({ untouchedClaimDays: 4 })).status).toBe(400);
      const saved = await save({ untouchedClaimDays: 3 });
      expect(await saved.json()).toEqual({ untouchedClaimDays: 3, deadHandOffDays: 7 });
      expect(await stalled()).toEqual([{ ticket: 11, kind: 'untouched-claim', since: claimed.updatedAt }]);
      expect(readPullRequests).toHaveBeenCalledTimes(1);
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      mapWatcher.close();
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

  it('checks for map changes in the background and keeps manual sync forced', async () => {
    let reads = 0;
    const fetcher: RepositoryFetcher = vi.fn(async () => {
      reads += 1;
      const open = reads < 3;
      const state = open ? 'frontier' as const : 'done' as const;
      return {
        maps: [{ ...sampleMap, tickets: [{ ...sampleTicket, open, state }] }],
        warnings: [`read ${String(reads)}`],
      };
    });
    const checks = [false, true];
    const changeChecker = vi.fn(async () => checks.shift() ?? false);
    const running = await startServer({
      config,
      repo: null,
      template: DEFAULT_TEMPLATE,
      workspaceRoot: null,
      t3,
      fetcher,
      changeChecker,
      homeLoader: async () => home,
    });

    try {
      const initial = await fetch(`${running.url}/api/repos/octo/one/snapshot`).then((response) => response.json());
      const background = await fetch(`${running.url}/api/repos/octo/one/snapshot?check=1`).then((response) => response.json());
      const manual = await fetch(`${running.url}/api/repos/octo/one/snapshot?refresh=1`).then((response) => response.json());
      const changed = await fetch(`${running.url}/api/repos/octo/one/snapshot?check=1`).then((response) => response.json());

      expect(initial).toMatchObject({ warnings: ['read 1'], maps: [{ tickets: [{ state: 'frontier', open: true }] }] });
      expect(background).toEqual(initial);
      expect(manual).toMatchObject({ warnings: ['read 2'] });
      expect(changed).toMatchObject({ warnings: ['read 3'], maps: [{ tickets: [{ state: 'done', open: false }] }] });
      expect(changeChecker).toHaveBeenCalledTimes(2);
      expect(changeChecker).toHaveBeenNthCalledWith(1, 'octo/one', [5]);
      expect(changeChecker).toHaveBeenNthCalledWith(2, 'octo/one', [5]);
      expect(fetcher).toHaveBeenCalledTimes(3);
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

  it('asks for a fresh clone destination on each request', async () => {
    const destinations = ['C:/projects/one', 'D:/work/one'];
    const chooseDirectory = vi.fn(async (_purpose: 'workspace' | 'clone'): Promise<string | null> => destinations.shift() ?? null);
    const running = await serve({ workspaces: resolver({}, []), chooseDirectory });

    try {
      for (const target of ['C:/projects/one', 'D:/work/one']) {
        const response = await fetch(`${running.url}/api/repos/octo/one/workspace`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: running.url },
          body: JSON.stringify({ cloneTarget: true }),
        });
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ target });
      }
      expect(chooseDirectory).toHaveBeenNthCalledWith(1, 'clone');
      expect(chooseDirectory).toHaveBeenNthCalledWith(2, 'clone');
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  it('clones into the selected destination and makes it the hand-off workspace', async () => {
    const chooseDirectory = vi.fn(async () => '/destination');
    const cloneRepository = vi.fn(async (_repo: string, target: string) => target);
    const running = await serve({
      workspaces: resolver({ '/destination': '/destination' }, []),
      chooseDirectory,
      cloneRepository,
    });

    try {
      const picker = await fetch(`${running.url}/api/repos/octo/one/workspace`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: running.url },
        body: JSON.stringify({ cloneTarget: true }),
      });
      await expect(picker.json()).resolves.toEqual({ target: '/destination' });

      const response = await fetch(`${running.url}/api/repos/octo/one/clone`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: running.url },
        body: JSON.stringify({ target: '/destination' }),
      });
      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual({ status: 'ready', path: '/destination', canChoose: true });
      expect(chooseDirectory).toHaveBeenCalledWith('clone');
      expect(cloneRepository).toHaveBeenCalledWith('octo/one', '/destination');
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  const cloneFailures = [
    {
      name: 'a non-empty destination',
      failure: new RepositoryCloneError('destination', 'Choose an empty folder for the clone.', 400),
      status: 400,
      message: 'Choose an empty folder for the clone.',
    },
    {
      name: 'GitHub authentication failure',
      failure: new RepositoryCloneError('authentication', 'GitHub could not access octo/one. Check your GitHub sign-in and repository access.', 502),
      status: 502,
      message: 'GitHub could not access octo/one. Check your GitHub sign-in and repository access.',
    },
    {
      name: 'GitHub network failure',
      failure: new RepositoryCloneError('network', 'Could not reach GitHub. Check your network and try again.', 502),
      status: 502,
      message: 'Could not reach GitHub. Check your network and try again.',
    },
  ];

  it.each(cloneFailures)('reports $name on the clone endpoint', async ({ failure, status, message }) => {
    const cloneRepository = vi.fn(async () => {
      throw failure;
    });
    const running = await serve({ workspaces: resolver({}, []), cloneRepository });

    try {
      const response = await fetch(`${running.url}/api/repos/octo/one/clone`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: running.url },
        body: JSON.stringify({ target: '/destination' }),
      });
      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toMatchObject({ error: message, status: 'choose', canChoose: false });
      expect(cloneRepository).toHaveBeenCalledWith('octo/one', '/destination');
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

      const handOffId = status.handOffs[0]?.['id'];
      expect(typeof handOffId).toBe('string');
      const acknowledgeResponse = await fetch(`${running.url}/api/hand-offs/acknowledge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: running.url },
        body: JSON.stringify({ id: handOffId }),
      });
      expect(acknowledgeResponse.status).toBe(200);
      await expect(acknowledgeResponse.json()).resolves.toEqual({ acknowledged: true });
      const acknowledgedResponse = await fetch(`${running.url}/api/hand-offs`, { headers: { origin: running.url } });
      await expect(acknowledgedResponse.json()).resolves.toMatchObject({ handOffs: [{ id: handOffId, acknowledged: true }] });
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  describe('one live hand-off per ticket (#98)', () => {
    /** T3 Code whose threads report whatever session status the test sets. */
    function liveT3() {
      const sessions = new Map<string, string>();
      let started = 0;
      const startThread = vi.fn(async () => {
        const threadId = `thread-${String((started += 1))}`;
        sessions.set(threadId, 'running');
        return { threadId, prompt: 'prompt' };
      });
      const server: ServerT3 = {
        ...t3,
        steps: () => ({ startThread, openApp: async () => undefined, copy: async () => undefined }),
        readHandOffSnapshot: async () => ({
          environmentId: 't3-env',
          origin: 'http://127.0.0.1:3773',
          snapshot: {
            threads: [...sessions].map(([id, status]) =>
              status === 'finished'
                ? { id, session: { status: 'ready' }, latestTurn: { state: 'completed', settledAt: '2026-09-24T00:00:00.000Z' } }
                : { id, session: { status } },
            ),
          },
        }),
        subscribeShell: async () => () => undefined,
      };
      return { server, sessions, startThread };
    }

    const start = (url: string) =>
      fetch(`${url}/api/repos/octo/one/hand-off`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: url },
        body: JSON.stringify({ map: 5, ticket: 11 }),
      });

    it('refuses a second hand-off while the first is live, and allows one once it ends', async () => {
      const { server, sessions, startThread } = liveT3();
      const running = await serve({ t3: server, workspaces: resolver({ '/clone': '/clone' }, ['/clone']) });

      try {
        const first = await start(running.url);
        expect(first.status).toBe(200);
        const { handOffId } = (await first.json()) as { handOffId: string };

        const second = await start(running.url);
        expect(second.status).toBe(409);
        await expect(second.json()).resolves.toEqual({
          error: '#11 already has a hand-off in T3 Code. Open that thread instead of starting another.',
          handOffId,
        });
        expect(startThread).toHaveBeenCalledTimes(1);

        sessions.set('thread-1', 'finished');
        const again = await start(running.url);
        expect(again.status).toBe(200);
        await expect(again.json()).resolves.toMatchObject({ threadId: 'thread-2' });
        expect(startThread).toHaveBeenCalledTimes(2);

        // The retry is live even while it is still starting and the thread before it has ended.
        sessions.set('thread-2', 'starting');
        expect((await start(running.url)).status).toBe(409);
        expect(startThread).toHaveBeenCalledTimes(2);
      } finally {
        await new Promise<void>((resolve) => running.server.close(() => resolve()));
      }
    });

    it('lets only one of two simultaneous requests start a thread', async () => {
      const { server, startThread } = liveT3();
      const running = await serve({ t3: server, workspaces: resolver({ '/clone': '/clone' }, ['/clone']) });

      try {
        const statuses = (await Promise.all([start(running.url), start(running.url)])).map((response) => response.status);
        expect(statuses.sort()).toEqual([200, 409]);
        expect(startThread).toHaveBeenCalledTimes(1);
      } finally {
        await new Promise<void>((resolve) => running.server.close(() => resolve()));
      }
    });

    it('still copies the prompt for a ticket with a live hand-off', async () => {
      const { server } = liveT3();
      const running = await serve({ t3: server, workspaces: resolver({ '/clone': '/clone' }, ['/clone']) });

      try {
        expect((await start(running.url)).status).toBe(200);
        const copy = await fetch(`${running.url}/api/repos/octo/one/hand-off`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: running.url },
          body: JSON.stringify({ map: 5, ticket: 11, copyOnly: true }),
        });
        expect(copy.status).toBe(200);
      } finally {
        await new Promise<void>((resolve) => running.server.close(() => resolve()));
      }
    });
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
        const response = await newMap(running.url, { goal: 'Build offline\nmode', tier: 'hard', model: { instanceId: 'codex', model: 'gpt' } });
        expect(response.status).toBe(200);
        const started = (await response.json()) as { handOffId: string };
        expect(started).toMatchObject({ rung: 'thread', threadId: 'thread-7', notice: null, handOffId: expect.any(String) });
        const handOffResponse = await fetch(`${running.url}/api/hand-offs`, { headers: { origin: running.url } });
        await expect(handOffResponse.json()).resolves.toMatchObject({
          handOffs: [{ id: started.handOffId, repo: 'octo/one', mapNumber: null, ticketNumber: null, title: 'Build offline\nmode', tier: 'hard', threadId: 'thread-7' }],
        });
        expect(startThread).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'New map: Build offline mode',
            workspaceRoot: '/clone',
            branch: 'wayfinder/new-map',
            model: { instanceId: 'codex', model: 'gpt' },
          }),
        );
        const [input] = startThread.mock.calls[0] ?? [];
        expect(input?.prompt(null)).toContain('Turn this into a map.');
      } finally {
        await new Promise<void>((resolve) => running.server.close(() => resolve()));
      }
    });

    it('focuses T3 Code only for a known hand-off thread', async () => {
      const focus = vi.fn(async () => undefined);
      const startThread = vi.fn(async () => ({ threadId: 'thread-7', prompt: 'prompt' }));
      const running = await serve({
        t3: { ...t3, focus, steps: () => ({ startThread, openApp: async () => undefined, copy: async () => undefined }) },
        workspaces: resolver({ '/clone': '/clone' }, ['/clone']),
      });

      try {
        const startResponse = await newMap(running.url, { goal: 'Build offline mode' });
        const started = (await startResponse.json()) as { handOffId: string };
        const response = await fetch(`${running.url}/api/hand-offs/focus`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: running.url },
          body: JSON.stringify({ id: started.handOffId }),
        });
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ opened: true });
        expect(focus).toHaveBeenCalledOnce();
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

describe('following public maps', () => {
  function followingServer(login: string | null) {
    const saved = new Set<number>();
    const store = {
      follows: vi.fn(async () => [...saved]),
      set: vi.fn(async (_login: string, _repo: string, mapNumber: number, followed: boolean) => {
        if (followed) saved.add(mapNumber);
        else saved.delete(mapNumber);
        return [...saved];
      }),
    };
    // #7 is someone else's public map; it joins the list once followed.
    const fetcher = vi.fn<RepositoryFetcher>(async ({ viewer }) => {
      const followed = viewer?.follows.includes(7) === true;
      return {
        maps: followed ? [{ ...sampleMap, number: 7, author: 'drive-by', visibility: 'public' as const }] : [],
        hiddenMaps: followed ? 0 : 1,
        publicMaps: [{ number: 7, title: 'Theirs', url: 'https://github.com/octo/one/issues/7', author: 'drive-by', open: true, followed, progress: { completed: 1, total: 3 } }],
        warnings: [],
      };
    });
    const running = startServer({
      config,
      repo: null,
      template: DEFAULT_TEMPLATE,
      workspaceRoot: null,
      t3,
      fetcher,
      homeLoader: async () => home,
      handOffStore: new HandOffStore({ filePath: null }),
      following: { login: async () => login, store },
    });
    return { running, store };
  }

  const post = (url: string, body: unknown) =>
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  it('follows and unfollows a public map for the signed-in login', async () => {
    const { running: started, store } = followingServer('octo');
    const running = await started;
    try {
      const followed = (await (await post(`${running.url}/api/repos/octo/one/follow`, { map: 7, followed: true })).json()) as MapSnapshot;
      expect(store.set).toHaveBeenCalledWith('octo', 'octo/one', 7, true);
      expect(followed.maps.map((map) => map.number)).toEqual([7]);
      expect(followed.publicMaps[0]?.followed).toBe(true);

      const unfollowed = (await (await post(`${running.url}/api/repos/octo/one/follow`, { map: 7, followed: false })).json()) as MapSnapshot;
      expect(unfollowed.maps).toEqual([]);
      expect(unfollowed.publicMaps[0]?.followed).toBe(false);
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  it('refuses to follow a map that is not public, or with no one signed in', async () => {
    const { running: started, store } = followingServer('octo');
    const running = await started;
    try {
      expect((await post(`${running.url}/api/repos/octo/one/follow`, { map: 8, followed: true })).status).toBe(404);
      expect((await post(`${running.url}/api/repos/octo/one/follow`, { map: 'x', followed: true })).status).toBe(400);
      // Unfollowing works even when the map is no longer public.
      expect((await post(`${running.url}/api/repos/octo/one/follow`, { map: 8, followed: false })).status).toBe(200);
      expect(store.set).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
    const { running: anonymous } = followingServer(null);
    const signedOut = await anonymous;
    try {
      expect((await post(`${signedOut.url}/api/repos/octo/one/follow`, { map: 7, followed: true })).status).toBe(409);
    } finally {
      await new Promise<void>((resolve) => signedOut.server.close(() => resolve()));
    }
  });
});

describe('settling maps', () => {
  function settlingServer(login: string | null, mapWatcher?: MapWatcher) {
    const saved = new Map<string, { settled: boolean; at: string }>();
    const store = {
      choices: vi.fn(async (_login: string, _repo: string) => Object.fromEntries([...saved].map(([key, choice]) => [Number(key), choice]))),
      set: vi.fn(async (_login: string, _repo: string, mapNumber: number, choice: { settled: boolean; at: string }) => {
        saved.set(String(mapNumber), choice);
      }),
    };
    const fetcher = vi.fn<RepositoryFetcher>(async ({ choices }) => ({
      maps: [{ ...sampleMap, settled: choices?.[5]?.settled === true ? { reason: 'manual', since: choices[5].at } : null }],
      warnings: [],
    }));
    const running = startServer({
      config,
      repo: null,
      template: DEFAULT_TEMPLATE,
      workspaceRoot: null,
      t3,
      fetcher,
      homeLoader: async () => home,
      handOffStore: new HandOffStore({ filePath: null }),
      settling: { login: async () => login, store },
      ...(mapWatcher === undefined ? {} : { mapWatcher }),
    });
    return { running, store, fetcher };
  }

  const post = (url: string, body: unknown) =>
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  it('stores a settle for the signed-in login and keeps it for the next read', async () => {
    const { running: started, store, fetcher } = settlingServer('octo');
    const running = await started;
    try {
      await fetch(`${running.url}/api/repos/octo/one/snapshot`);
      const response = await post(`${running.url}/api/repos/octo/one/settle`, { map: 5, settled: true });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { maps: WayfinderMap[] };
      expect(body.maps[0]?.settled).toMatchObject({ reason: 'manual' });
      expect(store.set).toHaveBeenCalledWith('octo', 'octo/one', 5, expect.objectContaining({ settled: true }));

      // A fresh read, as after a restart, applies the stored choice.
      const refreshed = (await (await fetch(`${running.url}/api/repos/octo/one/snapshot?refresh=1`)).json()) as { maps: WayfinderMap[] };
      expect(refreshed.maps[0]?.settled).toMatchObject({ reason: 'manual' });
      expect(fetcher).toHaveBeenLastCalledWith(expect.objectContaining({ choices: { 5: expect.objectContaining({ settled: true }) } }));
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  it('refuses a settle with no one signed in or no map named', async () => {
    const { running: started } = settlingServer(null);
    const running = await started;
    try {
      expect((await post(`${running.url}/api/repos/octo/one/settle`, { map: 5, settled: true })).status).toBe(409);
      expect((await post(`${running.url}/api/repos/octo/one/settle`, { map: 'x', settled: true })).status).toBe(400);
      expect((await post(`${running.url}/api/repos/octo/one/settle`, { map: 5 })).status).toBe(400);
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  it('never watches a settled map', async () => {
    const readMap = vi.fn(async (): Promise<MapRead> => ({ status: 'unchanged', rateLimit: null, pollIntervalSeconds: null }));
    const mapWatcher = new MapWatcher({ readMap, readPullRequests: async () => ({ byTicket: new Map(), lastCommits: new Map(), rateLimit: null }) }, { intervalMs: 10 });
    const { running: started } = settlingServer('octo', mapWatcher);
    const running = await started;
    try {
      await post(`${running.url}/api/repos/octo/one/settle`, { map: 5, settled: true });
      await fetch(`${running.url}/api/repos/octo/one/snapshot?refresh=1`);
      const response = await fetch(`${running.url}/api/repos/octo/one/events?map=5`);
      expect(response.status).toBe(409);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(readMap).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve) => {
        running.server.close(() => resolve());
        running.server.closeAllConnections();
      });
    }
  });
});
