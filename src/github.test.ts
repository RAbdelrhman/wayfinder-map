import { describe, expect, it } from 'vitest';

import { branchFacts, isOpenState, mapPrototypeBranches, plainGhOutput, sortPrototypes, ticketStateOf, toOutsideTicket } from './github.js';
import type { Prototype } from './types.js';

describe('plainGhOutput', () => {
  it('removes terminal colors around JSON objects and arrays', () => {
    expect(JSON.parse(plainGhOutput('\u001b[1;37m{\u001b[0m"ok":true}\u001b[0m'))).toEqual({ ok: true });
    expect(JSON.parse(plainGhOutput('\u001b[1;37m[\u001b[0m1]\u001b[0m'))).toEqual([1]);
  });

  it('keeps plain output unchanged', () => {
    expect(plainGhOutput('{"ok":true}\n')).toBe('{"ok":true}\n');
  });
});

describe('isOpenState', () => {
  it('reads both the gh issue list and gh api spellings', () => {
    expect(isOpenState('OPEN')).toBe(true);
    expect(isOpenState('open')).toBe(true);
    expect(isOpenState('CLOSED')).toBe(false);
    expect(isOpenState('closed')).toBe(false);
  });
});

describe('ticketStateOf', () => {
  it('calls a closed ticket done, whatever else is true of it', () => {
    expect(ticketStateOf(false, [7], 'someone')).toBe('done');
  });

  it('ranks an open blocker above an assignee', () => {
    expect(ticketStateOf(true, [7], 'someone')).toBe('blocked');
  });

  it('calls an assigned, unblocked ticket claimed', () => {
    expect(ticketStateOf(true, [], 'someone')).toBe('claimed');
  });

  it('calls an unassigned, unblocked ticket the frontier', () => {
    expect(ticketStateOf(true, [], null)).toBe('frontier');
  });
});

describe('toOutsideTicket', () => {
  it('keeps the link, title and state of an off-map issue', () => {
    expect(
      toOutsideTicket({ number: 80, title: 'Prototype Home', html_url: 'https://github.com/o/r/issues/80', state: 'open' }, 'o/r'),
    ).toEqual({ number: 80, title: 'Prototype Home', url: 'https://github.com/o/r/issues/80', open: true, pullRequest: false });
  });

  it('flags a pull request and builds its link when GitHub gave none', () => {
    expect(toOutsideTicket({ number: 81, title: 'Views', state: 'CLOSED', pull_request: {} }, 'o/r')).toEqual({
      number: 81,
      title: 'Views',
      url: 'https://github.com/o/r/pull/81',
      open: false,
      pullRequest: true,
    });
  });
});

describe('mapPrototypeBranches', () => {
  const map = { tickets: [{ number: 8 }, { number: 17 }] } as Parameters<typeof mapPrototypeBranches>[1];

  it('keeps prototype branches whose ticket is on the map', () => {
    expect(
      mapPrototypeBranches(
        ['refs/heads/prototype/8-home', 'refs/heads/prototype/9-other-map', 'refs/heads/prototype/loose', 'refs/heads/prototype/17'],
        map,
      ),
    ).toEqual(['prototype/8-home', 'prototype/17']);
  });
});

describe('sortPrototypes', () => {
  const proto = (ticketNumber: number, updatedAt: string | null): Prototype => ({
    branch: `prototype/${String(ticketNumber)}`,
    ticketNumber,
    mapNumber: 3,
    url: '',
    updatedAt,
    files: [],
    openable: [],
    preview: null,
    verdict: null,
  });

  it('puts the newest first and undated ones last', () => {
    const sorted = sortPrototypes([proto(1, null), proto(2, '2026-09-01T00:00:00Z'), proto(3, '2026-09-10T00:00:00Z')]);
    expect(sorted.map((p) => p.ticketNumber)).toEqual([3, 2, 1]);
  });
});

describe('branchFacts', () => {
  const tip = { commit: { committer: { date: '2026-09-01T00:00:00Z' } }, files: [{ filename: 'proto.html' }] };

  it('prefers the diff against the default branch', () => {
    const compare = { files: [{ filename: 'a.html' }, { filename: 'b.ts' }], commits: [{ commit: { committer: { date: '2026-09-09T00:00:00Z' } } }] };
    expect(branchFacts(compare, null)).toEqual({ updatedAt: '2026-09-09T00:00:00Z', files: ['a.html', 'b.ts'] });
  });

  it('falls back to the tip commit when the branch has landed on the default branch', () => {
    expect(branchFacts({ files: [], commits: [] }, tip)).toEqual({ updatedAt: '2026-09-01T00:00:00Z', files: ['proto.html'] });
  });

  it('says nothing rather than guessing when both reads fail', () => {
    expect(branchFacts(null, null)).toEqual({ updatedAt: null, files: [] });
  });
});
