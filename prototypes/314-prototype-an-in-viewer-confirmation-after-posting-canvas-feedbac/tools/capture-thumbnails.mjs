// Keep this board's documented entry point while using the canonical capture destination.
import { pathToFileURL } from 'node:url';
import { captureThumbnails } from '../../canvas/tools/capture-thumbnails.mjs';
export { THUMBNAIL_SOURCES, VIEWPORT, captureThumbnails } from '../../canvas/tools/capture-thumbnails.mjs';

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await captureThumbnails();
}