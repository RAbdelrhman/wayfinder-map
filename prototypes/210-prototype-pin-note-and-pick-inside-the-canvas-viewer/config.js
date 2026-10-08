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
  ],
};

