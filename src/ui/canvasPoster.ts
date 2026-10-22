import { parsePrototypeFilePath } from '../prototypes.js';
import { escapeHtml } from './markdown.js';
import { bone } from './skeleton.js';
import type { CanvasRoute } from './canvasViewer.js';

/** Loads and decodes one picture; rejects when it is missing or cannot be decoded. */
export type PosterLoader = (url: string) => Promise<HTMLImageElement>;

export const loadPoster: PosterLoader = (url) =>
  new Promise((resolve, reject) => {
    const image = document.createElement('img');
    image.alt = '';
    image.onerror = () => reject(new Error('poster failed'));
    if (typeof image.decode === 'function') {
      image.src = url;
      image.decode().then(() => resolve(image), reject);
    } else {
      image.onload = () => resolve(image);
      image.src = url;
    }
  });

/**
 * Pictures kept ready for the viewer's stage. A poster counts only once it has decoded: one that is still
 * loading, missing or failed is never shown (the skeleton stays), so a click never paints a broken image.
 */
export class PosterCache {
  private readonly entries = new Map<string, { image: HTMLImageElement | null; settled: Promise<HTMLImageElement | null> }>();
  constructor(
    private readonly load: PosterLoader = loadPoster,
    private readonly limit = 24,
  ) {}
  /** Starts loading `url` unless it already is. */
  request(url: string): void {
    if (this.entries.has(url)) return;
    const entry: { image: HTMLImageElement | null; settled: Promise<HTMLImageElement | null> } = {
      image: null,
      settled: Promise.resolve(null),
    };
    entry.settled = this.load(url).then(
      (image) => (entry.image = image),
      () => null,
    );
    this.entries.set(url, entry);
    this.trim();
  }
  private trim(): void {
    for (const old of this.entries.keys()) {
      if (this.entries.size <= this.limit) break;
      this.entries.delete(old);
    }
  }
  /** A picture the page already decoded, such as a tile's own screenshot. */
  adopt(url: string, image: HTMLImageElement): void {
    if (!this.entries.has(url)) this.entries.set(url, { image, settled: Promise.resolve(image) });
    this.trim();
  }
  /** The decoded picture, or null while it loads, after it failed, or if it was never requested. */
  ready(url: string): HTMLImageElement | null {
    return this.entries.get(url)?.image ?? null;
  }
  /** Resolves with the picture once it decodes, or null if it fails. */
  whenReady(url: string): Promise<HTMLImageElement | null> {
    this.request(url);
    return this.entries.get(url)?.settled ?? Promise.resolve(null);
  }
}

/** A stored poster's address from a canvas entry's `data-canvas-poster`: a prototype file on this origin, or null. */
export function readCanvasPoster(value: string | undefined, origin: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || parsePrototypeFilePath(url.pathname) === null) return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

/**
 * The picture that stands in for a canvas on the entry that opened it: a variant tile's own screenshot, or
 * the board's stored poster. Tiles that preview a live page have neither, and show the skeleton alone.
 */
export function posterSource(from: Element | null, origin: string): { url: string; tile: HTMLImageElement | null } | null {
  const variant = from?.closest('.wf-var');
  if (variant) {
    const tile = variant.querySelector<HTMLImageElement>('img');
    const url = tile?.currentSrc || tile?.src;
    return tile && url ? { url, tile } : null;
  }
  const url = readCanvasPoster(from instanceof HTMLElement ? from.dataset['canvasPoster'] : undefined, origin);
  return url === null ? null : { url, tile: null };
}

/**
 * Loading placeholder for the stage, drawn from what the entry already knows: the app's own loading bars
 * (`bone()`, `.wf-bone`) with the option ids and names the route carries. Nothing here is a new string.
 */
export function canvasSkeletonHtml(route: CanvasRoute): string {
  const option = route.variants?.find((variant) => variant.id === route.variant);
  const page = '<div class="vw-skel-present"><span class="wf-bone is-block vw-skel-page"></span></div>';
  if (option) {
    return `<div class="vw-skeleton is-option" aria-hidden="true"><div class="vw-skel-bar">${bone('54px')}<b>${escapeHtml(option.id)} · ${escapeHtml(option.name)}</b><span class="vw-skel-gap"></span>${bone('40px')}</div>${page}</div>`;
  }
  const frames = (route.variants ?? [])
    .map(
      (variant) =>
        `<figure class="vw-skel-frame"><figcaption><b>${escapeHtml(variant.id)}</b>${escapeHtml(variant.name)}</figcaption><span class="wf-bone is-block vw-skel-shot"></span></figure>`,
    )
    .join('');
  return `<div class="vw-skeleton is-board" aria-hidden="true"><div class="vw-skel-bar">${bone('120px')}<span class="vw-skel-gap"></span>${bone('60px')}</div>${frames === '' ? page : `<div class="vw-skel-plane"><div class="vw-skel-grid">${frames}</div></div>`}</div>`;
}
