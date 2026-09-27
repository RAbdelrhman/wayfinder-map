import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { SettleStore, isIdleCandidate, settlementOf } from './settling.js';

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

  afterEach(async () => {
    if (dir !== '') await rm(dir, { recursive: true, force: true });
  });

  it('keeps choices per login and repository across restarts', async () => {
    dir = await mkdtemp(join(tmpdir(), 'wayfinder-settle-'));
    const path = join(dir, 'nested', 'settled.json');
    await new SettleStore(path).set('Octo', 'Octo/Repo', 12, { settled: true, at: RECENT });
    await new SettleStore(path).set('octo', 'octo/repo', 7, { settled: false, at: OLD });

    const restarted = new SettleStore(path);
    expect(await restarted.choices('OCTO', 'octo/REPO')).toEqual({ 12: { settled: true, at: RECENT }, 7: { settled: false, at: OLD } });
    expect(await restarted.choices('someone-else', 'octo/repo')).toEqual({});
    expect(await restarted.choices('octo', 'octo/other')).toEqual({});
    expect(JSON.parse(await readFile(path, 'utf8'))).toHaveProperty(['octo', 'octo/repo', '12']);
  });

  it('keeps both of two choices saved at once', async () => {
    dir = await mkdtemp(join(tmpdir(), 'wayfinder-settle-'));
    const store = new SettleStore(join(dir, 'settled.json'));
    await Promise.all([store.set('octo', 'octo/repo', 1, { settled: true, at: RECENT }), store.set('octo', 'octo/repo', 2, { settled: true, at: RECENT })]);
    expect(Object.keys(await store.choices('octo', 'octo/repo'))).toEqual(['1', '2']);
  });

  it('reads a missing or damaged file as no choices', async () => {
    dir = await mkdtemp(join(tmpdir(), 'wayfinder-settle-'));
    expect(await new SettleStore(join(dir, 'missing.json')).choices('octo', 'octo/repo')).toEqual({});
  });
});
