import { describe, expect, it, vi } from 'vitest';

import { WorkspaceResolver, repoFromRemoteUrl } from './workspaces.js';
import type { WorkspaceDependencies } from './workspaces.js';

const REPO = 'octo/one';

/** Verification that accepts the paths it is given, so a test never touches git or gh. */
function verifier(clones: Record<string, string>): WorkspaceDependencies['verify'] {
  return async (path, repo) => (repo === REPO ? (clones[path] ?? null) : null);
}

function dependencies(overrides: Partial<WorkspaceDependencies> = {}): {
  deps: WorkspaceDependencies;
  remembered: Record<string, string>;
} {
  const remembered: Record<string, string> = {};
  const deps: WorkspaceDependencies = {
    knownProjects: async () => [],
    verify: async () => null,
    readRemembered: async () => ({ ...remembered }),
    writeRemembered: async (all) => {
      for (const key of Object.keys(remembered)) delete remembered[key];
      Object.assign(remembered, all);
    },
    ...overrides,
  };
  return { deps, remembered };
}

describe('repoFromRemoteUrl', () => {
  it('reads owner/name from the remote forms git writes', () => {
    expect(repoFromRemoteUrl('https://github.com/octo/one.git')).toBe('octo/one');
    expect(repoFromRemoteUrl('git@github.com:octo/one.git')).toBe('octo/one');
    expect(repoFromRemoteUrl('ssh://git@github.com/octo/one')).toBe('octo/one');
    expect(repoFromRemoteUrl('https://octo@github.com/octo/one/')).toBe('octo/one');
  });

  it('ignores remotes that are not github.com', () => {
    expect(repoFromRemoteUrl('https://gitlab.com/octo/one.git')).toBeNull();
    expect(repoFromRemoteUrl('/srv/mirrors/one.git')).toBeNull();
  });
});

describe('WorkspaceResolver', () => {
  it('uses the checkout the CLI was launched in without asking T3 Code', async () => {
    const knownProjects = vi.fn(async () => ['/elsewhere']);
    const { deps } = dependencies({ knownProjects });
    const resolver = new WorkspaceResolver(deps, { repo: 'Octo/One', root: '/launch' });

    await expect(resolver.state(REPO)).resolves.toEqual({ status: 'ready', path: '/launch' });
    expect(knownProjects).not.toHaveBeenCalled();
  });

  it('takes the one T3 Code project that verifies, and remembers it', async () => {
    const { deps, remembered } = dependencies({
      knownProjects: async () => ['/other', '/clone'],
      verify: verifier({ '/clone': '/clone' }),
    });

    await expect(new WorkspaceResolver(deps).state(REPO)).resolves.toEqual({ status: 'ready', path: '/clone' });
    expect(remembered).toEqual({ 'octo/one': '/clone' });
  });

  it('counts two projects in the same checkout once', async () => {
    const { deps } = dependencies({
      knownProjects: async () => ['/clone', '/clone/packages/ui'],
      verify: verifier({ '/clone': '/clone', '/clone/packages/ui': '/clone' }),
    });

    await expect(new WorkspaceResolver(deps).state(REPO)).resolves.toEqual({ status: 'ready', path: '/clone' });
  });

  it('asks the user to choose when several checkouts qualify', async () => {
    const { deps, remembered } = dependencies({
      knownProjects: async () => ['/one', '/two'],
      verify: verifier({ '/one': '/one', '/two': '/two' }),
    });

    await expect(new WorkspaceResolver(deps).state(REPO)).resolves.toEqual({ status: 'choose', candidates: ['/one', '/two'] });
    expect(remembered).toEqual({});
  });

  it('asks the user to choose when nothing qualifies', async () => {
    const { deps } = dependencies({ knownProjects: async () => ['/nope'] });
    const resolver = new WorkspaceResolver(deps);

    await expect(resolver.state(REPO)).resolves.toEqual({ status: 'choose', candidates: [] });
    await expect(resolver.resolve(REPO)).resolves.toBeNull();
  });

  it('survives T3 Code being unreachable', async () => {
    const { deps } = dependencies({
      knownProjects: async () => {
        throw new Error('T3 Code is not running');
      },
    });

    await expect(new WorkspaceResolver(deps).state(REPO)).resolves.toEqual({ status: 'choose', candidates: [] });
  });

  it('re-verifies a remembered clone and forgets it once it stops being one', async () => {
    const clones: Record<string, string> = { '/moved': '/moved' };
    const { deps, remembered } = dependencies({ verify: verifier(clones) });
    const resolver = new WorkspaceResolver(deps);
    await resolver.choose(REPO, '/moved');

    await expect(new WorkspaceResolver(deps).state(REPO)).resolves.toEqual({ status: 'ready', path: '/moved' });

    delete clones['/moved'];
    await expect(new WorkspaceResolver(deps).state(REPO)).resolves.toEqual({ status: 'choose', candidates: [] });
    expect(remembered).toEqual({});
  });

  it('refuses a folder that is not a checkout of the repository', async () => {
    const { deps, remembered } = dependencies({ verify: verifier({ '/clone': '/clone' }) });

    await expect(new WorkspaceResolver(deps).choose(REPO, '/downloads')).rejects.toThrow('not a checkout of octo/one');
    expect(remembered).toEqual({});
  });
});
