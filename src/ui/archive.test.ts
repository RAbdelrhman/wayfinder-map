import { describe, expect, it } from 'vitest';

import type { Ticket, WayfinderMap } from '../types.js';
import { archiveAgo, archiveWhy, archivedMapCardHtml, restoredMessage } from './archive.js';

function ticket(number: number, state: Ticket['state']): Ticket {
  return { number, title: `T${String(number)}`, url: '', body: '', type: 'task', labels: [], open: state !== 'done', assignee: null, blockedBy: [], openBlockers: [], state, updatedAt: null };
}

function map(overrides: Partial<WayfinderMap> = {}): WayfinderMap {
  return {
    number: 134,
    title: 'Improve repository navigation',
    url: '',
    body: '',
    open: true,
    author: 'ramon',
    visibility: 'private',
    sections: { destination: '', notes: '', decisions: '', fog: '', outOfScope: '' },
    tickets: [ticket(1, 'done'), ticket(2, 'frontier')],
    outside: [],
    criticalPath: { tickets: [], remaining: 0 },
    stalled: [],
    pullRequests: [],
    settled: { reason: 'manual', since: '2026-10-13T09:20:00.000Z' },
    ticketsLoaded: true,
    ...overrides,
  };
}

const card = { busy: false, error: null, restored: false, autoMap: false, backHref: '/repos/octo/wayfinder?view=archived', backLabel: 'Archived maps', activeHref: '/repos/octo/wayfinder' };

describe('archive wording', () => {
  it('explains each reason in the approved words', () => {
    expect(archiveWhy(map(), { reason: 'manual', since: '' })).toBe('You archived this map.');
    expect(archiveWhy(map({ open: false }), { reason: 'closed', since: '' })).toBe('The map issue is closed on GitHub, with 1 ticket still open.');
    expect(archiveWhy(map({ ticketsLoaded: false, tickets: [] }), { reason: 'closed', since: '' })).toBe('The map issue is closed on GitHub.');
    expect(archiveWhy(map({ tickets: [ticket(1, 'done'), ticket(2, 'done')] }), { reason: 'finished', since: '' })).toBe('All 2 tickets are done.');
    expect(archiveWhy(map(), { reason: 'idle', since: '2026-10-01T12:00:00.000Z' })).toBe('Nothing on the map or its tickets has changed since Sep 1.');
  });

  it('says how long ago on the same scale as the prototype', () => {
    const now = Date.parse('2026-10-15T12:00:00.000Z');
    expect(archiveAgo('2026-10-15T08:00:00.000Z', now)).toBe('today');
    expect(archiveAgo('2026-10-14T08:00:00.000Z', now)).toBe('yesterday');
    expect(archiveAgo('2026-10-11T12:00:00.000Z', now)).toBe('4 days ago');
    expect(archiveAgo('2026-09-30T12:00:00.000Z', now)).toBe('2 weeks ago');
    expect(archiveAgo('2026-08-01T12:00:00.000Z', now)).toBe('2 months ago');
    expect(archiveAgo('not a date', now)).toBe('');
  });

  it('says what Restore leads to', () => {
    expect(restoredMessage(map())).toBe('Restored #134. It stays active until you archive it again.');
    expect(restoredMessage(map({ open: false }))).toBe('Restored #134. It stays active, unwatched until its issue reopens.');
  });
});

describe('archivedMapCardHtml', () => {
  it('keeps an opened archived map archived, with Restore separate from the way back', () => {
    const html = archivedMapCardHtml(map(), { ...card, autoMap: true });
    expect(html).toContain('<b>Archived</b>');
    expect(html).toContain('Archived by you');
    expect(html).toContain("You archived this map. Opening it keeps it archived: it isn&#39;t watched and Auto map stays paused.");
    expect(html).toContain('class="primary" data-restore-map="134" aria-label="Restore map #134: Improve repository navigation"');
    expect(html).toContain('<a class="ghost" href="/repos/octo/wayfinder?view=archived">Archived maps</a>');
  });

  it('shows Restoring…, then a failure with Try again', () => {
    expect(archivedMapCardHtml(map(), { ...card, busy: true })).toContain('aria-busy="true"');
    const failed = archivedMapCardHtml(map(), { ...card, error: 'Sign in with GitHub to archive maps.' });
    expect(failed).toContain('Couldn&#39;t restore #134. It&#39;s still archived.');
    expect(failed).toContain('data-archive-retry');
  });

  it('says Restored once, and nothing on an active map', () => {
    expect(archivedMapCardHtml(map({ settled: null }), card)).toBe('');
    const restored = archivedMapCardHtml(map({ settled: null }), { ...card, restored: true });
    expect(restored).toContain('<b>Restored</b>');
    expect(restored).toContain('Back in your active maps; watching resumes.');
    expect(restored).toContain('<a class="ghost" href="/repos/octo/wayfinder">Active maps</a>');
    expect(archivedMapCardHtml(map({ settled: null, open: false }), { ...card, restored: true })).toContain('It stays unwatched until its issue reopens.');
  });
});
