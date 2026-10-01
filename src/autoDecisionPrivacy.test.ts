import { afterEach, describe, expect, it, vi } from 'vitest';

const ghCalls = vi.hoisted(() => [] as string[][]);

vi.mock('./github.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./github.js')>()),
  gh: vi.fn(async (args: string[]) => {
    ghCalls.push(args);
    if (args[0] === 'pr' && args[1] === 'list') {
      return JSON.stringify([{ number: 42, state: 'OPEN', url: 'https://github.com/octo/one/pull/42', mergedAt: null }]);
    }
    return JSON.stringify({ state: 'MERGED', mergedAt: '2026-09-30T13:00:00Z' });
  }),
}));

import { HandOffStore } from './handOffTracking.js';
import { DEFAULT_TEMPLATE, startServer } from './server.js';
import type { ServerT3 } from './server.js';
import type { Config } from './config.js';
import type { Ticket, WayfinderMap } from './types.js';
import { WorkspaceResolver } from './workspaces.js';

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

const ticket: Ticket = {
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

const map: WayfinderMap = {
  number: 5,
  title: 'Roadmap v1',
  url: 'https://github.com/octo/one/issues/5',
  body: '## Destination\nLaunch product',
  open: true,
  author: 'octocat',
  visibility: 'private',
  sections: { destination: 'Launch product', notes: '', decisions: '', fog: '', outOfScope: '' },
  tickets: [ticket],
  outside: [],
  criticalPath: { tickets: [], remaining: 0 },
  settled: null,
  ticketsLoaded: true,
  stalled: [],
  pullRequests: [],
};

const SECRETS = ['acct-9f3a', 'sk-live-secret', '91.5', 'usedPercent', 'Hard: concurrent starts share one T3 connection', 'rules-1'];

const t3: ServerT3 = {
  models: async () => ({ providers: [] }),
  projects: async () => [],
  steps: () => ({
    startThread: async () => ({ threadId: 'auto-thread', prompt: 'prompt' }),
    openApp: async () => undefined,
    copy: async () => undefined,
  }),
  readHandOffSnapshot: async () => ({
    environmentId: 't3-env',
    origin: 'http://127.0.0.1:3773',
    snapshot: {
      snapshotSequence: 3,
      threads: [{
        id: 'auto-thread',
        projectId: 't3-project',
        branch: 'wayfinder/11-retire-api-agents',
        modelSelection: { instanceId: 'claude', model: 'opus' },
        session: { status: 'error', lastError: 'You have hit your usage limit (91.5%)' },
      }],
    },
  }),
  subscribeShell: async () => () => undefined,
};

afterEach(() => {
  ghCalls.length = 0;
});

describe('Auto decisions stay off GitHub (#172)', () => {
  it('starts an Auto ticket and tracks it without any quota detail, credential or decision reaching gh', async () => {
    const store = new HandOffStore({ filePath: null });
    const running = await startServer({
      config,
      repo: null,
      template: DEFAULT_TEMPLATE,
      workspaceRoot: null,
      t3,
      workspaces: new WorkspaceResolver({
        knownProjects: async () => ['/clone'],
        verify: async (path, repo) => (repo === 'octo/one' && path === '/clone' ? '/clone' : null),
        readRemembered: async () => ({}),
        writeRemembered: async () => undefined,
      }),
      fetcher: async () => ({ maps: [map], warnings: [] }),
      homeLoader: async () => ({
        version: '0.0.0-dev',
        account: { status: 'ready', host: 'github.com', login: 'octo', accounts: ['octo'], missingScopes: [], tokenSource: 'keyring', message: null },
        repositories: ['octo/one'],
        skippedOrganizations: [],
        warning: null,
      }),
      handOffStore: store,
    });

    try {
      const response = await fetch(`${running.url}/api/repos/octo/one/hand-off`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: running.url },
        body: JSON.stringify({
          map: 5,
          ticket: 11,
          accountId: 'acct-9f3a',
          auto: {
            scoring: { version: 'rules-1', reason: 'Hard: concurrent starts share one T3 connection', apiKey: 'sk-live-secret' },
            proposed: { tier: 'hard', provider: 'codex', model: 'gpt-5.6-sol', effort: 'high', accountId: 'acct-9f3a' },
            final: { tier: 'mid', provider: 'codex', model: 'gpt-5.6-terra', effort: 'medium' },
            usage: { state: 'limited', observedAt: new Date().toISOString(), usedPercent: 91.5 },
          },
        }),
      });
      expect(response.status).toBe(200);
      await fetch(`${running.url}/api/hand-offs`, { headers: { origin: running.url } });
      await vi.waitFor(() => expect(ghCalls.length).toBeGreaterThan(0));
      await fetch(`${running.url}/api/hand-offs`, { headers: { origin: running.url } });

      const [saved] = await store.list();
      expect(saved?.auto).toMatchObject({ overrides: ['tier', 'model', 'effort'], usage: { state: 'limited' } });
      expect(saved?.tier).toBe('mid');

      const sent = JSON.stringify(ghCalls);
      for (const secret of SECRETS) expect(sent).not.toContain(secret);
      expect(ghCalls.length).toBeGreaterThan(0);
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });
});
