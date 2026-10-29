import {
  assignLayers,
  criticalPath,
  isMapShown,
  mapVisibility,
  parseBlockedByLine,
  parseChildNumbers,
  parseMapBody,
  ticketStateOf,
  TICKET_TYPES,
} from '../shared';
import type { MapSections, Ticket } from '../shared';
import type { UnavailableFollow } from './unreadableFollows';

export type MapRef = { repo: string; number: number };
export type MapViewer = { login: string; follows: readonly MapRef[] };
export type MapSummary = MapRef & {
  title: string;
  body: string;
  url: string;
  author: string | null;
  open: boolean;
  updatedAt: string;
  completed: number;
  total: number;
};
export type MapDetail = MapSummary & {
  sections: MapSections;
  tickets: Ticket[];
  layers: Record<number, number>;
  critical: { tickets: number[]; remaining: number };
  warnings: string[];
};
export type Comment = {
  id: number;
  author: string;
  body: string;
  createdAt: string;
  url: string;
};
export type TicketDetail = {
  ticket: Ticket;
  needs: Ticket[];
  unblocks: Ticket[];
  comments: Comment[];
  warnings: string[];
};
type Issue = {
  number: number;
  title: string;
  body: string;
  html_url: string;
  state: string;
  user: { login: string } | null;
  assignee: { login: string } | null;
  labels: string[];
  updated_at: string;
  pull_request: boolean;
  parent_issue_url: string;
  sub_issues_summary: { total: number; completed: number };
};
export class GithubError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly rateLimited = false,
  ) {
    super(message);
  }
}
export function mapKey(ref: MapRef): string {
  return `${ref.repo.toLowerCase()}#${ref.number}`;
}
export function mayViewMap(
  map: Pick<MapSummary, 'repo' | 'number' | 'author' | 'body'>,
  viewer: MapViewer,
): boolean {
  return isMapShown(
    {
      number: map.number,
      author: map.author,
      visibility: mapVisibility(map.body),
    },
    {
      login: viewer.login,
      follows: viewer.follows
        .filter((ref) => ref.repo.toLowerCase() === map.repo.toLowerCase())
        .map((ref) => ref.number),
    },
  );
}
const object = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('GitHub sent an unreadable response.');
  return value as Record<string, unknown>;
};
const string = (value: unknown): string =>
  typeof value === 'string' ? value : '';
function issue(value: unknown): Issue {
  const raw = object(value);
  if (
    !Number.isSafeInteger(raw.number) ||
    Number(raw.number) < 1 ||
    typeof raw.title !== 'string' ||
    !['open', 'closed'].includes(string(raw.state))
  )
    throw new Error('GitHub sent an unreadable issue.');
  const user =
    raw.user == null ? null : { login: string(object(raw.user).login) };
  const assigned =
    raw.assignee ?? (Array.isArray(raw.assignees) ? raw.assignees[0] : null);
  const summary =
    raw.sub_issues_summary == null ? {} : object(raw.sub_issues_summary);
  return {
    number: Number(raw.number),
    title: raw.title,
    body: string(raw.body),
    html_url: string(raw.html_url),
    state: string(raw.state),
    user,
    assignee:
      assigned == null ? null : { login: string(object(assigned).login) },
    labels: Array.isArray(raw.labels)
      ? raw.labels.map((label: unknown) =>
          typeof label === 'string' ? label : string(object(label).name),
        )
      : [],
    updated_at: string(raw.updated_at),
    pull_request: raw.pull_request != null,
    parent_issue_url: string(raw.parent_issue_url),
    sub_issues_summary: {
      total: Number(summary.total) || 0,
      completed: Number(summary.completed) || 0,
    },
  };
}
function summary(raw: Issue, repo: string): MapSummary {
  return {
    repo,
    number: raw.number,
    title: raw.title,
    body: raw.body,
    url: `https://github.com/${repo}/issues/${raw.number}`,
    author: raw.user?.login ?? null,
    open: raw.state === 'open',
    updatedAt: raw.updated_at,
    completed: raw.sub_issues_summary.completed,
    total: raw.sub_issues_summary.total,
  };
}
function ticket(
  raw: Issue,
  repo: string,
  blockers: readonly { number: number; open: boolean }[],
): Ticket {
  const open = raw.state === 'open';
  const assignee = raw.assignee?.login ?? null;
  const blockedBy = blockers.map((b) => b.number);
  const openBlockers = blockers.filter((b) => b.open).map((b) => b.number);
  return {
    number: raw.number,
    title: raw.title,
    body: raw.body,
    url: `https://github.com/${repo}/${raw.pull_request ? 'pull' : 'issues'}/${raw.number}`,
    open,
    assignee,
    blockedBy,
    openBlockers,
    state: ticketStateOf(open, openBlockers, assignee),
    labels: raw.labels,
    type:
      TICKET_TYPES.find((kind) => raw.labels.includes(`wayfinder:${kind}`)) ??
      null,
    updatedAt: raw.updated_at || null,
  };
}
function repoOf(url: string): string | null {
  const match = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/\d+$/.exec(
    url,
  );
  return match?.[1] ?? null;
}
export function validRef(value: unknown): value is MapRef {
  if (typeof value !== 'object' || value === null) return false;
  const ref = value as Record<string, unknown>;
  return (
    typeof ref.repo === 'string' &&
    /^[\w.-]+\/[\w.-]+$/.test(ref.repo) &&
    ref.repo.split('/').every((part) => part !== '.' && part !== '..') &&
    Number.isSafeInteger(ref.number) &&
    Number(ref.number) > 0
  );
}
async function pool<T, U>(
  values: readonly T[],
  work: (value: T) => Promise<U>,
): Promise<U[]> {
  const result: U[] = new Array(values.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, values.length) }, async () => {
      while (next < values.length) {
        const index = next++;
        const value = values[index];
        if (value !== undefined) result[index] = await work(value);
      }
    }),
  );
  return result;
}

/** REST-only adapter: phone reads GitHub directly and never imports the desktop's Node/gh client. */
export class MobileGithub {
  constructor(
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async get(path: string, signal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timer = setTimeout(abort, 20_000);
    try {
      const response = await this.fetcher(`https://api.github.com${path}`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2026-03-10',
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        const rateLimited =
          response.status === 429 ||
          (response.status === 403 &&
            (response.headers.get('x-ratelimit-remaining') === '0' ||
              response.headers.has('retry-after')));
        const message =
          response.status === 401
            ? 'Your GitHub sign-in is no longer valid. Sign out in Settings and sign in again.'
            : response.status === 403 || response.status === 429
              ? rateLimited
                ? 'GitHub’s rate limit was reached. Try again in a few minutes.'
                : 'GitHub did not allow access. Check the account and organization permissions.'
              : response.status === 404
                ? 'This issue or repository is no longer available to your GitHub account.'
                : 'Couldn’t reach GitHub. Try again.';
        throw new GithubError(response.status, message, rateLimited);
      }
      return (await response.json()) as unknown;
    } catch (error) {
      if (error instanceof GithubError) throw error;
      if (signal?.aborted) throw error;
      throw new Error(
        'Couldn’t reach GitHub. Check your connection and try again.',
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  private async list(path: string, signal?: AbortSignal): Promise<unknown[]> {
    const all: unknown[] = [];
    for (let page = 1; ; page++) {
      const value = await this.get(
        `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`,
        signal,
      );
      if (!Array.isArray(value))
        throw new Error('GitHub sent an unreadable list.');
      all.push(...value);
      if (value.length < 100) return all;
    }
  }
  /** Discover only maps their authors have explicitly made public. */
  async publicMaps(
    repo: string,
    login: string,
    signal?: AbortSignal,
  ): Promise<MapSummary[]> {
    if (!validRef({ repo, number: 1 }))
      throw new GithubError(422, 'Look in a repository: owner/repo');
    const values = await this.list(
      `/repos/${repo}/issues?labels=wayfinder%3Amap&state=all`,
      signal,
    );
    return values
      .map(issue)
      .filter(
        (item) =>
          !item.pull_request &&
          item.labels.includes('wayfinder:map') &&
          !!item.user?.login &&
          item.user.login.toLowerCase() !== login.toLowerCase() &&
          mapVisibility(item.body) === 'public',
      )
      .map((item) => summary(item, repo));
  }

  async sharedMap(
    ref: MapRef,
    signal?: AbortSignal,
  ): Promise<MapSummary | null> {
    if (!validRef(ref)) return null;
    const raw = issue(
      await this.get(`/repos/${ref.repo}/issues/${ref.number}`, signal),
    );
    if (raw.pull_request || !raw.labels.includes('wayfinder:map')) return null;
    return summary(raw, ref.repo);
  }
  async assertMapAccess(
    ref: MapRef,
    viewer: MapViewer,
    signal?: AbortSignal,
  ): Promise<void> {
    const map = await this.sharedMap(ref, signal);
    if (!map || !mayViewMap(map, viewer))
      throw new GithubError(
        404,
        'This issue or repository is no longer available to your GitHub account.',
      );
  }
  async maps(
    login: string,
    followed: readonly MapRef[] = [],
    signal?: AbortSignal,
  ): Promise<{
    maps: MapSummary[];
    warnings: string[];
    unavailable: UnavailableFollow[];
    hidden: MapSummary[];
  }> {
    const found = new Map<string, MapSummary>();
    for (let page = 1; ; page++) {
      const raw = object(
        await this.get(
          `/search/issues?q=${encodeURIComponent(`is:issue label:"wayfinder:map" author:${login}`)}&sort=updated&order=desc&per_page=100&page=${page}`,
          signal,
        ),
      );
      if (raw.incomplete_results === true || Number(raw.total_count) > 1000)
        throw new Error(
          'GitHub returned an incomplete map search. Pull to refresh and try again.',
        );
      if (!Array.isArray(raw.items))
        throw new Error('GitHub sent an unreadable map list.');
      for (const value of raw.items) {
        const item = issue(value);
        const repo = repoOf(item.html_url);
        if (
          repo &&
          !item.pull_request &&
          item.labels.includes('wayfinder:map') &&
          isMapShown(
            {
              number: item.number,
              author: item.user?.login ?? null,
              visibility: mapVisibility(item.body),
            },
            { login, follows: [] },
          )
        ) {
          const map = summary(item, repo);
          found.set(mapKey(map), map);
        }
      }
      if (raw.items.length < 100 || found.size >= Number(raw.total_count))
        break;
    }
    const warnings: string[] = [];
    const unavailable: UnavailableFollow[] = [];
    const hidden: MapSummary[] = [];
    await pool(
      [
        ...new Map(
          followed.filter(validRef).map((ref) => [mapKey(ref), ref]),
        ).values(),
      ],
      async (ref) => {
        if (found.has(mapKey(ref))) return;
        try {
          const raw = issue(
            await this.get(`/repos/${ref.repo}/issues/${ref.number}`, signal),
          );
          if (
            raw.labels.includes('wayfinder:map') &&
            !raw.pull_request &&
            isMapShown(
              {
                number: raw.number,
                author: raw.user?.login ?? null,
                visibility: mapVisibility(raw.body),
              },
              { login, follows: [ref.number] },
            )
          )
            found.set(mapKey(ref), summary(raw, ref.repo));
          else if (
            raw.labels.includes('wayfinder:map') &&
            !raw.pull_request &&
            mapVisibility(raw.body) !== 'public' &&
            raw.user?.login?.toLowerCase() !== login.toLowerCase()
          )
            hidden.push(summary(raw, ref.repo));
          else {
            unavailable.push({ ...ref, reason: !raw.labels.includes('wayfinder:map') || raw.pull_request ? 'label' : 'issue' });
            warnings.push(
              `Followed map ${ref.repo}#${ref.number} is unavailable.`,
            );
          }
        } catch (error) {
          if (
            !(error instanceof GithubError) ||
            ![403, 404, 410].includes(error.status) ||
            error.rateLimited
          )
            throw error;
          unavailable.push(ref);
          warnings.push(
            `Followed map ${ref.repo}#${ref.number} is unavailable.`,
          );
        }
      },
    );
    return {
      maps: [...found.values()].sort(
        (a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.number - a.number,
      ),
      warnings,
      unavailable,
      hidden,
    };
  }
  private async blockers(
    repo: string,
    raw: Issue,
    warnings: string[],
    signal?: AbortSignal,
  ): Promise<{ number: number; open: boolean }[]> {
    try {
      const native = (
        await this.list(
          `/repos/${repo}/issues/${raw.number}/dependencies/blocked_by`,
          signal,
        )
      )
        .map(issue)
        .map((b) => ({ number: b.number, open: b.state === 'open' }));
      return native;
    } catch (error) {
      if (
        !(error instanceof GithubError) ||
        ![404, 410].includes(error.status)
      )
        throw error;
      warnings.push(
        `Dependencies for #${raw.number} use its Blocked by line because GitHub’s dependency endpoint is unavailable.`,
      );
    }
    return pool(parseBlockedByLine(raw.body), async (number) => {
      try {
        return {
          number,
          open:
            issue(await this.get(`/repos/${repo}/issues/${number}`, signal))
              .state === 'open',
        };
      } catch (failure) {
        if (failure instanceof GithubError && failure.status === 404)
          return { number, open: true };
        throw failure;
      }
    });
  }
  async map(
    ref: MapRef,
    signal?: AbortSignal,
    viewer?: MapViewer,
  ): Promise<MapDetail> {
    const raw = issue(
      await this.get(`/repos/${ref.repo}/issues/${ref.number}`, signal),
    );
    if (!raw.labels.includes('wayfinder:map'))
      throw new Error('This issue is not a Wayfinder map.');
    if (viewer && !mayViewMap(summary(raw, ref.repo), viewer))
      throw new GithubError(
        404,
        'This issue or repository is no longer available to your GitHub account.',
      );
    const warnings: string[] = [];
    const bodyIssues = async (numbers: number[]): Promise<Issue[]> =>
      (
        await pool(numbers, async (number) => {
          try {
            const linked = issue(
              await this.get(`/repos/${ref.repo}/issues/${number}`, signal),
            );
            if (linked.parent_issue_url) {
              try {
                if (new URL(linked.parent_issue_url).pathname.toLowerCase() !== `/repos/${ref.repo}/issues/${ref.number}`.toLowerCase()) return null;
              } catch {
                return null;
              }
            }
            return linked;
          } catch (error) {
            if (
              !(error instanceof GithubError) ||
              ![404, 410].includes(error.status)
            )
              throw error;
            warnings.push(
              `Linked ticket #${number} is unavailable and was omitted.`,
            );
            return null;
          }
        })
      ).filter((child): child is Issue => child !== null);
    let children: Issue[];
    let usedFallback = false;
    try {
      children = (
        await this.list(
          `/repos/${ref.repo}/issues/${ref.number}/sub_issues`,
          signal,
        )
      ).map(issue);
    } catch (error) {
      if (
        !(error instanceof GithubError) ||
        ![404, 410, 422].includes(error.status)
      )
        throw error;
      warnings.push(
        'GitHub’s sub-issue endpoint is unavailable. Showing tickets linked in the map body.',
      );
      usedFallback = true;
      children = await bodyIssues(
        parseChildNumbers(raw.body, ref.repo).filter(
          (number) => number !== raw.number,
        ),
      );
      if (children.length === 0 && raw.sub_issues_summary.total > 0)
        throw new Error(
          'Couldn’t load this map’s tickets from GitHub. Pull to refresh and try again.',
        );
    }
    const attached = new Set(children.map((child) => child.number));
    const unattached = (
      usedFallback ? [] : parseChildNumbers(raw.body, ref.repo)
    ).filter((number) => number !== raw.number && !attached.has(number));
    if (unattached.length) {
      const linked = await bodyIssues(unattached);
      if (linked.length) warnings.push(
        `Also showing tickets linked in the map body: ${linked.map(({ number }) => `#${number}`).join(', ')}.`,
      );
      children.push(...linked);
    }
    const tickets = await pool(
      children.filter((child) => !child.pull_request),
      async (child) =>
        ticket(
          child,
          ref.repo,
          await this.blockers(ref.repo, child, warnings, signal),
        ),
    );
    return {
      ...summary(raw, ref.repo),
      completed: tickets.filter((t) => !t.open).length,
      total: tickets.length,
      sections: parseMapBody(raw.body),
      tickets,
      layers: Object.fromEntries(assignLayers(tickets)),
      critical: criticalPath(tickets),
      warnings,
    };
  }
  async ticket(ref: MapRef, signal?: AbortSignal): Promise<TicketDetail> {
    const raw = issue(
      await this.get(`/repos/${ref.repo}/issues/${ref.number}`, signal),
    );
    const warnings: string[] = [];
    const dependencies = await this.blockers(ref.repo, raw, warnings, signal);
    const needs = await pool(dependencies, async (dep) => {
      try {
        const linked = issue(
          await this.get(`/repos/${ref.repo}/issues/${dep.number}`, signal),
        );
        return ticket(
          linked,
          ref.repo,
          await this.blockers(ref.repo, linked, warnings, signal),
        );
      } catch (error) {
        if (!(error instanceof GithubError) || error.status !== 404)
          throw error;
        return {
          number: dep.number,
          title: 'Issue unavailable',
          body: '',
          url: `https://github.com/${ref.repo}/issues/${dep.number}`,
          open: true,
          assignee: null,
          blockedBy: [],
          openBlockers: [],
          state: 'blocked',
          labels: [],
          type: null,
          updatedAt: null,
        } satisfies Ticket;
      }
    });
    let unblocks: Ticket[] = [];
    try {
      unblocks = await pool(
        (
          await this.list(
            `/repos/${ref.repo}/issues/${ref.number}/dependencies/blocking`,
            signal,
          )
        ).map(issue),
        async (linked) =>
          ticket(
            linked,
            ref.repo,
            await this.blockers(ref.repo, linked, warnings, signal),
          ),
      );
    } catch (error) {
      if (
        !(error instanceof GithubError) ||
        ![404, 410].includes(error.status)
      )
        throw error;
      warnings.push('GitHub could not list tickets this issue unblocks.');
    }
    const comments = (
      await this.list(
        `/repos/${ref.repo}/issues/${ref.number}/comments`,
        signal,
      )
    ).map((value): Comment => {
      const c = object(value);
      return {
        id: Number(c.id),
        author: c.user == null ? 'unknown' : string(object(c.user).login),
        body: string(c.body),
        createdAt: string(c.created_at),
        url: string(c.html_url),
      };
    });
    return {
      ticket: ticket(raw, ref.repo, dependencies),
      needs,
      unblocks,
      comments,
      warnings,
    };
  }
}
