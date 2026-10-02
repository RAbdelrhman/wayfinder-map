import type { MapEvent } from './mapWatch.js';
import { TIERS } from './models.js';
import type { ModelChoice, Tier } from './models.js';
import type { Batch } from './startNextRunner.js';

/* The auto map (#164): a per-map opt-in that hands off every ticket as the watcher reports it became next. The server runs it (#182). */

/** Auto is the default tier: Wayfinder rates each ticket and picks its tier and model (#166). */
export const AUTO_MAP_TIERS = ['auto', ...TIERS] as const;
export type AutoMapTier = (typeof AUTO_MAP_TIERS)[number];

export interface AutoMapSetting {
  enabled: boolean;
  tier: AutoMapTier;
  /** The setup dialog was confirmed once, so the toggle flips directly from then on. */
  setUp: boolean;
  /** When it was last turned on. Events and batches from before that never count. */
  enabledAt: string | null;
}

export const DEFAULT_AUTO_MAP: AutoMapSetting = { enabled: false, tier: 'auto', setUp: false, enabledAt: null };

export function autoMapKey(repo: string, mapNumber: number): string {
  return `${repo.toLowerCase()}#${String(mapNumber)}`;
}

/** A usable setting from whatever was saved. Anything odd falls back to off. */
export function parseAutoMapSetting(value: unknown): AutoMapSetting {
  if (typeof value !== 'object' || value === null) return DEFAULT_AUTO_MAP;
  const raw = value as Record<string, unknown>;
  const tier = AUTO_MAP_TIERS.find((candidate) => candidate === raw['tier']) ?? DEFAULT_AUTO_MAP.tier;
  const enabledAt = typeof raw['enabledAt'] === 'string' && !Number.isNaN(Date.parse(raw['enabledAt'])) ? raw['enabledAt'] : null;
  return { enabled: raw['enabled'] === true && enabledAt !== null, tier, setUp: raw['setUp'] === true, enabledAt };
}

/** The setting after the toggle or the setup dialog's confirm turned it on. */
export function turnedOn(setting: AutoMapSetting, now: Date, tier: AutoMapTier = setting.tier): AutoMapSetting {
  return { enabled: true, tier, setUp: true, enabledAt: now.toISOString() };
}

export function turnedOff(setting: AutoMapSetting): AutoMapSetting {
  return { ...setting, enabled: false };
}

/** One batch the auto map hands to Start next: the body of its start request. */
export interface AutoMapStartBody {
  map: number;
  cap: number;
  auto: true;
  tickets: Array<{ ticket: number; tier: Tier; model: ModelChoice | null; auto?: Record<string, unknown> }>;
}

/** The tier a ticket runs on when Auto cannot rate it, e.g. its map could not be read: Mid. */
export function resolveAutoMapTier(tier: AutoMapTier): Tier {
  return tier === 'auto' ? 'mid' : tier;
}

/**
 * The tickets an auto map should hand off for these map events: those that became next after it
 * was turned on, in ticket order. A catch-up after a quit reports what became next while the app
 * was closed, and starts nothing (#124).
 */
export function autoStartTickets(events: readonly MapEvent[], setting: AutoMapSetting): number[] {
  if (!setting.enabled || setting.enabledAt === null) return [];
  const since = Date.parse(setting.enabledAt);
  const tickets = events
    .filter((event) => event.type === 'ticket-next' && event.whileYouWereAway !== true && Date.parse(event.at) >= since)
    .map((event) => event.ticket.number);
  return [...new Set(tickets)].sort((a, b) => a - b);
}

/**
 * The usage-limit stop that should turn this map's auto map off: a batch the auto map started
 * after it was last turned on, which the first usage-limit error stopped.
 */
export function autoMapUsageStop(batches: readonly Batch[], repo: string, mapNumber: number, setting: AutoMapSetting): Batch | undefined {
  if (!setting.enabled || setting.enabledAt === null) return undefined;
  const since = Date.parse(setting.enabledAt);
  return batches.find(
    (batch) =>
      batch.auto &&
      batch.repo.toLowerCase() === repo.toLowerCase() &&
      batch.mapNumber === mapNumber &&
      batch.stop?.kind === 'usage-limit' &&
      Date.parse(batch.createdAt) >= since,
  );
}
