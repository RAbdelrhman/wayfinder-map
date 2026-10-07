import type { ModelChangeReason } from '../autoDecision.js';
import type { HandOffStatusDto } from '../handOffTracking.js';
import type { TicketState } from '../types.js';
import { draftMapPath, mapPath, repoPath } from '../repoRoutes.js';
import { newMapPath, rememberNewMapRetry } from './newMap.js';
import * as icons from './icons.js';
import { icon } from './icons.js';
import { escapeHtml } from './markdown.js';
import { INBOX_OPENED } from './notifications.js';
import type { InboxTicket } from './notifications.js';

export type HandOffUiState = 'starting' | 'working' | 'needs-you' | 'pr-ready' | 'merged' | 'done' | 'failed';

export interface HandOffPresentation {
  state: HandOffUiState;
  label: string;
  report: string;
  group: 'Waiting on you' | 'In T3 Code' | 'Done';
  needsYou: boolean;
  terminal: boolean;
}

export interface HandOffSurface {
  getRecords(): readonly HandOffStatusDto[];
  refresh(): Promise<void>;
  subscribe(listener: (records: readonly HandOffStatusDto[]) => void): () => void;
}

export interface MapTicketFocusTarget {
  readonly dataset: Readonly<Record<string, string | undefined>>;
  focus(options?: FocusOptions): void;
}

const POLL_INTERVAL_MS = 15_000;

export function focusedMapTicketNumber(node: MapTicketFocusTarget | null, isInsideMap: boolean): number | null {
  if (!isInsideMap || node === null) return null;
  const number = Number(node.dataset['number']);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function restoreMapTicketFocus(
  ticketNumber: number | null,
  findNode: (number: number) => MapTicketFocusTarget | null,
): void {
  if (ticketNumber !== null) findNode(ticketNumber)?.focus({ preventScroll: true });
}

export function handOffVisualSignature(handOffs: readonly HandOffStatusDto[]): string {
  return handOffs
    .map((handOff) => {
      const pullRequests = handOff.pullRequests
        .map((pullRequest) => [
          pullRequest.source,
          pullRequest.url,
          pullRequest.state ?? '',
          pullRequest.checksState ?? '',
          pullRequest.reviewDecision ?? '',
          String(pullRequest.isDraft),
          pullRequest.mergedAt ?? '',
        ].join(':'))
        .join(',');
      return [
        handOff.id,
        handOff.status,
        String(handOff.pendingApproval),
        String(handOff.pendingUserInput),
        String(handOff.stale),
        String(handOff.acknowledged),
        String(handOff.ticketClosed === true),
        handOff.repo,
        handOff.mapNumber ?? '',
        handOff.mapTitle ?? '',
        handOff.ticketNumber ?? '',
        handOff.title ?? '',
        pullRequests,
        handOff.branch ?? '',
        handOff.modelChange?.at ?? '',
      ].join(':');
    })
    .join('|');
}

export function handOffPresentation(handOff: HandOffStatusDto): HandOffPresentation {
  let state: HandOffUiState;
  const reported = t3PullRequests(handOff);
  const merged = reported.length > 0 && reported.every((pullRequest) => pullRequest.state?.toUpperCase() === 'MERGED');
  if (handOff.threadId === null) state = 'failed';
  else if (merged) state = 'merged';
  // A closed ticket is finished, whatever its idle thread still says.
  else if (handOff.ticketClosed === true) state = 'done';
  else if (handOff.status === 'failed' || handOff.status === 'interrupted') state = 'failed';
  else if (reported.length > 0) state = 'pr-ready';
  else if (handOff.pendingApproval || handOff.pendingUserInput || handOff.status === 'waiting' || handOff.status === 'ready') state = 'needs-you';
  else if (handOff.status === 'starting') state = 'starting';
  else state = 'working';

  const report = handOff.threadId === null
    ? 'No T3 Code thread was started. This hand-off needs attention.'
    : state === 'needs-you'
    ? handOff.pendingApproval
      ? 'T3 Code is waiting for your approval.'
      : handOff.pendingUserInput || handOff.status === 'waiting'
        ? 'T3 Code is waiting for your input.'
        : 'T3 Code is ready for your next step.'
    : state === 'done'
      ? 'The ticket is closed.'
    : state === 'pr-ready' || state === 'merged'
      ? '' // The pill already says it, and the pull request links sit beside it.
      : state === 'failed'
        ? 'T3 Code reported a problem.'
        : state === 'starting'
          ? 'T3 Code is starting the thread.'
          : handOff.status === 'finished'
            ? 'T3 Code finished a turn. No pull request has been reported yet.'
            : 'T3 Code is working.';
  const group = state === 'failed' || state === 'needs-you'
    ? 'Waiting on you'
    : state === 'pr-ready' || state === 'merged' || state === 'done'
      ? 'Done'
      : 'In T3 Code';
  return {
    state,
    label: state === 'needs-you' ? 'Needs you' : state === 'pr-ready' ? 'PR ready' : state === 'merged' ? 'Merged' : state === 'done' ? 'Done' : state === 'failed' ? handOff.threadId === null ? 'Needs attention' : 'Failed' : state === 'working' ? 'Working' : 'Starting',
    report,
    group,
    needsYou: state === 'failed' || state === 'needs-you',
    terminal: state === 'failed' || state === 'pr-ready' || state === 'merged' || state === 'done',
  };
}

function t3PullRequests(handOff: HandOffStatusDto): HandOffStatusDto['pullRequests'] {
  return handOff.pullRequests.filter((pullRequest) => pullRequest.source === 't3');
}

/** Finished hand-offs the open Inbox shows a notification for, and so the user has now seen. */
export function handOffsToAcknowledge(records: readonly HandOffStatusDto[], shown: readonly InboxTicket[]): HandOffStatusDto[] {
  const key = (repo: string, mapNumber: number | null, ticketNumber: number | null): string => `${repo.toLowerCase()}#${String(mapNumber)}#${String(ticketNumber)}`;
  const seen = new Set(shown.map((ticket) => key(ticket.repo, ticket.mapNumber, ticket.ticketNumber)));
  return records.filter((handOff) =>
    handOff.threadId !== null &&
    !handOff.acknowledged &&
    handOffPresentation(handOff).terminal &&
    seen.has(key(handOff.repo, handOff.mapNumber, handOff.ticketNumber)),
  );
}

export function handOffTime(handOff: HandOffStatusDto, now = Date.now()): string {
  const timestamp = handOff.lastSeenAt ?? handOff.updatedAt ?? handOff.createdAt;
  const age = now - Date.parse(timestamp);
  if (!Number.isFinite(age) || age < 60_000) return 'just now';
  const minutes = Math.floor(age / 60_000);
  if (minutes < 60) return `${String(minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}h ago`;
  return `${String(Math.floor(hours / 24))}d ago`;
}

function handOffDate(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp) : 'Unknown';
}

export function handOffMapLabel(handOff: HandOffStatusDto): string {
  if (handOff.mapTitle !== null) return handOff.mapTitle;
  return handOff.mapNumber === null ? 'New map' : `Map #${String(handOff.mapNumber)}`;
}

export function handOffTitle(handOff: HandOffStatusDto): string {
  return handOff.ticketNumber === null
    ? handOff.title ?? handOffMapLabel(handOff)
    : `#${String(handOff.ticketNumber)} ${handOff.title ?? 'Ticket'}`;
}

export function handOffSourcePath(handOff: HandOffStatusDto): string {
  if (handOff.mapNumber !== null && handOff.ticketNumber !== null) {
    return `${mapPath(handOff.repo, handOff.mapNumber)}?ticket=${String(handOff.ticketNumber)}`;
  }
  if (handOff.mapNumber !== null) return mapPath(handOff.repo, handOff.mapNumber);
  if (handOff.ticketNumber !== null) return `${repoPath(handOff.repo)}?ticket=${String(handOff.ticketNumber)}`;
  return draftMapPath(handOff.repo, handOff.id);
}

/** Where "Try again" leads: the ticket panel or the new-map page, where the user starts it again (#98). */
function retryPath(handOff: HandOffStatusDto): string {
  if (handOff.mapNumber !== null && handOff.ticketNumber !== null) {
    return `${mapPath(handOff.repo, handOff.mapNumber)}?ticket=${String(handOff.ticketNumber)}`;
  }
  if (handOff.ticketNumber === null) return newMapPath(handOff.repo);
  return handOffSourcePath(handOff);
}

function handOffIcon(state: HandOffUiState): string {
  if (state === 'starting') return '<span class="handoff-spinner" aria-hidden="true"></span>';
  if (state === 'working') return icon(icons.PLAY);
  if (state === 'needs-you') return icon(icons.PERSON);
  if (state === 'pr-ready' || state === 'merged' || state === 'done') return icon(icons.CHECK);
  return icon(icons.ALERT);
}

/**
 * A map card shows one status. An open ticket's hand-off says more than its state, so it stands in
 * until it is over. Once its pull request merged, an open ticket (one kept open on purpose, say)
 * reads its own state again. Every closed ticket reads "done"; the panel still shows the merged PR.
 */
export function cardShowsHandOff(ticketState: TicketState, handOff: HandOffStatusDto | undefined): handOff is HandOffStatusDto {
  if (handOff === undefined || ticketState === 'done') return false;
  const state = handOffPresentation(handOff).state;
  return state !== 'merged' && state !== 'done';
}

/** The hand-off's status. Compact, on a map card, it is plain text like the state chip it stands in for. */
export function handOffPill(handOff: HandOffStatusDto, compact = false): string {
  const presentation = handOffPresentation(handOff);
  const at = handOffTime(handOff);
  return `<span class="${compact ? 'chip node-handoff-pill' : 'handoff-pill'} is-${presentation.state}" title="${escapeHtml(`${presentation.label}, updated ${at}`)}" aria-label="${escapeHtml(`${presentation.label}, updated ${at}`)}">${handOffIcon(presentation.state)}<span>${presentation.label}</span></span>`;
}

/** The answers offered for a model change. Not sure and Skip both leave the reason unknown, and neither asks again. */
const MODEL_CHANGE_CHOICES: readonly { reason: ModelChangeReason; label: string }[] = [
  { reason: 'harder-ticket', label: 'Harder ticket' },
  { reason: 'provider-limit', label: 'Provider limit' },
  { reason: 'provider-problem', label: 'Provider problem' },
  { reason: 'preference', label: 'Preference' },
  { reason: 'unknown', label: 'Not sure' },
];

/** A small prompt on a hand-off whose Auto session changed model. It names the models and never guesses why. */
export function modelChangePromptHtml(handOff: HandOffStatusDto): string {
  const change = handOff.modelChange;
  if (change === undefined) return '';
  const attributes = (reason: ModelChangeReason): string =>
    `data-model-change-reason="${reason}" data-handoff-id="${escapeHtml(handOff.id)}" data-model-change-at="${escapeHtml(change.at)}"`;
  const key = (name: string): string => escapeHtml(`${handOff.id}:model-change:${name}`);
  const choices = MODEL_CHANGE_CHOICES
    .map((choice) => `<button type="button" class="ghost" ${attributes(choice.reason)} data-focus-key="${key(choice.reason)}">${choice.label}</button>`)
    .join('');
  return `<div class="model-change-prompt" role="group" aria-label="Why the model changed">
    <p>The model changed from <b>${escapeHtml(change.from)}</b> to <b>${escapeHtml(change.to)}</b>. Why?</p>
    <div class="model-change-choices">${choices}<button type="button" class="ghost model-change-skip" ${attributes('unknown')} aria-label="Skip: don’t say why" data-focus-key="${key('skip')}">Skip</button></div>
  </div>`;
}

/** Confirm the reason for one model change. Only the local server hears it; nothing goes to GitHub. */
export async function sendModelChangeReason(
  fetcher: typeof fetch,
  change: { id: string; at: string; reason: ModelChangeReason },
): Promise<void> {
  const response = await fetcher('/api/hand-offs/model-change', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(change),
  });
  if (!response.ok) {
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(result.error ?? 'The answer was not saved.');
  }
}

function handOffActions(handOff: HandOffStatusDto, includeRetry = true): string {
  const presentation = handOffPresentation(handOff);
  const openLabel = handOff.stale ? 'Start T3 Code' : presentation.state === 'needs-you' ? 'Answer in T3 Code' : 'Open in T3 Code';
  const open = handOff.threadId === null ? '' : `<button type="button" class="ghost" data-handoff-action="focus" data-handoff-id="${escapeHtml(handOff.id)}" data-focus-key="${escapeHtml(`${handOff.id}:focus`)}">${icon(icons.PLAY)}${openLabel}</button>`;
  const retry = includeRetry && presentation.state === 'failed'
    ? `<button type="button" class="ghost" data-handoff-action="retry" data-handoff-id="${escapeHtml(handOff.id)}" data-handoff-href="${escapeHtml(retryPath(handOff))}" data-focus-key="${escapeHtml(`${handOff.id}:retry`)}">${icon(icons.REFRESH)}Try again</button>`
    : '';
  const pullRequests = presentation.state === 'pr-ready' || presentation.state === 'merged'
    ? t3PullRequests(handOff).map((pullRequest) => `<a class="ghost" href="${escapeHtml(pullRequest.url)}" target="_blank" rel="noreferrer" data-handoff-ack="${escapeHtml(handOff.id)}" aria-label="Open pull request${pullRequest.number === null ? '' : ` #${String(pullRequest.number)}`}">${icon(icons.EXTERNAL)}${pullRequest.number === null ? 'Open PR' : `Open PR #${String(pullRequest.number)}`}</a>`).join('')
    : '';
  return `${retry}${pullRequests}${open}`;
}

/** `extra` sits under the pill: the ticket panel puts the PR, its checks and review there (#130). */
export function handOffCardHtml(handOff: HandOffStatusDto, compact = false, includeSource = true, includeRetry = true, extra = ''): string {
  const presentation = handOffPresentation(handOff);
  const source = handOffSourcePath(handOff);
  const branch = handOff.branch === null
    ? ''
    : (() => {
        const [owner = '', name = ''] = handOff.repo.split('/', 2);
        const path = handOff.branch.split('/').map(encodeURIComponent).join('/');
        return `<a href="https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/tree/${path}" target="_blank" rel="noreferrer">${escapeHtml(handOff.branch)}</a>`;
      })();
  const stale = handOff.stale ? '<span class="handoff-stale">T3 Code status is stale. Showing the last report.</span>' : '';
  const details = compact ? '' : `<details class="handoff-details"><summary>Branch and what happened</summary><div>${branch === '' ? '' : `<span>Branch</span>${branch}`}<span>Started</span><time datetime="${escapeHtml(handOff.createdAt)}">${escapeHtml(handOffDate(handOff.createdAt))}</time><span>Latest update</span><time datetime="${escapeHtml(handOff.lastSeenAt ?? handOff.updatedAt)}">${escapeHtml(handOffDate(handOff.lastSeenAt ?? handOff.updatedAt))}</time></div></details>`;
  const sourceLink = includeSource ? `<a class="ghost handoff-source" href="${escapeHtml(source)}">${icon(icons.ARROW)}Back to ${handOff.ticketNumber === null ? 'map' : 'ticket'}</a>` : '';
  return `<section class="handoff-card is-${presentation.state}${handOff.stale ? ' is-stale' : ''}" aria-label="${escapeHtml(`${presentation.label}: ${handOffTitle(handOff)}, ${handOff.repo}, ${handOffMapLabel(handOff)}`)}">
    <div class="handoff-card-head">${handOffPill(handOff)}<time datetime="${escapeHtml(handOff.lastSeenAt ?? handOff.updatedAt)}">${escapeHtml(handOffTime(handOff))}</time></div>
    ${extra}
    ${modelChangePromptHtml(handOff)}
    ${stale === '' && presentation.report === '' ? '' : `<p class="handoff-report">${stale}${escapeHtml(presentation.report)}</p>`}
    <div class="handoff-actions">${handOffActions(handOff, includeRetry)}${sourceLink}</div>
    ${details}
  </section>`;
}

export function homeHandOffCardHtml(handOff: HandOffStatusDto): string {
  return `<article class="home-handoff"><header><b title="${escapeHtml(handOffTitle(handOff))}">${escapeHtml(handOffTitle(handOff))}</b><span title="${escapeHtml(`${handOff.repo} · ${handOffMapLabel(handOff)}`)}">${escapeHtml(handOff.repo)} · ${escapeHtml(handOffMapLabel(handOff))}</span></header>${handOffCardHtml(handOff, true)}</article>`;
}

/** Home's Recent hand-offs: the last few finished ones the user has already seen, newest first. */
export function recentHandOffs(records: readonly HandOffStatusDto[], limit = 3): HandOffStatusDto[] {
  return records
    .filter((handOff) => handOff.acknowledged && handOff.threadId !== null && handOffPresentation(handOff).terminal)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, limit);
}

export function homeHandOffHistoryHtml(handOff: HandOffStatusDto): string {
  const presentation = handOffPresentation(handOff);
  const prLinks = t3PullRequests(handOff)
    .map((pullRequest, index) => `<a href="${escapeHtml(pullRequest.url)}" target="_blank" rel="noreferrer" data-focus-key="${escapeHtml(`${handOff.id}:pr:${String(index)}`)}">${pullRequest.number === null ? 'Pull request' : `PR #${String(pullRequest.number)}`}</a>`)
    .join('');
  const report = presentation.report === '' ? handOffTime(handOff) : `${presentation.report} · ${handOffTime(handOff)}`;
  return `<article class="home-handoff-history is-${presentation.state}">
    <div><b title="${escapeHtml(handOffTitle(handOff))}">${escapeHtml(handOffTitle(handOff))}</b><span title="${escapeHtml(`${handOff.repo} · ${handOffMapLabel(handOff)}`)}">${escapeHtml(handOff.repo)} · ${escapeHtml(handOffMapLabel(handOff))}</span></div>
    ${handOffPill(handOff)}<span class="handoff-row-report">${escapeHtml(report)}</span>
    <span class="handoff-row-prs">${prLinks}</span><a class="ghost handoff-source" href="${escapeHtml(handOffSourcePath(handOff))}" data-focus-key="${escapeHtml(`${handOff.id}:source`)}">${icon(icons.ARROW)}Open ${handOff.ticketNumber === null ? 'map' : 'ticket'}</a>
  </article>`;
}

export function mountHandOffs(): HandOffSurface {
  const announce = document.getElementById('handoff-announcement');
  if (!(announce instanceof HTMLElement)) {
    return { getRecords: () => [], refresh: async () => undefined, subscribe: () => () => undefined };
  }

  let records: HandOffStatusDto[] = [];
  let loaded = false;
  /** What the Inbox showed when it opened before the first load, settled once records arrive. */
  let shownBeforeLoad: readonly InboxTicket[] | null = null;
  let refreshInFlight: Promise<void> | null = null;
  const listeners = new Set<(items: readonly HandOffStatusDto[]) => void>();

  const render = (): void => {
    for (const listener of listeners) listener(records);
  };

  const refresh = async (): Promise<void> => {
    if (refreshInFlight !== null) return refreshInFlight;
    refreshInFlight = (async () => {
      try {
        const response = await fetch('/api/hand-offs');
        if (!response.ok) return;
        const snapshot = (await response.json()) as { handOffs?: HandOffStatusDto[] };
        if (!Array.isArray(snapshot.handOffs)) return;
        const viewKey = (item: HandOffStatusDto): string => `${handOffPresentation(item).state}:${handOffPresentation(item).report}:${String(item.stale)}`;
        const previous = new Map(records.map((item) => [item.id, viewKey(item)]));
        const newlyObserved = snapshot.handOffs.filter((item) =>
          !previous.has(item.id) && item.threadId !== null && Date.now() - Date.parse(item.createdAt) < 60_000,
        );
        const changed = snapshot.handOffs.filter((item) => {
          const before = previous.get(item.id);
          return before !== undefined && before !== viewKey(item);
        });
        records = snapshot.handOffs;
        const firstNew = newlyObserved[0];
        if (firstNew !== undefined) {
          announce.textContent = `New hand-off: ${handOffTitle(firstNew)} is in T3 Code.`;
        } else if (changed.length > 0) {
          const item = changed[0];
          announce.textContent = item === undefined
            ? 'Hand-off status updated.'
            : `${handOffTitle(item)}: ${handOffPresentation(item).report}${item.stale ? ' T3 Code status is stale; showing the last report.' : ''}`;
        }
        render();
        loaded = true;
        if (shownBeforeLoad !== null) {
          acknowledgeSeen(shownBeforeLoad);
          shownBeforeLoad = null;
        }
      } catch {
        // A disconnected tracker keeps the last status on screen.
      }
    })().finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  };

  const post = async (path: string, id: string): Promise<void> => {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(result.error ?? 'The hand-off action failed.');
  };

  const acknowledge = async (id: string): Promise<void> => {
    await post('/api/hand-offs/acknowledge', id);
    records = records.map((item) => item.id === id ? { ...item, acknowledged: true } : item);
    render();
  };

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const answer = target.closest<HTMLButtonElement>('[data-model-change-reason]');
    const id = answer?.dataset['handoffId'];
    const at = answer?.dataset['modelChangeAt'];
    const reason = MODEL_CHANGE_CHOICES.find((choice) => choice.reason === answer?.dataset['modelChangeReason'])?.reason;
    if (answer === null || id === undefined || at === undefined || reason === undefined) return;
    event.preventDefault();
    answer.disabled = true;
    void sendModelChangeReason(fetch, { id, at, reason })
      .then(async () => {
        // Hide the prompt now; a refresh brings up the next unanswered change, if there is one.
        records = records.map((item) => item.id === id && item.modelChange?.at === at ? omitModelChange(item) : item);
        render();
        await refresh();
      })
      .catch((error: unknown) => {
        answer.disabled = false;
        announce.textContent = error instanceof Error ? error.message : 'The answer was not saved.';
      });
  });
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const action = target.closest<HTMLButtonElement>('[data-handoff-action]');
    if (action === null) return;
    event.preventDefault();
    const id = action.dataset['handoffId'];
    const kind = action.dataset['handoffAction'];
    if (id === undefined) return;
    action.disabled = true;
    void (async () => {
      try {
        if (kind === 'retry') {
          const handOff = records.find((item) => item.id === id);
          await acknowledge(id);
          if (handOff !== undefined && handOff.ticketNumber === null) {
            rememberNewMapRetry(handOff.repo, handOff.title ?? handOff.mapTitle ?? '');
            window.location.assign(newMapPath(handOff.repo));
            return;
          }
          const href = action.dataset['handoffHref'];
          if (href !== undefined) window.location.assign(href);
          return;
        }
        await post('/api/hand-offs/focus', id);
        const handOff = records.find((item) => item.id === id);
        if (handOff !== undefined && handOffPresentation(handOff).terminal) await acknowledge(id);
        announce.textContent = 'Brought T3 Code forward.';
      } catch (error) {
        announce.textContent = error instanceof Error ? error.message : 'The hand-off action failed.';
      } finally {
        action.disabled = false;
      }
    })();
  });
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLAnchorElement>('[data-handoff-ack]');
    if (link !== null) void acknowledge(link.dataset['handoffAck'] ?? '').catch(() => undefined);
  });
  function acknowledgeSeen(shown: readonly InboxTicket[]): void {
    for (const item of handOffsToAcknowledge(records, shown)) void acknowledge(item.id).catch(() => undefined);
  }

  document.addEventListener(INBOX_OPENED, (event) => {
    const shown = event instanceof CustomEvent && Array.isArray(event.detail) ? (event.detail as InboxTicket[]) : [];
    if (loaded) acknowledgeSeen(shown);
    else shownBeforeLoad = [...(shownBeforeLoad ?? []), ...shown];
  });

  void refresh();
  const timer = window.setInterval(() => {
    if (document.visibilityState === 'visible') void refresh();
  }, POLL_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refresh();
  });
  window.addEventListener('pagehide', () => window.clearInterval(timer), { once: true });

  return {
    getRecords: () => records,
    refresh,
    subscribe: (listener) => {
      listeners.add(listener);
      listener(records);
      return () => listeners.delete(listener);
    },
  };
}

function omitModelChange(handOff: HandOffStatusDto): HandOffStatusDto {
  const { modelChange: _answered, ...rest } = handOff;
  return rest;
}
