import { readdirSync } from 'node:fs';

import { ESLint } from 'eslint';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  BLOCKED_EXAMPLE,
  createDemoJourney,
  HAND_OFF_DONE,
  HAND_OFF_EXAMPLE,
  HAND_OFF_TICK_MS,
  PLAN_DONE,
  PLAN_TICK_MS,
} from './demoJourney';

/*
  The demo must not create GitHub issues, launch T3 Code threads or change real map
  preferences. Every one of those goes through the server (fetch) or browser storage, so
  the demo is held to two boundaries: at runtime it calls none of those APIs, and lint
  stops its source from importing real app code or naming those globals at all.
*/

const realActions = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'open', 'postMessage'] as const;
const storages = ['localStorage', 'sessionStorage'] as const;

describe('the demo at runtime', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('runs the whole journey, exit and restart without touching the network or storage', () => {
    const calls: string[] = [];
    for (const name of realActions) vi.stubGlobal(name, vi.fn(() => { calls.push(name); }));
    for (const name of storages) {
      vi.stubGlobal(name, new Proxy({}, { get: (_target, key) => { calls.push(`${name}.${String(key)}`); return () => undefined; } }));
    }
    vi.stubGlobal('indexedDB', new Proxy({}, { get: (_target, key) => { calls.push(`indexedDB.${String(key)}`); } }));
    vi.useFakeTimers();

    const journey = createDemoJourney();
    for (let run = 0; run < 2; run += 1) {
      journey.dispatch({ type: 'next' });
      journey.dispatch({ type: 'startMap' });
      vi.advanceTimersByTime(PLAN_TICK_MS * PLAN_DONE);
      for (let i = 0; i < 3; i += 1) journey.dispatch({ type: 'next' });
      journey.dispatch({ type: 'select', ticket: BLOCKED_EXAMPLE });
      journey.dispatch({ type: 'next' });
      journey.dispatch({ type: 'select', ticket: HAND_OFF_EXAMPLE });
      journey.dispatch({ type: 'openInT3' });
      vi.advanceTimersByTime(HAND_OFF_TICK_MS * HAND_OFF_DONE);
      journey.dispatch({ type: 'next' });
      expect(journey.state().status).toBe('finished');
      journey.dispatch({ type: 'exit' });
      journey.restart();
    }
    journey.dispose();

    expect(calls).toEqual([]);
  });
});

describe('the demo lint boundary', () => {
  const eslint = new ESLint();
  const probe = 'src/ui/demo/lintProbe.ts';
  const boundary = new Set(['no-restricted-imports', 'no-restricted-globals', 'no-restricted-syntax']);
  const errors = async (code: string, filePath = probe) =>
    (await eslint.lintText(code, { filePath }))[0]?.messages.filter((message) => boundary.has(message.ruleId ?? '')) ?? [];

  beforeAll(async () => {
    await eslint.calculateConfigForFile(probe);
  }, 30_000);

  it.each([
    "import { createIssue } from '../../github';",
    "import { startHandOff } from '../../t3';",
    "import { loadSettings } from '../settings';",
    "import { readFile } from 'node:fs';",
    "import x from 'some-package';",
    "import { y } from './nested/y';",
    "export { z } from '../z';",
    "import { walk } from './demoJourney.test';",
    "import { a } from './helper.js';",
    "import { b } from './sub/b';",
    String.raw`import { c } from '.\\..\\..\\github';`,
    String.raw`import { d } from './x\\..\\..\\t3';`,
    "void import('./demoData');",
    "fetch('/api/maps');",
    "window.fetch('/api/maps');",
    "globalThis.fetch('/api/maps');",
    "self.fetch('/api/maps');",
    "localStorage.setItem('wayfinder.settled', '[]');",
    "sessionStorage.clear();",
    "new XMLHttpRequest();",
    "new WebSocket('ws://localhost');",
    "navigator.clipboard.writeText('prompt');",
    "open('t3://thread');",
    "location.assign('/settings');",
    "document.cookie = 'x';",
    'el.innerHTML = x;',
  ])('rejects %s in demo source', async (code) => {
    expect(await errors(code)).not.toEqual([]);
  });

  it('applies to JavaScript files in the demo too', async () => {
    expect(await errors("fetch('/api/maps');", 'src/ui/demo/lintProbe.mjs')).not.toEqual([]);
  });

  it('allows imports between demo files and timers', async () => {
    expect(await errors("import { DEMO_MAP } from './demoData';\nconst id = setInterval(() => DEMO_MAP, 1);\nclearInterval(id);")).toEqual([]);
  });

  it('covers every demo source file, and they pass it', async () => {
    const sources = readdirSync('src/ui/demo', { recursive: true, encoding: 'utf8' })
      .map((file) => file.replaceAll('\\', '/'))
      .filter((file) => /\.[cm]?[jt]s$/.test(file) && !file.endsWith('.test.ts'));
    expect(sources.length).toBeGreaterThan(0);
    for (const file of sources) {
      const filePath = `src/ui/demo/${file}`;
      const config = await eslint.calculateConfigForFile(filePath);
      expect(config.rules['no-restricted-imports']?.[0], filePath).toBe(2);
      expect(config.rules['no-restricted-globals']?.[0], filePath).toBe(2);
      const [result] = await eslint.lintFiles([filePath]);
      expect(result?.messages, filePath).toEqual([]);
    }
  }, 30_000);
});
