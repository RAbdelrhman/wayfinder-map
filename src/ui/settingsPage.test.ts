import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeAccount } from '../home.js';
import type { ModelCatalog } from '../models.js';
import { DEFAULT_NOTIFICATION_SETTINGS } from '../notificationTypes.js';

let browser: Window;
let mount: typeof import('./settings.js')['mountSettingsPage'];
let account: HomeAccount;
let catalog: ModelCatalog;
const hostile = '<img src=x onerror="alert(1)"><script>alert(2)</script>';

beforeEach(async () => {
  browser = new Window({ url: 'http://localhost/settings?section=tasks' });
  for (const name of ['document', 'window', 'location', 'history', 'localStorage', 'Element', 'HTMLElement', 'HTMLSelectElement', 'HTMLInputElement', 'CustomEvent', 'PopStateEvent', 'MouseEvent'] as const) {
    vi.stubGlobal(name, name === 'window' ? browser : browser[name]);
  }
  vi.stubGlobal('getComputedStyle', browser.getComputedStyle.bind(browser));
  account = { status: 'ready', host: 'github.com', login: 'octo', accounts: ['octo', 'octo-work'], missingScopes: [], tokenSource: null, message: null, avatarUrl: null };
  catalog = { providers: [{ instanceId: 'codex', name: 'Codex', ready: true, models: [{ slug: 'demo', name: 'Demo model', isDefault: true, effort: null }] }] };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const data = {
      '/api/auth/status': account,
      '/api/progress': { login: account.login, settings: { style: 'trail', goal: 5 } },
      '/api/stall-settings': { untouchedClaimDays: 7, deadHandOffDays: 3 },
      '/api/notification-settings': DEFAULT_NOTIFICATION_SETTINGS,
      '/api/models': catalog,
    }[url];
    if (data === undefined) throw new Error(`Unexpected request: ${url}`);
    return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
  }));
  vi.resetModules();
  mount = (await import('./settings.js')).mountSettingsPage;
});

afterEach(async () => {
  await browser.happyDOM.abort();
  vi.unstubAllGlobals();
});

function open(section: string): HTMLElement {
  history.replaceState(null, '', `/settings?section=${encodeURIComponent(section)}`);
  const root = document.createElement('main');
  document.body.append(root);
  mount(root, vi.fn());
  return root;
}

describe('mounted Settings page', () => {
  it('saves the canvas opening size from Appearance and retains it after a redraw', () => {
    const root = open('appearance');
    root.querySelector<HTMLButtonElement>('[data-settings-canvas="pane"]')!.click();
    expect(root.querySelector('[data-settings-canvas="pane"]')?.getAttribute('aria-pressed')).toBe('true');
    root.querySelector<HTMLAnchorElement>('[data-settings-category="tasks"]')!.click();
    expect(root.querySelector('[data-settings-canvas]')).toBeNull();
    root.querySelector<HTMLAnchorElement>('[data-settings-category="appearance"]')!.click();
    expect(root.querySelector('[data-settings-canvas="pane"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it.each([
    ['appearance', 'Appearance', '[data-settings-theme]'],
    ['tasks', 'Tasks & models', '[data-settings-tier]'],
    ['notifications', 'Notifications', '[data-settings-notification]'],
    ['progress', 'Progress', '[data-settings-goal]'],
    ['account', 'Account', '.settings-account'],
    ['invalid', 'Appearance', '[data-settings-theme]'],
  ])('renders the category from a direct section=%s URL', async (section, title, control) => {
    const root = open(section);
    await vi.waitFor(() => expect(root.querySelector('[data-settings-category][aria-current]')?.textContent).toBe(title));
    expect(root.querySelector('#settings-category-title')?.textContent).toBe(title);
    await vi.waitFor(() => expect(root.querySelector(control)).not.toBeNull());
    if (section === 'tasks') {
      expect(root.querySelector('[data-settings-theme]')).toBeNull();
      await vi.waitFor(() => expect(root.querySelector('[data-settings-model="simple"]')).not.toBeNull());
    }
  });

  it('updates the category URL on click and renders browser history changes', () => {
    const root = open('tasks');
    root.querySelector<HTMLAnchorElement>('[data-settings-category="appearance"]')!.click();
    expect(location.search).toBe('?section=appearance');
    expect(root.querySelector('#settings-category-title')?.textContent).toBe('Appearance');
    expect(document.activeElement).toBe(root.querySelector('[data-settings-category="appearance"]'));
    history.replaceState(null, '', '/settings?section=tasks');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(root.querySelector('#settings-category-title')?.textContent).toBe('Tasks & models');
    expect(root.querySelector('[data-settings-category="tasks"]')?.getAttribute('aria-current')).toBe('location');
    expect(root.querySelector('[data-settings-tier]')).not.toBeNull();
  });

  it('renders hostile account fields as text without adding executable elements', async () => {
    account = { ...account, status: 'missing-scopes', login: hostile, accounts: [hostile, `work" onclick="alert(3)`], host: hostile, message: hostile };
    const root = open('account');
    await vi.waitFor(() => expect(root.querySelector('.settings-account strong')?.textContent).toBe(hostile));
    expect(root.querySelector('script, img, [onerror], [onclick]')).toBeNull();
    expect(root.querySelector('[data-settings-switch]')?.getAttribute('data-settings-switch')).toBe('work" onclick="alert(3)');
    expect(root.querySelector('.settings-section')?.textContent).toContain(hostile);
  });

  it('renders hostile model fields as text and rejects category query markup', async () => {
    catalog.providers[0]!.name = hostile;
    catalog.providers[0]!.instanceId = 'codex" onclick="alert(3)';
    catalog.providers[0]!.models[0]!.name = hostile;
    catalog.providers[0]!.models[0]!.slug = 'demo" onclick="alert(4)';
    const root = open('tasks');
    await vi.waitFor(() => expect(root.querySelector('[data-settings-model] option:last-child')?.textContent).toBe(hostile));
    expect(root.querySelector('script, img, [onerror], [onclick]')).toBeNull();
    history.replaceState(null, '', `/settings?section=${encodeURIComponent(hostile)}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(root.querySelector('#settings-category-title')?.textContent).toBe('Appearance');
    expect(root.querySelector('[data-settings-category="appearance"]')?.getAttribute('aria-current')).toBe('location');
    expect(root.querySelector('script, img, [onerror], [onclick]')).toBeNull();
  });
});
