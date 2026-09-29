import { describe, expect, it } from 'vitest';

import { DEFAULT_NOTIFICATION_SETTINGS } from '../notificationTypes.js';
import { notificationSettingsHtml } from './settings.js';

describe('notification settings UI', () => {
  it('turns each notification type on by default and reflects saved choices', () => {
    const defaults = notificationSettingsHtml(null);
    const saved = notificationSettingsHtml({ ...DEFAULT_NOTIFICATION_SETTINGS, unblocked: false });

    expect(defaults).toContain('data-settings-notification="unblocked" aria-label="Tickets become ready" checked disabled');
    expect(saved).toContain('data-settings-notification="unblocked" aria-label="Tickets become ready" />');
    expect(saved).toContain('data-settings-notification="threadWaiting" aria-label="T3 Code needs you" checked');
  });
});
