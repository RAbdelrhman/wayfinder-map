import { setTrustedHtml } from './trustedHtml.js';
import { readRouteJson, routeData } from './routeData.js';
import type { HomeState } from '../home.js';
import type { AuthFlowState } from '../authFlow.js';
import type { HandOffStatusDto } from '../handOffTracking.js';
import { normalizeRepo, parseRepoPagePath, repoPath, scopedApiPath } from '../repoRoutes.js';
import type { MapSnapshot } from '../types.js';
import { bindUpdater, paintIcons, paintRepoIcons, repoIconHtml, updateAccountMark } from './chrome.js';
import type { AccountMark, AccountProfile } from './chrome.js';
import * as icons from './icons.js';
import { currentCatalog, loadCatalog } from './models.js';
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
import { NOTIFICATION_SETTINGS_EVENT } from './settings.js';
import { syncServerSettings } from './settingsSync.js';
import type { NavigationController, NavigationPage } from './navigation.js';
import { readHomeRecency, recordRepositoryOpened } from './homeRecency.js';
import { homeLoadingMarkup, readHomeShape, rememberHomeShape, renderHomeLanding } from './homeLanding.js';
import { handOffCardHtml, homeHandOffHistoryHtml, mountHandOffs, recentHandOffs } from './handOffs.js';
import { mountMapEventInbox } from './mapEventInbox.js';
import { repositoryLoadErrorHtml, repositoryLoadingHtml } from './repositoryView.js';
import type { RepositoryView } from './repositoryView.js';
import { mountRepositoryPage } from './repositoryPage.js';
import type { RepositoryPage, ToastAction } from './repositoryPage.js';
import type { AutoMapView } from '../autoMapService.js';
import { desktopNotificationFor, handOffTransitionNotifications, mapEventNotification, mountNotificationInbox } from './notifications.js';
import type { NewInboxNotification } from './notifications.js';
import { DEFAULT_NOTIFICATION_SETTINGS, readNotificationSettings } from '../notificationTypes.js';
import type { NotificationSettings } from '../notificationTypes.js';
import type { MapEvent } from '../mapWatch.js';
import { mountCanvasViewer } from './canvasViewer.js';
import { setSyncedBusy, setSyncedLabel } from './syncedButton.js';
import { mountTour, offerTourOnFirstLaunch } from './tour.js';

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
mountCanvasViewer(need('app'));
const notificationInbox = mountNotificationInbox();
mountMapEventInbox((event: MapEvent) => {
  const shown = repositoryPage?.snapshot();
  const openMap = shown?.repo.toLowerCase() === event.repo.toLowerCase()
    ? shown.maps.find((map) => map.number === event.mapNumber)
    : undefined;
  const notification = mapEventNotification(event, openMap?.title ?? 'Map #' + String(event.mapNumber));
  if (notification !== null) void publishNotification(notification);
}, notificationInbox);
let homeHandOffHistoryKey = '';
let repositoryPage: RepositoryPage | null = null;
let previousHomeHandOffRecords: readonly HandOffStatusDto[] | null = null;
let notificationSettings: NotificationSettings = { ...DEFAULT_NOTIFICATION_SETTINGS };
let notificationSettingsChanged = false;

const notificationSettingsReady = fetch('/api/notification-settings')
  .then((response) => response.json())
  .then((value: unknown) => {
    if (!notificationSettingsChanged) notificationSettings = readNotificationSettings(value);
  })
  .catch(() => undefined);

document.addEventListener(NOTIFICATION_SETTINGS_EVENT, (event) => {
  notificationSettingsChanged = true;
  notificationSettings = (event as CustomEvent<NotificationSettings>).detail;
});

async function publishNotification(notification: NewInboxNotification): Promise<boolean> {
  await notificationSettingsReady;
  if (!notificationSettings[notification.kind]) return false;
  const added = await notificationInbox.push(notification);
  if (!added) return false;
  const saved = notificationInbox.list().find((item) => item.id === notification.id);
  if (saved !== undefined) {
    void fetch('/api/desktop/notification', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(desktopNotificationFor(saved)),
    }).catch(() => undefined);
  }
  return true;
}

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
  setTrustedHtml(list, history.map(homeHandOffHistoryHtml).join(''));
  list.scrollTop = scrollTop;
  if (active !== null) document.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(active)}"]`)?.focus();
}

handOffSurface.subscribe((records) => {
  const previous = previousHomeHandOffRecords;
  previousHomeHandOffRecords = records;
  notificationInbox.reconcileHandOffs(records);
  for (const notification of handOffTransitionNotifications(previous ?? [], records)) void publishNotification(notification);
  renderHomeHandOffHistory(records);
  repositoryPage?.refresh();
});

function setSynced(text: string): void {
  setSyncedLabel(syncedButton(), text);
}

function syncedButton(): HTMLButtonElement {
  return need<HTMLButtonElement>('synced');
}

function setSyncBusy(busy: boolean): void {
  setSyncedBusy(syncedButton(), busy);
}

let toastTimer = 0;

/** Shows a message, with one optional action button that stays a little longer. */
function toast(message: string, ms: number | ToastAction = 4200): void {
  const action = typeof ms === 'number' ? null : ms;
  if (action === null) {
    els.toast.textContent = message;
  } else {
    setTrustedHtml(els.toast, `<span>${escapeHtml(message)}</span><button type="button">${escapeHtml(action.label)}</button>`);
    els.toast.querySelector('button')?.addEventListener('click', () => {
      els.toast.hidden = true;
      action.run();
    });
  }
  els.toast.classList.toggle('has-action', action !== null);
  els.toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, typeof ms === 'number' ? ms : 6000);
}

/** Writes markup into the page and hydrates the icons it named. */
function paint(html: string, sheetClass = ''): void {
  setTrustedHtml(els.main, '<div class="sheet' + (sheetClass === '' ? '' : ' ' + sheetClass) + '">' + html + '</div>');
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
      : `<div class="panel is-warning home-alert"><span class="grow"><strong>Some organizations are missing</strong><p>GitHub left out ${escapeHtml(state.skippedOrganizations.join(', '))}. Give the GitHub CLI access to them on GitHub, then refresh.</p></span><button type="button" class="ghost" data-refresh-home>Refresh</button></div>`;
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
      <span class="grow"><strong>GitHub needs attention</strong><p>${escapeHtml(account.message ?? "Wayfinder couldn't read your GitHub account.")}</p></span>
      ${action}
    </div>
    <div id="auth-flow"></div>
  </div>`;
}

async function getJson<T>(url: string): Promise<T> {
  return readRouteJson<T>(url);
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value: unknown = await response.json();
  if (!response.ok) throw new Error((value as { error?: string }).error ?? 'Request failed.');
  if (url.startsWith('/api/auth/')) routeData().adoptScope(response);
  if (url.endsWith('/settle') || url.endsWith('/follow')) routeData().remember(url.replace(/\/(settle|follow)$/, '/snapshot'), value);
  routeData().invalidate('/api/hand-offs');
  if (url === '/api/progress/settings') routeData().invalidate('/api/progress');
  return value as T;
}

async function beginAuth(action: 'login' | 'refresh'): Promise<void> {
  await postJson<AuthFlowState>(`/api/auth/${action}`);
  const flow = document.getElementById('auth-flow');
  if (flow !== null) setTrustedHtml(flow, '<p class="hint">Waiting for GitHub CLI…</p>');
  const timer = window.setInterval(() => {
    void (async () => {
      const state = await getJson<AuthFlowState>('/api/auth/flow');
      if (flow !== null && state.code !== null && state.url !== null) {
        setTrustedHtml(flow, `<p class="hint">Enter <code>${escapeHtml(state.code)}</code> at <a href="${escapeHtml(state.url)}" target="_blank" rel="noreferrer">GitHub device login</a>.</p>`);
      }
      if (state.status === 'complete') {
        window.clearInterval(timer);
        await show(true);
      } else if (state.status === 'failed') {
        window.clearInterval(timer);
        if (flow !== null) setTrustedHtml(flow, `<p class="hint failure">${escapeHtml(state.error ?? 'GitHub sign-in failed.')}</p>`);
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
      routeData().adoptScope(res);
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

async function renderDraftPage(repo: string, draftId: string, refresh = false, force = refresh): Promise<boolean> {
  navigation?.setCurrentRepo(repo);
  if (refresh) setSyncBusy(true);
  const savedTracking = routeData().peek<HandOffSnapshot>('/api/hand-offs');
  const savedDraft = savedTracking?.handOffs.find((candidate) => candidate.id === draftId && candidate.repo.toLowerCase() === repo.toLowerCase());
  if (!refresh && savedDraft !== undefined && isNewMapHandOff(savedDraft)) paintDraft(savedDraft);
  let tracking: HandOffSnapshot;
  try {
    tracking = await readRouteJson<HandOffSnapshot>('/api/hand-offs', true);
  } catch (error) {
    if (savedTracking !== null && savedDraft !== undefined && isNewMapHandOff(savedDraft)) {
      tracking = savedTracking;
      toast(error instanceof Error ? error.message : String(error), 8000);
    } else {
      if (refresh) setSyncBusy(false);
      throw error;
    }
  }
  const handOff = tracking.handOffs.find((candidate) => candidate.id === draftId && candidate.repo.toLowerCase() === repo.toLowerCase());
  if (handOff === undefined || !isNewMapHandOff(handOff)) {
    if (refresh) setSyncBusy(false);
    throw new Error('This planning hand-off could not be found. Start a new map from Home to create another.');
  }
  const draft = handOff as NewMapHandOff;
  let snapshot: MapSnapshot | null = null;

  paintDraft(draft);
  try {
    snapshot = await readRouteJson<MapSnapshot>(`${scopedApiPath(repo, 'snapshot')}${force ? '?refresh=1' : '?check=1'}`, true);
  } catch {
    toast("Couldn't check GitHub for the new map yet. Wayfinder will keep trying.", 8000);
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

  if (draftAutoRefresh === null) {
    draftAutoRefresh = new AutoRefresh({
      refresh: () => renderDraftPage(repo, draftId, true, false),
      isVisible: () => document.visibilityState === 'visible',
      intervalMs: 30_000,
    });
    if (snapshot !== null) draftAutoRefresh.markSuccessfulSnapshot();
    draftAutoRefresh.start();
  }
  if (refresh) setSyncBusy(false);
  return snapshot !== null;
}

/** Paint planning independently of its GitHub discovery check. */
function paintDraft(draft: NewMapHandOff): void {
  remember(draft.repo);
  document.title = `${draft.title ?? 'New map'} - being planned - Wayfinder`;
  const badge = draft.threadId === null || draft.status === 'failed' || draft.status === 'interrupted' ? 'Needs attention' : 'Being planned';
  const recoveryActions = draft.threadId === null
    ? `<div class="draft-recovery-actions"><button type="button" class="ghost" data-copy-draft-prompt>${icon(icons.COPY)}Copy prompt</button></div>`
    : '';
  paint(`<div class="draft-map-page">
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
}

async function renderHome(refresh: boolean): Promise<void> {
  await renderHomeLanding({
    refresh,
    storage: localStorage,
    getJson,
    peekJson: <T>(url: string) => routeData().peek<T>(url),
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
  const saved = routeData().peek<ProgressState>('/api/progress');
  const mount = (state: ProgressState): void => mountProgressPanel(host, state, (patch) => postJson<ProgressSettings>('/api/progress/settings', patch), (message) => toast(message));
  if (saved !== null) mount(saved);
  try {
    const state = await readRouteJson<ProgressState>('/api/progress', true);
    if (!host.isConnected) return;
    mount(state);
  } catch (error) {
    if (saved !== null) return;
    setTrustedHtml(host, `<div class="card progress-panel"><p class="eyebrow">Fog cleared</p><p class="hint failure">${escapeHtml(error instanceof Error ? error.message : String(error))}</p></div>`);
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
      setTrustedHtml(menu, `<li class="repo-menu-note">${escapeHtml(error ?? 'Loading your repositories…')}</li>`);
    } else {
      const query = input.value.trim().toLowerCase();
      matches = repos.filter((repo) => repo.toLowerCase().includes(query)).slice(0, MENU_LIMIT);
      active = Math.min(active, matches.length - 1);
      setTrustedHtml(menu, matches.length === 0
          ? `<li class="repo-menu-note">No repositories match. Press Enter to use it by name.</li>`
          : matches
              .map(
                (repo, index) =>
                  `<li role="option" class="repo-option${index === active ? ' is-active' : ''}" aria-selected="${String(index === active)}" data-repo="${escapeHtml(repo)}">${repoIconHtml(repo, 'sm')}<span>${escapeHtml(repo)}</span></li>`,
              )
              .join(''));
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

/** Whether Auto map is on, per map, so Archived maps can say it is paused. Read once per page. */
let autoMapsOn: Set<string> | null = null;
const autoMapKey = (repo: string, mapNumber: number): string => `${repo.toLowerCase()}#${String(mapNumber)}`;

function loadAutoMaps(): void {
  if (autoMapsOn !== null) return;
  autoMapsOn = new Set();
  void getJson<AutoMapView>('/api/auto-map')
    .then((view) => {
      autoMapsOn = new Set(view.maps.filter((map) => map.enabled).map((map) => autoMapKey(map.repo, map.mapNumber)));
      repositoryPage?.refresh();
    })
    .catch(() => undefined);
}

function repositoryViewOf(search: string): RepositoryView {
  return new URLSearchParams(search).get('view') === 'archived' ? 'archived' : 'active';
}

function mountRepository(repo: string): RepositoryPage {
  const endpoint = scopedApiPath(repo, 'snapshot');
  return mountRepositoryPage(
    {
      root: els.main,
      repo,
      paint: (html) => paint(html, 'repository-sheet'),
      saveArchive: (mapNumber, archived) => postJson<MapSnapshot>(scopedApiPath(repo, 'settle'), { map: mapNumber, settled: archived }),
      readMap: (mapNumber) => getJson<MapSnapshot>(`${endpoint}?map=${String(mapNumber)}`),
      toast: (message, action) => toast(message, action ?? 4200),
      adopted: (snapshot) => navigation?.setSnapshot(snapshot, null),
      viewChanged: (view, href) => {
        if (`${window.location.pathname}${window.location.search}` !== href) window.history.pushState(null, '', href);
        document.title = `${view === 'archived' ? 'Archived maps · ' : ''}${repo} · Wayfinder`;
        navigation?.setRepositoryView(view);
      },
      drawn: () => bindPublicMaps(repo),
      handOffs: () => handOffSurface.getRecords(),
      autoMap: (mapNumber) => autoMapsOn?.has(autoMapKey(repo, mapNumber)) ?? false,
      login: () => cachedAccount?.login ?? null,
      stacked: () => window.matchMedia('(max-width: 820px)').matches,
    },
    repositoryViewOf(window.location.search),
  );
}

async function renderRepository(repo: string, refresh: boolean): Promise<void> {
  const view = repositoryViewOf(window.location.search);
  document.title = `${view === 'archived' ? 'Archived maps · ' : ''}${repo} · Wayfinder`;
  remember(repo);
  void syncAccountMark().then(() => repositoryPage?.refresh());
  loadAutoMaps();
  repositoryPage ??= mountRepository(repo);
  const endpoint = scopedApiPath(repo, 'snapshot');
  const cached = routeData().peek<MapSnapshot>(endpoint);
  if (!refresh && cached !== null && repositoryPage.snapshot() === null) repositoryPage.show(cached);
  const snapshot = await readRouteJson<MapSnapshot>(`${endpoint}${refresh ? '?refresh=1' : cached === null ? '' : '?check=1'}`, true);
  const fetched = Date.parse(snapshot.fetchedAt);
  setSynced(Number.isNaN(fetched) ? '' : syncedLabel(Date.now() - fetched));
  notificationInbox.reconcileSnapshot(snapshot);
  repositoryPage.show(snapshot);
}

/** Follow and Unfollow in the Public maps list. The page is redrawn from the snapshot the server sends back. */
function bindPublicMaps(repo: string): void {
  const section = els.main.querySelector<HTMLElement>('[data-repo-public]');
  section?.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-follow-map], [data-unfollow-map]');
    if (button === null) return;
    const followed = button.dataset['followMap'] !== undefined;
    const mapNumber = Number(followed ? button.dataset['followMap'] : button.dataset['unfollowMap']);
    if (!Number.isSafeInteger(mapNumber)) return;
    const title = repositoryPage?.snapshot()?.publicMaps.find((map) => map.number === mapNumber)?.title ?? '';
    button.disabled = true;
    void postJson<MapSnapshot>(scopedApiPath(repo, 'follow'), { map: mapNumber, followed })
      .then((next) => {
        repositoryPage?.show(next);
        // The list was redrawn, so put focus back on the same map's new button.
        els.main.querySelector<HTMLElement>(`[data-public-map="${String(mapNumber)}"] button`)?.focus();
        toast(followed ? `Following #${String(mapNumber)} ${title}. It is on your maps now.` : `Unfollowed #${String(mapNumber)} ${title}.`);
      })
      .catch((error: unknown) => {
        button.disabled = false;
        toast((error as Error).message || 'Could not change this follow.', 8000);
      });
  });
}

async function renderNewMap(): Promise<void> {
  document.title = 'Start a new map · Wayfinder';
  setSynced('');
  void syncAccountMark();
  const repositoryQuery = new URLSearchParams(window.location.search).get('repo');
  const initialRepo = initialRepository(repositoryQuery);
  navigation?.setCurrentRepo(initialRepo || null);
  const homeState = routeData().peek<HomeState>('/api/home');
  const catalogState = currentCatalog();
  const ready = Promise.allSettled([getJson<HomeState>('/api/home'), loadCatalog()]).then(([home, models]) => ({
    homeState: home.status === 'fulfilled' ? home.value : homeState,
    catalog: models.status === 'fulfilled' && models.value.status === 'ready' ? models.value.catalog : null,
    t3Unavailable: models.status === 'fulfilled' && models.value.status === 'unavailable' ? models.value.reason : null,
  }));
  await renderNewMapPage(
    {
      main: els.main,
      homeState,
      ready,
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
  repositoryView: page.kind === 'repository' ? repositoryViewOf(window.location.search) : 'active',
  // The sidebar's way into Archived maps, and back, switches this page's list without a reload.
  onNavigate: (href) => {
    if (page.kind !== 'repository' || repositoryPage === null) return false;
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname !== repoPath(page.repo)) return false;
    repositoryPage.go(repositoryViewOf(url.search));
    return true;
  },
});
window.addEventListener('popstate', () => {
  if (page.kind !== 'repository' || repositoryPage === null) return;
  const view = repositoryViewOf(window.location.search);
  repositoryPage.setView(view);
  document.title = `${view === 'archived' ? 'Archived maps · ' : ''}${page.repo} · Wayfinder`;
  navigation?.setRepositoryView(view);
});

async function run(work: () => Promise<unknown> | unknown): Promise<void> {
  try {
    await work();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (page.kind === 'repository' && repositoryPage?.snapshot() != null) {
      // A failed refresh leaves the last successful view usable, and says it is older.
      repositoryPage.markStale();
      return;
    } else if (page.kind === 'repository') {
      paint(repositoryLoadErrorHtml(message), 'repository-sheet');
    } else {
      paint('<div class="empty" role="alert"><strong>Wayfinder could not load this page</strong><p>' + escapeHtml(message) + '</p><button type="button" class="ghost" data-retry-page>Try again</button></div>');
    }
    toast(message, 10000);
  }
}

async function show(refresh = false): Promise<void> {
  if (refresh) setSyncBusy(true);
  else if (page.kind === 'repository') {
    if (repositoryPage?.snapshot() == null) paint(repositoryLoadingHtml(page.repo, repositoryViewOf(window.location.search)), 'repository-sheet');
  } else if (page.kind === 'home') paint(homeLoadingMarkup(readHomeShape(localStorage)));
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
bindUpdater(need('updater'), toast);
void syncServerSettings();
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
// First launch: the product tour's welcome dialog, until it has been answered (#240).
if (page.kind === 'home') offerTourOnFirstLaunch(mountTour({ toast, app: need('app') }));
