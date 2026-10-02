import type { AutoRater, CalibrationMode, ModelChoice, Tier } from '../models.js';

/* The settings the server's auto map trigger reads (#182): the cap, the tier-to-model mapping and how Auto rates. The page keeps them in this browser too, for its own screens, and writes each change through. */

export interface ServerSettingsPatch {
  cap?: number;
  tierModels?: Partial<Record<Tier, ModelChoice>>;
  rater?: AutoRater;
  calibration?: CalibrationMode;
}

/** Tell the server a setting changed. Without a page to send from (tests, a worker) it does nothing. */
export function pushServerSettings(patch: ServerSettingsPatch): void {
  if (typeof document === 'undefined') return;
  void fetch('/api/auto-map/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) }).catch(() => undefined);
}
