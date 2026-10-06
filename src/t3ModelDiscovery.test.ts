import { afterEach, describe, expect, it, vi } from 'vitest';

import { toCatalog } from './models.js';
import { T3Api } from './t3Api.js';

const providers = [{
  instanceId: 'codex', displayName: 'Codex', enabled: true, installed: true, status: 'ready',
  models: [{ slug: 'custom-model', name: 'Custom model', capabilities: { optionDescriptors: [{
    id: 'reasoningEffort', type: 'select', options: [{ id: 'high', label: 'High', isDefault: true }],
  }] } }],
}];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('T3 model discovery protocol compatibility', () => {
  it.each([
    { name: 'v1', descriptor: { orchestrationProtocolVersion: 1 }, parameter: null },
    { name: 'v2', descriptor: { orchestrationProtocolVersion: 2 }, parameter: '2' },
    { name: 'legacy descriptor', descriptor: {}, parameter: null },
    { name: 'legacy server without a descriptor', descriptor: null, parameter: null },
  ])('loads models on $name and caches protocol discovery', async ({ descriptor, parameter }) => {
    const urls: URL[] = [];
    const requests: unknown[] = [];
    class CatalogSocket {
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;

      constructor(url: URL) {
        urls.push(url);
        queueMicrotask(() => {
          if (url.searchParams.get('orchestrationProtocol') !== parameter) this.onerror?.();
          else this.onopen?.();
        });
      }

      send(data: string): void {
        const request = JSON.parse(data) as { _tag: string };
        if (request._tag === 'Pong') return;
        requests.push(request);
        this.onmessage?.({ data: JSON.stringify({ _tag: 'Ping' }) });
        this.onmessage?.({ data: JSON.stringify({
          _tag: 'Exit', requestId: '1', exit: { _tag: 'Success', value: { providers } },
        }) });
      }

      close(): void { this.onclose?.(); }
    }
    vi.stubGlobal('WebSocket', CatalogSocket);
    const api = new T3Api('https://localhost:3773', { exe: 't3', script: 'server.mjs' });
    const environment = vi.spyOn(api, 'environment');
    if (descriptor === null) environment.mockRejectedValue(new Error('T3 Code environment answered 404'));
    else environment.mockResolvedValue(descriptor);
    const ticket = vi.spyOn(api as unknown as { request: (path: string, body?: unknown) => Promise<unknown> }, 'request')
      .mockResolvedValueOnce({ ticket: 'first-ticket' }).mockResolvedValueOnce({ ticket: 'second-ticket' });

    for (let call = 0; call < 2; call += 1) {
      const config = await api.rpc('server.getConfig') as { providers: typeof providers };
      const catalog = toCatalog(config.providers);
      expect(catalog.providers[0]).toMatchObject({ instanceId: 'codex', ready: true, models: [{
        slug: 'custom-model', name: 'Custom model', effort: { id: 'reasoningEffort', defaultValue: 'high' },
      }] });
    }
    expect(environment).toHaveBeenCalledTimes(descriptor === null ? 2 : 1);
    expect(ticket).toHaveBeenCalledTimes(2);
    expect(urls.map((url) => url.protocol)).toEqual(['wss:', 'wss:']);
    expect(urls.map((url) => url.searchParams.get('wsTicket'))).toEqual(['first-ticket', 'second-ticket']);
    expect(requests).toEqual(Array.from({ length: 2 }, () => ({
      _tag: 'Request', id: '1', tag: 'server.getConfig', payload: {}, headers: [],
    })));
    api.revoke();
  });

  it('recovers v2 discovery after the environment probe temporarily fails', async () => {
    class V2Socket {
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;

      constructor(url: URL) {
        queueMicrotask(() => {
          if (url.searchParams.get('orchestrationProtocol') !== '2') this.onerror?.();
          else this.onopen?.();
        });
      }

      send(): void {
        this.onmessage?.({ data: JSON.stringify({
          _tag: 'Exit', requestId: '1', exit: { _tag: 'Success', value: { providers } },
        }) });
      }

      close(): void { this.onclose?.(); }
    }
    vi.stubGlobal('WebSocket', V2Socket);
    const api = new T3Api('http://localhost:3773', { exe: 't3', script: 'server.mjs' });
    const environment = vi.spyOn(api, 'environment')
      .mockRejectedValueOnce(new Error('Temporarily unavailable'))
      .mockResolvedValue({ orchestrationProtocolVersion: 2 });
    vi.spyOn(api as unknown as { request: (path: string) => Promise<unknown> }, 'request')
      .mockResolvedValue({ ticket: 'ticket' });

    await expect(api.rpc('server.getConfig')).rejects.toThrow('T3 Code WebSocket failed');
    await expect(api.rpc('server.getConfig')).resolves.toEqual({ providers });
    expect(environment).toHaveBeenCalledTimes(2);
  });

  it('rejects unsupported protocol versions before issuing a ticket or opening a socket', async () => {
    const api = new T3Api('http://localhost:3773', { exe: 't3', script: 'server.mjs' });
    vi.spyOn(api, 'environment').mockResolvedValue({ orchestrationProtocolVersion: 3 });
    const ticket = vi.spyOn(api as unknown as { request: (path: string) => Promise<unknown> }, 'request');
    const socket = vi.fn();
    vi.stubGlobal('WebSocket', socket);
    await expect(api.rpc('server.getConfig')).rejects.toThrow('Unsupported T3 Code orchestration protocol: 3');
    expect(ticket).not.toHaveBeenCalled();
    expect(socket).not.toHaveBeenCalled();
  });
});
