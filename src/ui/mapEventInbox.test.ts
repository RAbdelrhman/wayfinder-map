import { describe, expect, it } from 'vitest';

import type { MapEvent } from '../mapWatch.js';
import {
  MAP_EVENT_INBOX_KEY,
  MAP_WATCH_SET_KEY,
  MapEventInbox,
  mapInboxItemHtml,
  readMapInboxEvents,
  readMapWatchSet,
  rememberMapWatch,
  saveMapInboxEvent,
} from './mapEventInbox.js';
import type { InboxStorage, MapEventStream } from './mapEventInbox.js';

class MemoryStorage implements InboxStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class FakeStream implements MapEventStream {
  readonly readyState = 0;
  closed = false;
  private readonly listeners = new Map<string, EventListener[]>();

  addEventListener(type: string, listener: EventListener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data: string): void {
    const event = new Event(type);
    Object.defineProperty(event, 'data', { value: data });
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function nextEvent(mapNumber = 121): MapEvent {
  return {
    id: 3,
    repo: 'octo/repo',
    mapNumber,
    at: '2026-09-29T12:00:00.000Z',
    type: 'ticket-next',
    ticket: { number: 9, title: 'Ready to start' },
    from: 'blocked',
    whileYouWereAway: true,
  };
}

function draftChangedEvent(): MapEvent {
  return {
    id: 4,
    repo: 'octo/repo',
    mapNumber: 121,
    at: '2026-09-29T12:01:00.000Z',
    type: 'pr-draft-changed',
    ticket: { number: 9, title: 'Ready to start' },
    pullRequest: { number: 12, url: 'https://github.com/octo/repo/pull/12', state: 'open', draft: false, checks: 'passing', review: 'review_required' },
    from: true,
    to: false,
  };
}

describe('map event inbox watch set', () => {
  it('keeps distinct opened maps, deduplicates repeats, and ignores corrupt storage records', () => {
    const storage = new MemoryStorage();
    storage.setItem(MAP_WATCH_SET_KEY, JSON.stringify([
      { repo: 'octo/repo', mapNumber: 121, lastEventId: 4 },
      { repo: 'invalid', mapNumber: 8, lastEventId: 0 },
    ]));

    rememberMapWatch(storage, 'Octo/Repo', 121);
    rememberMapWatch(storage, 'octo/repo', 35);

    expect(readMapWatchSet(storage)).toEqual([
      { repo: 'octo/repo', mapNumber: 121, lastEventId: 4 },
      { repo: 'octo/repo', mapNumber: 35, lastEventId: 0 },
    ]);
  });

  it('opens an event stream for every saved map and stores catch-up events with their replay cursor', () => {
    const storage = new MemoryStorage();
    rememberMapWatch(storage, 'octo/repo', 121);
    rememberMapWatch(storage, 'octo/repo', 35);
    const streams: Array<{ url: string; stream: FakeStream }> = [];
    const inbox = new MapEventInbox(
      storage,
      (url) => {
        const stream = new FakeStream();
        streams.push({ url, stream });
        return stream;
      },
      async () => { throw new Error('offline'); },
    );

    inbox.start();
    expect(streams).toHaveLength(1);
    const connection = new URL(streams[0]?.url ?? '', 'http://localhost');
    expect(connection.pathname).toBe('/api/events');
    expect(connection.searchParams.getAll('watch')).toEqual(['octo/repo:121', 'octo/repo:35']);
    expect(connection.searchParams.get('after')).toBe('0');
    streams[0]?.stream.emit('map', JSON.stringify(nextEvent()));

    expect(readMapInboxEvents(storage)).toEqual([nextEvent()]);
    expect(readMapWatchSet(storage)[0]?.lastEventId).toBe(3);
    expect(storage.getItem(MAP_EVENT_INBOX_KEY)).toContain('whileYouWereAway');
    expect(mapInboxItemHtml(nextEvent())).toContain('While you were away');
    inbox.close();
    expect(streams.every(({ stream }) => stream.closed)).toBe(true);
  });

  it('does not duplicate an event that EventSource replays after reconnecting', () => {
    const storage = new MemoryStorage();
    rememberMapWatch(storage, 'octo/repo', 121);
    const streams: FakeStream[] = [];
    const received: MapEvent[] = [];
    const inbox = new MapEventInbox(storage, () => {
      const stream = new FakeStream();
      streams.push(stream);
      return stream;
    }, async () => { throw new Error('offline'); });
    inbox.subscribe((event) => received.push(event));
    inbox.start();

    streams[0]?.emit('map', JSON.stringify(nextEvent()));
    streams[0]?.emit('map', JSON.stringify(nextEvent()));
    streams[0]?.emit('map', JSON.stringify(draftChangedEvent()));

    expect(readMapInboxEvents(storage)).toEqual([draftChangedEvent(), nextEvent()]);
    expect(received).toEqual([nextEvent(), draftChangedEvent()]);
    expect(mapInboxItemHtml(draftChangedEvent())).toContain('is no longer a draft');
    inbox.close();
  });

  it('leaves the replay cursor unchanged when the inbox cannot save an event', () => {
    const storage = new MemoryStorage();
    rememberMapWatch(storage, 'octo/repo', 121);
    const failingStorage: InboxStorage = {
      getItem: (key) => storage.getItem(key),
      setItem: (key, value) => {
        if (key === MAP_EVENT_INBOX_KEY) throw new Error('storage full');
        storage.setItem(key, value);
      },
    };

    expect(saveMapInboxEvent(failingStorage, nextEvent())).toBe(false);
    expect(readMapWatchSet(storage)[0]?.lastEventId).toBe(0);
  });
});
