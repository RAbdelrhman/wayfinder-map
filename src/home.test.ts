import { describe, expect, it, vi } from 'vitest';

import { discoverRepositories, listRepositories, loadHomeState, readAccount } from './home.js';
import type { HomeGh } from './home.js';

function runner(outputs: readonly (string | Error)[]): HomeGh {
  const remaining = [...outputs];
  return vi.fn(async () => {
    const output = remaining.shift();
    if (output instanceof Error) throw output;
    return output ?? '';
  });
}

const ready = JSON.stringify({
  hosts: {
    'github.com': [
      { login: 'octo', active: true, tokenSource: 'keyring', scopes: ['repo', 'read:org'] },
      { login: 'mona', active: false, scopes: ['repo', 'read:org'] },
    ],
  },
});

describe('readAccount', () => {
  it('reports the active account and all switchable accounts', async () => {
    await expect(readAccount(runner([ready, 'https://avatars.githubusercontent.com/u/1?s=64']))).resolves.toMatchObject({
      status: 'ready',
      login: 'octo',
      avatarUrl: 'https://avatars.githubusercontent.com/u/1?s=64',
      accounts: ['octo', 'mona'],
      tokenSource: 'keyring',
    });
  });

  it('accepts the comma-separated scope format returned by gh', async () => {
    const status = JSON.stringify({ hosts: { 'github.com': [{ login: 'octo', active: true, scopes: 'gist, read:org, repo' }] } });
    await expect(readAccount(runner([status]))).resolves.toMatchObject({ status: 'ready', missingScopes: [] });
  });

  it('keeps Home recoverable when gh is missing or signed out', async () => {
    await expect(readAccount(runner([new Error('spawn gh ENOENT')]))).resolves.toMatchObject({ status: 'missing-gh' });
    await expect(readAccount(runner([JSON.stringify({ hosts: {} })]))).resolves.toMatchObject({ status: 'signed-out' });
  });

  it('names missing discovery scopes', async () => {
    const status = JSON.stringify({ hosts: { 'github.com': [{ login: 'octo', active: true, scopes: ['repo'] }] } });
    await expect(readAccount(runner([status]))).resolves.toMatchObject({
      status: 'missing-scopes',
      missingScopes: ['read:org'],
    });
  });
});

describe('discoverRepositories', () => {
  it('uses viewer and organization scopes and preserves SSO partial results', async () => {
    const runGh = runner([
      'acme\n',
      'HTTP/2 200\r\nx-github-sso: partial-results; organizations=secret-co\r\n\r\n' +
        JSON.stringify({
          items: [
            { repository_url: 'https://api.github.com/repos/octo/one' },
            { repository_url: 'https://api.github.com/repos/acme/two' },
            { repository_url: 'https://api.github.com/repos/octo/one' },
          ],
        }),
    ]);
    const account = await readAccount(runner([ready, 'https://avatars.githubusercontent.com/u/1?s=64']));

    await expect(discoverRepositories(account, ['wayfinder:map'], runGh)).resolves.toEqual({
      repositories: ['acme/two', 'octo/one'],
      skippedOrganizations: ['secret-co'],
    });
    expect(runGh).toHaveBeenLastCalledWith(expect.arrayContaining(['q=label:"wayfinder:map" user:octo user:acme']));
  });

  it('turns rate-limit failures into a visible Home warning', async () => {
    const state = await loadHomeState(['wayfinder:map'], runner([ready, 'https://avatars.githubusercontent.com/u/1?s=64', new Error('API rate limit exceeded')]));
    expect(state.warning).toContain('rate limit');
    expect(state.account.status).toBe('ready');
  });
});

describe('listRepositories', () => {
  it('lists every repository the account can reach, keeping GitHub order', async () => {
    const runGh = runner(['octo/recent\r\nacme/older\n\nocto/recent\n']);
    await expect(listRepositories(runGh)).resolves.toEqual(['octo/recent', 'acme/older']);
    expect(runGh).toHaveBeenCalledWith(['api', '--paginate', 'user/repos?per_page=100&sort=pushed', '--jq', '.[].full_name']);
  });
});
