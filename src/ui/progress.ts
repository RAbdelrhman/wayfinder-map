import type { DailyGoal, ProgressSettings, ProgressState, ProgressStyle } from '../progress.js';
import * as icons from './icons.js';
import { icon } from './icons.js';
import { escapeHtml } from './markdown.js';

/* Home's progress panel (#43, #80): the day's cleared tickets drawn as fog, in the look each user picks. */

export const STYLE_LABELS: Record<ProgressStyle, string> = { trail: 'Trail', hex: 'Hexes', bar: 'Bar' };
export const GOALS: readonly DailyGoal[] = [3, 5, 8];

/** Fired with saved progress settings, so the panel follows a goal changed in Settings. */
export const PROGRESS_SETTINGS_EVENT = 'wayfinder:progress-settings';

/** Trail and Hexes show five weeks; Bar shows twelve. */
const SHORT_DAYS = 35;
const LONG_DAYS = 84;

/** The last `count` days, padded at the front with undefined when the history is shorter. */
function lastDays(days: readonly number[] | null, count: number): (number | null | undefined)[] {
  if (days === null) return Array<null>(count).fill(null);
  const tail = days.slice(-count);
  return [...Array<undefined>(count - tail.length).fill(undefined), ...tail];
}

function cleared(done: number, goal: number): number {
  return Math.min(1, done / goal);
}

let fogCount = 0;

/** A patch of contoured terrain with one waypoint per goal ticket; each ticket done burns the fog off one. */
export function fogTrail(done: number, goal: number, blank: boolean, width = 300, height = 150): string {
  const id = `progress-fog-${String(++fogCount)}`;
  const points = Array.from({ length: goal }, (_, index) => {
    const t = (index + 0.5) / goal;
    return [Math.round(width * (0.08 + t * 0.84)), Math.round(height * (0.55 + 0.22 * Math.sin(t * Math.PI * 2.2)))] as const;
  });
  const contours = (
    [
      [0.28, 0.42, 1],
      [0.74, 0.34, 0.8],
      [0.55, 0.9, 0.7],
    ] as const
  )
    .flatMap(([cx, cy, k]) =>
      [1, 2, 3, 4].map(
        (n) => `<ellipse cx="${String(width * cx)}" cy="${String(height * cy)}" rx="${String(n * 26 * k + 6)}" ry="${String(n * 15 * k + 4)}" transform="rotate(${String(-12 + n * 3)} ${String(width * cx)} ${String(height * cy)})"/>`,
      ),
    )
    .join('');
  const reached = blank ? 0 : Math.min(done, goal);
  const extra = blank ? 0 : Math.max(0, done - goal);
  const holes = points
    .slice(0, reached)
    .map(([x, y]) => `<circle cx="${String(x)}" cy="${String(y)}" r="${String(height * 0.24)}"/>`)
    .join('');
  const lift = extra > 0 ? `<rect width="${String(width)}" height="${String(height)}" fill-opacity="${String(Math.min(0.6, extra * 0.2))}"/>` : '';
  const dots = points
    .map(([x, y], index) => `<circle class="${index < reached ? 'is-reached' : 'is-ahead'}" cx="${String(x)}" cy="${String(y)}" r="${index < reached ? '5' : '3.5'}"/>`)
    .join('');
  const path = `M${points.map(([x, y]) => `${String(x)} ${String(y)}`).join(' L')}`;
  return `<svg class="progress-trail" viewBox="0 0 ${String(width)} ${String(height)}" role="img" aria-label="${blank ? 'No data' : `${String(done)} of ${String(goal)} tickets cleared today`}">
    <defs><filter id="${id}-b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${String(height * 0.07)}"/></filter>
      <mask id="${id}-m"><rect width="${String(width)}" height="${String(height)}" fill="#fff"/><g fill="#000" filter="url(#${id}-b)">${holes}${lift}</g></mask></defs>
    <rect class="ground" width="${String(width)}" height="${String(height)}"/>
    <g class="contours">${contours}</g>
    <path class="route" d="${path}"/>
    ${dots}
    <rect class="fog" width="${String(width)}" height="${String(height)}" mask="url(#${id}-m)"/>
  </svg>`;
}

/** Five weeks of days as a calendar, each fogged by how far it fell short of the goal. */
function calendar(days: readonly number[] | null, goal: number): string {
  const cells = lastDays(days, SHORT_DAYS)
    .map((n, index) =>
      n === undefined
        ? '<i class="is-pad"></i>'
        : n === null
          ? '<i class="is-blank"></i>'
          : `<i style="--f:${(1 - cleared(n, goal)).toFixed(2)}"${index === SHORT_DAYS - 1 ? ' class="is-today"' : ''} title="${String(n)} done"></i>`,
    )
    .join('');
  return `<div class="progress-cal" aria-label="Last 5 weeks">${cells}</div><div class="progress-cap"><span>5 weeks ago</span><span>Today</span></div>`;
}

function trailView(days: readonly number[] | null, done: number, goal: number, blank: boolean): string {
  return `${fogTrail(done, goal, blank)}${calendar(days, goal)}`;
}

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, k) => {
    const angle = (Math.PI / 180) * (60 * k - 30);
    return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');
}

/** Five weeks as a hex fog-of-war: each day is a tile whose fog lifts as that day's tickets clear. */
function hexView(days: readonly number[] | null, done: number, goal: number, blank: boolean): string {
  const flags = blank
    ? Array<string>(goal).fill('<i></i>').join('')
    : Array.from({ length: goal }, (_, index) => `<i${index < done ? ' class="on"' : ''}></i>`).join('') + '<i class="over"></i>'.repeat(Math.max(0, done - goal));
  const r = 20;
  const hw = Math.sqrt(3) * r;
  const cols = 7;
  const rows = SHORT_DAYS / cols;
  const tiles = lastDays(days, SHORT_DAYS)
    .map((n, index) => {
      if (n === undefined) return '';
      const row = Math.floor(index / cols);
      const cx = hw / 2 + 2 + (index % cols) * hw + (row % 2 === 1 ? hw / 2 : 0);
      const cy = r + 2 + row * r * 1.5;
      const clear = n === null ? 0 : cleared(n, goal);
      const points = hexPoints(cx, cy, r);
      const contours =
        clear > 0
          ? `<ellipse class="contour" cx="${(cx - 3).toFixed(1)}" cy="${(cy + 2).toFixed(1)}" rx="${String(r * 0.55)}" ry="${(r * 0.32).toFixed(1)}"/><ellipse class="contour" cx="${(cx - 3).toFixed(1)}" cy="${(cy + 2).toFixed(1)}" rx="${(r * 0.28).toFixed(1)}" ry="${(r * 0.16).toFixed(1)}"/>`
          : '';
      const today = index === SHORT_DAYS - 1 && n !== null;
      return `<g><title>${n === null ? 'No data' : `${String(n)} done`}</title><polygon class="land" points="${points}"/>${contours}<polygon class="fog" points="${points}" style="opacity:${(1 - clear).toFixed(2)}"/><polygon class="${today ? 'today' : 'edge'}" points="${points}"/></g>`;
    })
    .join('');
  const width = cols * hw + hw / 2 + 4;
  const height = r * 1.5 * (rows - 1) + 2 * r + 4;
  return `<div class="progress-flags" aria-hidden="true">${flags}</div><svg class="progress-hex" viewBox="0 0 ${width.toFixed(0)} ${height.toFixed(0)}" role="img" aria-label="Five weeks of cleared fog">${tiles}</svg>`;
}

/** The goal as a bar burned clear from the left, over a twelve-week strip. */
function barView(days: readonly number[] | null, done: number, goal: number, blank: boolean): string {
  const cells = lastDays(days, LONG_DAYS)
    .map((n, index) => `<i style="--v:${n === null || n === undefined ? '0' : cleared(n, goal).toFixed(2)}"${index === LONG_DAYS - 1 && !blank ? ' class="is-today"' : ''}></i>`)
    .join('');
  return `<div class="progress-bar" style="--p:${blank ? '0' : String(cleared(done, goal))}" role="img" aria-label="${String(done)} of ${String(goal)} cleared"></div>
    <div class="progress-weeks" aria-label="Last 12 weeks">${cells}</div><div class="progress-cap"><span>12 weeks ago</span><span>Today</span></div>`;
}

/** The line under the big number: how far today is from the goal. */
export function todayLine(done: number, goal: number): string {
  if (done < goal) return `${String(goal - done)} more to clear today`;
  return done > goal ? `goal met, ${String(done - goal)} extra` : 'goal met';
}

export function streakLine(days: number): string {
  return days > 0 ? `${String(days)}-day streak` : 'Clear one ticket to start a streak';
}

function segmented(label: string, buttons: string): string {
  return `<span class="segmented" role="group" aria-label="${label}">${buttons}</span>`;
}

export function progressPanelHtml(state: ProgressState): string {
  const { style, goal } = state.settings;
  const blank = state.days === null;
  const done = state.days?.at(-1) ?? 0;
  const art = style === 'hex' ? hexView(state.days, done, goal, blank) : style === 'bar' ? barView(state.days, done, goal, blank) : trailView(state.days, done, goal, blank);
  const styles = segmented(
    'Progress style',
    (Object.entries(STYLE_LABELS) as [ProgressStyle, string][])
      .map(([key, label]) => `<button type="button" class="seg${key === style ? ' is-on' : ''}" data-progress-style="${key}" aria-pressed="${String(key === style)}">${label}</button>`)
      .join(''),
  );
  const goals = segmented(
    'Daily goal',
    GOALS.map((g) => `<button type="button" class="seg${g === goal ? ' is-on' : ''}" data-progress-goal="${String(g)}" aria-pressed="${String(g === goal)}">${String(g)}</button>`).join(''),
  );
  const empty = state.login === null ? 'Sign in to count today' : (state.warning ?? 'Could not count today');
  return `<aside class="card progress-panel" id="progress-panel" data-style="${style}">
    <div class="progress-head"><p class="eyebrow">Fog cleared</p>${styles}</div>
    <div class="progress-today">${blank ? `<b>–</b><span>${escapeHtml(empty)}</span>` : `<b>${String(done)}/${String(goal)}</b><span>${todayLine(done, goal)}</span>`}</div>
    ${art}
    <div class="progress-goal"><span class="grow">Daily goal</span>${goals}</div>
    ${blank ? '' : `<div class="progress-streak">${icon(icons.FLAME)}${streakLine(state.streak)}</div>`}
  </aside>`;
}

/** The settings a click on the panel asks for, or null when the click was not on a choice. */
export function choiceFrom(target: Element | null, current: ProgressSettings): Partial<ProgressSettings> | null {
  const button = target?.closest<HTMLElement>('[data-progress-style], [data-progress-goal]') ?? null;
  if (button === null) return null;
  const style = button.dataset['progressStyle'];
  if (style !== undefined) return style in STYLE_LABELS && style !== current.style ? { style: style as ProgressStyle } : null;
  const goal = Number(button.dataset['progressGoal']);
  return GOALS.includes(goal as DailyGoal) && goal !== current.goal ? { goal: goal as DailyGoal } : null;
}

/**
 * Draws the panel into `host` and keeps it live: a choice redraws at once and is saved for the
 * signed-in user, and a failed save puts the old choice back.
 */
export function mountProgressPanel(host: HTMLElement, initial: ProgressState, save: (patch: Partial<ProgressSettings>) => Promise<ProgressSettings>, onError: (message: string) => void): void {
  let state = initial;
  const draw = (): void => {
    host.innerHTML = progressPanelHtml(state);
  };
  draw();
  // Settings saves the goal too; follow it while this panel is on the page.
  document.addEventListener(PROGRESS_SETTINGS_EVENT, (event) => {
    if (!host.isConnected || !(event instanceof CustomEvent)) return;
    state = { ...state, settings: event.detail as ProgressSettings };
    draw();
  });
  host.addEventListener('click', (event) => {
    const patch = choiceFrom(event.target instanceof Element ? event.target : null, state.settings);
    if (patch === null) return;
    const before = state;
    state = { ...state, settings: { ...state.settings, ...patch } };
    draw();
    if (state.login === null) return;
    save(patch).then(
      (settings) => {
        state = { ...state, settings };
        draw();
      },
      (error: unknown) => {
        state = before;
        draw();
        onError(error instanceof Error ? error.message : String(error));
      },
    );
  });
}
