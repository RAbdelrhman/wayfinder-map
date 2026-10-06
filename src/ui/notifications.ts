import { mapPath } from '../repoRoutes.js';
import { prototypeTicketNumber } from '../prototypes.js';
import type { HandOffStatusDto } from '../handOffTracking.js';
import type { MapEvent } from '../mapWatch.js';
import type { DesktopNotification, NotificationKind } from '../notificationTypes.js';
import type { MapSnapshot, Prototype, WayfinderMap } from '../types.js';
import { escapeHtml } from './markdown.js';

export const NOTIFICATIONS_CHANGED = 'wayfinder:notifications-changed';
/** The Inbox opened: the user has now seen what finished, so finished hand-offs count as acknowledged. */
export const INBOX_OPENED = 'wayfinder:inbox-opened';
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
  resolved?: boolean;
}

export type NewInboxNotification = Omit<InboxNotification, 'read'> & { read?: boolean };
export type InboxSnapshot = Pick<MapSnapshot, 'repo' | 'maps'> & Partial<Pick<MapSnapshot, 'fetchedAt'>>;

export async function withInboxLock<T>(operation: () => T | Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks !== undefined) {
    return navigator.locks.request('wayfinder-map:inbox', operation);
  }
  return operation();
}

function eventHandlesNotification(item: InboxNotification, event: MapEvent): boolean {
  return event.type === 'ticket-closed' ||
    (item.kind === 'failingCi' && 'pullRequest' in event && (event.pullRequest.state !== 'open' || (event.pullRequest.checks !== null && event.pullRequest.checks !== 'failing'))) ||
    (item.kind === 'reviewReady' && 'pullRequest' in event && (event.pullRequest.state !== 'open' || event.pullRequest.draft || (event.pullRequest.checks !== null && event.pullRequest.checks !== 'passing') || (event.pullRequest.review !== null && event.pullRequest.review !== 'review_required')));
}

function ticketKey(item: { repo: string; mapNumber: number; ticketNumber: number }): string {
  return `${item.repo.toLowerCase()}#${String(item.mapNumber)}#${String(item.ticketNumber)}`;
}

export interface UnblockedTicket {
  number: number;
  title: string;
  type: string | null;
}

export const KIND_LABEL: Record<NotificationKind, string> = {
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
    (event.type === 'pr-opened' || event.type === 'pr-draft-changed' || event.type === 'ci-changed' || event.type === 'review-changed') &&
    reviewIsReady(event.pullRequest)
  ) {
    return 'reviewReady';
  }
  return null;
}

function reviewIsReady(pullRequest: Extract<MapEvent, { pullRequest: unknown }>['pullRequest']): boolean {
  return pullRequest.state === 'open' && pullRequest.draft === false && pullRequest.checks === 'passing' && pullRequest.review === 'review_required';
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
  private snapshots = new Map<string, InboxSnapshot>();
  private handOffs: readonly HandOffStatusDto[] | null = null;
  private eventTimes = new Map<string, number>();
  private ticketEvents = new Map<string, MapEvent>();

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
    this.mergeStored();
    if (this.items.some((item) => item.id === notification.id)) return false;
    const item: InboxNotification = { ...notification, read: notification.read ?? false };
    item.resolved = this.isHandled(item);
    this.items = [item, ...this.items].slice(0, NOTIFICATION_LIMIT);
    this.write();
    return true;
  }

  markAllRead(): void {
    if (this.items.every((item) => item.read)) return;
    this.items = this.items.map((item) => ({ ...item, read: true }));
    this.write();
  }

  clearActivity(): boolean {
    this.mergeStored();
    const previous = this.items;
    this.items = this.items.map((item) => item.kind === 'unblocked' ? { ...item, resolved: true } : item);
    if (this.write()) return true;
    this.items = previous;
    return false;
  }

  markRead(id: string): void {
    this.mergeStored();
    this.items = this.items.map((item) => item.id === id ? { ...item, read: true } : item);
    this.write();
  }

  refresh(): void {
    this.items = this.read();
  }

  reconcileSnapshot(snapshot: InboxSnapshot): void {
    const previous = this.snapshots.get(snapshot.repo.toLowerCase());
    if ((snapshot.fetchedAt === undefined ? 0 : Date.parse(snapshot.fetchedAt)) < (this.eventTimes.get(snapshot.repo.toLowerCase()) ?? 0)) return;
    if (previous?.fetchedAt !== undefined && (snapshot.fetchedAt === undefined || Date.parse(snapshot.fetchedAt) < Date.parse(previous.fetchedAt))) return;
    this.snapshots.set(snapshot.repo.toLowerCase(), snapshot);
    this.reconcile();
  }

  reconcileHandOffs(records: readonly HandOffStatusDto[]): void {
    this.handOffs = records;
    this.reconcile();
  }

  reconcileEvent(event: MapEvent): void {
    this.mergeStored();
    const snapshot = this.snapshots.get(event.repo.toLowerCase());
    const repo = event.repo.toLowerCase();
    const at = Date.parse(event.at);
    const key = ticketKey({ ...event, ticketNumber: event.ticket.number });
    const previousEvent = this.ticketEvents.get(key);
    if (previousEvent !== undefined && at < Date.parse(previousEvent.at)) return;
    if (snapshot?.fetchedAt !== undefined && Date.parse(event.at) < Date.parse(snapshot.fetchedAt)) return;
    this.eventTimes.set(repo, Math.max(this.eventTimes.get(repo) ?? 0, at));
    this.ticketEvents.set(key, event);
    if (snapshot !== undefined) {
      this.snapshots.set(event.repo.toLowerCase(), { ...snapshot, maps: snapshot.maps.map((map) => {
        if (map.number !== event.mapNumber) return map;
        if (event.type === 'ticket-closed') return { ...map, tickets: map.tickets.map((ticket) => ticket.number === event.ticket.number ? { ...ticket, open: false } : ticket) };
        if ('pullRequest' in event) return { ...map, pullRequests: [...map.pullRequests.filter((pr) => pr.ticket !== event.ticket.number), { ...event.pullRequest, ticket: event.ticket.number }] };
        return map;
      }) });
    }
    this.items = this.items.map((item) => {
      if (item.repo.toLowerCase() !== event.repo.toLowerCase() || item.mapNumber !== event.mapNumber || item.ticketNumber !== event.ticket.number) return item;
      const handled = eventHandlesNotification(item, event);
      return handled ? { ...item, resolved: true } : item;
    });
    this.write();
  }

  private reconcile(): void {
    this.mergeStored();
    this.items = this.items.map((item) => item.resolved === true || !this.isHandled(item) ? item : { ...item, resolved: true });
    this.write();
  }

  private isHandled(item: InboxNotification): boolean {
    const event = this.ticketEvents.get(ticketKey(item));
    if (event !== undefined && Date.parse(event.at) >= Date.parse(item.createdAt) && eventHandlesNotification(item, event)) return true;
    const snapshot = this.snapshots.get(item.repo.toLowerCase());
    if (snapshot !== undefined) {
      const map = snapshot.maps.find((candidate) => candidate.number === item.mapNumber);
      if (map === undefined || !map.open) return true;
      if (map.ticketsLoaded) {
        const ticket = [...map.tickets, ...map.outside].find((candidate) => candidate.number === item.ticketNumber);
        if (ticket === undefined || !ticket.open) return true;
        if (item.kind === 'stalled') return !map.stalled.some((stall) => stall.ticket === item.ticketNumber);
        const pr = map.pullRequests.find((candidate) => candidate.ticket === item.ticketNumber);
        if (item.kind === 'failingCi') return pr !== undefined && (pr.state !== 'open' || (pr.checks !== null && pr.checks !== 'failing'));
        if (item.kind === 'reviewReady') return pr !== undefined && (pr.state !== 'open' || pr.draft === true || (pr.review !== null && pr.review !== 'review_required') || (pr.checks !== null && pr.checks !== 'passing'));
      }
    }
    if (this.handOffs !== null && (item.kind === 'threadWaiting' || item.kind === 'handOffError')) {
      const records = this.handOffs.filter((record) => record.repo.toLowerCase() === item.repo.toLowerCase() && record.mapNumber === item.mapNumber && record.ticketNumber === item.ticketNumber);
      return !records.some((record) => !record.ticketClosed && (item.kind === 'threadWaiting'
        ? record.pendingApproval || record.pendingUserInput || record.status === 'waiting'
        : record.status === 'failed'));
    }
    return false;
  }

  private read(): InboxNotification[] {
    try {
      const parsed: unknown = JSON.parse(this.storage.getItem(NOTIFICATIONS_KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed.filter(isInboxNotification).slice(0, NOTIFICATION_LIMIT) : [];
    } catch {
      return [];
    }
  }

  private mergeStored(): void {
    const merged = new Map(this.items.map((item) => [item.id, item]));
    for (const item of this.read()) {
      const local = merged.get(item.id);
      merged.set(item.id, local === undefined ? item : { ...local, read: local.read || item.read, resolved: local.resolved === true || item.resolved === true });
    }
    this.items = [...merged.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, NOTIFICATION_LIMIT);
  }

  private write(): boolean {
    try {
      const serialized = JSON.stringify(this.items);
      if (this.storage.getItem(NOTIFICATIONS_KEY) !== serialized) this.storage.setItem(NOTIFICATIONS_KEY, serialized);
      return true;
    } catch {
      // Notifications stay available for this page even when browser storage is full.
      return false;
    }
  }
}

export function notificationHref(notification: Pick<InboxNotification, 'repo' | 'mapNumber' | 'ticketNumber'>): string {
  return mapPath(notification.repo, notification.mapNumber) + '?view=map&ticket=' + String(notification.ticketNumber);
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
  push: (notification: NewInboxNotification) => Promise<boolean>;
  list: () => readonly InboxNotification[];
  unreadCount: () => number;
  clearActivity: () => boolean;
  markRead: (id: string) => Promise<void>;
  reconcileSnapshot: (snapshot: InboxSnapshot) => Promise<void>;
  reconcileHandOffs: (records: readonly HandOffStatusDto[]) => Promise<void>;
  reconcileEvent: (event: MapEvent) => Promise<void>;
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
  const inbox = new NotificationInbox(localStorage);
  const changed = (): void => { document.dispatchEvent(new Event(NOTIFICATIONS_CHANGED)); };
  window.addEventListener('storage', (event) => {
    if (event.key === NOTIFICATIONS_KEY) { inbox.refresh(); changed(); }
  });
  return {
    push(notification) { return withInboxLock(() => { const added = inbox.push(notification); if (added) changed(); return added; }); },
    list: () => inbox.list(),
    unreadCount: () => inbox.unreadCount(),
    clearActivity() { const cleared = inbox.clearActivity(); changed(); return cleared; },
    markRead(id) { return withInboxLock(() => { inbox.markRead(id); changed(); }); },
    reconcileSnapshot(snapshot) { return withInboxLock(() => { inbox.reconcileSnapshot(snapshot); changed(); }); },
    reconcileHandOffs(records) { return withInboxLock(() => { inbox.reconcileHandOffs(records); changed(); }); },
    reconcileEvent(event) { return withInboxLock(() => { inbox.reconcileEvent(event); changed(); }); },
  };
}
