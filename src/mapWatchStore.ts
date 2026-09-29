import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { normalizeRepo } from './repoRoutes.js';
import type { MapEvent, WatchedTicket } from './mapWatch.js';

export interface StoredMapWatch {
  repo: string;
  mapNumber: number;
  etag: string | null;
  tickets: WatchedTicket[];
  history: MapEvent[];
  pullRequestsRead: number[];
  lastPolledAt: number;
}

export interface MapWatchState {
  nextEventId: number;
  maps: StoredMapWatch[];
}

export interface MapWatchStateStore {
  load(): Promise<MapWatchState | null>;
  save(state: MapWatchState): Promise<void>;
}

const EVENT_TYPES = new Set(['ticket-closed', 'ticket-next', 'pr-opened', 'pr-merged', 'ci-changed', 'review-changed']);
const TICKET_STATES = new Set(['done', 'blocked', 'claimed', 'frontier']);

export function mapWatchStorePath(home = homedir()): string {
  return join(home, '.wayfinder-map', 'map-watches.json');
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function watchedTicket(value: unknown): value is WatchedTicket {
  const ticket = record(value);
  return ticket !== null &&
    Number.isSafeInteger(ticket['number']) &&
    typeof ticket['title'] === 'string' &&
    typeof ticket['state'] === 'string' && TICKET_STATES.has(ticket['state']) &&
    Array.isArray(ticket['pullRequests']);
}

function mapEvent(value: unknown): value is MapEvent {
  const event = record(value);
  const ticket = record(event?.['ticket']);
  return event !== null &&
    Number.isSafeInteger(event['id']) &&
    typeof event['repo'] === 'string' &&
    Number.isSafeInteger(event['mapNumber']) &&
    typeof event['at'] === 'string' &&
    typeof event['type'] === 'string' && EVENT_TYPES.has(event['type']) &&
    ticket !== null && Number.isSafeInteger(ticket['number']) && typeof ticket['title'] === 'string';
}

function storedMap(value: unknown): StoredMapWatch | null {
  const map = record(value);
  if (
    map === null ||
    typeof map['repo'] !== 'string' ||
    normalizeRepo(map['repo']) === null ||
    !Number.isSafeInteger(map['mapNumber']) ||
    (map['mapNumber'] as number) <= 0 ||
    (map['etag'] !== null && typeof map['etag'] !== 'string') ||
    !Array.isArray(map['tickets']) || !map['tickets'].every(watchedTicket) ||
    !Array.isArray(map['history']) || !map['history'].every(mapEvent) ||
    !Array.isArray(map['pullRequestsRead']) || !map['pullRequestsRead'].every((number) => Number.isSafeInteger(number) && number > 0) ||
    typeof map['lastPolledAt'] !== 'number' || !Number.isFinite(map['lastPolledAt'])
  ) return null;
  return {
    repo: normalizeRepo(map['repo'])!,
    mapNumber: map['mapNumber'] as number,
    etag: map['etag'] as string | null,
    tickets: map['tickets'],
    history: map['history'],
    pullRequestsRead: map['pullRequestsRead'],
    lastPolledAt: map['lastPolledAt'],
  };
}

function readState(value: unknown): MapWatchState | null {
  const state = record(value);
  if (
    state === null ||
    state['version'] !== 1 ||
    !Number.isSafeInteger(state['nextEventId']) ||
    (state['nextEventId'] as number) < 1 ||
    !Array.isArray(state['maps'])
  ) return null;
  return {
    nextEventId: state['nextEventId'] as number,
    maps: state['maps'].map(storedMap).filter((map): map is StoredMapWatch => map !== null),
  };
}

/** Keeps opened maps' ETags, last ticket state, and recent events across an app restart. */
export class MapWatchStore implements MapWatchStateStore {
  constructor(private readonly path = mapWatchStorePath()) {}

  async load(): Promise<MapWatchState | null> {
    try {
      return readState(JSON.parse(await readFile(this.path, 'utf8')) as unknown);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      return null;
    }
  }

  async save(state: MapWatchState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${String(process.pid)}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ version: 1, ...state }, null, 2)}\n`, 'utf8');
    await rename(temporary, this.path);
  }
}
