import type { MapSections } from './types.js';

const EMPTY: MapSections = {
  destination: '',
  notes: '',
  decisions: '',
  fog: '',
  outOfScope: '',
};

/** Heading text (lowercased) to the section it fills. Aliases included on purpose. */
const HEADINGS: ReadonlyArray<readonly [RegExp, keyof MapSections]> = [
  [/^destination$/, 'destination'],
  [/^notes$/, 'notes'],
  [/^decisions so far$/, 'decisions'],
  [/^decisions$/, 'decisions'],
  [/^not yet specified$/, 'fog'],
  [/^fog$/, 'fog'],
  [/^out of scope$/, 'outOfScope'],
];

/** Split a map body on its `##` headings into the sections the map format defines. */
export function parseMapBody(body: string): MapSections {
  const out: MapSections = { ...EMPTY };
  let current: keyof MapSections | null = null;
  const buffers = new Map<keyof MapSections, string[]>();

  for (const line of body.split(/\r?\n/)) {
    const heading = /^#{1,6}\s+(.*?)\s*$/.exec(line);
    if (heading) {
      const text = (heading[1] ?? '').trim().toLowerCase();
      current = HEADINGS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
      continue;
    }
    if (current === null) continue;
    const buffer = buffers.get(current) ?? [];
    buffer.push(line);
    buffers.set(current, buffer);
  }

  for (const [key, lines] of buffers) out[key] = lines.join('\n').trim();
  return out;
}

/**
 * Issue numbers named by a `Blocked by: #4, #7` line. The documented fallback for
 * repos without GitHub's native issue dependencies.
 */
export function parseBlockedByLine(body: string): number[] {
  const line = /^\s*blocked by:\s*(.+)$/im.exec(body);
  if (!line) return [];
  const numbers = (line[1] ?? '').matchAll(/#(\d+)/g);
  return [...new Set([...numbers].map((m) => Number(m[1])))];
}

/**
 * Issue numbers a map body lists as children, used when the sub-issues endpoint is
 * unavailable. Matches both `- [ ] #12` task lists and full issue URLs.
 */
export function parseChildNumbers(body: string, repo: string): number[] {
  const found: number[] = [];
  for (const match of body.matchAll(/^\s*[-*]\s*\[[ xX]\]\s*.*?#(\d+)/gm)) {
    found.push(Number(match[1]));
  }
  const urlPattern = new RegExp(`github\\.com/${escapeRegExp(repo)}/issues/(\\d+)`, 'g');
  for (const match of body.matchAll(urlPattern)) found.push(Number(match[1]));
  return [...new Set(found)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
