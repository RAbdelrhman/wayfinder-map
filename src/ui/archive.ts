import type { MapSettlement, SettleReason, WayfinderMap } from '../types.js';
import { escapeHtml } from './markdown.js';

/*
  The archive's words, shared by the repository page, Archived maps and an opened archived map.
  Wording and layout are option G of #288 (docs/design/map-archive-controls.md). A reason is an
  icon plus a word: in Wayfinder only ticket state carries colour.
*/

const DAY_MS = 86_400_000;
/** `IDLE_DAYS` in src/settling.ts, which the page can't import. */
const IDLE_DAYS = 30;

export interface ArchiveReason {
  label: string;
  /** Lower-case count word on the Archived maps entry: `2 by you, 1 closed`. */
  short: string;
  icon: string;
  /** The rule, one line, under the reason in the Archived maps list. */
  rule: string;
  /** When the map leaves the archive. */
  returns: string;
}

export const ARCHIVE_REASONS: Record<SettleReason, ArchiveReason> = {
  manual: { label: 'Archived by you', short: 'by you', icon: 'person', rule: 'Stays until you restore it.', returns: 'Only when you restore it, even if a ticket reopens.' },
  closed: { label: 'Closed', short: 'closed', icon: 'closed', rule: 'The map issue is closed on GitHub.', returns: 'If the map issue reopens, or when you restore it.' },
  finished: { label: 'Finished', short: 'finished', icon: 'flag', rule: 'Every ticket on the map is done.', returns: 'If a ticket reopens or an open ticket is added, or when you restore it.' },
  idle: { label: 'Idle 30 days', short: 'idle', icon: 'clock', rule: 'Nothing changed for 30 days.', returns: 'As soon as something on it changes, or when you restore it.' },
};

/** The order the archive contract resolves overlapping reasons in, which is also the list's group order. */
export const REASON_ORDER: readonly SettleReason[] = ['manual', 'closed', 'finished', 'idle'];

/** `Oct 13`. */
export function archiveDay(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return '';
  return new Date(parsed).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** `today`, `yesterday`, `4 days ago`, `2 weeks ago`, `3 months ago`. */
export function archiveAgo(iso: string, now: number): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return '';
  const days = Math.floor(Math.max(0, now - parsed) / DAY_MS);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${String(days)} days ago`;
  if (days < 30) return `${String(Math.floor(days / 7))} weeks ago`;
  const months = Math.floor(days / 30);
  return `${String(months)} month${months === 1 ? '' : 's'} ago`;
}

/** Why this map is archived, in a sentence. Tickets an archived map never read are not counted. */
export function archiveWhy(map: WayfinderMap, archive: MapSettlement): string {
  if (archive.reason === 'manual') return 'You archived this map.';
  if (archive.reason === 'closed') {
    const open = map.ticketsLoaded ? map.tickets.filter((ticket) => ticket.state !== 'done').length : 0;
    return open === 0 ? 'The map issue is closed on GitHub.' : `The map issue is closed on GitHub, with ${String(open)} ticket${open === 1 ? '' : 's'} still open.`;
  }
  if (archive.reason === 'finished') return map.ticketsLoaded && map.tickets.length > 0 ? `All ${String(map.tickets.length)} tickets are done.` : 'Every ticket on the map is done.';
  // An idle map archives 30 days after anything on it last changed.
  const since = Date.parse(archive.since);
  const changed = Number.isNaN(since) ? '' : archiveDay(new Date(since - IDLE_DAYS * DAY_MS).toISOString());
  return changed === '' ? 'Nothing on the map or its tickets has changed for 30 days.' : `Nothing on the map or its tickets has changed since ${changed}.`;
}

export function reasonHtml(reason: SettleReason): string {
  const r = ARCHIVE_REASONS[reason];
  return `<span class="archive-reason"><span data-icon="${r.icon}" aria-hidden="true"></span>${escapeHtml(r.label)}</span>`;
}

/** Restore puts the map back; a closed one stays unwatched until its issue reopens. */
export function restoredMessage(map: WayfinderMap): string {
  return map.open
    ? `Restored #${String(map.number)}. It stays active until you archive it again.`
    : `Restored #${String(map.number)}. It stays active, unwatched until its issue reopens.`;
}

/** What a failed Archive or Restore left in place, beside the map it belongs to. */
export function saveErrorHtml(kind: 'archive' | 'restore', mapNumber: number, message: string): string {
  const what = kind === 'archive' ? `Couldn't archive #${String(mapNumber)}. It's still in your active maps.` : `Couldn't restore #${String(mapNumber)}. It's still archived.`;
  return `<div class="archive-alert" role="alert"><span data-icon="alert" aria-hidden="true"></span><span class="grow"><b>${escapeHtml(what)}</b> ${escapeHtml(message)}</span><button type="button" class="ghost" data-archive-retry>Try again</button></div>`;
}

export function restoreButtonHtml(map: WayfinderMap, primary: boolean, busy: boolean): string {
  const label = `Restore map #${String(map.number)}: ${map.title}`;
  return `<button type="button" class="${primary ? 'primary' : 'ghost'}" data-restore-map="${String(map.number)}" aria-label="${escapeHtml(label)}"${busy ? ' aria-disabled="true" aria-busy="true"' : ''}>${busy ? '<span class="archive-spin" aria-hidden="true"></span>Restoring…' : '<span data-icon="restore" aria-hidden="true"></span>Restore'}</button>`;
}

export interface ArchivedMapCardState {
  /** Restore is being saved. */
  busy: boolean;
  /** Restore failed with this message. */
  error: string | null;
  /** The map was restored from this card, so it says so instead. */
  restored: boolean;
  /** Auto map is on for this map; archiving pauses it and keeps the setting. */
  autoMap: boolean;
  /** Where the back button goes. */
  backHref: string;
  backLabel: string;
  /** The repository's active maps, for the card after a restore. */
  activeHref: string;
}

/** The card on an opened archived map: why it is archived, Restore, and the way back. Empty for an active map. */
export function archivedMapCardHtml(map: WayfinderMap, state: ArchivedMapCardState): string {
  if (map.settled !== null) {
    const archive = map.settled;
    const paused = state.autoMap ? "it isn't watched and Auto map stays paused" : "it isn't watched";
    return `<div class="map-archive-head" id="map-archive-head"><span data-icon="archive" aria-hidden="true"></span><b>Archived</b><span class="sep" aria-hidden="true">·</span>${reasonHtml(archive.reason)}</div>
      <p>${escapeHtml(archiveWhy(map, archive))} Opening it keeps it archived: ${escapeHtml(paused)}.</p>
      ${state.error === null ? '' : saveErrorHtml('restore', map.number, state.error)}
      <div class="archive-acts">${restoreButtonHtml(map, true, state.busy)}<a class="ghost" href="${escapeHtml(state.backHref)}">${escapeHtml(state.backLabel)}</a></div>`;
  }
  if (!state.restored) return '';
  const back = map.open ? `Back in your active maps; ${state.autoMap ? 'watching and Auto map resume' : 'watching resumes'}.` : 'Back in your active maps. It stays unwatched until its issue reopens.';
  return `<div class="map-archive-head"><span data-icon="check" aria-hidden="true"></span><b>Restored</b></div><p>${escapeHtml(back)}</p><div class="archive-acts"><a class="ghost" href="${escapeHtml(state.activeHref)}">Active maps</a></div>`;
}
