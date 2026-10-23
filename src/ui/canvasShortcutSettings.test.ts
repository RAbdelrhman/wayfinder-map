import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHORTCUTS_KEY } from '../canvasShortcuts.js';
import { DEFAULT_NOTIFICATION_SETTINGS } from '../notificationTypes.js';

let browser: Window;
let settings: typeof import('./settings.js');
let section: typeof import('./canvasShortcutSettings.js');

beforeEach(async () => {
  browser = new Window({ url: 'http://localhost/settings?section=shortcuts' });
  for (const name of ['document', 'window', 'location', 'history', 'localStorage', 'Element', 'HTMLElement', 'HTMLSelectElement', 'HTMLInputElement', 'CustomEvent', 'PopStateEvent', 'MouseEvent', 'Event'] as const) {
    vi.stubGlobal(name, name === 'window' ? browser : browser[name]);
  }
  vi.stubGlobal('getComputedStyle', browser.getComputedStyle.bind(browser));
  // Node's Web Locks never grant the next request once a callback throws, so the
  // storage-failure test would starve every later save. Chromium releases the lock.
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const data = {
      '/api/auth/status': { status: 'ready', host: 'github.com', login: 'octo', accounts: ['octo'], missingScopes: [], tokenSource: null, message: null, avatarUrl: null },
      '/api/progress': { login: 'octo', settings: { style: 'trail', goal: 5 } },
      '/api/stall-settings': { untouchedClaimDays: 7, deadHandOffDays: 3 },
      '/api/notification-settings': DEFAULT_NOTIFICATION_SETTINGS,
      '/api/models': { providers: [] },
    }[url];
    if (data === undefined) throw new Error(`Unexpected request: ${url}`);
    return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
  }));
  vi.resetModules();
  settings = await import('./settings.js');
  section = await import('./canvasShortcutSettings.js');
});

afterEach(async () => {
  // Detach the page so the section's Saved and arrival timers stop drawing.
  browser.document.body.replaceChildren();
  await browser.happyDOM.abort();
  vi.unstubAllGlobals();
});

function open(options: { canvas?: boolean; stored?: Record<string, string> } = {}): HTMLElement {
  if (options.stored !== undefined) localStorage.setItem(SHORTCUTS_KEY, JSON.stringify({ pin: 'P', element: 'E', color: 'C', note: 'N', panel: 'F', ...options.stored }));
  const root = document.createElement('main');
  root.className = 'settings-page';
  document.body.append(root);
  settings.mountSettingsPage(root, vi.fn(), options);
  return root;
}

const row = (root: ParentNode, tool: string): HTMLButtonElement => root.querySelector<HTMLButtonElement>(`[data-shortcut-edit="${tool}"]`)!;
const item = (root: ParentNode, tool: string): HTMLElement => row(root, tool).closest('li')!;
const help = (root: ParentNode, tool: string): string => root.querySelector(`#shortcut-help-${tool}`)?.textContent ?? '';
const live = (root: ParentNode): string => root.querySelector('#settings-live')?.textContent ?? '';
const stored = (): Record<string, string> | null => JSON.parse(localStorage.getItem(SHORTCUTS_KEY) ?? 'null') as Record<string, string> | null;
const dialog = (): HTMLDialogElement | null => document.querySelector<HTMLDialogElement>('dialog.shortcut-dialog');

/** `altGraph` is what the browser reports for AltGr; Happy DOM wrongly reports it for any Alt. */
function press(key: string, init: Partial<Record<'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey' | 'isComposing' | 'repeat' | 'altGraph', boolean>> = {}): KeyboardEvent {
  const { altGraph = false, ...rest } = init;
  const event = new browser.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...rest }) as unknown as KeyboardEvent;
  const modifier = event.getModifierState.bind(event);
  vi.spyOn(event, 'getModifierState').mockImplementation((name) => (name === 'AltGraph' ? altGraph : modifier(name)));
  (document.activeElement ?? document.body).dispatchEvent(event);
  return event;
}

describe('Settings › Keyboard shortcuts', () => {
  it('lists the five tools with their keys, second in the menu, and Reset disabled with nothing changed', async () => {
    const root = open();
    const links = [...root.querySelectorAll('[data-settings-category]')].map((link) => link.textContent);
    expect(links.slice(0, 2)).toEqual(['Appearance', 'Keyboard shortcuts']);
    expect(root.querySelector('#settings-category-title')?.textContent).toBe('Keyboard shortcuts');
    expect([...root.querySelectorAll('.shortcut-row')].map((button) => button.textContent)).toEqual(['PinP', 'Select elementE', 'Color pickerC', 'NoteN', 'Feedback panelF']);
    expect(row(root, 'pin').getAttribute('aria-label')).toBe('Pin shortcut, P. Change');
    const reset = root.querySelector<HTMLButtonElement>('[data-shortcut-reset]')!;
    expect(reset.getAttribute('aria-disabled')).toBe('true');
    reset.click();
    expect(dialog()).toBeNull();
    await vi.waitFor(() => expect(live(root)).toBe('All five shortcuts already use their defaults.'));
  });

  it('records a key in place, saves it at once and says so on the row and in the heading', async () => {
    const root = open();
    row(root, 'pin').click();
    expect(document.activeElement).toBe(row(root, 'pin'));
    expect(row(root, 'pin').getAttribute('aria-label')).toBe('Recording a new Pin shortcut. Now P.');
    expect(row(root, 'pin').getAttribute('aria-describedby')).toBe('shortcut-help-pin');
    expect(help(root, 'pin')).toBe('Press a letter, or Shift, Alt or Ctrl with a letter. Esc cancels.');
    await vi.waitFor(() => expect(live(root)).toContain('Recording a new Pin shortcut.'));
    press('Shift', { shiftKey: true });
    expect(row(root, 'pin').querySelector('.shortcut-key')?.textContent).toBe('Shift+…');
    press('P', { shiftKey: true });
    await vi.waitFor(() => expect(stored()?.['pin']).toBe('Shift+P'));
    await vi.waitFor(() => expect(item(root, 'pin').querySelector('.shortcut-saved')?.textContent).toBe('Saved'));
    expect(root.querySelector('.shortcut-saved')).toBe(item(root, 'pin').querySelector('.shortcut-saved'));
    expect(root.querySelector('#settings-save-note')?.textContent).toBe('Saved · Pin is now Shift+P');
    expect(row(root, 'pin').getAttribute('aria-label')).toBe('Pin shortcut, Shift plus P, changed from P. Change');
    expect(document.activeElement).toBe(row(root, 'pin'));
    await vi.waitFor(() => expect(live(root)).toBe('Saved. Pin is now Shift plus P.'));
    expect(root.querySelector<HTMLButtonElement>('[data-shortcut-reset]')?.hasAttribute('aria-disabled')).toBe(false);
  });

  it('saves physical Ctrl+Alt with a letter, and lets the same letter typed with AltGr pass', async () => {
    const root = open();
    row(root, 'note').click();
    expect(press('m', { ctrlKey: true, altKey: true, altGraph: true }).defaultPrevented).toBe(false);
    expect(row(root, 'note').getAttribute('aria-label')).toBe('Recording a new Note shortcut. Now N.');
    press('p', { ctrlKey: true, altKey: true });
    await vi.waitFor(() => expect(stored()?.['note']).toBe('Ctrl+Alt+P'));
  });

  it('refuses a key another tool has, names it, and Escape keeps the old key', async () => {
    const root = open();
    row(root, 'pin').click();
    const event = press('c');
    expect(event.defaultPrevented).toBe(true);
    expect(item(root, 'pin').classList.contains('is-error')).toBe(true);
    expect(help(root, 'pin')).toBe('C is already Color picker. Press another key, or Esc to keep P. Change Color picker instead');
    await vi.waitFor(() => expect(live(root)).toBe('C is already Color picker. Press another key, or Escape to keep P.'));
    expect(stored()).toBeNull();
    expect(document.activeElement).toBe(row(root, 'pin'));
    press('Escape');
    expect(root.querySelector('.shortcut-help')).toBeNull();
    expect(row(root, 'pin').textContent).toBe('PinP');
    expect(document.activeElement).toBe(row(root, 'pin'));
    await vi.waitFor(() => expect(live(root)).toBe('Kept P for Pin.'));
  });

  it('moves to the tool named in a clash', () => {
    const root = open();
    row(root, 'pin').click();
    press('c');
    root.querySelector<HTMLButtonElement>('[data-shortcut-fix="color"]')!.click();
    expect(row(root, 'color').getAttribute('aria-label')).toBe('Recording a new Color picker shortcut. Now C.');
    expect(row(root, 'pin').textContent).toBe('PinP');
  });

  it('names the app or browser action that owns a combination', () => {
    const root = open();
    row(root, 'pin').click();
    press('P', { ctrlKey: true, shiftKey: true });
    expect(help(root, 'pin')).toContain('Ctrl+Shift+P is System print dialog.');
    press('k', { ctrlKey: true });
    expect(help(root, 'pin')).toContain('Ctrl+K is Wayfinder’s Jump to.');
    expect(stored()).toBeNull();
  });

  it('refuses the Windows key and non-letters, and lets composition, dead keys and AltGr pass', () => {
    const root = open();
    row(root, 'pin').click();
    expect(press('a', { isComposing: true }).defaultPrevented).toBe(false);
    expect(press('Dead').defaultPrevented).toBe(false);
    expect(press('AltGraph').defaultPrevented).toBe(false);
    expect(root.querySelector('.shortcut-help.is-error')).toBeNull();
    press('p', { metaKey: true });
    expect(help(root, 'pin')).toContain('The Windows key belongs to the system. Use Shift, Alt or Ctrl.');
    press('1');
    expect(help(root, 'pin')).toContain('Use a letter, alone or with Shift, Alt or Ctrl.');
    expect(stored()).toBeNull();
  });

  it('keeps recording and saves nothing when storage refuses the write', async () => {
    const root = open();
    vi.spyOn(browser.localStorage, 'setItem').mockImplementation(() => { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); });
    row(root, 'pin').click();
    press('P', { shiftKey: true });
    await vi.waitFor(() => expect(help(root, 'pin')).toBe('Could not save the shortcut on this machine. Press another key, or Esc to keep P.'));
    expect(root.querySelector('.shortcut-saved')).toBeNull();
    expect(root.querySelector('#settings-save-note')?.textContent).toBe('Changes save automatically');
    expect(row(root, 'pin').querySelector('.shortcut-key')?.textContent).toBe('Press a key…');
  });

  it('resets only the changed shortcuts after a confirmation that lists them, with Cancel first', async () => {
    const root = open({ stored: { pin: 'Shift+P', note: 'M' } });
    root.querySelector<HTMLButtonElement>('[data-shortcut-reset]')!.click();
    expect(dialog()?.open).toBe(true);
    expect(dialog()?.querySelector('h2')?.textContent).toBe('Reset 2 changed shortcuts?');
    expect([...dialog()!.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['PinShift+P→, goes back toP', 'NoteM→, goes back toN']);
    expect(document.activeElement).toBe(dialog()?.querySelector('[data-shortcut-result="cancel"]'));

    dialog()!.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }) as unknown as Event);
    expect(dialog()).toBeNull();
    expect(stored()).toMatchObject({ pin: 'Shift+P', note: 'M' });
    expect(document.activeElement).toBe(root.querySelector('[data-shortcut-reset]'));

    root.querySelector<HTMLButtonElement>('[data-shortcut-reset]')!.click();
    dialog()!.querySelector<HTMLButtonElement>('[data-shortcut-result="reset"]')!.click();
    await vi.waitFor(() => expect(stored()).toEqual({ pin: 'P', element: 'E', color: 'C', note: 'N', panel: 'F' }));
    await vi.waitFor(() => expect(live(root)).toBe('Saved. 2 shortcuts restored to defaults.'));
    expect([...root.querySelectorAll('.shortcut-saved')].map((mark) => mark.closest('[data-shortcut-edit]')?.getAttribute('data-shortcut-edit'))).toEqual(['pin', 'note']);
    expect(root.querySelector('#settings-save-note')?.textContent).toBe('Saved · 2 shortcuts restored to defaults');
    expect(document.activeElement).toBe(root.querySelector('#settings-category-title'));
    expect(root.querySelector('[data-shortcut-reset]')?.getAttribute('aria-disabled')).toBe('true');
  });

  it('counts one changed shortcut in the singular and Cancel keeps it', () => {
    const root = open({ stored: { panel: 'G' } });
    root.querySelector<HTMLButtonElement>('[data-shortcut-reset]')!.click();
    expect(dialog()?.querySelector('h2')?.textContent).toBe('Reset 1 changed shortcut?');
    expect(dialog()?.querySelectorAll('li')).toHaveLength(1);
    dialog()!.querySelector<HTMLButtonElement>('[data-shortcut-result="cancel"]')!.click();
    expect(dialog()).toBeNull();
    expect(stored()?.['panel']).toBe('G');
  });

  it('leaves a shortcut changed elsewhere after the confirmation opened', async () => {
    const root = open({ stored: { pin: 'Shift+P', note: 'M' } });
    root.querySelector<HTMLButtonElement>('[data-shortcut-reset]')!.click();
    localStorage.setItem(SHORTCUTS_KEY, JSON.stringify({ pin: 'Alt+P', element: 'E', color: 'C', note: 'M', panel: 'F' }));
    dialog()!.querySelector<HTMLButtonElement>('[data-shortcut-result="reset"]')!.click();
    await vi.waitFor(() => expect(live(root)).toBe('Saved. 1 shortcut restored to default.'));
    expect(stored()).toMatchObject({ pin: 'Alt+P', note: 'N' });
    expect(root.querySelectorAll('.shortcut-saved')).toHaveLength(1);
    expect(item(root, 'note').querySelector('.shortcut-saved')).not.toBeNull();
  });

  it('shows a key saved in another tab', () => {
    const root = open();
    localStorage.setItem(SHORTCUTS_KEY, JSON.stringify({ pin: 'Q', element: 'E', color: 'C', note: 'N', panel: 'F' }));
    window.dispatchEvent(new browser.StorageEvent('storage', { key: SHORTCUTS_KEY }) as unknown as Event);
    expect(row(root, 'pin').textContent).toBe('PinQ');
  });
});

describe('Settings inside the canvas viewer', () => {
  it('names the canvas and its open option once the viewer sends them, and ignores other senders', () => {
    const parent = {};
    vi.stubGlobal('window', Object.assign(browser, { parent }));
    const topbar = document.createElement('header');
    section.mountCanvasReturn(topbar);
    const back = topbar.querySelector<HTMLButtonElement>('[data-canvas-return]')!;
    const context = back.querySelector<HTMLElement>('.settings-canvas-context')!;
    expect(back.textContent).toBe('Back to canvas');
    expect(context.hidden).toBe(true);
    const send = (data: unknown, source: unknown = parent, origin = 'http://localhost'): void => {
      const event = new browser.MessageEvent('message', { data, origin });
      Object.defineProperty(event, 'source', { value: source });
      browser.dispatchEvent(event);
    };
    send({ type: 'wayfinder:canvas-context', title: 'Spoofed', option: 'A' }, {});
    send({ type: 'wayfinder:canvas-context', title: 'Spoofed', option: 'A' }, parent, 'http://evil.test');
    expect(context.hidden).toBe(true);
    send({ type: 'wayfinder:canvas-context', title: 'Home redesign', option: 'B' });
    expect(context.hidden).toBe(false);
    expect(back.textContent).toBe('Back to canvasHome redesign · B');
    expect(back.getAttribute('aria-label')).toBe('Back to canvas: Home redesign, option B');
    send({ type: 'wayfinder:canvas-context', title: '<img src=x>', option: null });
    expect(back.querySelector('img')).toBeNull();
    expect(context.textContent).toBe('<img src=x> · Board');
    expect(back.getAttribute('aria-label')).toBe('Back to canvas: <img src=x>, the board');
  });

  it('focuses the Keyboard shortcuts heading and keeps canvas=1 without adding history entries', async () => {
    const root = open({ canvas: true });
    expect(document.activeElement).toBe(root.querySelector('#settings-category-title'));
    expect(root.querySelector('.shortcut-section')?.classList.contains('is-arriving')).toBe(true);
    await vi.waitFor(() => expect(live(root)).toBe('Settings, Keyboard shortcuts. Back to canvas returns to the viewer.'));
    const link = root.querySelector<HTMLAnchorElement>('[data-settings-category="tasks"]')!;
    expect(link.getAttribute('href')).toBe('/settings?section=tasks&canvas=1');
    const entries = history.length;
    link.click();
    expect(history.length).toBe(entries);
    expect(location.search).toBe('?section=tasks&canvas=1');
    expect(root.querySelector('[data-settings-category="shortcuts"]')?.getAttribute('href')).toBe('/settings?section=shortcuts&canvas=1');
  });

  it('pushes history and drops canvas=1 on the ordinary Settings page', () => {
    const root = open();
    expect(root.querySelector('[data-settings-category="tasks"]')?.getAttribute('href')).toBe('/settings?section=tasks');
    const entries = history.length;
    root.querySelector<HTMLAnchorElement>('[data-settings-category="tasks"]')!.click();
    expect(history.length).toBe(entries + 1);
    expect(document.activeElement).not.toBe(root.querySelector('#settings-category-title'));
  });

  it('detects the canvas frame only when framed with canvas=1', () => {
    expect(section.inCanvasFrame()).toBe(false);
    vi.stubGlobal('window', Object.assign(Object.create(browser) as Window, { parent: {} }));
    expect(section.inCanvasFrame()).toBe(false);
    history.replaceState(null, '', '/settings?section=shortcuts&canvas=1');
    expect(section.inCanvasFrame()).toBe(true);
  });

  it('puts Back to canvas before the title and asks the viewer, at this origin, to return', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('window', Object.assign(Object.create(browser) as Window, { parent: { postMessage } }));
    const topbar = document.createElement('header');
    const title = document.createElement('div');
    title.id = 'nav-topbar';
    topbar.append(title);
    section.mountCanvasReturn(topbar);
    const back = topbar.querySelector<HTMLButtonElement>('[data-canvas-return]')!;
    expect(topbar.firstElementChild).toBe(back);
    expect(back.textContent).toBe('Back to canvas');
    expect(back.hasAttribute('aria-label')).toBe(false);
    expect(topbar.querySelectorAll('button')).toHaveLength(1);
    back.click();
    expect(postMessage).toHaveBeenCalledWith({ type: 'wayfinder:canvas-return' }, 'http://localhost');
  });
});
