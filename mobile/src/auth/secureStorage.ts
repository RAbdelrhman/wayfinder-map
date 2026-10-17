import * as SecureStore from 'expo-secure-store';

import { createTokenStore, type KeyValueStore } from './tokenStore';

// This device only: the token must not travel in a backup restored onto another phone.
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

const secureStore: KeyValueStore = {
  get: (key) => SecureStore.getItemAsync(key, options),
  set: (key, value) => SecureStore.setItemAsync(key, value, options),
  remove: (key) => SecureStore.deleteItemAsync(key, options),
};

export const tokenStore = createTokenStore(secureStore);
