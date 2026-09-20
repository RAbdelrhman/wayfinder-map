export interface RepoPageRoute {
  repo: string;
  mapNumber: number | null;
  /** True for the repository's own prototypes page, which spans every map. */
  prototypes?: boolean;
}

export function normalizeRepo(value: string): string | null {
  const trimmed = value.trim();
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed) ? trimmed : null;
}

export function parseRepoPagePath(pathname: string): RepoPageRoute | null {
  const match = /^\/repos\/([^/]+)\/([^/]+)(?:\/maps\/(\d+)|\/(prototypes))?\/?$/.exec(pathname);
  if (match === null) return null;
  let owner: string;
  let name: string;
  try {
    owner = decodeURIComponent(match[1] ?? '');
    name = decodeURIComponent(match[2] ?? '');
  } catch {
    return null;
  }
  const repo = normalizeRepo(`${owner}/${name}`);
  if (repo === null) return null;
  if (match[4] !== undefined) return { repo, mapNumber: null, prototypes: true };
  const mapNumber = match[3] === undefined ? null : Number(match[3]);
  return Number.isSafeInteger(mapNumber) && mapNumber !== null && mapNumber > 0
    ? { repo, mapNumber }
    : mapNumber === null
      ? { repo, mapNumber: null }
      : null;
}

/** The repository's prototypes page: every prototype across its maps. */
export function prototypesPath(repo: string): string {
  return `${repoPath(repo)}/prototypes`;
}

export function repoPath(repo: string): string {
  const normalized = normalizeRepo(repo);
  if (normalized === null) throw new Error(`Invalid repository: ${repo}`);
  const [owner = '', name = ''] = normalized.split('/', 2);
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

export function mapPath(repo: string, mapNumber: number): string {
  if (!Number.isSafeInteger(mapNumber) || mapNumber <= 0) throw new Error(`Invalid map number: ${String(mapNumber)}`);
  return `${repoPath(repo)}/maps/${String(mapNumber)}`;
}

/** The repository-scoped API calls the page makes, so a page can name a repo other than the launch one. */
export type ScopedApiAction = 'snapshot' | 'hand-off' | 'prototypes';

export function scopedApiPath(repo: string, action: ScopedApiAction): string {
  return `/api${repoPath(repo)}/${action}`;
}
