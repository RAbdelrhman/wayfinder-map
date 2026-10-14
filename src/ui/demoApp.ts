import { DEMO_MAP, canHandOff, demoTicket, openNeeds } from './demo/demoData.js';
import type { DemoTicket, DemoTicketState, DemoTicketType } from './demo/demoData.js';
import { HAND_OFF_DONE, HAND_OFF_EXAMPLE, PLAN_DONE } from './demo/demoJourney.js';
import type { DemoState } from './demo/demoJourney.js';
import * as icons from './icons.js';
import { icon } from './icons.js';
import { escapeHtml } from './markdown.js';
import { TOUR_COPY, TOUR_STATES, TOUR_TYPES } from './tourCopy.js';

/*
  The demo copy of the app the product tour spotlights (#238, option A): sidebar, top bar
  and the four screens the demo journey visits. It returns markup for a DemoState and owns
  no state. The only live controls are the ones a step asks for (Start map, Open the map,
  the tickets and Open in T3 Code); everything else is drawn but not focusable, because it
  leads outside the demo.
*/

const NODE_W = 184;
const NODE_H = 100;
const COL_X = [16, 220, 424] as const;
const ROW_Y = [20, 152, 284] as const;

const TYPE_ICON: Record<DemoTicketType, string> = { research: icons.LENS, grilling: icons.GRILL, prototype: icons.BEAKER, task: icons.LIST };
const STATE_ICON: Record<DemoTicketState, string> = { done: icons.CHECK, next: icons.ARROW, blocked: icons.LOCK };

const esc = escapeHtml;
const pill = (): string => `<span class="demo-pill">${esc(TOUR_COPY.demoPill)}</span>`;
const typeIcon = (type: DemoTicketType): string => `<span class="demo-type" title="${esc(TOUR_TYPES[type].label)}">${icon(TYPE_ICON[type])}</span>`;
const stateBadge = (state: DemoTicketState): string => `<span class="demo-state is-${state}">${icon(STATE_ICON[state])}${esc(TOUR_STATES[state])}</span>`;
const refs = (numbers: readonly number[]): string => numbers.map((n) => `<span class="demo-ref">#${String(n)}</span>`).join(' ') || '<span class="demo-muted">nothing</span>';
const colX = (ticket: DemoTicket): number => COL_X[ticket.col] ?? 0;
const rowY = (ticket: DemoTicket): number => ROW_Y[ticket.row] ?? 0;

export const planDone = (state: DemoState): boolean => state.plan >= PLAN_DONE;

function sidebar(state: DemoState): string {
  if (state.view === 'map' || state.view === 'planning') {
    return `<aside class="demo-sidebar is-rail" aria-label="Demo navigation">
      <span class="demo-logo" aria-hidden="true">${icon(icons.COMPASS)}</span>
      <span class="demo-rail-btn is-primary" aria-hidden="true">${icon(icons.PLUS)}</span>
      <span class="demo-rail-btn" aria-hidden="true">${icon(icons.HOME)}</span>
      <span class="demo-rail-sep"></span>
      <span class="demo-rail-btn is-current" aria-label="${esc(DEMO_MAP.repo)}, demo repository"><span class="demo-mono is-demo">DR</span></span>
      <span class="demo-rail-btn" aria-hidden="true"><span class="demo-mono">AS</span></span>
      <span class="demo-rail-foot"><span class="demo-rail-btn" aria-hidden="true">${icon(icons.GEAR)}</span></span>
    </aside>`;
  }
  // G: on Home the No maps yet card holds the one Start a new map, so the sidebar leaves it out.
  const newMap = state.view === 'home' ? '' : `<span class="primary demo-new">${icon(icons.PLUS)}Start a new map</span>`;
  return `<aside class="demo-sidebar" aria-label="Demo navigation">
    <div class="demo-brand"><span class="demo-logo" aria-hidden="true">${icon(icons.COMPASS)}</span>Wayfinder</div>
    ${newMap}
    <span class="demo-nav${state.view === 'home' ? ' is-current' : ''}">${icon(icons.HOME)}<span>Home</span></span>
    <h2 class="eyebrow demo-eyebrow">Repositories</h2>
    <ul class="demo-repos">
      <li><span class="demo-nav"><span class="demo-mono is-demo" aria-hidden="true">DR</span><span>recipes</span>${pill()}</span></li>
      <li><span class="demo-nav"><span class="demo-mono" aria-hidden="true">AS</span><span>storefront</span></span></li>
    </ul>
    <div class="demo-foot">
      <span class="demo-avatar" aria-hidden="true">M</span><span class="demo-user">mira-dev</span>
      <span class="iconbtn" aria-hidden="true">${icon(icons.GEAR)}</span>
    </div>
  </aside>`;
}

function topbar(state: DemoState): string {
  const title = state.view === 'map'
    ? `<span class="demo-crumb"><span class="demo-mono is-demo" aria-hidden="true">DR</span>${esc(DEMO_MAP.repo)}</span><span class="demo-slash">/</span><span class="demo-crumb is-map">#${String(DEMO_MAP.mapNumber)} ${esc(DEMO_MAP.mapTitle)}</span>`
    : `<span class="demo-title">${state.view === 'home' ? 'Home' : 'Start a new map'}</span>`;
  return `<header class="demo-topbar">${title}<span class="demo-spacer"></span><span class="demo-inbox">${icon(icons.BELL)}<span>Inbox</span></span></header>`;
}

function home(): string {
  return `<main class="demo-page demo-home">
    <section class="demo-empty">
      <p class="eyebrow">Continue</p>
      <h2>No maps yet</h2>
      <p>Describe a goal and Wayfinder plans it as a map of tickets.</p>
      <span class="primary">${icon(icons.PLUS)}Start a new map</span>
    </section>
    <section>
      <p class="eyebrow">Repositories</p>
      <div class="demo-list">
        <div class="demo-row"><span class="demo-mono is-demo" aria-hidden="true">DR</span><strong>${esc(DEMO_MAP.repo)}</strong>${pill()}<span class="demo-muted">no maps yet</span></div>
        <div class="demo-row"><span class="demo-mono" aria-hidden="true">AS</span><strong>acme/storefront</strong><span class="demo-muted">no maps yet</span></div>
      </div>
    </section>
  </main>`;
}

function newMap(): string {
  return `<main class="demo-page demo-newmap">
    <h1>What do you want to get done?</h1>
    <div class="demo-composer">
      <label class="sr-only" for="demo-goal">Goal</label>
      <textarea id="demo-goal" rows="3" readonly tabindex="-1">${esc(DEMO_MAP.goal)}</textarea>
      <div class="demo-composer-bar">
        <span class="demo-chip">${icon(icons.REPO)}${esc(DEMO_MAP.repo)}${pill()}</span>
        <span class="demo-chip is-quiet">${icon(icons.SLIDERS)}Mid</span>
        <span class="demo-spacer"></span>
        <button type="button" class="primary" id="demo-start" data-demo-act="startMap">Start map${icon(icons.ARROW)}</button>
      </div>
      <p class="demo-note">${esc(TOUR_COPY.startMapNote)}</p>
    </div>
  </main>`;
}

function planning(state: DemoState): string {
  const answered = Math.min(state.plan, DEMO_MAP.interview.length);
  const lines = DEMO_MAP.interview.slice(0, answered).map((line) => `
    <li class="demo-qa"><p class="demo-q"><span class="demo-who">T3 Code</span>${esc(line.q)}</p><p class="demo-a"><span class="demo-who">You</span>${esc(line.a)}</p></li>`).join('');
  const done = planDone(state);
  const drafting = state.plan > DEMO_MAP.interview.length
    ? `<li class="demo-step-line">${icon(done ? icons.CHECK : icons.CLOCK)}${done ? `Drafted ${String(DEMO_MAP.tickets.length)} tickets on map #${String(DEMO_MAP.mapNumber)}` : 'Drafting tickets…'}</li>`
    : '';
  return `<main class="demo-page demo-newmap">
    <h1>Planning “${esc(DEMO_MAP.mapTitle)}”</h1>
    <section class="demo-plan" id="demo-plan" aria-live="polite" aria-busy="${String(!done)}">
      <p class="demo-plan-head">${pill()}<span>${done ? 'The demo map is ready' : 'T3 Code is asking about your goal'}</span></p>
      <ol class="demo-transcript">${lines}${drafting}</ol>
      ${done ? `<button type="button" class="primary" id="demo-open-map" data-demo-act="openMap">Open the map${icon(icons.ARROW)}</button>` : ''}
    </section>
  </main>`;
}

function node(ticket: DemoTicket, state: DemoState): string {
  const foot = ticket.needs.length > 0 ? `needs ${ticket.needs.map((n) => `#${String(n)}`).join(', ')}` : ticket.state === 'done' ? 'closed' : 'ready to start';
  const selected = state.selected === ticket.n;
  const label = `#${String(ticket.n)} ${ticket.title}, ${ticket.type}, ${TOUR_STATES[ticket.state]}${ticket.needs.length > 0 ? `, needs ${ticket.needs.map((n) => `#${String(n)}`).join(' and ')}` : ''}`;
  return `<button type="button" class="demo-node is-${ticket.state}${selected ? ' is-selected' : ''}" data-ticket="${String(ticket.n)}" data-demo-act="select" aria-pressed="${String(selected)}"
    style="left:${String(colX(ticket))}px;top:${String(rowY(ticket))}px;width:${String(NODE_W)}px" aria-label="${esc(label)}">
    <span class="demo-node-top">${typeIcon(ticket.type)}<span class="demo-num">#${String(ticket.n)}</span>${stateBadge(ticket.state)}</span>
    <span class="demo-node-title">${esc(ticket.title)}</span>
    <span class="demo-node-foot">${foot}</span>
  </button>`;
}

function edges(): string {
  const paths: string[] = [];
  for (const ticket of DEMO_MAP.tickets) {
    for (const n of ticket.needs) {
      const from = demoTicket(n);
      if (from === undefined) continue;
      const x1 = colX(from) + NODE_W;
      const y1 = rowY(from) + NODE_H / 2;
      const x2 = colX(ticket);
      const y2 = rowY(ticket) + NODE_H / 2;
      const mid = (x1 + x2) / 2;
      paths.push(`<path d="M${String(x1)} ${String(y1)} C${String(mid)} ${String(y1)} ${String(mid)} ${String(y2)} ${String(x2)} ${String(y2)}"${from.state === 'done' ? '' : ' class="is-open"'}/>`);
    }
  }
  return `<svg class="demo-edges" aria-hidden="true" width="${String((COL_X[2] ?? 0) + NODE_W + 20)}" height="${String((ROW_Y[2] ?? 0) + NODE_H + 20)}">${paths.join('')}</svg>`;
}

function filters(): string {
  const count = (keep: (ticket: DemoTicket) => boolean): string => String(DEMO_MAP.tickets.filter(keep).length);
  const typeChips = (Object.keys(TOUR_TYPES) as DemoTicketType[]).map((type) =>
    `<span class="demo-filter">${icon(TYPE_ICON[type])}${esc(TOUR_TYPES[type].label)}<span class="num">${count((ticket) => ticket.type === type)}</span></span>`).join('');
  return `<div class="demo-filters" role="group" aria-label="Ticket filters">
    <span class="demo-filter is-on">All<span class="num">${String(DEMO_MAP.tickets.length)}</span></span>
    <span class="demo-filter">${icon(icons.ARROW)}Next up<span class="num">${count((ticket) => ticket.state === 'next')}</span></span>
    <span class="demo-filter">${icon(icons.LOCK)}Blocked<span class="num">${count((ticket) => ticket.state === 'blocked')}</span></span>
    <span class="demo-filter">${icon(icons.CHECK)}Done<span class="num">${count((ticket) => ticket.state === 'done')}</span></span>
    <span class="demo-sep" aria-hidden="true"></span>
    <span class="demo-types-group" id="demo-types">${typeChips}</span>
  </div>`;
}

/** The four ticket types, for the Ticket types step's card. */
export function typeLegendHtml(): string {
  return `<ul class="demo-type-legend">${(Object.keys(TOUR_TYPES) as DemoTicketType[]).map((type) =>
    `<li>${icon(TYPE_ICON[type])}<strong>${esc(TOUR_TYPES[type].label)}</strong><span>${esc(TOUR_TYPES[type].line)}</span></li>`).join('')}</ul>`;
}

function handOffStatus(state: DemoState): string {
  if (state.selected !== HAND_OFF_EXAMPLE || state.handOff === 0) return '';
  const last = DEMO_MAP.handOff.length - 1;
  const lines = DEMO_MAP.handOff.map((line, index) => {
    const done = state.handOff > index + 1 || (index === last && state.handOff >= HAND_OFF_DONE);
    const now = !done && state.handOff === index + 1;
    if (!done && !now) return '';
    return `<li class="${done ? 'is-done' : 'is-now'}">${icon(index === last ? icons.PULL_REQUEST : done ? icons.CHECK : icons.CLOCK)}${esc(line)}</li>`;
  }).join('');
  return `<ol class="demo-handoff" id="demo-handoff" tabindex="-1" aria-live="polite" aria-label="Hand-off status">${lines}</ol>`;
}

function inspector(state: DemoState): string {
  const ticket = state.selected === null ? undefined : demoTicket(state.selected);
  if (ticket === undefined) {
    return `<aside class="demo-inspector" aria-label="Brief and ticket">
      <p class="eyebrow">Brief</p>
      <h2>#${String(DEMO_MAP.mapNumber)} ${esc(DEMO_MAP.mapTitle)}</h2>
      <h3>Where this is heading</h3><p>${esc(DEMO_MAP.destination)}</p>
      <h3>Goal</h3><p class="demo-muted">${esc(DEMO_MAP.goal)}</p>
      <p class="demo-hint">${icon(icons.INFO)}Select a ticket to see what it needs.</p>
    </aside>`;
  }
  const waiting = openNeeds(ticket);
  const blockedNote = ticket.state === 'blocked'
    ? `<p class="demo-waiting">${icon(icons.LOCK)}<span>Waiting on ${waiting.map((n) => `<strong>#${String(n)}</strong>`).join(' and ')}. It can start once ${waiting.length > 1 ? 'they close' : 'it closes'}.</span></p>`
    : '';
  const unlocks = DEMO_MAP.tickets.filter((other) => other.needs.includes(ticket.n)).map((other) => other.n);
  const canOpen = canHandOff(ticket);
  const note = ticket.state === 'blocked' ? 'Starts once its needs close.' : ticket.state === 'done' ? 'Already done.' : canOpen ? TOUR_COPY.openNote : `Waits for you: open it to decide. ${TOUR_COPY.openNote}`;
  return `<aside class="demo-inspector" aria-label="Brief and ticket">
    <p class="demo-ins-top">${typeIcon(ticket.type)}<span class="demo-num">#${String(ticket.n)}</span>${stateBadge(ticket.state)}</p>
    <h2>${esc(ticket.title)}</h2>
    ${blockedNote}
    <dl class="demo-meta"><dt>Type</dt><dd>${esc(TOUR_TYPES[ticket.type].label)}</dd><dt>Needs</dt><dd>${refs(ticket.needs)}</dd><dt>Unlocks</dt><dd>${refs(unlocks)}</dd></dl>
    <div class="demo-launch">
      <button type="button" class="primary" id="demo-open" data-demo-act="openInT3"${canOpen && state.handOff === 0 ? '' : ' disabled'}>${icon(icons.PLAY)}Open in T3 Code</button>
      <p class="demo-note">${esc(note)}</p>
    </div>
    ${handOffStatus(state)}
    <h3>Question</h3><p>${esc(ticket.question)}</p>
    <h3>Done when</h3><ul class="demo-done">${ticket.doneWhen.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
  </aside>`;
}

function mapView(state: DemoState): string {
  return `<main class="demo-mapview">
    ${filters()}
    <div class="demo-map-body">
      <section class="demo-canvas" id="demo-canvas" aria-label="Tickets">
        <div class="demo-canvas-inner">${edges()}${DEMO_MAP.tickets.map((ticket) => node(ticket, state)).join('')}</div>
      </section>
      ${inspector(state)}
    </div>
  </main>`;
}

export function demoAppHtml(state: DemoState): string {
  const view = state.view === 'home' ? home() : state.view === 'newmap' ? newMap() : state.view === 'planning' ? planning(state) : mapView(state);
  return `<div class="demo-app is-${state.view}">${sidebar(state)}<div class="demo-main">${topbar(state)}${view}</div></div>`;
}
