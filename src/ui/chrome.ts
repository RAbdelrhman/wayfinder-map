import * as icons from './icons.js';
import { icon } from './icons.js';
import { escapeHtml } from './markdown.js';
import type { Ticket, TicketState, WayfinderMap } from '../types.js';
import { normalizeRepo, scopedApiPath } from '../repoRoutes.js';

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
  repo: icons.REPO,
  check: icons.CHECK,
  copy: icons.COPY,
  external: icons.EXTERNAL,
  folder: icons.FOLDER,
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
  paintRepoIcons(root);
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
    button.classList.remove('is-available', 'is-downloading', 'is-ready', 'is-error', 'is-dev');

    if (data.status === 'ready') {
      button.classList.add('is-ready');
      button.title = `Update to v${data.latestVersion ?? ''} ready — click to restart and install`;
      button.setAttribute('aria-label', button.title);
      if (manual) showToast(`Update ready: click to restart and install v${data.latestVersion ?? ''}`);
    } else if (data.status === 'available') {
      button.classList.add('is-available');
      button.title = `Update v${data.latestVersion ?? ''} is available`;
      button.setAttribute('aria-label', button.title);
      if (manual) showToast(`Update v${data.latestVersion ?? ''} available`);
    } else if (data.status === 'downloading') {
      button.classList.add('is-downloading');
      button.title = 'Downloading update...';
      button.setAttribute('aria-label', button.title);
      if (manual) showToast('Downloading update in background...');
    } else if (data.status === 'dev') {
      button.classList.add('is-dev');
      button.title = `Wayfinder dev build (v${data.currentVersion})`;
      button.setAttribute('aria-label', button.title);
      if (manual) showToast(`Running dev build (v${data.currentVersion})`);
    } else if (data.status === 'error') {
      button.classList.add('is-error');
      button.title = `Update check failed: ${data.error ?? 'unknown error'}`;
      button.setAttribute('aria-label', button.title);
      if (manual) showToast(`Update check failed: ${data.error ?? 'unknown error'}`);
    } else {
      button.title = `Wayfinder v${data.currentVersion} (up to date)`;
      button.setAttribute('aria-label', button.title);
      if (manual) showToast(`Wayfinder is up to date (v${data.currentVersion})`);
    }
  }

  // Poll status quietly on load
  void fetch('/api/updater')
    .then((r) => (r.ok ? (r.json() as Promise<UpdaterStatus>) : null))
    .then((data) => {
      if (data) applyStatus(data, false);
    })
    .catch(() => {
      // Ignore background fetch errors
    });

  // Clicking triggers a check or initiates restart
  button.addEventListener('click', () => {
    if (lastStatus?.status === 'ready') {
      button.classList.add('is-downloading');
      showToast('Installing update...');
      void fetch('/api/updater/install', { method: 'POST' }).catch(() => {
        showToast('Failed to trigger update restart');
      });
      return;
    }

    button.classList.add('is-downloading');
    showToast('Checking for updates...');

    void fetch('/api/updater/check', { method: 'POST' })
      .then(async (r) => {
        if (!r.ok) {
          const err = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `HTTP ${String(r.status)}`);
        }
        return r.json() as Promise<UpdaterStatus>;
      })
      .then((data) => {
        applyStatus(data, true);
      })
      .catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : String(error);
        applyStatus({ status: 'error', currentVersion: '...', error: msg }, true);
      });
  });
}

export interface AccountProfile {
  status: 'ready' | 'missing-scopes' | 'logged-out' | 'missing-gh';
  login: string | null;
  name: string | null;
  avatarUrl?: string | null;
  scopes?: string[];
  missingScopes: string[];
}

/** All the account mark needs, so both the chrome's profile and Home's account can draw it. */
export type AccountMark = Pick<AccountProfile, 'login' | 'avatarUrl'>;

export function renderAccountMarkContent(profile: AccountMark | null | undefined): string {
  const login = profile?.login?.trim();
  if (!login) {
    return `<span class="avatar-initial" data-icon="person">${icon(icons.PERSON)}</span>`;
  }
  const avatarUrl = profile?.avatarUrl?.trim();
  const initial = login.slice(0, 1).toUpperCase();
  return avatarUrl
    ? `<img class="avatar-img" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(login)}" onerror="this.remove()" /><span class="avatar-initial">${escapeHtml(initial)}</span>`
    : `<span class="avatar-initial">${escapeHtml(initial)}</span>`;
}

export function updateAccountMark(
  element: HTMLElement | null,
  profile: AccountMark | null | undefined,
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

export const MONOGRAM_PALETTE: Record<string, { fg: string; bg: string }> = {
  gray:    { fg: '#9ca3af', bg: 'rgba(156, 163, 175, 0.14)' },
  red:     { fg: '#f87171', bg: 'rgba(248, 113, 113, 0.14)' },
  orange:  { fg: '#fb923c', bg: 'rgba(251, 146, 60, 0.14)' },
  amber:   { fg: '#fbbf24', bg: 'rgba(251, 191, 36, 0.14)' },
  yellow:  { fg: '#facc15', bg: 'rgba(250, 204, 21, 0.14)' },
  lime:    { fg: '#a3e635', bg: 'rgba(163, 230, 53, 0.14)' },
  green:   { fg: '#4ade80', bg: 'rgba(74, 222, 128, 0.14)' },
  emerald: { fg: '#34d399', bg: 'rgba(52, 211, 153, 0.14)' },
  teal:    { fg: '#2dd4bf', bg: 'rgba(45, 212, 191, 0.14)' },
  cyan:    { fg: '#22d3ee', bg: 'rgba(34, 211, 238, 0.14)' },
  sky:     { fg: '#38bdf8', bg: 'rgba(56, 189, 248, 0.14)' },
  blue:    { fg: '#60a5fa', bg: 'rgba(96, 165, 250, 0.14)' },
  indigo:  { fg: '#818cf8', bg: 'rgba(129, 140, 248, 0.14)' },
  violet:  { fg: '#a78bfa', bg: 'rgba(167, 139, 250, 0.14)' },
  purple:  { fg: '#c084fc', bg: 'rgba(192, 132, 252, 0.14)' },
  fuchsia: { fg: '#e879f9', bg: 'rgba(232, 121, 249, 0.14)' },
  pink:    { fg: '#f472b6', bg: 'rgba(244, 114, 182, 0.14)' },
  rose:    { fg: '#fb7185', bg: 'rgba(251, 113, 133, 0.14)' },
};

const COLOR_NAMES = Object.keys(MONOGRAM_PALETTE);

export function repoColorName(name: string): string {
  const norm = name.normalize('NFKC').trim().toLocaleLowerCase('en-US') || 'project';
  let hash = 0;
  for (const ch of norm) {
    hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) % COLOR_NAMES.length;
  }
  return COLOR_NAMES[hash] ?? 'blue';
}

export function repoMonogram(repoOrName: string): string {
  const parts = repoOrName.split('/');
  const name = parts.length > 1 ? parts[1]! : parts[0]!;
  const norm = name.normalize('NFKC').trim();
  const tokens = norm.match(/[\p{L}\p{N}]+/gu) ?? [];
  const first = tokens[0];
  if (!first) return 'PR';
  const firstChars = Array.from(first);
  const firstChar = firstChars[0] ?? 'P';
  const secondChar =
    firstChars.slice(1).find((c) => /\p{N}/u.test(c)) ??
    (tokens.length > 1 ? Array.from(tokens.at(-1) ?? '')[0] : firstChars.at(-1)) ??
    firstChar;
  return Array.from(`${firstChar}${secondChar}`.toUpperCase()).slice(0, 2).join('');
}

export function repoMonogramSvg(repoOrName: string): string {
  const monogram = repoMonogram(repoOrName);
  const parts = repoOrName.split('/');
  const name = parts.length > 1 ? parts[1]! : parts[0]!;
  const colorName = repoColorName(name);
  const palette = MONOGRAM_PALETTE[colorName] ?? MONOGRAM_PALETTE['blue']!;
  const textLength = Array.from(monogram).length === 1 ? 6 : 12;

  return `<svg viewBox="0 0 16 16" class="repo-monogram-svg" aria-hidden="true" style="--mono-fg:${palette.fg};--mono-bg:${palette.bg}">
    <rect width="16" height="16" rx="4" fill="var(--mono-bg, ${palette.bg})" />
    <text x="8" y="10.8" text-anchor="middle" fill="var(--mono-fg, ${palette.fg})" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="8.25" font-weight="700" textLength="${textLength}" lengthAdjust="spacingAndGlyphs" text-rendering="geometricPrecision">${escapeHtml(monogram)}</text>
  </svg>`;
}

export function paintRepoIcons(root: ParentNode = document): void {
  const images = root.querySelectorAll<HTMLImageElement>('img.repo-icon-img');
  for (const img of images) {
    if (img.dataset['bound'] === '1') continue;
    img.dataset['bound'] = '1';
    if (img.complete) {
      if (img.naturalWidth > 0) {
        img.style.display = 'block';
        const mono = img.previousElementSibling as HTMLElement | null;
        if (mono) mono.style.display = 'none';
      } else {
        img.remove();
      }
      continue;
    }
    img.addEventListener(
      'load',
      () => {
        img.style.display = 'block';
        const mono = img.previousElementSibling as HTMLElement | null;
        if (mono) mono.style.display = 'none';
      },
      { once: true },
    );
    img.addEventListener(
      'error',
      () => {
        img.remove();
      },
      { once: true },
    );
  }
}

/**
 * Renders a repository icon badge.
 * Defaults to T3 Code's deterministic monogram SVG badge,
 * and seamlessly loads the repository's own icon file when available.
 */
export function repoIconHtml(repo: string, size: 'sm' | 'md' | 'lg' = 'md'): string {
  const trimmed = repo.trim();
  const normalized = normalizeRepo(trimmed);
  const sizeClass = size === 'sm' ? ' is-sm' : size === 'lg' ? ' is-lg' : '';
  const monoSvg = repoMonogramSvg(trimmed);
  const imgTag = normalized
    ? `<img class="repo-icon-img" src="${escapeHtml(scopedApiPath(normalized, 'icon'))}" alt="" style="display:none" />`
    : '';

  return `<span class="repo-icon-badge${sizeClass}" data-repo="${escapeHtml(repo)}" aria-hidden="true"><span class="repo-monogram">${monoSvg}</span>${imgTag}</span>`;
}

if (typeof window !== 'undefined') {
  window.addEventListener(
    'load',
    (e) => {
      const target = e.target;
      if (target instanceof HTMLImageElement && target.classList.contains('repo-icon-img')) {
        target.style.display = 'block';
        const mono = target.previousElementSibling as HTMLElement | null;
        if (mono) mono.style.display = 'none';
      }
    },
    true,
  );
  window.addEventListener(
    'error',
    (e) => {
      const target = e.target;
      if (target instanceof HTMLImageElement && target.classList.contains('repo-icon-img')) {
        target.remove();
      }
    },
    true,
  );
}

/** Every ticket the map counts: its sub-issues plus the fog, the issues linked to them by a dependency. */
export function allTickets(map: WayfinderMap): Ticket[] {
  return [...map.tickets, ...map.outside];
}

export function countStates(map: WayfinderMap): Record<TicketState, number> {
  const counts: Record<TicketState, number> = { frontier: 0, claimed: 0, blocked: 0, done: 0 };
  for (const ticket of allTickets(map)) counts[ticket.state] += 1;
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
