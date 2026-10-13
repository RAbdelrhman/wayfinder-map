/*
  The demo project the product tour walks through (#238's approved wording sheet).
  Everything here is fixed, so every run of the demo shows the same map. Nothing in
  src/ui/demo talks to GitHub, T3 Code or stored preferences: eslint.config.mjs only
  lets these files import each other and bans the network and storage globals.
*/

export type DemoTicketType = 'research' | 'grilling' | 'prototype' | 'task';
export type DemoTicketState = 'done' | 'next' | 'blocked';

export interface DemoTicket {
  readonly n: number;
  readonly type: DemoTicketType;
  readonly state: DemoTicketState;
  /** Grid position on the demo map: column left to right, row top to bottom. */
  readonly col: number;
  readonly row: number;
  readonly title: string;
  readonly needs: readonly number[];
  readonly question: string;
  readonly doneWhen: readonly string[];
}

export interface DemoInterviewLine {
  readonly q: string;
  readonly a: string;
}

export interface DemoMap {
  readonly repo: string;
  readonly mapNumber: number;
  readonly mapTitle: string;
  readonly goal: string;
  readonly destination: string;
  readonly interview: readonly DemoInterviewLine[];
  readonly tickets: readonly DemoTicket[];
  /** The simulated hand-off, one line per stage. */
  readonly handOff: readonly string[];
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export const DEMO_MAP: DemoMap = deepFreeze({
  repo: 'demo/recipes',
  mapNumber: 1,
  mapTitle: 'Save recipes for offline cooking',
  goal: 'Let people save recipes so they can cook without a connection. Saved recipes should stay in sync across their devices.',
  destination: 'People can save any recipe, open it with no connection, and see the same saved recipes on every device.',
  interview: [
    { q: 'Should saved recipes sync between devices, or stay on one device?', a: 'Sync between devices.' },
    { q: 'What should happen if two devices edit the same recipe offline?', a: 'Not sure yet. Let me decide later.' },
  ],
  tickets: [
    { n: 2, type: 'research', state: 'done', col: 0, row: 0, title: 'Find storage that works offline in every browser', needs: [], question: 'Which browser storage keeps recipes available offline everywhere we ship?', doneWhen: ['Compare the options with their limits', 'Recommend one'] },
    { n: 3, type: 'grilling', state: 'next', col: 0, row: 1, title: 'Decide what happens when two devices edit one recipe', needs: [], question: 'When two devices change the same recipe offline, which change wins?', doneWhen: ['Record your decision on the map'] },
    { n: 4, type: 'prototype', state: 'next', col: 0, row: 2, title: 'Prototype the “Saved for offline” badge', needs: [], question: 'How should a recipe show that it is saved for offline use?', doneWhen: ['Show two or three options', 'Record the one you pick'] },
    { n: 5, type: 'task', state: 'next', col: 1, row: 0, title: 'Store saved recipes in the browser', needs: [2], question: 'Save recipes with the storage chosen in #2 so they open with no connection.', doneWhen: ['Saved recipes open offline', 'Tests cover saving and removing'] },
    { n: 6, type: 'task', state: 'blocked', col: 2, row: 1, title: 'Sync offline edits when the connection returns', needs: [3, 5], question: 'Send offline changes once the device is back online, using the rule decided in #3.', doneWhen: ['Edits made offline reach every device', 'Conflicts follow the #3 decision'] },
    { n: 7, type: 'task', state: 'blocked', col: 1, row: 2, title: 'Show the badge on saved recipes', needs: [4], question: 'Add the badge picked in #4 to every saved recipe.', doneWhen: ['The badge appears on saved recipes'] },
  ],
  handOff: [
    'Thread started in T3 Code',
    'Working on branch wayfinder/5-store-saved-recipes',
    'Pull request ready for your review',
  ],
});

export function demoTicket(n: number): DemoTicket | undefined {
  return DEMO_MAP.tickets.find((ticket) => ticket.n === n);
}

/** Only a next-up task runs on its own, so it is the only kind the demo hands off. */
export function canHandOff(ticket: DemoTicket | undefined): boolean {
  return ticket?.state === 'next' && ticket.type === 'task';
}

/** The needs a ticket is still waiting on. */
export function openNeeds(ticket: DemoTicket): number[] {
  return ticket.needs.filter((n) => demoTicket(n)?.state !== 'done');
}
