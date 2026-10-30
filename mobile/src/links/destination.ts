import type { ObjectLink } from '../../../src/objectLinks';
import type { ObjectDestination } from '../../../src/objectLookup';

/** Route data only: no token, origin, cached permission or desktop address. */
export function mobileDestination(link: ObjectLink, target: ObjectDestination): { pathname: '/' | '/map' | '/ticket' | '/canvas'; params: Record<string, string> } {
  if (target.kind === 'repo') return { pathname: '/', params: { repo: target.repo } };
  if (target.kind === 'map') return { pathname: '/map', params: { repo: target.repo, number: String(target.mapNumber) } };
  const params: Record<string, string> = { repo: target.repo, number: String(target.ticketNumber), mapNumber: String(target.mapNumber) };
  if (target.kind === 'prototype' && link.kind === 'prototype') {
    params.board = link.canvas;
    if (link.revision) params.rev = link.revision;
    if (link.page) params.page = link.page;
    if (link.item) params.item = link.item;
    return { pathname: '/canvas', params };
  }
  return { pathname: '/ticket', params };
}
