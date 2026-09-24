import type { HandOffStatus } from './handOffTracking.js';

const ENDED: ReadonlySet<HandOffStatus> = new Set(['finished', 'failed', 'interrupted', 'untracked']);

/**
 * A hand-off is live while its T3 Code thread exists and has not finished, failed or been
 * interrupted. A ticket with a live hand-off offers its thread, never a second one (#98).
 */
export function isLiveHandOff(handOff: { threadId: string | null; status: HandOffStatus }): boolean {
  return handOff.threadId !== null && !ENDED.has(handOff.status);
}
