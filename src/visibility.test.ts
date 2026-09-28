import { describe, expect, it } from 'vitest';

import { PRIVATE_NOTE, hiddenMapsMessage, isMapShown, mapVisibility } from './visibility.js';

describe('mapVisibility', () => {
  it('is public only with a Visibility: public line', () => {
    expect(mapVisibility('## Destination\n\nShip it.\n\nVisibility: public\n')).toBe('public');
    expect(mapVisibility('  visibility:   Public  ')).toBe('public');
    expect(mapVisibility('Visibility: public\r\n## Notes')).toBe('public');
  });

  it('is private for existing maps and anything that is not exactly that line', () => {
    expect(mapVisibility('')).toBe('private');
    expect(mapVisibility('## Destination\n\nShip it.')).toBe('private');
    expect(mapVisibility('Visibility: private')).toBe('private');
    expect(mapVisibility('Visibility: public soon')).toBe('private');
    expect(mapVisibility('We may set Visibility: public later.')).toBe('private');
  });
});

describe('isMapShown', () => {
  const viewer = { login: 'Ramon', follows: [7] };
  const map = (number: number, author: string | null, visibility: 'public' | 'private') => ({ number, author, visibility });

  it('always shows maps the viewer authored, public or not, whatever the letter case', () => {
    expect(isMapShown(map(1, 'ramon', 'private'), viewer)).toBe(true);
    expect(isMapShown(map(2, 'Ramon', 'public'), viewer)).toBe(true);
  });

  it('shows maps by other people only when public and followed', () => {
    expect(isMapShown(map(7, 'drive-by', 'public'), viewer)).toBe(true);
    expect(isMapShown(map(8, 'drive-by', 'public'), viewer)).toBe(false);
    expect(isMapShown(map(7, 'drive-by', 'private'), viewer)).toBe(false);
    expect(isMapShown(map(9, null, 'private'), viewer)).toBe(false);
  });
});

describe('hiddenMapsMessage', () => {
  it('counts the hidden maps in a short sentence', () => {
    expect(hiddenMapsMessage(0)).toBe('');
    expect(hiddenMapsMessage(1)).toBe('1 map from other people is hidden.');
    expect(hiddenMapsMessage(12)).toBe('12 maps from other people are hidden.');
  });

  it('explains what private means', () => {
    expect(PRIVATE_NOTE).toBe('Private in Wayfinder only. If the repository is public, this issue can still be read on GitHub.');
  });
});
