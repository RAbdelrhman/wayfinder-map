import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

import { normalizeRepo } from '../repoRoutes.js';
import { escapeHtml } from './markdown.js';
import { setTrustedHtml } from './trustedHtml.js';
import { repositoryOptions } from './newMap.js';

const source = readFileSync(new URL('./newMapPage.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('newMapPage.ts', source, ts.ScriptTarget.Latest, true);

/** Run the actual nested composer functions and event handlers with controlled browser dependencies. */
function bindings(context: Record<string, unknown>, names: string[], listeners: string[] = []): void {
  Object.assign(context, { setTrustedHtml });
  const snippets: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? '')) snippets.push(node.getText(parsed));
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
      const call = node.expression;
      const event = call.arguments[0];
      if (ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === 'addEventListener' && event !== undefined && ts.isStringLiteral(event) && listeners.includes(`${call.expression.expression.getText(parsed)}:${event.text}`)) snippets.push(node.getText(parsed));
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  runInNewContext(ts.transpileModule(snippets.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.None } }).outputText, context);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => { resolve = settle; });
  return { promise, resolve };
}

interface Activity { busy: boolean; error: boolean; text: string }
interface Reply { ok: boolean; json: () => Promise<unknown> }
const reply = (body: unknown, ok = true): Reply => ({ ok, json: async () => body });
const ready = { status: 'ready', path: 'C:/clones/a', canChoose: true };

function cloneFixture() {
  const cloneActivity = new Map<string, Activity>();
  const pending = deferred<Reply>();
  const sync = vi.fn();
  const announceClone = vi.fn();
  const context: Record<string, unknown> = {
    repo: 'owner/a', workspace: { status: 'choose', candidates: [], canChoose: true }, cloneOpen: true, cloneRequest: 0, repositoryGeneration: 0,
    cloneActivity, sync, announceClone, scopedApiPath: (repo: string, api: string) => `${repo}/${api}`,
    fetch: vi.fn(() => pending.promise),
  };
  bindings(context, ['setClone', 'cloneRepository', 'loadWorkspace']);
  return { context, pending, cloneActivity, sync, announceClone };
}

describe('clone completion after changing repository', () => {
  it.each([
    ['success', reply(ready)],
    ['cancel', reply({ cancelled: true })],
    ['failure', reply({ error: 'Could not select clone' }, false)],
  ])('settles a %s clone selection without overwriting or announcing for the new repository', async (_name, response) => {
    const app = cloneFixture();
    const operation = (app.context['setClone'] as (body: unknown) => Promise<void>)({ path: 'C:/clones/a' });
    app.context['repo'] = 'owner/b';
    const workspaceB = { status: 'ready', path: 'C:/clones/b', canChoose: true };
    app.context['workspace'] = workspaceB;
    app.sync.mockClear();
    app.pending.resolve(response);
    await operation;
    expect(app.cloneActivity.get('owner/a')?.busy ?? false).toBe(false);
    expect(app.context['workspace']).toBe(workspaceB);
    expect(app.sync).not.toHaveBeenCalled();
    expect(app.announceClone).not.toHaveBeenCalled();
  });

  it('settles a clone network failure for the original repository without announcing it on another one', async () => {
    const app = cloneFixture();
    app.context['fetch'] = vi.fn(async () => { throw new Error('Offline'); });
    const operation = (app.context['setClone'] as (body: unknown) => Promise<void>)({ path: 'C:/clones/a' });
    app.context['repo'] = 'owner/b';
    app.sync.mockClear();
    await operation;
    expect(app.cloneActivity.get('owner/a')).toMatchObject({ busy: false, error: true });
    expect(app.sync).not.toHaveBeenCalled();
    expect(app.announceClone).not.toHaveBeenCalled();
  });

  it('clears a completed clone activity and permits another attempt after returning to its repository', async () => {
    const app = cloneFixture();
    const fetchingClone = deferred<void>();
    let attempts = 0;
    const fetcher = vi.fn(async (path: string) => {
      if (path.endsWith('/workspace')) return reply({ target: 'C:/clones/a' });
      attempts += 1;
      fetchingClone.resolve();
      return attempts === 1 ? app.pending.promise : reply(ready);
    });
    app.context['fetch'] = fetcher;
    const clone = app.context['cloneRepository'] as () => Promise<void>;
    const operation = clone();
    await fetchingClone.promise;
    app.context['repo'] = 'owner/b';
    app.sync.mockClear();
    app.pending.resolve(reply(ready));
    await operation;
    expect(app.cloneActivity.has('owner/a')).toBe(false);
    expect(app.sync).not.toHaveBeenCalled();
    expect(app.announceClone).not.toHaveBeenCalled();
    app.context['repo'] = 'owner/a';
    await clone();
    expect(attempts).toBe(2);
    expect(app.context['workspace']).toEqual(ready);
  });

  it('does not let an older workspace lookup overwrite the completed clone selection', async () => {
    const app = cloneFixture();
    const lookup = deferred<unknown>();
    app.context['context'] = { getJson: () => lookup.promise };
    app.context['mapNotice'] = null;
    const operation = (app.context['setClone'] as (body: unknown) => Promise<void>)({ path: 'C:/clones/a' });
    const checking = (app.context['loadWorkspace'] as () => Promise<void>)();
    app.pending.resolve(reply(ready));
    await operation;
    lookup.resolve({ status: 'choose', candidates: [], canChoose: true });
    await checking;
    expect(app.context['workspace']).toEqual(ready);
    expect(app.context['cloneOpen']).toBe(false);
  });
});

describe('clone completion after leaving and returning to the same repository', () => {
  it.each(['setClone', 'cloneRepository'] as const)('%s leaves the returning repository lookup valid', async (name) => {
    const app = cloneFixture();
    const freshLookup = deferred<unknown>();
    const cloneStarted = deferred<void>();
    app.context['fetch'] = vi.fn((path: string) => {
      if (name === 'cloneRepository' && path.endsWith('/workspace')) return Promise.resolve(reply({ target: 'C:/clones/a' }));
      cloneStarted.resolve();
      return app.pending.promise;
    });
    app.context['context'] = {
      setCurrentRepo: vi.fn(), remember: vi.fn(),
      getJson: (path: string) => path.startsWith('owner/a/') ? freshLookup.promise : Promise.resolve(ready),
    };
    Object.assign(app.context, { normalizeRepo, knownRepos: [], closeMenu: vi.fn(), goal: { focus: vi.fn() }, mapNotice: null });
    bindings(app.context, ['selectRepository']);
    const operation = (app.context[name] as (body?: unknown) => Promise<void>)({ path: 'C:/clones/a' });
    await cloneStarted.promise;
    const select = app.context['selectRepository'] as (repo: string) => void;
    select('owner/b');
    select('owner/a');
    const request = app.context['cloneRequest'];
    app.announceClone.mockClear();
    app.pending.resolve(reply(ready));
    await operation;
    expect(app.cloneActivity.has('owner/a')).toBe(false);
    expect(app.context['workspace']).toBe('loading');
    expect(app.context['cloneRequest']).toBe(request);
    expect(app.announceClone).not.toHaveBeenCalled();
    const freshWorkspace = { ...ready, path: 'C:/clones/fresh-a' };
    freshLookup.resolve(freshWorkspace);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(app.context['workspace']).toBe(freshWorkspace);
  });

  it.each(['setClone', 'cloneRepository'] as const)('%s cannot replace the returning repository workspace', async (name) => {
    const app = cloneFixture();
    const cloneStarted = deferred<void>();
    app.context['fetch'] = vi.fn((path: string) => {
      if (name === 'cloneRepository' && path.endsWith('/workspace')) return Promise.resolve(reply({ target: 'C:/clones/a' }));
      cloneStarted.resolve();
      return app.pending.promise;
    });
    const freshWorkspace = { ...ready, path: 'C:/clones/fresh-a' };
    app.context['context'] = { setCurrentRepo: vi.fn(), remember: vi.fn(), getJson: async () => freshWorkspace };
    Object.assign(app.context, { normalizeRepo, knownRepos: [], closeMenu: vi.fn(), goal: { focus: vi.fn() }, mapNotice: null });
    bindings(app.context, ['selectRepository']);
    const operation = (app.context[name] as (body?: unknown) => Promise<void>)({ path: 'C:/clones/a' });
    await cloneStarted.promise;
    const select = app.context['selectRepository'] as (repo: string) => void;
    select('owner/b');
    select('owner/a');
    await new Promise<void>((resolve) => setImmediate(resolve));
    app.announceClone.mockClear();
    app.pending.resolve(reply(ready));
    await operation;
    expect(app.cloneActivity.has('owner/a')).toBe(false);
    expect(app.context['workspace']).toBe(freshWorkspace);
    expect(app.announceClone).not.toHaveBeenCalled();
  });
});

describe('repository search keyboard selection', () => {
  it('Enter chooses the matching repository while Clear remains an explicit option', () => {
    let listener: ((event: { key: string; preventDefault: () => void }) => void) | undefined;
    const selectRepository = vi.fn();
    const repoSearch = { value: 'owner/b', addEventListener: (_event: string, callback: typeof listener) => { listener = callback; } };
    let markup = '';
    let options: Array<{ dataset: Record<string, string>; click: () => void; focus: () => void }> = [];
    const repoOptions = {
      set innerHTML(html: string) {
        markup = html;
        options = [...html.matchAll(/<button\b([^>]*)>/g)].map((match) => {
          const attributes = match[1] ?? '';
          const repo = /data-repo="([^"]*)"/.exec(attributes)?.[1];
          const clear = /data-clear-repo="true"/.test(attributes);
          return { dataset: repo === undefined ? { clearRepo: 'true' } : { repo }, click: () => selectRepository(clear ? null : repo), focus: () => undefined };
        });
      },
      querySelectorAll: () => options,
      querySelector: (selector: string) => selector === '[data-repo]' ? options.find((option) => option.dataset['repo'] !== undefined) ?? null : null,
    };
    const context: Record<string, unknown> = {
      repo: 'owner/a', repoSearch, repoOptions, selectRepository,
      recents: [], knownRepos: ['owner/a', 'owner/b'], normalizeRepo, repositoryOptions,
      escapeHtml, repoIconHtml: () => '', icon: () => '', icons: {}, paintIcons: () => undefined, closeMenu: () => undefined,
    };
    bindings(context, ['visibleRepoOptions', 'renderRepoOptions', 'repositoryOptionHtml', 'optionButtons'], ['repoSearch:keydown']);
    (context['renderRepoOptions'] as () => void)();
    expect(markup).toContain('data-clear-repo="true"');
    listener?.({ key: 'Enter', preventDefault: () => undefined });
    expect(selectRepository).toHaveBeenLastCalledWith('owner/b');
    options.find((option) => option.dataset['clearRepo'] === 'true')?.click();
    expect(selectRepository).toHaveBeenLastCalledWith(null);
  });
});
