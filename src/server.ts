import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { buildAutoDecision, MODEL_CHANGE_REASONS } from './autoDecision.js';
import { AutoMapService, parseAutoMapChange } from './autoMapService.js';
import { AutoMapFileStore, memoryAutoMapStore } from './autoMapStore.js';
import type { AutoMapStateStore } from './autoMapStore.js';
import { combineUsage, UsageReadings } from './providerUsage.js';
import type { CodexLimitsReader } from './providerUsage.js';
import { rateWithModel } from './autoRater.js';
import type { CliRun } from './autoRater.js';
import type { AutoDecision } from './autoDecision.js';
import { parseModelChoice, TIERS } from './models.js';
import type { ModelChoice, Tier } from './models.js';
import { copyToClipboard } from './clipboard.js';
import { DEFAULT_TEMPLATE, buildNewMapPrompt, buildPrompt, ticketBranch } from './prompt.js';
import { PROTOTYPE_SHOTS_DIR, parsePrototypeFilePath, parsePrototypeShotPath } from './prototypes.js';
import { detectT3, handOff } from './t3.js';
import type { T3HandOff, T3Runtime } from './t3.js';
import type { Config } from './config.js';
import type { MapSnapshot, Prototype, Ticket, WayfinderMap } from './types.js';
import { markPullRequests } from './mapWatch.js';
import type { MapEvent } from './mapWatch.js';
import { listRepositories, loadHomeState, readAccount } from './home.js';
import type { HomeState } from './home.js';
import { fetchAllPrototypes, fetchBranchFile, fetchDefaultBranchFile, fetchPrototypes, fetchTicket, fetchTicketWithParent, gh } from './github.js';
import { AuthFlow } from './authFlow.js';
import { normalizeRepo, parseRepoPagePath } from './repoRoutes.js';
import type { ScopedApiAction } from './repoRoutes.js';
import { RepositoryStore } from './repositoryStore.js';
import type { RepositoryChangeChecker, RepositoryFetcher } from './repositoryStore.js';
import { WorkspaceResolver, clonesFile, fileStore, verifyCheckout } from './workspaces.js';
import type { WorkspaceState } from './workspaces.js';
import { cloneRepository as cloneRepo, RepositoryCloneError } from './clone.js';
import { WAYFINDER_VERSION } from './version.js';
import { resolveRepoIcon, type ResolvedRepoIcon } from './repoIcon.js';
import { HandOffStore, HandOffTracker, handOffStorePath } from './handOffTracking.js';
import type { HandOffTrackingClient } from './handOffTracking.js';
import { githubMapWatchReader, MapWatcher } from './mapWatcher.js';
import type { MapWatchStateStore } from './mapWatchStore.js';
import { markStalls, memoryStallSettings, StallSettingsStore } from './stalled.js';
import type { StallSettingsSource } from './stalled.js';
import { ProgressError, ProgressService, ProgressSettingsStore, readCompletedTickets } from './progress.js';
import { normalizeCap } from './startNext.js';
import type { Repick } from './autoRepick.js';
import { StartNextRunner } from './startNextRunner.js';
import type { BatchRequestItem } from './startNextRunner.js';
import { SettleStore } from './settling.js';
import { FollowStore } from './follows.js';
import type { Viewer } from './visibility.js';
import { memoryNotificationSettings, NotificationSettingsStore, parseDesktopNotification } from './notifications.js';
import type { DesktopNotification, NotificationSettingsSource } from './notifications.js';

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
  Partial<Pick<T3HandOff, 'readHandOffSnapshot' | 'subscribeShell'>> & {
    close?: () => void;
    /** Finds the running T3 Code. Tests pass a fixed one so they never read this machine's T3 Code. */
    detect?: () => Promise<T3Runtime>;
  };

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
  chooseDirectory?: (purpose: 'workspace' | 'clone') => Promise<string | null>;
  /** Clone runner override for server tests. The selected destination is never cached as a default. */
  cloneRepository?: (repo: string, destination: string) => Promise<string>;
  /** Replaces the clone lookup in tests, which must not touch T3 Code or the home directory. */
  workspaces?: WorkspaceResolver;
  fetcher?: RepositoryFetcher;
  changeChecker?: RepositoryChangeChecker;
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
  /** Lets tests use an isolated in-memory store instead of the user's home directory. */
  handOffStore?: HandOffStore;
  /** Replaces Home's progress panel data in tests, which must not touch gh or the home directory. */
  progress?: Pick<ProgressService, 'state' | 'save'>;
  /** Replaces the GitHub map watcher in tests. */
  mapWatcher?: MapWatcher;
  /** Persists opened-map snapshots and events in the local app's state directory. */
  mapWatchStore?: MapWatchStateStore;
  /** Where the auto map's settings and notices live. Defaults to `~/.wayfinder-map/auto-maps.json`, except when tests inject a `fetcher`, where they stay in memory unless given. */
  autoMapStore?: AutoMapStateStore;
  /** How long the auto map waits to gather a map's tickets that became next into one batch. Tests shorten it. */
  autoMapBatchMs?: number;
  /** How often Start next looks for a free slot and a usage-limit error. Tests shorten it. */
  startNextIntervalMs?: number;
  /** Replaces the headless CLI that rates a ticket with a model (#166) in tests. */
  ratingRunner?: CliRun;
  /** Replaces the Codex app-server read of its rate limits (#184). Off when tests inject a `fetcher`, so they never start Codex. */
  codexLimits?: CodexLimitsReader;
  /**
   * Where the two stall settings live (#160). Defaults to `~/.wayfinder-map/stalls.json`, except
   * when tests inject a `fetcher`, where they stay in memory unless given.
   */
  stallSettings?: StallSettingsSource;
  /** Per-event notification choices. */
  notificationSettings?: NotificationSettingsSource;
  /** Desktop-only bridge for OS notifications and the tray badge. */
  onDesktopNotification?: (notification: DesktopNotification) => void;
  /** Clears the desktop tray badge after the inbox is opened. */
  onNotificationsRead?: () => void;
  /**
   * Whose settle choices apply and where they are kept. Defaults to the signed-in GitHub login and
   * `~/.wayfinder-map/settled.json`, except when tests inject a `fetcher`, where it is off unless given.
   */
  settling?: Settling;
  /**
   * Whose follows apply and where they are kept. Defaults to the signed-in GitHub login and
   * `~/.wayfinder-map/follows.json`, except when tests inject a `fetcher`, where it is off unless given.
   */
  following?: Following;
}

export interface Settling {
  login: () => Promise<string | null>;
  store: Pick<SettleStore, 'choices' | 'set'>;
}

export interface Following {
  login: () => Promise<string | null>;
  store: Pick<FollowStore, 'follows' | 'set'>;
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
  cloneRepository = cloneRepo,
  workspaces,
  fetcher,
  changeChecker,
  homeLoader,
  repoLister = listRepositories,
  onShutdown,
  uiDir = join(process.cwd(), 'src', 'ui'),
  updater,
  handOffStore,
  progress,
  mapWatcher: givenMapWatcher,
  mapWatchStore,
  autoMapStore,
  autoMapBatchMs,
  startNextIntervalMs,
  ratingRunner,
  codexLimits,
  stallSettings: givenStallSettings,
  notificationSettings: givenNotificationSettings,
  onDesktopNotification,
  onNotificationsRead,
  settling,
  following,
}: ServeOptions): Promise<RunningServer> {
  const detect = t3.detect ?? detectT3;
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
  const loadHome = homeLoader ?? ((labels: readonly string[]) => loadHomeState(labels));
  let homeState: HomeState | null = null;
  const signedInLogin = async (): Promise<string | null> => {
    const account = homeState?.account ?? (await readAccount());
    return account.status === 'ready' ? account.login : null;
  };
  const follow: Following | null = following ?? (fetcher === undefined ? { login: signedInLogin, store: new FollowStore() } : null);
  const viewerOf = async (forRepo: string): Promise<Viewer | null> => {
    const login = follow === null ? null : await follow.login();
    return follow === null || login === null ? null : { login, follows: await follow.store.follows(login, forRepo) };
  };
  const settle: Settling | null = settling ?? (fetcher === undefined ? { login: signedInLogin, store: new SettleStore() } : null);
  const repositories = new RepositoryStore({
    mapLabel: config.mapLabel,
    typePrefix: config.typePrefix,
    ...(fetcher === undefined ? {} : { fetcher }),
    ...(changeChecker === undefined ? {} : { changeChecker }),
    ...(settle === null
      ? {}
      : {
          choices: async (forRepo: string) => {
            const login = await settle.login();
            return login === null ? {} : settle.store.choices(login, forRepo);
          },
        }),
    // Your own maps and the public maps you follow. Tests that inject a fetcher list every map.
    ...(follow === null ? {} : { viewer: viewerOf }),
  });
  const repoIcons = new Map<string, Promise<ResolvedRepoIcon | null>>();
  let repoList: Promise<string[]> | null = null;
  const authFlow = new AuthFlow();
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
  const mapWatcher =
    givenMapWatcher ?? new MapWatcher(githubMapWatchReader, {
      trackedPullRequests: (forRepo) => handOffTracker.trackedPullRequests(forRepo),
      ...(mapWatchStore === undefined ? {} : { stateStore: mapWatchStore }),
    });
  await mapWatcher.restore();
  const reconcileMapWatches = (snapshot: MapSnapshot): void => {
    const active = new Set(snapshot.maps.filter((map) => map.open && map.settled === null).map((map) => map.number));
    mapWatcher.reconcile(snapshot.repo, active);
    autoMaps.reconcile(snapshot.repo, active);
    void mapWatcher.catchUp(snapshot.repo);
  };
  // A thread change is often a PR, CI or review change, so its map is read now rather than in two minutes.
  handOffTracker.onThreadChange((change) => mapWatcher.nudge(change.repo, change.mapNumber));
  const usageReadings = codexLimits !== undefined ? new UsageReadings(codexLimits) : fetcher === undefined ? new UsageReadings() : new UsageReadings(null);
  const stallSettings = givenStallSettings ?? (fetcher === undefined ? new StallSettingsStore() : memoryStallSettings());
  const notificationSettings =
    givenNotificationSettings ?? (fetcher === undefined ? new NotificationSettingsStore() : memoryNotificationSettings());
  /**
   * Stalls depend on the clock, hand-offs and settings, and pull requests change without the map
   * changing, so both are marked on each snapshot served rather than cached with it.
   */
  const withSignals = async (snapshot: MapSnapshot): Promise<MapSnapshot> =>
    markPullRequests(
      await markStalls(snapshot, {
        handOffs: (forRepo) => handOffTracker.repoHandOffs(forRepo),
        activity: (forRepo) => mapWatcher.activity(forRepo),
        settings: await stallSettings.get(),
        now: new Date(),
      }),
      (forRepo, tickets) => mapWatcher.ticketPullRequests(forRepo, tickets),
    );
  /** Tickets whose hand-off request is still in flight, keyed `owner/name#number`, so a double click can't start two. */
  const startingTickets = new Set<string>();
  const progressPanel =
    progress ??
    new ProgressService({
      login: signedInLogin,
      store: new ProgressSettingsStore(),
      completed: (login, since) => readCompletedTickets(login, { typePrefix: config.typePrefix, mapLabel: config.mapLabel, since }),
    });

  /** One entry per repository and map, since every prototype list costs GitHub calls. */
  const prototypeCache = new Map<string, { at: number; list: Promise<Prototype[]> }>();

  const clones =
    workspaces ??
    new WorkspaceResolver(
      {
        knownProjects: async () => t3.projects(await detect()),
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
    const snapshot = await repositories.snapshot(forRepo, false, mapNumber === null ? [] : [mapNumber]);
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

  /**
   * Start one ticket's T3 Code thread and record it. The hand-off route and Start next's batches both
   * come through here. `threadOnly` is for batches: when the thread cannot start, report that rather than
   * falling back to the clipboard, which would hold only the last of several prompts.
   */
  const startTicketHandOff = async (
    requestedRepo: string,
    map: WayfinderMap | null,
    ticket: Ticket,
    options: { model: ModelChoice | null; tier: Tier | null; auto: AutoDecision | null; threadOnly: boolean },
  ): Promise<{ status: number; body: Record<string, unknown> }> => {
    if (ticket.state === 'done' || ticket.state === 'blocked') {
      return { status: 409, body: { error: `#${String(ticket.number)} is ${ticket.state}, so there is nothing to start.` } };
    }
    const ticketKey = `${requestedRepo.toLowerCase()}#${String(ticket.number)}`;
    const alreadyRunning = `#${String(ticket.number)} already has a hand-off in T3 Code. Open that thread instead of starting another.`;
    if (startingTickets.has(ticketKey)) return { status: 409, body: { error: alreadyRunning, handOffId: null } };
    startingTickets.add(ticketKey);
    try {
      const live = await handOffTracker.liveTicketHandOff(requestedRepo, ticket.number);
      if (live !== undefined) return { status: 409, body: { error: alreadyRunning, handOffId: live.id } };
      const runtime = await detect();
      const requestedBranch = ticketBranch(ticket);
      const steps = t3.steps(runtime);
      const result = await handOff(
        {
          title: `#${String(ticket.number)} ${ticket.title}`,
          workspaceRoot: await clones.resolve(requestedRepo),
          branch: requestedBranch,
          model: options.model,
          prompt: (worktree) =>
            buildPrompt({
              repo: requestedRepo,
              map,
              ticket,
              template: map ? template : undefined,
              ...(worktree ? { worktree } : {}),
            }),
        },
        options.threadOnly
          ? {
              ...steps,
              copy: () => Promise.reject(new Error('Start next does not use the clipboard.')),
              openApp: () => Promise.reject(new Error('Start next does not open an empty thread.')),
            }
          : steps,
      );
      const { tracking, ...publicResult } = result;
      try {
        const saved = await handOffTracker.record({
          repo: requestedRepo,
          mapNumber: map?.number ?? null,
          mapTitle: map?.title ?? null,
          ticketNumber: ticket.number,
          title: ticket.title,
          ...(options.auto === null ? (options.tier === null ? {} : { tier: options.tier }) : { tier: options.auto.final.tier, auto: options.auto }),
          environmentId: tracking?.environmentId ?? null,
          t3Origin: runtime.origin,
          projectId: tracking?.projectId ?? null,
          branch: tracking?.branch ?? null,
          worktreePath: tracking?.worktreePath ?? null,
          threadId: result.threadId,
          requestedBranch,
          rung: result.rung,
        });
        return { status: 200, body: { ...publicResult, handOffId: saved.id } };
      } catch (error) {
        return {
          status: 200,
          body: {
            ...publicResult,
            handOffId: null,
            trackingWarning: `The hand-off started, but Wayfinder could not save its tracking record: ${(error as Error).message}`,
          },
        };
      }
    } finally {
      startingTickets.delete(ticketKey);
    }
  };

  const startNext = new StartNextRunner({
    ...(startNextIntervalMs === undefined ? {} : { intervalMs: startNextIntervalMs }),
    running: () => handOffTracker.liveCount(),
    lastErrors: (ids) => handOffTracker.lastErrors(ids),
    repick: (item): Promise<Repick> => autoMaps.repick(item),
    onUsageStop: (batch) => {
      if (batch.auto) void autoMaps.usageStopped(batch).catch(() => undefined);
    },
    startTicket: async ({ repo: batchRepo, mapNumber, item }) => {
      const found = find(await repositories.snapshot(batchRepo, false, [mapNumber]), mapNumber, item.ticketNumber);
      if (found === null) return { kind: 'skipped', reason: `#${String(item.ticketNumber)} is not on the map any more.` };
      if (found.ticket.state !== 'frontier') return { kind: 'skipped', reason: `#${String(item.ticketNumber)} is ${found.ticket.state}, not next.` };
      const reply = await startTicketHandOff(batchRepo, found.map, found.ticket, { model: item.model, tier: item.tier, auto: item.auto ?? null, threadOnly: true });
      const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
      if (reply.status === 409) return { kind: 'skipped', reason: text(reply.body['error']) ?? 'Already in T3 Code.' };
      if (reply.status === 200 && reply.body['rung'] === 'thread') return { kind: 'started', handOffId: text(reply.body['handOffId']) };
      return { kind: 'failed', reason: text(reply.body['notice']) ?? text(reply.body['error']) ?? 'T3 Code did not start the thread.' };
    },
  });

  /** Validate a start request and hand its tickets to the Start next runner. The route and the auto map both come through here. */
  const startNextBatch = async (requestedRepo: string, requested: unknown): Promise<{ status: number; body: Record<string, unknown> }> => {
    const body = requested as { map?: unknown; cap?: unknown; tickets?: unknown; auto?: unknown };
    const mapNumber = Number(body.map);
    if (!Number.isSafeInteger(mapNumber) || !Array.isArray(body.tickets) || body.tickets.length === 0) {
      return { status: 400, body: { error: 'Choose a map and at least one ticket to start.' } };
    }
    // An auto map starts a ticket the moment it became next, which the cached snapshot may not show yet.
    const auto = body.auto === true;
    const read = auto ? await repositories.refreshIfChanged(requestedRepo, [mapNumber]) : await repositories.snapshot(requestedRepo, false, [mapNumber]);
    const map = read.maps.find((candidate) => candidate.number === mapNumber);
    if (map === undefined) return { status: 404, body: { error: 'No such map.' } };
    if ((await clones.resolve(requestedRepo)) === null) {
      return { status: 409, body: { error: `Choose a local clone of ${requestedRepo} before starting in T3 Code.` } };
    }
    const items = (body.tickets as Array<{ ticket?: unknown; tier?: unknown; model?: unknown; auto?: unknown }>).flatMap((entry): BatchRequestItem[] => {
      const ticket = map.tickets.find((candidate) => candidate.number === Number(entry.ticket));
      if (ticket === undefined) return [];
      const tier = TIERS.find((candidate) => candidate === entry.tier) ?? 'mid';
      return [
        {
          ticketNumber: ticket.number,
          title: ticket.title,
          tier,
          model: parseModelChoice(entry.model),
          auto: buildAutoDecision(entry.auto, new Date(), ticket.type),
          ...(ticket.state === 'frontier' ? {} : { skip: `#${String(ticket.number)} is ${ticket.state}, not next.` }),
        },
      ];
    });
    if (items.length === 0) return { status: 400, body: { error: 'None of those tickets are on this map.' } };
    return { status: 202, body: { batch: startNext.submit({ repo: requestedRepo, mapNumber, cap: normalizeCap(body.cap), items, auto }) } };
  };

  /** The auto map (#182): watches its maps and starts what becomes next with no page open. */
  const autoMaps = new AutoMapService({
    store: autoMapStore ?? (fetcher === undefined ? new AutoMapFileStore() : memoryAutoMapStore()),
    watcher: mapWatcher,
    loadMap: async (forRepo, mapNumber) => (await repositories.refreshIfChanged(forRepo, [mapNumber])).maps.find((candidate) => candidate.number === mapNumber) ?? null,
    submit: async (forRepo, request) => {
      const reply = await startNextBatch(forRepo, request);
      return { ok: reply.status === 202, error: typeof reply.body['error'] === 'string' ? reply.body['error'] : null };
    },
    catalog: async () => t3.models(await detect()),
    usage: async () => {
      await usageReadings.refresh();
      return combineUsage([...startNext.usageLimits(), ...(await handOffTracker.usageLimitEvents())], usageReadings.snapshot(), new Date());
    },
    rate: (ticket, choice) => rateWithModel(ticket, choice, ratingRunner),
    notificationOn: async (kind) => (await notificationSettings.get())[kind],
    ...(onDesktopNotification === undefined ? {} : { desktop: onDesktopNotification }),
    ...(autoMapBatchMs === undefined ? {} : { batchMs: autoMapBatchMs }),
  });
  await autoMaps.init();

  let port = config.port;
  let url = `http://${config.host}:${String(port)}`;

  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      json(response, 500, { error: (error as Error).message });
    });
  });
  server.on('close', () => {
    handOffTracker.close();
    autoMaps.close();
    mapWatcher.close();
    startNext.close();
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
        const check = !force && requestUrl.searchParams.get('check') === '1';
        try {
          const snapshot = check
            ? await repositories.refreshIfChanged(repo, openedMaps(requestUrl))
            : await repositories.snapshot(repo, force, openedMaps(requestUrl));
          reconcileMapWatches(snapshot);
          json(response, 200, await withSignals(snapshot));
        } catch (error) {
          json(response, 502, { error: (error as Error).message });
        }
        return;
      }

      if (path === '/api/hand-offs' && request.method === 'GET') {
        json(response, 200, await handOffTracker.snapshot());
        return;
      }

      if (path === '/api/start-next' && request.method === 'GET') {
        json(response, 200, { batches: startNext.snapshot() });
        return;
      }

      if (path === '/api/provider-usage' && request.method === 'GET') {
        const events = [...startNext.usageLimits(), ...(await handOffTracker.usageLimitEvents())];
        await usageReadings.refresh();
        json(response, 200, { providers: combineUsage(events, usageReadings.snapshot(), new Date()) });
        return;
      }

      // Claude Code's status-line script posts its payload here (see docs/design/auto-tier-and-provider-usage.md).
      if (path === '/api/provider-usage/claude' && request.method === 'POST') {
        json(response, 200, { recorded: usageReadings.recordClaudeStatusLine(await readBody(request)) });
        return;
      }

      if (path === '/api/start-next/stop' && request.method === 'POST') {
        const body = (await readBody(request)) as { id?: unknown };
        if (typeof body.id !== 'string' || !startNext.stop(body.id)) {
          json(response, 404, { error: 'No such batch.' });
          return;
        }
        json(response, 200, { batches: startNext.snapshot() });
        return;
      }

      if (path === '/api/hand-offs/acknowledge' && request.method === 'POST') {
        const body = (await readBody(request)) as { id?: unknown };
        const id = typeof body.id === 'string' ? body.id : '';
        if (!(await handOffTracker.acknowledge(id))) {
          json(response, 404, { error: 'No such hand-off.' });
          return;
        }
        json(response, 200, { acknowledged: true });
        return;
      }

      if (path === '/api/hand-offs/model-change' && request.method === 'POST') {
        const body = (await readBody(request)) as { id?: unknown; at?: unknown; reason?: unknown };
        const reason = MODEL_CHANGE_REASONS.find((candidate) => candidate === body.reason);
        if (typeof body.id !== 'string' || typeof body.at !== 'string' || reason === undefined) {
          json(response, 400, { error: 'Say which hand-off and model change, and one of the known reasons.' });
          return;
        }
        if (!(await handOffTracker.confirmModelChange(body.id, body.at, reason))) {
          json(response, 404, { error: 'No such model change.' });
          return;
        }
        json(response, 200, { confirmed: true });
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

      if (path === '/api/stall-settings') {
        if (request.method === 'POST') {
          const saved = await stallSettings.update(await readBody(request));
          if (saved === null) json(response, 400, { error: 'Stall settings take 3, 7, 14 or 30 days.' });
          else json(response, 200, saved);
          return;
        }
        json(response, 200, await stallSettings.get());
        return;
      }

      if (path === '/api/notification-settings') {
        if (request.method === 'GET') {
          json(response, 200, await notificationSettings.get());
        } else if (request.method === 'POST') {
          const saved = await notificationSettings.update(await readBody(request));
          if (saved === null) json(response, 400, { error: 'Choose on or off for at least one notification type.' });
          else json(response, 200, saved);
        } else {
          json(response, 405, { error: 'Use GET or POST for notification settings.' });
        }
        return;
      }

      if (path === '/api/desktop/notification' && request.method === 'POST') {
        const notification = parseDesktopNotification(await readBody(request));
        if (notification === null) {
          json(response, 400, { error: 'The desktop notification is invalid.' });
          return;
        }
        onDesktopNotification?.(notification);
        json(response, 200, { shown: onDesktopNotification !== undefined });
        return;
      }

      if (path === '/api/desktop/notifications/read' && request.method === 'POST') {
        onNotificationsRead?.();
        json(response, 200, { cleared: true });
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

      if (path === '/api/auth/logout' && request.method === 'POST') {
        const account = await readAccount();
        if (account.login === null) {
          json(response, 409, { error: 'No GitHub account is signed in.' });
          return;
        }
        await gh(['auth', 'logout', '-h', account.host, '-u', account.login]);
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
        // Legacy install-only owners validate readiness themselves, as before status was exposed.
        if (service.status && service.status().status !== 'ready') {
          json(response, 409, { error: 'No update is ready to install.' });
          return;
        }
        json(response, 200, { installing: true });
        // Installation closes this server, so acknowledge first and consume async failures.
        void Promise.resolve().then(() => service.install?.()).catch(() => undefined);
        return;
      }

      if (path === '/api/auto-map' && request.method === 'GET') {
        json(response, 200, autoMaps.view());
        return;
      }

      if (path === '/api/auto-map/map' && request.method === 'POST') {
        const body = (await readBody(request)) as { repo?: unknown; map?: unknown };
        const forRepo = typeof body.repo === 'string' ? normalizeRepo(body.repo) : null;
        const change = parseAutoMapChange(body);
        if (forRepo === null || !Number.isSafeInteger(body.map) || (body.map as number) <= 0 || change === null) {
          json(response, 400, { error: 'Name a repository, a map and what to change.' });
          return;
        }
        await autoMaps.change(forRepo, body.map as number, change);
        json(response, 200, autoMaps.view());
        return;
      }

      if (path === '/api/auto-map/settings' && request.method === 'POST') {
        if (!(await autoMaps.updateSettings(await readBody(request)))) {
          json(response, 400, { error: 'Send a cap, the tier models or the rater.' });
          return;
        }
        json(response, 200, autoMaps.view());
        return;
      }

      if (path === '/api/models') {
        try {
          json(response, 200, await t3.models(await detect()));
        } catch (error) {
          json(response, 503, { error: `T3 Code models unavailable: ${(error as Error).message}` });
        }
        return;
      }

      const scoped = parseScopedApiPath(path);
      const requestedRepo = scoped?.repo ?? (path === '/api/hand-off' || path === '/api/prototypes' || path === '/api/ticket' ? repo : null);

      if (path === '/api/events' && request.method === 'GET') {
        const targets = parseMapWatchTargets(requestUrl);
        if (targets === null) {
          json(response, 400, { error: 'Name one or more maps with repeated ?watch=owner/repo:number parameters.' });
          return;
        }
        const active: MapWatchTarget[] = [];
        const ended: MapWatchTarget[] = [];
        for (const target of targets) {
          const cached = repositories.cached(target.repo);
          const map = cached?.maps.find((candidate) => candidate.number === target.mapNumber);
          if (cached !== null && cached !== undefined && (map === undefined || !map.open || map.settled !== null)) {
            mapWatcher.stop(target.repo, target.mapNumber);
            ended.push(target);
          } else {
            active.push(target);
          }
        }
        streamMapEvents(request, response, mapWatcher, active, requestUrl.searchParams.get('after'), ended);
        return;
      }

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
            const read = await fetchTicketWithParent(requestedRepo, ticketNumber, config.typePrefix);
            foundTicket = read?.ticket ?? null;
            // A ticket on a settled map: open that map so the answer names it.
            const parent = read?.parent ?? null;
            if (parent !== null && snapshot.maps.some((candidate) => candidate.number === parent && !candidate.ticketsLoaded)) {
              foundMap = (await repositories.snapshot(requestedRepo, false, [parent])).maps.find((candidate) => candidate.number === parent) ?? null;
              foundTicket = foundMap?.tickets.find((t) => t.number === ticketNumber) ?? foundTicket;
            }
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

      if (requestedRepo !== null && scoped?.action === 'events' && request.method === 'GET') {
        const mapNumber = Number(requestUrl.searchParams.get('map'));
        if (!Number.isSafeInteger(mapNumber) || mapNumber <= 0) {
          json(response, 400, { error: 'Name a map with ?map=<number>.' });
          return;
        }
        // EventSource treats 204 as a completed stream and does not keep reconnecting.
        const cached = repositories.cached(requestedRepo);
        const map = cached?.maps.find((candidate) => candidate.number === mapNumber);
        if (cached !== null && cached !== undefined && (map === undefined || !map.open || map.settled !== null)) {
          mapWatcher.stop(requestedRepo, mapNumber);
          response.writeHead(204);
          response.end();
          return;
        }
        streamMapEvents(request, response, mapWatcher, [{ repo: requestedRepo, mapNumber }], requestUrl.searchParams.get('after'));
        return;
      }

      if (requestedRepo !== null && scoped?.action === 'settle' && request.method === 'POST') {
        const body = (await readBody(request)) as { map?: unknown; settled?: unknown };
        const mapNumber = Number(body.map);
        if (!Number.isSafeInteger(mapNumber) || mapNumber <= 0 || typeof body.settled !== 'boolean') {
          json(response, 400, { error: 'Name a map and whether it is settled.' });
          return;
        }
        const login = settle === null ? null : await settle.login();
        if (settle === null || login === null) {
          json(response, 409, { error: 'Sign in with GitHub to settle maps.' });
          return;
        }
        try {
          const at = new Date().toISOString();
          await settle.store.set(login, requestedRepo, mapNumber, { settled: body.settled, at });
          const snapshot =
            (await repositories.settle(requestedRepo, mapNumber, body.settled ? { reason: 'manual', since: at } : null)) ??
            (await repositories.snapshot(requestedRepo, false));
          reconcileMapWatches(snapshot);
          json(response, 200, await withSignals(snapshot));
        } catch (error) {
          json(response, 502, { error: (error as Error).message });
        }
        return;
      }

      if (requestedRepo !== null && scoped?.action === 'follow' && request.method === 'POST') {
        const body = (await readBody(request)) as { map?: unknown; followed?: unknown };
        const mapNumber = Number(body.map);
        if (!Number.isSafeInteger(mapNumber) || mapNumber <= 0 || typeof body.followed !== 'boolean') {
          json(response, 400, { error: 'Name a map and whether you follow it.' });
          return;
        }
        const login = follow === null ? null : await follow.login();
        if (follow === null || login === null) {
          json(response, 409, { error: 'Sign in with GitHub to follow maps.' });
          return;
        }
        try {
          // Only a public map can be followed; unfollowing always works, even once a map went private.
          const listed = repositories.cached(requestedRepo) ?? (await repositories.snapshot(requestedRepo, false));
          if (body.followed && !listed.publicMaps.some((map) => map.number === mapNumber)) {
            json(response, 404, { error: `Map #${String(mapNumber)} is not a public map by someone else.` });
            return;
          }
          await follow.store.set(login, requestedRepo, mapNumber, body.followed);
          json(response, 200, await repositories.snapshot(requestedRepo, true));
        } catch (error) {
          json(response, 502, { error: (error as Error).message });
        }
        return;
      }

      if (requestedRepo !== null && (scoped?.action === 'snapshot' || path === '/api/snapshot')) {
        const force = requestUrl.searchParams.get('refresh') === '1';
        const check = !force && requestUrl.searchParams.get('check') === '1';
        try {
          const snapshot = check
            ? await repositories.refreshIfChanged(requestedRepo, openedMaps(requestUrl))
            : await repositories.snapshot(requestedRepo, force, openedMaps(requestUrl));
          reconcileMapWatches(snapshot);
          json(response, 200, await withSignals(snapshot));
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
          const body = (await readBody(request)) as { path?: unknown; choose?: unknown; cloneTarget?: unknown };
          if (body.cloneTarget === true) {
            if (chooseDirectory === undefined) {
              json(response, 409, { error: 'This window cannot open a folder picker.' });
              return;
            }
            const target = await chooseDirectory('clone');
            if (target === null) {
              json(response, 200, { cancelled: true });
              return;
            }
            json(response, 200, { target });
            return;
          }
          let picked = typeof body.path === 'string' && body.path.trim().length > 0 ? body.path.trim() : null;
          if (picked === null && body.choose === true) {
            if (chooseDirectory === undefined) {
              json(response, 409, { error: 'This window cannot open a folder picker.', ...(await workspaceView(requestedRepo)) });
              return;
            }
            picked = await chooseDirectory('workspace');
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

      if (requestedRepo !== null && scoped?.action === 'clone' && request.method === 'POST') {
        const body = (await readBody(request)) as { target?: unknown };
        const target = typeof body.target === 'string' ? body.target.trim() : '';
        if (target.length === 0) {
          json(response, 400, { error: 'Choose a folder for the clone.', ...(await workspaceView(requestedRepo)) });
          return;
        }
        try {
          const clonedPath = await cloneRepository(requestedRepo, target);
          await clones.choose(requestedRepo, clonedPath);
        } catch (error) {
          const status = error instanceof RepositoryCloneError ? error.statusCode : 502;
          json(response, status, { error: (error as Error).message, ...(await workspaceView(requestedRepo)) });
          return;
        }
        json(response, 201, await workspaceView(requestedRepo));
        return;
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
        const body = (await readBody(request)) as { goal?: unknown; preview?: unknown; copyOnly?: unknown; model?: unknown; tier?: unknown };
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
        const runtime = await detect();
        const tier = typeof body.tier === 'string' && TIERS.includes(body.tier as Tier) ? (body.tier as Tier) : null;
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
            mapTitle: goal,
            ticketNumber: null,
            title: goal,
            tier,
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
          tier?: unknown;
          auto?: unknown;
        };

        const snapshot = await repositories.snapshot(requestedRepo, false, Number.isSafeInteger(Number(body.map)) ? [Number(body.map)] : []);
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
        const tier = typeof body.tier === 'string' && TIERS.includes(body.tier as Tier) ? (body.tier as Tier) : null;
        const reply = await startTicketHandOff(requestedRepo, map, ticket, { model: parseModelChoice(body.model), tier, auto: buildAutoDecision(body.auto, new Date(), ticket.type), threadOnly: false });
        json(response, reply.status, reply.body);
        return;
      }

      if (requestedRepo !== null && scoped?.action === 'auto-rate' && request.method === 'POST') {
        const body = (await readBody(request)) as { map?: unknown; tickets?: unknown; model?: unknown };
        const mapNumber = Number(body.map);
        const choice = parseModelChoice(body.model);
        if (!Number.isSafeInteger(mapNumber) || !Array.isArray(body.tickets) || choice === null) {
          json(response, 400, { error: 'Choose a map, its tickets and a model to rate with.' });
          return;
        }
        const map = (await repositories.snapshot(requestedRepo, false, [mapNumber])).maps.find((candidate) => candidate.number === mapNumber);
        if (map === undefined) {
          json(response, 404, { error: 'No such map.' });
          return;
        }
        const wanted = map.tickets.filter((ticket) => (body.tickets as unknown[]).includes(ticket.number)).slice(0, 16);
        const ratings = await Promise.all(wanted.map(async (ticket) => ({ ticket: ticket.number, ...(await rateWithModel(ticket, choice, ratingRunner)) })));
        json(response, 200, { ratings });
        return;
      }

      if (requestedRepo !== null && scoped?.action === 'start-next' && request.method === 'POST') {
        const reply = await startNextBatch(requestedRepo, await readBody(request));
        json(response, reply.status, reply.body);
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

    const shot = parsePrototypeShotPath(path);
    if (shot !== null) {
      if (!hostAllowed(request)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }
      try {
        const bytes = await fetchDefaultBranchFile(shot.repo, `${PROTOTYPE_SHOTS_DIR}/${shot.file}`);
        response.writeHead(200, {
          'content-type': MIME[extensionOf(shot.file)] ?? 'application/octet-stream',
          'x-content-type-options': 'nosniff',
          'cache-control': 'max-age=300',
        });
        response.end(bytes);
      } catch (error) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end(`No screenshot ${shot.file}\n\n${(error as Error).message}`);
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
  const match = /^\/api(\/repos\/[^/]+\/[^/]+)\/(snapshot|hand-off|new-map|prototypes|ticket|workspace|clone|icon|events|settle|follow|start-next|auto-rate)$/.exec(path);
  if (match?.[1] === undefined || match[2] === undefined) return null;
  const route = parseRepoPagePath(match[1]);
  if (route === null || route.mapNumber !== null) return null;
  return { repo: route.repo, action: match[2] as ScopedApiAction };
}

type MapTicket = WayfinderMap['tickets'][number];

interface MapWatchTarget {
  repo: string;
  mapNumber: number;
}

function parseMapWatchTargets(url: URL): MapWatchTarget[] | null {
  const values = url.searchParams.getAll('watch');
  if (values.length === 0 || values.length > 200) return null;
  const targets: MapWatchTarget[] = [];
  for (const value of values) {
    const separator = value.lastIndexOf(':');
    const repo = separator < 0 ? null : normalizeRepo(value.slice(0, separator));
    const mapNumber = Number(separator < 0 ? Number.NaN : value.slice(separator + 1));
    if (repo === null || !Number.isSafeInteger(mapNumber) || mapNumber <= 0) return null;
    if (!targets.some((target) => target.repo.toLowerCase() === repo.toLowerCase() && target.mapNumber === mapNumber)) {
      targets.push({ repo, mapNumber });
    }
  }
  return targets;
}

/** `?map=N`: the settled map a page opened, whose tickets it needs read. */
function openedMaps(url: URL): number[] {
  const mapNumber = Number(url.searchParams.get('map'));
  return Number.isSafeInteger(mapNumber) && mapNumber > 0 ? [mapNumber] : [];
}

/**
 * Server-sent events for one map: its recent history first, then each change as the
 * watcher finds it. The browser resends the last `id` on reconnect, so nothing repeats.
 */
function streamMapEvents(
  request: IncomingMessage,
  response: ServerResponse,
  watcher: MapWatcher,
  targets: readonly MapWatchTarget[],
  after: string | null,
  ended: readonly MapWatchTarget[] = [],
): void {
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
  });
  response.flushHeaders();
  const send = (event: MapEvent): void => {
    response.write(`id: ${String(event.id)}\nevent: map\ndata: ${JSON.stringify(event)}\n\n`);
  };
  const headerId = Number(request.headers['last-event-id']);
  const queryId = Number(after ?? 0);
  const lastId = Number.isFinite(headerId) && headerId > 0 ? headerId : Number.isFinite(queryId) ? queryId : 0;
  const history = targets.flatMap((target) => watcher.history(target.repo, target.mapNumber, lastId)).sort((a, b) => a.id - b.id);
  for (const event of history) send(event);
  const stops = new Map<string, () => void>();
  for (const target of ended) {
    response.write(`event: watch-ended\ndata: ${JSON.stringify(target)}\n\n`);
  }
  for (const target of targets) {
    const id = `${target.repo.toLowerCase()}#${String(target.mapNumber)}`;
    const stop = watcher.watch(target.repo, target.mapNumber, send, () => {
      if (response.destroyed) return;
      response.write(`event: watch-ended\ndata: ${JSON.stringify(target)}\n\n`);
      stops.delete(id);
      if (stops.size === 0) response.end();
    });
    stops.set(id, stop);
  }
  if (targets.length === 0) response.end();
  response.once('close', () => {
    for (const stop of stops.values()) stop();
    stops.clear();
  });
}

async function copyOnly(prompt: string): Promise<{ copied: boolean; error: string | null }> {
  try {
    await copyToClipboard(prompt);
    return { copied: true, error: null };
  } catch (error) {
    return { copied: false, error: (error as Error).message };
  }
}

export { DEFAULT_TEMPLATE };
