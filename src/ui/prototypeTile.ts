import { prototypeFileUrl } from '../prototypes.js';
import type { Prototype } from '../types.js';
import { escapeHtml } from './markdown.js';

/** The width a preview is laid out at before it is scaled down into its tile. */
const PREVIEW_WIDTH = 1280;
const PREVIEW_HEIGHT = 800;

export interface TileText {
  /** Small line above the title, e.g. `#8 · Home page map`. */
  eyebrow: string;
  title: string;
  /** Extra links in the footer, already HTML. Omitted when empty. */
  links?: string;
}

/**
 * The verdict's opening line of prose, as plain text, so a tile says what was decided.
 * Headings are skipped: a resolution comment usually opens with one, and "Decided spec"
 * tells the reader nothing.
 */
export function verdictGist(verdict: string): string {
  const rows = verdict.split(/\r?\n/).map((row) => row.trim());
  const prose = rows.filter((row) => row.length > 0 && !row.startsWith('#') && !/^-{3,}$/.test(row));
  const line = (prose.length > 0 ? prose : rows.filter((row) => row.length > 0))
    .map((row) =>
      row
        .replace(/^[#>*-]+\s*/, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\(?https?:\/\/\S+\)?/g, '')
        .replace(/[*`_[\]]/g, '')
        .trim(),
    )
    .find((row) => row.length > 0);
  if (line === undefined) return '';
  const sentence = /^.{40,}?[.!?](?=\s|$)/.exec(line)?.[0] ?? line;
  return sentence.length > 180 ? `${sentence.slice(0, 180)}…` : sentence;
}

function dateLabel(iso: string | null): string {
  if (iso === null) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Where the prototype opens full size, or null when nothing on its branch can run on its own. */
export function previewUrl(repo: string, prototype: Prototype): string | null {
  return prototype.preview === null ? null : prototypeFileUrl(repo, prototype.branch, prototype.preview);
}

/**
 * One prototype as a tile: a live, scaled-down copy of the page on top, what it is below.
 * Clicking the picture or the title opens the prototype full size in a new tab, running.
 */
export function prototypeTileHtml(repo: string, prototype: Prototype, text: TileText): string {
  const url = previewUrl(repo, prototype);
  const gist = prototype.verdict === null ? 'Still being worked on.' : verdictGist(prototype.verdict);
  const date = dateLabel(prototype.updatedAt);

  const picture =
    url === null
      ? `<div class="proto-thumb is-empty"><span>No preview saved for this prototype</span></div>`
      : `<a class="proto-thumb" href="${escapeHtml(url)}" target="_blank" rel="noreferrer" aria-label="Open ${escapeHtml(text.title)}">
          <iframe src="${escapeHtml(url)}" sandbox="allow-scripts" loading="lazy" tabindex="-1" aria-hidden="true" title=""
            width="${String(PREVIEW_WIDTH)}" height="${String(PREVIEW_HEIGHT)}"></iframe>
          <span class="proto-open">Open ↗</span>
        </a>`;
  const title =
    url === null
      ? escapeHtml(text.title)
      : `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(text.title)}</a>`;
  const footer = [date === '' ? '' : `<span>${escapeHtml(date)}</span>`, text.links ?? ''].filter((part) => part !== '').join('');

  return `<article class="proto-tile">
    ${picture}
    <div class="proto-tile-body">
      <p class="eyebrow">${escapeHtml(text.eyebrow)}</p>
      <h2>${title}</h2>
      ${gist === '' ? '' : `<p class="proto-gist">${escapeHtml(gist)}</p>`}
      ${footer === '' ? '' : `<div class="proto-tile-foot">${footer}</div>`}
    </div>
  </article>`;
}

/**
 * Previews are laid out at full size and scaled to their tile's width, so what you see in
 * the tile is the real page, not a stretched screenshot. Rescales when tiles resize.
 */
export function fitPrototypeThumbs(root: ParentNode): void {
  const thumbs = [...root.querySelectorAll<HTMLElement>('.proto-thumb:not(.is-empty)')];
  if (thumbs.length === 0) return;
  const fit = (thumb: HTMLElement): void => {
    thumb.style.setProperty('--thumb-scale', String(thumb.clientWidth / PREVIEW_WIDTH));
  };
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) fit(entry.target as HTMLElement);
  });
  for (const thumb of thumbs) {
    fit(thumb);
    observer.observe(thumb);
  }
}
