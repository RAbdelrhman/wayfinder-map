import { describe, expect, it, vi } from 'vitest';

import environment from './__fixtures__/t3-protocol-2/environment.json' with { type: 'json' };
import shellRows from './__fixtures__/t3-protocol-2/shell-rows.json' with { type: 'json' };
import threadStart from './__fixtures__/t3-protocol-2/thread-start.json' with { type: 'json' };
import { HandOffStore, mapT3Status, USAGE_LIMIT_LABEL } from './handOffTracking.js';
import { T3Api, threadCommands } from './t3Api.js';

// Recorded from T3 Code 0.1.7-nightly.20261103.4119 (orchestration protocol 2), with titles,
// paths and message text redacted. See src/__fixtures__/t3-protocol-2/README.md.

vi.mock('./github.js', () => ({ gh: () => Promise.reject(new Error('GitHub is not available in tests.')) }));

type Frame = { dir: string; frame: Record<string, unknown> };

class ReplaySocket {
  static sockets: ReplaySocket[] = [];
  readonly sent: Record<string, unknown>[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(readonly url: URL) {
    ReplaySocket.sockets.push(this);
    queueMicrotask(() => this.onopen?.(new Event('open')));
  }

  send(data: string): void {
    const frame = JSON.parse(data) as Record<string, unknown>;
    this.sent.push(frame);
  }

  receive(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent);
  }

  close(): void {
    this.onclose?.();
  }
}

function protocol2Api(): T3Api {
  const api = new T3Api('http://127.0.0.1:3773', { exe: 't3', script: 'server.mjs' });
  vi.spyOn(api, 'environment').mockResolvedValue(environment);
  vi.spyOn(api as unknown as { request(path: string): Promise<unknown> }, 'request').mockResolvedValue({ ticket: 'ticket' });
  return api;
}

const rows = shellRows.rows;

describe('protocol 2 status mapping from recorded shell rows', () => {
  it('was recorded from a protocol 2 server', () => {
    expect(environment.orchestrationProtocolVersion).toBe(2);
    expect(shellRows.orchestrationProtocolVersion).toBe(2);
  });

  it.each([
    ['running', 'running'],
    ['completedUnsettled', 'ready'],
    ['completedSettled', 'finished'],
    ['interrupted', 'interrupted'],
    ['cancelled', 'interrupted'],
    ['idle', 'ready'],
  ] as const)('maps the recorded %s row to %s', (name, expected) => {
    expect(mapT3Status(rows[name])).toMatchObject({ status: expected, pendingApproval: false, pendingUserInput: false, lastError: null });
  });

  it('waits on a blocking question even while the run reports running', () => {
    expect(rows.waitingOnUserInput).toMatchObject({ status: 'running', activityRunStatus: 'running', pendingRuntimeRequest: { kind: 'user_input', blocking: true } });
    expect(mapT3Status(rows.waitingOnUserInput)).toMatchObject({ status: 'waiting', pendingUserInput: true });
  });

  it('keeps running past an async question but still flags it for the user', () => {
    const row = { ...rows.waitingOnUserInput, pendingRuntimeRequest: { ...rows.waitingOnUserInput.pendingRuntimeRequest, blocking: false } };
    expect(mapT3Status(row)).toMatchObject({ status: 'running', pendingUserInput: true });
  });

  it.each(['command', 'file-change', 'permission'])('waits on a pending %s approval', (kind) => {
    const row = { ...rows.running, pendingRuntimeRequest: { ...rows.waitingOnUserInput.pendingRuntimeRequest, kind } };
    expect(mapT3Status(row)).toMatchObject({ status: 'waiting', pendingApproval: true });
  });

  it('maps recorded failures and labels a usage limit by its class', () => {
    expect(mapT3Status(rows.failedProviderError)).toMatchObject({ status: 'failed', lastError: rows.failedProviderError.lastError });
    expect(mapT3Status(rows.failedUsageLimit)).toMatchObject({ status: 'failed', lastError: USAGE_LIMIT_LABEL, rawError: rows.failedUsageLimit.lastError });
    const unmatchedText = { ...rows.failedUsageLimit, lastError: 'Provider said no.' };
    expect(mapT3Status(unmatchedText)).toMatchObject({ status: 'failed', lastError: USAGE_LIMIT_LABEL, rawError: 'Provider said no.' });
  });
});

describe('protocol 1 status mapping', () => {
  // No protocol 1 server is installed any more; these rows follow the shape #220 measured.
  it.each([
    [{ id: 't', session: { status: 'running' }, latestTurn: { state: 'running' } }, 'running'],
    [{ id: 't', session: { status: 'running' }, hasPendingUserInput: true }, 'waiting'],
    [{ id: 't', session: { status: 'running' }, hasPendingApprovals: true }, 'waiting'],
    [{ id: 't', latestTurn: { state: 'waiting' } }, 'waiting'],
    [{ id: 't', session: { status: 'ready' }, latestTurn: { state: 'completed', settledAt: null } }, 'ready'],
    [{ id: 't', session: { status: 'ready' }, latestTurn: { state: 'completed', settledAt: '2026-10-03T00:00:00Z' } }, 'finished'],
    [{ id: 't', session: { status: 'error', lastError: 'Provider failed.' } }, 'failed'],
    [{ id: 't', latestTurn: { state: 'interrupted' } }, 'interrupted'],
  ])('maps %j to %s', (row, expected) => {
    expect(mapT3Status(row)?.status).toBe(expected);
  });
});

describe('protocol 2 thread start replayed from a recording', () => {
  it('sends the recorded dispatch commands and accepts the recorded replies', async () => {
    const [createFrame, createReply, startFrame, startReply] = threadStart.dispatch as Frame[];
    const recordedCreate = createFrame?.frame['payload'] as Record<string, unknown>;
    const recordedStart = startFrame?.frame['payload'] as Record<string, unknown>;
    ReplaySocket.sockets = [];
    vi.stubGlobal('WebSocket', ReplaySocket as unknown as typeof WebSocket);
    const api = protocol2Api();
    try {
      const commands = threadCommands({
        projectId: String(recordedCreate['projectId']),
        title: String(recordedCreate['title']),
        prompt: String(recordedStart['text']),
        defaults: {
          modelSelection: recordedCreate['modelSelection'],
          runtimeMode: String(recordedCreate['runtimeMode']),
          interactionMode: String(recordedCreate['interactionMode']),
        },
        worktree: null,
        now: String(recordedCreate['createdAt']),
      });
      const results: unknown[] = [];
      for (const [command, reply] of [[commands.create, createReply], [commands.start, startReply]] as const) {
        const dispatching = api.dispatch(command);
        const index = results.length;
        await vi.waitFor(() => expect(ReplaySocket.sockets[index]?.sent).toHaveLength(1));
        const socket = ReplaySocket.sockets[index];
        expect(socket?.url.searchParams.get('orchestrationProtocol')).toBe('2');
        socket?.receive(reply?.frame);
        results.push(await dispatching);
      }
      const ids = new Set(['commandId', 'threadId', 'messageId']);
      const withoutIds = (payload: unknown): Record<string, unknown> =>
        Object.fromEntries(Object.entries(payload as Record<string, unknown>).filter(([key]) => !ids.has(key)));
      const [createSent, startSent] = ReplaySocket.sockets.map((socket) => socket.sent[0]);
      expect(createSent).toMatchObject({ _tag: 'Request', tag: 'orchestration.dispatchCommand' });
      expect(withoutIds(createSent?.['payload'])).toEqual(withoutIds(recordedCreate));
      expect(withoutIds(startSent?.['payload'])).toEqual(withoutIds(recordedStart));
      expect(results).toEqual([{ sequence: 602454 }, { sequence: 602462 }]);
    } finally {
      api.revoke();
      vi.unstubAllGlobals();
    }
  });

  it('acks every shell chunk and follows the started thread to ready', async () => {
    ReplaySocket.sockets = [];
    vi.stubGlobal('WebSocket', ReplaySocket as unknown as typeof WebSocket);
    const api = protocol2Api();
    const store = new HandOffStore({ filePath: null });
    const origin = 'http://127.0.0.1:3773';
    await store.record({ repo: 'o/r', mapNumber: 217, ticketNumber: 254, title: 't', t3Origin: origin, threadId: threadStart.threadId, requestedBranch: 'b', rung: 'thread' });
    const statuses: string[] = [];
    let applying = Promise.resolve();
    try {
      const stop = await api.subscribeShell(602453, (value) => {
        applying = applying.then(async () => {
          await store.applyEvent(environment.environmentId, origin, value);
          const status = (await store.list())[0]?.status ?? 'missing';
          if (statuses.at(-1) !== status) statuses.push(status);
        });
      }, () => undefined);
      const socket = ReplaySocket.sockets[0];
      const chunks = (threadStart.shell as Frame[]).filter((f) => f.dir === 'received').map((f) => f.frame);
      for (const chunk of chunks) socket?.receive(chunk);
      await applying;
      stop();

      const acks = socket?.sent.filter((frame) => frame['_tag'] === 'Ack') ?? [];
      expect(acks).toHaveLength(chunks.length);
      expect(acks.every((frame) => frame['requestId'] === 'shell')).toBe(true);
      // The recording passes through a bare `waiting` run with nothing pending; that is not the user's turn.
      expect(statuses).toEqual(['starting', 'running', 'ready']);
      expect(threadStart.mappedStatuses).toContain('waiting');
    } finally {
      api.revoke();
      vi.unstubAllGlobals();
    }
  });
});
