import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { autoMapKey, parseAutoMapSetting } from './autoMap.js';
import type { AutoMapSetting } from './autoMap.js';
import { parseAutoRater, parseTierModels } from './models.js';
import type { AutoRater, ModelChoice, Tier } from './models.js';
import { normalizeRepo } from './repoRoutes.js';

/* What the server keeps for the auto map (#182): each map's setting, the machine-wide settings the trigger reads, and the notices it left for the page's inbox. */

export interface AutoMapEntry {
  repo: string;
  mapNumber: number;
  setting: AutoMapSetting;
}

/** A field is null until someone sets it, so a page can tell "never set" from "set to the default". */
export interface AutoMapMachineSettings {
  /** How many hand-offs may run at once on this machine. */
  cap: number | null;
  /** The model each tier maps to in Settings. */
  tierModels: Partial<Record<Tier, ModelChoice>> | null;
  /** How Auto rates a ticket. */
  rater: AutoRater | null;
}

/** A notification the server raised while no page was there to put it in the inbox. */
export interface AutoMapNotice {
  id: string;
  kind: 'unblocked' | 'handOffError';
  repo: string;
  mapNumber: number;
  mapTitle: string;
  ticketNumber: number;
  ticketTitle: string;
  createdAt: string;
}

export interface AutoMapState {
  maps: AutoMapEntry[];
  settings: AutoMapMachineSettings;
  notices: AutoMapNotice[];
}

export const EMPTY_AUTO_MAP_STATE: AutoMapState = { maps: [], settings: { cap: null, tierModels: null, rater: null }, notices: [] };

export interface AutoMapStateStore {
  load(): Promise<AutoMapState>;
  save(state: AutoMapState): Promise<void>;
}

export const NOTICE_LIMIT = 50;

export function autoMapStorePath(home = homedir()): string {
  return join(home, '.wayfinder-map', 'auto-maps.json');
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function entryOf(value: unknown): AutoMapEntry | null {
  const raw = record(value);
  const repo = typeof raw?.['repo'] === 'string' ? normalizeRepo(raw['repo']) : null;
  const mapNumber = raw?.['mapNumber'];
  if (raw === null || repo === null || typeof mapNumber !== 'number' || !Number.isSafeInteger(mapNumber) || mapNumber <= 0) return null;
  return { repo, mapNumber, setting: parseAutoMapSetting(raw['setting']) };
}

function noticeOf(value: unknown): AutoMapNotice | null {
  const raw = record(value);
  if (
    raw === null ||
    typeof raw['id'] !== 'string' ||
    (raw['kind'] !== 'unblocked' && raw['kind'] !== 'handOffError') ||
    typeof raw['repo'] !== 'string' ||
    !Number.isSafeInteger(raw['mapNumber']) ||
    typeof raw['mapTitle'] !== 'string' ||
    !Number.isSafeInteger(raw['ticketNumber']) ||
    typeof raw['ticketTitle'] !== 'string' ||
    typeof raw['createdAt'] !== 'string'
  ) {
    return null;
  }
  return {
    id: raw['id'],
    kind: raw['kind'],
    repo: raw['repo'],
    mapNumber: raw['mapNumber'] as number,
    mapTitle: raw['mapTitle'],
    ticketNumber: raw['ticketNumber'] as number,
    ticketTitle: raw['ticketTitle'],
    createdAt: raw['createdAt'],
  };
}

/** A usable state from whatever was saved. Anything odd falls back to nothing set. */
export function parseAutoMapState(value: unknown): AutoMapState {
  const raw = record(value);
  if (raw === null) return EMPTY_AUTO_MAP_STATE;
  const settings = record(raw['settings']);
  const cap = settings?.['cap'];
  const maps = new Map<string, AutoMapEntry>();
  for (const entry of Array.isArray(raw['maps']) ? raw['maps'] : []) {
    const parsed = entryOf(entry);
    if (parsed !== null) maps.set(autoMapKey(parsed.repo, parsed.mapNumber), parsed);
  }
  return {
    maps: [...maps.values()],
    settings: {
      cap: typeof cap === 'number' && Number.isInteger(cap) && cap >= 1 ? cap : null,
      tierModels: settings?.['tierModels'] === undefined || settings['tierModels'] === null ? null : parseTierModels(settings['tierModels']),
      rater: settings?.['rater'] === undefined || settings['rater'] === null ? null : parseAutoRater(settings['rater']),
    },
    notices: (Array.isArray(raw['notices']) ? raw['notices'] : []).map(noticeOf).filter((notice): notice is AutoMapNotice => notice !== null).slice(0, NOTICE_LIMIT),
  };
}

/** Keeps the auto map settings and notices across an app restart, so a map stays on after a quit. */
export class AutoMapFileStore implements AutoMapStateStore {
  constructor(private readonly path = autoMapStorePath()) {}

  async load(): Promise<AutoMapState> {
    try {
      return parseAutoMapState(JSON.parse(await readFile(this.path, 'utf8')) as unknown);
    } catch {
      return EMPTY_AUTO_MAP_STATE;
    }
  }

  async save(state: AutoMapState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${String(process.pid)}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ version: 1, ...state }, null, 2)}\n`, 'utf8');
    await rename(temporary, this.path);
  }
}

export function memoryAutoMapStore(initial: AutoMapState = EMPTY_AUTO_MAP_STATE): AutoMapStateStore {
  let current = initial;
  return {
    load: () => Promise.resolve(structuredClone(current)),
    save: (state) => {
      current = structuredClone(state);
      return Promise.resolve();
    },
  };
}
