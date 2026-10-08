import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { T3Api } from './t3Api.js';

const cli = vi.hoisted(() => ({
  run: vi.fn<(exe: string, args: string[], options: unknown) => Promise<{ stdout: string }>>(),
  revoke: vi.fn(),
}));

vi.mock('node:child_process', () => {
  const execFile = vi.fn();
  Object.defineProperty(execFile, Symbol.for('nodejs.util.promisify.custom'), { value: cli.run });
  return { execFile, execFileSync: cli.revoke };
});

beforeEach(() => {
  cli.run.mockReset();
  cli.revoke.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('cached T3 API authentication', () => {
  it('reissues authentication once after an expired or revoked token is rejected', async () => {
    const api = new T3Api('http://127.0.0.1:3773', { exe: 't3', script: 'server.mjs' });
    vi.spyOn(api, 'environment').mockResolvedValue({ orchestrationProtocolVersion: 1 });
    cli.run.mockResolvedValueOnce({ stdout: JSON.stringify({ sessionId: 'expired', token: 'old' }) })
      .mockResolvedValue({ stdout: JSON.stringify({ sessionId: 'fresh', token: 'new' }) });
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('Expired', { status: 401 }))
      .mockImplementation(async () => new Response(JSON.stringify({ projects: [] })));
    vi.stubGlobal('fetch', request);

    await expect(api.snapshot()).resolves.toEqual({ projects: [] });
    expect(cli.run).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.map(([, options]) => (options?.headers as Record<string, string>)['authorization'])).toEqual(['Bearer old', 'Bearer new']);
    await expect(api.snapshot()).resolves.toEqual({ projects: [] });
    expect(cli.run).toHaveBeenCalledTimes(2);
    api.revoke();
    expect(cli.revoke).toHaveBeenCalledWith('t3', ['server.mjs', 'auth', 'session', 'revoke', 'fresh'], expect.any(Object));
  });

  it('stops retrying if the replacement authentication is also rejected', async () => {
    const api = new T3Api('http://127.0.0.1:3773', { exe: 't3', script: 'server.mjs' });
    vi.spyOn(api, 'environment').mockResolvedValue({ orchestrationProtocolVersion: 1 });
    cli.run.mockResolvedValue({ stdout: JSON.stringify({ sessionId: 'rejected', token: 'token' }) });
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    vi.stubGlobal('fetch', request);

    await expect(api.snapshot()).rejects.toThrow('T3 Code answered 401');
    expect(cli.run).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledTimes(2);
  });
});
