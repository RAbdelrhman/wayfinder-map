import {
  createMapPrompt,
  desktopHash,
  desktopStateFromHash,
  prototypeHash,
  prototypeStepFromHash,
} from './prototypeRoutes.js';
import type { DesktopState, PrototypeStep } from './prototypeRoutes.js';
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
      ${link('create', `${icon(icons.PLUS)}<span class="sr-only">Start a new map</span>`, `rail-link${step === 'create' ? ' is-on' : ''}`)}
      ${link('desktop', `${icon(icons.PLAY)}<span class="sr-only">Desktop launch states</span>`, `rail-link${step === 'desktop' ? ' is-on' : ''}`)}
      ${link('help', `${icon(icons.INFO)}<span class="sr-only">How to use</span>`, `rail-link${step === 'help' ? ' is-on' : ''}`)}
    </div>
    <div class="rail-bottom"><button class="rail-link" type="button" title="Settings">${icon(icons.SLIDERS)}<span class="sr-only">Settings</span></button><span class="avatar" title="GitHub account settings">R</span></div>
  </nav>`;
}

function header(step: PrototypeStep): string {
  const selected = step === 'recent' ? 'Recent' : step === 'browse' ? 'Browse repositories' : step === 'create' ? 'Start a new map' : step === 'desktop' ? 'Desktop launch states' : step === 'help' ? 'How to use' : selectedRepository.name;
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
  const items = REPOSITORIES.flatMap((repository) => repository.maps.slice(0, 1).map((map) => ({ repository, map })));
  return `<main class="prototype-main home-main">${homeTabs('recent')}<div class="page-heading with-action"><div><h1>Pick up where you left off</h1><p>Recent repositories stay at the top. Choose a map and get back to the work.</p></div>${link('create', `${icon(icons.PLUS)}Start a new map`, 'primary-action')}</div><section class="recent-list" aria-label="Recently opened maps">${items.map(({ repository, map }) => recentMapCard(repository, map)).join('')}</section></main>`;
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

function createMap(): string {
  return `<main class="prototype-main create-main"><div class="page-heading"><p class="eyebrow">T3 Code hand-off</p><h1>What do you want to accomplish?</h1><p>Give T3 the destination. It will ask any follow-up questions and create the map in GitHub.</p></div><form class="create-card" id="create-map-form"><label><span>Repository</span><select id="create-repository" name="repository">${REPOSITORIES.map((repository) => `<option>${escapeHtml(repository.name)}</option>`).join('')}</select></label><label><span>Prompt</span><textarea id="create-prompt" name="prompt" rows="7" placeholder="Describe the outcome you want, the constraints that matter, and anything T3 should know." required></textarea></label><div class="create-actions"><button class="primary-action" type="submit">${icon(icons.PLAY)}Start in T3 Code</button><button class="secondary-action" id="copy-create-prompt" type="button">${icon(icons.COPY)}Copy prompt</button>${link('recent', 'Cancel', 'cancel-action')}</div><p class="create-status" id="create-status" role="status" aria-live="polite"></p></form></main>`;
}

function desktopLink(state: DesktopState, label: string, className = ''): string {
  return `<a href="${desktopHash(state)}" class="${className}">${label}</a>`;
}

function desktopScenario(state: DesktopState, title: string, description: string): string {
  return desktopLink(state, `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span>${icon(icons.ARROW)}`, 'scenario-card');
}

function desktopMenu(): string {
  return `<main class="prototype-main desktop-main"><div class="page-heading"><p class="eyebrow">Clickable flow</p><h1>Desktop launch and recovery states</h1><p>Try the moments the installed app has to handle before the map appears.</p></div><section class="scenario-grid" aria-label="Desktop scenarios"><a href="#recent" class="scenario-card"><strong>Normal launch</strong><span>Start the local server, then open Home.</span>${icon(icons.ARROW)}</a>${desktopScenario('loading', 'Starting up', 'Show progress while the loopback server becomes ready.')}${desktopScenario('restored', 'Second launch or tray restore', 'Focus the existing window on its last page and keep its UI state.')}${desktopScenario('missing-gh', 'GitHub CLI is missing', 'Keep Home visible and explain how to recover.')}${desktopScenario('signed-out', 'GitHub is signed out', 'Offer the gh web sign-in flow without hiding Home.')}${desktopScenario('error', 'Startup failed', 'Show a useful error, retry, and copyable details.')}${desktopScenario('quit-confirm', 'Quit Wayfinder', 'Stop the server and revoke the T3 session explicitly.')}</section></main>`;
}

function trayMenu(): string {
  return `<div class="tray-menu" aria-label="Wayfinder tray menu"><strong>Wayfinder</strong><a href="#map">Open Wayfinder</a><a href="#recent">Home</a><a href="#create">Start a new map</a>${desktopLink('quit-confirm', 'Quit')}</div>`;
}

function desktopStateView(state: DesktopState): string {
  if (state === 'menu') return desktopMenu();

  if (state === 'loading') {
    return `<main class="prototype-main desktop-main state-main"><section class="state-card centered"><div class="loading-mark" aria-hidden="true"></div><p class="eyebrow">Starting Wayfinder</p><h1>Preparing your Home</h1><p>Starting the local server and checking GitHub access. This window stays responsive while Wayfinder gets ready.</p><div class="state-actions"><a href="#recent" class="primary-action">Continue to Home</a>${desktopLink('menu', 'Back to scenarios', 'secondary-action')}</div></section></main>`;
  }

  if (state === 'restored') {
    return `<main class="prototype-main desktop-main state-main"><section class="state-card"><p class="eyebrow">Already running</p><h1>Your existing window was restored</h1><p>Wayfinder returned to Map #3 with the same filters and selection. A second launch focuses this window instead of starting another server.</p><div class="restored-preview"><div><span class="status-dot"></span>Running in the tray</div><strong>Last page</strong><span>RAbdelrhman/wayfinder-map · Map #3</span></div><div class="tray-demo"><p>Tray menu</p>${trayMenu()}</div><div class="state-actions"><a href="#map" class="primary-action">Open restored map</a>${desktopLink('menu', 'Back to scenarios', 'secondary-action')}</div></section></main>`;
  }

  if (state === 'missing-gh') {
    return `<main class="prototype-main desktop-main state-main"><section class="state-card recovery-card"><p class="eyebrow">GitHub needs attention</p><h1>Install GitHub CLI to load your maps</h1><p>Home remains available, but Wayfinder uses <code>gh</code> for GitHub access and cannot discover repositories until it is installed.</p><div class="state-actions"><button class="primary-action" type="button" data-prototype-message="Wayfinder would open the GitHub CLI installation guide in your system browser.">${icon(icons.EXTERNAL)}Open installation guide</button><button class="secondary-action" type="button" data-prototype-message="Wayfinder checked again. GitHub CLI is still missing.">${icon(icons.REFRESH)}Check again</button>${link('recent', 'Continue to Home', 'cancel-action')}</div><p class="desktop-status" id="desktop-status" role="status" aria-live="polite"></p></section></main>`;
  }

  if (state === 'signed-out') {
    return `<main class="prototype-main desktop-main state-main"><section class="state-card recovery-card"><p class="eyebrow">GitHub needs attention</p><h1>Sign in with GitHub CLI</h1><p>Wayfinder found <code>gh</code>, but there is no active account. Sign-in opens GitHub's web flow and returns here when it finishes.</p><div class="state-actions"><button class="primary-action" type="button" data-prototype-message="Wayfinder would run gh auth login --web and show the one-time code here.">${icon(icons.EXTERNAL)}Sign in with GitHub</button><button class="secondary-action" type="button" data-prototype-message="Wayfinder checked again. No active GitHub account was found.">${icon(icons.REFRESH)}Check again</button>${link('recent', 'Continue to Home', 'cancel-action')}</div><p class="desktop-status" id="desktop-status" role="status" aria-live="polite"></p></section></main>`;
  }

  if (state === 'error') {
    return `<main class="prototype-main desktop-main state-main"><section class="state-card recovery-card error-card"><p class="eyebrow">Wayfinder did not start</p><h1>The local server stopped before Home was ready</h1><p>Nothing was published and no second process is running. Retry first; the details below are safe to copy into a bug report.</p><pre class="error-details">Startup stage: server\nCause: The loopback address could not be opened.\nSession cleanup: complete</pre><div class="state-actions">${desktopLink('loading', `${icon(icons.REFRESH)}Retry startup`, 'primary-action')}<button class="secondary-action" type="button" data-copy="Startup stage: server\nCause: The loopback address could not be opened.\nSession cleanup: complete">${icon(icons.COPY)}Copy details</button>${desktopLink('menu', 'Back to scenarios', 'cancel-action')}</div><p class="desktop-status" id="desktop-status" role="status" aria-live="polite"></p></section></main>`;
  }

  if (state === 'quit-confirm') {
    return `<main class="prototype-main desktop-main state-main"><section class="state-card quit-card"><p class="eyebrow">Quit Wayfinder</p><h1>Stop Wayfinder completely?</h1><p>Closing the window only hides it. Quit stops the local server, revokes the T3 session, and removes the tray icon.</p><div class="state-actions">${desktopLink('stopped', 'Quit Wayfinder', 'danger-action')}<a href="#map" class="secondary-action">Cancel</a></div></section></main>`;
  }

  return `<main class="prototype-main desktop-main state-main"><section class="state-card centered"><div class="stopped-mark">W</div><p class="eyebrow">Wayfinder is closed</p><h1>The server and T3 session are stopped</h1><p>Launch Wayfinder again when you are ready. It will create a fresh loopback session and open Home.</p><div class="state-actions">${desktopLink('loading', `${icon(icons.PLAY)}Launch Wayfinder`, 'primary-action')}${desktopLink('menu', 'Back to scenarios', 'secondary-action')}</div></section></main>`;
}

function setupCreateMap(): void {
  const form = document.querySelector<HTMLFormElement>('#create-map-form');
  if (form === null) return;

  const repository = form.querySelector<HTMLSelectElement>('#create-repository');
  const prompt = form.querySelector<HTMLTextAreaElement>('#create-prompt');
  const status = form.querySelector<HTMLElement>('#create-status');
  const copy = form.querySelector<HTMLButtonElement>('#copy-create-prompt');
  if (repository === null || prompt === null || status === null || copy === null) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    status.textContent = 'Prototype: T3 Code would open with this prompt and guide you through creating the map.';
  });

  copy.addEventListener('click', () => {
    if (!form.reportValidity()) return;
    void navigator.clipboard.writeText(createMapPrompt(repository.value, prompt.value)).then(
      () => { status.textContent = 'Prompt copied.'; },
      () => { status.textContent = 'Copy was unavailable. Select the prompt and copy it manually.'; },
    );
  });
}

function setupDesktopActions(): void {
  const status = document.querySelector<HTMLElement>('#desktop-status');

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-prototype-message]')) {
    button.addEventListener('click', () => {
      if (status !== null) status.textContent = button.dataset['prototypeMessage'] ?? '';
    });
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
    button.addEventListener('click', () => {
      void navigator.clipboard.writeText(button.dataset['copy'] ?? '').then(
        () => { if (status !== null) status.textContent = 'Startup details copied.'; },
        () => { if (status !== null) status.textContent = 'Copy was unavailable. Select the details and copy them manually.'; },
      );
    });
  }
}

function render(): void {
  const step = prototypeStepFromHash(window.location.hash);
  const content = step === 'recent' ? recent() : step === 'browse' ? browse() : step === 'repository' ? repository() : step === 'map' ? map() : step === 'create' ? createMap() : step === 'desktop' ? desktopStateView(desktopStateFromHash(window.location.hash)) : help();
  app.innerHTML = `${rail(step)}<div class="prototype-page">${header(step)}${content}</div>`;
  setupCreateMap();
  setupDesktopActions();
}

window.addEventListener('hashchange', render);
render();
