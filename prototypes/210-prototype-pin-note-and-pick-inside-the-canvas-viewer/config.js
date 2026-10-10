// Round 4: three more directions on the shipped ACF4 viewer. One page, ?dir= picks the direction.
const R4_FRAME = { width: 1280, height: 800, boardWidth: 560 };
const r4src = (dir, state, size) => `variants/r4-viewer.html?dir=${dir}&state=${state}${size ? `&size=${size}` : ''}`;
const R4 = {
  D: {
    name: 'Toolbar tools',
    note: {
      idea: 'Pin and Pick are two tools in the viewer toolbar. Pin (N) turns the cursor into a crosshair; each click drops a numbered pin with its note in a popover beside it. Pick opens a small form under the button: the option on screen, an optional note, and the pins on it. A count button ("3 notes · pick B · Review") opens one modal showing both GitHub comments exactly as they will post. Without the bridge it follows #206 to the letter: Pin and Pick are off, and "Pick in #43" sends you to the existing grilling path.',
      pros: [
        'Smallest change to the shipped ACF4 shell: two buttons and a count; the canvas keeps the whole stage',
        'Notes sit at the pin, so you read them in context',
        'One review modal makes posting deliberate',
        'Fallback matches #206 exactly: nothing posts with a wrong location',
      ],
      cons: [
        'Notes are spread over the canvas; no single list until Review',
        'Every note needs a pin; no note on a whole option',
        'In the side pane and floating window the tools shrink to icons',
        'Canvases that did not answer lose in-app picking entirely',
      ],
    },
  },
  E: {
    name: 'Feedback panel',
    note: {
      idea: 'A Feedback panel docks right of the canvas inside the viewer, toggled from the toolbar with a count badge. It lists notes by option (pins and whole-option notes), has Pin on / Note on buttons for the option on screen, and holds the pick as a radio list with an optional note. Review replaces the panel with both comment previews while the canvas and its pins stay visible. In the side pane the panel becomes a Canvas / Feedback tab. Without the bridge, pins are off but whole-option notes and picking still work: you say which option is showing.',
      pros: [
        'Everything you will post is always in one list, editable in place',
        'Notes without a pin cover "this whole option is too busy"',
        'Review sits beside the canvas, so you can check each pin against its note',
        'Fallback keeps notes and picking for canvases that did not answer',
      ],
      cons: [
        'Takes 360 px from the canvas at full window; in the pane a tab hides one or the other',
        'Two places to look: pins on the canvas, text in the panel',
        'Picking from a list is easy to do without looking at the option',
        'Fallback goes beyond #206 (pick is off without a reply there); needs agreeing',
      ],
    },
  },
  F: {
    name: 'Pick bar and send sheet',
    note: {
      idea: 'A floating bar at the bottom of an open option holds the option name, Add pin, a note count and a primary "Pick B". Pins are teardrop markers with comment bubbles. Pick B opens a send sheet from the right: your pick and its note, a checklist of pins to include, and the rendered comments, with "Post pick and notes" or "Post notes only". The count opens the same sheet without the pick. Without the bridge, pins mark the viewer window instead of the option, are written out as approximate, and you choose which option is showing.',
      pros: [
        'Picking is the obvious next step once an option is open',
        'Review is built into the send sheet, with per-pin include checkboxes',
        'The toolbar is untouched, so ACF4 is unchanged in every size',
        'Fallback still lets you pin and pick on any canvas',
      ],
      cons: [
        'The bar covers the bottom of the option',
        'Approximate window pins can point at the wrong spot if the canvas was zoomed or scrolled',
        'The sheet dims the canvas, so you cannot check pins while reviewing',
        'Fallback goes furthest from #206 and writes positions it cannot verify',
      ],
    },
  },
};
const R4_STATES = [
  ['review', 'Review before posting', 'Both comments exactly as they will post, with Preview and Markdown tabs.'],
  ['posted', 'Posted', 'The prototype ticket comment (#42: pins and notes) and the pick ticket comment (#43: option ID, name, note and pins), as posted.'],
  ['nobridge', 'No bridge', 'The wrapper did not answer within 3 s (#206 fallback 4).'],
  ['snapshot', 'Snapshot', "A prototype-snapshot.html with no canvas engine (#206 fallback 3): page-level pins, option from Wayfinder's variant list."],
  ['pane', 'Side pane', 'The same direction in the ACF4 side pane beside the map.'],
];

window.CANVAS = {
  title: 'Pin, note & pick in the canvas viewer',
  question: 'How should a reviewer pin, note, and pick an option from inside the in-app canvas viewer?',
  ticket: 210,
  sampleState:
    'A sample "Onboarding" canvas (options Calm / Bold) open in the viewer. The demo bar at the ' +
    'bottom switches the ACF4 shell (full / pane / float), the canvas source (engine / DOM / plain ' +
    'page / no-wrapper), and the theme. Posting is simulated â€” no network write.',
  pages: [
    {
      title: 'Directions',
      round: 1,
      sections: [
        {
          title: 'Pin Â· note Â· pick',
          note: 'Two interaction models on the same approved full / pane / float shell. Open each full size, then drive it with the demo bar.',
          items: [
            {
              id: 'A',
              name: 'Tools + rail',
              src: 'variants/a.html',
              width: 1360,
              height: 860,
              note: {
                idea:
                  'Explicit tools in the toolbar (Pin / Note / Pick) and a docked feedback rail. Arm Pin, click the canvas to drop a numbered pin, type its note in a popover. The rail lists every pin, holds the option note and the pick, and opens a Review dialog that shows the exact #210 and #211 comments before a single Post.',
                pros: [
                  'Rail scales to many pins and reads like a review checklist.',
                  'A modal review is an unmistakable, deliberate last step before posting.',
                  'Tool state makes "I am placing a pin" explicit, so stray clicks do not pin.',
                ],
                cons: [
                  'The rail eats width â€” tight in the side pane and the floating window, where it drops below the canvas.',
                  'Arming a tool before clicking is one extra step per pin.',
                  'A modal takes focus off the canvas while you confirm.',
                ],
              },
            },
            {
              id: 'B',
              name: 'Click to annotate',
              src: 'variants/b.html',
              width: 1360,
              height: 860,
              note: {
                idea:
                  'No modes: click the canvas and a pin drops with an in-context note bubble right there. Pins stay anchored to what they mark; one bottom composer summarises pins, option note and pick, and its Review expands in place into the #210 / #211 preview, then collapses to a Posted row.',
                pros: [
                  'Fastest path â€” one click to pin, feedback stays next to the thing it is about.',
                  'The composer is compact, so it survives the side pane and float without a second column.',
                  'Review and the posted result live in the same bar, so focus never leaves the canvas.',
                ],
                cons: [
                  'A no-mode click model can drop accidental pins (mitigated with delete / Esc, not prevented).',
                  'In-context bubbles can overlap on a dense board.',
                  'A long pin list is less scannable than a dedicated rail.',
                ],
              },
            },
          ],
        },
        {
          title: 'Review',
          items: [
            {
              id: 'review',
              kind: 'note',
              name: 'Design review',
              text:
                'Sources inspected: src/ui/canvasViewer.ts (ACF4 full/pane/float shell, toolbar, message types), ' +
                'src/ui/styles.css (tokens + .vw / control classes, values mirrored into shell.css â€” the app CSS is ' +
                'scoped to .viz-root and drives dark off :root[data-theme]), docs/design/in-app-canvas-viewer.md ' +
                '(bridge protocol, the four wrapper sources engine/dom/page/none, the open question on pins drawn ' +
                'inside vs over the canvas), prototypes/AGENTS.md, README.md, CODING_STANDARDS.md.\n\n' +
                'Source review: light/dark tokens, shell and fallback handlers, focus-ring CSS and field labels. Browser checks: both directions pin, note, review and simulated post; dark posted results; no-wrapper fallback. Planned coverage: the four ' +
                'canvas sources and their fallbacks â€” engine & DOM pins anchor to an option, plain page gives page-level ' +
                'pins with the option from the viewerâ€™s variant list, no-wrapper is view-only with pins/pick off and ' +
                '"Pick in #211" still live; keyboard focus rings on every control, Esc closes bubble/popover/dialog, ' +
                'labels on pins and note fields; responsive reflow of rail (A) and composer (B) into the narrow shells.\n\n' +
                'Browser finding: resizing the viewport after opening Float can leave it off-screen. Keyboard modal focus containment is incomplete. Findings: Aâ€™s rail is cramped in float; Bâ€™s bubbles can overlap on dense boards. Both preserve the ' +
                'canvas options and never write the network â€” Post only renders the comment.\n\n' +
                'Not checked: installed desktop app, full keyboard/focus flow, screen-reader announcement order, pointer-drag of pins, ' +
                'AA contrast measurement, 60fps pan/zoom with live pins (that is #214). Mark these verified before build.',
            },
          ],
        },
      ],
    },
    {
      id: 'feedback-tools',
      title: 'Feedback tools and saved drafts',
      round: 2,
      question: 'Does this remix give each feedback tool a clear job and keep the rail easy to use?',
      sections: [
        {
          title: 'A remix',
          note: 'Original A and B remain on the Directions page. This is a proposal for review, not a chosen direction.',
          items: [
            {
              id: 'A2',
              name: 'Separate tools, saved draft',
              src: 'variants/a2.html',
              width: 1360,
              height: 920,
              note: {
                basedOn: ['A'],
                idea: 'Pin, Select element, Color picker and Attach have separate jobs in an annotation toolbar. The rail holds feedback, the option note and the pick. A review dialog previews the issue comments. Draft recovery is shown through an honest restart simulation.',
                feedback: 'Agreed scope in this thread: unposted drafts survive app restarts on the device where written; Select element highlights its target and opens a feedback editor; Color picker samples and suggests a replacement; Attach works on a pin or selected element and on the whole canvas. The layout and direction have not been chosen.',
                pros: [
                  'Annotation tools are separate from note and pick actions.',
                  'Feedback lists readable targets; pin coordinates remain in posted data.',
                  'A clear restore state shows the agreed device-local draft lifecycle.',
                ],
                cons: [
                  'More tools need more room. Narrow shells stack the canvas and feedback rail.',
                  'Element targeting and color sampling need a working wrapper and identifiable elements.',
                  'Device-local draft storage and real file uploads need follow-up implementation beyond the original map contract.',
                ],
              },
            },
            {
              id: 'review2',
              kind: 'note',
              name: 'Design review',
              text: 'Sources: src/ui/styles.css light/dark tokens and controls; src/ui/canvasViewer.ts approved ACF4 shell; docs/design/in-app-canvas-viewer.md bridge/fallback contract; Round 1 shell.css and fixtures.js.\n\nChecked with Playwright CLI: pin and selected-element notes; sampled button color #1f6bc8 and proposed replacement; files targeted to an element and the whole canvas; independent Calm/Bold notes; simulated close/reopen and restart restoring all five annotations and the pick; review and posted comments containing feedback details; snapshot tool disabling, no-wrapper pick-ticket fallback and no-pick-ticket explanation. Light/dark screenshots and 600px float resize checked. 390px layout has no horizontal overflow. Keyboard Enter selects a target in the board frame; Escape dismisses its editor; review focus is contained and returns to its trigger. Measured light/dark secondary text, primary button, pin and focus colors all exceed 4.5:1. Canvas checker, typecheck, lint and 15 canvas tooling tests pass.\n\nFindings fixed: long annotation lists no longer squeeze fields; review header/footer stay visible while content scrolls; float stays inside a resized viewport; notes stay on their own option. Narrow layouts stack canvas and rail, leaving less room for each.\n\nNot checked: installed app interaction, screen-reader announcements, every color/state combination, all float drag corners, 60fps performance and real upload/storage APIs.\n\nLimitations: restart recovery is an in-memory simulation, not storage across actual reloads. Attach keeps file names only. Posting renders issue comments without network writes. Snapshot color/element tools are disabled; no-wrapper keeps the draft and offers the existing pick-ticket path. Color sampling reads the demo element style, not arbitrary image pixels across nested prototype frames. No direction is chosen.',
            },
          ],
        },
      ],
    },
    {
      id: 'anchored-feedback',
      title: 'Anchored feedback',
      round: 3,
      question: 'Does this revision restore A\'s pin interaction and make the added tools coherent?',
      sections: [{
        title: 'A revision',
        note: 'A, B and A2 are preserved on their earlier pages. This revision is not chosen.',
        items: [
          {
            id: 'A3', name: 'Anchored tools and consistent pins',
            src: 'variants/a3.html', width: 1360, height: 920,
            note: {
              basedOn: ['A', 'A2'],
              idea: 'Restore A\'s anchored pin note. Use its theme pin color for the canvas marker and rail badge. Hover outlines show the element before selecting. A compact saturation/hue/hex editor handles a color suggestion. Each source scenario shows an explicit fallback state.',
              feedback: 'User requested correcting A2: source dropdown appeared ineffective; element selection needs hover; color UI was poor; labels repeated; alignment was inconsistent; pin popup changed from A; pin colors did not match. The source refers to the Canvas source scenario dropdown. A3 is a proposal, not an agreed direction.',
              pros: ['Pin editing stays at the target, like original A.', 'Hover and focus preview the selected element; color suggestion uses a visible picker.', 'Readable labels and theme-matched pin numbers remove duplication.'],
              cons: ['Anchored editors can cover nearby content on small canvases.', 'Color sampling reads an element style rather than arbitrary image pixels.', 'The source scenario buttons change demo capabilities; they do not load a different GitHub branch.'],
            },
          },
          {
            id: 'review3', kind: 'note', name: 'Design review',
            text: 'Design critique and design-system audit applied to the user screenshots. Findings: repeated option ID/name and Pin/number labels; mismatched hardcoded pin color; modal replaced original anchored pin note; native color input and uneven label baselines; source mode was unclear. Sources: A a.js/a.css popover and shell.css --pin theme values; src/ui/styles.css controls and palette; src/ui/canvasViewer.ts shell; A2 and supplied screenshots.\n\nSource changes: shared pin token and consistent number alignment, anchored editor, hover/focus outline, compact HSV/hex picker, explicit source scenario panels, simpler rail labels.\n\nChecked with Playwright CLI: light/dark pin and color editor screenshots; matching canvas/rail pin colors; ten-pin list alignment; hover outline and named target; HSV pointer/keyboard and hex edits; all four source scenarios and disabled snapshot/no-wrapper tools; review and posted comments with pin, option and pick notes; Enter target selection, Escape editor dismissal and focus return; review focus containment; side-by-side wide pane; 600px editor bounds and 390px horizontal overflow. Opaque-origin canvas frame checked for keyboard target selection, source fallback and close/reopen draft simulation. Canvas checker, JavaScript syntax, typecheck, lint and 15 canvas tests pass. Full Vitest run: 1330 passed, 6 asynchronous updater/server failures; isolated rerun of both affected files: 113 passed.\n\nIndependent resume review: all three Done when criteria pass at source/artifact level. Fresh GPT-6.1 verifier ran typecheck, lint, 15 shared canvas tests, 17 ticket tooling tests and full Vitest: 112 files / 1336 tests passed. Corrected stale ticket test fixtures and missing approved A/B four-corner float resize. Full report: VERIFICATION.md.\n\nNot checked: independent browser interactions and the new shared-shell corner dragging because preview operations time out; installed-app interaction, screen-reader announcements, new color-picker contrast at every hue or saturation, every layout/interaction state, actual restart persistence, uploads and GitHub posting. Shared shell palette inherits prior light/dark contrast checks; the added color-picker visuals do not yet have a complete accessibility audit.\n\nSimulation limits remain: no actual reload persistence, uploads or GitHub posting. Source changes demo capability/fallback, not remote content. No direction is chosen.',
          },
        ],
      }],
    },
      {
      id: 'new-directions',
      title: 'New directions',
      round: 4,
      question: 'Three more ways to pin, note and pick, alongside A, B, A2 and A3 on the earlier pages.',
      sampleState:
        'Sample canvas: prototype ticket #42 (Home, options A Greeting, B Split hero, C Dense list) and its pick ticket #43. All three post the same two comment formats; only how you get there differs. Nothing is sent to GitHub. Every frame is clickable: N drops pins, then write notes, pick, review and post.',
      sections: [
        {
          title: 'Directions',
          note: 'Each opens pinning on option B. Their states are in the sections below.',
          items: ['D', 'E', 'F'].map((dir) => ({ id: dir, name: R4[dir].name, src: r4src(dir, 'pin'), ...R4_FRAME, note: R4[dir].note })),
        },
        ...['D', 'E', 'F'].map((dir) => ({
          title: `${dir} · ${R4[dir].name}: states`,
          items: R4_STATES.map(([state, label, line]) => ({
            id: `${dir}-${state}`,
            name: label,
            src: state === 'pane' ? r4src(dir, 'pin', 'pane') : r4src(dir, state),
            ...R4_FRAME,
            note: line,
          })),
        })),
        {
          title: 'Notes',
          items: [
            {
              id: 'formats4',
              kind: 'note',
              name: 'Shared comment formats',
              text: 'D, E and F post the same two comments. Prototype ticket: a heading, branch and SHA, one numbered line per pin (option ID and name, % across and down, note) and a hidden <!-- wayfinder:notes v1 {...} --> JSON block for agents. Pick ticket: "Pick: B · Split hero", option ID, the note as a quote, the pins on that option, a line saying the ticket stays open until the grilling session records the decision, and a hidden <!-- wayfinder:pick v1 {...} --> block. Open any Review frame and switch to Markdown for the exact text.',
            },
            {
              id: 'review4',
              kind: 'note',
              name: 'Design review',
              text: 'Sources: src/ui/styles.css (tokens, .vw/.vw-bar ACF4 rules, .segmented, .ghost, .primary, .iconbtn, .input; linked directly, not mirrored), src/ui/canvasViewer.ts (toolbar markup copied: Close/Esc, title, page menu, Board/A/B/C, option name, GitHub, size switch), docs/design/in-app-canvas-viewer.md (bridge sources engine/dom/page/none, 3 s no-reply fallback). Checked headless at 1280×800: every direction in pin, review and no-bridge; D posted and side pane; E in dark (no-bridge) and snapshot; F review. Flow run end to end in D: N, click to drop a pin, write a note, Pick, Review, Post; Markdown shows the exact text including the hidden JSON. Keyboard: N toggles pin mode, Enter drops a pin in the middle, arrow keys (Shift for 5%) move a focused pin, Esc closes popovers, pin mode and the sheet; D review is a native modal dialog with focus on Post. Fixed during review: apostrophes rendered as #39 issue links; textareas collapsed in the F sheet; the no-bridge toolbar showed option buttons the viewer cannot drive (now "View only", as in the shipped viewer); compact Pin/Pick buttons had no accessible name. Contrast: warning chip text #7a5200 on its tint is about 6:1 (light); other text uses app tokens. Not checked: screen reader output, F sheet focus trap (scrim, not a native dialog), floating-window size (its switch shows a toast), E and F posted frames in dark, 200% zoom, touch.',
            },
          ],
        },
      ],
    },
],
};
