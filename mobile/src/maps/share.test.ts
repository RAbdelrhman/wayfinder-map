import { describe, expect, it } from 'vitest';
import { hiddenFollowRows, sharedMapRef } from './share';

describe('shared GitHub links', () => {
  it('accepts the repository reference promised by the input', () => {
    expect(sharedMapRef(' owner/repo#123 ')).toEqual({ repo: 'owner/repo', number: 123 });
    expect(sharedMapRef('owner/repo#9007199254740992')).toBeNull();
    expect(sharedMapRef('../repo#1')).toBeNull();
  });
  it('suppresses a stale hidden row for a map shown on the shared card', () => {
    const shared = { repo: 'Owner/Repo', number: 12 };
    const hidden = [shared, { repo: 'other/repo', number: 3 }];
    expect(
      hiddenFollowRows(
        hidden,
        new Set(['owner/repo#12', 'other/repo#3']),
        shared,
      ),
    ).toEqual([hidden[1]]);
  });
  it('extracts a GitHub issue link from shared text', () => {
    expect(
      sharedMapRef('A map https://github.com/owner/repo/issues/123?x=1'),
    ).toEqual({ repo: 'owner/repo', number: 123 });
  });
  it.each([
    'https://github.com.evil.test/a/b/issues/1',
    'http://github.com/a/b/issues/1',
    'https://github.com/a/b/pull/1',
    'https://github.com/../b/issues/1',
    'https://github.com/a/b/issues/0',
  ])('rejects %s', (link) => {
    expect(sharedMapRef(link)).toBeNull();
  });
});
