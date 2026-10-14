/** The colour picker's arithmetic: #rrggbb in and out, HSV for the square and the hue slider. */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const hex2 = (n: number): string => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');
export const toHex = ([r, g, b]: readonly [number, number, number]): string => `#${hex2(r)}${hex2(g)}${hex2(b)}`;
export const toRgb = (hex: string): [number, number, number] => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)) as [number, number, number];
export const rgbText = (hex: string): string => `rgb(${toRgb(hex).join(', ')})`;

/** Accepts #1659a8, 1659a8, #15a, rgb(22, 89, 168), rgba(22, 89, 168, 0.5), 22, 89, 168 or 22 89 168. */
export function parseColor(raw: string): string | null {
  const text = raw.trim().toLowerCase();
  let m = /^#?([0-9a-f]{6})$/.exec(text);
  if (m) return `#${m[1]!}`;
  m = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text);
  if (m) return `#${m[1]!}${m[1]!}${m[2]!}${m[2]!}${m[3]!}${m[3]!}`;
  m = /^(?:rgba?\()?\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)?$/.exec(text);
  if (m && [m[1], m[2], m[3]].every((n) => Number(n) <= 255)) return toHex([Number(m[1]), Number(m[2]), Number(m[3])]);
  return null;
}

export function toHsv(hex: string): Hsv {
  const [r, g, b] = toRgb(hex).map((n) => n / 255) as [number, number, number];
  const max = Math.max(r, g, b),
    d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

export function fromHsv({ h, s, v }: Hsv): string {
  const f = (n: number): number => {
    const k = (n + h / 60) % 6;
    return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255;
  };
  return toHex([f(5), f(3), f(1)]);
}

export const BASIC_COLORS: readonly (readonly [string, string])[] = [
  ['#000000', 'Black'],
  ['#ffffff', 'White'],
  ['#808080', 'Grey'],
  ['#e53935', 'Red'],
  ['#fb8c00', 'Orange'],
  ['#fdd835', 'Yellow'],
  ['#43a047', 'Green'],
  ['#00897b', 'Teal'],
  ['#1e88e5', 'Blue'],
  ['#3949ab', 'Indigo'],
  ['#8e24aa', 'Purple'],
  ['#d81b60', 'Pink'],
];

/** The project's own tokens, as the app's stylesheet defines them. */
export const PROJECT_COLOR_TOKENS: readonly (readonly [string, string])[] = [
  ['--accent-fill', 'Accent'],
  ['--accent-text', 'Accent text'],
  ['--state-claimed', 'Claimed'],
  ['--state-frontier', 'Frontier'],
  ['--state-blocked', 'Blocked'],
  ['--handoff-needs-you', 'Needs you'],
  ['--handoff-pr-ready', 'PR ready'],
  ['--text-primary', 'Text'],
  ['--text-muted', 'Muted text'],
  ['--surface-1', 'Surface'],
  ['--plane', 'Plane'],
];
