/*
  Whether the first-launch tour invitation has been answered (#240). Answering it either
  way, or finishing the tour from anywhere, means it never appears again on this machine.
  'completed' outranks 'dismissed', so a later Not now in another tab can't undo a finish.
*/

export type TourOutcome = 'dismissed' | 'completed';
export const TOUR_KEY = 'wayfinder-map:tour';

type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function tourOutcome(storage: Reader | null = defaultStorage()): TourOutcome | null {
  try {
    const value = storage?.getItem(TOUR_KEY) ?? null;
    return value === 'dismissed' || value === 'completed' ? value : null;
  } catch {
    return null;
  }
}

/** Show the invitation only while nothing is stored; storage that can't be read shows it once per page. */
export function shouldInviteToTour(storage: Reader | null = defaultStorage()): boolean {
  return tourOutcome(storage) === null;
}

export function rememberTour(outcome: TourOutcome, storage: Writer | null = defaultStorage()): void {
  try {
    if (storage === null || tourOutcome(storage) === 'completed' || tourOutcome(storage) === outcome) return;
    storage.setItem(TOUR_KEY, outcome);
  } catch {
    /* The tour still works without storage; the invitation may return next launch. */
  }
}
