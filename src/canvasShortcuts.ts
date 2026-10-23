export const SHORTCUT_TOOLS = [
  { id: 'pin', name: 'Pin', key: 'P' },
  { id: 'element', name: 'Select element', key: 'E' },
  { id: 'color', name: 'Color picker', key: 'C' },
  { id: 'note', name: 'Note', key: 'N' },
  { id: 'panel', name: 'Feedback panel', key: 'F' },
] as const;
export type ShortcutTool = (typeof SHORTCUT_TOOLS)[number]['id'];
export type ShortcutAssignments = Record<ShortcutTool, string>;
export const SHORTCUTS_KEY = 'wayfinder-map:canvas-shortcuts';
export const SHORTCUTS_CHANGED = 'wayfinder:canvas-shortcuts';

/** Canonical storage, display and wire format. No physical key codes or Meta bindings. */
export function normalizeShortcut(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 64) return null;
  const parts = value.trim().split('+').map((part) => part.trim().toLowerCase());
  const key = parts.pop();
  if (!key || !/^[a-z]$/.test(key) || new Set(parts).size !== parts.length || parts.some((part) => !['ctrl', 'alt', 'shift'].includes(part))) return null;
  return [...(parts.includes('ctrl') ? ['Ctrl'] : []), ...(parts.includes('alt') ? ['Alt'] : []), ...(parts.includes('shift') ? ['Shift'] : []), key.toUpperCase()].join('+');
}

export function shortcutFromEvent(event: KeyboardEvent, includeRepeat = false): string | null {
  if (event.isComposing || event.keyCode === 229 || (event.repeat && !includeRepeat) || event.metaKey || event.getModifierState?.('AltGraph') || !/^[a-z]$/i.test(event.key)) return null;
  return [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.key.toUpperCase()].filter(Boolean).join('+');
}

// Chromium Windows/Linux shortcuts, also reserved in desktop so a saved assignment works in both.
// https://support.google.com/chrome/answer/157179?hl=en
export const RESERVED_SHORTCUTS: Readonly<Record<string, string>> = {
  'Ctrl+A': 'Select all', 'Ctrl+C': 'Copy', 'Ctrl+V': 'Paste', 'Ctrl+X': 'Cut',
  'Ctrl+Z': 'Undo', 'Ctrl+Y': 'Redo', 'Ctrl+Shift+Z': 'Redo',
  'Ctrl+B': 'Bold', 'Ctrl+D': 'Bookmark this page', 'Ctrl+E': 'Search',
  'Ctrl+F': 'Find', 'Ctrl+G': 'Find next', 'Ctrl+Shift+G': 'Find previous',
  'Ctrl+H': 'History', 'Ctrl+J': 'Downloads', 'Ctrl+K': 'Wayfinder’s Jump to',
  'Ctrl+L': 'Address bar', 'Ctrl+N': 'New window', 'Ctrl+O': 'Open file',
  'Ctrl+P': 'Print', 'Ctrl+R': 'Reload', 'Ctrl+S': 'Save page',
  'Ctrl+T': 'New tab', 'Ctrl+U': 'View source', 'Ctrl+W': 'Close window',
  'Ctrl+Shift+A': 'Search tabs', 'Ctrl+Shift+B': 'Bookmarks bar',
  'Ctrl+Shift+C': 'Inspect element', 'Ctrl+Shift+D': 'Bookmark all tabs',
  'Ctrl+Shift+H': 'Select multiple tabs', 'Ctrl+Shift+I': 'Developer tools',
  'Ctrl+Shift+J': 'Developer console', 'Ctrl+Shift+M': 'Browser profile menu',
  'Ctrl+Shift+N': 'Incognito window',
  'Ctrl+Shift+O': 'Bookmark manager', 'Ctrl+Shift+P': 'System print dialog',
  'Ctrl+Shift+R': 'Reload without cache', 'Ctrl+Shift+T': 'Reopen closed tab',
  'Ctrl+Shift+W': 'Close window', 'Ctrl+Shift+V': 'Paste as plain text',
  'Alt+D': 'Address bar', 'Alt+E': 'Browser menu', 'Alt+F': 'Browser menu',
  'Alt+Shift+A': 'Inactive dialog focus', 'Alt+Shift+B': 'Bookmarks bar focus',
  'Alt+Shift+I': 'Send browser feedback', 'Alt+Shift+N': 'Split view',
  'Alt+Shift+T': 'Browser toolbar focus',
  'Ctrl+Shift+K': 'Wayfinder’s Jump to', 'Ctrl+Alt+K': 'Wayfinder’s Jump to',
  'Ctrl+Alt+Shift+K': 'Wayfinder’s Jump to',
};

export function shortcutProblem(assignments: ShortcutAssignments, tool: ShortcutTool, key: string): string | null {
  const normalized = normalizeShortcut(key);
  if (normalized === null) return 'Use a letter, alone or with Shift, Alt or Ctrl.';
  const reserved = RESERVED_SHORTCUTS[normalized];
  if (reserved) return `${normalized} is ${reserved}.`;
  const owner = SHORTCUT_TOOLS.find((candidate) => candidate.id !== tool && assignments[candidate.id] === normalized);
  return owner ? `${normalized} is already ${owner.name}.` : null;
}

const defaults = (): ShortcutAssignments => ({ pin: 'P', element: 'E', color: 'C', note: 'N', panel: 'F' });

/** Accept the complete valid snapshot or defaults. Partial repair could introduce a clash. */
export function readShortcutAssignments(value: unknown): ShortcutAssignments {
  const result = defaults();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return result;
  const stored = value as Record<string, unknown>;
  for (const tool of SHORTCUT_TOOLS) {
    const key = normalizeShortcut(stored[tool.id]);
    if (!key || RESERVED_SHORTCUTS[key]) return defaults();
    result[tool.id] = key;
  }
  return new Set(Object.values(result)).size === SHORTCUT_TOOLS.length ? result : defaults();
}

export function shortcutAssignments(): ShortcutAssignments {
  try { return readShortcutAssignments(JSON.parse(localStorage.getItem(SHORTCUTS_KEY) ?? 'null') as unknown); }
  catch { return defaults(); }
}

async function update<T>(operation: (current: ShortcutAssignments) => { assignments: ShortcutAssignments; result: T }): Promise<T> {
  const run = (): T => {
    // A failed read is unknown, not permission to overwrite another tab's assignments.
    const raw = localStorage.getItem(SHORTCUTS_KEY);
    let stored: unknown = null;
    try { stored = JSON.parse(raw ?? 'null') as unknown; } catch { /* Invalid snapshots use defaults. */ }
    const current = readShortcutAssignments(stored);
    const { assignments, result } = operation(current);
    // Do not announce Saved or change handlers if storage refused the write.
    if (JSON.stringify(current) !== JSON.stringify(assignments)) localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(assignments));
    window.dispatchEvent(new Event(SHORTCUTS_CHANGED));
    return result;
  };
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(SHORTCUTS_KEY, run);
  return run();
}

export function saveShortcut(tool: ShortcutTool, key: string): Promise<ShortcutAssignments> {
  return update((current) => {
    const problem = shortcutProblem(current, tool, key);
    if (problem) throw new Error(problem);
    const assignments = { ...current, [tool]: normalizeShortcut(key)! };
    return { assignments, result: assignments };
  });
}

export function resetShortcuts(expected?: Partial<ShortcutAssignments>): Promise<{ assignments: ShortcutAssignments; restored: ShortcutTool[] }> {
  return update((current) => {
    const assignments = { ...current };
    const restored: ShortcutTool[] = [];
    for (const tool of SHORTCUT_TOOLS) {
      if (current[tool.id] !== tool.key && (expected === undefined || expected[tool.id] === current[tool.id])) {
        assignments[tool.id] = tool.key;
        restored.push(tool.id);
      }
    }
    for (const tool of SHORTCUT_TOOLS) {
      const problem = shortcutProblem(assignments, tool.id, assignments[tool.id]);
      if (problem) throw new Error(problem);
    }
    return { assignments, result: { assignments, restored } };
  });
}

export function shortcutAria(key: string): string { return key.replace(/^Ctrl\+/, 'Control+'); }
