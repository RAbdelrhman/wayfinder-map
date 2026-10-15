// Run both the canonical shared-canvas suite and this ticket's regression checks.
import '../../canvas/tools/check.test.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkLinkedAssets } from './check.mjs';
import { previewResponse } from './serve.mjs';
import { readFileSync, mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

test('linked script and stylesheet sandbox problems are checked', () => {
  const files = { 'variants/page.html': '<script src="code.js"></script><link href="style.css">', 'variants/code.js': 'fetch("data")', 'variants/style.css': 'a { background:url(/root.png) }' };
  const errors = checkLinkedAssets('variants/page.html', p => files[p.replaceAll('\\', '/')], p => p.replaceAll('\\', '/') in files);
  assert.ok(errors.some(e => e.includes('fetch')));
  assert.ok(errors.some(e => e.includes('root CSS')));
});

test('letters follow the produced key rather than the physical layout position', () => {
  const Kit = { icons: {}, esc: text => String(text) };
  const window = {};
  runInNewContext(readFileSync(new URL('../variants/fixtures.js', import.meta.url), 'utf8'), { Kit, window });
  const { read, matches, defaults } = window.P292;
  const event = { key: 'q', code: 'KeyA' };
  assert.equal(read(event, 'pin', defaults()).binding.key, 'Q');
  assert.equal(matches(event, { key: 'Q' }), true);
  assert.equal(matches(event, { key: 'A' }), false);
});

test('malformed URL decoding returns 400 instead of rejecting', async () => {
  let status;
  await previewResponse({ url: '/%ZZ' }, { writeHead(code) { status = code; return this; }, end() {} });
  assert.equal(status, 400);
});

test('a directory symlink outside the repository is forbidden', async () => {
  const target = mkdtempSync(join(tmpdir(), 'wf292-outside-'));
  const link = new URL('../assets/test-outside-link', import.meta.url);
  try {
    symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    let status;
    await previewResponse({ url: '/prototypes/292-prototype-settings-keyboard-shortcuts-for-the-canvas-viewer-s-to/assets/test-outside-link' }, { writeHead(code) { status = code; return this; }, end() {} });
    assert.equal(status, 403);
  } finally {
    rmSync(link, { force: true });
    rmSync(target, { recursive: true, force: true });
  }
});