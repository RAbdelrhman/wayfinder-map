import { prototypeHash, prototypeStepFromHash } from './prototypeRoutes.js';
import type { PrototypeStep } from './prototypeRoutes.js';
import * as icons from './icons.js';
import { icon } from './icons.js';

interface MapPreview {
  number: number;
  title: string;
  destination: string;
  next: number;
  open: number;
  done: number;
  opened: string;
}

interface RepositoryPreview {
  name: string;
  maps: readonly MapPreview[];
  opened: string;
}

const REPOSITORIES: readonly RepositoryPreview[] = [
  {
    name: 'RAbdelrhman/wayfinder-map',
    opened: 'Opened 12 minutes ago',
    maps: [
      { number: 3, title: 'Home page: connect GitHub, pick a repo, pick a map', destination: 'Choose a repository and a map without slowing down the work.', next: 2, open: 5, done: 1, opened: 'Opened 12 minutes ago' },
      { number: 1, title: 'T3 Code hand-off', destination: 'Start focused ticket work in a dedicated T3 Code thread.', next: 0, open: 1, done: 6, opened: 'Opened yesterday' },
    ],
  },
  {
    name: 'RAbdelrhman/ledger-tools',
    opened: 'Opened Tuesday',
    maps: [{ number: 12, title: 'Daily reconciliation', destination: 'Make daily review results traceable without creating noise.', next: 1, open: 3, done: 7, opened: 'Opened Tuesday' }],
  },
  {
    name: 'RAbdelrhman/podcontrol',
    opened: 'Opened last week',
    maps: [{ number: 18, title: 'Subscription agents', destination: 'Let teammates safely run isolated work from the board.', next: 3, open: 7, done: 9, opened: 'Opened last week' }],
  },
];

function required<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

const selectedRepository = required(REPOSITORIES[0], 'The prototype needs a repository.');
const selectedMap = required(selectedRepository.maps[0], 'The prototype needs a map.');
const app = required(document.querySelector<HTMLElement>('#prototype-app'), 'Missing #prototype-app');

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

function link(step: PrototypeStep, label: string, className = ''): string {
  return `<a href="${prototypeHash(step)}" class="${className}" data-step="${step}">${label}</a>`;
}

function mapTotal(map: MapPreview): number {
  return map.open + map.done;
}

function mapStats(map: MapPreview): string {
  return `<div class="map-stats" aria-label="${String(mapTotal(map))} tickets"><span class="next"><b>${String(map.next)}</b> next</span><span class="open"><b>${String(map.open)}</b> open</span><span class="done"><b>${String(map.done)}</b> done</span></div>`;
}

function rail(step: PrototypeStep): string {
  return `<nav class="rail" aria-label="Prototype navigation">
    ${link('recent', `${icon(icons.COMPASS)}<span class="sr-only">Wayfinder home</span>`, 'rail-logo-link')}
    <div class="rail-links">
      ${link('recent', `${icon(icons.GRAPH)}<span class="sr-only">Home</span>`, `rail-link${step === 'recent' || step === 'browse' || step === 'repository' || step === 'map' ? ' is-on' : ''}`)}
      ${link('help', `${icon(icons.INFO)}<span class="sr-only">How to use</span>`, `rail-link${step === 'help' ? ' is-on' : ''}`)}
    </div>
    <div class="rail-bottom"><button class="rail-link" type="button" title="Settings">${icon(icons.SLIDERS)}<span class="sr-only">Settings</span></button><span class="avatar" title="GitHub account settings">R</span></div>
  </nav>`;
}

function header(step: PrototypeStep): string {
  const selected = step === 'recent' ? 'Recent' : step === 'browse' ? 'Browse repositories' : step === 'help' ? 'How to use' : selectedRepository.name;
  const mapSwitch = step === 'map' ? `<button class="map-switch" type="button">${escapeHtml(selectedMap.title)} ${icon(icons.CHEVRON)}</button>` : '';
  const homeTarget = step === 'repository' || step === 'map' ? `${link('recent', escapeHtml(selectedRepository.name), 'home-crumb')}<i>/</i>` : '<span>Home</span><i>/</i>';
  return `<header class="prototype-topbar"><div class="where">${homeTarget}<strong>${escapeHtml(selected)}</strong>${mapSwitch}</div><label class="prototype-search">${icon(icons.LENS)}<input type="search" placeholder="Search repositories and maps" aria-label="Search repositories and maps" /><kbd>Ctrl K</kbd></label></header>`;
}

function recentMapCard(repository: RepositoryPreview, map: MapPreview, compact = false): string {
  return `<a href="#map" class="map-card${compact ? ' compact' : ''}" data-step="map"><div class="map-card-main"><span class="repo-name">${escapeHtml(repository.name)}</span><h2>${escapeHtml(map.title)}</h2><p>${escapeHtml(map.destination)}</p></div><div class="map-card-meta">${mapStats(map)}<span class="opened">${escapeHtml(map.opened)}</span></div><span class="card-arrow">${icon(icons.ARROW)}</span></a>`;
}

function homeTabs(active: 'recent' | 'browse'): string {
  return `<nav class="home-tabs" aria-label="Home content">${link('recent', 'Recent', active === 'recent' ? 'is-on' : '')}${link('browse', 'Browse repositories', active === 'browse' ? 'is-on' : '')}</nav>`;
}

function recent(): string {
  const items = REPOSITORIES.slice(1).flatMap((repository) => repository.maps.slice(0, 1).map((map) => ({ repository, map })));
  return `<main class="prototype-main home-main">${homeTabs('recent')}<div class="page-heading"><h1>Pick up where you left off</h1><p>Pins stay above the repositories you opened most recently.</p></div><section class="home-section" aria-labelledby="pinned-heading"><h2 id="pinned-heading">Pinned</h2><div class="recent-list">${recentMapCard(selectedRepository, selectedMap)}</div></section><section class="home-section" aria-labelledby="recent-heading"><h2 id="recent-heading">Recent</h2><div class="recent-list">${items.map(({ repository, map }) => recentMapCard(repository, map)).join('')}</div></section></main>`;
}

function browse(): string {
  return `<main class="prototype-main home-main">${homeTabs('browse')}<div class="page-heading"><h1>Repositories with maps</h1><p>Sorted by when you last opened them.</p></div><section class="repository-list" aria-label="Repositories">${REPOSITORIES.map((repository) => `<a href="#repository" class="repository-card" data-step="repository"><div><h2>${escapeHtml(repository.name)}</h2><p>${String(repository.maps.length)} map${repository.maps.length === 1 ? '' : 's'} · ${escapeHtml(repository.opened)}</p></div><div class="repo-progress"><span>${String(repository.maps.reduce((total, map) => total + map.next, 0))} next</span><span>${String(repository.maps.reduce((total, map) => total + map.done, 0))} done</span></div><span class="card-arrow">${icon(icons.ARROW)}</span></a>`).join('')}</section></main>`;
}

function repository(): string {
  return `<main class="prototype-main repository-main"><div class="page-heading with-action"><div><h1>${escapeHtml(selectedRepository.name)}</h1><p>${escapeHtml(selectedRepository.opened)}</p></div>${link('browse', 'All repositories', 'text-action')}</div><section class="map-grid" aria-label="Maps in ${escapeHtml(selectedRepository.name)}">${selectedRepository.maps.map((map) => recentMapCard(selectedRepository, map, true)).join('')}</section></main>`;
}

function map(): string {
  return `<main class="prototype-main map-main"><div class="map-head"><div><p class="map-id">Map #${String(selectedMap.number)}</p><h1>${escapeHtml(selectedMap.title)}</h1><p>${escapeHtml(selectedMap.destination)}</p></div>${link('repository', 'All maps', 'text-action')}</div><section class="map-preview" aria-label="Existing map view"><div class="preview-filters"><span class="filter active">All ${String(mapTotal(selectedMap))}</span><span class="filter">Next ${String(selectedMap.next)}</span><span class="filter">Open ${String(selectedMap.open)}</span><span class="filter">Done ${String(selectedMap.done)}</span></div><div class="preview-stage"><span class="preview-node done">#4</span><span class="preview-node next">#8</span><span class="preview-node open">#9</span><div class="preview-line line-one"></div><div class="preview-line line-two"></div></div><aside class="preview-inspector"><strong>Brief</strong><p>Destination</p><b>${escapeHtml(selectedMap.destination)}</b><a href="#repository" data-step="repository">Back to maps</a></aside></section></main>`;
}

function help(): string {
  return `<main class="prototype-main help-main"><div class="page-heading"><h1>How Wayfinder works</h1><p>One short path back to the work.</p></div><ol class="how-list"><li><span>1</span><div><strong>Open a recent repository</strong><p>Or search for any repository or map you have access to.</p></div></li><li><span>2</span><div><strong>Pick a map</strong><p>Each card shows what is open, next, and done before you open it.</p></div></li><li><span>3</span><div><strong>Start a ticket</strong><p>The map view keeps the existing filters, detail panel, and T3 Code hand-off.</p></div></li></ol></main>`;
}

function render(): void {
  const step = prototypeStepFromHash(window.location.hash);
  const content = step === 'recent' ? recent() : step === 'browse' ? browse() : step === 'repository' ? repository() : step === 'map' ? map() : help();
  app.innerHTML = `${rail(step)}<div class="prototype-page">${header(step)}${content}</div>`;
}

window.addEventListener('hashchange', render);
render();
