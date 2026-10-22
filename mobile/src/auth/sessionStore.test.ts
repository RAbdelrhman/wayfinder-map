import { describe, expect, it } from 'vitest';

import type { Session } from './deviceFlow';
import { createSessionStore, SESSION_KEY, type KeyValueStore } from './sessionStore';

const session: Session = { token: 'gho_abc', login: 'octocat', name: 'Mona Lisa', signedInAt: 1_000_000 };

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => void data.set(key, value),
    remove: async (key) => void data.delete(key),
  };
}

describe('createSessionStore', () => {
  it('saves the session under one key and loads it back', async () => {
    const kv = memoryStore();
    const store = createSessionStore(kv);
    expect(await store.load()).toBeNull();
    await store.save(session);
    expect([...kv.data.keys()]).toEqual([SESSION_KEY]);
    expect(await store.load()).toEqual(session);
  });

  it('keeps a missing profile name as null', async () => {
    const store = createSessionStore(memoryStore());
    await store.save({ ...session, name: null });
    expect(await store.load()).toEqual({ ...session, name: null });
  });

  it('clear removes the session', async () => {
    const kv = memoryStore();
    const store = createSessionStore(kv);
    await store.save(session);
    await store.clear();
    expect(kv.data.size).toBe(0);
    expect(await store.load()).toBeNull();
  });

  it('treats an unreadable storage as signed out', async () => {
    const store = createSessionStore({
      ...memoryStore(),
      get: async () => {
        throw new Error('key invalidated');
      },
    });
    expect(await store.load()).toBeNull();
  });

  it.each([
    ['an empty value', ''],
    ['text that is not JSON', 'gho_abc'],
    ['JSON that is not an object', '"gho_abc"'],
    ['a session without a token', JSON.stringify({ login: 'octocat', signedInAt: 1 })],
    ['a session without a login', JSON.stringify({ token: 'gho_abc', signedInAt: 1 })],
    ['a session without a sign-in time', JSON.stringify({ token: 'gho_abc', login: 'octocat' })],
  ])('treats %s as signed out', async (_label, raw) => {
    const kv = memoryStore();
    kv.data.set(SESSION_KEY, raw);
    expect(await createSessionStore(kv).load()).toBeNull();
  });

  it('lets a save failure reach the caller', async () => {
    const store = createSessionStore({
      ...memoryStore(),
      set: async () => {
        throw new Error('disk full');
      },
    });
    await expect(store.save(session)).rejects.toThrow('disk full');
  });
});
