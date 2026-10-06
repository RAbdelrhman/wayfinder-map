import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WayfinderMap } from './types.js';

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn<(file: string, args: string[], options: unknown) => Promise<{ stdout: Buffer; stderr: Buffer }>>(),
}));

vi.mock('node:child_process', () => {
  Object.defineProperty(execFileMock, Symbol.for('nodejs.util.promisify.custom'), {
    value: (file: string, args: string[], options: unknown) => execFileMock(file, args, options),
  });
  return { execFile: execFileMock };
});

import { fetchPrototypes } from './github.js';

const map: WayfinderMap = {
  number: 4,
  title: 'Project',
  url: 'https://github.com/owner/repo/issues/4',
  body: '',
  open: true,
  author: 'octocat',
  visibility: 'private',
  sections: { destination: '', notes: '', decisions: '', fog: '', outOfScope: '' },
  tickets: [{
    number: 8, title: 'Home', url: 'https://github.com/owner/repo/issues/8', body: '',
    type: 'prototype', labels: [], open: true, assignee: null, blockedBy: [], openBlockers: [],
    state: 'frontier', updatedAt: null,
  }],
  outside: [],
  criticalPath: { tickets: [], remaining: 0 },
  stalled: [],
  pullRequests: [],
  settled: null,
  ticketsLoaded: true,
};

function branch(changed: string[], files: Record<string, string>): void {
  execFileMock.mockImplementation(async (command, args) => {
    expect(command).toBe('gh');
    const endpoint = args.find((arg) => arg.startsWith('repos/')) ?? '';
    let result: string;
    if (endpoint.endsWith('/git/matching-refs/heads/prototype/')) {
      result = JSON.stringify([{ ref: 'refs/heads/prototype/8-home' }]);
    } else if (endpoint === 'repos/owner/repo') {
      result = 'main';
    } else if (endpoint.includes('/compare/')) {
      result = JSON.stringify({ files: changed.map((filename) => ({ filename })) });
    } else if (endpoint.includes('/contents/')) {
      const match = /\/contents\/(.+)\?ref=prototype%2F8-home$/.exec(endpoint);
      const path = decodeURIComponent(match?.[1] ?? '');
      const content = files[path];
      if (content === undefined) throw new Error(`File not found: ${endpoint}`);
      result = content;
    } else {
      throw new Error(`Unexpected endpoint: ${endpoint}`);
    }
    return { stdout: Buffer.from(result), stderr: Buffer.alloc(0) };
  });
}

beforeEach(() => {
  execFileMock.mockReset();
});

describe('independent canvas discovery', () => {
  const legacy = 'prototypes/canvas/';
  const home = 'prototypes/8-home/';
  const files = {
    [`${legacy}index.html`]: '<h1>Legacy board</h1>',
    [`${legacy}config.js`]: "window.CANVAS = { items: [{ id: 'A', name: 'Unrelated viewer', src: 'variants/a.html' }] };",
    [`${legacy}variants/a.html`]: '<h1>Viewer</h1>',
    [`${home}index.html`]: '<h1>Home board</h1>',
    [`${home}config.js`]: "window.CANVAS = { ticket: 8, items: [{ id: 'A', name: 'Home' }] };",
    [`${home}variants/a.html`]: '<h1>Home</h1>',
  };

  it('selects the ticket canvas and reads its config and fallback pages, preserving other board links', async () => {
    branch([`${legacy}config.js`, `${legacy}variants/a.html`, `${home}config.js`, `${home}variants/a.html`], files);
    const [prototype] = await fetchPrototypes('owner/repo', map);
    expect(prototype).toMatchObject({
      branch: 'prototype/8-home', ticketNumber: 8, mapNumber: 4,
      preview: `${home}index.html`,
      canvases: [`${legacy}index.html`, `${home}index.html`],
      variants: [{ id: 'A', title: 'Home', page: `${home}variants/a.html`, shot: null }],
    });
    expect(execFileMock.mock.calls.every(([, args]) => args[0] === 'api' && !args.includes('--method'))).toBe(true);
  });

  it('finds a canvas after only a variant changes', async () => {
    branch([`${home}variants/a.html`], files);
    const [prototype] = await fetchPrototypes('owner/repo', map);
    expect(prototype).toMatchObject({
      preview: `${home}index.html`, canvases: [`${home}index.html`],
      variants: [{ id: 'A', title: 'Home', page: `${home}variants/a.html` }],
    });
  });

  it('keeps legacy single-canvas branches working', async () => {
    branch([`${legacy}config.js`], files);
    const [prototype] = await fetchPrototypes('owner/repo', map);
    expect(prototype).toMatchObject({
      preview: `${legacy}index.html`, canvases: [`${legacy}index.html`],
      variants: [{ id: 'A', title: 'Unrelated viewer', page: `${legacy}variants/a.html` }],
    });
  });

  it('does not call an ordinary index a canvas when its adjacent config is missing', async () => {
    branch(['site/variants/a.html'], {
      'site/index.html': '<h1>Site</h1>', 'site/variants/a.html': '<h1>Page</h1>',
    });
    const [prototype] = await fetchPrototypes('owner/repo', map);
    expect(prototype?.canvases).toEqual([]);
    expect(prototype?.variants).toEqual([]);
  });
});
