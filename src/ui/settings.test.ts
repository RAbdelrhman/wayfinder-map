import { describe, expect, it } from 'vitest';

import type { HomeAccount } from '../home.js';
import type { CatalogState } from './models.js';
import { autoRaterHtml, calibrationHtml, notificationSettingsHtml, ratingModels, settingsBodyHtml } from './settings.js';
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
  return { account: ACCOUNT, theme: 'dark', tier: 'mid', rater: { kind: 'logic' }, calibration: { kind: 'off' }, models: { status: 'loading' }, cap: 4, progress: { style: 'trail', goal: 5 }, stalls: { untouchedClaimDays: 7, deadHandOffDays: 7 }, notifications: null, busy: null, ...patch };
}

describe('Settings dialog', () => {
  it('offers exactly the approved opening-size preference beside Theme', () => {
    const html = settingsBodyHtml(view());
    expect(html.match(/data-settings-canvas=/g)).toHaveLength(3);
    expect(html).toContain('data-settings-canvas="full" aria-pressed="true"');
    expect(html).toContain('data-settings-canvas="pane"');
    expect(html).toContain('data-settings-canvas="float"');
  });
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

  it('marks the hand-off cap as pressed', () => {
    const html = settingsBodyHtml(view({ cap: 6 }));

    expect(html).toContain('data-settings-cap="6" aria-pressed="true"');
    expect(html).toContain('data-settings-cap="4" aria-pressed="false"');
  });

  it('disables the goal until progress settings load for a signed-in user', () => {
    const html = settingsBodyHtml(view({ progress: null }));

    expect(html).toContain('data-settings-goal="5" aria-pressed="false" disabled');
    expect(html).toContain('Sign in to set a goal.');
  });

  it('offers a day count for each kind of stall, marking the saved one', () => {
    const html = settingsBodyHtml(view({ stalls: { untouchedClaimDays: 14, deadHandOffDays: 3 } }));

    expect(html).toContain('Stalled tickets');
    expect(html).toContain('data-settings-claim-days="14" aria-pressed="true"');
    expect(html).toContain('data-settings-claim-days="7" aria-pressed="false"');
    expect(html).toContain('data-settings-hand-off-days="3" aria-pressed="true"');
    expect(html).toContain('aria-label="Untouched claim, in days"');
  });

  it('disables the stall days until they load', () => {
    expect(settingsBodyHtml(view({ stalls: null }))).toContain('data-settings-hand-off-days="7" aria-pressed="false" disabled');
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

describe('Auto rater setting', () => {
  const models: CatalogState = {
    status: 'ready',
    catalog: {
      providers: [
        { instanceId: 'codex', name: 'Codex', ready: true, models: [{ slug: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', isDefault: false, effort: null }] },
        { instanceId: 'opencode', name: 'OpenCode', ready: true, models: [{ slug: 'x', name: 'X', isDefault: false, effort: null }] },
        { instanceId: 'claudeAgent', name: 'Claude', ready: false, models: [{ slug: 'sonnet-5', name: 'Sonnet 5', isDefault: false, effort: null }] },
      ],
    },
  };

  it('defaults to logic only, with no model picker', () => {
    const html = autoRaterHtml({ kind: 'logic' }, models);
    expect(html).toContain('data-settings-rater="logic" aria-pressed="true"');
    expect(html).toContain('data-settings-rater="model" aria-pressed="false"');
    expect(html).not.toContain('data-settings-rater-model');
  });

  it('offers only ready Codex and Claude models once a model is chosen, with the saved one selected', () => {
    const html = autoRaterHtml({ kind: 'model', choice: { instanceId: 'codex', model: 'gpt-5.6-luna' } }, models);
    expect(html).toContain('data-settings-rater="model" aria-pressed="true"');
    expect(html).toContain('<option value="codex::gpt-5.6-luna" selected>GPT-5.6 Luna · Codex</option>');
    expect(html).not.toContain('OpenCode');
    expect(html).not.toContain('Sonnet 5');
    expect(ratingModels(models)).toHaveLength(1);
  });

  it('says so when no model can rate', () => {
    expect(autoRaterHtml({ kind: 'model', choice: { instanceId: 'codex', model: 'm' } }, { status: 'unavailable', reason: 'offline' })).toContain('No Codex or Claude model is ready to rate with.');
    expect(autoRaterHtml({ kind: 'model', choice: { instanceId: 'codex', model: 'm' } }, { status: 'loading' })).toContain('Loading T3 Code models…');
  });

  it('shows in the preferences section', () => {
    expect(settingsBodyHtml(view())).toContain('Auto rates tickets');
  });
});

describe('Calibration setting (#186)', () => {
  const models: CatalogState = {
    status: 'ready',
    catalog: { providers: [{ instanceId: 'codex', name: 'Codex', ready: true, models: [{ slug: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', isDefault: false, effort: null }] }] },
  };

  it('is off by default: no model picker, and the hint promises no extra call', () => {
    const html = calibrationHtml({ kind: 'off' }, models);
    expect(html).toContain('data-settings-calibration="off" aria-pressed="true"');
    expect(html).toContain('data-settings-calibration="shadow" aria-pressed="false"');
    expect(html).toContain('No extra model call');
    expect(html).not.toContain('data-settings-calibration-model');
    expect(settingsBodyHtml(view())).toContain('data-settings-calibration="off" aria-pressed="true"');
  });

  it('when on, picks the shadow model and says what is saved and that the pick is not changed', () => {
    const html = calibrationHtml({ kind: 'shadow', choice: { instanceId: 'codex', model: 'gpt-5.6-luna' } }, models);
    expect(html).toContain('data-settings-calibration="shadow" aria-pressed="true"');
    expect(html).toContain('<option value="codex::gpt-5.6-luna" selected>GPT-5.6 Luna · Codex</option>');
    expect(html).toContain('never change the pick or reach GitHub');
  });

  it('says so when no model can rate', () => {
    expect(calibrationHtml({ kind: 'shadow', choice: { instanceId: 'codex', model: 'm' } }, { status: 'unavailable', reason: 'offline' })).toContain('No Codex or Claude model is ready to rate with.');
  });
});
