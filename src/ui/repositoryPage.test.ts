// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MapSnapshot, SettleReason, Ticket, WayfinderMap } from '../types.js';
import { mountRepositoryPage } from './repositoryPage.js';
import type { RepositoryPageDeps, ToastAction } from './repositoryPage.js';
import { setTrustedHtml } from './trustedHtml.js';

function ticket(number: number, state: Ticket['state']): Ticket {
  return { number, title: `Ticket ${String(number)}`, url: '', body: '', type: 'task', labels: [], open: state !== 'done', assignee: null, blockedBy: [], openBlockers: [], state, updatedAt: null };
}

function map(number: number, title: string, settled: { reason: SettleReason; since: string } | null = null): WayfinderMap {
  return {
    number,
    title,
    url: `https://github.com/octo/wayfinder/issues/${String(number)}`,
    body: '',
    open: true,
    author: 'ramon',
    visibility: 'private',
    sections: { destination: `Reach ${title}`, notes: '', decisions: '', fog: '', outOfScope: '' },
    tickets: settled === null ? [ticket(number * 10, 'done'), ticket(number * 10 + 1, 'frontier')] : [],
    outside: [],
    criticalPath: { tickets: [], remaining: 0 },
    stalled: [],
    pullRequests: [],
    settled,
    ticketsLoaded: settled === null,
  };
}

function snapshot(maps: WayfinderMap[]): MapSnapshot {
  return { repo: 'octo/wayfinder', fetchedAt: '2026-10-15T12:00:00.000Z', maps, hiddenMaps: 0, publicMaps: [], warnings: [] };
}

/** The server's answer to a choice: the map moves in or out of the archive, the rest stay as they are. */
function choose(current: MapSnapshot, mapNumber: number, archived: boolean): MapSnapshot {
  return {
    ...current,
    maps: current.maps.map((candidate) =>
      candidate.number !== mapNumber ? candidate : archived ? { ...candidate, settled: { reason: 'manual', since: '2026-10-16T09:00:00.000Z' } } : { ...map(candidate.number, candidate.title), settled: null },
    ),
  };
}

interface Harness {
  root: HTMLElement;
  deps: RepositoryPageDeps;
  toasts: Array<{ message: string; action?: ToastAction }>;
  views: string[];
  saves: Array<[number, boolean]>;
  page: ReturnType<typeof mountRepositoryPage>;
}

function mount(initial: MapSnapshot, overrides: Partial<RepositoryPageDeps> = {}, view: 'active' | 'archived' = 'active'): Harness {
  const root = document.createElement('main');
  document.body.append(root);
  let server = initial;
  const harness = { root, toasts: [], views: [], saves: [] } as unknown as Harness;
  harness.deps = {
    root,
    repo: 'octo/wayfinder',
    paint: (html) => setTrustedHtml(root, html),
    saveArchive: (mapNumber, archived) => {
      harness.saves.push([mapNumber, archived]);
      server = choose(server, mapNumber, archived);
      return Promise.resolve(server);
    },
    readMap: (mapNumber) => Promise.resolve({ ...server, maps: server.maps.map((candidate) => (candidate.number === mapNumber ? { ...candidate, tickets: [ticket(1, 'done'), ticket(2, 'done')], ticketsLoaded: true } : candidate)) }),
    toast: (message, action) => harness.toasts.push({ message, ...(action === undefined ? {} : { action }) }),
    adopted: () => undefined,
    viewChanged: (next) => harness.views.push(next),
    handOffs: () => [],
    autoMap: () => false,
    login: () => 'ramon',
    now: () => Date.parse('2026-10-16T12:00:00.000Z'),
    ...overrides,
  };
  harness.page = mountRepositoryPage(harness.deps, view);
  harness.page.show(initial);
  return harness;
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

const options = (root: HTMLElement): number[] => [...root.querySelectorAll<HTMLElement>('[role="option"]')].map((element) => Number(element.dataset['selectMap']));
const selected = (root: HTMLElement): number => Number(root.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')?.dataset['selectMap']);
const click = (root: HTMLElement, selector: string): void => {
  const element = root.querySelector<HTMLElement>(selector);
  if (element === null) throw new Error(`Nothing matches ${selector}`);
  element.click();
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('repository page archive journey', () => {
  const maps = (): MapSnapshot => snapshot([
    map(30, 'Alpha'),
    map(20, 'Beta'),
    map(10, 'Gamma'),
    map(5, 'Old', { reason: 'closed', since: '2026-10-10T00:00:00.000Z' }),
  ]);

  it('selects a block without opening it, and opens only from the preview', () => {
    const { root } = mount(maps());
    expect(options(root)).toEqual([30, 20, 10]);
    expect(selected(root)).toBe(30);

    click(root, '[data-select-map="20"] .maps-destination');
    expect(selected(root)).toBe(20);
    expect(document.activeElement?.id).toBe('maps-opt-20');
    expect(root.querySelector('.maps-preview')?.getAttribute('href')).toBe('/repos/octo/wayfinder/maps/20');
    // One link opens the map: the preview, not the blocks.
    expect(root.querySelectorAll('a[href="/repos/octo/wayfinder/maps/20"]')).toHaveLength(1);
  });

  it('archives a map, selects the next one, and finds it in Archived maps', async () => {
    const harness = mount(maps());
    const { root } = harness;
    click(root, '[data-select-map="20"]');
    click(root, '[data-archive-map="20"]');
    expect(root.querySelector('[data-archive-map="20"]')?.getAttribute('aria-busy')).toBe('true');
    await flush();

    expect(harness.saves).toEqual([[20, true]]);
    expect(options(root)).toEqual([30, 10]);
    expect(selected(root)).toBe(10);
    expect(document.activeElement?.id).toBe('maps-opt-10');
    expect(root.textContent).toContain('2 maps · 1 by you, 1 closed');
    expect(harness.toasts.at(-1)?.message).toBe('Archived #20. GitHub is unchanged.');

    harness.toasts.at(-1)?.action?.run();
    expect(harness.views).toEqual(['archived']);
    expect(root.querySelector('h1')?.textContent).toBe('Archived maps');
    expect(options(root)).toEqual([20, 5]);
    expect(selected(root)).toBe(20);
    expect(root.querySelector('#maps-reason-20')?.textContent).toBe('Archived by you');
    expect(root.querySelector('.maps-preview')?.getAttribute('aria-label')).toBe('Open map #20: Beta. It stays archived.');
  });

  it('restores an archived map to the active list and shows it there', async () => {
    const harness = mount(maps(), {}, 'archived');
    const { root } = harness;
    expect(options(root)).toEqual([5]);
    click(root, '[data-restore-map="5"]');
    await flush();

    expect(harness.saves).toEqual([[5, false]]);
    expect(root.querySelector('.archive-empty h2')?.textContent).toBe('No archived maps');
    expect(harness.toasts.at(-1)?.message).toBe('Restored #5. It stays active until you archive it again.');

    harness.toasts.at(-1)?.action?.run();
    expect(harness.views).toEqual(['active']);
    expect(options(root)).toEqual([30, 20, 10, 5]);
    expect(selected(root)).toBe(5);
  });

  it('reads an archived map\'s tickets for its preview, keeping a choice made meanwhile', async () => {
    const harness = mount(maps(), {}, 'archived');
    await flush();
    expect(harness.root.querySelector('.maps-detail-graph')?.classList.contains('is-loading')).toBe(false);
    expect(harness.root.querySelector('.maps-detail-graph .mini-graph')).not.toBeNull();
    expect(harness.root.textContent).toContain('2 done');
    expect(harness.page.snapshot()?.maps.find((candidate) => candidate.number === 5)?.settled?.reason).toBe('closed');
  });

  it('shows a preview read failure and retries after refreshing the list', async () => {
    let fail = true;
    const readMap = vi.fn(() => fail
      ? Promise.reject(new TypeError('Failed to fetch'))
      : Promise.resolve(snapshot([map(5, 'Old', { reason: 'closed', since: '2026-10-10T00:00:00.000Z' })]).maps.map((candidate) => ({ ...candidate, ticketsLoaded: true }))).then((maps) => snapshot(maps)));
    const harness = mount(maps(), { readMap }, 'archived');
    await flush();
    expect(harness.root.querySelector('[data-repo-stale]')).not.toBeNull();
    expect(readMap).toHaveBeenCalledTimes(1);
    fail = false;
    harness.page.show(maps());
    await flush();
    expect(readMap).toHaveBeenCalledTimes(2);
    expect(harness.root.querySelector('.maps-detail-graph.is-loading')).toBeNull();
    // A later list response can omit archived tickets again; it must reload them.
    harness.page.show(maps());
    await flush();
    expect(readMap).toHaveBeenCalledTimes(3);
    expect(harness.root.querySelector('.maps-detail-graph.is-loading')).toBeNull();
  });

  it('keeps the map where it was and offers Try again when a save fails', async () => {
    let fail = true;
    const harness = mount(maps(), {
      saveArchive: (mapNumber, archived) => {
        if (fail) return Promise.reject(new Error('Could not save this choice: ~/.wayfinder-map/settled.json can\'t be read.'));
        harness.saves.push([mapNumber, archived]);
        return Promise.resolve(choose(maps(), mapNumber, archived));
      },
    });
    const { root } = harness;
    click(root, '[data-archive-map="30"]');
    await flush();

    expect(options(root)).toEqual([30, 20, 10]);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain("Couldn't archive #30. It's still in your active maps.");
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('settled.json can\'t be read.');
    expect(document.activeElement?.hasAttribute('data-archive-retry')).toBe(true);

    fail = false;
    click(root, '[data-archive-retry]');
    await flush();
    expect(harness.saves).toEqual([[30, true]]);
    expect(options(root)).toEqual([20, 10]);
    expect(root.querySelector('[role="alert"]')).toBeNull();
  });

  it('says the request never reached the app in the approved words', async () => {
    const harness = mount(maps(), { saveArchive: () => Promise.reject(new TypeError('Failed to fetch')) });
    click(harness.root, '[data-archive-map="30"]');
    await flush();
    expect(harness.root.querySelector('[role="alert"]')?.textContent).toContain("Your archive choices couldn't be saved on this computer.");
  });

  it('shows the stale banner after a failed refresh and clears it on the next good read', () => {
    const harness = mount(maps());
    harness.page.markStale();
    expect(harness.root.querySelector('[data-repo-stale]')?.textContent).toContain("Couldn't refresh from GitHub.");
    harness.page.show(maps());
    expect(harness.root.querySelector('[data-repo-stale]')).toBeNull();
  });

  it('filters each list on its own, keeping the preview on a visible map or clearing it', () => {
    const { root } = mount(maps());
    click(root, '[data-select-map="10"]');
    const search = root.querySelector<HTMLInputElement>('#repo-map-search');
    if (search === null) throw new Error('no search');
    search.value = 'beta';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(options(root)).toEqual([20]);
    expect(selected(root)).toBe(20);
    expect(document.activeElement?.id).toBe('repo-map-search');

    const again = root.querySelector<HTMLInputElement>('#repo-map-search');
    if (again === null) throw new Error('no search');
    again.value = 'nothing';
    again.dispatchEvent(new Event('input', { bubbles: true }));
    expect(root.querySelector('.maps-preview')).toBeNull();
    expect(root.textContent).toContain('No active maps match “nothing”.');
  });

  it('keeps the active and archived selections apart', () => {
    const { root } = mount(snapshot([map(30, 'Alpha'), map(20, 'Beta'), map(6, 'Six', { reason: 'manual', since: '2026-10-11T00:00:00.000Z' }), map(5, 'Old', { reason: 'closed', since: '2026-10-10T00:00:00.000Z' })]));
    click(root, '[data-select-map="20"]');
    click(root, '[data-repo-view="archived"]');
    expect(selected(root)).toBe(6);
    click(root, '[data-select-map="5"]');
    click(root, '[data-repo-view="active"]');
    expect(selected(root)).toBe(20);
    click(root, '[data-repo-view="archived"]');
    expect(selected(root)).toBe(5);
  });

  it('browses with the arrow keys and opens with Enter', () => {
    const { root } = mount(maps());
    const opened = vi.fn((event: Event) => event.preventDefault());
    root.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('.maps-preview') !== null) opened(event);
    });
    root.querySelector<HTMLElement>('#maps-opt-30')?.focus();
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(selected(root)).toBe(20);
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(selected(root)).toBe(10);
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(opened).toHaveBeenCalledTimes(1);
  });
});
