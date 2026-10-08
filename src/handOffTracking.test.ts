import { mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { buildAutoDecision, usageAgeMs } from './autoDecision.js';
import {
  HandOffStore,
  HandOffTracker,
  mapT3Status,
  representativeHandOffs,
  USAGE_LIMIT_LABEL,
  type HandOffStatusDto,
} from './handOffTracking.js';

// Keep the tracker's default GitHub lookups off the network.
vi.mock('./github.js', () => ({ gh: () => Promise.reject(new Error('GitHub is not available in tests.')) }));

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
  it.each([null, {}, { threads: null }, { threads: [], archivedThreads: null }, { threads: [{}] }])('keeps previously observed hand-offs when a shell is malformed: %j', async (snapshot) => {
    const store = new HandOffStore({ filePath: null });
    await store.record(input);
    await store.applySnapshot('env-1', input.t3Origin, { snapshotSequence: 1, threads: [{ id: input.threadId, status: 'running' }] });
    await expect(store.applySnapshot('env-1', input.t3Origin, snapshot)).rejects.toThrow('incompatible orchestration');
    expect(await store.list()).toMatchObject([{ status: 'running', sequence: 1 }]);
  });
  it('tracks v2 updates and retains a thread when it moves into the archive', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wayfinder-v2-hand-offs-'));
    try {
      const store = new HandOffStore({ filePath: join(directory, 'hand-offs.json') });
      await store.record(input);
      await store.applyEvent('env-1', input.t3Origin, {
        kind: 'thread.updated', sequence: 1, location: 'active', thread: { id: input.threadId, status: 'running' },
      });
      expect(await store.list()).toMatchObject([{ status: 'running' }]);
      await store.applyEvent('env-1', input.t3Origin, { kind: 'thread.removed', location: 'active', threadId: input.threadId });
      expect(await store.list()).toHaveLength(1);
      await store.applySnapshot('env-1', input.t3Origin, {
        snapshotSequence: 2, threads: [], archivedThreads: [{ id: input.threadId, status: 'completed', settledAt: '2026-10-07T12:00:00Z' }],
      });
      expect(await store.list()).toMatchObject([{ status: 'finished' }]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it.each([
    ['running', 'running'], ['waiting', 'waiting'], ['completed', 'ready'],
    ['failed', 'failed'], ['interrupted', 'interrupted'], ['cancelled', 'interrupted'],
    ['preparing', 'starting'], ['queued', 'starting'], ['idle', 'ready'],
  ])('maps v2 %s to %s', (status, expected) => {
    expect(mapT3Status({ id: 'v2', status })?.status).toBe(expected);
  });

  it('reads v2 pending questions and settled completion', () => {
    expect(mapT3Status({ id: 'v2', status: 'waiting', pendingRuntimeRequest: { kind: 'user_input' } })).toMatchObject({ status: 'waiting', pendingUserInput: true });
    expect(mapT3Status({ id: 'v2', status: 'completed', settledAt: '2026-10-07T12:00:00Z' })?.status).toBe('finished');
  });

  it('uses the active v2 run before a completed latest run', () => {
    expect(mapT3Status({ id: 'v2', status: 'completed', activityRunStatus: 'running' })?.status).toBe('running');
    expect(mapT3Status({ id: 'v2', status: 'completed', activityRunStatus: 'waiting' })?.status).toBe('waiting');
    expect(mapT3Status({ id: 'v2', status: 'completed', activityRunStatus: 'preparing' })?.status).toBe('starting');
    expect(mapT3Status({ id: 'v2', status: 'completed', activityRunStatus: null, settledAt: null })?.status).toBe('ready');
  });
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

  it('swaps a usage-limit error for a fixed label and keeps the text apart, in memory only', () => {
    const message = 'You have hit your usage limit (91.5% of the 5h window). Account acct-123. Resets at 4:00 PM.';
    expect(mapT3Status({ id: 'limited', session: { status: 'error', lastError: message } })).toMatchObject({
      status: 'failed',
      lastError: USAGE_LIMIT_LABEL,
      rawError: message,
    });
    expect(mapT3Status({ id: 'limited', session: { status: 'error', lastError: `${'x'.repeat(600)} usage limit` } })?.lastError).toBe(USAGE_LIMIT_LABEL);
  });

  it('keeps any other error message', () => {
    expect(mapT3Status({ id: 'failed', session: { status: 'error', lastError: 'Cannot find module' } })).toMatchObject({
      lastError: 'Cannot find module',
      rawError: 'Cannot find module',
    });
    expect(mapT3Status({ id: 'fine', session: { status: 'running' } })).toMatchObject({ lastError: null, rawError: null });
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

  it('reads state, CI, review, draft, and timestamps from a PR snapshot', () => {
    expect(mapT3Status({
      id: 'thread-1',
      pullRequests: [{
        number: 42,
        url: 'https://github.com/octo/one/pull/42',
        snapshot: {
          state: 'merged',
          checksState: 'passing',
          reviewDecision: 'approved',
          isDraft: false,
          mergedAt: '2026-09-24T12:00:00Z',
          syncedAt: '2026-09-24T12:01:00Z',
        },
      }],
    })?.pullRequests).toMatchObject([{
      state: 'merged',
      checksState: 'passing',
      reviewDecision: 'approved',
      isDraft: false,
      hasSnapshot: true,
      mergedAt: '2026-09-24T12:00:00Z',
      syncedAt: '2026-09-24T12:01:00Z',
    }]);
  });
});

describe('representativeHandOffs', () => {
  const dto = (id: string, overrides: Partial<HandOffStatusDto> = {}): HandOffStatusDto => ({
    id,
    repo: 'octo/one',
    mapNumber: 5,
    mapTitle: null,
    ticketNumber: 57,
    title: 'Audit',
    threadId: `thread-${id}`,
    rung: 'thread',
    status: 'running',
    acknowledged: false,
    createdAt: '2026-09-23T10:00:00.000Z',
    updatedAt: '2026-09-23T10:05:00.000Z',
    lastSeenAt: '2026-09-23T10:05:00.000Z',
    stale: false,
    sequence: null,
    branch: null,
    pendingApproval: false,
    pendingUserInput: false,
    pullRequests: [],
    ...overrides,
  });
  const ids = (records: HandOffStatusDto[]): string[] => representativeHandOffs(records).map((handOff) => handOff.id);

  it('keeps the running thread over a newer duplicate stuck at starting', () => {
    const running = dto('first');
    const stuck = dto('second', { status: 'starting', createdAt: '2026-09-23T10:00:38.000Z', updatedAt: '2026-09-23T10:06:00.000Z' });
    expect(ids([running, stuck])).toEqual(['first']);
    expect(ids([stuck, running])).toEqual(['first']);
  });

  it('prefers a starting retry over a failed attempt, and the newest among equals', () => {
    const failed = dto('failed', { status: 'failed' });
    const noThread = dto('no-thread', { threadId: null, status: 'starting' });
    const retry = dto('retry', { status: 'starting', createdAt: '2026-09-23T09:00:00.000Z' });
    expect(ids([failed, noThread, retry])).toEqual(['retry']);
    const newer = dto('newer', { status: 'waiting', createdAt: '2026-09-23T11:00:00.000Z' });
    expect(ids([dto('older'), newer])).toEqual(['newer']);
  });

  it('prefers a live retry over the finished thread before it', () => {
    const finished = dto('finished', { status: 'finished' });
    const retry = dto('retry', { status: 'starting', createdAt: '2026-09-23T09:00:00.000Z' });
    expect(ids([finished, retry])).toEqual(['retry']);
    expect(ids([retry, finished])).toEqual(['retry']);
  });

  it('groups by repository and ticket, and leaves map hand-offs alone', () => {
    const records = [
      dto('a'),
      dto('b', { repo: 'OCTO/one', status: 'starting' }),
      dto('other-ticket', { ticketNumber: 58 }),
      dto('other-repo', { repo: 'octo/two' }),
      dto('map-1', { ticketNumber: null }),
      dto('map-2', { ticketNumber: null }),
    ];
    expect(ids(records)).toEqual(['a', 'other-ticket', 'other-repo', 'map-1', 'map-2']);
  });
});

describe('HandOffStore', () => {
  it.each(['recovered', 'another usage error', 'removed'])('discards a cached raw error after another store reports %s', async (change) => {
    const directory = await mkdtemp(join(tmpdir(), 'wayfinder-hand-offs-'));
    const filePath = join(directory, 'hand-offs.json');
    const now = () => new Date('2026-10-03T12:00:00.000Z');
    const message = 'You have hit your usage limit. Resets in 2h.';
    try {
      const first = new HandOffStore({ filePath, now });
      const { id } = await first.record(input);
      await first.applySnapshot('env-1', input.t3Origin, {
        snapshotSequence: 1,
        threads: [{ id: input.threadId, session: { status: 'error', lastError: message } }],
      });
      const other = new HandOffStore({ filePath, now });

      // User metadata and repeated reads do not change the tracking generation.
      await other.acknowledge(id);
      await first.list();
      await first.list();
      expect(first.rawError(id)).toBe(message);

      if (change === 'removed') {
        await other.applyEvent('env-1', input.t3Origin, { kind: 'thread-removed', threadId: input.threadId });
      } else {
        await other.applySnapshot('env-1', input.t3Origin, {
          snapshotSequence: 2,
          threads: [{ id: input.threadId, session: change === 'recovered'
            ? { status: 'running' }
            : { status: 'error', lastError: 'You have hit your usage limit. Resets in 7 days.' } }],
        });
      }

      const records = await first.list();
      expect(first.rawError(id)).toBeUndefined();
      if (change === 'removed') expect(records).toEqual([]);
      else expect(records[0]?.sequence).toBe(2);
      expect(await readFile(filePath, 'utf8')).not.toContain('Resets in');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('preserves acknowledgements and ticket closure when a stale store writes a new ticket', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wayfinder-hand-offs-'));
    const filePath = join(directory, 'hand-offs.json');
    try {
      const first = new HandOffStore({ filePath });
      const saved = await first.record(input);
      const stale = new HandOffStore({ filePath });
      await stale.list();
      await first.acknowledge(saved.id);
      await first.setTicketClosed(saved.id);

      const added = await stale.record({ ...input, ticketNumber: 12, threadId: 'thread-2' });

      const persisted = await new HandOffStore({ filePath }).list();
      expect(persisted).toHaveLength(2);
      expect(persisted.find((item) => item.id === saved.id)).toMatchObject({ acknowledged: true, ticketClosedAt: expect.any(String) });
      expect(persisted.find((item) => item.id === added.id)).toBeDefined();
      await expect(stale.list()).resolves.toEqual(persisted);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('preserves same-record acknowledgements and model-change reasons during stale tracking refreshes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wayfinder-hand-offs-'));
    const filePath = join(directory, 'hand-offs.json');
    const now = () => new Date('2026-10-03T12:00:00.000Z');
    try {
      const first = new HandOffStore({ filePath, now });
      const auto = buildAutoDecision({
        scoring: { version: 'rules-1', reason: 'Test tracking' },
        proposed: { tier: 'mid', provider: 'codex', model: 'original', effort: 'high' },
        final: { tier: 'mid', provider: 'codex', model: 'original', effort: 'high' },
      }, now());
      const saved = await first.record({ ...input, auto });
      const snapshot = (sequence: number, model: string, status = 'running') => ({
        snapshotSequence: sequence,
        threads: [{ id: input.threadId, session: { status }, modelSelection: { instanceId: 'codex', model } }],
      });
      await first.applySnapshot('env-1', input.t3Origin, snapshot(1, 'changed'));
      const stale = new HandOffStore({ filePath, now });
      await stale.list();
      await first.acknowledge(saved.id);
      await first.confirmModelChange(saved.id, now().toISOString(), 'preference');
      await first.setTicketClosed(saved.id);

      await stale.applySnapshot('env-1', input.t3Origin, snapshot(2, 'next', 'ready'));

      const [persisted] = await new HandOffStore({ filePath }).list();
      expect(persisted).toMatchObject({
        acknowledged: true, ticketClosedAt: now().toISOString(), status: 'ready', sequence: 2,
        auto: { current: { model: 'next' }, modelChanges: [
          { to: { model: 'changed' }, reason: 'preference', askedAt: now().toISOString() },
          { to: { model: 'next' }, reason: 'unknown' },
        ] },
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('checks sequence freshness against the latest persisted tracking state', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wayfinder-hand-offs-'));
    const filePath = join(directory, 'hand-offs.json');
    try {
      const first = new HandOffStore({ filePath });
      await first.record(input);
      const stale = new HandOffStore({ filePath });
      await stale.list();
      await first.applySnapshot('env-1', input.t3Origin, {
        snapshotSequence: 20, threads: [{ id: input.threadId, session: { status: 'running' } }],
      });
      await stale.applySnapshot('env-1', input.t3Origin, {
        snapshotSequence: 10, threads: [{ id: input.threadId, session: { status: 'error', lastError: 'Old failure' } }],
      });
      await expect(new HandOffStore({ filePath }).list()).resolves.toMatchObject([{ status: 'running', sequence: 20, lastError: null }]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('updates the latest PR refs without overwriting newer tracking fields', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wayfinder-hand-offs-'));
    const filePath = join(directory, 'hand-offs.json');
    const url = 'https://github.com/octo/one/pull/23';
    try {
      const first = new HandOffStore({ filePath });
      const saved = await first.record(input);
      const stale = new HandOffStore({ filePath });
      await stale.list();
      await first.applySnapshot('env-1', input.t3Origin, {
        snapshotSequence: 20,
        threads: [{ id: input.threadId, session: { status: 'running' }, pullRequests: [{ url, state: 'OPEN' }] }],
      });

      await stale.setPullRequestState(saved.id, url, { state: 'MERGED', mergedAt: '2026-10-03T12:00:00.000Z' });
      await stale.acknowledge(saved.id);

      await expect(new HandOffStore({ filePath }).list()).resolves.toMatchObject([{
        status: 'running', sequence: 20, acknowledged: true,
        pullRequests: [{ url, state: 'MERGED', mergedAt: '2026-10-03T12:00:00.000Z' }],
      }]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('continues using the latest file after a failed operation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wayfinder-hand-offs-'));
    const filePath = join(directory, 'hand-offs.json');
    try {
      const store = new HandOffStore({ filePath });
      const saved = await store.record(input);
      const contents = await readFile(filePath, 'utf8');
      await writeFile(filePath, 'invalid json', 'utf8');
      await expect(store.acknowledge(saved.id)).rejects.toThrow();
      await expect(readFile(`${filePath}.lock`, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

      await writeFile(filePath, contents, 'utf8');
      await expect(store.acknowledge(saved.id)).resolves.toBe(true);
      await expect(new HandOffStore({ filePath }).list()).resolves.toMatchObject([{ acknowledged: true }]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('does not restore a removed thread when a stale store writes another ticket', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wayfinder-hand-offs-'));
    const filePath = join(directory, 'hand-offs.json');
    try {
      const first = new HandOffStore({ filePath });
      await first.record({ ...input, environmentId: 'env-1' });
      const stale = new HandOffStore({ filePath });
      await stale.list();
      await first.applyEvent('env-1', input.t3Origin, { kind: 'thread-removed', threadId: input.threadId });
      const added = await stale.record({ ...input, ticketNumber: 12, threadId: 'thread-2' });
      await expect(new HandOffStore({ filePath }).list()).resolves.toMatchObject([{ id: added.id }]);
      await expect(stale.list()).resolves.toHaveLength(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each(['snapshot', 'synchronized'])('applies a %s event inside one store transaction', async (kind) => {
    const directory = await mkdtemp(join(tmpdir(), 'wayfinder-hand-offs-'));
    const filePath = join(directory, 'hand-offs.json');
    try {
      const store = new HandOffStore({ filePath });
      await store.record(input);
      await store.applyEvent('env-1', input.t3Origin, {
        kind, sequence: 7,
        snapshot: { threads: [{ id: input.threadId, session: { status: 'running' } }] },
      });
      await expect(new HandOffStore({ filePath }).list()).resolves.toMatchObject([{ status: 'running', sequence: 7 }]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('keeps records written concurrently by separate store instances', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wayfinder-hand-offs-'));
    const filePath = join(directory, 'hand-offs.json');
    try {
      const stores = [new HandOffStore({ filePath }), new HandOffStore({ filePath })];
      const saved = await Promise.all(stores.flatMap((store, storeIndex) =>
        Array.from({ length: 4 }, (_, index) => store.record({
          ...input,
          title: `Hand-off ${storeIndex * 4 + index}`,
          threadId: `thread-${storeIndex * 4 + index}`,
        })),
      ));

      const records = await new HandOffStore({ filePath }).list();
      expect(records.map((item) => item.id).sort()).toEqual(saved.map((item) => item.id).sort());
      await expect(readFile(`${filePath}.lock`, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('reclaims a stale store lock before writing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wayfinder-hand-offs-'));
    const filePath = join(directory, 'hand-offs.json');
    const lockPath = `${filePath}.lock`;
    try {
      await writeFile(lockPath, 'abandoned lock', 'utf8');
      await utimes(lockPath, new Date(0), new Date(0));

      const saved = await new HandOffStore({ filePath }).record(input);

      await expect(new HandOffStore({ filePath }).list()).resolves.toMatchObject([{ id: saved.id }]);
      await expect(readFile(lockPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

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

  it('migrates v1 records and older PR refs without losing the record', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wayfinder-hand-offs-'));
    const filePath = join(directory, 'hand-offs.json');
    try {
      const original = new HandOffStore({ filePath });
      const saved = await original.record(input);
      const parsed = JSON.parse(await readFile(filePath, 'utf8')) as { records: Array<Record<string, unknown>> };
      const legacyRecords = parsed.records.map((record) => {
        const legacyRecord = { ...record };
        delete legacyRecord['acknowledged'];
        legacyRecord['pullRequests'] = [{
          number: 42,
          url: 'https://github.com/octo/one/pull/42',
          state: 'OPEN',
          mergedAt: null,
          syncedAt: null,
          source: 't3',
        }];
        return legacyRecord;
      });
      await writeFile(filePath, JSON.stringify({ version: 1, records: legacyRecords }), 'utf8');

      const migrated = new HandOffStore({ filePath });
      await expect(migrated.list()).resolves.toMatchObject([{
        id: saved.id,
        acknowledged: false,
        pullRequests: [{ checksState: null, reviewDecision: null, isDraft: null, hasSnapshot: false }],
      }]);
      await expect(migrated.acknowledge(saved.id)).resolves.toBe(true);
      await expect(new HandOffStore({ filePath }).list()).resolves.toMatchObject([{ id: saved.id, acknowledged: true }]);
      await expect(readFile(filePath, 'utf8')).resolves.toContain('"version": 2');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  describe('Auto decisions (#172)', () => {
    const auto = (overrides: Record<string, unknown> = {}) => {
      const built = buildAutoDecision(
        {
          scoring: { version: 'rules-1', reason: 'Hard: concurrent starts share one T3 connection' },
          proposed: { tier: 'hard', provider: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
          final: { tier: 'mid', provider: 'codex', model: 'gpt-5.6-terra', effort: 'medium' },
          usage: { state: 'available', observedAt: '2026-09-30T11:59:00.000Z' },
          ...overrides,
        },
        new Date('2026-09-30T12:00:00.000Z'),
      );
      if (built === null) throw new Error('expected a decision');
      return built;
    };
    const thread = (extra: Record<string, unknown> = {}) => ({
      snapshotSequence: 1,
      threads: [{
        id: 'thread-1',
        modelSelection: { instanceId: 'codex', model: 'gpt-5.6-terra', options: [{ id: 'reasoningEffort', value: 'medium' }] },
        ...extra,
      }],
    });

    it('keeps the proposal, final choice, usage age and outcome across a restart', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'wayfinder-hand-offs-'));
      const filePath = join(directory, 'hand-offs.json');
      let now = new Date('2026-09-30T12:00:00.000Z');
      try {
        const store = new HandOffStore({ filePath, now: () => now });
        await store.record({ ...input, tier: 'mid', auto: auto() });
        now = new Date('2026-09-30T12:20:00.000Z');
        await store.applySnapshot('env-1', input.t3Origin ?? '', thread({
          session: { status: 'ready' },
          latestTurn: { state: 'completed', settledAt: '2026-09-30T12:19:00.000Z' },
        }));

        const [restarted] = await new HandOffStore({ filePath }).list();
        expect(restarted?.auto).toMatchObject({
          scoring: { version: 'rules-1', reason: 'Hard: concurrent starts share one T3 connection' },
          proposed: { tier: 'hard', model: 'gpt-5.6-sol', effort: 'high' },
          final: { tier: 'mid', model: 'gpt-5.6-terra', effort: 'medium' },
          overrides: ['tier', 'model', 'effort'],
          usage: { state: 'available', observedAt: '2026-09-30T11:59:00.000Z' },
          decidedAt: '2026-09-30T12:00:00.000Z',
          outcome: { result: 'finished', at: '2026-09-30T12:20:00.000Z' },
        });
        expect(restarted?.auto === undefined ? null : usageAgeMs(restarted.auto)).toBe(60_000);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });

    it('records an in-session model change and a usage-limit error apart from the proposal', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'wayfinder-hand-offs-'));
      const filePath = join(directory, 'hand-offs.json');
      try {
        const store = new HandOffStore({ filePath, now: () => new Date('2026-09-30T12:10:00.000Z') });
        await store.record({ ...input, auto: auto({ final: { tier: 'hard', provider: 'codex', model: 'gpt-5.6-sol', effort: 'high' } }) });
        await store.applySnapshot('env-1', input.t3Origin ?? '', thread({
          modelSelection: { instanceId: 'codex', model: 'gpt-5.6-sol', options: [{ id: 'reasoningEffort', value: 'high' }] },
        }));
        await store.applySnapshot('env-1', input.t3Origin ?? '', {
          snapshotSequence: 2,
          threads: [{
            id: 'thread-1',
            modelSelection: { instanceId: 'claude', model: 'opus' },
            session: { status: 'error', lastError: 'You have hit your usage limit. Resets in 2h.' },
          }],
        });
        await store.applySnapshot('env-1', input.t3Origin ?? '', {
          snapshotSequence: 3,
          threads: [{
            id: 'thread-1',
            modelSelection: { instanceId: 'claude', model: 'opus' },
            session: { status: 'error', lastError: 'You have hit your usage limit. Resets in 2h.' },
          }],
        });

        const [saved] = await new HandOffStore({ filePath }).list();
        // The user kept Auto's proposal, so the later switch is a model change, not an override.
        expect(saved?.auto).toMatchObject({
          overrides: [],
          modelChanges: [{ from: { model: 'gpt-5.6-sol', effort: 'high' }, to: { provider: 'claude', model: 'opus' } }],
          usageLimitErrors: [{ model: 'opus' }],
          outcome: { result: 'failed' },
        });
        expect(saved?.auto?.modelChanges).toHaveLength(1);
        expect(saved?.auto?.usageLimitErrors).toHaveLength(1);
        expect(saved?.auto?.final).toMatchObject({ model: 'gpt-5.6-sol' });
        // Neither the decision nor the record keeps the error's text.
        expect(JSON.stringify(saved?.auto)).not.toContain('Resets in 2h');
        expect(saved?.lastError).toBe(USAGE_LIMIT_LABEL);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });

    it('never writes a usage-limit error to the file, but still shows other errors', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'wayfinder-hand-offs-'));
      const filePath = join(directory, 'hand-offs.json');
      const message = 'You have hit your usage limit (91.5% of the 5h window). Account acct-123.';
      try {
        const store = new HandOffStore({ filePath, now: () => new Date('2026-09-30T12:10:00.000Z') });
        const { id } = await store.record(input);
        await store.applySnapshot('env-1', input.t3Origin ?? '', {
          snapshotSequence: 1,
          threads: [{ id: 'thread-1', session: { status: 'error', lastError: message } }],
        });

        const written = await readFile(filePath, 'utf8');
        for (const leaked of ['91.5', 'acct-123', '5h window']) expect(written).not.toContain(leaked);
        expect((await new HandOffStore({ filePath }).list())[0]?.lastError).toBe(USAGE_LIMIT_LABEL);
        expect(store.rawError(id)).toBe(message);

        await store.applySnapshot('env-1', input.t3Origin ?? '', {
          snapshotSequence: 2,
          threads: [{ id: 'thread-1', session: { status: 'error', lastError: 'Cannot find module' } }],
        });
        expect(await readFile(filePath, 'utf8')).toContain('Cannot find module');
        expect(store.rawError(id)).toBe('Cannot find module');
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });

    it('withholds usage-limit text from a record saved before it was withheld', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'wayfinder-hand-offs-'));
      const filePath = join(directory, 'hand-offs.json');
      try {
        const store = new HandOffStore({ filePath });
        await store.record(input);
        const saved = JSON.parse(await readFile(filePath, 'utf8')) as { records: Array<Record<string, unknown>> };
        saved.records[0] = { ...saved.records[0], lastError: 'Usage limit hit: 88% used. Account acct-9.' };
        await writeFile(filePath, JSON.stringify(saved));

        expect((await new HandOffStore({ filePath }).list())[0]?.lastError).toBe(USAGE_LIMIT_LABEL);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });

    describe('paired predictions and measurements (#186)', () => {
      const pair = {
        rules: { tier: 'mid', version: 'rules-1', rubric: null, rater: null, inputId: 'in-1', elapsedMs: 0.3, status: 'ok', tokens: null, cost: { kind: 'actual', usd: 0 } },
        shadow: {
          tier: null,
          version: 'model-1:gpt-5.6-luna',
          rubric: 'rubric-1',
          rater: { provider: 'codex', model: 'gpt-5.6-luna', effort: 'low' },
          inputId: 'in-1',
          elapsedMs: 60_004,
          status: 'timeout',
          tokens: null,
          cost: { kind: 'unavailable' },
        },
        proposedBy: 'logic',
        fallback: false,
      };
      const calibrated = (type: string | null = 'task') => {
        const built = buildAutoDecision(
          {
            scoring: { version: 'rules-1', reason: 'touches 3 files' },
            proposed: { tier: 'mid', provider: 'claudeAgent', model: 'fable-5', effort: null },
            final: { tier: 'mid', provider: 'claudeAgent', model: 'fable-5', effort: null },
            usage: { state: 'limited', observedAt: '2026-09-30T11:59:00.000Z' },
            selection: 'auto',
            tierMapping: { mid: { provider: 'codex', model: 'gpt-5.6-terra', effort: null }, hard: { provider: 'claudeAgent', model: 'fable-5', effort: null } },
            substitution: { reason: 'usage-limit', from: { provider: 'codex', model: 'gpt-5.6-terra', effort: null }, to: { provider: 'claudeAgent', model: 'fable-5', effort: null }, toTier: 'hard' },
            calibration: pair,
          },
          new Date('2026-09-30T12:00:00.000Z'),
          type,
        );
        if (built === null) throw new Error('expected a decision');
        return built;
      };

      it('keeps both predictions, their measurements and the dispatch context across a restart, including a timed-out shadow', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'wayfinder-hand-offs-'));
        const filePath = join(directory, 'hand-offs.json');
        try {
          const store = new HandOffStore({ filePath, now: () => new Date('2026-09-30T12:00:00.000Z') });
          await store.record({ ...input, auto: calibrated() });
          const [restarted] = await new HandOffStore({ filePath }).list();
          expect(restarted?.auto).toMatchObject({
            ticketType: 'task',
            selection: 'auto',
            overrides: [],
            tierMapping: { mid: { model: 'gpt-5.6-terra' }, hard: { model: 'fable-5' } },
            substitution: { reason: 'usage-limit', toTier: 'hard' },
            calibration: pair,
          });
          expect(restarted?.auto?.calibration?.shadow).toMatchObject({ tier: null, status: 'timeout', elapsedMs: 60_004 });
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      });

      it('saves no pair for a hand-off that was not opted in or is not a task or research', async () => {
        const store = new HandOffStore({ filePath: null });
        await store.record({ ...input, auto: calibrated('prototype') });
        await expect(store.list()).resolves.toMatchObject([{ auto: { ticketType: 'prototype', calibration: null } }]);
      });

      it('saves the reason a user confirmed for a model change, and leaves other changes unknown', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'wayfinder-hand-offs-'));
        const filePath = join(directory, 'hand-offs.json');
        let now = new Date('2026-09-30T12:10:00.000Z');
        try {
          const store = new HandOffStore({ filePath, now: () => now });
          const { id } = await store.record({ ...input, auto: calibrated() });
          const modelAt = async (sequence: number, model: string) => {
            await store.applySnapshot('env-1', input.t3Origin ?? '', { snapshotSequence: sequence, threads: [{ id: 'thread-1', modelSelection: { instanceId: 'claudeAgent', model } }] });
          };
          await modelAt(1, 'fable-5');
          now = new Date('2026-09-30T12:20:00.000Z');
          await modelAt(2, 'opus-4.8');
          now = new Date('2026-09-30T12:30:00.000Z');
          await modelAt(3, 'sonnet-5');

          await expect(store.confirmModelChange(id, '2026-09-30T12:20:00.000Z', 'harder-ticket')).resolves.toBe(true);
          await expect(store.confirmModelChange(id, '2026-09-30T12:21:00.000Z', 'harder-ticket')).resolves.toBe(false);
          await expect(store.confirmModelChange('missing', '2026-09-30T12:20:00.000Z', 'harder-ticket')).resolves.toBe(false);

          const [saved] = await new HandOffStore({ filePath }).list();
          expect(saved?.auto?.modelChanges).toMatchObject([
            { to: { model: 'opus-4.8' }, reason: 'harder-ticket', confirmedAt: '2026-09-30T12:30:00.000Z' },
            { to: { model: 'sonnet-5' }, reason: 'unknown', confirmedAt: null },
          ]);
          expect(saved?.auto?.overrides).toEqual([]);
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      });

      it('asks about each model change once, in order, and not again after Not sure', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'wayfinder-hand-offs-'));
        const filePath = join(directory, 'hand-offs.json');
        let now = new Date('2026-09-30T12:10:00.000Z');
        try {
          const store = new HandOffStore({ filePath, now: () => now });
          const { id } = await store.record({ ...input, auto: calibrated() });
          const modelAt = async (sequence: number, model: string) => {
            await store.applySnapshot('env-1', input.t3Origin ?? '', { snapshotSequence: sequence, threads: [{ id: 'thread-1', modelSelection: { instanceId: 'claudeAgent', model } }] });
          };
          await modelAt(1, 'fable-5');
          now = new Date('2026-09-30T12:20:00.000Z');
          await modelAt(2, 'opus-4.8');
          now = new Date('2026-09-30T12:30:00.000Z');
          await modelAt(3, 'sonnet-5');
          const asked = async () => (await new HandOffStore({ filePath }).list())[0]?.auto?.modelChanges.map((change) => change.askedAt);

          const tracker = new HandOffTracker(store, { readHandOffSnapshot: vi.fn(async () => { throw new Error('T3 Code is not running'); }) });
          const prompted = async () => (await tracker.snapshot()).handOffs[0]?.modelChange;

          await expect(asked()).resolves.toEqual([null, null]);
          // Models only: the prompt carries no reason of its own.
          await expect(prompted()).resolves.toEqual({ at: '2026-09-30T12:20:00.000Z', from: 'fable-5', to: 'opus-4.8' });
          await store.confirmModelChange(id, '2026-09-30T12:20:00.000Z', 'unknown');
          await expect(prompted()).resolves.toEqual({ at: '2026-09-30T12:30:00.000Z', from: 'opus-4.8', to: 'sonnet-5' });
          await store.confirmModelChange(id, '2026-09-30T12:30:00.000Z', 'unknown');
          await expect(prompted()).resolves.toBeUndefined();
          tracker.close();
          const [saved] = await new HandOffStore({ filePath }).list();
          expect(saved?.auto?.modelChanges).toMatchObject([
            { reason: 'unknown', confirmedAt: null, askedAt: '2026-09-30T12:30:00.000Z' },
            { reason: 'unknown', confirmedAt: null, askedAt: '2026-09-30T12:30:00.000Z' },
          ]);
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      });

      it('confirms nothing on a hand-off Auto did not start', async () => {
        const store = new HandOffStore({ filePath: null });
        const { id } = await store.record(input);
        await expect(store.confirmModelChange(id, '2026-09-30T12:20:00.000Z', 'preference')).resolves.toBe(false);
      });
    });

    it('ends a hand-off that never reached a thread as untracked', async () => {
      const store = new HandOffStore({ filePath: null, now: () => new Date('2026-09-30T12:00:00.000Z') });
      await store.record({ ...input, threadId: null, rung: 'clipboard', auto: auto() });
      await expect(store.list()).resolves.toMatchObject([{ auto: { outcome: { result: 'untracked', at: '2026-09-30T12:00:00.000Z' } } }]);
    });

    it('keeps the decision under the hand-off retention and leaves other hand-offs without one', async () => {
      let now = new Date('2026-09-01T00:00:00.000Z');
      const store = new HandOffStore({ filePath: null, now: () => now });
      await store.record({ ...input, auto: auto() });
      const plain = await store.record({ ...input, ticketNumber: 12, threadId: 'thread-2' });
      await store.applySnapshot('env-1', input.t3Origin ?? '', {
        snapshotSequence: 1,
        threads: [
          { id: 'thread-1', latestTurn: { state: 'completed', settledAt: now.toISOString() } },
          { id: 'thread-2', session: { status: 'running' } },
        ],
      });
      expect((await store.list()).find((item) => item.id === plain.id)).not.toHaveProperty('auto');
      now = new Date('2026-10-03T00:00:00.000Z');
      await expect(store.list()).resolves.toMatchObject([{ id: plain.id }]);
    });

    it('does not let a caller mutate the stored decision through a read', async () => {
      const store = new HandOffStore({ filePath: null });
      await store.record({ ...input, auto: auto() });
      const [first] = await store.list();
      first?.auto?.modelChanges.push({ at: 'x', from: { provider: null, model: 'a', effort: null }, to: { provider: null, model: 'b', effort: null }, reason: 'unknown', confirmedAt: null, askedAt: null });
      const [second] = await store.list();
      expect(second?.auto?.modelChanges).toEqual([]);
    });

    it('drops a damaged decision on load but keeps the hand-off', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'wayfinder-hand-offs-'));
      const filePath = join(directory, 'hand-offs.json');
      try {
        await new HandOffStore({ filePath }).record({ ...input, auto: auto() });
        const parsed = JSON.parse(await readFile(filePath, 'utf8')) as { records: Array<Record<string, unknown>> };
        const [record] = parsed.records;
        if (record === undefined) throw new Error('expected a record');
        record['auto'] = { proposed: 'mid', usedPercent: 91 };
        await writeFile(filePath, JSON.stringify({ version: 2, records: [record] }), 'utf8');
        const [loaded] = await new HandOffStore({ filePath }).list();
        expect(loaded).toMatchObject({ threadId: 'thread-1' });
        expect(loaded).not.toHaveProperty('auto');
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
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

  it('starts terminal retention when T3 Code reports a pull request', async () => {
    let now = new Date('2026-09-01T00:00:00.000Z');
    const store = new HandOffStore({ filePath: null, now: () => now });
    await store.record(input);
    await store.applySnapshot('env-1', input.t3Origin ?? '', {
      snapshotSequence: 1,
      threads: [{
        id: 'thread-1',
        session: { status: 'running' },
        pullRequests: [{ number: 42, url: 'https://github.com/octo/one/pull/42', state: 'open' }],
      }],
    });
    await expect(store.list()).resolves.toMatchObject([{ terminalAt: now.toISOString() }]);
    now = new Date('2026-10-03T00:00:00.000Z');
    await expect(store.list()).resolves.toHaveLength(0);
  });
  it('drops a hand-off whose thread is gone from a snapshot of the same environment', async () => {
    const store = new HandOffStore({ filePath: null, now: () => new Date('2026-09-01T00:00:00.000Z') });
    await store.record(input);
    const other = await store.record({ ...input, ticketNumber: 12, threadId: 'thread-2' });
    await store.applySnapshot('env-1', input.t3Origin ?? '', {
      snapshotSequence: 1,
      threads: [{ id: 'thread-1' }, { id: 'thread-2' }],
    });

    await store.applySnapshot('env-2', 'http://127.0.0.1:4000', { snapshotSequence: 2, threads: [] });
    await expect(store.list()).resolves.toHaveLength(2);

    await store.applySnapshot('env-1', input.t3Origin ?? '', {
      snapshotSequence: 2,
      threads: [{ id: 'thread-1', deletedAt: '2026-09-01T00:00:00.000Z' }, { id: 'thread-2' }],
    });
    await expect(store.list()).resolves.toMatchObject([{ id: other.id }]);

    await store.applySnapshot('env-1', input.t3Origin ?? '', { snapshotSequence: 3, threads: [] });
    await expect(store.list()).resolves.toHaveLength(0);
  });

  it('gives a hand-off T3 has not shown yet a grace period before treating it as deleted', async () => {
    let now = new Date('2026-09-01T00:00:00.000Z');
    const store = new HandOffStore({ filePath: null, now: () => now });
    await store.record(input);
    await store.applySnapshot('env-1', input.t3Origin ?? '', { snapshotSequence: 1, threads: [] });
    await expect(store.list()).resolves.toHaveLength(1);

    now = new Date('2026-09-01T00:05:00.000Z');
    await store.applySnapshot('env-1', input.t3Origin ?? '', { snapshotSequence: 2, threads: [] });
    await expect(store.list()).resolves.toHaveLength(0);
  });

  it('ignores a missing thread in a snapshot older than the last one seen', async () => {
    const store = new HandOffStore({ filePath: null });
    await store.record(input);
    await store.applySnapshot('env-1', input.t3Origin ?? '', { snapshotSequence: 10, threads: [{ id: 'thread-1' }] });
    await store.applySnapshot('env-1', input.t3Origin ?? '', { snapshotSequence: 9, threads: [] });
    await expect(store.list()).resolves.toHaveLength(1);
  });

  it('drops a hand-off when T3 streams thread-removed for its thread', async () => {
    const store = new HandOffStore({ filePath: null });
    await store.record(input);
    await store.applyEvent('env-2', 'http://127.0.0.1:4000', { kind: 'thread-removed', sequence: 5, threadId: 'thread-1' });
    await expect(store.list()).resolves.toHaveLength(1);
    await store.applyEvent('env-1', input.t3Origin ?? '', { kind: 'thread-removed', sequence: 5, threadId: 'thread-1' });
    await expect(store.list()).resolves.toHaveLength(0);
  });
});

describe('HandOffTracker', () => {
  it.each([false, true])('reconciles v2 archive and deletion removals against the shell, wrapped=%s', async (wrapped) => {
    const store = new HandOffStore({ filePath: null });
    await store.record(input);
    let deliver: ((value: unknown) => void) | undefined;
    let phase = 0;
    const tracker = new HandOffTracker(store, {
      readHandOffSnapshot: async () => ({
        environmentId: 'env-1', origin: input.t3Origin,
        snapshot: {
          snapshotSequence: phase + 1,
          threads: phase === 0 ? [{ id: input.threadId, status: 'running' }] : [],
          archivedThreads: phase === 1 ? [{ id: input.threadId, status: 'completed', settledAt: '2026-10-07T12:00:00Z' }] : [],
        },
      }),
      subscribeShell: async (_sequence, listener) => { deliver = listener; return () => undefined; },
    }, { lookupPullRequests: async () => [], lookupPullRequestState: async () => null });
    try {
      await tracker.snapshot();
      await vi.waitFor(() => expect(deliver).toBeDefined());
      const removal = (location: string) => ({ kind: 'thread.removed',
        ...(wrapped ? { value: { location, threadId: input.threadId } } : { location, threadId: input.threadId }),
      });
      phase = 1;
      deliver?.(removal('active'));
      await vi.waitFor(async () => expect(await store.list()).toMatchObject([{ status: 'finished' }]));
      phase = 2;
      deliver?.(removal('archive'));
      await vi.waitFor(async () => expect(await store.list()).toHaveLength(0));
    } finally { tracker.close(); }
  });

  it('reports an incompatible shell as unavailable and preserves the last observation', async () => {
    const store = new HandOffStore({ filePath: null });
    await store.record(input);
    await store.applySnapshot('env-1', input.t3Origin, { threads: [{ id: input.threadId, status: 'running' }] });
    const tracker = new HandOffTracker(store, { readHandOffSnapshot: async () => ({ environmentId: 'env-1', origin: input.t3Origin, snapshot: {} }) });
    try {
      await expect(tracker.snapshot()).resolves.toMatchObject({ t3: { available: false }, handOffs: [{ status: 'running', stale: true }] });
    } finally { tracker.close(); }
  });
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

  it('keeps a stale hand-off while T3 Code is offline and drops it once T3 reports the thread deleted', async () => {
    const store = new HandOffStore({ filePath: null });
    await store.record(input);
    let online = false;
    let threads: unknown[] = [{ id: 'thread-1', session: { status: 'running' } }];
    const tracker = new HandOffTracker(store, {
      readHandOffSnapshot: async () => {
        if (!online) throw new Error('T3 Code is not running');
        return { environmentId: 'env-1', origin: input.t3Origin ?? '', snapshot: { snapshotSequence: 1, threads } };
      },
    });

    try {
      online = true;
      await expect(tracker.snapshot()).resolves.toMatchObject({ handOffs: [{ status: 'running', stale: false }] });
      online = false;
      threads = [];
      await expect(tracker.snapshot()).resolves.toMatchObject({ handOffs: [{ status: 'running', stale: true }] });
      online = true;
      await expect(tracker.snapshot()).resolves.toMatchObject({ handOffs: [], t3: { available: true } });
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
      deliver({ kind: 'thread-upserted', sequence: 11, thread: { id: 'thread-1', projectId: 'project-1', hasPendingUserInput: true } });
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
        checksState: null,
        reviewDecision: null,
        isDraft: null,
        hasSnapshot: false,
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

  it('falls back to GitHub when T3 reports a pull request without a snapshot', async () => {
    const store = new HandOffStore({ filePath: null });
    await store.record(input);
    const url = 'https://github.com/octo/one/pull/42';
    const lookupPullRequestState = vi.fn(async () => ({ state: 'MERGED', mergedAt: '2026-09-24T12:00:00Z' }));
    const tracker = new HandOffTracker(
      store,
      {
        readHandOffSnapshot: async () => ({
          environmentId: 'env-1',
          origin: input.t3Origin ?? '',
          snapshot: { snapshotSequence: 3, threads: [{ id: 'thread-1', projectId: 'project-1', pullRequests: [{ number: 42, url }] }] },
        }),
      },
      { lookupPullRequestState, lookupPullRequests: async () => [] },
    );

    try {
      await tracker.snapshot();
      await vi.waitFor(async () => {
        await expect(store.list()).resolves.toMatchObject([{ pullRequests: [{ url, state: 'MERGED', mergedAt: '2026-09-24T12:00:00Z' }] }]);
      });
      // T3 Code reports the same pull request again, still without a state.
      await store.applySnapshot('env-1', input.t3Origin ?? '', { snapshotSequence: 4, threads: [{ id: 'thread-1', projectId: 'project-1', pullRequests: [{ number: 42, url }] }] });
      await expect(store.list()).resolves.toMatchObject([{ pullRequests: [{ url, state: 'MERGED' }] }]);
      // Merged pull requests are not looked up again.
      await tracker.snapshot();
      expect(lookupPullRequestState).toHaveBeenCalledTimes(1);
    } finally {
      tracker.close();
    }
  });

  it.each([
    {
      state: 'merged',
      checksState: 'passing',
      reviewDecision: 'approved',
      isDraft: false,
      mergedAt: '2026-09-24T12:00:00Z',
      syncedAt: '2026-09-24T12:01:00Z',
    },
    {
      state: 'open',
      checksState: 'pending',
      reviewDecision: 'review_required',
      isDraft: true,
      mergedAt: null,
      syncedAt: '2026-09-24T12:01:00Z',
    },
  ])('uses the T3 $state PR snapshot without querying GitHub', async (prSnapshot) => {
    const store = new HandOffStore({ filePath: null });
    await store.record(input);
    const url = 'https://github.com/octo/one/pull/42';
    const lookupPullRequestState = vi.fn(async () => ({ state: 'OPEN', mergedAt: null }));
    const tracker = new HandOffTracker(
      store,
      {
        readHandOffSnapshot: async () => ({
          environmentId: 'env-1',
          origin: input.t3Origin ?? '',
          snapshot: {
            snapshotSequence: 3,
            threads: [{
              id: 'thread-1',
              projectId: 'project-1',
              pullRequests: [{ number: 42, url, snapshot: prSnapshot }],
            }],
          },
        }),
      },
      { lookupPullRequestState, lookupPullRequests: async () => [] },
    );

    try {
      const snapshot = await tracker.snapshot();
      expect(snapshot.handOffs).toMatchObject([{
        pullRequests: [{ ...prSnapshot, url, hasSnapshot: true }],
      }]);
      expect(lookupPullRequestState).not.toHaveBeenCalled();
    } finally {
      tracker.close();
    }
  });

  it('falls back to GitHub when T3 is offline, even with a saved PR snapshot', async () => {
    const store = new HandOffStore({ filePath: null });
    await store.record(input);
    const url = 'https://github.com/octo/one/pull/42';
    await store.applySnapshot('env-1', input.t3Origin ?? '', {
      snapshotSequence: 3,
      threads: [{
        id: 'thread-1',
        projectId: 'project-1',
        pullRequests: [{
          number: 42,
          url,
          snapshot: {
            state: 'open',
            checksState: 'passing',
            reviewDecision: 'approved',
            isDraft: false,
            mergedAt: null,
            syncedAt: '2026-09-24T12:01:00Z',
          },
        }],
      }],
    });
    const lookupPullRequestState = vi.fn(async () => ({ state: 'MERGED', mergedAt: '2026-09-24T12:02:00Z' }));
    const tracker = new HandOffTracker(store, null, { lookupPullRequestState, lookupPullRequests: async () => [] });

    try {
      await tracker.snapshot();
      await vi.waitFor(async () => {
        await expect(store.list()).resolves.toMatchObject([{ pullRequests: [{ url, state: 'MERGED' }] }]);
      });
      expect(lookupPullRequestState).toHaveBeenCalledWith(url);
    } finally {
      tracker.close();
    }
  });

  it('marks a hand-off whose ticket closed on GitHub, even while its thread sits ready', async () => {
    const store = new HandOffStore({ filePath: null });
    await store.record(input);
    await store.record({ ...input, ticketNumber: 12, threadId: 'thread-2' });
    const lookupTicketClosed = vi.fn(async (_repo: string, number: number) => number === 11);
    const ready = { projectId: 'project-1', session: { status: 'ready' }, latestTurn: { state: 'completed' } };
    const tracker = new HandOffTracker(
      store,
      {
        readHandOffSnapshot: async () => ({
          environmentId: 'env-1',
          origin: input.t3Origin ?? '',
          snapshot: { snapshotSequence: 3, threads: [{ id: 'thread-1', ...ready }, { id: 'thread-2', ...ready }] },
        }),
      },
      { lookupTicketClosed, lookupPullRequests: async () => [] },
    );

    try {
      await tracker.snapshot();
      await vi.waitFor(async () => {
        const { handOffs } = await tracker.snapshot();
        expect(handOffs.find((item) => item.ticketNumber === 11)).toMatchObject({ status: 'ready', ticketClosed: true });
      });
      const { handOffs } = await tracker.snapshot();
      expect(handOffs.find((item) => item.ticketNumber === 12)).not.toHaveProperty('ticketClosed');
      expect(lookupTicketClosed).toHaveBeenCalledWith('octo/one', 11);
      // A closed ticket is not looked up again; an open one waits a minute.
      expect(lookupTicketClosed).toHaveBeenCalledTimes(2);
    } finally {
      tracker.close();
    }
  });

  it('keeps the closed ticket mark across a reload of the store', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wayfinder-closed-ticket-'));
    const filePath = join(dir, 'hand-offs.json');
    try {
      const store = new HandOffStore({ filePath });
      const saved = await store.record(input);
      await store.setTicketClosed(saved.id);
      await expect(new HandOffStore({ filePath }).list()).resolves.toMatchObject([{ ticketClosedAt: expect.any(String) }]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('serves one hand-off per ticket, the thread T3 Code is running', async () => {
    const store = new HandOffStore({ filePath: null });
    await store.record(input);
    await store.record({ ...input, threadId: 'thread-2' });
    const tracker = new HandOffTracker(store, {
      readHandOffSnapshot: async () => ({
        environmentId: 'env-1',
        origin: input.t3Origin ?? '',
        snapshot: { threads: [{ id: 'thread-1', projectId: 'project-1', session: { status: 'running' } }, { id: 'thread-2', projectId: 'project-1' }] },
      }),
    });

    try {
      expect(await store.list()).toHaveLength(2);
      const snapshot = await tracker.snapshot();
      expect(snapshot.handOffs).toMatchObject([{ threadId: 'thread-1', status: 'running' }]);
    } finally {
      tracker.close();
    }
  });

  it.each(['thread-upserted', 'thread.updated'])('offers T3 PR snapshots to the map watcher and announces %s changes', async (kind) => {
    const store = new HandOffStore({ filePath: null });
    await store.record(input);
    await store.record({ ...input, ticketNumber: 12, threadId: 'thread-2', requestedBranch: 'wayfinder/12-other' });
    let online = true;
    let deliver: (value: unknown) => void = () => undefined;
    const snapshotPullRequest = { number: 42, url: 'https://github.com/octo/one/pull/42', snapshot: { state: 'open', checksState: 'pending', reviewDecision: null } };
    const tracker = new HandOffTracker(store, {
      readHandOffSnapshot: async () => {
        if (!online) throw new Error('T3 Code is not running');
        return {
          environmentId: 'env-1',
          origin: input.t3Origin ?? '',
          snapshot: {
            snapshotSequence: 1,
            threads: [
              { id: 'thread-1', session: { status: 'running' }, pullRequests: [snapshotPullRequest] },
              { id: 'thread-2', session: { status: 'running' }, pullRequests: ['https://github.com/octo/one/pull/43'] },
            ],
          },
        };
      },
      subscribeShell: async (_sequence, listener) => {
        deliver = listener;
        return () => undefined;
      },
    }, { lookupPullRequests: async () => [], lookupPullRequestState: async () => null });
    const changes: unknown[] = [];
    tracker.onThreadChange((change) => changes.push(change));

    try {
      await tracker.snapshot();
      // Ticket 12's PR has no snapshot yet, so the watcher asks GitHub for that one.
      await expect(tracker.trackedPullRequests('OCTO/one')).resolves.toEqual(
        new Map([[11, [{ number: 42, url: 'https://github.com/octo/one/pull/42', state: 'open', checks: 'pending', review: null }]]]),
      );
      await expect(tracker.trackedPullRequests('octo/two')).resolves.toEqual(new Map());

      deliver({
        kind,
        sequence: 2,
        thread: { id: 'thread-1', session: { status: 'running' }, pullRequests: [{ ...snapshotPullRequest, snapshot: { state: 'open', checksState: 'passing' } }] },
      });
      await vi.waitFor(() => expect(changes).toEqual([{ repo: 'octo/one', mapNumber: 5, ticketNumber: 11 }]));
      await expect(tracker.trackedPullRequests('octo/one')).resolves.toMatchObject(new Map([[11, [{ checks: 'passing' }]]]));

      online = false;
      await tracker.snapshot();
      await expect(tracker.trackedPullRequests('octo/one')).resolves.toEqual(new Map());
    } finally {
      tracker.close();
    }
  });
});
