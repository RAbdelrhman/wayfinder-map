import type { IconName } from '../auth/Icon';
import { mapKey } from './github';
import type { MapRef, MapSummary } from './github';

export type UnavailableFollow = MapRef & { reason?: 'issue' | 'repo' | 'label' | 'nosave' };

/** Compare actual observations; absence from a discovery list never proves lost access. */
export function sharedFollowState(ref: MapRef, previous: { map: MapSummary | null; missing: UnavailableFollow | null; observedAt: number }, latest: {
  fresh: boolean; savedAt: number | null; denied: boolean; maps: readonly MapSummary[]; hidden: readonly MapSummary[]; unavailable: readonly UnavailableFollow[];
}): { map: MapSummary | null; hidden: MapSummary | null; missing: UnavailableFollow | null } {
  const same = (item: MapRef) => mapKey(item) === mapKey(ref);
  if (latest.denied) return { map: null, hidden: null, missing: { ...ref, reason: 'issue' } };
  if (latest.fresh && latest.savedAt !== null && latest.savedAt >= previous.observedAt) {
    const missing = latest.unavailable.find(same);
    if (missing) return { map: null, hidden: null, missing };
    const hidden = latest.hidden.find(same);
    if (hidden) return { map: null, hidden, missing: null };
    const map = latest.maps.find(same);
    if (map && latest.savedAt > previous.observedAt) return { map, hidden: null, missing: null };
  }
  return { map: previous.map, hidden: null, missing: previous.missing };
}

/** Cached or older successes cannot reverse a later observed access failure. */
export function restoredFollow(ref: MapRef, failedAt: number, latest: { fresh: boolean; savedAt: number | null; maps: readonly MapSummary[] }): MapSummary | null {
  if (!latest.fresh || latest.savedAt === null || latest.savedAt <= failedAt) return null;
  return latest.maps.find(map => mapKey(map) === mapKey(ref)) ?? null;
}

/** The words and glyphs Ramon chose on #359, Round 2 A. */
export function followReason(ref: UnavailableFollow): { icon: IconName; head: string; text: string; centered: boolean } {
  switch (ref.reason) {
    case 'repo': return { icon: 'help', head: '', text: '', centered: true };
    case 'label': return { icon: 'tag', head: 'Not a map now', text: "The issue isn't labelled as a Wayfinder map any more.", centered: false };
    case 'nosave': return { icon: 'cloudoff', head: 'No saved details', text: "You're offline and this phone hasn't loaded the map yet. It shows when GitHub can be reached.", centered: false };
    default: return { icon: 'help', head: "Can't read this map", text: "GitHub didn't return the issue. It may be deleted or moved, or you may no longer have access.", centered: false };
  }
}

export function followsNotShowing(hidden: readonly MapRef[], unavailable: readonly UnavailableFollow[]): { head: string; text: string } | null {
  const privateKeys = new Set(hidden.map(mapKey));
  const missing = [...new Map(unavailable.filter(ref => !privateKeys.has(mapKey(ref))).map(ref => [mapKey(ref), ref])).values()];
  const count = privateKeys.size + missing.length;
  if (!count) return null;
  const noSave = missing.filter(ref => ref.reason === 'nosave').length;
  if (count === 1 && noSave) return { head: '1 followed map has no saved details', text: 'It shows when GitHub can be reached.' };
  const unknown = missing.filter(ref => !ref.reason || ref.reason === 'issue' || ref.reason === 'repo').length;
  const notMap = missing.filter(ref => ref.reason === 'label').length;
  return {
    head: `${count} followed map${count === 1 ? " isn't" : "s aren't"} showing`,
    text: [privateKeys.size && `${privateKeys.size} not public now`, unknown && `${unknown} can't be read`, notMap && `${notMap} not a map now`, noSave && `${noSave} with no saved details`].filter(Boolean).join(' · '),
  };
}
