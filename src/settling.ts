import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { SettingsFileWriter } from './settingsFile.js';

import type { MapSettlement } from './types.js';

/** An open map with nothing changed on it or its tickets for this long settles. */
export const IDLE_DAYS = 30;
const DAY_MS = 86_400_000;

/** A settle or unsettle made by hand. It wins over the automatic rule. */
export interface SettleChoice {
  settled: boolean;
  /** When the choice was made, as an ISO timestamp. */
  at: string;
}

/** Hand-made choices for one repository, by map number. */
export type SettleChoices = Readonly<Record<number, SettleChoice>>;

/** What the map list already says about a map issue, so settling costs no extra call. */
export interface MapIssueFacts {
  open: boolean;
  closedAt: string | null;
  updatedAt: string | null;
}

/** Anything updated before this is idle. */
export function idleCutoff(now: Date): Date {
  return new Date(now.getTime() - IDLE_DAYS * DAY_MS);
}

/** Whether the map issue itself changed too long ago to keep it active. Its tickets are asked separately. */
export function isIdleCandidate(issue: MapIssueFacts, now: Date): boolean {
  if (!issue.open || issue.updatedAt === null) return false;
  const updated = Date.parse(issue.updatedAt);
  return !Number.isNaN(updated) && updated < idleCutoff(now).getTime();
}

/**
 * Whether a map sits in the Settled section, and since when. A hand-made choice wins; otherwise a
 * closed map settles when it closed, and an open one settles 30 days after anything on it last changed.
 */
export function settlementOf(
  issue: MapIssueFacts,
  choice: SettleChoice | undefined,
  ticketsChangedRecently: boolean,
  now: Date,
): MapSettlement | null {
  if (choice !== undefined) return choice.settled ? { reason: 'manual', since: choice.at } : null;
  if (!issue.open) return { reason: 'closed', since: issue.closedAt ?? issue.updatedAt ?? now.toISOString() };
  if (ticketsChangedRecently || !isIdleCandidate(issue, now)) return null;
  return { reason: 'idle', since: new Date(Date.parse(issue.updatedAt ?? '') + IDLE_DAYS * DAY_MS).toISOString() };
}

function isChoice(value: unknown): value is SettleChoice {
  if (typeof value !== 'object' || value === null) return false;
  const { settled, at } = value as Record<string, unknown>;
  return typeof settled === 'boolean' && typeof at === 'string';
}

/**
 * `~/.wayfinder-map/settled.json`: each account's hand-made settle choices, as
 * `{ "<host>": { "<login>": { "<owner/repo>": { "<map number>": choice } } } }`. Files written before
 * hosts were added hold `{ "<login>": … }` at the top; those entries read as `github.com`.
 */
export function settledFile(): string {
  return join(homedir(), '.wayfinder-map', 'settled.json');
}

/** Whose choices these are: a login on one GitHub host. */
export interface SettleAccount {
  host: string;
  login: string;
}

const LEGACY_HOST = 'github.com';

/** `settled.json` exists but can't be read or parsed, so no choices apply and saving is refused. */
export class SettleFileError extends Error {
  constructor(path: string, options?: { cause?: unknown }) {
    super(`Could not save this choice: ${displayPath(path)} can't be read. Fix or remove the file, then try again.`, options);
    this.name = 'SettleFileError';
  }
}

function displayPath(path: string): string {
  const home = homedir();
  return path.startsWith(home) ? `~${path.slice(home.length).replaceAll('\\', '/')}` : path;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The children of `parent` under `key` whatever their case, so a hand-edited mixed-case key still applies.
 * The lowercase key the app writes comes last, so its entries win.
 */
function matching(parent: unknown, key: string): Json[] {
  if (!isObject(parent)) return [];
  return Object.entries(parent)
    .filter(([name, child]) => name.toLowerCase() === key && isObject(child))
    .sort(([a], [b]) => Number(a === key) - Number(b === key))
    .map(([, child]) => child as Json);
}

/** Settle choices per host and login, so each account on the machine keeps its own. */
export class SettleStore {
  private readonly writer: SettingsFileWriter;

  constructor(private readonly path: string = settledFile()) {
    this.writer = new SettingsFileWriter(path);
  }

  /** The account's choices for a repository; none when the file can't be read. */
  async choices(account: SettleAccount, repo: string): Promise<Record<number, SettleChoice>> {
    let all: Json;
    try {
      all = await this.readAll();
    } catch (error) {
      if (error instanceof SettleFileError) return {};
      throw error;
    }
    const choices: Record<number, SettleChoice> = {};
    for (const [key, value] of Object.entries(this.repoOf(all, account, repo))) {
      const number = Number(key);
      if (Number.isSafeInteger(number) && number > 0 && isChoice(value)) choices[number] = { settled: value.settled, at: value.at };
    }
    return choices;
  }

  /**
   * Saves one choice. Saves run one at a time, so two quick clicks can't overwrite each other, and
   * the file is replaced whole. A file that can't be read is left as it is and the save throws.
   */
  set(account: SettleAccount, repo: string, mapNumber: number, choice: SettleChoice): Promise<void> {
    return this.writer.update(async () => {
      const all = await this.readAll();
      const host = account.host.toLowerCase();
      const login = account.login.toLowerCase();
      const repoKey = repo.toLowerCase();
      const hostEntry = isObject(all[host]) ? all[host] : {};
      const user = isObject(hostEntry[login]) ? hostEntry[login] : {};
      const repository = { ...(isObject(user[repoKey]) ? user[repoKey] : {}), [String(mapNumber)]: choice };
      await this.writer.write({ ...all, [host]: { ...hostEntry, [login]: { ...user, [repoKey]: repository } } });
    });
  }

  private repoOf(all: Json, account: SettleAccount, repo: string): Json {
    const host = account.host.toLowerCase();
    const login = account.login.toLowerCase();
    const repoKey = repo.toLowerCase();
    // Entries saved before hosts were added sit at the top level under the login; they belong to github.com.
    const users = [...(host === LEGACY_HOST ? matching(all, login) : []), ...matching(all, host).flatMap((entry) => matching(entry, login))];
    return Object.assign({}, ...users.flatMap((user) => matching(user, repoKey))) as Json;
  }

  /** The whole file; `{}` only when it doesn't exist yet. */
  private async readAll(): Promise<Json> {
    let text: string;
    try {
      text = await readFile(this.path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw new SettleFileError(this.path, { cause: error });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new SettleFileError(this.path, { cause: error });
    }
    if (!isObject(parsed)) throw new SettleFileError(this.path);
    return parsed;
  }
}
