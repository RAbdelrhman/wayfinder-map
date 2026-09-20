import { GhError, gh } from './github.js';

const REQUIRED_SCOPES = ['repo', 'read:org'] as const;

export type AccountStatus = 'ready' | 'missing-gh' | 'signed-out' | 'missing-scopes' | 'unavailable';

export interface HomeAccount {
  status: AccountStatus;
  host: string;
  login: string | null;
  accounts: string[];
  missingScopes: string[];
  tokenSource: string | null;
  message: string | null;
}

export interface HomeState {
  account: HomeAccount;
  repositories: string[];
  skippedOrganizations: string[];
  warning: string | null;
}

export type HomeGh = (args: string[]) => Promise<string>;

interface RawAccount {
  login?: unknown;
  active?: unknown;
  tokenSource?: unknown;
  scopes?: unknown;
}

interface RawAuthStatus {
  hosts?: unknown;
}

interface SearchIssue {
  repository_url?: unknown;
}

interface SearchResponse {
  items?: unknown;
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingGh(error: unknown): boolean {
  const message = messageOf(error).toLowerCase();
  return message.includes('enoent') || message.includes('not recognized') || message.includes('not found') || message.includes('unknown flag');
}

function unavailableAccount(status: AccountStatus, message: string): HomeAccount {
  return {
    status,
    host: 'github.com',
    login: null,
    accounts: [],
    missingScopes: [],
    tokenSource: null,
    message,
  };
}

export async function readAccount(runGh: HomeGh = gh): Promise<HomeAccount> {
  let raw: RawAuthStatus;
  try {
    raw = JSON.parse(await runGh(['auth', 'status', '--json', 'hosts'])) as RawAuthStatus;
  } catch (error) {
    return isMissingGh(error)
      ? unavailableAccount('missing-gh', 'GitHub CLI is not installed or is too old for account discovery.')
      : unavailableAccount('unavailable', messageOf(error));
  }

  const hosts = typeof raw.hosts === 'object' && raw.hosts !== null ? (raw.hosts as Record<string, unknown>) : {};
  const preferredHost = Object.keys(hosts).find((host) => host === 'github.com') ?? Object.keys(hosts)[0] ?? 'github.com';
  const rawAccounts = Array.isArray(hosts[preferredHost]) ? (hosts[preferredHost] as RawAccount[]) : [];
  const accounts = rawAccounts
    .map((account) => (typeof account.login === 'string' ? account.login : null))
    .filter((login): login is string => login !== null);
  const active = rawAccounts.find((account) => account.active === true) ?? rawAccounts[0];
  if (active === undefined || typeof active.login !== 'string') {
    return unavailableAccount('signed-out', 'Sign in with GitHub to discover repositories with Wayfinder maps.');
  }

  const scopes = strings(active.scopes);
  const missingScopes = REQUIRED_SCOPES.filter((scope) => !scopes.includes(scope));
  return {
    status: missingScopes.length === 0 ? 'ready' : 'missing-scopes',
    host: preferredHost,
    login: active.login,
    accounts,
    missingScopes,
    tokenSource: typeof active.tokenSource === 'string' ? active.tokenSource : null,
    message: missingScopes.length === 0 ? null : `Grant ${missingScopes.join(' and ')} access to discover repositories.`,
  };
}

function splitHeaders(output: string): { headers: string; body: string } {
  const jsonStart = output.search(/^\s*\{/m);
  if (jsonStart < 0) throw new Error('GitHub search returned no JSON response.');
  return { headers: output.slice(0, jsonStart), body: output.slice(jsonStart) };
}

function skippedOrganizations(headers: string): string[] {
  const line = headers
    .split(/\r?\n/)
    .find((candidate) => candidate.toLowerCase().startsWith('x-github-sso:'));
  if (line === undefined || !line.toLowerCase().includes('partial-results')) return [];
  const organizations = line.match(/organizations?=([^;]+)/i)?.[1] ?? '';
  return organizations
    .split(/[ ,]+/)
    .map((organization) => organization.trim())
    .filter(Boolean);
}

function repoFromApiUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/\/repos\/([^/]+)\/([^/]+)$/);
  return match?.[1] && match[2] ? `${match[1]}/${match[2]}` : null;
}

export async function discoverRepositories(
  account: HomeAccount,
  mapLabels: readonly string[],
  runGh: HomeGh = gh,
): Promise<Pick<HomeState, 'repositories' | 'skippedOrganizations'>> {
  if (account.status !== 'ready' || account.login === null) return { repositories: [], skippedOrganizations: [] };

  const organizationOutput = await runGh(['api', '--paginate', 'user/orgs', '--jq', '.[].login']);
  const owners = [account.login, ...organizationOutput.split(/\r?\n/).map((owner) => owner.trim()).filter(Boolean)];
  const labels = `label:${[...new Set(mapLabels)].map((label) => `"${label}"`).join(',')}`;
  const ownerScope = owners.map((owner) => `user:${owner}`).join(' ');
  const output = await runGh(['api', '-i', '-X', 'GET', 'search/issues', '-f', `q=${labels} ${ownerScope}`]);
  const { headers, body } = splitHeaders(output);
  const response = JSON.parse(body) as SearchResponse;
  const issues = Array.isArray(response.items) ? (response.items as SearchIssue[]) : [];
  const repositories = [...new Set(issues.map((issue) => repoFromApiUrl(issue.repository_url)).filter((repo): repo is string => repo !== null))]
    .sort((left, right) => left.localeCompare(right));
  return { repositories, skippedOrganizations: skippedOrganizations(headers) };
}

export async function loadHomeState(mapLabels: readonly string[], runGh: HomeGh = gh): Promise<HomeState> {
  const account = await readAccount(runGh);
  if (account.status !== 'ready') {
    return { account, repositories: [], skippedOrganizations: [], warning: null };
  }

  try {
    return { account, ...(await discoverRepositories(account, mapLabels, runGh)), warning: null };
  } catch (error) {
    const message = error instanceof GhError ? error.message : messageOf(error);
    return {
      account,
      repositories: [],
      skippedOrganizations: [],
      warning: message.toLowerCase().includes('rate limit')
        ? `GitHub rate limit reached. ${message}`
        : `Repository discovery failed. ${message}`,
    };
  }
}
