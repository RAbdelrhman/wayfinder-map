import { objectWebPath, parseObjectWebPath, type ObjectLink } from './objectLinks.js';

/** Public link host owned by Wayfinder; it serves destinations, never GitHub data. */
export const WAYFINDER_LINK_ORIGIN = 'https://wayfinder-links-pearl.vercel.app';

export function objectHttpsLink(link: ObjectLink): string {
  return new URL(objectWebPath(link), WAYFINDER_LINK_ORIGIN).href;
}

/** Accept only our exact HTTPS origin and the existing strict object routes. */
export function parseHttpsObjectLink(value: string): ObjectLink | null {
  try {
    const url = new URL(value);
    if (url.origin !== WAYFINDER_LINK_ORIGIN || url.username || url.password || url.hash) return null;
    return parseObjectWebPath(`${url.pathname}${url.search}`);
  } catch {
    return null;
  }
}
