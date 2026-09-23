import type { HomeState } from '../home.js';
import type { AuthFlowState } from '../authFlow.js';
import type { HandOffStatusDto } from '../handOffTracking.js';
import { draftMapPath, mapPath, normalizeRepo, parseRepoPagePath, prototypesPath, repoPath, scopedApiPath } from '../repoRoutes.js';
import type { MapSnapshot, Prototype, Ticket, TicketState, TicketType, WayfinderMap } from '../types.js';
import { STATE_LOOKS, STATE_ORDER, STATE_STYLE, bindTheme, bindUpdater, countStates, paintIcons, progressRing, renderAccountMarkContent, repoIconHtml, updateAccountMark } from './chrome.js';
import type { AccountMark, AccountProfile } from './chrome.js';
import * as icons from './icons.js';
import { loadCatalog, TIER_LABEL } from './models.js';
import { syncedLabel } from './focus.js';
import { icon } from './icons.js';
import { escapeHtml, renderMarkdown } from './markdown.js';
import { fitPrototypeThumbs, prototypeTileHtml } from './prototypeTile.js';
import type { TileText } from './prototypeTile.js';
import { AutoRefresh } from './autoRefresh.js';
import { draftToMapPath, isNewMapHandOff, newMapPath, rememberNewMapRetry } from './newMap.js';
import type { NewMapHandOff } from './newMap.js';
import { renderNewMapPage } from './newMapPage.js';
import { mountProgressPanel } from './progress.js';
import type { ProgressSettings, ProgressState } from '../progress.js';

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
  let status: string;
  if (draft.pendingApproval) status = 'T3 Code is waiting for approval in the planning thread.';
  else if (draft.pendingUserInput) status = 'T3 Code is waiting for your input in the planning thread.';
  else {
    switch (draft.status) {
      case 'starting':
        status = 'T3 Code is starting the planning thread.';
        break;
      case 'running':
        status = 'T3 Code is planning. Tickets will appear here as they are drafted.';
        break;
      case 'waiting':
        status = 'T3 Code is waiting for input in the planning thread.';
        break;
      case 'ready':
        status = 'T3 Code is ready for the next planning step.';
        break;
      case 'finished':
        status = 'T3 Code finished a planning turn. This map is still waiting for its issue.';
        break;
      case 'interrupted':
        status = 'The planning thread was interrupted.';
        break;
      case 'failed':
        status = 'The planning thread ran into an error.';
        break;
      case 'untracked':
        status = 'T3 Code started the thread; its current status is unavailable.';
        break;
    }
  }
  return draft.stale ? `T3 Code is unavailable. Showing the last reported status: ${status}` : status;
}

function draftOutcomeHtml(draft: NewMapHandOff): string {
  if (draft.status !== 'finished') return '';
  const repository = `<span><span class="draft-outcome-label">Repository</span><b>${escapeHtml(draft.repo)}</b></span>`;
  const tier = draft.tier === undefined
    ? ''
    : `<span><span class="draft-outcome-label">Model tier</span><b>${TIER_LABEL[draft.tier]}</b></span>`;
  const thread = draft.threadId === null
    ? ''
    : `<span><span class="draft-outcome-label">Thread</span><code>${escapeHtml(draft.threadId)}</code></span>`;
  const branch = draft.branch === null
    ? ''
    : (() => {
        const [owner = '', name = ''] = draft.repo.split('/', 2);
        const path = draft.branch.split('/').map(encodeURIComponent).join('/');
        return `<span><span class="draft-outcome-label">Branch</span><a href="https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/tree/${path}" target="_blank" rel="noreferrer">${escapeHtml(draft.branch)}</a></span>`;
      })();
  const pullRequests = draft.pullRequests.length === 0
    ? ''
    : `<span><span class="draft-outcome-label">Pull requests</span><span class="draft-outcome-links">${draft.pullRequests
        .map((pullRequest) => `<a href="${escapeHtml(pullRequest.url)}" target="_blank" rel="noreferrer">${pullRequest.number === null ? 'Open pull request' : `#${String(pullRequest.number)}`}</a>`)
        .join('')}</span></span>`;
  return `<div class="draft-handoff-outcome">${repository}${tier}${thread}${branch}${pullRequests}<a class="ghost" href="/">Back to Home</a></div>`;
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
  const canRecover = draft.threadId === null || draft.status === 'failed' || draft.status === 'interrupted';
  const recoveryActions = canRecover
    ? `<div class="draft-recovery-actions"><button type="button" class="ghost" data-retry-draft>${icon(icons.REFRESH)}Try again</button><button type="button" class="ghost" data-copy-draft-prompt>${icon(icons.COPY)}Copy prompt</button></div>`
    : '';
  const active = draft.status === 'starting' || draft.status === 'running';
  const handOffIcon = active ? '<span class="draft-handoff-spinner" aria-hidden="true"></span>' : icon(draft.status === 'finished' ? icons.CHECK : icons.PLAY);
  paint(`<div class="draft-map-page">
      ${snapshotWarning}
      <header class="draft-map-head">
        <span class="badge draft-map-badge">${badge}</span>
        <h1>${escapeHtml(draft.title ?? 'New map')}</h1>
        <p>${escapeHtml(draft.repo)}</p>
      </header>
      <section class="draft-handoff" aria-label="T3 Code hand-off">
        <span class="draft-handoff-mark${active ? ' is-active' : ''}" aria-hidden="true">${handOffIcon}</span>
        <p class="grow" role="status" aria-live="polite" aria-atomic="true">${escapeHtml(draftStatusLine(draft))}</p>
        ${openThread}
        ${draftOutcomeHtml(draft)}
        ${recoveryActions}
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
  els.main.querySelector<HTMLButtonElement>('[data-retry-draft]')?.addEventListener('click', () => {
    try {
      rememberNewMapRetry(draft.repo, draft.title ?? '');
      window.location.assign(newMapPath(draft.repo));
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save the draft for retry.', 9000);
    }
  });
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
    <div class="home-cols"><div class="home-main">
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
    </div><div class="home-side" id="progress-host"></div></div>
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
  void renderProgress(need('progress-host'));
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
  await syncAccountMark();

  let homeState: HomeState | null = null;
  try {
    homeState = await getJson<HomeState>('/api/home');
  } catch {
    // The composer can still use recent repositories if GitHub is unavailable.
  }

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
      toast,
    },
    new URLSearchParams(window.location.search).get('repo'),
  );
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
