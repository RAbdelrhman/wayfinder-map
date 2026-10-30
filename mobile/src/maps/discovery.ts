import { GithubError, GithubNetworkError } from './github';
import type { MapRef, MapSummary, MobileGithub } from './github';
import type { UnavailableFollow } from './unreadableFollows';

export type Discovery = {
  groups: { repo: string; maps: MapSummary[] }[];
  hidden: MapSummary[];
  unavailable: UnavailableFollow[];
  warnings: string[];
  follows: MapRef[];
  offline: boolean;
};

/** A failed repository must not prevent the other repositories or unfollowing. */
export async function discoverPublicMaps(
  api: Pick<MobileGithub, 'publicMaps'>,
  login: string,
  repo: string,
  follows: MapRef[],
  own: {
    maps: MapSummary[];
    hidden: MapSummary[];
    unavailable: UnavailableFollow[];
    warnings: string[];
  },
  signal: AbortSignal,
  evict: (refs: MapRef[]) => Promise<void>,
): Promise<Discovery> {
  const repos = repo
    ? [repo]
    : [
        ...new Set([
          ...own.maps.map((map) => map.repo),
          ...follows.map((ref) => ref.repo),
        ]),
      ];
  const warnings = [...own.warnings];
  let offline = false;
  const unavailable = own.unavailable.map(ref => ({ ...ref }));
  const groups = await Promise.all(
    repos.map(async (name) => {
      try {
        return { repo: name, maps: await api.publicMaps(name, login, signal) };
      } catch (error) {
        if (signal.aborted) throw error;
        if (error instanceof GithubNetworkError) offline = true;
        if (error instanceof GithubError && error.status === 401) {
          await evict(follows);
          throw error;
        }
        if (
          error instanceof GithubError &&
          [403, 404, 410].includes(error.status) &&
          !error.rateLimited
        ) {
          const refs = follows.filter(
            (ref) => ref.repo.toLowerCase() === name.toLowerCase(),
          );
          await evict(refs);
          for (const ref of refs) {
            const previous = unavailable.find(
                (item) =>
                  item.repo.toLowerCase() === ref.repo.toLowerCase() &&
                  item.number === ref.number,
              );
            if (!previous) unavailable.push({ ...ref, reason: 'repo' });
            else if (previous.reason !== 'label') previous.reason = 'repo';
          }
        }
        warnings.push(
          error instanceof Error
            ? error.message
            : 'Couldn’t load this from GitHub. Try again.',
        );
        return { repo: name, maps: [] };
      }
    }),
  );
  return {
    groups,
    hidden: own.hidden,
    unavailable,
    warnings,
    follows,
    offline,
  };
}
