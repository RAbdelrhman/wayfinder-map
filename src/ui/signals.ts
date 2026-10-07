import * as icons from './icons.js';
import { icon } from './icons.js';
import { escapeHtml } from './markdown.js';
import type { ChecksState, CriticalPath, ReviewState, Stall, TicketPullRequest } from '../types.js';

/*
 * How the map shows #125's option A: the critical path as darker edges and a count after the
 * view tabs, a ticket's PR, CI and review on its card and in its panel, and stalled tickets
 * as dashed cards. No new colour: passing and approved take the hand-off green, failing and
 * changes the failed red, running and requested muted grey, each with its own icon and word.
 */

interface Tone {
  /** The word in the panel and table. */
  word: string;
  /** The word on the card's meta line. */
  short: string;
  icon: string;
  variable: string;
}

export const CHECKS_STYLE: Record<ChecksState, Tone & { counted: 'passed' | 'failed' | 'pending'; verb: string }> = {
  passing: { word: 'Checks passing', short: 'passing', icon: icons.CI_PASS, variable: '--handoff-pr-ready', counted: 'passed', verb: 'passed' },
  failing: { word: 'Checks failing', short: 'failing', icon: icons.CI_FAIL, variable: '--state-failed', counted: 'failed', verb: 'failed' },
  pending: { word: 'Checks running', short: 'running', icon: icons.CI_PENDING, variable: '--text-muted', counted: 'pending', verb: 'running' },
};

export const REVIEW_STYLE: Record<ReviewState, Tone> = {
  approved: { word: 'Approved', short: 'approved', icon: icons.CHECK, variable: '--handoff-pr-ready' },
  changes_requested: { word: 'Changes requested', short: 'changes requested', icon: icons.CHANGES, variable: '--state-failed' },
  review_required: { word: 'Review requested', short: 'review requested', icon: icons.EYE, variable: '--text-muted' },
};

function toned(tone: Tone): string {
  return `<span class="signal-tone" style="--tone: var(${tone.variable})">${icon(tone.icon)}</span>`;
}

/** Open, draft, merged or closed: the PR's own state, when it says more than "open". */
function stateWord(pullRequest: TicketPullRequest): string {
  if (pullRequest.state !== 'open') return pullRequest.state;
  return pullRequest.draft === true ? 'draft' : 'open';
}

/** The card's meta line: `#232 · failing · changes requested`, each part with its icon. Replaces `@assignee`. */
export function pullRequestMetaHtml(pullRequest: TicketPullRequest): string {
  const dot = '<span class="signal-dot" aria-hidden="true">·</span>';
  const parts = [`${icon(icons.PULL_REQUEST)}#${String(pullRequest.number)}`];
  if (pullRequest.state !== 'open' || pullRequest.draft === true) parts.push(escapeHtml(stateWord(pullRequest)));
  if (pullRequest.state === 'open' && pullRequest.checks !== null) {
    const style = CHECKS_STYLE[pullRequest.checks];
    parts.push(`${toned(style)}${style.short}`);
  }
  if (pullRequest.state === 'open' && pullRequest.review !== null) {
    const style = REVIEW_STYLE[pullRequest.review];
    parts.push(`${toned(style)}${style.short}`);
  }
  return `<span class="signal-meta">${parts.join(dot)}</span>`;
}

/** `2 of 5 checks failed`, or null when the source gave no counts (T3 Code's snapshot doesn't). */
export function checkCountText(pullRequest: TicketPullRequest): string | null {
  const counts = pullRequest.checkCounts;
  if (pullRequest.checks === null || counts === null || counts === undefined) return null;
  const style = CHECKS_STYLE[pullRequest.checks];
  const total = counts.passed + counts.failed + counts.pending;
  return `${String(counts[style.counted])} of ${String(total)} ${total === 1 ? 'check' : 'checks'} ${style.verb}`;
}

/** The PR in words, for a card's label and the table: `PR #232, draft, checks failing (2 of 5 checks failed), changes requested by @sam`. */
export function pullRequestText(pullRequest: TicketPullRequest): string {
  const parts = [`PR #${String(pullRequest.number)}`, stateWord(pullRequest)];
  if (pullRequest.state === 'open' && pullRequest.checks !== null) {
    const count = checkCountText(pullRequest);
    parts.push(`${CHECKS_STYLE[pullRequest.checks].word.toLowerCase()}${count === null ? '' : ` (${count})`}`);
  }
  if (pullRequest.state === 'open' && pullRequest.review !== null) {
    const reviewer = pullRequest.reviewer ?? null;
    parts.push(`${REVIEW_STYLE[pullRequest.review].short}${reviewer === null ? '' : ` ${pullRequest.review === 'review_required' ? 'from' : 'by'} @${reviewer}`}`);
  }
  return parts.join(', ');
}

/** The ticket panel's three lines, inside the hand-off card: the PR, its checks with a count, its review with the reviewer. */
export function pullRequestLinesHtml(pullRequest: TicketPullRequest): string {
  const lines = [
    `${icon(icons.PULL_REQUEST)}<span><a href="${escapeHtml(pullRequest.url)}" target="_blank" rel="noreferrer">PR #${String(pullRequest.number)}</a> <span class="signal-muted">${escapeHtml(stateWord(pullRequest))}</span></span>`,
  ];
  if (pullRequest.state === 'open' && pullRequest.checks !== null) {
    const style = CHECKS_STYLE[pullRequest.checks];
    const count = checkCountText(pullRequest);
    lines.push(`${toned(style)}<span>${style.word}${count === null ? '' : ` <span class="signal-muted">· ${count}</span>`}</span>`);
  }
  if (pullRequest.state === 'open' && pullRequest.review !== null) {
    const style = REVIEW_STYLE[pullRequest.review];
    const reviewer = pullRequest.reviewer ?? null;
    lines.push(`${toned(style)}<span>${style.word}${reviewer === null ? '' : ` <span class="signal-muted">· @${escapeHtml(reviewer)}</span>`}</span>`);
  }
  return `<div class="signal-pr" role="group" aria-label="Pull request">${lines.join('')}</div>`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(since: string, now: number): string {
  const days = Math.max(0, Math.floor((now - Date.parse(since)) / DAY_MS));
  return days === 0 ? 'today' : `${String(days)} ${days === 1 ? 'day' : 'days'} ago`;
}

function daysFor(since: string, now: number): string {
  const days = Math.max(0, Math.floor((now - Date.parse(since)) / DAY_MS));
  return `${String(days)} ${days === 1 ? 'day' : 'days'}`;
}

export interface StallWords {
  /** After "Stalled · " on the card's meta line. */
  short: string;
  /** The panel's grey banner, after "Stalled.". */
  long: string;
}

/**
 * What a stall says. `neverStarted` is true when the dead hand-off never got a T3 Code thread,
 * rather than failing in one.
 */
export function stallWords(stall: Stall, assignee: string | null, neverStarted: boolean, now: number): StallWords {
  if (stall.kind === 'untouched-claim') {
    const who = assignee === null ? 'It was claimed' : `@${assignee} claimed it`;
    return {
      short: `untouched for ${daysFor(stall.since, now)}`,
      long: `${who}, and nothing has happened for ${daysFor(stall.since, now)}: no commit, PR, comment or hand-off.`,
    };
  }
  const ago = daysAgo(stall.since, now);
  const after = ', and nothing has happened since: no retry, commit or PR.';
  return neverStarted
    ? { short: `hand-off never started (${ago})`, long: `The hand-off from ${ago} never started a T3 Code thread${after}` }
    : { short: `hand-off failed ${ago}`, long: `The hand-off failed ${ago}${after}` };
}

/** The critical path's edges, as `from>to` keys: each ticket and the one after it in the chain. */
export function criticalEdges(path: CriticalPath): Set<string> {
  const edges = new Set<string>();
  for (let index = 1; index < path.tickets.length; index += 1) {
    edges.add(edgeKey(path.tickets[index - 1] ?? 0, path.tickets[index] ?? 0));
  }
  return edges;
}

export function edgeKey(from: number, to: number): string {
  return `${String(from)}>${String(to)}`;
}

/** Key rows for the three signals, after the state and fog rows. */
export const SIGNAL_KEY_ROWS = [
  `<div class="keyrow"><span class="key-path" aria-hidden="true"></span><b>Critical path</b>The chain most of what is left waits on</div>`,
  `<div class="keyrow"><span class="key-stalled" aria-hidden="true"></span><b>Stalled</b>A claim nobody touched, or a hand-off that died</div>`,
  `<div class="keyrow">${icon(icons.PULL_REQUEST)}<b>Pull request</b>Its checks and review, on the card's last line</div>`,
].join('');
