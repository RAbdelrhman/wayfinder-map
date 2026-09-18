import type { Ticket, TicketState, TicketType } from '../types.js';

/** What the filter chips narrow the map to: a state, a type, or the tickets with no type label. */
export type TicketFilter = TicketState | TicketType | 'untyped';

export function matchesFilter(ticket: Ticket, filter: TicketFilter | null): boolean {
  return filter === null || ticket.state === filter || (ticket.type ?? 'untyped') === filter;
}

export interface Lineage {
  /** Every ticket on this map the focused one waits on, directly or through others. */
  upstream: Set<number>;
  /** Every ticket on this map that waits on the focused one, directly or through others. */
  downstream: Set<number>;
}

/** The focused ticket's chain in both directions. Blockers off this map are ignored; cycles stop at the first repeat. */
export function lineage(tickets: readonly Ticket[], focus: number): Lineage {
  const onMap = new Set(tickets.map((ticket) => ticket.number));
  const blockers = new Map<number, number[]>();
  const dependents = new Map<number, number[]>();
  for (const ticket of tickets) {
    const own = ticket.blockedBy.filter((number) => onMap.has(number));
    blockers.set(ticket.number, own);
    for (const blocker of own) dependents.set(blocker, [...(dependents.get(blocker) ?? []), ticket.number]);
  }

  const walk = (next: Map<number, number[]>): Set<number> => {
    const seen = new Set<number>();
    const stack = [...(next.get(focus) ?? [])];
    for (let number = stack.pop(); number !== undefined; number = stack.pop()) {
      if (number === focus || seen.has(number)) continue;
      seen.add(number);
      stack.push(...(next.get(number) ?? []));
    }
    return seen;
  };

  return { upstream: walk(blockers), downstream: walk(dependents) };
}

/** Whether a blocker edge lies on the focused ticket's chain, upstream or downstream. */
export function onLineage(edge: { from: number; to: number }, focus: number, chain: Lineage): boolean {
  const up = chain.upstream.has(edge.from) && (edge.to === focus || chain.upstream.has(edge.to));
  const down = chain.downstream.has(edge.to) && (edge.from === focus || chain.downstream.has(edge.from));
  return up || down;
}

/** How long ago the snapshot was read from GitHub, coarse enough not to tick every second. */
export function syncedLabel(ageMs: number): string {
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return 'Synced just now';
  if (minutes < 60) return `Synced ${String(minutes)}m ago`;
  return `Synced ${String(Math.floor(minutes / 60))}h ago`;
}
