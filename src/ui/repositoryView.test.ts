import { describe, expect, it } from 'vitest';

import type { MapSnapshot, PublicMap, Ticket, TicketState, WayfinderMap } from '../types.js';
import { countRunningHandOffs, mapMatchesRepositorySearch, needsYouTicketNumbers, publicMapProgress, repositoryLoadErrorHtml, repositoryLoadingHtml, repositoryPageHtml, settledAgo, sortRepositoryMaps, sortSettledMaps } from './repositoryView.js';

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
    updatedAt: null,
  };
}

function map(number: number, title: string, open: boolean, tickets: Ticket[] = []): WayfinderMap {
  return {
    number,
    title,
    url: `https://github.com/octo/wayfinder/issues/${String(number)}`,
    body: '',
    open,
    author: 'octocat',
    visibility: 'private',
    sections: { destination: `Reach ${title}`, notes: '', decisions: '', fog: '', outOfScope: '' },
    tickets,
    outside: [],
    criticalPath: { tickets: [], remaining: 0 },
    stalled: [],
    settled: null,
    ticketsLoaded: true,
  };
}

function snapshot(maps: WayfinderMap[]): MapSnapshot {
  return { repo: 'octo/wayfinder', fetchedAt: '2026-09-23T12:00:00.000Z', maps, hiddenMaps: 0, publicMaps: [], warnings: [] };
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

  it('searches map number and title', () => {
    expect(mapMatchesRepositorySearch(maps[0]!, '')).toBe(true);
    expect(mapMatchesRepositorySearch(maps[0]!, 'SHIP')).toBe(true);
    expect(mapMatchesRepositorySearch(maps[2]!, '#4')).toBe(true);
    expect(mapMatchesRepositorySearch(maps[2]!, 'missing')).toBe(false);
  });

  it('lists the most recently settled map first', () => {
    const older = { ...map(3, 'Older', false), settled: { reason: 'closed' as const, since: '2026-06-01T00:00:00.000Z' } };
    const newer = { ...map(9, 'Newer', true), settled: { reason: 'idle' as const, since: '2026-09-01T00:00:00.000Z' } };
    expect(sortSettledMaps([older, newer]).map(({ number }) => number)).toEqual([9, 3]);
  });

  it('says how long ago a map settled', () => {
    const now = Date.parse('2026-09-26T12:00:00.000Z');
    expect(settledAgo('2026-09-26T08:00:00.000Z', now)).toBe('today');
    expect(settledAgo('2026-09-25T08:00:00.000Z', now)).toBe('1 day ago');
    expect(settledAgo('2026-09-10T12:00:00.000Z', now)).toBe('16 days ago');
    expect(settledAgo('2026-06-26T12:00:00.000Z', now)).toBe('3 months ago');
    expect(settledAgo('2024-09-01T12:00:00.000Z', now)).toBe('2 years ago');
    expect(settledAgo('not a date', now)).toBe('');
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

  it('counts distinct tickets that need a person because of a stall, thread, CI, or review', () => {
    const roadmap = {
      ...map(35, 'Make the map page feel clear', true, [
        ticket(101, 'Define the destination', 'claimed'),
        ticket(102, 'Build the navigation shell', 'claimed'),
        ticket(103, 'Update the prototype board', 'claimed'),
        { ...ticket(104, 'Try the new board', 'claimed'), type: 'prototype' },
        ticket(105, 'Recover the exporter', 'claimed'),
      ]),
      stalled: [{ ticket: 101, kind: 'untouched-claim' as const, since: '2026-09-20T12:00:00.000Z' }],
    };
    const tickets = needsYouTicketNumbers('octo/wayfinder', roadmap, [
      { repo: 'OCTO/WAYFINDER', mapNumber: 35, ticketNumber: 101, status: 'waiting', stale: false, pendingUserInput: true },
      { repo: 'octo/wayfinder', mapNumber: 35, ticketNumber: 102, status: 'running', stale: false, pullRequests: [{ state: 'open', checksState: 'failing' }] },
      { repo: 'octo/wayfinder', mapNumber: 35, ticketNumber: 103, status: 'running', stale: false, pullRequests: [{ state: 'open', checksState: 'passing', reviewDecision: 'REVIEW_REQUIRED', isDraft: false }] },
      { repo: 'octo/wayfinder', mapNumber: 35, ticketNumber: 104, status: 'running', stale: false, branch: 'prototype/104-new-board' },
      { repo: 'octo/wayfinder', mapNumber: 35, ticketNumber: 105, status: 'failed', stale: false },
      { repo: 'other/repo', mapNumber: 35, ticketNumber: 106, status: 'failed', stale: false },
    ]);

    expect(tickets).toEqual([101, 102, 103, 104, 105]);
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
    expect(html).not.toContain('data-map-filter');
    expect(html).toContain('id="repo-map-search"');
    expect(html).toContain('data-settle-map="35"');
    expect(html).toContain('aria-label="Settle map #35: Make the map page feel clear"');
    expect(html).toContain('data-map-status="active"');
    expect(html).toContain('data-map-status="completed"');
    expect(html).toContain('Ticket dependency graph with 3 tickets');
    expect(html).toContain('next</span> <a href="/repos/octo/wayfinder/maps/35?view=map&amp;ticket=102">#102');
    expect(html).toContain('class="mini-graph"');
    expect(html).toContain('Open map #35: Make the map page feel clear');
    expect(html).toContain('1 next up');
    expect(html).toContain('1 blocked');
    expect(html).toContain('· completed');
    expect(html).toContain('2 active, 0 settled');
    expect(html).not.toContain('data-repo-settled');
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

  it('shows a stalled ticket count on its map card and links to that ticket', () => {
    const stalledMap = {
      ...map(35, 'Make the map page feel clear', true, [ticket(103, 'Update the prototype board', 'claimed')]),
      stalled: [{ ticket: 103, kind: 'dead-hand-off' as const, since: '2026-09-20T12:00:00.000Z' }],
    };
    const html = repositoryPageHtml('octo/wayfinder', snapshot([stalledMap]));

    expect(html).toContain('data-map-needs-you="35" href="/repos/octo/wayfinder/maps/35?view=map&amp;ticket=103"');
    expect(html).toContain('1 needs you');
  });

  it('collapses settled maps at the foot of the list with their number, title and age', () => {
    const now = Date.parse('2026-09-26T12:00:00.000Z');
    const html = repositoryPageHtml(
      'octo/wayfinder',
      snapshot([
        map(35, 'Still going', true),
        { ...map(8, 'Shipped <docs>', false), settled: { reason: 'closed', since: '2026-09-23T12:00:00.000Z' }, ticketsLoaded: false, tickets: [] },
        { ...map(12, 'Parked', true), settled: { reason: 'manual', since: '2026-09-26T09:00:00.000Z' }, ticketsLoaded: false, tickets: [] },
      ]),
      new Map(),
      now,
    );

    expect(html).toContain('1 active, 2 settled');
    expect(html).toContain('aria-expanded="false" aria-controls="repo-settled-list"');
    expect(html).toContain('Show 2 settled');
    expect(html).toContain('id="repo-settled-list" hidden');
    expect(html).toContain('<span class="num">#8</span> Shipped &lt;docs&gt;');
    expect(html).toContain('Settled <time datetime="2026-09-23T12:00:00.000Z">3 days ago</time> · closed');
    expect(html).toContain('today</time> · settled by you');
    expect(html).toContain('data-unsettle-map="12"');
    expect(html.indexOf('#12</span>')).toBeLessThan(html.indexOf('#8</span>'));
    // Settled maps are rows, not cards, so none draws a graph it has no tickets for.
    expect(html.match(/class="mini-graph"/g)).toHaveLength(1);
    expect(html.indexOf('data-repo-settled')).toBeGreaterThan(html.indexOf('data-repo-map-list'));
  });

  it('says so when every map has settled', () => {
    const html = repositoryPageHtml('octo/wayfinder', snapshot([{ ...map(8, 'Done', false), settled: { reason: 'closed', since: '2026-09-23T12:00:00.000Z' } }]));
    expect(html).toContain('0 active, 1 settled');
    expect(html).toContain('aria-live="polite">Every map here has settled.</p>');
  });

  it('renders the plain no-maps state with a contextual repository selection', () => {
    const html = repositoryPageHtml('octo/recipe-box', snapshot([]));

    expect(html).toContain('No maps in recipe-box yet');
    expect(html).toContain('octo/recipe-box · no maps yet');
    expect(html).toContain('Destination');
    expect(html).toContain('href="/new-map?repo=octo%2Frecipe-box"');
    expect(html.match(/Start a new map/g)).toHaveLength(1);
    expect(html).not.toContain('repo-map-search');
  });

  it('names each map author and always explains private maps', () => {
    const html = repositoryPageHtml(
      'octo/wayfinder',
      snapshot([
        { ...map(3, 'Mine', true), author: 'ramon' },
        { ...map(5, 'Followed', true), author: 'drive-by', visibility: 'public' },
        { ...map(9, 'Parked', true), author: 'ramon', settled: { reason: 'manual', since: '2026-09-20T00:00:00.000Z' } },
      ]),
    );

    expect(html).toContain('<span class="wf-author">by ramon</span>');
    expect(html).toContain('<span class="wf-author">by drive-by</span>');
    expect(html).toContain('data-map-visibility="public"><span class="wf-author">by drive-by</span><span class="wf-vis-label">Public</span></p>');
    // The open private card and the settled private row both carry the note.
    expect(html.match(/Private in Wayfinder only\. If the repository is public, this issue can still be read on GitHub\./g)).toHaveLength(2);
    expect(html).not.toContain('data-repo-hidden-maps');
  });

  it('counts the maps from other people that are hidden', () => {
    const html = repositoryPageHtml('octo/wayfinder', { ...snapshot([map(3, 'Mine', true)]), hiddenMaps: 12 });
    expect(html).toContain('12 maps from other people are hidden.');

    const none = repositoryPageHtml('octo/recipe-box', { ...snapshot([]), hiddenMaps: 1 });
    expect(none).toContain('1 map from other people is hidden.');
    expect(none).toContain('No maps of yours in recipe-box yet');
  });

  it('lists public maps with author, progress, and Follow or Unfollow', () => {
    const publicMap = (number: number, followed: boolean, progress = { completed: 0, total: 0 }): PublicMap => ({
      number,
      title: `Map <${String(number)}>`,
      url: `https://github.com/octo/wayfinder/issues/${String(number)}`,
      author: 'drive-by',
      open: true,
      followed,
      progress,
    });
    const html = repositoryPageHtml('octo/wayfinder', { ...snapshot([]), publicMaps: [publicMap(9, false, { completed: 2, total: 6 }), publicMap(3, true)] });

    expect(html).toContain('id="repo-public-title">Public maps <span class="count">2 · 1 followed</span>');
    expect(html).toContain('<span class="wf-author">by drive-by</span>');
    expect(html).toContain('2 of 6 tickets done');
    expect(html).toContain('No tickets yet');
    expect(html).toContain('<button type="button" class="primary" data-follow-map="9" aria-label="Follow map #9: Map &lt;9&gt;">Follow</button>');
    expect(html).toContain('<button type="button" class="ghost" data-unfollow-map="3" aria-label="Unfollow map #3: Map &lt;3&gt;">Unfollow</button>');
    // A followed map opens here; one you don't follow opens on GitHub.
    expect(html).toContain('href="/repos/octo/wayfinder/maps/3"');
    expect(html).toContain('href="https://github.com/octo/wayfinder/issues/9" target="_blank" rel="noreferrer"');
    expect(html).not.toContain('<9>');

    expect(repositoryPageHtml('octo/wayfinder', snapshot([]))).not.toContain('data-repo-public');
  });

  it('counts tickets in words', () => {
    expect(publicMapProgress({ completed: 1, total: 1 })).toBe('1 of 1 ticket done');
    expect(publicMapProgress({ completed: 0, total: 0 })).toBe('No tickets yet');
  });

  it('renders a retryable repository error and escapes its message', () => {
    const html = repositoryLoadErrorHtml('<script>failed</script>');

    expect(html).toContain('role="alert"');
    expect(html).toContain('data-retry-page');
    expect(html).toContain('&lt;script&gt;failed&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });
});

describe('repositoryLoadingHtml', () => {
  it('shows the real header and placeholder filters and map cards in the loaded page frame', () => {
    const html = repositoryLoadingHtml('octo/<wayfinder>');

    expect(html).toContain('class="repository-page wf-repo-page is-loading" role="status" aria-live="polite"');
    expect(html).toContain('<h1>&lt;wayfinder&gt;</h1>');
    expect(html).toContain('<div class="repo-map-section" aria-hidden="true">');
    expect(html).toContain('class="wf-filters"');
    expect(html.match(/wf-node wf-map is-skeleton/g)).toHaveLength(3);
    expect(html).not.toContain('<wayfinder>');
  });
});
