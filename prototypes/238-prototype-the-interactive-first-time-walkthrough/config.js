const tour = (query) => `variants/tour.html?${query}`;
const frame = { width: 1280, height: 800, boardWidth: 420 };

window.CANVAS = {
  title: 'First-time walkthrough',
  question: 'What interactive demo helps a new user understand Wayfinder and the core journey?',
  ticket: 238,
  sampleState:
    'A demo project, demo/recipes, with one scripted map of six tickets. Every option runs the same seven steps and the same wording: purpose, goal, planning, map, ticket types, blockers and hand-off. Planning and the hand-off are simulated. Nothing calls GitHub or T3 Code.',
  base: {
    stylesheets: ['../../src/ui/styles.css'],
    bodyClass: 'viz-root',
    surfaces: {
      plane: 'var(--plane)',
      surface: 'var(--surface-1)',
      line: 'var(--hairline)',
      text: 'var(--text-primary)',
      muted: 'var(--text-muted)',
    },
  },
  pages: [
    {
      id: 'format',
      title: 'Tour format',
      round: 1,
      question: 'How should the tour guide a new user through the demo journey?',
      sections: [
        {
          title: 'Three ways to present the same tour',
          note: 'Open each one full size and play it through: press Start map, select #6, then select #5 and press Open in T3 Code. Exit tour and Esc work at every step. The invitation and the always-available entry are compared on the next page.',
          items: [
            {
              id: 'A', name: 'Spotlight', src: tour('format=spotlight&step=1'), ...frame,
              note: {
                idea: 'Coach marks over the demo app. The page dims except the control to use next, and a small card beside it explains the step. The user presses the real-looking control to move on. A Demo banner stays under the top bar the whole time.',
                pros: ['The user does each step with the actual controls, so it carries over to real use', 'Easy to see exactly where to click', 'Feels like the app, not a separate lesson'],
                cons: ['The dimmed page and card cover part of the map', 'Only the highlighted control works during the tour, which can feel restrictive', 'On a phone the card becomes a bottom sheet over the page'],
              },
            },
            {
              id: 'B', name: 'Guide panel', src: tour('format=panel&step=1'), ...frame,
              note: {
                idea: 'A guide docked on the right with a checklist of the seven steps and a progress bar. The demo app stays fully usable; the control for the current step gets a blue ring. Steps tick off as the user does them.',
                pros: ['Nothing is covered: the user can explore the demo map freely', 'Readable progress and the whole journey visible at once', 'Easy to come back to the panel after looking around'],
                cons: ['Takes 340 px of width, so the map and ticket panel get tighter', 'The ring is easier to miss than a spotlight', 'On a phone the panel becomes a sheet under the app'],
              },
            },
            {
              id: 'C', name: 'Story', src: tour('format=story&step=1'), ...frame,
              note: {
                idea: 'A dedicated tour page. A named stepper runs across the top, the story is on the left in large type, and a live, scaled-down demo window sits on the right with a ring on the next control.',
                pros: ['Clearly separate from real work, so the demo status is obvious', 'Large text that is easy to read; the stepper names every step', 'The demo window cannot be mistaken for the user’s own maps'],
                cons: ['The demo app is shown smaller, so text inside it is small', 'Less like the real app: users still need to find the controls later', 'One more full-screen mode to build and maintain'],
              },
            },
          ],
        },
        {
          title: 'The same three at the hand-off step',
          note: 'Step 7: the demo agent has opened a pull request on #5.',
          items: [
            { id: 'A-handoff', name: 'Spotlight at hand-off', src: tour('format=spotlight&step=7&sel=5&handoff=3'), ...frame, note: { idea: 'The spotlight follows the hand-off status. Next appears once the demo pull request is ready.' } },
            { id: 'B-handoff', name: 'Guide panel at hand-off', src: tour('format=panel&step=7&sel=5&handoff=3'), ...frame, note: { idea: 'Six steps ticked off; the hand-off status sits in the ticket panel.' } },
            { id: 'C-handoff', name: 'Story at hand-off', src: tour('format=story&step=7&sel=5&handoff=3'), ...frame, note: { idea: 'The stepper shows six steps done; the demo window shows the pull request is ready.' } },
          ],
        },
        {
          title: 'The same three at completion',
          note: 'After the last step. Start my first map leaves the demo; Back to Home closes the tour and points to where to replay it.',
          items: [
            { id: 'A-done', name: 'Spotlight complete', src: tour('format=spotlight&state=done'), ...frame, note: { idea: 'A centred completion card over the dimmed demo map.' } },
            { id: 'B-done', name: 'Guide panel complete', src: tour('format=panel&state=done'), ...frame, note: { idea: 'All seven steps ticked, with the completion card at the bottom of the panel.' } },
            { id: 'C-done', name: 'Story complete', src: tour('format=story&state=done'), ...frame, note: { idea: 'The completion message replaces the story text; the stepper is all done.' } },
          ],
        },
        {
          title: 'Design review',
          items: [
            {
              id: 'review', kind: 'note', name: 'Design review',
              text: [
                'Sources inspected: src/ui/styles.css (tokens, .primary, .ghost, .iconbtn, .eyebrow, focus ring), src/ui/icons.ts (every icon is copied from it except a new ? icon for E1), src/ui/index.html and home.html. The real app was run and screenshotted on Home, New map and map #236 for reference. The demo uses only existing colour tokens.',
                'Checked in Chromium: all three formats played through every step (Start map, planning, select #6, select #5, Open in T3 Code, Finish), plus Back, Exit tour, Esc and Back to Home. All three entry options checked through invite, Not now and Exit tour. Light and dark at 1280×800, and 390×844 for Spotlight, Panel and Story, with no horizontal page overflow. Text contrast measured against the composited background: lowest 4.76:1 in light and 5.15:1 in dark (fixed: Exit tour link was 3.78:1 in dark). Visible focus ring matches Settings; each step moves focus to its title and announces “Step N of 7” in a live region; Esc exits and returns focus to the tour entry.',
                'Findings left open: in Spotlight, Tab can still reach dimmed controls (the build should make them inert); Spotlight’s card can cover the ticket it talks about at step 6; the Story demo window is small at 1280 wide and very small on a phone; on a phone, Panel shows only the current step.',
                'Not checked: the installed Electron app, screen reader output, forced colours, 200% zoom, reduced motion beyond the CSS rule, and real persistence of the dismissed invitation.',
              ].join('\n\n'),
            },
          ],
        },
      ],
    },
    {
      id: 'entry',
      title: 'Invitation and tour entry',
      round: 1,
      question: 'How should the first launch invite users, and where should Take the tour live afterwards?',
      sections: [
        {
          title: 'First launch: the optional invitation',
          note: 'Shown once, on Home, before any map exists. Take the tour starts the tour; Not now dismisses it for good. These frames use the Spotlight format once the tour starts; the format is chosen on page 1.',
          items: [
            {
              id: 'E1', name: 'Welcome dialog + sidebar ? button', src: tour('format=spotlight&entry=dialog&state=invite'), ...frame,
              note: {
                idea: 'A centred welcome dialog on first launch. Afterwards the tour lives behind a ? button at the bottom of the sidebar, beside Settings.',
                pros: ['Impossible to miss on first launch', 'The ? button is a familiar place for help', 'Takes no space on Home or the top bar'],
                cons: ['A dialog interrupts before the user has seen anything', 'A small icon is easy to overlook later', 'Adds a new ? icon to the app’s icon set'],
              },
            },
            {
              id: 'E2', name: 'Home card + sidebar item', src: tour('format=spotlight&entry=card&state=invite'), ...frame,
              note: {
                idea: 'A card at the top of Home invites the user, with nothing blocking the page. Afterwards Take the tour is a labelled item under Home in the sidebar.',
                pros: ['Inviting but not in the way', 'A labelled sidebar item is easy to find on every page', 'Sits where new users look first'],
                cons: ['A labelled item takes permanent sidebar space even for experienced users', 'Users who go straight to a map may not notice the card'],
              },
            },
            {
              id: 'E3', name: 'Corner card + top-bar Tour button', src: tour('format=spotlight&entry=corner&state=invite'), ...frame,
              note: {
                idea: 'A small card in the bottom-right corner on first launch. Afterwards a Tour button sits in the top bar beside Inbox on every page.',
                pros: ['Quiet: does not interrupt or push Home content down', 'The Tour button is visible on every page, including maps'],
                cons: ['Corner cards can read as ads and get dismissed unread', 'Adds a button to a top bar that is already busy on map pages'],
              },
            },
          ],
        },
        {
          title: 'After Not now',
          note: 'The invitation is gone. A message names where the tour lives, and that entry pulses briefly.',
          items: [
            { id: 'E1-skip', name: 'after Not now', src: tour('format=spotlight&entry=dialog&state=skipped'), ...frame, note: { idea: 'The ? button at the bottom of the sidebar pulses.' } },
            { id: 'E2-skip', name: 'after Not now', src: tour('format=spotlight&entry=card&state=skipped'), ...frame, note: { idea: 'Take the tour in the sidebar pulses.' } },
            { id: 'E3-skip', name: 'after Not now', src: tour('format=spotlight&entry=corner&state=skipped'), ...frame, note: { idea: 'The Tour button in the top bar pulses.' } },
          ],
        },
        {
          title: 'After Exit tour',
          note: 'Leaving mid-tour returns to Home, confirms nothing was changed, and points to the same entry.',
          items: [
            { id: 'E1-exit', name: 'after Exit tour', src: tour('format=spotlight&entry=dialog&state=exited'), ...frame, note: { idea: 'Back on Home; the ? button pulses.' } },
            { id: 'E2-exit', name: 'after Exit tour', src: tour('format=spotlight&entry=card&state=exited'), ...frame, note: { idea: 'Back on Home; Take the tour pulses.' } },
            { id: 'E3-exit', name: 'after Exit tour', src: tour('format=spotlight&entry=corner&state=exited'), ...frame, note: { idea: 'Back on Home; the Tour button pulses.' } },
          ],
        },
      ],
    },
    {
      id: 'wording',
      title: 'Wording',
      round: 1,
      question: 'Is this the right wording for the tour?',
      sections: [
        {
          title: 'Every line the tour shows',
          items: [
            {
              id: 'W', name: 'Tour wording', src: 'variants/wording.html', width: 1100, height: 1500, boardWidth: 600,
              note: {
                idea: 'All copy from one source file, used by every format and entry option: the seven steps, ticket-type lines, invitation, Demo banner, hand-off status, completion, and the messages after Not now and Exit tour.',
                pros: ['One place to approve or change wording before implementation'],
                cons: ['Read in context too: some lines read differently beside the demo'],
              },
            },
          ],
        },
      ],
    },
  ],
};
