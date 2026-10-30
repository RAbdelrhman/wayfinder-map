import { assetReferences, canvasMetadata, isolatedCanvasHtml, packagePages, prototypeBoards, relativeAsset, safeAssetPath } from './package';
import type { CanvasBlob, CanvasPackage, CanvasRef } from './package';
import { assetMime } from './embed';
import type { CanvasAssets } from './embed';

export interface CanvasSource {
  prototypeTree(repo: string, sha: string, signal?: AbortSignal): Promise<CanvasBlob[]>;
  prototypeBlob(repo: string, sha: string, signal?: AbortSignal): Promise<string>;
}
export interface CanvasStorage {
  has(path: string): boolean;
  text(path: string): Promise<string>;
  base64(path: string): Promise<string>;
  write(path: string, contents: string | Uint8Array): void;
  uri(path: string): string;
}
export const CANVAS_LIMITS = { files: 200, fileBytes: 5 * 1024 * 1024, bytes: 30 * 1024 * 1024 };

/** Downloads one immutable repository closure. No remote code runs during discovery. */
export async function downloadCanvas(source: CanvasSource, storage: CanvasStorage,
  ref: Omit<CanvasRef, 'board'> & { board?: string }, signal: AbortSignal,
  progress: (files: number, bytes: number) => void = () => undefined): Promise<CanvasPackage> {
  const tree = await source.prototypeTree(ref.repo, ref.sha, signal);
  const board = ref.board ?? prototypeBoards(ref.ticket, tree)[0];
  if (!board || !prototypeBoards(ref.ticket, tree).includes(board)) throw new Error('No canvas was found for this ticket.');
  const blobs = new Map(tree.filter(file => safeAssetPath(file.path)).map(file => [file.path, file]));
  const prefix = board.slice(0, board.lastIndexOf('/') + 1);
  const pending = [board, `${prefix}config.js`];
  const files = new Map<string, CanvasBlob>();
  let bytes = 0;
  let config = '';
  while (pending.length) {
    if (signal.aborted) throw new Error('Canvas download cancelled.');
    const batch = [...new Set(pending.splice(0, 4))].filter(path => !files.has(path));
    for (const path of batch) {
      const file = blobs.get(path);
      if (!file) {
        if (path === board || path === `${prefix}config.js`) throw new Error('The canvas is missing a required file.');
        continue;
      }
      if (file.size > CANVAS_LIMITS.fileBytes || bytes + file.size > CANVAS_LIMITS.bytes || files.size >= CANVAS_LIMITS.files)
        throw new Error('This canvas is too large to save on the phone.');
      files.set(path, file);
      bytes += file.size;
    }
    await Promise.all(batch.map(async path => {
      const file = files.get(path);
      if (!file) return;
      if (!storage.has(path)) {
        const encoded = await source.prototypeBlob(ref.repo, file.sha, signal);
        const binary = atob(encoded);
        if (binary.length !== file.size) throw new Error('The canvas file download was incomplete.');
        storage.write(path, Uint8Array.from(binary, character => character.charCodeAt(0)));
      }
      if (/\.(?:html?|js|css|json)$/i.test(path)) {
        const text = await storage.text(path);
        if (path === `${prefix}config.js`) {
          config = text;
          pending.push(...packagePages(config).flatMap(page => page.items.flatMap(item => {
            const target = item.src ? relativeAsset(board, item.src) : null;
            return target ? [target] : [];
          })));
        }
        pending.push(...assetReferences(path, text));
      }
      progress(files.size, bytes);
    }));
  }
  const pages = packagePages(config);
  const assets: CanvasAssets = {};
  for (const path of files.keys()) {
    const mime = assetMime(path);
    if (/\.(?:html?|js|css|json)$/i.test(path)) {
      const text = await storage.text(path);
      assets[path] = { mime, text: /\.html?$/i.test(path) ? isolatedCanvasHtml(text) : text };
    } else assets[path] = { mime, base64: await storage.base64(path) };
  }
  storage.write('assets.json', JSON.stringify(assets));
  // Config can supply variant URLs in forms the generic reference scanner cannot see.
  for (const page of pages) for (const item of page.items) {
    const path = item.src ? new URL(item.src, `https://canvas.invalid/${board}`).pathname.slice(1) : '';
    if (!files.has(path)) throw new Error('The canvas is missing an option file.');
  }
  return { ...ref, board, ...canvasMetadata(config), pages, files: [...files.values()], bytes,
    savedAt: Date.now(), directory: storage.uri('') };
}
