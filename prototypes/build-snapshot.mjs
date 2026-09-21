/*
  Builds prototype-snapshot.html at the repo root: the #44 canvas as one file, with every
  stylesheet, script and variant page inlined. No absolute paths, no server calls.
  Run: node prototypes/build-snapshot.mjs. PROTOTYPE, throw away.
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CANVAS = join(ROOT, 'prototypes/canvas');
const read = (path) => readFileSync(path, 'utf8');
// Keep inlined code from closing the tag it sits in.
const safeScript = (code) => code.replace(/<\/script/gi, '<\\/script');
const safeStyle = (css) => css.replace(/<\/style/gi, '<\\/style');

/** A variant page with its local <link>s and <script src>s replaced by their contents. */
function inlinePage(file) {
  const dir = dirname(file);
  return read(file)
    .replace(/<link rel="stylesheet" href="([^"]+)" \/>/g, (_, href) => `<style>${safeStyle(read(resolve(dir, href)))}</style>`)
    .replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
      let code = read(resolve(dir, src));
      // srcdoc frames have no query string: read the theme and style the canvas hands over instead.
      if (src.endsWith('kit.js')) code = code.replace('location.search', '(window.SNAPSHOT_SEARCH ?? location.search)');
      return `<script>${safeScript(code)}</script>`;
    });
}

const pages = {};
for (const name of ['new-map-a', 'new-map-b', 'new-map-c']) pages[`variants/${name}.html`] = inlinePage(join(CANVAS, `variants/${name}.html`));

const sheets = {
  '../../src/ui/styles.css': read(join(ROOT, 'src/ui/styles.css')),
  'variants/new-map.css': read(join(CANVAS, 'variants/new-map.css')),
};

// Runs before canvas.js: page frames get their inlined HTML, sheet frames get inlined CSS.
const shim = `(() => {
  const PAGES = ${JSON.stringify(pages)};
  const SHEETS = ${JSON.stringify(sheets)};
  const setAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (this.tagName === 'IFRAME' && name === 'src') {
      const [path, query = ''] = String(value).split('?');
      if (PAGES[path]) {
        this.dataset.snapshotSrc = value;
        const inject = '<script>window.SNAPSHOT_SEARCH=' + JSON.stringify('?' + query).replace(/</g, '\\\\u003c') + '<\\/script>';
        this.srcdoc = PAGES[path].replace('<head>', '<head>' + inject);
        return;
      }
    }
    return setAttribute.call(this, name, value);
  };
  const getAttribute = Element.prototype.getAttribute;
  Element.prototype.getAttribute = function (name) {
    if (this.tagName === 'IFRAME' && name === 'src' && this.dataset.snapshotSrc) return this.dataset.snapshotSrc;
    return getAttribute.call(this, name);
  };
  const removeAttribute = Element.prototype.removeAttribute;
  Element.prototype.removeAttribute = function (name) {
    if (this.tagName === 'IFRAME' && name === 'src') delete this.dataset.snapshotSrc;
    return removeAttribute.call(this, name);
  };
  const srcdoc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'srcdoc');
  Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', {
    ...srcdoc,
    set(html) {
      srcdoc.set.call(this, String(html).replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => (SHEETS[href] ? '<style>' + SHEETS[href] + '</style>' : m)));
    },
  });
})();`;

const html = read(join(CANVAS, 'index.html'))
  .replace('<title>Canvas</title>', '<title>#44 Start a new map · prototype snapshot</title>')
  .replace(
    '<link rel="stylesheet" href="canvas.css" />',
    // "Open in a new tab" has nowhere to go in a single file.
    `<style>${safeStyle(read(join(CANVAS, 'canvas.css')))}\na[target="_blank"]{display:none!important}</style>`,
  )
  .replace('<script src="config.js"></script>', `<script>${safeScript(shim)}</script>\n<script>${safeScript(read(join(CANVAS, 'config.js')))}</script>`)
  .replace('<script src="canvas.js"></script>', `<script>${safeScript(read(join(CANVAS, 'canvas.js')))}</script>`);

if (/(?:src|href)="\//.test(html)) throw new Error('Snapshot has a root-absolute path.');
writeFileSync(join(ROOT, 'prototype-snapshot.html'), html);
console.log(`Wrote prototype-snapshot.html (${Math.round(html.length / 1024)} KB)`);
