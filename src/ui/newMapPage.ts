import type { HomeState } from '../home.js';
import { draftMapPath, normalizeRepo, scopedApiPath } from '../repoRoutes.js';
import type { ModelCatalog, ModelChoice } from '../models.js';
import { escapeHtml } from './markdown.js';
import { liveChoice, TIER_HINT, TIER_LABEL, tierDefaults, TIERS } from './models.js';
import type { Tier } from './models.js';
import { composerState, consumeNewMapRetryGoal, DEFAULT_NEW_MAP_TIER, initialRepository, NEW_MAP_EXAMPLES, repositoryOptions } from './newMap.js';
import type { WorkspaceView } from './newMap.js';
import { paintIcons, repoIconHtml } from './chrome.js';
import * as icons from './icons.js';
import { icon } from './icons.js';

export interface NewMapPageContext {
  main: HTMLElement;
  homeState: HomeState | null;
  recents: readonly string[];
  catalog: ModelCatalog | null;
  t3Unavailable: string | null;
  getJson<T>(url: string): Promise<T>;
  postJson<T>(url: string, body?: unknown): Promise<T>;
  remember(repo: string): void;
  toast(message: string, ms?: number): void;
}

interface CloneActivity {
  text: string;
  busy: boolean;
  error: boolean;
}

let menuController: AbortController | null = null;

function required<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing ${selector}`);
  return element;
}

function isModelChoice(value: ModelChoice | null): value is ModelChoice {
  return value !== null;
}

function repositoryOptionHtml(repo: string, selected: string | null): string {
  const on = repo.toLowerCase() === selected?.toLowerCase();
  return `<button type="button" class="new-map-option${on ? ' is-selected' : ''}" role="option" aria-selected="${String(on)}" data-repo="${escapeHtml(repo)}">
    ${repoIconHtml(repo, 'sm')}<span class="new-map-option-name">${escapeHtml(repo)}</span>${on ? icon(icons.CHECK) : ''}
  </button>`;
}

function popoverPosition(menu: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(300, Math.max(200, window.innerWidth - 80));
  const left = Math.max(64, Math.min(rect.left, window.innerWidth - width - 12));
  const maxHeight = Math.max(120, Math.min(340, window.innerHeight - 32));
  const below = rect.bottom + 8;
  const top = below + Math.min(200, maxHeight) <= window.innerHeight - 12 ? below : Math.max(8, rect.top - maxHeight - 8);
  menu.style.left = `${String(left)}px`;
  menu.style.top = `${String(top)}px`;
  menu.style.width = `${String(width)}px`;
  menu.style.maxHeight = `${String(maxHeight)}px`;
}

export async function renderNewMapPage(context: NewMapPageContext, repositoryQuery: string | null): Promise<void> {
  menuController?.abort();
  menuController = new AbortController();
  const { signal } = menuController;
  const { main, recents, catalog, t3Unavailable } = context;
  const initialRepo = initialRepository(repositoryQuery);
  const initialGoal = initialRepo === '' ? '' : (consumeNewMapRetryGoal(initialRepo) ?? '');
  const knownRepos = Array.from(
    new Set([...(context.homeState?.repositories ?? []), ...(initialRepo === '' ? [] : [initialRepo])]),
  );
  let repo: string | null = initialRepo === '' ? null : initialRepo;
  let tier: Tier = DEFAULT_NEW_MAP_TIER;
  let workspace: WorkspaceView | 'loading' | null = repo === null ? null : 'loading';
  let cloneOpen = false;
  let cloneRequest = 0;
  let busy = false;
  let openMenu: 'repository' | 'model' | null = null;
  let mapNotice: string | null = null;
  const cloneActivity = new Map<string, CloneActivity>();

  main.innerHTML = `<div class="sheet"><div class="new-map-stage">
    <h1>What do you want to get done?</h1>
    <div class="new-map-composer">
      <label class="new-map-visually-hidden" for="new-map-goal">Goal</label>
      <textarea id="new-map-goal" aria-label="Goal" placeholder="Describe a goal. T3 Code interviews you about it, then drafts the map.">${escapeHtml(initialGoal)}</textarea>
      <div class="new-map-toolbar">
        <div class="new-map-control new-map-repo-control">
          <button type="button" class="new-map-chip" id="repo-chip" aria-haspopup="listbox" aria-expanded="false" aria-controls="repo-options"></button>
          <div class="new-map-popover new-map-repo-popover" id="repo-menu" hidden>
            <label class="new-map-visually-hidden" for="repo-search">Search repositories</label>
            <input class="input new-map-search" id="repo-search" type="search" placeholder="Search repositories" autocomplete="off" spellcheck="false" />
            <div class="new-map-options" id="repo-options" role="listbox" aria-label="Repositories"></div>
          </div>
        </div>
        <button type="button" class="new-map-chip new-map-clone-chip" id="clone-chip" aria-controls="map-clone" aria-expanded="false" hidden></button>
        <div class="new-map-control new-map-model-control">
          <button type="button" class="new-map-chip is-quiet" id="model-chip" aria-haspopup="listbox" aria-expanded="false" aria-controls="model-menu"></button>
          <div class="new-map-popover new-map-model-popover" id="model-menu" role="listbox" aria-label="Model tier" hidden></div>
        </div>
        <span class="new-map-toolbar-spacer"></span>
        <button type="button" class="ghost new-map-action" id="map-copy-btn" disabled>${icon(icons.COPY)}Copy prompt</button>
        <button type="button" class="primary new-map-action" id="map-start-btn" disabled aria-describedby="map-note">Start map${icon(icons.ARROW)}</button>
      </div>
      <p class="new-map-intent" id="map-note" role="status" aria-live="polite" hidden></p>
    </div>
    <div class="new-map-clone-panel" id="map-clone" hidden></div>
    <div class="new-map-visually-hidden" id="clone-announcement" role="status" aria-live="polite" aria-atomic="true"></div>
    <section class="new-map-examples" aria-labelledby="new-map-examples-title">
      <h2 id="new-map-examples-title">Try a goal</h2>
      ${NEW_MAP_EXAMPLES.map((example) => `<button type="button" class="new-map-example" data-example="${escapeHtml(example)}">${icon(icons.GRAPH)}<span>${escapeHtml(example)}</span></button>`).join('')}
    </section>
  </div></div>`;
  paintIcons(main);

  const goal = required<HTMLTextAreaElement>(main, '#new-map-goal');
  const repoChip = required<HTMLButtonElement>(main, '#repo-chip');
  const repoMenu = required<HTMLDivElement>(main, '#repo-menu');
  const repoSearch = required<HTMLInputElement>(main, '#repo-search');
  const repoOptions = required<HTMLDivElement>(main, '#repo-options');
  const cloneChip = required<HTMLButtonElement>(main, '#clone-chip');
  const clonePanel = required<HTMLDivElement>(main, '#map-clone');
  const cloneAnnouncement = required<HTMLDivElement>(main, '#clone-announcement');
  const modelChip = required<HTMLButtonElement>(main, '#model-chip');
  const modelMenu = required<HTMLDivElement>(main, '#model-menu');
  const mapNote = required<HTMLParagraphElement>(main, '#map-note');
  const startButton = required<HTMLButtonElement>(main, '#map-start-btn');
  const copyButton = required<HTMLButtonElement>(main, '#map-copy-btn');

  function selectedModel(): ModelChoice | null {
    return catalog === null ? null : liveChoice(catalog, tierDefaults()[tier]);
  }

  function visibleRepoOptions(): string[] {
    const options = repositoryOptions(repoSearch.value, recents, knownRepos);
    const typed = normalizeRepo(repoSearch.value);
    if (typed !== null && !options.some((candidate) => candidate.toLowerCase() === typed.toLowerCase())) options.unshift(typed);
    return options;
  }

  function renderRepoOptions(): void {
    const options = visibleRepoOptions();
    const clearOption = repo !== null
      ? `<button type="button" class="new-map-option new-map-clear-option" role="option" aria-selected="false" data-clear-repo="true">${icon(icons.MINUS)}<span class="new-map-option-name">Clear repository</span></button>`
      : '';
    repoOptions.innerHTML = options.length === 0
      ? `${clearOption}<p class="new-map-empty">No repositories found.</p>`
      : `${clearOption}${options.map((candidate) => repositoryOptionHtml(candidate, repo)).join('')}`;
    paintIcons(repoOptions);
  }

  function renderModelOptions(): void {
    modelMenu.innerHTML = TIERS.map((candidate) => {
      const on = candidate === tier;
      return `<button type="button" class="new-map-tier-option${on ? ' is-selected' : ''}" role="option" aria-selected="${String(on)}" data-tier="${candidate}">
        <span class="new-map-tier-name">${TIER_LABEL[candidate]}</span><span class="new-map-tier-hint">${escapeHtml(TIER_HINT[candidate])}</span>${on ? icon(icons.CHECK) : ''}
      </button>`;
    }).join('');
    paintIcons(modelMenu);
  }

  function announceClone(message: string): void {
    cloneAnnouncement.textContent = message;
  }

  function renderRepositoryChip(): void {
    repoChip.innerHTML = repo === null
      ? `${icon(icons.REPO)}<span>Choose a repository</span>${icon(icons.CHEVRON)}`
      : `${repoIconHtml(repo, 'sm')}<span class="new-map-chip-label">${escapeHtml(repo)}</span>${icon(icons.CHEVRON)}`;
    repoChip.setAttribute('aria-label', repo === null ? 'Choose a repository' : `Repository ${repo}`);
    paintIcons(repoChip);
  }

  function renderModelChip(): void {
    modelChip.innerHTML = `${icon(icons.SLIDERS)}<span>${TIER_LABEL[tier]}</span>${icon(icons.CHEVRON)}`;
    modelChip.setAttribute('aria-label', `Model tier, ${TIER_LABEL[tier]}`);
  }

  function renderClonePanel(): void {
    const activity = repo === null ? undefined : cloneActivity.get(repo);
    const busyActivity = activity?.busy === true;
    const activityLine = activity === undefined
      ? ''
      : `<p class="new-map-clone-message${activity.error ? ' is-error' : ''}" role="status" aria-live="polite"${activity.busy ? ' aria-busy="true"' : ''}>${activity.busy ? '<span class="new-map-spinner" aria-hidden="true"></span>' : ''}${escapeHtml(activity.text)}</p>`;
    const disabled = busyActivity ? ' disabled' : '';
    let controls = '';

    if (repo === null) {
      clonePanel.hidden = true;
      clonePanel.innerHTML = '';
      return;
    }

    if (workspace === 'loading') {
      controls = `<p class="new-map-clone-copy"><span class="new-map-spinner" aria-hidden="true"></span>Finding a clone…</p>`;
    } else if (workspace === null) {
      controls = `<p class="new-map-clone-copy">Wayfinder could not check for a local clone.</p><button type="button" class="ghost" data-retry-clone${disabled}>${icon(icons.REFRESH)}Try again</button>`;
    } else if (workspace.status === 'ready') {
      controls = `<p class="new-map-clone-copy">A local clone is ready for T3 Code.</p><button type="button" class="ghost" data-choose-clone${disabled}>${icon(icons.FOLDER)}Choose a different clone</button>`;
    } else {
      const candidates = workspace.candidates.length === 0
        ? ''
        : `<div class="new-map-clone-choice"><label class="new-map-visually-hidden" for="map-clone-path">Local clone</label><select class="select" id="map-clone-path" aria-label="Local clone">${workspace.candidates.map((path) => `<option value="${escapeHtml(path)}">${escapeHtml(path)}</option>`).join('')}</select><button type="button" class="primary" data-use-clone${disabled}>Use this clone</button></div>`;
      const choose = workspace.canChoose
        ? `<button type="button" class="${workspace.candidates.length === 0 ? 'primary' : 'ghost'}" data-choose-clone${disabled}>${icon(icons.FOLDER)}Choose local clone</button>`
        : '';
      const clone = workspace.canChoose && workspace.candidates.length === 0
        ? `<button type="button" class="ghost" data-clone-repository${disabled}>${icon(icons.FOLDER)}Clone it for me</button>`
        : '';
      const help = workspace.candidates.length === 0 && !workspace.canChoose
        ? '<p class="new-map-clone-copy">Run Wayfinder inside a clone, or choose a folder in the desktop app.</p>'
        : '';
      controls = `${help}${candidates}<div class="new-map-clone-actions">${choose}${clone}</div>`;
    }

    const markup = `${activityLine}<div class="new-map-clone-controls">${controls}</div>`;
    if (clonePanel.innerHTML !== markup) {
      clonePanel.innerHTML = markup;
      paintIcons(clonePanel);
    }
    clonePanel.hidden = !cloneOpen;
  }

  function sync(): void {
    renderRepositoryChip();
    renderModelChip();
    const state = composerState({ repo, goal: goal.value, workspace, t3Unavailable });
    const notice = mapNotice ?? state.reason;
    mapNote.hidden = notice === null;
    mapNote.textContent = notice ?? '';
    startButton.disabled = busy || !state.canStart;
    copyButton.disabled = busy || !state.canCopy;

    cloneChip.hidden = repo === null;
    if (repo === null) {
      cloneChip.innerHTML = '';
      clonePanel.hidden = true;
      clonePanel.innerHTML = '';
      return;
    }
    const activity = cloneActivity.get(repo);
    const cloneBusy = activity?.busy === true;
    if (workspace === 'loading' || cloneBusy) {
      cloneChip.className = 'new-map-chip new-map-clone-chip';
      cloneChip.innerHTML = `<span class="new-map-spinner" aria-hidden="true"></span><span>Finding clone…</span>`;
    } else if (workspace?.status === 'ready') {
      cloneChip.className = 'new-map-chip new-map-clone-chip is-ready';
      cloneChip.innerHTML = `${icon(icons.CHECK)}<span>Local clone</span>${icon(icons.CHEVRON)}`;
    } else if (workspace === null) {
      cloneChip.className = 'new-map-chip new-map-clone-chip is-warning';
      cloneChip.innerHTML = `${icon(icons.INFO)}<span>Clone unavailable</span>${icon(icons.CHEVRON)}`;
    } else {
      const label = workspace.candidates.length > 0 ? 'Choose a clone' : 'No local clone';
      cloneChip.className = 'new-map-chip new-map-clone-chip is-warning';
      cloneChip.innerHTML = `${icon(icons.INFO)}<span>${label}</span>${icon(icons.CHEVRON)}`;
    }
    cloneChip.setAttribute('aria-expanded', String(cloneOpen));
    const cloneReady = workspace !== null && workspace !== 'loading' && workspace.status === 'ready';
    cloneChip.setAttribute('aria-label', `${cloneReady ? 'Local clone ready' : 'Clone options'}${cloneOpen ? ', expanded' : ''}`);
    paintIcons(cloneChip);
    renderClonePanel();
  }

  function closeMenu(restoreFocus = false): void {
    const previous = openMenu;
    openMenu = null;
    repoMenu.hidden = true;
    modelMenu.hidden = true;
    repoChip.setAttribute('aria-expanded', 'false');
    modelChip.setAttribute('aria-expanded', 'false');
    if (restoreFocus) (previous === 'model' ? modelChip : repoChip).focus();
  }

  function positionOpenMenu(): void {
    if (openMenu === 'repository') popoverPosition(repoMenu, repoChip);
    if (openMenu === 'model') popoverPosition(modelMenu, modelChip);
  }

  function openRepositoryMenu(): void {
    closeMenu();
    openMenu = 'repository';
    repoChip.setAttribute('aria-expanded', 'true');
    repoMenu.hidden = false;
    repoSearch.value = '';
    renderRepoOptions();
    positionOpenMenu();
    repoSearch.focus();
  }

  function openModelMenu(): void {
    closeMenu();
    openMenu = 'model';
    modelChip.setAttribute('aria-expanded', 'true');
    modelMenu.hidden = false;
    renderModelOptions();
    positionOpenMenu();
    modelMenu.querySelector<HTMLButtonElement>(`[data-tier="${tier}"]`)?.focus();
  }

  function selectRepository(value: string | null): void {
    const next = value === null ? null : normalizeRepo(value);
    if (next === repo) {
      closeMenu();
      goal.focus();
      return;
    }
    repo = next;
    if (next !== null && !knownRepos.some((candidate) => candidate.toLowerCase() === next.toLowerCase())) knownRepos.unshift(next);
    mapNotice = null;
    cloneOpen = false;
    workspace = repo === null ? null : 'loading';
    if (repo !== null) context.remember(repo);
    closeMenu();
    sync();
    if (repo !== null) void loadWorkspace();
    goal.focus();
  }

  async function loadWorkspace(): Promise<void> {
    const request = (cloneRequest += 1);
    const requestedRepo = repo;
    if (requestedRepo === null) return;
    workspace = 'loading';
    cloneOpen = false;
    mapNotice = null;
    sync();
    try {
      const result = await context.getJson<WorkspaceView>(scopedApiPath(requestedRepo, 'workspace'));
      if (request !== cloneRequest || repo !== requestedRepo) return;
      workspace = result;
      cloneOpen = result.status === 'choose';
      if (result.status === 'ready') announceClone('A local clone is ready for T3 Code.');
      else if (result.candidates.length > 1) announceClone(`${String(result.candidates.length)} local clones found. Choose one to continue.`);
      else announceClone('No local clone is ready. Choose a folder or clone the repository.');
    } catch {
      if (request !== cloneRequest || repo !== requestedRepo) return;
      workspace = null;
      cloneOpen = true;
      announceClone('Could not check for a local clone. Try again.');
    }
    sync();
  }

  async function setClone(body: { choose: true } | { path: string }): Promise<void> {
    const requestedRepo = repo;
    if (requestedRepo === null) return;
    cloneActivity.set(requestedRepo, { text: 'choose' in body ? 'Choose a local clone…' : 'Checking the selected clone…', busy: true, error: false });
    sync();
    try {
      const response = await fetch(scopedApiPath(requestedRepo, 'workspace'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as Partial<WorkspaceView> & { error?: string; cancelled?: boolean };
      if (requestedRepo !== repo) return;
      if (result.status !== undefined) workspace = result as WorkspaceView;
      if (result.cancelled === true) {
        cloneActivity.delete(requestedRepo);
        announceClone('Clone selection canceled.');
      } else if (!response.ok || result.error !== undefined) {
        const message = result.error ?? 'Could not select that clone. Try again.';
        cloneActivity.set(requestedRepo, { text: message, busy: false, error: true });
        announceClone(message);
      } else if (result.status === 'ready') {
        cloneActivity.delete(requestedRepo);
        cloneOpen = false;
        announceClone('The local clone is ready for T3 Code.');
      } else {
        cloneActivity.delete(requestedRepo);
        workspace = result as WorkspaceView;
        cloneOpen = true;
        announceClone('Choose a local clone before starting.');
      }
    } catch {
      const message = 'Could not select that clone. Check Wayfinder and try again.';
      cloneActivity.set(requestedRepo, { text: message, busy: false, error: true });
      announceClone(message);
    }
    sync();
  }

  async function cloneRepository(): Promise<void> {
    const requestedRepo = repo;
    if (requestedRepo === null || cloneActivity.get(requestedRepo)?.busy) return;
    cloneActivity.set(requestedRepo, { text: 'Choose an empty folder for the clone…', busy: true, error: false });
    sync();
    try {
      const picked = await fetch(scopedApiPath(requestedRepo, 'workspace'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cloneTarget: true }),
      });
      const folder = (await picked.json()) as { target?: unknown; cancelled?: boolean; error?: string };
      if (!picked.ok || folder.error !== undefined) throw new Error(folder.error ?? 'Could not open the folder picker.');
      if (folder.cancelled === true) {
        cloneActivity.delete(requestedRepo);
        if (repo === requestedRepo) sync();
        return;
      }
      if (typeof folder.target !== 'string' || folder.target.trim() === '') throw new Error('Choose a folder for the clone, then try again.');

      cloneActivity.set(requestedRepo, { text: `Cloning ${requestedRepo}…`, busy: true, error: false });
      if (repo === requestedRepo) sync();
      const response = await fetch(scopedApiPath(requestedRepo, 'clone'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target: folder.target }),
      });
      const result = (await response.json()) as Partial<WorkspaceView> & { error?: string };
      if (repo !== requestedRepo) return;
      if (result.status !== undefined) workspace = result as WorkspaceView;
      if (!response.ok || result.error !== undefined) throw new Error(result.error ?? `Could not clone ${requestedRepo}. Try again.`);
      cloneActivity.delete(requestedRepo);
      cloneOpen = false;
      announceClone('The repository clone is ready for T3 Code.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not finish the clone. Check Wayfinder and try again.';
      cloneActivity.set(requestedRepo, { text: message, busy: false, error: true });
      announceClone(message);
    }
    if (repo === requestedRepo) sync();
  }

  function optionButtons(menu: HTMLElement): HTMLButtonElement[] {
    return Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="option"]'));
  }

  function handleOptionKeys(menu: HTMLElement, event: KeyboardEvent): void {
    const options = optionButtons(menu);
    const active = document.activeElement;
    const index = options.findIndex((option) => option === active);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = index < 0 ? 0 : (index + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length;
      options[next]?.focus();
    } else if (event.key === 'Home' && options.length > 0) {
      event.preventDefault();
      options[0]?.focus();
    } else if (event.key === 'End' && options.length > 0) {
      event.preventDefault();
      options[options.length - 1]?.focus();
    } else if (event.key === 'Enter' && active instanceof HTMLButtonElement && active.getAttribute('role') === 'option') {
      event.preventDefault();
      active.click();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
    }
  }

  repoChip.addEventListener('click', openRepositoryMenu);
  modelChip.addEventListener('click', openModelMenu);
  repoSearch.addEventListener('input', renderRepoOptions);
  repoSearch.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      optionButtons(repoOptions)[0]?.focus();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      optionButtons(repoOptions)[0]?.click();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
    }
  });
  repoOptions.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[role="option"]');
    if (target === null) return;
    selectRepository(target.dataset['clearRepo'] === 'true' ? null : target.dataset['repo'] ?? null);
  });
  repoOptions.addEventListener('keydown', (event) => handleOptionKeys(repoOptions, event));
  modelMenu.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-tier]');
    const selected = target?.dataset['tier'];
    if (selected === undefined || !TIERS.includes(selected as Tier)) return;
    tier = selected as Tier;
    renderModelChip();
    closeMenu(true);
    sync();
  });
  modelMenu.addEventListener('keydown', (event) => handleOptionKeys(modelMenu, event));
  cloneChip.addEventListener('click', () => {
    cloneOpen = !cloneOpen;
    cloneChip.setAttribute('aria-expanded', String(cloneOpen));
    renderClonePanel();
  });
  clonePanel.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-choose-clone]') !== null) void setClone({ choose: true });
    else if (target.closest('[data-retry-clone]') !== null) void loadWorkspace();
    else if (target.closest('[data-clone-repository]') !== null) void cloneRepository();
    else if (target.closest('[data-use-clone]') !== null) {
      const select = clonePanel.querySelector<HTMLSelectElement>('#map-clone-path');
      if (select?.value) void setClone({ path: select.value });
    }
  });
  clonePanel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && cloneOpen) {
      cloneOpen = false;
      cloneChip.setAttribute('aria-expanded', 'false');
      renderClonePanel();
      cloneChip.focus();
    }
  });
  main.querySelectorAll<HTMLButtonElement>('[data-example]').forEach((button) => {
    button.addEventListener('click', () => {
      goal.value = button.dataset['example'] ?? '';
      mapNotice = null;
      sync();
      goal.focus();
    });
  });
  goal.addEventListener('input', () => {
    mapNotice = null;
    sync();
  });
  goal.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !startButton.disabled) {
      event.preventDefault();
      startButton.click();
    }
  });
  startButton.addEventListener('click', async () => {
    const selectedRepo = repo;
    const text = goal.value.trim();
    if (selectedRepo === null || text === '') return;
    closeMenu();
    busy = true;
    mapNotice = null;
    startButton.textContent = 'Starting…';
    startButton.setAttribute('aria-busy', 'true');
    sync();
    startButton.disabled = true;
    try {
      const model = selectedModel();
      const result = await context.postJson<{
        rung: 'thread' | 'app' | 'clipboard' | null;
        copied: boolean;
        notice: string | null;
        error: string | null;
        handOffId: string | null;
        trackingWarning?: string;
      }>(scopedApiPath(selectedRepo, 'new-map'), {
        goal: text,
        tier,
        ...(isModelChoice(model) ? { model } : {}),
      });
      if (result.handOffId !== null) {
        window.location.assign(draftMapPath(selectedRepo, result.handOffId));
        return;
      }
      mapNotice = result.rung === 'thread'
        ? result.trackingWarning ?? 'The planning thread started, but Wayfinder could not save its route.'
        : [result.notice, result.copied ? 'The prompt is on the clipboard.' : result.error].filter(Boolean).join(' ') || 'The planning thread did not start. Copy the prompt or try again.';
      context.toast(mapNotice, 9000);
    } catch (error) {
      mapNotice = error instanceof Error ? error.message : 'Could not start the planning thread.';
      context.toast(mapNotice, 9000);
      void loadWorkspace();
    } finally {
      busy = false;
      startButton.textContent = 'Start map';
      startButton.removeAttribute('aria-busy');
      sync();
    }
  });
  copyButton.addEventListener('click', async () => {
    const selectedRepo = repo;
    const text = goal.value.trim();
    if (selectedRepo === null || text === '') return;
    try {
      const model = selectedModel();
      const result = await context.postJson<{ prompt: string; copied: boolean }>(scopedApiPath(selectedRepo, 'new-map'), {
        goal: text,
        copyOnly: true,
        tier,
        ...(isModelChoice(model) ? { model } : {}),
      });
      if (!result.copied) await navigator.clipboard.writeText(result.prompt);
      context.toast('Copied the prompt. Paste it into T3 Code.');
    } catch (error) {
      context.toast(error instanceof Error ? error.message : 'Could not copy the prompt.', 9000);
    }
  });

  document.addEventListener('pointerdown', (event) => {
    if (openMenu === null || !(event.target instanceof Node)) return;
    const inRepo = repoMenu.contains(event.target) || repoChip.contains(event.target);
    const inModel = modelMenu.contains(event.target) || modelChip.contains(event.target);
    if (!inRepo && !inModel) closeMenu();
  }, { capture: true, signal });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && openMenu !== null) {
      event.preventDefault();
      closeMenu(true);
    }
  }, { signal });
  const reposition = (): void => positionOpenMenu();
  window.addEventListener('resize', reposition, { signal });
  window.addEventListener('scroll', reposition, { capture: true, signal });

  renderRepoOptions();
  renderModelChip();
  sync();
  if (repo !== null) void loadWorkspace();
  goal.focus();
}
