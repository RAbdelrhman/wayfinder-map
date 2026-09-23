import { describe, expect, it } from 'vitest';

import type { MapSnapshot, Ticket, WayfinderMap } from '../types.js';
import { createJumpDestinations, viewFromQuery } from './navigation.js';

function ticket(number: number, title: string): Ticket {
  return {
    number,
    title,
    url: `https://github.com/octo/wayfinder/issues/${String(number)}`,
    body: '',
    type: 'task',
    labels: [],
    open: true,
    assignee: null,
    blockedBy: [],
    openBlockers: [],
    state: 'frontier',
  };
}

function map(number: number, title: string, tickets: Ticket[] = []): WayfinderMap {
  return {
    number,
    title,
    url: `https://github.com/octo/wayfinder/issues/${String(number)}`,
    body: '',
    open: true,
    sections: { destination: '', notes: '', decisions: '', fog: '', outOfScope: '' },
    tickets,
    outside: [],
  };
}

const SNAPSHOT: MapSnapshot = {
  repo: 'octo/wayfinder',
  fetchedAt: '2026-09-22T00:00:00.000Z',
  maps: [map(35, 'Build the navigation shell', [ticket(51, 'Search tickets and maps')])],
  warnings: [],
};

describe('navigation view query', () => {
  it('accepts the map page views and defaults unknown values to Map', () => {
    expect(viewFromQuery('map')).toBe('map');
    expect(viewFromQuery('table')).toBe('table');
    expect(viewFromQuery('prototypes')).toBe('prototypes');
    expect(viewFromQuery('unknown')).toBe('map');
    expect(viewFromQuery(null)).toBe('map');
  });
});

describe('Jump to destinations', () => {
  it('finds repositories, maps, and tickets by their visible names', () => {
    const results = createJumpDestinations(['octo/wayfinder', 'octo/other'], [SNAPSHOT], 'Search tickets');

    expect(results.map(({ kind }) => kind)).toEqual(['ticket']);
    expect(results[0]).toMatchObject({
      label: '#51 Search tickets and maps',
      detail: 'octo/wayfinder · Build the navigation shell',
      href: '/repos/octo/wayfinder/maps/35?view=map&ticket=51',
    });

    expect(createJumpDestinations(['octo/wayfinder'], [SNAPSHOT], 'octo/wayfinder')[0]?.kind).toBe('repository');
    expect(createJumpDestinations([], [SNAPSHOT], 'Build the navigation')[0]?.kind).toBe('map');
  });

  it('matches ticket numbers with and without a hash and ignores case', () => {
    const withHash = createJumpDestinations([], [SNAPSHOT], '#51');
    const withoutHash = createJumpDestinations([], [SNAPSHOT], '51');
    const byTitle = createJumpDestinations([], [SNAPSHOT], 'SEARCH TICKETS');

    expect(withHash).toHaveLength(1);
    expect(withoutHash).toHaveLength(1);
    expect(byTitle[0]?.label).toContain('Search tickets');
  });

  it('does not treat a lone hash as an empty number prefix', () => {
    expect(createJumpDestinations([], [SNAPSHOT], '#')).toEqual([]);
  });

  it('returns no destinations for an empty query and caps large result sets', () => {
    const manyMaps = Array.from({ length: 80 }, (_, index) => map(index + 1, `Work map ${String(index + 1)}`));
    const manySnapshots: MapSnapshot[] = [{ ...SNAPSHOT, maps: manyMaps }];

    expect(createJumpDestinations(['octo/wayfinder'], [SNAPSHOT], '   ')).toEqual([]);
    expect(createJumpDestinations([], manySnapshots, 'Work map')).toHaveLength(60);
  });
});
