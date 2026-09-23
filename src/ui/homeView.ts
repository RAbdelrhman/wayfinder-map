import { draftMapPath, mapPath, repoPath } from '../repoRoutes.js';
import type { HandOffStatusDto } from '../handOffTracking.js';
import type { LastOpenedMap } from './homeRecency.js';
import { draftToMapPath, isNewMapHandOff } from './newMap.js';
import type { MapSnapshot, Ticket, WayfinderMap } from '../types.js';

export interface RepositorySummary {
  repo: string;
  mapCount: number;
  openTicketCount: number;
  ticketCount: number;
  doneTicketCount: number;
  latestMap: WayfinderMap | null;
}

export interface HomeWorkItem {
  id: string;
  lane: 'needs-you' | 'running';
  kind: 'handoff' | 'ticket' | 'pull-request';
  repo: string;
  title: string;
  detail: string;
  timestamp: string;
  href: string;
  externalUrl: string | null;
  handOffId: string | null;
  stale: boolean;
}

export interface ContinueDestination {
  kind: 'map' | 'handoff';
  title: string;
  repo: string;
  detail: string;
  href: string;
  timestamp: string;
  handOffId: string | null;
}

function sameRepo(left: string, right: string): boolean {
  return left.toLocaleLowerCase() === right.toLocaleLowerCase();
}

function timeValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizedTitle(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function orderRepositories(
  repositories: readonly string[],
  recentRepositories: readonly string[],
  repositoryOpenedAt: Readonly<Record<string, string>>,
): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const repo of [...recentRepositories, ...repositories]) {
    const key = repo.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(repo);
  }
  const recentPosition = new Map(recentRepositories.map((repo, index) => [repo.toLocaleLowerCase(), index]));
  return unique.sort((left, right) => {
    const leftOpened = timeValue(repositoryOpenedAt[left.toLocaleLowerCase()] ?? '');
    const rightOpened = timeValue(repositoryOpenedAt[right.toLocaleLowerCase()] ?? '');
    if (leftOpened !== rightOpened) return rightOpened - leftOpened;
    const leftPosition = recentPosition.get(left.toLocaleLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    const rightPosition = recentPosition.get(right.toLocaleLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    if (leftPosition !== rightPosition) return leftPosition - rightPosition;
    return left.localeCompare(right);
  });
}

export function summarizeRepository(repo: string, snapshot: MapSnapshot | null | undefined): RepositorySummary {
  const maps = snapshot?.maps ?? [];
  const tickets = maps.flatMap((map) => [...map.tickets, ...map.outside]);
  const latestMap = maps.reduce<WayfinderMap | null>(
    (latest, map) => (latest === null || map.number > latest.number ? map : latest),
    null,
  );
  return {
    repo,
    mapCount: maps.length,
    openTicketCount: tickets.filter((ticket) => ticket.open).length,
    ticketCount: tickets.length,
    doneTicketCount: tickets.filter((ticket) => !ticket.open).length,
    latestMap,
  };
}

function handOffLane(handOff: HandOffStatusDto): HomeWorkItem['lane'] | null {
  const hasT3PullRequest = handOff.pullRequests.some((pullRequest) => pullRequest.source === 't3');
  const terminal = handOff.status === 'failed' || handOff.status === 'interrupted' || hasT3PullRequest;
  if (handOff.acknowledged && terminal) return null;
  if (hasT3PullRequest) return null;
  if (handOff.pendingApproval || handOff.pendingUserInput || handOff.threadId === null) return 'needs-you';
  if (handOff.status === 'waiting' || handOff.status === 'ready' || handOff.status === 'failed' || handOff.status === 'interrupted') return 'needs-you';
  if (handOff.status === 'starting' || handOff.status === 'running' || handOff.status === 'untracked') return 'running';
  return null;
}

function handOffMapHref(handOff: HandOffStatusDto, snapshot: MapSnapshot | undefined): string {
  if (handOff.mapNumber !== null) {
    const base = mapPath(handOff.repo, handOff.mapNumber);
    return handOff.ticketNumber === null ? base : `${base}?ticket=${String(handOff.ticketNumber)}`;
  }
  if (isNewMapHandOff(handOff)) {
    const mapHref = snapshot === undefined ? null : draftToMapPath(handOff.repo, handOff, snapshot.maps);
    if (mapHref !== null) return mapHref;
    return draftMapPath(handOff.repo, handOff.id);
  }
  return repoPath(handOff.repo);
}

function handOffDetail(handOff: HandOffStatusDto): string {
  if (handOff.pendingApproval) return `${handOff.repo} · Approval needed in T3 Code`;
  if (handOff.pendingUserInput) return `${handOff.repo} · T3 Code is waiting for your input`;
  const scope = handOff.mapNumber === null ? 'New map' : `Map #${String(handOff.mapNumber)}`;
  const status: Record<HandOffStatusDto['status'], string> = {
    starting: 'Starting in T3 Code',
    running: 'Running in T3 Code',
    waiting: 'Waiting for you in T3 Code',
    ready: 'Ready for your next step',
    finished: 'Finished in T3 Code',
    interrupted: 'Interrupted in T3 Code',
    failed: 'Needs attention in T3 Code',
    untracked: 'T3 Code status is unavailable',
  };
  return `${handOff.repo} · ${scope} · ${status[handOff.status]}`;
}

function issueItem(
  repo: string,
  map: WayfinderMap,
  ticket: Ticket,
  kind: HomeWorkItem['kind'],
  lane: HomeWorkItem['lane'],
  timestamp: string,
): HomeWorkItem {
  return {
    id: `${kind}:${repo.toLocaleLowerCase()}:${map.number}:${ticket.number}`,
    lane,
    kind,
    repo,
    title: ticket.title,
    detail: `${repo} · Map #${String(map.number)} · ${kind === 'pull-request' ? 'Review requested' : ticket.type === 'grilling' ? 'Decision needed' : 'Prototype request'}`,
    timestamp,
    href: `${mapPath(repo, map.number)}?ticket=${String(ticket.number)}`,
    externalUrl: ticket.url,
    handOffId: null,
    stale: false,
  };
}

export function buildHomeWorkItems(
  handOffs: readonly HandOffStatusDto[],
  snapshots: readonly MapSnapshot[],
): HomeWorkItem[] {
  const snapshotByRepo = new Map(snapshots.map((snapshot) => [snapshot.repo.toLocaleLowerCase(), snapshot]));
  const items: HomeWorkItem[] = [];
  const handedOffTickets = new Set<string>();

  for (const handOff of handOffs) {
    const lane = handOffLane(handOff);
    const snapshot = snapshotByRepo.get(handOff.repo.toLocaleLowerCase());
    if (lane !== null) {
      if (handOff.ticketNumber !== null && handOff.mapNumber !== null) {
        handedOffTickets.add(`${handOff.repo.toLocaleLowerCase()}:${handOff.mapNumber}:${handOff.ticketNumber}`);
      }
      items.push({
        id: `handoff:${handOff.id}`,
        lane,
        kind: 'handoff',
        repo: handOff.repo,
        title: handOff.title ?? (handOff.ticketNumber === null ? 'T3 Code hand-off' : `Ticket #${String(handOff.ticketNumber)}`),
        detail: handOffDetail(handOff),
        timestamp: handOff.updatedAt,
        href: handOffMapHref(handOff, snapshot),
        externalUrl: null,
        handOffId: handOff.threadId === null ? null : handOff.id,
        stale: handOff.stale,
      });
    }
    for (const pullRequest of handOff.pullRequests) {
      if (pullRequest.state?.toLocaleLowerCase() !== 'open') continue;
      const numberLabel = pullRequest.number === null ? 'Pull request' : `Pull request #${String(pullRequest.number)}`;
      items.push({
        id: `pull-request:${handOff.repo.toLocaleLowerCase()}:${pullRequest.number ?? pullRequest.url}`,
        lane: 'needs-you',
        kind: 'pull-request',
        repo: handOff.repo,
        title: `Review ${numberLabel.toLocaleLowerCase()}`,
        detail: `${handOff.repo} · ${numberLabel} · Review changes`,
        timestamp: pullRequest.syncedAt ?? handOff.updatedAt,
        href: handOffMapHref(handOff, snapshot),
        externalUrl: pullRequest.url,
        handOffId: null,
        stale: handOff.stale,
      });
    }
  }

  for (const snapshot of snapshots) {
    for (const map of snapshot.maps) {
      for (const ticket of map.tickets) {
        const key = `${snapshot.repo.toLocaleLowerCase()}:${map.number}:${ticket.number}`;
        if (!ticket.open || (ticket.type !== 'grilling' && ticket.type !== 'prototype') || handedOffTickets.has(key)) continue;
        items.push(issueItem(snapshot.repo, map, ticket, 'ticket', 'needs-you', snapshot.fetchedAt));
      }
      for (const ticket of map.outside) {
        if (!ticket.open || !ticket.pullRequest) continue;
        items.push(issueItem(snapshot.repo, map, ticket, 'pull-request', 'needs-you', snapshot.fetchedAt));
      }
    }
  }

  const seen = new Set<string>();
  return items
    .filter((item) => {
      const key = item.kind === 'pull-request' && item.externalUrl !== null
        ? `pull-request:${item.externalUrl.toLocaleLowerCase()}`
        : item.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => timeValue(right.timestamp) - timeValue(left.timestamp) || left.title.localeCompare(right.title));
}

function handOffContinueTarget(handOff: HandOffStatusDto, snapshot: MapSnapshot | undefined): ContinueDestination {
  const matchingMap = isNewMapHandOff(handOff) && snapshot !== undefined
    ? snapshot.maps
        .filter((map) => normalizedTitle(map.title) === normalizedTitle(handOff.title ?? ''))
        .reduce<WayfinderMap | null>((latest, map) => (latest === null || map.number > latest.number ? map : latest), null)
    : null;
  const kind = handOff.mapNumber !== null || matchingMap !== null ? 'map' : 'handoff';
  return {
    kind,
    title: handOff.title ?? 'T3 Code hand-off',
    repo: handOff.repo,
    detail: handOffDetail(handOff),
    href: matchingMap === null ? handOffMapHref(handOff, snapshot) : mapPath(handOff.repo, matchingMap.number),
    timestamp: handOff.updatedAt,
    handOffId: handOff.threadId === null ? null : handOff.id,
  };
}

export function chooseContinueDestination(
  lastOpenedMap: LastOpenedMap | null,
  handOffs: readonly HandOffStatusDto[],
  snapshots: readonly MapSnapshot[],
): ContinueDestination | null {
  const snapshotByRepo = new Map(snapshots.map((snapshot) => [snapshot.repo.toLocaleLowerCase(), snapshot]));
  const handOff = handOffs.reduce<HandOffStatusDto | null>(
    (latest, candidate) => (latest === null || timeValue(candidate.updatedAt) > timeValue(latest.updatedAt) ? candidate : latest),
    null,
  );
  const handOffTarget = handOff === null ? null : handOffContinueTarget(handOff, snapshotByRepo.get(handOff.repo.toLocaleLowerCase()));
  if (handOffTarget !== null && (lastOpenedMap === null || timeValue(handOffTarget.timestamp) > timeValue(lastOpenedMap.openedAt))) {
    return handOffTarget;
  }
  if (lastOpenedMap === null) return handOffTarget;
  const snapshot = snapshotByRepo.get(lastOpenedMap.repo.toLocaleLowerCase());
  const map = snapshot?.maps.find((candidate) => candidate.number === lastOpenedMap.mapNumber);
  if (map !== undefined && snapshot !== undefined) {
    return {
      kind: 'map',
      title: map.title,
      repo: lastOpenedMap.repo,
      detail: map.sections.destination || `${lastOpenedMap.repo} · Map #${String(map.number)}`,
      href: mapPath(lastOpenedMap.repo, map.number),
      timestamp: lastOpenedMap.openedAt,
      handOffId: null,
    };
  }
  return {
    kind: 'map',
    title: `Map #${String(lastOpenedMap.mapNumber)}`,
    repo: lastOpenedMap.repo,
    detail: 'Recently opened',
    href: mapPath(lastOpenedMap.repo, lastOpenedMap.mapNumber),
    timestamp: lastOpenedMap.openedAt,
    handOffId: null,
  };
}

export function relativeTimeLabel(timestamp: string | null | undefined, now = Date.now()): string {
  if (timestamp === null || timestamp === undefined) return 'Not opened yet';
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return 'Not opened yet';
  const age = Math.max(0, now - parsed);
  if (age < 60_000) return 'Just now';
  if (age < 60 * 60_000) {
    const minutes = Math.max(1, Math.floor(age / 60_000));
    return `${String(minutes)}m ago`;
  }
  if (age < 24 * 60 * 60_000) {
    const hours = Math.floor(age / (60 * 60_000));
    return `${String(hours)}h ago`;
  }
  if (age < 7 * 24 * 60 * 60_000) {
    const days = Math.floor(age / (24 * 60 * 60_000));
    return `${String(days)}d ago`;
  }
  return new Date(parsed).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function inFlightStatusLabel(item: HomeWorkItem): string {
  return item.stale ? 'Status may be out of date' : item.lane === 'running' ? 'In T3 Code' : 'Needs you';
}
