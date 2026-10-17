import * as Clipboard from 'expo-clipboard';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { Linking } from 'react-native';

import { authReducer, initialAuthState, runDeviceFlow, type AuthState, type FlowDeps } from './deviceFlow';
import { tokenStore } from './secureStorage';

const clientId = process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID ?? '';

const sleep: FlowDeps['sleep'] = (ms, signal) =>
  new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done);
  });

type Auth = {
  state: AuthState;
  /** Starts a sign-in: asks GitHub for a code and waits for approval. */
  signIn: () => void;
  /** Copies the code, opens GitHub's device page, and moves to the waiting screen. */
  copyCodeAndOpenGitHub: () => void;
  /** Backs out of a sign-in in progress. */
  cancel: () => void;
  /** Deletes the token from secure storage and returns to the welcome screen. */
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialAuthState);
  const attempt = useRef<AbortController | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let live = true;
    void tokenStore.load().then((token) => {
      if (live) dispatch({ type: 'tokenLoaded', token });
    });
    return () => {
      live = false;
      attempt.current?.abort();
    };
  }, []);

  const signIn = useCallback(() => {
    attempt.current?.abort();
    dispatch({ type: 'start' });
    if (!clientId) {
      dispatch({ type: 'failed', reason: 'rejected' });
      return;
    }
    const controller = new AbortController();
    attempt.current = controller;
    void runDeviceFlow(
      { clientId, fetch, now: Date.now, sleep, saveToken: tokenStore.save },
      dispatch,
      controller.signal,
    );
  }, []);

  const copyCodeAndOpenGitHub = useCallback(() => {
    const current = stateRef.current;
    if (current.phase !== 'code' && current.phase !== 'waiting') return;
    void Clipboard.setStringAsync(current.grant.userCode);
    void Linking.openURL(current.grant.verificationUri);
    dispatch({ type: 'openedGitHub' });
  }, []);

  const cancel = useCallback(() => {
    attempt.current?.abort();
    dispatch({ type: 'cancel' });
  }, []);

  const signOut = useCallback(async () => {
    attempt.current?.abort();
    await tokenStore.clear();
    dispatch({ type: 'signOut' });
  }, []);

  const value = useMemo(
    () => ({ state, signIn, copyCodeAndOpenGitHub, cancel, signOut }),
    [state, signIn, copyCodeAndOpenGitHub, cancel, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside AuthProvider');
  return auth;
}
