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
