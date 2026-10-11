import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { SettleFileError, SettleStore, isIdleCandidate, settlementOf } from './settling.js';

const NOW = new Date('2026-09-26T12:00:00.000Z');
const RECENT = '2026-09-20T12:00:00.000Z';
const OLD = '2026-08-01T12:00:00.000Z';

describe('settlementOf', () => {
  it('settles a closed map from when it closed', () => {
    expect(settlementOf({ open: false, closedAt: RECENT, updatedAt: RECENT }, undefined, true, NOW)).toEqual({
      reason: 'closed',
      since: RECENT,
    });
  });

  it('settles an open map 30 days after it and its tickets last changed', () => {
    expect(settlementOf({ open: true, closedAt: null, updatedAt: OLD }, undefined, false, NOW)).toEqual({
      reason: 'idle',
      since: '2026-08-31T12:00:00.000Z',
    });
  });

  it('keeps a quiet map active while one of its tickets changed recently', () => {
    expect(settlementOf({ open: true, closedAt: null, updatedAt: OLD }, undefined, true, NOW)).toBeNull();
  });

  it('keeps a recently changed map active', () => {
    expect(settlementOf({ open: true, closedAt: null, updatedAt: RECENT }, undefined, false, NOW)).toBeNull();
  });

  it('lets a hand-made choice win both ways', () => {
    const at = '2026-09-25T08:00:00.000Z';
    expect(settlementOf({ open: true, closedAt: null, updatedAt: RECENT }, { settled: true, at }, true, NOW)).toEqual({ reason: 'manual', since: at });
    expect(settlementOf({ open: false, closedAt: OLD, updatedAt: OLD }, { settled: false, at }, false, NOW)).toBeNull();
  });
});

describe('isIdleCandidate', () => {
  it('asks only about open maps whose issue changed over 30 days ago', () => {
    expect(isIdleCandidate({ open: true, closedAt: null, updatedAt: OLD }, NOW)).toBe(true);
    expect(isIdleCandidate({ open: true, closedAt: null, updatedAt: RECENT }, NOW)).toBe(false);
    expect(isIdleCandidate({ open: false, closedAt: OLD, updatedAt: OLD }, NOW)).toBe(false);
    expect(isIdleCandidate({ open: true, closedAt: null, updatedAt: null }, NOW)).toBe(false);
  });
});

describe('SettleStore', () => {
  let dir = '';
  const octo = { host: 'github.com', login: 'octo' };

  afterEach(async () => {
    if (dir !== '') await rm(dir, { recursive: true, force: true });
  });

  async function tempFile(name = 'settled.json'): Promise<string> {
    dir = await mkdtemp(join(tmpdir(), 'wayfinder-settle-'));
    return join(dir, name);
  }

  it('keeps choices per account and repository across restarts', async () => {
    const path = join(await tempFile(), '..', 'nested', 'settled.json');
    await new SettleStore(path).set({ host: 'GitHub.com', login: 'Octo' }, 'Octo/Repo', 12, { settled: true, at: RECENT });
    await new SettleStore(path).set(octo, 'octo/repo', 7, { settled: false, at: OLD });

    const restarted = new SettleStore(path);
    expect(await restarted.choices({ host: 'github.com', login: 'OCTO' }, 'octo/REPO')).toEqual({ 12: { settled: true, at: RECENT }, 7: { settled: false, at: OLD } });
    expect(await restarted.choices({ host: 'github.com', login: 'someone-else' }, 'octo/repo')).toEqual({});
    expect(await restarted.choices(octo, 'octo/other')).toEqual({});
    expect(JSON.parse(await readFile(path, 'utf8'))).toHaveProperty(['github.com', 'octo', 'octo/repo', '12']);
  });

  it('keeps the same login on two hosts apart', async () => {
    const path = await tempFile();
    const store = new SettleStore(path);
    await store.set(octo, 'octo/repo', 1, { settled: true, at: RECENT });
    await store.set({ host: 'ghe.example.com', login: 'octo' }, 'octo/repo', 2, { settled: true, at: RECENT });

    expect(Object.keys(await store.choices(octo, 'octo/repo'))).toEqual(['1']);
    expect(Object.keys(await store.choices({ host: 'ghe.example.com', login: 'octo' }, 'octo/repo'))).toEqual(['2']);
  });

  it('reads entries saved before hosts as github.com, without rewriting them', async () => {
    const path = await tempFile();
    const legacy = { octo: { 'octo/repo': { 3: { settled: true, at: OLD }, 4: { settled: true, at: OLD } } } };
    await writeFile(path, JSON.stringify(legacy), 'utf8');
    const store = new SettleStore(path);

    expect(await store.choices(octo, 'octo/repo')).toEqual({ 3: { settled: true, at: OLD }, 4: { settled: true, at: OLD } });
    expect(await store.choices({ host: 'ghe.example.com', login: 'octo' }, 'octo/repo')).toEqual({});
    expect(await readFile(path, 'utf8')).toBe(JSON.stringify(legacy));

    // A later choice on the same map wins over the old entry, which stays in the file.
    await store.set(octo, 'octo/repo', 3, { settled: false, at: RECENT });
    expect(await store.choices(octo, 'octo/repo')).toEqual({ 3: { settled: false, at: RECENT }, 4: { settled: true, at: OLD } });
    expect(JSON.parse(await readFile(path, 'utf8'))).toHaveProperty(['octo', 'octo/repo', '3', 'settled'], true);
  });

  it('applies hand-edited keys whatever their case', async () => {
    const path = await tempFile();
    await writeFile(path, JSON.stringify({ 'GitHub.com': { Octo: { 'Octo/Repo': { 5: { settled: true, at: OLD } } } }, OCTO: { 'OCTO/REPO': { 6: { settled: true, at: OLD } } } }), 'utf8');
    expect(Object.keys(await new SettleStore(path).choices(octo, 'octo/repo'))).toEqual(['5', '6']);
  });

  it('keeps the last of repeated choices on one map', async () => {
    const store = new SettleStore(await tempFile());
    await store.set(octo, 'octo/repo', 9, { settled: true, at: OLD });
    await store.set(octo, 'octo/repo', 9, { settled: true, at: OLD });
    await store.set(octo, 'octo/repo', 9, { settled: false, at: RECENT });
    expect(await store.choices(octo, 'octo/repo')).toEqual({ 9: { settled: false, at: RECENT } });
  });

  it('keeps both of two choices saved at once', async () => {
    const store = new SettleStore(await tempFile());
    await Promise.all([store.set(octo, 'octo/repo', 1, { settled: true, at: RECENT }), store.set(octo, 'octo/repo', 2, { settled: true, at: RECENT })]);
    expect(Object.keys(await store.choices(octo, 'octo/repo'))).toEqual(['1', '2']);
  });

  it('reads a missing file as no choices and creates it on the first save', async () => {
    const path = await tempFile('missing.json');
    const store = new SettleStore(path);
    expect(await store.choices(octo, 'octo/repo')).toEqual({});
    await store.set(octo, 'octo/repo', 1, { settled: true, at: RECENT });
    expect(Object.keys(await store.choices(octo, 'octo/repo'))).toEqual(['1']);
  });

  it.each([
    ['malformed JSON', '{"octo": {'],
    ['a list instead of an object', '[]'],
  ])('applies no choices from %s and refuses to save over it', async (_, contents) => {
    const path = await tempFile();
    await writeFile(path, contents, 'utf8');
    const store = new SettleStore(path);

    expect(await store.choices(octo, 'octo/repo')).toEqual({});
    await expect(store.set(octo, 'octo/repo', 1, { settled: true, at: RECENT })).rejects.toThrow(SettleFileError);
    await expect(store.set(octo, 'octo/repo', 1, { settled: true, at: RECENT })).rejects.toThrow(/can't be read\. Fix or remove the file, then try again\./);
    expect(await readFile(path, 'utf8')).toBe(contents);
  });

  it('refuses to save when the file exists but cannot be opened', async () => {
    // A directory where the file should be: reading fails with something other than "not found".
    const path = await tempFile();
    await mkdir(path);
    const store = new SettleStore(path);
    expect(await store.choices(octo, 'octo/repo')).toEqual({});
    await expect(store.set(octo, 'octo/repo', 1, { settled: true, at: RECENT })).rejects.toThrow(SettleFileError);
  });

  it('saves again once the file reads cleanly', async () => {
    const path = await tempFile();
    await writeFile(path, 'not json', 'utf8');
    const store = new SettleStore(path);
    await expect(store.set(octo, 'octo/repo', 1, { settled: true, at: RECENT })).rejects.toThrow(SettleFileError);
    await writeFile(path, '{}', 'utf8');
    await store.set(octo, 'octo/repo', 1, { settled: true, at: RECENT });
    expect(Object.keys(await store.choices(octo, 'octo/repo'))).toEqual(['1']);
  });
});
