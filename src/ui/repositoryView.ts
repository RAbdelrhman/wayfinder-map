import type { MapSnapshot, Ticket, WayfinderMap } from '../types.js';
import { mapPath } from '../repoRoutes.js';
import { newMapPath } from './newMap.js';
import { STATE_ORDER, STATE_STYLE, countStates, progressRing, repoIconHtml } from './chrome.js';
import { escapeHtml } from './markdown.js';
import { icon } from './icons.js';

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

function stateRows(map: WayfinderMap): string {
  const counts = countStates(map);
  const rows = STATE_ORDER.filter((state) => counts[state] > 0)
    .map(
      (state) =>
        `<span class="repo-map-state" style="--accent: var(${STATE_STYLE[state].variable})">${icon(STATE_STYLE[state].icon)}<span>${escapeHtml(
          STATE_STYLE[state].long,
        )}</span><b>${String(counts[state])}</b></span>`,
    )
    .join('');
  return rows || '<span class="repo-map-state-empty">No tickets yet</span>';
}

function graphPoint(index: number, columns: number, rowCount: number): { x: number; y: number } {
  const column = index % columns;
  const row = Math.floor(index / columns);
  const width = 320;
  const height = Math.max(170, rowCount * 28 + 24);
  return {
    x: columns === 1 ? width / 2 : 18 + (column * (width - 36)) / (columns - 1),
    y: rowCount === 1 ? height / 2 : 14 + (row * (height - 28)) / (rowCount - 1),
  };
}

function mapMiniGraph(map: WayfinderMap): string {
  if (map.tickets.length === 0) {
    return `<svg class="repo-map-graph-svg" viewBox="0 0 320 170" role="img" aria-label="Empty map destination sketch">
      <path class="repo-map-sketch-edge" d="M160 68v24" />
      <rect class="repo-map-sketch-node" x="94" y="30" width="132" height="38" rx="10" />
      <rect class="repo-map-sketch-destination" x="108" y="92" width="104" height="40" rx="10" />
      <text class="repo-map-sketch-label" x="160" y="117" text-anchor="middle">Destination</text>
    </svg>`;
  }

  const columns = Math.min(6, map.tickets.length);
  const rowCount = Math.ceil(map.tickets.length / columns);
  const height = Math.max(170, rowCount * 28 + 24);
  const points = new Map<number, { x: number; y: number }>();
  map.tickets.forEach((ticket, index) => points.set(ticket.number, graphPoint(index, columns, rowCount)));

  const edges = map.tickets
    .flatMap((ticket) =>
      ticket.blockedBy.flatMap((blockerNumber) => {
        const from = points.get(blockerNumber);
        const to = points.get(ticket.number);
        return from === undefined || to === undefined
          ? []
          : [`<path class="repo-map-graph-edge" d="M${String(from.x)} ${String(from.y)} L${String(to.x)} ${String(to.y)}" />`];
      }),
    )
    .join('');
  const nodes = map.tickets
    .map((ticket) => {
      const point = points.get(ticket.number);
      if (point === undefined) return '';
      const variable = STATE_STYLE[ticket.state].variable;
      return `<rect class="repo-map-graph-node" x="${String(point.x - 8)}" y="${String(point.y - 6)}" width="16" height="12" rx="5" style="--accent: var(${variable})" />`;
    })
    .join('');
  return `<svg class="repo-map-graph-svg" viewBox="0 0 320 ${String(height)}" role="img" aria-label="Ticket dependency graph with ${String(map.tickets.length)} tickets">${edges}${nodes}</svg>`;
}

function nextTicket(map: WayfinderMap): Ticket | undefined {
  return map.tickets.find((ticket) => ticket.state === 'frontier');
}

function runningHandOffLine(mapNumber: number, count: number | undefined): string {
  const visible = count !== undefined && count > 0;
  return `<span class="repo-map-handoffs" data-map-handoffs="${String(mapNumber)}"${visible ? '' : ' hidden'}>${visible ? `${String(count)} running in T3 Code` : ''}</span>`;
}

function mapCard(repo: string, map: WayfinderMap, runningHandOffCount?: number): string {
  const href = mapPath(repo, map.number);
  const next = nextTicket(map);
  const nextHref = next === undefined ? '' : `${href}?view=map&ticket=${String(next.number)}`;
  const status = map.open ? 'active' : 'completed';
  const edge = map.open ? '--state-frontier' : '--state-done';
  const destination = map.sections.destination.trim() || 'No destination has been written yet.';
  const nextHtml = next === undefined
    ? `<p class="repo-map-next is-none">${map.open ? 'No unblocked ticket is ready yet.' : 'This map is complete.'}</p>`
    : `<p class="repo-map-next"><span>Next</span><a href="${escapeHtml(nextHref)}">#${String(next.number)} · ${escapeHtml(next.title)}</a></p>`;

  return `<article class="repo-map-card${map.open ? '' : ' is-completed'}" data-map-card data-map-number="${String(map.number)}" data-map-status="${status}" data-map-search="${escapeHtml(`#${String(map.number)} ${map.title}`)}" style="--map-accent: var(${edge})">
    <a class="repo-map-graph-link" href="${escapeHtml(href)}" aria-label="Open map #${String(map.number)}: ${escapeHtml(map.title)}">${mapMiniGraph(map)}</a>
    <div class="repo-map-details">
      <div class="repo-map-card-heading">
        <div class="repo-map-heading-copy">
          <p class="eyebrow">Map · #${String(map.number)} · ${map.open ? 'Active' : 'Completed'}</p>
          <h2><a href="${escapeHtml(href)}">${escapeHtml(map.title)}</a></h2>
        </div>
      <a class="ghost repo-map-open" href="${escapeHtml(href)}" aria-label="Open map #${String(map.number)}: ${escapeHtml(map.title)}">Open<span data-icon="arrow" aria-hidden="true"></span></a>
      </div>
      <p class="repo-map-destination" title="${escapeHtml(destination)}">${escapeHtml(destination)}</p>
      <div class="repo-map-summary" aria-label="Ticket counts">${stateRows(map)}</div>
      <div class="repo-map-card-footer">${nextHtml}${runningHandOffLine(map.number, runningHandOffCount)}</div>
    </div>
  </article>`;
}

function repositoryEmptySketch(): string {
  return `<svg class="repo-empty-sketch" viewBox="0 0 320 170" aria-hidden="true">
    <path class="repo-map-sketch-edge" d="M160 74v23" />
    <rect class="repo-map-sketch-node" x="92" y="34" width="136" height="40" rx="11" />
    <rect class="repo-map-sketch-destination" x="104" y="97" width="112" height="42" rx="11" />
    <text class="repo-map-sketch-label" x="160" y="123" text-anchor="middle">Destination</text>
  </svg>`;
}

function repositoryEmpty(repo: string): string {
  return `<section class="repo-empty-card" aria-labelledby="repo-empty-title">
    <div class="repo-empty-visual">${repositoryEmptySketch()}</div>
    <div class="repo-empty-copy">
      <p class="eyebrow">No maps yet</p>
      <h2 id="repo-empty-title">A destination for ${escapeHtml(repo)}</h2>
      <p>A map turns a repository goal into a graph of tickets. Start one here and T3 Code will draft it with you.</p>
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
  const github = `https://github.com/${repo}`;
  const mapContent = maps.length === 0
    ? repositoryEmpty(repo)
    : `<section class="repo-map-section" aria-label="Repository maps">
        <div class="repo-map-controls">
          <div class="repo-map-filters" role="group" aria-label="Filter maps">
            <button type="button" class="repo-filter is-selected" data-map-filter="all" aria-pressed="true">All <span>${String(maps.length)}</span></button>
            <button type="button" class="repo-filter" data-map-filter="active" aria-pressed="false">Active <span>${String(activeCount)}</span></button>
            <button type="button" class="repo-filter" data-map-filter="completed" aria-pressed="false">Completed <span>${String(completedCount)}</span></button>
          </div>
          <label class="repo-map-search"><span data-icon="lens" aria-hidden="true"></span><span class="sr-only">Filter maps</span><input id="repo-map-search" type="search" placeholder="Filter maps" autocomplete="off" /></label>
        </div>
        <div class="repo-map-list" data-repo-map-list>${maps.map((map) => mapCard(repo, map, runningHandOffs.get(map.number))).join('')}</div>
        <p class="repo-map-no-match" data-repo-map-no-match role="status" aria-live="polite" hidden>No maps match this filter.</p>
        <p class="sr-only" data-repo-map-count role="status" aria-live="polite"></p>
      </section>`;
  const warnings = snapshot.warnings
    .map((warning) => `<div class="panel is-warning"><span class="grow">${escapeHtml(warning)}</span></div>`)
    .join('');

  return `<div class="repository-page" data-repository-page>
    <header class="page-head repository-head">
      <div class="grow">
        <p class="eyebrow">Repository</p>
        <div class="page-title-row">${repoIconHtml(repo, 'lg')}<h1>${escapeHtml(repo)}</h1></div>
        <p class="repository-map-counts"><span>${String(activeCount)} active</span><span>${String(completedCount)} completed</span></p>
      </div>
      <div class="page-actions"><a class="ghost" href="${escapeHtml(github)}" target="_blank" rel="noreferrer"><span data-icon="external" aria-hidden="true"></span>GitHub</a></div>
    </header>
    ${warnings}
    ${mapContent}
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
