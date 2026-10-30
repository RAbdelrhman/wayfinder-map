import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { PhonePairingStore } from './phonePairing.js';
import { findModel, parseModelChoice } from './models.js';
import type { ModelCatalog, ModelChoice } from './models.js';

export interface PhoneStart {
  requestId: string;
  repo: string;
  map: number;
  ticket: number;
  model: ModelChoice;
}
export interface PhoneRemoteDependencies {
  pairing: PhonePairingStore;
  catalog: () => Promise<ModelCatalog>;
  start: (phoneId: string, request: PhoneStart) => Promise<{ status: number; body: unknown }>;
  watch: (repo: string, map: number, ticket: number) => Promise<unknown>;
}
function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}
async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > 16_384) throw new Error('Request too large');
    chunks.push(chunk as Buffer);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid request');
  return parsed as Record<string, unknown>;
}
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
export const phoneStartFingerprint = (input: PhoneStart): string => createHash('sha256').update(JSON.stringify(input)).digest('hex');

/** A dedicated listener exposes only phone operations. No browser cookies or desktop API routes. */
export function phoneRemoteServer(deps: PhoneRemoteDependencies) {
  let failures = 0;
  let failureWindow = 0;
  return createServer((request, response) => {
    void (async () => {
      if (request.headers.origin !== undefined) { json(response, 403, { error: 'Browser origins are not accepted.' }); return; }
      const url = new URL(request.url ?? '/', 'http://phone.invalid');
      if (url.pathname === '/v1/pair' && request.method === 'POST') {
        if (Date.now() - failureWindow > 60_000) { failures = 0; failureWindow = Date.now(); }
        if (failures >= 10) { json(response, 429, { error: 'Try pairing again in a minute.' }); return; }
        const input = await body(request);
        if (!text(input.code, 9) || !text(input.name, 100) || !text(input.model, 100)) { json(response, 400, { error: 'Invalid pairing request.' }); return; }
        // Reserve an attempt before awaiting the store so concurrent guesses share the limit.
        failures++;
        const paired = await deps.pairing.pair(input.code, input.name, input.model);
        json(response, paired ? 200 : 401, paired ?? { error: 'Invalid or expired code.' });
        return;
      }
      const authorization = request.headers.authorization;
      const token = typeof authorization === 'string' && /^Bearer [A-Za-z0-9_-]{43}$/.test(authorization) ? authorization.slice(7) : null;
      const phone = token ? await deps.pairing.authenticate(token) : null;
      if (!phone) { json(response, 401, { error: 'Phone is not paired.' }); return; }
      if (url.pathname === '/v1/pair' && request.method === 'DELETE') {
        await deps.pairing.revoke(phone.id);
        json(response, 200, { unpaired: true }); return;
      }
      if (url.pathname === '/v1/models' && request.method === 'GET') {
        json(response, 200, await deps.catalog()); return;
      }
      if (url.pathname === '/v1/start' && request.method === 'POST') {
        const input = await body(request);
        const model = parseModelChoice(input.model);
        if (!text(input.requestId, 100) || !text(input.repo, 200) || !/^[\w.-]+\/[\w.-]+$/.test(input.repo) || !positive(input.map) || !positive(input.ticket) || !model) {
          json(response, 400, { error: 'Invalid start request.' }); return;
        }
        const start: PhoneStart = { requestId: input.requestId, repo: input.repo, map: input.map, ticket: input.ticket, model };
        const previous = await deps.pairing.lookupStart(phone.id, start.requestId, phoneStartFingerprint(start));
        if (previous) { json(response, previous.status, previous.body); return; }
        const catalog = await deps.catalog();
        const offered = findModel(catalog, model);
        const ready = catalog.providers.find(provider => provider.instanceId === model.instanceId)?.ready;
        if (!ready || !offered || (offered.effort ? !model.effort || model.effort.id !== offered.effort.id || !offered.effort.options.some(option => option.id === model.effort?.value) : model.effort !== undefined)) {
          json(response, 409, { error: 'Selected model or effort is no longer offered.', code: 'model_unavailable' }); return;
        }
        const reply = await deps.start(phone.id, start);
        json(response, reply.status, reply.body); return;
      }
      if (url.pathname === '/v1/watch' && request.method === 'GET') {
        const repo = url.searchParams.get('repo') ?? '';
        const map = Number(url.searchParams.get('map'));
        const ticket = Number(url.searchParams.get('ticket'));
        if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !positive(map) || !positive(ticket)) { json(response, 400, { error: 'Invalid watch request.' }); return; }
        json(response, 200, await deps.watch(repo, map, ticket)); return;
      }
      json(response, 404, { error: 'No such phone endpoint.' });
    })().catch(error => { if (!response.headersSent) json(response, error instanceof SyntaxError || (error instanceof Error && /Request too large|Invalid request/.test(error.message)) ? 400 : 503, { error: 'Desktop operation unavailable.' }); else response.end(); });
  });
}
