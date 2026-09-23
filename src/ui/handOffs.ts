import type { HandOffStatusDto } from '../handOffTracking.js';
import { draftMapPath, mapPath, repoPath } from '../repoRoutes.js';
import { newMapPath, rememberNewMapRetry } from './newMap.js';
import * as icons from './icons.js';
import { icon } from './icons.js';
import { escapeHtml } from './markdown.js';

export type HandOffUiState = 'starting' | 'working' | 'needs-you' | 'pr-ready' | 'failed';

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

const POLL_INTERVAL_MS = 15_000;

export function handOffPresentation(handOff: HandOffStatusDto): HandOffPresentation {
  let state: HandOffUiState;
  if (handOff.threadId === null || handOff.status === 'failed' || handOff.status === 'interrupted') state = 'failed';
  else if (handOff.pullRequests.some((pullRequest) => pullRequest.source === 't3')) state = 'pr-ready';
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
    : state === 'pr-ready'
      ? `Pull request${handOff.pullRequests.length === 1 ? '' : 's'} ready.`
      : state === 'failed'
        ? 'T3 Code reported a problem.'
        : state === 'starting'
          ? 'T3 Code is starting the thread.'
          : handOff.status === 'finished'
            ? 'T3 Code finished a turn. No pull request has been reported yet.'
            : 'T3 Code is working.';
  const group = state === 'failed' || state === 'needs-you'
    ? 'Waiting on you'
    : state === 'pr-ready'
      ? 'Done'
      : 'In T3 Code';
  return {
    state,
    label: state === 'needs-you' ? 'Needs you' : state === 'pr-ready' ? 'PR ready' : state === 'failed' ? handOff.threadId === null ? 'Needs attention' : 'Failed' : state === 'working' ? 'Working' : 'Starting',
    report,
    group,
    needsYou: state === 'failed' || state === 'needs-you',
    terminal: state === 'failed' || state === 'pr-ready',
  };
}

export function listedHandOffs(records: readonly HandOffStatusDto[]): HandOffStatusDto[] {
  return records
    .filter((handOff) => handOff.threadId !== null && !handOff.acknowledged)
    .sort((a, b) => {
      const priority: Record<HandOffUiState, number> = { failed: 0, 'needs-you': 1, starting: 2, working: 3, 'pr-ready': 4 };
      const stateDifference = priority[handOffPresentation(a).state] - priority[handOffPresentation(b).state];
      if (stateDifference !== 0) return stateDifference;
      return Date.parse(a.createdAt) - Date.parse(b.createdAt);
    });
}

export function handOffTriggerLabel(records: readonly HandOffStatusDto[], available: boolean | null): string {
  const listed = listedHandOffs(records);
  const total = listed.length;
  const needYou = listed.filter((item) => handOffPresentation(item).needsYou).length;
  const count = `${String(total)} hand-off${total === 1 ? '' : 's'} in T3 Code`;
  const urgency = needYou === 0 ? '' : `, ${String(needYou)} need you`;
  const offline = available === false ? ', T3 Code is offline; showing the last reported status' : '';
  return `${count}${urgency}${offline}`;
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

function retryPath(handOff: HandOffStatusDto): string {
  if (handOff.mapNumber !== null && handOff.ticketNumber !== null) {
    return `${mapPath(handOff.repo, handOff.mapNumber)}?ticket=${String(handOff.ticketNumber)}&retry=1`;
  }
  if (handOff.ticketNumber === null) return newMapPath(handOff.repo);
  const source = handOffSourcePath(handOff);
  return `${source}${source.includes('?') ? '&' : '?'}retry=1`;
}

function handOffIcon(state: HandOffUiState): string {
  if (state === 'starting') return '<span class="handoff-spinner" aria-hidden="true"></span>';
  if (state === 'working') return icon(icons.PLAY);
  if (state === 'needs-you') return icon(icons.PERSON);
  if (state === 'pr-ready') return icon(icons.CHECK);
  return icon(icons.ALERT);
}

export function handOffPill(handOff: HandOffStatusDto, compact = false): string {
  const presentation = handOffPresentation(handOff);
  const at = handOffTime(handOff);
  return `<span class="handoff-pill${compact ? ' is-compact node-handoff-pill' : ''} is-${presentation.state}" title="${escapeHtml(`${presentation.label}, updated ${at}`)}" aria-label="${escapeHtml(`${presentation.label}, updated ${at}`)}">${handOffIcon(presentation.state)}<span>${presentation.label}</span></span>`;
}

function handOffActions(handOff: HandOffStatusDto): string {
  const presentation = handOffPresentation(handOff);
  const openLabel = handOff.stale ? 'Start T3 Code' : presentation.state === 'needs-you' ? 'Answer in T3 Code' : 'Open in T3 Code';
  const open = handOff.threadId === null ? '' : `<button type="button" class="ghost" data-handoff-action="focus" data-handoff-id="${escapeHtml(handOff.id)}" data-focus-key="${escapeHtml(`${handOff.id}:focus`)}">${icon(icons.PLAY)}${openLabel}</button>`;
  const retry = presentation.state === 'failed'
    ? `<button type="button" class="ghost" data-handoff-action="retry" data-handoff-id="${escapeHtml(handOff.id)}" data-handoff-href="${escapeHtml(retryPath(handOff))}" data-focus-key="${escapeHtml(`${handOff.id}:retry`)}">${icon(icons.REFRESH)}Try again</button>`
    : '';
  const pullRequests = presentation.state === 'pr-ready'
    ? handOff.pullRequests.filter((pullRequest) => pullRequest.source === 't3').map((pullRequest) => `<a class="ghost" href="${escapeHtml(pullRequest.url)}" target="_blank" rel="noreferrer" data-handoff-ack="${escapeHtml(handOff.id)}" aria-label="Open pull request${pullRequest.number === null ? '' : ` #${String(pullRequest.number)}`}">${icon(icons.EXTERNAL)}${pullRequest.number === null ? 'Open PR' : `Open PR #${String(pullRequest.number)}`}</a>`).join('')
    : '';
  return `${retry}${pullRequests}${open}`;
}

export function handOffCardHtml(handOff: HandOffStatusDto, compact = false, includeSource = true): string {
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
    <p class="handoff-report">${stale}${escapeHtml(presentation.report)}</p>
    <div class="handoff-actions">${handOffActions(handOff)}${sourceLink}</div>
    ${details}
  </section>`;
}

export function homeHandOffCardHtml(handOff: HandOffStatusDto): string {
  return `<article class="home-handoff"><header><b title="${escapeHtml(handOffTitle(handOff))}">${escapeHtml(handOffTitle(handOff))}</b><span title="${escapeHtml(`${handOff.repo} · ${handOffMapLabel(handOff)}`)}">${escapeHtml(handOff.repo)} · ${escapeHtml(handOffMapLabel(handOff))}</span></header>${handOffCardHtml(handOff, true)}</article>`;
}

export function homeHandOffHistoryHtml(handOff: HandOffStatusDto): string {
  const presentation = handOffPresentation(handOff);
  const prLinks = handOff.pullRequests
    .filter((pullRequest) => pullRequest.source === 't3')
    .map((pullRequest, index) => `<a href="${escapeHtml(pullRequest.url)}" target="_blank" rel="noreferrer" data-focus-key="${escapeHtml(`${handOff.id}:pr:${String(index)}`)}">${pullRequest.number === null ? 'Pull request' : `PR #${String(pullRequest.number)}`}</a>`)
    .join('');
  return `<article class="home-handoff-history is-${presentation.state}">
    <div><b title="${escapeHtml(handOffTitle(handOff))}">${escapeHtml(handOffTitle(handOff))}</b><span title="${escapeHtml(`${handOff.repo} · ${handOffMapLabel(handOff)}`)}">${escapeHtml(handOff.repo)} · ${escapeHtml(handOffMapLabel(handOff))}</span></div>
    ${handOffPill(handOff)}<span class="handoff-row-report">${escapeHtml(presentation.report)} · ${escapeHtml(handOffTime(handOff))}</span>
    ${prLinks}<a class="ghost handoff-source" href="${escapeHtml(handOffSourcePath(handOff))}" data-focus-key="${escapeHtml(`${handOff.id}:source`)}">${icon(icons.ARROW)}Open source</a>
  </article>`;
}

export function mountHandOffs(): HandOffSurface {
  const anchor = document.getElementById('handoff-anchor');
  const trigger = document.getElementById('handoff-trigger');
  const panel = document.getElementById('handoff-list');
  const body = document.getElementById('handoff-list-body');
  const heading = document.getElementById('handoff-list-count');
  const announce = document.getElementById('handoff-announcement');
  if (!(anchor instanceof HTMLElement) || !(trigger instanceof HTMLButtonElement) || !(panel instanceof HTMLElement) || !(body instanceof HTMLElement) || !(heading instanceof HTMLElement) || !(announce instanceof HTMLElement)) {
    return { getRecords: () => [], refresh: async () => undefined, subscribe: () => () => undefined };
  }

  let records: HandOffStatusDto[] = [];
  let available: boolean | null = null;
  let open = false;
  let refreshInFlight: Promise<void> | null = null;
  const listeners = new Set<(items: readonly HandOffStatusDto[]) => void>();
  const focusFallback = (): void => {
    document.querySelector<HTMLElement>('#search, #repo-name, #main')?.focus();
  };

  const close = (returnFocus: boolean): void => {
    open = false;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    anchor.hidden = listedHandOffs(records).length === 0;
    if (returnFocus) {
      if (anchor.hidden) focusFallback();
      else trigger.focus();
    }
  };

  const render = (): void => {
    const listed = listedHandOffs(records);
    const total = listed.length;
    const needYou = listed.filter((item) => handOffPresentation(item).needsYou).length;
    const focusWasInAnchor = anchor.contains(document.activeElement);
    if (total === 0 && open) close(false);
    anchor.hidden = total === 0;
    trigger.classList.toggle('is-urgent', needYou > 0);
    trigger.setAttribute('aria-expanded', String(open));
    trigger.setAttribute('aria-label', handOffTriggerLabel(records, available));
    trigger.innerHTML = `${available === false ? icon(icons.PLUG) : ''}<span class="handoff-dots" aria-hidden="true">${listed.map((item) => `<i class="is-${handOffPresentation(item).state}"></i>`).join('')}</span><span>${String(total)} hand-off${total === 1 ? '' : 's'} in T3 Code${needYou === 0 ? '' : ` · ${String(needYou)} need you`}</span>`;
    heading.textContent = `${String(total)} across all repositories and maps`;
    trigger.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    panel.dataset['offline'] = String(available === false);

    const scrollTop = body.scrollTop;
    const active = panel.contains(document.activeElement) && document.activeElement instanceof HTMLElement
      ? document.activeElement.getAttribute('data-focus-key')
      : null;
    const groups: HandOffPresentation['group'][] = ['Waiting on you', 'In T3 Code', 'Done'];
    const parts = groups.flatMap((group) => {
      const items = listed.filter((item) => handOffPresentation(item).group === group);
      if (items.length === 0) return [];
      return [`<section class="handoff-group" aria-labelledby="handoff-group-${group === 'In T3 Code' ? 'active' : group === 'Done' ? 'done' : 'waiting'}"><h3 id="handoff-group-${group === 'In T3 Code' ? 'active' : group === 'Done' ? 'done' : 'waiting'}">${group}</h3><ol>${items.map((item) => rowHtml(item)).join('')}</ol></section>`];
    });
    const offline = available === false ? '<p class="handoff-offline" role="status">T3 Code isn’t running. Showing the last reported status.</p>' : '';
    body.innerHTML = `${offline}${parts.join('')}`;
    body.scrollTop = scrollTop;
    if (active !== null) panel.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(active)}"]`)?.focus();
    if (anchor.hidden && focusWasInAnchor) focusFallback();
    for (const listener of listeners) listener(records);
  };

  const refresh = async (): Promise<void> => {
    if (refreshInFlight !== null) return refreshInFlight;
    refreshInFlight = (async () => {
      try {
        const response = await fetch('/api/hand-offs');
        if (!response.ok) return;
        const snapshot = (await response.json()) as { handOffs?: HandOffStatusDto[]; t3?: { available?: boolean } };
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
        available = snapshot.t3?.available ?? false;
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

  trigger.addEventListener('click', () => {
    if (open) {
      close(true);
      return;
    }
    open = true;
    render();
    panel.querySelector<HTMLElement>('.handoff-close')?.focus();
    for (const item of listedHandOffs(records)) {
      if (handOffPresentation(item).terminal) void acknowledge(item.id).catch(() => undefined);
    }
  });
  panel.querySelector<HTMLButtonElement>('.handoff-close')?.addEventListener('click', () => close(true));
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const action = target.closest<HTMLButtonElement>('[data-handoff-action]');
    if (action === null) {
      if (target.closest('a[href]') !== null) close(false);
      return;
    }
    event.preventDefault();
    const id = action.dataset['handoffId'];
    const kind = action.dataset['handoffAction'];
    if (id === undefined) return;
    const closeAfterAction = panel.contains(action);
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
        if (closeAfterAction) close(true);
      }
    })();
  });
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLAnchorElement>('[data-handoff-ack]');
    if (link !== null) void acknowledge(link.dataset['handoffAck'] ?? '').catch(() => undefined);
  });
  document.addEventListener('click', (event) => {
    if (open && event.target instanceof Node && !anchor.contains(event.target)) close(false);
  });
  document.addEventListener('keydown', (event) => {
    if (open && event.key === 'Escape') {
      event.preventDefault();
      close(true);
    }
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

function rowHtml(handOff: HandOffStatusDto): string {
  const presentation = handOffPresentation(handOff);
  const timestamp = handOff.lastSeenAt ?? handOff.updatedAt;
  const stale = handOff.stale ? ' · stale' : '';
  const ariaLabel = `${presentation.label}, ${handOffTitle(handOff)}, ${handOff.repo}, ${handOffMapLabel(handOff)}${stale}`;
  const title = handOffTitle(handOff);
  const mapLabel = handOffMapLabel(handOff);
  return `<li class="handoff-row is-${presentation.state}${handOff.stale ? ' is-stale' : ''}" aria-label="${escapeHtml(ariaLabel)}">
    <span class="handoff-row-icon is-${presentation.state}" aria-hidden="true"></span>
    <div class="handoff-row-main">
      <div class="handoff-row-heading">${handOffPill(handOff)}<time datetime="${escapeHtml(timestamp)}">${escapeHtml(handOffTime(handOff))}${stale}</time></div>
      <b class="handoff-row-title" title="${escapeHtml(title)}">${escapeHtml(title)}</b>
      <span class="handoff-row-context" title="${escapeHtml(`${handOff.repo} · ${mapLabel}`)}">${escapeHtml(handOff.repo)} · ${escapeHtml(mapLabel)}</span>
      <span class="handoff-row-report">${handOff.stale ? 'Last report: ' : ''}${escapeHtml(presentation.report)}</span>
      <div class="handoff-actions">${handOffActions(handOff)}<a class="ghost handoff-source" href="${escapeHtml(handOffSourcePath(handOff))}">${icon(icons.ARROW)}Back to ${handOff.ticketNumber === null ? 'map' : 'ticket'}</a></div>
    </div>
  </li>`;
}
