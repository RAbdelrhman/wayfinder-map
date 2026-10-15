// The user's round 1 pick (#292 comment 6184207806; 6184146230 said the same earlier), word for word.
const PICK = 'Whole page: “Overall I choose A just need the look of b but the fuction of A. A also has way too many subheadings.”';
const EARLIER = 'Earlier comment: “Overall I like A better”';
const A_FEEDBACK = `${PICK} A1 rows: “I like this”. A1 “Press a key…”: “I like this”. A1 Select element key: “This looks bad there is way too much space on the left.” ${EARLIER}; A1 Pin key: “The box has too much space on the left.”`;
const B_FEEDBACK = `${PICK} B1 Pin row: “I really like the look of this element. Should open the Choose a letter like in A.” ${EARLIER}; B1 Color picker row: “I like the look of this better than A just have the change dialogue popup when you click the letter.”`;

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
  disposition: 'combine',
  feedback: A_FEEDBACK,
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
  disposition: 'combine',
  feedback: B_FEEDBACK,
};

const frame = { width: 1280, height: 800, boardWidth: 520 };
const option = (dir, id, name, query, idea) => ({
  id,
  name,
  src: `variants/shortcuts.html?dir=${dir}${query}`,
  ...frame,
  note: { idea: `${dir === 'a' ? 'Option A' : 'Option B'}, one state: ${idea}` },
});

const withPick = (item, feedback) => ({ ...item, note: { ...item.note, disposition: 'combine', feedback } });
const c = (id, name, query, idea) => ({
  id,
  name,
  src: `variants/shortcuts.html?dir=c${query}`,
  ...frame,
  note: { idea: `Option C, one state: ${idea}`, basedOn: 'C' },
});
const C_NOTE = {
  idea: 'A’s behaviour in B’s rows. Each tool is one compact row: icon, name, keycap. Click the row or its key (or Enter) and the keycap turns into “Press a key…”; the next letter or Shift/Alt/Ctrl combo saves on the spot. A clash stays under the row, names the tool and links to change it. Esc keeps the old key. One heading and one line of help replace A’s section title, lede and per-row hints.',
  pros: [
    'One click from any key to recording it, nothing else opens (A)',
    'Keycaps sit next to the names, so no empty box to the left of the key (B’s look)',
    'One heading and one help line instead of five per-row subtitles',
  ],
  cons: [
    'Rows no longer say what each tool does; the names have to carry it',
    'A changed key shows only a dot (its default is in the screen-reader label, the footer and the Reset dialog)',
    'The help or clash line still pushes the rows below it down while recording',
  ],
  basedOn: ['A', 'B', 'A1', 'B1'],
  disposition: 'keep',
  feedback: 'Keep C. User confirmed in the T3 Code thread on 2026-10-15. After seeing C5 the user asked that Reset show and restore only the shortcuts that differ from their defaults (Pin and Note there), not all five; that adjustment is page D.',
};

window.CANVAS = {
  title: 'Settings › Keyboard shortcuts',
  question: 'How should Settings › Keyboard shortcuts let people change the canvas viewer’s five tool keys?',
  sampleState:
    'Wayfinder’s real styles.css and Settings markup, with a demo account. The viewer is D4 (#210/#211) on a sample canvas. Keys: Pin P, Select element E, Color picker C, Note N, Feedback panel F. Changes stay in the page; nothing saves or reaches GitHub.',
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
            { id: 'A', name: 'Editable shortcut list', src: 'variants/shortcuts.html?dir=a&start=viewer', ...frame, boardWidth: 600, note: A_NOTE },
            { id: 'B', name: 'List with a focused editor', src: 'variants/shortcuts.html?dir=b&start=viewer', ...frame, boardWidth: 600, note: B_NOTE },
          ],
        },
        {
          title: 'Landing from the viewer’s Shortcuts button',
          note: 'Settings opens on Keyboard shortcuts with Back to canvas in the top bar. B also preselects Pin, the tool that was on.',
          items: [
            withPick(option('a', 'A1', 'Landing', '&state=land', 'All five keys listed, section briefly highlighted, focus on the heading.'), A_FEEDBACK),
            withPick(option('b', 'B1', 'Landing', '&state=land', 'All five keys listed; the editor opens on Pin because Pin was on in the viewer.'), B_FEEDBACK),
          ],
        },
        {
          title: 'Changing a key',
          note: 'Recording, then saved. Press a key in the live flows to see the move between the two.',
          items: [
            option('a', 'A2', 'Recording Pin', '&state=capture', 'The key button listens in place; the hint under the row says what is allowed and that Esc cancels.'),
            option('b', 'B2', 'Recording Pin', '&state=capture', 'The editor’s key area listens; the list stays still.'),
            option('a', 'A3', 'Saved', '&state=saved', 'Shift+P saved: a Saved chip on the row and a Saved line in the page heading.'),
            option('b', 'B3', 'Saved', '&state=saved', 'Shift+P saved: the editor confirms it, the list row gets a changed dot, the heading says Saved.'),
          ],
        },
        {
          title: 'A key that clashes',
          note: 'Pressing C for Pin is blocked. Nothing saves; recording continues until another key or Esc.',
          items: [
            option('a', 'A4', 'Clash with Color picker', '&state=clash', 'The row turns red, names Color picker, and links to change Color picker instead.'),
            option('b', 'B4', 'Clash with Color picker', '&state=clash', 'The editor shows the clash and offers to switch to Color picker.'),
          ],
        },
        {
          title: 'Reset to the defaults',
          note: 'Same confirmation in both, so the comparison is only about editing. Pin and Note were changed first.',
          items: [
            option('a', 'A5', 'Reset confirmation', '&state=reset', 'Lists all five defaults and strikes through the two that change back.'),
            option('b', 'B5', 'Reset confirmation', '&state=reset', 'The same dialog over B.'),
          ],
        },
        {
          title: 'Review',
          items: [
            {
              id: 'undecided',
              kind: 'note',
              name: 'Undecided',
              text: 'No direction is chosen. Open questions for the pick:\n• Where Keyboard shortcuts sits in the Settings menu (shown second, after Appearance).\n• Whether system and app combos stay blocked (shown: Ctrl+C/V/X/Z/Y/A/W/R and Ctrl+K, Wayfinder’s Jump to).\n• Whether B’s per-key “Use P” carries over to A.\n• Whether pane and floating viewers, where the map keeps its own keys, need different rules.\n• Saved confirmation wording, and whether it also shows as the app toast.',
            },
            {
              id: 'review',
              kind: 'note',
              name: 'Design review',
              text: "Sources: src/ui/settings.ts and settingsPage.ts (category nav, rows, autosave note), src/ui/styles.css (tokens, .settings-*, .vw-*, .cf-*, .dialog, kbd), src/ui/canvasViewer.ts and canvasFeedback.ts (D4 toolbar, FEEDBACK_TOOLS P/E/C/N, PANEL_KEY F), src/prototypes.ts (config parser: lists A and B with the right titles and pages).\n\nChecked in Chromium under the sandbox CSP. A, light: E in the viewer, then Shortcuts lands on Keyboard shortcuts with focus on the heading; C for Pin is refused naming Color picker; Esc keeps P; Shift+P saves with a row chip and heading note; Back to canvas restores option B, Select element and the open panel; Shift+P then turns Pin on and plain P does nothing. B, dark: Ctrl+C refused as Copy; Ctrl+Shift+P saves; Reset lists all five defaults with Cancel focused, and confirming restores P, E, C, N, F and announces it. 390px: A and B clash states and the viewer have no horizontal overflow; B stacks its editor. The board renders all 12 frames.\n\nContrast (measured): error, hint, key, Change and fix-link text are 4.79:1 or more in both themes. Finding: the light Saved chip is 3.96:1. It is the shipped .cf-chip.is-ok (the viewer’s Posted chip), left as is.\n\nOther findings: A’s error line pushes the rows below it down; B needs an extra Record step; “Press a key…” blinks to 45% opacity (off with reduced motion).\n\nNot checked: the installed desktop app, screen reader speech, forced colours, every platform or IME key, pane and floating viewers, a full Tab-order audit, real persistence. Reserved combos, B’s “Use P” and the menu position are proposals, not agreed behaviour.",
            },
          ],
        },
      ],
    },
    {
      id: 'remix',
      title: 'Remix',
      round: 2,
      question: 'Does C, A’s inline recording in B’s compact rows, read right for Settings › Keyboard shortcuts?',
      sections: [
        {
          title: 'Live flow: start in the viewer, press Shortcuts',
          note: 'Built from the round 1 pick: “Overall I choose A just need the look of b but the fuction of A. A also has way too many subheadings.” Same agreed behaviour as round 1: letters and Shift/Alt/Ctrl combos, clashes blocked and named, autosave, Esc cancels, Reset confirms all five defaults, Back to canvas restores option B, the Pin tool and the open panel.',
          items: [{ id: 'C', name: 'Compact rows that record in place', src: 'variants/shortcuts.html?dir=c&start=viewer', ...frame, boardWidth: 600, note: C_NOTE }],
        },
        {
          title: 'C, state by state',
          note: 'Landing, recording, saved, a clash, and the Reset confirmation.',
          items: [
            c('C1', 'Landing', '&state=land', 'All five keys as compact rows, section briefly highlighted, focus on the heading.'),
            c('C2', 'Recording Pin', '&state=capture', 'Pin’s keycap reads “Press a key…”; one help line under the row says what is allowed and that Esc cancels.'),
            c('C3', 'Saved', '&state=saved', 'Shift+P saved: Saved beside the key and in the page heading.'),
            c('C4', 'Clash with Color picker', '&state=clash', 'C for Pin is refused: the keycap and line turn red, name Color picker, and link to change it instead.'),
            c('C5', 'Reset confirmation', '&state=reset', 'The round 1 dialog: all five defaults, the two changed keys struck through.'),
          ],
        },
        {
          title: 'Review',
          items: [{ id: 'review-c', kind: 'note', name: 'Design review', text: 'Sources: real Settings/category and viewer components in src/ui/settings.ts, settingsPage.ts, canvasViewer.ts, canvasFeedback.ts; shared light/dark tokens in src/ui/styles.css. C combines A/B/A1/B1 from user comments 6184207806 and 6184146230. Checked in sandboxed Chromium: C light and dark at 1280x800, dark at 390x844 with no horizontal document overflow. Click Pin, C clash names Color picker and preserves focus; Escape cancels; Ctrl+Shift+P saves; Reset lists P/E/C/N/F with Cancel focused and restores defaults; Back to canvas then Shortcuts focuses Keyboard shortcuts. Named buttons, list semantics and status announcements inspected in source. Findings: compact rows remove per-tool subtitles; capture/error still moves following rows. C uses text for Saved instead of the baseline low-contrast green chip. Measured against the section surface: primary/muted/Saved/error text contrast is 19.17/5.28/6.14/6.40 in light and 17.42/6.04/9.32/7.50 in dark. This token-pair check is not a complete contrast audit. Not checked: installed desktop, screen reader speech, forced colors, every OS shortcut, pane/float restoration and complete Tab traversal. Values are prototype memory only; reserved combinations remain proposals.' }],
        },
      ],
    },
  ],
};

window.CANVAS.pages.push({
  id: 'changed-reset',
  title: 'Reset changed shortcuts',
  round: 3,
  question: 'Does the reset confirmation now match the shortcuts that will change?',
  sections: [
    {
      title: 'D: C with a reset for changed shortcuts only',
      items: [{
        id: 'D', name: 'Compact rows with a selective reset',
        src: 'variants/shortcuts.html?dir=d&start=viewer', ...frame,
        note: {
          idea: 'The user kept C, then requested a reset that counts, lists and restores only changed assignments. The compact rows and inline capture stay as chosen. Cancel and Reset use explicit JavaScript actions so they work inside Wayfinder’s allow-scripts iframe.',
          pros: ['The confirmation names exactly what will change', 'Unchanged keys remain untouched and do not show a Saved marker'],
          cons: ['The confirmation is a partial list; the main section still shows all five defaults'],
          basedOn: ['C', 'C5'],
          disposition: 'keep',
          feedback: 'Keep D (Recommended). User confirmed in the T3 Code question card on 2026-10-15. Show and reset only changed shortcuts.',
        },
      }],
    },
    {
      title: 'Zero, one and two changed shortcuts',
      items: [
        ['D0', 'No changes: Reset disabled', 'land'],
        ['D1', 'Reset 1 changed shortcut', 'reset-one'],
        ['D2', 'Reset 2 changed shortcuts', 'reset'],
      ].map(([id, name, state]) => ({
        id, name, src: `variants/shortcuts.html?dir=d&state=${state}`, ...frame,
        note: { idea: name, basedOn: ['C', 'C5'] },
      })),
    },
    {
      title: 'Design review',
      items: [{ id: 'review-d', kind: 'note', name: 'Design review',
        text: 'Sources: C’s existing rows, dialog and shared src/ui/styles.css tokens. The user explicitly chose the changed-only count/list/reset behavior. This round retains C and its source options. The prior form-submit buttons failed under the production allow-scripts iframe; explicit JavaScript dialog.close actions replace submission. Verified in headless Edge with sandbox=allow-scripts, light and dark (31 scripted checks): zero changes disables Reset and opens no dialog; one/two changes produce the exact singular/plural title and only the changed rows; Cancel focused on open; Escape, pointer Cancel and Enter on Cancel preserve edits; pointer and Tab+Enter Reset restore only the changed assignments, announce “2 shortcuts restored to defaults” (or “1 shortcut restored to default”), and show Saved only on the restored rows. Dark/light dialog visually inspected at 1280x800; at 390x844 the dialog is 356px wide and document width remains 390px. The initial verification script incorrectly tried to click an aria-disabled button; corrected to assert the disabled state. Not checked: installed app, screen reader speech, forced colors, every platform shortcut and real persistence. C’s prior theme, responsive and token-pair contrast findings remain applicable to the unchanged styling.',
      }],
    },
  ],
});
