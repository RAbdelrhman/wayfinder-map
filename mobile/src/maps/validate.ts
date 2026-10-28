import type { MapDetail, MapSummary, TicketDetail } from './github';
import { validRef } from './github';
import type { Ticket } from '../shared';

const record = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);
const numbers = (x: unknown) =>
  Array.isArray(x) && x.every((n: unknown) => Number.isSafeInteger(n));
export function isSummary(x: unknown): x is MapSummary {
  return (
    record(x) &&
    validRef({ repo: x.repo, number: x.number }) &&
    ['title', 'body', 'url', 'updatedAt'].every(
      (key) => typeof x[key] === 'string',
    ) &&
    (typeof x.author === 'string' || x.author === null) &&
    typeof x.open === 'boolean' &&
    typeof x.total === 'number' &&
    typeof x.completed === 'number'
  );
}
export function isTicket(x: unknown): x is Ticket {
  return (
    record(x) &&
    Number.isSafeInteger(x.number) &&
    ['title', 'body', 'url'].every((key) => typeof x[key] === 'string') &&
    typeof x.open === 'boolean' &&
    (typeof x.assignee === 'string' || x.assignee === null) &&
    numbers(x.blockedBy) &&
    numbers(x.openBlockers) &&
    ['done', 'blocked', 'claimed', 'frontier'].includes(String(x.state)) &&
    Array.isArray(x.labels) &&
    (x.type === null ||
      ['research', 'prototype', 'grilling', 'task'].includes(String(x.type)))
  );
}
export function isMapList(
  x: unknown,
): x is { maps: MapSummary[]; warnings: string[] } {
  return (
    record(x) &&
    Array.isArray(x.maps) &&
    x.maps.every(isSummary) &&
    Array.isArray(x.warnings) &&
    x.warnings.every((s: unknown) => typeof s === 'string')
  );
}
export function isMapDetail(x: unknown): x is MapDetail {
  return (
    record(x) &&
    isSummary({ ...x }) &&
    record(x.sections) &&
    ['destination', 'notes', 'decisions', 'fog', 'outOfScope'].every(
      (key) => typeof (x.sections as Record<string, unknown>)[key] === 'string',
    ) &&
    Array.isArray(x.tickets) &&
    x.tickets.every(isTicket) &&
    record(x.layers) &&
    Object.values(x.layers).every((n) => typeof n === 'number') &&
    record(x.critical) &&
    numbers(x.critical.tickets) &&
    typeof x.critical.remaining === 'number' &&
    Array.isArray(x.warnings) &&
    x.warnings.every((s: unknown) => typeof s === 'string')
  );
}
export function isTicketDetail(x: unknown): x is TicketDetail {
  return (
    record(x) &&
    isTicket(x.ticket) &&
    Array.isArray(x.needs) &&
    x.needs.every(isTicket) &&
    Array.isArray(x.unblocks) &&
    x.unblocks.every(isTicket) &&
    Array.isArray(x.comments) &&
    x.comments.every(
      (c: unknown) =>
        record(c) &&
        typeof c.id === 'number' &&
        ['author', 'body', 'url', 'createdAt'].every(
          (key) => typeof c[key] === 'string',
        ),
    ) &&
    Array.isArray(x.warnings) &&
    x.warnings.every((s: unknown) => typeof s === 'string')
  );
}
