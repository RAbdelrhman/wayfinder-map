import { describe, expect, it } from 'vitest';

import { progressRing, renderAccountMarkContent, updateAccountMark } from './chrome.js';

const RADIUS = (76 - 7) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function arcs(svg: string): number[] {
  return [...svg.matchAll(/stroke-dasharray="([\d.]+) /g)].map((match) => Number(match[1]));
}

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

  it('falls back to github user url if avatarUrl is omitted', () => {
    const html = renderAccountMarkContent({ login: 'RAbdelrhman' });
    expect(html).toContain('src="https://github.com/RAbdelrhman.png?size=64"');
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

    updateAccountMark(el, { login: 'RAbdelrhman' });
    expect(el.title).toBe('Signed in as RAbdelrhman');
    expect(el.getAttribute('aria-label')).toBe('GitHub account: RAbdelrhman');
    expect(el.innerHTML).toContain('avatar-img');

    updateAccountMark(el, null);
    expect(el.title).toBe('GitHub account (Not signed in)');
    expect(el.getAttribute('aria-label')).toBe('GitHub account: Not signed in');
  });
});
