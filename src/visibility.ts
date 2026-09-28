import type { MapVisibility } from './types.js';

/** Shown beside every private map's visibility status, and repeated in the docs. */
export const PRIVATE_NOTE = 'Private in Wayfinder only. If the repository is public, this issue can still be read on GitHub.';

/** A map is public only when its body has a `Visibility: public` line. Everything else, including older maps, is private. */
export function mapVisibility(body: string): MapVisibility {
  return /^[ \t]*visibility:[ \t]*public[ \t]*$/im.test(body) ? 'public' : 'private';
}

/** Who is looking, and which public maps in this repository they follow. */
export interface Viewer {
  login: string;
  follows: readonly number[];
}

/**
 * Whether the viewer sees a map: their own maps always, someone else's only when it is public and
 * they follow it. The author's GitHub author_association plays no part.
 */
export function isMapShown(map: { number: number; author: string | null; visibility: MapVisibility }, viewer: Viewer): boolean {
  if (map.author !== null && map.author.toLowerCase() === viewer.login.toLowerCase()) return true;
  return map.visibility === 'public' && viewer.follows.includes(map.number);
}

/** "12 maps from other people are hidden." */
export function hiddenMapsMessage(count: number): string {
  if (count <= 0) return '';
  return count === 1 ? '1 map from other people is hidden.' : `${String(count)} maps from other people are hidden.`;
}
