import { describe, expect, it } from 'vitest';

import type { Ticket, WayfinderMap } from '../types.js';
import { homeContinueCardMarkup, homeErrorMarkup, homeLoadingMarkup, stateStackHtml } from './homeLanding.js';
import type { ContinueDestination } from './homeView.js';

function ticket(number: number, state: Ticket['state'], blockedBy: number[] = []): Ticket {
  return { number, title: `Ticket ${String(number)}`, url: '', body: '', type: 'task', labels: [], open: state !== 'done', assignee: null, blockedBy, openBlockers: [], state };
}

const MAP = {
  number: 35,
  title: 'Redesign Home',
  open: true,
  tickets: [ticket(1, 'done'), ticket(2, 'frontier', [1]), ticket(3, 'blocked', [2])],
  outside: [],
  sections: { destination: 'A calm Home.' },
} as unknown as WayfinderMap;

const DESTINATION: ContinueDestination = {
  kind: 'map',
  title: 'Redesign Home',
  repo: 'octo/wayfinder',
  detail: 'A calm Home.',
  href: '/repos/octo/wayfinder/maps/35',
  timestamp: new Date().toISOString(),
  handOffId: null,
  map: MAP,
};

describe('Home loading and error states', () => {
  it('renders loading placeholders in the shape of the three sections and the progress panel', () => {
    const markup = homeLoadingMarkup();

    expect(markup).toContain('aria-label="Loading Home"');
    expect(markup).toContain('wf-skeleton is-card');
    expect(markup).toContain('wf-skeleton is-progress');
    expect(markup).toContain('Continue');
    expect(markup).toContain('In flight');
    expect(markup).toContain('Repositories');
  });

  it('shows the first-map destination without an in-card create action', () => {
    const markup = homeContinueCardMarkup(null, true);

    expect(markup).toContain('ghostnode');
    expect(markup).toContain('Maps you open will be ready here.');
    expect(markup).not.toContain('<a ');
    expect(markup).not.toContain('<button ');
  });

  it('blocks Continue while signed out and preserves cached repository links on error', () => {
    const signedOut = homeContinueCardMarkup(null, false);
    const error = homeErrorMarkup('GitHub is unavailable.', ['octo/wayfinder']);

    expect(signedOut).toContain('Account needed');
    expect(signedOut).toContain('Sign in to continue');
    expect(error).toContain('role="alert"');
    expect(error).toContain('GitHub is unavailable.');
    expect(error).toContain('href="/repos/octo/wayfinder"');
  });
});

describe('Home Continue card', () => {
  it('draws the map graph beside the title and links its next ticket', () => {
    const markup = homeContinueCardMarkup(DESTINATION, true);

    expect(markup).toContain('#35 Redesign Home');
    expect(markup).toContain('class="mini-graph"');
    expect(markup).toContain('href="/repos/octo/wayfinder/maps/35?view=map&amp;ticket=2">#2 Ticket 2');
    expect(markup).toContain('Open map');
    expect(markup).toContain('Continue · wayfinder · opened');
  });
});

describe('stateStackHtml', () => {
  it('draws one segment per state in progress order and says how much is done', () => {
    const html = stateStackHtml({ done: 3, claimed: 1, frontier: 0, blocked: 1 });

    expect(html).toContain('aria-label="3 of 5 tickets done"');
    expect(html.indexOf('--state-done')).toBeLessThan(html.indexOf('--state-claimed'));
    expect(html).not.toContain('--state-frontier');
  });

  it('draws an empty bar for a repository without tickets', () => {
    expect(stateStackHtml({ done: 0, claimed: 0, frontier: 0, blocked: 0 })).toContain('aria-label="No tickets yet"');
  });
});
