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

  it('follows nothing when the file is missing or broken', async () => {
    expect(await new FollowStore(join(dir, 'missing.json')).follows('ramon', 'octo/repo')).toEqual([]);
    const broken = join(dir, 'broken.json');
    await writeFile(broken, '{ not json');
    expect(await new FollowStore(broken).follows('ramon', 'octo/repo')).toEqual([]);
  });
});
