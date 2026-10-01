import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FollowStore } from './follows.js';

describe('FollowStore', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wayfinder-follows-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads the followed maps for one login and repository, ignoring case and junk', async () => {
    const path = join(dir, 'follows.json');
    await writeFile(path, JSON.stringify({ ramon: { 'octo/repo': [7, 7, 12, -1, 'x', 1.5], 'octo/other': [3] }, someone: { 'octo/repo': [99] } }));
    const store = new FollowStore(path);
    expect(await store.follows('Ramon', 'Octo/Repo')).toEqual([7, 12]);
    expect(await store.follows('ramon', 'octo/missing')).toEqual([]);
  });

  it('saves follows and unfollows per login and repository, and keeps them for the next start', async () => {
    const path = join(dir, 'nested', 'follows.json');
    await new FollowStore(path).set('Ramon', 'Octo/Repo', 12, true);
    const store = new FollowStore(path);
    await Promise.all([store.set('ramon', 'octo/repo', 7, true), store.set('ramon', 'octo/other', 3, true), store.set('someone', 'octo/repo', 7, true)]);
    expect(await store.set('ramon', 'octo/repo', 7, true)).toEqual([7, 12]);

    // A new store reads the file afresh, as after a restart.
    const restarted = new FollowStore(path);
    expect(await restarted.follows('ramon', 'octo/repo')).toEqual([7, 12]);
    expect(await restarted.follows('ramon', 'octo/other')).toEqual([3]);
    expect(await restarted.follows('someone', 'octo/repo')).toEqual([7]);

    await restarted.set('ramon', 'octo/repo', 12, false);
    expect(await new FollowStore(path).follows('ramon', 'octo/repo')).toEqual([7]);
    expect(await new FollowStore(path).follows('someone', 'octo/repo')).toEqual([7]);
  });

  it('follows nothing when the file is missing or broken', async () => {
    expect(await new FollowStore(join(dir, 'missing.json')).follows('ramon', 'octo/repo')).toEqual([]);
    const broken = join(dir, 'broken.json');
    await writeFile(broken, '{ not json');
    expect(await new FollowStore(broken).follows('ramon', 'octo/repo')).toEqual([]);
  });
});
