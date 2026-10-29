import { expect, it, vi } from 'vitest';
const openURL = vi.hoisted(() => vi.fn(async (_url: string) => undefined));
vi.mock('react-native', () => ({ Linking: { openURL } }));
import { openExternal } from './openExternal';

it('passes exact map and thread destinations to the OS but rejects other native commands', async () => {
  await openExternal('wayfinder://map?repo=o%2Fr&number=217');
  await openExternal('t3code://threads/env/thread');
  await openExternal('https://github.com/o/r/issues/217');
  await openExternal('t3code://settings');
  await openExternal('javascript:alert(1)');
  expect(openURL.mock.calls).toEqual([
    ['wayfinder://map?repo=o%2Fr&number=217'],
    ['t3code://threads/env/thread'],
    ['https://github.com/o/r/issues/217'],
  ]);
});
