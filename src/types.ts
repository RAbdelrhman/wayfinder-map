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
  /** When the issue last changed (a comment, claim or edit), or null when GitHub did not say. */
  updatedAt: string | null;
}

/** The prose sections a map body carries, by the headings the wayfinder flow writes. */
export interface MapSections {
  destination: string;
  notes: string;
  decisions: string;
  fog: string;
  outOfScope: string;
}

/**
 * An issue or pull request linked to the map's tickets by a dependency, but not itself on the map.
 * A full ticket, so it opens in the panel like one; an open pull request counts as claimed by its author.
 */
export interface OutsideTicket extends Ticket {
  pullRequest: boolean;
  /** Tickets on the map that wait on it. The canvas draws these above the map. */
  blocks: number[];
  /** Tickets on the map it waits on. The canvas draws these below the map. */
  waitsOn: number[];
}

export interface WayfinderMap {
  number: number;
  title: string;
  url: string;
  body: string;
  open: boolean;
  /** The GitHub login that opened the map issue, or null when GitHub did not say. */
  author: string | null;
  /** Public only when the body has a `Visibility: public` line. See `mapVisibility`. */
  visibility: MapVisibility;
  sections: MapSections;
  tickets: Ticket[];
  /** Blockers named by this map's tickets that live outside the map, so the UI can still link them. */
  outside: OutsideTicket[];
  /** The chain of tickets most of what is left waits on. See `criticalPath`. */
  criticalPath: CriticalPath;
  /** Tickets that have stalled, in map order. The server fills it from hand-offs and the stall settings; see `stalledTickets`. */
  stalled: Stall[];
  /** Each open ticket's pull request, in map order. The server fills it like `stalled`; see `markPullRequests`. */
  pullRequests: TicketPullRequest[];
  /** Why and since when the map sits in the Settled section, or null while it is active. */
  settled: MapSettlement | null;
  /** False for a settled map whose tickets were not read, to save GitHub calls until it is opened. */
  ticketsLoaded: boolean;
}

/** Private maps show only to their author in Wayfinder; public ones also show to people who follow them. */
export type MapVisibility = 'public' | 'private';

/** Someone else's public map, as the Public maps list shows it: read from the map list alone, with no ticket calls. */
export interface PublicMap {
  number: number;
  title: string;
  url: string;
  author: string;
  open: boolean;
  /** Whether the signed-in login follows it, so it joins their map list. */
  followed: boolean;
  /** Closed and total sub-issues, from GitHub's summary on the map issue. */
  progress: { completed: number; total: number };
}

/** Why a map settled: its issue closed, nothing on it changed for 30 days, or someone settled it by hand. */
export type SettleReason = 'closed' | 'idle' | 'manual';

export interface MapSettlement {
  reason: SettleReason;
  /** When it settled, as an ISO timestamp. */
  since: string;
}

/** The longest chain of open tickets along blocker edges, ending at a ticket nothing on the map waits on. */
export interface CriticalPath {
  /** Ticket numbers from the first blocker to the ticket nothing waits on. Closed tickets in the chain stay in it. */
  tickets: number[];
  /** Of `tickets`, how many are still open. */
  remaining: number;
}

/** A claim nobody touched, or a hand-off that died and was never retried (#125). */
export type StallKind = 'untouched-claim' | 'dead-hand-off';

/** How many days before each kind counts as stalled. Set in Settings, 7 days each by default. */
export interface StallSettings {
  untouchedClaimDays: number;
  deadHandOffDays: number;
}

/** The day counts Settings offers for each kind. */
export const STALL_DAY_CHOICES = [3, 7, 14, 30] as const;
export const DEFAULT_STALL_SETTINGS: StallSettings = { untouchedClaimDays: 7, deadHandOffDays: 7 };

export interface Stall {
  ticket: number;
  kind: StallKind;
  /** When the ticket went quiet, as an ISO timestamp. */
  since: string;
}

export type ChecksState = 'passing' | 'failing' | 'pending';
export type ReviewState = 'approved' | 'changes_requested' | 'review_required';

/** How many of a pull request's checks passed, failed, or are still running. */
export interface CheckCounts {
  passed: number;
  failed: number;
  pending: number;
}

/** A pull request's state, CI and review, from T3 Code's PR snapshot or GitHub (#135, #142). */
export interface PullRequestState {
  number: number;
  url: string;
  state: 'open' | 'closed' | 'merged';
  checks: ChecksState | null;
  review: ReviewState | null;
  draft?: boolean;
  /** Only GitHub reports these; T3 Code's snapshot does not, so a T3 PR gets them from a fresh GitHub read (#171). */
  checkCounts?: CheckCounts | null;
  /** Who approved or asked for changes, or whose review is requested. GitHub only. */
  reviewer?: string | null;
}

/** The pull request a ticket's card and panel show (#130). */
export interface TicketPullRequest extends PullRequestState {
  ticket: number;
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
  /** The variants its canvas lays out side by side, named as the canvas names them. */
  variants?: PrototypeVariant[];
}

/** One variant of a prototype: its letter, its name, and what to show and open for it. */
export interface PrototypeVariant {
  id: string;
  title: string;
  /** The variant's page on the prototype branch, with any query, or null. */
  page: string | null;
  /** Its screenshot's file name among the default branch's prototype shots, or null. */
  shot: string | null;
}

export interface MapSnapshot {
  repo: string;
  fetchedAt: string;
  maps: WayfinderMap[];
  /** Maps from other people left out because they are private or not followed. */
  hiddenMaps: number;
  /** Other people's public maps, followed or not. Empty when no one is signed in. */
  publicMaps: PublicMap[];
  /** Non-fatal problems worth showing in the UI rather than swallowing. */
  warnings: string[];
}
