const A_NOTE = {
  idea: 'The list is the editor. Each of the five rows ends in its key as a button. Click it (or Enter) and the button listens; the next letter or modifier combo saves on the spot. A clash stays in the row, names the tool that has the key and links to it. Escape keeps the old key. Changed rows show their default.',
  pros: [
    'One click from any key to changing it, with nothing else opening',
    'All five keys and the clash stay in view together, so you see what you collide with',
    'Matches the rest of Settings: rows with the control on the right',
  ],
  cons: [
    'The error and the hint push the rows below them down while recording',
    'Little room per row to explain a key; with more than five keys the list gets long',
    'No per-key "use the default" control; only Reset all',
  ],
  basedOn: ['settings-A', '#210 D4'],
};
const B_NOTE = {
  idea: 'A read-only list picks one key; a focused editor beside it shows that key large, records a new one, says where it works, and offers its own default. Opening from the viewer preselects the tool that was on (Pin). A clash names the other tool and offers to change that one instead.',
  pros: [
    'Room for the key, its purpose, its default and errors without moving the list',
    'Arriving from the viewer lands on the tool you were using',
    'Per-key "Use P" makes undoing one change easy without resetting all five',
  ],
  cons: [
    'Two steps to change a key: pick it, then Record',
    'A second panel inside one Settings section; at narrow widths it stacks under the list',
    'Comparing two keys means switching the editor between them',
  ],
  basedOn: ['settings-A', '#210 D4'],
};

const frame = { width: 1280, height: 800, boardWidth: 520 };
const option = (dir, id, name, query, idea) => ({
  id,
  name,
  src: `variants/shortcuts.html?dir=${dir}${query}`,
  ...frame,
  note: { idea, basedOn: dir === 'a' ? 'A' : 'B' },
});

window.CANVAS = {
  title: 'Settings â€º Keyboard shortcuts',
  question: 'How should Settings â€º Keyboard shortcuts let people change the canvas viewerâ€™s five tool keys?',
  sampleState:
    'Wayfinderâ€™s real styles.css and Settings markup, with a demo account. The viewer is D4 (#210/#211) on a sample canvas. Keys: Pin P, Select element E, Color picker C, Note N, Feedback panel F. Changes stay in the page; nothing saves or reaches GitHub.',
  ticket: 292,
  base: {
    stylesheets: ['../../src/ui/styles.css'],
    bodyClass: 'viz-root',
    surfaces: { plane: 'var(--plane)', surface: 'var(--surface-1)', line: 'var(--hairline)', text: 'var(--text-primary)', muted: 'var(--text-muted)' },
  },
  pages: [
    {
      id: 'directions',
      title: 'Directions',
      round: 1,
      sections: [
        {
          title: 'Live flows: start in the viewer, press Shortcuts',
          note: 'Same agreed behaviour in both: letters and Shift/Alt/Ctrl combos, clashes blocked and named, autosave with a Saved confirmation, Esc cancels, Reset confirms all five defaults, Back to canvas restores option B, the Pin tool and the open panel. Try the new key in the viewer afterwards.',
          items: [
            { id: 'A', name: 'A Â· Editable shortcut list', src: 'variants/shortcuts.html?dir=a&start=viewer', ...frame, boardWidth: 600, note: A_NOTE },
            { id: 'B', name: 'B Â· List with a focused editor', src: 'variants/shortcuts.html?dir=b&start=viewer', ...frame, boardWidth: 600, note: B_NOTE },
          ],
        },
        {
          title: 'Landing from the viewerâ€™s Shortcuts button',
          note: 'Settings opens on Keyboard shortcuts with Back to canvas in the top bar. B also preselects Pin, the tool that was on.',
          items: [
            option('a', 'A1', 'A Â· Landing', '&state=land', 'All five keys listed, section briefly highlighted, focus on the heading.'),
            option('b', 'B1', 'B Â· Landing', '&state=land', 'All five keys listed; the editor opens on Pin because Pin was on in the viewer.'),
          ],
        },
        {
          title: 'Changing a key',
          note: 'Recording, then saved. Press a key in the live flows to see the move between the two.',
          items: [
            option('a', 'A2', 'A Â· Recording Pin', '&state=capture', 'The key button listens in place; the hint under the row says what is allowed and that Esc cancels.'),
            option('b', 'B2', 'B Â· Recording Pin', '&state=capture', 'The editorâ€™s key area listens; the list stays still.'),
            option('a', 'A3', 'A Â· Saved', '&state=saved', 'Shift+P saved: a Saved chip on the row and a Saved line in the page heading.'),
            option('b', 'B3', 'B Â· Saved', '&state=saved', 'Shift+P saved: the editor confirms it, the list row gets a changed dot, the heading says Saved.'),
          ],
        },
        {
          title: 'A key that clashes',
          note: 'Pressing C for Pin is blocked. Nothing saves; recording continues until another key or Esc.',
          items: [
            option('a', 'A4', 'A Â· Clash with Color picker', '&state=clash', 'The row turns red, names Color picker, and links to change Color picker instead.'),
            option('b', 'B4', 'B Â· Clash with Color picker', '&state=clash', 'The editor shows the clash and offers to switch to Color picker.'),
          ],
        },
        {
          title: 'Reset to the defaults',
          note: 'Same confirmation in both, so the comparison is only about editing. Pin and Note were changed first.',
          items: [
            option('a', 'A5', 'A Â· Reset confirmation', '&state=reset', 'Lists all five defaults and strikes through the two that change back.'),
            option('b', 'B5', 'B Â· Reset confirmation', '&state=reset', 'The same dialog over B.'),
          ],
        },
        {
          title: 'Review',
          items: [
            {
              id: 'undecided',
              kind: 'note',
              name: 'Undecided',
              text: 'No direction is chosen. Open questions for the pick:\nâ€¢ Where Keyboard shortcuts sits in the Settings menu (shown second, after Appearance).\nâ€¢ Whether system and app combos stay blocked (shown: Ctrl+C/V/X/Z/Y/A/W/R and Ctrl+K, Wayfinderâ€™s Jump to).\nâ€¢ Whether Bâ€™s per-key â€œUse Pâ€ carries over to A.\nâ€¢ Whether pane and floating viewers, where the map keeps its own keys, need different rules.\nâ€¢ Saved confirmation wording, and whether it also shows as the app toast.',
            },
            {
              id: 'review',
              kind: 'note',
              name: 'Design review',
              text: 'Sources: src/ui/settings.ts and settingsPage.ts for category navigation, rows and autosave; src/ui/styles.css for light/dark tokens and Settings controls; src/ui/canvasViewer.ts and the D4 decision for viewer context. Checks: canvas checker passes; A and B rendered at 1280x800 in light and dark; 390px responsive layouts inspected, B stacks its editor and has no document overflow. Keyboard interaction: A blocks C for Pin, saves Shift+P, resets through confirmation, and Shortcuts focuses the section heading; B blocks C, Escape cancels, and Ctrl+Shift+P saves. Semantics: headings, named buttons, shortcut list, live status and native reset dialog inspected in source and browser tree. Findings: A errors move subsequent rows; B needs an extra Record action and stacks below the list on narrow screens. Not checked: installed Wayfinder desktop, screen reader speech, every modifier/platform reservation, pane/float restoration, all focus traversal, quantitative contrast audit. Prototype values are memory-only, with no production persistence. Extra controls and reserved-key rules remain proposals, not agreed decisions.',
            },
          ],
        },
      ],
    },
  ],
};
