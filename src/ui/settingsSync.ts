import type { AutoMapMachineSettings } from '../autoMapStore.js';
import { parseAutoRater, parseCalibrationMode, parseTierModels } from '../models.js';
import { normalizeCap } from '../startNext.js';
import { AUTO_RATER_KEY, CALIBRATION_KEY, TIER_DEFAULTS_KEY } from './models.js';
import { pushServerSettings } from './serverSettings.js';
import type { ServerSettingsPatch } from './serverSettings.js';
import { CAP_KEY } from './startNext.js';

/* Brings this browser's copy of the auto map's machine settings and the server's together (#182). */

type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'getItem' | 'setItem'>;

/** What this browser saved, with null for what it never saved. */
export function readLocalSettings(storage: Reader): AutoMapMachineSettings {
  const saved = (key: string): unknown => {
    try {
      const raw = storage.getItem(key);
      return raw === null ? null : (JSON.parse(raw) as unknown);
    } catch {
      return null;
    }
  };
  const cap = saved(CAP_KEY);
  const tierModels = parseTierModels(saved(TIER_DEFAULTS_KEY));
  const rater = saved(AUTO_RATER_KEY);
  const calibration = saved(CALIBRATION_KEY);
  return {
    cap: typeof cap === 'number' ? normalizeCap(cap) : null,
    tierModels: Object.keys(tierModels).length === 0 ? null : tierModels,
    rater: rater === null ? null : parseAutoRater(rater),
    calibration: calibration === null ? null : parseCalibrationMode(calibration),
  };
}

/**
 * The server's value wins wherever it has one. Where it has none, because the setting was saved in this
 * browser before the server held them, the browser's value goes up so the server's trigger can use it.
 */
export function reconcileSettings(local: AutoMapMachineSettings, server: AutoMapMachineSettings): { adopt: Partial<AutoMapMachineSettings>; push: ServerSettingsPatch } {
  const adopt: Partial<AutoMapMachineSettings> = {};
  const push: ServerSettingsPatch = {};
  if (server.cap !== null) adopt.cap = server.cap;
  else if (local.cap !== null) push.cap = local.cap;
  if (server.tierModels !== null) adopt.tierModels = server.tierModels;
  else if (local.tierModels !== null) push.tierModels = local.tierModels;
  if (server.rater !== null) adopt.rater = server.rater;
  else if (local.rater !== null) push.rater = local.rater;
  if (server.calibration !== null) adopt.calibration = server.calibration;
  else if (local.calibration !== null) push.calibration = local.calibration;
  return { adopt, push };
}

/** Write what the server holds into this browser's copy, without sending it back. */
export function adoptSettings(storage: Writer, adopt: Partial<AutoMapMachineSettings>): void {
  if (adopt.cap !== undefined && adopt.cap !== null) storage.setItem(CAP_KEY, String(adopt.cap));
  if (adopt.tierModels !== undefined && adopt.tierModels !== null) storage.setItem(TIER_DEFAULTS_KEY, JSON.stringify(adopt.tierModels));
  if (adopt.rater !== undefined && adopt.rater !== null) storage.setItem(AUTO_RATER_KEY, JSON.stringify(adopt.rater));
  if (adopt.calibration !== undefined && adopt.calibration !== null) storage.setItem(CALIBRATION_KEY, JSON.stringify(adopt.calibration));
}

/** At page load: take the server's machine settings, and send up any this browser holds that the server does not. */
export async function syncServerSettings(storage: Writer = localStorage): Promise<void> {
  try {
    const response = await fetch('/api/auto-map');
    if (!response.ok) return;
    const { settings } = (await response.json()) as { settings: AutoMapMachineSettings };
    const { adopt, push } = reconcileSettings(readLocalSettings(storage), settings);
    adoptSettings(storage, adopt);
    if (Object.keys(push).length > 0) pushServerSettings(push);
  } catch {
    // The page keeps working on its own copy until the server answers.
  }
}
