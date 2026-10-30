import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PhoneConnection } from './phoneConnection.js';
import { PhonePairingStore } from './phonePairing.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { vi.useRealTimers(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function fixture(address: () => Promise<string | null>) {
  const directory = await mkdtemp(join(tmpdir(), 'wf-connection-'));
  cleanups.push(() => rm(directory, { recursive: true, force: true, maxRetries: 3 }));
  const connection = new PhoneConnection({ pairing: new PhonePairingStore(join(directory, 'phones.json')), catalog: async () => ({ providers: [] }), start: async () => ({ status: 503, body: {} }), watch: async () => ({}) }, { address, port: 0 });
  cleanups.push(async () => { connection.close(); });
  return connection;
}

it('reopens automatically after Tailscale becomes available and caches status between checks', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  let ip: string | null = null;
  const address = vi.fn(async () => ip);
  const connection = await fixture(address);
  connection.start();
  expect((await connection.check()).ready).toBe(false);
  ip = '127.0.0.1';
  await vi.advanceTimersByTimeAsync(15_000);
  const state = await connection.check();
  expect(state.ready).toBe(true);
  expect((await fetch(state.address! + '/v1/models')).status).toBe(401);
  for (let i = 0; i < 10; i++) await connection.check();
  expect(address).toHaveBeenCalledTimes(2);
  ip = null;
  await vi.advanceTimersByTimeAsync(15_000);
  expect((await connection.check()).ready).toBe(false);
});

it('cannot open a listener after shutdown races an address lookup', async () => {
  let resolve!: (address: string | null) => void;
  const connection = await fixture(() => new Promise<string | null>(done => { resolve = done; }));
  const opening = connection.check();
  connection.close();
  resolve('127.0.0.1');
  expect((await opening).ready).toBe(false);
  expect((await connection.check()).address).toBeNull();
});
