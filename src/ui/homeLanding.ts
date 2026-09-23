import type { HomeState } from '../home.js';
import type { HandOffStatusDto } from '../handOffTracking.js';
import { mapPath, normalizeRepo, repoPath, scopedApiPath } from '../repoRoutes.js';
import type { MapSnapshot } from '../types.js';
import { paintIcons, repoIconHtml } from './chrome.js';
import { buildHomeWorkItems, chooseContinueDestination, inFlightStatusLabel, orderRepositories, relativeTimeLabel, summarizeRepository } from './homeView.js';
import type { HomeWorkItem, RepositorySummary } from './homeView.js';
import { readHomeRecency } from './homeRecency.js';
import type { HomeStorage } from './homeRecency.js';
import { escapeHtml } from './markdown.js';

const HOME_REPOSITORY_LIMIT = 6;
const HOME_INITIAL_SNAPSHOT_LIMIT = 8;

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

function repositorySummaryMarkup(summary: RepositorySummary | null, openedAt: string | undefined, accountReady: boolean): string {
  const lastOpened = `<span class="home-repo-last-opened">${escapeHtml(relativeTimeLabel(openedAt))}</span>`;
  if (summary === null) {
    const message = accountReady ? 'Map activity could not be loaded' : 'Sign in to load map activity';
    return `${lastOpened}<span>${message}</span>`;
  }
  const mapCount = `${String(summary.mapCount)} map${summary.mapCount === 1 ? '' : 's'}`;
  const openCount = `${String(summary.openTicketCount)} open ticket${summary.openTicketCount === 1 ? '' : 's'}`;
  const latestMap = summary.latestMap === null
    ? '<span class="home-repo-latest">No maps yet</span>'
    : `<a class="home-repo-latest" href="${mapPath(summary.repo, summary.latestMap.number)}"><span data-icon="compass" aria-hidden="true"></span>${escapeHtml(summary.latestMap.title)}</a>`;
  const progress = summary.ticketCount === 0
    ? ''
    : `<div class="home-repo-progress" role="progressbar" aria-label="${String(summary.doneTicketCount)} of ${String(summary.ticketCount)} tickets complete" aria-valuemin="0" aria-valuemax="${String(summary.ticketCount)}" aria-valuenow="${String(summary.doneTicketCount)}"><span style="--progress:${String(Math.round((summary.doneTicketCount / summary.ticketCount) * 100))}%"></span></div>`;
  return `<div class="home-repo-summary">${lastOpened}<span>${mapCount} <i aria-hidden="true">·</i> ${openCount}</span>${latestMap}${progress}</div>`;
}

function repositoryRowMarkup(
  repo: string,
  index: number,
  summary: RepositorySummary | null,
  openedAt: string | undefined,
  accountReady: boolean,
): string {
  return `<article class="home-repo-row" data-home-repo-row data-home-index="${String(index)}" data-home-repo="${escapeHtml(repo)}" data-repo-search="${escapeHtml(repo.toLocaleLowerCase())}"${index >= HOME_REPOSITORY_LIMIT ? ' hidden' : ''}>
    <a class="home-repo-link" href="${repoPath(repo)}">${repoIconHtml(repo, 'lg')}<span><strong>${escapeHtml(repo)}</strong><small>Open repository</small></span><span class="home-repo-arrow" data-icon="arrow" aria-hidden="true"></span></a>
    <div class="home-repo-summary" data-home-repo-summary>${repositorySummaryMarkup(summary, openedAt, accountReady)}</div>
  </article>`;
}

export function homeContinueCardMarkup(
  destination: ReturnType<typeof chooseContinueDestination>,
  accountReady: boolean,
): string {
  if (!accountReady) {
    return `<div class="home-continue-card is-blocked"><span class="home-continue-mark" aria-hidden="true">!</span><div><p class="eyebrow">Account needed</p><h3>Sign in to continue</h3><p>Your recent repositories stay here while GitHub is disconnected.</p></div></div>`;
  }
  if (destination === null) {
    return `<div class="home-continue-card is-empty">
      <div class="destination-sketch" aria-hidden="true"><span class="destination-grid"></span><span class="destination-path"></span><span class="destination-pin"></span><span class="destination-label">DESTINATION</span></div>
      <div><p class="eyebrow">Your next map</p><h3>Maps you open will be ready here.</h3><p>Choose a repository below, or start a new map from the sidebar.</p></div>
    </div>`;
  }
  const t3Action = destination.handOffId === null
    ? ''
    : `<button type="button" class="ghost home-open-t3" data-open-handoff="${escapeHtml(destination.handOffId)}"><span data-icon="play" aria-hidden="true"></span>Open in T3 Code</button>`;
  const eyebrow = destination.kind === 'handoff' ? 'Continue hand-off' : 'Continue map';
  const detail = destination.detail.toLocaleLowerCase().startsWith(destination.repo.toLocaleLowerCase())
    ? destination.detail
    : `${destination.repo} · ${destination.detail}`;
  return `<div class="home-continue-card">
    <span class="home-continue-mark" aria-hidden="true"><span data-icon="compass"></span></span>
    <div class="home-continue-copy"><p class="eyebrow">${eyebrow}</p><h3>${escapeHtml(destination.title)}</h3><p class="home-continue-detail">${escapeHtml(detail)}</p><span class="home-continue-time">Updated ${escapeHtml(relativeTimeLabel(destination.timestamp))}</span></div>
    <div class="home-continue-actions"><a class="primary" href="${escapeHtml(destination.href)}">Open map</a>${t3Action}</div>
  </div>`;
}

export function homeErrorMarkup(message: string, recentRepositories: readonly string[]): string {
  const recentLinks = recentRepositories.length === 0
    ? ''
    : `<div class="home-error-recents"><h2>Recent repositories</h2>${recentRepositories.map((repo) => `<a href="${repoPath(repo)}">${repoIconHtml(repo, 'sm')}${escapeHtml(repo)}</a>`).join('')}</div>`;
  return `<div class="home-view"><div class="home-intro"><p class="eyebrow">HOME</p><h1>Find your next map.</h1><p>Wayfinder could not load your Home view. Try again to reconnect your repositories and maps.</p></div><div class="home-error-layout"><section class="home-error" role="alert"><strong>Home could not load</strong><p>${escapeHtml(message)}</p><button type="button" class="primary" data-refresh-home>Retry</button></section>${recentLinks}</div></div>`;
}

function workItemMarkup(item: HomeWorkItem, extra: boolean): string {
  const source = item.externalUrl === null
    ? ''
    : `<a class="home-work-source" href="${escapeHtml(item.externalUrl)}" target="_blank" rel="noreferrer">Source<span data-icon="external" aria-hidden="true"></span></a>`;
  const openT3 = item.handOffId === null
    ? ''
    : `<button type="button" class="home-work-source" data-open-handoff="${escapeHtml(item.handOffId)}">Open in T3 Code</button>`;
  const glyph = item.kind === 'handoff' ? 'play' : item.kind === 'pull-request' ? 'external' : 'grill';
  const extraClass = extra ? ' home-inflight-extra' : '';
  return `<article class="home-work-row${extraClass}"${extra ? ' hidden' : ''}>
    <a class="home-work-main" href="${escapeHtml(item.href)}"><span class="home-work-kind" aria-hidden="true"><span data-icon="${glyph}"></span></span><span class="home-work-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></span><span class="home-work-state${item.stale ? ' is-stale' : ''}">${escapeHtml(inFlightStatusLabel(item))}</span></a>
    <div class="home-work-actions">${openT3}${source}</div>
  </article>`;
}

function inFlightLaneMarkup(title: string, lane: HomeWorkItem['lane'], items: readonly HomeWorkItem[]): string {
  const rows = items.length === 0
    ? `<p class="home-lane-empty">${lane === 'needs-you' ? 'Nothing needs your attention right now.' : 'Nothing is running in T3 Code.'}</p>`
    : items.map((item, index) => workItemMarkup(item, index >= 3)).join('');
  return `<div class="home-inflight-lane"><div class="home-lane-head"><h3>${title}</h3><span>${String(items.length)}</span></div><div class="home-work-list">${rows}</div></div>`;
}

export function homeLoadingMarkup(): string {
  return `<div class="home-view is-loading" role="status" aria-live="polite" aria-label="Loading Home">
    <div class="home-intro"><p class="eyebrow">HOME</p><div class="home-skeleton home-skeleton-title"></div><div class="home-skeleton home-skeleton-copy"></div></div>
    <div class="home-cols"><div class="home-main"><section class="home-section"><div class="home-section-head"><h2>Continue</h2></div><div class="home-skeleton home-skeleton-card"></div></section><section class="home-section"><div class="home-section-head"><h2>In flight</h2></div><div class="home-skeleton home-skeleton-card"></div></section><section class="home-section"><div class="home-section-head"><h2>Repositories</h2></div><div class="home-skeleton home-skeleton-search"></div><div class="home-skeleton home-skeleton-list"></div></section></div><aside class="home-side"><div class="home-skeleton home-skeleton-progress"></div></aside></div>
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
    ? '<div class="home-repo-empty"><strong>No repositories with maps yet</strong><p>Open a repository above, or start a new map from the sidebar.</p></div>'
    : '<div class="home-repo-empty"><strong>No cached recent repositories</strong><p>Sign in to load repositories that contain Wayfinder maps.</p></div>';
  const handOffNotice = handOffError ? '<p class="home-inline-warning" role="status">Hand-off status could not be loaded. Refresh to try again.</p>' : '';
  const needsYou = workItems.filter((item) => item.lane === 'needs-you');
  const running = workItems.filter((item) => item.lane === 'running');
  const seeAll = workItems.length > 5 ? `<button type="button" class="ghost home-see-all" data-home-see-all aria-expanded="false">See all ${String(workItems.length)}</button>` : '';

  options.paint(`<div class="home-view">
    <header class="home-intro"><p class="eyebrow">HOME</p><h1>Find your next map.</h1><p>Pick up where you left off, see what needs you, or choose a repository.</p></header>
    ${options.accountPanel(state)}${warning}
    <div class="home-cols"><div class="home-main">
      <section class="home-section" aria-labelledby="home-continue-heading"><div class="home-section-head"><h2 id="home-continue-heading">Continue</h2></div>${homeContinueCardMarkup(continueDestination, accountReady)}</section>
      <section class="home-section" aria-labelledby="home-inflight-heading"><div class="home-section-head"><h2 id="home-inflight-heading">In flight</h2>${seeAll}</div>${handOffNotice}<div class="home-inflight-grid">${inFlightLaneMarkup('Needs you', 'needs-you', needsYou)}${inFlightLaneMarkup('Running in T3 Code', 'running', running)}</div></section>
      <section class="home-section" aria-labelledby="home-repositories-heading"><div class="home-section-head"><div><h2 id="home-repositories-heading">Repositories</h2><p>Recent first · repositories with Wayfinder maps</p></div><span class="grow"></span><button type="button" class="ghost home-refresh" data-refresh-home aria-label="Refresh Home"><span data-icon="refresh" aria-hidden="true"></span></button></div>
        <form class="home-repo-search" id="repo-entry"><label for="repo-name">Find a repository</label><div class="repo-picker"><input class="input" id="repo-name" name="repo" placeholder="Search by owner or name, or type owner/name" autocomplete="off" spellcheck="false" required role="combobox" aria-expanded="false" aria-controls="repo-menu" aria-autocomplete="list" /><ul class="repo-menu" id="repo-menu" role="listbox" hidden></ul></div><button class="primary" type="submit">Open</button></form>
        <div class="home-repo-list" id="home-repo-list">${rows || emptyRepositories}</div><p class="home-repo-no-match" data-home-repo-no-match hidden>No repositories match that search.</p><button type="button" class="ghost home-show-all" data-home-show-all${repositories.length <= HOME_REPOSITORY_LIMIT ? ' hidden' : ''}>Show all ${String(repositories.length)}</button>
      </section>
    </div><aside class="home-side" id="progress-host" aria-label="Progress"></aside></div>
    <footer class="version">Wayfinder v${escapeHtml(state.version)}</footer>
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
      const summaryHost = row.querySelector<HTMLElement>('[data-home-repo-summary]');
      if (repo === undefined || summaryHost === null) continue;
      summaryHost.innerHTML = repositorySummaryMarkup(summaries.get(repo.toLocaleLowerCase()) ?? null, recency.repositoryOpenedAt[repo.toLocaleLowerCase()], accountReady);
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
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!expanded));
    button.textContent = expanded ? `See all ${String(workItems.length)}` : 'Show less';
    for (const row of document.querySelectorAll<HTMLElement>('.home-inflight-extra')) row.hidden = expanded;
  });
  const progressHost = document.getElementById('progress-host');
  if (progressHost !== null) void options.renderProgress(progressHost);
}
