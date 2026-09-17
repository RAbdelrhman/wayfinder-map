/** The four ticket kinds a wayfinder map uses, from the `wayfinder:<type>` labels. */
export const TICKET_TYPES = ['research', 'prototype', 'grilling', 'task'] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

/**
 * Where a ticket sits in the flow. Derived, never stored on the issue:
 * - `done`     closed
 * - `blocked`  open, with at least one open blocker
 * - `claimed`  open, unblocked, assigned to someone
 * - `frontier` open, unblocked, unassigned. The next thing anyone can pick up.
 */
export type TicketState = 'done' | 'blocked' | 'claimed' | 'frontier';

export interface Ticket {
  number: number;
  title: string;
  url: string;
  body: string;
  type: TicketType | null;
  labels: string[];
  open: boolean;
  assignee: string | null;
  /** Issue numbers this ticket waits on, open ones first. */
  blockedBy: number[];
  /** Of `blockedBy`, the ones still open. */
  openBlockers: number[];
  state: TicketState;
}

/** The prose sections a map body carries, by the headings the wayfinder flow writes. */
export interface MapSections {
  destination: string;
  notes: string;
  decisions: string;
  fog: string;
  outOfScope: string;
}

export interface WayfinderMap {
  number: number;
  title: string;
  url: string;
  body: string;
  open: boolean;
  sections: MapSections;
  tickets: Ticket[];
}

export interface MapSnapshot {
  repo: string;
  fetchedAt: string;
  maps: WayfinderMap[];
  /** Non-fatal problems worth showing in the UI rather than swallowing. */
  warnings: string[];
}
