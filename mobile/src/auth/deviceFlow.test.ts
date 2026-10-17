import { describe, expect, it } from 'vitest';

import { formatCountdown } from './copy';
import {
  authReducer,
  initialAuthState,
  pollForToken,
  requestDeviceCode,
  runDeviceFlow,
  type AuthEvent,
  type AuthState,
  type DeviceGrant,
  type FetchLike,
  type FlowDeps,
} from './deviceFlow';

const grant: DeviceGrant = {
  deviceCode: 'dev-code',
  userCode: 'WDJB-MJHT',
  verificationUri: 'https://github.com/login/device',
  expiresAt: 1_000_000 + 900_000,
  intervalSeconds: 5,
};

function reduce(events: AuthEvent[], from: AuthState = initialAuthState): AuthState {
  return events.reduce(authReducer, from);
}

describe('authReducer', () => {
  it('walks the happy path: load, start, code, open GitHub, approved', () => {
    expect(reduce([{ type: 'tokenLoaded', token: null }])).toEqual({ phase: 'signedOut' });
    expect(reduce([{ type: 'tokenLoaded', token: null }, { type: 'start' }])).toEqual({ phase: 'requesting' });
    const waiting = reduce([
      { type: 'tokenLoaded', token: null },
      { type: 'start' },
      { type: 'codeIssued', grant },
      { type: 'openedGitHub' },
    ]);
    expect(waiting).toEqual({ phase: 'waiting', grant });
    expect(authReducer(waiting, { type: 'approved', token: 'gho_abc' })).toEqual({ phase: 'signedIn', token: 'gho_abc' });
  });

  it('signs in when approval lands before the user taps Copy code', () => {
    const code = reduce([{ type: 'tokenLoaded', token: null }, { type: 'start' }, { type: 'codeIssued', grant }]);
    expect(authReducer(code, { type: 'approved', token: 'gho_abc' })).toEqual({ phase: 'signedIn', token: 'gho_abc' });
  });

  it('boots straight to signed in when secure storage holds a token', () => {
    expect(reduce([{ type: 'tokenLoaded', token: 'gho_saved' }])).toEqual({ phase: 'signedIn', token: 'gho_saved' });
  });

  it('only reads the stored token once', () => {
    const signedOut = reduce([{ type: 'tokenLoaded', token: null }]);
    expect(authReducer(signedOut, { type: 'tokenLoaded', token: 'gho_late' })).toBe(signedOut);
  });

  it('fails from requesting, code and waiting, then restarts', () => {
    const requesting = reduce([{ type: 'tokenLoaded', token: null }, { type: 'start' }]);
    const code = authReducer(requesting, { type: 'codeIssued', grant });
    const waiting = authReducer(code, { type: 'openedGitHub' });
    for (const state of [requesting, code, waiting]) {
      const failed = authReducer(state, { type: 'failed', reason: 'expired' });
      expect(failed).toEqual({ phase: 'failed', reason: 'expired' });
      expect(authReducer(failed, { type: 'start' })).toEqual({ phase: 'requesting' });
    }
  });

  it('cancel returns to signed out from every in-progress phase', () => {
    const requesting = reduce([{ type: 'tokenLoaded', token: null }, { type: 'start' }]);
    const code = authReducer(requesting, { type: 'codeIssued', grant });
    const waiting = authReducer(code, { type: 'openedGitHub' });
    for (const state of [requesting, code, waiting]) {
      expect(authReducer(state, { type: 'cancel' })).toEqual({ phase: 'signedOut' });
    }
  });

  it('drops late events after a cancel', () => {
    const cancelled = reduce([
      { type: 'tokenLoaded', token: null },
      { type: 'start' },
      { type: 'codeIssued', grant },
      { type: 'cancel' },
    ]);
    expect(authReducer(cancelled, { type: 'approved', token: 'gho_late' })).toBe(cancelled);
    expect(authReducer(cancelled, { type: 'failed', reason: 'expired' })).toBe(cancelled);
    expect(authReducer(cancelled, { type: 'codeIssued', grant })).toBe(cancelled);
    expect(authReducer(cancelled, { type: 'openedGitHub' })).toBe(cancelled);
  });

  it('signs out only from signed in', () => {
    const signedIn = reduce([{ type: 'tokenLoaded', token: 'gho_saved' }]);
    expect(authReducer(signedIn, { type: 'signOut' })).toEqual({ phase: 'signedOut' });
    const signedOut = reduce([{ type: 'tokenLoaded', token: null }]);
    expect(authReducer(signedOut, { type: 'signOut' })).toBe(signedOut);
    expect(authReducer(initialAuthState, { type: 'signOut' })).toBe(initialAuthState);
  });

  it('ignores start while a sign-in is running or the user is signed in', () => {
    const waiting = reduce([
      { type: 'tokenLoaded', token: null },
      { type: 'start' },
      { type: 'codeIssued', grant },
      { type: 'openedGitHub' },
    ]);
    expect(authReducer(waiting, { type: 'start' })).toBe(waiting);
    const signedIn = reduce([{ type: 'tokenLoaded', token: 'gho_saved' }]);
    expect(authReducer(signedIn, { type: 'start' })).toBe(signedIn);
  });
});

type Call = { url: string; body: string; headers: Record<string, string> };

/** A fetch that answers each call from `replies` in order (an Error is thrown as a network failure). */
function fakeFetch(replies: Array<Record<string, unknown> | Error | 'not-json'>) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, body: init.body, headers: init.headers });
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (reply instanceof Error) throw reply;
    return {
      json: async () => {
        if (reply === 'not-json') throw new SyntaxError('Unexpected token');
        return reply;
      },
    };
  };
  return { fetch, calls };
}

function makeDeps(replies: Array<Record<string, unknown> | Error | 'not-json'>, overrides: Partial<FlowDeps> = {}) {
  const { fetch, calls } = fakeFetch(replies);
  const sleeps: number[] = [];
  const saved: string[] = [];
  let clock = 1_000_000;
  const deps: FlowDeps = {
    clientId: 'client-123',
    fetch,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    saveToken: async (token) => {
      saved.push(token);
    },
    ...overrides,
  };
  return { deps, calls, sleeps, saved };
}

const codeReply = {
  device_code: 'dev-code',
  user_code: 'WDJB-MJHT',
  verification_uri: 'https://github.com/login/device',
  expires_in: 900,
  interval: 5,
};

describe('requestDeviceCode', () => {
  it('posts the client ID and scope to GitHub and returns the grant', async () => {
    const { deps, calls } = makeDeps([codeReply]);
    const result = await requestDeviceCode(deps, new AbortController().signal);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://github.com/login/device/code');
    expect(calls[0]?.body).toBe('client_id=client-123&scope=repo');
    expect(calls[0]?.headers).toMatchObject({ Accept: 'application/json' });
    expect(result).toEqual({ ok: true, grant });
  });

  it('reports rejected when GitHub answers with an error such as device_flow_disabled', async () => {
    const { deps } = makeDeps([{ error: 'device_flow_disabled' }]);
    expect(await requestDeviceCode(deps, new AbortController().signal)).toEqual({ ok: false, reason: 'rejected' });
  });

  it('reports network when the request throws', async () => {
    const { deps } = makeDeps([new TypeError('Network request failed')]);
    expect(await requestDeviceCode(deps, new AbortController().signal)).toEqual({ ok: false, reason: 'network' });
  });

  it('reports network when the reply is not JSON', async () => {
    const { deps } = makeDeps(['not-json']);
    expect(await requestDeviceCode(deps, new AbortController().signal)).toEqual({ ok: false, reason: 'network' });
  });
});

describe('pollForToken', () => {
  const poll = (reply: Record<string, unknown> | Error | 'not-json') => {
    const { deps, calls } = makeDeps([reply]);
    return pollForToken(deps, grant, new AbortController().signal).then((result) => ({ result, calls }));
  };

  it('sends the device code with the device-code grant type', async () => {
    const { calls } = await poll({ error: 'authorization_pending' });
    expect(calls[0]?.url).toBe('https://github.com/login/oauth/access_token');
    expect(calls[0]?.body).toBe(
      'client_id=client-123&device_code=dev-code&grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code',
    );
  });

  it.each([
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
    [new TypeError('Network request failed'), { kind: 'retry' }],
    ['not-json', { kind: 'retry' }],
  ] as const)('maps %j to %j', async (reply, expected) => {
    const { result } = await poll(reply as Record<string, unknown> | Error | 'not-json');
    expect(result).toEqual(expected);
  });
});

describe('runDeviceFlow', () => {
  const pending = { error: 'authorization_pending' };

  it('issues a code, polls on the interval, saves the token, then reports approved', async () => {
    const { deps, sleeps, saved } = makeDeps([codeReply, pending, pending, { access_token: 'gho_abc' }]);
    const events: AuthEvent[] = [];
    await runDeviceFlow(
      deps,
      (event) => {
        // The token is already in storage when the screen is told about it.
        if (event.type === 'approved') expect(saved).toEqual(['gho_abc']);
        events.push(event);
      },
      new AbortController().signal,
    );
    expect(events).toEqual([
      { type: 'codeIssued', grant },
      { type: 'approved', token: 'gho_abc' },
    ]);
    expect(sleeps).toEqual([5000, 5000, 5000]);
  });

  it('waits longer after slow_down, using the interval GitHub sends or adding 5 seconds', async () => {
    const { deps, sleeps } = makeDeps([
      codeReply,
      { error: 'slow_down', interval: 10 },
      { error: 'slow_down' },
      { access_token: 'gho_abc' },
    ]);
    await runDeviceFlow(deps, () => {}, new AbortController().signal);
    expect(sleeps).toEqual([5000, 10_000, 15_000]);
  });

  it('keeps polling through a dropped connection', async () => {
    const { deps, calls } = makeDeps([codeReply, new TypeError('Network request failed'), { access_token: 'gho_abc' }]);
    const events: AuthEvent[] = [];
    await runDeviceFlow(deps, (event) => events.push(event), new AbortController().signal);
    expect(calls).toHaveLength(3);
    expect(events.at(-1)).toEqual({ type: 'approved', token: 'gho_abc' });
  });

  it('fails as expired when GitHub says so', async () => {
    const { deps } = makeDeps([codeReply, pending, { error: 'expired_token' }]);
    const events: AuthEvent[] = [];
    await runDeviceFlow(deps, (event) => events.push(event), new AbortController().signal);
    expect(events.at(-1)).toEqual({ type: 'failed', reason: 'expired' });
  });

  it('fails as expired when the clock passes the deadline without asking GitHub again', async () => {
    const { deps, calls } = makeDeps([{ ...codeReply, expires_in: 10 }, pending]);
    const events: AuthEvent[] = [];
    await runDeviceFlow(deps, (event) => events.push(event), new AbortController().signal);
    // Two sleeps of 5s reach the 10s deadline; only the first poll goes out.
    expect(calls).toHaveLength(2);
    expect(events.at(-1)).toEqual({ type: 'failed', reason: 'expired' });
  });

  it('fails as denied when the user says no on GitHub', async () => {
    const { deps } = makeDeps([codeReply, { error: 'access_denied' }]);
    const events: AuthEvent[] = [];
    await runDeviceFlow(deps, (event) => events.push(event), new AbortController().signal);
    expect(events.at(-1)).toEqual({ type: 'failed', reason: 'denied' });
  });

  it('fails when the code request fails, without polling', async () => {
    const { deps, calls } = makeDeps([new TypeError('Network request failed')]);
    const events: AuthEvent[] = [];
    await runDeviceFlow(deps, (event) => events.push(event), new AbortController().signal);
    expect(events).toEqual([{ type: 'failed', reason: 'network' }]);
    expect(calls).toHaveLength(1);
  });

  it('fails as storage and never reports approved when the token cannot be saved', async () => {
    const { deps } = makeDeps([codeReply, { access_token: 'gho_abc' }], {
      saveToken: async () => {
        throw new Error('keystore unavailable');
      },
    });
    const events: AuthEvent[] = [];
    await runDeviceFlow(deps, (event) => events.push(event), new AbortController().signal);
    expect(events.map((e) => e.type)).toEqual(['codeIssued', 'failed']);
    expect(events.at(-1)).toEqual({ type: 'failed', reason: 'storage' });
  });

  it('stops polling and reports nothing once aborted', async () => {
    const controller = new AbortController();
    const { deps, calls } = makeDeps([codeReply, pending, { access_token: 'gho_abc' }]);
    const events: AuthEvent[] = [];
    await runDeviceFlow(
      { ...deps, sleep: async () => controller.abort() },
      (event) => events.push(event),
      controller.signal,
    );
    expect(calls).toHaveLength(1);
    expect(events).toEqual([{ type: 'codeIssued', grant }]);
  });

  it('drives the reducer from signed out to signed in', async () => {
    const { deps } = makeDeps([codeReply, pending, { access_token: 'gho_abc' }]);
    let state = reduce([{ type: 'tokenLoaded', token: null }, { type: 'start' }]);
    await runDeviceFlow(
      deps,
      (event) => {
        state = authReducer(state, event);
      },
      new AbortController().signal,
    );
    expect(state).toEqual({ phase: 'signedIn', token: 'gho_abc' });
  });
});

describe('formatCountdown', () => {
  it('formats minutes and padded seconds, rounding up and never going negative', () => {
    expect(formatCountdown(892_000)).toBe('14:52');
    expect(formatCountdown(900_000)).toBe('15:00');
    expect(formatCountdown(61_001)).toBe('1:02');
    expect(formatCountdown(5_000)).toBe('0:05');
    expect(formatCountdown(-3000)).toBe('0:00');
  });
});
