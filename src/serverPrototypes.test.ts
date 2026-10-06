import { describe, expect, it, vi } from 'vitest';

import type { Config } from './config.js';
import { branchesByMap } from './github.js';
import { HandOffStore } from './handOffTracking.js';
import { prototypeTicketNumber } from './prototypes.js';
import { startServer } from './server.js';
import type { ServerT3 } from './server.js';
import type { Prototype, WayfinderMap } from './types.js';

const fetchPrototypes = vi.fn(
  async (repo: string, map: WayfinderMap): Promise<Prototype[]> => [
    {
      branch: `prototype/${String(map.number)}-x`,
      ticketNumber: map.number,
      mapNumber: map.number,
      url: `https://github.com/${repo}/tree/prototype/${String(map.number)}-x`,
      updatedAt: null,
      files: ['index.html'],
      openable: ['index.html'],
      preview: 'index.html',
      verdict: null,
    },
  ],
);
const fetchAllPrototypes = vi.fn(
  async (repo: string, maps: readonly WayfinderMap[]): Promise<Prototype[]> =>
    branchesByMap(['refs/heads/prototype/70-x', 'refs/heads/prototype/80-x', 'refs/heads/prototype/90-x'], maps)
      .flatMap(({ map, branches }) => branches.map((branch) => ({
        branch,
        ticketNumber: prototypeTicketNumber(branch)!,
        mapNumber: map.number,
        url: `https://github.com/${repo}/tree/${branch}`,
        updatedAt: null,
        files: ['index.html'],
        openable: ['index.html'],
        preview: 'index.html',
        verdict: null,
      }))),
);
const fetchMapDetails = vi.fn(async (_options: unknown, unread: readonly WayfinderMap[]) => ({
  maps: unread.map((candidate) => ({ ...candidate, tickets: map(candidate.number).tickets, ticketsLoaded: true })), warnings: [],
}));
const fetchBranchFile = vi.fn(async (repo: string, _branch: string, _file: string) => Buffer.from(`<h1>${repo}</h1>`));

vi.mock('./github.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('./github.js')>(),
  fetchPrototypes: (repo: string, map: WayfinderMap) => fetchPrototypes(repo, map),
  fetchAllPrototypes: (repo: string, maps: readonly WayfinderMap[]) => fetchAllPrototypes(repo, maps),
  fetchBranchFile: (repo: string, branch: string, file: string) => fetchBranchFile(repo, branch, file),
  fetchMaps: async () => ({ maps: [], warnings: [] }),
  haveMapTicketsChanged: async () => false,
  fetchMapDetails: (options: unknown, unread: readonly WayfinderMap[]) => fetchMapDetails(options, unread),
  gh: async () => '',
}));

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

function map(number: number): WayfinderMap {
  return {
    number,
    title: `map ${String(number)}`,
    url: `https://github.com/octo/one/issues/${String(number)}`,
    body: '',
    open: true,
    author: 'octocat',
    visibility: 'private',
    sections: { destination: '', fog: '', decisions: '', notes: '', outOfScope: '' },
    tickets: [{ number: number * 10, title: 'Prototype ticket', url: '', body: '', type: 'task', labels: [], open: true, assignee: null, blockedBy: [], openBlockers: [], state: 'frontier', updatedAt: null }],
    outside: [],
    criticalPath: { tickets: [], remaining: 0 },
    stalled: [],
    pullRequests: [],
    settled: null,
    ticketsLoaded: true,
  };
}

async function serve(maps?: WayfinderMap[]): Promise<Awaited<ReturnType<typeof startServer>>> {
  return startServer({
    config,
    repo: null,
    template: 'prompt',
    workspaceRoot: null,
    t3,
    handOffStore: new HandOffStore(),
    mapWatchStore: { load: async () => null, save: async () => undefined },
    fetcher: async ({ repo }) => ({ maps: maps ?? [map(repo === 'octo/two' ? 9 : 7)], warnings: [] }),
    homeLoader: async () => {
      throw new Error('not used');
    },
  });
}

describe('prototypes on a repository-scoped server', () => {
  it('lists a map\u2019s prototypes per repository and caches them', async () => {
    fetchPrototypes.mockClear();
    const running = await serve();

    try {
      const one = await fetch(`${running.url}/api/repos/octo/one/prototypes?map=7`).then((response) => response.json());
      const two = await fetch(`${running.url}/api/repos/octo/two/prototypes?map=9`).then((response) => response.json());
      const again = await fetch(`${running.url}/api/repos/octo/one/prototypes?map=7`).then((response) => response.json());
      expect(one).toMatchObject([{ branch: 'prototype/7-x' }]);
      expect(two).toMatchObject([{ branch: 'prototype/9-x' }]);
      expect(again).toEqual(one);
      expect(fetchPrototypes).toHaveBeenCalledTimes(2);
      expect(fetchPrototypes.mock.calls.map(([repo]) => repo)).toEqual(['octo/one', 'octo/two']);
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  it('lists every map’s prototypes when no map is named', async () => {
    fetchAllPrototypes.mockClear();
    const running = await serve();

    try {
      const all = await fetch(`${running.url}/api/repos/octo/one/prototypes`).then((response) => response.json());
      expect(all).toMatchObject([{ branch: 'prototype/70-x', ticketNumber: 70, mapNumber: 7 }]);
      expect(fetchAllPrototypes).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  it('includes prototype branches on unread settled maps in the repository gallery', async () => {
    fetchMapDetails.mockClear();
    fetchAllPrototypes.mockClear();
    const settled = { ...map(8), settled: { reason: 'closed' as const, since: '2026-08-01T00:00:00.000Z' }, tickets: [], ticketsLoaded: false };
    const running = await serve([map(7), settled]);

    try {
      await fetch(`${running.url}/api/repos/octo/one/snapshot`);
      expect(fetchMapDetails).not.toHaveBeenCalled();
      const all = await fetch(`${running.url}/api/repos/octo/one/prototypes`).then((response) => response.json());
      expect(all).toMatchObject([
        { branch: 'prototype/70-x', ticketNumber: 70, mapNumber: 7 },
        { branch: 'prototype/80-x', ticketNumber: 80, mapNumber: 8 },
      ]);
      expect(fetchMapDetails).toHaveBeenCalledTimes(1);
      expect(fetchMapDetails.mock.calls[0]?.[1].map((candidate) => candidate.number)).toEqual([8]);
      expect(fetchAllPrototypes.mock.calls[0]?.[1].find((candidate) => candidate.number === 8)?.settled).toEqual(settled.settled);
      const again = await fetch(`${running.url}/api/repos/octo/one/prototypes`).then((response) => response.json());
      expect(again).toEqual(all);
      expect(fetchAllPrototypes).toHaveBeenCalledTimes(1);
      expect(fetchMapDetails).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  it('answers 404 for a map the repository does not have', async () => {
    const running = await serve();

    try {
      const response = await fetch(`${running.url}/api/repos/octo/one/prototypes?map=404`);
      expect(response.status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  it('serves a prototype file from the repository named in the path, sandboxed', async () => {
    fetchBranchFile.mockClear();
    const running = await serve();

    try {
      const response = await fetch(`${running.url}/proto/octo/two/prototype%2F9-x/index.html`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-security-policy')).toContain('sandbox');
      await expect(response.text()).resolves.toBe('<h1>octo/two</h1>');
      expect(fetchBranchFile).toHaveBeenCalledWith('octo/two', 'prototype/9-x', 'index.html');
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });

  it('routes independent boards to distinct branch files with the same sandbox policy', async () => {
    const running = await serve();
    try {
      for (const board of ['prototypes/canvas/index.html', 'prototypes/9-x/index.html']) {
        const response = await fetch(`${running.url}/proto/octo/two/prototype%2F9-x/${board}`);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-security-policy')).toContain('sandbox');
        expect(response.headers.get('content-security-policy')).not.toContain('allow-same-origin');
        expect(fetchBranchFile).toHaveBeenCalledWith('octo/two', 'prototype/9-x', board);
        await response.arrayBuffer();
      }
      const blocked = await fetch(`${running.url}/proto/octo/two/feature%2F9-x/prototypes/9-x/index.html`);
      expect(blocked.status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });
});

describe('the app page policy', () => {
  it('lets the gallery frame its own prototypes and nothing from elsewhere', async () => {
    const { PAGE_CSP } = await import('./server.js');
    expect(PAGE_CSP).toContain("frame-src 'self'");
    expect(PAGE_CSP).not.toContain('frame-src *');
    expect(PAGE_CSP).toContain("object-src 'none'");
    expect(PAGE_CSP).toContain('https://github.com');
    expect(PAGE_CSP).toContain('https://avatars.githubusercontent.com');
  });
});
