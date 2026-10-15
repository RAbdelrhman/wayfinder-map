import { expect, it, vi } from 'vitest';
import { PrototypeFileCache } from './prototypeFileCache.js';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { diskWrite } = vi.hoisted(() => ({ diskWrite: vi.fn() }));
vi.mock('node:fs/promises', async (load) => {
  const actual = await load<typeof import('node:fs/promises')>();
  return { ...actual, writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
    await diskWrite();
    return actual.writeFile(...args);
  } };
});

it('does not refill a cleared account cache from an older pending download', async () => {
  let finish: (value: Buffer) => void = () => undefined;
  const read = vi.fn().mockImplementationOnce(() => new Promise<Buffer>((resolve) => { finish = resolve; })).mockResolvedValue(Buffer.from('new account'));
  const cache = new PrototypeFileCache(read);
  const old = cache.get('o/r', 'prototype/1', 'index.html', 'abc');
  await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
  cache.clear();
  finish(Buffer.from('old account'));
  await old;
  expect(await cache.get('o/r', 'prototype/1', 'index.html', 'abc')).toEqual(Buffer.from('new account'));
  expect(read).toHaveBeenCalledTimes(2);
});

it('reuses immutable bytes after restart, isolates account scopes and repairs corrupt entries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'prototype-cache-'));
  try {
    const read = vi.fn(async () => Buffer.from('canvas'));
    let scope = 'first-account';
    const directory = async () => join(root, scope);
    const first = new PrototypeFileCache(read, undefined, directory);
    await first.get('o/r', 'prototype/1', 'index.html', 'sha');
    await first.flush();
    const restarted = new PrototypeFileCache(read, undefined, directory);
    expect(await restarted.get('O/R', 'prototype/1', 'index.html', 'sha')).toEqual(Buffer.from('canvas'));
    expect(read).toHaveBeenCalledTimes(1);
    scope = 'second-account';
    await restarted.get('o/r', 'prototype/1', 'index.html', 'sha');
    await restarted.flush();
    expect(read).toHaveBeenCalledTimes(2);
    scope = 'first-account';
    const [file] = await readdir(await directory());
    await writeFile(join(await directory(), file!), 'broken');
    const repaired = new PrototypeFileCache(read, undefined, directory);
    expect(await repaired.get('o/r', 'prototype/1', 'index.html', 'sha')).toEqual(Buffer.from('canvas'));
    expect(read).toHaveBeenCalledTimes(3);
    await repaired.flush();
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('bounds disk bytes and tolerates an unwritable cache', async () => {
  const root = await mkdtemp(join(tmpdir(), 'prototype-cache-'));
  try {
    const read = vi.fn(async () => Buffer.from('123'));
    const directory = async () => root;
    const cache = new PrototypeFileCache(read, 3, directory);
    await cache.get('o/r', 'b', 'a', 'sha');
    await cache.get('o/r', 'b', 'b', 'sha');
    await cache.flush();
    expect(await readdir(root)).toHaveLength(1);
    const blocked = join(root, 'not-a-directory');
    await writeFile(blocked, 'file');
    const unavailable = new PrototypeFileCache(read, undefined, async () => blocked);
    expect(await unavailable.get('o/r', 'b', 'a', 'sha')).toEqual(Buffer.from('123'));
    await unavailable.flush();
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('returns canvas bytes while disk persistence is stalled', async () => {
  const root = await mkdtemp(join(tmpdir(), 'prototype-cache-'));
  let release: () => void = () => undefined;
  let started = false;
  diskWrite.mockImplementationOnce(() => new Promise<void>((resolve) => { started = true; release = resolve; }));
  const cache = new PrototypeFileCache(async () => Buffer.from('canvas'), undefined, async () => root);
  try {
    expect(await cache.get('o/r', 'b', 'index.html', 'sha')).toEqual(Buffer.from('canvas'));
    await vi.waitFor(() => expect(started).toBe(true));
    expect(await cache.get('o/r', 'b', 'index.html', 'sha')).toEqual(Buffer.from('canvas'));
  } finally {
    release();
    await cache.flush();
    await rm(root, { recursive: true, force: true });
  }
});

it('coalesces SHA reads, separates revisions and retries failures', async () => {
  const read = vi.fn(async (_repo: string, ref: string, _file: string) => Buffer.from(ref));
  const cache = new PrototypeFileCache(read);
  await Promise.all([cache.get('o/r', 'prototype/1', 'index.html', 'abc'), cache.get('o/r', 'prototype/1', 'index.html', 'abc')]);
  await cache.get('o/r', 'prototype/1', 'index.html', 'abc');
  expect(read).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledWith('o/r', 'abc', 'index.html');
  await cache.get('o/r', 'prototype/1', 'index.html', 'def');
  expect(read).toHaveBeenCalledTimes(2);
  read.mockRejectedValueOnce(new Error('offline'));
  await expect(cache.get('o/r', 'prototype/1', 'index.html', 'ghi')).rejects.toThrow('offline');
  await cache.get('o/r', 'prototype/1', 'index.html', 'ghi');
  expect(read).toHaveBeenCalledTimes(4);
});

it('evicts least recently read bytes and leaves branch-addressed files uncached', async () => {
  const read = vi.fn(async () => Buffer.from('123'));
  const cache = new PrototypeFileCache(read, 6);
  await cache.get('o/r', 'prototype/1', 'a', 'sha');
  await cache.get('o/r', 'prototype/1', 'b', 'sha');
  await cache.get('o/r', 'prototype/1', 'a', 'sha');
  await cache.get('o/r', 'prototype/1', 'c', 'sha');
  await cache.get('o/r', 'prototype/1', 'b', 'sha');
  expect(read).toHaveBeenCalledTimes(4);
  await cache.get('o/r', 'prototype/1', 'a');
  await cache.get('o/r', 'prototype/1', 'a');
  expect(read).toHaveBeenCalledTimes(6);
});
