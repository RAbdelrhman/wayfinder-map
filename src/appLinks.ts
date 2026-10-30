import { objectWebPath, parseObjectAppLink } from './objectLinks.js';
import { parseHttpsObjectLink } from './httpsLinks.js';
import { mapPath } from './repoRoutes.js';

export interface MapLink {
  repo: string;
  mapNumber: number;
}

function validRepo(value: string): boolean {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value) && value.split('/').every((part) => part !== '.' && part !== '..');
}

/** One destination link for the installed desktop and phone apps. No local host or credentials. */
export function mapAppLink(repo: string, mapNumber: number): string {
  if (!validRepo(repo) || !Number.isSafeInteger(mapNumber) || mapNumber <= 0) throw new Error('Invalid map destination');
  return `wayfinder://map?repo=${encodeURIComponent(repo)}&number=${String(mapNumber)}`;
}

/** Accept only map destinations, never arbitrary paths, commands, hosts or nested URLs. */
export function parseMapAppLink(value: string): MapLink | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'wayfinder:' || url.hostname !== 'map' || url.port || url.username || url.password || url.hash || (url.pathname !== '' && url.pathname !== '/')) return null;
    const params = url.searchParams;
    if ([...params.keys()].some((key) => key !== 'repo' && key !== 'number') || params.getAll('repo').length !== 1 || params.getAll('number').length !== 1) return null;
    const repo = params.get('repo') ?? '';
    const number = params.get('number') ?? '';
    const mapNumber = Number(number);
    return validRepo(repo) && /^[1-9]\d*$/.test(number) && Number.isSafeInteger(mapNumber) ? { repo, mapNumber } : null;
  } catch {
    return null;
  }
}

/** T3's public native thread route, shared by desktop and production mobile. */
export function nativeThreadLink(value: string): string | null {
  try {
    const url = new URL(value);
    const threadRoute = url.protocol === 't3code:' && url.hostname === 'threads';
    const sharedRoute = url.protocol === 't3-thread:' && url.hostname === 'v2';
    if ((!threadRoute && !sharedRoute) || url.username || url.password || url.port || url.search || url.hash) return null;
    const parts = url.pathname.split('/');
    const valid = parts.length === 3 && parts.slice(1).every((part) => {
      const decoded = sharedRoute ? part : decodeURIComponent(part);
      return decoded.length > 0 && [...decoded].every((character) => character.charCodeAt(0) > 32 && character.charCodeAt(0) !== 127);
    });
    // Scoped T3 references contain raw IDs; their percent signs belong to the ID.
    return valid ? `t3code://threads/${parts.slice(1).map(part => encodeURIComponent(sharedRoute ? part : decodeURIComponent(part))).join('/')}` : null;
  } catch {
    return null;
  }
}

export function isT3ThreadLink(value: string): boolean {
  return nativeThreadLink(value) !== null;
}

/** The OS handler only navigates to known local app routes. */
export function wayfinderOpenPath(value: string): string | null {
  const object = parseObjectAppLink(value) ?? parseHttpsObjectLink(value);
  if (object) return objectWebPath(object);
  const map = parseMapAppLink(value);
  return map ? mapPath(map.repo, map.mapNumber) : null;
}

/** Allow the two concrete app routes alongside ordinary web links. */
export function isOpenableLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' || wayfinderOpenPath(value) !== null || isT3ThreadLink(value);
  } catch {
    return false;
  }
}
