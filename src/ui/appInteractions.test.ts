import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ModelCatalog, ModelChoice } from '../models.js';
import { parseRepoPagePath } from '../repoRoutes.js';
import { STATE_STYLE } from './chrome.js';
import { rememberControlFocus } from './controlFocus.js';
import { effortSelectHtml, findModel, liveChoice, modelSelectHtml, readChoice } from './models.js';
import { escapeHtml } from './markdown.js';
import { setTrustedHtml, insertTrustedHtml } from './trustedHtml.js';

const source = readFileSync(new URL('./app.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('app.ts', source, ts.ScriptTarget.Latest, true);

/** Execute the production functions and listener registrations without booting unrelated services. */
function bindings(context: Record<string, unknown>, names: string[], listeners: string[] = []): void {
  Object.assign(context, { setTrustedHtml, insertTrustedHtml });
  const snippets = parsed.statements.filter((statement) => {
    if (ts.isFunctionDeclaration(statement)) return names.includes(statement.name?.text ?? '');
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) return false;
    const call = statement.expression;
    if (!ts.isPropertyAccessExpression(call.expression) || call.expression.name.text !== 'addEventListener') return false;
    const event = call.arguments[0];
    return event !== undefined && ts.isStringLiteral(event) && listeners.includes(`${call.expression.expression.getText(parsed)}:${event.text}`);
  }).map((statement) => statement.getText(parsed)).join('\n');
  runInNewContext(ts.transpileModule(snippets, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.None } }).outputText, context);
}

const catalog: ModelCatalog = { providers: [{
  instanceId: 'codex', name: 'Codex', ready: true,
  models: [
    { slug: 'default', name: 'Default', isDefault: true, effort: null },
    { slug: 'chosen', name: 'Chosen', isDefault: false, effort: { id: 'reasoning_effort', label: 'Effort', defaultValue: 'low', options: [{ id: 'low', label: 'Low' }, { id: 'high', label: 'High' }] } },
  ],
}] };

describe('automatic map syncing', () => {
  function fixture() {
    const map = { number: 205 };
    const snapshot = { maps: [map], fetchedAt: '2026-10-07T12:00:00Z' };
    const context: Record<string, unknown> = {
      loadInFlight: null, loadMode: null, loadMapNumber: null, lastCheckedAt: null, backgroundSyncFailed: false, snapshot,
      console: { warn: vi.fn() },
      pageRoute: { repo: 'owner/repo', mapNumber: 205 }, view: 'map', selected: 210,
      window: { location: { pathname: '/repos/owner/repo/maps/205' } }, URLSearchParams,
      Date: { now: () => 123_456, parse: Date.parse },
      scopedApiPath: () => '/api/repos/owner/repo/snapshot',
      routeData: () => ({ peek: () => null }), parseRepoPagePath: () => ({ mapNumber: 205 }),
      readRouteJson: vi.fn(async () => snapshot), applySnapshot: vi.fn(),
      currentMap: () => map, ticketAt: () => ({ type: 'prototype' }), prototypesFor: vi.fn(),
      autoMaps: { refresh: vi.fn(async () => undefined) },
      planningHandOffId: null, workspaceAsked: true, initialRouteTicketPending: false,
      syncedButton: () => ({}), setSyncedBusy: vi.fn(), toast: vi.fn(),
      setSyncedLabel: vi.fn(), syncedLabel: (age: number) => String(age),
    };
    bindings(context, ['load', 'renderSynced']);
    return context;
  }

  it('checks the open prototype automatically and records the successful check time', async () => {
    const context = fixture();
    expect(await (context['load'] as (mode: string) => Promise<boolean>)('background')).toBe(true);
    expect(context['readRouteJson']).toHaveBeenCalledWith('/api/repos/owner/repo/snapshot?check=1&map=205', true);
    expect(context['prototypesFor']).toHaveBeenCalledWith({ number: 205 }, false, true);
    expect(context['lastCheckedAt']).toBe(123_456);
    (context['renderSynced'] as () => void)();
    expect(context['setSyncedLabel']).toHaveBeenCalledWith({}, '0');
  });

  it('retains the last successful sync time on failure and leaves ordinary ticket views alone', async () => {
    const context = fixture();
    context['ticketAt'] = () => ({ type: 'task' });
    await (context['load'] as (mode: string) => Promise<boolean>)('background');
    expect(context['prototypesFor']).not.toHaveBeenCalled();
    context['readRouteJson'] = vi.fn(async () => { throw new Error('offline'); });
    expect(await (context['load'] as (mode: string) => Promise<boolean>)('background')).toBe(false);
    expect(context['lastCheckedAt']).toBe(123_456);
    expect(context['toast']).not.toHaveBeenCalled();
    expect((context['console'] as { warn: unknown }).warn).toHaveBeenCalledOnce();
  });

  it('logs one diagnostic per outage and allows a new diagnostic after recovery', async () => {
    const context = fixture();
    const load = context['load'] as (mode: string) => Promise<boolean>;
    const read = context['readRouteJson'];
    context['readRouteJson'] = vi.fn(async () => { throw new Error('offline'); });
    await load('background');
    await load('background');
    const warn = (context['console'] as { warn: unknown }).warn;
    expect(warn).toHaveBeenCalledOnce();
    context['readRouteJson'] = read;
    await load('background');
    expect(context['backgroundSyncFailed']).toBe(false);
    context['readRouteJson'] = vi.fn(async () => { throw new Error('offline again'); });
    await load('background');
    expect(warn).toHaveBeenCalledTimes(2);
    expect(context['toast']).not.toHaveBeenCalled();
  });

  it('checks the newly opened map after a read for the previous map finishes', async () => {
    const context = fixture();
    let finish!: () => void;
    context['loadMode'] = 'background';
    context['loadMapNumber'] = 205;
    context['loadInFlight'] = new Promise<boolean>((resolve) => { finish = () => resolve(true); }).then(() => {
      context['loadInFlight'] = null;
      context['loadMode'] = null;
      return true;
    });
    context['parseRepoPagePath'] = () => ({ mapNumber: 217 });
    const switched = (context['load'] as (mode: string) => Promise<boolean>)('background');
    expect(context['readRouteJson']).not.toHaveBeenCalled();
    finish();
    await switched;
    expect(context['readRouteJson']).toHaveBeenCalledWith('/api/repos/owner/repo/snapshot?check=1&map=217', true);
  });

  it('does not repaint the destination or advance its freshness with the previous map response', async () => {
    const context = fixture();
    const load = context['load'] as (mode: string) => Promise<boolean>;
    let finishOld!: (value: unknown) => void;
    let finishNew!: (value: unknown) => void;
    const read = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { finishNew = resolve; }));
    context['readRouteJson'] = read;
    const previous = load('background');
    context['parseRepoPagePath'] = () => ({ mapNumber: 217 });
    const destination = load('background');
    finishOld({ repo: 'owner/repo', maps: [{ number: 205 }], fetchedAt: 'old' });
    await previous;
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(context['applySnapshot']).not.toHaveBeenCalled();
    expect(context['lastCheckedAt']).toBeNull();
    expect(context['prototypesFor']).not.toHaveBeenCalled();
    const next = { repo: 'owner/repo', maps: [{ number: 217 }], fetchedAt: 'new' };
    finishNew(next);
    await destination;
    expect(context['applySnapshot']).toHaveBeenCalledExactlyOnceWith(next, false);
    expect(context['lastCheckedAt']).toBe(123_456);
  });

  it('refreshes a cached prototype without overlap and retains it when the check fails', async () => {
    const map = { number: 205 };
    const old = [{ title: 'Original' }];
    let resolve!: (value: unknown) => void;
    const readRouteJson = vi.fn(() => new Promise((next) => { resolve = next; }));
    const context: Record<string, unknown> = {
      prototypeLoads: new Map([[205, { status: 'ready', list: old }]]), prototypeRequests: new Set(),
      scopedApiPath: () => '/api/repos/owner/repo/prototypes', repoName: () => 'owner/repo',
      routeData: () => ({ peek: () => null }), readRouteJson,
      currentMap: () => map, view: 'map', navigation: { setPrototypeCount: vi.fn() },
      renderTicketPrototype: vi.fn(), renderPrototypes: vi.fn(), toast: vi.fn(),
      changedPrototypeNotifications: vi.fn(() => []), publishNotification: vi.fn(),
    };
    bindings(context, ['prototypesFor']);
    const refresh = context['prototypesFor'] as (map: unknown, force: boolean, background: boolean) => unknown;
    refresh(map, false, true);
    refresh(map, false, true);
    expect(readRouteJson).toHaveBeenCalledTimes(1);
    expect(readRouteJson).toHaveBeenCalledWith('/api/repos/owner/repo/prototypes?map=205', true);
    const next = [{ title: 'Updated' }];
    resolve(next);
    const loads = context['prototypeLoads'] as Map<number, { status: string; list: unknown }>;
    await vi.waitFor(() => expect(loads.get(205)?.list).toBe(next));
    expect(loads.get(205)?.status).toBe('ready');
    context['readRouteJson'] = vi.fn(async () => { throw new Error('offline'); });
    refresh(map, false, true);
    await vi.waitFor(() => expect((context['prototypeRequests'] as Set<number>).size).toBe(0));
    expect(loads.get(205)?.status).toBe('ready');
    expect(loads.get(205)?.list).toBe(next);
    expect(context['toast']).not.toHaveBeenCalled();
  });

  it('keeps the mounted map and prototype preview when a check changes only the read time', () => {
    const before = { repo: 'owner/repo', maps: [{ number: 205 }], fetchedAt: '2026-10-07T12:00:00Z' };
    const context: Record<string, unknown> = {
      snapshot: before, notifyNewStalls: vi.fn(), mapEventInbox: { reconcileSnapshot: vi.fn() },
      renderSynced: vi.fn(), flushPendingMapEvents: vi.fn(), render: vi.fn(),
    };
    bindings(context, ['applySnapshot']);
    const after = { ...before, fetchedAt: '2026-10-07T12:01:00Z' };
    (context['applySnapshot'] as (snapshot: unknown, initial: boolean) => void)(after, false);
    expect(context['snapshot']).toBe(after);
    expect(context['render']).not.toHaveBeenCalled();
    expect(context['renderSynced']).toHaveBeenCalledOnce();
    expect(context['flushPendingMapEvents']).toHaveBeenCalledOnce();
  });
});

describe('map switching without reloading the page', () => {
  function fixture() {
    const maps = [
      { number: 205, ticketsLoaded: true, tickets: [{ number: 210 }] },
      { number: 217, ticketsLoaded: true, tickets: [{ number: 225 }] },
    ];
    const location = { href: 'http://localhost/repos/owner/repo/maps/205', origin: 'http://localhost', pathname: '/repos/owner/repo/maps/205', search: '' };
    const context: Record<string, unknown> = {
      URL, URLSearchParams, parseRepoPagePath, window: { location },
      snapshot: { repo: 'owner/repo', maps }, activeMap: 0,
      canvasViewer: { isOpen: () => false },
      history: { pushState: vi.fn((_state, _title, href: string) => {
        const url = new URL(href, location.href);
        Object.assign(location, { href: url.href, pathname: url.pathname, search: url.search });
      }) },
      currentMap: () => maps[context['activeMap'] as number],
      planningHandOffId: null, planningHandOff: null, filter: 'claimed', query: 'old search', hovered: 210,
      els: { search: { value: 'old search' } }, zoom: 1.5, homedMap: 205, selected: 210,
      allTickets: (map: { tickets: unknown[] }) => map.tickets, rememberMapOpen: vi.fn(),
      viewFromQuery: (value: string) => value ?? 'map', hideCard: vi.fn(),
      navigation: { setSnapshot: vi.fn(), setActiveView: vi.fn() }, render: vi.fn(),
      load: vi.fn(async () => true), loadPlanningHandoff: vi.fn(),
    };
    bindings(context, ['navigateMap', 'applyMapRoute']);
    return { context, maps, location, navigate: context['navigateMap'] as (href: string) => boolean };
  }

  it('paints the cached destination immediately, keeps the shell and checks in the background', () => {
    const { context, navigate } = fixture();
    expect(navigate('/repos/owner/repo/maps/217?view=table&ticket=225')).toBe(true);
    expect(context['activeMap']).toBe(1);
    expect(context['selected']).toBe(225);
    expect(context['view']).toBe('table');
    expect(context['filter']).toBeNull();
    expect(context['query']).toBe('');
    expect(context['render']).toHaveBeenCalledOnce();
    expect(context['load']).toHaveBeenCalledWith('background');
  });

  it('reads unloaded ticket details and restores the previous map on browser Back', () => {
    const { context, maps, location, navigate } = fixture();
    maps[1]!.ticketsLoaded = false;
    maps[1]!.tickets = [];
    navigate('/repos/owner/repo/maps/217?ticket=225');
    expect(context['initialRouteTicketPending']).toBe(true);
    expect(context['routedTicketNumber']).toBe(225);
    expect(context['load']).toHaveBeenCalledExactlyOnceWith('initial');
    Object.assign(location, { pathname: '/repos/owner/repo/maps/205', search: '?ticket=210' });
    (context['applyMapRoute'] as () => void)();
    expect(context['activeMap']).toBe(0);
    expect(context['selected']).toBe(210);
  });

  it.each(['/repos/another/repo/maps/205', '/repos/owner/repo', '/repos/owner/repo/maps/999', 'https://other.test/repos/owner/repo/maps/205'])(
    'keeps ordinary navigation for %s', (href) => {
      const { context, navigate } = fixture();
      expect(navigate(href)).toBe(false);
      expect(context['render']).not.toHaveBeenCalled();
      expect(context['load']).not.toHaveBeenCalled();
    },
  );
});

class SelectFixture {
  constructor(public id: string, public value: string) {}
}

afterEach(() => vi.unstubAllGlobals());

describe('ticket model choices across actual inspector redraws', () => {
  function fixture() {
    let listener: ((event: { target: SelectFixture }) => void) | undefined;
    const controls = new Map<string, SelectFixture>();
    const inspector = { innerHTML: '', querySelector: () => null, addEventListener: (_event: string, callback: typeof listener) => { listener = callback; } };
    const context: Record<string, unknown> = {
      selected: 11, inspectorTab: 'ticket', ticketModelChoices: new Map<string, ModelChoice | null>(),
      repoName: () => 'owner/repo', currentMap: () => ({}), ticketAt: (_map: unknown, number: number) => ({ number }),
      currentCatalog: () => ({ status: 'ready', catalog }), tierDefaults: () => ({ mid: { instanceId: 'codex', model: 'default' } }),
      liveChoice, modelSelectHtml, effortSelectHtml, findModel, readChoice,
      HTMLSelectElement: SelectFixture, document: { getElementById: (id: string) => controls.get(id) ?? null },
      els: { inspector }, rememberControlFocus: () => () => undefined,
      tabAttrs: () => '', tabPanelAttrs: () => '', fitPrototypeThumbs: () => undefined,
      ticketHtml: () => (context['ticketPickerHtml'] as (tier: string) => string)('mid'),
      briefHtml: () => '', refreshEffort: () => undefined,
    };
    bindings(context, ['ticketChoiceKey', 'ticketPickerHtml', 'pickedModel', 'renderInspector'], ['els.inspector:change']);
    const change = (id: string, value: string): void => {
      const control = new SelectFixture(id, value);
      controls.set(id, control);
      listener?.({ target: control });
    };
    const redraw = (): string => {
      (context['renderInspector'] as () => void)();
      return inspector.innerHTML;
    };
    return { context, change, redraw };
  }

  it('keeps an explicitly chosen model and effort through repeated redraws, isolated to its ticket', () => {
    const app = fixture();
    app.change('ticket-model', 'codex::chosen');
    app.change('ticket-effort', 'high');
    for (let count = 0; count < 2; count += 1) {
      const html = app.redraw();
      expect(html).toContain('value="codex::chosen" selected');
      expect(html).toContain('value="high" selected');
    }
    app.context['selected'] = 12;
    expect(app.redraw()).toContain('value="codex::default" selected');
    app.context['selected'] = 11;
    expect(app.redraw()).toContain('value="codex::chosen" selected');
  });

  it('keeps an explicit T3 Code default instead of replacing it with the tier model', () => {
    const app = fixture();
    app.change('ticket-model', '');
    expect(app.redraw()).toContain('<option value="" selected>T3 Code default</option>');
  });
});

class ElementFixture {
  isConnected = true;
  tagName = 'BUTTON';
  scrollTop = 37;
  focusOptions: FocusOptions | undefined;
  children: ElementFixture[] = [];
  ownerDocument: { activeElement: ElementFixture | null };
  attributes = new Map<string, string>();
  constructor(document: { activeElement: ElementFixture | null }, attributes: Record<string, string> = {}) {
    this.ownerDocument = document;
    this.attributes = new Map(Object.entries(attributes));
  }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  getAttributeNames(): string[] { return [...this.attributes.keys()]; }
  contains(element: ElementFixture): boolean { return this.children.includes(element); }
  querySelectorAll(): ElementFixture[] { return this.children; }
  querySelector(): null { return null; }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  focus(options?: FocusOptions): void { this.ownerDocument.activeElement = this; this.focusOptions = options; }
  set innerHTML(_html: string) {
    const active = this.ownerDocument.activeElement;
    for (const element of this.children) element.isConnected = false;
    this.children = this.children.map((element) => new ElementFixture(this.ownerDocument, Object.fromEntries(element.attributes)));
    if (active !== null && !active.isConnected) this.ownerDocument.activeElement = null;
  }
}

describe('focus through the production redraw paths', () => {
  it('restores the same card during the periodic full graph redraw', () => {
    vi.stubGlobal('HTMLElement', ElementFixture);
    const document = { activeElement: null as ElementFixture | null };
    const nodes = new ElementFixture(document);
    const original = new ElementFixture(document, { 'data-number': '11' });
    nodes.children = [original];
    original.focus();
    const context: Record<string, unknown> = {
      currentMap: () => ({ number: 1, tickets: [{ number: 11 }], outside: [], criticalPath: { remaining: 0 } }),
      els: { nodes, edges: new ElementFixture(document), canvas: { style: {} }, canvasWrap: { hidden: false }, tableWrap: { hidden: true }, protoWrap: { hidden: true } },
      hideCard: () => undefined, graphTickets: () => [], DEFAULT_LAYOUT: {},
      layoutTickets: () => ({ width: 200, height: 100, nodes: [{ number: 11 }], edges: [] }),
      nodeHtml: () => '<button data-number="11"></button>', homedMap: 1, syncHighlights: () => undefined,
      rememberControlFocus,
    };
    bindings(context, ['renderGraph']);
    (context['renderGraph'] as () => void)();
    expect(document.activeElement).toBe(nodes.children[0]);
    expect(document.activeElement).not.toBe(original);
    expect(document.activeElement?.focusOptions).toEqual({ preventScroll: true });
  });

  it.each([{ id: 'ticket-model' }, { 'data-section': 'destination' }, { id: 'start-thread' }])('restores inspector control %j', (attributes) => {
    vi.stubGlobal('HTMLElement', ElementFixture);
    const document = { activeElement: null as ElementFixture | null };
    const inspector = new ElementFixture(document);
    const original = new ElementFixture(document, attributes);
    inspector.children = [original];
    original.focus();
    const context: Record<string, unknown> = {
      currentMap: () => ({}), ticketAt: () => ({ number: 11 }), selected: 11, inspectorTab: 'ticket',
      els: { inspector }, tabAttrs: () => '', tabPanelAttrs: () => '', ticketHtml: () => '', briefHtml: () => '', fitPrototypeThumbs: () => undefined,
      rememberControlFocus,
    };
    bindings(context, ['renderInspector']);
    (context['renderInspector'] as () => void)();
    expect(document.activeElement).toBe(inspector.children[0]);
    expect(document.activeElement?.focusOptions).toEqual({ preventScroll: true });
  });
});

describe('table ticket keyboard entry', () => {
  it.each([true, false])('keeps table ticket focus only while its map exists (%s)', (mapExists) => {
    vi.stubGlobal('HTMLElement', ElementFixture);
    const document = { activeElement: null as ElementFixture | null };
    class TableFixture extends ElementFixture {
      override set innerHTML(html: string) {
        for (const child of this.children) child.isConnected = false;
        if (document.activeElement?.isConnected === false) document.activeElement = null;
        this.children = [...html.matchAll(/<button[^>]*data-table-ticket="(\d+)"[^>]*>/g)]
          .map((match) => new ElementFixture(document, { 'data-table-ticket': match[1] ?? '' }));
      }
    }
    const tableWrap = new TableFixture(document);
    const original = new ElementFixture(document, { 'data-table-ticket': '11' });
    tableWrap.children = [original];
    original.focus();
    const context: Record<string, unknown> = {
      els: { tableWrap, canvasWrap: { hidden: false }, protoWrap: { hidden: true } },
      currentMap: () => mapExists ? {} : null,
      allTickets: () => [{ number: 11, title: 'Keyboard ticket', state: 'frontier', type: 'task', assignee: null, blockedBy: [] }],
      STATE_STYLE, pullRequestOf: () => undefined, stallOf: () => undefined, onCriticalPath: () => false,
      typeStyle: () => ({ label: 'Task', icon: '' }), icon: () => '', escapeHtml,
      hideCard: () => undefined, syncHighlights: () => undefined, rememberControlFocus,
    };
    bindings(context, ['renderTable']);
    (context['renderTable'] as () => void)();
    if (mapExists) {
      expect(document.activeElement).toBe(tableWrap.children[0]);
      expect(document.activeElement).not.toBe(original);
      expect(document.activeElement?.focusOptions).toEqual({ preventScroll: true });
    } else {
      expect(tableWrap.children).toEqual([]);
      expect(document.activeElement).toBeNull();
    }
  });

  it('renders a native ticket button and selects it through the production table listener', () => {
    let listener: ((event: { target: { closest(selector: string): unknown } }) => void) | undefined;
    let selected: number | null = null;
    const tableWrap = { innerHTML: '', hidden: true, addEventListener: (_event: string, callback: typeof listener) => { listener = callback; } };
    const ticket = { number: 11, title: 'Keyboard ticket', state: 'frontier', type: 'task', assignee: null, blockedBy: [] };
    const context: Record<string, unknown> = {
      els: { tableWrap, canvasWrap: { hidden: false }, protoWrap: { hidden: true } },
      currentMap: () => ({}), allTickets: () => [ticket], STATE_STYLE, pullRequestOf: () => ({ url: 'https://github.com/owner/repo/pull/2' }),
      pullRequestText: () => 'PR #2', stallOf: () => undefined, onCriticalPath: () => false,
      typeStyle: () => ({ label: 'Task', icon: '' }), icon: () => '', escapeHtml, hideCard: () => undefined, syncHighlights: () => undefined,
      select: (number: number) => { selected = number; }, rememberControlFocus: () => () => undefined,
    };
    bindings(context, ['renderTable'], ['els.tableWrap:click']);
    (context['renderTable'] as () => void)();
    expect(tableWrap.innerHTML).toMatch(/<button[^>]*type="button"[^>]*data-table-ticket="11"/);
    expect(tableWrap.innerHTML).toContain('href="https://github.com/owner/repo/pull/2"');
    listener?.({ target: { closest: (selector) => selector === 'a' ? null : { dataset: { number: '11', tableTicket: '11' } } } });
    expect(selected).toBe(11);
    selected = null;
    listener?.({ target: { closest: (selector) => selector === 'a' ? {} : { dataset: { number: '11' } } } });
    expect(selected).toBeNull();
  });
});
