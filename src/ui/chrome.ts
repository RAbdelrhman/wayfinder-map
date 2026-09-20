/*
  The chrome Home and the map page share. Both pages are the same product, so the icon
  set, the theme switch and the state channel — one hue, one icon and one word per ticket
  state — live here rather than being drawn twice with a drift between them.
*/

import * as icons from './icons.js';
import { icon } from './icons.js';
import type { TicketState, WayfinderMap } from '../types.js';

export interface StateStyle {
  label: string;
  long: string;
  blurb: string;
  variable: string;
  icon: string;
}

export const STATE_STYLE: Record<TicketState, StateStyle> = {
  frontier: { label: 'next', long: 'Next up', blurb: 'Open, unblocked, unclaimed', variable: '--state-frontier', icon: icons.ARROW },
  claimed: { label: 'claimed', long: 'Claimed', blurb: 'Someone is on it', variable: '--state-claimed', icon: icons.PERSON },
  blocked: { label: 'blocked', long: 'Blocked', blurb: 'Waiting on another ticket', variable: '--state-blocked', icon: icons.LOCK },
  done: { label: 'done', long: 'Done', blurb: 'The issue is closed', variable: '--state-done', icon: icons.CHECK },
};

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
export function progressRing(counts: Record<TicketState, number>, total: number): string {
  const size = 76;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = String(size / 2);
  let offset = 0;
  const arcs =
    total === 0
      ? `<circle cx="${center}" cy="${center}" r="${String(radius)}" fill="none" stroke="var(--wash)" stroke-width="${String(stroke)}"/>`
      : PROGRESS_ORDER.filter((state) => counts[state] > 0)
          .map((state) => {
            const length = (counts[state] / total) * circumference;
            const gap = counts[state] === total ? 0 : 3;
            const arc = `<circle cx="${center}" cy="${center}" r="${String(radius)}" fill="none" stroke="var(${STATE_STYLE[state].variable})" stroke-width="${String(stroke)}" stroke-dasharray="${String(Math.max(0, length - gap))} ${String(circumference)}" stroke-dashoffset="${String(-offset)}"/>`;
            offset += length;
            return arc;
          })
          .join('');
  return `<svg viewBox="0 0 ${String(size)} ${String(size)}" aria-hidden="true">${arcs}</svg>`;
}
