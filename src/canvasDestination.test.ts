import { describe, expect, it, vi } from 'vitest';
import { pinnedCanvasRoute } from './canvasDestination.js';
import { PROTOTYPE_HOST_VERSION } from './prototypes.js';

const revision = 'a'.repeat(40);
const link = { kind: 'prototype', id: 'node', canvas: 'prototypes/removed-board/index.html', revision, page: 'old', item: 'A' } as const;
const destination = { kind: 'prototype', id: 'node', repo: 'o/r', mapNumber: 5, ticketNumber: 11 } as const;

describe('pinned canvas files', () => {
  it('reads only the requested revision and proves board ownership from its archived config', async () => {
    const read = vi.fn(async (_repo: string, _rev: string, file: string) => Buffer.from(file.endsWith('config.js')
      ? 'window.CANVAS = { ticket: 11, title: "Old board" };' : '<html><body>old revision</body></html>'));
    const route = await pinnedCanvasRoute(link, destination, read);
    expect(read.mock.calls).toEqual([
      ['o/r', revision, link.canvas], ['o/r', revision, 'prototypes/removed-board/config.js'],
    ]);
    expect(route).toMatchObject({ ticket: 11, title: '#11 Old board', page: 'old', variant: 'A' });
    expect(route?.url).toContain(`/prototype%2F11/${revision}/${PROTOTYPE_HOST_VERSION}/${link.canvas}`);
    expect(route?.github).toBe(`https://github.com/o/r/tree/${revision}/${link.canvas}`);
  });
  it('rejects another ticket’s board and incomplete metadata without executing config code', async () => {
    for (const config of ['window.CANVAS = { ticket: 12 };', 'window.CANVAS = {}', 'window.CANVAS = globalThis.stolen = 11']) {
      expect(await pinnedCanvasRoute(link, destination, async (_repo, _rev, file) => Buffer.from(file.endsWith('config.js') ? config : '<html></html>'))).toBeNull();
    }
    await expect(pinnedCanvasRoute(link, destination, async () => { throw new Error('offline'); })).rejects.toThrow('offline');
  });
});
