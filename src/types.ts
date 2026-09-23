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

/** An issue or pull request a ticket waits on that is not itself on the map. */
export interface OutsideTicket {
  number: number;
  title: string;
  url: string;
  open: boolean;
  pullRequest: boolean;
}

export interface WayfinderMap {
  number: number;
  title: string;
  url: string;
  body: string;
  open: boolean;
  sections: MapSections;
  tickets: Ticket[];
  /** Blockers named by this map's tickets that live outside the map, so the UI can still link them. */
  outside: OutsideTicket[];
}

/** A prototype branch belonging to one of a map's tickets. */
export interface Prototype {
  branch: string;
  ticketNumber: number;
  /** The map whose ticket this prototype answers. */
  mapNumber: number;
  /** The branch on GitHub. */
  url: string;
  /** When the branch last got a commit, or null if GitHub could not compare it. */
  updatedAt: string | null;
  /** Files the branch adds or changes against the default branch. */
  files: string[];
  /** Of those, the HTML files the page can serve and open live. */
  openable: string[];
  /** The page to show running, or null when nothing on the branch can run on its own. */
  preview: string | null;
  /** The closed ticket's last comment, which the wayfinder flow writes as its answer. Null while open. */
  verdict: string | null;
}

export interface MapSnapshot {
  repo: string;
  fetchedAt: string;
  maps: WayfinderMap[];
  /** Non-fatal problems worth showing in the UI rather than swallowing. */
  warnings: string[];
}
