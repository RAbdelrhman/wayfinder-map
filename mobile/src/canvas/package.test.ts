import { describe, expect, it } from 'vitest';
import { assetReferences, branchForTicket, isolatedCanvasHtml, prototypeBoards, relativeAsset, safeAssetPath } from './package';

describe('immutable canvas package boundaries', () => {
  it('finds independent boards for the exact ticket', () => {
    const files = ['prototypes/366-replies/index.html', 'prototypes/366-replies/config.js', 'prototypes/366-replies/second/index.html', 'prototypes/366-replies/second/config.js', 'prototypes/3660-other/index.html', 'prototypes/3660-other/config.js'];
    expect(prototypeBoards(366, files.map(path => ({ path, sha: 'a'.repeat(40), size: 1 })))).toEqual(['prototypes/366-replies/index.html', 'prototypes/366-replies/second/index.html']);
    expect(branchForTicket('prototype/366-replies', 366)).toBe(true);
    expect(branchForTicket('prototype/3660-other', 366)).toBe(false);
  });
  it('follows relative assets outside the board without admitting external hosts or app files', () => {
    expect(relativeAsset('prototypes/366-replies/index.html', '../../src/ui/styles.css')).toBe('src/ui/styles.css');
    expect(assetReferences('prototypes/x/index.html', '<link href="../../src/ui/styles.css"><img src="assets/a.png">')).toEqual(['src/ui/styles.css', 'prototypes/x/assets/a.png']);
    for (const path of ['../auth/token.json', '/etc/passwd', 'https://evil.test/a.js', 'file:///private/token', 'assets/%2e%2e/a.js', '.env']) expect(safeAssetPath(path), path).toBe(false);
    expect(relativeAsset('prototypes/x/index.html', 'https://evil.test/a.js')).toBeNull();
  });
  it('puts a network-denying policy before repository code', () => {
    const html = isolatedCanvasHtml('<!doctype html><html><head><script>fetch("https://evil.test")</script></head></html>');
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<script>'));
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("base-uri 'none'");
  });
});
