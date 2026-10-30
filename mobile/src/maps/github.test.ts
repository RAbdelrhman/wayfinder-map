import { describe, expect, it, vi } from 'vitest';
import { GithubError, MobileGithub } from './github';

function raw(number: number, patch: Record<string, unknown> = {}) {
  return {
    number,
    title: `Issue ${number}`,
    body: '',
    state: 'open',
    html_url: `https://github.com/me/project/issues/${number}`,
    user: { login: 'me' },
    labels: [{ name: 'wayfinder:task' }],
    assignees: [],
    updated_at: '2026-10-27T12:00:00Z',
    ...patch,
  };
}
function setup(
  handler: (
    path: string,
    url: URL,
  ) => unknown | Response | Promise<unknown | Response>,
) {
  const fetcher = vi.fn(
    async (input: string | URL | Request, options?: RequestInit) => {
      expect(String(input)).not.toContain('my-private-token');
      expect(new Headers(options?.headers).get('Authorization')).toBe(
        'Bearer my-private-token',
      );
      const url = new URL(String(input));
      const value = await handler(url.pathname, url);
      return value instanceof Response ? value : Response.json(value);
    },
  );
  return {
    api: new MobileGithub('my-private-token', fetcher as typeof fetch),
    fetcher,
  };
}
describe('mobile GitHub maps', () => {
  it.each([403, 404, 410])(
    'keeps other maps when a followed issue returns %s',
    async (status) => {
      const { api } = setup((path) =>
        path === '/search/issues'
          ? { total_count: 1, items: [raw(1, { labels: ['wayfinder:map'] })] }
          : new Response('', { status }),
      );
      const ref = { repo: 'author/repo', number: 12 };
      const result = await api.maps('me', [ref]);
      expect(result.maps.map((map) => map.number)).toEqual([1]);
      expect(result.unavailable).toEqual([ref]);
    },
  );
  it('preserves follows when 403 is a GitHub rate limit', async () => {
    const { api } = setup((path) =>
      path === '/search/issues'
        ? { total_count: 0, items: [] }
        : new Response('', {
            status: 403,
            headers: { 'x-ratelimit-remaining': '0' },
          }),
    );
    await expect(
      api.maps('me', [{ repo: 'author/repo', number: 12 }]),
    ).rejects.toMatchObject({ status: 403, rateLimited: true });
  });
  it('marks an issue that lost its map label as unavailable', async () => {
    const { api } = setup((path) =>
      path === '/search/issues' ? { total_count: 0, items: [] } : raw(12),
    );
    expect(
      (await api.maps('me', [{ repo: 'author/repo', number: 12 }])).unavailable,
    ).toEqual([{ repo: 'author/repo', number: 12, reason: 'label' }]);
  });
  it('denies map and parent-ticket access after a followed map becomes private', async () => {
    const { api } = setup(() =>
      raw(12, {
        labels: ['wayfinder:map'],
        user: { login: 'author' },
        body: 'Visibility: private',
      }),
    );
    const ref = { repo: 'author/repo', number: 12 };
    const viewer = { login: 'me', follows: [ref] };
    await expect(api.map(ref, undefined, viewer)).rejects.toMatchObject({
      status: 404,
    });
    await expect(api.assertMapAccess(ref, viewer)).rejects.toMatchObject({
      status: 404,
    });
  });
  it('denies public maps when no longer followed while retaining access to own maps', async () => {
    const { api } = setup(() =>
      raw(12, {
        labels: ['wayfinder:map'],
        user: { login: 'author' },
        body: 'Visibility: public',
      }),
    );
    const ref = { repo: 'author/repo', number: 12 };
    await expect(
      api.assertMapAccess(ref, { login: 'me', follows: [] }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      api.assertMapAccess(ref, { login: 'author', follows: [] }),
    ).resolves.toBeUndefined();
  });
  it('reports the exact followed map GitHub can no longer read', async () => {
    const { api } = setup((path) =>
      path === '/search/issues'
        ? { total_count: 0, items: [] }
        : new Response('', { status: 404 }),
    );
    const ref = { repo: 'author/repo', number: 12 };
    const result = await api.maps('me', [ref]);
    expect(result.unavailable).toEqual([ref]);
    expect(result.maps).toEqual([]);
  });
  it('paginates public map discovery and checks a shared issue before returning it', async () => {
    const { api } = setup((path, url) => {
      if (path.endsWith('/issues/99'))
        return raw(99, { labels: ['wayfinder:task'] });
      if (url.searchParams.get('page') === '1')
        return Array.from({ length: 100 }, (_, index) =>
          raw(index + 1, {
            labels: ['wayfinder:map'],
            user: { login: 'author' },
            body: 'Visibility: public',
          }),
        );
      return [
        raw(101, {
          labels: ['wayfinder:map'],
          user: { login: 'author' },
          body: 'Visibility: public',
        }),
      ];
    });
    expect((await api.publicMaps('one/repo', 'me')).length).toBe(101);
    expect(await api.sharedMap({ repo: 'one/repo', number: 99 })).toBeNull();
  });
  it('lists only other authors explicitly public maps, and rejects unsafe repository paths', async () => {
    const { api, fetcher } = setup(() => [
      raw(1, {
        labels: ['wayfinder:map'],
        user: { login: 'other' },
        body: 'Visibility: public',
      }),
      raw(2, {
        labels: ['wayfinder:map'],
        user: { login: 'other' },
        body: 'Visibility: private',
      }),
      raw(3, {
        labels: ['wayfinder:map'],
        user: { login: 'me' },
        body: 'Visibility: public',
      }),
      raw(4, {
        labels: ['wayfinder:task'],
        user: { login: 'other' },
        body: 'Visibility: public',
      }),
      raw(5, {
        labels: ['wayfinder:map'],
        user: { login: 'other' },
        body: 'Visibility: public',
        pull_request: {},
      }),
    ]);
    expect(
      (await api.publicMaps('one/repo', 'me')).map((item) => item.number),
    ).toEqual([1]);
    await expect(api.publicMaps('../other/path', 'me')).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([false, true])(
    'omits deleted body links when sub-issue fallback is %s',
    async (fallback) => {
      const { api } = setup((path) => {
        if (path.endsWith('/issues/1'))
          return raw(1, {
            labels: ['wayfinder:map'],
            body: '- [ ] #2\n- [ ] #3\n- [ ] #4',
          });
        if (path.endsWith('/sub_issues'))
          return fallback ? new Response('', { status: 404 }) : [raw(2)];
        if (path.endsWith('/issues/2')) return raw(2);
        if (path.endsWith('/issues/3'))
          return new Response('', { status: 404 });
        if (path.endsWith('/issues/4'))
          return new Response('', { status: 410 });
        return [];
      });
      const result = await api.map({ repo: 'me/project', number: 1 });
      expect(result.tickets.map((ticket) => ticket.number)).toEqual([2]);
      expect(result.warnings).toContain(
        'Linked ticket #3 is unavailable and was omitted.',
      );
      expect(result.warnings).toContain(
        'Linked ticket #4 is unavailable and was omitted.',
      );
    },
  );
  it.each([401, 403, 429])(
    'does not hide body-linked ticket failure %s',
    async (status) => {
      const { api } = setup((path) => {
        if (path.endsWith('/issues/1'))
          return raw(1, { labels: ['wayfinder:map'], body: '- [ ] #2' });
        if (path.endsWith('/sub_issues')) return [];
        return new Response('', { status });
      });
      await expect(
        api.map({ repo: 'me/project', number: 1 }),
      ).rejects.toMatchObject({ status });
    },
  );
  it('does not show an empty completed fallback map when all linked tickets are unavailable', async () => {
    const { api } = setup((path) =>
      path.endsWith('/issues/1')
        ? raw(1, {
            labels: ['wayfinder:map'],
            body: '- [ ] #2',
            sub_issues_summary: { total: 1, completed: 0 },
          })
        : new Response('', { status: 404 }),
    );
    await expect(api.map({ repo: 'me/project', number: 1 })).rejects.toThrow(
      'Couldn’t load this map',
    );
  });
  it('merges body-linked tickets with native children without reviving body blockers after an empty native read', async () => {
    const { api } = setup((path) => {
      if (path.endsWith('/issues/1'))
        return raw(1, {
          labels: ['wayfinder:map'],
          body: '- [ ] #2\n- [ ] #3',
        });
      if (path.endsWith('/sub_issues')) return [raw(2)];
      if (path.endsWith('/issues/3')) return raw(3, { body: 'Blocked by: #2' });
      if (path.endsWith('/issues/2')) return raw(2);
      return [];
    });
    const result = await api.map({ repo: 'me/project', number: 1 });
    expect(result.tickets.map((item) => item.number)).toEqual([2, 3]);
    expect(result.tickets[1]?.state).toBe('frontier');
    expect(result.tickets[1]?.blockedBy).toEqual([]);
  });
  it.each([false, true])('does not import another map ticket from body links, fallback=%s', async (fallback) => {
    const { api } = setup((path) => {
      if (path.endsWith('/issues/1')) return raw(1, { labels: ['wayfinder:map'], body: '- [ ] #2\n- [ ] #3' });
      if (path.endsWith('/sub_issues')) return fallback ? new Response('', { status: 404 }) : [raw(2)];
      if (path.endsWith('/issues/2')) return raw(2);
      if (path.endsWith('/issues/3')) return raw(3, { parent_issue_url: 'https://api.github.com/repos/me/project/issues/99' });
      return [];
    });
    const result = await api.map({ repo: 'me/project', number: 1 });
    expect(result.tickets.map(({ number }) => number)).toEqual([2]);
    expect(result.warnings.join(' ')).not.toContain('Also showing');
  });
  it.each([401, 403, 422, 429, 503])(
    'does not return a ready ticket after a dependency read fails with HTTP %i',
    async (status) => {
      const { api } = setup((path) => {
        if (path.endsWith('/issues/42')) return raw(42);
        if (path.endsWith('/dependencies/blocked_by'))
          return new Response('', { status });
        return [];
      });
      await expect(api.ticket({ repo: 'me/project', number: 42 }))
        .rejects.toMatchObject({ status });
    },
  );
  it.each([403, 422, 429, 503])(
    'does not erase Unlocks after a blocking read fails with HTTP %i',
    async (status) => {
      const { api } = setup((path) => {
        if (path.endsWith('/issues/42')) return raw(42);
        if (path.endsWith('/dependencies/blocking'))
          return new Response('', { status });
        return [];
      });
      await expect(api.ticket({ repo: 'me/project', number: 42 }))
        .rejects.toMatchObject({ status });
    },
  );
  it('paginates owned maps across repositories, includes followed public maps, and excludes private maps by other authors', async () => {
    const first = Array.from({ length: 100 }, (_, index) =>
      raw(index + 1, { labels: ['wayfinder:map'] }),
    );
    const { api, fetcher } = setup((path, url) => {
      if (path === '/search/issues')
        return {
          total_count: 101,
          incomplete_results: false,
          items:
            url.searchParams.get('page') === '1'
              ? first
              : [
                  raw(101, {
                    labels: ['wayfinder:map'],
                    html_url: 'https://github.com/me/other/issues/101',
                  }),
                ],
        };
      if (path.endsWith('/issues/200'))
        return raw(200, {
          user: { login: 'other' },
          labels: ['wayfinder:map'],
          body: 'Visibility: public',
          updated_at: '2026-10-27T13:00:00Z',
        });
      if (path.endsWith('/issues/201'))
        return raw(201, {
          user: { login: 'other' },
          labels: ['wayfinder:map'],
          body: 'Private planning notes',
        });
      throw new Error(`Unexpected ${path}`);
    });
    const result = await api.maps('me', [
      { repo: 'me/project', number: 200 },
      { repo: 'me/project', number: 201 },
      { repo: 'ME/PROJECT', number: 200 },
    ]);
    expect(result.maps).toHaveLength(102);
    expect(result.maps[0]?.number).toBe(200);
    expect(result.maps.some((map) => map.number === 201)).toBe(false);
    expect(result.maps.some((map) => map.repo === 'me/other')).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('does not accept an incomplete search as the complete list', async () => {
    const { api } = setup(() => ({
      total_count: 1001,
      items: [],
      incomplete_results: false,
    }));
    await expect(api.maps('me')).rejects.toThrow('incomplete map search');
  });
  it('derives live ticket states, section text, dependency steps and the critical path using shared code', async () => {
    const children = [
      raw(2, { state: 'closed' }),
      raw(3),
      raw(4, { assignee: { login: 'worker' } }),
      raw(5),
    ];
    const { api } = setup((path) => {
      if (path === '/repos/me/project/issues/1')
        return raw(1, {
          labels: ['wayfinder:map'],
          body: '## Destination\nShip\n## Decisions so far\nKeep the chosen screens',
        });
      if (path.endsWith('/sub_issues')) return children;
      if (path.endsWith('/5/dependencies/blocked_by')) return [children[1]];
      if (path.endsWith('/3/dependencies/blocked_by')) return [children[0]];
      return [];
    });
    const result = await api.map({ repo: 'me/project', number: 1 });
    expect(result.tickets.map((ticket) => ticket.state)).toEqual([
      'done',
      'frontier',
      'claimed',
      'blocked',
    ]);
    expect(result.layers).toEqual({ 2: 0, 3: 1, 4: 0, 5: 2 });
    expect(result.sections.destination).toBe('Ship');
    expect(result.sections.decisions).toBe('Keep the chosen screens');
    expect(result.critical.remaining).toBe(2);
    expect(result.completed).toBe(1);
  });
  it('falls back to map-body tickets and Blocked by lines while keeping an unavailable blocker open', async () => {
    const { api } = setup((path) => {
      if (path.endsWith('/issues/1'))
        return raw(1, { labels: ['wayfinder:map'], body: '- [ ] #2' });
      if (path.endsWith('/issues/2'))
        return raw(2, { body: 'Blocked by: #99' });
      return new Response('', { status: 404 });
    });
    const result = await api.map({ repo: 'me/project', number: 1 });
    expect(result.tickets[0]?.state).toBe('blocked');
    expect(result.tickets[0]?.openBlockers).toEqual([99]);
    expect(result.warnings).toHaveLength(2);
  });
  it('does not turn a failed sub-issue read into an empty completed map', async () => {
    const { api } = setup((path) =>
      path.endsWith('/issues/1')
        ? raw(1, {
            labels: ['wayfinder:map'],
            sub_issues_summary: { total: 4, completed: 0 },
          })
        : new Response('', { status: 404 }),
    );
    await expect(api.map({ repo: 'me/project', number: 1 })).rejects.toThrow(
      'Couldn’t load this map',
    );
  });
  it('does not use a fallback to hide authorization or rate-limit failures', async () => {
    const { api } = setup((path) =>
      path.endsWith('/issues/1')
        ? raw(1, { labels: ['wayfinder:map'], body: '- [ ] #2' })
        : new Response('', {
            status: 403,
            headers: { 'x-ratelimit-remaining': '0' },
          }),
    );
    await expect(
      api.map({ repo: 'me/project', number: 1 }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(api.map({ repo: 'me/project', number: 1 })).rejects.toThrow(
      'rate limit',
    );
  });
  it('loads ticket relations including issues off the map and paginates comments', async () => {
    const { api } = setup((path, url) => {
      if (path.endsWith('/issues/2')) return raw(2, { state: 'closed' });
      if (path.endsWith('/issues/1')) return raw(1);
      if (path.endsWith('/1/dependencies/blocked_by'))
        return [raw(2, { state: 'closed' })];
      if (path.endsWith('/1/dependencies/blocking')) return [raw(99)];
      if (path.endsWith('/comments'))
        return url.searchParams.get('page') === '1'
          ? Array.from({ length: 100 }, (_, id) => ({
              id,
              body: `Comment ${id}`,
              user: { login: 'reviewer' },
              created_at: '2026-10-27T12:00:00Z',
              html_url: 'https://github.com/me/project/issues/1',
            }))
          : [{ id: 100, body: 'Last', user: null }];
      return [];
    });
    const result = await api.ticket({ repo: 'me/project', number: 1 });
    expect(result.ticket.state).toBe('frontier');
    expect(result.needs[0]?.state).toBe('done');
    expect(result.unblocks[0]?.number).toBe(99);
    expect(result.comments).toHaveLength(101);
    expect(result.comments[100]?.body).toBe('Last');
  });
  it('reports expired credentials and malformed data instead of rendering fabricated maps', async () => {
    const unauthorized = setup(() => new Response('', { status: 401 }));
    await expect(unauthorized.api.maps('me')).rejects.toBeInstanceOf(
      GithubError,
    );
    const malformed = setup(() => ({
      items: [{ title: 'Missing number and state' }],
      total_count: 1,
    }));
    await expect(malformed.api.maps('me')).rejects.toThrow('unreadable issue');
  });
});
