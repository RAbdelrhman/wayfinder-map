import type { MapEvent } from '../mapWatch.js';
import { mapPath, normalizeRepo, scopedApiPath } from '../repoRoutes.js';
import type { MapSnapshot } from '../types.js';
import { escapeHtml } from './markdown.js';
import * as icons from './icons.js';
import { icon } from './icons.js';
import { INBOX_OPENED, KIND_LABEL, NOTIFICATIONS_CHANGED, mapEventNotification, notificationHref, withInboxLock } from './notifications.js';
import type { NotificationInboxController } from './notifications.js';
import { filterInbox, inboxCounts, mergeInbox } from './unifiedInbox.js';
import type { InboxFilter, InboxRow } from './unifiedInbox.js';
import type { InboxSnapshot } from './notifications.js';
import { readNotificationSettings } from '../notificationTypes.js';
import type { NotificationSettings } from '../notificationTypes.js';

export type MapInboxEvent = MapEvent & { read?: boolean };

function eventKey(event: MapEvent): string {
  return `${event.repo.toLowerCase()}#${String(event.mapNumber)}:${String(event.id)}`;
}

export function markMapInboxEventRead(storage: InboxStorage, key: string): void {
  const events = readMapInboxEvents(storage).map((event) => eventKey(event) === key ? { ...event, read: true } : event);
  try { storage.setItem(MAP_EVENT_INBOX_KEY, JSON.stringify(events)); } catch { /* Leave the saved count unchanged on failure. */ }
}

export async function recoverMapInboxNotifications(storage: InboxStorage, settings: NotificationSettings, notifications: Pick<NotificationInboxController, 'push' | 'reconcileEvent'>): Promise<void> {
  for (const event of readMapInboxEvents(storage).sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id - b.id)) {
    await notifications.reconcileEvent(event);
    const notice = mapEventNotification(event, 'Map #' + String(event.mapNumber));
    if (notice !== null && notice.kind !== 'unblocked' && settings[notice.kind]) await notifications.push({ ...notice, read: event.read === true });
  }
}

export const MAP_WATCH_SET_KEY = 'wayfinder-map:opened-map-watch-set:v1';
export const MAP_EVENT_INBOX_KEY = 'wayfinder-map:event-inbox:v1';
export const MAP_EVENT_POLL_MS = 2 * 60 * 1000;
const MAX_INBOX_EVENTS = 100;

export interface OpenMapWatch {
  repo: string;
  mapNumber: number;
  lastEventId: number;
}

export interface InboxStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface MapEventStream {
  addEventListener(type: string, listener: EventListener): void;
  close(): void;
  readyState: number;
}

export type MapEventStreamFactory = (url: string) => MapEventStream;

export function readMapWatchSet(storage: InboxStorage): OpenMapWatch[] {
  try {
    const raw: unknown = JSON.parse(storage.getItem(MAP_WATCH_SET_KEY) ?? 'null');
    if (!Array.isArray(raw)) return [];
    const watches: OpenMapWatch[] = [];
    for (const value of raw) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
      const item = value as Record<string, unknown>;
      const repo = typeof item['repo'] === 'string' ? normalizeRepo(item['repo']) : null;
      if (repo === null || !Number.isSafeInteger(item['mapNumber']) || (item['mapNumber'] as number) <= 0) continue;
      const lastEventId = Number.isSafeInteger(item['lastEventId']) && (item['lastEventId'] as number) >= 0 ? item['lastEventId'] as number : 0;
      if (watches.some((watch) => watch.repo.toLowerCase() === repo.toLowerCase() && watch.mapNumber === item['mapNumber'])) continue;
      watches.push({ repo, mapNumber: item['mapNumber'] as number, lastEventId });
    }
    return watches;
  } catch {
    return [];
  }
}

export function rememberMapWatch(storage: InboxStorage, repoValue: string, mapNumber: number): OpenMapWatch[] {
  const repo = normalizeRepo(repoValue);
  if (repo === null || !Number.isSafeInteger(mapNumber) || mapNumber <= 0) return readMapWatchSet(storage);
  const watches = readMapWatchSet(storage);
  if (!watches.some((watch) => watch.repo.toLowerCase() === repo.toLowerCase() && watch.mapNumber === mapNumber)) {
    watches.push({ repo, mapNumber, lastEventId: 0 });
    try {
      storage.setItem(MAP_WATCH_SET_KEY, JSON.stringify(watches));
    } catch {
      // A storage failure should not block opening a map.
    }
  }
  return watches;
}

function isMapEvent(value: unknown): value is MapEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  const ticket = event['ticket'];
  return Number.isSafeInteger(event['id']) &&
    Number.isSafeInteger(event['mapNumber']) &&
    typeof event['repo'] === 'string' && normalizeRepo(event['repo']) !== null &&
    typeof event['at'] === 'string' && !Number.isNaN(Date.parse(event['at'])) &&
    ['ticket-closed', 'ticket-next', 'pr-opened', 'pr-merged', 'pr-draft-changed', 'ci-changed', 'review-changed'].includes(String(event['type'])) &&
    typeof ticket === 'object' && ticket !== null && !Array.isArray(ticket) &&
    Number.isSafeInteger((ticket as Record<string, unknown>)['number']) &&
    typeof (ticket as Record<string, unknown>)['title'] === 'string';
}

export function readMapInboxEvents(storage: InboxStorage): MapInboxEvent[] {
  try {
    const raw: unknown = JSON.parse(storage.getItem(MAP_EVENT_INBOX_KEY) ?? 'null');
    return Array.isArray(raw) ? raw.filter(isMapEvent).slice(0, MAX_INBOX_EVENTS) : [];
  } catch {
    return [];
  }
}

/** Saves one new event and advances that map's replay cursor. */
export function saveMapInboxEvent(storage: InboxStorage, event: MapEvent): boolean {
  const watches = readMapWatchSet(storage);
  const index = watches.findIndex((watch) => watch.repo.toLowerCase() === event.repo.toLowerCase() && watch.mapNumber === event.mapNumber);
  if (index < 0) return false;
  const current = watches[index];
  if (current === undefined || event.id <= current.lastEventId) return false;
  const duplicate = readMapInboxEvents(storage).some((item) => item.repo.toLowerCase() === event.repo.toLowerCase() && item.mapNumber === event.mapNumber && item.id === event.id);
  watches[index] = { ...current, lastEventId: event.id };
  let persisted = duplicate;
  try {
    if (!duplicate) {
      const events = [event, ...readMapInboxEvents(storage)].slice(0, MAX_INBOX_EVENTS);
      storage.setItem(MAP_EVENT_INBOX_KEY, JSON.stringify(events));
      persisted = true;
    }
    storage.setItem(MAP_WATCH_SET_KEY, JSON.stringify(watches));
  } catch {
    return persisted;
  }
  // A duplicate with an old cursor may have survived an interrupted two-write save.
  return true;
}

function eventSummary(event: MapEvent): string {
  const ticket = `#${String(event.ticket.number)} ${event.ticket.title}`;
  switch (event.type) {
    case 'ticket-closed': return `${ticket} closed`;
    case 'ticket-next': return `${ticket} is ready to start`;
    case 'pr-opened': return `PR #${String(event.pullRequest.number)} opened for ${ticket}`;
    case 'pr-merged': return `PR #${String(event.pullRequest.number)} merged for ${ticket}`;
    case 'pr-draft-changed': return `PR #${String(event.pullRequest.number)} ${event.to === false ? 'is no longer a draft for' : 'is now a draft for'} ${ticket}`;
    case 'ci-changed': return `CI for ${ticket} changed to ${event.to ?? 'unknown'}`;
    case 'review-changed': return `Review for ${ticket} changed to ${event.to ?? 'unknown'}`;
  }
}

function eventHref(event: MapEvent): string {
  return `${mapPath(event.repo, event.mapNumber)}?view=map&ticket=${String(event.ticket.number)}`;
}

export function mapInboxItemHtml(event: MapEvent): string {
  const away = event.whileYouWereAway === true ? '<span class="map-inbox-away">While you were away</span>' : '';
  const repoAndMap = `${event.repo} · Map #${String(event.mapNumber)}`;
  const date = new Date(event.at);
  const timestamp = Number.isNaN(date.valueOf()) ? '' : date.toLocaleString();
  return `<article class="map-inbox-item${(event as MapInboxEvent).read === true ? ' is-read' : ''}"><a class="map-inbox-event" href="${escapeHtml(eventHref(event))}" data-map-inbox-event="${escapeHtml(eventKey(event))}"><span class="map-inbox-event-title">${escapeHtml(eventSummary(event))}</span><span class="map-inbox-event-scope">${escapeHtml(repoAndMap)}</span></a>${away}<time class="map-inbox-time" datetime="${escapeHtml(event.at)}">${escapeHtml(timestamp)}</time></article>`;
}

export class MapEventInbox {
  private watches: OpenMapWatch[];
  private eventListeners = new Set<(event: MapEvent) => void>();
  private source: MapEventStream | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private snapshotTimes = new Map<string, number>();

  constructor(
    private readonly storage: InboxStorage,
    private readonly createStream: MapEventStreamFactory = (url) => new EventSource(url),
    private readonly fetcher: typeof fetch = fetch,
    private readonly onChange: () => void = () => undefined,
    private readonly onSnapshot: (snapshot: InboxSnapshot) => void = () => undefined,
  ) {
    this.watches = readMapWatchSet(storage);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.connect();
    void this.refreshRepositories();
    this.timer = setInterval(() => void this.refreshRepositories(), MAP_EVENT_POLL_MS);
  }

  openMap(repo: string, mapNumber: number): void {
    const existed = this.watches.some((item) => item.repo.toLowerCase() === repo.toLowerCase() && item.mapNumber === mapNumber);
    this.watches = rememberMapWatch(this.storage, repo, mapNumber);
    if (!existed || this.source === null) this.connect();
  }

  subscribe(listener: (event: MapEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  reconcileSnapshot(snapshot: InboxSnapshot): void {
    const repo = snapshot.repo.toLowerCase();
    const at = snapshot.fetchedAt === undefined ? 0 : Date.parse(snapshot.fetchedAt);
    if (at < (this.snapshotTimes.get(repo) ?? 0)) return;
    this.snapshotTimes.set(repo, at);
    this.onSnapshot(snapshot);
    const active = new Set(snapshot.maps.filter((map) => map.open && map.settled === null).map((map) => map.number));
    const removed = this.watches.filter((watch) => watch.repo.toLowerCase() === snapshot.repo.toLowerCase() && !active.has(watch.mapNumber));
    if (removed.length === 0) return;
    this.watches = this.watches.filter((watch) => !removed.some((item) => item.repo.toLowerCase() === watch.repo.toLowerCase() && item.mapNumber === watch.mapNumber));
    try {
      this.storage.setItem(MAP_WATCH_SET_KEY, JSON.stringify(this.watches));
    } catch {
      // Keep the in-memory list current even when browser storage is unavailable.
    }
    this.connect();
  }

  clear(): boolean {
    try {
      this.storage.setItem(MAP_EVENT_INBOX_KEY, '[]');
    } catch {
      return false;
    }
    this.onChange();
    return true;
  }

  refreshFromStorage(): void {
    const previous = this.watches.map((watch) => watchKey(watch.repo, watch.mapNumber)).sort().join('|');
    this.watches = readMapWatchSet(this.storage);
    const current = this.watches.map((watch) => watchKey(watch.repo, watch.mapNumber)).sort().join('|');
    if (previous !== current) this.connect();
    this.onChange();
  }

  close(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.started = false;
    this.source?.close();
    this.source = null;
  }

  private connect(): void {
    if (!this.started) return;
    this.source?.close();
    this.source = null;
    if (this.watches.length === 0) return;
    const params = new URLSearchParams();
    for (const watch of this.watches) params.append('watch', `${watch.repo}:${String(watch.mapNumber)}`);
    params.set('after', String(Math.min(...this.watches.map((watch) => watch.lastEventId))));
    const source = this.createStream(`/api/events?${params.toString()}`);
    this.source = source;
    source.addEventListener('map', (rawEvent) => {
      const data = (rawEvent as MessageEvent<string>).data;
      let parsed: unknown;
      try {
        parsed = JSON.parse(data) as unknown;
      } catch {
        return;
      }
      if (!isMapEvent(parsed)) return;
      const event = parsed;
      const receive = (): void => {
        if (!saveMapInboxEvent(this.storage, event)) return;
        const repo = event.repo.toLowerCase();
        this.snapshotTimes.set(repo, Math.max(this.snapshotTimes.get(repo) ?? 0, Date.parse(event.at)));
        this.watches = readMapWatchSet(this.storage);
        this.onChange();
        for (const listener of this.eventListeners) {
          try { listener(event); } catch { /* Other consumers still receive the event. */ }
        }
      };
      if (typeof navigator !== 'undefined' && navigator.locks !== undefined) void withInboxLock(receive);
      else receive();
    });
    source.addEventListener('watch-ended', (rawEvent) => {
      const data = (rawEvent as MessageEvent<string>).data;
      try {
        const ended = JSON.parse(data) as { repo?: unknown; mapNumber?: unknown };
        if (typeof ended.repo === 'string' && Number.isSafeInteger(ended.mapNumber)) {
          this.removeWatch(ended.repo, ended.mapNumber as number);
        }
      } catch {
        // The map list check will remove any ended watch if the message is malformed.
      }
    });
    source.addEventListener('error', () => {
      if (source.readyState === 2 && this.source === source) this.source = null;
    });
  }

  private removeWatch(repo: string, mapNumber: number): void {
    this.watches = this.watches.filter((watch) => !(watch.repo.toLowerCase() === repo.toLowerCase() && watch.mapNumber === mapNumber));
    try {
      this.storage.setItem(MAP_WATCH_SET_KEY, JSON.stringify(this.watches));
    } catch {
      // The disconnected watch is removed in memory even when storage cannot be written.
    }
    this.connect();
  }

  private async refreshRepositories(): Promise<void> {
    const repos = [...new Set(this.watches.map((watch) => watch.repo.toLowerCase()))];
    await Promise.all(repos.map(async (repo) => {
      try {
        const response = await this.fetcher(`${scopedApiPath(repo, 'snapshot')}?check=1`);
        if (!response.ok) return;
        const snapshot = await response.json() as MapSnapshot;
        this.reconcileSnapshot(snapshot);
      } catch {
        // Watching stays available when a repository status check is temporarily offline.
      }
    }));
  }
}

function watchKey(repo: string, mapNumber: number): string {
  return `${repo.toLowerCase()}#${String(mapNumber)}`;
}

function createInboxRow(row: InboxRow): HTMLElement {
  const article = document.createElement('article');
  const link = document.createElement('a');
  const title = document.createElement('span');
  const scope = document.createElement('span');
  const time = document.createElement('time');
  article.className = 'map-inbox-item';
  link.className = 'map-inbox-event';
  title.className = 'map-inbox-event-title';
  scope.className = 'map-inbox-event-scope';
  time.className = 'map-inbox-time';
  if (row.type === 'activity') {
    const event = row.event;
    article.classList.toggle('is-read', event.read === true);
    link.href = eventHref(event);
    link.dataset.mapInboxEvent = eventKey(event);
    title.textContent = eventSummary(event);
    scope.textContent = `${event.repo} · Map #${String(event.mapNumber)}`;
    if (event.whileYouWereAway === true) {
      const away = document.createElement('span');
      away.className = 'map-inbox-away';
      away.textContent = 'While you were away';
      article.append(away);
    }
  } else {
    const item = row.notification;
    article.classList.toggle('is-read', item.read);
    article.classList.toggle('map-inbox-needs', row.type === 'needs');
    link.href = notificationHref(item);
    link.dataset.mapInboxEvent = item.id;
    if (row.type === 'needs') {
      const kind = document.createElement('span');
      kind.className = 'map-inbox-kind';
      kind.textContent = KIND_LABEL[item.kind];
      link.append(kind);
    }
    title.textContent = `#${String(item.ticketNumber)} ${item.ticketTitle}${row.type === 'legacyActivity' ? ' is ready to start' : ''}`;
    scope.textContent = `${item.repo} · Map #${String(item.mapNumber)} ${item.mapTitle}`;
  }
  link.append(title, scope);
  article.prepend(link);
  time.dateTime = row.at;
  const date = new Date(row.at);
  time.textContent = Number.isNaN(date.valueOf()) ? '' : date.toLocaleString();
  article.append(time);
  return article;
}

function renderInbox(root: HTMLElement, notifications: NotificationInboxController, filter: InboxFilter, trigger: HTMLButtonElement, panel: HTMLElement): void {
  const body = root.querySelector<HTMLElement>('#map-inbox-body');
  const count = root.querySelector<HTMLElement>('#map-inbox-count');
  const summary = root.querySelector<HTMLElement>('#map-inbox-summary');
  if (body === null || count === null || summary === null) return;
  const rows = mergeInbox(readMapInboxEvents(localStorage), notifications.list());
  const counts = inboxCounts(rows);
  const visible = filterInbox(rows, filter);
  const scrollTop = body.scrollTop;
  const focused = body.contains(document.activeElement) && document.activeElement instanceof HTMLElement
    ? document.activeElement.getAttribute('data-map-inbox-event')
    : null;
  if (visible.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'map-inbox-empty';
    empty.textContent = filter === 'needs' ? 'Nothing needs you.' : 'Nothing yet on maps you have opened.';
    body.replaceChildren(empty);
  } else {
    body.replaceChildren(...visible.map(createInboxRow));
  }
  body.scrollTop = scrollTop;
  if (focused !== null) body.querySelector<HTMLElement>(`[data-map-inbox-event="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
  count.textContent = counts.total > 99 ? '99+' : String(counts.total);
  count.hidden = counts.total === 0;
  summary.textContent = counts.summary;
  trigger.setAttribute('aria-label', counts.accessibleName);
  const needsCount = root.querySelector<HTMLElement>('#map-inbox-needs-count');
  const activeNeeds = rows.filter((row) => row.type === 'needs').length;
  if (needsCount !== null) { needsCount.textContent = String(activeNeeds); needsCount.hidden = activeNeeds === 0; }
  for (const chip of root.querySelectorAll<HTMLButtonElement>('[data-inbox-filter]')) {
    chip.setAttribute('aria-pressed', String(chip.dataset.inboxFilter === filter));
  }
  const clear = root.querySelector<HTMLButtonElement>('#map-inbox-clear');
  if (clear !== null) clear.hidden = !rows.some((row) => row.type !== 'needs');
  trigger.setAttribute('aria-expanded', String(!panel.hidden));
}

export function mountMapEventInbox(onEvent: ((event: MapEvent) => void) | undefined, notifications: NotificationInboxController): MapEventInbox {
  const root = document.getElementById('map-inbox-anchor');
  const trigger = document.getElementById('map-inbox-trigger');
  const panel = document.getElementById('map-inbox-list');
  const close = document.getElementById('map-inbox-close');
  const clear = document.getElementById('map-inbox-clear');
  if (!(root instanceof HTMLElement) || !(trigger instanceof HTMLButtonElement) || !(panel instanceof HTMLElement) || !(close instanceof HTMLButtonElement) || !(clear instanceof HTMLButtonElement)) {
    const empty = new MapEventInbox(localStorage);
    empty.start();
    return empty;
  }
  let filter: InboxFilter = 'all';
  const draw = (): void => renderInbox(root, notifications, filter, trigger, panel);
  const inbox = new MapEventInbox(localStorage, undefined, undefined, draw, (snapshot) => notifications.reconcileSnapshot(snapshot));
  inbox.subscribe((event) => notifications.reconcileEvent(event));
  document.addEventListener(NOTIFICATIONS_CHANGED, draw);
  // Recover an interrupted event delivery into the local inbox, without replaying OS alerts.
  void fetch('/api/notification-settings').then(async (response) => {
    if (response.ok) await recoverMapInboxNotifications(localStorage, readNotificationSettings(await response.json()), notifications);
  }).catch(() => undefined);
  root.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('[data-map-inbox-event]');
    const key = link?.dataset.mapInboxEvent;
    if (key !== undefined) {
      const href = link?.href;
      const navigate = event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
      if (navigate) event.preventDefault();
      void (async () => {
        const storedEvent = readMapInboxEvents(localStorage).find((item) => eventKey(item) === key);
        await withInboxLock(() => markMapInboxEventRead(localStorage, key));
        await notifications.markRead(key);
        if (storedEvent !== undefined) {
          const notice = mapEventNotification(storedEvent, '');
          if (notice !== null) await notifications.markRead(notice.id);
        }
        if (navigate && href !== undefined) window.location.assign(href);
      })();
    }
    const chip = event.target.closest<HTMLButtonElement>('[data-inbox-filter]');
    if (chip === null) return;
    filter = chip.dataset.inboxFilter === 'needs' ? 'needs' : 'all';
    draw();
  });
  if (onEvent !== undefined) inbox.subscribe(onEvent);
  const setOpen = (open: boolean, returnFocus = false): void => {
    panel.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    if (open) {
      close.focus();
      document.dispatchEvent(new Event(INBOX_OPENED));
      void fetch('/api/desktop/notifications/read', { method: 'POST' }).catch(() => undefined);
    }
    else if (returnFocus) trigger.focus();
  };
  trigger.addEventListener('click', () => setOpen(panel.hidden));
  close.addEventListener('click', () => setOpen(false, true));
  clear.addEventListener('click', () => {
    void withInboxLock(() => {
      const activityCleared = inbox.clear();
      const noticesCleared = notifications.clearActivity();
      if (!activityCleared || !noticesCleared) {
        const toast = document.getElementById('toast');
        if (toast !== null) { toast.textContent = 'Could not clear all activity. Browser storage is unavailable.'; toast.hidden = false; }
      }
      draw();
    });
  });
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (panel.hidden || root.contains(target)) return;
    setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      event.preventDefault();
      setOpen(false, true);
    }
  });
  window.addEventListener('storage', (event) => {
    if (event.key === MAP_WATCH_SET_KEY || event.key === MAP_EVENT_INBOX_KEY) inbox.refreshFromStorage();
  });
  window.addEventListener('pagehide', () => inbox.close(), { once: true });
  inbox.start();
  draw();
  const iconHost = trigger.querySelector<HTMLElement>('[data-icon="bell"]');
  if (iconHost !== null) {
    const svg = icon(icons.BELL).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    const bell = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    iconHost.replaceChildren(document.importNode(bell, true));
  }
  return inbox;
}
