import type { MapEvent } from '../mapWatch.js';
import { KIND_LABEL, mapEventNotification, notificationHref } from './notifications.js';
import type { InboxNotification } from './notifications.js';
import { escapeHtml } from './markdown.js';

export type InboxFilter = 'all' | 'needs';
export type InboxRow =
  | { type: 'needs'; at: string; notification: InboxNotification }
  | { type: 'activity'; at: string; event: MapEvent }
  | { type: 'legacyActivity'; at: string; notification: InboxNotification };

function scope(item: InboxNotification): string {
  return `${item.repo.toLowerCase()}#${String(item.mapNumber)}#${String(item.ticketNumber)}:${item.kind}`;
}

/** Keep the newest alert for a condition, and prefer it to the same watcher event. */
export function mergeInbox(events: readonly MapEvent[], notifications: readonly InboxNotification[]): InboxRow[] {
  const rows: InboxRow[] = [];
  const seen = new Set<string>();
  const sorted = [...notifications].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  for (const notification of sorted) {
    if (notification.resolved === true || notification.kind === 'unblocked') continue;
    const key = scope(notification);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ type: 'needs', at: notification.createdAt, notification });
  }
  for (const event of events) {
    const notice = mapEventNotification(event, '');
    // A handled alert must not reappear as unread activity from the other source.
    if (notice !== null && notice.kind !== 'unblocked' &&
      notifications.some((item) => item.id === notice.id || (item.resolved !== true && scope(item) === scope({ ...notice, read: false })))) continue;
    rows.push({ type: 'activity', at: event.at, event });
  }
  for (const notification of sorted) {
    if (notification.kind !== 'unblocked' || notification.read || notification.resolved === true) continue;
    if (events.some((event) => mapEventNotification(event, '')?.id === notification.id)) continue;
    rows.push({ type: 'legacyActivity', at: notification.createdAt, notification });
  }
  return rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export function filterInbox(rows: readonly InboxRow[], filter: InboxFilter): readonly InboxRow[] {
  return filter === 'needs' ? rows.filter((row) => row.type === 'needs') : rows;
}

export function inboxCounts(rows: readonly InboxRow[]): { needs: number; activity: number; total: number; accessibleName: string; summary: string } {
  const needs = rows.filter((row) => row.type === 'needs').length;
  const activity = rows.length - needs;
  return {
    needs, activity, total: rows.length,
    accessibleName: `Inbox, ${String(needs)} need you, ${String(activity)} new`,
    summary: `${String(needs)} need you · ${String(activity)} new on maps you have opened`,
  };
}

export function notificationRowHtml(item: InboxNotification): string {
  const needs = item.kind !== 'unblocked';
  const at = new Date(item.createdAt).toLocaleString();
  return `<article class="map-inbox-item${needs ? ' map-inbox-needs' : ''}"><a class="map-inbox-event" href="${escapeHtml(notificationHref(item))}" data-map-inbox-event="${escapeHtml(item.id)}">${needs ? `<span class="map-inbox-kind">${escapeHtml(KIND_LABEL[item.kind])}</span>` : ''}<span class="map-inbox-event-title">${escapeHtml(`#${String(item.ticketNumber)} ${item.ticketTitle}${needs ? '' : ' is ready to start'}`)}</span><span class="map-inbox-event-scope">${escapeHtml(`${item.repo} · Map #${String(item.mapNumber)} ${item.mapTitle}`)}</span></a><time class="map-inbox-time" datetime="${escapeHtml(item.createdAt)}">${escapeHtml(at)}</time></article>`;
}
