import { describe, expect, it } from 'vitest';
import { canvasCatalog } from './canvasCatalog.js';

describe('canvasCatalog', () => {
  it('keeps rounds and repeated option IDs on their own pages without executing config', () => {
    const source = `const PHONE = { width: 390, height: 844 }; window.CANVAS = { pages: [
      { id: 'light', title: 'Light', round: 1, sections: [{ items: [{ id: 'D', name: 'Old', src: 'same.html' }] }] },
      { id: 'dark', title: 'Dark', round: 1, sections: [{ items: [{ id: 'D', name: 'Dark', src: 'same.html' }] }] },
      { id: 'round-2', title: 'Remix', round: 2, sections: [{ items: [{ id: 'D', name: 'New', src: 'new.html', ...PHONE, note: { basedOn: ['A', 'B'], disposition: 'keep', feedback: 'Approved D' } }, { id: 'review', kind: 'note', name: 'Review' }] }] }
    ] }; throw new Error('must not run');`;
    const pages = canvasCatalog(source);
    expect(pages.map((page) => page.id)).toEqual(['light', 'dark', 'round-2']);
    expect(pages[2]?.items[0]).toMatchObject({ id: 'D', disposition: 'keep', basedOn: ['A', 'B'], width: 390, height: 844 });
    expect(pages[2]?.items).toHaveLength(1);
  });
  it('returns no metadata for malformed or executable-only config', () => {
    expect(canvasCatalog('window.CANVAS = makeConfig()')).toEqual([]);
    expect(canvasCatalog('window.CANVAS = {')).toEqual([]);
  });
});
