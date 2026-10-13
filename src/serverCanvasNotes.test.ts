import { describe, expect, it, vi } from 'vitest';

import { canvasNotesComment } from './canvasNotes.js';
import type { Config } from './config.js';
import { HandOffStore } from './handOffTracking.js';
import { startServer } from './server.js';
import type { ServerT3 } from './server.js';
import type { Ticket } from './types.js';

const fetchTicket = vi.fn(async (_repo: string, number: number): Promise<Ticket | null> => ({
  number,
  title: 'Prototype the home page',
  url: '',
  body: '',
  type: number === 42 ? 'prototype' : 'task',
  labels: [],
  open: true,
  assignee: null,
  blockedBy: [],
  openBlockers: [],
  state: 'frontier',
  updatedAt: null,
}));
const postIssueComment = vi.fn(async (repo: string, number: number, _body: string) => ({
  url: `https://github.com/${repo}/issues/${String(number)}#issuecomment-1`,
}));

vi.mock('./github.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./github.js')>()),
  fetchTicket: (repo: string, number: number) => fetchTicket(repo, number),
  postIssueComment: (repo: string, number: number, body: string) => postIssueComment(repo, number, body),
  fetchMaps: async () => ({ maps: [], warnings: [] }),
  haveMapTicketsChanged: async () => false,
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

const comment = canvasNotesComment(
  { branch: 'prototype/42-home', sha: null, source: 'dom', pages: ['home'], options: { home: ['B'] } },
  [{ type: 'note', page: 'home', pageTitle: 'Home', option: 'B', optionName: 'Split hero', note: 'Too tall.' }],
);

describe('posting canvas notes (#213)', () => {
  it('posts one canvas-notes comment to a prototype ticket, and nothing else', async () => {
    const running = await startServer({
      config,
      repo: null,
      template: 'prompt',
      workspaceRoot: null,
      t3,
      handOffStore: new HandOffStore(),
      mapWatchStore: { load: async () => null, save: async () => undefined },
      fetcher: async () => ({ maps: [], warnings: [] }),
      homeLoader: async () => {
        throw new Error('not used');
      },
    });
    const post = (body: unknown, headers: Record<string, string> = {}): Promise<Response> =>
      fetch(`${running.url}/api/repos/octo/one/canvas-notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
    try {
      const ok = await post({ ticket: 42, body: comment });
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual({ url: 'https://github.com/octo/one/issues/42#issuecomment-1' });
      expect(postIssueComment).toHaveBeenCalledWith('octo/one', 42, comment);

      postIssueComment.mockClear();
      expect((await post({ ticket: 7, body: comment })).status).toBe(404);
      expect((await post({ ticket: 42, body: 'Closing as done.' })).status).toBe(400);
      expect((await post({ ticket: 'x', body: comment })).status).toBe(400);
      // A sandboxed canvas sends Origin: null, so it can never post on the person's behalf.
      expect((await post({ ticket: 42, body: comment }, { origin: 'null' })).status).toBe(403);
      expect(postIssueComment).not.toHaveBeenCalled();

      postIssueComment.mockRejectedValueOnce(new Error('HTTP 403: Resource not accessible'));
      const refused = await post({ ticket: 42, body: comment });
      expect(refused.status).toBe(502);
      expect(await refused.json()).toEqual({ error: 'HTTP 403: Resource not accessible' });
    } finally {
      await new Promise<void>((resolve) => running.server.close(() => resolve()));
    }
  });
});
