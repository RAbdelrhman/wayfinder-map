import { findModel, liveChoice, parseAutoRater, parseCalibrationMode, TIERS } from '../models.js';
import type { AutoRater, CalibrationMode, CatalogModel, ModelCatalog, ModelChoice, Tier } from '../models.js';
import { pushServerSettings } from './serverSettings.js';
import { readRouteJson, routeData } from './routeData.js';

/* The model picker: what T3 Code can run, a default per task tier, and a tier per ticket. */

export const TIER_LABEL: Record<Tier, string> = { simple: 'Simple', mid: 'Mid', hard: 'Hard' };
export const TIER_HINT: Record<Tier, string> = {
  simple: 'Small, well-scoped changes',
  mid: 'Most tickets',
  hard: 'Research, design, gnarly bugs',
};
export const DEFAULT_TIER: Tier = 'mid';

export const TIER_DEFAULTS_KEY = 'wayfinder-map:tier-models:v1';
const TICKET_TIER_KEY = 'wayfinder-map:ticket-tier:v1';
const DEFAULT_TIER_KEY = 'wayfinder-map:default-tier:v1';

function isTier(value: string | null): value is Tier {
  return (TIERS as readonly string[]).includes(value ?? '');
}

/** The tier a ticket or new map starts on until the user picks another. Set in Settings. */
export function defaultTier(storage: Pick<Storage, 'getItem'> = localStorage): Tier {
  try {
    const saved = storage.getItem(DEFAULT_TIER_KEY);
    return isTier(saved) ? saved : DEFAULT_TIER;
  } catch {
    return DEFAULT_TIER;
  }
}

export function saveDefaultTier(tier: Tier, storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(DEFAULT_TIER_KEY, tier);
}

export const AUTO_RATER_KEY = 'wayfinder-map:auto-rater:v1';

export function autoRater(storage: Pick<Storage, 'getItem'> = localStorage): AutoRater {
  try {
    return parseAutoRater(JSON.parse(storage.getItem(AUTO_RATER_KEY) ?? 'null'));
  } catch {
    return { kind: 'logic' };
  }
}

export function saveAutoRater(rater: AutoRater, storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(AUTO_RATER_KEY, JSON.stringify(rater));
  pushServerSettings({ rater });
}

export const CALIBRATION_KEY = 'wayfinder-map:auto-calibration:v1';

export function calibrationMode(storage: Pick<Storage, 'getItem'> = localStorage): CalibrationMode {
  try {
    return parseCalibrationMode(JSON.parse(storage.getItem(CALIBRATION_KEY) ?? 'null'));
  } catch {
    return { kind: 'off' };
  }
}

export function saveCalibrationMode(mode: CalibrationMode, storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(CALIBRATION_KEY, JSON.stringify(mode));
  pushServerSettings({ calibration: mode });
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function tierDefaults(): Partial<Record<Tier, ModelChoice>> {
  return readJson<Partial<Record<Tier, ModelChoice>>>(TIER_DEFAULTS_KEY, {});
}

export function saveTierDefault(tier: Tier, choice: ModelChoice | null): void {
  const next = tierDefaults();
  if (choice === null) delete next[tier];
  else next[tier] = choice;
  localStorage.setItem(TIER_DEFAULTS_KEY, JSON.stringify(next));
  pushServerSettings({ tierModels: next });
}

export function ticketTier(repo: string, ticket: number): Tier {
  const saved = readJson<Record<string, string>>(TICKET_TIER_KEY, {})[`${repo}#${String(ticket)}`] ?? null;
  return isTier(saved) ? saved : defaultTier();
}

export function saveTicketTier(repo: string, ticket: number, tier: Tier): void {
  const all = readJson<Record<string, string>>(TICKET_TIER_KEY, {});
  all[`${repo}#${String(ticket)}`] = tier;
  localStorage.setItem(TICKET_TIER_KEY, JSON.stringify(all));
}

/* ---------- catalog ---------- */

export type CatalogState = { status: 'loading' } | { status: 'ready'; catalog: ModelCatalog } | { status: 'unavailable'; reason: string };

let catalogState: CatalogState = { status: 'loading' };
let inFlight: Promise<CatalogState> | null = null;
let catalogVerified = false;

export function currentCatalog(): CatalogState {
  if (catalogState.status === 'loading') {
    const saved = routeData().peek<ModelCatalog>('/api/models');
    if (saved !== null) catalogState = { status: 'ready', catalog: saved };
  }
  return catalogState;
}

/** Ask the server for T3 Code's models. `force` re-reads, for when the user opens the settings. */
export function loadCatalog(force = false): Promise<CatalogState> {
  if (!force && catalogVerified && catalogState.status === 'ready') return Promise.resolve(catalogState);
  inFlight ??= readRouteJson<ModelCatalog>('/api/models', true)
    .then((body) => {
      catalogState = { status: 'ready', catalog: body };
      catalogVerified = true;
      return catalogState;
    })
    .catch(() => (catalogState = currentCatalog().status === 'ready' ? catalogState : { status: 'unavailable', reason: 'T3 Code is not reachable.' }))
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/* ---------- controls ---------- */

const SEPARATOR = '::';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${String(char.charCodeAt(0))};`);
}

/** A model `<select>` grouped by provider, with "T3 Code default" on top. */
export function modelSelectHtml(catalog: ModelCatalog, choice: ModelChoice | null, attrs: string): string {
  const groups = catalog.providers
    .map((provider) => {
      const options = provider.models
        .map((model) => {
          const value = `${provider.instanceId}${SEPARATOR}${model.slug}`;
          const on = choice?.instanceId === provider.instanceId && choice.model === model.slug;
          return `<option value="${escapeHtml(value)}"${on ? ' selected' : ''}>${escapeHtml(model.name)}</option>`;
        })
        .join('');
      const label = provider.ready ? provider.name : `${provider.name} (not ready)`;
      return `<optgroup label="${escapeHtml(label)}">${options}</optgroup>`;
    })
    .join('');
  return `<select ${attrs}><option value=""${choice === null ? ' selected' : ''}>T3 Code default</option>${groups}</select>`;
}

/** The reasoning `<select>` for a model, or nothing when the model has no such knob. */
export function effortSelectHtml(model: CatalogModel | null, value: string | undefined, attrs: string): string {
  if (model?.effort == null) return '';
  const { effort } = model;
  const picked = value ?? effort.defaultValue;
  const options = effort.options
    .map((option) => {
      const suffix = option.id === effort.defaultValue ? ' (default)' : '';
      return `<option value="${escapeHtml(option.id)}"${option.id === picked ? ' selected' : ''}>${escapeHtml(option.label + suffix)}</option>`;
    })
    .join('');
  return `<select ${attrs} aria-label="${escapeHtml(effort.label)}">${options}</select>`;
}

/** Read a model and effort pair of selects back into a choice. */
export function readChoice(catalog: ModelCatalog, modelSelect: HTMLSelectElement, effortSelect: HTMLSelectElement | null): ModelChoice | null {
  const [instanceId, ...rest] = modelSelect.value.split(SEPARATOR);
  const slug = rest.join(SEPARATOR);
  if (!instanceId || !slug) return null;
  const model = findModel(catalog, { instanceId, model: slug });
  if (model === null) return null;
  const choice: ModelChoice = { instanceId, model: slug };
  if (model.effort !== null && effortSelect !== null && effortSelect.value !== '') {
    choice.effort = { id: model.effort.id, value: effortSelect.value };
  }
  return choice;
}

export { findModel, liveChoice, TIERS };
export type { AutoRater, CalibrationMode, ModelChoice, Tier };
