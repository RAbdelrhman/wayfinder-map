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
const followsKey = 'wayfinder.follows.v1';
export async function otherFollowAccounts(
  storage: Storage,
  login: string,
): Promise<string[]> {
  const value = await storage.getItem(followsKey);
  if (!value) return [];
  try {
    const root: unknown = JSON.parse(value);
    return root && typeof root === 'object' && !Array.isArray(root)
      ? Object.keys(root).filter(
          (key) => key.toLowerCase() !== login.toLowerCase(),
        )
      : [];
  } catch {
    return [];
  }
}
let followWrite: Promise<void> = Promise.resolve();

/** Persist account-scoped references without overwriting another account's follows. */
export async function updateFollow(
  storage: Storage,
  login: string,
  ref: MapRef,
  follow: boolean,
  seed: string | null = null,
): Promise<MapRef[]> {
  if (!validRef(ref)) throw new Error('Invalid map reference.');
  let result: MapRef[] = [];
  const operation = followWrite
    .catch(() => undefined)
    .then(async () => {
      const saved = await storage.getItem(followsKey);
      let root: Record<string, unknown> = {};
      if (saved !== null) {
        const parsed: unknown = JSON.parse(saved);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
          throw new Error('Saved follows are unreadable.');
        root = parsed as Record<string, unknown>;
      }
      const account = Object.keys(root).find(
        (key) => key.toLowerCase() === login.toLowerCase(),
      );
      if (
        account &&
        (!root[account] ||
          typeof root[account] !== 'object' ||
          Array.isArray(root[account]))
      )
        throw new Error('Saved follows are unreadable.');
      const initial = account
        ? parseFollows(saved, login)
        : parseFollows(seed, login);
      const refs = new Map(
        initial.map((item) => [
          `${item.repo.toLowerCase()}#${item.number}`,
          item,
        ]),
      );
      const key = `${ref.repo.toLowerCase()}#${ref.number}`;
      if (follow) refs.set(key, ref);
      else refs.delete(key);
      result = [...refs.values()];
      const grouped: Record<string, number[]> = {};
      for (const item of result) (grouped[item.repo] ??= []).push(item.number);
      root[account ?? login] = grouped;
      await storage.setItem(followsKey, JSON.stringify(root));
    });
  followWrite = operation;
  await operation;
  return result;
}
export async function readFollows(
  storage: Storage,
  login: string,
  seed: string | null = null,
): Promise<MapRef[]> {
  await followWrite.catch(() => undefined);
  const saved = await storage.getItem(followsKey);
  if (saved !== null) {
    const root: unknown = JSON.parse(saved);
    if (!root || typeof root !== 'object' || Array.isArray(root))
      throw new Error('Saved follows are unreadable.');
    const account = Object.entries(root).find(
      ([key]) => key.toLowerCase() === login.toLowerCase(),
    );
    if (
      account &&
      (!account[1] ||
        typeof account[1] !== 'object' ||
        Array.isArray(account[1]))
    )
      throw new Error('Saved follows are unreadable.');
    if (account) return parseFollows(saved, login);
  }
  return parseFollows(seed, login);
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
/** Serialize eviction after pending writes so denied data cannot be restored by an older write. */
export async function removeCache(
  storage: { removeItem(key: string): Promise<void> },
  login: string,
  resource: string,
): Promise<void> {
  const key = cacheKey(login, resource);
  const removal = (writes.get(key) ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => storage.removeItem(key));
  writes.set(key, removal);
  try {
    await removal;
  } finally {
    if (writes.get(key) === removal) writes.delete(key);
  }
}
export async function removeFollowSnapshots(
  storage: { removeItem(key: string): Promise<void> },
  login: string,
  refs: readonly MapRef[],
): Promise<void> {
  await Promise.all(
    refs.map((ref) =>
      removeCache(
        storage,
        login,
        `followed:${ref.repo.toLowerCase()}#${ref.number}`,
      ),
    ),
  );
}
/** Remove a map and all ticket snapshots scoped to it, after queued writes settle. */
export async function removeMapContents(
  storage: {
    getAllKeys(): Promise<readonly string[]>;
    removeItem(key: string): Promise<void>;
  },
  login: string,
  ref: MapRef,
): Promise<void> {
  const map = `${ref.repo.toLowerCase()}#${ref.number}`;
  const prefix = cacheKey(login, `ticket-map:${map}:`);
  const base = cacheKey(login, '');
  const keys = new Set([...(await storage.getAllKeys()), ...writes.keys()]);
  await Promise.all([
    removeCache(storage, login, `map:${map}`),
    ...[...keys]
      .filter((key) => key.startsWith(prefix))
      .map((key) => removeCache(storage, login, key.slice(base.length))),
  ]);
}
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
