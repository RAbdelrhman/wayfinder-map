import { describe, expect, it } from 'vitest';

import type { MapSnapshot, Ticket, TicketState, WayfinderMap } from '../types.js';
import { countRunningHandOffs, mapMatchesRepositoryFilter, repositoryLoadErrorHtml, repositoryPageHtml, sortRepositoryMaps } from './repositoryView.js';

function ticket(number: number, title: string, state: TicketState, blockedBy: number[] = []): Ticket {
  return {
    number,
    title,
    url: `https://github.com/octo/wayfinder/issues/${String(number)}`,
    body: '',
    type: 'task',
    labels: [],
    open: state !== 'done',
    assignee: null,
    blockedBy,
    openBlockers: [],
    state,
  };
}

function map(number: number, title: string, open: boolean, tickets: Ticket[] = []): WayfinderMap {
  return {
    number,
    title,
    url: `https://github.com/octo/wayfinder/issues/${String(number)}`,
    body: '',
    open,
    sections: { destination: `Reach ${title}`, notes: '', decisions: '', fog: '', outOfScope: '' },
    tickets,
    outside: [],
  };
}

function snapshot(maps: WayfinderMap[]): MapSnapshot {
  return { repo: 'octo/wayfinder', fetchedAt: '2026-09-23T12:00:00.000Z', maps, warnings: [] };
}

describe('repository map ordering and filtering', () => {
  const maps = [
    map(8, 'Ship the docs', false),
    map(12, 'Prototype a new shell', true),
    map(4, 'Build a map canvas', true),
  ];

  it('puts active maps first and keeps the newest map first within each state', () => {
    expect(sortRepositoryMaps(maps).map(({ number }) => number)).toEqual([12, 4, 8]);
  });

  it('filters active, completed, map number, and title without losing the repository context', () => {
    expect(mapMatchesRepositoryFilter(maps[1]!, 'active', '')).toBe(true);
    expect(mapMatchesRepositoryFilter(maps[0]!, 'active', '')).toBe(false);
    expect(mapMatchesRepositoryFilter(maps[0]!, 'completed', 'ship')).toBe(true);
    expect(mapMatchesRepositoryFilter(maps[2]!, 'all', '#4')).toBe(true);
    expect(mapMatchesRepositoryFilter(maps[2]!, 'all', 'missing')).toBe(false);
  });

  it('counts only current running hand-offs for this repository and a map', () => {
    const counts = countRunningHandOffs('Octo/Wayfinder', [
      { repo: 'octo/wayfinder', mapNumber: 35, status: 'running', stale: false },
      { repo: 'OCTO/WAYFINDER', mapNumber: 35, status: 'running', stale: false },
      { repo: 'octo/wayfinder', mapNumber: 14, status: 'starting', stale: false },
      { repo: 'octo/wayfinder', mapNumber: 35, status: 'running', stale: true },
      { repo: 'octo/wayfinder', mapNumber: null, status: 'running', stale: false },
      { repo: 'other/repo', mapNumber: 35, status: 'running', stale: false },
    ]);

    expect([...counts]).toEqual([[35, 2]]);
  });
});

describe('repositoryPageHtml', () => {
  it('renders map-shaped cards with the filters, state counts, next ticket, and direct open links', () => {
    const activeMap = map(35, 'Make the map page feel clear', true, [
      ticket(101, 'Define the destination', 'done'),
      ticket(102, 'Build the navigation shell', 'frontier', [101]),
      ticket(103, 'Update the prototype board', 'blocked', [102]),
    ]);
    const html = repositoryPageHtml('octo/wayfinder', snapshot([activeMap, map(8, 'Old map', false)]));

    expect(html).toContain('octo/wayfinder');
    expect(html).toContain('data-map-filter="all"');
    expect(html).toContain('data-map-filter="active"');
    expect(html).toContain('data-map-filter="completed"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('id="repo-map-search"');
    expect(html).toContain('data-map-status="active"');
    expect(html).toContain('data-map-status="completed"');
    expect(html).toContain('Ticket dependency graph with 3 tickets');
    expect(html).toContain('Next</span><a href="/repos/octo/wayfinder/maps/35?view=map&amp;ticket=102">#102');
    expect(html).toContain('Open map #35: Make the map page feel clear');
    expect(html).toContain('Next up');
    expect(html).toContain('Completed');
    expect(html).not.toContain('Start a new map');
    expect(html).not.toContain('Prototypes</a>');
  });

  it('shows a separate live no-match message and an optional running hand-off count', () => {
    const html = repositoryPageHtml(
      'octo/wayfinder',
      snapshot([map(35, 'Prototype the home page', true)]),
      new Map([[35, 2]]),
    );

    expect(html).toContain('data-repo-map-no-match role="status" aria-live="polite"');
    expect(html).toContain('2 running in T3 Code');
    expect(html).toContain('data-map-handoffs="35"');
  });

  it('renders the plain no-maps state with a contextual repository selection', () => {
    const html = repositoryPageHtml('octo/recipe-box', snapshot([]));

    expect(html).toContain('No maps yet');
    expect(html).toContain('Destination');
    expect(html).toContain('href="/new-map?repo=octo%2Frecipe-box"');
    expect(html.match(/Start a new map/g)).toHaveLength(1);
    expect(html).not.toContain('repo-map-search');
  });

  it('renders a retryable repository error and escapes its message', () => {
    const html = repositoryLoadErrorHtml('<script>failed</script>');

    expect(html).toContain('role="alert"');
    expect(html).toContain('data-retry-page');
    expect(html).toContain('&lt;script&gt;failed&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });
});
