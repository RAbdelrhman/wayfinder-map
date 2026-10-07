import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { MapSnapshot } from './types.js';

export interface SnapshotPersistence {
  load(repo: string, scope: string): Promise<MapSnapshot | null>;
  save(snapshot: MapSnapshot, scope: string): Promise<void>;
}

/** Immutable files let concurrent app processes keep the newest read without sharing a mutable index. */
export class RepositorySnapshotCache implements SnapshotPersistence {
  constructor(private readonly root = join(homedir(), '.wayfinder-map', 'repository-cache-v1')) {}

  private directory(repo: string, scope: string): string {
    return join(this.root, createHash('sha256').update(JSON.stringify([repo, scope])).digest('hex'));
  }

  async load(repo: string, scope: string): Promise<MapSnapshot | null> {
    try {
      const directory = this.directory(repo, scope);
      const files = (await readdir(directory)).filter((file) => /^\d{13}-[\w-]+\.json$/.test(file)).sort().reverse();
      for (const file of files.slice(0, 3)) {
        try {
          const value = JSON.parse(await readFile(join(directory, file), 'utf8')) as MapSnapshot;
          if (value.repo !== repo || !Number.isFinite(Date.parse(value.fetchedAt)) || Date.now() - Date.parse(value.fetchedAt) > 24 * 60 * 60_000) continue;
          if (!Array.isArray(value.maps) || !Array.isArray(value.warnings) || !Array.isArray(value.publicMaps)) continue;
          if (value.maps.some((map) => !Array.isArray(map.tickets) || !Array.isArray(map.outside) || !Array.isArray(map.stalled) || !Array.isArray(map.pullRequests) || typeof map.ticketsLoaded !== 'boolean' || map.sections === null || typeof map.sections !== 'object' || map.criticalPath === null || typeof map.criticalPath !== 'object')) continue;
          return value;
        } catch { /* A damaged file is a cache miss, never a failed page load. */ }
      }
    } catch { /* Missing cache or permission errors fall through to GitHub. */ }
    return null;
  }

  async save(snapshot: MapSnapshot, scope: string): Promise<void> {
    const at = Date.parse(snapshot.fetchedAt);
    if (!Number.isFinite(at)) return;
    const directory = this.directory(snapshot.repo, scope);
    const path = join(directory, `${String(at)}-${randomUUID()}.json`);
    const temporary = `${path}.tmp`;
    try {
      await mkdir(directory, { recursive: true });
      await writeFile(temporary, JSON.stringify(snapshot), { mode: 0o600 });
      await rename(temporary, path);
      const files = (await readdir(directory)).filter((file) => /^\d{13}-[\w-]+\.json$/.test(file)).sort().reverse();
      await Promise.all(files.slice(3).map((file) => rm(join(directory, file), { force: true })));
    } catch { /* Cache writes are optional; GitHub data stays usable. */ }
    finally { await rm(temporary, { force: true }).catch(() => undefined); }
  }
}
