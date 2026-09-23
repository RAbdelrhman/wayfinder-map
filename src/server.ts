import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseModelChoice } from './models.js';
import { copyToClipboard } from './clipboard.js';
import { DEFAULT_TEMPLATE, buildNewMapPrompt, buildPrompt, ticketBranch } from './prompt.js';
import { parsePrototypeFilePath } from './prototypes.js';
import { detectT3, handOff } from './t3.js';
import type { T3HandOff } from './t3.js';
import type { Config } from './config.js';
import type { MapSnapshot, Prototype, Ticket, WayfinderMap } from './types.js';
import { listRepositories, loadHomeState, readAccount } from './home.js';
import type { HomeState } from './home.js';
import { fetchAllPrototypes, fetchBranchFile, fetchPrototypes, fetchTicket, gh } from './github.js';
import { AuthFlow } from './authFlow.js';
import { parseRepoPagePath } from './repoRoutes.js';
import type { ScopedApiAction } from './repoRoutes.js';
import { RepositoryStore } from './repositoryStore.js';
import type { RepositoryFetcher } from './repositoryStore.js';
import { WorkspaceResolver, clonesFile, fileStore, verifyCheckout } from './workspaces.js';
import type { WorkspaceState } from './workspaces.js';
import { WAYFINDER_VERSION } from './version.js';
import { resolveRepoIcon, type ResolvedRepoIcon } from './repoIcon.js';
import { ProgressError, ProgressService, ProgressSettingsStore, readCompletedTickets } from './progress.js';
import { HandOffStore, HandOffTracker, handOffStorePath } from './handOffTracking.js';
import type { HandOffTrackingClient } from './handOffTracking.js';

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

/**
 * The app's own pages. Frames are allowed from this origin only, which is where the
 * prototype gallery's live previews come from; each of those is still sandboxed twice,
 * by PROTOTYPE_CSP on the response and by the iframe's own `sandbox` attribute.
 */
export const PAGE_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://github.com https://avatars.githubusercontent.com; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'self'; form-action 'self'";

export type ServerT3 =
  Pick<T3HandOff, 'models' | 'steps' | 'projects'> &
  Partial<Pick<T3HandOff, 'focus'>> &
  Partial<Pick<T3HandOff, 'readHandOffSnapshot' | 'subscribeShell'>> & { close?: () => void };

export interface ServeOptions {
  config: Config;
  repo: string | null;
  template: string;
  /** The checkout T3 Code threads run in, or null when the launch directory is not one. */
  workspaceRoot: string | null;
  t3: ServerT3;
  /**
   * Ask the user for a folder, for the repositories no verified clone was found for.
   * Only the desktop shell can raise a native picker, so the CLI leaves this out.
   */
  chooseDirectory?: () => Promise<string | null>;
  /** Replaces the clone lookup in tests, which must not touch T3 Code or the home directory. */
  workspaces?: WorkspaceResolver;
  fetcher?: RepositoryFetcher;
  homeLoader?: (labels: readonly string[]) => Promise<HomeState>;
  /** Every repository the account can open, for Home's picker. */
  repoLister?: () => Promise<string[]>;
  onShutdown?: () => void;
  /**
   * Where the page's files live. Every entry point names it: the packaged app and the
   * ESM CLI resolve it differently, and deriving it here would tie the server to one of them.
   */
  uiDir?: string;
  updater?: UpdaterService;
  /** Replaces Home's progress panel data in tests, which must not touch gh or the home directory. */
  progress?: Pick<ProgressService, 'state' | 'save'>;
  /** Lets tests use an isolated in-memory store instead of the user's home directory. */
  handOffStore?: HandOffStore;
}

export interface UpdaterStatus {
  status: 'up-to-date' | 'available' | 'downloading' | 'ready' | 'dev' | 'disabled' | 'error';
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  error?: string;
}

export interface UpdaterService {
  check: () => Promise<UpdaterStatus>;
  install?: () => Promise<void>;
  status?: () => UpdaterStatus;
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
  chooseDirectory,
  workspaces,
  fetcher,
  homeLoader,
  repoLister = listRepositories,
  onShutdown,
  uiDir = join(process.cwd(), 'src', 'ui'),
  updater,
  progress,
  handOffStore,
}: ServeOptions): Promise<RunningServer> {
  const defaultUpdater: UpdaterService = {
    async check(): Promise<UpdaterStatus> {
      const currentVersion = WAYFINDER_VERSION;
      if (currentVersion === '0.0.0-dev' || currentVersion.includes('-dev')) {
        return { status: 'dev', currentVersion };
      }
      try {
        const res = await fetch('https://api.github.com/repos/RAbdelrhman/wayfinder-map/releases/latest', {
          headers: { 'User-Agent': 'Wayfinder' },
        });
        if (res.status === 404) {
          return { status: 'up-to-date', currentVersion, releaseUrl: 'https://github.com/RAbdelrhman/wayfinder-map/releases' };
        }
        if (!res.ok) {
          return { status: 'error', currentVersion, error: `GitHub API returned ${String(res.status)}` };
        }
        const data = (await res.json()) as { tag_name?: string; html_url?: string };
        const latestTag = data.tag_name ? data.tag_name.replace(/^v/, '') : currentVersion;
        const releaseUrl = data.html_url ?? 'https://github.com/RAbdelrhman/wayfinder-map/releases';
        if (latestTag !== currentVersion) {
          return { status: 'available', currentVersion, latestVersion: latestTag, releaseUrl };
        }
        return { status: 'up-to-date', currentVersion, latestVersion: latestTag, releaseUrl };
      } catch (error) {
        return { status: 'error', currentVersion, error: error instanceof Error ? error.message : String(error) };
      }
    },
    status(): UpdaterStatus {
      return {
        status: WAYFINDER_VERSION === '0.0.0-dev' || WAYFINDER_VERSION.includes('-dev') ? 'dev' : 'up-to-date',
        currentVersion: WAYFINDER_VERSION,
      };
    },
  };
  const repositories = new RepositoryStore({
    mapLabel: config.mapLabel,
    typePrefix: config.typePrefix,
    ...(fetcher === undefined ? {} : { fetcher }),
  });
  const loadHome = homeLoader ?? ((labels: readonly string[]) => loadHomeState(labels));
  let homeState: HomeState | null = null;
  const repoIcons = new Map<string, Promise<ResolvedRepoIcon | null>>();
  let repoList: Promise<string[]> | null = null;
  const authFlow = new AuthFlow();
  const progressPanel =
    progress ??
    new ProgressService({
      login: async () => {
        const account = homeState?.account ?? (await readAccount());
        return account.status === 'ready' ? account.login : null;
      },
      store: new ProgressSettingsStore(),
      completed: (login, since) => readCompletedTickets(login, { typePrefix: config.typePrefix, mapLabel: config.mapLabel, since }),
    });
  const trackingClient: HandOffTrackingClient | null =
    t3.readHandOffSnapshot === undefined
      ? null
      : {
          readHandOffSnapshot: () => t3.readHandOffSnapshot?.() ?? Promise.reject(new Error('T3 Code tracking is unavailable.')),
          ...(t3.subscribeShell === undefined
            ? {}
            : {
                subscribeShell: (sequence, onValue, onClose) =>
                  t3.subscribeShell?.(sequence, onValue, onClose) ?? Promise.reject(new Error('T3 Code tracking is unavailable.')),
              }),
        };
  const handOffTracker = new HandOffTracker(
    handOffStore ?? new HandOffStore({ filePath: handOffStorePath() }),
    trackingClient,
  );

  /** One entry per repository and map, since every prototype list costs GitHub calls. */
  const prototypeCache = new Map<string, { at: number; list: Promise<Prototype[]> }>();

  const clones =
    workspaces ??
    new WorkspaceResolver(
      {
        knownProjects: async () => t3.projects(await detectT3()),
        verify: verifyCheckout,
        ...fileStore(clonesFile()),
      },
      { repo, root: workspaceRoot },
    );

  /** The clone state plus whether this entry point can raise a folder picker. */
  const workspaceView = async (forRepo: string): Promise<WorkspaceState & { canChoose: boolean }> => ({
    ...(await clones.state(forRepo)),
    canChoose: chooseDirectory !== undefined,
  });

  /** `mapNumber` null asks for the whole repository, which the repository page wants in one read. */
  const prototypesOf = async (forRepo: string, mapNumber: number | null, force: boolean): Promise<Prototype[] | null> => {
    const snapshot = await repositories.snapshot(forRepo, false);
    const map = mapNumber === null ? null : snapshot.maps.find((candidate) => candidate.number === mapNumber);
    if (mapNumber !== null && map === undefined) return null;
    const key = `${forRepo}#${mapNumber === null ? 'all' : String(mapNumber)}`;
    const cached = prototypeCache.get(key);
    if (!force && cached !== undefined && Date.now() - cached.at < PROTOTYPE_TTL_MS) return cached.list;
    const list = map === null || map === undefined ? fetchAllPrototypes(forRepo, snapshot.maps) : fetchPrototypes(forRepo, map);
    prototypeCache.set(key, { at: Date.now(), list });
    list.catch(() => prototypeCache.delete(key));
    return list;
  };

  const find = (snapshot: MapSnapshot, mapNumber: number, ticketNumber: number): { map: WayfinderMap; ticket: MapTicket } | null => {
    const map = snapshot.maps.find((candidate) => candidate.number === mapNumber);
    // An issue off the map that one of its tickets links to opens and hands off like a ticket too.
    const ticket = map?.tickets.find((candidate) => candidate.number === ticketNumber) ?? map?.outside.find((candidate) => candidate.number === ticketNumber);
    return map && ticket ? { map, ticket } : null;
  };

  let port = config.port;
  let url = `http://${config.host}:${String(port)}`;

  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      json(response, 500, { error: (error as Error).message });
    });
  });
  server.on('close', () => handOffTracker.close());

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

      if (path === '/api/hand-offs' && request.method === 'GET') {
        json(response, 200, await handOffTracker.snapshot());
        return;
      }

      if (path === '/api/hand-offs/focus' && request.method === 'POST') {
        const body = (await readBody(request)) as { id?: unknown };
        const id = typeof body.id === 'string' ? body.id : '';
        const status = await handOffTracker.snapshot();
        const handOff = status.handOffs.find((item) => item.id === id);
        if (handOff === undefined) {
          json(response, 404, { error: 'No such hand-off.' });
          return;
        }
        if (handOff.threadId === null || t3.focus === undefined) {
          json(response, 409, { error: 'This hand-off has no T3 Code thread to open.' });
          return;
        }
        try {
          await t3.focus();
          json(response, 200, { opened: true });
        } catch (error) {
          json(response, 503, { error: (error as Error).message });
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

      if (path === '/api/progress') {
        json(response, 200, await progressPanel.state());
        return;
      }

      if (path === '/api/progress/settings' && request.method === 'POST') {
        try {
          json(response, 200, await progressPanel.save(await readBody(request)));
        } catch (error) {
          json(response, error instanceof ProgressError ? error.status : 400, { error: (error as Error).message });
        }
        return;
      }

      if (path === '/api/repositories') {
        if (requestUrl.searchParams.get('refresh') === '1' || repoList === null) {
          const list = repoLister();
          repoList = list;
          list.catch(() => {
            if (repoList === list) repoList = null;
          });
        }
        try {
          json(response, 200, await repoList);
        } catch (error) {
          json(response, 502, { error: (error as Error).message });
        }
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
        repoList = null;
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

      if (path === '/api/updater') {
        const service = updater ?? defaultUpdater;
        json(response, 200, service.status ? service.status() : await service.check());
        return;
      }

      if (path === '/api/updater/check' && request.method === 'POST') {
        const service = updater ?? defaultUpdater;
        try {
          const status = await service.check();
          json(response, 200, status);
        } catch (error) {
          json(response, 500, { status: 'error', currentVersion: WAYFINDER_VERSION, error: (error as Error).message });
        }
        return;
      }

      if (path === '/api/updater/install' && request.method === 'POST') {
        const service = updater ?? defaultUpdater;
        if (!service.install) {
          json(response, 400, { error: 'Direct installation is only available in the desktop application.' });
          return;
        }
        json(response, 200, { installing: true });
        void service.install();
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
      const requestedRepo = scoped?.repo ?? (path === '/api/hand-off' || path === '/api/prototypes' || path === '/api/ticket' ? repo : null);

      if (requestedRepo !== null && (scoped?.action === 'ticket' || path === '/api/ticket')) {
        const ticketParam = requestUrl.searchParams.get('number') ?? requestUrl.searchParams.get('ticket');
        if (!ticketParam || Number.isNaN(Number(ticketParam))) {
          json(response, 400, { error: 'Missing or invalid ticket number parameter.' });
          return;
        }
        const ticketNumber = Number(ticketParam);
        try {
          const snapshot = await repositories.snapshot(requestedRepo, false);
          let foundMap: WayfinderMap | null = null;
          let foundTicket: Ticket | null = null;
          for (const candidateMap of snapshot.maps) {
            const candidate = candidateMap.tickets.find((t) => t.number === ticketNumber);
            if (candidate) {
              foundMap = candidateMap;
              foundTicket = candidate;
              break;
            }
          }
          if (!foundTicket) {
            foundTicket = await fetchTicket(requestedRepo, ticketNumber, config.typePrefix);
          }
          if (!foundTicket) {
            json(response, 404, { error: `Ticket #${String(ticketNumber)} not found in ${requestedRepo}.` });
            return;
          }
          json(response, 200, {
            ticket: foundTicket,
            map: foundMap ? { number: foundMap.number, title: foundMap.title } : null,
          });
        } catch (error) {
          json(response, 502, { error: (error as Error).message });
        }
        return;
      }

      if (requestedRepo !== null && (scoped?.action === 'prototypes' || path === '/api/prototypes')) {
        try {
          const asked = requestUrl.searchParams.get('map');
          const list = await prototypesOf(requestedRepo, asked === null ? null : Number(asked), requestUrl.searchParams.get('refresh') === '1');
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

      if (requestedRepo !== null && scoped?.action === 'workspace') {
        if (request.method === 'GET') {
          json(response, 200, await workspaceView(requestedRepo));
          return;
        }
        if (request.method === 'POST') {
          const body = (await readBody(request)) as { path?: unknown; choose?: unknown };
          let picked = typeof body.path === 'string' && body.path.trim().length > 0 ? body.path.trim() : null;
          if (picked === null && body.choose === true) {
            if (chooseDirectory === undefined) {
              json(response, 409, { error: 'This window cannot open a folder picker.', ...(await workspaceView(requestedRepo)) });
              return;
            }
            picked = await chooseDirectory();
            if (picked === null) {
              json(response, 200, { cancelled: true, ...(await workspaceView(requestedRepo)) });
              return;
            }
          }
          if (picked === null) {
            json(response, 400, { error: 'No folder was given.' });
            return;
          }
          try {
            await clones.choose(requestedRepo, picked);
          } catch (error) {
            json(response, 400, { error: (error as Error).message, ...(await workspaceView(requestedRepo)) });
            return;
          }
          json(response, 200, await workspaceView(requestedRepo));
          return;
        }
      }

      if (requestedRepo !== null && scoped?.action === 'icon') {
        try {
          let pending = repoIcons.get(requestedRepo);
          if (pending === undefined) {
            pending = resolveRepoIcon(requestedRepo);
            repoIcons.set(requestedRepo, pending);
          }
          const icon = await pending;
          if (icon === null) {
            json(response, 404, { error: 'No repository icon found.' });
            return;
          }
          response.writeHead(200, {
            'content-type': icon.contentType,
            'content-length': icon.data.length,
            'cache-control': 'no-cache',
          });
          response.end(icon.data);
          return;
        } catch (error) {
          json(response, 502, { error: (error as Error).message });
          return;
        }
      }

      if (requestedRepo !== null && scoped?.action === 'new-map' && request.method === 'POST') {
        const body = (await readBody(request)) as { goal?: unknown; preview?: unknown; copyOnly?: unknown; model?: unknown };
        const goal = typeof body.goal === 'string' ? body.goal.trim() : '';
        if (goal.length === 0) {
          json(response, 400, { error: 'Say what you want to accomplish first.' });
          return;
        }
        const prompt = buildNewMapPrompt({ repo: requestedRepo, goal, mapLabel: config.mapLabel, typePrefix: config.typePrefix });
        if (body.preview === true) {
          json(response, 200, { prompt });
          return;
        }
        if (body.copyOnly === true) {
          json(response, 200, { prompt, ...(await copyOnly(prompt)) });
          return;
        }
        // Planning a map runs in the repository's clone, so starting one needs a verified checkout (#6).
        const workspaceRoot = await clones.resolve(requestedRepo);
        if (workspaceRoot === null) {
          json(response, 409, { error: `Choose a local clone of ${requestedRepo} before starting in T3 Code.`, prompt });
          return;
        }
        const runtime = await detectT3();
        const result = await handOff(
          {
            title: `New map: ${goal.replace(/\s+/g, ' ').slice(0, 48)}`,
            workspaceRoot,
            branch: 'wayfinder/new-map',
            model: parseModelChoice(body.model),
            prompt: () => prompt,
          },
          t3.steps(runtime),
        );
        const { tracking, ...publicResult } = result;
        try {
          const saved = await handOffTracker.record({
            repo: requestedRepo,
            mapNumber: null,
            ticketNumber: null,
            title: goal,
            environmentId: tracking?.environmentId ?? null,
            t3Origin: runtime.origin,
            projectId: tracking?.projectId ?? null,
            branch: tracking?.branch ?? null,
            worktreePath: tracking?.worktreePath ?? null,
            threadId: result.threadId,
            requestedBranch: 'wayfinder/new-map',
            rung: result.rung,
          });
          json(response, 200, { ...publicResult, handOffId: saved.id });
        } catch (error) {
          json(response, 200, {
            ...publicResult,
            handOffId: null,
            trackingWarning: `The hand-off started, but Wayfinder could not save its tracking record: ${(error as Error).message}`,
          });
        }
        return;
      }

      if (requestedRepo !== null && (scoped?.action === 'hand-off' || path === '/api/hand-off') && request.method === 'POST') {
        const body = (await readBody(request)) as {
          map?: number;
          ticket?: number;
          copyOnly?: boolean;
          model?: unknown;
        };

        const snapshot = await repositories.snapshot(requestedRepo, false);
        let map: WayfinderMap | null = null;
        let ticket: Ticket | null = null;

        if (body.map !== undefined && body.map !== null && !Number.isNaN(Number(body.map)) && body.ticket !== undefined) {
          const found = find(snapshot, Number(body.map), Number(body.ticket));
          if (found) {
            map = found.map;
            ticket = found.ticket;
          }
        }

        if (!ticket && body.ticket !== undefined && !Number.isNaN(Number(body.ticket))) {
          const ticketNumber = Number(body.ticket);
          for (const candidateMap of snapshot.maps) {
            const candidate = candidateMap.tickets.find((t) => t.number === ticketNumber);
            if (candidate) {
              map = candidateMap;
              ticket = candidate;
              break;
            }
          }
          if (!ticket) {
            ticket = await fetchTicket(requestedRepo, ticketNumber, config.typePrefix);
          }
        }

        if (!ticket) {
          json(response, 404, { error: 'No such ticket.' });
          return;
        }

        const prompt = buildPrompt({ repo: requestedRepo, map, ticket, template: map ? template : undefined });
        if (body.copyOnly === true) {
          json(response, 200, { prompt, ...(await copyOnly(prompt)) });
          return;
        }
        if (ticket.state === 'done' || ticket.state === 'blocked') {
          json(response, 409, { error: `#${String(ticket.number)} is ${ticket.state}, so there is nothing to start.` });
          return;
        }

        const runtime = await detectT3();
        const requestedBranch = ticketBranch(ticket);
        const result = await handOff(
          {
            title: `#${String(ticket.number)} ${ticket.title}`,
            workspaceRoot: await clones.resolve(requestedRepo),
            branch: requestedBranch,
            model: parseModelChoice(body.model),
            prompt: (worktree) =>
              buildPrompt({
                repo: requestedRepo,
                map,
                ticket,
                template: map ? template : undefined,
                ...(worktree ? { worktree } : {}),
              }),
          },
          t3.steps(runtime),
        );
        const { tracking, ...publicResult } = result;
        try {
          const saved = await handOffTracker.record({
            repo: requestedRepo,
            mapNumber: map?.number ?? null,
            ticketNumber: ticket.number,
            title: ticket.title,
            environmentId: tracking?.environmentId ?? null,
            t3Origin: runtime.origin,
            projectId: tracking?.projectId ?? null,
            branch: tracking?.branch ?? null,
            worktreePath: tracking?.worktreePath ?? null,
            threadId: result.threadId,
            requestedBranch,
            rung: result.rung,
          });
          json(response, 200, { ...publicResult, handOffId: saved.id });
        } catch (error) {
          json(response, 200, {
            ...publicResult,
            handOffId: null,
            trackingWarning: `The hand-off started, but Wayfinder could not save its tracking record: ${(error as Error).message}`,
          });
        }
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
        response.end(`Not on ${prototypeFile.branch}: ${prototypeFile.file}\n\n${(error as Error).message}`);
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
      const bytes = await readFile(join(uiDir, file));
      const extension = file.slice(file.lastIndexOf('.'));
      response.writeHead(200, {
        'content-type': MIME[extension] ?? 'application/octet-stream',
        'cache-control': 'no-store',
        'content-security-policy': PAGE_CSP,
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
  const match = /^\/api(\/repos\/[^/]+\/[^/]+)\/(snapshot|hand-off|new-map|prototypes|ticket|workspace|icon)$/.exec(path);
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
