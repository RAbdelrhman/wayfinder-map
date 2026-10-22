import type { MapSnapshot } from '../types.js';
import { archivedMapsPath, repoPath } from '../repoRoutes.js';
import { restoredMessage } from './archive.js';
import {
  initialRepositoryState,
  nextSelection,
  repositoryPageHtml,
  selectedMap,
  visibleMaps,
} from './repositoryView.js';
import type { RepositoryHandOffStatus, RepositoryPageState, RepositoryView } from './repositoryView.js';

/*
  The repository page's active maps and Archived maps (#242, option G of #288). It keeps one state,
  redraws the page from it on every change, and puts focus back where the change happened.
*/

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface RepositoryPageDeps {
  root: HTMLElement;
  repo: string;
  /** Draws page markup into the root and fills its icons. */
  paint: (html: string) => void;
  /** Saves an archive or restore choice and answers with the repository's new snapshot. */
  saveArchive: (mapNumber: number, archived: boolean) => Promise<MapSnapshot>;
  /** Reads the snapshot with this archived map's tickets, for its preview. */
  readMap: (mapNumber: number) => Promise<MapSnapshot>;
  toast: (message: string, action?: ToastAction) => void;
  /** Called with every snapshot the page shows, so the sidebar and inbox follow. */
  adopted: (snapshot: MapSnapshot) => void;
  /** The view changed, so the address bar and sidebar follow. */
  viewChanged: (view: RepositoryView, href: string) => void;
  /** Called after each draw, to bind parts the page doesn't own. */
  drawn?: () => void;
  handOffs: () => readonly RepositoryHandOffStatus[];
  autoMap: (mapNumber: number) => boolean;
  login: () => string | null;
  now?: () => number;
  /** True on narrow screens, where the preview sits below the list. */
  stacked?: () => boolean;
}

export interface RepositoryPage {
  show(snapshot: MapSnapshot): void;
  /** The refresh failed, so the page says it shows older maps. */
  markStale(): void;
  /** Switches lists from a link, updating the address bar. */
  go(view: RepositoryView): void;
  /** Switches lists to match an address the browser already moved to. */
  setView(view: RepositoryView): void;
  /** Redraws when something the page shows changed, keeping focus. */
  refresh(): void;
  snapshot(): MapSnapshot | null;
  state(): Readonly<RepositoryPageState>;
}

type Focus = string | (() => HTMLElement | null) | null;

/** The message a failed save shows: the server's, or ours when the request never reached it. */
function saveMessage(error: unknown): string {
  if (error instanceof TypeError || !(error instanceof Error) || error.message === '') return "Your archive choices couldn't be saved on this computer.";
  return error.message;
}

export function mountRepositoryPage(deps: RepositoryPageDeps, view: RepositoryView = 'active'): RepositoryPage {
  const { root, repo } = deps;
  const now = deps.now ?? (() => Date.now());
  let current: MapSnapshot | null = null;
  const state = initialRepositoryState(view);
  const previewing = new Set<number>();
  let generation = 0;

  function draw(focus: Focus = null): void {
    if (current === null) return;
    const keep = focus === null ? keptFocus() : null;
    deps.paint(repositoryPageHtml(repo, current, state, { handOffs: deps.handOffs(), autoMap: deps.autoMap, login: deps.login(), now: now() }));
    deps.drawn?.();
    const target = focus === null ? (keep?.() ?? null) : typeof focus === 'string' ? root.querySelector<HTMLElement>(focus) : focus();
    target?.focus();
    if (target instanceof HTMLInputElement && target.type === 'search') target.setSelectionRange(target.value.length, target.value.length);
    loadPreview();
  }

  /** The element to focus again after a redraw nobody asked to move focus for. */
  function keptFocus(): (() => HTMLElement | null) | null {
    const active = root.ownerDocument.activeElement;
    if (!(active instanceof HTMLElement) || !root.contains(active)) return null;
    if (active.id !== '') return () => root.querySelector<HTMLElement>(`#${CSS.escape(active.id)}`);
    for (const attribute of ['data-archive-map', 'data-restore-map']) {
      const value = active.getAttribute(attribute);
      if (value !== null) return () => root.querySelector<HTMLElement>(`[${attribute}="${CSS.escape(value)}"]`);
    }
    return null;
  }

  /** An archived map's tickets are read only when it is opened or previewed. */
  function loadPreview(): void {
    if (current === null || state.view !== 'archived') return;
    const map = selectedMap(current, state);
    if (map === null || map.ticketsLoaded || previewing.has(map.number)) return;
    previewing.add(map.number);
    const readGeneration = generation;
    deps.readMap(map.number).then(
      (next) => {
        if (current === null || readGeneration !== generation) return;
        const read = next.maps.find((candidate) => candidate.number === map.number);
        if (read === undefined || !read.ticketsLoaded) {
          state.stale = true;
          draw();
          return;
        }
        // Only this map's tickets are taken: an Archive or Restore saved meanwhile must not be undone.
        current = { ...current, maps: current.maps.map((candidate) => (candidate.number === map.number ? { ...read, settled: candidate.settled } : candidate)) };
        draw();
      },
      () => {
        if (readGeneration !== generation) return;
        state.stale = true;
        draw();
      },
    );
  }

  function select(mapNumber: number, focus = true): void {
    if (state.view === 'active') state.activeSelected = mapNumber;
    else state.archivedSelected = mapNumber;
    state.saveError = null;
    draw(focus ? `#maps-opt-${String(mapNumber)}` : null);
    if (focus && deps.stacked?.() === true) root.querySelector('.maps-detail')?.scrollIntoView({ block: 'start' });
  }

  function go(next: RepositoryView, selected?: number): void {
    state.view = next;
    state.query = '';
    state.saveError = null;
    if (selected !== undefined) {
      if (next === 'active') state.activeSelected = selected;
      else state.archivedSelected = selected;
    }
    deps.viewChanged(next, next === 'archived' ? archivedMapsPath(repo) : repoPath(repo));
    root.ownerDocument.defaultView?.scrollTo?.(0, 0);
    draw(selected === undefined ? 'h1' : `#maps-opt-${String(selected)}`);
  }

  async function change(mapNumber: number, archived: boolean): Promise<void> {
    if (current === null || state.pending !== null) return;
    const from: RepositoryView = archived ? 'active' : 'archived';
    if (state.view !== from) return;
    const before = visibleMaps(current, state).map((map) => map.number);
    const button = archived ? `[data-archive-map="${String(mapNumber)}"]` : `[data-restore-map="${String(mapNumber)}"]`;
    state.pending = mapNumber;
    state.saveError = null;
    draw(button);
    let next: MapSnapshot;
    try {
      next = await deps.saveArchive(mapNumber, archived);
    } catch (error) {
      state.pending = null;
      state.saveError = { kind: archived ? 'archive' : 'restore', mapNumber, message: saveMessage(error) };
      draw('[data-archive-retry]');
      return;
    }
    state.pending = null;
    current = next;
    deps.adopted(next);
    const map = next.maps.find((candidate) => candidate.number === mapNumber);
    const selected = nextSelection(before, mapNumber);
    if (archived) state.activeSelected = selected;
    else state.archivedSelected = selected;
    draw(() => root.querySelector<HTMLElement>('[role="option"][aria-selected="true"]') ?? root.querySelector<HTMLElement>(archived ? '.archive-door' : 'h1'));
    if (archived) deps.toast(`Archived #${String(mapNumber)}. GitHub is unchanged.`, { label: 'View', run: () => go('archived', mapNumber) });
    else if (map !== undefined) deps.toast(restoredMessage(map), { label: 'Show', run: () => go('active', mapNumber) });
  }

  root.addEventListener('click', (event) => {
    if (current === null || !(event.target instanceof Element)) return;
    const target = event.target.closest<HTMLElement>('[data-repo-view], [data-archive-map], [data-restore-map], [data-select-map], [data-archive-retry]');
    if (target === null || !root.contains(target)) return;
    if (target.matches('[data-repo-view]')) {
      if (event instanceof MouseEvent && (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return;
      event.preventDefault();
      go(target.dataset['repoView'] === 'archived' ? 'archived' : 'active');
      return;
    }
    if (target.getAttribute('aria-disabled') === 'true') return;
    const number = (key: string): number => Number(target.dataset[key]);
    if (target.matches('[data-archive-map]')) void change(number('archiveMap'), true);
    else if (target.matches('[data-restore-map]')) void change(number('restoreMap'), false);
    else if (target.matches('[data-select-map]')) select(number('selectMap'));
    else {
      const error = state.saveError;
      if (error !== null) {
        state.saveError = null;
        void change(error.mapNumber, error.kind === 'archive');
      }
    }
  });

  root.addEventListener('keydown', (event) => {
    if (current === null || !(event.target instanceof Element)) return;
    const option = event.target.closest<HTMLElement>('[role="option"][data-select-map]');
    if (option === null) return;
    const numbers = [...root.querySelectorAll<HTMLElement>('[role="option"][data-select-map]')].map((element) => Number(element.dataset['selectMap']));
    const index = numbers.indexOf(Number(option.dataset['selectMap']));
    if (event.key === 'Enter') {
      event.preventDefault();
      root.querySelector<HTMLAnchorElement>('.maps-preview')?.click();
      return;
    }
    const to = ({ ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: numbers.length - 1 } as Record<string, number | undefined>)[event.key];
    if (to === undefined) return;
    event.preventDefault();
    const mapNumber = numbers[Math.max(0, Math.min(numbers.length - 1, to))];
    if (mapNumber !== undefined) select(mapNumber);
  });

  root.addEventListener('input', (event) => {
    if (current === null || !(event.target instanceof HTMLInputElement) || event.target.id !== 'repo-map-search') return;
    state.query = event.target.value;
    state.saveError = null;
    draw('#repo-map-search');
  });

  return {
    show(snapshot) {
      generation += 1;
      previewing.clear();
      current = snapshot;
      state.stale = false;
      deps.adopted(snapshot);
      draw();
    },
    markStale() {
      if (current === null) return;
      state.stale = true;
      draw();
    },
    go(next) {
      go(next);
    },
    setView(next) {
      if (next === state.view) return;
      state.view = next;
      state.query = '';
      state.saveError = null;
      draw('h1');
    },
    refresh() {
      draw();
    },
    snapshot: () => current,
    state: () => state,
  };
}
