import { expect, it, vi } from 'vitest';
import { startServer, DEFAULT_TEMPLATE } from './server.js';
import { DEFAULTS } from './config.js';
import { HandOffStore } from './handOffTracking.js';
import { prototypeFileUrl } from './prototypes.js';
import { prototypeTileHtml } from './ui/prototypeTile.js';
import type { Prototype } from './types.js';

const read = vi.hoisted(() => vi.fn(async () => Buffer.from('<html><body>Prototype</body></html>')));
vi.mock('./github.js', async (load) => ({ ...(await load<typeof import('./github.js')>()), fetchBranchFile: read }));

it('keeps PROTOTYPE_CSP on branch and cached SHA responses, iframe sandbox and API rejection', async () => {
  const sha = 'a'.repeat(40);
  const prototype: Prototype = {
    branch: 'prototype/207',
    sha,
    ticketNumber: 207,
    mapNumber: 205,
    url: 'https://github.com/o/r',
    updatedAt: null,
    files: [],
    openable: [],
    preview: 'prototype-snapshot.html',
    verdict: null,
  };
  const server = await startServer({
    config: { ...DEFAULTS, repo: null, cwd: process.cwd(), port: 0, open: false },
    repo: null,
    template: DEFAULT_TEMPLATE,
    workspaceRoot: null,
    t3: {
      models: async () => ({ providers: [] }),
      projects: async () => [],
      steps: () => ({
        startThread: async () => ({ threadId: 'unused', prompt: '' }),
        openApp: async () => undefined,
        copy: async () => undefined,
      }),
    },
    handOffStore: new HandOffStore({ filePath: null }),
    fetcher: async () => ({ maps: [], warnings: [] }),
  });
  try {
    const url = server.url + prototypeFileUrl('o/r', prototype.branch, prototype.preview!, sha);
    for (let i = 0; i < 2; i++) {
      const response = await fetch(url);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-security-policy')).toBe(
        'sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads',
      );
      expect(response.headers.get('cache-control')).toContain('immutable');
      expect(await response.text()).toContain('wf: 1');
    }
    expect(read).toHaveBeenCalledTimes(1);
    const branch = await fetch(server.url + prototypeFileUrl('o/r', prototype.branch, prototype.preview!));
    expect(branch.headers.get('cache-control')).toBe('no-store');
    expect(branch.headers.get('content-security-policy')).toBe(
      'sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads',
    );
    for (const method of ['GET', 'POST']) {
      const denied = await fetch(server.url + '/api/shutdown', { method, headers: { Origin: 'null' } });
      expect(denied.status).toBe(403);
    }
    expect(prototypeTileHtml('o/r', prototype, { title: 'Canvas', eyebrow: 'Prototype' })).toContain('sandbox="allow-scripts"');
  } finally {
    await new Promise<void>((resolve) => server.server.close(() => resolve()));
  }
});
