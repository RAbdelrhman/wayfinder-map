import type { HomeState } from '../home.js';
import type { AuthFlowState } from '../authFlow.js';
import type { HandOffStatusDto } from '../handOffTracking.js';
import { draftMapPath, normalizeRepo, parseRepoPagePath, repoPath, scopedApiPath } from '../repoRoutes.js';
import type { MapSnapshot, WayfinderMap } from '../types.js';
import { bindTheme, bindUpdater, paintIcons, paintRepoIcons, repoIconHtml, updateAccountMark } from './chrome.js';
import type { AccountMark, AccountProfile } from './chrome.js';
import * as icons from './icons.js';
import { loadCatalog } from './models.js';
import { syncedLabel } from './focus.js';
import { icon } from './icons.js';
import { escapeHtml } from './markdown.js';
import { mountProgressPanel } from './progress.js';
import type { ProgressSettings, ProgressState } from '../progress.js';
import { AutoRefresh } from './autoRefresh.js';
import { draftToMapPath, initialRepository, isNewMapHandOff } from './newMap.js';
import type { NewMapHandOff } from './newMap.js';
import { renderNewMapPage } from './newMapPage.js';
import { mountNavigation } from './navigation.js';
import { mountSettings } from './settings.js';
import type { NavigationController, NavigationPage } from './navigation.js';
import { readHomeRecency, recordRepositoryOpened } from './homeRecency.js';
import { homeLoadingMarkup, readHomeShape, rememberHomeShape, renderHomeLanding } from './homeLanding.js';
import { handOffCardHtml, handOffPresentation, homeHandOffHistoryHtml, mountHandOffs, recentHandOffs } from './handOffs.js';
import { countRunningHandOffs, mapMatchesRepositoryFilter, repositoryLoadErrorHtml, repositoryLoadingHtml, repositoryPageHtml } from './repositoryView.js';
import type { RepositoryHandOffStatus, RepositoryMapFilter } from './repositoryView.js';

function need<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Missing #${id}`);
  return element as T;
}

const els = {
  main: need('main'),
  toast: need('toast'),
};

const handOffSurface = mountHandOffs();
let homeHandOffHistoryKey = '';

function renderHomeHandOffHistory(records: readonly HandOffStatusDto[]): void {
  const section = document.getElementById('home-handoff-history-section');
  const list = document.getElementById('home-handoff-history-list');
  if (!(section instanceof HTMLElement) || !(list instanceof HTMLElement)) return;
  const history = recentHandOffs(records);
  const key = history
    .map((handOff) => `${handOff.id}:${handOff.status}:${String(handOff.stale)}:${handOff.repo}:${handOff.title ?? ''}:${handOff.pullRequests.map((pullRequest) => `${pullRequest.url}=${pullRequest.state ?? ''}`).join(',')}`)
    .join('|');
  if (key === homeHandOffHistoryKey) return;
  homeHandOffHistoryKey = key;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement.getAttribute('data-focus-key') : null;
  const scrollTop = list.scrollTop;
  section.hidden = history.length === 0;
  list.innerHTML = history.map(homeHandOffHistoryHtml).join('');
  list.scrollTop = scrollTop;
  if (active !== null) document.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(active)}"]`)?.focus();
}

handOffSurface.subscribe(renderHomeHandOffHistory);

function setSynced(text: string): void {
  const synced = syncedButton();
  const label = synced.querySelector<HTMLElement>('.synced-label') ?? synced;
  label.textContent = text;
}

function syncedButton(): HTMLButtonElement {
  return need<HTMLButtonElement>('synced');
}

function setSyncBusy(busy: boolean): void {
  syncedButton().classList.toggle('is-busy', busy);
}

let toastTimer = 0;

function toast(message: string, ms = 4200): void {
  els.toast.textContent = message;
  els.toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, ms);
}

/** Writes markup into the page and hydrates the icons it named. */
function paint(html: string, sheetClass = ''): void {
  els.main.innerHTML = '<div class="sheet' + (sheetClass === '' ? '' : ' ' + sheetClass) + '">' + html + '</div>';
  paintIcons(els.main);
}

function recentRepositories(): string[] {
  try {
    return readHomeRecency(localStorage).repositories;
  } catch {
    return [];
  }
}

function remember(repo: string): void {
  try {
    recordRepositoryOpened(repo, Date.now(), localStorage);
    localStorage.setItem('wayfinder-map:last-route', window.location.pathname);
  } catch {
    // Last route is only a convenience for the next launch.
  }
}

/* ---------- GitHub account ---------- */

function accountPanel(state: HomeState): string {
  const account = state.account;
  if (account.status === 'ready') {
    return state.skippedOrganizations.length === 0
      ? ''
      : `<div class="panel is-warning home-alert"><span class="grow"><strong>Some organization results are hidden</strong><p>GitHub skipped ${escapeHtml(state.skippedOrganizations.join(', '))}. Authorize those organizations on GitHub, then refresh.</p></span><button type="button" class="ghost" data-refresh-home>Refresh</button></div>`;
  }
  const action =
    account.status === 'missing-gh'
      ? '<a class="primary" href="https://cli.github.com/" target="_blank" rel="noreferrer"><span data-icon="external"></span>Install GitHub CLI</a>'
      : account.status === 'signed-out'
        ? '<button type="button" class="primary" data-auth="login">Sign in with GitHub</button>'
        : account.status === 'missing-scopes'
          ? '<button type="button" class="primary" data-auth="refresh">Grant access</button>'
          : '<button type="button" class="ghost" data-refresh-home>Retry</button>';
  return `<div class="panel is-warning is-block">
    <div class="panel" style="margin: 0; padding: 0; border: 0; background: none">
      <span class="grow"><strong>GitHub needs attention</strong><p>${escapeHtml(account.message ?? 'GitHub account information is unavailable.')}</p></span>
      ${action}
    </div>
    <div id="auth-flow"></div>
  </div>`;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body: unknown = await response.json();
  if (!response.ok) throw new Error((body as { error?: string }).error ?? 'Request failed.');
  return body as T;
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value: unknown = await response.json();
  if (!response.ok) throw new Error((value as { error?: string }).error ?? 'Request failed.');
  return value as T;
}

async function beginAuth(action: 'login' | 'refresh'): Promise<void> {
  await postJson<AuthFlowState>(`/api/auth/${action}`);
  const flow = document.getElementById('auth-flow');
  if (flow !== null) flow.innerHTML = '<p class="hint">Waiting for GitHub CLI…</p>';
  const timer = window.setInterval(() => {
    void (async () => {
      const state = await getJson<AuthFlowState>('/api/auth/flow');
      if (flow !== null && state.code !== null && state.url !== null) {
        flow.innerHTML = `<p class="hint">Enter <code>${escapeHtml(state.code)}</code> at <a href="${escapeHtml(state.url)}" target="_blank" rel="noreferrer">GitHub device login</a>.</p>`;
      }
      if (state.status === 'complete') {
        window.clearInterval(timer);
        await show(true);
      } else if (state.status === 'failed') {
        window.clearInterval(timer);
        if (flow !== null) flow.innerHTML = `<p class="hint failure">${escapeHtml(state.error ?? 'GitHub sign-in failed.')}</p>`;
      }
    })().catch((error: unknown) => {
      window.clearInterval(timer);
      if (flow !== null) flow.textContent = error instanceof Error ? error.message : String(error);
    });
  }, 1000);
}

/* ---------- pages ---------- */


let cachedAccount: AccountMark | null = null;
let navigation: NavigationController | null = null;

async function syncAccountMark(): Promise<AccountMark | null> {
  if (cachedAccount) {
    updateAccountMark(document.getElementById('account-mark'), cachedAccount);
    return cachedAccount;
  }
  try {
    const res = await fetch('/api/auth/status');
    if (res.ok) {
      cachedAccount = (await res.json()) as AccountProfile;
      updateAccountMark(document.getElementById('account-mark'), cachedAccount);
      return cachedAccount;
    }
  } catch {
    // ignore
  }
  updateAccountMark(document.getElementById('account-mark'), null);
  return null;
}

interface HandOffSnapshot {
  handOffs: HandOffStatusDto[];
  t3: { available: boolean; checkedAt: string | null };
}

let draftAutoRefresh: AutoRefresh | null = null;

async function renderDraftPage(repo: string, draftId: string, refresh = false): Promise<boolean> {
  navigation?.setCurrentRepo(repo);
  if (refresh) setSyncBusy(true);
  let tracking: HandOffSnapshot;
  try {
    tracking = await getJson<HandOffSnapshot>('/api/hand-offs');
  } catch (error) {
    if (refresh) setSyncBusy(false);
    throw error;
  }
  const handOff = tracking.handOffs.find((candidate) => candidate.id === draftId && candidate.repo.toLowerCase() === repo.toLowerCase());
  if (handOff === undefined || !isNewMapHandOff(handOff)) {
    if (refresh) setSyncBusy(false);
    throw new Error('This planning hand-off could not be found. Start a new map from Home to create another.');
  }
  const draft = handOff as NewMapHandOff;
  let snapshot: MapSnapshot | null = null;
  let snapshotWarning = '';
  try {
    snapshot = await getJson<MapSnapshot>(`${scopedApiPath(repo, 'snapshot')}?refresh=1`);
  } catch {
    snapshotWarning = '<div class="panel is-warning"><span class="grow">Could not check for the new map issue. Wayfinder will try again.</span></div>';
  }
  if (snapshot !== null) {
    navigation?.setSnapshot(snapshot, null);
    const target = draftToMapPath(repo, draft, snapshot.maps);
    if (target !== null) {
      window.location.replace(target);
      if (refresh) setSyncBusy(false);
      return true;
    }
    const fetched = Date.parse(snapshot.fetchedAt);
    setSynced(Number.isNaN(fetched) ? '' : syncedLabel(Date.now() - fetched));
  }

  remember(repo);
  document.title = `${draft.title ?? 'New map'} - being planned - Wayfinder`;
  const badge = draft.threadId === null || draft.status === 'failed' || draft.status === 'interrupted' ? 'Needs attention' : 'Being planned';
  const recoveryActions = draft.threadId === null
    ? `<div class="draft-recovery-actions"><button type="button" class="ghost" data-copy-draft-prompt>${icon(icons.COPY)}Copy prompt</button></div>`
    : '';
  paint(`<div class="draft-map-page">
      ${snapshotWarning}
      <header class="draft-map-head">
        <span class="badge draft-map-badge">${badge}</span>
        <h1>${escapeHtml(draft.title ?? 'New map')}</h1>
        <p>${escapeHtml(draft.repo)}</p>
      </header>
      <section class="draft-handoff" aria-label="T3 Code hand-off">
        ${handOffCardHtml(draft, false, false)}
        ${recoveryActions}
      </section>
      <section class="draft-map-board" aria-label="Map tickets being drafted">
        <p>Tickets appear here as T3 Code drafts them.</p>
        <div class="draft-map-ghosts" aria-hidden="true"><span></span><span></span><span></span></div>
      </section>
    </div>`);
  els.main.querySelector<HTMLButtonElement>('[data-copy-draft-prompt]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement)) return;
    button.disabled = true;
    try {
      const result = await postJson<{ prompt: string; copied: boolean }>(scopedApiPath(draft.repo, 'new-map'), {
        goal: draft.title ?? '',
        copyOnly: true,
        ...(draft.tier === undefined ? {} : { tier: draft.tier }),
      });
      if (!result.copied) await navigator.clipboard.writeText(result.prompt);
      toast('Copied the prompt. Paste it into T3 Code.');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not copy the prompt.', 9000);
    } finally {
      button.disabled = false;
    }
  });
  if (draftAutoRefresh === null) {
    draftAutoRefresh = new AutoRefresh({
      refresh: () => renderDraftPage(repo, draftId, true),
      isVisible: () => document.visibilityState === 'visible',
    });
    if (snapshot !== null) draftAutoRefresh.markSuccessfulSnapshot();
    draftAutoRefresh.start();
  }
  if (refresh) setSyncBusy(false);
  return snapshot !== null;
}

async function renderHome(refresh: boolean): Promise<void> {
  await handOffSurface.refresh();
  await renderHomeLanding({
    refresh,
    storage: localStorage,
    getJson,
    paint,
    bindRepoPicker,
    accountPanel,
    setAccount: (state) => {
      cachedAccount = state.account;
      updateAccountMark(document.getElementById('account-mark'), state.account);
    },
    syncAccountMark,
    setSynced: () => setSynced(syncedLabel(0)),
    renderProgress,
    focusHandOff: async (id) => {
      await postJson('/api/hand-offs/focus', { id });
      toast('Brought T3 Code forward.');
    },
    toast,
  });
  homeHandOffHistoryKey = '';
  renderHomeHandOffHistory(handOffSurface.getRecords());
}

/** Home's progress panel loads on its own, so a slow GitHub search never holds the page. */
async function renderProgress(host: HTMLElement): Promise<void> {
  try {
    const state = await getJson<ProgressState>('/api/progress');
    if (!host.isConnected) return;
    mountProgressPanel(host, state, (patch) => postJson<ProgressSettings>('/api/progress/settings', patch), (message) => toast(message));
  } catch (error) {
    host.innerHTML = `<div class="card progress-panel"><p class="eyebrow">Fog cleared</p><p class="hint failure">${escapeHtml(error instanceof Error ? error.message : String(error))}</p></div>`;
  }
}

const MENU_LIMIT = 50;
let repoList: Promise<string[]> | null = null;

/** Opens a filterable list of the account's repositories under the Home input. */
function bindRepoPicker(
  input: HTMLInputElement,
  menu: HTMLUListElement,
  onSelect?: (repo: string) => void,
): void {
  let repos: string[] | null = null;
  let error: string | null = null;
  let matches: string[] = [];
  let active = -1;

  const close = (): void => {
    menu.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    active = -1;
  };

  const draw = (): void => {
    if (repos === null) {
      menu.innerHTML = `<li class="repo-menu-note">${escapeHtml(error ?? 'Loading your repositories…')}</li>`;
    } else {
      const query = input.value.trim().toLowerCase();
      matches = repos.filter((repo) => repo.toLowerCase().includes(query)).slice(0, MENU_LIMIT);
      active = Math.min(active, matches.length - 1);
      menu.innerHTML =
        matches.length === 0
          ? `<li class="repo-menu-note">No repositories match. Press Enter to use it by name.</li>`
          : matches
              .map(
                (repo, index) =>
                  `<li role="option" class="repo-option${index === active ? ' is-active' : ''}" aria-selected="${String(index === active)}" data-repo="${escapeHtml(repo)}">${repoIconHtml(repo, 'sm')}<span>${escapeHtml(repo)}</span></li>`,
              )
              .join('');
      paintRepoIcons(menu);
      menu.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
    }
    menu.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };

  const open = (): void => {
    draw();
    if (repos !== null || error !== null) return;
    repoList ??= getJson<string[]>('/api/repositories');
    repoList.then(
      (list) => {
        repos = list;
        if (!menu.hidden) draw();
      },
      (reason: unknown) => {
        repoList = null;
        error = `Could not list repositories. ${reason instanceof Error ? reason.message : String(reason)}`;
        if (!menu.hidden) draw();
      },
    );
  };

  input.addEventListener('focus', open);
  input.addEventListener('click', open);
  input.addEventListener('input', () => {
    active = -1;
    draw();
  });
  input.addEventListener('blur', () => {
    setTimeout(close, 180);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (menu.hidden) return open();
      if (matches.length === 0) return;
      active = (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
      draw();
    } else if (event.key === 'Enter' && !menu.hidden) {
      const picked = matches[active];
      if (picked === undefined) return;
      event.preventDefault();
      close();
      if (onSelect) {
        onSelect(picked);
      } else {
        window.location.assign(repoPath(picked));
      }
    }
  });
  // Keep focus in the input so a click on an option lands before blur closes the menu.
  menu.addEventListener('mousedown', (event) => event.preventDefault());
  menu.addEventListener('click', (event) => {
    const repo = (event.target as HTMLElement).closest<HTMLElement>('[data-repo]')?.dataset['repo'];
    if (repo !== undefined) {
      close();
      if (onSelect) {
        onSelect(repo);
      } else {
        window.location.assign(repoPath(repo));
      }
    }
  });
}

function bindRepositoryFilters(maps: readonly WayfinderMap[]): void {
  const root = els.main.querySelector<HTMLElement>('[data-repository-page]');
  const search = root?.querySelector<HTMLInputElement>('#repo-map-search');
  const noMatch = root?.querySelector<HTMLElement>('[data-repo-map-no-match]');
  const resultCount = root?.querySelector<HTMLElement>('[data-repo-map-count]');
  if (root === null || root === undefined || search === null || search === undefined || noMatch === null || noMatch === undefined || resultCount === null || resultCount === undefined) return;

  const byNumber = new Map(maps.map((map) => [map.number, map]));
  const cards = [...root.querySelectorAll<HTMLElement>('[data-map-card]')];
  let filter: RepositoryMapFilter = 'all';
  const update = (): void => {
    let visible = 0;
    for (const card of cards) {
      const map = byNumber.get(Number(card.dataset['mapNumber']));
      const show = map !== undefined && mapMatchesRepositoryFilter(map, filter, search.value);
      card.hidden = !show;
      if (show) visible += 1;
    }
    noMatch.hidden = visible > 0;
    noMatch.textContent = search.value.trim() !== ''
      ? `No maps match “${search.value.trim()}”.`
      : filter === 'all'
        ? 'No maps match this filter.'
        : `No ${filter} maps.`;
    resultCount.textContent = `Showing ${String(visible)} of ${String(cards.length)} maps.`;
  };

  root.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-map-filter]');
    if (button === null) return;
    const next = button.dataset['mapFilter'];
    if (next !== 'all' && next !== 'active' && next !== 'completed') return;
    filter = next;
    for (const candidate of root.querySelectorAll<HTMLButtonElement>('[data-map-filter]')) {
      const selected = candidate === button;
      candidate.setAttribute('aria-pressed', String(selected));
      candidate.classList.toggle('is-on', selected);
    }
    update();
  });
  search.addEventListener('input', update);
  update();
}

async function loadRepositoryHandOffCounts(repo: string, root: HTMLElement): Promise<void> {
  try {
    const snapshot = await getJson<{ handOffs: RepositoryHandOffStatus[] }>('/api/hand-offs');
    if (!root.isConnected || !Array.isArray(snapshot.handOffs)) return;
    const counts = countRunningHandOffs(repo, snapshot.handOffs);
    for (const badge of root.querySelectorAll<HTMLElement>('[data-map-handoffs]')) {
      const mapNumber = Number(badge.dataset['mapHandoffs']);
      if (!Number.isSafeInteger(mapNumber)) continue;
      const count = counts.get(mapNumber) ?? 0;
      badge.innerHTML = count === 0 ? '' : `<span data-icon="bolt" aria-hidden="true"></span>${String(count)} running in T3 Code`;
      paintIcons(badge);
      badge.hidden = count === 0;
    }
  } catch {
    // Hand-off status is optional; leave the map list usable when T3 Code is offline.
  }
}

async function renderRepository(repo: string, refresh: boolean): Promise<void> {
  document.title = `${repo} · Wayfinder`;
  remember(repo);
  void syncAccountMark();
  const snapshot = await getJson<MapSnapshot>(`${scopedApiPath(repo, 'snapshot')}${refresh ? '?refresh=1' : ''}`);
  navigation?.setSnapshot(snapshot, null);
  const fetched = Date.parse(snapshot.fetchedAt);
  setSynced(Number.isNaN(fetched) ? '' : syncedLabel(Date.now() - fetched));
  paint(repositoryPageHtml(repo, snapshot), 'repository-sheet');
  bindRepositoryFilters(snapshot.maps);
  const root = els.main.querySelector<HTMLElement>('[data-repository-page]');
  if (root !== null) void loadRepositoryHandOffCounts(repo, root);
}

async function renderNewMap(): Promise<void> {
  document.title = 'Start a new map · Wayfinder';
  setSynced('');
  await syncAccountMark();

  let homeState: HomeState | null = null;
  try {
    homeState = await getJson<HomeState>('/api/home');
  } catch {
    // The composer can still use a repository name when GitHub is unavailable.
  }

  const repositoryQuery = new URLSearchParams(window.location.search).get('repo');
  const initialRepo = initialRepository(repositoryQuery);
  navigation?.setCurrentRepo(initialRepo || null);
  const catalogState = await loadCatalog();
  await renderNewMapPage(
    {
      main: els.main,
      homeState,
      recents: recentRepositories(),
      catalog: catalogState.status === 'ready' ? catalogState.catalog : null,
      t3Unavailable: catalogState.status === 'unavailable' ? catalogState.reason : null,
      getJson,
      postJson,
      remember,
      setCurrentRepo: (repo) => navigation?.setCurrentRepo(repo),
      toast,
    },
    repositoryQuery,
  );
}

/* ---------- routing ---------- */

const route = parseRepoPagePath(window.location.pathname);
if (route?.prototypes === true) window.location.replace(repoPath(route.repo));
const page:
  | { kind: 'home' }
  | { kind: 'repository'; repo: string }
  | { kind: 'draft'; repo: string; draftId: string }
  | { kind: 'new-map' } =
  window.location.pathname === '/new-map'
    ? { kind: 'new-map' }
    : route?.draftId !== undefined
      ? { kind: 'draft', repo: route.repo, draftId: route.draftId }
      : route?.mapNumber === null
      ? { kind: 'repository', repo: route.repo }
      : { kind: 'home' };

const navigationRepo = page.kind === 'repository' || page.kind === 'draft'
  ? page.repo
  : page.kind === 'new-map'
    ? normalizeRepo(new URLSearchParams(window.location.search).get('repo') ?? '')
    : null;
const navigationPage: NavigationPage = page.kind === 'draft' ? 'new-map' : page.kind;
navigation = mountNavigation({
  shell: need('app'),
  sidebar: need('sidebar-shell'),
  topbar: need('nav-topbar'),
  topbarRoot: need('topbar'),
  page: navigationPage,
  repo: navigationRepo,
  mapNumber: null,
  view: 'map',
});

async function run(work: () => Promise<unknown> | unknown): Promise<void> {
  try {
    await work();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (page.kind === 'repository') {
      paint(repositoryLoadErrorHtml(message), 'repository-sheet');
    } else {
      paint('<div class="empty" role="alert"><strong>Wayfinder could not load this page</strong><p>' + escapeHtml(message) + '</p><button type="button" class="ghost" data-retry-page>Try again</button></div>');
    }
    toast(message, 10000);
  }
}

async function show(refresh = false): Promise<void> {
  if (refresh) setSyncBusy(true);
  else if (page.kind === 'repository') paint(repositoryLoadingHtml(page.repo), 'repository-sheet');
  else if (page.kind === 'home') paint(homeLoadingMarkup(readHomeShape(localStorage)));
  else paint('<p class="loading" role="status" aria-live="polite">Reading GitHub…</p>');
  await run(async () => {
    if (page.kind === 'new-map') await renderNewMap();
    else if (page.kind === 'draft') await renderDraftPage(page.repo, page.draftId, refresh);
    else if (page.kind === 'repository') await renderRepository(page.repo, refresh);
    else await renderHome(refresh);
  });
  setSyncBusy(false);
}
paintIcons();
bindTheme(need('theme'));
bindUpdater(need('updater'), toast);
mountSettings(need('settings'), toast);
syncedButton().addEventListener('click', () => void show(true));
document.addEventListener('visibilitychange', () => draftAutoRefresh?.visibilityChanged());
window.addEventListener('pagehide', () => {
  draftAutoRefresh?.stop();
  if (page.kind === 'home') rememberHomeShape(els.main, localStorage);
});
document.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement | null)?.closest('[data-refresh-home], [data-auth], [data-retry-page]');
  if (target === null || target === undefined) return;
  if (target.hasAttribute('data-refresh-home') || target.hasAttribute('data-retry-page')) void show(true);
  else {
    const action = (target as HTMLElement).dataset['auth'];
    if (action === 'login' || action === 'refresh') void beginAuth(action);
  }
});

void show();
