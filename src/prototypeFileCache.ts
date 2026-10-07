/** Commit contents are immutable. Keep raw bytes, never responses without their sandbox headers. */
export class PrototypeFileCache {
  private readonly entries = new Map<string, Buffer>();
  private readonly pending = new Map<string, Promise<Buffer>>();
  private bytes = 0;
  private generation = 0;
  constructor(
    private readonly read: (repo: string, ref: string, file: string) => Promise<Buffer>,
    private readonly limit = 50 * 1024 * 1024,
  ) {}
  clear(): void {
    this.generation++;
    this.entries.clear();
    this.pending.clear();
    this.bytes = 0;
  }
  get(repo: string, branch: string, file: string, sha?: string): Promise<Buffer> {
    if (!sha) return this.read(repo, branch, file);
    const key = JSON.stringify([repo.toLowerCase(), sha, file]);
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return Promise.resolve(cached);
    }
    const loading = this.pending.get(key);
    if (loading) return loading;
    const generation = this.generation;
    const promise = this.read(repo, sha, file)
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
}
