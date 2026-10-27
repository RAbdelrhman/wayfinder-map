import { removeCache } from './cache';
import { GithubError } from './github';

/** Confirmed loss of access discards content; transient failures preserve the last positive snapshot. */
export async function resourceFailure(
  storage: { removeItem(key: string): Promise<void> },
  login: string,
  key: string,
  error: unknown,
) {
  const denied =
    error instanceof GithubError && [401, 404].includes(error.status);
  if (denied) await removeCache(storage, login, key).catch(() => undefined);
  return {
    ...(denied ? { data: null, savedAt: null } : {}),
    loading: false,
    refreshing: false,
    error:
      error instanceof Error
        ? error.message
        : 'Couldn’t load this from GitHub. Try again.',
  };
}
