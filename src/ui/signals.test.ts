import { describe, expect, it } from 'vitest';

import {
  checkCountText,
  criticalEdges,
  criticalPathButtonHtml,
  edgeKey,
  pullRequestLinesHtml,
  pullRequestMetaHtml,
  pullRequestText,
  stallWords,
} from './signals.js';
import type { Stall, TicketPullRequest } from '../types.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-29T12:00:00Z');

function pr(overrides: Partial<TicketPullRequest> = {}): TicketPullRequest {
  return {
    ticket: 130,
    number: 232,
    url: 'https://github.com/o/r/pull/232',
    state: 'open',
    checks: 'failing',
    review: 'changes_requested',
    checkCounts: { passed: 3, failed: 2, pending: 0 },
    reviewer: 'sam-k',
    ...overrides,
  };
}

/** The visible words, without tags. */
function text(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

describe('the card meta line', () => {
  it('reads #232 · failing · changes requested, each part with its own icon', () => {
    const html = pullRequestMetaHtml(pr());
    expect(text(html)).toBe('#232·failing·changes requested');
    expect(html.match(/<svg/g)).toHaveLength(3);
    expect(html).toContain('--tone: var(--state-failed)');
  });

  it('uses the hand-off green for passing and approved and muted grey for running and requested', () => {
    expect(pullRequestMetaHtml(pr({ checks: 'passing', review: 'approved' }))).not.toContain('--state-failed');
    expect(pullRequestMetaHtml(pr({ checks: 'passing', review: 'approved' })).match(/--handoff-pr-ready/g)).toHaveLength(2);
    expect(pullRequestMetaHtml(pr({ checks: 'pending', review: 'review_required' })).match(/--text-muted/g)).toHaveLength(2);
  });

  it('says draft, merged or closed, and leaves out what is unknown', () => {
    expect(text(pullRequestMetaHtml(pr({ draft: true, checks: 'pending', review: null })))).toBe('#232·draft·running');
    expect(text(pullRequestMetaHtml(pr({ state: 'merged' })))).toBe('#232·merged');
    expect(text(pullRequestMetaHtml(pr({ checks: null, review: null })))).toBe('#232');
  });
});

describe('the pull request in words', () => {
  it('counts the checks in the state that matters', () => {
    expect(checkCountText(pr())).toBe('2 of 5 checks failed');
    expect(checkCountText(pr({ checks: 'passing', checkCounts: { passed: 1, failed: 0, pending: 0 } }))).toBe('1 of 1 check passed');
    expect(checkCountText(pr({ checks: 'pending', checkCounts: { passed: 3, failed: 0, pending: 2 } }))).toBe('2 of 5 checks running');
    expect(checkCountText(pr({ checkCounts: null }))).toBeNull();
    const { checkCounts: _omitted, ...fromT3 } = pr();
    expect(checkCountText(fromT3)).toBeNull();
  });

  it('carries everything the card shows, for its label and the table', () => {
    expect(pullRequestText(pr())).toBe('PR #232, open, checks failing (2 of 5 checks failed), changes requested by @sam-k');
    expect(pullRequestText(pr({ review: 'review_required', reviewer: 'lee', checkCounts: null }))).toBe('PR #232, open, checks failing, review requested from @lee');
    expect(pullRequestText(pr({ state: 'merged' }))).toBe('PR #232, merged');
  });

  it('gives the panel three lines: PR link, checks with count, review with reviewer', () => {
    const html = pullRequestLinesHtml(pr());
    expect(html).toContain('href="https://github.com/o/r/pull/232"');
    expect(text(html)).toBe('PR #232 openChecks failing · 2 of 5 checks failedChanges requested · @sam-k');
    expect(text(pullRequestLinesHtml(pr({ checks: null, review: null })))).toBe('PR #232 open');
  });

  it('escapes what comes from GitHub', () => {
    expect(pullRequestLinesHtml(pr({ reviewer: '<b>x</b>', url: 'https://x/"y' }))).not.toMatch(/<b>x|"y/);
  });
});

describe('stall wording', () => {
  const since = (days: number): string => new Date(NOW - days * DAY - 1000).toISOString();

  it('says how long a claim has sat untouched, and who holds it', () => {
    const stall: Stall = { ticket: 1, kind: 'untouched-claim', since: since(8) };
    expect(stallWords(stall, 'sam-k', false, NOW)).toEqual({
      short: 'untouched for 8 days',
      long: '@sam-k claimed it, and nothing has happened for 8 days: no commit, PR, comment or hand-off.',
    });
    expect(stallWords(stall, null, false, NOW).long.startsWith('It was claimed,')).toBe(true);
  });

  it('tells a failed hand-off from one that never reached T3 Code', () => {
    const stall: Stall = { ticket: 1, kind: 'dead-hand-off', since: since(1) };
    expect(stallWords(stall, null, false, NOW).short).toBe('hand-off failed 1 day ago');
    expect(stallWords(stall, null, true, NOW)).toEqual({
      short: 'hand-off never started (1 day ago)',
      long: 'The hand-off from 1 day ago never started a T3 Code thread, and nothing has happened since: no retry, commit or PR.',
    });
  });
});

describe('the critical path', () => {
  it('draws the edge between each ticket and the next one in the chain', () => {
    const edges = criticalEdges({ tickets: [3, 5, 8], remaining: 2 });
    expect([...edges]).toEqual([edgeKey(3, 5), edgeKey(5, 8)]);
    expect(edges.has(edgeKey(3, 8))).toBe(false);
    expect(criticalEdges({ tickets: [3], remaining: 1 }).size).toBe(0);
  });

  it('counts what is left, and has no button once nothing is', () => {
    expect(text(criticalPathButtonHtml({ tickets: [3, 5, 8], remaining: 2 }) ?? '')).toBe('2 left on the critical path');
    expect(criticalPathButtonHtml({ tickets: [3, 5], remaining: 0 })).toBeNull();
  });
});
