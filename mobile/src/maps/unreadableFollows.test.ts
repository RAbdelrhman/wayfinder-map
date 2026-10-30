import { describe, expect, it } from 'vitest';
import { followReason, followsNotShowing, restoredFollow, sharedFollowState } from './unreadableFollows';
import type { MapSummary } from './github';

describe('unreadable followed maps, chosen #359 Round 2 A', () => {
  it('newer confirmed shared-map failures replace old details; list absence does not', () => {
    const map: MapSummary = { repo: 'o/r', number: 21, title: 'Old public title', body: 'Visibility: public', url: '', author: 'other', open: true, updatedAt: '', completed: 0, total: 1 };
    const previous = { map, missing: null, observedAt: 100 };
    const latest = { fresh: true, savedAt: 200, denied: false, maps: [], hidden: [], unavailable: [] };
    expect(sharedFollowState(map, previous, latest).map).toBe(map);
    expect(sharedFollowState(map, previous, { ...latest, unavailable: [{ repo: 'o/r', number: 21, reason: 'label' }] })).toMatchObject({ map: null, missing: { reason: 'label' } });
    const hidden = { ...map, body: 'Visibility: private' };
    expect(sharedFollowState(map, previous, { ...latest, hidden: [hidden] })).toEqual({ map: null, hidden, missing: null });
    expect(sharedFollowState(map, previous, { ...latest, savedAt: 99, hidden: [hidden] }).map).toBe(map);
    expect(sharedFollowState(map, previous, { ...latest, fresh: false, hidden: [hidden] }).map).toBe(map);
    expect(sharedFollowState(map, previous, { ...latest, denied: true })).toMatchObject({ map: null, missing: { reason: 'issue' } });
    expect(sharedFollowState(map, previous, { ...latest, hidden: [hidden], unavailable: [{ repo: 'o/r', number: 21, reason: 'repo' }] })).toMatchObject({ map: null, hidden: null, missing: { reason: 'repo' } });
  });
  it('keeps unknown access distinct from a positive non-map observation', () => {
    const unknown = followReason({ repo: 'o/r', number: 21 });
    expect(unknown.head).toBe("Can't read this map");
    expect(unknown.text).not.toMatch(/private|not public/i);
    expect(followReason({ repo: 'o/r', number: 201, reason: 'label' }).head).toBe('Not a map now');
  });
  it('preserves the chosen centered repository reference without a reason line', () => {
    expect(followReason({ repo: 'o/r', number: 3, reason: 'repo' })).toMatchObject({ centered: true, head: '', text: '' });
  });
  it('counts hidden, unknown and unsaved follows once and explains an empty offline cache', () => {
    const unknown = { repo: 'o/r', number: 21 };
    expect(followsNotShowing([{ repo: 'o/r', number: 198 }], [unknown, unknown, { repo: 'o/r', number: 8, reason: 'nosave' }])).toEqual({ head: "3 followed maps aren't showing", text: "1 not public now · 1 can't be read · 1 with no saved details" });
    expect(followsNotShowing([], [{ repo: 'o/r', number: 8, reason: 'nosave' }])).toEqual({ head: '1 followed map has no saved details', text: 'It shows when GitHub can be reached.' });
    expect(followsNotShowing([], [])).toBeNull();
  });
  it('restores shared details only on a newer successful fetch for that exact map', () => {
    const map: MapSummary = { repo: 'o/r', number: 21, title: 'Current public map', body: 'Visibility: public', url: 'https://github.com/o/r/issues/21', author: 'author', open: true, updatedAt: '', completed: 0, total: 1 };
    expect(restoredFollow(map, 100, { fresh: false, savedAt: 200, maps: [map] })).toBeNull();
    expect(restoredFollow(map, 100, { fresh: true, savedAt: 99, maps: [map] })).toBeNull();
    expect(restoredFollow(map, 100, { fresh: true, savedAt: 100, maps: [map] })).toBeNull();
    expect(restoredFollow(map, 100, { fresh: true, savedAt: 200, maps: [{ ...map, repo: 'foreign/repo' }] })).toBeNull();
    expect(restoredFollow(map, 100, { fresh: true, savedAt: 200, maps: [map] })).toBe(map);
  });
});
