import { describe, expect, it } from 'vitest';

import { mapPath, normalizeRepo, parseRepoPagePath, repoPath, scopedApiPath } from './repoRoutes.js';

describe('repository routes', () => {
  it('round-trips repository and map routes', () => {
    expect(parseRepoPagePath(repoPath('owner/repo'))).toEqual({ repo: 'owner/repo', mapNumber: null });
    expect(parseRepoPagePath(mapPath('owner/repo', 14))).toEqual({ repo: 'owner/repo', mapNumber: 14 });
    expect(scopedApiPath('owner/repo', 'snapshot')).toBe('/api/repos/owner/repo/snapshot');
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

  it('rejects malformed URL encoding', () => {
    expect(parseRepoPagePath('/repos/%/repo')).toBeNull();
  });
});
