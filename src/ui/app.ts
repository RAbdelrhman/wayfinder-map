import { DEFAULT_LAYOUT, layoutTickets } from '../layout.js';
import type { PositionedNode } from '../layout.js';
import { prototypeBranch } from '../prompt.js';
import { TICKET_TYPES } from '../types.js';
import type { MapSections, MapSnapshot, Prototype, Ticket, TicketState, TicketType, WayfinderMap } from '../types.js';
import {
  TIERS,
  TIER_HINT,
  TIER_LABEL,
  currentCatalog,
  effortSelectHtml,
  findModel,
  liveChoice,
  loadCatalog,
  modelSelectHtml,
  readChoice,
  saveTicketTier,
  saveTierDefault,
  ticketTier,
  tierDefaults,
} from './models.js';
import type { ModelChoice, Tier } from './models.js';
import { AutoRefresh } from './autoRefresh.js';
import { fitPrototypeThumbs, prototypeTileHtml } from './prototypeTile.js';
import type { TileText } from './prototypeTile.js';
import { lineage, matchesFilter, matchesQuery, onLineage, syncedLabel } from './focus.js';
import type { Lineage, TicketFilter } from './focus.js';
import { escapeHtml, listItemCount, renderMarkdown } from './markdown.js';
import * as icons from './icons.js';
import { icon } from './icons.js';
import { mapPath, parseRepoPagePath, repoPath, scopedApiPath } from '../repoRoutes.js';
import { PROGRESS_ORDER, STATE_ORDER, STATE_STYLE, bindAccountMark, bindTheme, bindUpdater, countStates, paintIcons, progressRing } from './chrome.js';

/* ---------- type channel: one icon each, drawn from what the work feels like ---------- */

interface TypeStyle {
  label: string;
  blurb: string;
  icon: string;
}

const TYPE_STYLE: Record<TicketType, TypeStyle> = {
  research: { label: 'research', blurb: 'Find something out from docs or code', icon: icons.LENS },
  prototype: { label: 'prototype', blurb: 'Build a throwaway to try an idea; needs you', icon: icons.BEAKER },
  grilling: { label: 'grilling', blurb: 'Talk a decision through; needs you', icon: icons.GRILL },
  task: { label: 'task', blurb: 'A known job, ready to build', icon: icons.LIST },
};

const UNTYPED: TypeStyle = { label: 'untyped', blurb: 'No wayfinder:<type> label on the issue', icon: icons.BLANK };

function typeStyle(type: TicketType | null): TypeStyle {
  return type === null ? UNTYPED : TYPE_STYLE[type];
}

/** The square type badge that rides at the head of a node, the hover card and the ticket panel. */
function typeGlyph(type: TicketType | null): string {
  const style = typeStyle(type);
  return `<span class="glyph" title="${escapeHtml(style.label)}">${icon(style.icon)}</span>`;
}

function stateChip(state: TicketState): string {
  const style = STATE_STYLE[state];
  return `<span class="chip" style="--accent: var(${style.variable})">${icon(style.icon)}${escapeHtml(style.label)}</span>`;
}

/* ---------- map brief sections, in the order the brief tabs show them ---------- */

const SECTIONS: ReadonlyArray<readonly [keyof MapSections, string]> = [
  ['destination', 'Destination'],
  ['fog', 'Not yet specified'],
  ['decisions', 'Decided'],
  ['notes', 'Notes'],
  ['outOfScope', 'Out of scope'],
];

/* ---------- element handles ---------- */

function need<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Missing #${id}`);
  return element as T;
}

const els = {
  app: need('app'),
  repo: need('repo'),
  mapSwitch: need<HTMLButtonElement>('mapswitch'),
  mapMenu: need('mapmenu'),
  synced: need('synced'),
  search: need<HTMLInputElement>('search'),
  warnings: need('warnings'),
  filters: need('filters'),
  canvasWrap: need('canvas-wrap'),
  canvas: need('canvas'),
  edges: need<HTMLElement>('edges') as unknown as SVGSVGElement,
  nodes: need('nodes'),
  tableWrap: need('tablewrap'),
  protoWrap: need('protowrap'),
  keyButton: need('key'),
  keyMenu: need('keymenu'),
  zoomReset: need('zoom-reset'),
  inspector: need('inspector'),
  hovercard: need('hovercard'),
  toast: need('toast'),
  modelsDialog: need<HTMLDialogElement>('models-dialog'),
  tierRows: need('tier-rows'),
};

paintIcons();

/* ---------- app state ---------- */

let snapshot: MapSnapshot | null = null;
let activeMap = 0;
const pageRoute = parseRepoPagePath(window.location.pathname);
if (pageRoute === null || pageRoute.mapNumber === null) window.location.replace('/');
let selected: number | null = null;
let hovered: number | null = null;
let filter: TicketFilter | null = null;
type View = 'map' | 'table' | 'prototypes';
let view: View = 'map';
let zoom = 1;
let inspectorTab: 'brief' | 'ticket' = 'brief';
let briefSection: keyof MapSections = 'destination';

let query = '';

function currentMap(): WayfinderMap | null {
  return snapshot?.maps[activeMap] ?? null;
}

let toastTimer: number | undefined;
let loadInFlight: Promise<boolean> | null = null;

function toast(message: string, ms = 4200): void {
  els.toast.textContent = message;
  els.toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, ms);
}

/* ---------- data ---------- */

async function load(mode: 'initial' | 'manual' | 'background'): Promise<boolean> {
  if (loadInFlight !== null) return loadInFlight;
  const force = mode !== 'initial';
  if (mode === 'initial') els.repo.textContent = 'reading GitHub…';
  if (mode === 'manual') els.synced.classList.add('is-busy');

  loadInFlight = (async () => {
    try {
      const endpoint = pageRoute === null ? '/api/snapshot' : scopedApiPath(pageRoute.repo, 'snapshot');
      const response = await fetch(`${endpoint}${force ? '?refresh=1' : ''}`);
      const body: unknown = await response.json();
      if (!response.ok) {
        const message = (body as { error?: string }).error ?? 'Could not read the maps.';
        if (mode !== 'background' || snapshot === null) {
          if (snapshot === null) els.repo.textContent = 'failed';
          toast(message, 12000);
        }
        return false;
      }
      snapshot = body as MapSnapshot;
      const currentRoute = parseRepoPagePath(window.location.pathname);
      const routedMap = currentRoute?.mapNumber === null
        ? -1
        : snapshot.maps.findIndex((candidate) => candidate.number === currentRoute?.mapNumber);
      if (currentRoute?.mapNumber !== null && currentRoute?.mapNumber !== undefined && routedMap < 0) {
        window.location.replace(repoPath(snapshot.repo));
        return true;
      }
      activeMap = routedMap >= 0 ? routedMap : Math.min(activeMap, Math.max(0, snapshot.maps.length - 1));
      render();
      // The repository is only known once the snapshot lands, and the clone lookup is keyed to it.
      if (!workspaceAsked) void loadWorkspace().then(refreshLaunch);
      return true;
    } catch (error) {
      if (mode !== 'background' || snapshot === null) {
        if (snapshot === null) els.repo.textContent = 'failed';
        toast((error as Error).message || 'Could not read the maps.', 12000);
      }
      return false;
    } finally {
      loadInFlight = null;
      els.synced.classList.remove('is-busy');
    }
  })();
  return loadInFlight;
}

/* ---------- small builders ---------- */

function miniRing(done: number, total: number): string {
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  const share = total === 0 ? 0 : done / total;
  return `<svg class="miniring" viewBox="0 0 18 18" aria-hidden="true">
    <circle cx="9" cy="9" r="${String(radius)}" fill="none" stroke="var(--baseline)" stroke-width="2.4"/>
    <circle cx="9" cy="9" r="${String(radius)}" fill="none" stroke="var(--state-frontier)" stroke-width="2.4" stroke-dasharray="${String(share * circumference)} ${String(circumference)}"/>
  </svg>`;
}

/** Linked ticket numbers, coloured by their state when they sit on this map. Clicking one opens it. */
function ticketPills(map: WayfinderMap, numbers: readonly number[], withTitles = false): string {
  if (numbers.length === 0) return '<span class="none">—</span>';
  return numbers
    .map((number) => {
      const other = map.tickets.find((ticket) => ticket.number === number);
      const accent = other === undefined ? '--text-muted' : STATE_STYLE[other.state].variable;
      const title = withTitles && other !== undefined ? ` ${other.title}` : '';
      const label = `<span class="pill-text">${escapeHtml(`#${String(number)}${title}`)}</span>`;
      return other === undefined
        ? `<span class="pill" style="--accent: var(${accent})" title="Not on this map">${label}</span>`
        : `<button type="button" class="pill" style="--accent: var(${accent})" data-jump="${String(number)}" title="${escapeHtml(other.title)}">${label}</button>`;
    })
    .join('');
}

function dependents(map: WayfinderMap, number: number): number[] {
  return map.tickets.filter((ticket) => ticket.blockedBy.includes(number)).map((ticket) => ticket.number);
}

/* ---------- render ---------- */

function render(): void {
  if (snapshot === null) return;
  document.title = `${snapshot.repo} · wayfinder map`;

  els.warnings.hidden = snapshot.warnings.length === 0;
  els.warnings.textContent = snapshot.warnings.join('  ·  ');

  const map = currentMap();
  if (selected !== null && map?.tickets.some((ticket) => ticket.number === selected) !== true) selected = null;

  renderHead();
  renderFilters();
  renderKey();
  if (view === 'map') renderGraph();
  else if (view === 'table') renderTable();
  else renderPrototypes();
  renderInspector();
}

function renderHead(): void {
  if (snapshot === null) return;
  const [owner, name] = snapshot.repo.includes('/') ? snapshot.repo.split('/', 2) : ['', snapshot.repo];
  els.repo.innerHTML = `<a href="/">Home</a><span class="crumb-sep">/</span><a class="is-repo" href="${repoPath(snapshot.repo)}">${owner ? `${escapeHtml(owner)}/${escapeHtml(name ?? '')}` : escapeHtml(name ?? '')}</a><span class="crumb-sep">/</span>`;

  const map = currentMap();
  els.mapSwitch.hidden = false;
  if (map === null) {
    els.mapSwitch.disabled = true;
    els.mapSwitch.innerHTML = '<span class="t">No maps yet</span>';
  } else {
    const open = map.tickets.filter((ticket) => ticket.open).length;
    els.mapSwitch.disabled = false;
    els.mapSwitch.innerHTML = `<span class="t">${escapeHtml(map.title)}</span><span class="badge">${String(open)} open</span>${icon(icons.CHEVRON)}`;
  }

  els.mapMenu.innerHTML = `<div class="menu-label eyebrow">Maps in ${escapeHtml(snapshot.repo)}</div>${snapshot.maps
    .map((candidate, index) => {
      const open = candidate.tickets.filter((ticket) => ticket.open).length;
      const total = candidate.tickets.length;
      return `<button type="button" role="menuitem" class="menu-item${index === activeMap ? ' is-on' : ''}" data-index="${String(index)}">
        ${miniRing(total - open, total)}<span class="grow">${escapeHtml(candidate.title)}</span>
        <span class="badge">${open === 0 ? 'done' : `${String(open)} open`}</span>
      </button>`;
    })
    .join('')}<a class="menu-item" href="${repoPath(snapshot.repo)}"><span class="grow">All maps</span></a>`;

  renderSynced();
}

function renderSynced(): void {
  if (snapshot === null) return;
  const fetched = Date.parse(snapshot.fetchedAt);
  const text = Number.isNaN(fetched) ? '' : syncedLabel(Date.now() - fetched);
  const label = els.synced.querySelector<HTMLElement>('.synced-label') ?? els.synced;
  label.textContent = text;
  els.synced.hidden = !text;
}

function renderFilters(): void {
  const map = currentMap();
  if (map === null) {
    els.filters.innerHTML = '';
    return;
  }
  const chip = (key: TicketFilter | null, label: string, path: string | null, count: number, variable: string | null): string =>
    `<button type="button" class="fchip${filter === key ? ' is-on' : ''}" data-filter="${key ?? ''}" aria-pressed="${String(filter === key)}"${
      variable === null ? '' : ` style="--accent: var(${variable})"`
    }${count === 0 && filter !== key ? ' disabled' : ''}>${path === null ? '' : icon(path)}${escapeHtml(label)} <b>${String(count)}</b></button>`;

  const counts = countStates(map);
  const states = STATE_ORDER.map((state) => chip(state, STATE_STYLE[state].long, STATE_STYLE[state].icon, counts[state], STATE_STYLE[state].variable));
  const types = TICKET_TYPES.map((type) =>
    chip(type, TYPE_STYLE[type].label, TYPE_STYLE[type].icon, map.tickets.filter((ticket) => ticket.type === type).length, null),
  );
  const untyped = map.tickets.filter((ticket) => ticket.type === null).length;
  if (untyped > 0) types.push(chip('untyped', UNTYPED.label, UNTYPED.icon, untyped, null));

  els.filters.innerHTML = `${chip(null, 'All', null, map.tickets.length, null)}${states.join('')}<span class="filter-sep" role="none"></span>${types.join('')}`;
}

function renderKey(): void {
  const states = STATE_ORDER.map((state) => {
    const style = STATE_STYLE[state];
    return `<div class="keyrow"><span style="color: var(${style.variable}); display: flex">${icon(style.icon)}</span><b>${escapeHtml(style.long)}</b>${escapeHtml(style.blurb)}</div>`;
  }).join('');
  const types = TICKET_TYPES.map((type) => {
    const style = TYPE_STYLE[type];
    return `<div class="keyrow is-type">${icon(style.icon)}<b>${escapeHtml(style.label)}</b>${escapeHtml(style.blurb)}</div>`;
  }).join('');
  els.keyMenu.innerHTML = `${states}<div class="menu-sep"></div>${types}`;
}

function nodeHtml(ticket: Ticket, position: PositionedNode): string {
  const style = STATE_STYLE[ticket.state];
  const meta =
    ticket.state === 'blocked'
      ? `blocked by ${ticket.openBlockers.map((n) => `#${String(n)}`).join(', ')}`
      : ticket.assignee !== null
        ? `@${ticket.assignee}`
        : (ticket.type ?? 'untyped');

  return `<button type="button" class="node${ticket.state === 'done' ? ' is-done' : ''}"
    data-number="${String(ticket.number)}"
    style="--accent: var(${style.variable}); left:${String(position.x)}px; top:${String(position.y)}px; width:${String(position.width)}px; height:${String(position.height)}px"
    aria-label="${escapeHtml(`#${String(ticket.number)} ${ticket.title}, ${style.label}`)}">
    <span class="node-top">
      ${typeGlyph(ticket.type)}
      <span class="num">#${String(ticket.number)}</span>
      ${stateChip(ticket.state)}
    </span>
    <span class="title">${escapeHtml(ticket.title)}</span>
    <span class="meta">${escapeHtml(meta)}</span>
  </button>`;
}

function renderGraph(): void {
  els.canvasWrap.hidden = false;
  els.tableWrap.hidden = true;
  els.protoWrap.hidden = true;
  hideCard();

  const map = currentMap();
  if (map === null || map.tickets.length === 0) {
    els.nodes.innerHTML = '<p class="empty">This map has no tickets yet.</p>';
    els.edges.innerHTML = '';
    return;
  }

  const layout = layoutTickets(map.tickets, DEFAULT_LAYOUT);
  const byNumber = new Map(map.tickets.map((ticket) => [ticket.number, ticket]));
  const positions = new Map(layout.nodes.map((node) => [node.number, node]));

  els.canvas.style.width = `${String(layout.width)}px`;
  els.canvas.style.height = `${String(layout.height)}px`;

  els.nodes.innerHTML = layout.nodes
    .map((position) => {
      const ticket = byNumber.get(position.number);
      return ticket ? nodeHtml(ticket, position) : '';
    })
    .join('');

  els.edges.setAttribute('viewBox', `0 0 ${String(layout.width)} ${String(layout.height)}`);
  els.edges.setAttribute('width', String(layout.width));
  els.edges.setAttribute('height', String(layout.height));
  els.edges.innerHTML = layout.edges
    .map((edge) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to) return '';
      const x1 = from.x + from.width;
      const y1 = from.y + from.height / 2;
      const x2 = to.x;
      const y2 = to.y + to.height / 2;
      const bend = Math.max(28, (x2 - x1) / 2);
      const live = byNumber.get(edge.to)?.openBlockers.includes(edge.from) === true;
      return `<path class="${live ? 'is-live' : ''}" data-from="${String(edge.from)}" data-to="${String(edge.to)}" d="M${String(x1)},${String(y1)} C${String(x1 + bend)},${String(y1)} ${String(x2 - bend)},${String(y2)} ${String(x2)},${String(y2)}" />`;
    })
    .join('');

  syncHighlights();
}

function renderTable(): void {
  els.canvasWrap.hidden = true;
  els.tableWrap.hidden = false;
  els.protoWrap.hidden = true;
  hideCard();

  const map = currentMap();
  if (map === null) {
    els.tableWrap.innerHTML = '';
    return;
  }

  const rows = map.tickets
    .map((ticket) => {
      const style = STATE_STYLE[ticket.state];
      return `<tr data-number="${String(ticket.number)}">
        <td class="num">#${String(ticket.number)}</td>
        <td><span class="typecell">${icon(typeStyle(ticket.type).icon)}${escapeHtml(typeStyle(ticket.type).label)}</span></td>
        <td>${escapeHtml(ticket.title)}</td>
        <td><span class="cellchip" style="--accent: var(${style.variable})">${icon(style.icon)}${escapeHtml(style.label)}</span></td>
        <td>${ticket.assignee === null ? '—' : escapeHtml(`@${ticket.assignee}`)}</td>
        <td class="num">${ticket.blockedBy.length === 0 ? '—' : ticket.blockedBy.map((n) => `#${String(n)}`).join(', ')}</td>
      </tr>`;
    })
    .join('');

  els.tableWrap.innerHTML = `<table>
    <thead><tr>
      <th class="num">Issue</th><th>Type</th><th>Title</th><th>State</th><th>Assignee</th><th class="num">Blocked by</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  syncHighlights();
}

/* ---------- prototypes: fetched per map on demand, since each one costs GitHub calls ---------- */

type PrototypeLoad = { status: 'loading' } | { status: 'ready'; list: Prototype[] } | { status: 'failed'; error: string };

const prototypeLoads = new Map<number, PrototypeLoad>();

function prototypesFor(map: WayfinderMap, force = false): PrototypeLoad {
  const existing = prototypeLoads.get(map.number);
  if (existing !== undefined && !force) return existing;
  const loading: PrototypeLoad = { status: 'loading' };
  prototypeLoads.set(map.number, loading);
  void (async () => {
    let next: PrototypeLoad;
    try {
      const response = await fetch(`${scopedApiPath(repoName(), 'prototypes')}?map=${String(map.number)}${force ? '&refresh=1' : ''}`);
      const body: unknown = await response.json();
      next = response.ok
        ? { status: 'ready', list: body as Prototype[] }
        : { status: 'failed', error: (body as { error?: string }).error ?? 'Could not read the prototypes.' };
    } catch (error) {
      next = { status: 'failed', error: (error as Error).message };
    }
    if (prototypeLoads.get(map.number) !== loading) return;
    prototypeLoads.set(map.number, next);
    if (currentMap()?.number !== map.number) return;
    if (view === 'prototypes') renderPrototypes();
    renderTicketPrototype();
  })();
  return loading;
}

/** The words under a tile on this map: the ticket, and a way to open it. */
function tileText(prototype: Prototype, ticket: Ticket | undefined): TileText {
  return {
    eyebrow: `#${String(prototype.ticketNumber)}${ticket === undefined ? '' : ` · ${STATE_STYLE[ticket.state].label}`}`,
    title: ticket?.title ?? prototype.branch,
    links: `<button type="button" class="linkish" data-jump="${String(prototype.ticketNumber)}">Ticket</button><a href="${escapeHtml(prototype.url)}" target="_blank" rel="noreferrer">Branch ↗</a>`,
  };
}

function renderPrototypes(): void {
  els.canvasWrap.hidden = true;
  els.tableWrap.hidden = true;
  els.protoWrap.hidden = false;
  hideCard();

  const map = currentMap();
  if (map === null) {
    els.protoWrap.innerHTML = '';
    return;
  }

  const load = prototypesFor(map);
  if (load.status !== 'ready') {
    els.protoWrap.innerHTML = `<p class="empty">${
      load.status === 'loading' ? 'Looking for prototype branches…' : escapeHtml(`Could not read the prototypes: ${load.error}`)
    }</p>`;
    return;
  }

  if (load.list.length === 0) {
    els.protoWrap.innerHTML =
      '<p class="empty">No prototypes on this map yet.<br />A prototype ticket keeps its prototype on a <code>prototype/&lt;ticket&gt;-&lt;slug&gt;</code> branch, and it shows up here once pushed.</p>';
    return;
  }

  const tiles = load.list
    .map((prototype) =>
      prototypeTileHtml(
        repoName(),
        prototype,
        tileText(
          prototype,
          map.tickets.find((candidate) => candidate.number === prototype.ticketNumber),
        ),
      ),
    )
    .join('');

  els.protoWrap.innerHTML = `<div class="protogallery">
    <p class="eyebrow">${String(load.list.length)} ${load.list.length === 1 ? 'prototype' : 'prototypes'} on ${escapeHtml(map.title)} · click one to open it</p>
    <div class="proto-grid">${tiles}</div>
  </div>`;
  fitPrototypeThumbs(els.protoWrap);
}

/** The ticket panel's prototype block, filled in place once the list arrives. */
function ticketPrototypeHtml(map: WayfinderMap, ticket: Ticket): string {
  const load = prototypeLoads.get(map.number);
  const mine = load?.status === 'ready' ? load.list.filter((prototype) => prototype.ticketNumber === ticket.number) : [];
  if (ticket.type !== 'prototype' && mine.length === 0) return '';
  const body =
    load === undefined || load.status === 'loading'
      ? '<p class="hint">Looking for its prototype…</p>'
      : load.status === 'failed'
        ? `<p class="hint">${escapeHtml(`Could not read the prototypes: ${load.error}`)}</p>`
        : mine.length === 0
          ? `<p class="hint">No prototype yet. It will be kept on <code>${escapeHtml(prototypeBranch(ticket))}</code>.</p>`
          : mine.map((prototype) => prototypeTileHtml(repoName(), prototype, { eyebrow: 'Prototype', title: ticket.title })).join('');
  return `<section class="ticket-proto">${mine.length === 0 ? '<span class="eyebrow">Prototype</span>' : ''}${body}</section>`;
}

function renderTicketPrototype(): void {
  const slot = document.getElementById('ticket-proto');
  const map = currentMap();
  const ticket = map?.tickets.find((candidate) => candidate.number === selected);
  if (slot === null || map === null || ticket === undefined) return;
  slot.innerHTML = ticketPrototypeHtml(map, ticket);
  fitPrototypeThumbs(slot);
}

/**
 * Selection, hover and filter only flip classes, so a hover never rebuilds the canvas
 * and the pan position survives. Hovering a ticket fades everything off its chain.
 */
function syncHighlights(): void {
  const map = currentMap();
  if (map === null) return;
  const byNumber = new Map(map.tickets.map((ticket) => [ticket.number, ticket]));
  const shown = (number: number): boolean => {
    const ticket = byNumber.get(number);
    return ticket !== undefined && matchesFilter(ticket, filter) && matchesQuery(ticket, query);
  };
  const chain: Lineage | null = hovered === null ? null : lineage(map.tickets, hovered);
  const related = (number: number): boolean =>
    chain === null || number === hovered || chain.upstream.has(number) || chain.downstream.has(number);

  for (const node of els.nodes.querySelectorAll<HTMLElement>('.node')) {
    const number = Number(node.dataset['number']);
    node.classList.toggle('is-selected', number === selected);
    node.classList.toggle('is-dim', !related(number) || !shown(number));
  }

  for (const path of els.edges.querySelectorAll<SVGPathElement>('path')) {
    const edge = { from: Number(path.dataset['from']), to: Number(path.dataset['to']) };
    const onPath = chain !== null && hovered !== null && onLineage(edge, hovered, chain);
    path.classList.toggle('is-path', onPath);
    path.classList.toggle('is-dim', chain === null ? !(shown(edge.from) && shown(edge.to)) : !onPath);
  }

  for (const row of els.tableWrap.querySelectorAll<HTMLElement>('tr[data-number]')) {
    const number = Number(row.dataset['number']);
    row.hidden = !shown(number);
    row.classList.toggle('is-selected', number === selected);
  }
}

/* ---------- hover card ---------- */

let cardTimer: number | undefined;

function showCard(node: HTMLElement, ticket: Ticket, map: WayfinderMap): void {
  const style = STATE_STYLE[ticket.state];
  const excerpt = ticket.body.replace(/[#*`>_[\]]/g, '').replace(/\s+/g, ' ').trim();
  els.hovercard.style.setProperty('--accent', `var(${style.variable})`);
  els.hovercard.innerHTML = `
    <div class="node-top">${typeGlyph(ticket.type)}<span class="num">#${String(ticket.number)}</span>${stateChip(ticket.state)}</div>
    <div class="htitle">${escapeHtml(ticket.title)}</div>
    ${excerpt.length === 0 ? '' : `<div class="hbody">${escapeHtml(excerpt.slice(0, 280))}</div>`}
    <dl class="relations">
      <dt>Needs</dt><dd>${ticketPills(map, ticket.blockedBy, true)}</dd>
      <dt>Unlocks</dt><dd>${ticketPills(map, dependents(map, ticket.number), true)}</dd>
    </dl>
    <div class="hint-row">Click to open${ticket.state === 'frontier' ? ' · ready to start' : ''}</div>`;

  const rect = node.getBoundingClientRect();
  const width = 320;
  let left = rect.right + 14;
  if (left + width > window.innerWidth - 12) left = rect.left - width - 14;
  els.hovercard.style.left = `${String(Math.max(12, left))}px`;
  els.hovercard.style.top = '0px';
  const top = Math.min(Math.max(12, rect.top - 4), window.innerHeight - els.hovercard.offsetHeight - 12);
  els.hovercard.style.top = `${String(top)}px`;
  els.hovercard.classList.add('is-on');
}

function hideCard(): void {
  window.clearTimeout(cardTimer);
  els.hovercard.classList.remove('is-on');
}

function setHovered(node: HTMLElement | null): void {
  const number = node === null ? null : Number(node.dataset['number']);
  if (number === hovered) return;
  hovered = number;
  syncHighlights();
  hideCard();
  const map = currentMap();
  const ticket = map?.tickets.find((candidate) => candidate.number === number);
  if (node === null || map === null || ticket === undefined || panFrom !== null) return;
  cardTimer = window.setTimeout(() => showCard(node, ticket, map), 220);
}

/* ---------- inspector: the map brief and the open ticket, one tab each ---------- */

function renderInspector(): void {
  const map = currentMap();
  if (map === null) {
    els.inspector.innerHTML = '';
    return;
  }

  const ticket = map.tickets.find((candidate) => candidate.number === selected) ?? null;
  const tab = ticket === null ? 'brief' : inspectorTab;
  const previous = els.inspector.querySelector('.insp-panel');
  const scrollTop = previous?.getAttribute('data-tab') === `${tab}:${String(selected)}` ? previous.scrollTop : 0;

  els.inspector.innerHTML = `
    <div class="insp-tabs">
      <div class="segmented" role="tablist" aria-label="Panel">
        <button type="button" role="tab" class="seg${tab === 'brief' ? ' is-on' : ''}" data-panel="brief" aria-selected="${String(tab === 'brief')}">Brief</button>
        <button type="button" role="tab" class="seg${tab === 'ticket' ? ' is-on' : ''}" data-panel="ticket" aria-selected="${String(tab === 'ticket')}"${ticket === null ? ' disabled' : ''}>${
          ticket === null ? 'Ticket' : `Ticket #${String(ticket.number)}`
        }</button>
      </div>
    </div>
    <div class="insp-panel" data-tab="${tab}:${String(selected)}">${tab === 'ticket' && ticket !== null ? ticketHtml(map, ticket) : briefHtml(map)}</div>`;

  const panel = els.inspector.querySelector('.insp-panel');
  if (panel !== null) panel.scrollTop = scrollTop;
  fitPrototypeThumbs(els.inspector);
}

function briefHtml(map: WayfinderMap): string {
  const counts = countStates(map);
  const total = map.tickets.length;
  const rows = STATE_ORDER.map((state) => {
    const style = STATE_STYLE[state];
    const on = filter === state;
    return `<button type="button" class="srow${on ? ' is-on' : ''}" data-filter="${state}" aria-pressed="${String(on)}" style="--accent: var(${style.variable})"${
      counts[state] === 0 && !on ? ' disabled' : ''
    }>${icon(style.icon)}${escapeHtml(style.long)}<b>${String(counts[state])}</b></button>`;
  }).join('');

  const sections = SECTIONS.filter(([key]) => map.sections[key].trim().length > 0);
  if (!sections.some(([key]) => key === briefSection)) briefSection = sections[0]?.[0] ?? 'destination';
  const tabs = sections
    .map(([key, label]) => {
      const count = key === 'destination' ? 0 : listItemCount(map.sections[key]);
      return `<button type="button" class="tab${key === briefSection ? ' is-on' : ''}" data-section="${key}">${escapeHtml(label)}${
        count > 0 ? ` <span class="badge">${String(count)}</span>` : ''
      }</button>`;
    })
    .join('');

  return `<div class="brief">
    <span class="eyebrow"><a href="${escapeHtml(map.url)}" target="_blank" rel="noreferrer">Map · #${String(map.number)} ↗</a></span>
    <h1>${escapeHtml(map.title)}</h1>
    <div class="summary">
      <div class="ring">${progressRing(counts, total)}<div class="lbl"><b>${String(counts.done)}/${String(total)}</b><span>done</span></div></div>
      <div class="status-rows">${rows}</div>
    </div>
    ${
      sections.length === 0
        ? '<p class="hint">This map has no brief yet.</p>'
        : `<div class="tabs" role="tablist" aria-label="Brief sections">${tabs}</div><div class="prose">${renderMarkdown(map.sections[briefSection])}</div>`
    }
  </div>`;
}

function ticketHtml(map: WayfinderMap, ticket: Ticket): string {
  if (ticket.type === 'prototype') prototypesFor(map);
  const style = STATE_STYLE[ticket.state];
  const waitingOn = ticket.openBlockers.map((n) => `#${String(n)}`);
  const startable = startableReason(ticket);

  const banner =
    ticket.state === 'blocked'
      ? `Waiting on <b>${escapeHtml(waitingOn.join(' and '))}</b>. Copy the prompt now; starting unlocks when ${waitingOn.length === 1 ? 'it closes' : 'they close'}.`
      : ticket.state === 'done'
        ? 'This ticket is closed.'
        : ticket.state === 'claimed' && ticket.assignee !== null
          ? `<b>@${escapeHtml(ticket.assignee)}</b> is on it.`
          : null;

  return `
    <div class="dhead">
      ${typeGlyph(ticket.type)}
      <span class="num">#${String(ticket.number)}</span>
      ${stateChip(ticket.state)}
      <a class="iconbtn" href="${escapeHtml(ticket.url)}" target="_blank" rel="noreferrer" title="Open on GitHub" aria-label="Open on GitHub">${icon(icons.EXTERNAL)}</a>
    </div>
    <h2 class="dtitle">${escapeHtml(ticket.title)}</h2>
    ${banner === null ? '' : `<div class="banner" style="--accent: var(${style.variable})">${icon(style.icon)}<span>${banner}</span></div>`}
    <dl class="facts">
      <dt>Type</dt><dd>${icon(typeStyle(ticket.type).icon)}${escapeHtml(typeStyle(ticket.type).label)}</dd>
      <dt>Assignee</dt><dd>${ticket.assignee === null ? '<span class="none">unclaimed</span>' : escapeHtml(`@${ticket.assignee}`)}</dd>
      <dt>Needs</dt><dd>${ticketPills(map, ticket.blockedBy)}</dd>
      <dt>Unlocks</dt><dd>${ticketPills(map, dependents(map, ticket.number))}</dd>
    </dl>
    <div id="ticket-proto">${ticketPrototypeHtml(map, ticket)}</div>
    <div class="launch">
      ${startable === null ? `<div class="runwith" id="runwith">${runWithHtml(ticket.number)}</div>` : ''}
      <div id="launch-slot">${launchHtml(ticket)}</div>
    </div>
    <details class="sec"><summary>Prompt this sends</summary><pre class="prompt" id="prompt-preview">…</pre></details>
    <div class="body-text prose">${ticket.body.trim().length === 0 ? '<p class="none">No description on the issue.</p>' : renderMarkdown(ticket.body)}</div>`;
}

/* ---------- model picker ---------- */

function repoName(): string {
  return snapshot?.repo ?? '';
}

/** The ticket panel's "Run as" block: a tier switch, then the tier's model, editable for this one hand-off. */
function runWithHtml(ticketNumber: number): string {
  const tier = ticketTier(repoName(), ticketNumber);
  const tiers = TIERS.map(
    (candidate) =>
      `<button type="button" class="seg${candidate === tier ? ' is-on' : ''}" data-tier="${candidate}" aria-pressed="${String(candidate === tier)}" title="${escapeHtml(TIER_HINT[candidate])}">${TIER_LABEL[candidate]}</button>`,
  ).join('');
  return `
    <div class="runwith-row">
      <span class="runwith-label">Run as</span>
      <div class="segmented" role="group" aria-label="Task tier">${tiers}</div>
      <button type="button" class="linkish" id="edit-tiers">Defaults</button>
    </div>
    <div class="runwith-row picker" id="ticket-picker">${ticketPickerHtml(tier)}</div>`;
}

function ticketPickerHtml(tier: Tier): string {
  const state = currentCatalog();
  if (state.status === 'loading') return '<span class="hint">Loading T3 Code models…</span>';
  if (state.status === 'unavailable') return `<span class="hint">${escapeHtml(state.reason)} T3 Code will pick the model.</span>`;
  const choice = liveChoice(state.catalog, tierDefaults()[tier]);
  return (
    modelSelectHtml(state.catalog, choice, 'id="ticket-model" aria-label="Model"') +
    effortSelectHtml(findModel(state.catalog, choice), choice?.effort?.value, 'id="ticket-effort"')
  );
}

/** The model the ticket panel is set to right now, or null for T3 Code's default. */
function pickedModel(): ModelChoice | null {
  const state = currentCatalog();
  const modelSelect = document.getElementById('ticket-model');
  if (state.status !== 'ready' || !(modelSelect instanceof HTMLSelectElement)) return null;
  const effortSelect = document.getElementById('ticket-effort');
  return readChoice(state.catalog, modelSelect, effortSelect instanceof HTMLSelectElement ? effortSelect : null);
}

/** Swap the effort select for the one the newly picked model takes, at that model's default. */
function refreshEffort(modelSelect: HTMLSelectElement, effortId: string, attrs: string): void {
  const state = currentCatalog();
  if (state.status !== 'ready') return;
  const [instanceId = '', ...rest] = modelSelect.value.split('::');
  const model = findModel(state.catalog, { instanceId, model: rest.join('::') });
  document.getElementById(effortId)?.remove();
  modelSelect.insertAdjacentHTML('afterend', effortSelectHtml(model, undefined, attrs));
}

function renderTierRows(): void {
  const state = currentCatalog();
  if (state.status !== 'ready') {
    els.tierRows.innerHTML = `<p class="hint">${state.status === 'loading' ? 'Loading T3 Code models…' : escapeHtml(state.reason)}</p>`;
    return;
  }
  const saved = tierDefaults();
  els.tierRows.innerHTML = TIERS.map((tier) => {
    const choice = liveChoice(state.catalog, saved[tier]);
    return `<div class="tier-row">
      <div class="tier-name"><strong>${TIER_LABEL[tier]}</strong><span>${escapeHtml(TIER_HINT[tier])}</span></div>
      <div class="picker">
        ${modelSelectHtml(state.catalog, choice, `id="tier-model-${tier}" data-tier-model="${tier}" aria-label="${TIER_LABEL[tier]} model"`)}
        ${effortSelectHtml(findModel(state.catalog, choice), choice?.effort?.value, `id="tier-effort-${tier}" data-tier-effort="${tier}"`)}
      </div>
    </div>`;
  }).join('');
}

function saveTierRow(tier: Tier): void {
  const state = currentCatalog();
  const modelSelect = document.getElementById(`tier-model-${tier}`);
  if (state.status !== 'ready' || !(modelSelect instanceof HTMLSelectElement)) return;
  const effortSelect = document.getElementById(`tier-effort-${tier}`);
  saveTierDefault(tier, readChoice(state.catalog, modelSelect, effortSelect instanceof HTMLSelectElement ? effortSelect : null));
}

function openModels(): void {
  renderTierRows();
  els.modelsDialog.showModal();
  void loadCatalog(true).then(renderTierRows);
}

/** Put a fresh picker in the ticket panel once the catalog arrives or the defaults change. */
function refreshTicketPicker(): void {
  const picker = document.getElementById('ticket-picker');
  if (picker === null || selected === null) return;
  picker.innerHTML = ticketPickerHtml(ticketTier(repoName(), selected));
}

/* ---------- local clone ---------- */

/** What the server says about the checkout T3 Code would run this repo's threads in. */
type WorkspaceView =
  | { status: 'ready'; path: string; canChoose: boolean }
  | { status: 'choose'; candidates: string[]; canChoose: boolean };

let workspace: WorkspaceView | null = null;
let workspaceAsked = false;

async function loadWorkspace(): Promise<void> {
  workspaceAsked = true;
  try {
    const response = await fetch(scopedApiPath(repoName(), 'workspace'));
    workspace = response.ok ? ((await response.json()) as WorkspaceView) : null;
  } catch {
    // Leave it unknown: the hand-off still answers with its own fallback.
    workspace = null;
  }
}

function startableReason(ticket: Ticket): string | null {
  if (ticket.state === 'done') return 'This ticket is closed.';
  if (ticket.state === 'blocked') return `Waiting on ${ticket.openBlockers.map((n) => `#${String(n)}`).join(', ')}.`;
  return null;
}

function selectedTicket(): Ticket | null {
  const map = currentMap();
  if (map === null || selected === null) return null;
  return map.tickets.find((ticket) => ticket.number === selected) ?? null;
}

/**
 * The hand-off actions. T3 Code needs a checkout on disk, so when none is verified yet the
 * primary action becomes picking one and `Copy prompt` carries the ticket in the meantime.
 */
function launchHtml(ticket: Ticket): string {
  const startable = startableReason(ticket);
  const copy = `<button type="button" class="ghost" id="copy-prompt">${icon(icons.COPY)}Copy prompt</button>`;
  const start = (attrs = ''): string =>
    `<button type="button" class="primary" id="start-thread"${attrs}>${icon(icons.PLAY)}Open in T3 Code</button>`;

  if (startable !== null) return `<div class="launch-actions">${start(` disabled title="${escapeHtml(startable)}"`)}${copy}</div>`;
  // Still looking, or T3 Code has a verified clone: hand off straight away.
  if (workspace === null || workspace.status === 'ready') return `<div class="launch-actions">${start()}${copy}</div>`;

  const choosable = workspace.candidates.length > 0 || workspace.canChoose;
  const hint = choosable
    ? `T3 Code needs a local clone of ${escapeHtml(repoName())}. Choose one to start a thread. The prompt is ready to copy.`
    : `T3 Code needs a local clone of ${escapeHtml(repoName())}. Run wayfinder-map inside one, or pick a folder in the desktop app. The prompt is ready to copy.`;
  const options = workspace.candidates.map((path) => `<option value="${escapeHtml(path)}">${escapeHtml(path)}</option>`).join('');
  const chooser = workspace.canChoose
    ? `<button type="button" class="${workspace.candidates.length === 0 ? 'primary' : 'ghost'}" id="choose-clone">${icon(icons.FOLDER)}Choose local clone</button>`
    : '';

  return `
    <p class="hint clone-hint">${hint}</p>
    ${
      workspace.candidates.length === 0
        ? ''
        : `<div class="clone-row">
            <select id="clone-path" aria-label="Local clone">${options}</select>
            <button type="button" class="primary" id="use-clone">Use this clone</button>
          </div>`
    }
    <div class="launch-actions">${chooser}${copy}</div>`;
}

function refreshLaunch(): void {
  const slot = document.getElementById('launch-slot');
  const ticket = selectedTicket();
  if (slot !== null && ticket !== null) slot.innerHTML = launchHtml(ticket);
}

/** Take a clone for this repository: one the user typed in the list, or one they pick in a folder dialog. */
async function setClone(body: { choose: true } | { path: string }): Promise<void> {
  for (const id of ['choose-clone', 'use-clone']) {
    const button = document.getElementById(id);
    if (button instanceof HTMLButtonElement) button.disabled = true;
  }
  try {
    const response = await fetch(scopedApiPath(repoName(), 'workspace'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as Partial<WorkspaceView> & { error?: string; cancelled?: boolean };
    if (result.status !== undefined) workspace = result as WorkspaceView;
    refreshLaunch();
    if (typeof result.error === 'string') toast(result.error, 9000);
    else if (result.cancelled !== true && result.status === 'ready') toast(`Threads will run in ${result.path}.`, 5000);
  } catch (error) {
    refreshLaunch();
    toast((error as Error).message, 9000);
  }
}

/* ---------- hand-off ---------- */

async function handOff(copyOnly: boolean): Promise<void> {
  const map = currentMap();
  if (map === null || selected === null) return;

  const button = document.getElementById('start-thread');
  if (button instanceof HTMLButtonElement && !copyOnly) button.disabled = true;

  try {
    const response = await fetch(scopedApiPath(repoName(), 'hand-off'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ map: map.number, ticket: selected, copyOnly, model: copyOnly ? null : pickedModel() }),
    });
    const body = (await response.json()) as {
      prompt?: string;
      rung?: 'thread' | 'app' | 'clipboard' | null;
      copied?: boolean;
      notice?: string | null;
      error?: string | null;
    };

    if (!response.ok) {
      toast(body.error ?? 'Hand-off failed.', 9000);
      return;
    }

    const preview = document.getElementById('prompt-preview');
    if (preview !== null && typeof body.prompt === 'string') preview.textContent = body.prompt;

    if (typeof body.error === 'string') {
      toast(body.error, 9000);
      return;
    }
    if (copyOnly) {
      toast('Prompt copied.', 4000);
      return;
    }
    if (body.rung === 'thread') {
      toast('Started in T3 Code.', 3000);
      return;
    }
    toast(`${body.notice ?? ''}${body.rung === 'app' ? '' : ' Prompt copied.'}`.trim(), 9000);
  } catch (error) {
    toast((error as Error).message, 9000);
  } finally {
    // A blocked or closed ticket's button stays disabled; only undo what this call did.
    if (button instanceof HTMLButtonElement && !button.hasAttribute('title')) button.disabled = false;
  }
}

/* ---------- interaction ---------- */

function select(number: number | null): void {
  selected = number;
  inspectorTab = number === null ? 'brief' : 'ticket';
  hideCard();
  syncHighlights();
  renderInspector();
}

function setFilter(next: TicketFilter | null): void {
  filter = filter === next ? null : next;
  renderFilters();
  syncHighlights();
  if (inspectorTab === 'brief' || selected === null) renderInspector();
}

/** Open the first ticket the search and filter leave showing, and bring it into view. */
function jumpToFirstMatch(): void {
  const hit = currentMap()?.tickets.find((ticket) => matchesFilter(ticket, filter) && matchesQuery(ticket, query));
  if (hit === undefined) {
    toast('No ticket matches.', 2400);
    return;
  }
  select(hit.number);
  els.nodes.querySelector(`.node[data-number="${String(hit.number)}"]`)?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
}

type Menu = { button: HTMLElement; menu: HTMLElement };
const MENUS: Menu[] = [
  { button: els.mapSwitch, menu: els.mapMenu },
  { button: els.keyButton, menu: els.keyMenu },
];

function closeMenus(except: Menu | null = null): void {
  for (const entry of MENUS) {
    if (entry === except) continue;
    entry.menu.hidden = true;
    entry.button.setAttribute('aria-expanded', 'false');
  }
}

for (const entry of MENUS) {
  entry.button.addEventListener('click', (event) => {
    event.stopPropagation();
    closeMenus(entry);
    entry.menu.hidden = !entry.menu.hidden;
    entry.button.setAttribute('aria-expanded', String(!entry.menu.hidden));
  });
}

document.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  if (!MENUS.some((entry) => entry.menu.contains(target))) closeMenus();
});

els.mapMenu.addEventListener('click', (event) => {
  const item = (event.target as HTMLElement).closest<HTMLElement>('[data-index]');
  if (item === null) return;
  closeMenus();
  activeMap = Number(item.dataset['index']);
  const nextMap = currentMap();
  if (snapshot !== null && nextMap !== null) history.pushState(null, '', mapPath(snapshot.repo, nextMap.number));
  selected = null;
  hovered = null;
  filter = null;
  query = '';
  els.search.value = '';
  inspectorTab = 'brief';
  briefSection = 'destination';
  setZoom(1);
  els.canvasWrap.scrollTo(0, 0);
  render();
});

window.addEventListener('popstate', () => {
  const route = parseRepoPagePath(window.location.pathname);
  const index = snapshot?.maps.findIndex((map) => map.number === route?.mapNumber) ?? -1;
  if (index < 0) return;
  activeMap = index;
  selected = null;
  render();
});

els.filters.addEventListener('click', (event) => {
  const chip = (event.target as HTMLElement).closest<HTMLElement>('[data-filter]');
  if (chip === null) return;
  setFilter((chip.dataset['filter'] || null) as TicketFilter | null);
});

els.nodes.addEventListener('click', (event) => {
  const node = (event.target as HTMLElement).closest<HTMLElement>('.node');
  if (node === null) return;
  select(Number(node.dataset['number']));
});

els.nodes.addEventListener('pointerover', (event) => {
  setHovered((event.target as HTMLElement).closest<HTMLElement>('.node'));
});

els.nodes.addEventListener('pointerout', (event) => {
  const next = event.relatedTarget instanceof HTMLElement ? event.relatedTarget.closest<HTMLElement>('.node') : null;
  if (next === null) setHovered(null);
});

els.nodes.addEventListener('focusin', (event) => {
  setHovered((event.target as HTMLElement).closest<HTMLElement>('.node'));
});

els.nodes.addEventListener('focusout', () => setHovered(null));

els.protoWrap.addEventListener('click', (event) => {
  const jump = (event.target as HTMLElement).closest<HTMLElement>('[data-jump]');
  if (jump !== null) select(Number(jump.dataset['jump']));
});

els.tableWrap.addEventListener('click', (event) => {
  const row = (event.target as HTMLElement).closest<HTMLElement>('tr[data-number]');
  if (row === null) return;
  select(Number(row.dataset['number']));
});

els.search.addEventListener('input', () => {
  query = els.search.value;
  syncHighlights();
});

els.search.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') jumpToFirstMatch();
  if (event.key !== 'Escape') return;
  event.stopPropagation();
  els.search.value = '';
  query = '';
  syncHighlights();
  els.search.blur();
});

els.inspector.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const panelTab = target.closest<HTMLElement>('[data-panel]');
  if (panelTab !== null) {
    inspectorTab = panelTab.dataset['panel'] === 'ticket' ? 'ticket' : 'brief';
    renderInspector();
    return;
  }

  const section = target.closest<HTMLElement>('[data-section]');
  if (section !== null) {
    briefSection = section.dataset['section'] as keyof MapSections;
    renderInspector();
    return;
  }

  const statusRow = target.closest<HTMLElement>('[data-filter]');
  if (statusRow !== null) {
    setFilter((statusRow.dataset['filter'] || null) as TicketFilter | null);
    return;
  }

  const jump = target.closest<HTMLElement>('[data-jump]');
  if (jump !== null) {
    select(Number(jump.dataset['jump']));
    return;
  }

  if (target.closest('#edit-tiers') !== null) openModels();
  const tierButton = target.closest<HTMLElement>('[data-tier]');
  if (tierButton !== null && selected !== null) {
    saveTicketTier(repoName(), selected, tierButton.dataset['tier'] as Tier);
    const runWith = document.getElementById('runwith');
    if (runWith !== null) runWith.innerHTML = runWithHtml(selected);
  }
  if (target.closest('#start-thread') !== null) void handOff(false);
  if (target.closest('#copy-prompt') !== null) void handOff(true);
  if (target.closest('#choose-clone') !== null) void setClone({ choose: true });
  if (target.closest('#use-clone') !== null) {
    const clone = document.getElementById('clone-path');
    if (clone instanceof HTMLSelectElement) void setClone({ path: clone.value });
  }
});

els.inspector.addEventListener('change', (event) => {
  const target = event.target;
  if (target instanceof HTMLSelectElement && target.id === 'ticket-model') refreshEffort(target, 'ticket-effort', 'id="ticket-effort"');
});

els.tierRows.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  const tier = (target.dataset['tierModel'] ?? target.dataset['tierEffort']) as Tier | undefined;
  if (tier === undefined) return;
  if (target.dataset['tierModel'] !== undefined) {
    refreshEffort(target, `tier-effort-${tier}`, `id="tier-effort-${tier}" data-tier-effort="${tier}"`);
  }
  saveTierRow(tier);
});

els.modelsDialog.addEventListener('close', refreshTicketPicker);
need('models').addEventListener('click', openModels);

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    els.search.focus();
    els.search.select();
    return;
  }
  if (event.key !== 'Escape' || els.modelsDialog.open) return;
  if (MENUS.some((entry) => !entry.menu.hidden)) {
    closeMenus();
    return;
  }
  select(null);
});

void loadCatalog().then(refreshTicketPicker);

els.synced.addEventListener('click', () => {
  void load('manual').then(() => {
    const map = currentMap();
    prototypeLoads.clear();
    if (map === null) return;
    if (view === 'prototypes' || map.tickets.find((ticket) => ticket.number === selected)?.type === 'prototype') {
      prototypesFor(map, true);
      if (view === 'prototypes') renderPrototypes();
      renderTicketPrototype();
    }
  });
});

bindTheme(need('theme'));
bindUpdater(need('updater'), toast);
bindAccountMark(document.getElementById('account-mark'));

function setView(next: View): void {
  view = next;
  els.app.classList.toggle('is-prototypes', next === 'prototypes');
  for (const [id, on] of [
    ['view-map', next === 'map'],
    ['view-table', next === 'table'],
    ['view-prototypes', next === 'prototypes'],
  ] as const) {
    const button = need(id);
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-pressed', String(on));
  }
  render();
}

if (new URLSearchParams(window.location.search).get('view') === 'prototypes') setView('prototypes');

need('view-map').addEventListener('click', () => setView('map'));
need('view-table').addEventListener('click', () => setView('table'));
need('view-prototypes').addEventListener('click', () => setView('prototypes'));

/* zoom and pan */

function setZoom(next: number): void {
  zoom = Math.min(1.6, Math.max(0.4, Math.round(next * 100) / 100));
  els.canvas.style.transform = `scale(${String(zoom)})`;
  els.zoomReset.textContent = `${String(Math.round(zoom * 100))}%`;
  hideCard();
}

need('zoom-in').addEventListener('click', () => setZoom(zoom + 0.1));
need('zoom-out').addEventListener('click', () => setZoom(zoom - 0.1));
els.zoomReset.addEventListener('click', () => setZoom(1));

els.canvasWrap.addEventListener(
  'wheel',
  (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    setZoom(zoom + (event.deltaY > 0 ? -0.1 : 0.1));
  },
  { passive: false },
);

els.canvasWrap.addEventListener('scroll', hideCard, { passive: true });

let panFrom: { x: number; y: number; left: number; top: number } | null = null;

els.canvasWrap.addEventListener('pointerdown', (event) => {
  if ((event.target as HTMLElement).closest('.node') !== null) return;
  panFrom = {
    x: event.clientX,
    y: event.clientY,
    left: els.canvasWrap.scrollLeft,
    top: els.canvasWrap.scrollTop,
  };
  els.canvasWrap.classList.add('is-panning');
  els.canvasWrap.setPointerCapture(event.pointerId);
});

els.canvasWrap.addEventListener('pointermove', (event) => {
  if (panFrom === null) return;
  els.canvasWrap.scrollLeft = panFrom.left - (event.clientX - panFrom.x);
  els.canvasWrap.scrollTop = panFrom.top - (event.clientY - panFrom.y);
});

for (const type of ['pointerup', 'pointercancel'] as const) {
  els.canvasWrap.addEventListener(type, () => {
    panFrom = null;
    els.canvasWrap.classList.remove('is-panning');
  });
}

const autoRefresh = new AutoRefresh({
  refresh: () => load('background'),
  isVisible: () => document.visibilityState === 'visible',
});

document.addEventListener('visibilitychange', () => autoRefresh.visibilityChanged());
window.addEventListener('pagehide', () => autoRefresh.stop());
window.setInterval(renderSynced, 15_000);

renderInspector();
void load('initial').then((successful) => {
  if (successful) autoRefresh.markSuccessfulSnapshot();
  autoRefresh.start();
});
