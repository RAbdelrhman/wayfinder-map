import { expect, it, vi } from 'vitest';
import { PrototypeFileCache } from './prototypeFileCache.js';

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
