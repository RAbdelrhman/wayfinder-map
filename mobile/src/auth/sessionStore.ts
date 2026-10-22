// The GitHub session (token, login, name, sign-in time) lives only in the phone's secure storage:
// Keychain on iOS, Keystore on Android.
import type { Session } from './deviceFlow';

export type KeyValueStore = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

export const SESSION_KEY = 'wayfinder.github.session';

export type SessionStore = {
  load: () => Promise<Session | null>;
  save: (session: Session) => Promise<void>;
  clear: () => Promise<void>;
};

function parseSession(raw: string): Session | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { token, login, name, signedInAt } = value as Record<string, unknown>;
    if (typeof token !== 'string' || !token || typeof login !== 'string' || !login) return null;
    if (typeof signedInAt !== 'number') return null;
    return { token, login, name: typeof name === 'string' ? name : null, signedInAt };
  } catch {
    return null;
  }
}

export function createSessionStore(store: KeyValueStore): SessionStore {
  return {
    // A storage that can't be read (a key the OS invalidated, a locked keystore) or holds something unreadable counts as signed out.
    async load() {
      try {
        const raw = await store.get(SESSION_KEY);
        return raw ? parseSession(raw) : null;
      } catch {
        return null;
      }
    },
    save: (session) => store.set(SESSION_KEY, JSON.stringify(session)),
    clear: () => store.remove(SESSION_KEY),
  };
}
