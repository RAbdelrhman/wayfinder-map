import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { canvasCatalog } from '../canvasCatalog.js';
import realCanvases from '../__fixtures__/canvas-catalog/manifest.json';
import { Window } from 'happy-dom';
import { setTrustedHtml } from './trustedHtml.js';

import type { Prototype, Ticket, TicketState, TicketType, WayfinderMap } from '../types.js';
import {
  pickedVariantIds,
  prototypeBoardErrorHtml,
  prototypeBoardHtml,
  prototypeBoardLoadingHtml,
  prototypeCardState,
  prototypeVariants,
  sortPrototypeCards,
  selectPrototypePage,
  selectPrototypeHero,
  revealPrototypeSource,
  togglePrototypeRound,
  togglePrototypeMore,
} from './prototypeBoard.js';
import { canvasEntryRoute, readCanvasRoute } from './canvasViewer.js';

function ticket(
  number: number,
  title: string,
  type: TicketType,
  state: TicketState,
  blockedBy: number[] = [],
): Ticket {
  return {
    number,
    title,
    url: `https://github.com/octo/wayfinder/issues/${String(number)}`,
    body: '',
    type,
    labels: [],
    open: state !== 'done',
    assignee: null,
    blockedBy,
    openBlockers: state === 'blocked' ? blockedBy : [],
    state,
    updatedAt: null,
  };
}

function map(tickets: Ticket[]): WayfinderMap {
  return {
    number: 35,
    title: 'Redesign Home and Start a new map',
    url: 'https://github.com/octo/wayfinder/issues/35',
    body: '',
    open: true,
    author: 'octocat',
    visibility: 'private',
    sections: { destination: '', notes: '', decisions: '', fog: '', outOfScope: '' },
    tickets,
    outside: [],
    criticalPath: { tickets: [], remaining: 0 },
    stalled: [],
    pullRequests: [],
    settled: null,
    ticketsLoaded: true,
  };
}

function prototype(
  ticketNumber: number,
  overrides: Partial<Prototype> = {},
): Prototype {
  return {
    branch: `prototype/${String(ticketNumber)}-design`,
    ticketNumber,
    mapNumber: 35,
    url: `https://github.com/octo/wayfinder/tree/prototype/${String(ticketNumber)}-design`,
    updatedAt: '2026-09-23T12:00:00.000Z',
    files: [],
    openable: ['prototypes/canvas/index.html'],
    preview: 'prototypes/canvas/index.html',
    verdict: null,
    ...overrides,
  };
}

describe('reported map #205 canvas choices', () => {
  const choices = new Map([[347, 'AC3'], [310, 'AB'], [314, 'E'], [292, 'D'], [207, 'ACF4']]);
  for (const entry of realCanvases) {
    it(`shows the actual kept choice for #${String(entry.ticketNumber)}`, () => {
      const source = readFileSync(new URL(`../__fixtures__/canvas-catalog/${String(entry.ticketNumber)}.txt`, import.meta.url), 'utf8');
      const card = prototype(entry.ticketNumber, { ...entry, canvasPages: canvasCatalog(source) });
      const html = prototypeBoardHtml('octo/wayfinder', map([ticket(entry.ticketNumber, 'Real canvas', 'prototype', 'done')]), [card]);
      expect(html).toContain('chosen-canvas-main');
      expect(html).toContain(`Picked ${choices.get(entry.ticketNumber)!}`);
      expect(html).toContain(`data-proto-item="${choices.get(entry.ticketNumber)!}"`);
      expect(html).toContain('data-canvas-page=');
    });
  }
});

describe('AC3 supporting screens', () => {
  it('preserves the explicit D approval after its quoted requested removal', () => {
    const html = prototypeBoardHtml('octo/wayfinder', map([ticket(225, 'Notifications', 'prototype', 'done')]), [prototype(225, { canvasPages: [{ id: 'r2', title: 'Remix', round: 2, items: [{ id: 'D', name: 'D', src: 'd.html', disposition: 'keep', feedback: 'Approval on #225: "but yes approve with that one thing removed." Approved D with only the summary removed.', basedOn: [] }] }] })]);
    expect(html).toContain('Picked D');
  });

  it('shows F alone as the pick and the two approved support thumbnails', () => {
    const makeItem = (id: string, feedback: string | null = null) => ({ id, name: id, src: `${id}.html`, disposition: feedback ? 'keep' : null, feedback, basedOn: [] });
    const html = prototypeBoardHtml('octo/wayfinder', map([ticket(163, 'Start next', 'prototype', 'done')]), [prototype(163, { canvasPages: [
      { id: 'four', title: 'Menu', round: 4, items: [makeItem('M-running')] },
      { id: 'five', title: 'Final', round: 5, items: [makeItem('F', 'Final pick'), makeItem('F-setup', 'Approved F-setup')] },
    ] })]);
    expect(html).toContain('Picked F</span>');
    expect(html).not.toContain('Picked F +');
    expect(html).toContain('Also part of the choice');
    expect(html).toContain('Part of the choice');
    expect(html.match(/data-proto-hero="/g)).toHaveLength(3);
    expect(html).toContain('data-canvas-page="four"');
  });
});

describe('AC3 conservative decisions and history', () => {
  for (const feedback of ['Looks nice', 'Maybe keep A', 'Keep A. Still undecided though', 'Undecided, keep A', 'Keep A only for its header', 'Keep A but change the rest', 'Earlier partial carry-forward']) {
    it(`does not confirm ${feedback}`, () => {
      const html = prototypeBoardHtml('octo/wayfinder', map([ticket(10, 'Example', 'prototype', 'done')]), [prototype(10, { canvasPages: [{ id: 'p', title: 'Options', round: 1, items: [{ id: 'A', name: 'A', src: 'a.html', disposition: 'keep', feedback, basedOn: [] }] }] })]);
      expect(html).not.toContain('chosen-canvas-main');
      expect(html).not.toContain('Picked A');
    });
  }
  it('opens undecided latest phones and preserves textual Baseline history', () => {
    const html = prototypeBoardHtml('octo/wayfinder', map([ticket(10, 'Example', 'prototype', 'claimed')]), [prototype(10, { canvasPages: [
      { id: 'base', title: 'Directions', round: 'Baseline', items: [] },
      { id: 'latest', title: 'Latest', round: 2, items: [{ id: 'A', name: 'Phone', src: 'a.html', width: 390, height: 844, disposition: null, feedback: null, basedOn: [] }] },
    ] })]);
    expect(html).toContain('>Baseline');
    expect(html).not.toContain('Round Baseline');
    expect(html).toContain('data-proto-round-panel="1"><');
    expect(html).toContain('chosen-phone');
    expect(html).toContain('data-icon="right"');
  });
});

describe('prototype decision state', () => {
  it('keeps every canvas reachable and fallback variants in the primary canvas', () => {
    const canvases = ['prototypes/canvas/index.html', 'prototypes/43-design/index.html'];
    const proto = prototype(43, {
      canvases,
      preview: canvases[1] ?? null,
      files: ['prototypes/canvas/variants/a-unrelated.html', 'prototypes/43-design/variants/a-home.html'],
      openable: ['prototypes/canvas/variants/a-unrelated.html', 'prototypes/43-design/variants/a-home.html'],
    });
    expect(prototypeVariants(proto)).toEqual([{ id: 'A', title: 'Home', imageFile: null, pageFile: 'prototypes/43-design/variants/a-home.html' }]);
    const html = prototypeBoardHtml('octo/wayfinder', map([ticket(43, 'Home', 'prototype', 'frontier')]), [proto]);
    for (const board of canvases) expect(html).toContain(`href="/proto/octo/wayfinder/prototype%2F43-design/${board}"`);
    expect(html).not.toContain('a-unrelated.html');
  });
  it('treats a related open grilling ticket as waiting on a pick', () => {
    const mapView = map([
      ticket(43, 'Prototype three views', 'prototype', 'blocked', [47]),
      ticket(47, 'Choose the shipped direction', 'grilling', 'frontier'),
    ]);

    expect(prototypeCardState(mapView, prototype(43))).toEqual({ state: 'waiting', pickTicket: mapView.tickets[1] });
  });

  it('keeps an open prototype in the building state when no pick ticket blocks it', () => {
    expect(prototypeCardState(map([ticket(43, 'Prototype three views', 'prototype', 'claimed')]), prototype(43))).toEqual({
      state: 'building',
      pickTicket: null,
    });
  });

  it('does not use another map ticket from a legacy cache as its pick ticket', () => {
    const mapView = map([ticket(43, 'Prototype three views', 'prototype', 'claimed')]);
    mapView.outside = [{ ...ticket(47, 'Other map decision', 'grilling', 'frontier', [43]), pullRequest: false, blocks: [], waitsOn: [43] }];
    expect(prototypeCardState(mapView, prototype(43))).toEqual({ state: 'building', pickTicket: null });
  });

  it('treats a closed prototype ticket as decided', () => {
    expect(prototypeCardState(map([ticket(43, 'Prototype three views', 'prototype', 'done')]), prototype(43))).toEqual({
      state: 'decided',
      pickTicket: null,
    });
  });

  it('orders waiting, building, and decided cards in that order', () => {
    const waitingMap = map([
      ticket(43, 'Waiting', 'prototype', 'blocked', [47]),
      ticket(47, 'Pick a direction', 'grilling', 'frontier'),
      ticket(44, 'Being built', 'prototype', 'claimed'),
      ticket(42, 'Already decided', 'prototype', 'done'),
    ]);

    expect(sortPrototypeCards(waitingMap, [prototype(42), prototype(44), prototype(43)]).map(({ ticketNumber }) => ticketNumber)).toEqual([
      43,
      44,
      42,
    ]);
  });
});

describe('prototype variant metadata', () => {
  it('uses matching screenshot files and openable variant pages, and ignores unrelated issue images', () => {
    const variants = prototypeVariants(
      prototype(43, {
        files: [
          'prototypes/canvas/assets/protos/43-A.jpg',
          'prototypes/canvas/assets/protos/43-B.jpg',
          'prototypes/canvas/assets/protos/44-C.jpg',
        ],
        openable: [
          'prototypes/canvas/index.html',
          'prototypes/canvas/variants/a.html',
          'prototypes/canvas/variants/b.html',
          'docs/architecture.html',
        ],
      }),
    );

    expect(variants).toEqual([
      { id: 'A', title: 'Variant A', imageFile: 'prototypes/canvas/assets/protos/43-A.jpg', pageFile: 'prototypes/canvas/variants/a.html' },
      { id: 'B', title: 'Variant B', imageFile: 'prototypes/canvas/assets/protos/43-B.jpg', pageFile: 'prototypes/canvas/variants/b.html' },
    ]);
  });

  it('supports combined direction IDs in a mixed pick and simple letters in a single pick', () => {
    expect(pickedVariantIds('Use A + B, with the combined board as the winner.', ['A', 'B', 'AB', 'C'])).toEqual(['AB']);
    expect(pickedVariantIds('We selected C for the goal-first flow.', ['A', 'B', 'C'])).toEqual(['C']);
    expect(pickedVariantIds('The reviewer discussed A, B, and C.', ['A', 'B', 'C'])).toEqual([]);
    expect(pickedVariantIds('The canvas has five rounds. The confirm list uses option A’s dialog.', ['A', 'B', 'C'])).toEqual([]);
    expect(pickedVariantIds('The reviewer selected the direction after discussing A, B, and C.', ['A', 'B', 'C'])).toEqual([]);
  });

  it('reads the answer line first and never picks a variant the verdict rejects', () => {
    const verdict = [
      '**Answer:** A + B, with the hand-off list in the topbar.',
      '- **A: status stays on the ticket.** You use it from the map.',
      '- **C (a page per hand-off) is not chosen:** it takes you away from the map.',
    ].join('\n');

    expect(pickedVariantIds(verdict, ['A', 'AB', 'B', 'C'])).toEqual(['AB']);
    expect(pickedVariantIds('**Answer:** C, goal first. Maps only.', ['A', 'B', 'C'])).toEqual(['C']);
    expect(pickedVariantIds('The user picked C1 and B2. The answer is **direction D**: C’s tree with B’s switcher.', ['A', 'B', 'C', 'D'])).toEqual(['D']);
  });

  it('picks the approved remix without picking its source options', () => {
    const verdict = 'Completed through PR #345. Chosen design and confirmed behavior.\n\nD, Round 2, is approved with only the redundant inbox summary removed. D combines A, B and C.';
    expect(pickedVariantIds(verdict, ['A', 'B', 'C', 'D'])).toEqual(['D']);
    expect(pickedVariantIds('A, Round 1, is approved.\nD, Round 2, is approved.', ['A', 'D'])).toEqual(['D']);
    expect(pickedVariantIds('A, Round 1, is approved.\n**Answer:** D, the remix.', ['A', 'D'])).toEqual(['D']);
  });

  it('uses the canvas variants the server read, with their screenshots and pages', () => {
    const mapView = map([ticket(45, 'After hand-off', 'prototype', 'done')]);
    const html = prototypeBoardHtml('octo/wayfinder', mapView, [prototype(45, {
      verdict: '**Answer:** A + B, with the list in the topbar.',
      variants: [
        { id: 'A', title: 'Stays on the ticket', page: 'prototypes/canvas/variants/after-a.html', shot: '45-A.jpg' },
        { id: 'AB', title: 'A + B, list in the topbar', page: null, shot: '45-AB.jpg' },
      ],
    })]);

    expect(html).toContain('Picked AB');
    expect(html).toContain('src="/proto-shot/octo/wayfinder/45-A.jpg"');
    expect(html).toContain('AB · A + B, list in the topbar');
    expect(html).toContain('class="wf-var decision-variant is-dim"');
  });

  it('prefers an explicit final canvas pick over earlier options mentioned in the verdict', () => {
    const html = prototypeBoardHtml('octo/wayfinder', map([ticket(163, 'Start next', 'prototype', 'done')]), [prototype(163, {
      verdict: '## Answer\n\nThe canvas opens on Round 5. The menu opens option A’s dialog.',
      canvasPages: [
        { id: 'round-2', title: 'Earlier', round: 2, items: [{ id: 'A', name: 'Earlier', src: 'a.html', disposition: 'change', feedback: null, basedOn: [] }] },
        { id: 'round-5', title: 'Final', round: 5, items: [{ id: 'F', name: 'Final round', src: 'f.html', disposition: 'keep', feedback: 'Final pick', basedOn: [] }] },
      ],
    })]);
    expect(html).toContain('Picked F');
    expect(html).toContain('Open Final round on Final');
    expect(html).not.toContain('Open variant A: Earlier (picked)');
  });

  it('shows the final canvas item first and keeps page identity for repeated IDs', () => {
    const html = prototypeBoardHtml('octo/wayfinder', map([ticket(225, 'Notifications', 'prototype', 'done')]), [prototype(225, {
      verdict: 'D, Round 2, is approved.',
      canvasPages: [
        { id: 'round-1-dark', title: 'Dark', round: 1, items: [{ id: 'D', name: 'Old', src: 'variants/old.html', disposition: null, feedback: null, basedOn: [] }] },
        { id: 'round-1-light', title: 'Light', round: 1, items: [{ id: 'D', name: 'Light', src: 'variants/old.html', disposition: null, feedback: null, basedOn: [] }] },
        { id: 'round-2', title: 'Remix', round: 2, items: [{ id: 'D', name: 'Final', src: 'variants/new.html', disposition: 'keep', feedback: 'Approved D', basedOn: ['A', 'B'] }] },
      ],
    })]);
    expect(html).toContain('Chosen · Round 2 · Remix');
    expect(html).toContain('data-canvas-page="round-2"');
    expect(html).toContain('data-canvas-page="round-1-dark"');
    expect(html).toContain('How it got here');
    const browser = new Window();
    setTrustedHtml(browser.document.body as unknown as HTMLElement, html);
    const buttons = [...browser.document.querySelectorAll('[data-proto-round]')] as unknown as HTMLButtonElement[];
    const panels = [...browser.document.querySelectorAll('[data-proto-round-panel]')] as unknown as HTMLElement[];
    togglePrototypeRound(buttons[0]!);
    expect(panels[0]?.hidden).toBe(false);
    expect(panels[1]?.hidden).toBe(true);
    const pageButtons = [...browser.document.querySelectorAll('[data-proto-page]')] as unknown as HTMLButtonElement[];
    const pagePanels = [...panels[0]!.querySelectorAll('[data-proto-page-panel]')] as unknown as HTMLElement[];
    selectPrototypePage(pageButtons[1]!);
    expect(pagePanels.map((panel) => panel.hidden)).toEqual([true, false]);
    togglePrototypeRound(buttons[1]!);
    expect(panels[0]?.hidden).toBe(true);
    expect(panels[1]?.hidden).toBe(false);
    togglePrototypeRound(buttons[1]!);
    expect(panels[1]?.hidden).toBe(true);
  });

  it('uses an exact round and item named in the verdict only when it identifies one page', () => {
    const card = prototype(226, {
      verdict: 'Decision: Ramon selected Round 2 R2A, based on A.',
      canvasPages: [{ id: 'round-2', title: 'Remix', round: 2, items: [{ id: 'R2A', name: 'Notes in More', src: 'variants/phone.html', disposition: 'keep', feedback: 'Looks good to me.', basedOn: ['A'] }] }],
    });
    const mapView = map([ticket(226, 'Mobile viewer', 'prototype', 'done')]);
    expect(prototypeBoardHtml('octo/wayfinder', mapView, [card])).toContain('Chosen · Round 2 · Remix');
    const duplicate = { ...card, canvasPages: [...card.canvasPages!, { ...card.canvasPages![0]!, id: 'round-2-dark' }] };
    expect(prototypeBoardHtml('octo/wayfinder', mapView, [duplicate])).not.toContain('Chosen · Round 2 · Remix');
    const changed = { ...card, canvasPages: [{ ...card.canvasPages![0]!, items: [{ ...card.canvasPages![0]!.items[0]!, disposition: 'change' }] }] };
    expect(prototypeBoardHtml('octo/wayfinder', mapView, [changed])).not.toContain('Chosen · Round 2 · Remix');
  });

  it('uses an explicitly chosen direction when the kept canvas item is unique', () => {
    const card = prototype(314, {
      verdict: '## Chosen direction E, prototype complete',
      canvasPages: [{ id: 'round-2', title: 'Remix', round: 2, items: [
        { id: 'D', name: 'Copy', src: 'd.html', disposition: null, feedback: 'Not chosen.', basedOn: [] },
        { id: 'E', name: 'Send', src: 'e.html', disposition: 'keep', feedback: 'The user chose this.', basedOn: ['B'] },
      ] }],
    });
    const html = prototypeBoardHtml('octo/wayfinder', map([ticket(314, 'Feedback', 'prototype', 'done')]), [card]);
    expect(html).toContain('Chosen · Round 2 · Remix');
    expect(html).toContain('Not chosen');
    expect(html).toContain('data-canvas-page="round-2"');
  });

  it('recognizes an explicit keep without treating a negated approval as a pick', () => {
    const page = { id: 'round-2', title: 'Remix', round: 2, items: [{ id: 'D', name: 'Direction', src: 'd.html', disposition: 'keep', feedback: 'Keep D', basedOn: [] }] };
    const mapView = map([ticket(10, 'Example', 'prototype', 'done')]);
    expect(prototypeBoardHtml('octo/wayfinder', mapView, [prototype(10, { canvasPages: [page] })])).toContain('Chosen · Round 2 · Remix');
    const negated = { ...page, items: [{ ...page.items[0]!, feedback: 'Not approved D' }] };
    expect(prototypeBoardHtml('octo/wayfinder', mapView, [prototype(10, { canvasPages: [negated] })])).not.toContain('Chosen · Round 2 · Remix');
    const rejected = { ...page, items: [{ ...page.items[0]!, feedback: 'Final pick was rejected' }] };
    expect(prototypeBoardHtml('octo/wayfinder', mapView, [prototype(10, { canvasPages: [rejected] })])).not.toContain('Chosen · Round 2 · Remix');
    const conflicting = { ...page, items: [...page.items, { id: 'A', name: 'A', src: 'a.html', disposition: null, feedback: null, basedOn: [] }] };
    expect(prototypeBoardHtml('octo/wayfinder', mapView, [prototype(10, { canvasPages: [conflicting], verdict: '**Answer:** A.' })])).not.toContain('Chosen · Round 2 · Remix');
  });

  it('keeps separate confirmed choices from different rounds and lets the user switch between them', () => {
    const card = prototype(223, {
      verdict: '## Answer\n- **Sign-in: S-A, button (Keep).**\n- **Repos: R-C2, round 2 (Keep).**',
      canvasPages: [
        { id: 'directions', title: 'Directions', round: 1, items: [{ id: 'S-A', name: 'Sign in', src: 'a.html', disposition: 'keep', feedback: 'Picked', basedOn: [] }] },
        { id: 'round-2', title: 'Remix', round: 2, items: [{ id: 'R-C2', name: 'Repos', src: 'c.html', disposition: 'keep', feedback: 'Looks great', basedOn: ['R-C'] }] },
      ],
    });
    const html = prototypeBoardHtml('octo/wayfinder', map([ticket(223, 'Phone', 'prototype', 'done')]), [card]);
    const browser = new Window();
    setTrustedHtml(browser.document.body as unknown as HTMLElement, html);
    const buttons = [...browser.document.querySelectorAll('[data-proto-hero]')] as unknown as HTMLButtonElement[];
    const panels = [...browser.document.querySelectorAll('[data-proto-hero-panel]')] as unknown as HTMLElement[];
    expect(buttons).toHaveLength(2);
    expect(buttons.map((button) => button.textContent)).toEqual(['Sign-in', 'Repos']);
    selectPrototypeHero(buttons[1]!);
    expect(panels.map((panel) => panel.hidden)).toEqual([true, false]);
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('true');
  });

  it('recognizes a mixed-case item ID named in a recorded choice', () => {
    const card = prototype(316, { verdict: '- **Account: G-a, preferences (Keep).**', canvasPages: [
      { id: 'round-3', title: 'Names', round: 3, items: [{ id: 'G-a', name: 'Preferences', src: 'phone.html', disposition: 'keep', feedback: null, basedOn: [] }] },
    ] });
    const html = prototypeBoardHtml('octo/wayfinder', map([ticket(316, 'Account', 'prototype', 'done')]), [card]);
    expect(html).toContain('Chosen · Round 3 · Names');
    expect(html).toContain('data-canvas-variant="G-a"');
  });

  it('opens and highlights an unambiguous source on its round', () => {
    const card = prototype(225, {
      canvasPages: [
        { id: 'round-1', title: 'Options', round: 1, items: [{ id: 'A', name: 'Original', src: 'a.html', disposition: 'combine', feedback: null, basedOn: [] }] },
        { id: 'round-2', title: 'Remix', round: 2, items: [{ id: 'D', name: 'Final', src: 'd.html', disposition: 'keep', feedback: 'Approved D', basedOn: ['A'] }] },
      ],
    });
    const browser = new Window();
    setTrustedHtml(browser.document.body as unknown as HTMLElement, prototypeBoardHtml('octo/wayfinder', map([ticket(225, 'Phone', 'prototype', 'done')]), [card]));
    expect(browser.document.querySelector('[data-proto-round-panel="0"] [data-proto-item="A"]')?.classList.contains('is-led')).toBe(true);
    expect(browser.document.querySelector('[data-proto-hide]')?.textContent).toBe('Hide');
    const source = browser.document.querySelector('[data-proto-source]') as unknown as HTMLButtonElement;
    revealPrototypeSource(source);
    const panel = browser.document.querySelector('[data-proto-round-panel="0"]') as unknown as HTMLElement;
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector('[data-proto-item="A"]')?.classList.contains('is-led')).toBe(true);
  });

  it('treats inherited object property names as unknown outcomes', () => {
    const card = prototype(10, { canvasPages: [{ id: 'round-1', title: 'Options', round: 1, items: [
      { id: 'A', name: 'Chosen', src: 'a.html', disposition: 'keep', feedback: 'Final pick', basedOn: [] },
      { id: 'B', name: 'Other', src: 'b.html', disposition: 'constructor', feedback: null, basedOn: [] },
    ] }] });
    const html = prototypeBoardHtml('octo/wayfinder', map([ticket(10, 'Example', 'prototype', 'done')]), [card]);
    expect(html).toContain('No outcome recorded');
  });

  it('limits a long round until the user expands it', () => {
    const items = Array.from({ length: 6 }, (_, index) => ({ id: `A${index}`, name: `Item ${index}`, src: 'a.html', disposition: index === 0 ? 'keep' : null, feedback: index === 0 ? 'Final pick' : null, basedOn: [] }));
    const card = prototype(10, { canvasPages: [{ id: 'round-1', title: 'Options', round: 1, items }] });
    const browser = new Window();
    setTrustedHtml(browser.document.body as unknown as HTMLElement, prototypeBoardHtml('octo/wayfinder', map([ticket(10, 'Example', 'prototype', 'done')]), [card]));
    const button = browser.document.querySelector('[data-proto-more]') as unknown as HTMLButtonElement;
    const panel = browser.document.querySelector('[data-proto-more-panel]') as unknown as HTMLElement;
    expect(panel.hidden).toBe(true);
    togglePrototypeMore(button);
    expect(panel.hidden).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    togglePrototypeMore(button);
    expect(panel.hidden).toBe(true);
  });

  it('opens every canvas entry on a decided board in the viewer, screenshots included', () => {
    const mapView = map([ticket(45, 'After hand-off', 'prototype', 'done')]);
    const html = prototypeBoardHtml('octo/wayfinder', mapView, [prototype(45, {
      verdict: '**Answer:** A',
      variants: [
        { id: 'A', title: 'Stays on the ticket', page: 'prototypes/canvas/variants/after-a.html', shot: '45-A.jpg' },
        { id: 'B', title: 'Only a screenshot', page: null, shot: '45-B.jpg' },
      ],
    })]);
    const browser = new Window();
    setTrustedHtml(browser.document.body as unknown as HTMLElement, html);
    const entries = [...browser.document.querySelectorAll('[data-canvas-url]')] as unknown as HTMLElement[];
    expect(entries.map((entry) => entry.dataset['canvasUrl'])).toContain('/proto-shot/octo/wayfinder/45-B.jpg');
    for (const entry of entries)
      expect(readCanvasRoute(canvasEntryRoute(entry.dataset, entry.dataset['canvasUrl']), 'http://127.0.0.1:4479')?.url).toBe(entry.dataset['canvasUrl']);
  });
});

describe('prototype decision board states', () => {
  it('shows the Pick action, clickable Canvas, variant labels, and the waiting state', () => {
    const mapView = map([
      ticket(43, 'Redesign the repository and Prototypes views', 'prototype', 'blocked', [47]),
      ticket(47, 'Choose the shipped direction', 'grilling', 'frontier'),
    ]);
    const card = prototype(43, {
      files: ['prototypes/canvas/assets/protos/43-A.jpg', 'prototypes/canvas/assets/protos/43-B.jpg'],
      verdict: null,
    });
    const html = prototypeBoardHtml('octo/wayfinder', mapView, [card]);

    expect(html).toContain('Waiting on your pick');
    expect(html).toContain('data-jump="47">Pick in #47');
    expect(html).toContain('aria-label="Open the #43 prototype canvas"');
    expect(html).toContain('A · Variant A');
    expect(html).toContain('B · Variant B');
    expect(html).toContain('/proto/octo/wayfinder/prototype%2F43-design/prototypes/canvas/assets/protos/43-A.jpg');
    expect(html).toContain('data-canvas-url="/proto/octo/wayfinder/prototype%2F43-design/prototypes/canvas/assets/protos/43-A.jpg"');
  });

  it('marks a winner, dims the other variants, and leaves each variant link active', () => {
    const mapView = map([
      ticket(43, 'Redesign the repository and Prototypes views', 'prototype', 'done'),
    ]);
    const card = prototype(43, {
      files: ['prototypes/canvas/assets/protos/43-A.jpg', 'prototypes/canvas/assets/protos/43-B.jpg', 'prototypes/canvas/assets/protos/43-C.jpg'],
      verdict: 'Use B for the shipped repository and Prototypes presentation.',
    });
    const html = prototypeBoardHtml('octo/wayfinder', mapView, [card]);

    expect(html).toContain('Picked B');
    expect(html).toContain('class="wf-var decision-variant is-picked"');
    expect(html).toContain('class="wf-var decision-variant is-dim"');
    expect(html).toContain('aria-label="Open variant B: Variant B (picked)"');
    expect(html.match(/class="wf-frame proto-thumb/g)).toHaveLength(3);
  });

  it('keeps a live page fallback when a screenshot thumbnail cannot load', () => {
    const mapView = map([ticket(43, 'Build a prototype', 'prototype', 'claimed')]);
    const html = prototypeBoardHtml('octo/wayfinder', mapView, [prototype(43, {
      files: ['prototypes/canvas/assets/protos/43-A.jpg'],
      openable: ['prototypes/canvas/variants/a.html'],
    })]);

    expect(html).toContain('class="decision-variant-page"');
    expect(html).toContain('name="wayfinder-preview"');
    expect(html).toContain('src="/proto/octo/wayfinder/prototype%2F43-design/prototypes/canvas/variants/a.html"');
  });

  it('keeps a visible fallback and Canvas link if no variant image or page exists', () => {
    const mapView = map([ticket(43, 'Build a prototype', 'prototype', 'claimed')]);
    const html = prototypeBoardHtml('octo/wayfinder', mapView, [prototype(43)]);

    expect(html).toContain('Preview image unavailable');
    expect(html).toContain('Canvas</a>');
  });

  it('uses the plain map-level empty state and gives loading and failure accessible recovery states', () => {
    const mapView = map([]);

    expect(prototypeBoardHtml('octo/wayfinder', mapView, [])).toContain(
      'When a prototype ticket on this map pushes its prototype branch, its canvas shows up here.',
    );
    expect(prototypeBoardLoadingHtml()).toContain('role="status" aria-live="polite"');
    expect(prototypeBoardLoadingHtml()).toContain('<div class="wf-board-page is-loading"');
    expect(prototypeBoardLoadingHtml().match(/wf-node wf-proto is-skeleton/g)).toHaveLength(2);
    expect(prototypeBoardLoadingHtml().match(/class="wf-var"/g)).toHaveLength(8);
    expect(prototypeBoardErrorHtml('GitHub is unavailable.')).toContain('data-prototype-retry');
    expect(prototypeBoardErrorHtml('<script>')).not.toContain('<script>');
  });
});


describe('recorded approval wording and phone support', () => {
  it.each([
    [196, 'R4', '"Perfect". Picked as the answer to #196.', ''],
    [125, 'A', 'I only like A.', '**Answer:** option A'],
  ])('preserves the confirmed choice on #%s', (number, id, feedback, verdict) => {
    const card = prototype(number as number, { verdict: verdict as string, canvasPages: [{ id: 'final', title: 'Final', round: 4, items: [
      { id: id as string, name: 'Final', src: 'a.html', disposition: 'keep', feedback: feedback as string, basedOn: [] },
      { id: 'A-stalled', name: 'Stalled', src: 'stalled.html', disposition: 'keep', feedback: 'Part of direction A', basedOn: [] },
    ] }] });
    const html = prototypeBoardHtml('octo/wayfinder', map([ticket(number as number, 'Example', 'prototype', 'done')]), [card]);
    expect(html).toContain(`Picked ${id}`);
    expect(html).not.toContain('Picked A + A-stalled');
  });

  it('rounds support thumbnails using their phone dimensions', () => {
    const card = prototype(225, { canvasPages: [{ id: 'final', title: 'Final', round: 2, items: ['D', 'D-push', 'D-settings'].map((id) => ({ id, name: id, src: `${id}.html`, width: 390, height: 844, disposition: 'keep', feedback: id === 'D' ? 'Final pick' : 'Supporting state', basedOn: [] })) }] });
    const browser = new Window();
    setTrustedHtml(browser.document.body as unknown as HTMLElement, prototypeBoardHtml('octo/wayfinder', map([ticket(225, 'Phone', 'prototype', 'done')]), [card]));
    expect(browser.document.querySelectorAll('[data-proto-support] .chosen-phone')).toHaveLength(3);
  });

  it('explains that a closed undecided card has no recorded pick', () => {
    const html = prototypeBoardHtml('octo/wayfinder', map([ticket(10, 'Example', 'prototype', 'done')]), [prototype(10)]);
    expect(html).toContain('The board does not guess a pick');
  });
});


it('names the latest text round and counts only its own page in the undecided lead', () => {
  const card = prototype(366, { canvasPages: [
    { id: 'overview', title: 'Overview', round: null, items: [{ id: 'A', name: 'Overview', src: 'a.html', disposition: null, feedback: null, basedOn: [] }] },
    { id: 'r1', title: 'R1 \u00b7 Reply bar', round: null, items: [] },
    { id: 'r2', title: 'R2 \u00b7 Reply page', round: null, items: [{ id: 'B', name: 'Reply', src: 'b.html', disposition: null, feedback: null, basedOn: [] }] },
  ] });
  const html = prototypeBoardHtml('octo/wayfinder', map([ticket(366, 'Reply', 'prototype', 'claimed')]), [card]);
  expect(html).toContain('<p class="gist">R2 \u00b7 Reply page \u00b7 1 option, none chosen yet.</p>');
  const numbered = { ...card, canvasPages: card.canvasPages!.map((page, index) => ({ ...page, round: index + 1 })) };
  expect(prototypeBoardHtml('octo/wayfinder', map([ticket(366, 'Reply', 'prototype', 'claimed')]), [numbered])).toContain('<p class="gist">Round 3 \u00b7 1 option, none chosen yet.</p>');
});


it.each([null, 'Final'])('uses the later approved page after a numbered round when its round is %s', (round) => {
  const card = prototype(10, { canvasPages: [
    { id: 'old', title: 'Old', round: 5, items: [{ id: 'A', name: 'Old', src: 'a.html', disposition: 'keep', feedback: 'Final pick', basedOn: [] }] },
    { id: 'new', title: 'Final', round, items: [{ id: 'B', name: 'Final', src: 'b.html', disposition: 'keep', feedback: 'Final pick', basedOn: ['A'] }] },
  ] });
  const html = prototypeBoardHtml('octo/wayfinder', map([ticket(10, 'Example', 'prototype', 'done')]), [card]);
  expect(html).toContain('Picked B');
  expect(html).not.toContain('Picked A');
  expect(html).toContain('data-proto-hero-id="B"');
  const history = html.slice(html.indexOf('aria-label="Canvas rounds"'));
  expect(history.indexOf('>Round 5')).toBeLessThan(history.indexOf('>Final'));
});


it.each(['Final', 2])('preserves multiple choices and ambiguity within round %s in a mixed catalog', (round) => {
  const item = (id: string) => ({ id, name: id, src: `${id}.html`, disposition: 'keep', feedback: 'Final pick', basedOn: [] });
  const pages = [
    { id: 'a', title: 'First', round, items: [item('A')] },
    { id: 'b', title: 'Second', round, items: [item('B')] },
    { id: 'notes', title: 'Notes', round: null, items: [] },
  ];
  const mapView = map([ticket(10, 'Example', 'prototype', 'done')]);
  expect(prototypeBoardHtml('octo/wayfinder', mapView, [prototype(10, { canvasPages: pages })])).toContain('Picked A + B');
  const repeated = pages.map((page) => page.id === 'b' ? { ...page, items: [item('A')] } : page);
  const html = prototypeBoardHtml('octo/wayfinder', mapView, [prototype(10, { canvasPages: repeated })]);
  expect(html).not.toContain('Picked A');
  expect(html).not.toContain('data-proto-hero-id');
});


it('normalizes the newest-first mixed catalog returned for the five-round board', () => {
  const pages = [5, 4, 3, 2, 'Baseline'].map((round, index) => ({ id: `p${index}`, title: String(round), round, items: [{ id: `A${index}`, name: 'Option', src: 'a.html', disposition: 'keep', feedback: 'Final pick', basedOn: [] }] }));
  const mapView = map([ticket(10, 'Example', 'prototype', 'done')]);
  const html = prototypeBoardHtml('octo/wayfinder', mapView, [prototype(10, { canvasPages: pages })]);
  expect(html).toContain('Picked A0');
  const history = html.slice(html.indexOf('aria-label="Canvas rounds"'));
  expect(history.indexOf('>Baseline')).toBeLessThan(history.indexOf('>Round 2'));
  expect(history.indexOf('>Round 2')).toBeLessThan(history.indexOf('>Round 5'));
  const building = prototypeBoardHtml('octo/wayfinder', map([ticket(10, 'Example', 'prototype', 'claimed')]), [prototype(10, { canvasPages: pages })]);
  expect(building).toContain('Round 5 \u00b7 1 option, none chosen yet.');
});
