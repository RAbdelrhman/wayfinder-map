import { DEFAULT_LAYOUT, layoutTickets } from '../layout.js';
import type { PositionedNode } from '../layout.js';
import { TICKET_TYPES } from '../types.js';
import type { MapSnapshot, Ticket, TicketState, TicketType, WayfinderMap } from '../types.js';

/* ---------- state channel: one hue each, always with an icon and a word ---------- */

interface StateStyle {
  label: string;
  legend: string;
  variable: string;
  icon: string;
}

const CHECK = '<path d="M20 6 9 17l-5-5"/>';
const LOCK = '<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>';
const PERSON = '<path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="7" r="4"/>';
const ARROW = '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>';

const STATE_STYLE: Record<TicketState, StateStyle> = {
  frontier: { label: 'next', legend: 'Next up: open, unblocked, unclaimed', variable: '--state-frontier', icon: ARROW },
  claimed: { label: 'claimed', legend: 'Claimed: someone is on it', variable: '--state-claimed', icon: PERSON },
  blocked: { label: 'blocked', legend: 'Blocked: waiting on another ticket', variable: '--state-blocked', icon: LOCK },
  done: { label: 'done', legend: 'Done: the issue is closed', variable: '--state-done', icon: CHECK },
};

const STATE_ORDER: TicketState[] = ['frontier', 'claimed', 'blocked', 'done'];

/* ---------- type channel: one icon each, drawn from what the work feels like ---------- */

interface TypeStyle {
  label: string;
  icon: string;
}

/** A magnifier: go and find out. */
const LENS = '<circle cx="11" cy="11" r="6.4"/><path d="m20 20-4.4-4.4"/>';
/** A beaker: build the small thing and see what happens. */
const BEAKER =
  '<path d="M9.5 3h5"/><path d="M10.8 3v6.4L5.5 17.9A2 2 0 0 0 7.2 21h9.6a2 2 0 0 0 1.7-3.1L13.2 9.4V3"/><path d="M7.8 15h8.4"/>';
/** A kettle grill, heat and all: hold the idea over the flame. */
const GRILL =
  '<path d="M3.5 8.5h17"/><path d="M5 8.5a7 7 0 0 0 14 0"/><path d="m8.4 14.5-2.4 6.3"/><path d="m15.6 14.5 2.4 6.3"/><path d="M9.6 2.3c-1 1.1.6 1.7 0 2.9"/><path d="M14.4 2.3c-1 1.1.6 1.7 0 2.9"/>';
/** A list: a known job, written down. */
const LIST = '<path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/><path d="M8.5 6H20"/><path d="M8.5 12H20"/><path d="M8.5 18H20"/>';
/** A circle with a bar through it: no wayfinder:<type> label on the issue. */
const BLANK = '<circle cx="12" cy="12" r="7.4"/><path d="M8.6 12h6.8"/>';

const TYPE_STYLE: Record<TicketType, TypeStyle> = {
  research: { label: 'research', icon: LENS },
  prototype: { label: 'prototype', icon: BEAKER },
  grilling: { label: 'grilling', icon: GRILL },
  task: { label: 'task', icon: LIST },
};

const UNTYPED: TypeStyle = { label: 'untyped', icon: BLANK };

function typeStyle(type: TicketType | null): TypeStyle {
  return type === null ? UNTYPED : TYPE_STYLE[type];
}

/** The square type badge that rides at the head of a node, a row and the detail panel. */
function typeGlyph(type: TicketType | null): string {
  const style = typeStyle(type);
  return `<span class="glyph" title="${escapeHtml(style.label)}">${icon(style.icon)}</span>`;
}

function icon(path: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

/* ---------- element handles ---------- */

function need<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Missing #${id}`);
  return element as T;
}

const els = {
  repo: need('repo'),
  tabs: need('maptabs'),
  warnings: need('warnings'),
  mapcard: need('mapcard'),
  legend: need('legend'),
  canvasWrap: need('canvas-wrap'),
  canvas: need('canvas'),
  edges: need<HTMLElement>('edges') as unknown as SVGSVGElement,
  nodes: need('nodes'),
  tableWrap: need('tablewrap'),
  detail: need('detail'),
  toast: need('toast'),
  shell: document.querySelector<HTMLElement>('.shell'),
};

/* ---------- app state ---------- */

let snapshot: MapSnapshot | null = null;
let activeMap = 0;
let selected: number | null = null;
let view: 'map' | 'table' = 'map';
let zoom = 1;

function currentMap(): WayfinderMap | null {
  return snapshot?.maps[activeMap] ?? null;
}

let toastTimer: number | undefined;

function toast(message: string, ms = 4200): void {
  els.toast.textContent = message;
  els.toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, ms);
}

/* ---------- data ---------- */

async function load(force: boolean): Promise<void> {
  els.repo.textContent = force ? 're-reading GitHub…' : 'reading GitHub…';
  const response = await fetch(`/api/snapshot${force ? '?refresh=1' : ''}`);
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = (body as { error?: string }).error ?? 'Could not read the maps.';
    els.repo.textContent = 'failed';
    toast(message, 12000);
    return;
  }
  snapshot = body as MapSnapshot;
  activeMap = Math.min(activeMap, Math.max(0, snapshot.maps.length - 1));
  render();
}

/* ---------- render ---------- */

function render(): void {
  if (snapshot === null) return;
  els.repo.textContent = snapshot.repo;
  document.title = `${snapshot.repo} · wayfinder map`;

  els.warnings.hidden = snapshot.warnings.length === 0;
  els.warnings.textContent = snapshot.warnings.join('  ·  ');

  renderTabs(snapshot.maps);
  renderLegend();
  renderMapCard();
  if (view === 'map') renderGraph();
  else renderTable();
  renderDetail();
}

function renderTabs(maps: readonly WayfinderMap[]): void {
  els.tabs.innerHTML = maps
    .map((map, index) => {
      const open = map.tickets.filter((ticket) => ticket.open).length;
      return `<button type="button" class="maptab${index === activeMap ? ' is-on' : ''}" data-index="${String(index)}">
        ${escapeHtml(map.title)} <span class="num">${String(open)} open</span>
      </button>`;
    })
    .join('');
}

function renderLegend(): void {
  const states = STATE_ORDER.map((state) => {
    const style = STATE_STYLE[state];
    return `<span class="legend-item" role="listitem" style="--accent: var(${style.variable})">
      <span style="color: var(${style.variable}); display:flex">${icon(style.icon)}</span>${escapeHtml(style.legend)}
    </span>`;
  }).join('');

  const types = TICKET_TYPES.map((type) => {
    const style = TYPE_STYLE[type];
    return `<span class="legend-item is-type" role="listitem">${icon(style.icon)}${escapeHtml(style.label)}</span>`;
  }).join('');

  els.legend.innerHTML = `${states}<span class="legend-sep" role="none" aria-hidden="true"></span>${types}`;
}

function renderMapCard(): void {
  const map = currentMap();
  if (map === null) {
    els.mapcard.innerHTML = '';
    return;
  }

  const counts = new Map<TicketState, number>();
  for (const ticket of map.tickets) counts.set(ticket.state, (counts.get(ticket.state) ?? 0) + 1);

  const tally = STATE_ORDER.filter((state) => (counts.get(state) ?? 0) > 0)
    .map((state) => {
      const style = STATE_STYLE[state];
      return `<span class="tally-item" style="--accent: var(${style.variable})">
        <span style="color: var(${style.variable}); display:flex; width:13px">${icon(style.icon)}</span>
        <b>${String(counts.get(state) ?? 0)}</b> ${escapeHtml(style.label)}
      </span>`;
    })
    .join('');

  const section = (title: string, text: string, open: boolean): string =>
    text.trim().length === 0
      ? ''
      : `<details class="section"${open ? ' open' : ''}><summary>${title}</summary><div class="prose">${escapeHtml(text)}</div></details>`;

  els.mapcard.innerHTML = `
    <h1>${escapeHtml(map.title)}</h1>
    <a class="issuelink" href="${escapeHtml(map.url)}" target="_blank" rel="noreferrer">#${String(map.number)} on GitHub</a>
    <div class="tally">${tally}</div>
    ${section('Destination', map.sections.destination, true)}
    ${section('Not yet specified', map.sections.fog, true)}
    ${section('Notes', map.sections.notes, false)}
    ${section('Decisions so far', map.sections.decisions, false)}
    ${section('Out of scope', map.sections.outOfScope, false)}
  `;
}

function nodeHtml(ticket: Ticket, position: PositionedNode): string {
  const style = STATE_STYLE[ticket.state];
  const meta =
    ticket.state === 'blocked'
      ? `blocked by ${ticket.openBlockers.map((n) => `#${String(n)}`).join(', ')}`
      : ticket.assignee !== null
        ? `@${ticket.assignee}`
        : (ticket.type ?? 'untyped');

  return `<button type="button" class="node${ticket.state === 'done' ? ' is-done' : ''}${
    selected === ticket.number ? ' is-selected' : ''
  }"
    data-number="${String(ticket.number)}"
    style="--accent: var(${style.variable}); left:${String(position.x)}px; top:${String(position.y)}px; width:${String(position.width)}px; height:${String(position.height)}px"
    aria-label="${escapeHtml(`#${String(ticket.number)} ${ticket.title}, ${style.label}`)}">
    <span class="node-top">
      ${typeGlyph(ticket.type)}
      <span class="num">#${String(ticket.number)}</span>
      <span class="chip">${icon(style.icon)}${escapeHtml(style.label)}</span>
    </span>
    <span class="title">${escapeHtml(ticket.title)}</span>
    <span class="meta">${escapeHtml(meta)}</span>
  </button>`;
}

function renderGraph(): void {
  els.canvasWrap.hidden = false;
  els.tableWrap.hidden = true;

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
      return `<path class="${live ? 'is-live' : ''}" d="M${String(x1)},${String(y1)} C${String(x1 + bend)},${String(y1)} ${String(x2 - bend)},${String(y2)} ${String(x2)},${String(y2)}" />`;
    })
    .join('');
}

function renderTable(): void {
  els.canvasWrap.hidden = true;
  els.tableWrap.hidden = false;

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
}

function renderDetail(): void {
  const map = currentMap();
  const ticket = map?.tickets.find((candidate) => candidate.number === selected) ?? null;

  els.detail.hidden = ticket === null;
  els.shell?.classList.toggle('has-detail', ticket !== null);
  if (ticket === null || map === null) {
    els.detail.innerHTML = '';
    return;
  }

  const style = STATE_STYLE[ticket.state];
  const blockers =
    ticket.blockedBy.length === 0
      ? '—'
      : ticket.blockedBy
          .map((number) => {
            const still = ticket.openBlockers.includes(number);
            return `<a href="${escapeHtml(map.url.replace(/\/\d+$/, `/${String(number)}`))}" target="_blank" rel="noreferrer">#${String(number)}</a>${still ? '' : ' (closed)'}`;
          })
          .join(', ');

  els.detail.innerHTML = `
    <div class="detail-head" style="--accent: var(${style.variable})">
      ${typeGlyph(ticket.type)}
      <span class="num">#${String(ticket.number)}</span>
      <span class="chip">${icon(style.icon)}${escapeHtml(style.label)}</span>
      <button type="button" class="detail-close" id="detail-close" aria-label="Close">×</button>
    </div>
    <h2>${escapeHtml(ticket.title)}</h2>
    <dl class="facts">
      <dt>Type</dt><dd><span class="typecell">${icon(typeStyle(ticket.type).icon)}${escapeHtml(typeStyle(ticket.type).label)}</span></dd>
      <dt>Assignee</dt><dd>${ticket.assignee === null ? 'unclaimed' : escapeHtml(`@${ticket.assignee}`)}</dd>
      <dt>Blocked by</dt><dd>${blockers}</dd>
      <dt>Map</dt><dd>${escapeHtml(map.title)}</dd>
    </dl>
    <div class="actions">
      <button type="button" class="primary" id="start-thread">Start T3 Code thread</button>
      <button type="button" class="ghost" id="copy-prompt">Copy prompt</button>
      <a class="ghost" href="${escapeHtml(ticket.url)}" target="_blank" rel="noreferrer" style="text-decoration:none">GitHub</a>
    </div>
    <details class="section"><summary>Prompt this sends</summary><pre class="prompt" id="prompt-preview">…</pre></details>
    <div class="body-text">${escapeHtml(ticket.body.trim().length === 0 ? 'No description on the issue.' : ticket.body)}</div>
  `;
}

/* ---------- hand-off ---------- */

async function handOff(copyOnly: boolean): Promise<void> {
  const map = currentMap();
  if (map === null || selected === null) return;

  const button = document.getElementById('start-thread');
  if (button instanceof HTMLButtonElement && !copyOnly) button.disabled = true;

  try {
    const response = await fetch('/api/hand-off', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ map: map.number, ticket: selected, copyOnly }),
    });
    const body = (await response.json()) as {
      prompt?: string;
      copied?: boolean;
      opened?: string | null;
      error?: string | null;
    };

    if (!response.ok) {
      toast(body.error ?? 'Hand-off failed.', 9000);
      return;
    }

    const preview = document.getElementById('prompt-preview');
    if (preview !== null && typeof body.prompt === 'string') preview.textContent = body.prompt;

    if (body.error !== null && body.error !== undefined) {
      toast(body.error, 9000);
      return;
    }

    toast(
      copyOnly
        ? 'Prompt copied. Paste it into a new T3 Code thread.'
        : 'Prompt copied and T3 Code is up front. Open a new thread and paste (Ctrl+V).',
      6000,
    );
  } catch (error) {
    toast((error as Error).message, 9000);
  } finally {
    if (button instanceof HTMLButtonElement) button.disabled = false;
  }
}

/* ---------- interaction ---------- */

function select(number: number | null): void {
  selected = number;
  if (view === 'map') renderGraph();
  renderDetail();
}

els.tabs.addEventListener('click', (event) => {
  const tab = (event.target as HTMLElement).closest<HTMLElement>('.maptab');
  if (tab === null) return;
  activeMap = Number(tab.dataset['index']);
  selected = null;
  zoom = 1;
  applyZoom();
  render();
});

els.nodes.addEventListener('click', (event) => {
  const node = (event.target as HTMLElement).closest<HTMLElement>('.node');
  if (node === null) return;
  select(Number(node.dataset['number']));
});

els.tableWrap.addEventListener('click', (event) => {
  const row = (event.target as HTMLElement).closest<HTMLElement>('tr[data-number]');
  if (row === null) return;
  select(Number(row.dataset['number']));
});

els.detail.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  if (target.closest('#detail-close') !== null) select(null);
  if (target.closest('#start-thread') !== null) void handOff(false);
  if (target.closest('#copy-prompt') !== null) void handOff(true);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') select(null);
});

need('refresh').addEventListener('click', () => void load(true));

need('theme').addEventListener('click', () => {
  const dark = getComputedStyle(document.body).getPropertyValue('color-scheme').trim() === 'dark';
  const next = dark ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('wayfinder-map:theme', next);
});

function setView(next: 'map' | 'table'): void {
  view = next;
  for (const [id, on] of [
    ['view-map', next === 'map'],
    ['view-table', next === 'table'],
  ] as const) {
    const button = need(id);
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-pressed', String(on));
  }
  render();
}

need('view-map').addEventListener('click', () => setView('map'));
need('view-table').addEventListener('click', () => setView('table'));

/* zoom and pan */

function applyZoom(): void {
  els.canvas.style.transform = `scale(${String(zoom)})`;
}

function nudgeZoom(delta: number): void {
  zoom = Math.min(1.6, Math.max(0.4, Math.round((zoom + delta) * 100) / 100));
  applyZoom();
}

need('zoom-in').addEventListener('click', () => nudgeZoom(0.1));
need('zoom-out').addEventListener('click', () => nudgeZoom(-0.1));
need('zoom-reset').addEventListener('click', () => {
  zoom = 1;
  applyZoom();
});

els.canvasWrap.addEventListener(
  'wheel',
  (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    nudgeZoom(event.deltaY > 0 ? -0.1 : 0.1);
  },
  { passive: false },
);

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

void load(false);
