import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  applyNotificationSettings,
  DEFAULT_NOTIFICATION_SETTINGS,
  memoryNotificationSettings,
  NotificationSettingsStore,
  parseDesktopNotification,
  readNotificationSettings,
} from './notifications.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('notification settings', () => {
  it('enables every event type by default and fills missing saved values', () => {
    expect(readNotificationSettings(null)).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
    expect(readNotificationSettings({ unblocked: false })).toEqual({ ...DEFAULT_NOTIFICATION_SETTINGS, unblocked: false });
  });

  it('applies only boolean settings and rejects invalid values', () => {
    expect(applyNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS, { failingCi: false })).toEqual({
      ...DEFAULT_NOTIFICATION_SETTINGS,
      failingCi: false,
    });
    expect(applyNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS, { failingCi: 'off' })).toBeNull();
    expect(applyNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS, { unrelated: true })).toBeNull();
  });

  it('persists settings and starts a fresh instance from the saved values', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wayfinder-notifications-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'notifications.json');
    const store = new NotificationSettingsStore(path);
    expect(await store.update({ unblocked: false, stalled: false })).toMatchObject({ unblocked: false, stalled: false });
    expect(await new NotificationSettingsStore(path).get()).toMatchObject({ unblocked: false, stalled: false });
    expect(await readFile(path, 'utf8')).toContain('"unblocked": false');
  });

  it('keeps an isolated in-memory settings source for servers and tests', async () => {
    const store = memoryNotificationSettings();
    await store.update({ reviewReady: false });
    expect(await store.get()).toMatchObject({ reviewReady: false });
  });

  it('accepts only complete desktop notification targets', () => {
    expect(parseDesktopNotification({
      kind: 'unblocked',
      title: 'octo/repo · Map #5',
      body: '#11 Ready ticket',
      repo: 'octo/repo',
      mapNumber: 5,
      ticketNumber: 11,
    })).toMatchObject({ repo: 'octo/repo', mapNumber: 5, ticketNumber: 11 });
    expect(parseDesktopNotification({ kind: 'unknown', repo: 'octo/repo', mapNumber: 0, ticketNumber: 11 })).toBeNull();
  });
});
