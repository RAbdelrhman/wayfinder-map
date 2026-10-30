import { expect, it, vi } from 'vitest';
const values = vi.hoisted(() => new Map<string, string>());
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => values.get(key) ?? null,
  setItem: async (key: string, value: string) => { values.set(key, value); },
  removeItem: async (key: string) => { values.delete(key); },
} }));
import { loadMaps } from './BrowseProvider';
import { cacheKey, updateFollow, writeCache } from './cache';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MapSummary } from './github';

it('removes a followed snapshot when a successful read confirms the map is private', async () => {
  values.clear();
  const map: MapSummary = { repo: 'o/r', number: 9, title: 'Old public title', body: 'Visibility: public', url: 'https://github.com/o/r/issues/9', author: 'other', open: true, updatedAt: '', total: 0, completed: 0 };
  await updateFollow(AsyncStorage, 'me', map, true);
  await writeCache(AsyncStorage, 'me', 'followed:o/r#9', map);
  const api = { maps: async () => ({ maps: [], hidden: [{ ...map, body: 'Visibility: private' }], unavailable: [], warnings: [] }) };
  await loadMaps(api, 'me', new AbortController().signal);
  expect(values.has(cacheKey('me', 'followed:o/r#9'))).toBe(false);
  // The follow reference remains removable and can recover if the map becomes public.
  expect([...values.values()].some(value => value.includes('o/r'))).toBe(true);
});
