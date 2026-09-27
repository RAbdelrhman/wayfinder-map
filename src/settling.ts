import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

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

/** `~/.wayfinder-map/settled.json`: each GitHub login's hand-made settle choices, by repository. */
export function settledFile(): string {
  return join(homedir(), '.wayfinder-map', 'settled.json');
}

/** Settle choices per GitHub login, so each account on the machine keeps its own. */
export class SettleStore {
  constructor(private readonly path: string = settledFile()) {}

  async choices(login: string, repo: string): Promise<Record<number, SettleChoice>> {
    const raw = this.repoOf(await this.readAll(), login, repo);
    const choices: Record<number, SettleChoice> = {};
    for (const [key, value] of Object.entries(raw)) {
      const number = Number(key);
      if (Number.isSafeInteger(number) && number > 0 && isChoice(value)) choices[number] = { settled: value.settled, at: value.at };
    }
    return choices;
  }

  async set(login: string, repo: string, mapNumber: number, choice: SettleChoice): Promise<void> {
    const all = await this.readAll();
    const user = this.objectAt(all, login.toLowerCase());
    const repository = { ...this.objectAt(user, repo.toLowerCase()), [String(mapNumber)]: choice };
    const next = { ...all, [login.toLowerCase()]: { ...user, [repo.toLowerCase()]: repository } };
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }

  private repoOf(all: Record<string, unknown>, login: string, repo: string): Record<string, unknown> {
    return this.objectAt(this.objectAt(all, login.toLowerCase()), repo.toLowerCase());
  }

  private objectAt(parent: Record<string, unknown>, key: string): Record<string, unknown> {
    const value = parent[key];
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
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
