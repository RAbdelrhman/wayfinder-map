import type { MapSnapshot, Ticket, WayfinderMap } from '../types.js';
import { mapPath } from '../repoRoutes.js';
import { newMapPath } from './newMap.js';
import { STATE_ORDER, STATE_STYLE, countStates, repoIconHtml } from './chrome.js';
import { miniGraphSvg } from './miniGraph.js';
import { escapeHtml } from './markdown.js';
import { bone, boneButton } from './skeleton.js';

export type RepositoryMapFilter = 'all' | 'active' | 'completed';

export interface RepositoryHandOffStatus {
  repo: string;
  mapNumber: number | null;
  status: string;
  stale: boolean;
}

export function countRunningHandOffs(repo: string, handOffs: readonly RepositoryHandOffStatus[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const handOff of handOffs) {
    if (handOff.repo.toLocaleLowerCase() !== repo.toLocaleLowerCase() || handOff.mapNumber === null || handOff.status !== 'running' || handOff.stale) continue;
    counts.set(handOff.mapNumber, (counts.get(handOff.mapNumber) ?? 0) + 1);
  }
  return counts;
}

export function sortRepositoryMaps(maps: readonly WayfinderMap[]): WayfinderMap[] {
  return [...maps].sort((a, b) => Number(b.open) - Number(a.open) || b.number - a.number);
}

export function mapMatchesRepositoryFilter(
  map: WayfinderMap,
  filter: RepositoryMapFilter,
  query: string,
): boolean {
  if (filter === 'active' && !map.open) return false;
  if (filter === 'completed' && map.open) return false;
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

function mapCard(repo: string, map: WayfinderMap, runningHandOffCount?: number): string {
  const href = mapPath(repo, map.number);
  const next = nextTicket(map);
  const status = map.open ? 'active' : 'completed';
  const destination = map.sections.destination.trim() || 'No destination has been written yet.';
  const label = `Open map #${String(map.number)}: ${map.title}`;
  const total = countStates(map);
  const ticketCount = STATE_ORDER.reduce((sum, state) => sum + total[state], 0);
  const footer = !map.open
    ? `<span class="grow">All ${String(ticketCount)} tickets done</span><a class="ghost" href="${escapeHtml(href)}" aria-label="${escapeHtml(label)}">Open</a>`
    : `<span class="grow">${next === undefined ? 'Nothing next up' : `<span class="chip" style="--accent: var(--state-frontier)"><span data-icon="arrow" aria-hidden="true"></span>next</span> <a href="${escapeHtml(`${href}?view=map&ticket=${String(next.number)}`)}">#${String(next.number)} ${escapeHtml(next.title)}</a>`}</span>${runningHandOffChip(map.number, runningHandOffCount)}<a class="primary" href="${escapeHtml(href)}" aria-label="${escapeHtml(label)}">Open<span data-icon="arrow" aria-hidden="true"></span></a>`;
  return `<article class="wf-node wf-map${map.open ? '' : ' is-closed'}" data-map-card data-map-number="${String(map.number)}" data-map-status="${status}" data-map-search="${escapeHtml(`#${String(map.number)} ${map.title}`)}" style="--accent: var(${map.open ? '--state-claimed' : '--state-done'})">
    <a class="graph" href="${escapeHtml(href)}" aria-label="${escapeHtml(label)}" tabindex="-1" title="Ticket dependency graph with ${String(map.tickets.length)} tickets">${miniGraphSvg(map)}</a>
    <div class="txt">
      <p class="eyebrow">Map · #${String(map.number)}${map.open ? '' : ' · completed'}</p>
      <h2><a href="${escapeHtml(href)}">${escapeHtml(map.title)}</a></h2>
      <p class="dest" title="${escapeHtml(destination)}">${escapeHtml(destination)}</p>
      <div class="wf-counts" aria-label="Ticket counts">${stateCounts(map)}</div>
      <div class="row2">${footer}</div>
    </div>
  </article>`;
}

function repositoryEmpty(repo: string): string {
  const name = repo.split('/')[1] ?? repo;
  return `<section class="wf-node wf-empty" aria-labelledby="repo-empty-title" style="--accent: var(--state-frontier)">
    <div class="graph" aria-hidden="true"><span class="ghostnode">Destination</span></div>
    <div class="txt">
      <h2 id="repo-empty-title">No maps in ${escapeHtml(name)} yet</h2>
      <p>A map is a graph of tickets toward one destination. Start one and T3 Code drafts it with you, right here.</p>
      <a class="primary" href="${escapeHtml(newMapPath(repo))}"><span data-icon="plus" aria-hidden="true"></span>Start a new map</a>
    </div>
  </section>`;
}

export function repositoryPageHtml(
  repo: string,
  snapshot: MapSnapshot,
  runningHandOffs: ReadonlyMap<number, number> = new Map(),
): string {
  const maps = sortRepositoryMaps(snapshot.maps);
  const activeCount = maps.filter((map) => map.open).length;
  const completedCount = maps.length - activeCount;
  const name = repo.split('/')[1] ?? repo;
  const counts = maps.length === 0 ? 'no maps yet' : `${String(activeCount)} active, ${String(completedCount)} completed`;
  const mapContent = maps.length === 0
    ? repositoryEmpty(repo)
    : `<section class="repo-map-section" aria-label="Repository maps">
        <div class="wf-filters">
          <div class="wf-filter-chips" role="group" aria-label="Filter maps">
            <button type="button" class="fchip is-on" data-map-filter="all" aria-pressed="true">All <b>${String(maps.length)}</b></button>
            <button type="button" class="fchip" data-map-filter="active" aria-pressed="false">Active <b>${String(activeCount)}</b></button>
            <button type="button" class="fchip" data-map-filter="completed" aria-pressed="false">Completed <b>${String(completedCount)}</b></button>
          </div>
          <label class="search"><span data-icon="lens" aria-hidden="true"></span><span class="sr-only">Filter maps</span><input id="repo-map-search" type="search" placeholder="Filter maps" autocomplete="off" /></label>
        </div>
        <div class="wf-maps" data-repo-map-list>${maps.map((map) => mapCard(repo, map, runningHandOffs.get(map.number))).join('')}</div>
        <p class="wf-none" data-repo-map-no-match role="status" aria-live="polite" hidden>No maps match this filter.</p>
        <p class="sr-only" data-repo-map-count role="status" aria-live="polite"></p>
      </section>`;
  const warnings = snapshot.warnings
    .map((warning) => `<div class="panel is-warning"><span class="grow">${escapeHtml(warning)}</span></div>`)
    .join('');

  return `<div class="repository-page wf-repo-page" data-repository-page>
    <header class="wf-head">${repoIconHtml(repo, 'lg')}<div class="grow"><h1>${escapeHtml(name)}</h1><p>${escapeHtml(repo)} · ${counts}</p></div></header>
    ${warnings}
    ${mapContent}
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
      <div class="wf-filters"><div class="wf-filter-chips"><span class="fchip">${bone('26px')}</span><span class="fchip">${bone('44px')}</span><span class="fchip">${bone('70px')}</span></div><span class="search"></span></div>
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
