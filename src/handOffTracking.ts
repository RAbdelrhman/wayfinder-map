import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { gh } from './github.js';
import type { Tier } from './models.js';

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 30_000;
const PULL_REQUEST_LOOKUP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_CONCURRENT_PULL_REQUEST_LOOKUPS = 2;

export type HandOffStatus = 'starting' | 'running' | 'waiting' | 'ready' | 'finished' | 'interrupted' | 'failed' | 'untracked';
export type HandOffRung = 'thread' | 'app' | 'clipboard' | null;

export interface PullRequestRef {
  number: number | null;
  url: string;
  state: string | null;
  mergedAt: string | null;
  syncedAt: string | null;
  source: 't3' | 'github';
}

export interface StoredHandOff {
  id: string;
  repo: string;
  mapNumber: number | null;
  ticketNumber: number | null;
  title: string | null;
  tier?: Tier;
  environmentId: string | null;
  t3Origin: string | null;
  projectId: string | null;
  threadId: string | null;
  requestedBranch: string | null;
  branch: string | null;
  worktreePath: string | null;
  rung: HandOffRung;
  status: HandOffStatus;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string | null;
  terminalAt: string | null;
  sequence: number | null;
  rawSessionStatus: string | null;
  rawTurnState: string | null;
  lastError: string | null;
  pendingApproval: boolean;
  pendingUserInput: boolean;
  pullRequests: PullRequestRef[];
}

export interface RecordHandOffInput {
  repo: string;
  mapNumber: number | null;
  ticketNumber: number | null;
  title: string | null;
  tier?: Tier | null;
  environmentId?: string | null;
  t3Origin?: string | null;
  projectId?: string | null;
  branch?: string | null;
  worktreePath?: string | null;
  threadId: string | null;
  requestedBranch?: string | null;
  rung: HandOffRung;
}

export interface HandOffStatusDto {
  id: string;
  repo: string;
  mapNumber: number | null;
  ticketNumber: number | null;
  title: string | null;
  tier?: Tier;
  threadId: string | null;
  rung: HandOffRung;
  status: HandOffStatus;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string | null;
  stale: boolean;
  sequence: number | null;
  branch: string | null;
  pendingApproval: boolean;
  pendingUserInput: boolean;
  pullRequests: PullRequestRef[];
}

export interface T3HandOffSnapshot {
  environmentId: string | null;
  origin: string;
  snapshot: unknown;
}

export interface HandOffTrackingClient {
  readHandOffSnapshot: () => Promise<T3HandOffSnapshot>;
  subscribeShell?: (
    afterSequence: number | null,
    onValue: (value: unknown) => void,
    onClose: () => void,
  ) => Promise<() => void>;
}

export interface MappedT3Thread {
  id: string;
  projectId: string | null;
  status: Exclude<HandOffStatus, 'untracked'>;
  branch: string | null;
  worktreePath: string | null;
  sessionStatus: string | null;
  turnState: string | null;
  lastError: string | null;
  pendingApproval: boolean;
  pendingUserInput: boolean;
  pullRequests: PullRequestRef[];
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function flag(value: unknown): boolean {
  return value === true;
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const found = text(value);
    if (found !== null) return found;
  }
  return null;
}

function parsePullRequest(value: unknown): PullRequestRef | null {
  if (typeof value === 'string') {
    return value.startsWith('https://')
      ? { number: null, url: value, state: null, mergedAt: null, syncedAt: null, source: 't3' }
      : null;
  }
  const item = record(value);
  if (item === null) return null;
  const url = firstText(item['url'], item['htmlUrl'], item['html_url']);
  if (url === null || !url.startsWith('https://')) return null;
  return {
    number: finiteNumber(item['number']),
    url,
    state: firstText(item['state'], item['status']),
    mergedAt: firstText(item['mergedAt'], item['merged_at']),
    syncedAt: firstText(item['syncedAt'], item['synced_at']),
    source: 't3',
  };
}

function pullRequests(thread: Record<string, unknown>): PullRequestRef[] {
  const candidates: unknown[] = [];
  if (Array.isArray(thread['pullRequests'])) candidates.push(...thread['pullRequests']);
  candidates.push(thread['branchPullRequest'], thread['linkedPullRequest']);
  const seen = new Set<string>();
  const result: PullRequestRef[] = [];
  for (const candidate of candidates) {
    const parsed = parsePullRequest(candidate);
    if (parsed === null || seen.has(parsed.url)) continue;
    seen.add(parsed.url);
    result.push(parsed);
  }
  return result;
}

export function mapT3Status(thread: unknown): MappedT3Thread | null {
  const item = record(thread);
  if (item === null) return null;
  const id = text(item['id']);
  if (id === null) return null;

  const session = record(item['session']);
  const latestTurn = record(item['latestTurn']);
  const sessionStatus = firstText(session?.['status'], item['sessionStatus']);
  const turnState = firstText(latestTurn?.['state'], item['latestTurnState']);
  const lastError = firstText(session?.['lastError'], item['lastError']);
  const pendingApproval = flag(item['hasPendingApprovals']) || flag(item['pendingApproval']);
  const pendingUserInput = flag(item['hasPendingUserInput']) || flag(item['pendingUserInput']);
  const background = record(item['backgroundLiveness']);
  const backgroundState = firstText(background?.['state'], background?.['status'], item['backgroundLiveness']);

  let status: MappedT3Thread['status'] = 'starting';
  if (sessionStatus === 'error' || turnState === 'error' || lastError !== null) {
    status = 'failed';
  } else if (turnState === 'interrupted' || sessionStatus === 'interrupted') {
    status = 'interrupted';
  } else if (pendingApproval || pendingUserInput) {
    status = 'waiting';
  } else if (sessionStatus === 'starting') {
    status = 'starting';
  } else if (
    sessionStatus === 'running' ||
    turnState === 'running' ||
    backgroundState === 'working' ||
    backgroundState === 'running'
  ) {
    status = 'running';
  } else if (
    turnState === 'completed' &&
    (text(latestTurn?.['settledAt']) !== null || flag(latestTurn?.['settledOverride']))
  ) {
    status = 'finished';
  } else if (sessionStatus === 'ready' || sessionStatus === 'idle' || sessionStatus === 'stopped' || turnState === 'completed') {
    status = 'ready';
  }

  return {
    id,
    projectId: text(item['projectId']),
    status,
    branch: text(item['branch']),
    worktreePath: text(item['worktreePath']),
    sessionStatus,
    turnState,
    lastError: lastError?.slice(0, 500) ?? null,
    pendingApproval,
    pendingUserInput,
    pullRequests: pullRequests(item),
  };
}

export function handOffStorePath(home = homedir()): string {
  return join(home, '.wayfinder-map', 'hand-offs.json');
}

async function lookupGitHubPullRequests(repo: string, branch: string): Promise<PullRequestRef[]> {
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo) || branch.length === 0 || branch.length > 255 || /[\r\n]/.test(branch)) return [];
  try {
    const output = await gh([
      'pr',
      'list',
      `--repo=${repo}`,
      '--state=all',
      `--head=${branch}`,
      '--json',
      'number,state,url,mergedAt',
    ]);
    const parsed: unknown = JSON.parse(output);
    if (!Array.isArray(parsed)) return [];
    const refs: PullRequestRef[] = [];
    for (const item of parsed) {
      const ref = parsePullRequest(item);
      if (ref !== null) refs.push({ ...ref, source: 'github' });
    }
    return refs;
  } catch {
    return [];
  }
}

export class HandOffStore {
  private records: StoredHandOff[] | null = null;
  private loading: Promise<void> | null = null;
  private writes: Promise<void> = Promise.resolve();
  private readonly now: () => Date;

  constructor(
    private readonly options: { filePath?: string | null; now?: () => Date } = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async record(input: RecordHandOffInput): Promise<StoredHandOff> {
    await this.ensureLoaded();
    const now = this.now().toISOString();
    const handOff: StoredHandOff = {
      id: randomUUID(),
      repo: input.repo,
      mapNumber: input.mapNumber,
      ticketNumber: input.ticketNumber,
      title: input.title,
      ...(input.tier === undefined || input.tier === null ? {} : { tier: input.tier }),
      environmentId: input.environmentId ?? null,
      t3Origin: input.t3Origin ?? null,
      projectId: input.projectId ?? null,
      threadId: input.threadId,
      requestedBranch: input.requestedBranch ?? null,
      branch: input.branch ?? null,
      worktreePath: input.worktreePath ?? null,
      rung: input.rung,
      status: input.threadId === null ? 'untracked' : 'starting',
      createdAt: now,
      updatedAt: now,
      lastSeenAt: null,
      terminalAt: input.threadId === null ? now : null,
      sequence: null,
      rawSessionStatus: null,
      rawTurnState: null,
      lastError: null,
      pendingApproval: false,
      pendingUserInput: false,
      pullRequests: [],
    };
    this.current().push(handOff);
    await this.persist();
    return { ...handOff, pullRequests: [] };
  }

  async list(): Promise<StoredHandOff[]> {
    await this.ensureLoaded();
    const pruned = this.prune();
    if (pruned) await this.persist();
    return this.current().map((item) => ({ ...item, pullRequests: item.pullRequests.map((ref) => ({ ...ref })) }));
  }

  async addPullRequests(id: string, refs: readonly PullRequestRef[]): Promise<void> {
    await this.ensureLoaded();
    if (refs.length === 0) return;
    const handOff = this.current().find((item) => item.id === id);
    if (handOff === undefined || handOff.pullRequests.length > 0) return;
    handOff.pullRequests = refs.map((ref) => ({ ...ref }));
    handOff.updatedAt = this.now().toISOString();
    await this.persist();
  }

  async applySnapshot(environmentId: string | null, origin: string, snapshot: unknown): Promise<void> {
    await this.ensureLoaded();
    const shell = record(snapshot);
    if (shell === null) return;
    const sequence = finiteNumber(shell['snapshotSequence']);
    const threads = Array.isArray(shell['threads']) ? shell['threads'] : [];
    const byId = new Map<string, MappedT3Thread>();
    for (const raw of threads) {
      const parsed = mapT3Status(raw);
      if (parsed !== null) byId.set(parsed.id, parsed);
    }
    let changed = false;
    for (const handOff of this.current()) {
      if (handOff.threadId === null || !this.matchesEnvironment(handOff, environmentId, origin)) continue;
      const thread = byId.get(handOff.threadId);
      if (thread === undefined) continue;
      if (this.applyThread(handOff, thread, environmentId, origin, sequence)) changed = true;
    }
    if (this.prune()) changed = true;
    if (changed) await this.persist();
  }

  async applyEvent(environmentId: string | null, origin: string, value: unknown): Promise<void> {
    await this.ensureLoaded();
    const event = record(value);
    if (event === null) return;
    const kind = firstText(event['type'], event['event'], event['_tag']);
    const eventValue = record(event['value']);
    const sequence = finiteNumber(event['sequence']) ?? finiteNumber(eventValue?.['sequence']);

    if (kind === 'snapshot' || kind === 'synchronized') {
      const snapshot = event['snapshot'] ?? eventValue?.['snapshot'] ?? event['value'];
      const shell = record(snapshot);
      const snapshotWithSequence = sequence !== null && shell !== null && finiteNumber(shell['snapshotSequence']) === null
        ? { ...shell, snapshotSequence: sequence }
        : snapshot;
      await this.applySnapshot(environmentId, origin, snapshotWithSequence);
      return;
    }
    if (kind !== 'thread-upserted') return;

    const rawThread = event['thread'] ?? eventValue?.['thread'] ?? event['data'] ?? event['value'];
    const thread = mapT3Status(rawThread);
    if (thread === null) return;
    let changed = false;
    for (const handOff of this.current()) {
      if (handOff.threadId !== thread.id || !this.matchesEnvironment(handOff, environmentId, origin)) continue;
      if (this.applyThread(handOff, thread, environmentId, origin, sequence)) changed = true;
    }
    if (this.prune()) changed = true;
    if (changed) await this.persist();
  }

  private matchesEnvironment(handOff: StoredHandOff, environmentId: string | null, origin: string): boolean {
    if (environmentId === null) return false;
    if (handOff.environmentId !== null) return handOff.environmentId === environmentId;
    return handOff.t3Origin === origin;
  }

  private applyThread(
    handOff: StoredHandOff,
    thread: MappedT3Thread,
    environmentId: string | null,
    origin: string,
    sequence: number | null,
  ): boolean {
    if (handOff.projectId !== null && thread.projectId !== null && handOff.projectId !== thread.projectId) return false;
    if (sequence !== null && handOff.sequence !== null && sequence < handOff.sequence) return false;

    const now = this.now().toISOString();
    const terminal = thread.status === 'finished' || thread.status === 'interrupted' || thread.status === 'failed';
    const nextTerminalAt = terminal ? (handOff.terminalAt ?? now) : null;
    const nextSequence = sequence === null ? handOff.sequence : Math.max(handOff.sequence ?? sequence, sequence);
    const next = {
      ...handOff,
      environmentId: handOff.environmentId ?? environmentId,
      t3Origin: origin,
      projectId: handOff.projectId ?? thread.projectId,
      branch: thread.branch ?? handOff.branch,
      worktreePath: thread.worktreePath ?? handOff.worktreePath,
      status: thread.status,
      updatedAt: now,
      lastSeenAt: now,
      terminalAt: nextTerminalAt,
      sequence: nextSequence,
      rawSessionStatus: thread.sessionStatus,
      rawTurnState: thread.turnState,
      lastError: thread.lastError,
      pendingApproval: thread.pendingApproval,
      pendingUserInput: thread.pendingUserInput,
      pullRequests: thread.pullRequests.length > 0 ? thread.pullRequests : handOff.pullRequests,
    };
    Object.assign(handOff, next);
    return true;
  }

  private prune(): boolean {
    const before = this.current().length;
    const cutoff = this.now().getTime() - RETENTION_MS;
    this.records = this.current().filter((item) => {
      if (item.terminalAt === null) return true;
      const terminalTime = Date.parse(item.terminalAt);
      return !Number.isFinite(terminalTime) || terminalTime > cutoff;
    });
    return this.records.length !== before;
  }

  private current(): StoredHandOff[] {
    if (this.records === null) throw new Error('Hand-off store has not loaded.');
    return this.records;
  }

  private async ensureLoaded(): Promise<void> {
    this.loading ??= (async () => {
      const filePath = this.options.filePath;
      if (filePath === null || filePath === undefined) {
        this.records = [];
        return;
      }
      try {
        const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'));
        const root = record(parsed);
        if (root?.['version'] !== 1 || !Array.isArray(root['records'])) throw new Error('Unsupported hand-off store format.');
        this.records = root['records'].filter(isStoredHandOff);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          this.records = [];
          return;
        }
        throw error;
      }
      if (this.prune()) await this.persist();
    })().catch((error: unknown) => {
      this.loading = null;
      throw error;
    });
    await this.loading;
  }

  private async persist(): Promise<void> {
    const filePath = this.options.filePath;
    if (filePath === null || filePath === undefined) return;
    const payload = JSON.stringify({ version: 1, records: this.current() }, null, 2);
    this.writes = this.writes.catch(() => undefined).then(async () => {
      await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
      const temporary = `${filePath}.${String(process.pid)}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, payload, { encoding: 'utf8', mode: 0o600 });
        await rename(temporary, filePath);
      } catch (error) {
        await unlink(temporary).catch(() => undefined);
        throw error;
      }
    });
    await this.writes;
  }
}

function isStoredHandOff(value: unknown): value is StoredHandOff {
  const item = record(value);
  if (item === null) return false;
  const nullableString = (field: string): boolean => item[field] === null || typeof item[field] === 'string';
  const nullableNumber = (field: string): boolean => item[field] === null || typeof item[field] === 'number';
  const validRung = item['rung'] === null || item['rung'] === 'thread' || item['rung'] === 'app' || item['rung'] === 'clipboard';
  return (
    typeof item['id'] === 'string' &&
    typeof item['repo'] === 'string' &&
    nullableNumber('mapNumber') &&
    nullableNumber('ticketNumber') &&
    nullableString('title') &&
    nullableString('environmentId') &&
    nullableString('t3Origin') &&
    nullableString('projectId') &&
    nullableString('threadId') &&
    nullableString('requestedBranch') &&
    nullableString('branch') &&
    nullableString('worktreePath') &&
    validRung &&
    typeof item['createdAt'] === 'string' &&
    typeof item['updatedAt'] === 'string' &&
    nullableString('lastSeenAt') &&
    nullableString('terminalAt') &&
    nullableNumber('sequence') &&
    nullableString('rawSessionStatus') &&
    nullableString('rawTurnState') &&
    nullableString('lastError') &&
    typeof item['pendingApproval'] === 'boolean' &&
    typeof item['pendingUserInput'] === 'boolean' &&
    ['starting', 'running', 'waiting', 'ready', 'finished', 'interrupted', 'failed', 'untracked'].includes(String(item['status'])) &&
    Array.isArray(item['pullRequests']) &&
    item['pullRequests'].every((ref) => {
      const pullRequest = record(ref);
      return (
        pullRequest !== null &&
        nullableNumberValue(pullRequest['number']) &&
        typeof pullRequest['url'] === 'string' &&
        nullableStringValue(pullRequest['state']) &&
        nullableStringValue(pullRequest['mergedAt']) &&
        nullableStringValue(pullRequest['syncedAt']) &&
        (pullRequest['source'] === 't3' || pullRequest['source'] === 'github')
      );
    })
  );
}

function nullableStringValue(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function nullableNumberValue(value: unknown): boolean {
  return value === null || typeof value === 'number';
}

export class HandOffTracker {
  private online = false;
  private environmentId: string | null = null;
  private origin: string | null = null;
  private checkedAt: string | null = null;
  private refreshInFlight: Promise<void> | null = null;
  private streamStop: (() => void) | null = null;
  private streamKey: string | null = null;
  private streamOpening: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private closed = false;
  private started = false;
  private readonly now: () => Date;
  private readonly pollIntervalMs: number;
  private readonly lookupPullRequests: (repo: string, branch: string) => Promise<PullRequestRef[]>;
  private readonly pendingLookups = new Set<string>();
  private readonly pullRequestLookupAt = new Map<string, number>();

  constructor(
    private readonly store: HandOffStore,
    private readonly client: HandOffTrackingClient | null,
    options: {
      now?: () => Date;
      pollIntervalMs?: number;
      lookupPullRequests?: (repo: string, branch: string) => Promise<PullRequestRef[]>;
    } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.lookupPullRequests = options.lookupPullRequests ?? lookupGitHubPullRequests;
  }

  start(): void {
    if (this.started || this.closed) return;
    this.started = true;
    this.timer = setInterval(() => void this.refresh(), this.pollIntervalMs);
    this.timer.unref();
    void this.refresh();
  }

  async record(input: RecordHandOffInput): Promise<StoredHandOff> {
    const saved = await this.store.record(input);
    this.start();
    await this.refresh();
    return saved;
  }

  async snapshot(): Promise<{ handOffs: HandOffStatusDto[]; t3: { available: boolean; checkedAt: string | null } }> {
    this.start();
    await this.refresh();
    const records = await this.store.list();
    return {
      handOffs: records.map((item) => this.toDto(item)),
      t3: { available: this.online, checkedAt: this.checkedAt },
    };
  }

  close(): void {
    this.closed = true;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.streamStop?.();
    this.streamStop = null;
    this.streamKey = null;
  }

  private async refresh(): Promise<void> {
    if (this.closed || this.refreshInFlight !== null) return this.refreshInFlight ?? Promise.resolve();
    if (this.client === null) {
      this.online = false;
      this.checkedAt = this.now().toISOString();
      return;
    }
    this.refreshInFlight = (async () => {
      try {
        const observed = await this.client?.readHandOffSnapshot();
        if (observed === undefined) throw new Error('T3 Code tracking is unavailable.');
        const shell = record(observed.snapshot);
        const sequence = finiteNumber(shell?.['snapshotSequence']);
        await this.store.applySnapshot(observed.environmentId, observed.origin, observed.snapshot);
        this.online = true;
        this.environmentId = observed.environmentId;
        this.origin = observed.origin;
        this.checkedAt = this.now().toISOString();
        void this.discoverMissingPullRequests(observed.environmentId, observed.origin);
        void this.ensureStream(observed.environmentId, observed.origin, sequence);
      } catch (error) {
        this.online = false;
        this.checkedAt = this.now().toISOString();
        this.streamStop?.();
        this.streamStop = null;
        this.streamKey = null;
      }
    })().finally(() => {
      this.refreshInFlight = null;
    });
    await this.refreshInFlight;
  }

  private async ensureStream(environmentId: string | null, origin: string, sequence: number | null): Promise<void> {
    const subscribe = this.client?.subscribeShell?.bind(this.client);
    if (subscribe === undefined || this.closed) return;
    const key = environmentId ?? origin;
    if (this.streamKey === key && this.streamStop !== null) return;
    if (this.streamOpening !== null) return this.streamOpening;
    this.streamStop?.();
    this.streamStop = null;
    this.streamKey = null;
    this.streamOpening = subscribe(
      sequence,
      (value) => {
        void this.store
          .applyEvent(environmentId, origin, value)
          .then(() => this.discoverMissingPullRequests(environmentId, origin))
          .catch(() => undefined);
      },
      () => {
        if (this.streamKey === key) {
          this.streamStop = null;
          this.streamKey = null;
        }
      },
    )
      .then((stop) => {
        if (this.closed || !this.online || (this.environmentId ?? this.origin) !== key) {
          stop();
          return;
        }
        this.streamStop = stop;
        this.streamKey = key;
      })
      .catch(() => undefined)
      .finally(() => {
        this.streamOpening = null;
      });
    await this.streamOpening;
  }

  private async discoverMissingPullRequests(environmentId: string | null, origin: string): Promise<void> {
    if (!this.online) return;
    const records = await this.store.list();
    for (const item of records) {
      const sameEnvironment = item.environmentId !== null
        ? item.environmentId === environmentId
        : environmentId !== null && item.t3Origin === origin;
      if (item.threadId === null || !sameEnvironment || item.branch === null || item.pullRequests.length > 0) continue;
      const key = `${item.id}:${item.branch}`;
      if (this.pendingLookups.has(key)) continue;
      const lastLookup = this.pullRequestLookupAt.get(key);
      if (lastLookup !== undefined && this.now().getTime() - lastLookup < PULL_REQUEST_LOOKUP_INTERVAL_MS) continue;
      if (this.pendingLookups.size >= MAX_CONCURRENT_PULL_REQUEST_LOOKUPS) break;
      this.pendingLookups.add(key);
      this.pullRequestLookupAt.set(key, this.now().getTime());
      void this.lookupPullRequests(item.repo, item.branch)
        .then((refs) => this.store.addPullRequests(item.id, refs))
        .catch(() => undefined)
        .finally(() => this.pendingLookups.delete(key));
    }
  }

  private toDto(item: StoredHandOff): HandOffStatusDto {
    const sameEnvironment = item.environmentId !== null && item.environmentId === this.environmentId;
    return {
      id: item.id,
      repo: item.repo,
      mapNumber: item.mapNumber,
      ticketNumber: item.ticketNumber,
      title: item.title,
      ...(item.tier === undefined ? {} : { tier: item.tier }),
      threadId: item.threadId,
      rung: item.rung,
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      lastSeenAt: item.lastSeenAt,
      stale: item.threadId !== null && (!this.online || !sameEnvironment),
      sequence: item.sequence,
      branch: item.branch,
      pendingApproval: item.pendingApproval,
      pendingUserInput: item.pendingUserInput,
      pullRequests: item.pullRequests.map((ref) => ({ ...ref })),
    };
  }
}
