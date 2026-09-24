import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { gh, ghProblem } from './github.js';

/** How Home draws the day's cleared fog (#43): A's trail, B's hexes, or C's bar. */
export const PROGRESS_STYLES = ['trail', 'hex', 'bar'] as const;
export type ProgressStyle = (typeof PROGRESS_STYLES)[number];

export const DAILY_GOALS = [3, 5, 8] as const;
export type DailyGoal = (typeof DAILY_GOALS)[number];

export interface ProgressSettings {
  style: ProgressStyle;
  goal: DailyGoal;
}

export const DEFAULT_PROGRESS_SETTINGS: ProgressSettings = { style: 'trail', goal: 5 };

/** Days of history the panel reads: the bar's 12-week strip is the longest view. */
export const HISTORY_DAYS = 84;

export interface ProgressState {
  /** Null when no GitHub account is signed in, so there is no one to count for. */
  login: string | null;
  settings: ProgressSettings;
  /** Wayfinder tickets the user completed per local day, oldest first, today last. Null when unknown. */
  days: number[] | null;
  streak: number;
  warning: string | null;
}

function isStyle(value: unknown): value is ProgressStyle {
  return PROGRESS_STYLES.includes(value as ProgressStyle);
}

function isGoal(value: unknown): value is DailyGoal {
  return DAILY_GOALS.includes(value as DailyGoal);
}

/** Saved settings, with the default standing in for anything missing or unknown. */
export function readSettings(value: unknown): ProgressSettings {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return {
    style: isStyle(raw['style']) ? raw['style'] : DEFAULT_PROGRESS_SETTINGS.style,
    goal: isGoal(raw['goal']) ? raw['goal'] : DEFAULT_PROGRESS_SETTINGS.goal,
  };
}

/** Applies a change from the page. Null when it names nothing valid to change. */
export function applySettings(current: ProgressSettings, patch: unknown): ProgressSettings | null {
  if (typeof patch !== 'object' || patch === null) return null;
  const { style, goal } = patch as Record<string, unknown>;
  if (style === undefined && goal === undefined) return null;
  if ((style !== undefined && !isStyle(style)) || (goal !== undefined && !isGoal(goal))) return null;
  return { style: style ?? current.style, goal: goal ?? current.goal };
}

/** `~/.wayfinder-map/progress.json`: each GitHub login's progress settings. */
export function progressFile(): string {
  return join(homedir(), '.wayfinder-map', 'progress.json');
}

/** Settings per GitHub login, so each account on the machine keeps its own. */
export class ProgressSettingsStore {
  constructor(private readonly path: string = progressFile()) {}

  async get(login: string): Promise<ProgressSettings> {
    return readSettings((await this.readAll())[login.toLowerCase()]);
  }

  async update(login: string, patch: unknown): Promise<ProgressSettings | null> {
    const all = await this.readAll();
    const next = applySettings(readSettings(all[login.toLowerCase()]), patch);
    if (next === null) return null;
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify({ ...all, [login.toLowerCase()]: next }, null, 2)}\n`, 'utf8');
    return next;
  }

  private async readAll(): Promise<Record<string, unknown>> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.path, 'utf8'));
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isoDate(date: Date): string {
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Counts each close into its local day, oldest first, with today last. Closes outside the window are dropped. */
export function dailyCounts(closedAt: readonly string[], now: Date, days = HISTORY_DAYS): number[] {
  const counts = Array<number>(days).fill(0);
  const today = startOfDay(now).getTime();
  for (const stamp of closedAt) {
    const closed = new Date(stamp);
    if (Number.isNaN(closed.getTime())) continue;
    // Rounded, because a daylight-saving day is 23 or 25 hours long.
    const ago = Math.round((today - startOfDay(closed).getTime()) / 86_400_000);
    if (ago >= 0 && ago < days) counts[days - 1 - ago] = (counts[days - 1 - ago] ?? 0) + 1;
  }
  return counts;
}

/**
 * Days in a row with at least one ticket cleared. A day with none yet leaves yesterday's
 * streak standing, since today is not over.
 */
export function streak(days: readonly number[]): number {
  let end = days.length - 1;
  if ((days[end] ?? 0) === 0) end -= 1;
  let run = 0;
  for (let index = end; index >= 0 && (days[index] ?? 0) > 0; index -= 1) run += 1;
  return run;
}

export type ProgressGh = (args: string[]) => Promise<string>;

interface ClosedIssue {
  closed_at?: unknown;
  labels?: unknown;
}

/**
 * When `login` completed each Wayfinder ticket assigned to them since `since`. A ticket is
 * any issue with a type label under `typePrefix`; maps themselves do not count.
 */
export async function readCompletedTickets(
  login: string,
  options: { typePrefix: string; mapLabel: string; since: Date },
  runGh: ProgressGh = gh,
): Promise<string[]> {
  // A day early, since GitHub reads the date in UTC and the window is in local days.
  const from = new Date(options.since.getTime() - 86_400_000);
  const query = `is:issue is:closed reason:completed assignee:${login} closed:>=${isoDate(from)}`;
  const output = await runGh([
    'api',
    '--paginate',
    '-X',
    'GET',
    'search/issues',
    '-f',
    `q=${query}`,
    '-f',
    'per_page=100',
    '--jq',
    '.items[] | {closed_at, labels: [.labels[].name]}',
  ]);
  return output
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ClosedIssue)
    .filter((issue) => {
      const labels = Array.isArray(issue.labels) ? issue.labels.filter((label): label is string => typeof label === 'string') : [];
      return !labels.includes(options.mapLabel) && labels.some((label) => label.startsWith(options.typePrefix));
    })
    .map((issue) => (typeof issue.closed_at === 'string' ? issue.closed_at : ''))
    .filter(Boolean);
}

export interface ProgressDependencies {
  /** The signed-in GitHub login, or null. */
  login: () => Promise<string | null>;
  store: Pick<ProgressSettingsStore, 'get' | 'update'>;
  completed: (login: string, since: Date) => Promise<string[]>;
  now?: () => Date;
}

/** Home's progress panel: whose it is, how they like it drawn, and what they cleared. */
export class ProgressService {
  constructor(private readonly dependencies: ProgressDependencies) {}

  async state(): Promise<ProgressState> {
    const login = await this.dependencies.login();
    if (login === null) return { login, settings: DEFAULT_PROGRESS_SETTINGS, days: null, streak: 0, warning: null };
    const settings = await this.dependencies.store.get(login);
    const now = (this.dependencies.now ?? (() => new Date()))();
    const since = new Date(startOfDay(now).getTime() - (HISTORY_DAYS - 1) * 86_400_000);
    try {
      const days = dailyCounts(await this.dependencies.completed(login, since), now);
      return { login, settings, days, streak: streak(days), warning: null };
    } catch (error) {
      return { login, settings, days: null, streak: 0, warning: `Couldn't count closed tickets. ${ghProblem(error)}` };
    }
  }

  /** Saves a change for the signed-in user. Throws when no one is signed in or the change is invalid. */
  async save(patch: unknown): Promise<ProgressSettings> {
    const login = await this.dependencies.login();
    if (login === null) throw new ProgressError(409, 'Sign in with GitHub to save progress settings.');
    const next = await this.dependencies.store.update(login, patch);
    if (next === null) throw new ProgressError(400, `Choose a style of ${PROGRESS_STYLES.join(', ')} or a goal of ${DAILY_GOALS.join(', ')}.`);
    return next;
  }
}

export class ProgressError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
