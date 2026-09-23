import type { HomeState } from '../home.js';
import type { AuthFlowState } from '../authFlow.js';
import type { HandOffStatusDto } from '../handOffTracking.js';
import { draftMapPath, mapPath, normalizeRepo, parseRepoPagePath, prototypesPath, repoPath, scopedApiPath } from '../repoRoutes.js';
import type { MapSnapshot, Prototype, Ticket, TicketState, TicketType, WayfinderMap } from '../types.js';
import { STATE_LOOKS, STATE_ORDER, STATE_STYLE, bindTheme, bindUpdater, countStates, paintIcons, progressRing, renderAccountMarkContent, repoIconHtml, updateAccountMark } from './chrome.js';
import type { AccountMark, AccountProfile } from './chrome.js';
import * as icons from './icons.js';
import { currentCatalog, loadCatalog, modelSelectHtml, readChoice, tierDefaults } from './models.js';
import { syncedLabel } from './focus.js';
import { icon } from './icons.js';
import { escapeHtml, renderMarkdown } from './markdown.js';
import { fitPrototypeThumbs, prototypeTileHtml } from './prototypeTile.js';
import type { TileText } from './prototypeTile.js';
import { AutoRefresh } from './autoRefresh.js';
import { composerState, draftToMapPath, initialRepository, isNewMapHandOff, newMapPath } from './newMap.js';
import type { NewMapHandOff } from './newMap.js';
import type { WorkspaceView } from './newMap.js';

const RECENT_KEY = 'wayfinder-map:recent-repositories';

function need<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Missing #${id}`);
  return element as T;
}

const els = {
  main: need('main'),
  crumbs: need('crumbs'),
  accountMark: need('account-mark'),
  synced: need('synced'),
  toast: need('toast'),
  updater: need('updater'),
  navNew: need('nav-new'),
};

function setSynced(text: string): void {
  const label = els.synced.querySelector<HTMLElement>('.synced-label') ?? els.synced;
  label.textContent = text;
  els.synced.hidden = !text;
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
function paint(html: string): void {
  els.main.innerHTML = `<div class="sheet">${html}</div>`;
  paintIcons(els.main);
}

function crumbs(trail: readonly string[]): void {
  const parts = [
    '<a href="/">Home</a>',
    ...trail.map((part, index) => {
      const isRepo = index === 0 && trail.length > 0 && part.includes('/');
      return isRepo
        ? `<span class="is-repo">${repoIconHtml(part, 'sm')}<span>${escapeHtml(part)}</span></span>`
        : `<span class="is-repo">${escapeHtml(part)}</span>`;
    }),
  ];
  els.crumbs.innerHTML = parts.join('<span class="crumb-sep">/</span>');
}

function recentRepositories(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((repo): repo is string => typeof repo === 'string' && normalizeRepo(repo) !== null).slice(0, 8) : [];
  } catch {
    return [];
  }
}

function remember(repo: string): void {
  localStorage.setItem(RECENT_KEY, JSON.stringify([repo, ...recentRepositories().filter((candidate) => candidate !== repo)].slice(0, 8)));
  localStorage.setItem('wayfinder-map:last-route', window.location.pathname);
}

function repositoryLink(repo: string): string {
  return `<a class="card repo-card" href="${repoPath(repo)}">${repoIconHtml(repo)}<span class="grow">${escapeHtml(repo)}</span><span class="go" data-icon="arrow"></span></a>`;
}

/* ---------- GitHub account ---------- */

function accountPanel(state: HomeState): string {
  const account = state.account;
  if (account.status === 'ready') {
    const sso =
      state.skippedOrganizations.length > 0
        ? `<div class="panel is-warning is-block"><strong>SSO is hiding some results</strong><p>GitHub skipped ${escapeHtml(state.skippedOrganizations.join(', '))}. Authorize those organizations on GitHub, then refresh.</p></div>`
        : '';
    const environmentToken = /GH_TOKEN|GITHUB_TOKEN/i.test(account.tokenSource ?? '');
    const switcher =
      account.accounts.length > 1 && !environmentToken
        ? `<select class="select" id="account-switch" aria-label="GitHub account">${account.accounts
            .map((login) => `<option${login === account.login ? ' selected' : ''}>${escapeHtml(login)}</option>`)
            .join('')}</select>`
        : '';
    return `<div class="panel">
      <span class="avatar">${renderAccountMarkContent(account)}</span>
      <span class="grow"><strong>${escapeHtml(account.login ?? '')}</strong><p>${escapeHtml(account.host)}${environmentToken ? ' · token from the environment' : ''}</p></span>
      ${switcher}
      <button type="button" class="ghost" id="stop-server"><span data-icon="sign-out"></span>Stop server</button>
    </div>${sso}`;
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

async function syncAccountMark(): Promise<AccountMark | null> {
  if (cachedAccount) {
    updateAccountMark(els.accountMark, cachedAccount);
    return cachedAccount;
  }
  try {
    const res = await fetch('/api/auth/status');
    if (res.ok) {
      cachedAccount = (await res.json()) as AccountProfile;
      updateAccountMark(els.accountMark, cachedAccount);
      return cachedAccount;
    }
  } catch {
    // ignore
  }
  updateAccountMark(els.accountMark, null);
  return null;
}

interface HandOffSnapshot {
  handOffs: HandOffStatusDto[];
  t3: { available: boolean; checkedAt: string | null };
}

/** Include tracked new-map starts on Home until their map issue appears. */
async function homeDrafts(): Promise<NewMapHandOff[]> {
  let records: HandOffStatusDto[];
  try {
    ({ handOffs: records } = await getJson<HandOffSnapshot>('/api/hand-offs'));
  } catch {
    return [];
  }
  const drafts = records.filter(isNewMapHandOff);
  const repos = Array.from(new Set(drafts.map((draft) => draft.repo)));
  const snapshots = new Map<string, MapSnapshot | null>();
  await Promise.all(
    repos.map(async (repo) => {
      try {
        snapshots.set(repo, await getJson<MapSnapshot>(`${scopedApiPath(repo, 'snapshot')}?refresh=1`));
      } catch {
        snapshots.set(repo, null);
      }
    }),
  );
  return drafts.filter((draft) => {
    const snapshot = snapshots.get(draft.repo);
    return snapshot === null || snapshot === undefined || draftToMapPath(draft.repo, draft, snapshot.maps) === null;
  });
}

function draftMapCard(draft: NewMapHandOff): string {
  let path: string;
  try {
    path = draftMapPath(draft.repo, draft.id);
  } catch {
    return '';
  }
  return `<a class="card draft-map-card" href="${path}">
    <div><p class="eyebrow">Map - Being planned</p><h2>${escapeHtml(draft.title ?? '')}</h2></div>
    <p class="dest">${escapeHtml(draft.repo)}</p>
    <span class="draft-map-status">${escapeHtml(draftStatusLine(draft))}</span>
  </a>`;
}

function draftStatusLine(draft: NewMapHandOff): string {
  if (draft.threadId === null) return 'No T3 Code thread was started. The hand-off needs attention.';
  switch (draft.status) {
    case 'starting':
      return 'T3 Code is starting the planning thread.';
    case 'running':
      return 'T3 Code is planning. Tickets will appear here as they are drafted.';
    case 'waiting':
      return 'T3 Code is waiting for input in the planning thread.';
    case 'ready':
      return 'T3 Code is ready for the next planning step.';
    case 'finished':
      return 'T3 Code finished a planning turn. This map is still waiting for its issue.';
    case 'interrupted':
      return 'The planning thread was interrupted.';
    case 'failed':
      return 'The planning thread ran into an error.';
    case 'untracked':
      return 'T3 Code started the thread; its current status is unavailable.';
  }
}

let draftAutoRefresh: AutoRefresh | null = null;

async function renderDraftPage(repo: string, draftId: string, refresh = false): Promise<boolean> {
  if (refresh) els.synced.classList.add('is-busy');
  let tracking: HandOffSnapshot;
  try {
    tracking = await getJson<HandOffSnapshot>('/api/hand-offs');
  } catch (error) {
    if (refresh) els.synced.classList.remove('is-busy');
    throw error;
  }
  const handOff = tracking.handOffs.find((candidate) => candidate.id === draftId && candidate.repo.toLowerCase() === repo.toLowerCase());
  if (handOff === undefined || !isNewMapHandOff(handOff)) {
    if (refresh) els.synced.classList.remove('is-busy');
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
    const target = draftToMapPath(repo, draft, snapshot.maps);
    if (target !== null) {
      window.location.replace(target);
      if (refresh) els.synced.classList.remove('is-busy');
      return true;
    }
    const fetched = Date.parse(snapshot.fetchedAt);
    setSynced(Number.isNaN(fetched) ? '' : syncedLabel(Date.now() - fetched));
  }

  remember(repo);
  crumbs([repo, draft.title ?? 'New map']);
  document.title = `${draft.title ?? 'New map'} - being planned - Wayfinder`;
  const badge = draft.threadId === null || draft.status === 'failed' || draft.status === 'interrupted' ? 'Needs attention' : 'Being planned';
  const openThread = draft.threadId === null ? '' : `<button type="button" class="ghost" data-open-handoff="${escapeHtml(draft.id)}"><span data-icon="play"></span>Open in T3 Code</button>`;
  paint(`<div class="draft-map-page">
      ${snapshotWarning}
      <header class="draft-map-head">
        <span class="badge draft-map-badge">${badge}</span>
        <h1>${escapeHtml(draft.title ?? 'New map')}</h1>
        <p>${escapeHtml(draft.repo)}</p>
      </header>
      <section class="draft-handoff" aria-label="T3 Code hand-off">
        <span class="draft-handoff-mark" aria-hidden="true">${icon(icons.PLAY)}</span>
        <p class="grow" role="status" aria-live="polite" aria-atomic="true">${escapeHtml(draftStatusLine(draft))}</p>
        ${openThread}
      </section>
      <section class="draft-map-board" aria-label="Map tickets being drafted">
        <p>Tickets appear here as T3 Code drafts them.</p>
        <div class="draft-map-ghosts" aria-hidden="true"><span></span><span></span><span></span></div>
      </section>
    </div>`);
  els.main.querySelector<HTMLButtonElement>('[data-open-handoff]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement)) return;
    button.disabled = true;
    try {
      await postJson('/api/hand-offs/focus', { id: draft.id });
      toast('Brought T3 Code forward.');
    } catch (error) {
      toast((error as Error).message, 9000);
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
  if (refresh) els.synced.classList.remove('is-busy');
  return snapshot !== null;
}

async function renderHome(refresh: boolean): Promise<void> {
  crumbs([]);
  const [state, drafts] = await Promise.all([
    getJson<HomeState>(`/api/home${refresh ? '?refresh=1' : ''}`),
    homeDrafts(),
  ]);
  cachedAccount = state.account;
  updateAccountMark(els.accountMark, state.account);
  setSynced(syncedLabel(0));
  const recent = recentRepositories();
  const discovered = state.repositories.filter((repo) => !recent.includes(repo));
  const warning =
    state.warning === null
      ? ''
      : `<div class="panel is-warning"><span class="grow">${escapeHtml(state.warning)}</span><button type="button" class="ghost" data-refresh-home>Retry</button></div>`;

  paint(`<div class="page-head">
      <div class="grow">
        <p class="eyebrow">Wayfinder</p>
        <h1>Where do you want to go?</h1>
        <p>Pick a repository, then open one of its maps.</p>
      </div>
    </div>
    ${accountPanel(state)}${warning}
    ${drafts.length === 0 ? '' : `<section class="section"><div class="section-head"><h2>Being planned</h2></div><div class="map-grid">${drafts.map(draftMapCard).join('')}</div></section>`}
    <form class="field" id="repo-entry">
      <label for="repo-name">Open a repository</label>
      <div class="row">
        <div class="repo-picker">
          <input class="input" id="repo-name" name="repo" placeholder="Search your repositories or type owner/name" autocomplete="off" spellcheck="false" required role="combobox" aria-expanded="false" aria-controls="repo-menu" aria-autocomplete="list" />
          <ul class="repo-menu" id="repo-menu" role="listbox" hidden></ul>
        </div>
        <button class="primary" type="submit">Open</button>
      </div>
      <p class="hint">Typing the name always works, even when a repository isn't listed.</p>
    </form>
    ${
      recent.length === 0
        ? ''
        : `<section class="section"><div class="section-head"><h2>Recent</h2></div><div class="repo-grid">${recent.map(repositoryLink).join('')}</div></section>`
    }
    <section class="section">
      <div class="section-head"><h2>Discovered</h2><span class="grow"></span><button type="button" class="ghost" data-refresh-home><span data-icon="refresh"></span>Refresh</button></div>
      ${
        discovered.length === 0
          ? '<div class="empty"><strong>No discovered repositories with maps</strong><p>Type an owner/name above to open one directly.</p></div>'
          : `<div class="repo-grid">${discovered.map(repositoryLink).join('')}</div>`
      }
    </section>
    <footer class="version">Wayfinder v${escapeHtml(state.version)}</footer>`);

  const form = need<HTMLFormElement>('repo-entry');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const repo = normalizeRepo(String(new FormData(form).get('repo') ?? ''));
    if (repo === null) {
      const input = need<HTMLInputElement>('repo-name');
      input.setCustomValidity('Use owner/name.');
      input.reportValidity();
      input.setCustomValidity('');
      return;
    }
    window.location.assign(repoPath(repo));
  });
  bindRepoPicker(need<HTMLInputElement>('repo-name'), need<HTMLUListElement>('repo-menu'));
  document.getElementById('account-switch')?.addEventListener('change', (event) => {
    const select = event.currentTarget as HTMLSelectElement;
    void run(async () => {
      await postJson('/api/auth/switch', { login: select.value });
      await show(true);
    });
  });
  document.getElementById('stop-server')?.addEventListener('click', () => {
    void postJson('/api/shutdown').then(() => {
      crumbs([]);
      paint('<div class="empty"><strong>Wayfinder stopped</strong><p>Your GitHub CLI account is still signed in.</p></div>');
    });
  });
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

/** A map's progress, drawn exactly as the map page's brief draws it. */
function mapSummary(map: WayfinderMap): string {
  const counts = countStates(map);
  const total = map.tickets.length;
  const rows = STATE_ORDER.filter((state) => counts[state] > 0)
    .map(
      (state) =>
        `<span class="srow" style="--accent: var(${STATE_STYLE[state].variable})">${icon(STATE_STYLE[state].icon)}${escapeHtml(
          STATE_STYLE[state].long,
        )}<b>${String(counts[state])}</b></span>`,
    )
    .join('');
  return `<div class="summary">
    <div class="ring">${progressRing(counts, total)}<div class="lbl"><b>${String(counts.done)}/${String(total)}</b><span>done</span></div></div>
    <div class="status-rows">${rows || '<span class="hint">This map has no tickets yet.</span>'}</div>
  </div>`;
}

function mapCard(repo: string, map: WayfinderMap): string {
  const destination = map.sections.destination || 'No destination has been written yet.';
  return `<a class="card map-card" href="${mapPath(repo, map.number)}">
    <div>
      <p class="eyebrow">Map · #${String(map.number)}${map.open ? '' : ' · completed'}</p>
      <h2>${escapeHtml(map.title)}</h2>
    </div>
    <p class="dest">${escapeHtml(destination)}</p>
    ${mapSummary(map)}
    <span class="proto-badge" data-proto-badge="${String(map.number)}" hidden></span>
  </a>`;
}

/* ---------- prototypes ---------- */

function prototypeCount(total: number): string {
  return `${String(total)} prototype${total === 1 ? '' : 's'}`;
}

/**
 * Prototypes cost their own GitHub reads, so the page paints first and the badges arrive
 * after. A map with none keeps its badge hidden rather than saying zero.
 */
async function paintPrototypeBadges(repo: string, refresh: boolean): Promise<void> {
  let list: Prototype[];
  try {
    list = await getJson<Prototype[]>(`${scopedApiPath(repo, 'prototypes')}${refresh ? '?refresh=1' : ''}`);
  } catch {
    return;
  }
  const byMap = new Map<number, number>();
  for (const prototype of list) byMap.set(prototype.mapNumber, (byMap.get(prototype.mapNumber) ?? 0) + 1);

  for (const badge of els.main.querySelectorAll<HTMLElement>('[data-proto-badge]')) {
    const total = byMap.get(Number(badge.dataset['protoBadge'])) ?? 0;
    if (total === 0) continue;
    badge.innerHTML = `<span data-icon="beaker"></span>${escapeHtml(prototypeCount(total))}`;
    badge.hidden = false;
  }
  const link = document.getElementById('proto-link');
  if (link !== null && list.length > 0) {
    link.innerHTML = `<span data-icon="beaker"></span>${escapeHtml(prototypeCount(list.length))}`;
    link.hidden = false;
  }
  paintIcons(els.main);
}

/** The words under a tile on the repository page: which map it answered, and its ticket. */
function tileText(repo: string, prototype: Prototype, snapshot: MapSnapshot): TileText {
  const map = snapshot.maps.find((candidate) => candidate.number === prototype.mapNumber);
  const ticket = map?.tickets.find((candidate) => candidate.number === prototype.ticketNumber);
  return {
    eyebrow: `#${String(prototype.ticketNumber)} · ${map?.title ?? `map #${String(prototype.mapNumber)}`}`,
    title: ticket?.title ?? prototype.branch,
    links: `<a href="${mapPath(repo, prototype.mapNumber)}?view=prototypes">On the map</a>${
      ticket === undefined ? '' : `<a href="${escapeHtml(ticket.url)}" target="_blank" rel="noreferrer">Ticket ↗</a>`
    }`,
  };
}

async function renderPrototypes(repo: string, refresh: boolean): Promise<void> {
  remember(repo);
  crumbs([repo, 'Prototypes']);
  void syncAccountMark();
  const snapshot = await getJson<MapSnapshot>(scopedApiPath(repo, 'snapshot'));
  const list = await getJson<Prototype[]>(`${scopedApiPath(repo, 'prototypes')}${refresh ? '?refresh=1' : ''}`);
  setSynced(syncedLabel(0));

  paint(`<div class="page-head">
      <div class="grow">
        <p class="eyebrow">Prototypes</p>
        <div class="page-title-row">
          ${repoIconHtml(repo, 'lg')}
          <h1>${escapeHtml(repo)}</h1>
        </div>
        <p>Every prototype this repository's maps have produced, newest first. Click one to open it.</p>
      </div>
      <div class="page-actions">
        <a class="ghost" href="${repoPath(repo)}"><span data-icon="arrow"></span>Maps</a>
      </div>
    </div>
    ${
      list.length === 0
        ? '<div class="empty"><strong>No prototypes yet</strong><p>A prototype ticket keeps its prototype on a <code>prototype/&lt;ticket&gt;-&lt;slug&gt;</code> branch, and it shows up here once pushed.</p></div>'
        : `<div class="proto-grid">${list.map((prototype) => prototypeTileHtml(repo, prototype, tileText(repo, prototype, snapshot))).join('')}</div>`
    }`);
  fitPrototypeThumbs(els.main);
}

async function renderRepository(repo: string, refresh: boolean): Promise<void> {
  remember(repo);
  crumbs([repo]);
  void syncAccountMark();
  const snapshot = await getJson<MapSnapshot>(`${scopedApiPath(repo, 'snapshot')}${refresh ? '?refresh=1' : ''}`);
  const fetched = Date.parse(snapshot.fetchedAt);
  setSynced(Number.isNaN(fetched) ? '' : syncedLabel(Date.now() - fetched));
  const warnings = snapshot.warnings
    .map((warning) => `<div class="panel is-warning"><span class="grow">${escapeHtml(warning)}</span></div>`)
    .join('');

  paint(`<div class="page-head">
      <div class="grow">
        <p class="eyebrow">Repository</p>
        <div class="page-title-row">
          ${repoIconHtml(repo, 'lg')}
          <h1>${escapeHtml(repo)}</h1>
        </div>
      </div>
      <div class="page-actions">
        <span class="badge">${String(snapshot.maps.length)} map${snapshot.maps.length === 1 ? '' : 's'}</span>
        <a class="ghost" id="proto-link" href="${prototypesPath(repo)}" hidden></a>
        <a class="ghost" href="https://github.com/${escapeHtml(repo)}" target="_blank" rel="noreferrer"><span data-icon="external"></span>GitHub</a>
      </div>
    </div>
    ${warnings}
    ${
      snapshot.maps.length === 0
        ? '<div class="empty"><strong>No Wayfinder maps here yet</strong><p>No issue in this repository carries the configured map label.</p><a class="ghost" href="/">Back to Home</a></div>'
        : `<div class="map-grid">${snapshot.maps.map((map) => mapCard(repo, map)).join('')}</div>`
    }`);

  void paintPrototypeBadges(repo, refresh);
}

const TYPE_ICONS: Record<string, string> = {
  research: icons.LENS,
  prototype: icons.BEAKER,
  grilling: icons.GRILL,
  task: icons.LIST,
};

function typeGlyph(type: TicketType | null): string {
  const iconPath = (type && TYPE_ICONS[type]) || icons.LIST;
  return `<span class="glyph" title="${escapeHtml(type ?? 'task')}">${icon(iconPath)}</span>`;
}

function stateChip(state: TicketState): string {
  const look = STATE_LOOKS[state];
  return `<span class="chip" style="--accent: var(${look.variable})">${icon(look.icon)}${escapeHtml(look.label)}</span>`;
}

async function renderNewMap(): Promise<void> {
  crumbs(['Start a new map']);
  setSynced('');
  const account = await syncAccountMark();

  let homeState: HomeState | null = null;
  try {
    homeState = await getJson<HomeState>('/api/home');
  } catch {
    // ignore
  }

  const recents = recentRepositories();
  const allRepos = Array.from(new Set([...recents, ...(homeState?.repositories ?? [])]));

  const initialRepo = initialRepository(new URLSearchParams(window.location.search).get('repo'), recents, allRepos);

  const catalogState = await loadCatalog();
  const catalog = catalogState.status === 'ready' ? catalogState.catalog : null;
  const t3Unavailable = catalogState.status === 'unavailable' ? catalogState.reason : null;
  const defaultModelChoice = catalog ? tierDefaults()['mid'] ?? null : null;

  const repoOptionsHtml = allRepos.map((r) => `<option value="${escapeHtml(r)}"></option>`).join('');
  const recentPillsHtml = recents
    .slice(0, 4)
    .map((r) => `<button type="button" class="repo-pill" data-repo="${escapeHtml(r)}">${repoIconHtml(r, 'sm')}<span>${escapeHtml(r)}</span></button>`)
    .join('');

  const ticketModelSelectHtml = catalog
    ? modelSelectHtml(catalog, defaultModelChoice, 'class="select" id="ticket-model-select"')
    : '<select class="select" id="ticket-model-select" disabled><option>Models unavailable</option></select>';
  const mapModelSelectHtml = catalog
    ? modelSelectHtml(catalog, defaultModelChoice, 'class="select" id="map-model-select"')
    : '<select class="select" id="map-model-select" disabled><option>Models unavailable</option></select>';

  paint(`
    <div class="add-new-shell">
      <div class="page-head">
        <div class="grow">
          <p class="eyebrow">Start New Work</p>
          <h1>Open a singular ticket or start a map</h1>
          <p>Hand off a singular GitHub issue directly to T3 Code, or start a new destination map through an interactive planning interview.</p>
        </div>
      </div>

      <div class="add-new-repo-bar">
        <label for="new-repo-input"><span data-icon="repo"></span> Repository</label>
        <div class="repo-picker">
          <input class="input" id="new-repo-input" placeholder="Search GitHub repositories or type owner/name" value="${escapeHtml(initialRepo)}" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="new-repo-menu" aria-autocomplete="list" />
          <ul class="repo-menu" id="new-repo-menu" role="listbox" hidden></ul>
        </div>
        ${recentPillsHtml ? `<div class="recent-repos-hint"><span>Recent:</span>${recentPillsHtml}</div>` : ''}
      </div>

      <div class="add-new-grid">
        <!-- Column 1: Singular Ticket -->
        <div class="add-new-card" id="card-singular-ticket">
          <div class="add-new-card-head">
            <div class="add-new-icon-box"><span data-icon="ticket"></span></div>
            <div class="add-new-card-titles">
              <p class="eyebrow">Singular Ticket</p>
              <h2>Work on an Issue</h2>
              <p class="card-blurb">Pick up any GitHub ticket in this repo without needing an existing map. T3 Code will create a dedicated branch and worktree.</p>
            </div>
          </div>

          <div class="field">
            <label for="new-ticket-input">Ticket number or issue URL</label>
            <input class="input" id="new-ticket-input" placeholder="#42 or https://github.com/owner/name/issues/42" autocomplete="off" spellcheck="false" />
          </div>

          <div class="ticket-preview-box is-empty" id="ticket-preview-box">
            Enter a ticket number or paste an issue link above to inspect it.
          </div>

          <div class="model-row">
            <label for="ticket-model-select">Model</label>
            <div class="model-row-controls">
              ${ticketModelSelectHtml}
            </div>
          </div>

          <div class="add-new-actions">
            <button type="button" class="primary" id="ticket-start-btn" disabled>
              <span data-icon="play"></span>Start in T3 Code
            </button>
            <button type="button" class="ghost" id="ticket-copy-btn" disabled>
              <span data-icon="copy"></span>Copy prompt
            </button>
          </div>

          <details class="prompt-details" id="ticket-prompt-details" hidden>
            <summary><span data-icon="chevron"></span>View generated prompt</summary>
            <pre class="prompt-pre"><code id="ticket-prompt-code"></code></pre>
          </details>
        </div>

        <!-- Column 2: Wayfinder Map -->
        <div class="add-new-card" id="card-wayfinder-map">
          <div class="add-new-card-head">
            <div class="add-new-icon-box"><span data-icon="compass"></span></div>
            <div class="add-new-card-titles">
              <p class="eyebrow">Wayfinder Map</p>
              <h2>Start a New Map</h2>
              <p class="card-blurb">Describe your destination. T3 Code will interview you, clarify scope and decisions, and propose a full dependency map.</p>
            </div>
          </div>

          <div class="field">
            <label for="new-map-goal">What do you want to accomplish?</label>
            <textarea class="input" id="new-map-goal" rows="5" required placeholder="e.g. Build an offline-first draft mode with local indexedDB storage and automatic background sync..."></textarea>
          </div>

          <div class="model-row">
            <label for="map-model-select">Model</label>
            <div class="model-row-controls">
              ${mapModelSelectHtml}
            </div>
          </div>

          <div class="add-new-actions">
            <button type="button" class="primary" id="map-start-btn" disabled>
              <span data-icon="play"></span>Start in T3 Code
            </button>
            <button type="button" class="ghost" id="map-copy-btn" disabled>
              <span data-icon="copy"></span>Copy prompt
            </button>
          </div>
          <p class="hint clone-hint" id="map-note" role="status" hidden></p>
          <div id="map-clone"></div>

          <details class="prompt-details" id="map-prompt-details" hidden>
            <summary><span data-icon="chevron"></span>View interview prompt</summary>
            <pre class="prompt-pre"><code id="map-prompt-code"></code></pre>
          </details>

          <div class="existing-maps-hint" id="existing-maps-hint" hidden>
            <p>Existing maps in this repository:</p>
            <div id="existing-maps-list"></div>
          </div>
        </div>
      </div>
    </div>
  `);

  const repoInput = need<HTMLInputElement>('new-repo-input');
  const ticketInput = need<HTMLInputElement>('new-ticket-input');
  const ticketPreviewBox = need<HTMLDivElement>('ticket-preview-box');
  const ticketModelSelect = need<HTMLSelectElement>('ticket-model-select');
  const ticketStartBtn = need<HTMLButtonElement>('ticket-start-btn');
  const ticketCopyBtn = need<HTMLButtonElement>('ticket-copy-btn');
  const ticketPromptDetails = need<HTMLDetailsElement>('ticket-prompt-details');
  const ticketPromptCode = need<HTMLElement>('ticket-prompt-code');

  const mapGoal = need<HTMLTextAreaElement>('new-map-goal');
  const mapModelSelect = need<HTMLSelectElement>('map-model-select');
  const mapStartBtn = need<HTMLButtonElement>('map-start-btn');
  const mapCopyBtn = need<HTMLButtonElement>('map-copy-btn');
  const mapPromptDetails = need<HTMLDetailsElement>('map-prompt-details');
  const mapPromptCode = need<HTMLElement>('map-prompt-code');
  const existingMapsHint = need<HTMLDivElement>('existing-maps-hint');
  const existingMapsList = need<HTMLDivElement>('existing-maps-list');
  const mapNote = need<HTMLParagraphElement>('map-note');
  const mapClone = need<HTMLDivElement>('map-clone');

  let activeResolvedTicket: { ticket: Ticket; map: { number: number; title: string } | null } | null = null;
  let activeTicketPrompt: string | null = null;
  let mapWorkspace: WorkspaceView | 'loading' | null = 'loading';
  /** Why the last hand-off fell short of a running thread, until the inputs change. */
  let mapNotice: string | null = null;
  let workspaceAsk = 0;

  function selectedRepo(): string | null {
    return normalizeRepo(repoInput.value.trim());
  }

  /** Enable the actions, say why a hand-off can't start, and offer a clone when none is verified. */
  function syncMapComposer(): void {
    const repo = selectedRepo();
    const state = composerState({ repo, goal: mapGoal.value, workspace: mapWorkspace, t3Unavailable });
    mapStartBtn.disabled = !state.canStart;
    mapCopyBtn.disabled = !state.canCopy;
    const note = mapNotice ?? state.reason;
    mapNote.hidden = note === null;
    mapNote.textContent = note ?? '';

    const workspace = mapWorkspace;
    if (repo === null || workspace === null || workspace === 'loading' || workspace.status === 'ready') {
      mapClone.innerHTML = '';
      return;
    }
    const picker = workspace.canChoose
      ? `<button type="button" class="${workspace.candidates.length === 0 ? 'primary' : 'ghost'}" id="map-choose-clone">${icon(icons.FOLDER)}Choose local clone</button>`
      : '';
    const list =
      workspace.candidates.length === 0
        ? ''
        : `<div class="clone-row">
            <select id="map-clone-path" aria-label="Local clone">${workspace.candidates.map((path) => `<option value="${escapeHtml(path)}">${escapeHtml(path)}</option>`).join('')}</select>
            <button type="button" class="primary" id="map-use-clone">Use this clone</button>
          </div>`;
    const cli = workspace.canChoose || workspace.candidates.length > 0 ? '' : '<p class="hint">Run wayfinder-map inside a clone, or pick a folder in the desktop app.</p>';
    mapClone.innerHTML = `${list}${cli}${picker ? `<div class="add-new-actions">${picker}</div>` : ''}`;
    paintIcons(mapClone);
  }

  /** Ask which checkout T3 Code would run the selected repository in. Only the latest answer counts. */
  async function loadMapWorkspace(): Promise<void> {
    const repo = selectedRepo();
    const ask = (workspaceAsk += 1);
    mapNotice = null;
    mapWorkspace = repo === null ? null : 'loading';
    syncMapComposer();
    if (repo === null) return;
    let answer: WorkspaceView | null;
    try {
      answer = await getJson<WorkspaceView>(scopedApiPath(repo, 'workspace'));
    } catch {
      answer = null;
    }
    if (ask !== workspaceAsk) return;
    mapWorkspace = answer;
    syncMapComposer();
  }

  async function setMapClone(body: { choose: true } | { path: string }): Promise<void> {
    const repo = selectedRepo();
    if (repo === null) return;
    for (const button of mapClone.querySelectorAll<HTMLButtonElement>('button')) button.disabled = true;
    try {
      const response = await fetch(scopedApiPath(repo, 'workspace'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as Partial<WorkspaceView> & { error?: string; cancelled?: boolean };
      if (result.status !== undefined) mapWorkspace = result as WorkspaceView;
      if (typeof result.error === 'string') toast(result.error, 9000);
      else if (result.cancelled !== true && result.status === 'ready') toast(`Threads will run in ${result.path}.`, 5000);
    } catch (error) {
      toast((error as Error).message, 9000);
    }
    syncMapComposer();
  }

  mapClone.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('#map-choose-clone') !== null) void setMapClone({ choose: true });
    if (target.closest('#map-use-clone') !== null) {
      const path = mapClone.querySelector<HTMLSelectElement>('#map-clone-path')?.value;
      if (path) void setMapClone({ path });
    }
  });

  async function loadExistingMaps(repo: string): Promise<void> {
    const normalized = normalizeRepo(repo);
    if (!normalized) {
      existingMapsHint.hidden = true;
      return;
    }
    try {
      const snap = await getJson<MapSnapshot>(scopedApiPath(normalized, 'snapshot'));
      if (snap.maps.length > 0) {
        existingMapsHint.hidden = false;
        existingMapsList.innerHTML = snap.maps
          .map((m) => `<a class="mini-map-pill" href="${mapPath(normalized, m.number)}"><span data-icon="compass"></span>#${String(m.number)} ${escapeHtml(m.title)}</a>`)
          .join('');
        paintIcons(existingMapsList);
      } else {
        existingMapsHint.hidden = true;
      }
    } catch {
      existingMapsHint.hidden = true;
    }
  }

  async function inspectTicket(ticketNum: number): Promise<void> {
    const repo = normalizeRepo(repoInput.value.trim());
    if (!repo) {
      ticketPreviewBox.className = 'ticket-preview-box is-error';
      ticketPreviewBox.textContent = 'Please enter a valid repository (owner/name) above first.';
      activeResolvedTicket = null;
      activeTicketPrompt = null;
      ticketStartBtn.disabled = true;
      ticketCopyBtn.disabled = true;
      ticketPromptDetails.hidden = true;
      return;
    }

    ticketPreviewBox.className = 'ticket-preview-box is-loading';
    ticketPreviewBox.textContent = `Fetching ticket #${String(ticketNum)} from ${repo}...`;

    try {
      const data = await getJson<{ ticket: Ticket; map: { number: number; title: string } | null }>(
        `${scopedApiPath(repo, 'ticket')}?number=${String(ticketNum)}`
      );
      activeResolvedTicket = data;
      const t = data.ticket;
      const metaItems = [
        `<span>${escapeHtml(t.assignee ? `@${t.assignee}` : 'Unassigned')}</span>`,
        `<a href="${escapeHtml(t.url)}" target="_blank" rel="noreferrer"><span data-icon="external"></span>GitHub #${String(t.number)}</a>`,
      ];

      const mapBadge = data.map
        ? `<a class="ticket-map-badge" href="${mapPath(repo, data.map.number)}"><span data-icon="compass"></span>Part of Map #${String(data.map.number)}: ${escapeHtml(data.map.title)}</a>`
        : '';

      ticketPreviewBox.className = 'ticket-preview-box';
      ticketPreviewBox.innerHTML = `
        <div class="ticket-preview-header">
          ${typeGlyph(t.type)}
          <span class="ticket-preview-num">#${String(t.number)}</span>
          ${stateChip(t.state)}
        </div>
        <h3 class="ticket-preview-title">${escapeHtml(t.title)}</h3>
        ${mapBadge}
        <div class="ticket-preview-meta">${metaItems.join('')}</div>
      `;
      paintIcons(ticketPreviewBox);

      // Preload ticket prompt
      const modelChoice = catalog ? readChoice(catalog, ticketModelSelect, null) : null;
      const handOffPreview = await postJson<{ prompt: string }>(
        scopedApiPath(repo, 'hand-off'),
        {
          ticket: t.number,
          copyOnly: true,
          ...(data.map ? { map: data.map.number } : {}),
          ...(modelChoice ? { model: modelChoice } : {}),
        }
      );
      activeTicketPrompt = handOffPreview.prompt;
      ticketPromptCode.textContent = activeTicketPrompt;
      ticketPromptDetails.hidden = false;

      const canStart = t.state !== 'done' && t.state !== 'blocked';
      ticketStartBtn.disabled = !canStart;
      ticketStartBtn.title = canStart ? '' : `Ticket is ${t.state}`;
      ticketCopyBtn.disabled = false;
    } catch (err) {
      activeResolvedTicket = null;
      activeTicketPrompt = null;
      ticketPreviewBox.className = 'ticket-preview-box is-error';
      ticketPreviewBox.textContent = (err as Error).message || `Ticket #${String(ticketNum)} not found in ${repo}.`;
      ticketStartBtn.disabled = true;
      ticketCopyBtn.disabled = true;
      ticketPromptDetails.hidden = true;
    }
  }

  let ticketDebounce = 0;
  function handleTicketInput(): void {
    const trimmed = ticketInput.value.trim();
    if (!trimmed) {
      ticketPreviewBox.className = 'ticket-preview-box is-empty';
      ticketPreviewBox.textContent = 'Enter a ticket number or paste an issue link above to inspect it.';
      ticketStartBtn.disabled = true;
      ticketCopyBtn.disabled = true;
      ticketPromptDetails.hidden = true;
      activeResolvedTicket = null;
      activeTicketPrompt = null;
      return;
    }

    // Match GitHub URL
    const urlMatch = /github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/i.exec(trimmed);
    if (urlMatch && urlMatch[1] && urlMatch[2]) {
      const parsedRepo = normalizeRepo(urlMatch[1]);
      const parsedNum = Number(urlMatch[2]);
      if (parsedRepo) {
        repoInput.value = parsedRepo;
        remember(parsedRepo);
        void loadExistingMaps(parsedRepo);
        void loadMapWorkspace();
      }
      ticketInput.value = `#${String(parsedNum)}`;
      void inspectTicket(parsedNum);
      return;
    }

    const numMatch = /^#?(\d+)$/.exec(trimmed);
    if (numMatch && numMatch[1]) {
      window.clearTimeout(ticketDebounce);
      ticketDebounce = window.setTimeout(() => {
        void inspectTicket(Number(numMatch[1]));
      }, 300);
    }
  }

  ticketInput.addEventListener('input', handleTicketInput);
  ticketInput.addEventListener('paste', () => setTimeout(handleTicketInput, 20));

  function switchRepo(target: string): void {
    const normalized = normalizeRepo(target);
    repoInput.value = normalized ?? target;
    void loadMapWorkspace();
    if (normalized) {
      remember(normalized);
      void loadExistingMaps(normalized);
      const numMatch = /^#?(\d+)$/.exec(ticketInput.value.trim());
      if (numMatch && numMatch[1]) {
        void inspectTicket(Number(numMatch[1]));
      }
    }
  }

  bindRepoPicker(repoInput, need<HTMLUListElement>('new-repo-menu'), switchRepo);

  repoInput.addEventListener('change', () => {
    switchRepo(repoInput.value.trim());
  });

  for (const pill of els.main.querySelectorAll<HTMLButtonElement>('.repo-pill')) {
    pill.addEventListener('click', () => {
      const targetRepo = pill.dataset['repo'];
      if (targetRepo) {
        switchRepo(targetRepo);
      }
    });
  }

  ticketStartBtn.addEventListener('click', async () => {
    if (!activeResolvedTicket) return;
    const repo = normalizeRepo(repoInput.value.trim());
    if (!repo) return;
    const originalText = ticketStartBtn.innerHTML;
    ticketStartBtn.disabled = true;
    ticketStartBtn.textContent = 'Starting in T3 Code...';

    try {
      const modelChoice = catalog ? readChoice(catalog, ticketModelSelect, null) : null;
      const res = await postJson<{ threadId?: string; copied?: boolean }>(
        scopedApiPath(repo, 'hand-off'),
        {
          ticket: activeResolvedTicket.ticket.number,
          ...(activeResolvedTicket.map ? { map: activeResolvedTicket.map.number } : {}),
          ...(modelChoice ? { model: modelChoice } : {}),
        }
      );
      if (res.copied) {
        toast('Copied prompt to clipboard! Paste it into T3 Code.');
      } else {
        toast(`Started thread in T3 Code for #${String(activeResolvedTicket.ticket.number)}!`);
      }
    } catch (err) {
      toast((err as Error).message);
    } finally {
      ticketStartBtn.disabled = false;
      ticketStartBtn.innerHTML = originalText;
      paintIcons(ticketStartBtn);
    }
  });

  ticketCopyBtn.addEventListener('click', async () => {
    if (!activeResolvedTicket) return;
    const repo = normalizeRepo(repoInput.value.trim());
    if (!repo) return;
    try {
      const modelChoice = catalog ? readChoice(catalog, ticketModelSelect, null) : null;
      const res = await postJson<{ prompt: string; copied: boolean }>(
        scopedApiPath(repo, 'hand-off'),
        {
          ticket: activeResolvedTicket.ticket.number,
          copyOnly: true,
          ...(activeResolvedTicket.map ? { map: activeResolvedTicket.map.number } : {}),
          ...(modelChoice ? { model: modelChoice } : {}),
        }
      );
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(res.prompt);
      }
      toast('Copied prompt to clipboard!');
    } catch (err) {
      toast((err as Error).message);
    }
  });

  let mapGoalTimer = 0;
  mapGoal.addEventListener('input', () => {
    mapNotice = null;
    syncMapComposer();
    window.clearTimeout(mapGoalTimer);
    const goal = mapGoal.value.trim();
    const repo = selectedRepo();
    if (goal.length === 0 || repo === null) {
      mapPromptDetails.hidden = true;
      return;
    }
    mapGoalTimer = window.setTimeout(async () => {
      try {
        const { prompt } = await postJson<{ prompt: string }>(scopedApiPath(repo, 'new-map'), { goal, preview: true });
        mapPromptCode.textContent = prompt;
        mapPromptDetails.hidden = false;
      } catch {
        // The preview is a courtesy; the actions still build the prompt themselves.
      }
    }, 350);
  });

  mapStartBtn.addEventListener('click', async () => {
    const goal = mapGoal.value.trim();
    const repo = selectedRepo();
    if (goal.length === 0 || repo === null) return;
    const originalHtml = mapStartBtn.innerHTML;
    mapStartBtn.disabled = true;
    mapStartBtn.textContent = 'Starting in T3 Code…';
    try {
      const modelChoice = catalog ? readChoice(catalog, mapModelSelect, null) : null;
      const result = await postJson<{
        rung: 'thread' | 'app' | 'clipboard' | null;
        copied: boolean;
        notice: string | null;
        error: string | null;
        handOffId: string | null;
        trackingWarning?: string;
      }>(
        scopedApiPath(repo, 'new-map'),
        { goal, ...(modelChoice ? { model: modelChoice } : {}) },
      );
      if (result.handOffId !== null) {
        window.location.assign(draftMapPath(repo, result.handOffId));
        return;
      }
      if (result.rung === 'thread') {
        mapNotice = null;
        toast(result.trackingWarning ?? 'The planning thread started, but Wayfinder could not save its route.');
      } else {
        mapNotice = [result.notice, result.copied ? 'The prompt is on the clipboard.' : result.error].filter(Boolean).join(' ');
        toast(result.copied ? 'Copied the prompt. Paste it into T3 Code.' : (result.error ?? 'Could not start the thread.'), 9000);
      }
    } catch (err) {
      toast((err as Error).message, 9000);
      // The clone may have gone away since the page asked.
      void loadMapWorkspace();
    } finally {
      mapStartBtn.innerHTML = originalHtml;
      paintIcons(mapStartBtn);
      syncMapComposer();
    }
  });

  mapCopyBtn.addEventListener('click', async () => {
    const goal = mapGoal.value.trim();
    const repo = selectedRepo();
    if (goal.length === 0 || repo === null) return;
    try {
      const result = await postJson<{ prompt: string; copied: boolean }>(scopedApiPath(repo, 'new-map'), { goal, copyOnly: true });
      if (!result.copied) await navigator.clipboard.writeText(result.prompt);
      toast('Copied the prompt. Paste it into T3 Code.');
    } catch (err) {
      toast((err as Error).message);
    }
  });

  void loadMapWorkspace();
  if (initialRepo) {
    void loadExistingMaps(initialRepo);
  }
}

/* ---------- routing ---------- */

const route = parseRepoPagePath(window.location.pathname);
const page:
  | { kind: 'home' }
  | { kind: 'repository'; repo: string }
  | { kind: 'prototypes'; repo: string }
  | { kind: 'draft'; repo: string; draftId: string }
  | { kind: 'new-map' } =
  window.location.pathname === '/new-map'
    ? { kind: 'new-map' }
    : route?.draftId !== undefined
      ? { kind: 'draft', repo: route.repo, draftId: route.draftId }
      : route?.prototypes === true
        ? { kind: 'prototypes', repo: route.repo }
        : route?.mapNumber === null
          ? { kind: 'repository', repo: route.repo }
          : { kind: 'home' };

async function run(work: () => Promise<unknown> | unknown): Promise<void> {
  try {
    await work();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    crumbs([]);
    paint(`<div class="empty"><strong>Wayfinder could not load this page</strong><p>${escapeHtml(message)}</p><a class="ghost" href="/">Back to Home</a></div>`);
    toast(message, 10000);
  }
}

async function show(refresh = false): Promise<void> {
  if (refresh) els.synced.classList.add('is-busy');
  else paint('<p class="loading">Reading GitHub…</p>');
  await run(async () => {
    if (page.kind === 'new-map') await renderNewMap();
    else if (page.kind === 'draft') await renderDraftPage(page.repo, page.draftId, refresh);
    else if (page.kind === 'prototypes') await renderPrototypes(page.repo, refresh);
    else if (page.kind === 'repository') await renderRepository(page.repo, refresh);
    else await renderHome(refresh);
  });
  els.synced.classList.remove('is-busy');
}

paintIcons();
bindTheme(need('theme'));
bindUpdater(els.updater, toast);
els.navNew.classList.toggle('is-on', page.kind === 'new-map');
// From a repository's pages, the composer opens on that repository.
const composerHref = newMapPath(page.kind === 'repository' || page.kind === 'prototypes' || page.kind === 'draft' ? page.repo : null);
els.navNew.setAttribute('href', composerHref);
els.synced.addEventListener('click', () => void show(true));
document.addEventListener('visibilitychange', () => draftAutoRefresh?.visibilityChanged());
window.addEventListener('pagehide', () => draftAutoRefresh?.stop());
document.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement | null)?.closest('[data-refresh-home], [data-auth]');
  if (target === null || target === undefined) return;
  if (target.hasAttribute('data-refresh-home')) void show(true);
  else {
    const action = (target as HTMLElement).dataset['auth'];
    if (action === 'login' || action === 'refresh') void beginAuth(action);
  }
});

void show();
