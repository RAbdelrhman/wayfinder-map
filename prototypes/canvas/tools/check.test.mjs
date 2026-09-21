// Run with: node --test <canvas>/tools/check.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkCanvas, checkPageHtml, loadConfig } from './check.mjs';

const files = { 'variants/a.html': '<html><script src="../kit/kit.js"></script></html>', 'assets/x.png': '' };
const disk = { exists: (p) => p in files, read: (p) => files[p] };
const base = { title: 'T', question: 'Q?', styles: { warm: { vars: {} } } };
const run = (sections, extra = {}) => checkCanvas({ ...base, ...extra, sections }, disk);

test('a valid config of every kind passes', () => {
  const { errors } = run([
    {
      items: [
        { id: 'A', src: 'variants/a.html', note: 'n' },
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
