export type ObjectKind = 'repo' | 'map' | 'ticket' | 'prototype';

export type ObjectLink =
  | { kind: 'repo' | 'map' | 'ticket'; id: string }
  | { kind: 'prototype'; id: string; canvas: string; revision?: string; page?: string; item?: string };

/** IDs are opaque. Their spelling never determines a GitHub object's type. */
export function validObjectId(value: string): boolean {
  return value.length > 0 && value.length <= 512 && value !== '.' && value !== '..'
    && [...value].every(character => character.charCodeAt(0) > 32 && character.charCodeAt(0) !== 127);
}

export function validCanvasPath(value: string): boolean {
  return value.length <= 2048 && value.startsWith('prototypes/') && /\.html?$/i.test(value)
    && value.split('/').every(part => validObjectId(part) && !/[\\?#%:]/.test(part));
}

function valid(link: ObjectLink): boolean {
  if (!validObjectId(link.id)) return false;
  if (link.kind !== 'prototype') return true;
  return validCanvasPath(link.canvas)
    && (link.revision === undefined || /^[a-f0-9]{40}$/i.test(link.revision))
    && (link.page === undefined || validObjectId(link.page))
    && (link.item === undefined || validObjectId(link.item));
}

/** Prototype IDs combine the ticket's global ID with its board path. No local registry. */
export function objectAppLink(link: ObjectLink): string {
  if (!valid(link)) throw new Error('Invalid Wayfinder destination');
  const url = new URL(`wayfinder://${link.kind}/${encodeURIComponent(link.id)}`);
  if (link.kind === 'prototype') {
    url.searchParams.set('canvas', link.canvas);
    if (link.revision !== undefined) url.searchParams.set('rev', link.revision);
    if (link.page !== undefined) url.searchParams.set('page', link.page);
    if (link.item !== undefined) url.searchParams.set('item', link.item);
  }
  return url.href;
}

export function parseObjectAppLink(value: string): ObjectLink | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'wayfinder:' || url.port || url.username || url.password || url.hash) return null;
    const kind = url.hostname;
    if (kind !== 'repo' && kind !== 'map' && kind !== 'ticket' && kind !== 'prototype') return null;
    const parts = url.pathname.split('/');
    if (parts.length !== 2) return null;
    const id = decodeURIComponent(parts[1] ?? '');
    let link: ObjectLink;
    if (kind === 'prototype') {
      const allowed = new Set(['canvas', 'rev', 'page', 'item']);
      if ([...url.searchParams.keys()].some(key => !allowed.has(key) || url.searchParams.getAll(key).length !== 1)) return null;
      link = { kind, id, canvas: url.searchParams.get('canvas') ?? '' };
      const revision = url.searchParams.get('rev');
      const page = url.searchParams.get('page');
      const item = url.searchParams.get('item');
      if (revision !== null) link.revision = revision;
      if (page !== null) link.page = page;
      if (item !== null) link.item = item;
    } else {
      if (url.search) return null;
      link = { kind, id };
    }
    return valid(link) ? link : null;
  } catch {
    return null;
  }
}

/** Same destination on the existing web server, without putting its origin in an ID. */
export function objectWebPath(link: ObjectLink): string {
  return objectAppLink(link).replace('wayfinder://', '/open/');
}

export function parseObjectWebPath(path: string): ObjectLink | null {
  return path.startsWith('/open/') ? parseObjectAppLink(path.replace('/open/', 'wayfinder://')) : null;
}
