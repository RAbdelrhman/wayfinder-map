import { describe, expect, it, vi } from 'vitest';

import { autoRater, calibrationMode, currentCatalog, defaultTier, loadCatalog, saveAutoRater, saveCalibrationMode, saveDefaultTier } from './models.js';
import * as routeCache from './routeData.js';

it('refreshes a saved catalog after using it for immediate display', async () => {
  const unavailable = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  const cache = new routeCache.RouteDataCache('', unavailable, unavailable);
  const saved = { providers: [] };
  vi.spyOn(cache, 'peek').mockReturnValue(saved);
  vi.spyOn(routeCache, 'routeData').mockReturnValue(cache);
  const read = vi.spyOn(routeCache, 'readRouteJson').mockResolvedValue({ providers: [] });
  try {
    expect(currentCatalog()).toEqual({ status: 'ready', catalog: saved });
    await loadCatalog();
    expect(read).toHaveBeenCalledWith('/api/models', true);
  } finally { vi.restoreAllMocks(); }
});

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value) };
}

describe('default model tier', () => {
  it('starts on Mid and keeps the tier chosen in Settings', () => {
    const storage = memoryStorage();
    expect(defaultTier(storage)).toBe('mid');

    saveDefaultTier('hard', storage);
    expect(defaultTier(storage)).toBe('hard');
  });

  it('falls back to Mid for an unknown saved value or unreadable storage', () => {
    const storage = memoryStorage();
    storage.setItem('wayfinder-map:default-tier:v1', 'huge');
    expect(defaultTier(storage)).toBe('mid');

    expect(defaultTier({ getItem: () => { throw new Error('blocked'); } })).toBe('mid');
  });
});

describe('calibration mode setting (#186)', () => {
  it('is off until the user opts in, then keeps the shadow model they chose', () => {
    const storage = memoryStorage();
    expect(calibrationMode(storage)).toEqual({ kind: 'off' });

    saveCalibrationMode({ kind: 'shadow', choice: { instanceId: 'codex', model: 'gpt-5.6-luna' } }, storage);
    expect(calibrationMode(storage)).toEqual({ kind: 'shadow', choice: { instanceId: 'codex', model: 'gpt-5.6-luna' } });

    saveCalibrationMode({ kind: 'off' }, storage);
    expect(calibrationMode(storage)).toEqual({ kind: 'off' });
  });

  it('stays off for a mode with no usable model, bad JSON or unreadable storage, so no extra call is made by accident', () => {
    const storage = memoryStorage();
    storage.setItem('wayfinder-map:auto-calibration:v1', JSON.stringify({ kind: 'shadow', choice: { model: 'no-provider' } }));
    expect(calibrationMode(storage)).toEqual({ kind: 'off' });
    storage.setItem('wayfinder-map:auto-calibration:v1', '{nope');
    expect(calibrationMode(storage)).toEqual({ kind: 'off' });
    expect(calibrationMode({ getItem: () => { throw new Error('blocked'); } })).toEqual({ kind: 'off' });
  });
});

describe('auto rater setting', () => {
  it('is logic only until a model is chosen in Settings, then keeps that model', () => {
    const storage = memoryStorage();
    expect(autoRater(storage)).toEqual({ kind: 'logic' });

    saveAutoRater({ kind: 'model', choice: { instanceId: 'codex', model: 'gpt-5.6-luna' } }, storage);
    expect(autoRater(storage)).toEqual({ kind: 'model', choice: { instanceId: 'codex', model: 'gpt-5.6-luna' } });

    saveAutoRater({ kind: 'logic' }, storage);
    expect(autoRater(storage)).toEqual({ kind: 'logic' });
  });

  it('falls back to logic only for a model with no usable choice, bad JSON or unreadable storage', () => {
    const storage = memoryStorage();
    storage.setItem('wayfinder-map:auto-rater:v1', JSON.stringify({ kind: 'model', choice: { model: 'no-provider' } }));
    expect(autoRater(storage)).toEqual({ kind: 'logic' });
    storage.setItem('wayfinder-map:auto-rater:v1', '{nope');
    expect(autoRater(storage)).toEqual({ kind: 'logic' });
    expect(autoRater({ getItem: () => { throw new Error('blocked'); } })).toEqual({ kind: 'logic' });
  });
});
