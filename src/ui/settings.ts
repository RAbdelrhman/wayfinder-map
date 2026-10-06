import type { HomeAccount } from '../home.js';
import type { DailyGoal, ProgressSettings, ProgressState } from '../progress.js';
import { STALL_DAY_CHOICES } from '../types.js';
import type { StallSettings } from '../types.js';
import { currentTheme, paintIcons, renderAccountMarkContent, setTheme, THEME_CHANGE_EVENT } from './chrome.js';
import type { Theme } from './chrome.js';
import { escapeHtml } from './markdown.js';
import { supportsModelRating } from '../autoPick.js';
import { autoRater, calibrationMode, currentCatalog, defaultTier, effortSelectHtml, findModel, liveChoice, loadCatalog, modelSelectHtml, readChoice, saveAutoRater, saveCalibrationMode, saveDefaultTier, saveTierDefault, TIER_HINT, TIER_LABEL, TIERS, tierDefaults } from './models.js';
import type { AutoRater, CalibrationMode, CatalogState, ModelChoice, Tier } from './models.js';
import { GOALS, PROGRESS_SETTINGS_EVENT } from './progress.js';
import { handOffCap, HAND_OFF_CAPS, saveHandOffCap } from './startNext.js';
import { DEFAULT_NOTIFICATION_SETTINGS, NOTIFICATION_KINDS } from '../notificationTypes.js';
import type { NotificationKind, NotificationSettings } from '../notificationTypes.js';
import { canvasSize, isCanvasSize, saveCanvasSize } from './canvasPreference.js';

/* Settings (#40, #104): the GitHub account and the preferences that belong to no one page. */

export interface SettingsView {
  /** Null while the account loads. */
  account: HomeAccount | null;
  theme: Theme;
  tier: Tier;
  /** How Auto rates a ticket in Start next: by the rules alone, or by a model. */
  rater: AutoRater;
  /** Whether a shadow model also rates tickets so the rules can be compared with it (#186). */
  calibration: CalibrationMode;
  /** T3 Code's models, for choosing the rating model. */
  models: CatalogState;
  tierModels: Partial<Record<Tier, ModelChoice>>;
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
export const SETTINGS_CATEGORIES = ['appearance', 'tasks', 'notifications', 'progress', 'account'] as const;
export type SettingsCategory = (typeof SETTINGS_CATEGORIES)[number];
const CATEGORY_LABEL: Record<SettingsCategory, string> = { appearance: 'Appearance', tasks: 'Tasks & models', notifications: 'Notifications', progress: 'Progress', account: 'Account' };
const CATEGORY_HINT: Record<SettingsCategory, string> = {
  appearance: 'Choose how Wayfinder looks.',
  tasks: 'Set the defaults for new tickets and maps. You can override them on a ticket.',
  notifications: 'Choose which updates need your attention.',
  progress: 'Set your daily goal and decide when a ticket counts as stalled.',
  account: 'Manage the GitHub account Wayfinder uses.',
};
const CATEGORY_ICON: Record<SettingsCategory, string> = { appearance: 'moon', tasks: 'sliders', notifications: 'bell', progress: 'map', account: 'person' };

export function settingsCategory(value: string | null): SettingsCategory {
  return SETTINGS_CATEGORIES.find((category) => category === value) ?? 'appearance';
}

export function settingsNavigationHtml(category: SettingsCategory): string {
  return SETTINGS_CATEGORIES.map((candidate) => `<a href="/settings?section=${candidate}" data-settings-category="${candidate}"${candidate === category ? ' aria-current="location"' : ''}><span data-icon="${CATEGORY_ICON[candidate]}" aria-hidden="true"></span>${CATEGORY_LABEL[candidate]}</a>`).join('');
}
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

/** "Calibration": off by default; on, a shadow model also rates task and research tickets and both ratings are saved locally. */
export function calibrationHtml(mode: CalibrationMode, models: CatalogState): string {
  const kinds = segmented('Calibration mode', [seg('data-settings-calibration', 'off', 'Off', mode.kind === 'off'), seg('data-settings-calibration', 'shadow', 'On', mode.kind === 'shadow')].join(''));
  const hint =
    mode.kind === 'off'
      ? 'No extra model call. Turn on to compare a cheap model with the rules.'
      : 'A model also rates each task and research ticket you start with Auto, one call each. Both ratings are saved on this machine for 30 days and never change the pick or reach GitHub.';
  const row = `<div class="settings-row"><span class="grow">Calibration<span class="hint">${escapeHtml(hint)}</span></span>${kinds}</div>`;
  if (mode.kind === 'off') return row;
  const options = ratingModels(models);
  const picked = `${mode.choice.instanceId}${RATER_SEPARATOR}${mode.choice.model}`;
  const select =
    options.length === 0
      ? `<span class="hint">${models.status === 'loading' ? 'Loading T3 Code models…' : 'No Codex or Claude model is ready to rate with.'}</span>`
      : `<select data-settings-calibration-model aria-label="Shadow model">${options
          .map((option) => {
            const value = `${option.instanceId}${RATER_SEPARATOR}${option.slug}`;
            return `<option value="${escapeHtml(value)}"${value === picked ? ' selected' : ''}>${escapeHtml(`${option.name} · ${option.provider}`)}</option>`;
          })
          .join('')}</select>`;
  return `${row}<div class="settings-row"><span class="grow">Shadow model</span>${select}</div>`;
}

export function tierModelsHtml(models: CatalogState, defaults: SettingsView['tierModels']): string {
  if (models.status !== 'ready') return `<p class="hint" role="status">${models.status === 'loading' ? 'Loading T3 Code models…' : escapeHtml(models.reason)}</p>${models.status === 'unavailable' ? '<button type="button" class="ghost" data-settings-retry-models>Try again</button>' : ''}`;
  return TIERS.map((tier) => {
    const choice = liveChoice(models.catalog, defaults[tier]);
    return `<div class="settings-row"><span class="grow">${TIER_LABEL[tier]}<span class="hint">${escapeHtml(TIER_HINT[tier])}</span></span><div class="settings-model-picker">
      ${modelSelectHtml(models.catalog, choice, `id="settings-model-${tier}" data-settings-model="${tier}" aria-label="${TIER_LABEL[tier]} model"`)}
      ${effortSelectHtml(findModel(models.catalog, choice), choice?.effort?.value, `id="settings-effort-${tier}" data-settings-effort="${tier}"`)}
    </div></div>`;
  }).join('');
}

export function settingsBodyHtml(view: SettingsView, category?: SettingsCategory): string {
  const themes = segmented('Theme', (['light', 'dark'] as const).map((theme) => seg('data-settings-theme', theme, THEME_LABEL[theme], theme === view.theme)).join(''));
  const tiers = segmented('Default task tier', TIERS.map((tier) => seg('data-settings-tier', tier, TIER_LABEL[tier], tier === view.tier)).join(''));
  const caps = segmented('Hand-offs at once', HAND_OFF_CAPS.map((cap) => seg('data-settings-cap', String(cap), String(cap), cap === view.cap)).join(''));
  const goals = segmented(
    'Daily goal',
    GOALS.map((goal) => seg('data-settings-goal', String(goal), String(goal), goal === view.progress?.goal, view.progress === null)).join(''),
  );
  const contents: Record<SettingsCategory, string> = {
    account: `<section class="settings-section" aria-labelledby="settings-account-title">
      <h3 id="settings-account-title">GitHub account</h3>
      ${accountHtml(view.account, view.busy)}
    </section>`,
    appearance: `<section class="settings-section"><div class="settings-row"><span class="grow">Theme<span class="hint">Use a light or dark appearance throughout the app.</span></span>${themes}</div><div class="settings-row"><span class="grow">Open canvases</span>${segmented('Open canvases', (['full', 'pane', 'float'] as const).map((size) => seg('data-settings-canvas', size, { full: 'Full window', pane: 'Side pane', float: 'Floating' }[size], size === canvasSize())).join(''))}</div></section>`,
    tasks: `<section class="settings-section" aria-labelledby="settings-tasks-title">
      <h3 id="settings-tasks-title">Task defaults</h3>
      <div class="settings-row"><span class="grow">Default task tier<span class="hint">${escapeHtml(TIER_HINT[view.tier])}. New tickets and maps start here.</span></span>${tiers}</div>
      <div class="settings-row"><span class="grow">Hand-offs at once<span class="hint">Start next runs this many in T3 Code on this machine and queues the rest.</span></span>${caps}</div>
    </section><section class="settings-section" aria-labelledby="settings-models-title"><h3 id="settings-models-title">Models by tier</h3>${tierModelsHtml(view.models, view.tierModels)}</section>
    <section class="settings-section" aria-labelledby="settings-auto-title"><h3 id="settings-auto-title">Automatic task rating</h3>${autoRaterHtml(view.rater, view.models)}<details class="settings-advanced" id="settings-calibration"><summary>Advanced · Calibration</summary>${calibrationHtml(view.calibration, view.models)}</details></section>`,
    progress: `<section class="settings-section">
      <div class="settings-row"><span class="grow">Daily goal<span class="hint">${view.progress === null ? 'Sign in to set a goal.' : 'Tickets to clear each day on Home.'}</span></span>${goals}</div>
    </section>
    <section class="settings-section" aria-labelledby="settings-stalls-title">
      <h3 id="settings-stalls-title">Stalled tickets</h3>
      ${stallRow('untouchedClaimDays', 'Untouched claim', 'Claimed, with no commit, PR, comment or live hand-off.', view.stalls)}
      ${stallRow('deadHandOffDays', 'Dead hand-off', 'The hand-off failed or never started, with no retry or PR.', view.stalls)}
    </section>`,
    notifications: notificationSettingsHtml(view.notifications),
  };
  return (category === undefined ? SETTINGS_CATEGORIES : [category]).map((key) => contents[key]).join('');
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

/** Mount the dedicated Settings page. Categories have URLs and follow browser history. */
export function mountSettingsPage(root: HTMLElement, toast: (message: string, ms?: number) => void): void {
  root.innerHTML = `<header class="settings-page-heading"><div><h1>Settings</h1><p>Make Wayfinder work your way.</p></div><span class="settings-save-note"><span data-icon="check" aria-hidden="true"></span>Changes save automatically</span></header><div class="settings-page-layout"><nav class="settings-categories" aria-label="Settings categories"></nav><div><div id="settings-load-status" role="status"></div><header class="settings-category-heading"><h2 id="settings-category-title"></h2><p id="settings-category-hint"></p></header><div id="settings-body"></div></div></div>`;
  const body = root.querySelector<HTMLElement>('#settings-body')!;
  const nav = root.querySelector<HTMLElement>('.settings-categories')!;
  const loadStatus = root.querySelector<HTMLElement>('#settings-load-status')!;
  let category = settingsCategory(new URLSearchParams(location.search).get('section'));
  let calibrationOpen = false;
  let view: SettingsView = { account: null, theme: currentTheme(), tier: defaultTier(), rater: autoRater(), calibration: calibrationMode(), models: currentCatalog(), tierModels: tierDefaults(), cap: handOffCap(), progress: null, stalls: null, notifications: null, busy: null };

  const draw = (): void => {
    const focusKey = document.activeElement instanceof HTMLElement && body.contains(document.activeElement) ? focusKeyOf(document.activeElement) : null;
    calibrationOpen = body.querySelector<HTMLDetailsElement>('#settings-calibration')?.open ?? calibrationOpen;
    // The HTML builders escape account/catalog strings; hostile-field DOM tests cover this boundary.
    // nosemgrep: javascript.browser.security.insecure-document-method, javascript.browser.security.insecure-innerhtml
    body.innerHTML = settingsBodyHtml(view, category);
    const details = body.querySelector<HTMLDetailsElement>('#settings-calibration');
    if (details !== null) details.open = calibrationOpen;
    root.querySelector<HTMLElement>('#settings-category-title')!.textContent = CATEGORY_LABEL[category];
    root.querySelector<HTMLElement>('#settings-category-hint')!.textContent = CATEGORY_HINT[category];
    paintIcons(body);
    if (focusKey !== null) body.querySelector<HTMLElement>(focusKey)?.focus();
  };

  const load = async (): Promise<void> => {
    const [account, progress, stalls, notifications] = await Promise.allSettled([
      fetch('/api/auth/status').then((response) => readJson<HomeAccount>(response)),
      fetch('/api/progress').then((response) => readJson<ProgressState>(response)),
      fetch('/api/stall-settings').then((response) => readJson<StallSettings>(response)),
      fetch('/api/notification-settings').then((response) => readJson<NotificationSettings>(response)),
    ]);
    view = {
      ...view,
      account: account.status === 'fulfilled' ? account.value : { status: 'unavailable', host: 'github.com', login: null, accounts: [], missingScopes: [], tokenSource: null, message: 'GitHub account information is unavailable.' },
      progress: progress.status === 'fulfilled' && progress.value.login !== null ? progress.value.settings : null,
      stalls: stalls.status === 'fulfilled' ? stalls.value : view.stalls,
      notifications: notifications.status === 'fulfilled' ? notifications.value : view.notifications,
    };
    loadStatus.innerHTML = [account, progress, stalls, notifications].some((result) => result.status === 'rejected') ? '<p class="hint failure">Some settings could not be loaded. <button type="button" class="linkish" data-settings-retry>Try again</button></p>' : '';
    draw();
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

  const loadModels = (): void => {
    view = { ...view, models: { status: 'loading' } };
    draw();
    void loadCatalog().then((models) => {
      view = { ...view, models };
      draw();
    });
  };
  const showCategory = (): void => {
    category = settingsCategory(new URLSearchParams(location.search).get('section'));
    // IDs, labels and icons come from the fixed category allowlist; query text is never interpolated.
    // nosemgrep: javascript.browser.security.insecure-document-method, javascript.browser.security.insecure-innerhtml
    nav.innerHTML = settingsNavigationHtml(category);
    paintIcons(nav);
    draw();
  };
  nav.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('[data-settings-category]') : null;
    if (link === null || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    history.pushState(null, '', link.href);
    showCategory();
    nav.querySelector<HTMLElement>('[aria-current]')?.focus();
    root.scrollTop = 0;
  });
  window.addEventListener('popstate', showCategory);

  document.addEventListener(THEME_CHANGE_EVENT, () => {
    view = { ...view, theme: currentTheme() };
    draw();
  });

  body.addEventListener('change', (event) => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement)) return;
    const tier = select.dataset['settingsModel'] ?? select.dataset['settingsEffort'];
    if (tier !== undefined && (TIERS as readonly string[]).includes(tier) && view.models.status === 'ready') {
      const modelSelect = body.querySelector<HTMLSelectElement>(`#settings-model-${tier}`);
      if (modelSelect === null) return;
      if (select.hasAttribute('data-settings-model')) {
        const [instanceId = '', ...rest] = select.value.split(RATER_SEPARATOR);
        body.querySelector(`#settings-effort-${tier}`)?.remove();
        modelSelect.insertAdjacentHTML('afterend', effortSelectHtml(findModel(view.models.catalog, { instanceId, model: rest.join(RATER_SEPARATOR) }), undefined, `id="settings-effort-${tier}" data-settings-effort="${tier}"`));
      }
      saveTierDefault(tier as Tier, readChoice(view.models.catalog, modelSelect, body.querySelector<HTMLSelectElement>(`#settings-effort-${tier}`)));
      view = { ...view, tierModels: tierDefaults() };
      return;
    }
    const forCalibration = select.hasAttribute('data-settings-calibration-model');
    if (!forCalibration && !select.hasAttribute('data-settings-rater-model')) return;
    const [instanceId = '', ...rest] = select.value.split(RATER_SEPARATOR);
    const model = rest.join(RATER_SEPARATOR);
    if (instanceId === '' || model === '') return;
    if (forCalibration) {
      const next: CalibrationMode = { kind: 'shadow', choice: { instanceId, model } };
      saveCalibrationMode(next);
      view = { ...view, calibration: next };
      return;
    }
    const next: AutoRater = { kind: 'model', choice: { instanceId, model } };
    saveAutoRater(next);
    view = { ...view, rater: next };
  });

  root.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-settings-retry]')) {
      void load();
      return;
    }
    if (target?.closest('[data-settings-retry-models]')) {
      loadModels();
      return;
    }
    const theme = target?.closest<HTMLElement>('[data-settings-theme]')?.dataset['settingsTheme'];
    const canvas = target?.closest<HTMLElement>('[data-settings-canvas]')?.dataset['settingsCanvas'];
    if (isCanvasSize(canvas)) { saveCanvasSize(canvas); draw(); return; }
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
    const calibration = target?.closest<HTMLElement>('[data-settings-calibration]')?.dataset['settingsCalibration'];
    if (calibration === 'off' || calibration === 'shadow') {
      // The cheapest tier's model is the default shadow, so turning this on never starts with a costly one.
      const cheap = tierDefaults().simple;
      const options = ratingModels(view.models);
      const first = options.find((option) => option.instanceId === cheap?.instanceId && option.slug === cheap.model) ?? options[0];
      if (calibration === 'shadow' && first === undefined) {
        toast('No Codex or Claude model is ready to rate with. Calibration stays off.', 6000);
        return;
      }
      const next: CalibrationMode = calibration === 'shadow' && first !== undefined ? { kind: 'shadow', choice: { instanceId: first.instanceId, model: first.slug } } : { kind: 'off' };
      saveCalibrationMode(next);
      view = { ...view, calibration: next };
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
          draw();
          document.dispatchEvent(new CustomEvent<ProgressSettings>(PROGRESS_SETTINGS_EVENT, { detail: settings }));
        },
        (error: unknown) => {
          view = { ...view, progress: before };
          draw();
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
          draw();
        },
        (error: unknown) => {
          view = { ...view, stalls: before };
          draw();
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
          draw();
          document.dispatchEvent(new CustomEvent<NotificationSettings>(NOTIFICATION_SETTINGS_EVENT, { detail: settings }));
        },
        (error: unknown) => {
          view = { ...view, notifications: before };
          draw();
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
  showCategory();
  paintIcons(root);
  void load();
  loadModels();
}

/** A selector that finds the same control after a redraw, so keyboard focus stays put. */
export function focusKeyOf(element: Element): string | null {
  for (const attribute of ['data-settings-theme', 'data-settings-canvas', 'data-settings-tier', 'data-settings-rater', 'data-settings-calibration', 'data-settings-model', 'data-settings-effort', 'data-settings-cap', 'data-settings-goal', 'data-settings-claim-days', 'data-settings-hand-off-days', 'data-settings-notification', 'data-settings-switch']) {
    const value = element.getAttribute(attribute);
    if (value !== null) return `[${attribute}="${value}"]`;
  }
  if (element.hasAttribute('data-settings-rater-model')) return '[data-settings-rater-model]';
  if (element.hasAttribute('data-settings-calibration-model')) return '[data-settings-calibration-model]';
  if (element.id === 'settings-calibration' || element.matches('#settings-calibration > summary')) return '#settings-calibration > summary';
  return element.hasAttribute('data-settings-logout') ? '[data-settings-logout]' : null;
}
