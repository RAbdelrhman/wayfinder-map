import { canAdvance, createDemoJourney, DEMO_STAGES, stageOf } from './demo/demoJourney.js';
import type { DemoAction, DemoJourney, DemoScheduler, DemoState } from './demo/demoJourney.js';
import { BLOCKED_EXAMPLE, HAND_OFF_EXAMPLE } from './demo/demoJourney.js';
import { demoAppHtml, typeLegendHtml } from './demoApp.js';
import * as icons from './icons.js';
import { icon } from './icons.js';
import { escapeHtml } from './markdown.js';
import { setTrustedHtml } from './trustedHtml.js';
import { stepAnnouncement, TOUR_COPY, TOUR_STEPS } from './tourCopy.js';
import { rememberTour, shouldInviteToTour, TOUR_KEY } from './tourPreference.js';

/*
  The product tour (#240): the Spotlight (#238, option A) over a demo copy of the app,
  driven by the demo journey in src/ui/demo. It opens from the first-launch welcome
  dialog on Home (E1) or from Settings › Help (S1). The step card's Demo label and ×
  carry the demo status and the way out (F), Escape also exits, and each step that asks
  for a demo control waits for that control instead of offering Next (G).
*/

const N = DEMO_STAGES.length;
/** The step each demo stage spotlights; the hand-off and blockers steps follow the user's selection. */
const TARGETS = {
  purpose: null,
  goal: '.demo-composer',
  planning: '#demo-plan',
  map: '.demo-canvas-inner',
  types: '#demo-types',
  blockers: `[data-ticket="${String(BLOCKED_EXAMPLE)}"]`,
  handoff: `[data-ticket="${String(HAND_OFF_EXAMPLE)}"]`,
} as const;
/** The demo controls each step asks the user to press; the rest of the demo is inert behind the card. */
const ALLOWED = {
  purpose: [],
  goal: ['#demo-start'],
  planning: ['#demo-open-map'],
  map: [],
  types: [],
  blockers: [`[data-ticket="${String(BLOCKED_EXAMPLE)}"]`],
  // The hand-off status takes focus from Open in T3 Code once that disables.
  handoff: [`[data-ticket="${String(HAND_OFF_EXAMPLE)}"]`, '#demo-open', '#demo-handoff'],
} as const satisfies Record<keyof typeof TARGETS, readonly string[]>;
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]';

/** Makes everything under `root` inert except `allowed` and the elements that hold them. */
export function inertExcept(root: Element, allowed: readonly Element[]): void {
  for (const child of root.children) {
    if (allowed.includes(child)) continue;
    if (allowed.some((element) => child.contains(element))) inertExcept(child, allowed);
    else child.setAttribute('inert', '');
  }
}

/** The controls Tab moves between inside `root`, in document order. */
export function tabStops(root: Element): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) =>
    element.closest('[inert], [hidden]') === null
    && element.getAttribute('tabindex') !== '-1'
    && !(element instanceof HTMLButtonElement && element.disabled));
}

export interface TourOptions {
  /** The app's own toast, for the Not now and Exit tour messages. */
  toast: (message: string, ms?: number) => void;
  /** The real app, made inert while the welcome dialog or the demo covers it. */
  app?: HTMLElement | null;
  /** Leaves for Start a new map after the completion card. */
  navigate?: (url: string) => void;
  scheduler?: DemoScheduler;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  doc?: Document;
}

export interface TourController {
  /** The first-launch welcome dialog. */
  invite(): void;
  /** Opens the tour at its first step, from the beginning every time. */
  start(): void;
  isOpen(): boolean;
}

type Mode = 'closed' | 'invite' | 'tour';

export function mountTour(options: TourOptions): TourController {
  const doc = options.doc ?? document;
  const storage = options.storage;
  const remember = (outcome: 'dismissed' | 'completed'): void => { rememberTour(outcome, storage); };
  const navigate = options.navigate ?? ((url: string) => { window.location.assign(url); });

  const layer = doc.createElement('div');
  layer.className = 'tour-layer';
  layer.id = 'tour-layer';
  layer.hidden = true;
  const stage = doc.createElement('div');
  stage.className = 'tour-stage';
  const live = doc.createElement('span');
  live.className = 'sr-only';
  live.id = 'tour-live';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  layer.append(stage, live);
  doc.body.append(layer);

  let mode: Mode = 'closed';
  let journey: DemoJourney | null = null;
  let unsubscribe: (() => void) | null = null;
  let returnFocus: HTMLElement | null = null;
  /** The step last drawn, so a new step moves focus to its title and is announced. */
  let drawnStep = '';

  const pill = `<span class="demo-pill">${escapeHtml(TOUR_COPY.demoPill)}</span>`;
  const exitButton = `<button type="button" class="iconbtn tour-x" data-tour-act="exit" aria-label="${escapeHtml(TOUR_COPY.exit)}" title="${escapeHtml(TOUR_COPY.exit)}">${icon(icons.CLOSE)}</button>`;

  function stepControls(state: DemoState): string {
    const id = stageOf(state).id;
    const copy = TOUR_STEPS[id];
    const ready = canAdvance(state);
    const waiting = !ready && copy.wait !== undefined && (id === 'planning' || (id === 'handoff' && state.handOff > 0));
    // G: once planning is done, the demo's own Open the map moves on, so the card hints instead of showing Next.
    const ownButton = ready && copy.readyHint !== undefined;
    const hintText = ownButton ? copy.readyHint : !ready && !waiting ? copy.hint : undefined;
    const hint = hintText === undefined ? '' : `<p class="tour-hint">${icon(icons.HAND)}${escapeHtml(hintText)}</p>`;
    const wait = waiting ? `<p class="tour-hint is-wait" role="status">${icon(icons.CLOCK)}${escapeHtml(copy.wait ?? '')}</p>` : '';
    const nextLabel = copy.cta ?? (state.stage + 1 === N ? TOUR_COPY.finish : TOUR_COPY.next);
    const next = (ready && !ownButton) ? `<button type="button" class="primary" data-tour-act="next">${escapeHtml(nextLabel)}${icon(icons.ARROW)}</button>` : '';
    const back = state.stage > 0 ? `<button type="button" class="ghost" data-tour-act="back">${escapeHtml(TOUR_COPY.back)}</button>` : '';
    return `${hint}${wait}<div class="tour-actions is-compact">${back}<span class="demo-spacer"></span>${next}</div>`;
  }

  function cardHtml(state: DemoState): string {
    if (state.status === 'finished') {
      const done = TOUR_COPY.completion;
      return `<div class="tour-scrim"></div>
        <section class="tour-pop is-center" role="dialog" aria-modal="true" aria-labelledby="tour-title">
          <header class="tour-pop-head">${pill}<span class="tour-count">${escapeHtml(TOUR_COPY.doneOf(N))}</span>${exitButton}</header>
          <span class="tour-done-icon" aria-hidden="true">${icon(icons.CHECK)}</span>
          <h2 id="tour-title" tabindex="-1">${escapeHtml(done.title)}</h2>
          <p class="tour-body">${escapeHtml(done.body)}</p>
          <div class="tour-actions"><span class="demo-spacer"></span><button type="button" class="primary" data-tour-act="first-map">${icon(icons.PLUS)}${escapeHtml(done.primary)}</button></div>
          <p class="tour-replay">${escapeHtml(done.replay)}</p>
        </section>`;
    }
    const id = stageOf(state).id;
    const copy = TOUR_STEPS[id];
    const targeted = TARGETS[id] !== null;
    const dots = DEMO_STAGES.map((_, index) => `<span class="${index < state.stage ? 'is-done' : index === state.stage ? 'is-now' : ''}"></span>`).join('');
    const dim = targeted ? '<div class="tour-block"></div><div class="tour-block"></div><div class="tour-block"></div><div class="tour-block"></div><div class="tour-hole"></div>' : '<div class="tour-scrim"></div>';
    return `<div class="tour-hole-wrap" aria-hidden="true">${dim}</div>
      <section class="tour-pop${targeted ? '' : ' is-center'}" role="dialog" aria-modal="false" aria-labelledby="tour-title" data-tour-step="${id}">
        <header class="tour-pop-head">${pill}<span class="tour-count">${escapeHtml(TOUR_COPY.stepOf(state.stage + 1, N))}</span>${exitButton}</header>
        <h2 id="tour-title" tabindex="-1">${escapeHtml(copy.title)}</h2>
        <p class="tour-body">${escapeHtml(copy.body)}</p>${id === 'types' ? typeLegendHtml() : ''}
        ${stepControls(state)}
        <div class="tour-dots" aria-hidden="true">${dots}</div>
      </section>`;
  }

  function inviteHtml(): string {
    const invite = TOUR_COPY.invite;
    return `<div class="tour-scrim"></div>
      <section class="tour-pop is-center tour-invite" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-invite-body">
        <span class="tour-invite-icon" aria-hidden="true">${icon(icons.COMPASS)}</span>
        <h2 id="tour-title" tabindex="-1">${escapeHtml(invite.title)}</h2>
        <p class="tour-body" id="tour-invite-body">${escapeHtml(invite.body)}</p>
        <div class="tour-actions"><button type="button" class="ghost" data-tour-act="not-now">${escapeHtml(invite.decline)}</button><span class="demo-spacer"></span>
        <button type="button" class="primary" data-tour-act="take-tour">${icon(icons.PLAY)}${escapeHtml(invite.accept)}</button></div>
        <p class="tour-replay">${escapeHtml(invite.later)}</p>
      </section>`;
  }

  /** A key that finds the same control after a redraw. */
  function focusKey(element: Element | null): string | null {
    if (!(element instanceof HTMLElement) || !stage.contains(element)) return null;
    if (element.dataset['ticket'] !== undefined) return `[data-ticket="${element.dataset['ticket']}"]`;
    if (element.dataset['tourAct'] !== undefined) return `[data-tour-act="${element.dataset['tourAct']}"]`;
    return element.id === '' ? null : `#${element.id}`;
  }

  function targetFor(state: DemoState): HTMLElement | null {
    const id = stageOf(state).id;
    let selector: string | null = TARGETS[id];
    if (id === 'handoff' && state.selected === HAND_OFF_EXAMPLE) selector = state.handOff > 0 ? '#demo-handoff' : '#demo-open';
    if (id === 'blockers' && state.selected === BLOCKED_EXAMPLE) selector = '.demo-waiting';
    return selector === null ? null : stage.querySelector<HTMLElement>(selector);
  }

  function placeSpotlight(): void {
    const state = journey?.state();
    if (mode !== 'tour' || state === undefined || state.status !== 'running') return;
    const target = targetFor(state);
    const pop = stage.querySelector<HTMLElement>('.tour-pop');
    if (target === null || pop === null) return;
    target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const pad = 6;
    const rect = target.getBoundingClientRect();
    // Whole pixels, so the four dimming blocks meet without hairline seams.
    const x0 = Math.floor(rect.left - pad);
    const y0 = Math.floor(rect.top - pad);
    const hole = { x: x0, y: y0, w: Math.ceil(rect.right + pad) - x0, h: Math.ceil(rect.bottom + pad) - y0 };
    const view = doc.defaultView;
    const W = view?.innerWidth ?? 0;
    const H = view?.innerHeight ?? 0;
    const [top, bottom, left, right] = stage.querySelectorAll<HTMLElement>('.tour-block');
    const place = (element: HTMLElement | undefined | null, x: number, y: number, w: number, h: number): void => {
      if (element === undefined || element === null) return;
      Object.assign(element.style, { left: `${String(x)}px`, top: `${String(y)}px`, width: `${String(Math.max(0, w))}px`, height: `${String(Math.max(0, h))}px` });
    };
    place(top, 0, 0, W, hole.y);
    place(bottom, 0, hole.y + hole.h, W, H - hole.y - hole.h);
    place(left, 0, hole.y, hole.x, hole.h);
    place(right, hole.x + hole.w, hole.y, W - hole.x - hole.w, hole.h);
    place(stage.querySelector<HTMLElement>('.tour-hole'), hole.x, hole.y, hole.w, hole.h);

    if (W < 760) return; // The card is a bottom sheet on narrow screens.
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    const gap = 14;
    const clampY = (y: number): number => Math.max(12, Math.min(y, H - ph - 12));
    const clampX = (x: number): number => Math.max(12, Math.min(x, W - pw - 12));
    let x: number;
    let y: number;
    const below = hole.y + hole.h + gap + ph < H - 12;
    if (hole.w > 480 && below) { x = clampX(hole.x + hole.w - pw); y = hole.y + hole.h + gap; }
    else if (hole.x + hole.w + gap + pw < W - 12) { x = hole.x + hole.w + gap; y = clampY(hole.y); }
    else if (hole.x - gap - pw > 12) { x = hole.x - gap - pw; y = clampY(hole.y); }
    else if (below) { x = clampX(hole.x); y = hole.y + hole.h + gap; }
    else { x = clampX(hole.x); y = Math.max(12, hole.y - gap - ph); }
    pop.style.left = `${String(x)}px`;
    pop.style.top = `${String(y)}px`;
  }

  function render(): void {
    const key = focusKey(doc.activeElement);
    if (mode === 'closed') {
      setTrustedHtml(stage, '');
      return;
    }
    if (mode === 'invite') {
      setTrustedHtml(stage, inviteHtml());
      if (drawnStep !== 'invite') {
        drawnStep = 'invite';
        stage.querySelector<HTMLElement>('#tour-title')?.focus({ preventScroll: true });
      }
      return;
    }
    const state = journey?.state();
    if (state === undefined) return;
    // The card comes first so Tab runs from its buttons into the demo control the step asks for,
    // and the rest of the demo is inert so neither Tab nor a click reaches it.
    setTrustedHtml(stage, `${cardHtml(state)}<div class="tour-shell">${demoAppHtml(state)}</div>`);
    const shell = stage.querySelector('.tour-shell');
    if (shell !== null) {
      const selectors = state.status === 'finished' ? [] : ALLOWED[stageOf(state).id];
      inertExcept(shell, selectors.flatMap((selector) => [...shell.querySelectorAll(selector)]));
    }
    placeSpotlight();
    const step = state.status === 'finished' ? 'finished' : stageOf(state).id;
    if (step !== drawnStep) {
      drawnStep = step;
      stage.querySelector<HTMLElement>('#tour-title')?.focus({ preventScroll: true });
      live.textContent = stepAnnouncement(state, stageOf(state).id, N);
      return;
    }
    if (key === null) return;
    const again = stage.querySelector<HTMLElement>(key);
    if (again !== null && !(again instanceof HTMLButtonElement && again.disabled)) again.focus({ preventScroll: true });
    // Open in T3 Code disables once the hand-off starts; keep focus on its status instead.
    else if (key === '#demo-open') stage.querySelector<HTMLElement>('#demo-handoff')?.focus({ preventScroll: true });
  }

  /** Whether the app was already inert (the canvas viewer, say) before the tour opened, so closing leaves it so. */
  let appWasInert = false;

  function setApp(inert: boolean): void {
    const app = options.app;
    if (app === undefined || app === null) return;
    if (inert) app.setAttribute('inert', '');
    else if (!appWasInert) app.removeAttribute('inert');
  }

  function open(next: Mode): void {
    if (mode === 'closed') {
      const active = doc.activeElement;
      returnFocus = active instanceof HTMLElement && active !== doc.body && !layer.contains(active) ? active : null;
      appWasInert = options.app?.hasAttribute('inert') ?? false;
    }
    mode = next;
    layer.hidden = false;
    layer.dataset['mode'] = next;
    doc.body.classList.toggle('is-touring', next === 'tour');
    setApp(true);
  }

  function close(message: string | null): void {
    unsubscribe?.();
    unsubscribe = null;
    journey?.dispose();
    journey = null;
    mode = 'closed';
    drawnStep = '';
    layer.hidden = true;
    delete layer.dataset['mode'];
    doc.body.classList.remove('is-touring');
    setApp(false);
    render();
    const settings = doc.getElementById('settings');
    // Settings may redraw its Help section while the tour runs; its new Product tour row is the same entry.
    const entry = doc.querySelector<HTMLElement>('[data-settings-tour]');
    const back = returnFocus?.isConnected === true ? returnFocus : entry ?? settings;
    returnFocus = null;
    back?.focus({ preventScroll: true });
    if (message === null) return;
    options.toast(message, 9000);
    // Point at where the tour lives now, unless that is where focus already went back to.
    if (settings !== null && back === settings && settings.getAttribute('aria-current') !== 'page') {
      settings.classList.add('tour-pulse');
      setTimeout(() => { settings.classList.remove('tour-pulse'); }, 5000);
    }
  }

  function start(): void {
    unsubscribe?.();
    journey?.dispose();
    open('tour');
    drawnStep = '';
    journey = options.scheduler === undefined ? createDemoJourney() : createDemoJourney({ scheduler: options.scheduler });
    unsubscribe = journey.subscribe((state) => {
      if (state.status === 'finished') remember('completed');
      render();
    });
    render();
  }

  function dispatch(action: DemoAction): void {
    journey?.dispatch(action);
  }

  stage.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const tourAct = target?.closest<HTMLElement>('[data-tour-act]')?.dataset['tourAct'];
    if (tourAct !== undefined) {
      event.preventDefault();
      if (tourAct === 'take-tour') { remember('dismissed'); start(); }
      else if (tourAct === 'not-now') { remember('dismissed'); close(TOUR_COPY.skipped); }
      else if (tourAct === 'exit') close(TOUR_COPY.exited);
      else if (tourAct === 'next') dispatch({ type: 'next' });
      else if (tourAct === 'back') dispatch({ type: 'back' });
      else if (tourAct === 'first-map') { close(null); navigate('/new-map'); }
      return;
    }
    const demo = target?.closest<HTMLElement>('[data-demo-act]');
    if (demo === null || demo === undefined || (demo instanceof HTMLButtonElement && demo.disabled)) return;
    const act = demo.dataset['demoAct'];
    if (act === 'startMap') dispatch({ type: 'startMap' });
    // Open the map is the planning step's only way forward (G), so it is the step's Next.
    else if (act === 'openMap') dispatch({ type: 'next' });
    else if (act === 'select') dispatch({ type: 'select', ticket: Number(demo.dataset['ticket']) });
    else if (act === 'openInT3') dispatch({ type: 'openInT3' });
  });

  // A press on the dimmed backdrop or the card's text would drop focus to the page; keep it where it is.
  stage.addEventListener('mousedown', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(FOCUSABLE) === null || target?.closest('[inert]') !== null) event.preventDefault();
  });

  // Tab and Shift+Tab cycle through the open card and the one demo control its step allows.
  doc.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || mode === 'closed' || event.defaultPrevented) return;
    const stops = tabStops(stage);
    if (stops.length === 0) return;
    event.preventDefault();
    const active = doc.activeElement;
    // From focus outside the stops (the card's title, the hand-off status), go to the stop after or before it in the page.
    const after = (element: HTMLElement): boolean => active !== null && active !== element && (active.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    const next = event.shiftKey
      ? stops.findLast((element) => element !== active && !after(element)) ?? stops.at(-1)
      : stops.find(after) ?? stops[0];
    next?.focus({ preventScroll: true });
  });

  doc.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || mode === 'closed') return;
    event.preventDefault();
    if (mode === 'invite') { remember('dismissed'); close(TOUR_COPY.skipped); }
    else close(TOUR_COPY.exited);
  });

  doc.defaultView?.addEventListener('resize', placeSpotlight);
  // Answered in another window: this one's invitation goes too, without a second message.
  doc.defaultView?.addEventListener('storage', (event) => {
    if (event.key === TOUR_KEY && mode === 'invite' && !shouldInviteToTour(storage)) close(null);
  });

  return {
    invite() {
      if (mode !== 'closed') return;
      open('invite');
      render();
    },
    start,
    isOpen: () => mode !== 'closed',
  };
}

/** Home calls this once per launch: the welcome dialog appears until it has been answered. */
export function offerTourOnFirstLaunch(tour: TourController, storage?: Pick<Storage, 'getItem'> | null): void {
  if (shouldInviteToTour(storage)) tour.invite();
}
