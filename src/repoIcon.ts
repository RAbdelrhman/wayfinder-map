import { extname } from 'node:path';

import { gh } from './github.js';

export interface ResolvedRepoIcon {
  data: Buffer;
  contentType: string;
}

export type RepoAvatarUrlFetcher = (repo: string) => Promise<string | null>;

/** GitHub's repository API exposes the owner or organization avatar for a repository. */
export async function githubOwnerAvatarUrl(repo: string, runGh: typeof gh = gh): Promise<string | null> {
  try {
    const value = (await runGh(['api', `repos/${repo}`, '--jq', '.owner.avatar_url'])).trim();
    return isGithubImageUrl(value) ? value : null;
  } catch {
    return null;
  }
}

function isGithubImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'github.com' || url.hostname.endsWith('.githubusercontent.com'));
  } catch {
    return false;
  }
}

export function iconContentType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  switch (ext) {
    case '.svg':
      return 'image/svg+xml';
    case '.ico':
      return 'image/x-icon';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

function responseContentType(response: Response, imageUrl: string): string | null {
  const header = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (header !== undefined && header.length > 0) return header.startsWith('image/') ? header : null;
  const inferred = iconContentType(new URL(imageUrl).pathname);
  return inferred.startsWith('image/') ? inferred : 'image/png';
}

/** Fetch the GitHub owner avatar as a same-origin image for the app's strict CSP. */
export async function resolveRepoIcon(
  repo: string,
  fetchFn: typeof fetch = fetch,
  avatarUrlFetcher: RepoAvatarUrlFetcher = (value) => githubOwnerAvatarUrl(value),
): Promise<ResolvedRepoIcon | null> {
  const avatarUrl = await avatarUrlFetcher(repo).catch(() => null);
  if (avatarUrl === null || !isGithubImageUrl(avatarUrl)) return null;

  try {
    const response = await fetchFn(avatarUrl, {
      headers: { 'User-Agent': 'Wayfinder' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const contentType = responseContentType(response, avatarUrl);
    if (contentType === null) return null;
    return { data: Buffer.from(await response.arrayBuffer()), contentType };
  } catch {
    return null;
  }
}
