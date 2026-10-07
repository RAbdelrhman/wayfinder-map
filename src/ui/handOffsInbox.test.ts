import { setTrustedHtml } from './trustedHtml.js';
// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HandOffStatusDto } from '../handOffTracking.js';
import { mountHandOffs } from './handOffs.js';
import { INBOX_OPENED } from './notifications.js';
import type { InboxTicket } from './notifications.js';

const failed = {
  id: 'failed-11',
  repo: 'octo/example',
  mapNumber: 5,
  mapTitle: 'Make the app reliable',
  ticketNumber: 11,
  title: 'Fix the retry loop',
  threadId: 'thread-11',
  status: 'failed',
  acknowledged: false,
  createdAt: '2026-10-06T10:00:00Z',
  updatedAt: '2026-10-06T10:05:00Z',
  lastSeenAt: null,
  stale: false,
  sequence: null,
  branch: null,
  pendingApproval: false,
  pendingUserInput: false,
  pullRequests: [],
} as unknown as HandOffStatusDto;

function openInbox(shown: InboxTicket[]): void {
  document.dispatchEvent(new CustomEvent<InboxTicket[]>(INBOX_OPENED, { detail: shown }));
}

describe('acknowledging hand-offs from the Inbox', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setTrustedHtml(document.body, '');
  });

  it('settles an Inbox opened before the first load once the hand-offs arrive', async () => {
    setTrustedHtml(document.body, '<span id="handoff-announcement"></span>');
    let release: () => void = () => undefined;
    const loaded = new Promise<void>((resolve) => { release = resolve; });
    const acknowledged: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/hand-offs/acknowledge') {
        acknowledged.push((JSON.parse(String(init?.body)) as { id: string }).id);
        return new Response('{}');
      }
      await loaded;
      return new Response(JSON.stringify({ handOffs: [failed] }));
    }));

    const surface = mountHandOffs();
    openInbox([{ repo: 'octo/example', mapNumber: 5, ticketNumber: 11 }]);
    expect(acknowledged).toEqual([]);

    release();
    await surface.refresh();
    await vi.waitFor(() => expect(acknowledged).toEqual(['failed-11']));
  });

  it('leaves a finished hand-off the Inbox does not show', async () => {
    setTrustedHtml(document.body, '<span id="handoff-announcement"></span>');
    const acknowledged: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/hand-offs/acknowledge') {
        acknowledged.push((JSON.parse(String(init?.body)) as { id: string }).id);
        return new Response('{}');
      }
      return new Response(JSON.stringify({ handOffs: [failed] }));
    }));

    const surface = mountHandOffs();
    await surface.refresh();
    openInbox([{ repo: 'octo/example', mapNumber: 5, ticketNumber: 12 }]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(acknowledged).toEqual([]);
  });
});
