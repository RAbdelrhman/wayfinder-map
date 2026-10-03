import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Serializes updates within one store instance. Other instances and processes are not locked. */
export class SettingsFileWriter {
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {}

  update<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.pending.then(operation);
    this.pending = next.then(() => undefined, () => undefined);
    return next;
  }

  /** Replaces the file only after the full JSON has been written beside it. */
  async write(value: unknown): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      await rename(temporary, this.path);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
