import { describe, expect, it } from 'vitest';

import type { Ticket, WayfinderMap } from '../types.js';
import {
  DEFAULT_HOME_SHAPE,
  HOME_SHAPE_KEY,
  homeContinueCardMarkup,
  homeErrorMarkup,
  homeLoadingMarkup,
  measureHomeShape,
  progressSkeletonMarkup,
  readHomeShape,
  rememberHomeShape,
  stateStackHtml,
} from './homeLanding.js';
import type { HomeShape } from './homeLanding.js';
import type { HomeStorage } from './homeRecency.js';
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
  criticalPath: { tickets: [], remaining: 0 },
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
  it('renders the loaded layout with placeholder bars: Continue card, two lanes, search, rows and progress', () => {
    const markup = homeLoadingMarkup();

    expect(markup).toContain('aria-label="Loading Home"');
    expect(markup).toContain('wf-node wf-continue is-skeleton" style="height: 236px"');
    expect(markup).toContain('<div class="graph"></div>');
    expect(markup.match(/class="wf-lane"/g)).toHaveLength(2);
    expect(markup).toContain('<div class="wf-find"><span class="search"></span></div>');
    expect(markup.match(/class="wf-repo"/g)).toHaveLength(6);
    expect(markup).toContain('progress-panel is-skeleton" style="height: 618px"');
    expect(markup).toContain('In flight');
    expect(markup).toContain('Repositories');
    expect(markup).not.toContain('Recent hand-offs');
  });

  it('sizes the skeleton from the last loaded Home', () => {
    const shape: HomeShape = { continueHeight: 190, inFlightHeight: 420, laneItems: [0, 3], historyHeight: 74, repositoryRows: 2, progressHeight: 540 };
    const markup = homeLoadingMarkup(shape);

    expect(markup).toContain('wf-continue is-skeleton" style="height: 190px"');
    expect(markup).toContain('wf-lanes is-skeleton" style="height: 420px"');
    expect(markup.match(/class="wf-none"/g)).toHaveLength(1);
    expect(markup.match(/class="wf-node wf-fly"/g)).toHaveLength(3);
    expect(markup).toContain('Recent hand-offs</div><div class="wf-skeleton" style="height: 74px"');
    expect(markup.match(/class="wf-repo"/g)).toHaveLength(2);
    expect(markup).toContain('style="height: 540px"');
  });

  it('shows one note in place of the lanes when In flight was a single note', () => {
    const markup = homeLoadingMarkup({ ...DEFAULT_HOME_SHAPE, laneItems: [], inFlightHeight: 49 });

    expect(markup).toContain('<div class="wf-none" style="height: 49px">');
    expect(markup).not.toContain('wf-lanes');
  });

  it('keeps a progress placeholder in the side column until the panel arrives', () => {
    expect(progressSkeletonMarkup(600)).toContain('card progress-panel is-skeleton" style="height: 600px" aria-hidden="true"');
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

function memoryStorage(initial: Record<string, string> = {}): HomeStorage & { values: Record<string, string> } {
  const values = { ...initial };
  return {
    values,
    getItem: (key) => values[key] ?? null,
    setItem: (key, value) => {
      values[key] = value;
    },
  };
}

interface FakeElement {
  height?: number;
  hidden?: boolean;
  one?: Record<string, FakeElement>;
  all?: Record<string, FakeElement[]>;
}

/** Just enough of Element for measureHomeShape: selector lookups and a height. */
function fake(element: FakeElement): ParentNode & HTMLElement {
  return {
    hidden: element.hidden ?? false,
    getBoundingClientRect: () => ({ height: element.height ?? 0 }),
    querySelector: (selector: string) => {
      const match = element.one?.[selector];
      return match === undefined ? null : fake(match);
    },
    querySelectorAll: (selector: string) => (element.all?.[selector] ?? []).map(fake),
  } as unknown as ParentNode & HTMLElement;
}

describe('Home skeleton shape', () => {
  it('falls back to typical sizes when nothing valid is stored', () => {
    expect(readHomeShape(memoryStorage())).toEqual(DEFAULT_HOME_SHAPE);
    expect(readHomeShape(memoryStorage({ [HOME_SHAPE_KEY]: '{not json' }))).toEqual(DEFAULT_HOME_SHAPE);
    const invalid = { continueHeight: -4, inFlightHeight: 'tall', laneItems: [1, 'x'], repositoryRows: 40, progressHeight: 1e9 };
    expect(readHomeShape(memoryStorage({ [HOME_SHAPE_KEY]: JSON.stringify(invalid) }))).toEqual({ ...DEFAULT_HOME_SHAPE, repositoryRows: 6 });
  });

  it('measures the loaded Home and stores it for the next skeleton', () => {
    const lane = (cards: number): FakeElement => ({ all: { '.wf-fly:not([hidden])': Array.from({ length: cards }, () => ({})) } });
    const left: FakeElement = {
      one: {
        'section[aria-label="Continue"] > *': { height: 235.6 },
        'section[aria-labelledby="home-inflight-heading"] > :is(.wf-lanes, .wf-none)': { height: 439 },
        '#home-handoff-history-section': { one: { '#home-handoff-history-list': { height: 74 } } },
      },
      all: {
        '.wf-lane': [lane(0), lane(5)],
        '[data-home-repo-row]:not([hidden])': [{}, {}],
      },
    };
    const root = fake({ one: { '.wf-home:not(.is-loading)': { one: { '.wf-left': left, '.wf-side > .progress-panel': { height: 618 } } } } });
    const storage = memoryStorage();

    rememberHomeShape(root, storage);

    expect(JSON.parse(storage.values[HOME_SHAPE_KEY] ?? 'null')).toEqual({
      continueHeight: 236,
      inFlightHeight: 439,
      laneItems: [0, 3],
      historyHeight: 74,
      repositoryRows: 2,
      progressHeight: 618,
    });
  });

  it('keeps the last progress height before the panel loads, and measures nothing off Home', () => {
    const previous = { ...DEFAULT_HOME_SHAPE, progressHeight: 560 };
    const root = fake({ one: { '.wf-home:not(.is-loading)': { one: { '.wf-left': { one: { '#home-handoff-history-section': { hidden: true } } } } } } });

    expect(measureHomeShape(root, previous)).toMatchObject({ progressHeight: 560, historyHeight: 0, laneItems: [], repositoryRows: 0 });
    expect(measureHomeShape(fake({}))).toBeNull();
  });
});
