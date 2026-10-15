import { describe, expect, it } from 'vitest';

import { createTokenStore, TOKEN_KEY, type KeyValueStore } from './tokenStore';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => void data.set(key, value),
    remove: async (key) => void data.delete(key),
  };
}

describe('createTokenStore', () => {
  it('saves the token under one key and loads it back', async () => {
    const kv = memoryStore();
    const store = createTokenStore(kv);
    expect(await store.load()).toBeNull();
    await store.save('gho_abc');
    expect(kv.data.get(TOKEN_KEY)).toBe('gho_abc');
    expect(await store.load()).toBe('gho_abc');
  });

  it('clear removes the token', async () => {
    const kv = memoryStore();
    const store = createTokenStore(kv);
    await store.save('gho_abc');
    await store.clear();
    expect(kv.data.size).toBe(0);
    expect(await store.load()).toBeNull();
  });

  it('treats an unreadable storage as signed out', async () => {
    const store = createTokenStore({
      ...memoryStore(),
      get: async () => {
        throw new Error('key invalidated');
      },
    });
    expect(await store.load()).toBeNull();
  });

  it('treats an empty stored value as signed out', async () => {
    const kv = memoryStore();
    kv.data.set(TOKEN_KEY, '');
    expect(await createTokenStore(kv).load()).toBeNull();
  });

  it('lets a save failure reach the caller', async () => {
    const store = createTokenStore({
      ...memoryStore(),
      set: async () => {
        throw new Error('disk full');
      },
    });
    await expect(store.save('gho_abc')).rejects.toThrow('disk full');
  });
});
