import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { criticalPath } from './criticalPath.js';
import { parseBlockedByLine, parseChildNumbers, parseMapBody } from './mapBody.js';
import { PROTOTYPE_BRANCH_PREFIX, PROTOTYPE_SHOTS_DIR, PROTOTYPE_SNAPSHOT_FILE, isHtml, isSelfContained, pickPreview, prototypeTicketNumber, prototypeVariantInfo, unlistedCanvasBoards, verdictComment } from './prototypes.js';
import { idleCutoff, isIdleCandidate, settlementOf } from './settling.js';
import type { MapIssueFacts, SettleChoices } from './settling.js';
import { TICKET_TYPES } from './types.js';
import type { MapSettlement, OutsideTicket, Prototype, PrototypeVariant, Ticket, TicketState, TicketType, WayfinderMap } from './types.js';

const run = promisify(execFile);

const ghEnv: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' };
delete ghEnv.GH_FORCE_TTY;

/** GitHub CLI can still decorate piped output when launched from a terminal app. */
export function plainGhOutput(output: string): string {
  return output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
}

function ghTextOutput(output: unknown): string {
  return Buffer.isBuffer(output) ? output.toString('utf8') : typeof output === 'string' ? output : '';
}

/** Shown in place of GitHub's own rate-limit text, which is a wall of request IDs and terms-of-service links. */
export const RATE_LIMIT_WARNING = "Wayfinder hit GitHub's rate limit. Try again in a few minutes.";

/** A failed gh call, put in words a person can act on. */
export function ghProblem(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /rate limit/i.test(message) ? RATE_LIMIT_WARNING : message;
}

/** `#3`, `#3 and #14`, `#3, #14 and #35`. */
function numberList(numbers: readonly number[]): string {
  const tags = numbers.map((number) => `#${String(number)}`);
  return tags.length < 2 ? tags.join('') : `${tags.slice(0, -1).join(', ')} and ${tags[tags.length - 1]!}`;
}

/** One line for every map whose sub-issues GitHub didn't return, instead of one line each. */
export function fallbackWarning(mapNumbers: readonly number[], rateLimited: boolean): string {
  const why = rateLimited ? "Wayfinder hit GitHub's rate limit" : "GitHub didn't return sub-issues";
  const maps = mapNumbers.length === 1
    ? `map ${numberList(mapNumbers)} is showing the tickets listed in its description`
    : `maps ${numberList(mapNumbers)} are showing the tickets listed in their descriptions`;
  return `${why}, so ${maps}. Sub-issues not listed there won't show until the next sync.`;
}

/** Names the body-listed tickets GitHub did not return as sub-issues. */
export function unattachedTicketsWarning(mapNumber: number, ticketNumbers: readonly number[]): string {
  const singular = ticketNumbers.length === 1;
  const verb = singular ? "isn't" : "aren't";
  const noun = singular ? 'a sub-issue' : 'sub-issues';
  return `${numberList(ticketNumbers)} ${singular ? 'is' : 'are'} listed on map #${String(mapNumber)} but ${verb} attached as ${noun}.`;
}

export class GhError extends Error {
  constructor(
    message: string,
    readonly args: string[],
  ) {
    super(message);
    this.name = 'GhError';
  }
}

/** `gh api` reports HTTP 304 on stderr and exits 1, even though the request succeeded. */
export function gh304Output(error: unknown): Buffer | null {
  if (typeof error !== 'object' || error === null) return null;
  const value = error as { message?: unknown; stdout?: unknown; stderr?: unknown };
  const combined = [value.message, value.stdout, value.stderr].map(ghTextOutput).join('\n');
  if (!/HTTP 304\b/i.test(combined)) return null;
  if (Buffer.isBuffer(value.stdout)) return value.stdout;
  return Buffer.from(ghTextOutput(value.stdout), 'utf8');
}

/** Run `gh` and return stdout. Throws GhError with gh's own stderr, which is usually the useful part. */
export async function gh(args: string[]): Promise<string> {
  return plainGhOutput((await ghBytes(args)).toString('utf8'));
}

/** `gh` stdout as raw bytes, for files that may not be text. */
export async function ghBytes(args: string[]): Promise<Buffer> {
  try {
    const { stdout } = await run('gh', args, { maxBuffer: 64 * 1024 * 1024, windowsHide: true, encoding: 'buffer', env: ghEnv });
    return stdout;
  } catch (error) {
    const notModified = gh304Output(error);
    if (notModified !== null) return notModified;
    const stderr = (error as { stderr?: unknown }).stderr;
    const text = Buffer.isBuffer(stderr) ? stderr.toString('utf8') : typeof stderr === 'string' ? stderr : '';
    const reason = text.trim() || (error as Error).message;
    throw new GhError(reason, args);
  }
}

/**
 * `gh api -i` stdout, even when gh exits non-zero. gh prints a `304 Not Modified` and
 * then exits 1, so a conditional request's answer is only in stdout.
 */
export async function ghIncludingHeaders(args: string[]): Promise<string> {
  try {
    const { stdout } = await run('gh', args, { maxBuffer: 64 * 1024 * 1024, windowsHide: true, env: ghEnv });
    return plainGhOutput(ghTextOutput(stdout));
  } catch (error) {
    const stdout = ghTextOutput((error as { stdout?: unknown }).stdout);
    if (stdout.startsWith('HTTP/')) return plainGhOutput(stdout);
    const stderr = (error as { stderr?: unknown }).stderr;
    throw new GhError((typeof stderr === 'string' ? stderr.trim() : '') || (error as Error).message, args);
  }
}

async function ghJson<T>(args: string[]): Promise<T> {
  return JSON.parse(await gh(args)) as T;
}

/** The repo `gh` would act on in `cwd`, as `owner/name`. */
export async function currentRepo(cwd: string): Promise<string> {
  const { stdout } = await run('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], {
    cwd,
    windowsHide: true,
    env: ghEnv,
  });
  return plainGhOutput(stdout).trim();
}

/** `gh issue list` reports OPEN/CLOSED, `gh api` reports open/closed. Accept both. */
export function isOpenState(state: string): boolean {
  return state.toLowerCase() !== 'closed';
}

interface RawIssue {
  number: number;
  title: string;
  html_url?: string;
  url?: string;
  body?: string | null;
  state: string;
  assignee?: { login?: string } | null;
  assignees?: Array<{ login?: string }> | null;
  labels?: Array<string | { name?: string }> | null;
  user?: { login?: string } | null;
  issue_dependencies_summary?: { blocked_by?: number; total_blocking?: number } | null;
  /** Present when the issue is really a pull request. */
  pull_request?: unknown;
  /** Set when the issue is a sub-issue, e.g. of a map. */
  parent_issue_url?: string | null;
}

function labelNames(raw: RawIssue): string[] {
  return (raw.labels ?? [])
    .map((label) => (typeof label === 'string' ? label : (label.name ?? '')))
    .filter((name) => name.length > 0);
}

function ticketType(labels: string[], prefix: string): TicketType | null {
  for (const label of labels) {
    if (!label.startsWith(prefix)) continue;
    const rest = label.slice(prefix.length);
    const match = TICKET_TYPES.find((type) => type === rest);
    if (match) return match;
  }
  return null;
}

function issueUrl(raw: { number: number; html_url?: string; url?: string }, repo: string): string {
  return raw.html_url ?? raw.url ?? `https://github.com/${repo}/issues/${raw.number}`;
}

export interface OutsideLinks {
  /** Tickets on the map it blocks. */
  blocks?: number[];
  /** Tickets on the map it waits on. */
  waitsOn?: number[];
  /** Its own blockers, with their open state already settled. */
  blockers?: Array<{ number: number; open: boolean }>;
  typePrefix?: string;
}

export function toOutsideTicket(raw: RawIssue, repo: string, links: OutsideLinks = {}): OutsideTicket {
  const pullRequest = raw.pull_request !== undefined && raw.pull_request !== null;
  const open = isOpenState(raw.state);
  const labels = labelNames(raw);
  const assignee = raw.assignee?.login ?? raw.assignees?.[0]?.login ?? (pullRequest ? raw.user?.login : undefined) ?? null;
  const blockers = links.blockers ?? [];
  const openBlockers = blockers.filter((blocker) => blocker.open).map((blocker) => blocker.number);
  return {
    number: raw.number,
    title: raw.title,
    url: raw.html_url ?? `https://github.com/${repo}/${pullRequest ? 'pull' : 'issues'}/${raw.number}`,
    body: raw.body ?? '',
    type: ticketType(labels, links.typePrefix ?? 'wayfinder:'),
    labels,
    open,
    assignee,
    blockedBy: blockers.map((blocker) => blocker.number),
    openBlockers,
    state: ticketStateOf(open, openBlockers, assignee),
    pullRequest,
    blocks: links.blocks ?? [],
    waitsOn: links.waitsOn ?? [],
  };
}

export function ticketStateOf(open: boolean, openBlockers: number[], assignee: string | null): TicketState {
  if (!open) return 'done';
  if (openBlockers.length > 0) return 'blocked';
  if (assignee !== null) return 'claimed';
  return 'frontier';
}

export interface FetchOptions {
  repo: string;
  /** Label that marks a map issue. */
  mapLabel: string;
  /** Prefix in front of a ticket's type label, e.g. `wayfinder:`. */
  typePrefix: string;
  /** Cap on parallel `gh` calls, so a big map does not open 60 processes at once. */
  concurrency?: number;
}

/** Run `tasks` with at most `limit` in flight, preserving input order in the result. */
async function pool<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await task(item);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface GhApiResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** Parse the single HTTP response printed by `gh api --include`. */
export function parseGhApiResponse(output: string): GhApiResponse {
  const separator = /\r?\n\r?\n/.exec(output);
  if (separator === null) throw new Error('GitHub CLI did not include HTTP response headers.');
  const headerText = output.slice(0, separator.index);
  const [statusLine = '', ...headerLines] = headerText.split(/\r?\n/);
  const status = /^HTTP\/\S+\s+(\d{3})(?:\s|$)/i.exec(statusLine)?.[1];
  if (status === undefined) throw new Error('GitHub CLI returned an unrecognized HTTP status line.');

  const headers: Record<string, string> = {};
  for (const line of headerLines) {
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }
  return {
    status: Number(status),
    headers,
    body: output.slice(separator.index + separator[0].length),
  };
}

type GhApiRunner = (args: string[]) => Promise<string>;

function hasNextPage(link: string | undefined): boolean {
  return link !== undefined && /;\s*rel="?next"?(?:,|\s|$)/i.test(link);
}

function subIssuesArgs(repo: string, mapNumber: number, page: number, etag?: string): string[] {
  const args = ['api', '--include', '-X', 'GET'];
  if (etag !== undefined) args.push('-H', `If-None-Match: ${etag}`);
  args.push('-F', 'per_page=100', '-F', `page=${String(page)}`, `repos/${repo}/issues/${String(mapNumber)}/sub_issues`);
  return args;
}

/** Keeps ETags for every sub-issue page so unchanged map polls receive free 304 responses. */
export class SubIssueWatcher {
  private readonly etags = new Map<string, Map<number, Map<number, string | null>>>();
  private readonly bodyIssueEtags = new Map<string, Map<number, Map<number, string | null>>>();

  constructor(private readonly runGh: GhApiRunner = ghIncludingHeaders) {}

  async fetch(repo: string, mapNumber: number): Promise<RawIssue[]> {
    const issues: RawIssue[] = [];
    const pageEtags = new Map<number, string | null>();
    let page = 1;

    for (;;) {
      const args = subIssuesArgs(repo, mapNumber, page);
      const response = parseGhApiResponse(await this.runGh(args));
      if (response.status !== 200) {
        throw new GhError(response.body.trim() || `GitHub returned HTTP ${String(response.status)} for map #${String(mapNumber)} sub-issues.`, args);
      }
      const pageIssues = JSON.parse(response.body) as RawIssue[];
      if (!Array.isArray(pageIssues)) throw new Error(`GitHub returned an invalid sub-issue list for map #${String(mapNumber)}.`);
      issues.push(...pageIssues);
      pageEtags.set(page, response.headers.etag ?? null);

      if (hasNextPage(response.headers.link) || pageIssues.length === 100) {
        page += 1;
        continue;
      }
      break;
    }

    const repoEtags = this.etags.get(repo) ?? new Map<number, Map<number, string | null>>();
    repoEtags.set(mapNumber, pageEtags);
    this.etags.set(repo, repoEtags);
    return issues;
  }

  resetBodyIssues(repo: string, mapNumber: number): void {
    const maps = this.bodyIssueEtags.get(repo) ?? new Map<number, Map<number, string | null>>();
    maps.set(mapNumber, new Map());
    this.bodyIssueEtags.set(repo, maps);
  }

  async fetchBodyIssue(repo: string, mapNumber: number, issueNumber: number): Promise<RawIssue | null> {
    const args = ['api', '--include', `repos/${repo}/issues/${String(issueNumber)}`];
    try {
      const response = parseGhApiResponse(await this.runGh(args));
      this.recordBodyIssueEtag(repo, mapNumber, issueNumber, response.headers.etag ?? null);
      if (response.status !== 200) return null;
      return JSON.parse(response.body) as RawIssue;
    } catch {
      this.recordBodyIssueEtag(repo, mapNumber, issueNumber, null);
      return null;
    }
  }

  clear(repo: string, mapNumber: number): void {
    this.etags.get(repo)?.delete(mapNumber);
    this.bodyIssueEtags.get(repo)?.delete(mapNumber);
  }

  retainMaps(repo: string, mapNumbers: readonly number[]): void {
    const included = new Set(mapNumbers);
    for (const maps of [this.etags.get(repo), this.bodyIssueEtags.get(repo)]) {
      if (maps === undefined) continue;
      for (const mapNumber of maps.keys()) {
        if (!included.has(mapNumber)) maps.delete(mapNumber);
      }
    }
  }

  async hasChanged(repo: string, mapNumbers: readonly number[]): Promise<boolean> {
    const results = await pool(mapNumbers, 6, async (mapNumber) => {
      const pageEtags = this.etags.get(repo)?.get(mapNumber);
      if (pageEtags === undefined || pageEtags.size === 0) return true;

      for (const [page, etag] of pageEtags) {
        if (etag === null) return true;
        const response = parseGhApiResponse(await this.runGh(subIssuesArgs(repo, mapNumber, page, etag)));
        if (response.status !== 304) return true;
        if (response.headers.etag !== undefined) pageEtags.set(page, response.headers.etag);
      }
      for (const [issueNumber, etag] of this.bodyIssueEtags.get(repo)?.get(mapNumber) ?? []) {
        if (etag === null) continue;
        const response = parseGhApiResponse(await this.runGh([
          'api',
          '--include',
          '-H',
          `If-None-Match: ${etag}`,
          `repos/${repo}/issues/${String(issueNumber)}`,
        ]));
        if (response.status !== 304) return true;
        if (response.headers.etag !== undefined) this.recordBodyIssueEtag(repo, mapNumber, issueNumber, response.headers.etag);
      }
      return false;
    });
    return results.some(Boolean);
  }

  private recordBodyIssueEtag(repo: string, mapNumber: number, issueNumber: number, etag: string | null): void {
    const maps = this.bodyIssueEtags.get(repo) ?? new Map<number, Map<number, string | null>>();
    const issues = maps.get(mapNumber) ?? new Map<number, string | null>();
    issues.set(issueNumber, etag);
    maps.set(mapNumber, issues);
    this.bodyIssueEtags.set(repo, maps);
  }
}

const subIssueWatcher = new SubIssueWatcher();

/** Whether any cached map's sub-issue list changed since its last full read. */
export function haveMapTicketsChanged(repo: string, mapNumbers: readonly number[]): Promise<boolean> {
  return subIssueWatcher.hasChanged(repo, mapNumbers);
}

async function fetchIssue(repo: string, number: number): Promise<RawIssue | null> {
  try {
    return await ghJson<RawIssue>(['api', `repos/${repo}/issues/${number}`]);
  } catch {
    return null;
  }
}

/**
 * Blockers for one ticket: GitHub's native dependencies first, the body line as fallback.
 * Asked for unconditionally, because the summary counts only OPEN blockers and a closed
 * one still draws the edge that shows how the map was sequenced.
 */
async function fetchBlockers(repo: string, raw: RawIssue): Promise<Blocker[]> {
  try {
    const blockers = await ghJson<RawIssue[]>(['api', `repos/${repo}/issues/${raw.number}/dependencies/blocked_by`]);
    if (blockers.length > 0) {
      return blockers.map((blocker) => ({ number: blocker.number, open: isOpenState(blocker.state), raw: blocker }));
    }
  } catch {
    // Dependencies unavailable on this repo. Fall through to the body line.
  }
  // The body line names numbers only, so the state comes from the map's own tickets.
  return parseBlockedByLine(raw.body ?? '').map((number) => ({ number, open: null }));
}

/** Issues `number` blocks. Empty when dependencies are unavailable. */
async function fetchBlocking(repo: string, number: number): Promise<RawIssue[]> {
  try {
    return await ghJson<RawIssue[]>(['api', `repos/${repo}/issues/${number}/dependencies/blocking`]);
  } catch {
    return [];
  }
}

interface Blocker {
  number: number;
  /** null when the source did not say, e.g. a `Blocked by:` line. */
  open: boolean | null;
  /** The blocker itself, when the source returned it. */
  raw?: RawIssue;
}

/** Read a single ticket directly from GitHub as a Ticket. */
export async function fetchTicket(repo: string, number: number, typePrefix = 'wayfinder:'): Promise<Ticket | null> {
  return (await fetchTicketWithParent(repo, number, typePrefix))?.ticket ?? null;
}

/** The same, with the issue it is a sub-issue of, so a caller can find its map without reading every map. */
export async function fetchTicketWithParent(
  repo: string,
  number: number,
  typePrefix = 'wayfinder:',
): Promise<{ ticket: Ticket; parent: number | null } | null> {
  const raw = await fetchIssue(repo, number);
  if (raw === null) return null;
  const parent = Number(/\/issues\/(\d+)$/.exec(raw.parent_issue_url ?? '')?.[1]);
  const labels = labelNames(raw);
  const open = isOpenState(raw.state);
  const assignee = raw.assignee?.login ?? raw.assignees?.[0]?.login ?? null;
  const blockers = await fetchBlockers(repo, raw);
  const blockedBy = blockers.map((blocker) => blocker.number);
  const openBlockers = blockers
    .filter((blocker) => blocker.open ?? true)
    .map((blocker) => blocker.number);
  const ticket: Ticket = {
    number: raw.number,
    title: raw.title,
    url: issueUrl(raw, repo),
    body: raw.body ?? '',
    type: ticketType(labels, typePrefix),
    labels,
    open,
    assignee,
    blockedBy,
    openBlockers,
    state: ticketStateOf(open, openBlockers, assignee),
  };
  return { ticket, parent: Number.isSafeInteger(parent) && parent > 0 ? parent : null };
}

interface Fallbacks {
  maps: number[];
  rateLimited: boolean;
  unattachedTickets: Array<{ mapNumber: number; ticketNumbers: number[] }>;
}

async function fetchChildren(repo: string, map: { number: number; body?: string | null }, fallbacks: Fallbacks): Promise<RawIssue[]> {
  const numbers = parseChildNumbers(map.body ?? '', repo).filter((number) => number !== map.number);
  let subIssues: RawIssue[];
  subIssueWatcher.resetBodyIssues(repo, map.number);
  try {
    subIssues = await subIssueWatcher.fetch(repo, map.number);
  } catch (error) {
    subIssueWatcher.clear(repo, map.number);
    if (numbers.length > 0) {
      fallbacks.maps.push(map.number);
      if (ghProblem(error) === RATE_LIMIT_WARNING) fallbacks.rateLimited = true;
    }
    const fetched = await pool(numbers, 8, (number) => subIssueWatcher.fetchBodyIssue(repo, map.number, number));
    return fetched.filter((issue): issue is RawIssue => issue !== null);
  }

  const attached = new Set(subIssues.map((issue) => issue.number));
  const unattachedNumbers = numbers.filter((number) => !attached.has(number));
  if (unattachedNumbers.length > 0) {
    fallbacks.unattachedTickets.push({ mapNumber: map.number, ticketNumbers: unattachedNumbers });
  }
  const fetched = await pool(unattachedNumbers, 8, (number) => subIssueWatcher.fetchBodyIssue(repo, map.number, number));
  return [...subIssues, ...fetched.filter((issue): issue is RawIssue => issue !== null)];
}

export interface FetchResult {
  maps: WayfinderMap[];
  warnings: string[];
}

/** The map issue as `gh issue list` returns it. */
interface MapIssue {
  number: number;
  title: string;
  url?: string;
  body?: string | null;
  state: string;
  updatedAt?: string | null;
  closedAt?: string | null;
}

export interface MapListOptions extends FetchOptions {
  /** Hand-made settle choices for this repository. */
  choices?: SettleChoices;
  /** Settled maps to read in full anyway, because someone opened them. */
  expand?: readonly number[];
  /** Tickets each map had when last read, so the idle rule can see them without reading the map again. */
  knownTickets?: ReadonlyMap<number, readonly number[]>;
  now?: Date;
}

/** GitHub search stops at 1000 results. Past that Wayfinder can't tell what went quiet, so nothing settles as idle. */
const SEARCH_CAP = 1000;

const RECENT_QUERY = `query($q: String!, $endCursor: String) {
  search(query: $q, type: ISSUE, first: 100, after: $endCursor) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes { ... on Issue { number parent { number } } }
  }
}`;

/**
 * Issues in `repo` updated since `since`, and the issues they are sub-issues of, or null when there
 * are too many to tell. One paginated GraphQL search.
 */
async function recentlyUpdated(repo: string, since: Date): Promise<Set<number> | null> {
  const output = await gh([
    'api',
    'graphql',
    '--paginate',
    '-f',
    `query=${RECENT_QUERY}`,
    '-f',
    `q=repo:${repo} is:issue updated:>=${since.toISOString().slice(0, 10)}`,
    '--jq',
    '"count \\(.data.search.issueCount)", (.data.search.nodes[] | "\\(.number) \\(.parent.number // 0)")',
  ]);
  const numbers = new Set<number>();
  for (const line of output.split(/\r?\n/)) {
    const [first = '', second = ''] = line.trim().split(' ');
    if (first === 'count') {
      if (Number(second) > SEARCH_CAP) return null;
      continue;
    }
    for (const number of [Number(first), Number(second)]) if (Number.isSafeInteger(number) && number > 0) numbers.add(number);
  }
  return numbers;
}

/**
 * Read every wayfinder map in `repo`. Active maps come with their tickets, states and blocker edges;
 * settled ones (see `settlementOf`) come as their issue alone, until someone opens them.
 */
export async function fetchMaps(options: MapListOptions): Promise<FetchResult> {
  const { repo, mapLabel } = options;
  const now = options.now ?? new Date();
  const choices = options.choices ?? {};
  const expand = new Set(options.expand ?? []);
  const warnings: string[] = [];
  const fallbacks: Fallbacks = { maps: [], rateLimited: false, unattachedTickets: [] };

  const mapIssues = await ghJson<MapIssue[]>([
    'issue',
    'list',
    '--repo',
    repo,
    '--label',
    mapLabel,
    '--state',
    'all',
    '--limit',
    '100',
    '--json',
    'number,title,url,body,state,updatedAt,closedAt',
  ]);

  if (mapIssues.length === 0) {
    warnings.push(`No maps in ${repo} yet. Wayfinder looks for issues labeled ${mapLabel}.`);
  }
  subIssueWatcher.retainMaps(repo, mapIssues.map((map) => map.number));

  const facts = (issue: MapIssue): MapIssueFacts => ({
    open: isOpenState(issue.state),
    closedAt: issue.closedAt ?? null,
    updatedAt: issue.updatedAt ?? null,
  });
  // Only ask what changed lately when some open map has itself gone quiet.
  const quiet = mapIssues.some((issue) => choices[issue.number] === undefined && isIdleCandidate(facts(issue), now));
  let recent: Set<number> | null = new Set();
  if (quiet) {
    try {
      recent = await recentlyUpdated(repo, idleCutoff(now));
    } catch {
      recent = null;
    }
  }
  const ticketsChanged = (issue: MapIssue): boolean => {
    if (recent === null) return true;
    // A sub-issue names the map as its parent; a ticket only listed in the body is matched by number.
    const tickets = [issue.number, ...parseChildNumbers(issue.body ?? '', repo), ...(options.knownTickets?.get(issue.number) ?? [])];
    return tickets.some((number) => recent.has(number));
  };

  const maps = await pool(mapIssues, options.concurrency ?? 6, async (mapIssue): Promise<WayfinderMap> => {
    const issueFacts = facts(mapIssue);
    const settled = settlementOf(issueFacts, choices[mapIssue.number], ticketsChanged(mapIssue), now);
    if (settled !== null && !expand.has(mapIssue.number)) return settledMap(repo, mapIssue, settled);
    return { ...(await loadMap(options, mapIssue, fallbacks)), settled };
  });

  maps.sort((a, b) => Number(b.open) - Number(a.open) || a.number - b.number);
  return { maps, warnings: [...warnings, ...fallbackWarnings(fallbacks)] };
}

/** What the maps' ticket reads had to fall back on, in words. */
function fallbackWarnings(fallbacks: Fallbacks): string[] {
  const warnings = fallbacks.maps.length > 0 ? [fallbackWarning(fallbacks.maps.sort((a, b) => a - b), fallbacks.rateLimited)] : [];
  return [
    ...warnings,
    ...fallbacks.unattachedTickets
      .sort((a, b) => a.mapNumber - b.mapNumber)
      .map(({ mapNumber, ticketNumbers }) => unattachedTicketsWarning(mapNumber, ticketNumbers)),
  ];
}

/** Read the tickets of maps that were listed settled, keeping their settlement. */
export async function fetchMapDetails(options: FetchOptions, maps: readonly WayfinderMap[]): Promise<FetchResult> {
  const fallbacks: Fallbacks = { maps: [], rateLimited: false, unattachedTickets: [] };
  const loaded = await pool(maps, options.concurrency ?? 6, async (map) => ({
    ...(await loadMap(options, { number: map.number, title: map.title, url: map.url, body: map.body, state: map.open ? 'open' : 'closed' }, fallbacks)),
    settled: map.settled,
  }));
  return { maps: loaded, warnings: fallbackWarnings(fallbacks) };
}

/** A settled map as the list shows it: its issue, without a single ticket read. */
function settledMap(repo: string, mapIssue: MapIssue, settled: MapSettlement): WayfinderMap {
  return {
    number: mapIssue.number,
    title: mapIssue.title,
    url: issueUrl(mapIssue, repo),
    body: mapIssue.body ?? '',
    open: isOpenState(mapIssue.state),
    sections: parseMapBody(mapIssue.body ?? ''),
    tickets: [],
    outside: [],
    criticalPath: { tickets: [], remaining: 0 },
    settled,
    ticketsLoaded: false,
  };
}

/** One map with its tickets, states and blocker edges. */
async function loadMap(options: FetchOptions, mapIssue: MapIssue, fallbacks: Fallbacks): Promise<WayfinderMap> {
  const { repo, typePrefix } = options;
  const concurrency = options.concurrency ?? 6;
  const children = await fetchChildren(repo, mapIssue, fallbacks);
  const openByNumber = new Map(children.map((child) => [child.number, isOpenState(child.state)]));

  const blockerLists = await pool(children, concurrency, (child) => fetchBlockers(repo, child));

  // Issues off this map on either side of a dependency: blockers above it, dependents below.
  const onMap = new Set(children.map((child) => child.number));
  const outsideRaw = new Map<number, RawIssue | null>();
  const blocks = new Map<number, number[]>();
  const waitsOn = new Map<number, number[]>();
  const dependentsOnMap = new Map<number, number>();
  const link = (store: Map<number, number[]>, key: number, value: number): void => {
    store.set(key, [...(store.get(key) ?? []), value]);
  };

  children.forEach((child, index) => {
    for (const blocker of blockerLists[index] ?? []) {
      if (onMap.has(blocker.number)) {
        dependentsOnMap.set(blocker.number, (dependentsOnMap.get(blocker.number) ?? 0) + 1);
        continue;
      }
      link(blocks, blocker.number, child.number);
      if (blocker.raw !== undefined || !outsideRaw.has(blocker.number)) outsideRaw.set(blocker.number, blocker.raw ?? null);
    }
  });

  // Only ask the tickets whose blocking count says a dependent lives off the map.
  const blockingElsewhere = children.filter(
    (child) => (child.issue_dependencies_summary?.total_blocking ?? 0) > (dependentsOnMap.get(child.number) ?? 0),
  );
  const blockingLists = await pool(blockingElsewhere, concurrency, (child) => fetchBlocking(repo, child.number));
  blockingElsewhere.forEach((child, index) => {
    for (const dependent of blockingLists[index] ?? []) {
      if (onMap.has(dependent.number)) continue;
      link(waitsOn, dependent.number, child.number);
      outsideRaw.set(dependent.number, dependent);
    }
  });

  const missing = [...outsideRaw].filter(([, raw]) => raw === null).map(([number]) => number);
  for (const raw of await pool(missing, concurrency, (number) => fetchIssue(repo, number))) {
    if (raw !== null) outsideRaw.set(raw.number, raw);
  }
  const outsideIssues = [...outsideRaw.values()].filter((raw): raw is RawIssue => raw !== null);
  for (const raw of outsideIssues) openByNumber.set(raw.number, isOpenState(raw.state));
  // Their own blockers too, so they open in the panel like any ticket.
  const outsideBlockers = await pool(outsideIssues, concurrency, (raw) => fetchBlockers(repo, raw));
  const outside = outsideIssues.map((raw, index) =>
    toOutsideTicket(raw, repo, {
      blocks: blocks.get(raw.number) ?? [],
      waitsOn: waitsOn.get(raw.number) ?? [],
      blockers: (outsideBlockers[index] ?? []).map((blocker) => ({
        number: blocker.number,
        open: blocker.open ?? openByNumber.get(blocker.number) ?? true,
      })),
      typePrefix,
    }),
  );

  const tickets = children.map((child, index): Ticket => {
    const labels = labelNames(child);
    const open = isOpenState(child.state);
    const assignee = child.assignee?.login ?? child.assignees?.[0]?.login ?? null;
    const blockers = blockerLists[index] ?? [];
    const blockedBy = blockers.map((blocker) => blocker.number);
    // Trust what the dependency read said; otherwise ask what we fetched, and assume open
    // if the blocker lives somewhere we cannot see.
    const openBlockers = blockers
      .filter((blocker) => blocker.open ?? openByNumber.get(blocker.number) ?? true)
      .map((blocker) => blocker.number);
    return {
      number: child.number,
      title: child.title,
      url: issueUrl(child, repo),
      body: child.body ?? '',
      type: ticketType(labels, typePrefix),
      labels,
      open,
      assignee,
      blockedBy,
      openBlockers,
      state: ticketStateOf(open, openBlockers, assignee),
    };
  });

  return {
    number: mapIssue.number,
    title: mapIssue.title,
    url: issueUrl(mapIssue, repo),
    body: mapIssue.body ?? '',
    open: isOpenState(mapIssue.state),
    sections: parseMapBody(mapIssue.body ?? ''),
    tickets,
    outside,
    criticalPath: criticalPath(tickets),
    settled: null,
    ticketsLoaded: true,
  };
}

interface RawRef {
  ref: string;
}

interface RawCompare {
  files?: Array<{ filename: string }>;
  commits?: Array<{ commit: { committer?: { date?: string } | null } }>;
}

interface RawCommit {
  commit?: { committer?: { date?: string } | null } | null;
  files?: Array<{ filename: string }>;
}

/**
 * What the branch holds. Normally that is its diff against the default branch, but a
 * prototype whose commits have landed on the default branch compares to nothing, so fall
 * back to its tip commit: behind or merged, the branch still holds the prototype.
 */
export function branchFacts(
  compare: { files?: readonly { filename: string }[]; commits?: readonly { commit: { committer?: { date?: string } | null } }[] } | null,
  tip: { commit?: { committer?: { date?: string } | null } | null; files?: readonly { filename: string }[] } | null,
): { updatedAt: string | null; files: string[] } {
  const compared = (compare?.files ?? []).map((file) => file.filename);
  return {
    updatedAt: compare?.commits?.at(-1)?.commit.committer?.date ?? tip?.commit?.committer?.date ?? null,
    files: compared.length > 0 ? compared : (tip?.files ?? []).map((file) => file.filename),
  };
}

interface RawComment {
  body?: string | null;
}

/** Branch names under `prototype/` whose ticket sits on `map`. */
export function mapPrototypeBranches(refs: readonly string[], map: Pick<WayfinderMap, 'tickets'>): string[] {
  const numbers = new Set(map.tickets.map((ticket) => ticket.number));
  return refs
    .map((ref) => ref.replace(/^refs\/heads\//, ''))
    .filter((branch) => {
      const number = prototypeTicketNumber(branch);
      return number !== null && numbers.has(number);
    });
}

/** Newest first; branches GitHub could not date go last. */
export function sortPrototypes(prototypes: Prototype[]): Prototype[] {
  return prototypes.sort(
    (a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || a.ticketNumber - b.ticketNumber,
  );
}

/** Each map paired with the prototype branches belonging to its tickets, maps without any dropped. */
export function branchesByMap(
  refs: readonly string[],
  maps: readonly WayfinderMap[],
): Array<{ map: WayfinderMap; branches: string[] }> {
  return maps
    .map((map) => ({ map, branches: mapPrototypeBranches(refs, map) }))
    .filter((entry) => entry.branches.length > 0);
}

/** Every prototype branch on `map`, with its files, last commit and, for closed tickets, the verdict. */
export async function fetchPrototypes(repo: string, map: WayfinderMap): Promise<Prototype[]> {
  return fetchMapPrototypes(repo, [map]);
}

/** The same, across every map in the repository, so one read answers the whole repository page. */
export async function fetchAllPrototypes(repo: string, maps: readonly WayfinderMap[]): Promise<Prototype[]> {
  return fetchMapPrototypes(repo, maps);
}

async function fetchMapPrototypes(repo: string, maps: readonly WayfinderMap[]): Promise<Prototype[]> {
  const refs = await ghJson<RawRef[]>(['api', `repos/${repo}/git/matching-refs/heads/${PROTOTYPE_BRANCH_PREFIX}`]);
  const work = branchesByMap(
    refs.map((ref) => ref.ref),
    maps,
  ).flatMap((entry) => entry.branches.map((branch) => ({ map: entry.map, branch })));
  if (work.length === 0) return [];

  const [base, shots] = await Promise.all([
    gh(['api', `repos/${repo}`, '-q', '.default_branch']).then((name) => name.trim()),
    prototypeShots(repo),
  ]);

  const prototypes = await pool(work, 6, async ({ map, branch }): Promise<Prototype> => {
    const ticketNumber = prototypeTicketNumber(branch) ?? 0;
    const ticket = map.tickets.find((candidate) => candidate.number === ticketNumber);
    const [compare, comments] = await Promise.all([
      ghJson<RawCompare>(['api', `repos/${repo}/compare/${base}...${branch}`]).catch(() => null),
      ticket?.open === false
        ? ghJson<RawComment[]>(['api', `repos/${repo}/issues/${String(ticketNumber)}/comments?per_page=100`]).catch(() => [])
        : Promise.resolve([]),
    ]);
    const tip =
      (compare?.files ?? []).length > 0
        ? null
        : await ghJson<RawCommit>(['api', `repos/${repo}/commits/${encodeURIComponent(branch)}`]).catch(() => null);
    const { updatedAt, files } = branchFacts(compare, tip);
    const preview = await previewOf(repo, branch, files);
    return {
      branch,
      ticketNumber,
      mapNumber: map.number,
      url: `https://github.com/${repo}/tree/${branch}`,
      updatedAt,
      files,
      ...preview,
      verdict: verdictComment(comments.map((comment) => comment.body)),
      variants: await variantsOf(repo, branch, ticketNumber, files, preview, shots),
    };
  });

  return sortPrototypes(prototypes);
}

/** The variant screenshots a repository keeps on its default branch (#81), or none. */
async function prototypeShots(repo: string): Promise<string[]> {
  try {
    const entries = await ghJson<Array<{ name?: string; type?: string }>>(['api', `repos/${repo}/contents/${PROTOTYPE_SHOTS_DIR}`]);
    return entries.filter((entry) => entry.type === 'file' && typeof entry.name === 'string').map((entry) => entry.name as string);
  } catch {
    return [];
  }
}

/** The prototype's variants, named from its design canvas's config when it has one. */
async function variantsOf(
  repo: string,
  branch: string,
  ticketNumber: number,
  files: readonly string[],
  preview: { openable: string[]; preview: string | null },
  shots: readonly string[],
): Promise<PrototypeVariant[]> {
  const configFile =
    files.find((file) => /(?:^|\/)config\.js$/.test(file)) ??
    (preview.preview !== null && /(?:^|\/)index\.html$/i.test(preview.preview) ? preview.preview.replace(/index\.html$/i, 'config.js') : null);
  const configSource = configFile === null ? null : await fetchBranchFile(repo, branch, configFile).then((bytes) => bytes.toString('utf8'), () => null);
  const canvasDir = configFile === null ? '' : configFile.replace(/config\.js$/, '');
  const pages = [...new Set([...preview.openable, ...files.filter(isHtml)])];
  return prototypeVariantInfo(ticketNumber, shots, configSource, canvasDir, pages);
}

/** One file off the default branch, as raw bytes. */
export async function fetchDefaultBranchFile(repo: string, file: string): Promise<Buffer> {
  const path = file.split('/').map(encodeURIComponent).join('/');
  return ghBytes(['api', '-H', 'Accept: application/vnd.github.raw', `repos/${repo}/contents/${path}`]);
}

/** What the branch can show running: its standalone HTML files, and the one to lead with. */
async function previewOf(repo: string, branch: string, files: readonly string[]): Promise<{ openable: string[]; preview: string | null }> {
  const boards = unlistedCanvasBoards(files);
  const [changed, boardsOnBranch, hasSnapshot] = await Promise.all([
    openableFiles(repo, branch, files),
    openableFiles(repo, branch, boards),
    snapshotExists(repo, branch),
  ]);
  const openable = [...boardsOnBranch, ...changed];
  return { openable, preview: pickPreview(hasSnapshot, openable, [...files, ...boardsOnBranch]) };
}

/** Whether the branch carries a runnable snapshot. Read directly, since the diff may not list it. */
async function snapshotExists(repo: string, branch: string): Promise<boolean> {
  try {
    return isSelfContained((await fetchBranchFile(repo, branch, PROTOTYPE_SNAPSHOT_FILE)).toString('utf8'));
  } catch {
    return false;
  }
}

/** Of a branch's HTML files, the ones that stand alone well enough for the page to serve them. */
async function openableFiles(repo: string, branch: string, files: readonly string[]): Promise<string[]> {
  const html = files.filter(isHtml);
  const checked = await pool(html, 4, async (file) => {
    try {
      return isSelfContained((await fetchBranchFile(repo, branch, file)).toString('utf8'));
    } catch {
      return false;
    }
  });
  return html.filter((_, index) => checked[index] === true);
}

/** One file off a branch, as raw bytes. */
export async function fetchBranchFile(repo: string, branch: string, file: string): Promise<Buffer> {
  const path = file.split('/').map(encodeURIComponent).join('/');
  return ghBytes([
    'api',
    '-H',
    'Accept: application/vnd.github.raw',
    `repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
  ]);
}
