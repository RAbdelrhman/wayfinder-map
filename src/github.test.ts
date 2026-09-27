import { describe, expect, it } from 'vitest';

import { RATE_LIMIT_WARNING, SubIssueWatcher, branchFacts, fallbackWarning, gh304Output, ghProblem, isOpenState, mapPrototypeBranches, parseGhApiResponse, plainGhOutput, sortPrototypes, ticketStateOf, toOutsideTicket } from './github.js';
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

describe('gh304Output', () => {
  it('keeps gh api response headers when the CLI reports HTTP 304 as a failed exit', () => {
    const stdout = Buffer.from('HTTP/2.0 304 Not Modified\r\nETag: "unchanged"\r\n\r\n');
    const error = Object.assign(new Error('Command failed'), {
      stdout,
      stderr: Buffer.from('gh: HTTP 304'),
    });

    expect(gh304Output(error)).toEqual(stdout);
    expect(gh304Output(new Error('gh: HTTP 403'))).toBeNull();
  });
});

describe('parseGhApiResponse', () => {
  it('parses status, case-insensitive headers, and body from gh api --include', () => {
    expect(parseGhApiResponse('HTTP/2.0 304 Not Modified\r\nETag: "same"\r\nX-RateLimit-Used: 22\r\n\r\n')).toEqual({
      status: 304,
      headers: { etag: '"same"', 'x-ratelimit-used': '22' },
      body: '',
    });
  });
});

describe('SubIssueWatcher', () => {
  it('uses the captured ETag for later conditional checks', async () => {
    const calls: string[][] = [];
    const responses = [
      'HTTP/2.0 200 OK\r\nETag: "map-one"\r\n\r\n[{"number":7,"title":"Ticket","state":"open"}]',
      'HTTP/2.0 304 Not Modified\r\nETag: "map-one"\r\n\r\n',
    ];
    const watcher = new SubIssueWatcher(async (args) => {
      calls.push(args);
      const response = responses.shift();
      if (response === undefined) throw new Error('Unexpected GitHub request.');
      return response;
    });

    await expect(watcher.fetch('owner/repo', 5)).resolves.toMatchObject([{ number: 7, state: 'open' }]);
    await expect(watcher.hasChanged('owner/repo', [5])).resolves.toBe(false);
    expect(calls[1]).toEqual([
      'api',
      '--include',
      '-X',
      'GET',
      '-H',
      'If-None-Match: "map-one"',
      '-F',
      'per_page=100',
      '-F',
      'page=1',
      'repos/owner/repo/issues/5/sub_issues',
    ]);
  });

  it('fetches every page and checks each page ETag', async () => {
    const calls: string[][] = [];
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ number: index + 1, title: `Ticket ${String(index + 1)}`, state: 'open' }));
    const responses = [
      `HTTP/2.0 200 OK\r\nETag: "page-one"\r\nLink: <https://api.github.com/repos/owner/repo/issues/5/sub_issues?per_page=100&page=2>; rel="next"\r\n\r\n${JSON.stringify(firstPage)}`,
      'HTTP/2.0 200 OK\r\nETag: "page-two"\r\n\r\n[{"number":101,"title":"Ticket 101","state":"open"}]',
      'HTTP/2.0 304 Not Modified\r\n\r\n',
      'HTTP/2.0 304 Not Modified\r\n\r\n',
    ];
    const watcher = new SubIssueWatcher(async (args) => {
      calls.push(args);
      const response = responses.shift();
      if (response === undefined) throw new Error('Unexpected GitHub request.');
      return response;
    });

    await expect(watcher.fetch('owner/repo', 5)).resolves.toHaveLength(101);
    await expect(watcher.hasChanged('owner/repo', [5])).resolves.toBe(false);
    expect(calls).toHaveLength(4);
    expect(calls.slice(2).map((args) => args[9])).toEqual([
      'page=1',
      'page=2',
    ]);
  });

  it('treats an uncached or changed map as needing a full read', async () => {
    const responses = [
      'HTTP/2.0 200 OK\r\nETag: "before"\r\n\r\n[]',
      'HTTP/2.0 200 OK\r\nETag: "after"\r\n\r\n[]',
    ];
    const watcher = new SubIssueWatcher(async () => {
      const response = responses.shift();
      if (response === undefined) throw new Error('Unexpected GitHub request.');
      return response;
    });

    await expect(watcher.hasChanged('owner/repo', [5])).resolves.toBe(true);
    await watcher.fetch('owner/repo', 5);
    await expect(watcher.hasChanged('owner/repo', [5])).resolves.toBe(true);
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
  it('reads an off-map issue as a full ticket with its links', () => {
    expect(
      toOutsideTicket(
        {
          number: 80,
          title: 'Prototype Home',
          html_url: 'https://github.com/o/r/issues/80',
          body: 'Build it.',
          state: 'open',
          labels: [{ name: 'wayfinder:task' }],
        },
        'o/r',
        { blocks: [52], blockers: [{ number: 12, open: false }] },
      ),
    ).toEqual({
      number: 80,
      title: 'Prototype Home',
      url: 'https://github.com/o/r/issues/80',
      body: 'Build it.',
      type: 'task',
      labels: ['wayfinder:task'],
      open: true,
      assignee: null,
      blockedBy: [12],
      openBlockers: [],
      state: 'frontier',
      pullRequest: false,
      blocks: [52],
      waitsOn: [],
    });
  });

  it('flags a pull request and builds its link when GitHub gave none', () => {
    const pr = toOutsideTicket({ number: 81, title: 'Views', state: 'CLOSED', pull_request: {} }, 'o/r');
    expect(pr).toMatchObject({ url: 'https://github.com/o/r/pull/81', open: false, pullRequest: true, state: 'done' });
  });

  it('derives its state the way a ticket does', () => {
    const base = { number: 9, title: 't', state: 'open' };
    expect(toOutsideTicket(base, 'o/r', { blockers: [{ number: 3, open: true }] }).state).toBe('blocked');
    expect(toOutsideTicket({ ...base, assignee: { login: 'me' } }, 'o/r').state).toBe('claimed');
    expect(toOutsideTicket({ ...base, pull_request: {}, user: { login: 'author' } }, 'o/r').state).toBe('claimed');
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

describe('warnings', () => {
  it("swaps GitHub's rate-limit wall of text for one plain line", () => {
    expect(ghProblem(new Error('gh: API rate limit exceeded for user ID 1. If you reach out to GitHub Support (HTTP 403)'))).toBe(RATE_LIMIT_WARNING);
    expect(ghProblem(new Error('HTTP 404: Not Found'))).toBe('HTTP 404: Not Found');
  });

  it('names every map that fell back to its description in one line', () => {
    expect(fallbackWarning([3, 14, 35], true)).toBe(
      "Wayfinder hit GitHub's rate limit, so maps #3, #14 and #35 are showing the tickets listed in their descriptions. Sub-issues not listed there won't show until the next sync.",
    );
    expect(fallbackWarning([35], false)).toMatch(/^GitHub didn't return sub-issues, so map #35 is showing the tickets listed in its description\./);
  });
});
