import { describe, expect, it } from 'vitest';
import type { MapEvent } from '../mapWatch.js';
import type { HandOffStatusDto } from '../handOffTracking.js';
import type { WayfinderMap } from '../types.js';
import { MAP_EVENT_INBOX_KEY, MAP_WATCH_SET_KEY, MapEventInbox, markMapInboxEventRead, mapInboxItemHtml, readMapInboxEvents, recoverMapInboxNotifications, rememberMapWatch, saveMapInboxEvent } from './mapEventInbox.js';
import { DEFAULT_NOTIFICATION_SETTINGS } from '../notificationTypes.js';
import { mapEventNotification, NotificationInbox } from './notifications.js';
import type { InboxNotification } from './notifications.js';
import { filterInbox, inboxCounts, mergeInbox, notificationRowHtml } from './unifiedInbox.js';

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

const event: Extract<MapEvent, { type: 'ci-changed' }> = {
  id: 4, repo: 'octo/repo', mapNumber: 5, at: '2026-10-05T12:00:00Z',
  ticket: { number: 11, title: 'Build <Inbox>' }, type: 'ci-changed', from: 'pending', to: 'failing',
  pullRequest: { number: 12, url: 'https://github.com/octo/repo/pull/12', state: 'open', draft: false, checks: 'failing', review: 'review_required' },
};
const alert: InboxNotification = { ...mapEventNotification(event, 'Roadmap')!, read: false };
const ready: MapEvent = { id: 5, repo: 'octo/repo', mapNumber: 5, at: '2026-10-05T12:01:00Z', ticket: { number: 13, title: 'Next ticket' }, type: 'ticket-next', from: 'blocked', whileYouWereAway: true };
function map(): WayfinderMap {
  return {
    number: 5, title: 'Roadmap', url: '', body: '', open: true, author: 'octo', visibility: 'private',
    sections: { destination: '', notes: '', decisions: '', fog: '', outOfScope: '' },
    tickets: [{ number: 11, title: 'Build Inbox', url: '', body: '', type: 'task', labels: [], open: true, assignee: 'octo', blockedBy: [], openBlockers: [], state: 'claimed', updatedAt: null }],
    outside: [], criticalPath: { tickets: [], remaining: 0 }, stalled: [],
    pullRequests: [{ ...event.pullRequest, ticket: 11 }], settled: null, ticketsLoaded: true,
  };
}
function handOff(overrides: Partial<HandOffStatusDto> = {}): HandOffStatusDto {
  return {
    id: 'thread-11', repo: 'octo/repo', mapNumber: 5, mapTitle: 'Roadmap', ticketNumber: 11,
    title: 'Build Inbox', threadId: 'thread', rung: 'thread', status: 'waiting', acknowledged: false,
    createdAt: event.at, updatedAt: event.at, lastSeenAt: null, stale: false, sequence: null, branch: null,
    pendingApproval: true, pendingUserInput: false, pullRequests: [], ...overrides,
  };
}

describe('unified Inbox', () => {
  it('merges newest first, prefers needs-you over the matching watcher event and collapses repeated conditions', () => {
    const repeat = { ...alert, id: 'repeat', createdAt: '2026-10-05T12:02:00Z', read: true };
    const rows = mergeInbox([event, ready], [alert, repeat]);
    expect(rows.map((row) => row.type)).toEqual(['needs', 'activity']);
    expect(rows[0]).toMatchObject({ notification: { id: 'repeat' } });
    expect(inboxCounts(rows)).toMatchObject({ needs: 0, activity: 1, total: 1 });
  });

  it('also de-duplicates a PR ready for review and keeps repo/map/ticket boundaries', () => {
    const review = { ...event, pullRequest: { ...event.pullRequest, checks: 'passing' as const } };
    const notice = { ...mapEventNotification(review, 'Roadmap')!, read: false };
    const elsewhere = { ...notice, id: 'elsewhere', repo: 'octo/other' };
    expect(mergeInbox([review], [notice, elsewhere])).toHaveLength(2);
    expect(mergeInbox([review], [notice]).map((row) => row.type)).toEqual(['needs']);
  });

  it('treats Ready to start as activity, including migrated bell history, and filters only needs-you', () => {
    const unblocked = { ...mapEventNotification(ready, 'Roadmap')!, read: false };
    const rows = mergeInbox([event, ready], [alert, unblocked]);
    expect(rows).toHaveLength(2);
    expect(filterInbox(rows, 'needs')).toEqual([rows[1]]);
    expect(filterInbox(rows, 'all')).toEqual(rows);
    expect(mergeInbox([], [unblocked])[0]?.type).toBe('legacyActivity');
  });

  it('clears activity in both stores, preserves needs-you across restart, and preserves replay cursors', () => {
    const saved = storage();
    rememberMapWatch(saved, event.repo, 5);
    saveMapInboxEvent(saved, event);
    saveMapInboxEvent(saved, ready);
    const notifications = new NotificationInbox(saved);
    notifications.push(alert);
    notifications.push(mapEventNotification(ready, 'Roadmap')!);
    const activity = new MapEventInbox(saved);
    activity.clear();
    notifications.clearActivity();
    expect(mergeInbox(readMapInboxEvents(saved), new NotificationInbox(saved).list())).toEqual([{ type: 'needs', at: alert.createdAt, notification: { ...alert, resolved: false } }]);
    expect(saveMapInboxEvent(saved, ready)).toBe(false);
  });

  it('counts the merged timeline independently of the filter and gives the button a complete accessible name', () => {
    const rows = mergeInbox([ready], [alert]);
    expect(inboxCounts(rows)).toEqual({ needs: 1, activity: 1, total: 2, accessibleName: 'Inbox, 1 need you, 1 new', summary: '1 need you · 1 new on maps you have opened' });
    expect(inboxCounts([]).accessibleName).toBe('Inbox, 0 need you, 0 new');
    expect(filterInbox(rows, 'needs')).toHaveLength(1);
    expect(inboxCounts(rows).total).toBe(2);
  });

  it('escapes ticket copy and links needs-you rows to their ticket', () => {
    const html = notificationRowHtml(alert);
    expect(html).toContain('map-inbox-needs');
    expect(html).toContain('CI is failing');
    expect(html).toContain('Build &lt;Inbox&gt;');
    expect(html).toContain('/repos/octo/repo/maps/5?view=map&amp;ticket=11');
  });
});

describe('handled needs-you conditions', () => {
  it('removes handled CI alerts from both sources and does not notify twice after restart', () => {
    const saved = storage();
    const inbox = new NotificationInbox(saved);
    inbox.push(alert);
    inbox.reconcileEvent({ ...event, id: 6, to: 'passing', pullRequest: { ...event.pullRequest, checks: 'passing' } });
    expect(mergeInbox([event], inbox.list())).toEqual([]);
    expect(new NotificationInbox(saved).push(alert)).toBe(false);
  });

  it('reconciles CI, review, stalls and prototype alerts when their ticket closes, and preserves other repos', () => {
    const inbox = new NotificationInbox(storage());
    for (const kind of ['failingCi', 'reviewReady', 'stalled', 'prototypeReady'] as const) inbox.push({ ...alert, id: kind, kind });
    inbox.push({ ...alert, id: 'other', repo: 'octo/other' });
    const closed = map();
    closed.tickets[0]!.open = false;
    inbox.reconcileSnapshot({ repo: 'octo/repo', maps: [closed] });
    expect(mergeInbox([], inbox.list())).toMatchObject([{ notification: { id: 'other' } }]);
  });

  it('removes waiting and error alerts once the hand-off resumes, including an async notice arriving after resolution', () => {
    const inbox = new NotificationInbox(storage());
    inbox.reconcileHandOffs([handOff()]);
    inbox.push({ ...alert, id: 'waiting', kind: 'threadWaiting' });
    expect(mergeInbox([], inbox.list())).toHaveLength(1);
    inbox.reconcileHandOffs([handOff({ status: 'running', pendingApproval: false })]);
    inbox.push({ ...alert, id: 'late', kind: 'handOffError' });
    expect(mergeInbox([], inbox.list())).toEqual([]);
  });

  it('updates a cached snapshot from watcher events before accepting a new CI failure', () => {
    const inbox = new NotificationInbox(storage());
    const healthy = map();
    healthy.pullRequests[0]!.checks = 'passing';
    inbox.reconcileSnapshot({ repo: 'octo/repo', maps: [healthy], fetchedAt: '2026-10-05T11:59:00Z' });
    inbox.reconcileEvent(event);
    inbox.push(alert);
    expect(mergeInbox([event], inbox.list())).toHaveLength(1);
    healthy.pullRequests[0]!.checks = 'pending';
    inbox.reconcileSnapshot({ repo: 'octo/repo', maps: [healthy], fetchedAt: '2026-10-05T12:01:00Z' });
    expect(mergeInbox([event], inbox.list())).toEqual([]);
  });
});

describe('inbox review regressions', () => {
  it('recovers interrupted needs-you delivery idempotently and honors disabled kinds', async () => {
    const saved = storage();
    saved.setItem(MAP_EVENT_INBOX_KEY, JSON.stringify([event, ready]));
    const inbox = new NotificationInbox(saved);
    const recovered: string[] = [];
    const controller = { reconcileEvent: async (item: MapEvent) => { inbox.reconcileEvent(item); }, push: async (notice: Parameters<NotificationInbox['push']>[0]) => {
      const added = inbox.push(notice);
      if (added) recovered.push(notice.id);
      return added;
    } };
    await recoverMapInboxNotifications(saved, { ...DEFAULT_NOTIFICATION_SETTINGS, failingCi: false }, controller);
    expect(recovered).toEqual([]);
    await recoverMapInboxNotifications(saved, DEFAULT_NOTIFICATION_SETTINGS, controller);
    await recoverMapInboxNotifications(saved, DEFAULT_NOTIFICATION_SETTINGS, controller);
    expect(recovered).toEqual([alert.id]);
    expect(mergeInbox(readMapInboxEvents(saved), inbox.list()).map((row) => row.type)).toEqual(['activity', 'needs']);
  });

  it('recovers chronological resolving events instead of resurrecting a saved CI failure', async () => {
    const saved = storage();
    const passing = { ...event, id: 8, at: '2026-10-05T12:02:00Z', to: 'passing' as const, pullRequest: { ...event.pullRequest, checks: 'passing' as const, review: 'approved' as const } };
    saved.setItem(MAP_EVENT_INBOX_KEY, JSON.stringify([passing, event]));
    const inbox = new NotificationInbox(saved);
    await recoverMapInboxNotifications(saved, DEFAULT_NOTIFICATION_SETTINGS, { push: async (item) => inbox.push(item), reconcileEvent: async (item) => { inbox.reconcileEvent(item); } });
    expect(mergeInbox([], inbox.list())).toHaveLength(0);
  });

  it('escapes hostile notification and activity fields at the markup boundary', () => {
    const hostile = '<img src=x onerror=alert(1)>"';
    for (const html of [notificationRowHtml({ ...alert, ticketTitle: hostile, mapTitle: hostile }), mapInboxItemHtml({ ...ready, ticket: { ...ready.ticket, title: hostile } })]) {
      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;img');
      expect(html).toContain('&quot;');
    }
    expect(() => notificationRowHtml({ ...alert, repo: 'octo/' + hostile })).toThrow('Invalid repository');
  });

  it('rejects older snapshots and snapshots older than a watcher update', () => {
    const inbox = new NotificationInbox(storage());
    inbox.push(alert);
    const active = map();
    inbox.reconcileSnapshot({ repo: event.repo, maps: [active], fetchedAt: '2026-10-05T11:58:00Z' });
    const handled = map();
    handled.pullRequests[0]!.checks = 'passing';
    inbox.reconcileSnapshot({ repo: event.repo, maps: [handled], fetchedAt: '2026-10-05T11:57:00Z' });
    expect(mergeInbox([], inbox.list())).toHaveLength(1);
    inbox.reconcileEvent(event);
    inbox.reconcileSnapshot({ repo: event.repo, maps: [handled], fetchedAt: '2026-10-05T11:59:00Z' });
    expect(mergeInbox([], inbox.list())).toHaveLength(1);
  });

  it('retains a watcher alert when the first snapshot is older than the event', () => {
    const inbox = new NotificationInbox(storage());
    inbox.reconcileEvent(event);
    inbox.push(alert);
    const old = map();
    old.pullRequests[0]!.checks = 'passing';
    inbox.reconcileSnapshot({ repo: event.repo, maps: [old], fetchedAt: '2026-10-05T11:59:00Z' });
    expect(mergeInbox([], inbox.list())).toHaveLength(1);
  });

  it('preserves alerts when PR data is absent or unknown, but resolves a merged PR with failing checks', () => {
    const inbox = new NotificationInbox(storage());
    inbox.push(alert);
    const missing = map();
    missing.pullRequests = [];
    inbox.reconcileSnapshot({ repo: event.repo, maps: [missing] });
    expect(mergeInbox([], inbox.list())).toHaveLength(1);
    const unknown = { ...event, pullRequest: { ...event.pullRequest, checks: null, review: null } };
    inbox.reconcileEvent(unknown);
    expect(mergeInbox([], inbox.list())).toHaveLength(1);
    inbox.reconcileEvent({ ...event, id: 8, at: '2026-10-05T12:01:00Z', pullRequest: { ...event.pullRequest, state: 'merged' } });
    expect(mergeInbox([], inbox.list())).toHaveLength(0);
  });

  it('merges writes from independent inboxes and preserves read and resolved state across tabs', () => {
    const saved = storage();
    const first = new NotificationInbox(saved);
    const second = new NotificationInbox(saved);
    expect(first.push(alert)).toBe(true);
    expect(second.push({ ...alert, id: 'other', ticketNumber: 99 })).toBe(true);
    expect(first.push(alert)).toBe(false);
    first.markRead(alert.id);
    second.reconcileEvent({ ...event, id: 8, at: '2026-10-05T12:01:00Z', pullRequest: { ...event.pullRequest, state: 'merged' } });
    first.push({ ...alert, id: 'third', ticketNumber: 88 });
    const reloaded = new NotificationInbox(saved).list();
    expect(reloaded).toHaveLength(3);
    expect(reloaded.find((item) => item.id === alert.id)).toMatchObject({ read: true, resolved: true });
  });

  it('refreshes and reconciles unchanged inbox data without rewriting storage', () => {
    const saved = storage();
    let writes = 0;
    const counted = { getItem: saved.getItem, setItem: (key: string, value: string) => { writes++; saved.setItem(key, value); } };
    const inbox = new NotificationInbox(counted);
    inbox.push(alert);
    const before = writes;
    inbox.refresh();
    inbox.reconcileSnapshot({ repo: event.repo, maps: [map()] });
    inbox.reconcileSnapshot({ repo: event.repo, maps: [map()] });
    expect(writes).toBe(before);
  });

  it('keeps read activity and needs-you rows visible while counting only unread rows', () => {
    const saved = storage();
    rememberMapWatch(saved, event.repo, event.mapNumber);
    saveMapInboxEvent(saved, ready);
    markMapInboxEventRead(saved, 'octo/repo#5:5');
    const legacy = { ...mapEventNotification({ ...ready, id: 9 }, 'Roadmap')!, read: true };
    const rows = mergeInbox(readMapInboxEvents(saved), [{ ...alert, read: true }, legacy]);
    expect(rows).toHaveLength(3);
    expect(inboxCounts(rows)).toMatchObject({ total: 0, accessibleName: 'Inbox, 0 need you, 0 new', summary: '1 need you · 0 new on maps you have opened' });
    const inbox = new NotificationInbox(saved);
    inbox.push(legacy);
    expect(inbox.clearActivity()).toBe(true);
    expect(mergeInbox([], inbox.list())).toHaveLength(0);
  });

  it('delivers saved events when cursor persistence fails and repairs interrupted saves on replay', () => {
    const saved = storage();
    rememberMapWatch(saved, event.repo, event.mapNumber);
    const failingCursor = { getItem: saved.getItem, setItem: (key: string, value: string) => {
      if (key === MAP_WATCH_SET_KEY) throw new Error('quota');
      saved.setItem(key, value);
    } };
    expect(saveMapInboxEvent(failingCursor, event)).toBe(true);
    expect(readMapInboxEvents(saved)).toHaveLength(1);
    expect(saveMapInboxEvent(saved, event)).toBe(true);
    expect(saveMapInboxEvent(saved, event)).toBe(false);
  });

  it('reports rejected clear writes and retains the saved activity', () => {
    const saved = storage();
    const notices = new NotificationInbox(saved);
    notices.push(mapEventNotification(ready, 'Roadmap')!);
    saved.setItem(MAP_EVENT_INBOX_KEY, JSON.stringify([ready]));
    const blocked = { getItem: saved.getItem, setItem: () => { throw new Error('quota'); } };
    const inbox = new NotificationInbox(blocked);
    expect(inbox.clearActivity()).toBe(false);
    expect(mergeInbox([], inbox.list())).toHaveLength(1);
    expect(new MapEventInbox(blocked).clear()).toBe(false);
    expect(readMapInboxEvents(saved)).toHaveLength(1);
  });
});
