import type { TicketState } from './types.js';

/** The same state precedence on desktop and phone. Unknown blockers remain open. */
export function ticketStateOf(
  open: boolean,
  openBlockers: readonly number[],
  assignee: string | null,
): TicketState {
  if (!open) return 'done';
  if (openBlockers.length > 0) return 'blocked';
  if (assignee !== null) return 'claimed';
  return 'frontier';
}
