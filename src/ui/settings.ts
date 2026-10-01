import type { HomeAccount } from '../home.js';
import type { DailyGoal, ProgressSettings, ProgressState } from '../progress.js';
import { STALL_DAY_CHOICES } from '../types.js';
import type { StallSettings } from '../types.js';
import { currentTheme, paintIcons, renderAccountMarkContent, setTheme, THEME_CHANGE_EVENT } from './chrome.js';
import type { Theme } from './chrome.js';
import { escapeHtml } from './markdown.js';
import { supportsModelRating } from '../autoPick.js';
import { autoRater, currentCatalog, defaultTier, loadCatalog, saveAutoRater, saveDefaultTier, TIER_HINT, TIER_LABEL, TIERS, tierDefaults } from './models.js';
import type { AutoRater, CatalogState, Tier } from './models.js';
import { GOALS, PROGRESS_SETTINGS_EVENT } from './progress.js';
import { handOffCap, HAND_OFF_CAPS, saveHandOffCap } from './startNext.js';
import { DEFAULT_NOTIFICATION_SETTINGS, NOTIFICATION_KINDS } from '../notificationTypes.js';
import type { NotificationKind, NotificationSettings } from '../notificationTypes.js';

/* Settings (#40, #104): the GitHub account and the preferences that belong to no one page. */

export interface SettingsView {
  /** Null while the account loads. */
  account: HomeAccount | null;
  theme: Theme;
  tier: Tier;
  /** How Auto rates a ticket in Start next: by the rules alone, or by a model. */
  rater: AutoRater;
  /** T3 Code's models, for choosing the rating model. */
  models: CatalogState;
  /** How many hand-offs may run at once on this machine before Start next queues the rest. */
  cap: number;
  /** Null while progress loads or when no one is signed in to save it for. */
  progress: ProgressSettings | null;
  /** Null while the stall settings load. */
  stalls: StallSettings | null;
  /** Null while notification choices load. */
  notifications: NotificationSettings | null;
  /** The action in flight, so its button can say so and the rest stay still. */
  busy: 'switch' | 'logout' | null;
}

const THEME_LABEL: Record<Theme, string> = { light: 'Light', dark: 'Dark' };
export const NOTIFICATION_SETTINGS_EVENT = 'wayfinder:notification-settings';
const NOTIFICATION_LABEL: Record<NotificationKind, readonly [string, string]> = {
  unblocked: ['Tickets become ready', 'An unblocked ticket can be started from the map.'],
  threadWaiting: ['T3 Code needs you', 'A thread is waiting for input or approval.'],
  failingCi: ['CI is failing', 'A ticket PR has failing checks.'],
  reviewReady: ['A PR is ready for review', 'Checks passed and the PR is waiting for review.'],
  handOffError: ['A hand-off has an error', 'T3 Code reported an error, including a usage limit.'],
  stalled: ['A ticket stalled', 'A ticket crossed one of the stall settings.'],
  prototypeReady: ['A prototype is ready', 'A prototype branch or snapshot changed.'],
};

function segmented(label: string, buttons: string): string {
  return `<span class="segmented" role="group" aria-label="${label}">${buttons}</span>`;
}

function seg(attribute: string, value: string, label: string, on: boolean, disabled = false): string {
  return `<button type="button" class="seg${on ? ' is-on' : ''}" ${attribute}="${escapeHtml(value)}" aria-pressed="${String(on)}"${disabled ? ' disabled' : ''}>${escapeHtml(label)}</button>`;
}

function accountHtml(account: HomeAccount | null, busy: SettingsView['busy']): string {
  if (account === null) return '<p class="hint" role="status">Reading GitHub CLI…</p>';
  if (account.login === null) {
    return `<div class="settings-account">
      <span class="rail-mark" aria-hidden="true">${renderAccountMarkContent(null)}</span>
      <span class="grow"><strong>Not signed in</strong><p class="hint">${escapeHtml(account.message ?? 'Sign in with GitHub to discover repositories.')}</p></span>
      <a class="primary" href="/">Sign in on Home</a>
    </div>`;
  }
  const others = account.accounts.filter((login) => login !== account.login);
  const warning = account.status === 'ready' ? '' : `<p class="hint failure">${escapeHtml(account.message ?? 'GitHub needs attention.')}</p>`;
  const switcher =
    others.length === 0
      ? ''
      : `<div class="settings-row"><span class="grow" id="settings-switch-title">Switch account</span><span class="settings-switch" role="group" aria-labelledby="settings-switch-title">${others
          .map((login) => `<button type="button" class="ghost" data-settings-switch="${escapeHtml(login)}"${busy === null ? '' : ' disabled'}>${escapeHtml(login)}</button>`)
          .join('')}</span></div>`;
  return `<div class="settings-account">
      <span class="rail-mark" aria-hidden="true">${renderAccountMarkContent(account)}</span>
      <span class="grow"><strong>${escapeHtml(account.login)}</strong><p class="hint">Signed in to ${escapeHtml(account.host)} through GitHub CLI</p></span>
      <button type="button" class="ghost" data-settings-logout${busy === null ? '' : ' disabled'}><span data-icon="sign-out"></span>${busy === 'logout' ? 'Signing out…' : 'Sign out'}</button>
    </div>
    ${warning}
    ${switcher}`;
}

/** The models Wayfinder can rate with: the ones whose provider it can run headless. */
export function ratingModels(models: CatalogState): Array<{ instanceId: string; slug: string; name: string; provider: string }> {
  if (models.status !== 'ready') return [];
  return models.catalog.providers.filter((provider) => provider.ready && supportsModelRating(provider.instanceId)).flatMap((provider) => provider.models.map((model) => ({ instanceId: provider.instanceId, slug: model.slug, name: model.name, provider: provider.name })));
}

const RATER_SEPARATOR = '::';

/** "How Auto rates a ticket": logic only, or a model, with the model's picker once it is chosen. */
export function autoRaterHtml(rater: AutoRater, models: CatalogState): string {
  const kinds = segmented('How Auto rates a ticket', [seg('data-settings-rater', 'logic', 'Logic only', rater.kind === 'logic'), seg('data-settings-rater', 'model', 'A model', rater.kind === 'model')].join(''));
  const hint = rater.kind === 'logic' ? 'Wayfinder scores each ticket with its own rules. No model runs.' : 'A model reads each ticket and rates it. If it cannot, the rules do, and the row says so.';
  const row = `<div class="settings-row"><span class="grow">Auto rates tickets<span class="hint">${escapeHtml(hint)}</span></span>${kinds}</div>`;
  if (rater.kind === 'logic') return row;
  const options = ratingModels(models);
  const picked = `${rater.choice.instanceId}${RATER_SEPARATOR}${rater.choice.model}`;
  const select =
    options.length === 0
      ? `<span class="hint">${models.status === 'loading' ? 'Loading T3 Code models…' : 'No Codex or Claude model is ready to rate with.'}</span>`
      : `<select data-settings-rater-model aria-label="Rating model">${options
          .map((option) => {
            const value = `${option.instanceId}${RATER_SEPARATOR}${option.slug}`;
            return `<option value="${escapeHtml(value)}"${value === picked ? ' selected' : ''}>${escapeHtml(`${option.name} · ${option.provider}`)}</option>`;
          })
          .join('')}</select>`;
  return `${row}<div class="settings-row"><span class="grow">Rating model</span>${select}</div>`;
}

export function settingsBodyHtml(view: SettingsView): string {
  const themes = segmented('Theme', (['light', 'dark'] as const).map((theme) => seg('data-settings-theme', theme, THEME_LABEL[theme], theme === view.theme)).join(''));
  const tiers = segmented('Default model tier', TIERS.map((tier) => seg('data-settings-tier', tier, TIER_LABEL[tier], tier === view.tier)).join(''));
  const caps = segmented('Hand-offs at once', HAND_OFF_CAPS.map((cap) => seg('data-settings-cap', String(cap), String(cap), cap === view.cap)).join(''));
  const goals = segmented(
    'Daily goal',
    GOALS.map((goal) => seg('data-settings-goal', String(goal), String(goal), goal === view.progress?.goal, view.progress === null)).join(''),
  );
  return `<section class="settings-section" aria-labelledby="settings-account-title">
      <h3 id="settings-account-title">GitHub account</h3>
      ${accountHtml(view.account, view.busy)}
    </section>
    <section class="settings-section" aria-labelledby="settings-prefs-title">
      <h3 id="settings-prefs-title">Preferences</h3>
      <div class="settings-row"><span class="grow">Theme</span>${themes}</div>
      <div class="settings-row"><span class="grow">Default model tier<span class="hint">${escapeHtml(TIER_HINT[view.tier])}. New tickets and maps start here.</span></span>${tiers}</div>
      ${autoRaterHtml(view.rater, view.models)}
      <div class="settings-row"><span class="grow">Hand-offs at once<span class="hint">Start next runs this many in T3 Code on this machine and queues the rest.</span></span>${caps}</div>
      <div class="settings-row"><span class="grow">Daily goal<span class="hint">${view.progress === null ? 'Sign in to set a goal.' : 'Tickets to clear each day on Home.'}</span></span>${goals}</div>
    </section>
    <section class="settings-section" aria-labelledby="settings-stalls-title">
      <h3 id="settings-stalls-title">Stalled tickets</h3>
      ${stallRow('untouchedClaimDays', 'Untouched claim', 'Claimed, with no commit, PR, comment or live hand-off.', view.stalls)}
      ${stallRow('deadHandOffDays', 'Dead hand-off', 'The hand-off failed or never started, with no retry or PR.', view.stalls)}
    </section>`;
}

export function notificationSettingsHtml(settings: NotificationSettings | null): string {
  const rows = NOTIFICATION_KINDS.map((kind) => {
    const [label, hint] = NOTIFICATION_LABEL[kind];
    const checked = settings?.[kind] ?? DEFAULT_NOTIFICATION_SETTINGS[kind];
    return '<label class="settings-row settings-notification"><span class="grow">' +
      escapeHtml(label) +
      '<span class="hint">' + escapeHtml(hint) + '</span></span><input type="checkbox" data-settings-notification="' +
      kind + '" aria-label="' + escapeHtml(label) + '"' + (checked ? ' checked' : '') + (settings === null ? ' disabled' : '') + ' /></label>';
  }).join('');
  return '<section class="settings-section" aria-labelledby="settings-notifications-title">' +
    '<h3 id="settings-notifications-title">Notifications</h3>' + rows + '</section>';
}

function stallRow(key: keyof StallSettings, label: string, hint: string, stalls: StallSettings | null): string {
  const days = segmented(
    `${label}, in days`,
    STALL_DAY_CHOICES.map((choice) => seg(`data-settings-${key === 'untouchedClaimDays' ? 'claim' : 'hand-off'}-days`, String(choice), `${String(choice)}d`, choice === stalls?.[key], stalls === null)).join(''),
  );
  return `<div class="settings-row"><span class="grow">${escapeHtml(label)}<span class="hint">${escapeHtml(hint)}</span></span>${days}</div>`;
}

async function readJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json();
  if (!response.ok) throw new Error((body as { error?: string }).error ?? 'Request failed.');
  return body as T;
}

function postJson<T>(url: string, body?: unknown): Promise<T> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }).then((response) => readJson<T>(response));
}

/**
 * Binds the sidebar's Settings button to a modal dialog. The native `<dialog>` keeps focus
 * inside, closes on Escape, and hands focus back to the button.
 */
export function mountSettings(trigger: HTMLElement, toast: (message: string, ms?: number) => void): void {
  const dialog = document.createElement('dialog');
  dialog.className = 'dialog settings-dialog';
  dialog.id = 'settings-dialog';
  dialog.setAttribute('aria-labelledby', 'settings-title');
  dialog.innerHTML = `<div class="dialog-head"><h2 id="settings-title">Settings</h2><button type="button" class="detail-close" data-settings-close aria-label="Close settings">×</button></div><div id="settings-body"></div>`;
  document.body.append(dialog);
  const body = dialog.querySelector<HTMLElement>('#settings-body')!;
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-controls', dialog.id);

  let view: SettingsView = { account: null, theme: currentTheme(), tier: defaultTier(), rater: autoRater(), models: currentCatalog(), cap: handOffCap(), progress: null, stalls: null, notifications: null, busy: null };

  const draw = (): void => {
    const focusKey = document.activeElement instanceof HTMLElement && body.contains(document.activeElement) ? focusKeyOf(document.activeElement) : null;
    body.innerHTML = settingsBodyHtml(view) + notificationSettingsHtml(view.notifications);
    paintIcons(body);
    if (focusKey !== null) body.querySelector<HTMLElement>(focusKey)?.focus();
  };

  const load = async (): Promise<void> => {
    void fetch('/api/notification-settings').then((response) => readJson<NotificationSettings>(response)).then(
      (notifications) => {
        view = { ...view, notifications };
        if (dialog.open) draw();
      },
      () => undefined,
    );
    const [account, progress, stalls] = await Promise.allSettled([
      fetch('/api/auth/status').then((response) => readJson<HomeAccount>(response)),
      fetch('/api/progress').then((response) => readJson<ProgressState>(response)),
      fetch('/api/stall-settings').then((response) => readJson<StallSettings>(response)),
    ]);
    view = {
      ...view,
      account: account.status === 'fulfilled' ? account.value : { status: 'unavailable', host: 'github.com', login: null, accounts: [], missingScopes: [], tokenSource: null, message: 'GitHub account information is unavailable.' },
      progress: progress.status === 'fulfilled' && progress.value.login !== null ? progress.value.settings : null,
      stalls: stalls.status === 'fulfilled' ? stalls.value : view.stalls,
    };
    if (dialog.open) draw();
  };

  const accountAction = async (busy: 'switch' | 'logout', work: () => Promise<HomeAccount>, done: string): Promise<void> => {
    view = { ...view, busy };
    draw();
    try {
      await work();
      toast(done);
      window.location.reload();
    } catch (error) {
      view = { ...view, busy: null };
      draw();
      toast(error instanceof Error ? error.message : String(error), 9000);
    }
  };

  trigger.addEventListener('click', () => {
    view = { ...view, theme: currentTheme(), tier: defaultTier(), rater: autoRater(), models: currentCatalog(), cap: handOffCap() };
    draw();
    dialog.showModal();
    void load();
    void loadCatalog().then((models) => {
      view = { ...view, models };
      if (dialog.open) draw();
    });
  });

  document.addEventListener(THEME_CHANGE_EVENT, () => {
    view = { ...view, theme: currentTheme() };
    if (dialog.open) draw();
  });

  dialog.addEventListener('change', (event) => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement) || !select.hasAttribute('data-settings-rater-model')) return;
    const [instanceId = '', ...rest] = select.value.split(RATER_SEPARATOR);
    const model = rest.join(RATER_SEPARATOR);
    if (instanceId === '' || model === '') return;
    const next: AutoRater = { kind: 'model', choice: { instanceId, model } };
    saveAutoRater(next);
    view = { ...view, rater: next };
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      dialog.close();
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-settings-close]')) {
      dialog.close();
      return;
    }
    const theme = target?.closest<HTMLElement>('[data-settings-theme]')?.dataset['settingsTheme'];
    if (theme === 'light' || theme === 'dark') {
      setTheme(theme);
      return;
    }
    const tier = target?.closest<HTMLElement>('[data-settings-tier]')?.dataset['settingsTier'];
    if (tier !== undefined && (TIERS as readonly string[]).includes(tier)) {
      saveDefaultTier(tier as Tier);
      view = { ...view, tier: tier as Tier };
      draw();
      return;
    }
    const rater = target?.closest<HTMLElement>('[data-settings-rater]')?.dataset['settingsRater'];
    if (rater === 'logic' || rater === 'model') {
      const choice = tierDefaults().mid;
      const options = ratingModels(view.models);
      const first = options.find((option) => option.instanceId === choice?.instanceId && option.slug === choice.model) ?? options[0];
      if (rater === 'model' && first === undefined) {
        toast('No Codex or Claude model is ready to rate with. Auto stays on logic only.', 6000);
        return;
      }
      const next: AutoRater = rater === 'model' && first !== undefined ? { kind: 'model', choice: { instanceId: first.instanceId, model: first.slug } } : { kind: 'logic' };
      saveAutoRater(next);
      view = { ...view, rater: next };
      draw();
      return;
    }
    const cap = Number(target?.closest<HTMLElement>('[data-settings-cap]')?.dataset['settingsCap']);
    if ((HAND_OFF_CAPS as readonly number[]).includes(cap)) {
      saveHandOffCap(cap);
      view = { ...view, cap };
      draw();
      return;
    }
    const goal = Number(target?.closest<HTMLElement>('[data-settings-goal]')?.dataset['settingsGoal']);
    if (view.progress !== null && GOALS.includes(goal as DailyGoal) && goal !== view.progress.goal) {
      const before = view.progress;
      view = { ...view, progress: { ...before, goal: goal as DailyGoal } };
      draw();
      postJson<ProgressSettings>('/api/progress/settings', { goal }).then(
        (settings) => {
          view = { ...view, progress: settings };
          if (dialog.open) draw();
          document.dispatchEvent(new CustomEvent<ProgressSettings>(PROGRESS_SETTINGS_EVENT, { detail: settings }));
        },
        (error: unknown) => {
          view = { ...view, progress: before };
          if (dialog.open) draw();
          toast(error instanceof Error ? error.message : String(error), 9000);
        },
      );
      return;
    }
    const claimDays = Number(target?.closest<HTMLElement>('[data-settings-claim-days]')?.dataset['settingsClaimDays']);
    const handOffDays = Number(target?.closest<HTMLElement>('[data-settings-hand-off-days]')?.dataset['settingsHandOffDays']);
    const stallKey = Number.isFinite(claimDays) ? 'untouchedClaimDays' : Number.isFinite(handOffDays) ? 'deadHandOffDays' : null;
    if (view.stalls !== null && stallKey !== null) {
      const days = stallKey === 'untouchedClaimDays' ? claimDays : handOffDays;
      if (days === view.stalls[stallKey]) return;
      const before = view.stalls;
      view = { ...view, stalls: { ...before, [stallKey]: days } };
      draw();
      postJson<StallSettings>('/api/stall-settings', { [stallKey]: days }).then(
        (settings) => {
          view = { ...view, stalls: settings };
          if (dialog.open) draw();
        },
        (error: unknown) => {
          view = { ...view, stalls: before };
          if (dialog.open) draw();
          toast(error instanceof Error ? error.message : String(error), 9000);
        },
      );
      return;
    }
    const notificationInput = target?.closest<HTMLInputElement>('[data-settings-notification]');
    const notificationKind = notificationInput?.dataset['settingsNotification'] as NotificationKind | undefined;
    if (view.notifications !== null && notificationInput instanceof HTMLInputElement && notificationKind !== undefined && NOTIFICATION_KINDS.includes(notificationKind)) {
      const before = view.notifications;
      const enabled = notificationInput.checked;
      if (enabled === before[notificationKind]) return;
      view = { ...view, notifications: { ...before, [notificationKind]: enabled } };
      draw();
      postJson<NotificationSettings>('/api/notification-settings', { [notificationKind]: enabled }).then(
        (settings) => {
          view = { ...view, notifications: settings };
          if (dialog.open) draw();
          document.dispatchEvent(new CustomEvent<NotificationSettings>(NOTIFICATION_SETTINGS_EVENT, { detail: settings }));
        },
        (error: unknown) => {
          view = { ...view, notifications: before };
          if (dialog.open) draw();
          toast(error instanceof Error ? error.message : String(error), 9000);
        },
      );
      return;
    }
    const login = target?.closest<HTMLElement>('[data-settings-switch]')?.dataset['settingsSwitch'];
    if (login !== undefined && view.busy === null) {
      void accountAction('switch', () => postJson<HomeAccount>('/api/auth/switch', { login }), `Switched to ${login}.`);
      return;
    }
    if (target?.closest('[data-settings-logout]') && view.busy === null) {
      void accountAction('logout', () => postJson<HomeAccount>('/api/auth/logout'), 'Signed out of GitHub.');
    }
  });
}

/** A selector that finds the same control after a redraw, so keyboard focus stays put. */
export function focusKeyOf(element: Element): string | null {
  for (const attribute of ['data-settings-theme', 'data-settings-tier', 'data-settings-rater', 'data-settings-cap', 'data-settings-goal', 'data-settings-claim-days', 'data-settings-hand-off-days', 'data-settings-notification', 'data-settings-switch']) {
    const value = element.getAttribute(attribute);
    if (value !== null) return `[${attribute}="${value}"]`;
  }
  if (element.hasAttribute('data-settings-rater-model')) return '[data-settings-rater-model]';
  return element.hasAttribute('data-settings-logout') ? '[data-settings-logout]' : null;
}
