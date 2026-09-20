import * as icons from './icons.js';
import { icon } from './icons.js';
import type { TicketState, WayfinderMap } from '../types.js';

export interface StateLook {
  label: string;
  long: string;
  blurb: string;
  variable: string;
  icon: string;
}

export const STATE_LOOKS: Record<TicketState, StateLook> = {
  frontier: { label: 'next', long: 'Next up', blurb: 'Open, unblocked, unclaimed', variable: '--state-frontier', icon: icons.ARROW },
  claimed: { label: 'claimed', long: 'Claimed', blurb: 'Someone is on it', variable: '--state-claimed', icon: icons.PERSON },
  blocked: { label: 'blocked', long: 'Blocked', blurb: 'Waiting on another ticket', variable: '--state-blocked', icon: icons.LOCK },
  done: { label: 'done', long: 'Done', blurb: 'The issue is closed', variable: '--state-done', icon: icons.CHECK },
};

export const STATE_STYLE = STATE_LOOKS;

export const STATE_ORDER: TicketState[] = ['frontier', 'claimed', 'blocked', 'done'];

/** Progress reads left to right: finished, in hand, ready, waiting. */
export const PROGRESS_ORDER: TicketState[] = ['done', 'claimed', 'frontier', 'blocked'];

const STATIC_ICONS: Record<string, string> = {
  compass: icons.COMPASS,
  graph: icons.GRAPH,
  table: icons.TABLE,
  beaker: icons.BEAKER,
  sliders: icons.SLIDERS,
  refresh: icons.REFRESH,
  moon: icons.MOON,
  lens: icons.LENS,
  info: icons.INFO,
  minus: icons.MINUS,
  plus: icons.PLUS,
  play: icons.PLAY,
  home: icons.HOME,
  repo: icons.REPO,
  arrow: icons.ARROW,
  external: icons.EXTERNAL,
  'sign-out': icons.SIGN_OUT,
  list: icons.LIST,
  copy: icons.COPY,
  check: icons.CHECK,
  lock: icons.LOCK,
  person: icons.PERSON,
  grill: icons.GRILL,
  map: icons.COMPASS,
  ticket: icons.LIST,
  chevron: icons.CHEVRON,
};

/** Fills every `data-icon` element under `root`, so static markup can name an icon. */
export function paintIcons(root: ParentNode = document): void {
  for (const element of root.querySelectorAll<HTMLElement>('[data-icon]')) {
    const path = STATIC_ICONS[element.dataset['icon'] ?? ''];
    if (path !== undefined) element.innerHTML = icon(path);
  }
}

/** The rail's light/dark switch. Each page stamps the saved theme before its first paint. */
export function bindTheme(button: HTMLElement): void {
  button.addEventListener('click', () => {
    const dark = getComputedStyle(document.body).getPropertyValue('color-scheme').trim() === 'dark';
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('wayfinder-map:theme', next);
  });
}

export function countStates(map: WayfinderMap): Record<TicketState, number> {
  const counts: Record<TicketState, number> = { frontier: 0, claimed: 0, blocked: 0, done: 0 };
  for (const ticket of map.tickets) counts[ticket.state] += 1;
  return counts;
}

/** One arc per state, in progress order, with a small gap between arcs. */
export function progressRing(counts: Record<TicketState, number>, size = 28, stroke = 3): string {
  const total = counts.frontier + counts.claimed + counts.blocked + counts.done;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  if (total === 0) {
    return `<svg class="ring" width="${String(size)}" height="${String(size)}" viewBox="0 0 ${String(size)} ${String(size)}"><circle cx="${String(center)}" cy="${String(center)}" r="${String(radius)}" fill="none" stroke="var(--border)" stroke-width="${String(stroke)}"/></svg>`;
  }

  const gap = total === 1 ? 0 : 2;
  let offset = -circumference / 4;
  const segments: string[] = [];

  for (const state of PROGRESS_ORDER) {
    const count = counts[state];
    if (count === 0) continue;
    const length = (count / total) * circumference;
    const arc = Math.max(0, length - gap);
    segments.push(
      `<circle cx="${String(center)}" cy="${String(center)}" r="${String(radius)}" fill="none" ` +
        `stroke="var(${STATE_LOOKS[state].variable})" stroke-width="${String(stroke)}" ` +
        `stroke-dasharray="${String(arc)} ${String(circumference - arc)}" ` +
        `stroke-dashoffset="${String(-offset)}"/>`,
    );
    offset += length;
  }

  return `<svg class="ring" width="${String(size)}" height="${String(size)}" viewBox="0 0 ${String(size)} ${String(size)}">${segments.join('')}</svg>`;
}
