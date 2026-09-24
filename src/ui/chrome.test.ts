import { describe, expect, it } from 'vitest';

import type { OutsideTicket, Ticket, WayfinderMap } from '../types.js';
import {
  FOG_BAND_LABEL,
  FOG_KEY_ROW,
  allTickets,
  countStates,
  progressRing,
  renderAccountMarkContent,
  repoColorName,
  repoIconHtml,
  repoMonogram,
  updateAccountMark,
} from './chrome.js';

const RADIUS = (76 - 7) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function arcs(svg: string): number[] {
  return [...svg.matchAll(/stroke-dasharray="([\d.]+) /g)].map((match) => Number(match[1]));
}

function ticket(number: number, state: Ticket['state']): Ticket {
  return { number, title: `#${String(number)}`, url: '', body: '', type: 'task', labels: [], open: state !== 'done', assignee: null, blockedBy: [], openBlockers: [], state };
}

function fog(number: number, state: Ticket['state']): OutsideTicket {
  return { ...ticket(number, state), pullRequest: false, blocks: [1], waitsOn: [] };
}

describe('countStates', () => {
  it('counts the fog as part of the map', () => {
    const map = { tickets: [ticket(1, 'blocked'), ticket(2, 'done')], outside: [fog(58, 'done'), fog(59, 'frontier')] } as unknown as WayfinderMap;
    expect(allTickets(map).map((t) => t.number)).toEqual([1, 2, 58, 59]);
    expect(countStates(map)).toEqual({ frontier: 1, claimed: 0, blocked: 1, done: 2 });
  });
});

describe('fog labels', () => {
  it('calls the off-map bands and their Key entry fog', () => {
    expect(FOG_BAND_LABEL).toEqual({ top: 'Fog · the map waits on these', bottom: 'Fog · these wait on the map' });
    expect(FOG_KEY_ROW).toContain('<b>Fog</b>');
    expect(Object.values(FOG_BAND_LABEL).join(' ')).not.toMatch(/outside this map/i);
  });
});

describe('progressRing', () => {
  it('draws at the ring size whatever the ticket count', () => {
    for (const counts of [
      { frontier: 0, claimed: 2, blocked: 3, done: 5 },
      { frontier: 0, claimed: 0, blocked: 0, done: 6 },
    ]) {
      const total = counts.frontier + counts.claimed + counts.blocked + counts.done;
      const svg = progressRing(counts, total);
      expect(svg).toContain('viewBox="0 0 76 76"');
      expect(svg).toContain(`r="${String(RADIUS)}"`);
      expect(svg).toContain('stroke-width="7"');
    }
  });

  it('gives each state with tickets its own arc, sized by its share', () => {
    const svg = progressRing({ frontier: 0, claimed: 2, blocked: 3, done: 5 }, 10);
    const lengths = arcs(svg);
    expect(lengths).toHaveLength(3);
    // done, claimed, blocked in progress order, each short of its share by the gap.
    expect(lengths[0]).toBeCloseTo(CIRCUMFERENCE * 0.5 - 3);
    expect(lengths[1]).toBeCloseTo(CIRCUMFERENCE * 0.2 - 3);
    expect(lengths[2]).toBeCloseTo(CIRCUMFERENCE * 0.3 - 3);
  });

  it('closes the ring when every ticket is done', () => {
    expect(arcs(progressRing({ frontier: 0, claimed: 0, blocked: 0, done: 6 }, 6))).toEqual([CIRCUMFERENCE]);
  });

  it('draws an empty track for a map with no tickets', () => {
    const svg = progressRing({ frontier: 0, claimed: 0, blocked: 0, done: 0 }, 0);
    expect(arcs(svg)).toEqual([]);
    expect(svg).toContain('stroke="var(--wash)"');
  });
});

describe('renderAccountMarkContent', () => {
  it('renders GitHub avatar with letter initial fallback for authenticated user', () => {
    const html = renderAccountMarkContent({ login: 'octocat', avatarUrl: 'https://avatars.githubusercontent.com/u/583231' });
    expect(html).toContain('class="avatar-img"');
    expect(html).toContain('src="https://avatars.githubusercontent.com/u/583231"');
    expect(html).toContain('alt="octocat"');
    expect(html).toContain('onerror="this.remove()"');
    expect(html).toContain('<span class="avatar-initial">O</span>');
  });

  it('falls back to the account initial if GitHub did not return an avatar', () => {
    const html = renderAccountMarkContent({ login: 'RAbdelrhman' });
    expect(html).not.toContain('<img');
    expect(html).toContain('<span class="avatar-initial">R</span>');
  });

  it('renders person icon when signed out or login is missing', () => {
    const html = renderAccountMarkContent(null);
    expect(html).toContain('data-icon="person"');
    expect(html).not.toContain('<img');
  });
});

describe('updateAccountMark', () => {
  it('updates title and aria-label according to account state', () => {
    const attrs = new Map<string, string>();
    const el = {
      innerHTML: '',
      title: '',
      setAttribute: (k: string, v: string) => attrs.set(k, v),
      getAttribute: (k: string) => attrs.get(k) ?? null,
    } as unknown as HTMLElement;

    updateAccountMark(el, { login: 'RAbdelrhman', avatarUrl: 'https://avatars.githubusercontent.com/u/1?s=64' });
    expect(el.title).toBe('Signed in as RAbdelrhman');
    expect(el.getAttribute('aria-label')).toBe('GitHub account: RAbdelrhman');
    expect(el.innerHTML).toContain('avatar-img');

    updateAccountMark(el, null);
    expect(el.title).toBe('GitHub account (Not signed in)');
    expect(el.getAttribute('aria-label')).toBe('GitHub account: Not signed in');
  });
});

describe('repoMonogram', () => {
  it('extracts two-letter uppercase monogram matching T3 Code', () => {
    expect(repoMonogram('wayfinder-map')).toBe('WM');
    expect(repoMonogram('RAbdelrhman/wayfinder-map')).toBe('WM');
    expect(repoMonogram('ECPL-Lockstep')).toBe('EL');
    expect(repoMonogram('owner/ECPL-Lockstep')).toBe('EL');
    expect(repoMonogram('local-workspace')).toBe('LW');
    expect(repoMonogram('single')).toBe('SE');
  });
});

describe('repoColorName', () => {
  it('deterministically hashes repo name to a palette color', () => {
    const c1 = repoColorName('wayfinder-map');
    const c2 = repoColorName('wayfinder-map');
    expect(c1).toBe(c2);
    expect(typeof c1).toBe('string');
  });
});

describe('repoIconHtml', () => {
  it('renders monogram badge and hidden repo-icon image for owner/repo', () => {
    const html = repoIconHtml('RAbdelrhman/wayfinder-map');
    expect(html).toContain('class="repo-icon-badge"');
    expect(html).toContain('class="repo-monogram-svg"');
    expect(html).toContain('WM');
    expect(html).toContain('src="/api/repos/RAbdelrhman/wayfinder-map/icon"');
    expect(html).toContain('style="display:none"');
    expect(html).not.toContain('onerror=');
  });

  it('renders monogram badge without img for repository without valid owner/repo path', () => {
    const html = repoIconHtml('local-workspace');
    expect(html).toContain('class="repo-icon-badge"');
    expect(html).toContain('class="repo-monogram-svg"');
    expect(html).toContain('LW');
    expect(html).not.toContain('<img');
  });

  it('supports sm and lg size variants', () => {
    expect(repoIconHtml('owner/repo', 'sm')).toContain('class="repo-icon-badge is-sm"');
    expect(repoIconHtml('owner/repo', 'lg')).toContain('class="repo-icon-badge is-lg"');
  });
});
