import { describe, expect, it } from 'vitest';
import { PosterCache, canvasSkeletonHtml, readCanvasPoster } from './canvasPoster.js';
import { canvasPosterFile } from '../prototypes.js';

describe('canvas loading metadata', () => {
  it('selects only a board-level stored poster beside the selected board', () => {
    expect(canvasPosterFile(['other/assets/poster.png', 'canvas/assets/poster.webp'], 'canvas/index.html')).toBe('canvas/assets/poster.webp');
    expect(canvasPosterFile(['canvas/assets/option-A.png'], 'canvas/index.html')).toBeNull();
  });
  it('accepts only same-origin prototype file addresses', () => {
    expect(readCanvasPoster('https://evil.test/poster.png', 'http://localhost')).toBeNull();
    expect(readCanvasPoster('/api/secret', 'http://localhost')).toBeNull();
  });
  it('uses actual names and escapes their markup', () => {
    const html = canvasSkeletonHtml({ url: '/proto/x', title: 'Canvas', github: '', file: null, variants: [{ id: 'A', name: '<script>bad</script>' }] });
    expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('wf-bone');
  });
});

describe('decoded poster cache', () => {
  it('deduplicates in-flight requests and exposes only decoded images', async () => {
    let resolve!: (image: HTMLImageElement) => void;
    let calls = 0;
    const cache = new PosterCache(() => { calls++; return new Promise(done => { resolve = done; }); });
    cache.request('/poster'); cache.request('/poster');
    expect(cache.ready('/poster')).toBeNull();
    const image = {} as HTMLImageElement;
    resolve(image);
    expect(await cache.whenReady('/poster')).toBe(image);
    expect(cache.ready('/poster')).toBe(image);
    expect(calls).toBe(1);
  });
  it('retains failure as unavailable and bounds cached entries', async () => {
    const cache = new PosterCache(async () => { throw new Error('decode failed'); }, 1);
    expect(await cache.whenReady('/one')).toBeNull();
    await cache.whenReady('/two');
    expect(cache.ready('/one')).toBeNull();
    expect(cache.ready('/two')).toBeNull();
    const image = {} as HTMLImageElement;
    cache.adopt('/three', image);
    cache.adopt('/four', image);
    expect(cache.ready('/three')).toBeNull();
    expect(cache.ready('/four')).toBe(image);
  });
});
