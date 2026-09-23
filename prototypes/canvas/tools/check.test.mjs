// Run with: node --test <canvas>/tools/check.test.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { checkCanvas, checkPageHtml, loadConfig } from './check.mjs';
import { THUMBNAIL_SOURCES, VIEWPORT } from './capture-thumbnails.mjs';

const CANVAS_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));

const files = { 'variants/a.html': '<html><script src="../kit/kit.js"></script></html>', 'assets/x.png': '' };
const disk = { exists: (p) => p in files, read: (p) => files[p] };
const base = { title: 'T', question: 'Q?', styles: { warm: { vars: {} } } };
const run = (sections, extra = {}) => checkCanvas({ ...base, ...extra, sections }, disk);

test('a valid config of every kind passes', () => {
  const { errors } = run([
    {
      items: [
        { id: 'A', src: 'variants/a.html', note: { idea: 'n', basedOn: ['Base A'], disposition: 'change', feedback: 'More contrast' } },
        {
          id: 'C',
          kind: 'compose',
          width: 10,
          height: 10,
          layers: [
            { type: 'image', src: 'assets/x.png' },
            { type: 'text', text: 'hi' },
          ],
          note: 'n',
        },
        { id: 'K', kind: 'components', styles: ['warm'], items: [{ html: '<b>x</b>' }], note: 'n' },
        { id: 'P', kind: 'swatches', style: 'warm', note: 'n' },
        { id: 'Y', kind: 'type', note: 'n' },
        { id: 'I', kind: 'image', src: 'https://example.com/x.png', note: 'n' },
        { kind: 'note', text: 'hello' },
      ],
    },
  ]);
  assert.deepEqual(errors, []);
});

test('the legacy variants shorthand still works', () => {
  const { errors } = checkCanvas({ ...base, variants: [{ id: 'A', src: 'variants/a.html', note: 'n' }] }, disk);
  assert.deepEqual(errors, []);
});

test('missing files, root paths and unknown styles are errors', () => {
  const { errors } = run([
    {
      items: [
        { id: 'A', src: 'variants/missing.html' },
        { id: 'B', kind: 'image', src: '/assets/x.png' },
        { id: 'C', kind: 'swatches', style: 'cool' },
      ],
    },
  ]);
  assert.equal(errors.length, 3);
  assert.match(errors[0], /does not exist/);
  assert.match(errors[1], /root path/);
  assert.match(errors[2], /no style named "cool"/);
});

test('duplicate ids count expanded style ids', () => {
  const { errors } = run([
    {
      items: [
        { id: 'K-warm', kind: 'type' },
        { id: 'K', kind: 'type', styles: ['warm'] },
      ],
    },
  ]);
  assert.match(errors.join('\n'), /duplicate id "K-warm"/);
});

test('bad kinds and layers are named', () => {
  const { errors } = run([
    {
      items: [
        { id: 'X', kind: 'video' },
        { id: 'C', kind: 'compose', width: 1, height: 1, layers: [{ type: 'blob' }] },
      ],
    },
  ]);
  assert.match(errors[0], /unknown kind/);
  assert.match(errors[1], /type must be one of/);
});

test('items without a note get a warning, not an error', () => {
  const { errors, warnings } = run([{ items: [{ id: 'Y', kind: 'type' }] }]);
  assert.deepEqual(errors, []);
  assert.match(warnings[0], /no note/);
});

test('pages that cannot run sandboxed are flagged', () => {
  assert.deepEqual(checkPageHtml('<script src="kit.js"></script>'), []);
  assert.equal(checkPageHtml('<script type="module" src="a.js"></script>').length, 1);
  assert.equal(checkPageHtml('<link rel="stylesheet" href="/styles.css">').length, 1);
  assert.equal(checkPageHtml('fetch("x"); localStorage.x = 1').length, 2);
});

test('loadConfig runs config.js like the browser', () => {
  assert.deepEqual(loadConfig('const X = 1; window.CANVAS = { title: "t", n: X };'), { title: 't', n: 1 });
});

test('pages are checked, and ids are unique across pages', () => {
  const page = (title, id) => ({ title, sections: [{ items: [{ id, kind: 'type', note: 'n' }] }] });
  const errorsFor = (pages) => checkCanvas({ ...base, pages }, disk).errors.join(' | ');
  assert.equal(errorsFor([page('One', 'A'), page('Two', 'B')]), '');
  assert.match(errorsFor([page('One', 'A'), page('Two', 'A')]), /duplicate id "A"/);
  assert.match(errorsFor([page('One', 'A'), page('One', 'B')]), /duplicate page id "one"/);
  assert.match(errorsFor([page('One', 'A'), { sections: [] }]), /every page needs sections/);
});

test('named remix rounds and recorded feedback metadata pass', () => {
  const { errors } = checkCanvas(
    {
      ...base,
      pages: [
        {
          title: 'Second pass',
          ticket: 43,
          round: 'Round 2 · Navigation pass',
          sections: [
            {
              items: [
                {
                  id: 'A2',
                  kind: 'type',
                  note: { idea: 'Refined option', basedOn: ['A', 'B'], disposition: 'combine', feedback: 'Keep the clearer labels' },
                },
              ],
            },
          ],
        },
      ],
    },
    disk,
  );
  assert.deepEqual(errors, []);
});

test('invalid remix round and feedback metadata are errors', () => {
  const { errors } = checkCanvas(
    {
      ...base,
      pages: [
        {
          title: 'Broken pass',
          ticket: 0,
          round: 0,
          sections: [{ items: [{ id: 'A', kind: 'type', note: { basedOn: [], disposition: 'retain', feedback: 42 } }] }],
        },
      ],
    },
    disk,
  );
  assert.match(errors.join('\n'), /pages\[0\]\.ticket/);
  assert.match(errors.join('\n'), /pages\[0\]\.round/);
  assert.match(errors.join('\n'), /note\.basedOn/);
  assert.match(errors.join('\n'), /note\.disposition/);
  assert.match(errors.join('\n'), /note\.feedback/);
});

test('base and style stylesheets must exist', () => {
  const cfg = {
    ...base,
    base: { stylesheets: ['missing.css'] },
    styles: { x: { stylesheets: ['assets/x.png'] } },
    sections: [{ items: [{ kind: 'note', text: 't' }] }],
  };
  const { errors } = checkCanvas(cfg, disk);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /base.stylesheets\[0\]: "missing.css" does not exist/);
});

function jpegDimensions(buffer) {
  assert.equal(buffer[0], 0xff, 'thumbnail must start with the JPEG marker');
  assert.equal(buffer[1], 0xd8, 'thumbnail must start with the JPEG marker');

  for (let offset = 2; offset + 9 < buffer.length; ) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;

    const length = buffer.readUInt16BE(offset);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3) };
    }
    offset += length;
  }

  throw new Error('Thumbnail has no JPEG frame dimensions');
}

test('every prototype board variant has a distinct screenshot and a refreshable source', () => {
  const window = {};
  runInNewContext(readFileSync(join(CANVAS_DIR, 'variants', 'data.js'), 'utf8'), {
    window,
    location: { search: '?data=many' },
    URLSearchParams,
    Kit: { icons: {} },
  });
  const boardShots = window.DATA.REPOS.flatMap((repo) =>
    repo.prototypes.flatMap((prototype) => prototype.variants.map((variant) => variant[2])),
  ).filter(Boolean);
  const sources = THUMBNAIL_SOURCES.map(({ id }) => id);
  assert.deepEqual([...sources].sort(), [...new Set(boardShots)].sort());

  const hashes = [];
  for (const { id, ref, page } of THUMBNAIL_SOURCES) {
    const [sourcePage] = page.split('?');
    const screenshotPath = join(CANVAS_DIR, 'assets', 'protos', `${id}.jpg`);
    assert.match(ref, /^origin\/prototype\/\d+-/, `${id} has a source prototype branch`);
    assert.ok(sourcePage.length > 0, `${id} has a source page`);
    assert.ok(existsSync(screenshotPath), `${id} screenshot exists`);

    const image = readFileSync(screenshotPath);
    assert.deepEqual(jpegDimensions(image), VIEWPORT, `${id} was captured at the standard viewport`);
    hashes.push(createHash('sha256').update(image).digest('hex'));
  }
  assert.equal(new Set(hashes).size, THUMBNAIL_SOURCES.length, 'each screenshot visibly represents a different variant');
});

test('a missing variant screenshot falls back to the sketch frame', () => {
  const window = {};
  const document = { addEventListener: () => {} };
  const data = { STATES: {}, TYPES: {}, REPOS: [] };
  const kit = { esc: String, icon: () => '' };
  runInNewContext(readFileSync(join(CANVAS_DIR, 'variants', 'shell.js'), 'utf8'), {
    window,
    document,
    location: { search: '' },
    URLSearchParams,
    DATA: data,
    Kit: kit,
  });

  const frame = window.WF.frame('B', { shot: 'missing' });
  assert.match(frame, /\.\.\/assets\/protos\/missing\.jpg/);
  assert.match(frame, /onerror="WF\.onThumbnailError\(this\)"/);
  assert.match(frame, /class="col"/);
  assert.match(frame, /class="fb"/);

  const image = { hidden: false, parentElement: { classList: { add: (value) => (image.fallback = value) } } };
  window.WF.onThumbnailError(image);
  assert.equal(image.hidden, true);
  assert.equal(image.fallback, 'is-fallback');

  const fallback = window.WF.frame('A');
  assert.doesNotMatch(fallback, /<img /);
  assert.match(fallback, /class="col"/);

  const styles = readFileSync(join(CANVAS_DIR, 'variants', 'shell.css'), 'utf8');
  assert.match(styles, /\.wf-frame\.has-shot\.is-fallback img\s*\{\s*display:\s*none;/);
  assert.match(styles, /\.wf-frame\.has-shot\.is-fallback \.col\s*\{\s*display:\s*grid;/);
  assert.match(styles, /\.wf-frame\.has-shot\.is-fallback \.fb\s*\{\s*display:\s*grid;/);
});
