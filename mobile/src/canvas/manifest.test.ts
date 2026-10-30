import { describe, expect, it } from 'vitest';
import type { CanvasStorage } from './download';
import type { CanvasPackage } from './package';
import { canvasManifests } from './manifest';
import { matchesCanvasRequest } from './source';

function fixture() {
  const data = new Map<string, string | Uint8Array>();
  const files = (revision: string): CanvasStorage => ({
    has: path => data.has(`${revision}/${path}`),
    text: async path => {
      const value = data.get(`${revision}/${path}`);
      if (typeof value !== 'string') throw new Error('Missing saved file');
      return value;
    },
    write: (path, value) => { data.set(`${revision}/${path}`, value); },
    base64: async () => '',
    uri: path => `file:///cache/${revision}/${path}`,
  });
  const canvas = (sha: string): CanvasPackage => ({
    repo: 'o/r', ticket: 366, mapNumber: 217, sha, branch: 'prototype/366',
    board: 'prototypes/replies/index.html', title: 'Replies', question: '', notes: {},
    pages: [], files: [], bytes: 0, savedAt: 1, directory: files(sha).uri(''),
  });
  return { files, canvas };
}

describe('saved canvas revision manifests', () => {
  it('reopens an older pinned revision after newest advances and keeps newest when a pin is saved', async () => {
    const { files, canvas } = fixture();
    const a = canvas('a'.repeat(40)), b = canvas('b'.repeat(40));
    const newest = canvasManifests(files);
    newest.save(a);
    newest.save(b);
    const pinned = canvasManifests(files, a.sha.toUpperCase());
    const saved: CanvasPackage = JSON.parse((await pinned.read())!);
    expect(matchesCanvasRequest(saved, { revision: a.sha, board: a.board })).toBe(true);
    pinned.save(a);
    expect(JSON.parse((await newest.read())!).sha).toBe(b.sha);
    expect(JSON.parse((await canvasManifests(files, b.sha).read())!).sha).toBe(b.sha);
  });

  it('does not substitute latest when the requested revision has never been saved', async () => {
    const { files, canvas } = fixture();
    canvasManifests(files).save(canvas('b'.repeat(40)));
    expect(await canvasManifests(files, 'a'.repeat(40)).read()).toBeNull();
  });
});
