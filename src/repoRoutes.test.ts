import { describe, expect, it } from 'vitest';

import { draftMapPath, mapPath, normalizeRepo, parseRepoPagePath, prototypesPath, repoPath, scopedApiPath } from './repoRoutes.js';

describe('repository routes', () => {
  it('round-trips repository and map routes', () => {
    expect(parseRepoPagePath(repoPath('owner/repo'))).toEqual({ repo: 'owner/repo', mapNumber: null });
    expect(parseRepoPagePath(mapPath('owner/repo', 14))).toEqual({ repo: 'owner/repo', mapNumber: 14 });
    expect(scopedApiPath('owner/repo', 'snapshot')).toBe('/api/repos/owner/repo/snapshot');
    expect(scopedApiPath('owner/repo', 'ticket')).toBe('/api/repos/owner/repo/ticket');
    expect(scopedApiPath('owner/repo', 'clone')).toBe('/api/repos/owner/repo/clone');
  });

  it.each(['owner', '/repo', 'owner/', 'owner/repo/extra', 'owner name/repo'])(
    'rejects invalid repository %s',
    (repo) => expect(normalizeRepo(repo)).toBeNull(),
  );

  it('rejects malformed and non-positive map routes', () => {
    expect(parseRepoPagePath('/repos/owner/repo/maps/0')).toBeNull();
    expect(parseRepoPagePath('/repos/owner/repo/maps/nope')).toBeNull();
    expect(parseRepoPagePath('/elsewhere')).toBeNull();
  });

  it('parses a draft route by its hand-off ID and builds the same route', () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';
    const path = draftMapPath('owner/repo', id);
    expect(path).toBe(`/repos/owner/repo/maps/draft-${id}`);
    expect(parseRepoPagePath(path)).toEqual({ repo: 'owner/repo', mapNumber: null, draftId: id });
    expect(parseRepoPagePath(`${path}/`)).toEqual({ repo: 'owner/repo', mapNumber: null, draftId: id });
    expect(() => draftMapPath('owner/repo', 'not-a-uuid')).toThrow('Invalid draft ID');
    expect(parseRepoPagePath('/repos/owner/repo/maps/draft-not-a-uuid')).toBeNull();
  });

  it('rejects malformed URL encoding', () => {
    expect(parseRepoPagePath('/repos/%/repo')).toBeNull();
  });
});

describe('the repository prototypes page', () => {
  it('has a path of its own, under the repository', () => {
    expect(prototypesPath('octo/one')).toBe('/repos/octo/one/prototypes');
    expect(parseRepoPagePath('/repos/octo/one/prototypes')).toEqual({ repo: 'octo/one', mapNumber: null, prototypes: true });
  });

  it('leaves the repository and map pages alone', () => {
    expect(parseRepoPagePath('/repos/octo/one')).toEqual({ repo: 'octo/one', mapNumber: null });
    expect(parseRepoPagePath('/repos/octo/one/maps/3')).toEqual({ repo: 'octo/one', mapNumber: 3 });
    expect(parseRepoPagePath('/repos/octo/one/whatever')).toBeNull();
  });
});
