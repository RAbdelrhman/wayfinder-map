import { mapKey, validRef } from './github';
import type { MapRef } from './github';

/** The shared card is the only action for that map, including with stale cached rows. */
export function hiddenFollowRows<T extends MapRef>(
  maps: T[],
  following: ReadonlySet<string>,
  shared: MapRef | null,
): T[] {
  return maps.filter(
    (map) =>
      following.has(mapKey(map)) && (!shared || mapKey(map) !== mapKey(shared)),
  );
}

/** Accept GitHub issue references only; never send arbitrary shared URLs to GitHub. */
export function sharedMapRef(text: string): MapRef | null {
  const reference = /^([\w.-]+\/[\w.-]+)#([1-9]\d*)$/.exec(text.trim());
  if (reference) {
    const ref = { repo: reference[1] ?? '', number: Number(reference[2]) };
    return validRef(ref) ? ref : null;
  }
  const candidate = text.match(/https:\/\/github\.com\/[^\s]+/i)?.[0];
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    const match = /^\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)\/?$/.exec(
      url.pathname,
    );
    if (
      url.protocol !== 'https:' ||
      url.hostname.toLowerCase() !== 'github.com' ||
      url.username ||
      url.password ||
      url.port ||
      !match
    )
      return null;
    const ref = { repo: `${match[1]}/${match[2]}`, number: Number(match[3]) };
    return validRef(ref) ? ref : null;
  } catch {
    return null;
  }
}
