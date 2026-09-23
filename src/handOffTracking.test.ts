import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { HandOffStore, HandOffTracker, mapT3Status } from './handOffTracking.js';

const input = {
  repo: 'octo/one',
  mapNumber: 5,
  ticketNumber: 11,
  title: 'Retire API agents',
  t3Origin: 'http://127.0.0.1:3773',
  threadId: 'thread-1',
  requestedBranch: 'wayfinder/11-retire-api-agents',
  rung: 'thread' as const,
};

describe('mapT3Status', () => {
  it('maps waiting, running, settled, interrupted, failed, and starting T3 states', () => {
    expect(mapT3Status({ id: 'waiting', hasPendingUserInput: true, session: { status: 'running' } })?.status).toBe('waiting');
    expect(mapT3Status({ id: 'running', session: { status: 'running' } })?.status).toBe('running');
    expect(mapT3Status({ id: 'finished', latestTurn: { state: 'completed', settledAt: '2026-09-22T12:00:00Z' } })?.status).toBe(
      'finished',
    );
    expect(mapT3Status({ id: 'interrupted', latestTurn: { state: 'interrupted' } })?.status).toBe('interrupted');
    expect(mapT3Status({ id: 'failed', session: { status: 'error', lastError: 'provider failed' } })?.status).toBe('failed');
    expect(mapT3Status({ id: 'starting' })?.status).toBe('starting');
    expect(mapT3Status({ projectId: 'missing-thread-id' })).toBeNull();
  });

  it('keeps the observed branch and T3 reported pull request references', () => {
    expect(
      mapT3Status({
        id: 'thread-1',
        branch: 'wayfinder/11-retire-api-agents-2',
        pullRequests: [{ number: 23, url: 'https://github.com/octo/one/pull/23', state: 'open', syncedAt: '2026-09-22T12:00:00Z' }],
      }),
    ).toMatchObject({
      branch: 'wayfinder/11-retire-api-agents-2',
      pullRequests: [{ number: 23, url: 'https://github.com/octo/one/pull/23', state: 'open' }],
    });
  });
});

describe('HandOffStore', () => {
  it('persists thread identity and status fields without storing prompts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wayfinder-hand-offs-'));
    const filePath = join(directory, 'hand-offs.json');
    try {
      const store = new HandOffStore({ filePath, now: () => new Date('2026-09-22T12:00:00.000Z') });
      const saved = await store.record(input);
      expect(saved).toMatchObject({
        repo: 'octo/one',
        mapNumber: 5,
        ticketNumber: 11,
        threadId: 'thread-1',
        status: 'starting',
      });
      const contents = await readFile(filePath, 'utf8');
      expect(contents).not.toContain('prompt');
      expect(contents).not.toContain('secret user request');
      const restarted = new HandOffStore({ filePath });
      await expect(restarted.list()).resolves.toMatchObject([{ id: saved.id, threadId: 'thread-1' }]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('updates only from current sequence data and prunes 30 days after terminal status', async () => {
    let now = new Date('2026-09-01T00:00:00.000Z');
    const store = new HandOffStore({ filePath: null, now: () => now });
    await store.record(input);

    await store.applySnapshot('env-1', input.t3Origin ?? '', {
      snapshotSequence: 10,
      threads: [{ id: 'thread-1', projectId: 'project-1', session: { status: 'running' } }],
    });
    await store.applySnapshot('env-1', input.t3Origin ?? '', {
      snapshotSequence: 9,
      threads: [{ id: 'thread-1', projectId: 'project-1', hasPendingApprovals: true }],
    });
    await expect(store.list()).resolves.toMatchObject([{ status: 'running', sequence: 10 }]);

    now = new Date('2026-09-02T00:00:00.000Z');
    await store.applySnapshot('env-1', input.t3Origin ?? '', {
      snapshotSequence: 11,
      threads: [{ id: 'thread-1', projectId: 'project-1', latestTurn: { state: 'completed', settledAt: now.toISOString() } }],
    });
    now = new Date('2026-10-01T00:00:00.000Z');
    await expect(store.list()).resolves.toHaveLength(1);
    now = new Date('2026-10-03T00:00:00.000Z');
    await expect(store.list()).resolves.toHaveLength(0);
  });
});

describe('HandOffTracker', () => {
  it('keeps the last known status visible as stale when T3 Code is down', async () => {
    const store = new HandOffStore({ filePath: null });
    await store.record(input);
    const tracker = new HandOffTracker(store, {
      readHandOffSnapshot: vi.fn(async () => {
        throw new Error('T3 Code is not running');
      }),
    });

    try {
      const snapshot = await tracker.snapshot();
      expect(snapshot.t3.available).toBe(false);
      expect(snapshot.handOffs).toMatchObject([{ status: 'starting', stale: true, threadId: 'thread-1' }]);
    } finally {
      tracker.close();
    }
  });

  it('starts a shell stream after its HTTP snapshot and applies newer events', async () => {
    const store = new HandOffStore({ filePath: null });
    await store.record(input);
    let deliver: (value: unknown) => void = () => undefined;
    const subscribeShell = vi.fn(async (_sequence: number | null, listener: (value: unknown) => void) => {
      deliver = listener;
      return () => undefined;
    });
    const tracker = new HandOffTracker(store, {
      readHandOffSnapshot: async () => ({
        environmentId: 'env-1',
        origin: input.t3Origin ?? '',
        snapshot: { snapshotSequence: 10, threads: [{ id: 'thread-1', projectId: 'project-1', session: { status: 'running' } }] },
      }),
      subscribeShell,
    });

    try {
      const snapshot = await tracker.snapshot();
      expect(subscribeShell).toHaveBeenCalledWith(10, expect.any(Function), expect.any(Function));
      deliver({ type: 'thread-upserted', sequence: 11, thread: { id: 'thread-1', projectId: 'project-1', hasPendingUserInput: true } });
      await vi.waitFor(async () => {
        const current = await store.list();
        expect(current[0]?.status).toBe('waiting');
      });
      expect(snapshot.handOffs[0]?.status).toBe('running');
    } finally {
      tracker.close();
    }
  });

  it('uses GitHub as a fallback when T3 reports a branch without a pull request', async () => {
    const store = new HandOffStore({ filePath: null });
    await store.record(input);
    const lookupPullRequests = vi.fn(async () => [
      {
        number: 42,
        url: 'https://github.com/octo/one/pull/42',
        state: 'OPEN',
        mergedAt: null,
        syncedAt: null,
        source: 'github' as const,
      },
    ]);
    const tracker = new HandOffTracker(
      store,
      {
        readHandOffSnapshot: async () => ({
          environmentId: 'env-1',
          origin: input.t3Origin ?? '',
          snapshot: {
            snapshotSequence: 3,
            threads: [{ id: 'thread-1', projectId: 'project-1', branch: 'wayfinder/11-retire-api-agents' }],
          },
        }),
      },
      { lookupPullRequests },
    );

    try {
      await tracker.snapshot();
      await vi.waitFor(async () => {
        await expect(store.list()).resolves.toMatchObject([
          { pullRequests: [{ number: 42, source: 'github', url: 'https://github.com/octo/one/pull/42' }] },
        ]);
      });
      expect(lookupPullRequests).toHaveBeenCalledWith('octo/one', 'wayfinder/11-retire-api-agents');
    } finally {
      tracker.close();
    }
  });
});
