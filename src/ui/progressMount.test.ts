import { Window } from 'happy-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { mountProgressPanel } from './progress.js';

let browser: Window | null = null;
afterEach(async () => { await browser?.happyDOM.abort(); vi.unstubAllGlobals(); });

it('replaces progress listeners when a cached panel receives fresh data', async () => {
  browser = new Window();
  for (const name of ['document', 'Element', 'CustomEvent', 'AbortController'] as const) vi.stubGlobal(name, browser[name]);
  const host = document.createElement('div');
  document.body.append(host);
  const state = { login: 'octo', settings: { style: 'trail' as const, goal: 5 as const }, days: [1], streak: 1, warning: null };
  const save = vi.fn(async () => ({ style: 'trail' as const, goal: 8 as const }));
  mountProgressPanel(host, state, save, vi.fn());
  mountProgressPanel(host, state, save, vi.fn());
  (host.querySelector('[data-progress-goal="8"]') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
});
