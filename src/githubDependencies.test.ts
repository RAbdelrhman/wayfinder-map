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

  it.each([403, 422, 429, 503])('does not erase external dependents when the blocking read returns HTTP %i', async (status) => {
    runGh.mockImplementation(async (_file, args) => {
      const path = args.at(-1) ?? '';
      if (path.endsWith('/dependencies/blocking')) throw new Error(`HTTP ${String(status)}`);
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
    await expect(fetchMaps({ repo: 'o/r', mapLabel: 'wayfinder:map', typePrefix: 'wayfinder:' })).rejects.toThrow(`HTTP ${String(status)}`);
  });
});
