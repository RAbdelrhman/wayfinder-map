import type { HomeState } from '../home.js';
import type { AuthFlowState } from '../authFlow.js';
import { mapPath, normalizeRepo, parseRepoPagePath, prototypesPath, repoPath, scopedApiPath } from '../repoRoutes.js';
import { prototypeFileUrl } from '../prototypes.js';
import type { MapSnapshot, Prototype, WayfinderMap } from '../types.js';
import { STATE_ORDER, STATE_STYLE, bindTheme, countStates, paintIcons, progressRing } from './chrome.js';
import { syncedLabel } from './focus.js';
import { icon } from './icons.js';
import { escapeHtml, renderMarkdown } from './markdown.js';

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
  refresh: need('refresh'),
  synced: need('synced'),
  toast: need('toast'),
  navHome: need('nav-home'),
  navNew: need('nav-new'),
  newMapLink: need('new-map-link'),
};

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
  const parts = ['<a href="/">Home</a>', ...trail.map((part) => `<span class="is-repo">${escapeHtml(part)}</span>`)];
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
  return `<a class="card repo-card" href="${repoPath(repo)}"><span data-icon="repo"></span><span class="grow">${escapeHtml(repo)}</span><span class="go" data-icon="arrow"></span></a>`;
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
      <span class="avatar">${escapeHtml(account.login?.slice(0, 1).toUpperCase() ?? '?')}</span>
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

async function renderHome(refresh: boolean): Promise<void> {
  crumbs([]);
  const state = await getJson<HomeState>(`/api/home${refresh ? '?refresh=1' : ''}`);
  els.accountMark.textContent = state.account.login?.slice(0, 1).toUpperCase() ?? '!';
  els.synced.textContent = syncedLabel(0);
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
    <form class="field" id="repo-entry">
      <label for="repo-name">Open a repository</label>
      <div class="row">
        <input class="input" id="repo-name" name="repo" placeholder="owner/name" autocomplete="off" spellcheck="false" required />
        <button class="primary" type="submit">Open</button>
      </div>
      <p class="hint">Typing the name always works, even when discovery misses a repository.</p>
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

/**
 * The verdict's opening line of prose, as plain text, so a card says what was decided.
 * Headings are skipped: a resolution comment usually opens with one, and "Decided spec"
 * tells the reader nothing.
 */
function verdictGist(verdict: string): string {
  const rows = verdict.split(/\r?\n/).map((row) => row.trim());
  const prose = rows.filter((row) => row.length > 0 && !row.startsWith('#'));
  const line = (prose.length > 0 ? prose : rows.filter((row) => row.length > 0))
    .map((row) => row.replace(/^[#>*-]+\s*/, '').replace(/[*`_[\]]/g, '').trim())
    .find((row) => row.length > 0);
  return line === undefined ? 'No verdict was written.' : line.length > 150 ? `${line.slice(0, 150)}…` : line;
}

/**
 * Collapsed to its opening line. A decided spec runs long, and clipping it at a fixed
 * height cuts a sentence in half; this keeps every card scannable and nothing truncated.
 */
function verdictHtml(verdict: string): string {
  return `<details class="proto-verdict is-collapsible">
    <summary><span class="eyebrow">Verdict</span><span class="gist">${escapeHtml(verdictGist(verdict))}</span></summary>
    <div class="prose">${renderMarkdown(verdict)}</div>
  </details>`;
}

function prototypeCard(repo: string, prototype: Prototype, snapshot: MapSnapshot): string {
  const map = snapshot.maps.find((candidate) => candidate.number === prototype.mapNumber);
  const ticket = map?.tickets.find((candidate) => candidate.number === prototype.ticketNumber);
  const updated = prototype.updatedAt === null ? '' : new Date(prototype.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const opens = prototype.openable
    .map(
      (file, index) =>
        `<a class="${index === 0 ? 'primary' : 'ghost'}" href="${escapeHtml(prototypeFileUrl(repo, prototype.branch, file))}" target="_blank" rel="noreferrer"><span data-icon="play"></span>Open ${escapeHtml(file.slice(file.lastIndexOf('/') + 1))}</a>`,
    )
    .join('');
  return `<article class="card proto-card">
    <div class="proto-card-head">
      <div class="grow">
        <p class="eyebrow">#${String(prototype.ticketNumber)} · ${escapeHtml(map?.title ?? `map #${String(prototype.mapNumber)}`)}</p>
        <h2>${escapeHtml(ticket?.title ?? prototype.branch)}</h2>
      </div>
      ${updated === '' ? '' : `<span class="proto-date">${escapeHtml(updated)}</span>`}
    </div>
    ${prototype.verdict === null ? '<p class="hint">Still open, so there is no verdict yet.</p>' : verdictHtml(prototype.verdict)}
    <div class="proto-actions">
      ${opens}
      <a class="ghost" href="${escapeHtml(prototype.url)}" target="_blank" rel="noreferrer"><span data-icon="external"></span>Branch on GitHub</a>
      <a class="ghost" href="${mapPath(repo, prototype.mapNumber)}?view=prototypes"><span data-icon="graph"></span>Open on the map</a>
    </div>
    ${
      prototype.openable.length === 0
        ? `<p class="hint">Nothing to open on its own: it runs inside the app. Check out <code>${escapeHtml(prototype.branch)}</code> and start it.</p>`
        : ''
    }
  </article>`;
}

async function renderPrototypes(repo: string, refresh: boolean): Promise<void> {
  remember(repo);
  crumbs([repo, 'Prototypes']);
  els.accountMark.textContent = repo.slice(0, 1).toUpperCase();
  const snapshot = await getJson<MapSnapshot>(scopedApiPath(repo, 'snapshot'));
  const list = await getJson<Prototype[]>(`${scopedApiPath(repo, 'prototypes')}${refresh ? '?refresh=1' : ''}`);
  els.synced.textContent = syncedLabel(0);

  paint(`<div class="page-head">
      <div class="grow">
        <p class="eyebrow">Prototypes</p>
        <h1>${escapeHtml(repo)}</h1>
        <p>Every prototype this repository's maps have produced, newest first.</p>
      </div>
      <div class="page-actions">
        <a class="ghost" href="${repoPath(repo)}"><span data-icon="arrow"></span>Maps</a>
      </div>
    </div>
    ${
      list.length === 0
        ? '<div class="empty"><strong>No prototypes yet</strong><p>A prototype ticket keeps its prototype on a <code>prototype/&lt;ticket&gt;-&lt;slug&gt;</code> branch, and it shows up here once pushed.</p></div>'
        : `<div class="proto-grid">${list.map((prototype) => prototypeCard(repo, prototype, snapshot)).join('')}</div>`
    }`);
}

async function renderRepository(repo: string, refresh: boolean): Promise<void> {
  remember(repo);
  crumbs([repo]);
  els.accountMark.textContent = repo.slice(0, 1).toUpperCase();
  const snapshot = await getJson<MapSnapshot>(`${scopedApiPath(repo, 'snapshot')}${refresh ? '?refresh=1' : ''}`);
  const fetched = Date.parse(snapshot.fetchedAt);
  els.synced.textContent = Number.isNaN(fetched) ? '' : syncedLabel(Date.now() - fetched);
  const warnings = snapshot.warnings
    .map((warning) => `<div class="panel is-warning"><span class="grow">${escapeHtml(warning)}</span></div>`)
    .join('');

  paint(`<div class="page-head">
      <div class="grow">
        <p class="eyebrow">Repository</p>
        <h1>${escapeHtml(repo)}</h1>
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

async function renderNewMap(): Promise<void> {
  crumbs(['Start a new map']);
  els.synced.textContent = '';
  const account = await getJson<HomeState['account']>('/api/auth/status');
  els.accountMark.textContent = account.login?.slice(0, 1).toUpperCase() ?? '!';
  paint(`<div class="page-head">
      <div class="grow">
        <p class="eyebrow">New map</p>
        <h1>Start with the destination</h1>
        <p>Give T3 Code one clear goal. It interviews you, then writes the map.</p>
      </div>
    </div>
    <form class="page-form">
      <div class="field"><label for="new-repo">Repository</label><div class="row"><input class="input" id="new-repo" name="repo" placeholder="owner/name" autocomplete="off" spellcheck="false" required /></div></div>
      <div class="field"><label for="new-goal">What do you want to accomplish?</label><textarea class="input" id="new-goal" name="goal" rows="7" required></textarea></div>
      <button class="primary" type="submit" disabled>Start in T3 Code — coming next</button>
      <p class="hint">The hand-off is tracked in the next implementation ticket.</p>
    </form>`);
}

/* ---------- routing ---------- */

const route = parseRepoPagePath(window.location.pathname);
const page: { kind: 'home' } | { kind: 'repository'; repo: string } | { kind: 'prototypes'; repo: string } | { kind: 'new-map' } =
  window.location.pathname === '/new-map'
    ? { kind: 'new-map' }
    : route?.prototypes === true
      ? { kind: 'prototypes', repo: route.repo }
      : route?.mapNumber === null
        ? { kind: 'repository', repo: route.repo }
        : { kind: 'home' };

async function run(work: () => Promise<void> | void): Promise<void> {
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
  if (refresh) els.refresh.classList.add('is-busy');
  else paint('<p class="loading">Reading GitHub…</p>');
  await run(async () => {
    if (page.kind === 'new-map') await renderNewMap();
    else if (page.kind === 'prototypes') await renderPrototypes(page.repo, refresh);
    else if (page.kind === 'repository') await renderRepository(page.repo, refresh);
    else await renderHome(refresh);
  });
  els.refresh.classList.remove('is-busy');
}

paintIcons();
bindTheme(need('theme'));
els.navHome.classList.toggle('is-on', page.kind !== 'new-map');
els.navNew.classList.toggle('is-on', page.kind === 'new-map');
els.newMapLink.hidden = page.kind === 'new-map';
els.refresh.addEventListener('click', () => void show(true));
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
