import { describe, expect, it } from 'vitest';

import type { Prototype, Ticket, TicketState, TicketType, WayfinderMap } from '../types.js';
import {
  pickedVariantIds,
  prototypeBoardErrorHtml,
  prototypeBoardHtml,
  prototypeBoardLoadingHtml,
  prototypeCardState,
  prototypeVariants,
  sortPrototypeCards,
} from './prototypeBoard.js';

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
  };
}

function map(tickets: Ticket[]): WayfinderMap {
  return {
    number: 35,
    title: 'Redesign Home and Start a new map',
    url: 'https://github.com/octo/wayfinder/issues/35',
    body: '',
    open: true,
    sections: { destination: '', notes: '', decisions: '', fog: '', outOfScope: '' },
    tickets,
    outside: [],
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

describe('prototype decision state', () => {
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
