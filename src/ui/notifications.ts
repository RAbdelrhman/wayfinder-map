import { mapPath } from '../repoRoutes.js';
import { prototypeTicketNumber } from '../prototypes.js';
import type { HandOffStatusDto } from '../handOffTracking.js';
import type { MapEvent } from '../mapWatch.js';
import type { DesktopNotification, NotificationKind } from '../notificationTypes.js';
import type { Prototype, WayfinderMap } from '../types.js';
import { escapeHtml } from './markdown.js';
import { paintIcons } from './chrome.js';

export const NOTIFICATIONS_KEY = 'wayfinder-map:notifications';
const NOTIFICATION_LIMIT = 100;

export interface InboxNotification {
  id: string;
  kind: NotificationKind;
  repo: string;
  mapNumber: number;
  mapTitle: string;
  ticketNumber: number;
  ticketTitle: string;
  createdAt: string;
  read: boolean;
}

export type NewInboxNotification = Omit<InboxNotification, 'read'>;

export interface UnblockedTicket {
  number: number;
  title: string;
  type: string | null;
}

const KIND_LABEL: Record<NotificationKind, string> = {
  unblocked: 'Ready to start',
  threadWaiting: 'T3 Code needs you',
  failingCi: 'CI is failing',
  reviewReady: 'PR ready for review',
  handOffError: 'Hand-off error',
  stalled: 'Ticket stalled',
  prototypeReady: 'Prototype ready to review',
};

export function kindForMapEvent(event: MapEvent): NotificationKind | null {
  if (event.type === 'ticket-next') return 'unblocked';
  if (event.type === 'ci-changed' && event.pullRequest.checks === 'failing') return 'failingCi';
  if (
    (event.type === 'pr-opened' || event.type === 'ci-changed' || event.type === 'review-changed') &&
    reviewIsReady(event.pullRequest)
  ) {
    return 'reviewReady';
  }
  return null;
}

function reviewIsReady(pullRequest: Extract<MapEvent, { pullRequest: unknown }>['pullRequest']): boolean {
  return pullRequest.state === 'open' && pullRequest.isDraft === false && pullRequest.checks === 'passing' && pullRequest.review === 'review_required';
}

export function mapEventNotification(event: MapEvent, mapTitle: string): NewInboxNotification | null {
  const kind = kindForMapEvent(event);
  if (kind === null) return null;
  return {
    id: 'map:' + event.repo.toLocaleLowerCase() + '#' + String(event.mapNumber) + ':' + String(event.id) + ':' + event.at,
    kind,
    repo: event.repo,
    mapNumber: event.mapNumber,
    mapTitle,
    ticketNumber: event.ticket.number,
    ticketTitle: event.ticket.title,
    createdAt: event.at,
  };
}

export function statusNotification(
  kind: Exclude<NotificationKind, 'unblocked' | 'failingCi' | 'reviewReady'>,
  id: string,
  repo: string,
  mapNumber: number,
  mapTitle: string,
  ticketNumber: number,
  ticketTitle: string,
  createdAt: string,
): NewInboxNotification {
  return { id, kind, repo, mapNumber, mapTitle, ticketNumber, ticketTitle, createdAt };
}

/** New prototype branches and changed branch snapshots that should ask for review. */
export function changedPrototypeNotifications(
  repo: string,
  map: WayfinderMap,
  previous: readonly Prototype[],
  next: readonly Prototype[],
): NewInboxNotification[] {
  const before = new Map(previous.map((prototype) => [prototype.branch, prototype]));
  return next.flatMap((prototype) => {
    const ticket = map.tickets.find((candidate) => candidate.number === prototype.ticketNumber);
    if (ticket?.type !== 'prototype') return [];
    const was = before.get(prototype.branch);
    const revision = JSON.stringify([prototype.updatedAt, prototype.files, prototype.preview, prototype.variants ?? []]);
    if (was !== undefined && JSON.stringify([was.updatedAt, was.files, was.preview, was.variants ?? []]) === revision) return [];
    const baseId = 'prototype:' + repo.toLocaleLowerCase() + '#' + String(map.number) + '#' + String(ticket.number) + ':' + prototype.branch;
    return [statusNotification(
      'prototypeReady',
      was === undefined ? baseId : baseId + ':' + revision,
      repo,
      map.number,
      map.title,
      ticket.number,
      ticket.title,
      prototype.updatedAt ?? new Date().toISOString(),
    )];
  });
}

/** Hand-off status changes that ask for input, report an error, or publish a prototype branch. */
export function handOffTransitionNotifications(
  previous: readonly HandOffStatusDto[],
  next: readonly HandOffStatusDto[],
  now: number = Date.now(),
): NewInboxNotification[] {
  const before = new Map(previous.map((handOff) => [handOff.id, handOff]));
  return next.flatMap((handOff) => {
    const { repo, mapNumber, ticketNumber, mapTitle, title, updatedAt } = handOff;
    if (mapNumber === null || ticketNumber === null) return [];
    const was = before.get(handOff.id);
    const age = now - Date.parse(updatedAt);
    const recent = age >= 0 && age < 60_000;
    const notices: NewInboxNotification[] = [];
    const mapName = mapTitle?.trim() || 'Map #' + String(mapNumber);
    const ticketName = title?.trim() || '#' + String(ticketNumber);
    const waiting = handOff.pendingApproval || handOff.pendingUserInput || handOff.status === 'waiting';
    const wasWaiting = was !== undefined && (was.pendingApproval || was.pendingUserInput || was.status === 'waiting');
    if (waiting && !wasWaiting && (was !== undefined || recent)) {
      notices.push(statusNotification(
        'threadWaiting',
        'handoff:' + handOff.id + ':waiting:' + updatedAt,
        repo,
        mapNumber,
        mapName,
        ticketNumber,
        ticketName,
        updatedAt,
      ));
    }
    if (handOff.status === 'failed' && was?.status !== 'failed' && (was !== undefined || recent)) {
      notices.push(statusNotification(
        'handOffError',
        'handoff:' + handOff.id + ':failed:' + updatedAt,
        repo,
        mapNumber,
        mapName,
        ticketNumber,
        ticketName,
        updatedAt,
      ));
    }
    if (
      handOff.branch !== null &&
      prototypeTicketNumber(handOff.branch) === ticketNumber &&
      was?.branch !== handOff.branch &&
      (was !== undefined || recent)
    ) {
      notices.push(statusNotification(
        'prototypeReady',
        'prototype:' + repo.toLocaleLowerCase() + '#' + String(mapNumber) + '#' + String(ticketNumber) + ':' + handOff.branch,
        repo,
        mapNumber,
        mapName,
        ticketNumber,
        ticketName,
        updatedAt,
      ));
    }
    return notices;
  });
}

function isInboxNotification(value: unknown): value is InboxNotification {
  if (typeof value !== 'object' || value === null) return false;
  const raw = value as Record<string, unknown>;
  return typeof raw.id === 'string' &&
    typeof raw.kind === 'string' &&
    Object.prototype.hasOwnProperty.call(KIND_LABEL, raw.kind) &&
    typeof raw.repo === 'string' &&
    typeof raw.mapNumber === 'number' &&
    typeof raw.mapTitle === 'string' &&
    typeof raw.ticketNumber === 'number' &&
    typeof raw.ticketTitle === 'string' &&
    typeof raw.createdAt === 'string' &&
    typeof raw.read === 'boolean';
}

export class NotificationInbox {
  private items: InboxNotification[];

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'>) {
    this.items = this.read();
  }

  list(): readonly InboxNotification[] {
    return this.items.map((item) => ({ ...item }));
  }

  unreadCount(): number {
    return this.items.filter((item) => !item.read).length;
  }

  push(notification: NewInboxNotification): boolean {
    if (this.items.some((item) => item.id === notification.id)) return false;
    this.items = [{ ...notification, read: false }, ...this.items].slice(0, NOTIFICATION_LIMIT);
    this.write();
    return true;
  }

  markAllRead(): void {
    if (this.items.every((item) => item.read)) return;
    this.items = this.items.map((item) => ({ ...item, read: true }));
    this.write();
  }

  private read(): InboxNotification[] {
    try {
      const parsed: unknown = JSON.parse(this.storage.getItem(NOTIFICATIONS_KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed.filter(isInboxNotification).slice(0, NOTIFICATION_LIMIT) : [];
    } catch {
      return [];
    }
  }

  private write(): void {
    try {
      this.storage.setItem(NOTIFICATIONS_KEY, JSON.stringify(this.items));
    } catch {
      // Notifications stay available for this page even when browser storage is full.
    }
  }
}

export function notificationHref(notification: Pick<InboxNotification, 'repo' | 'mapNumber' | 'ticketNumber'>): string {
  return mapPath(notification.repo, notification.mapNumber) + '?view=map&ticket=' + String(notification.ticketNumber);
}

export function notificationPanelHtml(items: readonly InboxNotification[]): string {
  if (items.length === 0) return '<p class="notification-empty">No notifications yet.</p>';
  return '<ol class="notification-items">' + items.map((item) => {
    const href = notificationHref(item);
    const description = '#' + String(item.ticketNumber) + ' ' + item.ticketTitle;
    return '<li><a class="notification-item' + (item.read ? '' : ' is-unread') +
      '" href="' + escapeHtml(href) + '"><span class="notification-kind">' + escapeHtml(KIND_LABEL[item.kind]) +
      '</span><strong>' + escapeHtml(description) + '</strong><span class="notification-context">' +
      escapeHtml(item.repo + ' · Map #' + String(item.mapNumber) + ' ' + item.mapTitle) +
      '</span><time datetime="' + escapeHtml(item.createdAt) + '">' + escapeHtml(notificationTime(item.createdAt)) +
      '</time></a></li>';
  }).join('') + '</ol>';
}

function notificationTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export function desktopNotificationFor(
  notification: InboxNotification,
): DesktopNotification {
  return {
    kind: notification.kind,
    title: notification.repo + ' · Map #' + String(notification.mapNumber) + ' ' + notification.mapTitle,
    body: KIND_LABEL[notification.kind] + ': #' + String(notification.ticketNumber) + ' ' + notification.ticketTitle,
    repo: notification.repo,
    mapNumber: notification.mapNumber,
    ticketNumber: notification.ticketNumber,
  };
}

export interface NotificationInboxController {
  push: (notification: NewInboxNotification) => boolean;
  list: () => readonly InboxNotification[];
  unreadCount: () => number;
}

export interface UnblockedNoticeController {
  add: (ticket: UnblockedTicket, closedTicket: number | null) => void;
  close: () => void;
}

export function mountUnblockedNotice(
  host: HTMLElement,
  onShow: (ticketNumber: number) => void,
  onStart: (ticketNumbers: readonly number[]) => Promise<readonly number[]>,
): UnblockedNoticeController {
  const tickets = new Map<number, UnblockedTicket>();
  const closedTickets = new Set<number>();
  const close = (): void => {
    host.hidden = true;
    tickets.clear();
    closedTickets.clear();
    host.innerHTML = '';
  };
  const render = (): void => {
    const ready = Array.from(tickets.values());
    if (ready.length === 0) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    const startable = ready.filter((ticket) => ticket.type === 'task' || ticket.type === 'research');
    const closed = Array.from(closedTickets).map((number) => '#' + String(number) + ' closed').join(' and ');
    const readyText = ready.map((ticket) => '#' + String(ticket.number)).join(', ');
    const message = (closed === '' ? '' : closed + '. ') + readyText + (ready.length === 1 ? ' is ready.' : ' are ready.');
    const startLabel = startable.length === 1 ? 'Start' : 'Start ' + String(startable.length);
    host.innerHTML = '<div class="unblocked-notice-card"><p>' + escapeHtml(message) + '</p>' +
      '<div class="unblocked-notice-actions"><button type="button" class="primary" data-notice-start' +
      (startable.length === 0 ? ' hidden disabled' : '') + '>' + startLabel + '</button>' +
      '<button type="button" class="ghost" data-notice-show>Show</button>' +
      '<button type="button" class="ghost" data-notice-dismiss>Dismiss</button></div></div>';
    host.hidden = false;
  };
  host.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-notice-dismiss]')) {
      close();
      return;
    }
    if (target.closest('[data-notice-show]')) {
      const first = tickets.keys().next().value as number | undefined;
      if (first !== undefined) onShow(first);
      return;
    }
    const start = target.closest<HTMLButtonElement>('[data-notice-start]');
    if (start === null) return;
    const numbers = Array.from(tickets.values())
      .filter((ticket) => ticket.type === 'task' || ticket.type === 'research')
      .map((ticket) => ticket.number);
    if (numbers.length === 0) return;
    start.disabled = true;
    const started = new Set(await onStart(numbers));
    for (const number of started) tickets.delete(number);
    if (tickets.size === 0) close();
    else render();
    start.disabled = false;
  });
  return {
    add(ticket, closedTicket) {
      tickets.set(ticket.number, ticket);
      if (closedTicket !== null) closedTickets.add(closedTicket);
      render();
    },
    close,
  };
}

export function mountNotificationInbox(): NotificationInboxController {
  const trigger = document.getElementById('notification-trigger');
  const panel = document.getElementById('notification-panel');
  const body = document.getElementById('notification-body');
  const badge = document.getElementById('notification-count');
  if (!(trigger instanceof HTMLButtonElement) || !(panel instanceof HTMLElement) || !(body instanceof HTMLElement) || !(badge instanceof HTMLElement)) {
    throw new Error('Missing notification inbox controls.');
  }
  const inbox = new NotificationInbox(localStorage);
  const draw = (): void => {
    body.innerHTML = notificationPanelHtml(inbox.list());
    const unread = inbox.unreadCount();
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.hidden = unread === 0;
    trigger.setAttribute('aria-label', unread === 0 ? 'Notifications' : 'Notifications, ' + String(unread) + ' unread');
    paintIcons(body);
  };
  const close = (): void => {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  };
  trigger.addEventListener('click', () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    trigger.setAttribute('aria-expanded', String(opening));
    if (!opening) return;
    inbox.markAllRead();
    draw();
    void fetch('/api/desktop/notifications/read', { method: 'POST' }).catch(() => undefined);
  });
  panel.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest('[data-notification-close]')) close();
  });
  document.addEventListener('click', (event) => {
    if (!panel.hidden && event.target instanceof Node && !panel.contains(event.target) && !trigger.contains(event.target)) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      close();
      trigger.focus();
    }
  });
  draw();
  return {
    push(notification) {
      const added = inbox.push(notification);
      if (added) draw();
      return added;
    },
    list: () => inbox.list(),
    unreadCount: () => inbox.unreadCount(),
  };
}
