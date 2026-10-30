import { removeCache } from './cache';
import { GithubNetworkError, isGithubAccessDenied } from './github';

/** Confirmed loss of access discards content; transient failures preserve the last positive snapshot. */
export async function resourceFailure(
  storage: { removeItem(key: string): Promise<void> },
  login: string,
  key: string,
  error: unknown,
) {
  const denied = isGithubAccessDenied(error);
  if (denied) await removeCache(storage, login, key).catch(() => undefined);
  return {
    ...(denied ? { data: null, savedAt: null } : {}),
    accessDenied: denied,
    offline: error instanceof GithubNetworkError,
    loading: false,
    refreshing: false,
    error:
      error instanceof Error
        ? error.message
        : 'Couldn’t load this from GitHub. Try again.',
  };
}
