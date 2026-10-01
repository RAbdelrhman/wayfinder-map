import type { MapSettlement, MapSnapshot, PublicMap, Ticket, WayfinderMap } from '../types.js';
import { mapPath } from '../repoRoutes.js';
import { newMapPath } from './newMap.js';
import { STATE_ORDER, STATE_STYLE, countStates, repoIconHtml } from './chrome.js';
import { miniGraphSvg } from './miniGraph.js';
import { escapeHtml } from './markdown.js';
import { bone, boneButton } from './skeleton.js';
import { PRIVATE_NOTE, hiddenMapsMessage } from '../visibility.js';

export interface RepositoryHandOffStatus {
  repo: string;
  mapNumber: number | null;
  ticketNumber?: number | null;
  status: string;
  stale: boolean;
  pendingApproval?: boolean;
  pendingUserInput?: boolean;
  branch?: string | null;
  pullRequests?: readonly {
    state?: string | null;
    checksState?: string | null;
    reviewDecision?: string | null;
    isDraft?: boolean | null;
  }[];
}

export function countRunningHandOffs(repo: string, handOffs: readonly RepositoryHandOffStatus[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const handOff of handOffs) {
    if (handOff.repo.toLocaleLowerCase() !== repo.toLocaleLowerCase() || handOff.mapNumber === null || handOff.status !== 'running' || handOff.stale) continue;
    counts.set(handOff.mapNumber, (counts.get(handOff.mapNumber) ?? 0) + 1);
  }
  return counts;
}

/** Distinct map tickets that currently need a person to step in. */
export function needsYouTicketNumbers(repo: string, map: WayfinderMap, handOffs: readonly RepositoryHandOffStatus[]): number[] {
  const ticketsByNumber = new Map(map.tickets.map((ticket) => [ticket.number, ticket]));
  const needsYou = new Set(map.stalled.map((stall) => stall.ticket).filter((number) => ticketsByNumber.has(number)));
  for (const handOff of handOffs) {
    if (handOff.repo.toLocaleLowerCase() !== repo.toLocaleLowerCase() || handOff.mapNumber !== map.number) continue;
    const number = handOff.ticketNumber;
    if (number === null || number === undefined) continue;
    const ticket = ticketsByNumber.get(number);
    if (ticket === undefined) continue;
    const pullRequests = handOff.pullRequests ?? [];
    const needsThread = handOff.pendingApproval === true || handOff.pendingUserInput === true || handOff.status === 'waiting' || handOff.status === 'failed';
    const prototypeReady = ticket.type === 'prototype' && handOff.branch !== null && handOff.branch !== undefined && new RegExp('^prototype/' + String(number) + '(?:-|$)').test(handOff.branch);
    const needsCi = pullRequests.some((pullRequest) =>
      pullRequest.state?.toLocaleLowerCase() === 'open' && ['failing', 'failure', 'error'].includes(pullRequest.checksState?.toLocaleLowerCase() ?? ''),
    );
    const reviewReady = pullRequests.some((pullRequest) =>
      pullRequest.state?.toLocaleLowerCase() === 'open' &&
      pullRequest.isDraft === false &&
      ['passing', 'success'].includes(pullRequest.checksState?.toLocaleLowerCase() ?? '') &&
      ['review_required', 'review required'].includes(pullRequest.reviewDecision?.toLocaleLowerCase() ?? ''),
    );
    if (needsThread || prototypeReady || needsCi || reviewReady) needsYou.add(number);
  }
  const order = new Map(map.tickets.map((ticket, index) => [ticket.number, index]));
  return Array.from(needsYou).sort((a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER));
}

/** Active maps, open first and newest first within each state. */
export function sortRepositoryMaps(maps: readonly WayfinderMap[]): WayfinderMap[] {
  return [...maps].sort((a, b) => Number(b.open) - Number(a.open) || b.number - a.number);
}

/** Settled maps, the most recently settled first. */
export function sortSettledMaps(maps: readonly WayfinderMap[]): WayfinderMap[] {
  return [...maps].sort((a, b) => (b.settled?.since ?? '').localeCompare(a.settled?.since ?? '') || b.number - a.number);
}

export function mapMatchesRepositorySearch(map: WayfinderMap, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return normalizedQuery.length === 0 || `#${String(map.number)} ${map.title}`.toLocaleLowerCase().includes(normalizedQuery);
}

function stateCounts(map: WayfinderMap): string {
  const counts = countStates(map);
  const rows = STATE_ORDER.filter((state) => counts[state] > 0)
    .map((state) => `<span style="--c: var(${STATE_STYLE[state].variable})"><i aria-hidden="true"></i>${String(counts[state])} ${escapeHtml(STATE_STYLE[state].long.toLocaleLowerCase())}</span>`)
    .join('');
  return rows || '<span>No tickets yet</span>';
}

function nextTicket(map: WayfinderMap): Ticket | undefined {
  return map.tickets.find((ticket) => ticket.state === 'frontier');
}

function runningHandOffChip(mapNumber: number, count: number | undefined): string {
  const visible = count !== undefined && count > 0;
  return `<span class="chip" data-map-handoffs="${String(mapNumber)}" style="--accent: var(--state-frontier)"${visible ? '' : ' hidden'}><span data-icon="bolt" aria-hidden="true"></span>${visible ? `${String(count)} running in T3 Code` : ''}</span>`;
}

function needsYouChip(repo: string, map: WayfinderMap): string {
  const tickets = needsYouTicketNumbers(repo, map, []);
  const firstTicket = tickets[0];
  const visible = firstTicket !== undefined;
  const href = visible ? `${mapPath(repo, map.number)}?view=map&ticket=${String(firstTicket)}` : mapPath(repo, map.number);
  return `<a class="chip needs-you-chip" data-map-needs-you="${String(map.number)}" href="${escapeHtml(href)}"${visible ? '' : ' hidden'}><span data-icon="bell" aria-hidden="true"></span>${visible ? `${String(tickets.length)} needs you` : ''}</a>`;
}

/** Who opened the map, and whether it is private or public in Wayfinder. A private map always carries the note. */
export function visibilityStatus(map: WayfinderMap): string {
  const author = map.author === null ? '' : `<span class="wf-author">by ${escapeHtml(map.author)}</span>`;
  const status =
    map.visibility === 'public'
      ? '<span class="wf-vis-label">Public</span>'
      : `<span class="wf-vis-label"><span data-icon="lock" aria-hidden="true"></span>Private</span> <span class="wf-vis-note">${escapeHtml(PRIVATE_NOTE)}</span>`;
  return `<p class="wf-visibility" data-map-visibility="${map.visibility}">${author}${status}</p>`;
}

function settleButton(map: WayfinderMap): string {
  return `<button type="button" class="ghost" data-settle-map="${String(map.number)}" aria-label="${escapeHtml(`Settle map #${String(map.number)}: ${map.title}`)}" title="Move to Settled. The issue on GitHub is not changed.">Settle</button>`;
}

const SETTLE_REASON: Record<MapSettlement['reason'], string> = {
  closed: 'closed',
  idle: 'quiet for 30 days',
  manual: 'settled by you',
};

/** How long ago a map settled: `today`, `3 days ago`, `2 months ago`, `1 year ago`. */
export function settledAgo(since: string, now: number): string {
  const parsed = Date.parse(since);
  if (Number.isNaN(parsed)) return '';
  const days = Math.floor(Math.max(0, now - parsed) / 86_400_000);
  const ago = (count: number, unit: string): string => `${String(count)} ${unit}${count === 1 ? '' : 's'} ago`;
  if (days === 0) return 'today';
  if (days < 30) return ago(days, 'day');
  if (days < 365) return ago(Math.floor(days / 30), 'month');
  return ago(Math.floor(days / 365), 'year');
}

function settledRow(repo: string, map: WayfinderMap, now: number): string {
  const href = mapPath(repo, map.number);
  const since = map.settled?.since ?? '';
  const ago = settledAgo(since, now);
  const why = map.settled === null ? '' : SETTLE_REASON[map.settled.reason];
  return `<li class="wf-settled-row" data-map-card data-map-number="${String(map.number)}" data-map-search="${escapeHtml(`#${String(map.number)} ${map.title}`)}">
      <a class="grow" href="${escapeHtml(href)}"><span class="num">#${String(map.number)}</span> ${escapeHtml(map.title)}</a>
      <span class="when">${ago === '' ? '' : `Settled <time datetime="${escapeHtml(since)}">${escapeHtml(ago)}</time>`}${why === '' ? '' : ` · ${escapeHtml(why)}`}</span>
      <button type="button" class="ghost" data-unsettle-map="${String(map.number)}" aria-label="${escapeHtml(`Unsettle map #${String(map.number)}: ${map.title}`)}">Unsettle</button>
      ${visibilityStatus(map)}
    </li>`;
}

/** Collapsed behind "Show N settled"; the page's script opens it. */
function settledSection(repo: string, maps: readonly WayfinderMap[], now: number): string {
  if (maps.length === 0) return '';
  return `<section class="wf-settled" aria-label="Settled maps" data-repo-settled>
      <button type="button" class="wf-settled-toggle" data-settled-toggle aria-expanded="false" aria-controls="repo-settled-list"><span data-icon="right" aria-hidden="true"></span><span data-settled-label>Show ${String(maps.length)} settled</span></button>
      <ul class="wf-settled-list" id="repo-settled-list" hidden>${maps.map((map) => settledRow(repo, map, now)).join('')}</ul>
    </section>`;
}

/** "3 of 6 tickets done", from the map's sub-issues. */
export function publicMapProgress(progress: PublicMap['progress']): string {
  if (progress.total === 0) return 'No tickets yet';
  return `${String(progress.completed)} of ${String(progress.total)} ticket${progress.total === 1 ? '' : 's'} done`;
}

function publicMapRow(repo: string, map: PublicMap): string {
  const name = `#${String(map.number)}: ${map.title}`;
  // A followed map opens here; one you don't follow isn't on your list, so it opens on GitHub.
  const link = map.followed
    ? `<a class="grow" href="${escapeHtml(mapPath(repo, map.number))}">`
    : `<a class="grow" href="${escapeHtml(map.url)}" target="_blank" rel="noreferrer">`;
  const percent = map.progress.total === 0 ? 0 : Math.round((map.progress.completed / map.progress.total) * 100);
  const action = map.followed
    ? `<button type="button" class="ghost" data-unfollow-map="${String(map.number)}" aria-label="${escapeHtml(`Unfollow map ${name}`)}">Unfollow</button>`
    : `<button type="button" class="primary" data-follow-map="${String(map.number)}" aria-label="${escapeHtml(`Follow map ${name}`)}">Follow</button>`;
  return `<li class="wf-public-row" data-public-map="${String(map.number)}" data-followed="${String(map.followed)}">
      ${link}<span class="num">#${String(map.number)}</span> ${escapeHtml(map.title)}${map.open ? '' : ' <span class="num">· closed</span>'}${map.followed ? '' : '<span data-icon="external" aria-hidden="true"></span><span class="sr-only"> (opens on GitHub)</span>'}</a>
      <span class="wf-author">by ${escapeHtml(map.author)}</span>
      <span class="wf-public-progress"><span class="bar" aria-hidden="true"><i style="width: ${String(percent)}%"></i></span>${escapeHtml(publicMapProgress(map.progress))}</span>
      ${map.followed ? '<span class="wf-following"><span data-icon="check" aria-hidden="true"></span>Following</span>' : ''}
      ${action}
    </li>`;
}

/** Other people's public maps, to follow into your list or unfollow out of it. Absent when there are none. */
export function publicMapsSection(repo: string, maps: readonly PublicMap[]): string {
  if (maps.length === 0) return '';
  const following = maps.filter((map) => map.followed).length;
  return `<section class="wf-public" aria-labelledby="repo-public-title" data-repo-public>
      <h2 id="repo-public-title">Public maps <span class="count">${String(maps.length)}${following === 0 ? '' : ` · ${String(following)} followed`}</span></h2>
      <p class="wf-public-lede">Maps other people made public in this repository. Follow one to add it to your maps.</p>
      <ul class="wf-public-list">${maps.map((map) => publicMapRow(repo, map)).join('')}</ul>
    </section>`;
}

function mapCard(repo: string, map: WayfinderMap, runningHandOffCount?: number): string {
  const href = mapPath(repo, map.number);
  const next = nextTicket(map);
  const status = map.open ? 'active' : 'completed';
  const destination = map.sections.destination.trim() || 'No destination has been written yet.';
  const label = `Open map #${String(map.number)}: ${map.title}`;
  const total = countStates(map);
  const ticketCount = STATE_ORDER.reduce((sum, state) => sum + total[state], 0);
  const footer = !map.open
    ? `<span class="grow">All ${String(ticketCount)} tickets done</span>${settleButton(map)}<a class="ghost" href="${escapeHtml(href)}" aria-label="${escapeHtml(label)}">Open</a>`
    : `<span class="grow">${next === undefined ? 'Nothing next up' : `<span class="chip" style="--accent: var(--state-frontier)"><span data-icon="arrow" aria-hidden="true"></span>next</span> <a href="${escapeHtml(`${href}?view=map&ticket=${String(next.number)}`)}">#${String(next.number)} ${escapeHtml(next.title)}</a>`}</span>${needsYouChip(repo, map)}${runningHandOffChip(map.number, runningHandOffCount)}${settleButton(map)}<a class="primary" href="${escapeHtml(href)}" aria-label="${escapeHtml(label)}">Open<span data-icon="arrow" aria-hidden="true"></span></a>`;
  return `<article class="wf-node wf-map${map.open ? '' : ' is-closed'}" data-map-card data-map-number="${String(map.number)}" data-map-status="${status}" data-map-search="${escapeHtml(`#${String(map.number)} ${map.title}`)}" style="--accent: var(${map.open ? '--state-claimed' : '--state-done'})">
    <a class="graph" href="${escapeHtml(href)}" aria-label="${escapeHtml(label)}" tabindex="-1" title="Ticket dependency graph with ${String(map.tickets.length)} tickets">${miniGraphSvg(map)}</a>
    <div class="txt">
      <p class="eyebrow">Map · #${String(map.number)}${map.open ? '' : ' · completed'}</p>
      <h2><a href="${escapeHtml(href)}">${escapeHtml(map.title)}</a></h2>
      <p class="dest" title="${escapeHtml(destination)}">${escapeHtml(destination)}</p>
      ${visibilityStatus(map)}
      <div class="wf-counts" aria-label="Ticket counts">${stateCounts(map)}</div>
      <div class="row2">${footer}</div>
    </div>
  </article>`;
}

function repositoryEmpty(repo: string, hiddenMaps: number): string {
  const name = repo.split('/')[1] ?? repo;
  return `<section class="wf-node wf-empty" aria-labelledby="repo-empty-title" style="--accent: var(--state-frontier)">
    <div class="graph" aria-hidden="true"><span class="ghostnode">Destination</span></div>
    <div class="txt">
      <h2 id="repo-empty-title">${hiddenMaps > 0 ? 'No maps of yours' : 'No maps'} in ${escapeHtml(name)} yet</h2>
      <p>A map is a graph of tickets toward one destination. Start one and T3 Code drafts it with you, right here.</p>
      <a class="primary" href="${escapeHtml(newMapPath(repo))}"><span data-icon="plus" aria-hidden="true"></span>Start a new map</a>
    </div>
  </section>`;
}

export function repositoryPageHtml(
  repo: string,
  snapshot: MapSnapshot,
  runningHandOffs: ReadonlyMap<number, number> = new Map(),
  now: number = Date.now(),
): string {
  const maps = sortRepositoryMaps(snapshot.maps.filter((map) => map.settled === null));
  const settled = sortSettledMaps(snapshot.maps.filter((map) => map.settled !== null));
  const name = repo.split('/')[1] ?? repo;
  const counts = snapshot.maps.length === 0 ? 'no maps yet' : `${String(maps.length)} active, ${String(settled.length)} settled`;
  const hidden = hiddenMapsMessage(snapshot.hiddenMaps);
  const hiddenNote = hidden === '' ? '' : `<p class="wf-hidden-maps" data-repo-hidden-maps><span data-icon="lock" aria-hidden="true"></span>${escapeHtml(hidden)}</p>`;
  const mapContent = snapshot.maps.length === 0
    ? repositoryEmpty(repo, snapshot.hiddenMaps)
    : `<section class="repo-map-section" aria-label="Repository maps">
        <div class="wf-filters">
          <label class="search"><span data-icon="lens" aria-hidden="true"></span><span class="sr-only">Filter maps</span><input id="repo-map-search" type="search" placeholder="Filter maps" autocomplete="off" /></label>
        </div>
        <div class="wf-maps" data-repo-map-list>${maps.map((map) => mapCard(repo, map, runningHandOffs.get(map.number))).join('')}</div>
        <p class="wf-none" data-repo-map-no-match role="status" aria-live="polite"${maps.length === 0 ? '' : ' hidden'}>${maps.length === 0 ? 'Every map here has settled.' : 'No maps match this filter.'}</p>
        <p class="sr-only" data-repo-map-count role="status" aria-live="polite"></p>
        ${settledSection(repo, settled, now)}
      </section>`;
  const warnings = snapshot.warnings
    .map((warning) => `<div class="panel is-warning"><span class="grow">${escapeHtml(warning)}</span></div>`)
    .join('');

  return `<div class="repository-page wf-repo-page" data-repository-page>
    <header class="wf-head">${repoIconHtml(repo, 'lg')}<div class="grow"><h1>${escapeHtml(name)}</h1><p>${escapeHtml(repo)} · ${counts}</p></div></header>
    ${warnings}
    ${hiddenNote}
    ${mapContent}
    ${publicMapsSection(repo, snapshot.publicMaps)}
  </div>`;
}

const MAP_CARD_SKELETON = `<div class="wf-node wf-map is-skeleton"><div class="graph"></div><div class="txt">
    <p class="eyebrow">${bone('90px')}</p>
    <h2>${bone('60%')}</h2>
    <p class="dest">${bone('95%')}<br />${bone('70%')}</p>
    <div class="wf-counts">${bone('64px')}${bone('72px')}${bone('56px')}</div>
    <div class="row2"><span class="grow">${bone('45%')}</span>${boneButton('74px')}</div>
  </div></div>`;

/** The repository page before its snapshot arrives: the real header, then placeholder filters and map cards. */
export function repositoryLoadingHtml(repo: string): string {
  const name = repo.split('/')[1] ?? repo;
  return `<div class="repository-page wf-repo-page is-loading" role="status" aria-live="polite" aria-label="Loading ${escapeHtml(repo)} maps">
    <header class="wf-head">${repoIconHtml(repo, 'lg')}<div class="grow"><h1>${escapeHtml(name)}</h1><p>${escapeHtml(repo)} · ${bone('150px')}</p></div></header>
    <div class="repo-map-section" aria-hidden="true">
      <div class="wf-filters"><span class="search"></span></div>
      <div class="wf-maps">${MAP_CARD_SKELETON.repeat(3)}</div>
    </div>
  </div>`;
}

export function repositoryLoadErrorHtml(message: string): string {
  return `<section class="repo-load-error" role="alert" aria-labelledby="repo-load-error-title">
    <p class="eyebrow">Repository unavailable</p>
    <h1 id="repo-load-error-title">Could not load these maps</h1>
    <p>${escapeHtml(message)}</p>
    <button type="button" class="ghost" data-retry-page><span data-icon="refresh" aria-hidden="true"></span>Try again</button>
  </section>`;
}
