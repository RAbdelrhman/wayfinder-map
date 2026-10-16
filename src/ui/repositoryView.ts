import type { MapSettlement, MapSnapshot, PublicMap, Ticket, WayfinderMap } from '../types.js';
import { archivedMapsPath, mapPath, repoPath } from '../repoRoutes.js';
import { newMapPath } from './newMap.js';
import { STATE_ORDER, STATE_STYLE, countStates, miniRing, repoIconHtml } from './chrome.js';
import { miniGraphSvg } from './miniGraph.js';
import { escapeHtml } from './markdown.js';
import { bone, boneButton } from './skeleton.js';
import { PRIVATE_NOTE, hiddenMapsMessage } from '../visibility.js';
import { ARCHIVE_REASONS, REASON_ORDER, archiveAgo, archiveDay, archiveWhy, reasonHtml, restoreButtonHtml, saveErrorHtml } from './archive.js';

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

/** Archived maps grouped by reason in the contract's order, the most recently archived first in each group. */
export function sortArchivedMaps(maps: readonly WayfinderMap[]): WayfinderMap[] {
  const rank = (map: WayfinderMap): number => (map.settled === null ? REASON_ORDER.length : REASON_ORDER.indexOf(map.settled.reason));
  return [...maps].sort((a, b) => rank(a) - rank(b) || (b.settled?.since ?? '').localeCompare(a.settled?.since ?? '') || b.number - a.number);
}

export function mapMatchesRepositorySearch(map: WayfinderMap, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return normalizedQuery.length === 0 || `#${String(map.number)} ${map.title}`.toLocaleLowerCase().includes(normalizedQuery);
}

export type RepositoryView = 'active' | 'archived';

/** What the repository page shows besides its snapshot. The page keeps one and redraws from it. */
export interface RepositoryPageState {
  view: RepositoryView;
  /** The filter of the list showing. */
  query: string;
  /** The selected map in each list. Null, or a map the list no longer shows, selects its first. */
  activeSelected: number | null;
  archivedSelected: number | null;
  /** The map whose Archive or Restore is being saved. */
  pending: number | null;
  saveError: { kind: 'archive' | 'restore'; mapNumber: number; message: string } | null;
  /** The last refresh from GitHub failed, so this snapshot is older. */
  stale: boolean;
}

export interface RepositoryPageContext {
  handOffs: readonly RepositoryHandOffStatus[];
  /** Whether Auto map is on for a map. Archiving pauses it and keeps the setting. */
  autoMap: (mapNumber: number) => boolean;
  /** The signed-in login, whose archive this is. */
  login: string | null;
  now: number;
}

export function initialRepositoryState(view: RepositoryView = 'active'): RepositoryPageState {
  return { view, query: '', activeSelected: null, archivedSelected: null, pending: null, saveError: null, stale: false };
}

const isArchived = (map: WayfinderMap): boolean => map.settled !== null;

/** The maps the showing list holds, after its filter, in list order. */
export function visibleMaps(snapshot: MapSnapshot, state: RepositoryPageState): WayfinderMap[] {
  const maps = state.view === 'active' ? sortRepositoryMaps(snapshot.maps.filter((map) => !isArchived(map))) : sortArchivedMaps(snapshot.maps.filter(isArchived));
  return maps.filter((map) => mapMatchesRepositorySearch(map, state.query));
}

/** The selected map of the showing list: the chosen one while the filter keeps it, else the first. */
export function selectedMap(snapshot: MapSnapshot, state: RepositoryPageState): WayfinderMap | null {
  const list = visibleMaps(snapshot, state);
  const chosen = state.view === 'active' ? state.activeSelected : state.archivedSelected;
  return list.find((map) => map.number === chosen) ?? list[0] ?? null;
}

/** After Archive or Restore takes a map out of a list, the map now in its place, or the last one. */
export function nextSelection(before: readonly number[], removed: number): number | null {
  const index = before.indexOf(removed);
  const remaining = before.filter((number) => number !== removed);
  if (remaining.length === 0) return null;
  return remaining[Math.min(Math.max(index, 0), remaining.length - 1)] ?? null;
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

function plural(count: number, one: string): string {
  return `${String(count)} ${one}${count === 1 ? '' : 's'}`;
}

function destinationOf(map: WayfinderMap): string {
  return map.sections.destination.trim() || 'No destination has been written yet.';
}

/** "3 of 7 tickets done · 1 running · 1 needs you" */
export function activeProgress(map: WayfinderMap, running: number, needsYou: number): string {
  const done = map.tickets.filter((ticket) => ticket.state === 'done').length;
  const tickets = map.tickets.length === 0 ? 'No tickets yet' : `${String(done)} of ${plural(map.tickets.length, 'ticket')} done`;
  return `${tickets}${running > 0 ? ` · ${String(running)} running` : ''}${needsYou > 0 ? ` · ${String(needsYou)} needs you` : ''}`;
}

/** "2 minutes ago", for how old the snapshot on screen is. */
function snapshotAge(fetchedAt: string, now: number): string {
  const parsed = Date.parse(fetchedAt);
  if (Number.isNaN(parsed)) return 'earlier';
  const minutes = Math.floor(Math.max(0, now - parsed) / 60_000);
  if (minutes < 1) return 'a moment ago';
  if (minutes < 60) return `${plural(minutes, 'minute')} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${plural(hours, 'hour')} ago`;
  return archiveAgo(fetchedAt, now);
}

function staleBanner(snapshot: MapSnapshot, state: RepositoryPageState, now: number): string {
  if (!state.stale || state.saveError !== null) return '';
  return `<div class="archive-alert is-stale" role="alert" data-repo-stale><span data-icon="alert" aria-hidden="true"></span><span class="grow"><b>Couldn't refresh from GitHub.</b> Showing your maps from ${escapeHtml(snapshotAge(snapshot.fetchedAt, now))}; nothing has moved in or out of the archive.</span><button type="button" class="ghost" data-retry-page><span data-icon="refresh" aria-hidden="true"></span>Try again</button></div>`;
}

function saveErrorFor(state: RepositoryPageState, map: WayfinderMap): string {
  const error = state.saveError;
  return error !== null && error.mapNumber === map.number ? saveErrorHtml(error.kind, map.number, error.message) : '';
}

function searchBox(label: string, placeholder: string, query: string): string {
  return `<label class="search"><span data-icon="lens" aria-hidden="true"></span><span class="sr-only">${escapeHtml(label)}</span><input id="repo-map-search" type="search" placeholder="${escapeHtml(placeholder)}" autocomplete="off" value="${escapeHtml(query)}" /></label>`;
}

function activeOption(map: WayfinderMap, selected: boolean, running: number, needsYou: number): string {
  const n = String(map.number);
  return `<div class="maps-opt is-active-map" role="option" id="maps-opt-${n}" data-select-map="${n}" aria-labelledby="maps-name-${n}" aria-describedby="maps-dest-${n} maps-progress-${n}" aria-selected="${String(selected)}" tabindex="${selected ? '0' : '-1'}">
      <span class="maps-identity">${miniRing(map)}<span class="t" id="maps-name-${n}"><span class="num">#${n}</span> ${escapeHtml(map.title)}</span></span>
      <span class="maps-destination" id="maps-dest-${n}">${escapeHtml(destinationOf(map))}</span>
      <span class="maps-progress" id="maps-progress-${n}">${escapeHtml(activeProgress(map, running, needsYou))}</span>
    </div>`;
}

function archiveButton(map: WayfinderMap, busy: boolean): string {
  return `<button type="button" class="ghost" data-archive-map="${String(map.number)}" aria-label="${escapeHtml(`Archive map #${String(map.number)}: ${map.title}`)}"${busy ? ' aria-disabled="true" aria-busy="true"' : ''}>${busy ? '<span class="archive-spin" aria-hidden="true"></span>Archiving…' : '<span data-icon="archive" aria-hidden="true"></span>Archive'}</button>`;
}

/** The graph, title, destination and counts: one link and one keyboard stop that opens the map. */
function previewLink(map: WayfinderMap, eyebrow: string, label: string, href: string): string {
  const counts = map.ticketsLoaded
    ? `<div class="wf-counts" aria-label="Ticket counts">${stateCounts(map)}</div>`
    : `<div class="wf-counts" aria-hidden="true">${bone('64px')}${bone('72px')}${bone('56px')}</div>`;
  return `<a class="maps-preview" href="${escapeHtml(href)}" aria-label="${escapeHtml(label)}">
      <div class="maps-detail-graph${map.ticketsLoaded ? '' : ' is-loading'}" aria-hidden="true">${map.ticketsLoaded ? miniGraphSvg(map) : ''}</div>
      <div class="maps-detail-body maps-overview"><p class="eyebrow">${escapeHtml(eyebrow)}</p><h2 id="maps-detail-title">${escapeHtml(map.title)}</h2><p class="dest">${escapeHtml(destinationOf(map))}</p>${counts}<span class="maps-open">Open map<span data-icon="arrow" aria-hidden="true"></span></span></div>
    </a>`;
}

function activeDetail(repo: string, map: WayfinderMap, state: RepositoryPageState, running: number, needsYou: number): string {
  const next = nextTicket(map);
  const eyebrow = `Map · #${String(map.number)} · ${map.open ? 'Active' : 'Active, closed on GitHub'}`;
  return `<aside class="maps-detail" aria-labelledby="maps-detail-title">
      ${previewLink(map, eyebrow, `Open map #${String(map.number)}: ${map.title}`, mapPath(repo, map.number))}
      <div class="maps-detail-body maps-facts-body"><dl class="maps-facts">
        <div><dt>Next up</dt><dd>${next === undefined ? 'Nothing next up' : `#${String(next.number)} ${escapeHtml(next.title)}`}</dd></div>
        <div><dt>Hand-offs</dt><dd>${running > 0 ? `${String(running)} running in T3 Code` : 'None running'}</dd></div>
        ${needsYou > 0 ? `<div><dt>Needs you</dt><dd>${needsYou === 1 ? '1 ticket needs your attention' : `${String(needsYou)} tickets need your attention`}</dd></div>` : ''}
        <div><dt>Visibility</dt><dd data-map-visibility="${map.visibility}">${map.visibility === 'public' ? 'Public' : escapeHtml(PRIVATE_NOTE)}</dd></div>
      </dl>${saveErrorFor(state, map)}<div class="archive-acts">${archiveButton(map, state.pending === map.number)}</div><p class="maps-fine">Archive moves this map out of your active list for your account. GitHub is unchanged.</p></div>
    </aside>`;
}

function whileArchived(autoMap: boolean, running: number): string {
  const items = ['<li><span data-icon="eye-off" aria-hidden="true"></span>Not watched for changes</li>'];
  if (autoMap) items.push('<li><span data-icon="pause" aria-hidden="true"></span>Auto map paused; your setting is kept</li>');
  if (running > 0) items.push(`<li><span data-icon="bolt" aria-hidden="true"></span>${plural(running, 'hand-off')} still running in T3 Code and tracked</li>`);
  return items.join('');
}

function archivedOption(map: WayfinderMap, archive: MapSettlement, selected: boolean, now: number): string {
  const n = String(map.number);
  const reason = ARCHIVE_REASONS[archive.reason];
  return `<div class="maps-opt" role="option" id="maps-opt-${n}" data-select-map="${n}" aria-labelledby="maps-name-${n}" aria-describedby="maps-reason-${n} maps-rule-${n}" aria-selected="${String(selected)}" tabindex="${selected ? '0' : '-1'}">
      <span class="maps-reason" id="maps-reason-${n}"><span data-icon="${reason.icon}" aria-hidden="true"></span>${escapeHtml(reason.label)}</span>
      <span class="maps-rule" id="maps-rule-${n}">${escapeHtml(reason.rule)}</span>
      <span class="maps-identity has-time">${miniRing(map)}<span class="t" id="maps-name-${n}"><span class="num">#${n}</span> ${escapeHtml(map.title)}</span><time datetime="${escapeHtml(archive.since)}">${escapeHtml(archiveAgo(archive.since, now))}</time></span>
    </div>`;
}

function archivedDetail(repo: string, map: WayfinderMap, archive: MapSettlement, state: RepositoryPageState, context: RepositoryPageContext, running: number): string {
  const reason = ARCHIVE_REASONS[archive.reason];
  const day = archiveDay(archive.since);
  return `<aside class="maps-detail" aria-labelledby="maps-detail-title">
      ${previewLink(map, `Map · #${String(map.number)}${map.open ? '' : ' · closed'}`, `Open map #${String(map.number)}: ${map.title}. It stays archived.`, mapPath(repo, map.number))}
      <div class="maps-detail-body maps-facts-body">
        <dl class="maps-facts">
          <div><dt>Why it's here</dt><dd>${reasonHtml(archive.reason)}${escapeHtml(archiveWhy(map, archive))}${day === '' ? '' : ` Archived <time datetime="${escapeHtml(archive.since)}">${escapeHtml(day)}</time>.`}</dd></div>
          <div><dt>Returns</dt><dd>${escapeHtml(reason.returns)}</dd></div>
          <div><dt>While archived</dt><dd><ul>${whileArchived(context.autoMap(map.number), running)}</ul></dd></div>
        </dl>
        ${saveErrorFor(state, map)}
        <div class="archive-acts">${restoreButtonHtml(map, false, state.pending === map.number)}</div>
        <p class="maps-fine">Opening keeps it archived. Restore puts it back in your active maps until you archive it again${map.open ? '' : '; watching resumes only if the issue reopens'}.</p>
      </div>
    </aside>`;
}

/** The way into Archived maps, at the foot of the active list. */
function archiveDoor(repo: string, archived: readonly WayfinderMap[]): string {
  const counts = new Map<string, number>();
  for (const map of archived) if (map.settled !== null) counts.set(map.settled.reason, (counts.get(map.settled.reason) ?? 0) + 1);
  const parts = REASON_ORDER.filter((reason) => counts.has(reason)).map((reason) => `${String(counts.get(reason))} ${ARCHIVE_REASONS[reason].short}`);
  const sub = archived.length === 0 ? 'None yet. Closed, finished and idle maps move here on their own.' : `${plural(archived.length, 'map')} · ${parts.join(', ')}`;
  // An archived map's tickets are read only when it is opened or previewed, so the stack shows those.
  const stack = archived.filter((map) => map.ticketsLoaded && map.tickets.length > 0).slice(0, 3).map((map) => `<span>${miniGraphSvg(map)}</span>`).join('');
  return `<a class="archive-door" href="${escapeHtml(archivedMapsPath(repo))}" data-repo-view="archived"><span class="archive-door-ic"><span data-icon="archive" aria-hidden="true"></span></span><span class="grow"><b>Archived maps</b><span class="sub">${escapeHtml(sub)}</span></span>${stack === '' ? '' : `<span class="archive-door-stack" aria-hidden="true">${stack}</span>`}<span data-icon="right" aria-hidden="true"></span></a>`;
}

function listHint(view: RepositoryView): string {
  return `<p class="maps-hint"><kbd>↑</kbd> <kbd>↓</kbd> browse · <kbd>Enter</kbd> ${view === 'active' ? 'open map' : 'open without restoring'}</p>`;
}

function activeSection(repo: string, snapshot: MapSnapshot, state: RepositoryPageState, context: RepositoryPageContext): string {
  const view: RepositoryPageState = { ...state, view: 'active' };
  const active = snapshot.maps.filter((map) => !isArchived(map));
  const list = visibleMaps(snapshot, view);
  const selected = selectedMap(snapshot, view);
  const running = countRunningHandOffs(repo, context.handOffs);
  const needs = (map: WayfinderMap): number => needsYouTicketNumbers(repo, map, context.handOffs).length;
  let body: string;
  if (active.length === 0) body = '<p class="wf-none" role="status">Every map here is archived.</p>';
  else if (list.length === 0 || selected === null) body = `<p class="wf-none" role="status">No active maps match “${escapeHtml(state.query.trim())}”.</p>`;
  else {
    const options = list.map((map) => activeOption(map, map.number === selected.number, running.get(map.number) ?? 0, needs(map))).join('');
    body = `<div class="maps-split"><div class="maps-list"><div class="maps-listbox" role="listbox" aria-label="Active maps" data-repo-map-list><div class="maps-group">${options}</div></div>${listHint('active')}</div>${activeDetail(repo, selected, state, running.get(selected.number) ?? 0, needs(selected))}</div>`;
  }
  return `<section class="repo-map-section" aria-label="Repository maps">
      <div class="wf-filters">${searchBox('Filter active maps', 'Filter maps', state.query)}</div>
      ${body}
      ${archiveDoor(repo, snapshot.maps.filter(isArchived))}
    </section>`;
}

function archivedSection(repo: string, snapshot: MapSnapshot, state: RepositoryPageState, context: RepositoryPageContext): string {
  const view: RepositoryPageState = { ...state, view: 'archived' };
  const all = snapshot.maps.filter(isArchived);
  const list = visibleMaps(snapshot, view);
  const selected = selectedMap(snapshot, view);
  const running = countRunningHandOffs(repo, context.handOffs);
  let body: string;
  if (all.length === 0) {
    const kinds = REASON_ORDER.map((reason) => `<li><span data-icon="${ARCHIVE_REASONS[reason].icon}" aria-hidden="true"></span>${escapeHtml(ARCHIVE_REASONS[reason].label)}</li>`).join('');
    body = `<div class="archive-empty"><span data-icon="archive" aria-hidden="true"></span><h2>No archived maps</h2><p>A map moves here when its issue closes, every ticket is done, or nothing changes for 30 days. You can also archive one from its card. GitHub is never changed.</p><ul class="archive-kinds">${kinds}</ul><a class="ghost" href="${escapeHtml(repoPath(repo))}" data-repo-view="active">Back to active maps</a></div>`;
  } else if (list.length === 0 || selected?.settled == null) {
    body = `<p class="wf-none" role="status">No archived maps match “${escapeHtml(state.query.trim())}”.</p>`;
  } else {
    const groups = REASON_ORDER.map((reason) => {
      const items = list.filter((map) => map.settled?.reason === reason);
      if (items.length === 0) return '';
      return `<div class="maps-group" role="group" aria-label="${escapeHtml(ARCHIVE_REASONS[reason].label)}">${items.map((map) => (map.settled === null ? '' : archivedOption(map, map.settled, map.number === selected.number, context.now))).join('')}</div>`;
    }).join('');
    body = `<div class="maps-split"><div class="maps-list"><div class="maps-listbox" role="listbox" aria-label="Archived maps, grouped by why they are archived" data-repo-map-list>${groups}</div>${listHint('archived')}</div>${archivedDetail(repo, selected, selected.settled, state, context, running.get(selected.number) ?? 0)}</div>`;
  }
  return `<section class="repo-map-section" aria-label="Archived maps">${body}</section>`;
}

export function repositoryPageHtml(repo: string, snapshot: MapSnapshot, state: RepositoryPageState, context: RepositoryPageContext): string {
  const name = repo.split('/')[1] ?? repo;
  const active = snapshot.maps.filter((map) => !isArchived(map)).length;
  const archived = snapshot.maps.length - active;
  const warnings = snapshot.warnings
    .map((warning) => `<div class="panel is-warning"><span class="grow">${escapeHtml(warning)}</span></div>`)
    .join('');
  const banner = staleBanner(snapshot, state, context.now);

  if (state.view === 'archived') {
    const meta = `${String(archived)} archived${context.login === null ? '' : ` for ${context.login}`} · the issues on GitHub are unchanged`;
    return `<div class="repository-page wf-repo-page" data-repository-page data-repository-view="archived">
    <header class="archive-page-head"><div class="grow"><a class="archive-back" href="${escapeHtml(repoPath(repo))}" data-repo-view="active"><span data-icon="back" aria-hidden="true"></span>${escapeHtml(name)}</a><h1 tabindex="-1">Archived maps</h1><p>${escapeHtml(meta)}</p></div>${searchBox('Filter archived maps', 'Filter archived maps', state.query)}</header>
    ${warnings}
    ${banner}
    ${archivedSection(repo, snapshot, state, context)}
  </div>`;
  }

  const counts = snapshot.maps.length === 0 ? 'no maps yet' : `${String(active)} active · ${String(archived)} archived`;
  const hidden = hiddenMapsMessage(snapshot.hiddenMaps);
  const hiddenNote = hidden === '' ? '' : `<p class="wf-hidden-maps" data-repo-hidden-maps><span data-icon="lock" aria-hidden="true"></span>${escapeHtml(hidden)}</p>`;
  const mapContent = snapshot.maps.length === 0 ? repositoryEmpty(repo, snapshot.hiddenMaps) + archiveDoor(repo, []) : activeSection(repo, snapshot, state, context);
  return `<div class="repository-page wf-repo-page" data-repository-page data-repository-view="active">
    <header class="wf-head">${repoIconHtml(repo, 'lg')}<div class="grow"><h1 tabindex="-1">${escapeHtml(name)}</h1><p>${escapeHtml(repo)} · ${counts}</p></div></header>
    ${warnings}
    ${hiddenNote}
    ${banner}
    ${mapContent}
    ${publicMapsSection(repo, snapshot.publicMaps)}
  </div>`;
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

const SPLIT_SKELETON = `<div class="maps-split" aria-hidden="true"><div class="maps-list"><div class="maps-group">${`<div class="maps-opt is-skeleton"><span class="maps-identity"><span></span><span class="t">${bone('80%')}</span></span><span class="maps-destination">${bone('95%')}</span></div>`.repeat(3)}</div></div><div class="maps-detail"><div class="maps-detail-graph"></div><div class="maps-detail-body"><p class="eyebrow">${bone('90px')}</p><h2>${bone('60%')}</h2><p class="dest">${bone('90%')}</p><div class="archive-acts">${boneButton('120px')}</div></div></div></div>`;

const DOOR_SKELETON = `<div class="archive-door" aria-hidden="true"><span class="archive-door-ic"></span><span class="grow">${bone('120px')}${bone('220px')}</span></div>`;

/** The repository page before its snapshot arrives: the real header, then placeholder lists. */
export function repositoryLoadingHtml(repo: string, view: RepositoryView = 'active'): string {
  const name = repo.split('/')[1] ?? repo;
  if (view === 'archived') {
    return `<div class="repository-page wf-repo-page is-loading" role="status" aria-live="polite" aria-label="Loading archived maps">
    <header class="archive-page-head"><div class="grow"><a class="archive-back" href="${escapeHtml(repoPath(repo))}"><span data-icon="back" aria-hidden="true"></span>${escapeHtml(name)}</a><h1>Archived maps</h1><p>${bone('220px')}</p></div></header>
    ${SPLIT_SKELETON}
  </div>`;
  }
  return `<div class="repository-page wf-repo-page is-loading" role="status" aria-live="polite" aria-label="Loading ${escapeHtml(repo)} maps">
    <header class="wf-head">${repoIconHtml(repo, 'lg')}<div class="grow"><h1>${escapeHtml(name)}</h1><p>${escapeHtml(repo)} · ${bone('150px')}</p></div></header>
    <div class="repo-map-section" aria-hidden="true">
      <div class="wf-filters"><span class="search"></span></div>
      ${SPLIT_SKELETON}
      ${DOOR_SKELETON}
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
