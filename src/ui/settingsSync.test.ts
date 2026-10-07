import { describe, expect, it, vi } from 'vitest';

import type { AutoMapMachineSettings } from '../autoMapStore.js';
import type { ModelChoice } from '../models.js';
import { AUTO_RATER_KEY, CALIBRATION_KEY, TIER_DEFAULTS_KEY } from './models.js';
import { adoptSettings, readLocalSettings, reconcileSettings, syncServerSettings } from './settingsSync.js';
import { CAP_KEY } from './startNext.js';

const SOL: ModelChoice = { instanceId: 'codex', model: 'gpt-5.6-sol' };
const NOTHING: AutoMapMachineSettings = { cap: null, tierModels: null, rater: null, calibration: null };

function memoryStorage(initial: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem'> {
  const items = new Map(Object.entries(initial));
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value) };
}

describe('readLocalSettings', () => {
  it('is null for what this browser never saved', () => {
    expect(readLocalSettings(memoryStorage())).toEqual(NOTHING);
    expect(readLocalSettings(memoryStorage({ [TIER_DEFAULTS_KEY]: '{}', [CAP_KEY]: '{nope' }))).toEqual(NOTHING);
  });

  it('reads the cap, the tier models and the rater', () => {
    const storage = memoryStorage({ [CAP_KEY]: '6', [TIER_DEFAULTS_KEY]: JSON.stringify({ hard: SOL, mid: 'junk' }), [AUTO_RATER_KEY]: JSON.stringify({ kind: 'model', choice: SOL }), [CALIBRATION_KEY]: JSON.stringify({ kind: 'shadow', choice: SOL }) });
    expect(readLocalSettings(storage)).toEqual({ cap: 6, tierModels: { hard: SOL }, rater: { kind: 'model', choice: SOL }, calibration: { kind: 'shadow', choice: SOL } });
  });

  it('falls back to the default cap for a value that is not one', () => {
    expect(readLocalSettings(memoryStorage({ [CAP_KEY]: '99' })).cap).toBe(4);
  });
});

describe('reconcileSettings', () => {
  const local: AutoMapMachineSettings = { cap: 6, tierModels: { hard: SOL }, rater: { kind: 'logic' }, calibration: { kind: 'off' } };

  it('sends up what only this browser has', () => {
    expect(reconcileSettings(local, NOTHING)).toEqual({ adopt: {}, push: { cap: 6, tierModels: { hard: SOL }, rater: { kind: 'logic' }, calibration: { kind: 'off' } } });
  });

  it('takes what the server has, field by field, over this browser’s', () => {
    const server: AutoMapMachineSettings = { cap: 2, tierModels: null, rater: { kind: 'model', choice: SOL }, calibration: { kind: 'shadow', choice: SOL } };
    expect(reconcileSettings(local, server)).toEqual({ adopt: { cap: 2, rater: server.rater, calibration: server.calibration }, push: { tierModels: { hard: SOL } } });
  });

  it('does nothing when neither has anything', () => {
    expect(reconcileSettings(NOTHING, NOTHING)).toEqual({ adopt: {}, push: {} });
  });
});

describe('adoptSettings', () => {
  it('keeps an edit made while the server settings are loading', async () => {
    let finish: (value: Response) => void = () => undefined;
    const request = new Promise<Response>((resolve) => { finish = resolve; });
    const storage = memoryStorage({ [CAP_KEY]: '2' });
    vi.stubGlobal('fetch', vi.fn(() => request));
    try {
      const pending = syncServerSettings(storage);
      storage.setItem(CAP_KEY, '6');
      finish(new Response(JSON.stringify({ settings: { ...NOTHING, cap: 4 } })));
      await pending;
      expect(readLocalSettings(storage).cap).toBe(6);
    } finally { vi.unstubAllGlobals(); }
  });
  it('writes what the server holds into the browser’s own keys', () => {
    const storage = memoryStorage();
    adoptSettings(storage, { cap: 2, tierModels: { mid: SOL }, rater: { kind: 'logic' }, calibration: { kind: 'shadow', choice: SOL } });
    expect(readLocalSettings(storage)).toEqual({ cap: 2, tierModels: { mid: SOL }, rater: { kind: 'logic' }, calibration: { kind: 'shadow', choice: SOL } });
  });

  it('leaves alone what the server has no value for', () => {
    const storage = memoryStorage({ [CAP_KEY]: '6' });
    adoptSettings(storage, {});
    adoptSettings(storage, NOTHING);
    expect(storage.getItem(CAP_KEY)).toBe('6');
  });
});
