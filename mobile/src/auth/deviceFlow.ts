// GitHub's OAuth device flow: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow
// Pure TypeScript with injected fetch, clock and sleep, so Vitest runs it without a device.

export const GITHUB_SCOPE = 'repo';
/** A request that takes longer than this counts as a dropped connection. */
export const REQUEST_TIMEOUT_MS = 15_000;

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';
const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';
// GitHub: on slow_down, add 5 seconds to the interval.
const SLOW_DOWN_STEP_SECONDS = 5;

export type DeviceGrant = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  /** Epoch milliseconds after which GitHub rejects the codes. */
  expiresAt: number;
  intervalSeconds: number;
};

/** What the phone keeps after a sign-in: the token, who it belongs to, and when it was issued. */
export type Session = {
  token: string;
  login: string;
  /** The profile name, which GitHub lets people leave empty. */
  name: string | null;
  signedInAt: number;
};

/** Why sign-in stopped: the code lapsed, the user said no, GitHub refused, the network failed, or the session could not be saved. */
export type FailureReason = 'expired' | 'denied' | 'rejected' | 'network' | 'storage';

export type AuthState =
  | { phase: 'loading' }
  /** `signedOutLogin` is who just signed out, for the welcome screen's notice. */
  | { phase: 'signedOut'; signedOutLogin: string | null }
  | { phase: 'requesting' }
  | { phase: 'code'; grant: DeviceGrant }
  | { phase: 'waiting'; grant: DeviceGrant }
  | { phase: 'signedIn'; session: Session }
  | { phase: 'failed'; reason: FailureReason };

export type AuthEvent =
  | { type: 'sessionLoaded'; session: Session | null }
  | { type: 'start' }
  | { type: 'codeIssued'; grant: DeviceGrant }
  | { type: 'openedGitHub' }
  | { type: 'approved'; session: Session }
  | { type: 'failed'; reason: FailureReason }
  | { type: 'cancel' }
  | { type: 'signOut' };

export const initialAuthState: AuthState = { phase: 'loading' };

/** Events that don't fit the current phase are dropped, so a late poll result can't undo a cancel or sign-out. */
export function authReducer(state: AuthState, event: AuthEvent): AuthState {
  switch (event.type) {
    case 'sessionLoaded':
      if (state.phase !== 'loading') return state;
      return event.session
        ? { phase: 'signedIn', session: event.session }
        : { phase: 'signedOut', signedOutLogin: null };
    case 'start':
      return state.phase === 'signedOut' || state.phase === 'failed' ? { phase: 'requesting' } : state;
    case 'codeIssued':
      return state.phase === 'requesting' ? { phase: 'code', grant: event.grant } : state;
    case 'openedGitHub':
      return state.phase === 'code' ? { phase: 'waiting', grant: state.grant } : state;
    case 'approved':
      return state.phase === 'code' || state.phase === 'waiting'
        ? { phase: 'signedIn', session: event.session }
        : state;
    case 'failed':
      return state.phase === 'requesting' || state.phase === 'code' || state.phase === 'waiting'
        ? { phase: 'failed', reason: event.reason }
        : state;
    case 'cancel':
      return state.phase === 'requesting' || state.phase === 'code' || state.phase === 'waiting'
        ? { phase: 'signedOut', signedOutLogin: null }
        : state;
    case 'signOut':
      // From any phase: signing out also abandons a sign-in in progress.
      return state.phase === 'loading'
        ? state
        : { phase: 'signedOut', signedOutLogin: state.phase === 'signedIn' ? state.session.login : null };
  }
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ status: number; json: () => Promise<unknown> }>;

export type FlowDeps = {
  clientId: string;
  fetch: FetchLike;
  now: () => number;
  /** Resolves after `ms`, or right away once `signal` aborts. */
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  requestTimeoutMs: number;
  /** Persists the session. The flow reports `approved` only after this resolves. */
  saveSession: (session: Session) => Promise<void>;
};

function form(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

/**
 * Sends one request and returns the JSON object GitHub answered with. Throws on a dropped connection, a timeout, an
 * unreadable reply or a 5xx, so callers treat all of them as "couldn't reach GitHub", not as a refusal.
 */
async function send(
  deps: FlowDeps,
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  const request = new AbortController();
  const abort = () => request.abort();
  if (signal.aborted) abort();
  signal.addEventListener('abort', abort);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abort();
      reject(new Error('GitHub did not answer in time'));
    }, deps.requestTimeoutMs);
  });
  try {
    const answer = (async () => {
      const response = await deps.fetch(url, { ...init, signal: request.signal });
      if (response.status >= 500) throw new Error(`GitHub answered ${response.status}`);
      const body: unknown = await response.json();
      return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    })();
    return await Promise.race([answer, timeout]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

const formPost = (deps: FlowDeps, url: string, fields: Record<string, string>, signal: AbortSignal) =>
  send(
    deps,
    url,
    {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form(fields),
    },
    signal,
  );

export type CodeResult = { ok: true; grant: DeviceGrant } | { ok: false; reason: FailureReason };

export async function requestDeviceCode(deps: FlowDeps, signal: AbortSignal): Promise<CodeResult> {
  let body: Record<string, unknown>;
  try {
    body = await formPost(deps, DEVICE_CODE_URL, { client_id: deps.clientId, scope: GITHUB_SCOPE }, signal);
  } catch {
    return { ok: false, reason: 'network' };
  }
  const { device_code, user_code, verification_uri, expires_in, interval } = body;
  if (
    typeof device_code !== 'string' ||
    typeof user_code !== 'string' ||
    typeof verification_uri !== 'string' ||
    typeof expires_in !== 'number' ||
    typeof interval !== 'number'
  ) {
    // GitHub answers with an `error` (device_flow_disabled, incorrect_client_credentials) when the OAuth app is set up wrong.
    return { ok: false, reason: 'rejected' };
  }
  return {
    ok: true,
    grant: {
      deviceCode: device_code,
      userCode: user_code,
      verificationUri: verification_uri,
      expiresAt: deps.now() + expires_in * 1000,
      intervalSeconds: interval,
    },
  };
}

export type PollResult =
  | { kind: 'approved'; token: string }
  | { kind: 'pending' }
  | { kind: 'slowDown'; intervalSeconds: number | null }
  | { kind: 'failed'; reason: FailureReason }
  // A dropped connection, a timeout, a 5xx or an unreadable reply: ask again on the next tick.
  | { kind: 'retry' };

export async function pollForToken(deps: FlowDeps, grant: DeviceGrant, signal: AbortSignal): Promise<PollResult> {
  let body: Record<string, unknown>;
  try {
    body = await formPost(
      deps,
      ACCESS_TOKEN_URL,
      { client_id: deps.clientId, device_code: grant.deviceCode, grant_type: DEVICE_GRANT_TYPE },
      signal,
    );
  } catch {
    return { kind: 'retry' };
  }
  if (typeof body.access_token === 'string' && body.access_token) {
    return { kind: 'approved', token: body.access_token };
  }
  switch (body.error) {
    case 'authorization_pending':
      return { kind: 'pending' };
    case 'slow_down':
      return { kind: 'slowDown', intervalSeconds: typeof body.interval === 'number' ? body.interval : null };
    case 'expired_token':
      return { kind: 'failed', reason: 'expired' };
    case 'access_denied':
      return { kind: 'failed', reason: 'denied' };
    case undefined:
      return { kind: 'retry' };
    default:
      // device_flow_disabled, incorrect_client_credentials, incorrect_device_code, unsupported_grant_type.
      return { kind: 'failed', reason: 'rejected' };
  }
}

/** Asks GitHub who owns the token, for the Settings page and the sign-out notice. `null` when it can't be told. */
export async function fetchProfile(
  deps: FlowDeps,
  token: string,
  signal: AbortSignal,
): Promise<{ login: string; name: string | null } | null> {
  try {
    const body = await send(
      deps,
      USER_URL,
      { method: 'GET', headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` } },
      signal,
    );
    if (typeof body.login !== 'string' || !body.login) return null;
    return { login: body.login, name: typeof body.name === 'string' && body.name ? body.name : null };
  } catch {
    return null;
  }
}

/**
 * Runs one sign-in attempt: asks for a code, then polls until GitHub approves, the code lapses, the user says no, or
 * `signal` aborts. Reports each step through `dispatch`; after an abort it reports nothing more.
 */
export async function runDeviceFlow(
  deps: FlowDeps,
  dispatch: (event: AuthEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const emit = (event: AuthEvent) => {
    if (!signal.aborted) dispatch(event);
  };

  const issued = await requestDeviceCode(deps, signal);
  if (!issued.ok) return emit({ type: 'failed', reason: issued.reason });
  const { grant } = issued;
  emit({ type: 'codeIssued', grant });

  let intervalSeconds = grant.intervalSeconds;
  while (!signal.aborted) {
    await deps.sleep(intervalSeconds * 1000, signal);
    if (signal.aborted) return;
    if (deps.now() >= grant.expiresAt) return emit({ type: 'failed', reason: 'expired' });

    const result = await pollForToken(deps, grant, signal);
    if (signal.aborted) return;
    switch (result.kind) {
      case 'approved': {
        const profile = await fetchProfile(deps, result.token, signal);
        if (signal.aborted) return;
        if (!profile) return emit({ type: 'failed', reason: 'network' });
        const session: Session = { token: result.token, ...profile, signedInAt: deps.now() };
        try {
          await deps.saveSession(session);
        } catch {
          return emit({ type: 'failed', reason: 'storage' });
        }
        return emit({ type: 'approved', session });
      }
      case 'failed':
        return emit({ type: 'failed', reason: result.reason });
      case 'slowDown':
        intervalSeconds = result.intervalSeconds ?? intervalSeconds + SLOW_DOWN_STEP_SECONDS;
        break;
      case 'pending':
      case 'retry':
        break;
    }
  }
}
