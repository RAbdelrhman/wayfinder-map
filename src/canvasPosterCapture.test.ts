import { mkdtemp, mkdir, writeFile, rm, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { canvasDirectory, checkPoster } from '../scripts/capture-canvas-poster.mjs';

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'canvas-poster-test-'));
  temporary.push(root);
  const board = join(root, 'prototypes', 'board');
  await mkdir(join(board, 'assets'), { recursive: true });
  await writeFile(join(board, 'index.html'), '<!doctype html><title>Board</title>');
  return { root, board };
}

describe('canvas poster authoring contract', () => {
  it('accepts an existing board and refuses directories outside prototypes', async () => {
    const { root, board } = await fixture();
    expect(await canvasDirectory(root, 'prototypes/board')).toBe(await realpath(board));
    await expect(canvasDirectory(root, '.')).rejects.toThrow('inside prototypes');
    await expect(canvasDirectory(root, 'prototypes')).rejects.toThrow('inside prototypes');
  });
  it('returns the canonical directory when the repository is reached through an alias', async () => {
    const { root, board } = await fixture();
    const alias = join(root, 'repo-link');
    await symlink(root, alias, 'junction');
    expect(await canvasDirectory(alias, 'prototypes/board')).toBe(await realpath(board));
  });
  it('requires a decodable WebP at the viewer capture dimensions', async () => {
    const { board } = await fixture();
    const poster = join(board, 'assets', 'poster.webp');
    await writeFile(poster, 'broken');
    await expect(checkPoster(board)).rejects.toThrow();
    await sharp({ create: { width: 16, height: 16, channels: 3, background: '#eee' } }).webp().toFile(poster);
    await expect(checkPoster(board)).rejects.toThrow('1280');
    await sharp({ create: { width: 1280, height: 800, channels: 3, background: '#eee' } }).webp().toFile(poster);
    expect(await checkPoster(board)).toBe(poster);
  });
});
