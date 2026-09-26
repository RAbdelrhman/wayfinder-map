import type { CriticalPath, Ticket } from './types.js';

/** All the critical path needs of a card: its number, whether it is open, and what it waits on. */
export type PathTicket = Pick<Ticket, 'number' | 'open' | 'blockedBy'>;

interface Chain {
  /** The chain in reverse: this ticket first, then its blockers. */
  tickets: number[];
  open: number;
}

/** More open tickets wins; on a tie, the longer chain. */
function longer(a: Chain, b: Chain): boolean {
  return a.open > b.open || (a.open === b.open && a.tickets.length > b.tickets.length);
}

/**
 * The chain of blockers with the most open tickets, ending at a ticket nothing on the map waits on.
 * Only tickets on the map count: blockers off the map (the fog) neither lengthen the chain nor break it.
 * A closed ticket in the middle keeps the chain joined, since what it waited on still has to finish.
 * Cycles stop at the first repeat. Once every ticket is closed, the path is empty.
 */
export function criticalPath(tickets: readonly PathTicket[]): CriticalPath {
  const byNumber = new Map(tickets.map((ticket) => [ticket.number, ticket]));
  const chains = new Map<number, Chain>();

  const chainTo = (ticket: PathTicket, visiting: Set<number>): Chain => {
    const cached = chains.get(ticket.number);
    if (cached) return cached;

    visiting.add(ticket.number);
    let best: Chain = { tickets: [], open: 0 };
    for (const number of ticket.blockedBy) {
      const blocker = byNumber.get(number);
      if (!blocker || visiting.has(number)) continue;
      const chain = chainTo(blocker, visiting);
      if (longer(chain, best)) best = chain;
    }
    visiting.delete(ticket.number);

    const chain = { tickets: [ticket.number, ...best.tickets], open: best.open + (ticket.open ? 1 : 0) };
    chains.set(ticket.number, chain);
    return chain;
  };

  const waitedOn = new Set(tickets.flatMap((ticket) => ticket.blockedBy));
  const sinks = tickets.filter((ticket) => !waitedOn.has(ticket.number));
  // A map that is one big cycle has no end; take the longest chain anywhere rather than hide it.
  const ends = sinks.length > 0 ? sinks : tickets;

  let best: Chain = { tickets: [], open: 0 };
  for (const ticket of ends) {
    const chain = chainTo(ticket, new Set());
    if (longer(chain, best)) best = chain;
  }
  if (best.open === 0) return { tickets: [], remaining: 0 };
  return { tickets: [...best.tickets].reverse(), remaining: best.open };
}
