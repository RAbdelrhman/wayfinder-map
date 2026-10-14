import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEMO_MAP, demoTicket, openNeeds } from './demoData';
import {
  BLOCKED_EXAMPLE,
  canAdvance,
  createDemoJourney,
  DEMO_STAGES,
  HAND_OFF_DONE,
  HAND_OFF_EXAMPLE,
  HAND_OFF_TICK_MS,
  initialDemoState,
  PLAN_DONE,
  PLAN_TICK_MS,
  reduceDemo,
  stageOf,
  type DemoAction,
  type DemoJourney,
  type DemoScheduler,
} from './demoJourney';

/** A scheduler the test advances by hand, so every run ticks the same way. */
function manualScheduler() {
  const timers = new Set<{ ms: number; tick: () => void }>();
  const scheduler: DemoScheduler = {
    every(ms, tick) {
      const timer = { ms, tick };
      timers.add(timer);
      return () => { timers.delete(timer); };
    },
  };
  return {
    scheduler,
    active: () => [...timers].map((timer) => timer.ms),
    tick: (times = 1) => { for (let i = 0; i < times; i += 1) for (const timer of [...timers]) timer.tick(); },
  };
}

const stageId = (journey: DemoJourney) => stageOf(journey.state()).id;

/** Walks the whole journey the way a user does, using only the controls each step asks for. */
function walk(journey: DemoJourney, tick: (times?: number) => void) {
  journey.dispatch({ type: 'next' }); // Purpose → Goal
  journey.dispatch({ type: 'startMap' }); // Goal → Planning
  tick(PLAN_DONE);
  journey.dispatch({ type: 'next' }); // Open the map
  journey.dispatch({ type: 'next' }); // Map → Ticket types
  journey.dispatch({ type: 'next' }); // Ticket types → Blockers
  journey.dispatch({ type: 'select', ticket: BLOCKED_EXAMPLE });
  journey.dispatch({ type: 'next' }); // Blockers → Hand-off
  journey.dispatch({ type: 'select', ticket: HAND_OFF_EXAMPLE });
  journey.dispatch({ type: 'openInT3' });
  tick(HAND_OFF_DONE - 1);
  journey.dispatch({ type: 'next' }); // Finish
}

describe('the demo data', () => {
  it('is the same fixed map every time and cannot be changed', () => {
    expect(DEMO_MAP.repo).toBe('demo/recipes');
    expect(DEMO_MAP.tickets.map((t) => `${t.n}:${t.type}:${t.state}`)).toEqual([
      '2:research:done', '3:grilling:next', '4:prototype:next', '5:task:next', '6:task:blocked', '7:task:blocked',
    ]);
    expect(Object.isFrozen(DEMO_MAP)).toBe(true);
    expect(Object.isFrozen(DEMO_MAP.tickets[0])).toBe(true);
    expect(Object.isFrozen(DEMO_MAP.tickets[0]?.needs)).toBe(true);
    expect(() => { (DEMO_MAP.tickets as DemoTicketList).push(DEMO_MAP.tickets[0]!); }).toThrow(TypeError);
  });

  it('keeps every need on the map and the blocked example waiting on open tickets', () => {
    for (const ticket of DEMO_MAP.tickets) for (const n of ticket.needs) expect(demoTicket(n)).toBeDefined();
    expect(openNeeds(demoTicket(BLOCKED_EXAMPLE)!)).toEqual([3, 5]);
    expect(demoTicket(HAND_OFF_EXAMPLE)).toMatchObject({ type: 'task', state: 'next' });
  });
});

type DemoTicketList = (typeof DEMO_MAP.tickets)[number][];

describe('the demo journey', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('starts on Purpose with nothing planned, selected or handed off', () => {
    expect(initialDemoState()).toEqual({ status: 'running', stage: 0, view: 'home', plan: 0, selected: null, handOff: 0 });
    expect(DEMO_STAGES.map((stage) => stage.id)).toEqual(['purpose', 'goal', 'planning', 'map', 'types', 'blockers', 'handoff']);
  });

  it('walks goal, planning, map, ticket types, blockers and hand-off to the finish', () => {
    const clock = manualScheduler();
    const journey = createDemoJourney({ scheduler: clock.scheduler });
    const seen: string[] = [];
    journey.subscribe((state) => seen.push(`${stageOf(state).id}/${state.view}`));

    journey.dispatch({ type: 'next' });
    expect(stageId(journey)).toBe('goal');
    expect(journey.state().view).toBe('newmap');

    // Next waits for the real Start map.
    journey.dispatch({ type: 'next' });
    expect(stageId(journey)).toBe('goal');
    journey.dispatch({ type: 'startMap' });
    expect(stageId(journey)).toBe('planning');
    expect(clock.active()).toEqual([PLAN_TICK_MS]);

    // Planning is scripted: one tick per answer, then drafting, then drafted.
    for (let plan = 1; plan <= PLAN_DONE; plan += 1) {
      expect(canAdvance(journey.state())).toBe(false);
      journey.dispatch({ type: 'next' });
      expect(stageId(journey)).toBe('planning');
      clock.tick();
      expect(journey.state().plan).toBe(plan);
    }
    expect(clock.active()).toEqual([]);
    journey.dispatch({ type: 'next' });
    expect(journey.state()).toMatchObject({ view: 'map', plan: PLAN_DONE });

    journey.dispatch({ type: 'next' });
    expect(stageId(journey)).toBe('types');
    journey.dispatch({ type: 'next' });
    expect(stageId(journey)).toBe('blockers');

    // Blockers waits until the blocked example is selected.
    journey.dispatch({ type: 'next' });
    journey.dispatch({ type: 'select', ticket: 3 });
    journey.dispatch({ type: 'next' });
    expect(stageId(journey)).toBe('blockers');
    journey.dispatch({ type: 'select', ticket: BLOCKED_EXAMPLE });
    journey.dispatch({ type: 'next' });
    expect(stageId(journey)).toBe('handoff');
    expect(journey.state().selected).toBeNull();

    // A blocked ticket and a ticket that waits for a decision cannot be handed off.
    for (const n of [BLOCKED_EXAMPLE, 3, 2]) {
      journey.dispatch({ type: 'select', ticket: n });
      journey.dispatch({ type: 'openInT3' });
      expect(journey.state().handOff).toBe(0);
    }
    journey.dispatch({ type: 'select', ticket: HAND_OFF_EXAMPLE });
    journey.dispatch({ type: 'openInT3' });
    expect(journey.state().handOff).toBe(1);
    expect(clock.active()).toEqual([HAND_OFF_TICK_MS]);
    journey.dispatch({ type: 'next' });
    expect(stageId(journey)).toBe('handoff');
    // One hand-off line per tick, and Next waits for the last one.
    for (let handOff = 2; handOff <= HAND_OFF_DONE; handOff += 1) {
      expect(canAdvance(journey.state())).toBe(false);
      clock.tick();
      expect(journey.state().handOff).toBe(handOff);
    }
    clock.tick(5);
    expect(journey.state().handOff).toBe(HAND_OFF_DONE);
    expect(clock.active()).toEqual([]);

    journey.dispatch({ type: 'next' });
    expect(journey.state().status).toBe('finished');
    expect(seen.at(-1)).toBe('handoff/map');
  });

  it('goes back from the finish to the completed hand-off, and back through the steps', () => {
    const clock = manualScheduler();
    const journey = createDemoJourney({ scheduler: clock.scheduler });
    walk(journey, clock.tick);
    expect(journey.state().status).toBe('finished');

    journey.dispatch({ type: 'back' });
    expect(journey.state()).toMatchObject({ status: 'running', selected: HAND_OFF_EXAMPLE, handOff: HAND_OFF_DONE });
    expect(stageId(journey)).toBe('handoff');

    for (const id of ['blockers', 'types', 'map', 'planning'] as const) {
      journey.dispatch({ type: 'back' });
      expect(stageId(journey)).toBe(id);
    }
    // Planning plays again from the start when revisited.
    expect(journey.state().plan).toBe(0);
    expect(clock.active()).toEqual([PLAN_TICK_MS]);
    journey.dispatch({ type: 'back' });
    expect(stageId(journey)).toBe('goal');
    expect(clock.active()).toEqual([]);
  });

  it('exits from any step, stops its scripted progress and ignores later actions', () => {
    const clock = manualScheduler();
    const journey = createDemoJourney({ scheduler: clock.scheduler });
    journey.dispatch({ type: 'next' });
    journey.dispatch({ type: 'startMap' });
    clock.tick();
    journey.dispatch({ type: 'exit' });
    expect(journey.state()).toMatchObject({ status: 'exited', plan: 1 });
    expect(clock.active()).toEqual([]);
    const exited = journey.state();
    for (const action of ['next', 'back', 'startMap', 'openInT3', 'planTick'] as const) journey.dispatch({ type: action });
    expect(journey.state()).toBe(exited);
  });

  it('starts over from the first step on restart, after finishing, exiting or mid-way', () => {
    const clock = manualScheduler();
    const journey = createDemoJourney({ scheduler: clock.scheduler });

    walk(journey, clock.tick);
    journey.restart();
    expect(journey.state()).toEqual(initialDemoState());

    journey.dispatch({ type: 'exit' });
    journey.restart();
    expect(journey.state()).toEqual(initialDemoState());

    // Mid hand-off: the restart cancels its ticking, so nothing leaks into the new run.
    journey.dispatch({ type: 'next' });
    journey.dispatch({ type: 'startMap' });
    clock.tick(PLAN_DONE);
    for (let i = 0; i < 4; i += 1) journey.dispatch({ type: 'next' });
    journey.dispatch({ type: 'select', ticket: BLOCKED_EXAMPLE });
    journey.dispatch({ type: 'next' });
    journey.dispatch({ type: 'select', ticket: HAND_OFF_EXAMPLE });
    journey.dispatch({ type: 'openInT3' });
    expect(clock.active()).toEqual([HAND_OFF_TICK_MS]);
    journey.restart();
    expect(clock.active()).toEqual([]);
    clock.tick(10);
    expect(journey.state()).toEqual(initialDemoState());

    // A second run is identical to the first.
    const first: unknown[] = [];
    const second: unknown[] = [];
    const record = (into: unknown[]) => journey.subscribe((state) => into.push(state));
    let stop = record(first);
    walk(journey, clock.tick);
    stop();
    journey.restart();
    stop = record(second);
    walk(journey, clock.tick);
    stop();
    expect(second).toEqual(first);
  });

  it('runs planning and the hand-off on real timers by default', () => {
    vi.useFakeTimers();
    const journey = createDemoJourney();
    journey.dispatch({ type: 'next' });
    journey.dispatch({ type: 'startMap' });
    vi.advanceTimersByTime(PLAN_TICK_MS * PLAN_DONE);
    expect(journey.state().plan).toBe(PLAN_DONE);
    expect(vi.getTimerCount()).toBe(0);
    for (let i = 0; i < 3; i += 1) journey.dispatch({ type: 'next' });
    journey.dispatch({ type: 'select', ticket: BLOCKED_EXAMPLE });
    journey.dispatch({ type: 'next' });
    journey.dispatch({ type: 'select', ticket: HAND_OFF_EXAMPLE });
    journey.dispatch({ type: 'openInT3' });
    vi.advanceTimersByTime(HAND_OFF_TICK_MS * HAND_OFF_DONE);
    expect(journey.state().handOff).toBe(HAND_OFF_DONE);
    expect(vi.getTimerCount()).toBe(0);
    journey.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops ticking and notifying once disposed', () => {
    const clock = manualScheduler();
    const journey = createDemoJourney({ scheduler: clock.scheduler });
    const listener = vi.fn();
    journey.subscribe(listener);
    journey.dispatch({ type: 'next' });
    journey.dispatch({ type: 'startMap' });
    listener.mockClear();
    journey.dispose();
    expect(clock.active()).toEqual([]);
    journey.dispatch({ type: 'back' });
    journey.restart();
    expect(listener).not.toHaveBeenCalled();
  });

  it('hands off only on the hand-off step, not on the earlier map steps', () => {
    const clock = manualScheduler();
    const journey = createDemoJourney({ scheduler: clock.scheduler });
    journey.dispatch({ type: 'next' });
    journey.dispatch({ type: 'startMap' });
    clock.tick(PLAN_DONE);
    journey.dispatch({ type: 'next' });
    for (const id of ['map', 'types', 'blockers'] as const) {
      expect(stageId(journey)).toBe(id);
      journey.dispatch({ type: 'select', ticket: HAND_OFF_EXAMPLE });
      journey.dispatch({ type: 'openInT3' });
      journey.dispatch({ type: 'handOffTick' });
      expect(journey.state().handOff).toBe(0);
      expect(clock.active()).toEqual([]);
      if (id === 'blockers') journey.dispatch({ type: 'select', ticket: BLOCKED_EXAMPLE });
      journey.dispatch({ type: 'next' });
    }
    expect(stageId(journey)).toBe('handoff');
  });

  it('ignores ticks and selections outside the screens they belong to', () => {
    const home = initialDemoState();
    const actions: DemoAction[] = [{ type: 'planTick' }, { type: 'handOffTick' }, { type: 'select', ticket: 5 }, { type: 'openInT3' }, { type: 'startMap' }, { type: 'back' }];
    for (const action of actions) expect(reduceDemo(home, action)).toBe(home);
    const onMap = reduceDemo(reduceDemo(reduceDemo(home, { type: 'next' }), { type: 'startMap' }), { type: 'select', ticket: 99 });
    expect(onMap.selected).toBeNull();
  });
});
