import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseModelChoice } from './models.js';
import { copyToClipboard } from './clipboard.js';
import { DEFAULT_TEMPLATE, buildPrompt, ticketBranch } from './prompt.js';
import { parsePrototypeFilePath } from './prototypes.js';
import { detectT3, handOff } from './t3.js';
import type { T3HandOff } from './t3.js';
import type { Config } from './config.js';
import type { MapSnapshot, Prototype, WayfinderMap } from './types.js';
import { loadHomeState, readAccount } from './home.js';
import type { HomeState } from './home.js';
import { fetchBranchFile, fetchPrototypes, gh } from './github.js';
import { AuthFlow } from './authFlow.js';
import { parseRepoPagePath } from './repoRoutes.js';
import type { ScopedApiAction } from './repoRoutes.js';
import { RepositoryStore } from './repositoryStore.js';
import type { RepositoryFetcher } from './repositoryStore.js';

const here = dirname(fileURLToPath(import.meta.url));
const UI_DIR = join(here, 'ui');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.htm': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** How long a map's prototype list is reused before GitHub is asked again. */
const PROTOTYPE_TTL_MS = 60_000;

/**
 * Prototype files are repo code, so they run sandboxed: an opaque origin cannot read
 * this server's API or drive a hand-off, since its requests carry `Origin: null`.
 */
const PROTOTYPE_CSP = 'sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads';

export type ServerT3 = Pick<T3HandOff, 'models' | 'steps'> & { close?: () => void };

export interface ServeOptions {
  config: Config;
  repo: string | null;
  template: string;
  /** The checkout T3 Code threads run in, or null when the launch directory is not one. */
  workspaceRoot: string | null;
  t3: ServerT3;
  fetcher?: RepositoryFetcher;
  homeLoader?: (labels: readonly string[]) => Promise<HomeState>;
  onShutdown?: () => void;
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

/** A Host header naming this machine, so a rebound DNS name cannot read repo files through the page. */
function hostAllowed(request: IncomingMessage): boolean {
  try {
    return LOOPBACK.has(new URL(`http://${request.headers.host ?? ''}`).hostname);
  } catch {
    return false;
  }
}

function extensionOf(file: string): string {
  const dot = file.lastIndexOf('.');
  return dot === -1 ? '' : file.slice(dot).toLowerCase();
}

export async function startServer({
  config,
  repo,
  template,
  workspaceRoot,
  t3,
  fetcher,
  homeLoader,
  onShutdown,
}: ServeOptions): Promise<RunningServer> {
  const repositories = new RepositoryStore({
    mapLabel: config.mapLabel,
    typePrefix: config.typePrefix,
    ...(fetcher === undefined ? {} : { fetcher }),
  });
  const loadHome = homeLoader ?? ((labels: readonly string[]) => loadHomeState(labels));
  let homeState: HomeState | null = null;
  const authFlow = new AuthFlow();

  /** One entry per repository and map, since every prototype list costs GitHub calls. */
  const prototypeCache = new Map<string, { at: number; list: Promise<Prototype[]> }>();

  const prototypesOf = async (forRepo: string, mapNumber: number, force: boolean): Promise<Prototype[] | null> => {
    const map = (await repositories.snapshot(forRepo, false)).maps.find((candidate) => candidate.number === mapNumber);
    if (map === undefined) return null;
    const key = `${forRepo}#${String(mapNumber)}`;
    const cached = prototypeCache.get(key);
    if (!force && cached !== undefined && Date.now() - cached.at < PROTOTYPE_TTL_MS) return cached.list;
    const list = fetchPrototypes(forRepo, map);
    prototypeCache.set(key, { at: Date.now(), list });
    list.catch(() => prototypeCache.delete(key));
    return list;
  };

  const find = (snapshot: MapSnapshot, mapNumber: number, ticketNumber: number): { map: WayfinderMap; ticket: MapTicket } | null => {
    const map = snapshot.maps.find((candidate) => candidate.number === mapNumber);
    const ticket = map?.tickets.find((candidate) => candidate.number === ticketNumber);
    return map && ticket ? { map, ticket } : null;
  };

  let port = config.port;
  let url = `http://${config.host}:${String(port)}`;

  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      json(response, 500, { error: (error as Error).message });
    });
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const requestUrl = new URL(request.url ?? '/', url);
    const path = requestUrl.pathname;

    if (path.startsWith('/api/')) {
      if (!originAllowed(request, port)) {
        json(response, 403, { error: 'Cross-origin requests are not accepted.' });
        return;
      }

      if (path === '/api/snapshot') {
        if (repo === null) {
          json(response, 404, { error: 'Choose a repository from Home first.' });
          return;
        }
        const force = requestUrl.searchParams.get('refresh') === '1';
        try {
          json(response, 200, await repositories.snapshot(repo, force));
        } catch (error) {
          json(response, 502, { error: (error as Error).message });
        }
        return;
      }

      if (path === '/api/home') {
        const force = requestUrl.searchParams.get('refresh') === '1';
        if (force || homeState === null) {
          const labels = config.mapLabel === 'wayfinder:map' ? [config.mapLabel] : ['wayfinder:map', config.mapLabel];
          homeState = await loadHome(labels);
        }
        json(response, 200, homeState);
        return;
      }

      if (path === '/api/auth/status') {
        const account = await readAccount();
        if (account.status === 'ready') homeState = null;
        json(response, 200, account);
        return;
      }

      if (path === '/api/auth/flow') {
        json(response, 200, authFlow.snapshot());
        return;
      }

      if (path === '/api/auth/login' && request.method === 'POST') {
        json(response, 202, authFlow.start(['auth', 'login', '--web', '--hostname', 'github.com', '--git-protocol', 'https', '--skip-ssh-key']));
        return;
      }

      if (path === '/api/auth/refresh' && request.method === 'POST') {
        const account = await readAccount();
        if (account.login === null || account.missingScopes.length === 0) {
          json(response, 409, { error: 'There are no missing scopes to grant.' });
          return;
        }
        json(response, 202, authFlow.start(['auth', 'refresh', '-h', account.host, '-s', account.missingScopes.join(',')]));
        return;
      }

      if (path === '/api/auth/switch' && request.method === 'POST') {
        const body = (await readBody(request)) as { login?: unknown };
        const login = typeof body.login === 'string' ? body.login : '';
        const account = await readAccount();
        if (!account.accounts.includes(login)) {
          json(response, 400, { error: 'That account is not available in GitHub CLI.' });
          return;
        }
        await gh(['auth', 'switch', '-h', account.host, '-u', login]);
        homeState = null;
        repositories.clear();
        json(response, 200, await readAccount());
        return;
      }

      if (path === '/api/shutdown' && request.method === 'POST') {
        json(response, 200, { stopped: true });
        authFlow.cancel();
        t3.close?.();
        setImmediate(() => (onShutdown === undefined ? server.close() : onShutdown()));
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

      const scoped = parseScopedApiPath(path);
      const requestedRepo = scoped?.repo ?? (path === '/api/hand-off' || path === '/api/prototypes' ? repo : null);

      if (requestedRepo !== null && (scoped?.action === 'prototypes' || path === '/api/prototypes')) {
        try {
          const list = await prototypesOf(requestedRepo, Number(requestUrl.searchParams.get('map')), requestUrl.searchParams.get('refresh') === '1');
          if (list === null) json(response, 404, { error: 'No such map.' });
          else json(response, 200, list);
        } catch (error) {
          json(response, 502, { error: (error as Error).message });
        }
        return;
      }

      if (requestedRepo !== null && (scoped?.action === 'snapshot' || path === '/api/snapshot')) {
        const force = requestUrl.searchParams.get('refresh') === '1';
        try {
          json(response, 200, await repositories.snapshot(requestedRepo, force));
        } catch (error) {
          json(response, 502, { error: (error as Error).message });
        }
        return;
      }

      if (requestedRepo !== null && (scoped?.action === 'hand-off' || path === '/api/hand-off') && request.method === 'POST') {
        const body = (await readBody(request)) as { map?: number; ticket?: number; copyOnly?: boolean; model?: unknown };
        const snapshot = await repositories.snapshot(requestedRepo, false);
        const found = find(snapshot, Number(body.map), Number(body.ticket));
        if (!found) {
          json(response, 404, { error: 'No such ticket on that map.' });
          return;
        }

        const { map, ticket } = found;
        const prompt = buildPrompt({ repo: requestedRepo, map, ticket, template });
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
            workspaceRoot: requestedRepo === repo ? workspaceRoot : null,
            branch: ticketBranch(ticket),
            model: parseModelChoice(body.model),
            prompt: (worktree) => buildPrompt({ repo: requestedRepo, map, ticket, template, ...(worktree ? { worktree } : {}) }),
          },
          t3.steps(await detectT3()),
        );
        json(response, 200, result);
        return;
      }

      json(response, 404, { error: `No route for ${path}` });
      return;
    }

    const prototypeFile = parsePrototypeFilePath(path);
    if (prototypeFile !== null) {
      if (!hostAllowed(request)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }
      try {
        const bytes = await fetchBranchFile(prototypeFile.repo, prototypeFile.branch, prototypeFile.file);
        response.writeHead(200, {
          'content-type': MIME[extensionOf(prototypeFile.file)] ?? 'application/octet-stream',
          'content-security-policy': PROTOTYPE_CSP,
          'x-content-type-options': 'nosniff',
          'cache-control': 'no-store',
        });
        response.end(bytes);
      } catch (error) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end(`Not on ${prototypeFile.branch}: ${prototypeFile.file}

${(error as Error).message}`);
      }
      return;
    }

    const pageRoute = parseRepoPagePath(path);
    const file =
      path === '/' || path === '/new-map' || pageRoute?.mapNumber === null
        ? 'home.html'
        : pageRoute !== null
          ? 'index.html'
          : path.replace(/^\/+/, '');
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
        'content-security-policy':
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'self'",
      });
      response.end(bytes);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  }

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once('error', onError);
    server.listen(config.port, config.host, () => {
      server.off('error', onError);
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('Wayfinder server did not report a TCP port');
  }
  port = address.port;
  url = `http://${config.host}:${String(port)}`;
  server.once('close', () => authFlow.cancel());

  return { server, url };
}

function parseScopedApiPath(path: string): { repo: string; action: ScopedApiAction } | null {
  const match = /^\/api(\/repos\/[^/]+\/[^/]+)\/(snapshot|hand-off|prototypes)$/.exec(path);
  if (match?.[1] === undefined || match[2] === undefined) return null;
  const route = parseRepoPagePath(match[1]);
  if (route === null || route.mapNumber !== null) return null;
  return { repo: route.repo, action: match[2] as ScopedApiAction };
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
