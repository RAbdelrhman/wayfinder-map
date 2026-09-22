import { readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { WorkspaceResolver } from './workspaces.js';
import type { ServerT3 } from './server.js';
import { detectT3 } from './t3.js';

export const FAVICON_CANDIDATES = [
  'favicon.svg',
  'favicon.ico',
  'favicon.png',
  'public/favicon.svg',
  'public/favicon.ico',
  'public/favicon.png',
  'public/ecpl_logo.png',
  'public/logo.svg',
  'public/logo.png',
  'app/favicon.ico',
  'app/favicon.png',
  'app/icon.svg',
  'app/icon.png',
  'app/icon.ico',
  'src/favicon.ico',
  'src/favicon.svg',
  'src/app/favicon.ico',
  'src/app/icon.svg',
  'src/app/icon.png',
  'assets/icon.svg',
  'assets/icon.png',
  'assets/logo.svg',
  'assets/logo.png',
  '.idea/icon.svg',
];

export interface ResolvedRepoIcon {
  data: Buffer;
  contentType: string;
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

export async function resolveRepoIcon(
  repo: string,
  clones?: WorkspaceResolver,
  t3?: ServerT3,
  launchRoot?: string | null,
  fetchFn: typeof fetch = fetch,
): Promise<ResolvedRepoIcon | null> {
  let root: string | null = null;
  if (clones) {
    try {
      root = await clones.resolve(repo);
    } catch {
      root = null;
    }
  }

  if (!root && launchRoot) {
    root = launchRoot;
  }

  if (!root && t3) {
    try {
      const projects = await t3.projects(await detectT3());
      const parts = repo.split('/');
      const repoName = parts.length > 1 ? parts[1]! : parts[0]!;
      for (const p of projects) {
        const normalizedP = p.replace(/\\/g, '/').toLowerCase();
        if (normalizedP.endsWith('/' + repoName.toLowerCase()) || normalizedP.endsWith('/' + repo.toLowerCase())) {
          root = p;
          break;
        }
      }
    } catch {
      // ignore
    }
  }

  if (root) {
    for (const candidate of FAVICON_CANDIDATES) {
      try {
        const fullPath = join(root, candidate);
        const s = await stat(fullPath);
        if (s.isFile()) {
          const data = await readFile(fullPath);
          return { data, contentType: iconContentType(fullPath) };
        }
      } catch {
        // continue
      }
    }
  }

  const parts = repo.split('/');
  if (parts.length === 2 && parts[0] && parts[1]) {
    const [owner, name] = parts;
    const remoteCandidates = [
      'public/favicon.ico',
      'favicon.ico',
      'public/favicon.png',
      'public/favicon.svg',
      'public/ecpl_logo.png',
      'public/ecpl_mobile_logo.png',
      'public/icons/icon-512.png',
      'public/icons/icon-192.png',
      'public/icons/icon-maskable-512.png',
      'assets/icon.png',
      'assets/icon.svg',
      'assets/logo.png',
      'assets/logo.svg',
      'public/logo.png',
      'public/logo.svg',
      'src/app/icon.png',
      'app/icon.png',
    ];
    for (const remoteFile of remoteCandidates) {
      try {
        const res = await fetchFn(`https://raw.githubusercontent.com/${owner}/${name}/HEAD/${remoteFile}`, {
          headers: { 'User-Agent': 'Wayfinder' },
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          return { data: buf, contentType: iconContentType(remoteFile) };
        }
      } catch {
        // continue
      }
    }
  }

  return null;
}
