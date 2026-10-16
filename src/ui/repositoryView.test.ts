import { describe, expect, it } from 'vitest';

import type { MapSnapshot, PublicMap, SettleReason, Ticket, TicketState, WayfinderMap } from '../types.js';
import { countRunningHandOffs, initialRepositoryState, mapMatchesRepositorySearch, needsYouTicketNumbers, nextSelection, publicMapProgress, repositoryLoadErrorHtml, repositoryLoadingHtml, repositoryPageHtml, sortArchivedMaps, sortRepositoryMaps } from './repositoryView.js';
import type { RepositoryPageContext } from './repositoryView.js';

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
    pullRequests: [],
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

  it('groups archived maps by reason, the most recently archived first in each', () => {
    const at = (value: WayfinderMap, reason: SettleReason, since: string): WayfinderMap => ({ ...value, settled: { reason, since } });
    const maps = [
      at(map(3, 'Older closed', false), 'closed', '2026-06-01T00:00:00.000Z'),
      at(map(9, 'Idle', true), 'idle', '2026-09-01T00:00:00.000Z'),
      at(map(5, 'Newer closed', false), 'closed', '2026-08-01T00:00:00.000Z'),
      at(map(7, 'Mine', true), 'manual', '2026-01-01T00:00:00.000Z'),
      at(map(2, 'Done', true), 'finished', '2026-02-01T00:00:00.000Z'),
    ];
    expect(sortArchivedMaps(maps).map(({ number }) => number)).toEqual([7, 5, 3, 2, 9]);
  });

  it("selects the map that took the removed one's place, or the last one", () => {
    expect(nextSelection([4, 7, 9], 7)).toBe(9);
    expect(nextSelection([4, 7, 9], 9)).toBe(7);
    expect(nextSelection([4], 4)).toBeNull();
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
  const context = (overrides: Partial<RepositoryPageContext> = {}): RepositoryPageContext => ({
    handOffs: [],
    autoMap: () => false,
    login: 'ramon',
    now: Date.parse('2026-09-26T12:00:00.000Z'),
    ...overrides,
  });
  const archived = (value: WayfinderMap, reason: SettleReason, since: string): WayfinderMap => ({ ...value, settled: { reason, since }, ticketsLoaded: false, tickets: [] });

  it('lists active maps as selectable blocks beside one large Open map preview', () => {
    const activeMap = map(35, 'Make the map page feel clear', true, [
      ticket(101, 'Define the destination', 'done'),
      ticket(102, 'Build the navigation shell', 'frontier', [101]),
      ticket(103, 'Update the prototype board', 'blocked', [102]),
    ]);
    const html = repositoryPageHtml('octo/wayfinder', snapshot([activeMap, map(8, 'Old map', false)]), initialRepositoryState(), context());

    expect(html).toContain('octo/wayfinder · 2 active · 0 archived');
    expect(html).toContain('id="repo-map-search"');
    expect(html).toContain('<span class="sr-only">Filter active maps</span>');
    expect(html).toContain('role="listbox" aria-label="Active maps"');
    // The open map comes first and is selected; each block names the map, its destination and progress.
    expect(html.indexOf('maps-opt-35')).toBeLessThan(html.indexOf('maps-opt-8'));
    expect(html).toContain('id="maps-opt-35" data-select-map="35" aria-labelledby="maps-name-35" aria-describedby="maps-dest-35 maps-progress-35" aria-selected="true" tabindex="0"');
    expect(html).toContain('id="maps-opt-8" data-select-map="8" aria-labelledby="maps-name-8" aria-describedby="maps-dest-8 maps-progress-8" aria-selected="false" tabindex="-1"');
    expect(html).toContain('<span class="maps-destination" id="maps-dest-35">Reach Make the map page feel clear</span>');
    expect(html).toContain('1 of 3 tickets done');
    // The preview: graph, title, destination and counts are one link to the map.
    expect(html.match(/class="maps-preview"/g)).toHaveLength(1);
    expect(html).toContain('<a class="maps-preview" href="/repos/octo/wayfinder/maps/35" aria-label="Open map #35: Make the map page feel clear">');
    expect(html).toContain('class="mini-graph"');
    expect(html).toContain('Map · #35 · Active');
    expect(html).toContain('1 next up');
    expect(html).toContain('<span class="maps-open">Open map');
    expect(html).toContain('<dt>Next up</dt><dd>#102 Build the navigation shell</dd>');
    expect(html).toContain('<dt>Hand-offs</dt><dd>None running</dd>');
    // Archive sits outside the link, with its own label and the GitHub note.
    expect(html).toContain('data-archive-map="35" aria-label="Archive map #35: Make the map page feel clear"');
    expect(html.indexOf('data-archive-map')).toBeGreaterThan(html.indexOf('</a>', html.indexOf('maps-preview')));
    expect(html).toContain('Archive moves this map out of your active list for your account. GitHub is unchanged.');
    expect(html).toContain('<kbd>Enter</kbd> open map');
    expect(html).not.toContain('Settle');
    expect(html).not.toContain('Start a new map');
  });

  it('shows running and needs-you counts on the block and in the preview', () => {
    const stalledMap = {
      ...map(35, 'Make the map page feel clear', true, [ticket(103, 'Update the prototype board', 'claimed')]),
      stalled: [{ ticket: 103, kind: 'dead-hand-off' as const, since: '2026-09-20T12:00:00.000Z' }],
    };
    const html = repositoryPageHtml(
      'octo/wayfinder',
      snapshot([stalledMap]),
      initialRepositoryState(),
      context({ handOffs: [{ repo: 'octo/wayfinder', mapNumber: 35, status: 'running', stale: false }, { repo: 'octo/wayfinder', mapNumber: 35, status: 'running', stale: false }] }),
    );

    expect(html).toContain('0 of 1 ticket done · 2 running · 1 needs you');
    expect(html).toContain('<dt>Hand-offs</dt><dd>2 running in T3 Code</dd>');
    expect(html).toContain('<dt>Needs you</dt><dd>1 ticket needs your attention</dd>');
  });

  it('keeps the selection on a filtered-in map, and says when nothing matches', () => {
    const maps = snapshot([map(35, 'Prototype the home page', true), map(12, 'Fix the tray', true)]);
    const filtered = repositoryPageHtml('octo/wayfinder', maps, { ...initialRepositoryState(), query: 'tray', activeSelected: 35 }, context());
    expect(filtered).toContain('value="tray"');
    expect(filtered).not.toContain('maps-opt-35');
    expect(filtered).toContain('id="maps-opt-12" data-select-map="12" aria-labelledby="maps-name-12" aria-describedby="maps-dest-12 maps-progress-12" aria-selected="true"');
    expect(filtered).toContain('aria-label="Open map #12: Fix the tray"');

    const none = repositoryPageHtml('octo/wayfinder', maps, { ...initialRepositoryState(), query: 'zzz' }, context());
    expect(none).toContain('<p class="wf-none" role="status">No active maps match “zzz”.</p>');
    expect(none).not.toContain('maps-preview');
  });

  it('leads to Archived maps from the foot of the list, counted by reason', () => {
    const html = repositoryPageHtml(
      'octo/wayfinder',
      snapshot([
        map(35, 'Still going', true),
        archived(map(8, 'Shipped', false), 'closed', '2026-09-23T12:00:00.000Z'),
        archived(map(12, 'Parked', true), 'manual', '2026-09-26T09:00:00.000Z'),
        archived(map(14, 'Quiet', true), 'idle', '2026-09-01T00:00:00.000Z'),
      ]),
      initialRepositoryState(),
      context(),
    );

    expect(html).toContain('1 active · 3 archived');
    expect(html).toContain('<a class="archive-door" href="/repos/octo/wayfinder?view=archived" data-repo-view="archived">');
    expect(html).toContain('<b>Archived maps</b><span class="sub">3 maps · 1 by you, 1 closed, 1 idle</span>');
    // Archived maps stay out of the active list.
    expect(html).not.toContain('maps-opt-8');
    expect(html).not.toContain('maps-opt-12');
  });

  it('says so when every map is archived, and when nothing is archived yet', () => {
    const allArchived = repositoryPageHtml('octo/wayfinder', snapshot([archived(map(8, 'Done', false), 'closed', '2026-09-23T12:00:00.000Z')]), initialRepositoryState(), context());
    expect(allArchived).toContain('0 active · 1 archived');
    expect(allArchived).toContain('<p class="wf-none" role="status">Every map here is archived.</p>');

    const noneArchived = repositoryPageHtml('octo/wayfinder', snapshot([map(3, 'Mine', true)]), initialRepositoryState(), context());
    expect(noneArchived).toContain('None yet. Closed, finished and idle maps move here on their own.');
  });

  it('groups Archived maps by reason, each block carrying its own reason and rule', () => {
    const maps = snapshot([
      map(35, 'Still going', true),
      archived(map(8, 'Shipped <docs>', false), 'closed', '2026-09-23T12:00:00.000Z'),
      archived(map(12, 'Parked', true), 'manual', '2026-09-26T09:00:00.000Z'),
      archived(map(13, 'Also parked', true), 'manual', '2026-09-20T09:00:00.000Z'),
      archived(map(16, 'All done', true), 'finished', '2026-09-22T09:00:00.000Z'),
      archived(map(14, 'Quiet', true), 'idle', '2026-09-01T00:00:00.000Z'),
    ]);
    const html = repositoryPageHtml('octo/wayfinder', maps, initialRepositoryState('archived'), context());

    expect(html).toContain('<h1 tabindex="-1">Archived maps</h1><p>5 archived for ramon · the issues on GitHub are unchanged</p>');
    expect(html).toContain('<a class="archive-back" href="/repos/octo/wayfinder" data-repo-view="active">');
    expect(html).toContain('<span class="sr-only">Filter archived maps</span>');
    expect(html).toContain('role="listbox" aria-label="Archived maps, grouped by why they are archived"');
    // Reason order, then most recent first within a reason.
    const order = [12, 13, 8, 16, 14].map((number) => html.indexOf(`id="maps-opt-${String(number)}"`));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).toContain('role="group" aria-label="Archived by you"');
    expect(html).toContain('role="group" aria-label="Finished"');
    // Both manual maps carry the reason and rule themselves, not a shared heading.
    expect(html.match(/<span class="maps-rule" id="maps-rule-1[23]">Stays until you restore it\.<\/span>/g)).toHaveLength(2);
    expect(html).toContain('<span class="maps-rule" id="maps-rule-8">The map issue is closed on GitHub.</span>');
    expect(html).toContain('<span class="maps-rule" id="maps-rule-16">Every ticket on the map is done.</span>');
    expect(html).toContain('<span class="maps-rule" id="maps-rule-14">Nothing changed for 30 days.</span>');
    expect(html).toContain('aria-describedby="maps-reason-12 maps-rule-12" aria-selected="true"');
    expect(html).toContain('<time datetime="2026-09-23T12:00:00.000Z">3 days ago</time>');
    expect(html).toContain('<span class="num">#8</span> Shipped &lt;docs&gt;');
    expect(html).not.toContain('maps-opt-35');
    // The first map's preview opens it without restoring; Restore is separate.
    expect(html).toContain('<a class="maps-preview" href="/repos/octo/wayfinder/maps/12" aria-label="Open map #12: Parked. It stays archived.">');
    expect(html).toContain('data-restore-map="12" aria-label="Restore map #12: Parked"');
    expect(html).toContain('<dt>Returns</dt><dd>Only when you restore it, even if a ticket reopens.</dd>');
    expect(html).toContain('Not watched for changes');
    expect(html).toContain('Opening keeps it archived. Restore puts it back in your active maps until you archive it again.');
    expect(html).toContain('<kbd>Enter</kbd> open without restoring');
    // Its tickets aren't read yet, so the preview waits for them instead of drawing an empty graph.
    expect(html).toContain('maps-detail-graph is-loading');
    expect(html).not.toContain('Public maps');
  });

  it('explains a selected closed map, its paused Auto map and its running hand-offs', () => {
    const closed = { ...map(8, 'Shipped', false, [ticket(1, 'One', 'done'), ticket(2, 'Two', 'frontier')]), settled: { reason: 'closed' as const, since: '2026-09-23T12:00:00.000Z' } };
    const html = repositoryPageHtml(
      'octo/wayfinder',
      snapshot([closed]),
      { ...initialRepositoryState('archived'), archivedSelected: 8 },
      context({ autoMap: (number) => number === 8, handOffs: [{ repo: 'octo/wayfinder', mapNumber: 8, status: 'running', stale: false }] }),
    );

    expect(html).toContain('Map · #8 · closed');
    expect(html).toContain('The map issue is closed on GitHub, with 1 ticket still open.');
    expect(html).toContain('Auto map paused; your setting is kept');
    expect(html).toContain('1 hand-off still running in T3 Code and tracked');
    expect(html).toContain('until you archive it again; watching resumes only if the issue reopens.');
    expect(html).toContain('class="mini-graph"');
  });

  it('shows the empty Archived maps state with every kind of archive', () => {
    const html = repositoryPageHtml('octo/wayfinder', snapshot([map(3, 'Mine', true)]), initialRepositoryState('archived'), context({ login: null }));

    expect(html).toContain('0 archived · the issues on GitHub are unchanged');
    expect(html).toContain('<h2>No archived maps</h2>');
    for (const label of ['Archived by you', 'Closed', 'Finished', 'Idle 30 days']) expect(html).toContain(label);
    expect(html).toContain('href="/repos/octo/wayfinder" data-repo-view="active">Back to active maps</a>');
  });

  it('shows a failed save beside its map with Try again', () => {
    const html = repositoryPageHtml(
      'octo/wayfinder',
      snapshot([map(35, 'Still going', true)]),
      { ...initialRepositoryState(), saveError: { kind: 'archive', mapNumber: 35, message: 'Could not save this choice.' } },
      context(),
    );

    expect(html).toContain('<b>Couldn&#39;t archive #35. It&#39;s still in your active maps.</b> Could not save this choice.');
    expect(html).toContain('data-archive-retry');
  });

  it('says when the maps on screen are older because a refresh failed', () => {
    const html = repositoryPageHtml('octo/wayfinder', snapshot([map(35, 'Still going', true)]), { ...initialRepositoryState(), stale: true }, context({ now: Date.parse('2026-09-23T12:02:30.000Z') }));

    expect(html).toContain("<b>Couldn't refresh from GitHub.</b> Showing your maps from 2 minutes ago; nothing has moved in or out of the archive.");
    expect(html).toContain('data-retry-page');
  });

  it('renders the plain no-maps state with a contextual repository selection', () => {
    const html = repositoryPageHtml('octo/recipe-box', snapshot([]), initialRepositoryState(), context());

    expect(html).toContain('No maps in recipe-box yet');
    expect(html).toContain('octo/recipe-box · no maps yet');
    expect(html).toContain('Destination');
    expect(html).toContain('href="/new-map?repo=octo%2Frecipe-box"');
    expect(html.match(/Start a new map/g)).toHaveLength(1);
    expect(html).not.toContain('repo-map-search');
  });

  it('keeps private-map guidance in the active preview', () => {
    const html = repositoryPageHtml('octo/wayfinder', snapshot([{ ...map(3, 'Mine', true), author: 'ramon' }]), initialRepositoryState(), context());
    expect(html).toContain('<dt>Visibility</dt><dd data-map-visibility="private">Private in Wayfinder only. If the repository is public, this issue can still be read on GitHub.</dd>');

    const shared = repositoryPageHtml('octo/wayfinder', snapshot([{ ...map(5, 'Followed', true), visibility: 'public' }]), initialRepositoryState(), context());
    expect(shared).toContain('<dd data-map-visibility="public">Public</dd>');
  });

  it('counts the maps from other people that are hidden', () => {
    const html = repositoryPageHtml('octo/wayfinder', { ...snapshot([map(3, 'Mine', true)]), hiddenMaps: 12 }, initialRepositoryState(), context());
    expect(html).toContain('12 maps from other people are hidden.');

    const none = repositoryPageHtml('octo/recipe-box', { ...snapshot([]), hiddenMaps: 1 }, initialRepositoryState(), context());
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
    const html = repositoryPageHtml('octo/wayfinder', { ...snapshot([]), publicMaps: [publicMap(9, false, { completed: 2, total: 6 }), publicMap(3, true)] }, initialRepositoryState(), context());

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

    expect(repositoryPageHtml('octo/wayfinder', snapshot([]), initialRepositoryState(), context())).not.toContain('data-repo-public');
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
  it('shows the real header and placeholder lists in the loaded page frame', () => {
    const html = repositoryLoadingHtml('octo/<wayfinder>');

    expect(html).toContain('class="repository-page wf-repo-page is-loading" role="status" aria-live="polite"');
    expect(html).toContain('<h1>&lt;wayfinder&gt;</h1>');
    expect(html).toContain('<div class="repo-map-section" aria-hidden="true">');
    expect(html).toContain('class="wf-filters"');
    expect(html.match(/maps-opt is-skeleton/g)).toHaveLength(3);
    expect(html).toContain('class="archive-door" aria-hidden="true"');
    expect(html).not.toContain('<wayfinder>');
  });

  it('loads Archived maps in its own frame', () => {
    const html = repositoryLoadingHtml('octo/wayfinder', 'archived');
    expect(html).toContain('aria-label="Loading archived maps"');
    expect(html).toContain('<h1>Archived maps</h1>');
  });
});
