import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { parseBlockedByLine, parseChildNumbers, parseMapBody } from './mapBody.js';
import { PROTOTYPE_BRANCH_PREFIX, PROTOTYPE_SHOTS_DIR, PROTOTYPE_SNAPSHOT_FILE, isHtml, isSelfContained, pickPreview, prototypeTicketNumber, prototypeVariantInfo, unlistedCanvasBoards, verdictComment } from './prototypes.js';
import { TICKET_TYPES } from './types.js';
import type { OutsideTicket, Prototype, PrototypeVariant, Ticket, TicketState, TicketType, WayfinderMap } from './types.js';

const run = promisify(execFile);

const ghEnv: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' };
delete ghEnv.GH_FORCE_TTY;

/** GitHub CLI can still decorate piped output when launched from a terminal app. */
export function plainGhOutput(output: string): string {
  return output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
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
  return plainGhOutput((await ghBytes(args)).toString('utf8'));
}

/** `gh` stdout as raw bytes, for files that may not be text. */
export async function ghBytes(args: string[]): Promise<Buffer> {
  try {
    const { stdout } = await run('gh', args, { maxBuffer: 64 * 1024 * 1024, windowsHide: true, encoding: 'buffer', env: ghEnv });
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
  const raw = await fetchIssue(repo, number);
  if (raw === null) return null;
  const labels = labelNames(raw);
  const open = isOpenState(raw.state);
  const assignee = raw.assignee?.login ?? raw.assignees?.[0]?.login ?? null;
  const blockers = await fetchBlockers(repo, raw);
  const blockedBy = blockers.map((blocker) => blocker.number);
  const openBlockers = blockers
    .filter((blocker) => blocker.open ?? true)
    .map((blocker) => blocker.number);
  return {
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
}

interface Fallbacks {
  maps: number[];
  rateLimited: boolean;
}

async function fetchChildren(repo: string, map: RawIssue, fallbacks: Fallbacks): Promise<RawIssue[]> {
  try {
    return await ghJson<RawIssue[]>([
      'api',
      '--paginate',
      `repos/${repo}/issues/${map.number}/sub_issues?per_page=100`,
    ]);
  } catch (error) {
    const numbers = parseChildNumbers(map.body ?? '', repo).filter((number) => number !== map.number);
    if (numbers.length > 0) {
      fallbacks.maps.push(map.number);
      if (ghProblem(error) === RATE_LIMIT_WARNING) fallbacks.rateLimited = true;
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
  const fallbacks: Fallbacks = { maps: [], rateLimited: false };

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
    warnings.push(`No maps in ${repo} yet. Wayfinder looks for issues labeled ${mapLabel}.`);
  }

  const maps = await pool(mapIssues, concurrency, async (mapIssue): Promise<WayfinderMap> => {
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
    };
  });

  maps.sort((a, b) => Number(b.open) - Number(a.open) || a.number - b.number);
  if (fallbacks.maps.length > 0) warnings.push(fallbackWarning(fallbacks.maps.sort((a, b) => a - b), fallbacks.rateLimited));
  return { maps, warnings };
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
