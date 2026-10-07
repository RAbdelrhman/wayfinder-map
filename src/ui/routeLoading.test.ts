import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHomeLanding } from './homeLanding.js';
import { renderNewMapPage } from './newMapPage.js';
import type { NewMapPageContext } from './newMapPage.js';
import type { HomeState } from '../home.js';
import type { MapSnapshot } from '../types.js';
import { setTrustedHtml } from './trustedHtml.js';

let browser: Window;
beforeEach(() => {
  browser = new Window({ url: 'http://localhost/' });
  for (const name of ['document', 'window', 'localStorage', 'HTMLElement', 'HTMLFormElement', 'HTMLInputElement', 'HTMLButtonElement', 'HTMLUListElement', 'Node', 'Event'] as const) vi.stubGlobal(name, name === 'window' ? browser : browser[name]);
  vi.stubGlobal('getComputedStyle', browser.getComputedStyle.bind(browser));
  setTrustedHtml(document.body, '<main id="main"></main>');
});
afterEach(async () => { await browser.happyDOM.abort(); vi.unstubAllGlobals(); });

const home: HomeState = { version: 'dev', account: { status: 'ready', host: 'github.com', login: 'owner', accounts: ['owner'], missingScopes: [], tokenSource: null, message: null }, repositories: ['owner/fast', 'owner/slow'], skippedOrganizations: [], warning: null };
const snapshot: MapSnapshot = { repo: 'owner/fast', fetchedAt: new Date().toISOString(), maps: [], hiddenMaps: 0, publicMaps: [], warnings: [] };

describe('routes remain usable during slow reads', () => {
  it('restores Home while both discovery and T3 are pending', async () => {
    let finishHome: (value: HomeState) => void = () => undefined;
    let finishHandOffs: (value: { handOffs: [] }) => void = () => undefined;
    const homeRead = new Promise<HomeState>((resolve) => { finishHome = resolve; });
    const handOffRead = new Promise<{ handOffs: [] }>((resolve) => { finishHandOffs = resolve; });
    const pending = renderHomeLanding({ refresh: false, storage: localStorage, peekJson: <T>(url: string): T | null => (url === '/api/home' ? home : url.endsWith('/snapshot') ? snapshot : null) as T | null, getJson: async <T>(url: string): Promise<T> => (url === '/api/home' ? await homeRead : url === '/api/hand-offs' ? await handOffRead : snapshot) as T, paint: (html) => setTrustedHtml(document.getElementById('main')!, html), bindRepoPicker: vi.fn(), accountPanel: () => '', setAccount: vi.fn(), syncAccountMark: async () => undefined, setSynced: vi.fn(), renderProgress: async () => undefined, focusHandOff: async () => undefined, toast: vi.fn() });
    expect(document.querySelector('.wf-home')).not.toBeNull();
    expect(document.querySelector('[data-home-repo="owner/fast"]')?.textContent).toContain('No maps yet');
    finishHome(home); finishHandOffs({ handOffs: [] });
    await pending;
  });
  it('shows Home before every repository finishes and preserves search, focus, and progress on updates', async () => {
    let finish: (value: MapSnapshot) => void = () => undefined;
    const slow = new Promise<MapSnapshot>((resolve) => { finish = resolve; });
    const progress = vi.fn(async () => undefined);
    const pending = renderHomeLanding({ refresh: false, storage: localStorage, getJson: async <T>(url: string): Promise<T> => (url === '/api/home' ? home : url === '/api/hand-offs' ? { handOffs: [] } : url.includes('/fast/') ? snapshot : await slow) as T, paint: (html) => { setTrustedHtml(document.getElementById('main')!, html); }, bindRepoPicker: vi.fn(), accountPanel: () => '', setAccount: vi.fn(), syncAccountMark: async () => undefined, setSynced: vi.fn(), renderProgress: progress, focusHandOff: async () => undefined, toast: vi.fn() });
    await vi.waitFor(() => expect(document.querySelector('[data-home-repo="owner/fast"]')?.textContent).toContain('No maps yet'));
    const input = document.getElementById('repo-name') as HTMLInputElement;
    input.value = 'slow'; input.focus(); input.dispatchEvent(new Event('input'));
    finish({ ...snapshot, repo: 'owner/slow' });
    await pending;
    expect((document.getElementById('repo-name') as HTMLInputElement).value).toBe('slow');
    expect(document.activeElement?.id).toBe('repo-name');
    expect((document.querySelector('[data-home-repo="owner/fast"]') as HTMLElement).hidden).toBe(true);
    expect(progress).toHaveBeenCalledTimes(1);
  });

  it('opens the new-map composer before metadata finishes without erasing the typed goal', async () => {
    let finish: (value: Pick<NewMapPageContext, 'homeState' | 'catalog' | 't3Unavailable'>) => void = () => undefined;
    const ready = new Promise<Pick<NewMapPageContext, 'homeState' | 'catalog' | 't3Unavailable'>>((resolve) => { finish = resolve; });
    await renderNewMapPage({ main: document.getElementById('main')!, homeState: null, recents: [], catalog: null, t3Unavailable: null, ready, getJson: vi.fn(), postJson: vi.fn(), remember: vi.fn(), setCurrentRepo: vi.fn(), toast: vi.fn() }, null);
    const goal = document.getElementById('new-map-goal') as HTMLTextAreaElement;
    goal.value = 'Keep what I am typing';
    finish({ homeState: home, catalog: { providers: [] }, t3Unavailable: null });
    await vi.waitFor(() => expect(document.getElementById('repo-options')?.textContent).toContain('owner/fast'));
    expect((document.getElementById('new-map-goal') as HTMLTextAreaElement).value).toBe('Keep what I am typing');
  });
});
