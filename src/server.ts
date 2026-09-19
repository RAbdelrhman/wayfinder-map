import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchMaps } from './github.js';
import { parseModelChoice } from './models.js';
import { copyToClipboard } from './clipboard.js';
import { DEFAULT_TEMPLATE, buildPrompt, ticketBranch } from './prompt.js';
import { detectT3, handOff } from './t3.js';
import type { T3HandOff } from './t3.js';
import type { Config } from './config.js';
import type { MapSnapshot, WayfinderMap } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
const UI_DIR = join(here, 'ui');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

interface ServeOptions {
  config: Config;
  repo: string;
  template: string;
  /** The checkout T3 Code threads run in, or null when the launch directory is not one. */
  workspaceRoot: string | null;
  t3: T3HandOff;
}

export interface RunningServer {
  server: Server;
  url: string;
}

function json(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(payload);
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > 1_000_000) throw new Error('Request body too large');
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/**
 * This server shells out to gh and writes the clipboard, so it only answers requests
 * from its own page. Rejecting a foreign Origin keeps another site in the browser from
 * driving it.
 */
function originAllowed(request: IncomingMessage, port: number): boolean {
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  try {
    const parsed = new URL(origin);
    // localhost and 127.0.0.1 are the same machine, and the page may be opened as either.
    return LOOPBACK.has(parsed.hostname) && parsed.port === String(port);
  } catch {
    return false;
  }
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export async function startServer({ config, repo, template, workspaceRoot, t3 }: ServeOptions): Promise<RunningServer> {
  let snapshot: MapSnapshot | null = null;
  let inFlight: Promise<MapSnapshot> | null = null;

  const load = async (): Promise<MapSnapshot> => {
    const { maps, warnings } = await fetchMaps({
      repo,
      mapLabel: config.mapLabel,
      typePrefix: config.typePrefix,
    });
    snapshot = { repo, fetchedAt: new Date().toISOString(), maps, warnings };
    return snapshot;
  };

  const snapshotOnce = async (force: boolean): Promise<MapSnapshot> => {
    if (!force && snapshot !== null) return snapshot;
    inFlight ??= load().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };

  const find = (mapNumber: number, ticketNumber: number): { map: WayfinderMap; ticket: MapTicket } | null => {
    const map = snapshot?.maps.find((candidate) => candidate.number === mapNumber);
    const ticket = map?.tickets.find((candidate) => candidate.number === ticketNumber);
    return map && ticket ? { map, ticket } : null;
  };

  const url = `http://${config.host}:${String(config.port)}`;

  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      json(response, 500, { error: (error as Error).message });
    });
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const requestUrl = new URL(request.url ?? '/', url);
    const path = requestUrl.pathname;

    if (path.startsWith('/api/')) {
      if (!originAllowed(request, config.port)) {
        json(response, 403, { error: 'Cross-origin requests are not accepted.' });
        return;
      }

      if (path === '/api/snapshot') {
        const force = requestUrl.searchParams.get('refresh') === '1';
        try {
          json(response, 200, await snapshotOnce(force));
        } catch (error) {
          json(response, 502, { error: (error as Error).message });
        }
        return;
      }

      if (path === '/api/models') {
        try {
          json(response, 200, await t3.models(await detectT3()));
        } catch (error) {
          json(response, 503, { error: `T3 Code models unavailable: ${(error as Error).message}` });
        }
        return;
      }

      if (path === '/api/hand-off' && request.method === 'POST') {
        const body = (await readBody(request)) as { map?: number; ticket?: number; copyOnly?: boolean; model?: unknown };
        await snapshotOnce(false);
        const found = find(Number(body.map), Number(body.ticket));
        if (!found) {
          json(response, 404, { error: 'No such ticket on that map.' });
          return;
        }

        const { map, ticket } = found;
        const prompt = buildPrompt({ repo, map, ticket, template });
        if (body.copyOnly === true) {
          json(response, 200, { prompt, ...(await copyOnly(prompt)) });
          return;
        }
        if (ticket.state === 'done' || ticket.state === 'blocked') {
          json(response, 409, { error: `#${String(ticket.number)} is ${ticket.state}, so there is nothing to start.` });
          return;
        }

        const result = await handOff(
          {
            title: `#${String(ticket.number)} ${ticket.title}`,
            workspaceRoot,
            branch: ticketBranch(ticket),
            model: parseModelChoice(body.model),
            prompt: (worktree) => buildPrompt({ repo, map, ticket, template, ...(worktree ? { worktree } : {}) }),
          },
          t3.steps(await detectT3()),
        );
        json(response, 200, result);
        return;
      }

      json(response, 404, { error: `No route for ${path}` });
      return;
    }

    const file = path === '/' ? 'index.html' : path === '/prototype' ? 'prototype.html' : path.replace(/^\/+/, '');
    if (file.includes('..')) {
      json(response, 400, { error: 'Bad path' });
      return;
    }

    try {
      const bytes = await readFile(join(UI_DIR, file));
      const extension = file.slice(file.lastIndexOf('.'));
      response.writeHead(200, {
        'content-type': MIME[extension] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      response.end(bytes);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, resolve);
  });

  return { server, url };
}

type MapTicket = WayfinderMap['tickets'][number];

async function copyOnly(prompt: string): Promise<{ copied: boolean; error: string | null }> {
  try {
    await copyToClipboard(prompt);
    return { copied: true, error: null };
  } catch (error) {
    return { copied: false, error: (error as Error).message };
  }
}

export { DEFAULT_TEMPLATE };
