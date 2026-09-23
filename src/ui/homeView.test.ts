import { describe, expect, it } from 'vitest';

import type { HandOffStatusDto } from '../handOffTracking.js';
import type { MapSnapshot, WayfinderMap } from '../types.js';
import { buildHomeWorkItems, chooseContinueDestination, orderRepositories, relativeTimeLabel, summarizeRepository } from './homeView.js';

const map: WayfinderMap = {
  number: 35,
  title: 'Redesign Home',
  url: 'https://github.com/octo/wayfinder/issues/35',
  body: '',
  open: true,
  sections: { destination: 'Find and continue maps.', notes: '', decisions: '', fog: '', outOfScope: '' },
  tickets: [
    { number: 1, title: 'Done work', url: 'https://github.com/octo/wayfinder/issues/1', body: '', type: 'task', labels: [], open: false, assignee: null, blockedBy: [], openBlockers: [], state: 'done' },
    { number: 2, title: 'Choose a direction', url: 'https://github.com/octo/wayfinder/issues/2', body: '', type: 'grilling', labels: [], open: true, assignee: null, blockedBy: [], openBlockers: [], state: 'frontier' },
  ],
  outside: [],
};

const snapshot: MapSnapshot = { repo: 'octo/wayfinder', fetchedAt: '2026-09-20T11:00:00.000Z', maps: [map], warnings: [] };

function handOff(overrides: Partial<HandOffStatusDto> = {}): HandOffStatusDto {
  return {
    id: 'handoff-1',
    repo: 'octo/wayfinder',
    mapNumber: 35,
    ticketNumber: 2,
    title: 'Review a decision',
    threadId: 'thread-1',
    rung: 'thread',
    status: 'waiting',
    createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt: '2026-09-20T11:30:00.000Z',
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

describe('Home repository summaries', () => {
  it('prioritizes opened repositories and reports map progress', () => {
    expect(orderRepositories(['octo/a', 'octo/b'], ['octo/b', 'octo/recent'], { 'octo/a': '2026-09-20T12:00:00Z' })).toEqual([
      'octo/a',
      'octo/b',
      'octo/recent',
    ]);
    expect(summarizeRepository('octo/wayfinder', snapshot)).toMatchObject({
      mapCount: 1,
      openTicketCount: 1,
      ticketCount: 2,
      doneTicketCount: 1,
      latestMap: map,
    });
  });
});

describe('Home in-flight lanes', () => {
  it('separates user attention from work still running in T3 Code', () => {
    const items = buildHomeWorkItems([handOff(), handOff({ id: 'running', status: 'running', ticketNumber: 9 })], [snapshot]);

    expect(items.map(({ lane, kind, title }) => ({ lane, kind, title }))).toEqual([
      { lane: 'needs-you', kind: 'handoff', title: 'Review a decision' },
      { lane: 'running', kind: 'handoff', title: 'Review a decision' },
    ]);
    expect(items[0]?.href).toBe('/repos/octo/wayfinder/maps/35?ticket=2');
    expect(buildHomeWorkItems([], [snapshot]).map(({ kind, title }) => ({ kind, title }))).toEqual([
      { kind: 'ticket', title: 'Choose a direction' },
    ]);
  });

  it('shows the newest hand-off in Continue and falls back to the last opened map', () => {
    expect(chooseContinueDestination(null, [handOff()], [snapshot])).toMatchObject({
      kind: 'map',
      href: '/repos/octo/wayfinder/maps/35?ticket=2',
      handOffId: 'handoff-1',
    });
    expect(chooseContinueDestination({ repo: 'octo/wayfinder', mapNumber: 35, openedAt: '2026-09-20T12:00:00.000Z' }, [handOff()], [snapshot])).toMatchObject({
      kind: 'map',
      href: '/repos/octo/wayfinder/maps/35',
      handOffId: null,
    });
    expect(chooseContinueDestination({ repo: 'octo/wayfinder', mapNumber: 35, openedAt: '2026-09-20T12:00:00.000Z' }, [], [])).toMatchObject({
      title: 'Map #35',
      href: '/repos/octo/wayfinder/maps/35',
      detail: 'Recently opened',
    });
  });

  it('surfaces open pull requests from tracked hand-offs as review work', () => {
    const item = buildHomeWorkItems([
      handOff({
        status: 'finished',
        pullRequests: [{ number: 88, url: 'https://github.com/octo/wayfinder/pull/88', state: 'OPEN', mergedAt: null, syncedAt: null, source: 'github' }],
      }),
    ], []).find(({ kind }) => kind === 'pull-request');

    expect(item).toMatchObject({
      lane: 'needs-you',
      repo: 'octo/wayfinder',
      externalUrl: 'https://github.com/octo/wayfinder/pull/88',
      handOffId: null,
    });
  });
});

describe('relativeTimeLabel', () => {
  it('formats recent activity and handles missing or invalid timestamps', () => {
    const now = Date.parse('2026-09-20T12:00:00.000Z');
    expect(relativeTimeLabel('2026-09-20T11:30:00.000Z', now)).toBe('30m ago');
    expect(relativeTimeLabel('invalid', now)).toBe('Not opened yet');
    expect(relativeTimeLabel(null, now)).toBe('Not opened yet');
  });
});
