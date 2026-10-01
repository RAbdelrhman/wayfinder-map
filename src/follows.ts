import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

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

  /** Follows or unfollows one map. Saves run one at a time, so two quick clicks can't overwrite each other. */
  set(login: string, repo: string, mapNumber: number, followed: boolean): Promise<number[]> {
    const saved = this.writing.then(() => this.write(login, repo, mapNumber, followed));
    this.writing = saved.catch(() => undefined);
    return saved;
  }

  private writing: Promise<unknown> = Promise.resolve();

  private async write(login: string, repo: string, mapNumber: number, followed: boolean): Promise<number[]> {
    const current = (await this.follows(login, repo)).filter((number) => number !== mapNumber);
    const next = followed ? [...current, mapNumber].sort((a, b) => a - b) : current;
    const all = await this.readAll();
    const user = objectAt(all, login.toLowerCase());
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify({ ...all, [login.toLowerCase()]: { ...user, [repo.toLowerCase()]: next } }, null, 2)}\n`, 'utf8');
    return next;
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
