/** Small readers for untrusted JSON: a request body, or a record read back from disk. Each returns null for anything else. */

export function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function text(value: unknown, max = 200): string | null {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, max) : null;
}

export function isoTime(value: unknown): string | null {
  const raw = text(value, 40);
  return raw !== null && Number.isFinite(Date.parse(raw)) ? raw : null;
}

/** A finite number of at least zero, e.g. a duration or a token count. */
export function amount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function oneOf<T extends string>(options: readonly T[], value: unknown): T | undefined {
  return options.find((candidate) => candidate === value);
}
