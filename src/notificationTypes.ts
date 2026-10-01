export const NOTIFICATION_KINDS = [
  'unblocked',
  'threadWaiting',
  'failingCi',
  'reviewReady',
  'handOffError',
  'stalled',
  'prototypeReady',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface NotificationSettings {
  unblocked: boolean;
  threadWaiting: boolean;
  failingCi: boolean;
  reviewReady: boolean;
  handOffError: boolean;
  stalled: boolean;
  prototypeReady: boolean;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  unblocked: true,
  threadWaiting: true,
  failingCi: true,
  reviewReady: true,
  handOffError: true,
  stalled: true,
  prototypeReady: true,
};

export interface DesktopNotification {
  kind: NotificationKind;
  title: string;
  body: string;
  repo: string;
  mapNumber: number;
  ticketNumber: number;
}

export function parseDesktopNotification(value: unknown): DesktopNotification | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.kind !== 'string' ||
    !(NOTIFICATION_KINDS as readonly string[]).includes(raw.kind) ||
    typeof raw.title !== 'string' ||
    typeof raw.body !== 'string' ||
    typeof raw.repo !== 'string' ||
    !/^[\w.-]+\/[\w.-]+$/.test(raw.repo) ||
    !Number.isSafeInteger(raw.mapNumber) ||
    (raw.mapNumber as number) < 1 ||
    !Number.isSafeInteger(raw.ticketNumber) ||
    (raw.ticketNumber as number) < 1
  ) {
    return null;
  }
  return {
    kind: raw.kind as NotificationKind,
    title: raw.title.slice(0, 160),
    body: raw.body.slice(0, 240),
    repo: raw.repo,
    mapNumber: raw.mapNumber as number,
    ticketNumber: raw.ticketNumber as number,
  };
}

export function readNotificationSettings(value: unknown): NotificationSettings {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const settings = { ...DEFAULT_NOTIFICATION_SETTINGS };
  for (const kind of NOTIFICATION_KINDS) {
    if (typeof raw[kind] === 'boolean') settings[kind] = raw[kind];
  }
  return settings;
}

export function applyNotificationSettings(current: NotificationSettings, patch: unknown): NotificationSettings | null {
  const raw = typeof patch === 'object' && patch !== null ? (patch as Record<string, unknown>) : {};
  const next = { ...current };
  let changed = false;
  for (const kind of NOTIFICATION_KINDS) {
    const value = raw[kind];
    if (value === undefined) continue;
    if (typeof value !== 'boolean') return null;
    next[kind] = value;
    changed = true;
  }
  return changed ? next : null;
}
