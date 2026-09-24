import type { HomeAccount } from '../home.js';
import type { DailyGoal, ProgressSettings, ProgressState } from '../progress.js';
import { currentTheme, paintIcons, renderAccountMarkContent, setTheme, THEME_CHANGE_EVENT } from './chrome.js';
import type { Theme } from './chrome.js';
import { escapeHtml } from './markdown.js';
import { defaultTier, saveDefaultTier, TIER_HINT, TIER_LABEL, TIERS } from './models.js';
import type { Tier } from './models.js';
import { GOALS, PROGRESS_SETTINGS_EVENT } from './progress.js';

/* Settings (#40, #104): the GitHub account and the preferences that belong to no one page. */

export interface SettingsView {
  /** Null while the account loads. */
  account: HomeAccount | null;
  theme: Theme;
  tier: Tier;
  /** Null while progress loads or when no one is signed in to save it for. */
  progress: ProgressSettings | null;
  /** The action in flight, so its button can say so and the rest stay still. */
  busy: 'switch' | 'logout' | null;
}

const THEME_LABEL: Record<Theme, string> = { light: 'Light', dark: 'Dark' };

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

export function settingsBodyHtml(view: SettingsView): string {
  const themes = segmented('Theme', (['light', 'dark'] as const).map((theme) => seg('data-settings-theme', theme, THEME_LABEL[theme], theme === view.theme)).join(''));
  const tiers = segmented('Default model tier', TIERS.map((tier) => seg('data-settings-tier', tier, TIER_LABEL[tier], tier === view.tier)).join(''));
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
      <div class="settings-row"><span class="grow">Daily goal<span class="hint">${view.progress === null ? 'Sign in to set a goal.' : 'Tickets to clear each day on Home.'}</span></span>${goals}</div>
    </section>`;
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

  let view: SettingsView = { account: null, theme: currentTheme(), tier: defaultTier(), progress: null, busy: null };

  const draw = (): void => {
    const focusKey = document.activeElement instanceof HTMLElement && body.contains(document.activeElement) ? focusKeyOf(document.activeElement) : null;
    body.innerHTML = settingsBodyHtml(view);
    paintIcons(body);
    if (focusKey !== null) body.querySelector<HTMLElement>(focusKey)?.focus();
  };

  const load = async (): Promise<void> => {
    const [account, progress] = await Promise.allSettled([
      fetch('/api/auth/status').then((response) => readJson<HomeAccount>(response)),
      fetch('/api/progress').then((response) => readJson<ProgressState>(response)),
    ]);
    view = {
      ...view,
      account: account.status === 'fulfilled' ? account.value : { status: 'unavailable', host: 'github.com', login: null, accounts: [], missingScopes: [], tokenSource: null, message: 'GitHub account information is unavailable.' },
      progress: progress.status === 'fulfilled' && progress.value.login !== null ? progress.value.settings : null,
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
    view = { ...view, theme: currentTheme(), tier: defaultTier() };
    draw();
    dialog.showModal();
    void load();
  });

  document.addEventListener(THEME_CHANGE_EVENT, () => {
    view = { ...view, theme: currentTheme() };
    if (dialog.open) draw();
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
  for (const attribute of ['data-settings-theme', 'data-settings-tier', 'data-settings-goal', 'data-settings-switch']) {
    const value = element.getAttribute(attribute);
    if (value !== null) return `[${attribute}="${value}"]`;
  }
  return element.hasAttribute('data-settings-logout') ? '[data-settings-logout]' : null;
}
