import { describe, expect, it } from 'vitest';

import type { MapEvent, WatchedPullRequest } from '../mapWatch.js';
import type { HandOffStatusDto } from '../handOffTracking.js';
import type { Prototype, WayfinderMap } from '../types.js';
import { changedPrototypeNotifications, handOffTransitionNotifications, NotificationInbox, mapEventNotification, notificationHref, notificationPanelHtml } from './notifications.js';

function ciEvent(pullRequestChanges: Partial<WatchedPullRequest> = {}): Extract<MapEvent, { type: 'ci-changed' }> {
  return {
    id: 4,
    repo: 'octo/repo',
    mapNumber: 5,
    at: '2026-09-29T12:00:00.000Z',
    ticket: { number: 11, title: 'Retire API agents' },
    type: 'ci-changed',
    pullRequest: { number: 12, url: 'https://github.com/octo/repo/pull/12', state: 'open', isDraft: false, checks: 'failing', review: 'review_required', ...pullRequestChanges },
    from: 'pending',
    to: 'failing',
  };
}

describe('map notification events', () => {
  it('notifies for newly ready tickets and failing CI', () => {
    expect(mapEventNotification(ciEvent(), 'Roadmap')).toMatchObject({ kind: 'failingCi', ticketNumber: 11, mapTitle: 'Roadmap' });
    expect(mapEventNotification({ id: 5, repo: 'octo/repo', mapNumber: 5, at: '2026-09-29T12:00:00.000Z', ticket: { number: 13, title: 'Add CLI alerts' }, type: 'ticket-next', from: 'blocked' }, 'Roadmap')).toMatchObject({ kind: 'unblocked' });
  });

  it('only calls an open non-draft PR ready when checks pass and review is required', () => {
    const ready: Extract<MapEvent, { type: 'review-changed' }> = {
      ...ciEvent({ checks: 'passing' }),
      type: 'review-changed',
      from: null,
      to: 'review_required',
    };
    const draft: Extract<MapEvent, { type: 'review-changed' }> = { ...ready, pullRequest: { ...ready.pullRequest, isDraft: true } };

    expect(mapEventNotification(ready, 'Roadmap')).toMatchObject({ kind: 'reviewReady' });
    expect(mapEventNotification(draft, 'Roadmap')).toBeNull();
  });
});

describe('notification inbox', () => {
  it('persists new items once, shows them unread, and clears the unread count', () => {
    let saved = '';
    const storage = {
      getItem: () => saved,
      setItem: (_key: string, value: string) => {
        saved = value;
      },
    };
    const inbox = new NotificationInbox(storage);
    const notice = mapEventNotification(ciEvent(), 'Roadmap');
    expect(notice).not.toBeNull();
    expect(inbox.push(notice!)).toBe(true);
    expect(inbox.push(notice!)).toBe(false);
    expect(inbox.unreadCount()).toBe(1);
    expect(new NotificationInbox(storage).list()).toHaveLength(1);
    inbox.markAllRead();
    expect(inbox.unreadCount()).toBe(0);
  });

  it('links an inbox row back to the ticket on its map', () => {
    const notification = mapEventNotification(ciEvent(), 'Roadmap');
    expect(notification).not.toBeNull();
    expect(notificationHref(notification!)).toBe('/repos/octo/repo/maps/5?view=map&ticket=11');
    expect(notificationPanelHtml([{ ...notification!, read: false }])).toContain('href="/repos/octo/repo/maps/5?view=map&amp;ticket=11"');
  });
});

describe('prototype review notifications', () => {
  it('notifies for a new prototype branch or a changed snapshot but not an unchanged read', () => {
    const map: WayfinderMap = {
      number: 5,
      title: 'Roadmap',
      url: 'https://github.com/octo/repo/issues/5',
      body: '',
      open: true,
      author: 'octo',
      visibility: 'private',
      sections: { destination: '', notes: '', decisions: '', fog: '', outOfScope: '' },
      tickets: [{ number: 11, title: 'Try the new shell', url: 'https://github.com/octo/repo/issues/11', body: '', type: 'prototype', labels: [], open: true, assignee: null, blockedBy: [], openBlockers: [], state: 'claimed', updatedAt: null }],
      outside: [],
      criticalPath: { tickets: [], remaining: 0 },
      stalled: [],
      settled: null,
      ticketsLoaded: true,
    };
    const base: Prototype = {
      branch: 'prototype/11-shell',
      ticketNumber: 11,
      mapNumber: 5,
      url: 'https://github.com/octo/repo/tree/prototype/11-shell',
      updatedAt: '2026-09-29T12:00:00.000Z',
      files: ['index.html'],
      openable: ['index.html'],
      preview: 'index.html',
      verdict: null,
    };

    expect(changedPrototypeNotifications('octo/repo', map, [], [base])).toMatchObject([{ kind: 'prototypeReady', ticketNumber: 11 }]);
    expect(changedPrototypeNotifications('octo/repo', map, [base], [base])).toEqual([]);
    expect(changedPrototypeNotifications('octo/repo', map, [base], [{ ...base, updatedAt: '2026-09-29T13:00:00.000Z' }])).toMatchObject([{ kind: 'prototypeReady', ticketNumber: 11 }]);
  });
});

describe('hand-off status notifications', () => {
  const now = Date.parse('2026-09-29T12:00:00.000Z');
  const handOff = (overrides: Partial<HandOffStatusDto> = {}): HandOffStatusDto => ({
    id: 'handoff-11',
    repo: 'octo/repo',
    mapNumber: 5,
    mapTitle: 'Roadmap',
    ticketNumber: 11,
    title: 'Retire API agents',
    threadId: 'thread-11',
    rung: 'thread',
    status: 'running',
    acknowledged: false,
    createdAt: new Date(now - 120_000).toISOString(),
    updatedAt: new Date(now - 120_000).toISOString(),
    lastSeenAt: null,
    stale: false,
    sequence: null,
    branch: null,
    pendingApproval: false,
    pendingUserInput: false,
    pullRequests: [],
    ...overrides,
  });

  it('notifies on waiting, failed, and prototype branch transitions, once each', () => {
    const before = handOff();
    const waiting = handOff({ status: 'waiting', pendingApproval: true, updatedAt: new Date(now).toISOString() });
    const failed = handOff({ id: 'handoff-12', ticketNumber: 12, status: 'failed', updatedAt: new Date(now).toISOString() });
    const prototype = handOff({ id: 'handoff-13', ticketNumber: 13, branch: 'prototype/13-shell', updatedAt: new Date(now).toISOString() });

    expect(handOffTransitionNotifications([before], [waiting, failed, prototype], now).map(({ kind }) => kind)).toEqual([
      'threadWaiting',
      'handOffError',
      'prototypeReady',
    ]);
    expect(handOffTransitionNotifications([waiting, failed, prototype], [waiting, failed, prototype], now)).toEqual([]);
  });
});
