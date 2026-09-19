import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { parseBlockedByLine, parseChildNumbers, parseMapBody } from './mapBody.js';
import { PROTOTYPE_BRANCH_PREFIX, prototypeTicketNumber } from './prototypes.js';
import { TICKET_TYPES } from './types.js';
import type { Prototype, Ticket, TicketState, TicketType, WayfinderMap } from './types.js';

const run = promisify(execFile);

export class GhError extends Error {
  constructor(
    message: string,
    readonly args: string[],
  ) {
    super(message);
    this.name = 'GhError';
  }
}

/** Run `gh` and return stdout. Throws GhError with gh's own stderr, which is usually the useful part. */
export async function gh(args: string[]): Promise<string> {
  return (await ghBytes(args)).toString('utf8');
}

/** `gh` stdout as raw bytes, for files that may not be text. */
export async function ghBytes(args: string[]): Promise<Buffer> {
  try {
    const { stdout } = await run('gh', args, { maxBuffer: 64 * 1024 * 1024, windowsHide: true, encoding: 'buffer' });
    return stdout;
  } catch (error) {
    const stderr = (error as { stderr?: unknown }).stderr;
    const text = Buffer.isBuffer(stderr) ? stderr.toString('utf8') : typeof stderr === 'string' ? stderr : '';
    const reason = text.trim() || (error as Error).message;
    throw new GhError(reason, args);
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
  });
  return stdout.trim();
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
  issue_dependencies_summary?: { blocked_by?: number } | null;
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

function issueUrl(raw: RawIssue, repo: string): string {
  return raw.html_url ?? raw.url ?? `https://github.com/${repo}/issues/${raw.number}`;
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
      return blockers.map((blocker) => ({ number: blocker.number, open: isOpenState(blocker.state) }));
    }
  } catch {
    // Dependencies unavailable on this repo. Fall through to the body line.
  }
  // The body line names numbers only, so the state comes from the map's own tickets.
  return parseBlockedByLine(raw.body ?? '').map((number) => ({ number, open: null }));
}

interface Blocker {
  number: number;
  /** null when the source did not say, e.g. a `Blocked by:` line. */
  open: boolean | null;
}

async function fetchChildren(repo: string, map: RawIssue, warnings: string[]): Promise<RawIssue[]> {
  try {
    return await ghJson<RawIssue[]>([
      'api',
      '--paginate',
      `repos/${repo}/issues/${map.number}/sub_issues?per_page=100`,
    ]);
  } catch {
    const numbers = parseChildNumbers(map.body ?? '', repo).filter((number) => number !== map.number);
    if (numbers.length > 0) {
      warnings.push(`Map #${map.number}: sub-issues unavailable, read ${numbers.length} children from the map body.`);
    }
    const fetched = await pool(numbers, 8, (number) => fetchIssue(repo, number));
    return fetched.filter((issue): issue is RawIssue => issue !== null);
  }
}

export interface FetchResult {
  maps: WayfinderMap[];
  warnings: string[];
}

/** Read every wayfinder map in `repo`, with its tickets, states and blocker edges. */
export async function fetchMaps(options: FetchOptions): Promise<FetchResult> {
  const { repo, mapLabel, typePrefix } = options;
  const concurrency = options.concurrency ?? 6;
  const warnings: string[] = [];

  const mapIssues = await ghJson<RawIssue[]>([
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
    'number,title,url,body,state',
  ]);

  if (mapIssues.length === 0) {
    warnings.push(`No issue in ${repo} carries the ${mapLabel} label.`);
  }

  const maps = await pool(mapIssues, concurrency, async (mapIssue): Promise<WayfinderMap> => {
    const children = await fetchChildren(repo, mapIssue, warnings);
    const openByNumber = new Map(children.map((child) => [child.number, isOpenState(child.state)]));

    const blockerLists = await pool(children, concurrency, (child) => fetchBlockers(repo, child));

    const tickets = children.map((child, index): Ticket => {
      const labels = labelNames(child);
      const open = isOpenState(child.state);
      const assignee = child.assignee?.login ?? child.assignees?.[0]?.login ?? null;
      const blockers = blockerLists[index] ?? [];
      const blockedBy = blockers.map((blocker) => blocker.number);
      // Trust what the dependency read said; otherwise ask this map, and assume open if
      // the blocker lives somewhere we cannot see.
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
    };
  });

  maps.sort((a, b) => Number(b.open) - Number(a.open) || a.number - b.number);
  return { maps, warnings };
}

interface RawRef {
  ref: string;
}

interface RawCompare {
  files?: Array<{ filename: string }>;
  commits?: Array<{ commit: { committer?: { date?: string } | null } }>;
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

/** Every prototype branch on `map`, with its files, last commit and, for closed tickets, the verdict. */
export async function fetchPrototypes(repo: string, map: WayfinderMap): Promise<Prototype[]> {
  const refs = await ghJson<RawRef[]>(['api', `repos/${repo}/git/matching-refs/heads/${PROTOTYPE_BRANCH_PREFIX}`]);
  const branches = mapPrototypeBranches(
    refs.map((ref) => ref.ref),
    map,
  );
  if (branches.length === 0) return [];

  const base = (await gh(['api', `repos/${repo}`, '-q', '.default_branch'])).trim();

  const prototypes = await pool(branches, 6, async (branch): Promise<Prototype> => {
    const ticketNumber = prototypeTicketNumber(branch) ?? 0;
    const ticket = map.tickets.find((candidate) => candidate.number === ticketNumber);
    const [compare, comments] = await Promise.all([
      ghJson<RawCompare>(['api', `repos/${repo}/compare/${base}...${branch}`]).catch(() => null),
      ticket?.open === false
        ? ghJson<RawComment[]>(['api', `repos/${repo}/issues/${String(ticketNumber)}/comments?per_page=100`]).catch(() => [])
        : Promise.resolve([]),
    ]);
    return {
      branch,
      ticketNumber,
      url: `https://github.com/${repo}/tree/${branch}`,
      updatedAt: compare?.commits?.at(-1)?.commit.committer?.date ?? null,
      files: (compare?.files ?? []).map((file) => file.filename),
      verdict: comments.at(-1)?.body?.trim() || null,
    };
  });

  return sortPrototypes(prototypes);
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
