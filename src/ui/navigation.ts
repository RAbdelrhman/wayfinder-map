import type { MapSnapshot, WayfinderMap } from '../types.js';
import { mapPath, normalizeRepo, repoPath, scopedApiPath } from '../repoRoutes.js';
import { escapeHtml } from './markdown.js';
import { clickedOutside } from './outsideClick.js';
import { allTickets, miniRing, paintIcons, repoIconHtml } from './chrome.js';

export type NavigationView = 'map' | 'table' | 'prototypes';
export type NavigationPage = 'home' | 'repository' | 'new-map' | 'map';

export interface JumpDestination {
  kind: 'repository' | 'map' | 'ticket';
  label: string;
  detail: string;
  href: string;
  searchText: string;
}

export interface NavigationOptions {
  shell: HTMLElement;
  sidebar: HTMLElement;
  topbar: HTMLElement;
  topbarRoot: HTMLElement;
  page: NavigationPage;
  repo: string | null;
  mapNumber: number | null;
  view: NavigationView;
  onStartTicket?: (ticketNumber: number) => void;
  onViewChange?: (view: NavigationView) => void;
}

export interface NavigationController {
  setSnapshot(snapshot: MapSnapshot, mapNumber?: number | null): void;
  setCurrentRepo(repo: string | null): void;
  setActiveView(view: NavigationView): void;
  setPrototypeCount(count: number | null): void;
}

const SIDEBAR_STATE = 'wayfinder-map:navigation-expanded';
const VIEWS: readonly NavigationView[] = ['map', 'table', 'prototypes'];
const VIEW_LABEL: Record<NavigationView, string> = { map: 'Map', table: 'Table', prototypes: 'Prototypes' };
const VIEW_ICON: Record<NavigationView, string> = { map: 'graph', table: 'table', prototypes: 'beaker' };

function iconName(name: string): string {
  return `<span class="i" data-icon="${name}" aria-hidden="true"></span>`;
}


export function viewFromQuery(value: string | null): NavigationView {
  return value === 'table' || value === 'prototypes' ? value : 'map';
}

export function prototypeCountBadge(count: number | null): string {
  return count === null ? '' : `<span class="nav-map-tab-count" aria-label="${String(count)} prototypes on this map">${String(count)}</span>`;
}

export function createJumpDestinations(
  repositories: readonly string[],
  snapshots: readonly MapSnapshot[],
  query: string,
): JumpDestination[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length === 0 || needle === '#') return [];
  const normalizedNeedle = needle.replace(/^#/, '');
  const destinations: JumpDestination[] = [];

  for (const repo of repositories) {
    if (repo.toLocaleLowerCase().includes(needle)) {
      destinations.push({
        kind: 'repository',
        label: repo,
        detail: 'Repository',
        href: repoPath(repo),
        searchText: repo,
      });
    }
  }

  for (const snapshot of snapshots) {
    for (const map of snapshot.maps) {
      const mapHref = mapPath(snapshot.repo, map.number);
      const mapSearch = `${snapshot.repo} #${String(map.number)} ${map.title}`;
      const mapNumberMatches = normalizedNeedle.length > 0 && String(map.number).startsWith(normalizedNeedle);
      if (mapSearch.toLocaleLowerCase().includes(needle) || mapNumberMatches) {
        destinations.push({
          kind: 'map',
          label: map.title,
          detail: `${snapshot.repo} · Map #${String(map.number)}`,
          href: mapHref,
          searchText: mapSearch,
        });
      }

      for (const ticket of allTickets(map)) {
        const ticketSearch = `${snapshot.repo} ${map.title} #${String(ticket.number)} ${ticket.title}`;
        const ticketNumberMatches = normalizedNeedle.length > 0 && String(ticket.number).startsWith(normalizedNeedle);
        if (ticketSearch.toLocaleLowerCase().includes(needle) || ticketNumberMatches) {
          destinations.push({
            kind: 'ticket',
            label: `#${String(ticket.number)} ${ticket.title}`,
            detail: `${snapshot.repo} · ${map.title}`,
            href: `${mapHref}?view=map&ticket=${String(ticket.number)}`,
            searchText: ticketSearch,
          });
        }
      }
    }
  }

  const rank = (item: JumpDestination): number => {
    const text = item.searchText.toLocaleLowerCase();
    if (text === needle || text === normalizedNeedle) return 0;
    if (item.label.toLocaleLowerCase().startsWith(needle) || item.label.toLocaleLowerCase().startsWith(normalizedNeedle)) return 1;
    return 2;
  };
  return destinations.sort((left, right) => rank(left) - rank(right) || left.label.localeCompare(right.label)).slice(0, 60);
}

function currentMap(snapshot: MapSnapshot | undefined, mapNumber: number | null): WayfinderMap | null {
  return snapshot?.maps.find((map) => map.number === mapNumber) ?? null;
}

function mapHref(repo: string, map: WayfinderMap, view: NavigationView): string {
  return `${mapPath(repo, map.number)}?view=${view}`;
}

function requireElement<T extends Element>(element: T | null, selector: string): T {
  if (element === null) throw new Error(`Missing navigation element ${selector}.`);
  return element;
}

/** A repository's name without its owner, unless another listed repository shares it. */
export function repoLabel(repo: string, repositories: readonly string[]): string {
  const name = repo.split('/')[1] ?? repo;
  const clashes = repositories.filter((candidate) => (candidate.split('/')[1] ?? candidate).toLocaleLowerCase() === name.toLocaleLowerCase()).length > 1;
  return clashes ? repo : name;
}

function mapListMarkup(repo: string, maps: readonly WayfinderMap[], currentMapNumber: number | null, view: NavigationView): string {
  if (maps.length === 0) return '<li class="nav-tree-status">No maps yet</li>';
  return maps
    .map((map) => {
      const selected = currentMapNumber === map.number;
      return `<li><a class="row${selected ? ' is-on' : ''}" href="${mapHref(repo, map, view)}"${selected ? ' aria-current="page"' : ''} title="#${String(map.number)} ${escapeHtml(map.title)}">
        ${miniRing(map)}<span class="grow">#${String(map.number)} ${escapeHtml(map.title)}</span>
      </a></li>`;
    })
    .join('');
}

function scopeMenuMarkup(id: string, label: string, repositories: readonly string[], currentRepo: string | null, open: boolean): string {
  const items = repositories.length === 0
    ? '<li class="nav-tree-status">No repositories found</li>'
    : repositories
        .map((repo) => `<li><a class="menu-item${repo === currentRepo ? ' is-on' : ''}" href="${repoPath(repo)}"${repo === currentRepo ? ' aria-current="page"' : ''}>
          ${repoIconHtml(repo, 'sm')}<span class="grow">${escapeHtml(repo)}</span>${repo === currentRepo ? '<span class="nav-current-check" aria-hidden="true">✓</span>' : ''}
        </a></li>`)
        .join('');
  return `<div class="menu nav-popover" id="nav-menu-${id}" data-nav-menu="${id}" aria-label="${escapeHtml(label)}"${open ? '' : ' hidden'}><div class="menu-label">Switch repository</div><ul>${items}</ul></div>`;
}

export function mountNavigation(options: NavigationOptions): NavigationController {
  const { shell, sidebar, topbar, topbarRoot } = options;
  const page = options.page;
  let currentRepo = options.repo;
  let currentMapNumber = options.mapNumber;
  let activeView = options.view;
  let prototypeCount: number | null = null;
  let repositories: string[] = [];
  let repositoryListLoaded = false;
  let repositoryListFailed = false;
  let openMenu: string | null = null;
  let paletteTrigger: HTMLElement | null = null;
  let paletteOpen = false;
  let paletteQuery = '';
  let activeResult = -1;
  let searchStarted = false;
  let searchPending = 0;
  let expanded = readExpandedPreference(page);
  /** The tree scrolls to your location once, then keeps wherever the user scrolls it. */
  let revealedLocation = page === 'home' || page === 'new-map';
  let mapSnapshots = new Map<string, MapSnapshot>();
  let snapshotErrors = new Set<string>();
  const snapshotRequests = new Map<string, Promise<MapSnapshot | null>>();
  const expandedRepos = new Set<string>();

  if ((page === 'repository' || page === 'map' || page === 'new-map') && currentRepo !== null) expandedRepos.add(currentRepo);

  const topbarActionJump = topbarRoot.querySelector<HTMLButtonElement>('#jump-to-top');
  const mapStartButton = topbarRoot.querySelector<HTMLButtonElement>('#map-start');
  const dialog = document.createElement('dialog');
  dialog.className = 'jump-dialog';
  dialog.setAttribute('aria-labelledby', 'jump-title');
  dialog.innerHTML = `<div class="jump-dialog-head"><div><h2 id="jump-title">Jump to</h2><p id="jump-help">Search repositories, maps, and tickets.</p></div><kbd>Esc</kbd></div>
    <label class="jump-search"><span data-icon="lens" aria-hidden="true"></span><input id="jump-query" type="search" role="combobox" aria-label="Search repositories, maps, and tickets" aria-autocomplete="list" aria-controls="jump-results" aria-expanded="true" aria-describedby="jump-help" placeholder="Search repositories, maps, tickets…" autocomplete="off" spellcheck="false" /></label>
    <p class="jump-status" id="jump-status" aria-live="polite"></p><div class="jump-results" id="jump-results" role="listbox" aria-label="Navigation results"></div>`;
  document.body.append(dialog);
  const announcement = document.createElement('div');
  announcement.className = 'sr-only';
  announcement.setAttribute('aria-live', 'polite');
  announcement.setAttribute('aria-atomic', 'true');
  announcement.id = 'navigation-announcement';
  document.body.append(announcement);
  paintIcons(dialog);

  const queryInput = requireElement(dialog.querySelector<HTMLInputElement>('#jump-query'), '#jump-query');
  const resultsElement = requireElement(dialog.querySelector<HTMLElement>('#jump-results'), '#jump-results');
  const statusElement = requireElement(dialog.querySelector<HTMLElement>('#jump-status'), '#jump-status');

  function setShellExpanded(next: boolean, persist: boolean): void {
    expanded = next;
    shell.classList.toggle('is-nav-expanded', expanded);
    shell.classList.toggle('is-nav-collapsed', !expanded);
    if (persist) {
      try {
        localStorage.setItem(SIDEBAR_STATE, expanded ? 'expanded' : 'collapsed');
      } catch {
        // Sidebar state is a convenience and is unavailable in private browsing contexts.
      }
    }
    renderSidebar();
    renderTopbar();
  }

  function getMapSnapshot(repo: string): Promise<MapSnapshot | null> {
    const cached = mapSnapshots.get(repo);
    if (cached !== undefined) return Promise.resolve(cached);
    const existing = snapshotRequests.get(repo);
    if (existing !== undefined) return existing;
    const request = (async (): Promise<MapSnapshot | null> => {
      try {
        const response = await fetch(scopedApiPath(repo, 'snapshot'));
        if (!response.ok) throw new Error('Could not load maps.');
        const body: unknown = await response.json();
        if (typeof body !== 'object' || body === null || !Array.isArray((body as MapSnapshot).maps)) throw new Error('Map response was invalid.');
        const snapshot = body as MapSnapshot;
        mapSnapshots.set(repo, snapshot);
        snapshotErrors.delete(repo);
        renderSidebar();
        renderTopbar();
        renderPaletteResults();
        return snapshot;
      } catch {
        snapshotErrors.add(repo);
        return null;
      } finally {
        snapshotRequests.delete(repo);
        if (!mapSnapshots.has(repo)) {
          renderSidebar();
          renderTopbar();
          renderPaletteResults();
        }
      }
    })();
    snapshotRequests.set(repo, request);
    return request;
  }

  function closeMenu(returnFocus: boolean): void {
    const previous = openMenu;
    openMenu = null;
    renderSidebar();
    renderTopbar();
    if (returnFocus && previous !== null) {
      const trigger = findMenuTrigger(previous);
      trigger?.focus();
    }
  }

  function findMenuTrigger(menu: string): HTMLElement | null {
    return sidebar.querySelector<HTMLElement>(`[data-nav-flyout-trigger="${menu}"]`) ??
      sidebar.querySelector<HTMLElement>(`[data-nav-disclose="${menu}"]`) ??
      topbar.querySelector<HTMLElement>(`[data-nav-menu-trigger="${menu}"]`);
  }

  function positionMenu(menuId: string, trigger: HTMLElement): void {
    const panel = document.getElementById(`nav-menu-${menuId}`);
    if (panel === null || panel.hidden) return;
    panel.style.position = 'fixed';
    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const width = Math.min(Math.max(panel.offsetWidth, 300), window.innerWidth - margin * 2);
    const height = panel.offsetHeight;
    const flyout = menuId.startsWith('flyout-');
    let left = flyout ? rect.right + 8 : rect.left;
    if (left + width > window.innerWidth - margin) left = flyout ? rect.left - width - 8 : window.innerWidth - width - margin;
    left = Math.max(margin, left);
    let top = rect.bottom + 6;
    if (top + height > window.innerHeight - margin) top = rect.top - height - 6;
    top = Math.min(Math.max(margin, top), Math.max(margin, window.innerHeight - height - margin));
    panel.style.left = `${String(left)}px`;
    panel.style.top = `${String(top)}px`;
    panel.style.maxWidth = `calc(100vw - ${String(margin * 2)}px)`;
    panel.style.maxHeight = `calc(100vh - ${String(margin * 2)}px)`;
  }

  function repositionOpenMenu(): void {
    if (openMenu === null) return;
    const trigger = findMenuTrigger(openMenu);
    if (trigger !== null) positionMenu(openMenu, trigger);
  }

  function toggleMenu(menu: string, trigger: HTMLElement): void {
    openMenu = openMenu === menu ? null : menu;
    renderSidebar();
    renderTopbar();
    if (openMenu !== null) {
      if (menu.startsWith('flyout-')) {
        const index = Number(menu.slice('flyout-'.length));
        const repo = repositories[index];
        if (repo !== undefined) void getMapSnapshot(repo);
      }
      const newTrigger = findMenuTrigger(menu);
      if (newTrigger !== null) positionMenu(menu, newTrigger);
      else positionMenu(menu, trigger);
    }
  }

  function renderRepoRows(): string {
    if (!repositoryListLoaded) return '<li class="nav-tree-status">Loading repositories…</li>';
    if (repositories.length === 0) {
      return `<li class="nav-tree-status">${repositoryListFailed ? 'Repositories are unavailable.' : 'No repositories yet. Open one from Home.'}</li>`;
    }
    return repositories
      .map((repo, index) => {
        const isContext = repo === currentRepo && page !== 'home';
        const currentPage = isContext && page === 'repository';
        const expandedRepo = expandedRepos.has(repo);
        const snapshot = mapSnapshots.get(repo);
        const treeId = `nav-repo-maps-${String(index)}`;
        const mapRows = !expandedRepo
          ? `<ul class="kids" id="${treeId}" hidden></ul>`
          : snapshot !== undefined
            ? `<ul class="kids" id="${treeId}">${mapListMarkup(repo, snapshot.maps, page === 'map' && repo === currentRepo ? currentMapNumber : null, activeView)}</ul>`
            : snapshotErrors.has(repo)
              ? `<ul class="kids" id="${treeId}"><li class="nav-tree-status">Could not load maps.</li><li><button type="button" class="nav-retry" data-nav-retry="${String(index)}">Retry</button></li></ul>`
              : `<ul class="kids" id="${treeId}"><li class="nav-tree-status">Loading maps…</li></ul>`;
        const label = repoLabel(repo, repositories);
        return `<li class="nav-repo">
          <div class="row${currentPage ? ' is-on' : isContext ? ' is-trail' : ''}">
            <button type="button" class="twist${expandedRepo ? ' is-open' : ''}" data-nav-disclose="${String(index)}" aria-expanded="${String(expandedRepo)}" aria-controls="${treeId}" aria-label="${expandedRepo ? 'Collapse' : 'Expand'} maps in ${escapeHtml(repo)}" title="${expandedRepo ? 'Collapse' : 'Expand'} maps">${iconName('right')}</button>
            <a class="row-link" href="${repoPath(repo)}"${currentPage ? ' aria-current="page"' : ''} title="${escapeHtml(repo)}">${repoIconHtml(repo, 'sm')}<span class="grow">${escapeHtml(label)}</span></a>
          </div>${mapRows}</li>`;
      })
      .join('');
  }

  function renderCompactRepoMarks(): string {
    return repositories
      .map((repo, index) => {
        const menu = `flyout-${String(index)}`;
        const opened = openMenu === menu;
        const current = repo === currentRepo && page !== 'home';
        const snapshot = mapSnapshots.get(repo);
        const items = snapshot === undefined
          ? snapshotErrors.has(repo)
            ? '<li class="nav-tree-status">Could not load maps.</li>'
            : '<li class="nav-tree-status">Loading maps…</li>'
          : snapshot.maps.length === 0
            ? '<li class="nav-tree-status">No maps yet</li>'
            : snapshot.maps
                .map((map) => {
                  const on = current && page === 'map' && map.number === currentMapNumber;
                  return `<li><a class="menu-item${on ? ' is-on' : ''}" href="${mapHref(repo, map, activeView)}"${on ? ' aria-current="page"' : ''}>${miniRing(map)}<span class="grow">#${String(map.number)} ${escapeHtml(map.title)}</span></a></li>`;
                })
                .join('');
        const mapCount = snapshot === undefined ? '' : `<span class="nav-meta">${String(snapshot.maps.length)}</span>`;
        return `<li class="nav-mark-item"><button type="button" class="rail-btn${current ? ' is-here' : ''}" data-nav-flyout-trigger="${menu}" data-tip="${escapeHtml(repoLabel(repo, repositories))}" aria-expanded="${String(opened)}" aria-controls="nav-menu-${menu}" aria-label="Open ${escapeHtml(repo)} maps">${repoIconHtml(repo, 'sm')}</button>
          <div class="menu nav-popover nav-flyout" id="nav-menu-${menu}" data-nav-menu="${menu}" aria-label="${escapeHtml(repo)} maps"${opened ? '' : ' hidden'}><div class="menu-label">${escapeHtml(repo)}</div><ul><li><a class="menu-item${current && page === 'repository' ? ' is-on' : ''}" href="${repoPath(repo)}">${iconName('graph')}<span class="grow">All maps</span>${mapCount}</a></li>${items}</ul></div></li>`;
      })
      .join('');
  }

  function renderSidebar(): void {
    const homeCurrent = page === 'home';
    const newMapCurrent = page === 'new-map';
    const newMapHref = page === 'repository' && currentRepo !== null ? `/new-map?repo=${encodeURIComponent(currentRepo)}` : '/new-map';
    const repoRows = renderRepoRows();
    const compactMarks = renderCompactRepoMarks();
    const existingFooter = sidebar.querySelector<HTMLElement>('.nav-footer');
    const treeScroll = sidebar.querySelector<HTMLElement>('.tree')?.scrollTop ?? null;
    const railScroll = sidebar.querySelector<HTMLElement>('.mini-repos')?.scrollTop ?? null;
    const logo = '<img class="app-logo" src="/wayfinder-icon.svg" alt="" width="30" height="30" />';
    sidebar.innerHTML = `<nav class="navigation" aria-label="Primary">
      <div class="nav-open-content side" id="nav-content"${expanded ? '' : ' hidden'}>
        <div class="side-head"><a class="nav-brand" href="/" aria-label="Wayfinder Home">${logo}</a><b>Wayfinder</b><button class="fold" type="button" id="nav-fold" aria-expanded="true" aria-controls="nav-content" aria-label="Fold the sidebar" title="Fold the sidebar">${iconName('panel')}</button></div>
        <div class="side-actions">
          <a class="primary${newMapCurrent ? ' is-current' : ''}" href="${newMapHref}"${newMapCurrent ? ' aria-current="page"' : ''}>${iconName('plus')}Start a new map</a>
          <button type="button" class="search" data-nav-action="jump">${iconName('lens')}<span class="ph">Jump to…</span><kbd>Ctrl K</kbd></button>
        </div>
        <div class="tree">
          <a class="row${homeCurrent ? ' is-on' : ''}" href="/"${homeCurrent ? ' aria-current="page"' : ''}>${iconName('home')}<span class="grow">Home</span></a>
          <h2 class="tree-label" id="nav-repositories-title">Repositories</h2>
          <ul class="nav-tree" aria-labelledby="nav-repositories-title">${repoRows}</ul>
        </div>
      </div>
      <div class="nav-compact-content mini"${expanded ? ' hidden' : ''}>
        <div class="mini-head"><button type="button" class="fold mini-logo" id="nav-unfold" aria-expanded="false" aria-controls="nav-content" aria-label="Open the sidebar" title="Open the sidebar">${logo}${iconName('panel')}</button></div>
        <a class="new${newMapCurrent ? ' is-current' : ''}" href="${newMapHref}" data-tip="Start a new map" aria-label="Start a new map">${iconName('plus')}</a>
        <button type="button" class="rail-btn" data-nav-action="jump" data-tip="Jump to… Ctrl K" aria-label="Jump to">${iconName('lens')}</button>
        <a class="rail-btn${homeCurrent ? ' is-on' : ''}" href="/"${homeCurrent ? ' aria-current="page"' : ''} data-tip="Home" aria-label="Home">${iconName('home')}</a>
        <span class="mini-sep" role="separator"></span>
        <ul class="mini-repos" aria-label="Repositories">${compactMarks}</ul>
      </div>
      <div class="nav-footer">
        <span class="rail-mark nav-account" id="account-mark" role="img" aria-label="GitHub account, loading" title="GitHub account">…</span><span class="nav-account-label grow" id="account-label">GitHub account</span>
        ${page === 'map' ? `<button type="button" id="models" class="rail-btn" aria-label="Model defaults" data-tip="Model defaults" title="Pick a T3 Code model for each task tier">${iconName('sliders')}</button>` : ''}
        <button type="button" id="updater" class="rail-btn" aria-label="Check for updates" data-tip="Updates">${iconName('download')}</button>
        <button type="button" id="theme" class="rail-btn" aria-label="Switch light and dark" data-tip="Theme">${iconName('moon')}</button>
      </div>
    </nav>`;
    if (existingFooter !== null) sidebar.querySelector('.nav-footer')?.replaceWith(existingFooter);
    const tree = sidebar.querySelector<HTMLElement>('.tree');
    const rail = sidebar.querySelector<HTMLElement>('.mini-repos');
    if (tree !== null && treeScroll !== null) tree.scrollTop = treeScroll;
    if (rail !== null && railScroll !== null) rail.scrollTop = railScroll;
    if (!revealedLocation && repositoryListLoaded) {
      const here = sidebar.querySelector<HTMLElement>(expanded ? '.tree .row.is-on, .tree .row.is-trail' : '.mini-repos .is-here');
      if (here !== null) {
        here.scrollIntoView({ block: 'center' });
        revealedLocation = true;
      }
    }
    shell.classList.toggle('is-nav-expanded', expanded);
    shell.classList.toggle('is-nav-collapsed', !expanded);
    paintIcons(sidebar);
    repositionOpenMenu();
  }

  function renderTopbar(): void {
    const snapshot = currentRepo === null ? undefined : mapSnapshots.get(currentRepo);
    const map = currentMap(snapshot, currentMapNumber);
    const repoScope = (menuId: string, repo: string, quiet: boolean): string => `<div class="nav-scope-control"><button type="button" class="scope${quiet ? ' is-quiet' : ''}" data-nav-menu-trigger="${menuId}" aria-haspopup="true" aria-expanded="${String(openMenu === menuId)}" aria-controls="nav-menu-${menuId}" aria-label="Switch repository, current is ${escapeHtml(repo)}" title="Switch repository">${repoIconHtml(repo, 'sm')}<span class="t">${escapeHtml(quiet ? repoLabel(repo, repositories) : repo)}</span>${iconName('chevron')}</button>${scopeMenuMarkup(menuId, 'Repositories', repositories, currentRepo, openMenu === menuId)}</div>`;
    const mapScope = (menuId: string, repo: string, current: WayfinderMap | null): string => {
      const label = current === null ? (currentMapNumber === null ? 'Choose a map' : `Map #${String(currentMapNumber)}`) : `#${String(current.number)} ${current.title}`;
      const menuMaps = snapshot?.maps.length
        ? `<div class="menu-label">Maps in ${escapeHtml(repoLabel(repo, repositories))}</div><ul>${snapshot.maps.map((candidate) => `<li><a class="menu-item${candidate.number === currentMapNumber ? ' is-on' : ''}" href="${mapHref(repo, candidate, activeView)}"${candidate.number === currentMapNumber ? ' aria-current="page"' : ''}>${miniRing(candidate)}<span class="grow">#${String(candidate.number)} ${escapeHtml(candidate.title)}</span></a></li>`).join('')}<li><a class="menu-item nav-all-maps" href="${repoPath(repo)}">${iconName('graph')}<span class="grow">All maps</span></a></li></ul>`
        : `<ul><li class="nav-tree-status">${snapshotRequests.has(repo) ? 'Loading maps…' : snapshotErrors.has(repo) ? 'Could not load maps.' : 'No maps yet'}</li></ul>`;
      return `<div class="nav-scope-control"><button type="button" class="scope" data-nav-menu-trigger="${menuId}" aria-haspopup="true" aria-expanded="${String(openMenu === menuId)}" aria-controls="nav-menu-${menuId}"${snapshot?.maps.length ? '' : ' disabled'} title="Choose a map">${current === null ? '' : miniRing(current)}<span class="t">${escapeHtml(label)}</span>${iconName('chevron')}</button><div class="menu nav-popover" id="nav-menu-${menuId}" data-nav-menu="${menuId}" aria-label="Maps in ${escapeHtml(repo)}"${openMenu === menuId ? '' : ' hidden'}>${menuMaps}</div></div>`;
    };
    const separator = '<span class="crumb-sep" aria-hidden="true">/</span>';
    if (page === 'map' && currentRepo !== null) {
      const repo = currentRepo;
      topbar.innerHTML = `<div class="nav-map-strip"><nav class="nav-map-scopes" aria-label="Map location">${repoScope('repo-scope', repo, true)}${separator}${mapScope('map-scope', repo, map)}</nav><nav class="segmented nav-map-tabs" aria-label="Map views">${VIEWS.map((view) => `<a class="seg${activeView === view ? ' is-on' : ''}" href="${map ? mapHref(repo, map, view) : '#'}" data-nav-view="${view}"${activeView === view ? ' aria-current="page"' : ''}>${iconName(VIEW_ICON[view])}<span>${VIEW_LABEL[view]}</span>${view === 'prototypes' ? prototypeCountBadge(prototypeCount) : ''}</a>`).join('')}</nav></div>`;
    } else if (page === 'repository' && currentRepo !== null) {
      topbar.innerHTML = `<nav class="nav-scopes" aria-label="Repository">${repoScope('repo-scope', currentRepo, false)}</nav>`;
    } else if (page === 'new-map') {
      topbar.innerHTML = '<span class="page-title" aria-current="page">Start a new map</span>';
    } else {
      topbar.innerHTML = '<span class="page-title" aria-current="page">Home</span>';
    }
    paintIcons(topbar);
    const startTicket = map?.tickets.find((ticket) => ticket.state === 'frontier');
    if (mapStartButton !== null) {
      mapStartButton.hidden = page !== 'map' || startTicket === undefined;
      if (startTicket !== undefined) {
        mapStartButton.dataset['ticket'] = String(startTicket.number);
        mapStartButton.setAttribute('aria-label', `Start #${String(startTicket.number)} in T3 Code`);
        mapStartButton.title = `Start #${String(startTicket.number)} in T3 Code: ${startTicket.title}`;
        const label = mapStartButton.querySelector<HTMLElement>('.topbar-action-label');
        if (label !== null) label.textContent = `Start #${String(startTicket.number)} in T3 Code`;
      }
    }
    if (topbarActionJump !== null) topbarActionJump.hidden = page !== 'map' || expanded;
    repositionOpenMenu();
  }

  function renderPaletteResults(): void {
    if (!paletteOpen) return;
    const snapshots = [...mapSnapshots.values()];
    const destinations = createJumpDestinations(repositories, snapshots, paletteQuery);
    activeResult = destinations.length === 0 ? -1 : Math.min(Math.max(activeResult, 0), destinations.length - 1);
    resultsElement.innerHTML = destinations
      .map((destination, index) => `<button type="button" class="jump-option${activeResult === index ? ' is-active' : ''}" role="option" id="jump-option-${String(index)}" aria-selected="${String(activeResult === index)}" data-jump-href="${escapeHtml(destination.href)}">
        <span class="jump-option-kind">${destination.kind === 'repository' ? 'Repository' : destination.kind === 'map' ? 'Map' : 'Ticket'}</span><span class="jump-option-copy"><strong>${escapeHtml(destination.label)}</strong><span>${escapeHtml(destination.detail)}</span></span>${iconName('chevron')}
      </button>`)
      .join('');
    if (activeResult < 0) queryInput.removeAttribute('aria-activedescendant');
    else queryInput.setAttribute('aria-activedescendant', `jump-option-${String(activeResult)}`);
    statusElement.textContent = paletteQuery.trim().length === 0
      ? repositoryListLoaded ? 'Type to search repositories, maps, and tickets.' : 'Loading repositories…'
      : destinations.length > 0
        ? `${String(destinations.length)} result${destinations.length === 1 ? '' : 's'}${searchPending > 0 ? ' · still searching maps and tickets' : ''}`
        : searchPending > 0
          ? 'Searching maps and tickets…'
          : repositoryListFailed
            ? 'Repositories could not be loaded. Try again after reconnecting.'
            : 'No results found.';
    paintIcons(resultsElement);
  }

  function closePalette(restoreFocus: boolean): void {
    if (!paletteOpen) return;
    paletteOpen = false;
    dialog.close();
    if (restoreFocus) paletteTrigger?.focus();
    paletteTrigger = null;
  }

  async function loadRepositories(): Promise<void> {
    try {
      const response = await fetch('/api/repositories');
      if (!response.ok) throw new Error('Repository list unavailable.');
      const body: unknown = await response.json();
      const values = Array.isArray(body) ? body : [];
      repositories = [...new Set(values.filter((value): value is string => typeof value === 'string').map((value) => normalizeRepo(value)).filter((value): value is string => value !== null))]
        .sort((left, right) => left.localeCompare(right));
      repositoryListLoaded = true;
      repositoryListFailed = false;
    } catch {
      repositoryListLoaded = true;
      repositoryListFailed = true;
      repositories = [];
    }
    renderSidebar();
    renderTopbar();
    renderPaletteResults();
    if (paletteOpen && paletteQuery.trim().length >= 2) void searchAllRepositories();
  }

  async function searchAllRepositories(): Promise<void> {
    if (searchStarted || repositories.length === 0) return;
    searchStarted = true;
    const remaining = repositories.filter((repo) => !mapSnapshots.has(repo));
    searchPending = remaining.length;
    if (searchPending === 0) {
      renderPaletteResults();
      return;
    }
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < remaining.length) {
        const repo = remaining[next];
        next += 1;
        if (repo === undefined) return;
        await getMapSnapshot(repo);
        searchPending -= 1;
        renderPaletteResults();
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, remaining.length) }, () => worker()));
  }

  function openPalette(trigger: HTMLElement): void {
    if (openMenu !== null) closeMenu(false);
    paletteTrigger = trigger;
    paletteQuery = '';
    activeResult = -1;
    paletteOpen = true;
    if (!dialog.open) dialog.showModal();
    queryInput.value = '';
    renderPaletteResults();
    queryInput.focus();
  }

  function render(): void {
    renderSidebar();
    renderTopbar();
    renderPaletteResults();
  }

  sidebar.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const fold = target.closest<HTMLElement>('#nav-fold, #nav-unfold');
    if (fold !== null) {
      setShellExpanded(!expanded, true);
      sidebar.querySelector<HTMLElement>(expanded ? '#nav-fold' : '#nav-unfold')?.focus();
      return;
    }
    const jump = target.closest<HTMLElement>('[data-nav-action="jump"]');
    if (jump !== null) {
      event.preventDefault();
      openPalette(jump);
      return;
    }
    const disclosure = target.closest<HTMLButtonElement>('[data-nav-disclose]');
    if (disclosure !== null) {
      const index = Number(disclosure.dataset['navDisclose']);
      const repo = repositories[index];
      if (repo === undefined) return;
      if (expandedRepos.has(repo)) expandedRepos.delete(repo);
      else {
        expandedRepos.add(repo);
        void getMapSnapshot(repo);
      }
      renderSidebar();
      sidebar.querySelector<HTMLButtonElement>(`[data-nav-disclose="${String(index)}"]`)?.focus();
      return;
    }
    const retry = target.closest<HTMLButtonElement>('[data-nav-retry]');
    if (retry !== null) {
      const repo = repositories[Number(retry.dataset['navRetry'])];
      if (repo !== undefined) {
        snapshotErrors.delete(repo);
        void getMapSnapshot(repo);
        renderSidebar();
      }
      return;
    }
    const flyout = target.closest<HTMLButtonElement>('[data-nav-flyout-trigger]');
    if (flyout !== null) toggleMenu(flyout.dataset['navFlyoutTrigger'] ?? '', flyout);
  });

  topbarRoot.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const jump = target.closest<HTMLButtonElement>('[data-nav-action="jump"]');
    if (jump !== null) {
      event.preventDefault();
      openPalette(jump);
      return;
    }
    const start = target.closest<HTMLButtonElement>('#map-start');
    if (start !== null && start.dataset['ticket'] !== undefined) {
      options.onStartTicket?.(Number(start.dataset['ticket']));
      return;
    }
    const trigger = target.closest<HTMLButtonElement>('[data-nav-menu-trigger]');
    if (trigger !== null) {
      event.preventDefault();
      toggleMenu(trigger.dataset['navMenuTrigger'] ?? '', trigger);
      return;
    }
    const viewLink = target.closest<HTMLAnchorElement>('[data-nav-view]');
    if (viewLink !== null) {
      const view = viewLink.dataset['navView'];
      if (view === 'map' || view === 'table' || view === 'prototypes') {
        event.preventDefault();
        options.onViewChange?.(view);
      }
    }
  });

  document.addEventListener('click', (event) => {
    if (openMenu !== null && clickedOutside(event, sidebar, topbarRoot)) closeMenu(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && openMenu !== null && !paletteOpen) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeMenu(true);
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      event.stopPropagation();
      const trigger = topbarActionJump?.hidden === false ? topbarActionJump : sidebar.querySelector<HTMLElement>('[data-nav-action="jump"]');
      if (trigger !== null && trigger !== undefined) openPalette(trigger);
    }
  });

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closePalette(true);
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closePalette(true);
    const option = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-jump-href]');
    if (option !== null) window.location.assign(option.dataset['jumpHref'] ?? '/');
  });
  queryInput.addEventListener('input', () => {
    paletteQuery = queryInput.value;
    activeResult = 0;
    renderPaletteResults();
    if (paletteQuery.trim().length >= 2) void searchAllRepositories();
  });
  queryInput.addEventListener('keydown', (event) => {
    const destinations = createJumpDestinations(repositories, [...mapSnapshots.values()], paletteQuery);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closePalette(true);
    } else if (event.key === 'ArrowDown' && destinations.length > 0) {
      event.preventDefault();
      activeResult = (activeResult + 1) % destinations.length;
      renderPaletteResults();
    } else if (event.key === 'ArrowUp' && destinations.length > 0) {
      event.preventDefault();
      activeResult = (activeResult <= 0 ? destinations.length : activeResult) - 1;
      renderPaletteResults();
    } else if (event.key === 'Enter' && activeResult >= 0) {
      const destination = destinations[activeResult];
      if (destination !== undefined) {
        event.preventDefault();
        window.location.assign(destination.href);
      }
    }
  });

  window.addEventListener('resize', () => {
    if (window.matchMedia('(max-width: 720px)').matches && expanded) setShellExpanded(false, false);
    if (openMenu !== null) {
      const trigger = findMenuTrigger(openMenu);
      if (trigger !== null) positionMenu(openMenu, trigger);
    }
  });

  setShellExpanded(expanded, false);
  renderTopbar();
  void loadRepositories();

  return {
    setSnapshot(snapshot, mapNumber = currentMapNumber) {
      if (currentMapNumber !== mapNumber) prototypeCount = null;
      mapSnapshots.set(snapshot.repo, snapshot);
      currentRepo = snapshot.repo;
      if (mapNumber !== undefined) currentMapNumber = mapNumber;
      expandedRepos.add(snapshot.repo);
      const map = currentMap(snapshot, currentMapNumber);
      if (map !== null) announcement.textContent = `${map.title} map`;
      render();
    },
    setCurrentRepo(repo) {
      currentRepo = repo;
      if (repo !== null && (page === 'repository' || page === 'map' || page === 'new-map')) expandedRepos.add(repo);
      render();
    },
    setActiveView(view) {
      activeView = view;
      announcement.textContent = `${VIEW_LABEL[view]} view`;
      renderTopbar();
    },
    setPrototypeCount(count) {
      prototypeCount = count;
      renderTopbar();
    },
  };
}

function readExpandedPreference(page: NavigationPage): boolean {
  const smallScreen = window.matchMedia('(max-width: 720px)').matches;
  if (smallScreen) return false;
  try {
    const saved = localStorage.getItem(SIDEBAR_STATE);
    if (saved === 'expanded') return true;
    if (saved === 'collapsed') return false;
  } catch {
    // Use the page default when storage is unavailable.
  }
  return page !== 'map';
}
