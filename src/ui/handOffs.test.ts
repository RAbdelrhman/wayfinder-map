import { describe, expect, it } from 'vitest';

import type { HandOffStatusDto } from '../handOffTracking.js';
import { cardShowsHandOff, handOffCardHtml, handOffMapLabel, handOffPresentation, handOffSourcePath, handOffTime, handOffTriggerLabel, homeHandOffHistoryHtml, listedHandOffs, recentHandOffs } from './handOffs.js';

function handOff(overrides: Partial<HandOffStatusDto> = {}): HandOffStatusDto {
  return {
    id: '3d6f7740-f40c-4d9e-b7c2-8a988438f11a',
    repo: 'octo/example',
    mapNumber: 5,
    mapTitle: 'Make the app reliable',
    ticketNumber: 11,
    title: 'Retry failed sessions',
    threadId: 'thread-1',
    rung: 'thread',
    status: 'running',
    acknowledged: false,
    createdAt: '2026-09-23T12:00:00.000Z',
    updatedAt: '2026-09-23T12:00:00.000Z',
    lastSeenAt: null,
    stale: false,
    sequence: null,
    branch: null,
    pendingApproval: false,
    pendingUserInput: false,
    pullRequests: [],
    ...overrides,
  };
}

describe('hand-off presentation', () => {
  it('maps the T3 lifecycle to the user-facing states', () => {
    expect(handOffPresentation(handOff({ status: 'starting' })).label).toBe('Starting');
    expect(handOffPresentation(handOff({ status: 'running' })).label).toBe('Working');
    expect(handOffPresentation(handOff({ status: 'waiting' })).label).toBe('Needs you');
    expect(handOffPresentation(handOff({ status: 'ready' })).report).toBe('T3 Code is ready for your next step.');
    expect(handOffPresentation(handOff({ status: 'running', pendingApproval: true })).report).toContain('approval');
    expect(handOffPresentation(handOff({ status: 'failed' })).label).toBe('Failed');
    expect(handOffPresentation(handOff({ status: 'interrupted' })).label).toBe('Failed');
    expect(handOffPresentation(handOff({
      status: 'finished',
      pullRequests: [{ number: 42, url: 'https://github.com/octo/example/pull/42', state: 'open', mergedAt: null, syncedAt: null, source: 't3' }],
    })).label).toBe('PR ready');
  });

  it('does not treat GitHub fallback pull requests as T3-reported status', () => {
    const item = handOff({
      status: 'finished',
      pullRequests: [{ number: 42, url: 'https://github.com/octo/example/pull/42', state: 'open', mergedAt: null, syncedAt: null, source: 'github' }],
    });
    expect(handOffPresentation(item).label).toBe('Working');
    expect(handOffCardHtml(item)).not.toContain('Open PR #42');
  });

  it('orders attention first and hides acknowledged and untracked records', () => {
    const items = [
      handOff({ id: 'working', createdAt: '2026-09-23T10:00:00Z' }),
      handOff({ id: 'needs-you', status: 'waiting' }),
      handOff({ id: 'failed', status: 'failed' }),
      handOff({ id: 'acknowledged', acknowledged: true }),
      handOff({ id: 'untracked', threadId: null }),
    ];
    expect(listedHandOffs(items).map((item) => item.id)).toEqual(['failed', 'needs-you', 'working']);
  });

  it('describes urgency and offline status in the trigger label', () => {
    expect(handOffTriggerLabel([handOff()], true)).toBe('1 hand-off in T3 Code');
    expect(handOffTriggerLabel([handOff({ status: 'waiting' })], false)).toBe('1 hand-off in T3 Code, 1 need you, T3 Code is offline; showing the last reported status');
    expect(handOffTriggerLabel([], null)).toBe('0 hand-offs in T3 Code');
  });

  it('uses the repository, map and ticket for source links', () => {
    const item = handOff();
    expect(handOffSourcePath(item)).toBe('/repos/octo/example/maps/5?ticket=11');
    expect(handOffMapLabel(item)).toBe('Make the app reliable');
    expect(handOffSourcePath(handOff({ mapNumber: null, ticketNumber: null }))).toBe('/repos/octo/example/maps/draft-3d6f7740-f40c-4d9e-b7c2-8a988438f11a');
    expect(handOffTime(item, Date.parse('2026-09-23T12:05:00.000Z'))).toBe('5m ago');
  });

  it('escapes source content and shows stale status without exposing local paths', () => {
    const item = handOff({ title: '<unsafe>', stale: true, branch: 'feature/<unsafe>' });
    const card = handOffCardHtml(item);
    expect(card).toContain('&lt;unsafe&gt;');
    expect(card).toContain('T3 Code status is stale');
    expect(card).not.toContain('worktreePath');
  });
});

describe('Try again (#98)', () => {
  it('leads to the ticket panel without starting a thread', () => {
    const card = handOffCardHtml(handOff({ status: 'failed' }));
    expect(card).toContain('data-handoff-href="/repos/octo/example/maps/5?ticket=11"');
    expect(card).not.toContain('retry=1');
  });

  it('is left out of the ticket panel, which has its own start button', () => {
    expect(handOffCardHtml(handOff({ status: 'failed' }), false, false, false)).not.toContain('Try again');
  });
});

describe('finished hand-offs', () => {
  const pullRequest = (number: number, state: string | null): HandOffStatusDto['pullRequests'][number] => ({
    number,
    url: `https://github.com/octo/example/pull/${String(number)}`,
    state,
    mergedAt: null,
    syncedAt: null,
    source: 't3',
  });

  it('gives a map card one status: the hand-off while open, done once closed', () => {
    const merged = handOff({ status: 'ready', pullRequests: [pullRequest(1, 'MERGED')] });
    expect(cardShowsHandOff('claimed', undefined)).toBe(false);
    expect(cardShowsHandOff('claimed', handOff())).toBe(true);
    expect(cardShowsHandOff('done', handOff({ status: 'failed' }))).toBe(false);
    expect(cardShowsHandOff('done', merged)).toBe(false);
  });

  it('shows Merged once every reported pull request has merged', () => {
    expect(handOffPresentation(handOff({ status: 'ready', pullRequests: [pullRequest(1, 'MERGED')] })).label).toBe('Merged');
    expect(handOffPresentation(handOff({ status: 'ready', pullRequests: [pullRequest(1, 'MERGED'), pullRequest(2, 'OPEN')] })).label).toBe('PR ready');
    expect(handOffPresentation(handOff({ status: 'ready', pullRequests: [pullRequest(1, null)] })).label).toBe('PR ready');
    expect(handOffPresentation(handOff({ status: 'ready', pullRequests: [pullRequest(1, 'MERGED')] })).terminal).toBe(true);
  });

  it('does not repeat the pill in a report line', () => {
    const card = handOffCardHtml(handOff({ status: 'ready', pullRequests: [pullRequest(96, null)] }), false, false);
    expect(card).not.toContain('Pull request ready');
    expect(card).not.toContain('handoff-report');
    expect(card).toContain('Open PR #96');
  });

  it('lists the last three on Home, newest first, each opening its ticket', () => {
    const records = [1, 2, 3, 4].map((n) =>
      handOff({
        id: `h${String(n)}`,
        ticketNumber: n,
        acknowledged: true,
        status: 'ready',
        updatedAt: `2026-09-23T12:0${String(n)}:00.000Z`,
        pullRequests: [pullRequest(n, 'MERGED')],
      }),
    );
    expect(recentHandOffs(records).map((item) => item.ticketNumber)).toEqual([4, 3, 2]);
    const row = homeHandOffHistoryHtml(records[0] as HandOffStatusDto);
    expect(row).toContain('Open ticket');
    expect(row).not.toContain('Open source');
    expect(row).toContain('<span class="handoff-row-prs"><a');
  });
});
