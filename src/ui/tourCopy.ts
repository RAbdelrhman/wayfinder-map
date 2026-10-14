import type { DemoStageId, DemoState } from './demo/demoJourney.js';
import type { DemoTicketState, DemoTicketType } from './demo/demoData.js';

/*
  Every line of product tour copy, as approved on #238's Wording sheet for the picked flow:
  Spotlight (A), the welcome dialog (E1), the Settings › Help row (S1), no Demo banner (F)
  and one button per action (G).
*/

export interface TourStepCopy {
  readonly title: string;
  readonly body: string;
  /** The Next button's label when it is not "Next". */
  readonly cta?: string;
  /** Shown while the step waits for the user to use the demo's own control. */
  readonly hint?: string;
  /** Shown while the step's scripted progress runs. */
  readonly wait?: string;
  /** Shown once the step is ready and the demo's own control moves on (G). */
  readonly readyHint?: string;
}

export const TOUR_STEPS: Readonly<Record<DemoStageId, TourStepCopy>> = {
  purpose: {
    title: 'Wayfinder turns a goal into a map of work',
    body: 'Describe what you want to build. Wayfinder plans it as a map of GitHub issues, shows what is ready to start, and hands ready tickets to a coding agent in T3 Code. This tour walks through it with a demo project.',
    cta: 'Show me',
  },
  goal: {
    title: 'Start with a goal',
    body: 'Every map starts with a goal in plain words. We wrote one for the demo project.',
    hint: 'Press Start map to continue.',
  },
  planning: {
    title: 'T3 Code plans it with you',
    body: 'In real use, T3 Code asks you a few questions about the goal, then drafts the map on GitHub. In the demo the answers are filled in for you.',
    wait: 'Planning the demo map…',
    readyHint: 'Press Open the map to continue.',
  },
  map: {
    title: 'This is your map',
    body: 'The map is one GitHub issue. Each card is a ticket, a sub-issue of the map. Lines show what a ticket needs first. Green tickets are next up and can start now.',
  },
  types: {
    title: 'Four kinds of ticket',
    body: 'Every ticket has one of four types. Grilling and prototype tickets wait for your decision; an agent can run research and task tickets on its own.',
  },
  blockers: {
    title: 'Blocked tickets wait their turn',
    body: '#6 needs #3 and #5 to close first, so it cannot start yet. When they close, it turns green on its own.',
    hint: 'Select #6 to see what it is waiting on.',
  },
  handoff: {
    title: 'Hand a ready ticket to an agent',
    body: '#5 is next up. Opening it in T3 Code starts an agent on its own branch, and you review the pull request when it is done.',
    hint: 'Select #5, then press Open in T3 Code.',
    wait: 'The demo agent is working…',
  },
};

export const TOUR_TYPES: Readonly<Record<DemoTicketType, { readonly label: string; readonly line: string }>> = {
  research: { label: 'research', line: 'Finds something out and reports back.' },
  grilling: { label: 'grilling', line: 'A decision you make with an agent asking the questions.' },
  prototype: { label: 'prototype', line: 'Options you review side by side, then pick.' },
  task: { label: 'task', line: 'A known job an agent can build on its own.' },
};

export const TOUR_STATES: Readonly<Record<DemoTicketState, string>> = { done: 'done', next: 'next up', blocked: 'blocked' };

/** Where the tour lives once the invitation is gone (S1). */
const WHERE = 'Settings, under Help';

export const TOUR_COPY = {
  demoPill: 'Demo',
  exit: 'Exit tour',
  next: 'Next',
  back: 'Back',
  finish: 'Finish',
  stepOf: (step: number, of: number): string => `Step ${String(step)} of ${String(of)}`,
  doneOf: (of: number): string => `${String(of)} of ${String(of)} done`,
  startMapNote: 'Demo: Start map plans a sample map. Nothing is created on GitHub.',
  openNote: 'Demo: nothing will run.',
  completion: {
    title: 'You’ve seen the whole journey',
    body: 'Goal, map, tickets, hand-off: that’s Wayfinder. Your real repositories were not touched.',
    primary: 'Start my first map',
    replay: `Take the tour again any time from ${WHERE}.`,
  },
  skipped: `No problem. Take the tour any time from ${WHERE}.`,
  exited: `Tour closed. Nothing was changed. Take it again any time from ${WHERE}.`,
  invite: {
    title: 'Welcome to Wayfinder',
    body: 'Wayfinder turns a goal into a map of GitHub issues and hands ready tickets to coding agents. See how in a two-minute tour with a demo project. Nothing touches GitHub.',
    accept: 'Take the tour',
    decline: 'Not now',
    later: `You can take it later from ${WHERE}.`,
  },
  settings: {
    category: 'Help',
    hint: 'Learn how Wayfinder works.',
    title: 'Product tour',
    label: 'Take the tour',
    rowHint: 'A two-minute walkthrough with a demo project. Nothing touches GitHub.',
  },
} as const;

/** What a screen reader hears when a step opens. */
export function stepAnnouncement(state: DemoState, stageId: DemoStageId, of: number): string {
  if (state.status === 'finished') return TOUR_COPY.completion.title;
  return `${TOUR_COPY.stepOf(state.stage + 1, of)}: ${TOUR_STEPS[stageId].title}`;
}
