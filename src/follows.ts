import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** `~/.wayfinder-map/follows.json`: the public maps each GitHub login follows, by repository. */
export function followsFile(): string {
  return join(homedir(), '.wayfinder-map', 'follows.json');
}

/** Followed maps per GitHub login, stored as `{ login: { "owner/repo": [mapNumber, ...] } }`. */
export class FollowStore {
  constructor(private readonly path: string = followsFile()) {}

  async follows(login: string, repo: string): Promise<number[]> {
    const all = await this.readAll();
    const user = objectAt(all, login.toLowerCase());
    const list = user[repo.toLowerCase()];
    if (!Array.isArray(list)) return [];
    return [...new Set(list.filter((value): value is number => Number.isSafeInteger(value) && (value as number) > 0))];
  }

  private async readAll(): Promise<Record<string, unknown>> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.path, 'utf8'));
      return isObject(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function objectAt(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parent[key];
  return isObject(value) ? value : {};
}
