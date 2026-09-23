import type { HandOffStatusDto } from '../handOffTracking.js';
import { mapPath, normalizeRepo } from '../repoRoutes.js';
import type { WayfinderMap } from '../types.js';

/* Start a new map: which repository the composer opens on, and whether it can start a thread. */

/** What the server says about the checkout T3 Code would run the repository's threads in. */
export type WorkspaceView =
  | { status: 'ready'; path: string; canChoose: boolean }
  | { status: 'choose'; candidates: string[]; canChoose: boolean };

export type NewMapHandOff = Pick<HandOffStatusDto, 'id' | 'repo' | 'mapNumber' | 'ticketNumber' | 'title' | 'threadId' | 'rung' | 'status'>;

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

/** The repository the page came from, else the one used last, else the first one the account can see. */
export function initialRepository(query: string | null, recents: readonly string[], known: readonly string[]): string {
  const asked = query === null ? null : normalizeRepo(query);
  return asked ?? recents[0] ?? known[0] ?? '';
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
  if (repo === null) return { canStart: false, canCopy: false, reason: 'Choose a repository (owner/name).' };
  const hasGoal = goal.trim().length > 0;
  const reason =
    workspace === 'loading'
      ? `Looking for a local clone of ${repo}…`
      : workspace === null
        ? `Could not check for a local clone of ${repo}. Copy the prompt instead.`
        : workspace.status === 'choose'
          ? `T3 Code needs a verified local clone of ${repo} to start a thread. Choose one, or copy the prompt.`
          : t3Unavailable !== null
            ? `T3 Code is not reachable (${t3Unavailable}). Copy the prompt and paste it into a new thread.`
            : null;
  return { canStart: hasGoal && reason === null, canCopy: hasGoal, reason };
}
