import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { normalizeRepo } from './repoRoutes.js';

const run = promisify(execFile);

export type RepositoryCloneFailure = 'invalid-repository' | 'destination' | 'authentication' | 'network' | 'git';

export class RepositoryCloneError extends Error {
  constructor(
    readonly kind: RepositoryCloneFailure,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'RepositoryCloneError';
  }
}

export type CloneCommand = (repositoryUrl: string, destination: string) => Promise<void>;

async function cloneWithGit(repositoryUrl: string, destination: string): Promise<void> {
  await run('git', ['clone', '--progress', repositoryUrl, destination], {
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function commandOutput(error: unknown): string {
  if (typeof error !== 'object' || error === null) return String(error);
  const details = error as { message?: unknown; stderr?: unknown };
  return [details.message, details.stderr]
    .filter((part): part is string => typeof part === 'string')
    .join('\n')
    .toLowerCase();
}

function cloneFailure(error: unknown, repo: string): RepositoryCloneError {
  const details = commandOutput(error);
  if (/already exists.*not an empty directory|not an empty directory|directory not empty|enotempty/.test(details)) {
    return new RepositoryCloneError('destination', 'Choose an empty folder for the clone.', 400);
  }
  if (/authentication failed|could not read username|permission denied \(publickey\)|repository not found|403 forbidden|returned error: 403|status code: 401/.test(details)) {
    return new RepositoryCloneError(
      'authentication',
      `GitHub could not access ${repo}. Check your GitHub sign-in and repository access.`,
      502,
    );
  }
  if (/could not create work tree dir|access is denied|eacces|eperm/.test(details)) {
    return new RepositoryCloneError('destination', 'Wayfinder cannot write to that folder. Choose another folder.', 400);
  }
  if (/could not resolve|failed to connect|network is unreachable|connection timed out|operation timed out|connection reset|unable to access|could not resolve proxy|ssl certificate problem/.test(details)) {
    return new RepositoryCloneError('network', 'Could not reach GitHub. Check your network and try again.', 502);
  }
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
    return new RepositoryCloneError('git', 'Git is unavailable. Install Git and restart Wayfinder.', 503);
  }
  return new RepositoryCloneError('git', `Could not clone ${repo}. Check Git and try again.`, 502);
}

/** Clone a public or private GitHub repository into the destination selected for this request. */
export async function cloneRepository(
  repo: string,
  targetDirectory: string,
  command: CloneCommand = cloneWithGit,
): Promise<string> {
  const normalized = normalizeRepo(repo);
  if (normalized === null) throw new RepositoryCloneError('invalid-repository', 'Enter a valid repository (owner/name).', 400);
  if (targetDirectory.trim().length === 0) throw new RepositoryCloneError('destination', 'Choose a folder for the clone.', 400);

  const destination = resolve(targetDirectory.trim());
  try {
    await command(`https://github.com/${normalized}.git`, destination);
  } catch (error) {
    throw cloneFailure(error, normalized);
  }
  return destination;
}
