import { describe, expect, it } from 'vitest';

import { defaultTier, saveDefaultTier } from './models.js';

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
