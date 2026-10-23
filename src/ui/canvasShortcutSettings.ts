import { resetShortcuts, saveShortcut, shortcutAssignments, shortcutFromEvent, shortcutProblem, SHORTCUT_TOOLS, SHORTCUTS_CHANGED, SHORTCUTS_KEY } from '../canvasShortcuts.js';
import type { ShortcutAssignments, ShortcutTool } from '../canvasShortcuts.js';
import { FEEDBACK_ICONS } from './canvasFeedback.js';
import { ALERT, CHECK, icon } from './icons.js';
import { escapeHtml } from './markdown.js';
import { setTrustedHtml } from './trustedHtml.js';

/*
  Settings › Keyboard shortcuts (#318, prototype #292 D): compact rows that record a key in place,
  a clash named under the row, and a reset that lists and restores only the changed keys.
*/

export const KEYBOARD = '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>';
const UNDO = '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>';
const TOOL_ICON: Record<ShortcutTool, string> = { pin: FEEDBACK_ICONS.pin, element: FEEDBACK_ICONS.cursor, color: FEEDBACK_ICONS.drop, note: FEEDBACK_ICONS.note, panel: FEEDBACK_ICONS.panel };
const NAME = Object.fromEntries(SHORTCUT_TOOLS.map((tool) => [tool.id, tool.name])) as Record<ShortcutTool, string>;
const MODIFIERS: Record<string, string> = { Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift' };
const SAVED_MS = 5000;

export interface ShortcutView {
  assignments: ShortcutAssignments;
  /** The tool whose key is being recorded, and the modifiers held so far. */
  capturing: ShortcutTool | null;
  pending: readonly string[];
  /** A refused key, under the row being recorded; owner is the tool that already has it. */
  error: { tool: ShortcutTool; owner: ShortcutTool | null; text: string } | null;
  /** The last durable save, marked only on the rows it changed. */
  saved: { tools: readonly ShortcutTool[]; text: string } | null;
}

const spoken = (key: string): string => key.split('+').map((part) => (part === 'Ctrl' ? 'Control' : part)).join(' plus ');
const plus = '<span class="shortcut-plus" aria-hidden="true">+</span>';
const kbd = (key: string): string => key.split('+').map((part) => `<kbd>${escapeHtml(part)}</kbd>`).join(plus);
const plural = (count: number, word: string): string => `${String(count)} ${word}${count === 1 ? '' : 's'}`;
const changedTools = (assignments: ShortcutAssignments): ShortcutTool[] => SHORTCUT_TOOLS.filter((tool) => assignments[tool.id] !== tool.key).map((tool) => tool.id);

function helpHtml(view: ShortcutView, tool: ShortcutTool): string {
  const error = view.error?.tool === tool ? view.error : null;
  if (error === null) return `<p class="shortcut-help" id="shortcut-help-${tool}"><span>Press a letter, or Shift, Alt or Ctrl with a letter. <kbd>Esc</kbd> cancels.</span></p>`;
  const fix = error.owner === null ? '' : ` <button type="button" class="linkish shortcut-fix" data-shortcut-fix="${error.owner}">Change ${escapeHtml(NAME[error.owner])} instead</button>`;
  return `<p class="shortcut-help is-error" id="shortcut-help-${tool}">${icon(ALERT)}<span>${escapeHtml(error.text)} Press another key, or <kbd>Esc</kbd> to keep ${escapeHtml(view.assignments[tool])}.${fix}</span></p>`;
}

function rowHtml(view: ShortcutView, tool: (typeof SHORTCUT_TOOLS)[number]): string {
  const key = view.assignments[tool.id];
  const capturing = view.capturing === tool.id;
  const changed = key !== tool.key;
  const label = capturing ? `Recording a new ${tool.name} shortcut. Now ${spoken(key)}.` : `${tool.name} shortcut, ${spoken(key)}${changed ? `, changed from ${spoken(tool.key)}` : ''}. Change`;
  const mark = !capturing && view.saved?.tools.includes(tool.id) === true
    ? `<span class="shortcut-saved">${icon(CHECK)}Saved</span>`
    : changed && !capturing ? '<span class="shortcut-dot" aria-hidden="true"></span>' : '';
  const listening = view.pending.length > 0
    ? `${view.pending.map((part) => `<kbd>${escapeHtml(part)}</kbd>`).join(plus)}${plus}<span class="shortcut-wait">…</span>`
    : '<span class="shortcut-wait">Press a key…</span>';
  return `<li class="shortcut-item${capturing ? ' is-capturing' : ''}${view.error?.tool === tool.id ? ' is-error' : ''}"><button type="button" class="shortcut-row" data-shortcut-edit="${tool.id}"${capturing ? ` aria-describedby="shortcut-help-${tool.id}"` : ''} aria-label="${escapeHtml(label)}"><span class="shortcut-icon">${icon(TOOL_ICON[tool.id])}</span><span class="grow">${escapeHtml(tool.name)}</span>${mark}<span class="shortcut-key${capturing ? ' is-capturing' : ''}">${capturing ? listening : kbd(key)}</span></button>${capturing ? helpHtml(view, tool.id) : ''}</li>`;
}

/** The category body: the five rows and the footer with Reset. */
export function shortcutSectionHtml(view: ShortcutView): string {
  const none = changedTools(view.assignments).length === 0;
  return `<section class="settings-section shortcut-section" aria-labelledby="settings-category-title"><ul class="shortcut-list" aria-label="Canvas viewer shortcuts">${SHORTCUT_TOOLS.map((tool) => rowHtml(view, tool)).join('')}</ul>
    <div class="shortcut-foot"><span>Defaults: ${SHORTCUT_TOOLS.map((tool) => tool.key).slice(0, -1).join(', ')} and ${SHORTCUT_TOOLS[SHORTCUT_TOOLS.length - 1]!.key}</span><button type="button" class="ghost" data-shortcut-reset${none ? ' aria-disabled="true"' : ''}>${icon(UNDO)}Reset…</button></div></section>`;
}

/** The confirmation lists only the changed keys, each struck through beside its default. */
export function resetDialogHtml(assignments: ShortcutAssignments, tools: readonly ShortcutTool[]): string {
  const items = SHORTCUT_TOOLS.filter((tool) => tools.includes(tool.id))
    .map((tool) => `<li><span class="shortcut-icon">${icon(TOOL_ICON[tool.id])}</span><span class="grow">${escapeHtml(tool.name)}</span><span class="shortcut-was">${kbd(assignments[tool.id])}</span><span class="shortcut-arrow" aria-hidden="true">→</span><span class="shortcut-sr">, goes back to</span>${kbd(tool.key)}</li>`)
    .join('');
  return `<div class="dialog-head"><h2 id="shortcut-reset-title">Reset ${plural(tools.length, 'changed shortcut')}?</h2></div><p class="hint" id="shortcut-reset-desc">Only the shortcuts below return to their defaults and save immediately.</p><ul class="shortcut-reset-list">${items}</ul><div class="shortcut-dialog-foot"><button type="button" class="ghost" data-shortcut-result="cancel">Cancel</button><button type="button" class="primary" data-shortcut-result="reset">Reset shortcuts</button></div>`;
}

/** A clash or a storage error from the shared store, in words for the row. */
function failureText(error: unknown, fallback: string): string {
  return error instanceof Error && error.name === 'Error' && error.message !== '' ? error.message : fallback;
}

export interface ShortcutSettings {
  view(): ShortcutView;
  /** Whether the section should show its arrival highlight. */
  arriving(): boolean;
  arrive(): void;
  /** Stop recording without a word, when Settings leaves the category. */
  stop(): void;
}

/**
 * Own the section's state and its events. `redraw` repaints the Settings body from `view()`;
 * `active` says whether Keyboard shortcuts is the open category.
 */
export function mountShortcutSettings(options: { body: HTMLElement; redraw: () => void; announce: (text: string) => void; active: () => boolean }): ShortcutSettings {
  const { body, redraw, announce } = options;
  let state: ShortcutView = { assignments: shortcutAssignments(), capturing: null, pending: [], error: null, saved: null };
  let saving = false;
  let dialog: HTMLDialogElement | null = null;
  let arriving = false;
  let savedTimer: ReturnType<typeof setTimeout> | undefined;
  let arriveTimer: ReturnType<typeof setTimeout> | undefined;

  const paint = (focus?: string): void => {
    // Timers outlive a page that has gone; they must not draw into it.
    if (!options.active() || !body.isConnected) return;
    redraw();
    if (focus !== undefined) document.querySelector<HTMLElement>(focus)?.focus();
  };
  const rowSelector = (tool: ShortcutTool): string => `[data-shortcut-edit="${tool}"]`;
  const ownerOf = (tool: ShortcutTool, key: string): ShortcutTool | null => SHORTCUT_TOOLS.find((candidate) => candidate.id !== tool && state.assignments[candidate.id] === key)?.id ?? null;
  const showSaved = (saved: ShortcutView['saved']): void => {
    clearTimeout(savedTimer);
    state = { ...state, saved };
    savedTimer = setTimeout(() => {
      state = { ...state, saved: null };
      paint();
    }, SAVED_MS);
  };

  const start = (tool: ShortcutTool): void => {
    clearTimeout(savedTimer);
    state = { ...state, capturing: tool, pending: [], error: null, saved: null };
    paint(rowSelector(tool));
    announce(`Recording a new ${NAME[tool]} shortcut. Press a letter, or Shift, Alt or Control with a letter. Escape cancels.`);
  };
  const cancel = (refocus: boolean): void => {
    const tool = state.capturing;
    if (tool === null) return;
    state = { ...state, capturing: null, pending: [], error: null };
    paint(refocus ? rowSelector(tool) : undefined);
    announce(`Kept ${spoken(state.assignments[tool])} for ${NAME[tool]}.`);
  };
  const refuse = (tool: ShortcutTool, text: string, owner: ShortcutTool | null): void => {
    state = { ...state, capturing: tool, pending: [], error: { tool, owner, text } };
    paint(rowSelector(tool));
    announce(`${text} Press another key, or Escape to keep ${spoken(state.assignments[tool])}.`);
  };

  const commit = async (tool: ShortcutTool, key: string): Promise<void> => {
    if (state.assignments[tool] === key) {
      state = { ...state, capturing: null, pending: [], error: null };
      paint(rowSelector(tool));
      announce(`${NAME[tool]} stays ${spoken(key)}.`);
      return;
    }
    saving = true;
    try {
      const assignments = await saveShortcut(tool, key);
      state = { ...state, assignments, capturing: null, pending: [], error: null };
      showSaved({ tools: [tool], text: `${NAME[tool]} is now ${key}` });
      paint(rowSelector(tool));
      announce(`Saved. ${NAME[tool]} is now ${spoken(key)}.`);
    } catch (error) {
      // Nothing saved: show what the store now holds, and keep recording.
      state = { ...state, assignments: shortcutAssignments() };
      refuse(tool, failureText(error, 'Could not save the shortcut on this machine.'), ownerOf(tool, key));
    } finally {
      saving = false;
    }
  };

  const finishReset = async (expected: Partial<ShortcutAssignments>): Promise<void> => {
    try {
      const { assignments, restored } = await resetShortcuts(expected);
      state = { ...state, assignments };
      if (restored.length === 0) {
        paint('[data-shortcut-reset]');
        announce('Those shortcuts changed elsewhere, so nothing was reset.');
        return;
      }
      const text = `${plural(restored.length, 'shortcut')} restored to default${restored.length === 1 ? '' : 's'}`;
      showSaved({ tools: restored, text });
      paint('#settings-category-title');
      announce(`Saved. ${text}.`);
    } catch (error) {
      state = { ...state, assignments: shortcutAssignments() };
      paint('[data-shortcut-reset]');
      announce(failureText(error, 'Could not reset the shortcuts on this machine.'));
    }
  };

  const openReset = (): void => {
    const tools = changedTools(state.assignments);
    if (tools.length === 0) {
      announce('All five shortcuts already use their defaults.');
      return;
    }
    if (state.capturing !== null) state = { ...state, capturing: null, pending: [], error: null };
    const expected: Partial<ShortcutAssignments> = Object.fromEntries(tools.map((tool) => [tool, state.assignments[tool]]));
    const opened = document.createElement('dialog');
    opened.className = 'dialog shortcut-dialog';
    opened.setAttribute('aria-labelledby', 'shortcut-reset-title');
    opened.setAttribute('aria-describedby', 'shortcut-reset-desc');
    setTrustedHtml(opened, resetDialogHtml(state.assignments, tools));
    dialog = opened;
    const finish = (result: 'cancel' | 'reset'): void => {
      if (dialog !== opened) return;
      dialog = null;
      if (opened.open) opened.close();
      opened.remove();
      if (result === 'reset') void finishReset(expected);
      else document.querySelector<HTMLElement>('[data-shortcut-reset]')?.focus();
    };
    // Explicit actions, not form submission: the canvas frame blocks forms.
    opened.addEventListener('click', (event) => {
      const result = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-shortcut-result]')?.dataset['shortcutResult'] : undefined;
      if (result === 'cancel' || result === 'reset') finish(result);
    });
    opened.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish('cancel');
    });
    opened.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      finish('cancel');
    });
    document.body.append(opened);
    opened.showModal();
    opened.querySelector<HTMLElement>('[data-shortcut-result="cancel"]')?.focus();
  };

  body.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target === null || saving) return;
    const edit = target.closest<HTMLElement>('[data-shortcut-edit]')?.dataset['shortcutEdit'] as ShortcutTool | undefined;
    if (edit !== undefined && SHORTCUT_TOOLS.some((tool) => tool.id === edit)) {
      if (state.capturing === edit) cancel(true);
      else start(edit);
      return;
    }
    const fix = target.closest<HTMLElement>('[data-shortcut-fix]')?.dataset['shortcutFix'] as ShortcutTool | undefined;
    if (fix !== undefined && SHORTCUT_TOOLS.some((tool) => tool.id === fix)) {
      start(fix);
      return;
    }
    if (target.closest('[data-shortcut-reset]') !== null) openReset();
  });
  // A click anywhere else stops recording, as Tab does.
  document.addEventListener('click', (event) => {
    if (state.capturing === null || !(event.target instanceof Element)) return;
    if (event.target.closest(`${rowSelector(state.capturing)}, [data-shortcut-fix]`) === null) cancel(false);
  });

  // Capture phase on window, so recording a key outruns the page's own shortcuts.
  window.addEventListener('keydown', (event) => {
    const tool = state.capturing;
    if (tool === null || dialog !== null) return;
    if (event.key === 'Tab') {
      cancel(false);
      return;
    }
    // IME composition, dead keys and AltGr are text entry, not shortcuts: let them pass silently.
    if (event.isComposing || event.keyCode === 229 || event.key === 'Process' || event.key === 'Dead' || event.key === 'AltGraph' || event.getModifierState('AltGraph')) return;
    event.preventDefault();
    event.stopPropagation();
    if (saving || event.repeat) return;
    if (event.key === 'Escape') {
      cancel(true);
      return;
    }
    if (event.key === 'Meta' || event.metaKey) {
      refuse(tool, 'The Windows key belongs to the system. Use Shift, Alt or Ctrl.', null);
      return;
    }
    if (event.key in MODIFIERS) {
      state = { ...state, pending: [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift'].filter((part): part is string => part !== false) };
      paint(rowSelector(tool));
      return;
    }
    const key = shortcutFromEvent(event);
    if (key === null) {
      refuse(tool, 'Use a letter, alone or with Shift, Alt or Ctrl.', null);
      return;
    }
    const problem = key === state.assignments[tool] ? null : shortcutProblem(state.assignments, tool, key);
    if (problem !== null) refuse(tool, problem, ownerOf(tool, key));
    else void commit(tool, key);
  }, true);
  window.addEventListener('keyup', (event) => {
    const tool = state.capturing;
    if (tool === null || state.pending.length === 0) return;
    const pending = [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift'].filter((part): part is string => part !== false);
    if (pending.join() === state.pending.join()) return;
    state = { ...state, pending };
    paint(rowSelector(tool));
  });

  // Another tab, the viewer or this page saved: re-read. Reading twice writes nothing.
  const reread = (): void => {
    const assignments = shortcutAssignments();
    if (JSON.stringify(assignments) === JSON.stringify(state.assignments)) return;
    state = { ...state, assignments };
    paint();
  };
  window.addEventListener(SHORTCUTS_CHANGED, reread);
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === SHORTCUTS_KEY) reread();
  });

  return {
    view: () => state,
    arriving: () => arriving,
    arrive: () => {
      arriving = true;
      clearTimeout(arriveTimer);
      arriveTimer = setTimeout(() => {
        arriving = false;
        body.querySelector('.shortcut-section')?.classList.remove('is-arriving');
      }, 1800);
    },
    stop: () => {
      state = { ...state, capturing: null, pending: [], error: null };
    },
  };
}

/** Opened from the canvas viewer's Shortcuts button, inside its same-origin frame (#318). */
export function inCanvasFrame(): boolean {
  return window.parent !== window && new URLSearchParams(location.search).get('canvas') === '1';
}

/**
 * Back to canvas, before the page title. The viewer checks this message's origin and source, and
 * sends back the canvas title and open option once the frame loads, so the button can name them.
 */
export function mountCanvasReturn(topbar: HTMLElement): void {
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'ghost settings-canvas-return';
  back.dataset['canvasReturn'] = '';
  setTrustedHtml(back, `${icon(FEEDBACK_ICONS.left)}Back to canvas`);
  const context = document.createElement('span');
  context.className = 'settings-canvas-context';
  context.setAttribute('aria-hidden', 'true');
  context.hidden = true;
  back.append(context);
  const separator = document.createElement('span');
  separator.className = 'vw-sep';
  separator.setAttribute('aria-hidden', 'true');
  topbar.prepend(back, separator);
  back.addEventListener('click', () => { window.parent.postMessage({ type: 'wayfinder:canvas-return' }, location.origin); });
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.source !== window.parent || event.origin !== location.origin) return;
    const data = event.data as { type?: unknown; title?: unknown; option?: unknown } | null;
    if (typeof data !== 'object' || data === null || data.type !== 'wayfinder:canvas-context') return;
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    const option = typeof data.option === 'string' && data.option.trim() !== '' ? data.option.trim() : null;
    if (title === '') return;
    context.textContent = `${title} · ${option ?? 'Board'}`;
    context.hidden = false;
    back.setAttribute('aria-label', `Back to canvas: ${title}, ${option === null ? 'the board' : `option ${option}`}`);
  });
}
