import type { HandOffStatusDto } from '../handOffTracking.js';
import { mapPath, normalizeRepo } from '../repoRoutes.js';
import type { WayfinderMap } from '../types.js';
import { DEFAULT_TIER } from './models.js';
import type { Tier } from './models.js';

/* Start a new map: which repository the composer opens on, and whether it can start a thread. */

/** What the server says about the checkout T3 Code would run the repository's threads in. */
export type WorkspaceView =
  | { status: 'ready'; path: string; canChoose: boolean }
  | { status: 'choose'; candidates: string[]; canChoose: boolean };

export const DEFAULT_NEW_MAP_TIER: Tier = DEFAULT_TIER;

export const NEW_MAP_EXAMPLES = [
  'Offline draft mode: drafts save locally and sync in the background when the network is back.',
  'Let people share a read-only link to a map.',
] as const;

const NEW_MAP_RETRY_KEY = 'wayfinder-map:new-map-retry:v1';

export function rememberNewMapRetry(repo: string, goal: string, storage: Pick<Storage, 'setItem'> = sessionStorage): void {
  const normalized = normalizeRepo(repo);
  if (normalized === null) throw new Error('Enter a valid repository before retrying a map.');
  storage.setItem(NEW_MAP_RETRY_KEY, JSON.stringify({ repo: normalized, goal }));
}

export function consumeNewMapRetryGoal(repo: string, storage: Pick<Storage, 'getItem' | 'removeItem'> = sessionStorage): string | null {
  let raw: string | null;
  try {
    raw = storage.getItem(NEW_MAP_RETRY_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const retry = value as { repo?: unknown; goal?: unknown };
    return typeof retry.repo === 'string' && retry.repo.toLowerCase() === repo.toLowerCase() && typeof retry.goal === 'string' ? retry.goal : null;
  } catch {
    return null;
  } finally {
    try {
      storage.removeItem(NEW_MAP_RETRY_KEY);
    } catch {
      // A failed cleanup does not discard the one-shot retry value.
    }
  }
}

export type NewMapHandOff = Pick<
  HandOffStatusDto,
  | 'id'
  | 'repo'
  | 'mapNumber'
  | 'mapTitle'
  | 'ticketNumber'
  | 'title'
  | 'tier'
  | 'threadId'
  | 'rung'
  | 'status'
  | 'acknowledged'
  | 'createdAt'
  | 'updatedAt'
  | 'lastSeenAt'
  | 'sequence'
  | 'stale'
  | 'branch'
  | 'pullRequests'
  | 'pendingApproval'
  | 'pendingUserInput'
>;

/** Map starts have neither a map nor a ticket number; their title carries the original goal. */
export function isNewMapHandOff(handOff: Pick<NewMapHandOff, 'mapNumber' | 'ticketNumber' | 'title'>): boolean {
  return handOff.mapNumber === null && handOff.ticketNumber === null && handOff.title !== null;
}

/** Switch a planning URL to its real map once the map issue appears in the repository snapshot. */
export function draftToMapPath(
  repo: string,
  handOff: NewMapHandOff,
  maps: readonly Pick<WayfinderMap, 'number' | 'title'>[],
): string | null {
  if (!isNewMapHandOff(handOff) || handOff.repo.toLowerCase() !== repo.toLowerCase()) return null;
  const goal = normalizedMapTitle(handOff.title ?? '');
  const map = maps
    .filter((candidate) => normalizedMapTitle(candidate.title) === goal)
    .reduce<Pick<WayfinderMap, 'number' | 'title'> | null>((latest, candidate) => (latest === null || candidate.number > latest.number ? candidate : latest), null);
  if (map === null) return null;
  return `${mapPath(repo, map.number)}?planning=${encodeURIComponent(handOff.id)}`;
}

function normalizedMapTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** The composer, opened on `repo` when there is one. */
export function newMapPath(repo: string | null): string {
  const normalized = repo === null ? null : normalizeRepo(repo);
  return normalized === null ? '/new-map' : `/new-map?repo=${encodeURIComponent(normalized)}`;
}

/** Only preselect a repository explicitly supplied by the page that opened the composer. */
export function initialRepository(query: string | null): string {
  return query === null ? '' : (normalizeRepo(query) ?? '');
}

/** The repository chip names just the repository; its tooltip carries `owner/name`. */
export function repoChipLabel(repo: string): string {
  return repo.slice(repo.indexOf('/') + 1) || repo;
}

/** Recent repositories lead the searchable list; account repositories fill in the rest. */
export function repositoryOptions(query: string, recents: readonly string[], known: readonly string[]): string[] {
  const search = query.trim().toLowerCase();
  const seen = new Set<string>();
  return [...recents, ...known].flatMap((value) => {
    const repo = normalizeRepo(value);
    if (repo === null || seen.has(repo.toLowerCase())) return [];
    seen.add(repo.toLowerCase());
    return search === '' || repo.toLowerCase().includes(search) ? [repo] : [];
  });
}

export interface ComposerInput {
  repo: string | null;
  goal: string;
  /** `loading` while the clone lookup runs, null when it failed. */
  workspace: WorkspaceView | 'loading' | null;
  /** Null when T3 Code answered, else why it could not be reached. */
  t3Unavailable: string | null;
}

export interface ComposerState {
  canStart: boolean;
  canCopy: boolean;
  /** Why `Start in T3 Code` is off, shown under the actions. Null when nothing is in the way. */
  reason: string | null;
}

/**
 * `Start in T3 Code` needs a repository, a goal, a verified clone, and a running T3 Code.
 * `Copy prompt` needs only the first two, so it stays as the way through when a hand-off can't happen.
 */
export function composerState({ repo, goal, workspace, t3Unavailable }: ComposerInput): ComposerState {
  if (repo === null) return { canStart: false, canCopy: false, reason: 'Pick a repository to start.' };
  const hasGoal = goal.trim().length > 0;
  const reason =
    workspace === 'loading'
      ? 'Finding a local clone…'
      : workspace === null
        ? 'Could not check for a local clone. Try again, or copy the prompt.'
        : workspace.status === 'choose'
          ? workspace.candidates.length > 1
            ? 'Choose a local clone below before starting.'
            : workspace.canChoose
              ? 'Choose a local clone or clone this repository for me.'
              : 'Run Wayfinder inside a clone of this repository to start in T3 Code.'
          : t3Unavailable !== null
            ? `T3 Code is not reachable (${t3Unavailable}). Copy the prompt and paste it into a new thread.`
            : null;
  return { canStart: hasGoal && reason === null, canCopy: hasGoal, reason };
}
