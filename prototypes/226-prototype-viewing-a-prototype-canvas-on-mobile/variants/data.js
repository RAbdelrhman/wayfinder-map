/*
  Sample data for the #226 phone viewer. Loaded after kit.js. Nothing here talks to GitHub.
  Ticket #223 and its canvas use the real titles, option names and notes from
  prototype/223 (config.js). Canvas #207's names and notes come from prototype/207; its
  pages are drawn here as stand-ins (canvas-207/desktop.html). Download sizes are sample
  numbers inside the range #221 measured (52–57 requests, about 2 MB per canvas).
*/
window.V226 = (() => {
  const PHONE_223 = (v, screen, extra = '') => `canvas-223/mobile.html?v=${v}&screen=${screen}${extra}`;
  const DESK_207 = (opt) => `canvas-207/desktop.html?opt=${opt}`;

  const canvas223 = {
    id: '223',
    ticket: 223,
    title: 'Following a map on a phone',
    branch: 'prototype/223-prototype-the-following-screens-sign-in-repos-map-view-ticket-de',
    width: 390,
    height: 844,
    sizeLabel: 'Phone size',
    files: 54,
    mb: 2.1,
    updated: 'Oct 5',
    question:
      'What should following a map look like on a phone: GitHub sign-in, the repo and map lists, a map view with ticket states, and ticket detail?',
    pages: [
      {
        id: 'directions',
        title: 'Directions',
        round: 'Round 1',
        sections: [
          {
            title: 'Sign in with GitHub',
            items: [
              {
                id: 'S-A',
                name: 'A · Button, then code',
                src: PHONE_223('A', 'signin'),
                note: {
                  idea: 'A plain welcome with one "Sign in with GitHub" button. The next screen shows the code and "Copy code and open GitHub". Back in the app, a "Waiting for GitHub…" state moves on by itself once you approve.',
                  pros: ['Familiar: looks like every other "Sign in with" app', 'The code only appears when you asked for it'],
                  cons: ['Three screens for one sign-in', 'Says nothing about what the app does'],
                  recorded: 'Keep · Picked for sign-in (round 1).',
                },
              },
              {
                id: 'S-B',
                name: 'B · Welcome, then steps',
                src: PHONE_223('B', 'signin'),
                note: {
                  idea: 'A welcome screen lists what the app does (follow maps, start tickets, alerts). "Continue with GitHub" copies the code and shows a three-step checklist: Code copied ✓ → Approve on GitHub → You’re in.',
                  pros: ['First run explains the app', 'The checklist shows where you are in the device flow'],
                  cons: ['The welcome promises starting tickets and pushes before those exist', 'Most copy to maintain'],
                },
              },
              {
                id: 'S-C',
                name: 'C · Code on the first screen',
                src: PHONE_223('C', 'signin'),
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
            items: [
              {
                id: 'R-A',
                name: 'A · Repos, then maps',
                src: PHONE_223('A', 'repos'),
                note: {
                  idea: 'Mirrors the desktop: Home lists repositories with map counts. Tap one to see its maps, each with a progress bar in the state colours.',
                  pros: ['Same shape as desktop Home → Repository', 'Scales to many repos with search'],
                  cons: ['Two taps before you see any map', 'Repos with no maps add noise'],
                },
              },
              {
                id: 'R-B',
                name: 'B · Following',
                src: PHONE_223('B', 'repos'),
                note: {
                  idea: 'Home is the maps you follow, as cards with a progress ring and the next ticket ready to start. "Follow another map" browses repositories and stars maps.',
                  pros: ['Matches "follow your maps" in the map’s destination', 'The next ticket is visible without opening the map'],
                  cons: ['Adds a follow state the desktop doesn’t have, and somewhere to store it', 'Empty until you follow something'],
                },
              },
              {
                id: 'R-C',
                name: 'C · All maps, one list',
                src: PHONE_223('C', 'repos'),
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
            items: [
              {
                id: 'M-A',
                name: 'A · Grouped by state',
                src: PHONE_223('A', 'map'),
                note: {
                  idea: 'The destination and a progress bar on top, then tickets grouped Next up / Claimed / Blocked / Done (Done collapsed). Blocked rows say what they need.',
                  pros: ['Answers "what can I do now?" first', 'Plain list: fast, accessible, works one-handed'],
                  cons: ['Loses the dependency picture the desktop map is built on'],
                },
              },
              {
                id: 'M-B',
                name: 'B · Graph, like the desktop',
                src: PHONE_223('B', 'map'),
                note: {
                  idea: 'A small version of the desktop graph: drag to pan, +/− to zoom, tap a card to highlight its edges. A peek bar at the bottom shows the selected ticket; tap it to open the detail sheet.',
                  pros: ['Same mental model as the desktop', 'Dependencies are visible'],
                  cons: ['Small text and lots of panning on a phone', 'Hardest to make accessible and to build in React Native'],
                },
              },
              {
                id: 'M-C',
                name: 'C · Path, Tickets, Brief',
                src: PHONE_223('C', 'map'),
                note: {
                  idea: 'Three tabs. Path lays tickets out in dependency steps from top to bottom (step 1 can start now, step 2 waits on step 1…). Tickets is a flat list with state filters. Brief shows destination, decisions, fog and out of scope.',
                  pros: ['Keeps the dependency order without a graph', 'The brief is readable on the phone'],
                  cons: ['Three views to learn and build', 'Steps flatten a graph, so "needs" is text rather than lines'],
                  recorded: 'Keep · Picked for the map view (round 1).',
                },
              },
            ],
          },
          {
            title: 'Ticket detail',
            items: [
              {
                id: 'T-A',
                name: 'A · Full page',
                src: PHONE_223('A', 'ticket'),
                note: {
                  idea: 'A pushed page: type, number and state, the title, the same state banner the desktop panel shows, the body (Question, Done when), then Needs and Unblocks as tappable pills. Open on GitHub sits in the top bar; the Start slot is pinned to the bottom.',
                  pros: ['All on one scroll', 'Pills move along the chain one ticket at a time'],
                  cons: ['You lose sight of the map while reading'],
                },
              },
              {
                id: 'T-B',
                name: 'B · Sheet over the map',
                src: PHONE_223('B', 'ticket'),
                note: {
                  idea: 'The ticket opens as a half-height sheet over the map; tap the handle for full height, tap outside or × to close. Pills open the next ticket in the same sheet.',
                  pros: ['Keeps map context', 'Fast to flick through tickets'],
                  cons: ['Two sheet heights to get right', 'Less room for long bodies at half height'],
                },
              },
              {
                id: 'T-C',
                name: 'C · Tabs: Overview, Links, Activity',
                src: PHONE_223('C', 'ticket'),
                note: {
                  idea: 'A full page with tabs: Overview (banner and body), Links (needs / unblocks), Activity (the issue’s comments, where closing evidence and decisions land).',
                  pros: ['Comments are readable on the phone', 'Each tab stays short'],
                  cons: ['Needs/unblocks hide behind a tab', 'Comments add GitHub API calls'],
                  recorded: 'Keep · Picked for ticket detail (round 1).',
                },
              },
            ],
          },
          {
            title: 'Edge states',
            items: [
              { id: 'X-expired', name: 'Code expired', src: PHONE_223('A', 'signin', '&state=expired'), note: { idea: 'The device code timed out (15 minutes). One button gets a new code.', pros: ['Clear recovery'], cons: ['Doesn’t say if you denied it rather than let it lapse'] } },
              { id: 'X-offline', name: 'Offline, cached', src: PHONE_223('A', 'map', '&state=offline'), note: { idea: 'No network: the last data GitHub sent is shown, with its age.', pros: ['Following works on the train'], cons: ['Needs a local cache'] } },
              { id: 'X-empty', name: 'No maps', src: PHONE_223('C', 'repos', '&state=empty'), note: { idea: 'Signed in, but none of your repos has a map yet. Points you to the desktop, since starting a map is out of scope on the phone.', pros: ['Explains the out-of-scope rule'], cons: [] } },
              { id: 'X-loading', name: 'Loading', src: PHONE_223('B', 'repos', '&state=loading'), note: { idea: 'Skeleton rows while GitHub answers.', pros: ['Shows layout before data'], cons: [] } },
            ],
          },
        ],
        boardNotes: [{ name: 'Design review', text: '#223’s own review note: sources, themes, checks and what was not checked. On the phone it reads as text; the board itself is never drawn.' }],
      },
      {
        id: 'repos-and-maps-round-2',
        title: 'Repos and maps, round 2',
        round: 'Round 2',
        sections: [
          {
            title: 'R-C with a Filter by button',
            items: [
              {
                id: 'R-C2',
                name: 'R-C2 · All maps, Filter by',
                src: PHONE_223('C', 'repos', '&remix=filter'),
                note: {
                  idea: 'Opens on every map from every repo, latest activity first. The repo chips are gone. One "Filter by: All maps" button opens a sheet that narrows the list to one repository.',
                  pros: ['Lands on the latest maps in one tap, as asked', 'One button scales to many repos; chips did not', 'The button always says what is showing'],
                  cons: ['Picking a repo takes two taps instead of one chip', 'The repo list hides inside a sheet'],
                  basedOn: 'R-C + R-A',
                  recorded: 'Keep · Looks great. Restyle the back (Maps) and Open on GitHub buttons to match the app.',
                },
              },
              {
                id: 'R-C2-sheet',
                name: 'R-C2 · Filter sheet open',
                src: PHONE_223('C', 'repos', '&remix=filter&picker=1'),
                note: {
                  idea: 'The Filter by sheet: "All maps" first, then each repository that has maps, with its map count. The current choice has a check. Tap one to filter; tap outside, the handle or Escape to close.',
                  pros: ['Keeps R-A’s repos-then-maps path as a choice, not a step', 'Map counts show where the work is'],
                  cons: ['Repos without maps are left out, so dotfiles never shows'],
                  basedOn: 'R-C + R-A',
                },
              },
            ],
          },
        ],
        boardNotes: [],
      },
    ],
  };

  const shortNote = (idea) => ({ idea, pros: [], cons: [] });
  const canvas207 = {
    id: '207',
    ticket: 207,
    title: 'The in-app canvas viewer shell',
    branch: 'prototype/207-prototype-the-in-app-canvas-viewer-shell',
    width: 1440,
    height: 900,
    sizeLabel: 'Desktop size',
    files: 57,
    mb: 2.3,
    updated: 'Oct 5',
    question:
      'What should opening a canvas inside Wayfinder look like: an overlay, a route, or a pane; how it opens from the tile and closes back; what the toolbar holds; and how Esc or Back returns you to the exact place on the map?',
    pages: [
      {
        id: 'directions',
        title: 'Directions',
        round: 'Round 1',
        sections: [
          {
            title: 'A · Overlay',
            items: [
              {
                id: 'A',
                name: 'Overlay, desktop app, from the board',
                src: DESK_207('A'),
                note: {
                  idea: 'Click the Canvas button or a variant tile and its picture grows to fill the window. One toolbar across the top: Close (Esc), the title, the canvas page menu, Board · A · B · C, ← → while one is open, and the branch on GitHub.',
                  pros: ['Exact return for free: the map or board never unmounts', 'The biggest canvas: only one 52 px bar of chrome'],
                  cons: ['Hides the app: hand-offs, Next and the map are out of sight while a canvas is open', 'A modal: it needs a focus trap, inert app and aria-modal'],
                  recorded: 'Combine · with C (round 2, AC).',
                },
              },
              { id: 'A-browser', name: 'Overlay, localhost browser, from the ticket panel', src: DESK_207('A-browser'), note: { idea: 'The same overlay on the localhost page. The browser’s Back closes the overlay and leaves the map exactly as it was.', pros: ['Back is the browser’s own button, and a copied URL reopens the same canvas and option'], cons: ['The browser tab’s own chrome plus the overlay bar: two rows of controls above the canvas'] } },
            ],
          },
          {
            title: 'B · Canvas route',
            items: [
              {
                id: 'B',
                name: 'Route, desktop app, from the board',
                src: DESK_207('B'),
                note: {
                  idea: 'The tile grows into the content area, beside the rail. The top bar turns into the viewer’s bar. It is a real route, so Back, a reload and a shared link all land on the canvas.',
                  pros: ['Feels like a place in the app: the rail stays', 'Deep links and reloads behave like every other Wayfinder page'],
                  cons: ['Exact return depends on saving and restoring state', 'The map unmounts, so its own redraw costs time on the way back'],
                },
              },
              { id: 'B-browser', name: 'Route, localhost browser, from the ticket panel', src: DESK_207('B-browser'), note: { idea: 'The same route on the localhost page. The address bar shows the canvas path.', pros: ['The URL is the clearest of the three: the canvas has its own path'], cons: ['A reload on the canvas route has to fetch the map too before ← Map can restore anything'] } },
            ],
          },
          {
            title: 'C · Side pane',
            items: [
              {
                id: 'C',
                name: 'Pane, desktop app, from the map',
                src: DESK_207('C'),
                note: {
                  idea: 'The tile slides out into a pane on the right (60% of the window, up to 820 px), under the top bar, replacing the ticket panel. The map stays live on the left.',
                  pros: ['Keeps context: the map and its ticket stay in view while you compare options', 'Expand gives a full-size canvas when you need it'],
                  cons: ['Cramped at the default size', 'Two scrolling surfaces side by side, so wheel and drag can go to the wrong one'],
                  recorded: 'Combine · with A (round 2, AC).',
                },
              },
              { id: 'C-browser', name: 'Pane, localhost browser, from the board', src: DESK_207('C-browser'), note: { idea: 'The same pane on the localhost page, opened from the Prototypes board.', pros: ['You can open another card’s canvas from the left without closing first'], cons: ['The board’s variant strip squeezes into the narrow left side'] } },
            ],
          },
        ],
        boardNotes: [],
      },
      { id: 'a-c-remix', title: 'A + C remix', round: 'Round 2', sections: [{ title: 'AC · Overlay that shrinks to a pane', items: [
        { id: 'AC', name: 'Overlay that shrinks to a pane, desktop app, from the board', src: DESK_207('AC'), note: shortNote('Opens as A’s overlay by default and shrinks to C’s side pane.') },
        { id: 'AC-browser', name: 'Overlay that shrinks to a pane, localhost browser, from the ticket panel', src: DESK_207('AC-browser'), note: shortNote('The same, on the localhost page.') },
        { id: 'AC-pane', name: 'Setting on "Side pane": opens straight into the pane', src: DESK_207('AC-pane'), note: shortNote('With the setting on Side pane, a canvas opens in the pane.') },
        { id: 'AC-setting', name: 'The setting, in Settings › Preferences', src: DESK_207('AC-setting'), width: 640, height: 420, note: shortNote('The Open canvases row in Settings.') },
      ] }], boardNotes: [] },
      { id: 'floating-window', title: 'Floating window', round: 'Round 3', sections: [{ title: 'ACF · Full window, side pane or floating', items: [
        { id: 'ACF', name: 'Full, pane or floating, desktop app, from the board', src: DESK_207('ACF'), note: shortNote('A three-way size switch: Full window, Side pane, Floating.') },
        { id: 'ACF-float', name: 'Setting on "Floating": opens straight into the floating window', src: DESK_207('ACF-float'), note: shortNote('With the setting on Floating, a canvas opens as a small window.') },
        { id: 'ACF-browser', name: 'Full, pane or floating, localhost browser, from the ticket panel', src: DESK_207('ACF-browser'), note: shortNote('The same, on the localhost page.') },
        { id: 'ACF-setting', name: 'The setting, with a third choice', src: DESK_207('ACF-setting'), width: 640, height: 420, note: shortNote('Open canvases gets a Floating choice.') },
      ] }], boardNotes: [{ name: 'Two calls I made (resolved)', text: 'A board note on #207’s canvas.' }] },
      { id: 'corner-resizing', title: 'Corner resizing', round: 'Round 4', sections: [{ title: 'ACF4 · Resize from every corner', items: [
        { id: 'ACF4', name: 'Floating, resizable from every corner, desktop app, on the map', src: DESK_207('ACF4'), note: { idea: 'The floating window resizes from all four corners, with handles that show faintly on hover.', pros: [], cons: [], recorded: 'Keep · Beautiful, it’s perfect.' } },
        { id: 'ACF4-browser', name: 'Floating, resizable from every corner, localhost browser, on the board', src: DESK_207('ACF4-browser'), note: shortNote('The same, on the localhost page.') },
      ] }], boardNotes: [] },
      { id: 'shared-states', title: 'Shared states', round: 'Round 1', sections: [{ title: 'Loading, fallback and snapshots', items: [
        { id: 'S1', name: 'Cold open: poster, then the canvas', src: DESK_207('S1'), note: shortNote('The poster holds the frame until the canvas is ready.') },
        { id: 'S2', name: 'No bridge: view only', src: DESK_207('S2'), note: shortNote('A canvas that never answers opens view only.') },
        { id: 'S3', name: 'A snapshot (#206)', src: DESK_207('S3'), note: shortNote('An old snapshot opens as one page.') },
      ] }], boardNotes: [] },
    ],
  };

  return {
    user: { login: 'RAbdelrhman', initial: 'R' },
    maps: {
      217: { number: 217, title: 'A Wayfinder mobile app' },
      205: { number: 205, title: 'A polished, smooth canvas built into Wayfinder so users never open a separate browser, as a headline feature' },
    },
    tickets: {
      223: {
        number: 223,
        map: 217,
        type: 'prototype',
        state: 'done',
        title: 'Prototype the following screens: sign-in, repos, map view, ticket detail',
        needs: [],
        unblocks: [224, 225, 226, 229],
        body: {
          question: 'What should following a map look like on a phone: GitHub sign-in, the repo and map lists, a map view with ticket states, and ticket detail?',
          done: ['A design canvas shows clickable phone-sized options for each screen.', 'The user has picked a direction, and the choice is posted as a comment.'],
        },
        comments: [
          { author: 'RAbdelrhman', when: 'Oct 5', text: 'Answer: the prototype is on prototype/223-… and was merged in #263. The user picked S-A, R-C2, M-C and T-C.' },
        ],
        canvas: '223',
      },
      207: {
        number: 207,
        map: 205,
        type: 'prototype',
        state: 'done',
        title: 'Prototype: the in-app canvas viewer shell',
        needs: [],
        unblocks: [208],
        body: {
          question: 'What should opening a canvas inside Wayfinder look like? Covers overlay vs dedicated route or pane, the open/close transition from the tile, the toolbar, and how Esc or Back returns you to the exact place on the map.',
          done: ['A design canvas on the prototype branch shows at least two shell directions as clickable pages.'],
        },
        comments: [{ author: 'RAbdelrhman', when: 'Oct 5', text: 'Answer: the user reviewed it over four rounds and kept round 4, ACF4.' }],
        canvas: '207',
      },
    },
    // Related tickets for Links pills; states only.
    states: { 224: 'claimed', 225: 'claimed', 226: 'claimed', 229: 'frontier', 208: 'done' },
    canvases: { 223: canvas223, 207: canvas207 },
    saved: { when: 'Oct 21, 14:02' },
    limitReset: '14:05',
  };
})();

// The desktop's own state vocabulary (src/ui/chrome.ts STATE_LOOKS), as #223's phone frames use it.
window.STATES = {
  frontier: { label: 'Next up', short: 'next', variable: '--state-frontier', icon: 'arrow' },
  claimed: { label: 'Claimed', short: 'claimed', variable: '--state-claimed', icon: 'person' },
  blocked: { label: 'Blocked', short: 'blocked', variable: '--state-blocked', icon: 'lock' },
  done: { label: 'Done', short: 'done', variable: '--state-done', icon: 'check' },
};
window.TYPE_ICON = { research: 'lens', prototype: 'beaker', grilling: 'grill', task: 'list' };

// #223's icon paths, plus the few the viewer adds (24px grid, currentColor).
Object.assign(Kit.icons, {
  check: '<path d="M20 6 9 17l-5-5"/>',
  lock: '<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  person: '<path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="7" r="4"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  lens: '<circle cx="11" cy="11" r="6.4"/><path d="m20 20-4.4-4.4"/>',
  beaker: '<path d="M9.5 3h5"/><path d="M10.8 3v6.4L5.5 17.9A2 2 0 0 0 7.2 21h9.6a2 2 0 0 0 1.7-3.1L13.2 9.4V3"/><path d="M7.8 15h8.4"/>',
  grill: '<path d="M3.5 8.5h17"/><path d="M5 8.5a7 7 0 0 0 14 0"/><path d="m8.4 14.5-2.4 6.3"/><path d="m15.6 14.5 2.4 6.3"/>',
  list: '<path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/><path d="M8.5 6H20"/><path d="M8.5 12H20"/><path d="M8.5 18H20"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  play: '<path d="m7 4 13 8-13 8z"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  expand: '<path d="M8 3H3v5"/><path d="M16 3h5v5"/><path d="M21 16v5h-5"/><path d="M3 16v5h5"/>',
  shrink: '<path d="M3 8h5V3"/><path d="M21 8h-5V3"/><path d="M16 21v-5h5"/><path d="M8 21v-5H3"/>',
  notes: '<path d="M5 4h14v16H5z"/><path d="M9 9h6"/><path d="M9 13h6"/><path d="M9 17h3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  offline: '<path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M5 12.9a10 10 0 0 1 5.2-2.7"/><path d="M16.8 10.4A10 10 0 0 1 19 12.9"/><path d="M12 20h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  theme: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none"/>',
  download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
});
