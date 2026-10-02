import { describe, expect, it, vi } from 'vitest';

import type { HandOffStatusDto } from '../handOffTracking.js';
import {
  cardShowsHandOff,
  focusedMapTicketNumber,
  handOffCardHtml,
  handOffMapLabel,
  handOffPresentation,
  handOffSourcePath,
  handOffTime,
  handOffTriggerLabel,
  handOffVisualSignature,
  homeHandOffHistoryHtml,
  listedHandOffs,
  modelChangePromptHtml,
  recentHandOffs,
  restoreMapTicketFocus,
  sendModelChangeReason,
} from './handOffs.js';

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
      pullRequests: [{
        number: 42,
        url: 'https://github.com/octo/example/pull/42',
        state: 'open',
        checksState: null,
        reviewDecision: null,
        isDraft: null,
        hasSnapshot: false,
        mergedAt: null,
        syncedAt: null,
        source: 't3',
      }],
    })).label).toBe('PR ready');
  });

  it('does not treat GitHub fallback pull requests as T3-reported status', () => {
    const item = handOff({
      status: 'finished',
      pullRequests: [{
        number: 42,
        url: 'https://github.com/octo/example/pull/42',
        state: 'open',
        checksState: null,
        reviewDecision: null,
        isDraft: null,
        hasSnapshot: false,
        mergedAt: null,
        syncedAt: null,
        source: 'github',
      }],
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

describe('hand-off visual signature', () => {
  it('changes when PR state, CI, review, draft, or merge time changes', () => {
    const pullRequest: HandOffStatusDto['pullRequests'][number] = {
      number: 42,
      url: 'https://github.com/octo/example/pull/42',
      state: 'OPEN',
      checksState: 'pending',
      reviewDecision: 'REVIEW_REQUIRED',
      isDraft: false,
      hasSnapshot: true,
      mergedAt: null,
      syncedAt: '2026-09-24T12:00:00Z',
      source: 't3',
    };
    const initial = handOffVisualSignature([handOff({ pullRequests: [pullRequest] })]);
    const updates: HandOffStatusDto['pullRequests'][number][] = [
      { ...pullRequest, state: 'MERGED' },
      { ...pullRequest, checksState: 'passing' },
      { ...pullRequest, reviewDecision: 'APPROVED' },
      { ...pullRequest, isDraft: true },
      { ...pullRequest, mergedAt: '2026-09-24T12:01:00Z' },
    ];

    for (const update of updates) {
      expect(handOffVisualSignature([handOff({ pullRequests: [update] })])).not.toBe(initial);
    }
  });
});

describe('map ticket focus after redraw', () => {
  it('restores focus to the same ticket node', () => {
    let focused = false;
    let preventScroll = false;
    const previousNode = { dataset: { number: '11' }, focus: () => undefined };
    const replacementNode = {
      dataset: { number: '11' },
      focus: (options?: FocusOptions) => {
        focused = true;
        preventScroll = options?.preventScroll === true;
      },
    };
    const ticketNumber = focusedMapTicketNumber(previousNode, true);

    restoreMapTicketFocus(ticketNumber, (number) => number === 11 ? replacementNode : null);

    expect(focused).toBe(true);
    expect(preventScroll).toBe(true);
  });

  it('does not restore a ticket when focus was outside the map or the node has no valid ticket number', () => {
    const node = { dataset: { number: '0' }, focus: () => undefined };
    expect(focusedMapTicketNumber(node, false)).toBeNull();
    expect(focusedMapTicketNumber(node, true)).toBeNull();

    let lookedUp = false;
    restoreMapTicketFocus(null, () => {
      lookedUp = true;
      return node;
    });
    expect(lookedUp).toBe(false);
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
    checksState: null,
    reviewDecision: null,
    isDraft: null,
    hasSnapshot: false,
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

  it('shows Done once the ticket closes, instead of waiting on an idle thread', () => {
    const closed = handOffPresentation(handOff({ status: 'ready', ticketClosed: true }));
    expect(closed).toMatchObject({ state: 'done', label: 'Done', group: 'Done', needsYou: false, terminal: true });
    expect(handOffPresentation(handOff({ status: 'finished', ticketClosed: true })).state).toBe('done');
    expect(handOffPresentation(handOff({ status: 'failed', ticketClosed: true })).state).toBe('done');
    expect(handOffTriggerLabel([handOff({ status: 'ready', ticketClosed: true })], true)).toBe('1 hand-off in T3 Code');
    expect(handOffVisualSignature([handOff({ status: 'ready' })])).not.toBe(handOffVisualSignature([handOff({ status: 'ready', ticketClosed: true })]));
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

describe('model change prompt (#191)', () => {
  const change = { at: '2026-09-30T12:20:00.000Z', from: 'fable-5', to: 'opus-4.8' };

  it('asks once, on a card and nowhere when there is no change to ask about', () => {
    expect(handOffCardHtml(handOff())).not.toContain('model-change-prompt');
    expect(modelChangePromptHtml(handOff())).toBe('');
    const card = handOffCardHtml(handOff({ modelChange: change }));
    expect(card).toContain('The model changed from <b>fable-5</b> to <b>opus-4.8</b>. Why?');
  });

  it('offers every reason plus Not sure and Skip, and never picks one from the model names', () => {
    const prompt = modelChangePromptHtml(handOff({ modelChange: { ...change, from: 'sonnet-5', to: 'fable-5' } }));
    for (const label of ['Harder ticket', 'Provider limit', 'Provider problem', 'Preference', 'Not sure', 'Skip']) expect(prompt).toContain(`>${label}</button>`);
    expect(prompt).toContain('data-model-change-reason="harder-ticket"');
    expect(prompt).not.toMatch(/aria-pressed|checked|selected/);
    // Not sure and Skip both say unknown.
    expect(prompt.match(/data-model-change-reason="unknown"/g)).toHaveLength(2);
    expect(prompt).toContain(`data-model-change-at="${change.at}"`);
  });

  it('escapes the model names it shows', () => {
    expect(modelChangePromptHtml(handOff({ modelChange: { ...change, to: '<b>x</b>' } }))).not.toContain('<b>x</b>');
  });

  it('redraws the card when the change to ask about changes', () => {
    expect(handOffVisualSignature([handOff({ modelChange: change })])).not.toBe(handOffVisualSignature([handOff()]));
  });

  it('posts the id, the change and the reason to the local server', async () => {
    const fetcher = vi.fn(async () => new Response('{"confirmed":true}', { status: 200 }));
    await sendModelChangeReason(fetcher as unknown as typeof fetch, { id: 'h1', at: change.at, reason: 'unknown' });
    expect(fetcher).toHaveBeenCalledWith('/api/hand-offs/model-change', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'h1', at: change.at, reason: 'unknown' }),
    });
  });

  it('reports a refusal instead of pretending the answer was saved', async () => {
    const fetcher = vi.fn(async () => new Response('{"error":"No such model change."}', { status: 404 }));
    await expect(sendModelChangeReason(fetcher as unknown as typeof fetch, { id: 'h1', at: change.at, reason: 'preference' })).rejects.toThrow('No such model change.');
  });
});
