import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createGithubMapWatchReader, githubMapWatchReader } from './mapWatcher.js';

const mocks = vi.hoisted(() => ({ read: vi.fn<(args: string[]) => Promise<string>>() }));
vi.mock('./github.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./github.js')>();
  return { ...original, ghIncludingHeaders: mocks.read };
});

const issue = (number: number, blocked = 1) => ({ number, title: `Ticket ${number}`, state: 'open', assignees: [], issue_dependencies_summary: { blocked_by: blocked } });
const response = (body: unknown, etag: string, link = '') => `HTTP/2.0 200 OK\r\nETag: ${etag}\r\n${link === '' ? '' : `Link: ${link}\r\n`}\r\n${JSON.stringify(body)}`;

beforeEach(() => { mocks.read.mockReset(); });

describe('production GitHub map watcher membership', () => {
  it('keeps native and readable body members while skipping missing body members across polls', async () => {
    const reader = createGithubMapWatchReader(mocks.read);
    const missing = new Set([13]);
    mocks.read.mockImplementation(async (args) => {
      const route = args.find((arg) => arg.startsWith('repos/')) ?? '';
      if (route.endsWith('/sub_issues')) return args.includes('If-None-Match: "native"') ? 'HTTP/2.0 304 Not Modified\r\n\r\n' : response([issue(11)], '"native"');
      const number = Number(route.split('/').at(-1));
      if (missing.has(number)) return 'HTTP/2.0 404 Not Found\r\n\r\n{}';
      const etag = `"issue-${String(number)}"`;
      if (args.includes(`If-None-Match: ${etag}`)) return 'HTTP/2.0 304 Not Modified\r\n\r\n';
      return response(number === 5 ? { body: '- [ ] #12\n- [ ] #13' } : issue(number), etag);
    });
    const first = await reader.readMap('body/missing', 5, null);
    if (first.status !== 'changed') throw new Error('Expected baseline');
    expect(first.tickets.map((ticket) => ticket.number)).toEqual([11, 12]);
    expect((await reader.readMap('body/missing', 5, first.etag)).status).toBe('unchanged');

    missing.add(12);
    const removed = await reader.readMap('body/missing', 5, first.etag);
    if (removed.status !== 'changed') throw new Error('Expected disappeared member');
    expect(removed.tickets.map((ticket) => ticket.number)).toEqual([11]);
    expect((await reader.readMap('body/missing', 5, removed.etag)).status).toBe('unchanged');

    missing.delete(13);
    const restored = await reader.readMap('body/missing', 5, removed.etag);
    if (restored.status !== 'changed') throw new Error('Expected restored member');
    expect(restored.tickets.map((ticket) => ticket.number)).toEqual([11, 13]);
  });

  it.each([
    ['parent', 'HTTP/2.0 404 Not Found\r\n\r\n{}', 'GitHub answered 404'],
    ['body', 'HTTP/2.0 403 Forbidden\r\n\r\n{}', 'GitHub answered 403'],
    ['body', 'HTTP/2.0 404 Not Found\r\nx-ratelimit-limit: 5000\r\nx-ratelimit-remaining: 0\r\nx-ratelimit-reset: 2000000000\r\n\r\n{}', 'rate limit'],
  ])('keeps %s failure visible instead of treating it as missing membership', async (kind, failure, message) => {
    const reader = createGithubMapWatchReader(mocks.read);
    mocks.read.mockImplementation(async (args) => {
      const route = args.find((arg) => arg.startsWith('repos/')) ?? '';
      if (route.endsWith('/5')) return kind === 'parent' ? failure : response({ body: '- [ ] #12' }, '"map"');
      if (route.endsWith('/sub_issues')) return response([issue(11)], '"native"');
      return failure;
    });
    await expect(reader.readMap('body/failure', 5, null)).rejects.toThrow(message);
  });

  it('does not watch a map as its own child when its body links back to itself', async () => {
    const reader = createGithubMapWatchReader(mocks.read);
    mocks.read.mockImplementation(async (args) => {
      const route = args.find((arg) => arg.startsWith('repos/')) ?? '';
      if (route.endsWith('/sub_issues')) return response([issue(11)], '"native"');
      if (route === 'repos/self/map/issues/5') return response({ ...issue(5), body: '- [ ] #5\n- [ ] #12\nhttps://github.com/self/map/issues/5' }, '"map"');
      if (route === 'repos/self/map/issues/12') return response(issue(12), '"child"');
      throw new Error(`Unexpected request ${args.join(' ')}`);
    });
    const read = await reader.readMap('self/map', 5, null);
    if (read.status !== 'changed') throw new Error('Expected baseline');
    expect(read.tickets.map((ticket) => ticket.number)).toEqual([11, 12]);
    expect(mocks.read).toHaveBeenCalledTimes(3);
  });

  it('falls back to body members when GitHub has no native sub-issues endpoint', async () => {
    const reader = createGithubMapWatchReader(mocks.read);
    mocks.read.mockImplementation(async (args) => {
      const route = args.find((arg) => arg.startsWith('repos/')) ?? '';
      if (route.endsWith('/sub_issues')) return 'HTTP/2.0 404 Not Found\r\n\r\n{"message":"Not Found"}';
      if (route === 'repos/fallback/map/issues/5') return response({ body: '- [ ] #12' }, '"map"');
      if (route === 'repos/fallback/map/issues/12') return response(issue(12), '"child"');
      throw new Error(`Unexpected request ${args.join(' ')}`);
    });
    const read = await reader.readMap('fallback/map', 5, null);
    if (read.status !== 'changed') throw new Error('Expected baseline');
    expect(read.tickets.map((ticket) => ticket.number)).toEqual([12]);
  });

  it('treats a repeated unavailable native endpoint as unchanged after conditional body reads', async () => {
    const reader = createGithubMapWatchReader(mocks.read);
    let native = false;
    let failure: string | null = null;
    mocks.read.mockImplementation(async (args) => {
      const route = args.find((arg) => arg.startsWith('repos/')) ?? '';
      if (route.endsWith('/sub_issues')) return failure ?? (native ? response([issue(11)], '"native"') : 'HTTP/2.0 404 Not Found\r\n\r\n{}');
      const etag = route.endsWith('/5') ? '"map"' : '"child"';
      if (args.includes(`If-None-Match: ${etag}`)) return 'HTTP/2.0 304 Not Modified\r\n\r\n';
      return response(route.endsWith('/5') ? { body: '- [ ] #12' } : issue(12), etag);
    });
    const first = await reader.readMap('repeat/fallback', 5, null);
    if (first.status !== 'changed') throw new Error('Expected baseline');
    expect(first.tickets.map((ticket) => ticket.number)).toEqual([12]);
    expect((await reader.readMap('repeat/fallback', 5, first.etag)).status).toBe('unchanged');

    native = true;
    const restored = await reader.readMap('repeat/fallback', 5, first.etag);
    if (restored.status !== 'changed') throw new Error('Expected restored native membership');
    expect(restored.tickets.map((ticket) => ticket.number)).toEqual([11, 12]);
    native = false;
    const removed = await reader.readMap('repeat/fallback', 5, restored.etag);
    if (removed.status !== 'changed') throw new Error('Expected removed native membership');
    expect(removed.tickets.map((ticket) => ticket.number)).toEqual([12]);
    expect((await reader.readMap('repeat/fallback', 5, removed.etag)).status).toBe('unchanged');

    failure = 'HTTP/2.0 403 Forbidden\r\n\r\n{}';
    await expect(reader.readMap('repeat/fallback', 5, removed.etag)).rejects.toThrow('GitHub answered 403');
    failure = 'HTTP/2.0 404 Not Found\r\nx-ratelimit-limit: 5000\r\nx-ratelimit-remaining: 0\r\nx-ratelimit-reset: 2000000000\r\n\r\n{}';
    await expect(reader.readMap('repeat/fallback', 5, removed.etag)).rejects.toThrow('rate limit');
  });

  it.each([
    ['HTTP/2.0 403 Forbidden\r\n\r\n{}', 'GitHub answered 403'],
    ['HTTP/2.0 404 Not Found\r\nx-ratelimit-limit: 5000\r\nx-ratelimit-remaining: 0\r\nx-ratelimit-reset: 2000000000\r\n\r\n{}', 'rate limit'],
  ])('keeps endpoint errors visible when the response is %s', async (failure, message) => {
    const reader = createGithubMapWatchReader(mocks.read);
    mocks.read.mockImplementation(async (args) => (args.some((arg) => arg.endsWith('/sub_issues')) ? failure : response({ body: '- [ ] #12' }, '"map"')));
    await expect(reader.readMap('fallback/error', 5, null)).rejects.toThrow(message);
  });

  it('conditionally reads every page and body member, noticing an independent change behind 304 responses', async () => {
    const reader = createGithubMapWatchReader(mocks.read);
    const resources = new Map([
      ['repos/conditional/map/issues/5', { value: { body: '- [ ] #12' }, etag: '"map"', link: '' }],
      ['native:1', { value: [issue(11)], etag: '"p1"', link: '<https://api.github.com/repos/conditional/map/issues/5/sub_issues?page=2>; rel="next"' }],
      ['native:2', { value: [issue(101)], etag: '"p2"', link: '' }],
      ['repos/conditional/map/issues/12', { value: issue(12), etag: '"body"', link: '' }],
    ]);
    mocks.read.mockImplementation(async (args) => {
      const route = args.find((arg) => arg.startsWith('repos/')) ?? '';
      const id = route.endsWith('/sub_issues') ? `native:${args.find((arg) => arg.startsWith('page='))?.slice(5)}` : route;
      const resource = resources.get(id);
      if (resource === undefined) throw new Error(`Unexpected request ${args.join(' ')}`);
      if (args.includes(`If-None-Match: ${resource.etag}`)) return 'HTTP/2.0 304 Not Modified\r\n\r\n';
      return response(resource.value, resource.etag, resource.link);
    });
    const first = await reader.readMap('conditional/map', 5, null);
    if (first.status !== 'changed') throw new Error('Expected baseline');
    expect(first.tickets.map((ticket) => ticket.number)).toEqual([11, 101, 12]);
    mocks.read.mockClear();
    expect((await reader.readMap('conditional/map', 5, first.etag)).status).toBe('unchanged');
    expect(mocks.read).toHaveBeenCalledTimes(4);
    expect(mocks.read.mock.calls.every(([args]) => args.some((arg) => arg.startsWith('If-None-Match:')))).toBe(true);

    resources.set('native:2', { value: [issue(101, 0)], etag: '"p2-next"', link: '' });
    const laterPage = await reader.readMap('conditional/map', 5, first.etag);
    if (laterPage.status !== 'changed') throw new Error('Expected later page change');
    expect(laterPage.tickets.find((ticket) => ticket.number === 101)?.state).toBe('frontier');
    expect(laterPage.tickets.find((ticket) => ticket.number === 11)?.state).toBe('blocked');

    resources.set('repos/conditional/map/issues/12', { value: issue(12, 0), etag: '"body-next"', link: '' });
    const bodyChange = await reader.readMap('conditional/map', 5, laterPage.etag);
    if (bodyChange.status !== 'changed') throw new Error('Expected body-only change');
    expect(bodyChange.tickets.find((ticket) => ticket.number === 12)?.state).toBe('frontier');

    resources.set('native:1', { value: [issue(11)], etag: '"p1-shrunk"', link: '' });
    resources.set('repos/conditional/map/issues/5', { value: { body: '' }, etag: '"map-removed"', link: '' });
    mocks.read.mockClear();
    const shrunk = await reader.readMap('conditional/map', 5, bodyChange.etag);
    if (shrunk.status !== 'changed') throw new Error('Expected removed membership');
    expect(shrunk.tickets.map((ticket) => ticket.number)).toEqual([11]);
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });

  it('includes children after the first native sub-issue page', async () => {
    mocks.read.mockImplementation(async (args) => {
      const route = args.find((arg) => arg.startsWith('repos/')) ?? '';
      if (route.includes('/sub_issues')) {
        return args.includes('page=2') || route.includes('page=2')
          ? response([issue(101)], '"p2"')
          : response(Array.from({ length: 100 }, (_, i) => issue(i + 1)), '"p1"', '<https://api.github.com/repos/o/r/issues/5/sub_issues?page=2>; rel="next"');
      }
      if (route === 'repos/o/r/issues/5') return response({ body: '' }, '"map"');
      throw new Error(`Unexpected request ${args.join(' ')}`);
    });
    const read = await githubMapWatchReader.readMap('o/r', 5, null);
    expect(read.status).toBe('changed');
    if (read.status !== 'changed') throw new Error('Expected baseline');
    expect(read.tickets.map((ticket) => ticket.number)).toContain(101);
  });

  it('includes body-only members alongside native children', async () => {
    mocks.read.mockImplementation(async (args) => {
      const route = args.find((arg) => arg.startsWith('repos/')) ?? '';
      if (route.includes('/sub_issues')) return response([issue(11)], '"native"');
      if (route === 'repos/body/only/issues/5') return response({ body: '- [ ] #11\n- [ ] #12' }, '"map"');
      if (route === 'repos/body/only/issues/12') return response(issue(12), '"body"');
      throw new Error(`Unexpected request ${args.join(' ')}`);
    });
    const read = await githubMapWatchReader.readMap('body/only', 5, null);
    expect(read.status).toBe('changed');
    if (read.status !== 'changed') throw new Error('Expected baseline');
    expect(read.tickets.map((ticket) => ticket.number)).toEqual([11, 12]);
  });
});
