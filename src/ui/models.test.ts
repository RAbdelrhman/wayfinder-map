import { describe, expect, it } from 'vitest';

import { autoRater, defaultTier, saveAutoRater, saveDefaultTier } from './models.js';

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
