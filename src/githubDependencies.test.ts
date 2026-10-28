import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runGh } = vi.hoisted(() => ({
  runGh: vi.fn<(file: string, args: string[], options: unknown) => Promise<{ stdout: Buffer; stderr: Buffer }>>(),
}));
vi.mock('node:child_process', () => ({
  execFile: Object.assign(vi.fn(), {
    [Symbol.for('nodejs.util.promisify.custom')]: runGh,
  }),
}));

import { fetchMaps, fetchTicketWithParent } from './github.js';

const raw = { number: 42, title: 'Ticket', state: 'open', body: 'Blocked by: #7' };
const response = (value: unknown) => ({ stdout: Buffer.from(JSON.stringify(value)), stderr: Buffer.alloc(0) });

describe('native dependency reads', () => {
  beforeEach(() => { runGh.mockReset(); });

  it('keeps a successful empty native list authoritative over old body text', async () => {
    runGh.mockImplementation(async (_file, args) => response(
      args.at(-1)?.endsWith('/blocked_by') ? [] : raw,
    ));
    expect((await fetchTicketWithParent('o/r', 42))?.ticket).toMatchObject({
      blockedBy: [], openBlockers: [], state: 'frontier',
    });
  });

  it('keeps closed native dependencies for sequencing without blocking readiness', async () => {
    runGh.mockImplementation(async (_file, args) => response(
      args.at(-1)?.endsWith('/blocked_by') ? [{ number: 8, state: 'closed' }] : raw,
    ));
    expect((await fetchTicketWithParent('o/r', 42))?.ticket).toMatchObject({
      blockedBy: [8], openBlockers: [], state: 'frontier',
    });
  });

  it.each([404, 410])('uses the body fallback when the endpoint returns HTTP %i', async (status) => {
    runGh.mockImplementation(async (_file, args) => {
      if (args.at(-1)?.endsWith('/blocked_by')) throw new Error(`gh: Not found (HTTP ${String(status)})`);
      return response(raw);
    });
    expect((await fetchTicketWithParent('o/r', 42))?.ticket).toMatchObject({
      blockedBy: [7], openBlockers: [7], state: 'blocked',
    });
  });

  it.each(['HTTP 401', 'HTTP 403 rate limit', 'HTTP 422', 'HTTP 429', 'HTTP 503', 'network timeout', 'invalid JSON'])(
    'preserves a failed blockers read instead of returning ready on %s', async (failure) => {
      runGh.mockImplementation(async (_file, args) => {
        if (args.at(-1)?.endsWith('/blocked_by')) {
          if (failure === 'invalid JSON') return { stdout: Buffer.from('not-json'), stderr: Buffer.alloc(0) };
          throw new Error(failure);
        }
        return response({ ...raw, body: '' });
      });
      await expect(fetchTicketWithParent('o/r', 42)).rejects.toThrow();
    },
  );

  it('does not load or import an outside dependent even when GitHub reports it', async () => {
    runGh.mockImplementation(async (_file, args) => {
      const path = args.at(-1) ?? '';
      if (path.endsWith('/dependencies/blocking')) throw new Error('An outside dependent must not be read');
      if (path.endsWith('/dependencies/blocked_by')) return response([]);
      if (path.endsWith('/sub_issues')) return {
        stdout: Buffer.from(`HTTP/2.0 200 OK\r\nETag: "map"\r\n\r\n${JSON.stringify([{ ...raw, body: '', issue_dependencies_summary: { total_blocking: 1 } }])}`),
        stderr: Buffer.alloc(0),
      };
      if (args.includes('--slurp')) return response([[{
        number: 10, title: 'Map', body: '', state: 'open', updated_at: new Date().toISOString(),
      }]]);
      throw new Error(`Unexpected command: ${args.join(' ')}`);
    });
    const result = await fetchMaps({ repo: 'o/r', mapLabel: 'wayfinder:map', typePrefix: 'wayfinder:' });
    expect(result.maps[0]?.tickets.map((ticket) => ticket.number)).toEqual([42]);
    expect(result.maps[0]?.outside).toEqual([]);
    expect(runGh.mock.calls.some(([, args]) => args.some((arg) => arg.endsWith('/dependencies/blocking')))).toBe(false);
  });

  it('keeps an outside open blocker conservative without importing its ticket', async () => {
    runGh.mockImplementation(async (_file, args) => {
      const path = args.at(-1) ?? '';
      if (path.endsWith('/dependencies/blocked_by')) return response([{ number: 7, title: 'Other map', state: 'open' }]);
      if (path.endsWith('/sub_issues')) return {
        stdout: Buffer.from(`HTTP/2.0 200 OK\r\nETag: "map"\r\n\r\n${JSON.stringify([{ ...raw, body: '' }])}`),
        stderr: Buffer.alloc(0),
      };
      if (args.includes('--slurp')) return response([[{ number: 10, title: 'Map', state: 'open', updated_at: new Date().toISOString() }]]);
      throw new Error(`Outside issues must not be loaded: ${path}`);
    });
    const result = await fetchMaps({ repo: 'o/r', mapLabel: 'wayfinder:map', typePrefix: 'wayfinder:' });
    expect(result.maps[0]?.outside).toEqual([]);
    expect(result.maps[0]?.tickets[0]).toMatchObject({ number: 42, openBlockers: [7], state: 'blocked' });
  });

  it.each([false, true])('does not turn a body reference to another map ticket into membership, fallback=%s', async (fallback) => {
    runGh.mockImplementation(async (_file, args) => {
      const path = args.at(-1) ?? '';
      let value: unknown;
      if (path.endsWith('/dependencies/blocked_by')) value = [];
      else if (path.endsWith('/sub_issues')) {
        if (fallback) throw new Error('HTTP 404');
        value = [{ ...raw, body: '' }];
      } else if (path.endsWith('/issues/7')) value = { number: 7, title: 'Other map ticket', state: 'open', parent_issue_url: 'https://api.github.com/repos/o/r/issues/99' };
      else if (args.includes('--slurp')) return response([[{ number: 10, title: 'Map', body: '- [ ] #7', state: 'open', updated_at: new Date().toISOString() }]]);
      else throw new Error(`Unexpected route ${path}`);
      return args.includes('--include')
        ? { stdout: Buffer.from(`HTTP/2.0 200 OK\r\nETag: "map"\r\n\r\n${JSON.stringify(value)}`), stderr: Buffer.alloc(0) }
        : response(value);
    });
    const result = await fetchMaps({ repo: 'o/r', mapLabel: 'wayfinder:map', typePrefix: 'wayfinder:' });
    expect(result.maps[0]?.tickets.map((ticket) => ticket.number)).toEqual(fallback ? [] : [42]);
    expect(result.warnings.join(' ')).not.toContain('also showing');
  });
});
