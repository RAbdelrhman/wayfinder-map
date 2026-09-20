import { describe, expect, it, vi } from 'vitest';

import type { Config } from './config.js';
import { startServer } from './server.js';
import type { ServerT3 } from './server.js';
import type { Prototype, WayfinderMap } from './types.js';

const fetchPrototypes = vi.fn(
  async (repo: string, map: WayfinderMap): Promise<Prototype[]> => [
    {
      branch: `prototype/${String(map.number)}-x`,
      ticketNumber: map.number,
      url: `https://github.com/${repo}/tree/prototype/${String(map.number)}-x`,
      updatedAt: null,
      files: ['index.html'],
      openable: ['index.html'],
      verdict: null,
    },
  ],
);
const fetchBranchFile = vi.fn(async (repo: string, _branch: string, _file: string) => Buffer.from(`<h1>${repo}</h1>`));

vi.mock('./github.js', () => ({
  fetchPrototypes: (repo: string, map: WayfinderMap) => fetchPrototypes(repo, map),
  fetchBranchFile: (repo: string, branch: string, file: string) => fetchBranchFile(repo, branch, file),
  fetchMaps: async () => ({ maps: [], warnings: [] }),
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
    sections: { destination: '', fog: '', decisions: '', notes: '', outOfScope: '' },
    tickets: [],
  };
}

async function serve(): Promise<Awaited<ReturnType<typeof startServer>>> {
  return startServer({
    config,
    repo: null,
    template: 'prompt',
    workspaceRoot: null,
    t3,
    fetcher: async ({ repo }) => ({ maps: [map(repo === 'octo/two' ? 9 : 7)], warnings: [] }),
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
});
