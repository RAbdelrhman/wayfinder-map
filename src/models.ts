/** What T3 Code can run, trimmed to what the model picker needs. */
export interface ModelCatalog {
  providers: CatalogProvider[];
}

export interface CatalogProvider {
  instanceId: string;
  name: string;
  /** False when T3 Code reports the provider as erroring or signed out. Its models still show, marked. */
  ready: boolean;
  models: CatalogModel[];
}

export interface CatalogModel {
  slug: string;
  name: string;
  isDefault: boolean;
  /** The model's reasoning knob, whatever the provider calls it. Null when it has none. */
  effort: EffortOption | null;
}

export interface EffortOption {
  id: string;
  label: string;
  options: Array<{ id: string; label: string }>;
  defaultValue: string | null;
}

/** A model picked in the UI: which provider instance, which model, and optionally how hard it thinks. */
export interface ModelChoice {
  instanceId: string;
  model: string;
  effort?: { id: string; value: string };
}

export const TIERS = ['simple', 'mid', 'hard'] as const;
export type Tier = (typeof TIERS)[number];

/** Descriptor ids providers use for reasoning depth: Codex and Grok, Claude, OpenCode. */
const EFFORT_IDS = ['reasoningEffort', 'effort', 'variant'];

interface RawDescriptor {
  id?: unknown;
  label?: unknown;
  type?: unknown;
  options?: Array<{ id?: unknown; label?: unknown; isDefault?: unknown }>;
}

interface RawModel {
  slug?: unknown;
  name?: unknown;
  isDefault?: unknown;
  hidden?: unknown;
  capabilities?: { optionDescriptors?: RawDescriptor[] } | null;
}

interface RawProvider {
  instanceId?: unknown;
  displayName?: unknown;
  enabled?: unknown;
  installed?: unknown;
  status?: unknown;
  models?: RawModel[];
}

function effortOf(model: RawModel): EffortOption | null {
  const descriptors = model.capabilities?.optionDescriptors ?? [];
  const descriptor = EFFORT_IDS.map((id) => descriptors.find((d) => d.id === id && d.type === 'select')).find(Boolean);
  if (descriptor === undefined || typeof descriptor.id !== 'string') return null;
  const options = (descriptor.options ?? [])
    .filter((option): option is { id: string; label?: unknown; isDefault?: unknown } => typeof option.id === 'string')
    .map((option) => ({ id: option.id, label: typeof option.label === 'string' ? option.label : option.id, isDefault: option.isDefault === true }));
  if (options.length === 0) return null;
  return {
    id: descriptor.id,
    label: typeof descriptor.label === 'string' ? descriptor.label : 'Reasoning',
    options: options.map(({ id, label }) => ({ id, label })),
    defaultValue: options.find((option) => option.isDefault)?.id ?? null,
  };
}

/** Turn T3 Code's `server.getConfig` providers into the picker's catalog: enabled and installed only. */
export function toCatalog(rawProviders: readonly RawProvider[]): ModelCatalog {
  const providers: CatalogProvider[] = [];
  for (const raw of rawProviders) {
    if (raw.enabled !== true || raw.installed !== true || typeof raw.instanceId !== 'string') continue;
    const models = (raw.models ?? [])
      .filter((model) => typeof model.slug === 'string' && model.hidden !== true)
      .map((model) => ({
        slug: model.slug as string,
        name: typeof model.name === 'string' ? model.name : (model.slug as string),
        isDefault: model.isDefault === true,
        effort: effortOf(model),
      }));
    if (models.length === 0) continue;
    providers.push({
      instanceId: raw.instanceId,
      name: typeof raw.displayName === 'string' ? raw.displayName : raw.instanceId,
      ready: raw.status === 'ready',
      models,
    });
  }
  return { providers };
}

/** The `modelSelection` T3 Code's thread commands take. */
export function toModelSelection(choice: ModelChoice): Record<string, unknown> {
  return {
    instanceId: choice.instanceId,
    model: choice.model,
    ...(choice.effort ? { options: [{ id: choice.effort.id, value: choice.effort.value }] } : {}),
  };
}

/** Accept a model choice from a request body, or null for "let T3 Code decide". */
export function parseModelChoice(value: unknown): ModelChoice | null {
  if (typeof value !== 'object' || value === null) return null;
  const { instanceId, model, effort } = value as Record<string, unknown>;
  if (typeof instanceId !== 'string' || typeof model !== 'string' || instanceId === '' || model === '') return null;
  const choice: ModelChoice = { instanceId, model };
  if (typeof effort === 'object' && effort !== null) {
    const { id, value: level } = effort as Record<string, unknown>;
    if (typeof id === 'string' && typeof level === 'string') choice.effort = { id, value: level };
  }
  return choice;
}
