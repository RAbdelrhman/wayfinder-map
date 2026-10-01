import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { applyNotificationSettings, DEFAULT_NOTIFICATION_SETTINGS, readNotificationSettings } from './notificationTypes.js';
import type { DesktopNotification, NotificationSettings } from './notificationTypes.js';

export { applyNotificationSettings, DEFAULT_NOTIFICATION_SETTINGS, parseDesktopNotification, readNotificationSettings } from './notificationTypes.js';
export type { DesktopNotification, NotificationKind, NotificationSettings } from './notificationTypes.js';

export interface NotificationSettingsSource {
  get: () => Promise<NotificationSettings>;
  update: (patch: unknown) => Promise<NotificationSettings | null>;
}

export function notificationSettingsFile(): string {
  return join(homedir(), '.wayfinder-map', 'notifications.json');
}

export class NotificationSettingsStore implements NotificationSettingsSource {
  constructor(private readonly path: string = notificationSettingsFile()) {}

  async get(): Promise<NotificationSettings> {
    try {
      return readNotificationSettings(JSON.parse(await readFile(this.path, 'utf8')));
    } catch {
      return DEFAULT_NOTIFICATION_SETTINGS;
    }
  }

  async update(patch: unknown): Promise<NotificationSettings | null> {
    const next = applyNotificationSettings(await this.get(), patch);
    if (next === null) return null;
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(next, null, 2) + '\n', 'utf8');
    return next;
  }
}

export function memoryNotificationSettings(initial: NotificationSettings = DEFAULT_NOTIFICATION_SETTINGS): NotificationSettingsSource {
  let current = initial;
  return {
    get: () => Promise.resolve(current),
    update: (patch) => {
      const next = applyNotificationSettings(current, patch);
      if (next !== null) current = next;
      return Promise.resolve(next);
    },
  };
}
