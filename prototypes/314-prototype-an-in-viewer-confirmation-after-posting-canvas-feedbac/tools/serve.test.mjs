import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createPreviewHandler } from './serve.mjs';

async function request(url, overrides = {}, handler = createPreviewHandler()) {
  const result = {};
  await handler({ url, method: 'GET', headers: { host: '127.0.0.1:4390' }, ...overrides }, {
    writeHead(status, headers) { result.status = status; result.headers = headers; return this; },
    end(body) { result.body = body?.toString(); },
  });
  return result;
}

test('preview rejects foreign or missing Host headers', async () => {
  for (const host of ['evil.example:4390', '127.0.0.1:9999', '127.0.0.1:4390.evil.example', undefined]) {
    assert.equal((await request('/src/ui/styles.css', { headers: { host } })).status, 403);
  }
});

test('preview only serves explicit board assets', async () => {
  for (const url of ['/.env', '/package.json', '/src/server.ts', '/prototypes/canvas/tools/serve.mjs', '/src/ui/../../.env', '/src/ui%5cstyles.css']) {
    assert.equal((await request(url)).status, 403);
  }
  const response = await request('/src/ui/styles.css');
  assert.equal(response.status, 200);
  assert.match(response.body, /\.vw/);
  assert.match(response.headers['content-security-policy'], /^sandbox /);
  assert.equal((await request('/src/ui/styles.css', { method: 'POST' })).status, 405);
  assert.equal((await request('/src/ui/styles.css', { method: 'HEAD' })).body, undefined);
});

test('malformed percent encoding returns 400 and the next request succeeds', async () => {
  for (const url of ['/%ZZ', '/%E0%A4%A']) assert.equal((await request(url)).status, 400);
  assert.equal((await request('/src/ui/styles.css')).status, 200);
});

test('an allowed asset cannot escape the allowed files through a directory symlink', async () => {
  const area = await mkdtemp(join(tmpdir(), 'wf314-preview-'));
  const root = join(area, 'repo');
  const outside = join(area, 'outside');
  try {
    await mkdir(join(root, 'src'), { recursive: true });
    await mkdir(outside);
    await writeFile(join(outside, 'styles.css'), 'outside secret');
    await symlink(outside, join(root, 'src', 'ui'), process.platform === 'win32' ? 'junction' : 'dir');
    const response = await request('/src/ui/styles.css', {}, createPreviewHandler({ root }));
    assert.equal(response.status, 403);
    assert.doesNotMatch(response.body, /outside secret/);
    await rm(join(root, 'src', 'ui'));
    const privateDirectory = join(root, 'private');
    await mkdir(privateDirectory);
    await writeFile(join(privateDirectory, 'styles.css'), 'inside secret');
    await symlink(privateDirectory, join(root, 'src', 'ui'), process.platform === 'win32' ? 'junction' : 'dir');
    const inside = await request('/src/ui/styles.css', {}, createPreviewHandler({ root }));
    assert.equal(inside.status, 403);
    assert.doesNotMatch(inside.body, /inside secret/);
  } finally {
    assert.ok(resolve(area).startsWith(resolve(tmpdir()) + sep));
    await rm(area, { recursive: true, force: true });
  }
});
