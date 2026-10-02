import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { AutoMapFileStore, EMPTY_AUTO_MAP_STATE, memoryAutoMapStore, parseAutoMapState } from './autoMapStore.js';
import type { AutoMapState } from './autoMapStore.js';

const SETTING = { enabled: true, tier: 'hard' as const, setUp: true, enabledAt: '2026-10-01T10:00:00.000Z' };
const NOTICE = { id: 'automap:b1', kind: 'handOffError' as const, repo: 'octo/one', mapNumber: 5, mapTitle: 'Roadmap', ticketNumber: 11, ticketTitle: 'Ticket 11', createdAt: '2026-10-01T10:06:00.000Z' };
const STATE: AutoMapState = {
  maps: [{ repo: 'octo/one', mapNumber: 5, setting: SETTING }],
  settings: { cap: 6, tierModels: { hard: { instanceId: 'codex', model: 'gpt-5.6-sol' } }, rater: { kind: 'logic' }, calibration: { kind: 'off' } },
  notices: [NOTICE],
};

let directory: string | null = null;

afterEach(async () => {
  if (directory !== null) await rm(directory, { recursive: true, force: true });
  directory = null;
});

async function pathInTemp(): Promise<string> {
  directory = await mkdtemp(join(tmpdir(), 'wayfinder-auto-map-'));
  return join(directory, 'nested', 'auto-maps.json');
}

describe('AutoMapFileStore', () => {
  it('starts empty when nothing was saved', async () => {
    expect(await new AutoMapFileStore(await pathInTemp()).load()).toEqual(EMPTY_AUTO_MAP_STATE);
  });

  it('keeps the settings and notices across a restart', async () => {
    const path = await pathInTemp();
    await new AutoMapFileStore(path).save(STATE);
    expect(await new AutoMapFileStore(path).load()).toEqual(STATE);
    expect((JSON.parse(await readFile(path, 'utf8')) as { version: number }).version).toBe(1);
  });

  it('starts empty rather than fail on a damaged file', async () => {
    const path = await pathInTemp();
    await new AutoMapFileStore(path).save(STATE);
    await writeFile(path, '{nope', 'utf8');
    expect(await new AutoMapFileStore(path).load()).toEqual(EMPTY_AUTO_MAP_STATE);
  });
});

describe('parseAutoMapState', () => {
  it('drops what is odd and keeps the rest', () => {
    const parsed = parseAutoMapState({
      maps: [
        { repo: 'octo/one', mapNumber: 5, setting: { enabled: true, tier: 'huge', setUp: true, enabledAt: SETTING.enabledAt } },
        { repo: 'not a repo', mapNumber: 6, setting: SETTING },
        { repo: 'octo/one', mapNumber: -1, setting: SETTING },
        { repo: 'octo/one', mapNumber: 7, setting: { enabled: true, tier: 'mid', setUp: true, enabledAt: null } },
      ],
      settings: { cap: 0, tierModels: { mid: 'nope' }, rater: { kind: 'model' }, calibration: { kind: 'shadow' } },
      notices: [NOTICE, { ...NOTICE, id: 3 }, 'x'],
    });
    expect(parsed.maps.map((entry) => [entry.mapNumber, entry.setting.enabled, entry.setting.tier])).toEqual([[5, true, 'auto'], [7, false, 'mid']]);
    expect(parsed.settings).toEqual({ cap: null, tierModels: {}, rater: { kind: 'logic' }, calibration: { kind: 'off' } });
    expect(parsed.notices).toEqual([NOTICE]);
  });

  it('keeps one entry per map', () => {
    const entry = { repo: 'octo/one', mapNumber: 5, setting: SETTING };
    expect(parseAutoMapState({ maps: [entry, { ...entry, repo: 'Octo/One' }] }).maps).toHaveLength(1);
  });

  it('is empty for anything that is not an object', () => {
    expect(parseAutoMapState(null)).toEqual(EMPTY_AUTO_MAP_STATE);
    expect(parseAutoMapState([])).toEqual(EMPTY_AUTO_MAP_STATE);
  });
});

describe('memoryAutoMapStore', () => {
  it('hands back a copy of what it was given', async () => {
    const store = memoryAutoMapStore();
    await store.save(STATE);
    const loaded = await store.load();
    loaded.notices.length = 0;
    expect((await store.load()).notices).toHaveLength(1);
  });
});
