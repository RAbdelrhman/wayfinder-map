import { describe, expect, it } from 'vitest';

import type { Ticket, WayfinderMap } from '../types.js';
import { miniGraphSvg } from './miniGraph.js';

function ticket(number: number, state: Ticket['state'], blockedBy: number[] = []): Ticket {
  return { number, title: `#${String(number)}`, url: '', body: '', type: 'task', labels: [], open: state !== 'done', assignee: null, blockedBy, openBlockers: [], state };
}

function map(tickets: Ticket[]): WayfinderMap {
  return { number: 1, title: 'Map', tickets, outside: [] } as unknown as WayfinderMap;
}

describe('miniGraphSvg', () => {
  it('draws one bar per ticket in its state colour, an edge per dependency, and lights the frontier', () => {
    const svg = miniGraphSvg(map([ticket(1, 'done'), ticket(2, 'frontier', [1]), ticket(3, 'blocked', [2])]));

    expect(svg.match(/<rect /g)).toHaveLength(3);
    expect(svg.match(/<path /g)).toHaveLength(2);
    expect(svg).toContain('stroke:var(--state-frontier)');
    expect(svg).toContain('class="is-frontier"');
  });

  it('draws a dashed destination for a map without tickets', () => {
    expect(miniGraphSvg(map([]))).toContain('Destination');
  });
});
