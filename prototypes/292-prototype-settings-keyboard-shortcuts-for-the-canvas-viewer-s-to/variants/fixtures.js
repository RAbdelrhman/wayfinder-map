/*
  #292 fixture: the canvas viewer's five tool keys and the rules a new key must pass.
  Defaults, names and icons match FEEDBACK_TOOLS and PANEL_KEY in src/ui/canvasFeedback.ts.
  Nothing here saves: every change lives in this page only.
*/
Object.assign(Kit.icons, {
  pin: '<path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  cursor: '<path d="M5 3l14 7-6 2-2 6z"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  note: '<path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.5-5.6A8.5 8.5 0 1 1 21 12z"/><path d="M9 11h6M9 14h4"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  beaker: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7 15h10"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  full: '<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/>',
  pane: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M13 4v16"/>',
  float: '<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="11.5" y="11.5" width="6.5" height="5.5" rx="1"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5Z"/>',
  home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  repo: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v18"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>',
  sliders: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
  bell: '<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5ZM10 21h4"/>',
  map: '<path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2Z"/><path d="M9 4v14M15 6v14"/>',
  person: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>',
});

window.P292 = (() => {
  /** The viewer's five keys, in toolbar order. `hint` is what the key does in the viewer. */
  const TOOLS = [
    { id: 'pin', name: 'Pin', icon: 'pin', hint: 'Drop a pin on the canvas', key: { key: 'P' } },
    { id: 'element', name: 'Select element', icon: 'cursor', hint: 'Pick an element to comment on', key: { key: 'E' } },
    { id: 'color', name: 'Color picker', icon: 'drop', hint: 'Pick an element to change its colour', key: { key: 'C' } },
    { id: 'note', name: 'Note', icon: 'note', hint: 'Write a note about the open option', key: { key: 'N' } },
    { id: 'panel', name: 'Feedback panel', icon: 'panel', hint: 'Show or hide the feedback panel', key: { key: 'F' } },
  ];
  const NAME = Object.fromEntries(TOOLS.map((t) => [t.id, t.name]));
  const defaults = () => Object.fromEntries(TOOLS.map((t) => [t.id, { ...t.key }]));

  /** Combos Wayfinder or the system already owns. A shortcut may not take them. */
  const RESERVED = {
    'Ctrl+C': 'Copy',
    'Ctrl+V': 'Paste',
    'Ctrl+X': 'Cut',
    'Ctrl+Z': 'Undo',
    'Ctrl+Y': 'Redo',
    'Ctrl+A': 'Select all',
    'Ctrl+W': 'Close window',
    'Ctrl+R': 'Reload',
    'Ctrl+K': 'Wayfinder’s Jump to',
  };

  const parts = (b) => [b.ctrl && 'Ctrl', b.alt && 'Alt', b.shift && 'Shift', b.key].filter(Boolean);
  const label = (b) => parts(b).join('+');
  const spoken = (b) => parts(b).join(' plus ');
  const kbd = (b) => parts(b).map((p) => `<kbd>${Kit.esc(p)}</kbd>`).join('<span class="k292-plus" aria-hidden="true">+</span>');
  const same = (a, b) => label(a) === label(b);

  /**
   * Read one keydown while a shortcut is being recorded.
   * Returns { kind: 'cancel' | 'leave' | 'pending' | 'invalid' | 'clash' | 'ok', ... }.
   */
  function read(event, tool, keys) {
    if (event.key === 'Escape') return { kind: 'cancel' };
    if (event.key === 'Tab') return { kind: 'leave' };
    if (['Shift', 'Control', 'Alt', 'Meta', 'AltGraph'].includes(event.key)) {
      return { kind: 'pending', mods: parts({ ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey }) };
    }
    if (event.metaKey) return { kind: 'invalid', text: 'The Windows key belongs to the system. Use Shift, Alt or Ctrl.' };
    const letter = /^Key([A-Z])$/.exec(event.code)?.[1];
    if (!letter) return { kind: 'invalid', text: 'Use a letter, alone or with Shift, Alt or Ctrl.' };
    const binding = { key: letter, ...(event.ctrlKey ? { ctrl: true } : {}), ...(event.altKey ? { alt: true } : {}), ...(event.shiftKey ? { shift: true } : {}) };
    const owner = Object.entries(keys).find(([id, b]) => id !== tool && same(b, binding));
    if (owner) return { kind: 'clash', binding, owner: owner[0], text: `${label(binding)} is already ${NAME[owner[0]]}.` };
    const reserved = RESERVED[label(binding)];
    if (reserved) return { kind: 'clash', binding, owner: null, text: `${label(binding)} is ${reserved}.` };
    return { kind: 'ok', binding };
  }

  /** Whether a keydown in the viewer matches a binding. */
  const matches = (event, b) =>
    /^Key([A-Z])$/.exec(event.code)?.[1] === b.key && !!event.ctrlKey === !!b.ctrl && !!event.altKey === !!b.alt && !!event.shiftKey === !!b.shift && !event.metaKey;

  return { TOOLS, NAME, defaults, label, spoken, kbd, same, read, matches };
})();
