import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ModelCatalog, ModelChoice } from '../models.js';
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
