import { describe, expect, it } from 'vitest';

import { progressRing } from './chrome.js';

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
