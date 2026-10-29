import { describe, expect, it, vi } from 'vitest';
import { discoverPublicMaps } from './discovery';
import { GithubError } from './github';

describe('public map discovery', () => {
  it('does not treat an invalid repository as offline', async () => {
    const result = await discoverPublicMaps(
      {
        publicMaps: async () => {
          throw new GithubError(422, 'Look in a repository: owner/repo');
        },
      },
      'me',
      'not a repo',
      [],
      { maps: [], hidden: [], unavailable: [], warnings: [] },
      new AbortController().signal,
      async () => undefined,
    );
    expect(result.offline).toBe(false);
    expect(result.warnings).toContain('Look in a repository: owner/repo');
  });
  it('keeps accessible repositories and a removable reference when one repository is gone', async () => {
    const lost = { repo: 'lost/repo', number: 2 };
    const kept = { repo: 'good/repo', number: 3 };
    const publicMaps = vi.fn(async (repo: string) => {
      if (repo === 'lost/repo') throw new GithubError(404, 'Unavailable');
      return [];
    });
    const evict = vi.fn(async () => undefined);
    const result = await discoverPublicMaps(
      { publicMaps },
      'me',
      '',
      [lost, kept],
      { maps: [], hidden: [], unavailable: [lost], warnings: [] },
      new AbortController().signal,
      evict,
    );
    expect(result.groups.map((group) => group.repo)).toEqual([
      'lost/repo',
      'good/repo',
    ]);
    expect(result.unavailable).toEqual([{ ...lost, reason: 'repo' }]);
    expect(result.follows).toEqual([lost, kept]);
    expect(evict).toHaveBeenCalledWith([lost]);
  });
  it('keeps other groups when one repository is rate limited', async () => {
    const api = {
      publicMaps: async (repo: string) => {
        if (repo === 'busy/repo') throw new GithubError(429, 'Rate limited');
        return [];
      },
    };
    const result = await discoverPublicMaps(
      api,
      'me',
      '',
      [
        { repo: 'busy/repo', number: 1 },
        { repo: 'ok/repo', number: 2 },
      ],
      { maps: [], hidden: [], unavailable: [], warnings: [] },
      new AbortController().signal,
      async () => undefined,
    );
    expect(result.groups).toHaveLength(2);
    expect(result.warnings).toContain('Rate limited');
  });
  it('propagates account-wide authentication failure', async () => {
    const evict = vi.fn(async () => undefined);
    const refs = [{ repo: 'a/b', number: 1 }];
    await expect(
      discoverPublicMaps(
        {
          publicMaps: async () => {
            throw new GithubError(401, 'Expired');
          },
        },
        'me',
        '',
        refs,
        { maps: [], hidden: [], unavailable: [], warnings: [] },
        new AbortController().signal,
        evict,
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(evict).toHaveBeenCalledWith(refs);
  });
});
