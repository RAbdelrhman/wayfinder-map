import { describe, expect, it, vi } from 'vitest';
import {
  CanvasRouting,
  canvasFrameHtml,
  canvasOptionForFile,
  canvasToolbarHtml,
  floatGeometry,
  readCanvasMessage,
  readCanvasRoute,
} from './canvasViewer.js';
import { canvasEntryAttrs } from './canvasEntry.js';
import type { Prototype } from '../types.js';

const origin = 'http://127.0.0.1:4479';
const route = {
  url: '/proto/octo/repo/prototype%2F207/prototypes/canvas/index.html',
  title: '#207 Canvas',
  github: 'https://github.com/octo/repo/tree/prototype/207',
  file: null,
};

describe('canvas routing', () => {
  it('adds exactly one entry and consumes Back/Forward without redrawing the map', () => {
    const history = { pushState: vi.fn(), back: vi.fn() },
      changed = vi.fn();
    const routing = new CanvasRouting(history, changed);
    routing.open(route, origin + '/repos/octo/repo/maps/205?ticket=207&view=map', { map: 205 });
    expect(history.pushState).toHaveBeenCalledTimes(1);
    expect(history.pushState.mock.calls[0]?.[0]).toEqual({ map: 205, wfCanvas: route });
    const href = String(history.pushState.mock.calls[0]?.[2]);
    expect(new URL(href, origin).searchParams.get('ticket')).toBe('207');
    expect(new URL(href, origin).searchParams.get('canvas')).toBe(route.url);
    routing.open(route, origin, null);
    expect(history.pushState).toHaveBeenCalledTimes(1);
    routing.close();
    routing.close();
    expect(history.back).toHaveBeenCalledOnce();
    expect(routing.pop(null, origin)).toBe(true);
    expect(changed).toHaveBeenLastCalledWith(null);
    expect(routing.pop(null, origin)).toBe(false);
    expect(routing.pop({ wfCanvas: route }, origin)).toBe(true);
    expect(changed).toHaveBeenLastCalledWith(route);
  });
  it('rejects external, traversal, malformed and non-prototype viewer routes', () => {
    for (const url of [
      'https://attacker.test/proto/octo/repo/prototype%2F207/a.html',
      '/api/shutdown',
      '/proto/octo/repo/main/a.html',
      '/proto/octo/repo/prototype%2F207/%2e%2e/api',
    ]) {
      expect(readCanvasRoute({ ...route, url }, origin)).toBeNull();
    }
    expect(readCanvasRoute({ ...route, github: 'javascript:alert(1)' }, origin)).toBeNull();
  });
});

describe('approved ACF4 shell', () => {
  it('creates the viewer iframe with only the existing opaque-origin sandbox capability', () => {
    const html = canvasFrameHtml({ ...route, title: 'Untrusted <title>' });
    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).not.toMatch(/allow-same-origin|allow-popups|allow-top-navigation/);
    expect(html).toContain('Untrusted &lt;title&gt;');
    expect(html).toContain(`src="${route.url}"`);
  });
  it('opens the exact query variant and falls back to its path for older config metadata', () => {
    const pages = [
      {
        id: 'round-4',
        title: 'Round 4',
        options: [
          { id: 'AC', name: 'Auto', file: '/proto/o/r/prototype%2F163/start-ac.html?phase=confirm&auto=1' },
          { id: 'B', name: 'Final', file: '/proto/o/r/prototype%2F163/start-final.html?phase=confirm' },
          { id: 'B-running', name: 'Running', file: '/proto/o/r/prototype%2F163/start-final.html?phase=running' },
        ],
      },
    ];
    expect(canvasOptionForFile(pages, '/proto/o/r/prototype%2F163/start-ac.html')).toEqual({ page: 'round-4', option: 'AC' });
    expect(canvasOptionForFile(pages, '/proto/o/r/prototype%2F163/start-final.html?phase=running')).toEqual({
      page: 'round-4',
      option: 'B-running',
    });
    expect(canvasOptionForFile(pages, '/proto/other.html')).toBeNull();
  });
  it('keeps the same size control and only offers GitHub at full window and pane', () => {
    const pages = [
      {
        id: 'directions',
        title: 'Directions',
        options: [
          { id: 'A', name: 'Overlay', file: null },
          { id: 'B', name: 'Pane', file: null },
        ],
      },
    ];
    for (const size of ['full', 'pane', 'float'] as const) {
      const html = canvasToolbarHtml(route, size, pages, 'directions', 'B', 'dom', false);
      expect(html.match(/aria-label="Canvas size"/g)).toHaveLength(1);
      expect(html).toContain('Previous option');
      expect(html).toContain('Next option');
      expect(html).toContain('data-go=""');
      expect(html).toContain('data-go="B"');
      expect(html.includes('Open the branch on GitHub')).toBe(size !== 'float');
    }
  });
  it.each(['nw', 'ne', 'sw', 'se'])('resizes %s while retaining the opposite corner', (corner) => {
    const start = { left: 400, top: 300, width: 560, height: 380 };
    const next = floatGeometry(start, corner, 20, 30, 1320, 860);
    if (corner.includes('w')) expect(next.left + next.width).toBe(start.left + start.width);
    else expect(next.left).toBe(start.left);
    if (corner.includes('n')) expect(next.top + next.height).toBe(start.top + start.height);
    else expect(next.top).toBe(start.top);
    expect(next.width).not.toBe(start.width);
    expect(next.height).not.toBe(start.height);
    const small = floatGeometry(start, corner, corner.includes('w') ? 2000 : -2000, corner.includes('n') ? 2000 : -2000, 1320, 860);
    expect(small.width).toBe(360);
    expect(small.height).toBe(240);
  });
  it('moves and clamps floating geometry to the visible viewport', () => {
    expect(floatGeometry({ left: 400, top: 300, width: 560, height: 380 }, null, 2000, 2000, 1320, 860)).toEqual({
      left: 760,
      top: 480,
      width: 560,
      height: 380,
    });
  });
  it('routes tile, board and ticket-panel entry metadata to the immutable board', () => {
    const prototype: Prototype = {
      branch: 'prototype/207',
      sha: 'a'.repeat(40),
      ticketNumber: 207,
      mapNumber: 205,
      url: route.github,
      preview: 'prototypes/canvas/index.html',
      updatedAt: null,
      files: [],
      openable: [],
      verdict: null,
    };
    const attrs = canvasEntryAttrs('octo/repo', prototype, '<Canvas>', '/proto/option.html');
    expect(attrs).toContain('data-canvas-url="/proto/octo/repo/prototype%2F207/' + prototype.sha);
    expect(attrs).toContain('&lt;Canvas&gt;');
    expect(attrs).toContain('data-canvas-file="/proto/option.html"');
    expect(attrs).not.toContain('target="_blank"');
  });
});

describe('untrusted canvas messages', () => {
  it('accepts only the viewer protocol and validates nested page/options', () => {
    expect(readCanvasMessage({ wf: 1, type: 'state', page: 'directions', option: 'B', presenting: true })).not.toBeNull();
    expect(
      readCanvasMessage({
        wf: 1,
        type: 'ready',
        source: 'dom',
        pages: [{ id: 'p', title: 'P', options: [{ id: 'A', name: 'A', file: null }] }],
      }),
    ).not.toBeNull();
    for (const value of [
      null,
      [],
      { wf: 1, type: 'fetch', url: '/api/shutdown' },
      { wf: 1, type: 'ready', source: 'dom', pages: [{ id: 'p', options: [] }] },
      { wf: 1, type: 'state', page: {}, option: null, presenting: true },
      { wf: 2, type: 'key', key: 'Escape' },
    ])
      expect(readCanvasMessage(value)).toBeNull();
  });
});
