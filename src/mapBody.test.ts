import { describe, expect, it } from 'vitest';

import { parseBlockedByLine, parseChildNumbers, parseMapBody } from './mapBody.js';

const MAP_BODY = `## Destination

A teammate can give a file to another teammate.

## Notes

Read CONTEXT.md for the vocabulary.

## Decisions so far

- Transfer stays direct, teammate to teammate.

## Not yet specified

- What happens when the holder is asleep.

## Out of scope

- A host-side file store.
`;

describe('parseMapBody', () => {
  it('splits a map body into its named sections', () => {
    const sections = parseMapBody(MAP_BODY);
    expect(sections.destination).toBe('A teammate can give a file to another teammate.');
    expect(sections.notes).toBe('Read CONTEXT.md for the vocabulary.');
    expect(sections.decisions).toBe('- Transfer stays direct, teammate to teammate.');
    expect(sections.fog).toBe('- What happens when the holder is asleep.');
    expect(sections.outOfScope).toBe('- A host-side file store.');
  });

  it('accepts the Fog and Decisions aliases', () => {
    const sections = parseMapBody('## Fog\n\nunknown\n\n## Decisions\n\nsettled\n');
    expect(sections.fog).toBe('unknown');
    expect(sections.decisions).toBe('settled');
  });

  it('leaves every section empty when the body has no headings', () => {
    expect(parseMapBody('just prose, no headings')).toEqual({
      destination: '',
      notes: '',
      decisions: '',
      fog: '',
      outOfScope: '',
    });
  });

  it('ignores text under headings it does not know', () => {
    expect(parseMapBody('## Shopping list\n\nmilk\n').destination).toBe('');
  });
});

describe('parseBlockedByLine', () => {
  it('reads the fallback blocker line', () => {
    expect(parseBlockedByLine('Blocked by: #12, #7\n\nrest of the body')).toEqual([12, 7]);
  });

  it('is case insensitive and drops repeats', () => {
    expect(parseBlockedByLine('blocked BY: #4 #4 #9')).toEqual([4, 9]);
  });

  it('returns nothing when there is no such line', () => {
    expect(parseBlockedByLine('This ticket mentions #5 but is not blocked.')).toEqual([]);
  });
});

describe('parseChildNumbers', () => {
  it('reads a task list', () => {
    const body = '- [ ] #12 decide the shape\n- [x] #13 build it\n';
    expect(parseChildNumbers(body, 'owner/repo')).toEqual([12, 13]);
  });

  it('reads full issue URLs for the same repo only', () => {
    const body = [
      '- [Ours](https://github.com/owner/repo/issues/21)',
      '- [Theirs](https://github.com/other/repo/issues/99)',
    ].join('\n');
    expect(parseChildNumbers(body, 'owner/repo')).toEqual([21]);
  });

  it('survives regex characters in the repo name', () => {
    expect(parseChildNumbers('https://github.com/a.b/c+d/issues/3', 'a.b/c+d')).toEqual([3]);
  });
});
