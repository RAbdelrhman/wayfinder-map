import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Commit contents are immutable. Keep raw bytes, never responses without their sandbox headers. */
export class PrototypeFileCache {
  private readonly entries = new Map<string, Buffer>();
  private readonly pending = new Map<string, Promise<Buffer>>();
  private bytes = 0;
  private generation = 0;
  private writes: Promise<void> = Promise.resolve();
  constructor(
    private readonly read: (repo: string, ref: string, file: string) => Promise<Buffer>,
    private readonly limit = 50 * 1024 * 1024,
    private readonly directory?: () => Promise<string | null>,
  ) {}
  clear(): void {
    this.generation++;
    this.entries.clear();
    this.pending.clear();
    this.bytes = 0;
  }
  /** Persistence is optional background work; tests and graceful shutdown can wait for it. */
  flush(): Promise<void> { return this.writes; }
  async get(repo: string, branch: string, file: string, sha?: string): Promise<Buffer> {
    if (!sha) return this.read(repo, branch, file);
    const directory = this.directory ? await this.directory().catch(() => null) : undefined;
    const key = JSON.stringify([directory, repo.toLowerCase(), sha, file]);
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return Promise.resolve(cached);
    }
    const loading = this.pending.get(key);
    if (loading) return loading;
    const generation = this.generation;
    const path = directory ? join(directory, createHash('sha256').update(key).digest('hex')) : null;
    const promise = this.load(path).then(async (saved) => {
      if (saved !== null) return saved;
      const value = await this.read(repo, sha, file);
      if (path && generation === this.generation && value.length <= this.limit) {
        this.writes = this.writes.then(() => this.save(path, value, generation)).catch(() => undefined);
      }
      return value;
    })
      .then((value) => {
        if (generation === this.generation && value.length <= this.limit) {
          while (this.bytes + value.length > this.limit && this.entries.size) {
            const oldest = this.entries.keys().next().value!;
            this.bytes -= this.entries.get(oldest)!.length;
            this.entries.delete(oldest);
          }
          this.entries.set(key, value);
          this.bytes += value.length;
        }
        return value;
      })
      .finally(() => { if (this.pending.get(key) === promise) this.pending.delete(key); });
    this.pending.set(key, promise);
    return promise;
  }

  private async load(path: string | null): Promise<Buffer | null> {
    if (!path) return null;
    try {
      if ((await stat(path)).size > this.limit + 32) return null;
      const saved = await readFile(path);
      const value = saved.subarray(32);
      return createHash('sha256').update(value).digest().equals(saved.subarray(0, 32)) ? value : null;
    } catch { return null; }
  }

  private async save(path: string, value: Buffer, generation: number): Promise<void> {
    const directory = join(path, '..');
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      if (generation !== this.generation) return;
      await mkdir(directory, { recursive: true });
      await writeFile(temporary, Buffer.concat([createHash('sha256').update(value).digest(), value]), { mode: 0o600 });
      if (generation !== this.generation) return;
      await rename(temporary, path);
      const files = (await Promise.all((await readdir(directory)).filter((name) => /^[a-f0-9]{64}$/.test(name)).map(async (name) => {
        const file = join(directory, name);
        const info = await stat(file).catch(() => null);
        return info ? { file, size: info.size, at: info.mtimeMs } : null;
      }))).filter((entry) => entry !== null).sort((a, b) =>
        a.file === path ? -1 : b.file === path ? 1 : b.at - a.at);
      let bytes = 0;
      for (const entry of files) {
        bytes += entry.size;
        if (bytes > this.limit + 32) await rm(entry.file, { force: true });
      }
    } catch { /* An unavailable disk cache must never prevent an open. */ }
    finally { await rm(temporary, { force: true }).catch(() => undefined); }
  }
}
