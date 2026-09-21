import * as icons from './icons.js';
import { icon } from './icons.js';
import { escapeHtml } from './markdown.js';
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
  download: icons.DOWNLOAD,
  update: icons.DOWNLOAD,
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

export interface UpdaterStatus {
  status: 'up-to-date' | 'available' | 'downloading' | 'ready' | 'dev' | 'disabled' | 'error';
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  error?: string;
}

/** The rail's updater button: checks for updates or restarts into a downloaded update. */
export function bindUpdater(button: HTMLElement, showToast: (message: string, ms?: number) => void): void {
  let lastStatus: UpdaterStatus | null = null;

  function applyStatus(data: UpdaterStatus, manual: boolean): void {
    lastStatus = data;
    if (data.status === 'ready') {
      button.classList.add('has-update');
      const ver = data.latestVersion ? ` v${data.latestVersion}` : '';
      button.title = `Update ready${ver} (Click to restart and install)`;
      button.setAttribute('aria-label', `Update ready${ver}`);
      if (manual) {
        showToast(`Wayfinder update${ver} is ready. Click again to restart and install.`);
      }
    } else if (data.status === 'available') {
      button.classList.add('has-update');
      const ver = data.latestVersion ? ` v${data.latestVersion}` : '';
      button.title = `Update available${ver}`;
      button.setAttribute('aria-label', `Update available${ver}`);
      if (manual) {
        showToast(`Update available${ver}.${data.releaseUrl ? ' Visit releases to download.' : ''}`);
      }
    } else if (data.status === 'up-to-date') {
      button.classList.remove('has-update');
      button.title = `Wayfinder is up to date (v${data.currentVersion})`;
      button.setAttribute('aria-label', `Wayfinder is up to date (v${data.currentVersion})`);
      if (manual) {
        showToast(`Wayfinder is up to date (v${data.currentVersion}).`);
      }
    } else if (data.status === 'dev') {
      button.classList.remove('has-update');
      button.title = `Development build (v${data.currentVersion})`;
      button.setAttribute('aria-label', `Development build (v${data.currentVersion})`);
      if (manual) {
        showToast(`Wayfinder is running a development build (v${data.currentVersion}).`);
      }
    } else if (data.status === 'disabled') {
      button.classList.remove('has-update');
      button.title = 'Updates are disabled for this build';
      button.setAttribute('aria-label', 'Updates are disabled for this build');
      if (manual) {
        showToast('Updates are disabled for this build.');
      }
    } else if (data.status === 'error') {
      if (manual) {
        showToast(`Could not check for updates: ${data.error ?? 'Unknown error'}`);
      }
    }
  }

  async function check(manual: boolean): Promise<void> {
    button.classList.add('is-busy');
    button.title = 'Checking for updates\u2026';
    try {
      const response = await fetch('/api/updater/check', { method: 'POST' });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${String(response.status)}`);
      }
      const data = (await response.json()) as UpdaterStatus;
      applyStatus(data, manual);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      applyStatus({ status: 'error', currentVersion: lastStatus?.currentVersion ?? '', error: message }, manual);
    } finally {
      button.classList.remove('is-busy');
    }
  }

  async function install(): Promise<void> {
    try {
      const response = await fetch('/api/updater/install', { method: 'POST' });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${String(response.status)}`);
      }
      showToast('Restarting Wayfinder to install update\u2026');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(`Could not install update: ${message}`);
    }
  }

  button.addEventListener('click', () => {
    if (lastStatus?.status === 'ready') {
      void install();
    } else {
      void check(true);
    }
  });

  void fetch('/api/updater')
    .then(async (res) => {
      if (res.ok) {
        const data = (await res.json()) as UpdaterStatus;
        applyStatus(data, false);
      }
    })
    .catch(() => undefined);
}

export interface AccountProfile {
  login: string | null;
  avatarUrl?: string | null;
}

export function renderAccountMarkContent(profile: AccountProfile | null | undefined): string {
  const login = profile?.login?.trim();
  if (!login) {
    return `<span class="avatar-initial" data-icon="person">${icon(icons.PERSON)}</span>`;
  }
  const avatarUrl = profile?.avatarUrl ?? `https://github.com/${encodeURIComponent(login)}.png?size=64`;
  const initial = login.slice(0, 1).toUpperCase();
  return `<img class="avatar-img" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(login)}" onerror="this.remove()" /><span class="avatar-initial">${escapeHtml(initial)}</span>`;
}

export function updateAccountMark(
  element: HTMLElement | null,
  profile: AccountProfile | null | undefined,
): void {
  if (!element) return;
  const login = profile?.login?.trim();
  element.innerHTML = renderAccountMarkContent(profile);
  if (login) {
    element.title = `Signed in as ${login}`;
    element.setAttribute('aria-label', `GitHub account: ${login}`);
  } else {
    element.title = 'GitHub account (Not signed in)';
    element.setAttribute('aria-label', 'GitHub account: Not signed in');
  }
}

export function bindAccountMark(element: HTMLElement | null): void {
  if (!element) return;
  void fetch('/api/auth/status')
    .then((response) => (response.ok ? (response.json() as Promise<AccountProfile>) : null))
    .then((profile) => {
      updateAccountMark(element, profile);
    })
    .catch(() => {
      updateAccountMark(element, null);
    });
}

export function countStates(map: WayfinderMap): Record<TicketState, number> {
  const counts: Record<TicketState, number> = { frontier: 0, claimed: 0, blocked: 0, done: 0 };
  for (const ticket of map.tickets) counts[ticket.state] += 1;
  return counts;
}

/**
 * One arc per state, in progress order, with a small gap between arcs. Drawn on the
 * ring's own 76px grid: the second argument is the ticket count, not a size.
 */
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
