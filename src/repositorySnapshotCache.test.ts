import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepositorySnapshotCache } from './repositorySnapshotCache.js';
import { RepositoryStore } from './repositoryStore.js';
import type { MapSnapshot } from './types.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const snapshot = (at = Date.now()): MapSnapshot => ({ repo: 'owner/repo', fetchedAt: new Date(at).toISOString(), maps: [], hiddenMaps: 0, publicMaps: [], warnings: [] });

describe('repository snapshots after app restart', () => {
  it('loads the newest saved read, even when an older write completes last, and isolates accounts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wayfinder-snapshot-')); roots.push(root);
    const cache = new RepositorySnapshotCache(root);
    const newer = snapshot();
    await cache.save(newer, 'github.com/account-a');
    await cache.save(snapshot(Date.now() - 60_000), 'github.com/account-a');
    expect(await new RepositorySnapshotCache(root).load('owner/repo', 'github.com/account-a')).toEqual(newer);
    expect(await cache.load('owner/repo', 'github.com/account-b')).toBeNull();
    expect(await cache.load('another/repo', 'github.com/account-a')).toBeNull();
  });

  it('returns persisted data before GitHub finishes and refreshes it in the background', async () => {
    let finish: (value: { maps: []; warnings: string[] }) => void = () => undefined;
    const fetcher = vi.fn(() => new Promise<{ maps: []; warnings: string[] }>((resolve) => { finish = resolve; }));
    const saved = snapshot();
    const persistence = { load: vi.fn(async () => saved), save: vi.fn(async () => undefined) };
    const cache = new RepositoryStore({ mapLabel: 'wayfinder:map', typePrefix: 'wayfinder:', identity: async () => 'github.com/account-a', fetcher, persistence });
    expect(await cache.snapshot('owner/repo')).toEqual(saved);
    expect(fetcher).toHaveBeenCalledTimes(1);
    finish({ maps: [], warnings: ['fresh'] });
    await vi.waitFor(() => expect(cache.cached('owner/repo')?.warnings).toEqual(['fresh']));
    expect(persistence.save).toHaveBeenCalledWith(expect.objectContaining({ warnings: ['fresh'] }), expect.stringContaining('account-a'));
  });

  it('uses current follow and settle choices in the disk key and never restores while signed out', async () => {
    const persistence = { load: vi.fn(async (_repo: string, _scope: string) => snapshot()), save: vi.fn(async () => undefined) };
    const cache = new RepositoryStore({ mapLabel: 'wayfinder:map', typePrefix: 'wayfinder:', identity: async () => 'github.com/account-a', viewer: async () => ({ login: 'a', follows: [42] }), choices: async () => ({ '42': { settled: true, at: '2026-10-01T00:00:00Z' } }), persistence, fetcher: async () => ({ maps: [], warnings: [] }) });
    await cache.snapshot('owner/repo');
    expect(persistence.load.mock.calls[0]?.[1]).toContain('42');
    const signedOut = new RepositoryStore({ mapLabel: 'wayfinder:map', typePrefix: 'wayfinder:', identity: async () => null, persistence, fetcher: async () => ({ maps: [], warnings: [] }) });
    await signedOut.snapshot('owner/repo');
    expect(persistence.load).toHaveBeenCalledTimes(1);
  });

  it('never starts work from restored data when the live read fails', async () => {
    const saved = snapshot();
    const fetcher = vi.fn(async () => { throw new Error('GitHub offline'); });
    const cache = new RepositoryStore({ mapLabel: 'wayfinder:map', typePrefix: 'wayfinder:', identity: async () => 'github.com/account-a', fetcher, persistence: { load: async () => saved, save: async () => undefined } });
    expect(await cache.snapshot('owner/repo')).toEqual(saved);
    await expect(cache.currentForAction('owner/repo')).rejects.toThrow('GitHub offline');
    expect(cache.cached('owner/repo')).toEqual(saved);
  });
});
