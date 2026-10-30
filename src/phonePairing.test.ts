import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PhonePairingStore } from './phonePairing.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'wayfinder-phone-'));
  directories.push(directory);
  const file = join(directory, 'phones.json');
  let now = 1_000;
  return { file, store: new PhonePairingStore(file, () => now), advance: (ms: number) => { now += ms; } };
}

describe('phone pairing authorization', { timeout: 30_000 }, () => {
  it('persists start reservations and results so reconnects and crashes cannot start twice', async () => {
    const { store, file } = await fixture();
    const { code } = await store.createCode();
    const paired = (await store.pair(code, 'Phone', 'Android'))!;
    expect(await store.reserveStart(paired.phone.id, 'stable-id', 'fingerprint')).toBeNull();
    const restarted = new PhonePairingStore(file);
    expect(await restarted.reserveStart(paired.phone.id, 'stable-id', 'fingerprint')).toMatchObject({ status: 409, body: { code: 'start_unknown' } });
    expect(await restarted.reserveStart(paired.phone.id, 'stable-id', 'different')).toMatchObject({ status: 409 });
    await restarted.completeStart(paired.phone.id, 'stable-id', { status: 200, body: { threadId: 'exact-thread' } });
    expect(await store.reserveStart(paired.phone.id, 'stable-id', 'fingerprint')).toEqual({ status: 200, body: { threadId: 'exact-thread' } });
    await store.revoke(paired.phone.id);
    expect(await restarted.reserveStart(paired.phone.id, 'another', 'fingerprint')).toMatchObject({ status: 401 });
  });
  it('pairs immediately once, stores only hashes, survives restart and revokes', async () => {
    const { store, file } = await fixture();
    const { code, expiresAt } = await store.createCode();
    expect(expiresAt).toBe(301_000);
    expect(await store.pair('WRONG-CODE', 'Phone', 'Android')).toBeNull();
    const paired = await store.pair(code, 'Phone', 'Android');
    expect(paired).not.toBeNull();
    expect(await store.pair(code, 'Other', 'iOS')).toBeNull();
    const restarted = new PhonePairingStore(file);
    expect(await restarted.authenticate(paired!.token)).toMatchObject({ name: 'Phone' });
    const disk = await readFile(file, 'utf8');
    expect(disk).not.toContain(code);
    expect(disk).not.toContain(paired!.token);
    await restarted.revoke(paired!.phone.id);
    expect(await store.authenticate(paired!.token)).toBeNull();
    expect(await store.authenticate('invalid')).toBeNull();
  });

  it('expires at five minutes and invalidates replaced and cancelled codes', async () => {
    const { store, advance } = await fixture();
    const first = await store.createCode();
    const second = await store.createCode();
    expect(await store.pair(first.code, 'Phone', 'Android')).toBeNull();
    advance(300_000);
    expect(await store.pair(second.code, 'Phone', 'Android')).toBeNull();
    const third = await store.createCode();
    await store.cancelCode();
    expect(await store.pair(third.code, 'Phone', 'Android')).toBeNull();
  });

  it('serializes concurrent exchanges and preserves multiple phones across processes', async () => {
    const { store, file } = await fixture();
    const other = new PhonePairingStore(file);
    const first = await store.createCode();
    const attempts = await Promise.all([store.pair(first.code, 'One', 'Android'), other.pair(first.code, 'Two', 'iOS')]);
    expect(attempts.filter(Boolean)).toHaveLength(1);
    const next = await other.createCode();
    expect(await store.pair(next.code, 'Three', 'Android')).not.toBeNull();
    expect(await other.list()).toHaveLength(2);
  });
});
