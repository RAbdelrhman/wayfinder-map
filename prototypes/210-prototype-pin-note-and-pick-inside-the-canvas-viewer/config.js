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
  ],
};

