import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_PROGRESS_SETTINGS,
  HISTORY_DAYS,
  ProgressService,
  ProgressSettingsStore,
  applySettings,
  dailyCounts,
  readCompletedTickets,
  readSettings,
  streak,
} from './progress.js';
import type { ProgressDependencies } from './progress.js';

describe('readSettings', () => {
  it('defaults a new user to the Trail with a goal of 5', () => {
    expect(readSettings(undefined)).toEqual({ style: 'trail', goal: 5 });
    expect(DEFAULT_PROGRESS_SETTINGS).toEqual({ style: 'trail', goal: 5 });
  });

  it('keeps valid saved values and replaces unknown ones', () => {
    expect(readSettings({ style: 'hex', goal: 8 })).toEqual({ style: 'hex', goal: 8 });
    expect(readSettings({ style: 'pie', goal: 4 })).toEqual({ style: 'trail', goal: 5 });
  });
});

describe('applySettings', () => {
  const current = { style: 'trail', goal: 5 } as const;

  it('changes only what the patch names', () => {
    expect(applySettings(current, { style: 'bar' })).toEqual({ style: 'bar', goal: 5 });
    expect(applySettings(current, { goal: 3 })).toEqual({ style: 'trail', goal: 3 });
  });

  it('rejects empty or invalid changes', () => {
    expect(applySettings(current, {})).toBeNull();
    expect(applySettings(current, null)).toBeNull();
    expect(applySettings(current, { goal: 4 })).toBeNull();
    expect(applySettings(current, { style: 'hex', goal: '8' })).toBeNull();
  });
});

describe('ProgressSettingsStore', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('keeps settings apart per GitHub login and survives a restart', async () => {
    dir = await mkdtemp(join(tmpdir(), 'wayfinder-progress-'));
    const file = join(dir, 'nested', 'progress.json');
    const store = new ProgressSettingsStore(file);
    expect(await store.get('octo')).toEqual(DEFAULT_PROGRESS_SETTINGS);

    expect(await store.update('Octo', { style: 'hex' })).toEqual({ style: 'hex', goal: 5 });
    expect(await store.update('mona', { goal: 8 })).toEqual({ style: 'trail', goal: 8 });

    const reopened = new ProgressSettingsStore(file);
    expect(await reopened.get('octo')).toEqual({ style: 'hex', goal: 5 });
    expect(await reopened.get('mona')).toEqual({ style: 'trail', goal: 8 });
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ octo: { style: 'hex', goal: 5 }, mona: { style: 'trail', goal: 8 } });
  });

  it('writes nothing for an invalid change', async () => {
    dir = await mkdtemp(join(tmpdir(), 'wayfinder-progress-'));
    const file = join(dir, 'progress.json');
    expect(await new ProgressSettingsStore(file).update('octo', { style: 'pie' })).toBeNull();
    await expect(readFile(file, 'utf8')).rejects.toThrow();
  });
});

describe('dailyCounts', () => {
  const now = new Date(2026, 8, 23, 15, 0);

  it('buckets closes into local days, oldest first and today last', () => {
    const counts = dailyCounts(
      [new Date(2026, 8, 23, 9).toISOString(), new Date(2026, 8, 23, 0, 5).toISOString(), new Date(2026, 8, 21, 23, 59).toISOString(), 'not a date'],
      now,
      5,
    );
    expect(counts).toEqual([0, 0, 1, 0, 2]);
  });

  it('drops closes outside the window', () => {
    expect(dailyCounts([new Date(2026, 8, 10).toISOString(), new Date(2026, 8, 24).toISOString()], now, 7)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(dailyCounts([], now)).toHaveLength(HISTORY_DAYS);
  });
});

describe('streak', () => {
  it('counts days in a row with a cleared ticket, ending today', () => {
    expect(streak([1, 0, 2, 1, 3])).toBe(3);
  });

  it('keeps yesterday’s streak while today has none yet', () => {
    expect(streak([0, 4, 1, 0])).toBe(2);
  });

  it('is zero once a full day is missed', () => {
    expect(streak([3, 0, 0])).toBe(0);
    expect(streak([])).toBe(0);
  });
});

describe('readCompletedTickets', () => {
  it('searches the user’s completed issues and keeps Wayfinder tickets, not maps', async () => {
    const runGh = vi.fn(async (_args: string[]) =>
      [
        JSON.stringify({ closed_at: '2026-09-22T10:00:00Z', labels: ['wayfinder:task'] }),
        JSON.stringify({ closed_at: '2026-09-21T10:00:00Z', labels: ['bug'] }),
        JSON.stringify({ closed_at: '2026-09-20T10:00:00Z', labels: ['wayfinder:map'] }),
        JSON.stringify({ closed_at: '2026-09-19T10:00:00Z', labels: ['wayfinder:research', 'docs'] }),
        '',
      ].join('\n'),
    );
    const closed = await readCompletedTickets('octo', { typePrefix: 'wayfinder:', mapLabel: 'wayfinder:map', since: new Date(2026, 6, 2) }, runGh);
    expect(closed).toEqual(['2026-09-22T10:00:00Z', '2026-09-19T10:00:00Z']);
    const args = runGh.mock.calls[0]?.[0] ?? [];
    expect(args).toContain('q=is:issue is:closed reason:completed assignee:octo closed:>=2026-07-01');
    expect(args).toContain('--paginate');
  });
});

describe('ProgressService', () => {
  const now = () => new Date(2026, 8, 23, 12);
  const dependencies = (overrides: Partial<ProgressDependencies> = {}): ProgressDependencies => ({
    login: async () => 'octo',
    store: { get: async () => ({ style: 'bar', goal: 3 }), update: async (_login, patch) => applySettings(DEFAULT_PROGRESS_SETTINGS, patch) },
    completed: async () => [new Date(2026, 8, 23, 9).toISOString(), new Date(2026, 8, 22, 9).toISOString()],
    now,
    ...overrides,
  });

  it('returns the user’s settings, daily counts and streak', async () => {
    const state = await new ProgressService(dependencies()).state();
    expect(state).toMatchObject({ login: 'octo', settings: { style: 'bar', goal: 3 }, streak: 2, warning: null });
    expect(state.days).toHaveLength(HISTORY_DAYS);
    expect(state.days?.slice(-3)).toEqual([0, 1, 1]);
  });

  it('asks for history from the first day of the window', async () => {
    const completed = vi.fn(async () => []);
    await new ProgressService(dependencies({ completed })).state();
    expect(completed).toHaveBeenCalledWith('octo', new Date(2026, 6, 2));
  });

  it('shows the default panel with no history when signed out', async () => {
    const state = await new ProgressService(dependencies({ login: async () => null })).state();
    expect(state).toEqual({ login: null, settings: DEFAULT_PROGRESS_SETTINGS, days: null, streak: 0, warning: null });
  });

  it('keeps the settings and reports a warning when GitHub fails', async () => {
    const state = await new ProgressService(dependencies({ completed: async () => Promise.reject(new Error('rate limit')) })).state();
    expect(state).toMatchObject({ settings: { style: 'bar', goal: 3 }, days: null, warning: "Couldn't count closed tickets. Wayfinder hit GitHub's rate limit. Try again in a few minutes." });
  });

  it('saves for the signed-in user and refuses when signed out or invalid', async () => {
    await expect(new ProgressService(dependencies()).save({ style: 'hex' })).resolves.toEqual({ style: 'hex', goal: 5 });
    await expect(new ProgressService(dependencies()).save({ goal: 7 })).rejects.toMatchObject({ status: 400 });
    await expect(new ProgressService(dependencies({ login: async () => null })).save({ goal: 3 })).rejects.toMatchObject({ status: 409 });
  });
});
