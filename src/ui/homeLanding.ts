import type { HomeState } from '../home.js';
import type { HandOffStatusDto } from '../handOffTracking.js';
import { normalizeRepo, repoPath, scopedApiPath } from '../repoRoutes.js';
import type { MapSnapshot, TicketState } from '../types.js';
import { PROGRESS_ORDER, STATE_STYLE, paintIcons, repoIconHtml } from './chrome.js';
import { buildHomeWorkItems, chooseContinueDestination, inFlightStatusLabel, orderRepositories, relativeTimeLabel, summarizeRepository } from './homeView.js';
import type { ContinueDestination, HomeWorkItem, RepositorySummary } from './homeView.js';
import { readHomeRecency } from './homeRecency.js';
import type { HomeStorage } from './homeRecency.js';
import { escapeHtml } from './markdown.js';
import { miniGraphSvg } from './miniGraph.js';

const HOME_REPOSITORY_LIMIT = 6;
const HOME_INITIAL_SNAPSHOT_LIMIT = 8;
const LANE_LIMIT = 3;

interface HandOffSnapshot {
  handOffs: HandOffStatusDto[];
  t3: { available: boolean; checkedAt: string | null };
}

type GetJson = <T>(url: string) => Promise<T>;

export interface HomeLandingOptions {
  refresh: boolean;
  storage: HomeStorage;
  getJson: GetJson;
  paint: (html: string) => void;
  bindRepoPicker: (input: HTMLInputElement, menu: HTMLUListElement) => void;
  accountPanel: (state: HomeState) => string;
  setAccount: (state: HomeState) => void;
  syncAccountMark: () => Promise<unknown>;
  setSynced: (label: string) => void;
  renderProgress: (host: HTMLElement) => Promise<void>;
  focusHandOff: (id: string) => Promise<void>;
  toast: (message: string, ms?: number) => void;
}

async function loadHomeSnapshots(
  repositories: readonly string[],
  refresh: boolean,
  getJson: GetJson,
): Promise<Map<string, MapSnapshot | null>> {
  const snapshots = new Map<string, MapSnapshot | null>();
  let next = 0;
  const workers = Array.from({ length: Math.min(4, repositories.length) }, async () => {
    while (next < repositories.length) {
      const repo = repositories[next++];
      if (repo === undefined) continue;
      try {
        const url = `${scopedApiPath(repo, 'snapshot')}${refresh ? '?refresh=1' : ''}`;
        snapshots.set(repo.toLocaleLowerCase(), await getJson<MapSnapshot>(url));
      } catch {
        snapshots.set(repo.toLocaleLowerCase(), null);
      }
    }
  });
  await Promise.all(workers);
  return snapshots;
}

/** The repository's tickets as one bar: done, claimed, next up, blocked, left to right. */
export function stateStackHtml(counts: Record<TicketState, number>): string {
  const total = PROGRESS_ORDER.reduce((sum, state) => sum + counts[state], 0);
  const segments = total === 0
    ? ''
    : PROGRESS_ORDER.filter((state) => counts[state] > 0)
        .map((state) => `<i style="width:${((counts[state] / total) * 100).toFixed(2)}%;background:var(${STATE_STYLE[state].variable})"></i>`)
        .join('');
  const label = total === 0 ? 'No tickets yet' : `${String(counts.done)} of ${String(total)} tickets done`;
  return `<span class="wf-stack" role="img" aria-label="${label}">${segments}</span>`;
}

function repositoryStat(summary: RepositorySummary | null, accountReady: boolean): string {
  if (summary === null) return accountReady ? 'Maps not loaded' : 'Sign in to load maps';
  if (summary.mapCount === 0) return 'No maps yet';
  return `${String(summary.mapCount)} map${summary.mapCount === 1 ? '' : 's'} · ${String(summary.openTicketCount)} open`;
}

function repositoryRowInner(repo: string, summary: RepositorySummary | null, openedAt: string | undefined, accountReady: boolean): string {
  const bar = summary === null ? '<span class="wf-stack"></span>' : stateStackHtml(summary.stateCounts);
  const when = openedAt === undefined ? '' : relativeTimeLabel(openedAt);
  return `${repoIconHtml(repo, 'md')}<span class="who"><span class="name">${escapeHtml(repo)}</span>${bar}</span><span class="stat">${escapeHtml(repositoryStat(summary, accountReady))}</span><span class="when">${escapeHtml(when)}</span>`;
}

function repositoryRowMarkup(repo: string, index: number, summary: RepositorySummary | null, openedAt: string | undefined, accountReady: boolean): string {
  return `<a class="wf-repo" href="${repoPath(repo)}" data-home-repo-row data-home-repo="${escapeHtml(repo)}" data-repo-search="${escapeHtml(repo.toLocaleLowerCase())}"${index >= HOME_REPOSITORY_LIMIT ? ' hidden' : ''}>${repositoryRowInner(repo, summary, openedAt, accountReady)}</a>`;
}

function shortRepo(repo: string): string {
  return repo.split('/')[1] ?? repo;
}

export function homeContinueCardMarkup(destination: ContinueDestination | null, accountReady: boolean): string {
  if (!accountReady) {
    return `<section class="wf-node wf-alert" role="alert"><span class="ic" aria-hidden="true">!</span><div><p class="eyebrow">Account needed</p><h2>Sign in to continue</h2><p>GitHub is signed out, so maps, in-flight work and today’s progress can’t load. Your recent repositories stay below.</p></div></section>`;
  }
  if (destination === null) {
    return `<section class="wf-node wf-continue is-first" style="--accent: var(--state-frontier)">
      <div class="txt"><p class="eyebrow">Your first map</p><h2>Maps you open will be ready here.</h2><p class="dest">Every map starts with a destination. Start one from the sidebar and T3 Code drafts it with you; its tickets show up here as a graph you clear one at a time.</p></div>
      <div class="graph" aria-hidden="true"><span class="ghostnode">Destination</span></div>
    </section>`;
  }
  const handoff = destination.kind === 'handoff';
  const map = destination.map;
  const next = map?.tickets.find((ticket) => ticket.state === 'frontier');
  const eyebrow = handoff
    ? `Continue · your latest hand-off · ${relativeTimeLabel(destination.timestamp)}`
    : `Continue · ${shortRepo(destination.repo)} · opened ${relativeTimeLabel(destination.timestamp)}`;
  const title = map === null ? destination.title : `#${String(map.number)} ${map.title}`;
  const nextLine = handoff
    ? `<span class="chip" style="--accent: var(--state-frontier)"><span data-icon="bolt" aria-hidden="true"></span>T3 Code</span>${escapeHtml(destination.detail)}`
    : next === undefined
      ? `<span class="quiet">${map === null ? escapeHtml(destination.detail) : 'Nothing is next up on this map.'}</span>`
      : `<span class="chip" style="--accent: var(--state-frontier)"><span data-icon="arrow" aria-hidden="true"></span>next</span><a href="${escapeHtml(`${destination.href}?view=map&ticket=${String(next.number)}`)}">#${String(next.number)} ${escapeHtml(next.title)}</a>`;
  const actions = handoff && destination.handOffId !== null
    ? `<button type="button" class="primary" data-open-handoff="${escapeHtml(destination.handOffId)}"><span data-icon="external" aria-hidden="true"></span>Open in T3 Code</button><a class="ghost" href="${escapeHtml(destination.href)}">Open map</a>`
    : `<a class="primary" href="${escapeHtml(destination.href)}">Open map<span data-icon="arrow" aria-hidden="true"></span></a>`;
  const graph = map === null
    ? '<span class="ghostnode">Destination</span>'
    : miniGraphSvg(map);
  return `<section class="wf-node wf-continue" style="--accent: var(${handoff ? '--state-frontier' : '--state-claimed'})">
    <div class="txt"><p class="eyebrow">${escapeHtml(eyebrow)}</p><h2>${escapeHtml(title)}</h2><div class="next">${nextLine}</div><div class="go">${actions}</div></div>
    <a class="graph" href="${escapeHtml(destination.href)}" aria-label="Open ${escapeHtml(title)}" tabindex="-1">${graph}</a>
  </section>`;
}

export function homeErrorMarkup(message: string, recentRepositories: readonly string[]): string {
  const recentLinks = recentRepositories.length === 0
    ? ''
    : `<section><div class="wf-label">Recent repositories</div><div class="wf-node wf-list">${recentRepositories.map((repo) => `<a class="wf-repo" href="${repoPath(repo)}">${repoIconHtml(repo, 'md')}<span class="who"><span class="name">${escapeHtml(repo)}</span></span></a>`).join('')}</div></section>`;
  return `<div class="wf-home"><div class="wf-left"><section class="wf-node wf-alert" role="alert"><span class="ic" aria-hidden="true">!</span><div><p class="eyebrow">Home could not load</p><h2>Wayfinder could not reach GitHub</h2><p>${escapeHtml(message)}</p><div class="go"><button type="button" class="primary" data-refresh-home><span data-icon="refresh" aria-hidden="true"></span>Try again</button></div></div></section>${recentLinks}${handOffHistorySection()}</div></div>`;
}

function handOffHistorySection(): string {
  return '<section id="home-handoff-history-section" aria-labelledby="home-handoff-history-heading" hidden><div class="wf-label" id="home-handoff-history-heading">Recent hand-offs<span class="grow"></span><span class="wf-label-note">Kept for 30 days</span></div><div class="home-handoff-history-list" id="home-handoff-history-list"></div></section>';
}

function workItemMarkup(item: HomeWorkItem, extra: boolean): string {
  const needs = item.lane === 'needs-you';
  const glyph = item.kind === 'handoff' ? (needs ? 'hand' : 'bolt') : item.kind === 'pull-request' ? 'external' : 'grill';
  const accent = needs ? '--state-claimed' : '--state-frontier';
  const actions = [
    item.handOffId === null ? '' : `<button type="button" class="linkish" data-open-handoff="${escapeHtml(item.handOffId)}">Open in T3 Code</button>`,
    item.externalUrl === null ? '' : `<a class="linkish" href="${escapeHtml(item.externalUrl)}" target="_blank" rel="noreferrer">On GitHub<span data-icon="external" aria-hidden="true"></span></a>`,
  ].filter((part) => part !== '').join('');
  const number = item.number === null ? '' : `<span class="num">#${String(item.number)}</span>`;
  return `<article class="wf-node wf-fly${item.stale ? ' is-stale' : ''}${extra ? ' home-inflight-extra' : ''}" style="--accent: var(${accent})"${extra ? ' hidden' : ''}>
    <a class="wf-fly-link" href="${escapeHtml(item.href)}"><span class="top"><span data-icon="${glyph}" aria-hidden="true"></span>${number}<span class="repo">${escapeHtml(shortRepo(item.repo))}</span><span class="age">${escapeHtml(relativeTimeLabel(item.timestamp))}</span></span>
      <strong>${escapeHtml(item.title)}</strong><span class="meta">${escapeHtml(item.stale ? inFlightStatusLabel(item) : item.detail.replace(`${item.repo} · `, ''))}</span></a>
    ${actions === '' ? '' : `<span class="acts">${actions}</span>`}
  </article>`;
}

function inFlightLaneMarkup(title: string, glyph: string, lane: HomeWorkItem['lane'], items: readonly HomeWorkItem[]): string {
  const rows = items.length === 0
    ? `<div class="wf-none">${lane === 'needs-you' ? 'Nothing is waiting on you.' : 'Hand a ticket to T3 Code and it runs here.'}</div>`
    : items.map((item, index) => workItemMarkup(item, index >= LANE_LIMIT)).join('');
  return `<div class="wf-lane"><h3 class="wf-lane-h"><span data-icon="${glyph}" aria-hidden="true"></span>${title}<b>${String(items.length)}</b></h3>${rows}</div>`;
}

export function homeLoadingMarkup(): string {
  return `<div class="wf-home is-loading" role="status" aria-live="polite" aria-label="Loading Home">
    <div class="wf-cols"><div class="wf-left">
      <section><div class="wf-label">Continue</div><div class="wf-skeleton is-card"></div></section>
      <section><div class="wf-label">In flight</div><div class="wf-skeleton is-lanes"></div></section>
      <section><div class="wf-label">Repositories</div><div class="wf-skeleton is-search"></div><div class="wf-skeleton is-list"></div></section>
    </div><aside class="wf-side"><div class="wf-skeleton is-progress"></div></aside></div>
  </div>`;
}

export async function renderHomeLanding(options: HomeLandingOptions): Promise<void> {
  document.title = 'Home · Wayfinder';
  const [homeResult, handOffResult] = await Promise.allSettled([
    options.getJson<HomeState>(`/api/home${options.refresh ? '?refresh=1' : ''}`),
    options.getJson<HandOffSnapshot>('/api/hand-offs'),
  ]);
  if (homeResult.status === 'rejected') {
    const recency = readHomeRecency(options.storage);
    await options.syncAccountMark();
    const message = homeResult.reason instanceof Error ? homeResult.reason.message : String(homeResult.reason);
    options.paint(homeErrorMarkup(message, recency.repositories));
    return;
  }

  const state = homeResult.value;
  const handOffs = handOffResult.status === 'fulfilled' ? handOffResult.value.handOffs : [];
  const handOffError = handOffResult.status === 'rejected';
  options.setAccount(state);
  options.setSynced('');
  const recency = readHomeRecency(options.storage);
  const repositories = orderRepositories(state.repositories, recency.repositories, recency.repositoryOpenedAt);
  const accountReady = state.account.status === 'ready';
  const recentWorkRepos = handOffs
    .slice()
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 8)
    .map((handOff) => handOff.repo);
  const snapshotRepos = Array.from(new Set([
    ...repositories.slice(0, HOME_INITIAL_SNAPSHOT_LIMIT),
    ...(recency.lastOpenedMap === null ? [] : [recency.lastOpenedMap.repo]),
    ...recentWorkRepos,
  ])).slice(0, 18);
  const snapshots = accountReady ? await loadHomeSnapshots(snapshotRepos, options.refresh, options.getJson) : new Map<string, MapSnapshot | null>();
  const availableSnapshots = [...snapshots.values()].filter((snapshot): snapshot is MapSnapshot => snapshot !== null);
  const continueDestination = accountReady ? chooseContinueDestination(recency.lastOpenedMap, handOffs, availableSnapshots) : null;
  const workItems = accountReady ? buildHomeWorkItems(handOffs, availableSnapshots) : [];
  const summaries = new Map<string, RepositorySummary | null>(repositories.map((repo) => {
    const snapshot = snapshots.get(repo.toLocaleLowerCase());
    return [repo.toLocaleLowerCase(), snapshot === undefined || snapshot === null ? null : summarizeRepository(repo, snapshot)];
  }));
  const warning = state.warning === null
    ? ''
    : `<div class="panel is-warning home-alert"><span class="grow">${escapeHtml(state.warning)}</span><button type="button" class="ghost" data-refresh-home>Retry</button></div>`;
  const rows = repositories.map((repo, index) => repositoryRowMarkup(
    repo,
    index,
    summaries.get(repo.toLocaleLowerCase()) ?? null,
    recency.repositoryOpenedAt[repo.toLocaleLowerCase()],
    accountReady,
  )).join('');
  const emptyRepositories = accountReady
    ? '<p class="wf-quiet">Repositories you open show up here, most recent first.</p>'
    : '<p class="wf-quiet">Sign in to load the repositories that hold Wayfinder maps.</p>';
  const handOffNotice = handOffError ? '<p class="wf-quiet is-warning" role="status">Hand-off status could not be loaded. Refresh to try again.</p>' : '';
  const needsYou = workItems.filter((item) => item.lane === 'needs-you');
  const running = workItems.filter((item) => item.lane === 'running');
  const hiddenWork = needsYou.length > LANE_LIMIT || running.length > LANE_LIMIT;
  const seeAll = workItems.length > 5 || hiddenWork ? `<button type="button" class="linkish" data-home-see-all aria-expanded="false">See all ${String(workItems.length)}</button>` : '';
  const showAll = repositories.length > HOME_REPOSITORY_LIMIT ? `<button type="button" class="wf-more" data-home-show-all>Show all ${String(repositories.length)}</button>` : '';

  options.paint(`<div class="wf-home">
    ${options.accountPanel(state)}${warning}
    <div class="wf-cols"><div class="wf-left">
      <section aria-label="Continue">${homeContinueCardMarkup(continueDestination, accountReady)}</section>
      <section aria-labelledby="home-inflight-heading"><div class="wf-label"><span id="home-inflight-heading">In flight</span><span class="grow"></span>${seeAll}</div>${handOffNotice}
        ${accountReady ? `<div class="wf-lanes">${inFlightLaneMarkup('Needs you', 'hand', 'needs-you', needsYou)}${inFlightLaneMarkup('Running in T3 Code', 'bolt', 'running', running)}</div>` : '<div class="wf-none">Needs GitHub. Sign in to see what’s waiting on you and what T3 Code is running.</div>'}</section>
      ${handOffHistorySection()}
      <section aria-labelledby="home-repositories-heading"><div class="wf-label"><span id="home-repositories-heading">Repositories</span><span class="grow"></span><button type="button" class="wf-icon-btn" data-refresh-home aria-label="Refresh Home" title="Refresh Home"><span data-icon="refresh" aria-hidden="true"></span></button></div>
        <form class="wf-find" id="repo-entry" role="search"><label class="search repo-picker"><span data-icon="lens" aria-hidden="true"></span><span class="sr-only">Find a repository</span><input id="repo-name" name="repo" type="search" placeholder="Search your repositories, or type owner/name" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="repo-menu" aria-autocomplete="list" /><ul class="repo-menu" id="repo-menu" role="listbox" hidden></ul></label></form>
        <div class="wf-node wf-list" id="home-repo-list">${rows === '' ? emptyRepositories : `${rows}<p class="wf-quiet" data-home-repo-no-match hidden>No recent repository matches. Press Enter to open it as owner/name.</p>${showAll}`}</div>
      </section>
    </div><aside class="wf-side" id="progress-host" aria-label="Progress"></aside></div>
  </div>`);

  const form = document.getElementById('repo-entry');
  if (!(form instanceof HTMLFormElement)) throw new Error('Missing repository search form.');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const repo = normalizeRepo(String(new FormData(form).get('repo') ?? ''));
    if (repo === null) {
      const input = document.getElementById('repo-name');
      if (!(input instanceof HTMLInputElement)) return;
      input.setCustomValidity('Use owner/name.');
      input.reportValidity();
      input.setCustomValidity('');
      return;
    }
    window.location.assign(repoPath(repo));
  });
  const input = document.getElementById('repo-name');
  const menu = document.getElementById('repo-menu');
  if (!(input instanceof HTMLInputElement) || !(menu instanceof HTMLUListElement)) throw new Error('Missing repository search controls.');
  const repoRows = [...document.querySelectorAll<HTMLElement>('[data-home-repo-row]')];
  const noMatch = document.querySelector<HTMLElement>('[data-home-repo-no-match]');
  const showAllButton = document.querySelector<HTMLButtonElement>('[data-home-show-all]');
  let expanded = false;
  const filterRows = (): void => {
    const query = input.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const [index, row] of repoRows.entries()) {
      const matches = row.dataset['repoSearch']?.includes(query) ?? false;
      const show = matches && (query.length > 0 || expanded || index < HOME_REPOSITORY_LIMIT);
      row.hidden = !show;
      if (show) visible += 1;
    }
    if (noMatch !== null) noMatch.hidden = visible > 0 || repositories.length === 0;
    if (showAllButton !== null) showAllButton.hidden = repositories.length <= HOME_REPOSITORY_LIMIT || expanded || query.length > 0;
  };
  input.addEventListener('input', filterRows);
  options.bindRepoPicker(input, menu);
  showAllButton?.addEventListener('click', async () => {
    expanded = true;
    filterRows();
    if (showAllButton === null) return;
    showAllButton.disabled = true;
    showAllButton.textContent = 'Loading map activity…';
    const missing = repositories.filter((repo) => !snapshots.has(repo.toLocaleLowerCase()));
    const extraSnapshots = accountReady ? await loadHomeSnapshots(missing, false, options.getJson) : new Map<string, MapSnapshot | null>();
    for (const [repo, snapshot] of extraSnapshots) {
      snapshots.set(repo, snapshot);
      const name = repositories.find((candidate) => candidate.toLocaleLowerCase() === repo) ?? repo;
      summaries.set(repo, snapshot === null ? null : summarizeRepository(name, snapshot));
    }
    for (const row of repoRows) {
      const repo = row.dataset['homeRepo'];
      if (repo === undefined) continue;
      row.innerHTML = repositoryRowInner(repo, summaries.get(repo.toLocaleLowerCase()) ?? null, recency.repositoryOpenedAt[repo.toLocaleLowerCase()], accountReady);
    }
    paintIcons(document);
    showAllButton.hidden = true;
  });
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-open-handoff]')) {
    button.addEventListener('click', async () => {
      const id = button.dataset['openHandoff'];
      if (id === undefined) return;
      button.disabled = true;
      try {
        await options.focusHandOff(id);
      } catch (error) {
        options.toast(error instanceof Error ? error.message : String(error), 9000);
      } finally {
        button.disabled = false;
      }
    });
  }
  document.querySelector<HTMLButtonElement>('[data-home-see-all]')?.addEventListener('click', (event) => {
    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement)) return;
    const open = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!open));
    button.textContent = open ? `See all ${String(workItems.length)}` : 'Show less';
    for (const row of document.querySelectorAll<HTMLElement>('.home-inflight-extra')) row.hidden = open;
  });
  const progressHost = document.getElementById('progress-host');
  if (progressHost !== null) void options.renderProgress(progressHost);
}

