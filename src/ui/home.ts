import type { HomeState } from '../home.js';
import type { AuthFlowState } from '../authFlow.js';
import { mapPath, normalizeRepo, parseRepoPagePath, repoPath, scopedApiPath } from '../repoRoutes.js';
import type { MapSnapshot, TicketState, WayfinderMap } from '../types.js';

const RECENT_KEY = 'wayfinder-map:recent-repositories';

function need<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Missing #${id}`);
  return element as T;
}

const main = need('main');
const crumb = need('crumb');
const accountMark = need('account-mark');

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
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
  return `<a class="repo-card" href="${repoPath(repo)}"><span><strong>${escapeHtml(repo)}</strong><small>Open maps</small></span><b aria-hidden="true">→</b></a>`;
}

function accountPanel(state: HomeState): string {
  const account = state.account;
  if (account.status === 'ready') {
    const sso = state.skippedOrganizations.length > 0
      ? `<div class="notice warning">GitHub skipped SSO-protected results from ${escapeHtml(state.skippedOrganizations.join(', '))}. Authorize those organizations in GitHub, then refresh.</div>`
      : '';
    const environmentToken = /GH_TOKEN|GITHUB_TOKEN/i.test(account.tokenSource ?? '');
    const switcher = account.accounts.length > 1 && !environmentToken
      ? `<label class="account-switch">Account <select id="account-switch">${account.accounts.map((login) => `<option${login === account.login ? ' selected' : ''}>${escapeHtml(login)}</option>`).join('')}</select></label>`
      : '';
    return `<section class="account"><span class="avatar">${escapeHtml(account.login?.slice(0, 1).toUpperCase() ?? '?')}</span><div><strong>${escapeHtml(account.login ?? '')}</strong><small>${escapeHtml(account.host)}${environmentToken ? ' · token from environment' : ''}</small></div>${switcher}<button type="button" id="stop-server">Stop server</button></section>${sso}`;
  }
  const action = account.status === 'missing-gh'
    ? '<a href="https://cli.github.com/" target="_blank" rel="noreferrer">Install or update GitHub CLI</a>'
    : account.status === 'signed-out'
      ? '<button type="button" data-auth="login">Sign in with GitHub</button>'
      : account.status === 'missing-scopes'
        ? '<button type="button" data-auth="refresh">Grant access</button>'
        : '<button type="button" data-refresh-home>Retry</button>';
  return `<div class="notice"><strong>GitHub needs attention</strong><p>${escapeHtml(account.message ?? 'GitHub account information is unavailable.')}</p>${action}<div id="auth-flow"></div></div>`;
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
  if (flow !== null) flow.innerHTML = '<p>Waiting for GitHub CLI…</p>';
  const timer = window.setInterval(() => {
    void (async () => {
      const state = await getJson<AuthFlowState>('/api/auth/flow');
      if (flow !== null && state.code !== null && state.url !== null) {
        flow.innerHTML = `<p>Enter <code>${escapeHtml(state.code)}</code> at <a href="${escapeHtml(state.url)}" target="_blank" rel="noreferrer">GitHub device login</a>.</p>`;
      }
      if (state.status === 'complete') {
        window.clearInterval(timer);
        await renderHome(true);
      } else if (state.status === 'failed') {
        window.clearInterval(timer);
        if (flow !== null) flow.innerHTML = `<p class="failure">${escapeHtml(state.error ?? 'GitHub sign-in failed.')}</p>`;
      }
    })().catch((error: unknown) => {
      window.clearInterval(timer);
      if (flow !== null) flow.textContent = error instanceof Error ? error.message : String(error);
    });
  }, 1000);
}

async function renderHome(refresh = false): Promise<void> {
  crumb.textContent = 'Repositories';
  const state = await getJson<HomeState>(`/api/home${refresh ? '?refresh=1' : ''}`);
  accountMark.textContent = state.account.login?.slice(0, 1).toUpperCase() ?? '!';
  const recent = recentRepositories();
  const discovered = state.repositories.filter((repo) => !recent.includes(repo));
  const warning = state.warning === null ? '' : `<div class="notice warning">${escapeHtml(state.warning)} <button type="button" data-refresh-home>Retry</button></div>`;
  main.innerHTML = `<div class="hero"><p class="eyebrow">WAYFINDER</p><h1>Where do you want to go?</h1><p>Choose a repository, then open one of its maps.</p></div>
    ${accountPanel(state)}${warning}
    <form class="repo-entry" id="repo-entry"><label for="repo-name">Open a repository</label><div><input id="repo-name" name="repo" placeholder="owner/name" autocomplete="off" required /><button class="primary" type="submit">Open</button></div><small>Manual entry is always available when discovery misses a repository.</small></form>
    ${recent.length === 0 ? '' : `<section><div class="section-head"><h2>Recent</h2></div><div class="repo-list">${recent.map(repositoryLink).join('')}</div></section>`}
    <section><div class="section-head"><h2>Browse repositories</h2><button type="button" data-refresh-home>Refresh</button></div>${discovered.length === 0 ? '<div class="empty"><strong>No discovered repositories with maps</strong><p>Enter an owner/name above to open one directly.</p></div>' : `<div class="repo-list">${discovered.map(repositoryLink).join('')}</div>`}</section>`;

  const form = need<HTMLFormElement>('repo-entry');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const repo = normalizeRepo(String(data.get('repo') ?? ''));
    if (repo === null) {
      need<HTMLInputElement>('repo-name').setCustomValidity('Use owner/name.');
      need<HTMLInputElement>('repo-name').reportValidity();
      return;
    }
    window.location.assign(repoPath(repo));
  });
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-refresh-home]')) {
    button.addEventListener('click', () => void show(() => renderHome(true)));
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-auth]')) {
    const action = button.dataset['auth'];
    if (action === 'login' || action === 'refresh') button.addEventListener('click', () => void beginAuth(action));
  }
  document.getElementById('account-switch')?.addEventListener('change', (event) => {
    const select = event.currentTarget as HTMLSelectElement;
    void show(async () => {
      await postJson('/api/auth/switch', { login: select.value });
      await renderHome(true);
    });
  });
  document.getElementById('stop-server')?.addEventListener('click', () => {
    void postJson('/api/shutdown').then(() => {
      main.innerHTML = '<div class="empty"><strong>Wayfinder stopped</strong><p>Your GitHub CLI account is still signed in.</p></div>';
    });
  });
}

function counts(map: WayfinderMap): Record<TicketState, number> {
  const result: Record<TicketState, number> = { frontier: 0, claimed: 0, blocked: 0, done: 0 };
  for (const ticket of map.tickets) result[ticket.state] += 1;
  return result;
}

function mapCard(repo: string, map: WayfinderMap): string {
  const count = counts(map);
  const destination = map.sections.destination || 'No destination has been written yet.';
  return `<a class="map-card" href="${mapPath(repo, map.number)}"><div><small>Map #${String(map.number)}${map.open ? '' : ' · Completed'}</small><h2>${escapeHtml(map.title)}</h2><p>${escapeHtml(destination)}</p></div><div class="stats"><span><b>${String(count.frontier)}</b> next</span><span><b>${String(map.tickets.length - count.done)}</b> open</span><span><b>${String(count.done)}</b> done</span></div></a>`;
}

async function renderRepository(repo: string, refresh = false): Promise<void> {
  remember(repo);
  crumb.textContent = repo;
  accountMark.textContent = repo.slice(0, 1).toUpperCase();
  const snapshot = await getJson<MapSnapshot>(`${scopedApiPath(repo, 'snapshot')}${refresh ? '?refresh=1' : ''}`);
  const warnings = snapshot.warnings.map((warning) => `<div class="notice warning">${escapeHtml(warning)}</div>`).join('');
  main.innerHTML = `<div class="repository-head"><div><p class="eyebrow">REPOSITORY</p><h1>${escapeHtml(repo)}</h1><p>${String(snapshot.maps.length)} map${snapshot.maps.length === 1 ? '' : 's'}</p></div><div><button type="button" id="refresh-repo">Refresh</button><a href="/">Back to Home</a></div></div>${warnings}${snapshot.maps.length === 0 ? '<div class="empty"><strong>No Wayfinder maps found</strong><p>This repository has no issue with the configured map label.</p><a href="/">Back to Home</a></div>' : `<div class="map-grid">${snapshot.maps.map((map) => mapCard(repo, map)).join('')}</div>`}`;
  need<HTMLButtonElement>('refresh-repo').addEventListener('click', () => void show(() => renderRepository(repo, true)));
}

function renderNewMap(): void {
  crumb.textContent = 'Start a new map';
  main.innerHTML = `<div class="composer"><p class="eyebrow">NEW MAP</p><h1>Start with the destination</h1><p>Give T3 Code one clear goal. It will interview you and create the map.</p><form><label>Repository<input name="repo" placeholder="owner/name" required /></label><label>What do you want to accomplish?<textarea name="goal" rows="7" required></textarea></label><button class="primary" type="submit" disabled>Start in T3 Code — coming next</button><small>The hand-off is tracked in the next implementation ticket.</small></form></div>`;
}

async function show(render: () => Promise<void> | void): Promise<void> {
  main.innerHTML = '<div class="loading">Reading GitHub…</div>';
  try {
    await render();
  } catch (error) {
    main.innerHTML = `<div class="empty error"><strong>Wayfinder could not load this page</strong><p>${escapeHtml(error instanceof Error ? error.message : String(error))}</p><a href="/">Back to Home</a></div>`;
  }
}

const route = parseRepoPagePath(window.location.pathname);
if (window.location.pathname === '/new-map') renderNewMap();
else if (route?.mapNumber === null) void show(() => renderRepository(route.repo));
else void show(() => renderHome());
