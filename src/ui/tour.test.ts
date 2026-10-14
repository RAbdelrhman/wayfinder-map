import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import type { DemoScheduler } from './demo/demoJourney.js';
import { inertExcept, offerTourOnFirstLaunch, mountTour, tabStops } from './tour.js';
import type { TourController } from './tour.js';
import { TOUR_COPY } from './tourCopy.js';
import { setTrustedHtml } from './trustedHtml.js';
import { rememberTour, shouldInviteToTour, TOUR_KEY, tourOutcome } from './tourPreference.js';

let browser: Window;
let doc: Document;
let app: HTMLElement;
let storage: Storage;
let toast: Mock<(message: string, ms?: number) => void>;
let navigate: Mock<(url: string) => void>;
let tick: (() => void) | null;

/** Runs the scripted planning or hand-off to its end, as the real interval would. */
function runScript(): void {
  for (let i = 0; i < 20 && tick !== null; i += 1) tick();
}

const scheduler: DemoScheduler = {
  every(_ms, fn) {
    tick = fn;
    return () => { if (tick === fn) tick = null; };
  },
};

beforeEach(() => {
  browser = new Window({ url: 'http://localhost/', width: 1280, height: 800 });
  for (const name of ['Node', 'Element', 'HTMLElement', 'HTMLButtonElement'] as const) vi.stubGlobal(name, browser[name]);
  doc = browser.document as unknown as Document;
  app = doc.createElement('div');
  app.id = 'app';
  const settings = doc.createElement('a');
  settings.id = 'settings';
  settings.href = '/settings';
  app.append(settings);
  doc.body.append(app);
  storage = browser.localStorage as unknown as Storage;
  toast = vi.fn<(message: string, ms?: number) => void>();
  navigate = vi.fn<(url: string) => void>();
  tick = null;
});

afterEach(async () => {
  await browser.happyDOM.abort();
  vi.unstubAllGlobals();
});

function mount(): TourController {
  return mountTour({ toast, app, navigate, scheduler, storage, doc });
}

const layer = (): HTMLElement => doc.getElementById('tour-layer')!;
const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => layer().querySelector<T>(selector);
const count = (): string => q('.tour-count')?.textContent ?? '';
const title = (): string => q('#tour-title')?.textContent ?? '';
const click = (selector: string): void => {
  const element = q(selector);
  if (element === null) throw new Error(`No ${selector} in: ${count()} ${title()}`);
  // As a keyboard user does: focus the control, then press it.
  element.focus();
  element.click();
};
/** Presses Tab (or Shift+Tab) where focus is, and returns what focus moved to. */
const tab = (shift = false): string => {
  const target = doc.activeElement ?? doc.body;
  target.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true }) as unknown as Event);
  return name(doc.activeElement);
};
/** A short name for a control: its tour action, ticket, or id. */
const name = (element: Element | null): string => {
  if (!(element instanceof HTMLElement)) return '';
  return element.dataset['tourAct'] ?? (element.dataset['ticket'] === undefined ? element.id : `#${element.dataset['ticket']}`);
};
/** The demo controls behind the card that can still be pressed or reached with Tab. */
const liveDemoControls = (): string[] => {
  const shell = q('.tour-shell');
  if (shell === null) return [];
  return [...shell.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]')]
    .filter((element) => element.closest('[inert]') === null && element.getAttribute('tabindex') !== '-1' && !(element instanceof HTMLButtonElement && element.disabled))
    .map(name);
};
const escape = (): void => { doc.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }) as unknown as Event); };

/** Walks the tour from step 1 to the given step (1 to 7) the way a user does, or to 8 for the completion card. */
function walkTo(step: number): void {
  const moves: Array<() => void> = [
    () => click('[data-tour-act="next"]'), // 1 → 2: Show me
    () => click('#demo-start'), // 2 → 3: Start map
    () => { runScript(); click('#demo-open-map'); }, // 3 → 4: Open the map
    () => click('[data-tour-act="next"]'), // 4 → 5
    () => click('[data-tour-act="next"]'), // 5 → 6
    () => { click('[data-ticket="6"]'); click('[data-tour-act="next"]'); }, // 6 → 7
    () => { click('[data-ticket="5"]'); click('#demo-open'); runScript(); click('[data-tour-act="next"]'); }, // 7 → done
  ];
  for (const move of moves.slice(0, step - 1)) move();
}

describe('the tour preference', () => {
  it('invites until the invitation is answered, and keeps a completion over a later dismissal', () => {
    expect(shouldInviteToTour(storage)).toBe(true);
    rememberTour('dismissed', storage);
    expect(shouldInviteToTour(storage)).toBe(false);
    rememberTour('completed', storage);
    rememberTour('dismissed', storage);
    expect(tourOutcome(storage)).toBe('completed');
  });

  it('ignores unknown values and storage that throws', () => {
    storage.setItem(TOUR_KEY, 'maybe');
    expect(shouldInviteToTour(storage)).toBe(true);
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(shouldInviteToTour(broken)).toBe(true);
    expect(() => { rememberTour('completed', broken); }).not.toThrow();
  });
});

describe('the first-launch invitation', () => {
  it('offers the tour in a welcome dialog with Take the tour and Not now', () => {
    offerTourOnFirstLaunch(mount(), storage);
    expect(layer().hidden).toBe(false);
    expect(title()).toBe(TOUR_COPY.invite.title);
    expect(q('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
    expect([...layer().querySelectorAll('button')].map((button) => button.textContent?.trim())).toEqual([TOUR_COPY.invite.decline, TOUR_COPY.invite.accept]);
    expect(layer().textContent).toContain(TOUR_COPY.invite.later);
    expect(doc.activeElement?.id).toBe('tour-title');
  });

  it('Not now closes it, says where the tour lives, and it does not come back', () => {
    offerTourOnFirstLaunch(mount(), storage);
    click('[data-tour-act="not-now"]');
    expect(layer().hidden).toBe(true);
    expect(toast).toHaveBeenCalledWith(TOUR_COPY.skipped, 9000);
    expect(tourOutcome(storage)).toBe('dismissed');
    expect(doc.activeElement?.id).toBe('settings');
    expect(doc.getElementById('settings')?.classList.contains('tour-pulse')).toBe(true);

    offerTourOnFirstLaunch(mount(), storage);
    expect([...doc.querySelectorAll('.tour-layer')].every((element) => (element as HTMLElement).hidden)).toBe(true);
  });

  it('makes the app behind the dialog inert, and leaves inert that another feature set', () => {
    offerTourOnFirstLaunch(mount(), storage);
    expect(app.hasAttribute('inert')).toBe(true);
    click('[data-tour-act="not-now"]');
    expect(app.hasAttribute('inert')).toBe(false);

    app.setAttribute('inert', '');
    const tour = mount();
    tour.start();
    escape();
    expect(app.hasAttribute('inert')).toBe(true);
  });

  it('Escape answers Not now', () => {
    offerTourOnFirstLaunch(mount(), storage);
    escape();
    expect(layer().hidden).toBe(true);
    expect(toast).toHaveBeenCalledWith(TOUR_COPY.skipped, 9000);
    expect(tourOutcome(storage)).toBe('dismissed');
  });

  it('Take the tour starts at step 1 and the invitation does not return', () => {
    offerTourOnFirstLaunch(mount(), storage);
    click('[data-tour-act="take-tour"]');
    expect(count()).toBe('Step 1 of 7');
    expect(shouldInviteToTour(storage)).toBe(false);
  });
});

describe('the guided tour', () => {
  it('completes all seven steps, each with readable progress and an Exit tour button', () => {
    const tour = mount();
    tour.start();
    expect(app.hasAttribute('inert')).toBe(true);
    const seen: string[] = [];
    const note = (): void => {
      seen.push(`${count()} · ${title()}`);
      expect(q('[data-tour-act="exit"]')?.getAttribute('aria-label')).toBe(TOUR_COPY.exit);
      expect(q('.demo-pill')?.textContent).toBe(TOUR_COPY.demoPill);
      expect(doc.activeElement?.id).toBe('tour-title');
      expect(doc.getElementById('tour-live')?.textContent).toBe(`${count()}: ${title()}`);
    };

    note();
    expect(q('[data-tour-act="next"]')?.textContent).toBe('Show me');
    expect(q('[data-tour-act="back"]')).toBeNull();
    click('[data-tour-act="next"]');

    note();
    expect(q('[data-tour-act="next"]')).toBeNull();
    expect(q('.tour-hint')?.textContent).toBe('Press Start map to continue.');
    click('#demo-start');

    note();
    expect(q('.tour-hint.is-wait')?.textContent).toBe('Planning the demo map…');
    expect(q('#demo-open-map')).toBeNull();
    runScript();
    // G: Open the map is the one way forward, so the card hints instead of offering Next.
    expect(q('[data-tour-act="next"]')).toBeNull();
    expect(q('.tour-hint')?.textContent).toBe('Press Open the map to continue.');
    click('#demo-open-map');

    note();
    click('[data-tour-act="next"]');

    note();
    expect(layer().querySelectorAll('.demo-type-legend li')).toHaveLength(4);
    click('[data-tour-act="next"]');

    note();
    expect(q('[data-tour-act="next"]')).toBeNull();
    click('[data-ticket="6"]');
    expect(doc.activeElement?.getAttribute('data-ticket')).toBe('6');
    expect(q('.demo-waiting')?.textContent).toContain('Waiting on #3 and #5');
    click('[data-tour-act="next"]');

    note();
    click('[data-ticket="5"]');
    click('#demo-open');
    expect(doc.activeElement?.id).toBe('demo-handoff');
    expect(q('.tour-hint.is-wait')?.textContent).toBe('The demo agent is working…');
    runScript();
    expect(q('#demo-handoff')?.textContent).toContain('Pull request ready for your review');
    expect(q('[data-tour-act="next"]')?.textContent).toBe('Finish');
    click('[data-tour-act="next"]');

    expect(seen).toEqual([
      'Step 1 of 7 · Wayfinder turns a goal into a map of work',
      'Step 2 of 7 · Start with a goal',
      'Step 3 of 7 · T3 Code plans it with you',
      'Step 4 of 7 · This is your map',
      'Step 5 of 7 · Four kinds of ticket',
      'Step 6 of 7 · Blocked tickets wait their turn',
      'Step 7 of 7 · Hand a ready ticket to an agent',
    ]);
    expect(count()).toBe('7 of 7 done');
    expect(title()).toBe(TOUR_COPY.completion.title);
    expect(tourOutcome(storage)).toBe('completed');
    // The completion card's × and Start my first map are its only controls (G).
    expect([...layer().querySelectorAll('.tour-pop button')].map((button) => button.getAttribute('data-tour-act'))).toEqual(['exit', 'first-map']);
    expect(layer().textContent).toContain(TOUR_COPY.completion.replay);

    click('[data-tour-act="first-map"]');
    expect(navigate).toHaveBeenCalledWith('/new-map');
    expect(layer().hidden).toBe(true);
    expect(app.hasAttribute('inert')).toBe(false);
  });

  it('Back returns to the previous step', () => {
    mount().start();
    walkTo(5);
    click('[data-tour-act="back"]');
    expect(count()).toBe('Step 4 of 7');
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('exits from step %i with the × and with Escape, changing nothing', (step) => {
    for (const leave of [() => click('[data-tour-act="exit"]'), escape]) {
      toast.mockClear();
      const tour = mount();
      tour.start();
      walkTo(step);
      expect(count()).toBe(step === 8 ? '7 of 7 done' : `Step ${String(step)} of 7`);
      leave();
      expect(tour.isOpen()).toBe(false);
      expect(layer().hidden).toBe(true);
      expect(app.hasAttribute('inert')).toBe(false);
      expect(toast).toHaveBeenCalledWith(TOUR_COPY.exited, 9000);
      expect(tick).toBeNull();
      layer().remove();
    }
  });

  it('replays from the first step after it was completed', () => {
    const tour = mount();
    tour.start();
    walkTo(8);
    click('[data-tour-act="exit"]');
    tour.start();
    expect(count()).toBe('Step 1 of 7');
    expect(q('.demo-app')?.classList.contains('is-home')).toBe(true);
    walkTo(3);
    expect(q('.demo-transcript')?.children).toHaveLength(0);
  });

  it('returns focus to the Product tour row when Settings redrew it while the tour ran', () => {
    const row = (): HTMLButtonElement => {
      const button = doc.createElement('button');
      button.setAttribute('data-settings-tour', '');
      app.append(button);
      return button;
    };
    const first = row();
    first.focus();
    const tour = mount();
    tour.start();
    first.remove();
    const redrawn = row();
    escape();
    expect(doc.activeElement).toBe(redrawn);
  });

  it('returns focus to the control that opened it', () => {
    const entry = doc.createElement('button');
    doc.body.append(entry);
    entry.focus();
    const tour = mount();
    tour.start();
    expect(doc.activeElement?.id).toBe('tour-title');
    escape();
    expect(doc.activeElement).toBe(entry);
    expect(entry.classList.contains('tour-pulse')).toBe(false);
  });
});

describe('keeping input inside the open card', () => {
  it('cycles Tab through the welcome dialog and keeps the app behind it out of reach', () => {
    offerTourOnFirstLaunch(mount(), storage);
    expect(doc.activeElement?.id).toBe('tour-title');
    expect(tab()).toBe('not-now');
    expect(tab()).toBe('take-tour');
    expect(tab()).toBe('not-now');
    expect(tab(true)).toBe('take-tour');
    expect(app.hasAttribute('inert')).toBe(true);
    q('#tour-title')?.focus();
    expect(tab(true)).toBe('take-tour');
  });

  it('cycles Tab through the completion card only, with the whole demo behind it inert', () => {
    mount().start();
    walkTo(8);
    expect(liveDemoControls()).toEqual([]);
    // The title sits between the × and Start my first map, so Tab from it goes forward.
    expect(tab()).toBe('first-map');
    expect(tab()).toBe('exit');
    expect(tab()).toBe('first-map');
    expect(tab(true)).toBe('exit');
    expect(tab(true)).toBe('first-map');
  });

  it.each([
    [1, []],
    [2, ['demo-start']],
    [3, []],
    [4, []],
    [5, []],
    [6, ['#6']],
    [7, ['#5']],
  ])('at step %i leaves only %j live in the demo', (step, live) => {
    mount().start();
    walkTo(step);
    expect(liveDemoControls()).toEqual(live);
  });

  it('allows Open the map once planning finishes', () => {
    mount().start();
    walkTo(3);
    runScript();
    expect(liveDemoControls()).toEqual(['demo-open-map']);
  });

  it('allows Open in T3 Code once #5 is selected, until the hand-off starts', () => {
    mount().start();
    walkTo(7);
    click('[data-ticket="5"]');
    expect(liveDemoControls()).toEqual(['#5', 'demo-open']);
    click('#demo-open');
    expect(liveDemoControls()).toEqual(['#5']);
  });

  it("Tab runs from the card into the step's control and back to the card", () => {
    mount().start();
    walkTo(2);
    expect(doc.activeElement?.id).toBe('tour-title');
    expect(tab()).toBe('back');
    expect(tab()).toBe('demo-start');
    expect(tab()).toBe('exit');
    expect(tab()).toBe('back');
    expect(tab(true)).toBe('exit');
    expect(tab(true)).toBe('demo-start');
  });

  it('Tab at the hand-off step reaches #5 and Open in T3 Code, then moves on from the hand-off status', () => {
    mount().start();
    walkTo(7);
    expect(tab()).toBe('back');
    expect(tab()).toBe('#5');
    click('[data-ticket="5"]');
    expect(tab()).toBe('demo-open');
    click('#demo-open');
    expect(doc.activeElement?.id).toBe('demo-handoff');
    expect(tab()).toBe('exit');
  });

  it('inertExcept leaves the allowed elements and their ancestors live', () => {
    const root = doc.createElement('div');
    setTrustedHtml(root, '<nav><a href="/" id="a">a</a></nav><main><p>text</p><section><button id="b">b</button><button id="c">c</button></section></main>');
    inertExcept(root, [root.querySelector('#c')!]);
    expect([...root.querySelectorAll('[inert]')].map((element) => element.tagName.toLowerCase() + (element.id === '' ? '' : `#${element.id}`))).toEqual(['nav', 'p', 'button#b']);
    expect(tabStops(root).map((element) => element.id)).toEqual(['c']);
  });
});
