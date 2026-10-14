/*
  The demo journey behind the product tour: goal, planning, map, ticket types, blockers
  and a hand-off, all over DEMO_MAP. Planning and the hand-off are scripted: a scheduler
  ticks them forward, and no action leaves this directory (see demoData.ts).

  reduceDemo is the whole journey as a pure function. createDemoJourney adds the ticking
  and listeners; the tour UI (#240) renders its state and dispatches the user's clicks.
*/

import { canHandOff, DEMO_MAP, demoTicket } from './demoData';

export type DemoView = 'home' | 'newmap' | 'planning' | 'map';
export type DemoStageId = 'purpose' | 'goal' | 'planning' | 'map' | 'types' | 'blockers' | 'handoff';

export interface DemoStage {
  readonly id: DemoStageId;
  readonly view: DemoView;
}

/** The seven tour steps of #238, in order, and the demo screen each one shows. */
export const DEMO_STAGES: readonly DemoStage[] = Object.freeze([
  { id: 'purpose', view: 'home' },
  { id: 'goal', view: 'newmap' },
  { id: 'planning', view: 'planning' },
  { id: 'map', view: 'map' },
  { id: 'types', view: 'map' },
  { id: 'blockers', view: 'map' },
  { id: 'handoff', view: 'map' },
] as const satisfies readonly DemoStage[]);

/** Planning shows each interview answer, then "Drafting tickets…", then the drafted map. */
export const PLAN_DONE = DEMO_MAP.interview.length + 2;
/** The hand-off shows one line per stage of DEMO_MAP.handOff. */
export const HAND_OFF_DONE = DEMO_MAP.handOff.length;
/** The ticket the blockers step asks the user to select. */
export const BLOCKED_EXAMPLE = 6;
/** The ticket the hand-off step asks the user to open. */
export const HAND_OFF_EXAMPLE = 5;

export const PLAN_TICK_MS = 900;
export const HAND_OFF_TICK_MS = 1100;

export interface DemoState {
  /** running until the last step is passed (finished) or the user leaves (exited). */
  readonly status: 'running' | 'finished' | 'exited';
  /** Index into DEMO_STAGES. */
  readonly stage: number;
  readonly view: DemoView;
  /** Planning progress, 0 to PLAN_DONE. */
  readonly plan: number;
  /** The selected ticket on the demo map, if any. */
  readonly selected: number | null;
  /** Hand-off progress for the selected ticket, 0 to HAND_OFF_DONE. */
  readonly handOff: number;
}

export type DemoAction =
  | { readonly type: 'next' }
  | { readonly type: 'back' }
  | { readonly type: 'startMap' }
  | { readonly type: 'select'; readonly ticket: number }
  | { readonly type: 'openInT3' }
  | { readonly type: 'exit' }
  | { readonly type: 'planTick' }
  | { readonly type: 'handOffTick' };

export function initialDemoState(): DemoState {
  return enterStage(0);
}

export function stageOf(state: DemoState): DemoStage {
  return DEMO_STAGES[state.stage] ?? DEMO_STAGES[0]!;
}

/** Whether Next may move on. Steps that ask for a real control wait for it. */
export function canAdvance(state: DemoState): boolean {
  if (state.status !== 'running') return false;
  switch (stageOf(state).id) {
    case 'goal': return false;
    case 'planning': return state.plan >= PLAN_DONE;
    case 'blockers': return state.selected === BLOCKED_EXAMPLE;
    case 'handoff': return state.handOff >= HAND_OFF_DONE;
    default: return true;
  }
}

function enterStage(index: number): DemoState {
  const stage = DEMO_STAGES[index] ?? DEMO_STAGES[0]!;
  // Planning starts over each time it is entered; the map steps show the drafted map.
  return { status: 'running', stage: index, view: stage.view, plan: stage.view === 'map' ? PLAN_DONE : 0, selected: null, handOff: 0 };
}

export function reduceDemo(state: DemoState, action: DemoAction): DemoState {
  if (state.status === 'exited') return state;
  if (state.status === 'finished') {
    // Back from the completion card returns to the finished hand-off.
    if (action.type === 'back') return { ...enterStage(DEMO_STAGES.length - 1), selected: HAND_OFF_EXAMPLE, handOff: HAND_OFF_DONE };
    if (action.type === 'exit') return { ...state, status: 'exited' };
    return state;
  }
  const stage = stageOf(state);
  switch (action.type) {
    case 'next':
      if (!canAdvance(state)) return state;
      if (state.stage + 1 >= DEMO_STAGES.length) return { ...state, status: 'finished' };
      return enterStage(state.stage + 1);
    case 'back':
      return state.stage > 0 ? enterStage(state.stage - 1) : state;
    case 'startMap':
      return stage.id === 'goal' ? enterStage(state.stage + 1) : state;
    case 'select': {
      if (state.view !== 'map' || !demoTicket(action.ticket)) return state;
      if (state.selected === action.ticket) return state;
      return { ...state, selected: action.ticket, handOff: 0 };
    }
    case 'openInT3':
      // Only the hand-off step hands a ticket off; earlier map steps leave it alone.
      if (stage.id !== 'handoff' || state.handOff > 0 || !canHandOff(demoTicket(state.selected ?? -1))) return state;
      return { ...state, handOff: 1 };
    case 'exit':
      return { ...state, status: 'exited' };
    case 'planTick':
      return stage.id === 'planning' && state.plan < PLAN_DONE ? { ...state, plan: state.plan + 1 } : state;
    case 'handOffTick':
      return stage.id === 'handoff' && state.handOff > 0 && state.handOff < HAND_OFF_DONE ? { ...state, handOff: state.handOff + 1 } : state;
  }
}

/** Runs a callback every ms until the returned function cancels it. */
export interface DemoScheduler {
  every(ms: number, tick: () => void): () => void;
}

const intervalScheduler: DemoScheduler = {
  every(ms, tick) {
    const id = setInterval(tick, ms);
    return () => clearInterval(id);
  },
};

export interface DemoJourney {
  state(): DemoState;
  dispatch(action: DemoAction): void;
  /** Calls the listener after every change; returns the unsubscribe. */
  subscribe(listener: (state: DemoState) => void): () => void;
  /** Starts the demo over from the first step, discarding everything the user did. */
  restart(): void;
  dispose(): void;
}

type Ticking = 'plan' | 'handOff' | null;

function wantedTicking(state: DemoState): Ticking {
  if (state.status !== 'running') return null;
  if (stageOf(state).id === 'planning' && state.plan < PLAN_DONE) return 'plan';
  if (stageOf(state).id === 'handoff' && state.handOff > 0 && state.handOff < HAND_OFF_DONE) return 'handOff';
  return null;
}

export function createDemoJourney(options: { scheduler?: DemoScheduler } = {}): DemoJourney {
  const scheduler = options.scheduler ?? intervalScheduler;
  const listeners = new Set<(state: DemoState) => void>();
  let state = initialDemoState();
  let ticking: Ticking = null;
  let cancel: (() => void) | null = null;
  let disposed = false;

  function stopTicking(): void {
    cancel?.();
    cancel = null;
    ticking = null;
  }

  function syncTicking(): void {
    const wanted = wantedTicking(state);
    if (wanted === ticking) return;
    stopTicking();
    if (wanted === 'plan') cancel = scheduler.every(PLAN_TICK_MS, () => apply({ type: 'planTick' }));
    if (wanted === 'handOff') cancel = scheduler.every(HAND_OFF_TICK_MS, () => apply({ type: 'handOffTick' }));
    ticking = wanted;
  }

  function set(next: DemoState, restartTicking: boolean): void {
    if (next === state) return;
    state = next;
    // A user action starts any scripted progress on a fresh beat; ticks keep the beat.
    if (restartTicking) stopTicking();
    syncTicking();
    for (const listener of [...listeners]) listener(state);
  }

  function apply(action: DemoAction): void {
    if (disposed) return;
    const tick = action.type === 'planTick' || action.type === 'handOffTick';
    set(reduceDemo(state, action), !tick);
  }

  syncTicking();

  return {
    state: () => state,
    dispatch: apply,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    restart() {
      if (disposed) return;
      set(initialDemoState(), true);
    },
    dispose() {
      disposed = true;
      stopTicking();
      listeners.clear();
    },
  };
}
