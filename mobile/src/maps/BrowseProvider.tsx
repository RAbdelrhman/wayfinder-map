import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';

import type { Session } from '../auth/deviceFlow';
import { GithubError, MobileGithub } from './github';
import {
  readFollows,
  readCache,
  removeFollowSnapshots,
  removeMapContents,
  writeCache,
  updateFollow,
} from './cache';
import type { MapRef } from './github';
import { resourceFailure } from './resourceFailure';

type Browse = {
  api: MobileGithub;
  session: Session;
  followRevision: number;
  setFollow: (ref: MapRef, follow: boolean) => Promise<void>;
};
const Context = createContext<Browse | null>(null);
export function BrowseProvider({
  session,
  children,
}: {
  session: Session;
  children: ReactNode;
}) {
  const [followRevision, setFollowRevision] = useState(0);
  const api = useMemo(() => new MobileGithub(session.token), [session.token]);
  const setFollow = useCallback(
    async (ref: MapRef, follow: boolean) => {
      await updateFollow(
        AsyncStorage,
        session.login,
        ref,
        follow,
        process.env.EXPO_PUBLIC_FOLLOWED_MAPS ?? null,
      );
      try {
        if (!follow) await removeFollowSnapshots(AsyncStorage, session.login, [ref]);
      } finally {
        setFollowRevision((value) => value + 1);
      }
    },
    [session.login],
  );
  const value = useMemo(
    () => ({ session, api, followRevision, setFollow }),
    [session, api, followRevision, setFollow],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useBrowse(): Browse {
  const context = useContext(Context);
  if (!context) throw new Error('Map browsing requires a signed-in account.');
  return context;
}
export async function followedMaps(login: string) {
  return readFollows(
    AsyncStorage,
    login,
    process.env.EXPO_PUBLIC_FOLLOWED_MAPS ?? null,
  );
}
/** Evict saved public-map summaries when GitHub confirms access was lost. */
export async function loadMaps(
  api: Pick<MobileGithub, 'maps'>,
  login: string,
  signal: AbortSignal,
) {
  let follows: MapRef[];
  let followError: string | null = null;
  try {
    follows = await followedMaps(login);
  } catch (error) {
    follows = [];
    followError =
      error instanceof Error
        ? error.message
        : 'Couldn’t load this from GitHub. Try again.';
  }
  const evict = (refs: MapRef[]) =>
    removeFollowSnapshots(AsyncStorage, login, refs);
  try {
    const result = await api.maps(login, follows, signal);
    if (followError) result.warnings.push(followError);
    await evict([...result.unavailable, ...result.hidden]);
    const followedKeys = new Set(
      follows.map((ref) => `${ref.repo.toLowerCase()}#${ref.number}`),
    );
    await Promise.all(
      result.maps
        .filter((map) =>
          followedKeys.has(`${map.repo.toLowerCase()}#${map.number}`),
        )
        .map((map) =>
          writeCache(
            AsyncStorage,
            login,
            `followed:${map.repo.toLowerCase()}#${map.number}`,
            map,
          ).catch(() => undefined),
        ),
    );
    return result;
  } catch (error) {
    if (error instanceof GithubError && error.status === 401)
      await evict(follows);
    throw error;
  }
}
export type Resource<T> = {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  accessDenied: boolean;
  offline: boolean;
  savedAt: number | null;
  refresh: () => void;
};
/** Each screen owns its cancellation scope; an old account/route request cannot paint a new one. */
export function useResource<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  validate: (value: unknown) => value is T,
  canUseCached?: (value: T) => Promise<boolean>,
): Resource<T> {
  const { session, followRevision } = useBrowse();
  const [revision, setRevision] = useState(0);
  const scope = `${session.login.toLowerCase()}:${key}`;
  const empty = {
    data: null,
    loading: true,
    refreshing: false,
    error: null,
    accessDenied: false,
    offline: false,
    savedAt: null,
  };
  const [state, setState] = useState<
    Omit<Resource<T>, 'refresh'> & { scope: string }
  >({ ...empty, scope });
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState((current) =>
      current.scope === scope
        ? {
            ...current,
            data: canUseCached ? null : current.data,
            loading: !!canUseCached || current.data === null,
            refreshing: !canUseCached && current.data !== null,
            error: null,
            accessDenied: false,
            offline: false,
          }
        : { ...empty, scope },
    );
    void (async () => {
      const cached = await readCache(
        AsyncStorage,
        session.login,
        key,
        validate,
      );
      if (!active) return;
      const permitted =
        cached &&
        (!canUseCached || (await canUseCached(cached.data).catch(() => false)));
      if (!active) return;
      if (cached && permitted)
        setState((current) =>
          current.scope === scope &&
          current.savedAt !== null &&
          current.savedAt >= cached.savedAt
            ? { ...current, loading: false, refreshing: true, error: null }
            : {
                ...cached,
                scope,
                loading: false,
                refreshing: true,
                error: null,
                accessDenied: false,
                offline: false,
              },
        );
      try {
        const data = await load(controller.signal);
        if (!active) return;
        const savedAt = await writeCache(
          AsyncStorage,
          session.login,
          key,
          data,
        ).catch(() => Date.now());
        if (active)
          setState({
            data,
            savedAt,
            scope,
            loading: false,
            refreshing: false,
            error: null,
            accessDenied: false,
            offline: false,
          });
      } catch (error) {
        if (!active) return;
        const failure = await resourceFailure(
          AsyncStorage,
          session.login,
          key,
          error,
        );
        if (active)
          setState((current) => ({
            ...current,
            ...failure,
          }));
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    key,
    session.login,
    load,
    validate,
    revision,
    scope,
    followRevision,
    canUseCached,
  ]);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  return { ...(state.scope === scope ? state : empty), refresh };
}
