/*
  Wayfinder's canvas for ticket #223: following a map on a phone.
  Paths are relative to index.html. Check with: node prototypes/canvas/tools/check.mjs
*/

const phone = (v, screen, extra = '') => ({ src: `variants/mobile.html?v=${v}&screen=${screen}${extra}`, width: 390, height: 844, boardWidth: 300 });

window.CANVAS = {
  ticket: 223,
  title: 'Following a map on a phone',
  question:
    'What should following a map look like on a phone: GitHub sign-in, the repo and map lists, a map view with ticket states, and ticket detail?',
  sampleState:
    'Signed in as @RAbdelrhman. Map #217 "A Wayfinder mobile app" with 18 tickets: 2 done, 2 claimed, 2 next up, 12 blocked (states are fake). Each frame is a whole clickable app in one direction (A, B or C), opened at the screen its section is about, so you can tap through sign-in → repos → map → ticket in any frame. Directions can be mixed per screen.',

  base: {
    stylesheets: ['../../src/ui/styles.css', 'variants/mobile.css'],
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
      title: 'Directions',
      round: 1,
      sections: [
        {
          title: 'Sign in with GitHub',
          note: 'GitHub OAuth device flow (decided on #217): the phone shows a code, you approve it on github.com. Tap through each frame.',
          items: [
            {
              id: 'S-A',
              name: 'A · Button, then code',
              ...phone('A', 'signin'),
              note: {
                idea: 'A plain welcome with one "Sign in with GitHub" button. The next screen shows the code and "Copy code and open GitHub". Back in the app, a "Waiting for GitHub…" state moves on by itself once you approve.',
                pros: ['Familiar: looks like every other "Sign in with" app', 'The code only appears when you asked for it'],
                cons: ['Three screens for one sign-in', 'Says nothing about what the app does'],
                disposition: 'keep',
                feedback: 'Picked for sign-in (round 1).',
              },
            },
            {
              id: 'S-B',
              name: 'B · Welcome, then steps',
              ...phone('B', 'signin'),
              note: {
                idea: 'A welcome screen lists what the app does (follow maps, start tickets, alerts). "Continue with GitHub" copies the code and shows a three-step checklist: Code copied ✓ → Approve on GitHub → You’re in.',
                pros: ['First run explains the app', 'The checklist shows where you are in the device flow'],
                cons: ['The welcome promises starting tickets and pushes before those exist', 'Most copy to maintain'],
              },
            },
            {
              id: 'S-C',
              name: 'C · Code on the first screen',
              ...phone('C', 'signin'),
              note: {
                idea: 'One screen. The code is already copied and shown big, with "Open GitHub" and "Copy code again". After you approve, it moves on.',
                pros: ['Fewest taps: one button', 'Nothing to explain: this is a personal build for one user'],
                cons: ['A code on launch can feel abrupt', 'Copying to the clipboard unasked can surprise people'],
              },
            },
          ],
        },
        {
          title: 'Repos and maps',
          note: 'Where you land after sign-in, and how you get to a map.',
          items: [
            {
              id: 'R-A',
              name: 'A · Repos, then maps',
              ...phone('A', 'repos'),
              note: {
                idea: 'Mirrors the desktop: Home lists repositories with map counts. Tap one to see its maps, each with a progress bar in the state colours.',
                pros: ['Same shape as desktop Home → Repository', 'Scales to many repos with search'],
                cons: ['Two taps before you see any map', 'Repos with no maps add noise'],
              },
            },
            {
              id: 'R-B',
              name: 'B · Following',
              ...phone('B', 'repos'),
              note: {
                idea: 'Home is the maps you follow, as cards with a progress ring and the next ticket ready to start. "Follow another map" browses repositories and stars maps.',
                pros: ['Matches "follow your maps" in the map’s destination', 'The next ticket is visible without opening the map'],
                cons: ['Adds a follow state the desktop doesn’t have, and somewhere to store it', 'Empty until you follow something'],
              },
            },
            {
              id: 'R-C',
              name: 'C · All maps, one list',
              ...phone('C', 'repos'),
              note: {
                idea: 'One list of every map from every repo, most recently active first, with search and repository filter chips.',
                pros: ['One tap to any map', 'No new concept: just filtering'],
                cons: ['Long once there are many repos', 'Old finished maps sit next to live ones'],
              },
            },
          ],
        },
        {
          title: 'Map view',
          note: 'How a map and its ticket states read on a 390px screen. States use the desktop’s words and icons: Next up, Claimed, Blocked, Done.',
          items: [
            {
              id: 'M-A',
              name: 'A · Grouped by state',
              ...phone('A', 'map'),
              note: {
                idea: 'The destination and a progress bar on top, then tickets grouped Next up / Claimed / Blocked / Done (Done collapsed). Blocked rows say what they need.',
                pros: ['Answers "what can I do now?" first', 'Plain list: fast, accessible, works one-handed'],
                cons: ['Loses the dependency picture the desktop map is built on'],
              },
            },
            {
              id: 'M-B',
              name: 'B · Graph, like the desktop',
              ...phone('B', 'map'),
              note: {
                idea: 'A small version of the desktop graph: drag to pan, +/− to zoom, tap a card to highlight its edges. A peek bar at the bottom shows the selected ticket; tap it to open the detail sheet.',
                pros: ['Same mental model as the desktop', 'Dependencies are visible'],
                cons: ['Small text and lots of panning on a phone', 'Hardest to make accessible and to build in React Native'],
              },
            },
            {
              id: 'M-C',
              name: 'C · Path, Tickets, Brief',
              ...phone('C', 'map'),
              note: {
                idea: 'Three tabs. Path lays tickets out in dependency steps from top to bottom (step 1 can start now, step 2 waits on step 1…). Tickets is a flat list with state filters. Brief shows destination, decisions, fog and out of scope.',
                pros: ['Keeps the dependency order without a graph', 'The brief is readable on the phone'],
                cons: ['Three views to learn and build', 'Steps flatten a graph, so "needs" is text rather than lines'],
                disposition: 'keep',
                feedback: 'Picked for the map view (round 1).',
              },
            },
          ],
        },
        {
          title: 'Ticket detail',
          note: 'Read-only here. The Start control is #224’s, so each frame holds a dashed slot for it.',
          items: [
            {
              id: 'T-A',
              name: 'A · Full page',
              ...phone('A', 'ticket'),
              note: {
                idea: 'A pushed page: type, number and state, the title, the same state banner the desktop panel shows, the body (Question, Done when), then Needs and Unblocks as tappable pills. Open on GitHub sits in the top bar; the Start slot is pinned to the bottom.',
                pros: ['All on one scroll', 'Pills move along the chain one ticket at a time'],
                cons: ['You lose sight of the map while reading'],
              },
            },
            {
              id: 'T-B',
              name: 'B · Sheet over the map',
              ...phone('B', 'ticket'),
              note: {
                idea: 'The ticket opens as a half-height sheet over the map; tap the handle for full height, tap outside or × to close. Pills open the next ticket in the same sheet.',
                pros: ['Keeps map context', 'Fast to flick through tickets'],
                cons: ['Two sheet heights to get right', 'Less room for long bodies at half height'],
              },
            },
            {
              id: 'T-C',
              name: 'C · Tabs: Overview, Links, Activity',
              ...phone('C', 'ticket'),
              note: {
                idea: 'A full page with tabs: Overview (banner and body), Links (needs / unblocks), Activity (the issue’s comments, where closing evidence and decisions land).',
                pros: ['Comments are readable on the phone', 'Each tab stays short'],
                cons: ['Needs/unblocks hide behind a tab', 'Comments add GitHub API calls'],
                disposition: 'keep',
                feedback: 'Picked for ticket detail (round 1).',
              },
            },
          ],
        },
        {
          title: 'Edge states',
          note: 'The same edge states in every direction; shown here in the direction that makes them most visible.',
          items: [
            { id: 'X-expired', name: 'Code expired', ...phone('A', 'signin', '&state=expired'), note: { idea: 'The device code timed out (15 minutes). One button gets a new code.', pros: ['Clear recovery'], cons: ['Doesn’t say if you denied it rather than let it lapse'] } },
            { id: 'X-offline', name: 'Offline, cached', ...phone('A', 'map', '&state=offline'), note: { idea: 'No network: the last data GitHub sent is shown, with its age.', pros: ['Following works on the train'], cons: ['Needs a local cache'] } },
            { id: 'X-empty', name: 'No maps', ...phone('C', 'repos', '&state=empty'), note: { idea: 'Signed in, but none of your repos has a map yet. Points you to the desktop, since starting a map is out of scope on the phone.', pros: ['Explains the out-of-scope rule'], cons: [] } },
            { id: 'X-loading', name: 'Loading', ...phone('B', 'repos', '&state=loading'), note: { idea: 'Skeleton rows while GitHub answers.', pros: ['Shows layout before data'], cons: [] } },
          ],
        },
        {
          title: 'Review',
          items: [
            {
              id: 'review',
              kind: 'note',
              name: 'Design review',
              text: [
                'Sources: src/ui/styles.css tokens (surfaces, text, state and accent colours, light + dark), src/ui/chrome.ts STATE_LOOKS (Next up / Claimed / Blocked / Done words and icons), src/ui/icons.ts (state and type icons), app.ts ticket panel (state banner copy, Needs/Unblocks). No mobile design system exists yet; mobile.css builds phone parts on those tokens.',
                'Checked: dark theme on A map, B map and B ticket sheet; light theme on C map and the board’s sign-in row (390×844 viewport). Touch targets: rows, buttons, pills and the Done toggle are 44px or more; segmented tabs are 40px (46px with track). State is never colour alone: each has an icon and a word. Fixed during review: dimmed Done tiles/nodes used opacity, which dropped muted text under 4.5:1, now a plain surface with secondary text; pills and the Show toggle were 32–36px tall.',
                'Findings left open: B’s graph is small (12px text at 0.8 zoom) and pan-heavy; B’s sheet does not move or trap focus; C’s tabs are role=tab without arrow-key handling; the canvas board wraps the S-A style ids onto two lines.',
                'Round 2 (R-C2), checked headless at 390×844 in dark and light: list, open sheet and filtered list. The Filter by button is 44px tall and its label names the current filter. Opening the sheet moves focus to the selected option; picking an option, tapping outside or pressing Escape closes it and returns focus to the button. The list sorts latest first (12 min, yesterday, 2 days, 3 weeks). Open: the sheet does not trap focus and has no slide animation.',
                'Not checked: every screen in both themes one by one, screen readers (VoiceOver/TalkBack), real devices and safe areas, dynamic type / large text, React Native feasibility of each option, landscape.',
              ].join('\n\n'),
            },
          ],
        },
      ],
    },
    {
      title: 'Repos and maps, round 2',
      round: 2,
      sections: [
        {
          title: 'R-C with a Filter by button',
          note: 'Round 1 picks: S-A sign-in, M-C map view, T-C ticket detail. For repos and maps you asked for R-C, starting with repos, then: "maybe a filter by button but default to all maps/latest maps". Tap through: the map and ticket screens behind it are M-C and T-C. The round 1 options stay on the Directions page.',
          items: [
            {
              id: 'R-C2',
              name: 'R-C2 · All maps, Filter by',
              ...phone('C', 'repos', '&remix=filter'),
              note: {
                idea: 'Opens on every map from every repo, latest activity first. The repo chips are gone. One "Filter by: All maps" button opens a sheet that narrows the list to one repository.',
                pros: ['Lands on the latest maps in one tap, as asked', 'One button scales to many repos; chips did not', 'The button always says what is showing'],
                cons: ['Picking a repo takes two taps instead of one chip', 'The repo list hides inside a sheet'],
                basedOn: ['R-C', 'R-A'],
              },
            },
            {
              id: 'R-C2-sheet',
              name: 'R-C2 · Filter sheet open',
              ...phone('C', 'repos', '&remix=filter&picker=1'),
              note: {
                idea: 'The Filter by sheet: "All maps" first, then each repository that has maps, with its map count. The current choice has a check. Tap one to filter; tap outside, the handle or Escape to close.',
                pros: ['Keeps R-A’s repos-then-maps path as a choice, not a step', 'Map counts show where the work is'],
                cons: ['Repos without maps are left out, so dotfiles never shows'],
                basedOn: ['R-C', 'R-A'],
              },
            },
          ],
        },
      ],
    },
  ],
};
