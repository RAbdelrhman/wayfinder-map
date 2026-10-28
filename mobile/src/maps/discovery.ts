import { GithubError } from './github';
import type { MapRef, MapSummary, MobileGithub } from './github';

export type Discovery = {
  groups: { repo: string; maps: MapSummary[] }[];
  hidden: MapSummary[];
  unavailable: MapRef[];
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
    unavailable: MapRef[];
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
  const unavailable = [...own.unavailable];
  const groups = await Promise.all(
    repos.map(async (name) => {
      try {
        return { repo: name, maps: await api.publicMaps(name, login, signal) };
      } catch (error) {
        if (signal.aborted) throw error;
        if (!(error instanceof GithubError)) offline = true;
        if (error instanceof GithubError && error.status === 401) {
          await evict(follows);
          throw error;
        }
        if (error instanceof GithubError && error.status === 404) {
          const refs = follows.filter(
            (ref) => ref.repo.toLowerCase() === name.toLowerCase(),
          );
          await evict(refs);
          for (const ref of refs)
            if (
              !unavailable.some(
                (item) =>
                  item.repo.toLowerCase() === ref.repo.toLowerCase() &&
                  item.number === ref.number,
              )
            )
              unavailable.push(ref);
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
