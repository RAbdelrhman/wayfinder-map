// The GitHub token lives only in the phone's secure storage (Keychain on iOS, Keystore on Android).

export type KeyValueStore = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

export const TOKEN_KEY = 'wayfinder.github.token';

export type TokenStore = {
  load: () => Promise<string | null>;
  save: (token: string) => Promise<void>;
  clear: () => Promise<void>;
};

export function createTokenStore(store: KeyValueStore): TokenStore {
  return {
    // A storage that can't be read (a key the OS invalidated, a locked keystore) counts as signed out.
    async load() {
      try {
        return (await store.get(TOKEN_KEY)) || null;
      } catch {
        return null;
      }
    },
    save: (token) => store.set(TOKEN_KEY, token),
    clear: () => store.remove(TOKEN_KEY),
  };
}
