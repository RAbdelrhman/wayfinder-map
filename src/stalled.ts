import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { isLiveHandOff } from './handOffLiveness.js';
import type { HandOffStatus } from './handOffTracking.js';
import { DEFAULT_STALL_SETTINGS, STALL_DAY_CHOICES } from './types.js';
import type { MapSnapshot, Stall, StallKind, StallSettings, Ticket } from './types.js';

export { DEFAULT_STALL_SETTINGS, STALL_DAY_CHOICES };
export type { StallSettings };

/**
 * Which tickets on a map have stalled (#125, #160). Two kinds, each with its own setting:
 * - `untouched-claim`: claimed, with no commit on its branch, PR, issue activity or live hand-off for N days.
 * - `dead-hand-off`: its newest hand-off failed (or never got a thread) N days ago, with no retry, PR or activity since.
 * `since` is when the ticket went quiet, so the page can say how long it has been.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The ticket facts stalls read: its number, its state, and when its issue last changed. */
export type StallTicket = Pick<Ticket, 'number' | 'state' | 'updatedAt'>;

/** A stored hand-off, as much of it as stalls read. */
export interface StallHandOff {
  ticketNumber: number | null;
  threadId: string | null;
  status: HandOffStatus;
  createdAt: string;
  updatedAt: string;
  terminalAt: string | null;
  pullRequests: readonly unknown[];
}

/** What GitHub says about a ticket's branch and pull requests, from the map watcher's read. */
export interface TicketActivity {
  pullRequest: boolean;
  /** The newest commit on a `wayfinder/<n>-…` branch, as an ISO timestamp. */
  lastCommitAt: string | null;
}

function time(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function latest(values: ReadonlyArray<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length === 0 ? null : Math.max(...known);
}

/** The map's stalled tickets, in map order. Closed and blocked tickets never stall. */
export function stalledTickets(
  tickets: readonly StallTicket[],
  handOffs: readonly StallHandOff[],
  activity: ReadonlyMap<number, TicketActivity>,
  settings: StallSettings,
  now: Date,
): Stall[] {
  const stalls: Stall[] = [];
  for (const ticket of tickets) {
    if (ticket.state === 'done' || ticket.state === 'blocked') continue;
    const own = handOffs
      .filter((handOff) => handOff.ticketNumber === ticket.number)
      .sort((a, b) => (time(b.createdAt) ?? 0) - (time(a.createdAt) ?? 0));
    const found = activity.get(ticket.number);
    if (found?.pullRequest === true || own.some((handOff) => handOff.pullRequests.length > 0)) continue;
    if (own.some(isLiveHandOff)) continue;

    const newest = own[0];
    const touched = latest([
      time(ticket.updatedAt),
      time(found?.lastCommitAt),
      ...own.flatMap((handOff) => [time(handOff.createdAt), time(handOff.terminalAt)]),
    ]);
    const kind = stallOf(ticket, newest, touched, settings, now.getTime());
    if (kind !== null) stalls.push({ ticket: ticket.number, ...kind });
  }
  return stalls;
}

function stallOf(
  ticket: StallTicket,
  newest: StallHandOff | undefined,
  touched: number | null,
  settings: StallSettings,
  now: number,
): { kind: StallKind; since: string } | null {
  if (newest !== undefined && (newest.status === 'failed' || newest.threadId === null)) {
    const died = newest.status === 'failed' ? (time(newest.terminalAt) ?? time(newest.updatedAt)) : time(newest.createdAt);
    // Someone commenting or committing after it died took the ticket back; the claim rule covers it from there.
    const quietSince = died === null || (touched !== null && touched > died) ? null : died;
    if (quietSince !== null && now - quietSince >= settings.deadHandOffDays * DAY_MS) {
      return { kind: 'dead-hand-off', since: new Date(quietSince).toISOString() };
    }
  }
  if (ticket.state === 'claimed' && touched !== null && now - touched >= settings.untouchedClaimDays * DAY_MS) {
    return { kind: 'untouched-claim', since: new Date(touched).toISOString() };
  }
  return null;
}

export interface StallSources {
  handOffs: (repo: string) => Promise<readonly StallHandOff[]>;
  /** GitHub's branches and pull requests for the repository. Only asked when something looks stalled without them. */
  activity: (repo: string) => Promise<ReadonlyMap<number, TicketActivity>>;
  settings: StallSettings;
  now: Date;
}

/**
 * The snapshot with each loaded map's `stalled` filled in. Branches and pull requests only ever
 * clear a stall, so GitHub is asked only when hand-offs and issue activity alone find one.
 */
export async function markStalls(snapshot: MapSnapshot, sources: StallSources): Promise<MapSnapshot> {
  const loaded = snapshot.maps.filter((map) => map.ticketsLoaded);
  if (loaded.length === 0) return snapshot;
  const handOffs = await sources.handOffs(snapshot.repo).catch(() => []);
  const quick = (map: MapSnapshot['maps'][number]): Stall[] => stalledTickets(map.tickets, handOffs, new Map(), sources.settings, sources.now);
  if (!loaded.some((map) => quick(map).length > 0)) return { ...snapshot, maps: snapshot.maps.map((map) => ({ ...map, stalled: [] })) };
  const activity = await sources.activity(snapshot.repo).catch(() => new Map<number, TicketActivity>());
  return {
    ...snapshot,
    maps: snapshot.maps.map((map) => ({
      ...map,
      stalled: map.ticketsLoaded ? stalledTickets(map.tickets, handOffs, activity, sources.settings, sources.now) : [],
    })),
  };
}

function isDays(value: unknown): value is number {
  return typeof value === 'number' && (STALL_DAY_CHOICES as readonly number[]).includes(value);
}

/** Saved settings, with the default standing in for anything missing or unknown. */
export function readStallSettings(value: unknown): StallSettings {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return {
    untouchedClaimDays: isDays(raw['untouchedClaimDays']) ? raw['untouchedClaimDays'] : DEFAULT_STALL_SETTINGS.untouchedClaimDays,
    deadHandOffDays: isDays(raw['deadHandOffDays']) ? raw['deadHandOffDays'] : DEFAULT_STALL_SETTINGS.deadHandOffDays,
  };
}

/** `current` with the patch's known keys applied, or null when the patch has nothing valid in it. */
export function applyStallSettings(current: StallSettings, patch: unknown): StallSettings | null {
  const raw = typeof patch === 'object' && patch !== null ? (patch as Record<string, unknown>) : {};
  const next = { ...current };
  let changed = false;
  for (const key of ['untouchedClaimDays', 'deadHandOffDays'] as const) {
    if (raw[key] === undefined) continue;
    if (!isDays(raw[key])) return null;
    next[key] = raw[key];
    changed = true;
  }
  return changed ? next : null;
}

/** Where stall settings are kept. The server takes any implementation, so tests stay off the home directory. */
export interface StallSettingsSource {
  get: () => Promise<StallSettings>;
  update: (patch: unknown) => Promise<StallSettings | null>;
}

/** `~/.wayfinder-map/stalls.json`: the two stall settings, shared by every account on the machine. */
export function stallSettingsFile(): string {
  return join(homedir(), '.wayfinder-map', 'stalls.json');
}

export class StallSettingsStore implements StallSettingsSource {
  constructor(private readonly path: string = stallSettingsFile()) {}

  async get(): Promise<StallSettings> {
    try {
      return readStallSettings(JSON.parse(await readFile(this.path, 'utf8')));
    } catch {
      return DEFAULT_STALL_SETTINGS;
    }
  }

  async update(patch: unknown): Promise<StallSettings | null> {
    const next = applyStallSettings(await this.get(), patch);
    if (next === null) return null;
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    return next;
  }
}

/** Settings held in memory, for tests and servers that must not touch the home directory. */
export function memoryStallSettings(initial: StallSettings = DEFAULT_STALL_SETTINGS): StallSettingsSource {
  let current = initial;
  return {
    get: () => Promise.resolve(current),
    update: (patch) => {
      const next = applyStallSettings(current, patch);
      if (next !== null) current = next;
      return Promise.resolve(next);
    },
  };
}
