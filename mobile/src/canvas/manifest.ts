import type { CanvasStorage } from './download';
import type { CanvasPackage } from './package';

/** Keep fixed revisions reachable offline without moving the newest destination. */
export function canvasManifests(files: (revision: string) => CanvasStorage, revision?: string) {
  return {
    save(canvas: CanvasPackage): void {
      const serialized = JSON.stringify(canvas);
      files(canvas.sha).write('manifest.json', serialized);
      if (!revision) files('latest').write('manifest.json', serialized);
    },
    async read(): Promise<string | null> {
      const storage = files(revision?.toLowerCase() ?? 'latest');
      return storage.has('manifest.json') ? storage.text('manifest.json') : null;
    },
  };
}
