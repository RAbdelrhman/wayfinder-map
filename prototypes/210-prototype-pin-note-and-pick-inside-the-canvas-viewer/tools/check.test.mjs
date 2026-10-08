// Run with: node --test <canvas>/tools/check.test.mjs
import '../../canvas/tools/check.test.mjs';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { loadConfig, checkCanvas, checkPageHtml } from './check.mjs';

const canvasDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = loadConfig(readFileSync(resolve(canvasDir, 'config.js'), 'utf8'));
const items = config.pages.flatMap(page => page.sections.flatMap(section => section.items));

test('#210 preserves original options and named remix provenance without choosing for Ramon', () => {
  assert.equal(config.ticket, 210);
  for (const id of ['A', 'B', 'A2', 'A3']) {
    const item = items.find(item => item.id === id);
    assert.ok(item, `preserve ${id}`);
    assert.equal(item.note.disposition, undefined, `${id} has no submitted disposition yet`);
    assert.ok(item.note.pros.length && item.note.cons.length, `${id} exposes trade-offs`);
  }
  assert.deepEqual(items.find(item => item.id === 'A2').note.basedOn, ['A']);
  assert.deepEqual(items.find(item => item.id === 'A3').note.basedOn, ['A', 'A2']);
  assert.ok(config.pages.every(page => page.round && page.title));
});

test('#210 config references existing sandbox-compatible pages', () => {
  const disk = {
    exists: path => existsSync(resolve(canvasDir, path)),
    read: path => readFileSync(resolve(canvasDir, path), 'utf8'),
  };
  assert.deepEqual(checkCanvas(config, disk).errors, []);
  for (const item of items.filter(item => item.src)) {
    assert.deepEqual(checkPageHtml(disk.read(item.src)), []);
    const scripts = [...disk.read(item.src).matchAll(/<script[^>]*src="([^"]+)"/g)];
    for (const [, src] of scripts) {
      const path = resolve(canvasDir, dirname(item.src), src);
      assert.ok(existsSync(path), `${item.id} script ${src} exists`);
      assert.deepEqual(checkPageHtml(readFileSync(path, 'utf8')), [], `${item.id} script is sandbox safe`);
    }
  }
});
