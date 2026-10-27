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
import { MobileGithub } from './github';
import { parseFollows, readCache, writeCache } from './cache';

type Browse = { api: MobileGithub; session: Session };
const Context = createContext<Browse | null>(null);
export function BrowseProvider({
  session,
  children,
}: {
  session: Session;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ session, api: new MobileGithub(session.token) }),
    [session],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useBrowse(): Browse {
  const context = useContext(Context);
  if (!context) throw new Error('Map browsing requires a signed-in account.');
  return context;
}
export async function followedMaps(login: string) {
  const local = await AsyncStorage.getItem('wayfinder.follows.v1').catch(
    () => null,
  );
  return [
    ...parseFollows(process.env.EXPO_PUBLIC_FOLLOWED_MAPS ?? null, login),
    ...parseFollows(local, login),
  ];
}
export type Resource<T> = {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  savedAt: number | null;
  refresh: () => void;
};
/** Each screen owns its cancellation scope; an old account/route request cannot paint a new one. */
export function useResource<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  validate: (value: unknown) => value is T,
): Resource<T> {
  const { session } = useBrowse();
  const [revision, setRevision] = useState(0);
  const scope = `${session.login.toLowerCase()}:${key}`;
  const empty = {
    data: null,
    loading: true,
    refreshing: false,
    error: null,
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
            loading: current.data === null,
            refreshing: current.data !== null,
            error: null,
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
      if (cached)
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
          });
      } catch (error) {
        if (active)
          setState((current) => ({
            ...current,
            loading: false,
            refreshing: false,
            error:
              error instanceof Error
                ? error.message
                : 'Couldn’t load this from GitHub. Try again.',
          }));
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [key, session.login, load, validate, revision, scope]);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  return { ...(state.scope === scope ? state : empty), refresh };
}
