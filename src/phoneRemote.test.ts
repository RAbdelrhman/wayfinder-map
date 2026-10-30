import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { PhonePairingStore } from './phonePairing.js';
import { phoneRemoteServer } from './phoneRemote.js';
import type { ModelCatalog } from './models.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'wf-remote-'));
  cleanups.push(() => rm(directory, { recursive: true, force: true, maxRetries: 3 }));
  const pairing = new PhonePairingStore(join(directory, 'phones.json'));
  const catalog: ModelCatalog = { providers: [{ instanceId: 'codex', name: 'Codex', ready: true, models: [{ slug: 'exact', name: 'Exact', isDefault: true, effort: { id: 'reasoningEffort', label: 'Effort', options: [{ id: 'medium', label: 'Medium' }], defaultValue: 'medium' } }] }] };
  const start = vi.fn(async () => ({ status: 200, body: { threadId: 'thread-1' } }));
  const watch = vi.fn(async () => ({ session: { threadId: 'thread-1', messages: ['Started', 'Finished'], status: 'completed' } }));
  const server = phoneRemoteServer({ pairing, catalog: async () => catalog, start, watch });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()); }));
  const url = `http://127.0.0.1:${(server.address() as Exclude<ReturnType<Server['address']>, string | null>).port}`;
  const request = (path: string, method = 'GET', body?: unknown, token?: string, origin?: string) => fetch(url + path, {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(origin ? { origin } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const code = await pairing.createCode();
  const exchange = await request('/v1/pair', 'POST', { code: code.code, name: 'Test phone', model: 'Android' });
  expect(exchange.status).toBe(200);
  const paired = await exchange.json() as { token: string; phone: { id: string } };
  const input = { requestId: 'stable-1', repo: 'owner/repo', map: 217, ticket: 230, model: { instanceId: 'codex', model: 'exact', effort: { id: 'reasoningEffort', value: 'medium' } } };
  return { request, pairing, catalog, start, watch, paired, input, code };
}

it('test client pairs, reads exact catalog, starts, watches history and unpairs', async () => {
  const f = await fixture();
  expect(await (await f.request('/v1/models', 'GET', undefined, f.paired.token)).json()).toEqual(f.catalog);
  expect(await (await f.request('/v1/start', 'POST', f.input, f.paired.token)).json()).toEqual({ threadId: 'thread-1' });
  expect(f.start).toHaveBeenCalledWith(f.paired.phone.id, f.input);
  expect(await (await f.request('/v1/watch?repo=owner/repo&map=217&ticket=230', 'GET', undefined, f.paired.token)).json()).toMatchObject({ session: { status: 'completed', messages: ['Started', 'Finished'] } });
  expect(f.watch).toHaveBeenCalledWith('owner/repo', 217, 230);
  expect((await f.request('/v1/pair', 'DELETE', undefined, f.paired.token)).status).toBe(200);
  expect((await f.request('/v1/models', 'GET', undefined, f.paired.token)).status).toBe(401);
}, 30_000);

it('rejects unpaired and revoked requests, browser origins and desktop routes', async () => {
  const f = await fixture();
  expect((await f.request('/v1/start', 'POST', f.input)).status).toBe(401);
  expect((await f.request('/v1/watch?repo=owner/repo&map=217&ticket=230')).status).toBe(401);
  expect((await f.request('/api/hand-off', 'POST', f.input, f.paired.token)).status).toBe(404);
  expect((await f.request('/v1/models', 'GET', undefined, f.paired.token, 'https://evil.example')).status).toBe(403);
  await f.pairing.revoke(f.paired.phone.id);
  expect((await f.request('/v1/start', 'POST', f.input, f.paired.token)).status).toBe(401);
  expect(f.start).not.toHaveBeenCalled();
}, 30_000);

it('rejects a consumed code and a disappeared model or changed effort without fallback', async () => {
  const f = await fixture();
  expect((await f.request('/v1/pair', 'POST', { code: f.code.code, name: 'Other', model: 'iOS' })).status).toBe(401);
  const model = f.catalog.providers[0]!.models[0]!;
  model.effort!.options = [];
  expect((await f.request('/v1/start', 'POST', f.input, f.paired.token)).status).toBe(409);
  f.catalog.providers[0]!.models = [];
  expect((await f.request('/v1/start', 'POST', f.input, f.paired.token)).status).toBe(409);
  expect(f.start).not.toHaveBeenCalled();
}, 30_000);
