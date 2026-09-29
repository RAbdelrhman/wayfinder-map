import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { MapEvent, WatchedTicket } from './mapWatch.js';
import { MapWatchStore } from './mapWatchStore.js';

const directories: string[] = [];

async function temporaryStore(): Promise<{ store: MapWatchStore; path: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'wayfinder-map-watch-'));
  directories.push(directory);
  const path = join(directory, 'map-watches.json');
  return { store: new MapWatchStore(path), path };
}

function ticket(number: number, state: WatchedTicket['state']): WatchedTicket {
  return { number, title: `Ticket ${String(number)}`, state, pullRequests: [] };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('MapWatchStore', () => {
  it('saves the watch set, ETags, snapshots, event history, and event cursor for the next app start', async () => {
    const { store, path } = await temporaryStore();
    const event: MapEvent = {
      id: 7,
      repo: 'octo/repo',
      mapNumber: 121,
      at: '2026-09-29T12:00:00.000Z',
      type: 'ticket-next',
      ticket: { number: 10, title: 'Ready' },
      from: 'blocked',
      whileYouWereAway: true,
    };
    const draftChanged: MapEvent = {
      id: 8,
      repo: 'octo/repo',
      mapNumber: 121,
      at: '2026-09-29T12:01:00.000Z',
      type: 'pr-draft-changed',
      ticket: { number: 10, title: 'Ready' },
      pullRequest: { number: 12, url: 'https://github.com/octo/repo/pull/12', state: 'open', draft: false, checks: 'passing', review: 'review_required' },
      from: true,
      to: false,
    };

    await store.save({
      nextEventId: 9,
      maps: [{
        repo: 'octo/repo',
        mapNumber: 121,
        etag: 'W/"abc"',
        tickets: [ticket(10, 'frontier')],
        history: [event, draftChanged],
        pullRequestsRead: [10],
        lastPolledAt: 1790683200000,
      }],
    });
    expect(await readFile(path, 'utf8')).toContain('"version": 1');

    await expect(store.load()).resolves.toEqual({
      nextEventId: 9,
      maps: [{
        repo: 'octo/repo',
        mapNumber: 121,
        etag: 'W/"abc"',
        tickets: [ticket(10, 'frontier')],
        history: [event, draftChanged],
        pullRequestsRead: [10],
        lastPolledAt: 1790683200000,
      }],
    });
  });

  it('ignores a malformed state file', async () => {
    const { store, path } = await temporaryStore();
    await writeFile(path, '{broken', 'utf8');
    await expect(store.load()).resolves.toBeNull();
  });
});
