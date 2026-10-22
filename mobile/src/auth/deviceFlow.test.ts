import { describe, expect, it } from 'vitest';

import { displayName, formatCountdown, formatSince, initialOf } from './copy';
import {
  authReducer,
  fetchProfile,
  initialAuthState,
  pollForToken,
  requestDeviceCode,
  runDeviceFlow,
  type AuthEvent,
  type AuthState,
  type DeviceGrant,
  type FetchLike,
  type FlowDeps,
  type Session,
} from './deviceFlow';

const grant: DeviceGrant = {
  deviceCode: 'dev-code',
  userCode: 'WDJB-MJHT',
  verificationUri: 'https://github.com/login/device',
  expiresAt: 1_000_000 + 900_000,
  intervalSeconds: 5,
};

const session: Session = { token: 'gho_abc', login: 'octocat', name: 'Mona Lisa', signedInAt: 1_000_000 };

function reduce(events: AuthEvent[], from: AuthState = initialAuthState): AuthState {
  return events.reduce(authReducer, from);
}

const signedOut: AuthState = { phase: 'signedOut', signedOutLogin: null };
const loadedSignedOut: AuthEvent = { type: 'sessionLoaded', session: null };

describe('authReducer', () => {
  it('walks the happy path: load, start, code, open GitHub, approved', () => {
    expect(reduce([loadedSignedOut])).toEqual(signedOut);
    expect(reduce([loadedSignedOut, { type: 'start' }])).toEqual({ phase: 'requesting' });
    const waiting = reduce([loadedSignedOut, { type: 'start' }, { type: 'codeIssued', grant }, { type: 'openedGitHub' }]);
    expect(waiting).toEqual({ phase: 'waiting', grant });
    expect(authReducer(waiting, { type: 'approved', session })).toEqual({ phase: 'signedIn', session });
  });

  it('signs in when approval lands before the user taps Copy code', () => {
    const code = reduce([loadedSignedOut, { type: 'start' }, { type: 'codeIssued', grant }]);
    expect(authReducer(code, { type: 'approved', session })).toEqual({ phase: 'signedIn', session });
  });

  it('boots straight to signed in when secure storage holds a session', () => {
    expect(reduce([{ type: 'sessionLoaded', session }])).toEqual({ phase: 'signedIn', session });
  });

  it('only reads the stored session once', () => {
    const state = reduce([loadedSignedOut]);
    expect(authReducer(state, { type: 'sessionLoaded', session })).toBe(state);
  });

  it('fails from requesting, code and waiting, then restarts', () => {
    const requesting = reduce([loadedSignedOut, { type: 'start' }]);
    const code = authReducer(requesting, { type: 'codeIssued', grant });
    const waiting = authReducer(code, { type: 'openedGitHub' });
    for (const state of [requesting, code, waiting]) {
      const failed = authReducer(state, { type: 'failed', reason: 'expired' });
      expect(failed).toEqual({ phase: 'failed', reason: 'expired' });
      expect(authReducer(failed, { type: 'start' })).toEqual({ phase: 'requesting' });
    }
  });

  it('cancel returns to signed out from every in-progress phase', () => {
    const requesting = reduce([loadedSignedOut, { type: 'start' }]);
    const code = authReducer(requesting, { type: 'codeIssued', grant });
    const waiting = authReducer(code, { type: 'openedGitHub' });
    for (const state of [requesting, code, waiting]) {
      expect(authReducer(state, { type: 'cancel' })).toEqual(signedOut);
    }
  });

  it('drops late events after a cancel', () => {
    const cancelled = reduce([loadedSignedOut, { type: 'start' }, { type: 'codeIssued', grant }, { type: 'cancel' }]);
    expect(authReducer(cancelled, { type: 'approved', session })).toBe(cancelled);
    expect(authReducer(cancelled, { type: 'failed', reason: 'expired' })).toBe(cancelled);
    expect(authReducer(cancelled, { type: 'codeIssued', grant })).toBe(cancelled);
    expect(authReducer(cancelled, { type: 'openedGitHub' })).toBe(cancelled);
  });

  it('signing out remembers who signed out, for the welcome screen notice', () => {
    const signedIn = reduce([{ type: 'sessionLoaded', session }]);
    expect(authReducer(signedIn, { type: 'signOut' })).toEqual({ phase: 'signedOut', signedOutLogin: 'octocat' });
  });

  it('signing out during a sign-in abandons it and shows no notice', () => {
    const requesting = reduce([loadedSignedOut, { type: 'start' }]);
    const code = authReducer(requesting, { type: 'codeIssued', grant });
    const waiting = authReducer(code, { type: 'openedGitHub' });
    const failed = authReducer(waiting, { type: 'failed', reason: 'network' });
    for (const state of [requesting, code, waiting, failed]) {
      expect(authReducer(state, { type: 'signOut' })).toEqual(signedOut);
    }
  });

  it('ignores signOut before the stored session has loaded', () => {
    expect(authReducer(initialAuthState, { type: 'signOut' })).toBe(initialAuthState);
  });

  it('the notice goes away when a new sign-in starts', () => {
    const afterSignOut = reduce([{ type: 'sessionLoaded', session }, { type: 'signOut' }]);
    expect(authReducer(afterSignOut, { type: 'start' })).toEqual({ phase: 'requesting' });
  });

  it('ignores start while a sign-in is running or the user is signed in', () => {
    const waiting = reduce([loadedSignedOut, { type: 'start' }, { type: 'codeIssued', grant }, { type: 'openedGitHub' }]);
    expect(authReducer(waiting, { type: 'start' })).toBe(waiting);
    const signedIn = reduce([{ type: 'sessionLoaded', session }]);
    expect(authReducer(signedIn, { type: 'start' })).toBe(signedIn);
  });
});

type Body = Record<string, unknown>;
/** One canned answer: a JSON body, a thrown network error, an unreadable body, a request that never answers, or a body with a status. */
type Reply = Body | Error | 'not-json' | 'hang' | { status: number; body: Body };
type Call = { url: string; method: string; body: string | undefined; headers: Record<string, string> };

const withStatus = (status: number, body: Body): Reply => ({ status, body });
const isStatusReply = (reply: Reply): reply is { status: number; body: Body } =>
  typeof reply === 'object' && 'status' in reply && 'body' in reply && typeof reply.status === 'number';

/** A fetch that answers each call from `replies` in order, repeating the last one. */
function fakeFetch(replies: Reply[]) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body, headers: init.headers });
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)] as Reply;
    if (reply instanceof Error) throw reply;
    if (reply === 'hang') return new Promise(() => {});
    const status = isStatusReply(reply) ? reply.status : 200;
    return {
      status,
      json: async () => {
        if (reply === 'not-json') throw new SyntaxError('Unexpected token');
        return isStatusReply(reply) ? reply.body : reply;
      },
    };
  };
  return { fetch, calls };
}

function makeDeps(replies: Reply[], overrides: Partial<FlowDeps> = {}) {
  const { fetch, calls } = fakeFetch(replies);
  const sleeps: number[] = [];
  const saved: Session[] = [];
  let clock = 1_000_000;
  const deps: FlowDeps = {
    clientId: 'client-123',
    fetch,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    requestTimeoutMs: 1000,
    saveSession: async (s) => {
      saved.push(s);
    },
    ...overrides,
  };
  return { deps, calls, sleeps, saved };
}

const live = () => new AbortController().signal;

const codeReply = {
  device_code: 'dev-code',
  user_code: 'WDJB-MJHT',
  verification_uri: 'https://github.com/login/device',
  expires_in: 900,
  interval: 5,
};
const profileReply = { login: 'octocat', name: 'Mona Lisa', id: 1 };

describe('requestDeviceCode', () => {
  it('posts the client ID and scope to GitHub and returns the grant', async () => {
    const { deps, calls } = makeDeps([codeReply]);
    const result = await requestDeviceCode(deps, live());
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://github.com/login/device/code');
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.body).toBe('client_id=client-123&scope=repo');
    expect(calls[0]?.headers).toMatchObject({ Accept: 'application/json' });
    expect(result).toEqual({ ok: true, grant });
  });

  it('reports rejected when GitHub answers with an error such as device_flow_disabled', async () => {
    const { deps } = makeDeps([{ error: 'device_flow_disabled' }]);
    expect(await requestDeviceCode(deps, live())).toEqual({ ok: false, reason: 'rejected' });
  });

  it('reports rejected for a 404 with an error body, which is what an unknown client ID gets', async () => {
    const { deps } = makeDeps([withStatus(404, { error: 'Not Found' })]);
    expect(await requestDeviceCode(deps, live())).toEqual({ ok: false, reason: 'rejected' });
  });

  it('reports network when GitHub is down, even if the 5xx carries JSON', async () => {
    const { deps } = makeDeps([withStatus(503, { message: 'Service Unavailable' })]);
    expect(await requestDeviceCode(deps, live())).toEqual({ ok: false, reason: 'network' });
  });

  it('reports network when the request throws', async () => {
    const { deps } = makeDeps([new TypeError('Network request failed')]);
    expect(await requestDeviceCode(deps, live())).toEqual({ ok: false, reason: 'network' });
  });

  it('reports network when the reply is not JSON', async () => {
    const { deps } = makeDeps(['not-json']);
    expect(await requestDeviceCode(deps, live())).toEqual({ ok: false, reason: 'network' });
  });

  it('reports network when the request never answers', async () => {
    const { deps } = makeDeps(['hang'], { requestTimeoutMs: 20 });
    expect(await requestDeviceCode(deps, live())).toEqual({ ok: false, reason: 'network' });
  });
});

describe('pollForToken', () => {
  const poll = (reply: Reply, overrides: Partial<FlowDeps> = {}) => {
    const { deps, calls } = makeDeps([reply], overrides);
    return pollForToken(deps, grant, live()).then((result) => ({ result, calls }));
  };

  it('sends the device code with the device-code grant type', async () => {
    const { calls } = await poll({ error: 'authorization_pending' });
    expect(calls[0]?.url).toBe('https://github.com/login/oauth/access_token');
    expect(calls[0]?.body).toBe(
      'client_id=client-123&device_code=dev-code&grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code',
    );
  });

  it.each<[Reply, unknown]>([
    [{ access_token: 'gho_abc', token_type: 'bearer', scope: 'repo' }, { kind: 'approved', token: 'gho_abc' }],
    [{ error: 'authorization_pending' }, { kind: 'pending' }],
    [{ error: 'slow_down', interval: 10 }, { kind: 'slowDown', intervalSeconds: 10 }],
    [{ error: 'slow_down' }, { kind: 'slowDown', intervalSeconds: null }],
    [{ error: 'expired_token' }, { kind: 'failed', reason: 'expired' }],
    [{ error: 'access_denied' }, { kind: 'failed', reason: 'denied' }],
    [{ error: 'device_flow_disabled' }, { kind: 'failed', reason: 'rejected' }],
    [{ error: 'incorrect_client_credentials' }, { kind: 'failed', reason: 'rejected' }],
    [{ error: 'incorrect_device_code' }, { kind: 'failed', reason: 'rejected' }],
    [{ error: 'unsupported_grant_type' }, { kind: 'failed', reason: 'rejected' }],
    [{}, { kind: 'retry' }],
    [withStatus(502, { error: 'bad_gateway' }), { kind: 'retry' }],
    [new TypeError('Network request failed'), { kind: 'retry' }],
    ['not-json', { kind: 'retry' }],
  ])('maps %j to %j', async (reply, expected) => {
    const { result } = await poll(reply);
    expect(result).toEqual(expected);
  });

  it('retries when the request never answers', async () => {
    const { result } = await poll('hang', { requestTimeoutMs: 20 });
    expect(result).toEqual({ kind: 'retry' });
  });
});

describe('fetchProfile', () => {
  it('asks GitHub who owns the token', async () => {
    const { deps, calls } = makeDeps([profileReply]);
    expect(await fetchProfile(deps, 'gho_abc', live())).toEqual({ login: 'octocat', name: 'Mona Lisa' });
    expect(calls[0]?.url).toBe('https://api.github.com/user');
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.headers).toMatchObject({ Authorization: 'Bearer gho_abc' });
  });

  it('keeps no name when the profile has none', async () => {
    const { deps } = makeDeps([{ login: 'octocat', name: null }]);
    expect(await fetchProfile(deps, 'gho_abc', live())).toEqual({ login: 'octocat', name: null });
  });

  it.each<[string, Reply]>([
    ['a bad credentials reply', withStatus(401, { message: 'Bad credentials' })],
    ['a 5xx', withStatus(500, { message: 'oops' })],
    ['a network error', new TypeError('Network request failed')],
  ])('returns null for %s', async (_label, reply) => {
    const { deps } = makeDeps([reply]);
    expect(await fetchProfile(deps, 'gho_abc', live())).toBeNull();
  });
});

describe('runDeviceFlow', () => {
  const pending = { error: 'authorization_pending' };
  const approved = { access_token: 'gho_abc' };

  it('issues a code, polls on the interval, saves the session, then reports approved', async () => {
    const { deps, sleeps, saved } = makeDeps([codeReply, pending, pending, approved, profileReply]);
    const events: AuthEvent[] = [];
    await runDeviceFlow(
      deps,
      (event) => {
        // The session is already in storage when the screen is told about it.
        if (event.type === 'approved') expect(saved).toEqual([event.session]);
        events.push(event);
      },
      live(),
    );
    expect(events).toEqual([
      { type: 'codeIssued', grant },
      { type: 'approved', session: { token: 'gho_abc', login: 'octocat', name: 'Mona Lisa', signedInAt: 1_000_000 + 15_000 } },
    ]);
    expect(sleeps).toEqual([5000, 5000, 5000]);
  });

  it('waits longer after slow_down, using the interval GitHub sends or adding 5 seconds', async () => {
    const { deps, sleeps } = makeDeps([
      codeReply,
      { error: 'slow_down', interval: 10 },
      { error: 'slow_down' },
      approved,
      profileReply,
    ]);
    await runDeviceFlow(deps, () => {}, live());
    expect(sleeps).toEqual([5000, 10_000, 15_000]);
  });

  it('keeps polling through a dropped connection or a 5xx', async () => {
    const { deps, calls } = makeDeps([
      codeReply,
      new TypeError('Network request failed'),
      withStatus(503, { message: 'down' }),
      approved,
      profileReply,
    ]);
    const events: AuthEvent[] = [];
    await runDeviceFlow(deps, (event) => events.push(event), live());
    expect(calls).toHaveLength(5);
    expect(events.at(-1)?.type).toBe('approved');
  });

  it('keeps polling after a poll request that never answers', async () => {
    const { deps, calls } = makeDeps([codeReply, 'hang', approved, profileReply], { requestTimeoutMs: 20 });
    const events: AuthEvent[] = [];
    await runDeviceFlow(deps, (event) => events.push(event), live());
    expect(calls).toHaveLength(4);
    expect(events.at(-1)?.type).toBe('approved');
  });

  it('fails as expired when GitHub says so', async () => {
    const { deps } = makeDeps([codeReply, pending, { error: 'expired_token' }]);
    const events: AuthEvent[] = [];
    await runDeviceFlow(deps, (event) => events.push(event), live());
    expect(events.at(-1)).toEqual({ type: 'failed', reason: 'expired' });
  });

  it('fails as expired when the clock passes the deadline without asking GitHub again', async () => {
    const { deps, calls } = makeDeps([{ ...codeReply, expires_in: 10 }, pending]);
    const events: AuthEvent[] = [];
    await runDeviceFlow(deps, (event) => events.push(event), live());
    // Two sleeps of 5s reach the 10s deadline; only the first poll goes out.
    expect(calls).toHaveLength(2);
    expect(events.at(-1)).toEqual({ type: 'failed', reason: 'expired' });
  });

  it('fails as denied when the user says no on GitHub', async () => {
    const { deps } = makeDeps([codeReply, { error: 'access_denied' }]);
    const events: AuthEvent[] = [];
    await runDeviceFlow(deps, (event) => events.push(event), live());
    expect(events.at(-1)).toEqual({ type: 'failed', reason: 'denied' });
  });

  it('fails when the code request fails, without polling', async () => {
    const { deps, calls } = makeDeps([new TypeError('Network request failed')]);
    const events: AuthEvent[] = [];
    await runDeviceFlow(deps, (event) => events.push(event), live());
    expect(events).toEqual([{ type: 'failed', reason: 'network' }]);
    expect(calls).toHaveLength(1);
  });

  it('fails as network and saves nothing when GitHub cannot say who the token belongs to', async () => {
    const { deps, saved } = makeDeps([codeReply, approved, withStatus(401, { message: 'Bad credentials' })]);
    const events: AuthEvent[] = [];
    await runDeviceFlow(deps, (event) => events.push(event), live());
    expect(events.at(-1)).toEqual({ type: 'failed', reason: 'network' });
    expect(saved).toEqual([]);
  });

  it('fails as storage and never reports approved when the session cannot be saved', async () => {
    const { deps } = makeDeps([codeReply, approved, profileReply], {
      saveSession: async () => {
        throw new Error('keystore unavailable');
      },
    });
    const events: AuthEvent[] = [];
    await runDeviceFlow(deps, (event) => events.push(event), live());
    expect(events.map((e) => e.type)).toEqual(['codeIssued', 'failed']);
    expect(events.at(-1)).toEqual({ type: 'failed', reason: 'storage' });
  });

  it('stops polling and reports nothing once aborted', async () => {
    const controller = new AbortController();
    const { deps, calls } = makeDeps([codeReply, pending, approved, profileReply]);
    const events: AuthEvent[] = [];
    await runDeviceFlow({ ...deps, sleep: async () => controller.abort() }, (event) => events.push(event), controller.signal);
    expect(calls).toHaveLength(1);
    expect(events).toEqual([{ type: 'codeIssued', grant }]);
  });

  it('drives the reducer from signed out to signed in', async () => {
    const { deps } = makeDeps([codeReply, pending, approved, profileReply]);
    let state = reduce([loadedSignedOut, { type: 'start' }]);
    await runDeviceFlow(
      deps,
      (event) => {
        state = authReducer(state, event);
      },
      live(),
    );
    expect(state).toEqual({
      phase: 'signedIn',
      session: { token: 'gho_abc', login: 'octocat', name: 'Mona Lisa', signedInAt: 1_000_000 + 10_000 },
    });
  });
});

describe('copy helpers', () => {
  it('formatCountdown shows minutes and padded seconds, rounding up and never going negative', () => {
    expect(formatCountdown(892_000)).toBe('14:52');
    expect(formatCountdown(900_000)).toBe('15:00');
    expect(formatCountdown(61_001)).toBe('1:02');
    expect(formatCountdown(5_000)).toBe('0:05');
    expect(formatCountdown(-3000)).toBe('0:00');
  });

  it('formatSince leaves the year off for this year only', () => {
    const now = new Date(2026, 9, 22).getTime();
    expect(formatSince(new Date(2026, 9, 20).getTime(), now)).toBe('Oct 20');
    expect(formatSince(new Date(2026, 0, 3).getTime(), now)).toBe('Jan 3');
    expect(formatSince(new Date(2025, 11, 31).getTime(), now)).toBe('Dec 31, 2025');
  });

  it('shows the name, or the login when the profile has none, and its first letter', () => {
    expect(displayName({ name: 'Mona Lisa', login: 'octocat' })).toBe('Mona Lisa');
    expect(displayName({ name: null, login: 'octocat' })).toBe('octocat');
    expect(initialOf({ name: 'mona lisa', login: 'octocat' })).toBe('M');
    expect(initialOf({ name: null, login: 'octocat' })).toBe('O');
  });
});
