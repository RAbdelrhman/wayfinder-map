import type { MapRef } from './github';
import { validRef } from './github';

export interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
export type Cached<T> = { data: T; savedAt: number };
export function cacheKey(login: string, resource: string): string {
  return `wayfinder.maps.v1:${login.toLowerCase()}:${resource}`;
}
/** Follows are account-scoped, in the desktop's repo -> issue numbers format. No credentials are stored here. */
export function parseFollows(value: string | null, login: string): MapRef[] {
  try {
    const root: unknown = JSON.parse(value ?? '{}');
    if (!root || typeof root !== 'object') return [];
    const user: unknown = Object.entries(root).find(
      ([key]) => key.toLowerCase() === login.toLowerCase(),
    )?.[1];
    if (!user || typeof user !== 'object' || Array.isArray(user)) return [];
    return Object.entries(user).flatMap(([repo, numbers]) =>
      Array.isArray(numbers)
        ? numbers.map((number: unknown) => ({ repo, number })).filter(validRef)
        : [],
    );
  } catch {
    return [];
  }
}
export async function readCache<T>(
  storage: Storage,
  login: string,
  resource: string,
  validate: (value: unknown) => value is T,
): Promise<Cached<T> | null> {
  try {
    const raw: unknown = JSON.parse(
      (await storage.getItem(cacheKey(login, resource))) ?? 'null',
    );
    if (!raw || typeof raw !== 'object') return null;
    const envelope = raw as Record<string, unknown>;
    if (
      typeof envelope.savedAt !== 'number' ||
      !Number.isFinite(envelope.savedAt) ||
      !validate(envelope.data)
    )
      return null;
    return { data: envelope.data, savedAt: envelope.savedAt };
  } catch {
    return null;
  }
}
const writes = new Map<string, Promise<void>>();
export async function writeCache<T>(
  storage: Storage,
  login: string,
  resource: string,
  data: T,
): Promise<number> {
  const key = cacheKey(login, resource);
  const savedAt = Date.now();
  const write = (writes.get(key) ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => storage.setItem(key, JSON.stringify({ data, savedAt })));
  writes.set(key, write);
  try {
    await write;
  } finally {
    if (writes.get(key) === write) writes.delete(key);
  }
  return savedAt;
}
