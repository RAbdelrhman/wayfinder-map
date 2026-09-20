/* Stroke icons on a 24px grid, drawn with currentColor so they take their text colour. */

export function icon(path: string): string {
  return `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

/* ---------- ticket states ---------- */
export const CHECK = '<path d="M20 6 9 17l-5-5"/>';
export const LOCK = '<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>';
export const PERSON = '<path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="7" r="4"/>';
export const ARROW = '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>';

/* ---------- ticket types ---------- */
/** A magnifier: go and find out. */
export const LENS = '<circle cx="11" cy="11" r="6.4"/><path d="m20 20-4.4-4.4"/>';
/** A beaker: build the small thing and see what happens. */
export const BEAKER =
  '<path d="M9.5 3h5"/><path d="M10.8 3v6.4L5.5 17.9A2 2 0 0 0 7.2 21h9.6a2 2 0 0 0 1.7-3.1L13.2 9.4V3"/><path d="M7.8 15h8.4"/>';
/** A kettle grill, heat and all: hold the idea over the flame. */
export const GRILL =
  '<path d="M3.5 8.5h17"/><path d="M5 8.5a7 7 0 0 0 14 0"/><path d="m8.4 14.5-2.4 6.3"/><path d="m15.6 14.5 2.4 6.3"/><path d="M9.6 2.3c-1 1.1.6 1.7 0 2.9"/><path d="M14.4 2.3c-1 1.1.6 1.7 0 2.9"/>';
/** A list: a known job, written down. */
export const LIST = '<path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/><path d="M8.5 6H20"/><path d="M8.5 12H20"/><path d="M8.5 18H20"/>';
/** A circle with a bar through it: no wayfinder:<type> label on the issue. */
export const BLANK = '<circle cx="12" cy="12" r="7.4"/><path d="M8.6 12h6.8"/>';

/* ---------- chrome ---------- */
export const COMPASS = '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>';
export const HOME = '<path d="m3 10.5 9-7 9 7"/><path d="M5.5 9.2V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.2"/>';
/** A bound book: one repository. */
export const REPO = '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v18H6.5A1.5 1.5 0 0 1 5 19.5z"/><path d="M5 16.5A1.5 1.5 0 0 1 6.5 15H19"/>';
export const SIGN_OUT = '<path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>';
export const GRAPH = '<rect x="3" y="4" width="7" height="6" rx="1.5"/><rect x="14" y="14" width="7" height="6" rx="1.5"/><path d="M10 7h1.5a2.5 2.5 0 0 1 2.5 2.5V14"/>';
export const TABLE = '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>';
export const SLIDERS = '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>';
export const REFRESH = '<path d="M20 11a8 8 0 0 0-14.9-3.5L3 10"/><path d="M3 4v6h6"/><path d="M4 13a8 8 0 0 0 14.9 3.5L21 14"/><path d="M21 20v-6h-6"/>';
export const MOON = '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>';
export const CHEVRON = '<path d="m6 9 6 6 6-6"/>';
export const EXTERNAL = '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>';
export const PLAY = '<path d="M7 4v16l13-8z" fill="currentColor"/>';
export const COPY = '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>';
export const INFO = '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>';
export const MINUS = '<path d="M5 12h14"/>';
export const PLUS = '<path d="M12 5v14M5 12h14"/>';
/** An open folder: point Wayfinder at a checkout on disk. */
export const FOLDER = '<path d="M4 20a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5l2 2.5h8a1 1 0 0 1 1 1V10"/><path d="m3.6 19.6 2.3-7.2a1 1 0 0 1 1-.7h13.5a1 1 0 0 1 1 1.3l-2 6.3a1 1 0 0 1-1 .7H4"/>';
