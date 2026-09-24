import { describe, expect, it } from 'vitest';

import type { HomeAccount } from '../home.js';
import { settingsBodyHtml } from './settings.js';
import type { SettingsView } from './settings.js';

const ACCOUNT: HomeAccount = {
  status: 'ready',
  host: 'github.com',
  login: 'octo',
  avatarUrl: null,
  accounts: ['octo', 'octo-work'],
  missingScopes: [],
  tokenSource: 'keyring',
  message: null,
};

function view(patch: Partial<SettingsView> = {}): SettingsView {
  return { account: ACCOUNT, theme: 'dark', tier: 'mid', progress: { style: 'trail', goal: 5 }, busy: null, ...patch };
}

describe('Settings dialog', () => {
  it('holds the signed-in account with sign out and a switch to every other gh account', () => {
    const html = settingsBodyHtml(view());

    expect(html).toContain('<strong>octo</strong>');
    expect(html).toContain('data-settings-logout');
    expect(html).toContain('data-settings-switch="octo-work"');
    expect(html).not.toContain('data-settings-switch="octo"');
  });

  it('hides the switcher for a single account and sends a signed-out user to Home to sign in', () => {
    expect(settingsBodyHtml(view({ account: { ...ACCOUNT, accounts: ['octo'] } }))).not.toContain('Switch account');

    const signedOut = settingsBodyHtml(view({ account: { ...ACCOUNT, status: 'signed-out', login: null, accounts: [], message: 'Sign in with GitHub.' } }));
    expect(signedOut).toContain('Not signed in');
    expect(signedOut).toContain('href="/"');
    expect(signedOut).not.toContain('data-settings-logout');
  });

  it('marks the current theme, default tier and daily goal as pressed', () => {
    const html = settingsBodyHtml(view({ theme: 'light', tier: 'hard', progress: { style: 'bar', goal: 8 } }));

    expect(html).toContain('data-settings-theme="light" aria-pressed="true"');
    expect(html).toContain('data-settings-theme="dark" aria-pressed="false"');
    expect(html).toContain('data-settings-tier="hard" aria-pressed="true"');
    expect(html).toContain('data-settings-goal="8" aria-pressed="true"');
  });

  it('disables the goal until progress settings load for a signed-in user', () => {
    const html = settingsBodyHtml(view({ progress: null }));

    expect(html).toContain('data-settings-goal="5" aria-pressed="false" disabled');
    expect(html).toContain('Sign in to set a goal.');
  });

  it('locks the account buttons while a switch or sign-out runs', () => {
    const html = settingsBodyHtml(view({ busy: 'logout' }));

    expect(html).toContain('data-settings-logout disabled');
    expect(html).toContain('Signing out…');
    expect(html).toContain('data-settings-switch="octo-work" disabled');
  });

  it('shows a loading line before the account arrives', () => {
    expect(settingsBodyHtml(view({ account: null }))).toContain('Reading GitHub CLI…');
  });
});
