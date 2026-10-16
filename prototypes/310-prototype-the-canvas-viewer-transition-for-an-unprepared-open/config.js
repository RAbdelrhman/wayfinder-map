// #310: what the in-app canvas viewer shows while an unprepared canvas boots.
// Every frame is variants/viewer.html; the query picks the direction and the case (see the header of viewer.js).
const FRAME = { width: 1280, height: 800 };
const v = (dir, query) => `variants/viewer.html?dir=${dir}&${query}`;

const NOTES = {
  A: {
    disposition: 'combine',
    feedback: "User, in the #310 thread (2026-10-16), after a canvas note on B (\"I like B. We use skeletons everywhere else so it fits app style as well.\"): \"yes I think combining a with b would look good.\" Built as A+B on the A+B page (round 2).",
    idea: 'Each prototype branch carries a stored screenshot of its canvas board. The card requests it along with its tiles. On a click, the viewer puts it on the stage during the existing 220 ms opening, and the live canvas replaces it in place once it paints. A variant tile opens on that option\'s own screenshot instead (tiles that have one already do this today through posterFor). The toolbar keeps today\'s "Loading the canvas…" status and the tools stay off until the canvas is live. A missing or undecodable poster leaves today\'s plain stage: no broken image and no message.',
    pros: [
      'Content is on screen from the click in every unprepared case, including the localhost p90 of 738 ms measured in #214',
      'Extends what the viewer already does for screenshot tiles (posterFor); no new controls',
      'Reduced motion: the poster appears in place with no animation',
      'SHA-addressed like every /proto/ file, so a poster always belongs to the commit being opened',
    ],
    cons: [
      'Needs a poster file on every canvas branch: a capture step at prototype time. Older branches and snapshots have none and keep the empty stage.',
      'Fetched only on the click it would be late: an uncached GitHub read took 506–690 ms in #206. It has to be requested with the card, which adds one file read per card per new SHA (not measured), then comes from #306\'s disk cache.',
      'It looks live but is not: clicks and tool keys do nothing until the canvas paints, up to 738 ms (localhost p90)',
      'Captured at one size and theme. In the side pane, the floating window or a different zoom the live canvas lays out differently, so it visibly jumps when it replaces the poster. This prototype captures both themes; size still differs.',
    ],
  },
  B: {
    disposition: 'combine',
    feedback: "User, in the #310 thread (2026-10-16), after a canvas note on B (\"I like B. We use skeletons everywhere else so it fits app style as well.\"): \"yes I think combining a with b would look good.\" Built as A+B on the A+B page (round 2).",
    idea: 'The stage shows the canvas\'s shape at once: a bar and one frame per option, labelled with the option ids and names the tile already hands the viewer, under a slow sheen. The live canvas replaces it when it paints. Opening a variant tile shows one page-shaped placeholder with that option\'s name. Status and tools behave as today.',
    pros: [
      'No new files and no GitHub calls; works for every canvas, old branches and snapshots included',
      'Never looks clickable before it is',
      'The real option names let you find your option before the canvas paints',
      'Reduced motion: the same placeholder, still, with no sheen',
    ],
    cons: [
      'Real content still waits for the canvas: 241 ms desktop and 443 ms localhost medians on #196 (p90 296 and 738)',
      'The board\'s real layout (sections, frame sizes, columns, zoom) is unknown until the canvas boots, so the grid shifts when the live board replaces it',
      'On a light board that boots fast (#163: 75 ms localhost) the placeholder shows for only a few frames, which can read as a flicker',
    ],
  },
  C: {
    idea: 'The click is answered on the map: the tile or Canvas button presses in at once, and if the canvas is not ready after 150 ms a small ring appears (on the Canvas button it takes the play icon\'s place). The viewer opens with its 220 ms animation only when the canvas can paint, so it never shows an empty stage. If it is still not ready after 1 s, the viewer opens anyway in today\'s loading state. Prepared opens look exactly like today.',
    pros: [
      'No empty stage up to the cap, and the opening animation always lands on real content',
      'No new files or calls; the smallest visible change',
      'Reduced motion: no press scale, a still ring, and the viewer appears without animation',
    ],
    cons: [
      'The open itself is late by the boot time: 241 ms desktop, 443 ms localhost medians, 738 ms localhost p90. That misses the map\'s "open under 300 ms" on localhost.',
      'The map stays live while it waits: a second click, Esc and the URL change all need rules (here a second click is ignored)',
      'The 1 s cap and 150 ms ring delay are design values, not measurements. A loaded laptop showed up to 1,475 ms in #214, which would fall back to the plain stage.',
    ],
  },
  D: {
    idea: 'Opening an option from a tile that already previews it: the tile\'s own picture grows into the stage with the opening animation and stays until the canvas presents that option. In production it would be the tile\'s live preview frame, moved with a transform rather than reparented (moving an iframe reloads it). The Canvas button has no tile for the whole board, so a board open shows today\'s plain stage.',
    pros: [
      'No new files or calls; content from the click for option opens',
      'The picture is exactly what you clicked, so it cannot be stale',
      'Reduced motion: the picture is in the stage at once, with no growth',
    ],
    cons: [
      'Does not cover the Canvas button, the board open #214 measured on #196',
      'Lifting a live tile frame out of its card is unproven: scroll-container clipping, stacking order, and a lazy tile that has not loaded has nothing to lift (plain stage)',
      'The tile shows the option page alone; the canvas presents it under its own bar, so the picture shifts at the hand-over',
    ],
  },
  E: {
    idea: 'Nothing new on screen. The viewer starts preparing sooner than today\'s 120 ms dwell, for example for the card nearest the pointer or the first one in view, within a budget. An immediate click (touch, Enter, a fast click) on a board that was not prepared still shows today\'s empty stage, as in these frames.',
    pros: [
      'No visual change, nothing to design or capture',
      'Every open it does prepare is 12–21 ms with no empty frames (#214)',
      'Under #306 it loads only what the viewer selects, never a speculative download',
    ],
    cons: [
      'Cannot cover an immediate click on an unprepared board: the empty stage stays (median 207 ms desktop, 408 ms localhost)',
      'The viewer keeps one iframe today. Preparing several boards needs its own memory and CPU budget, which has not been measured.',
      'Does not give the map\'s "no blank flash" for touch and keyboard users',
    ],
  },
};
const NOTE_AB = {
  basedOn: ['A', 'B'],
  idea: "The skeleton from B, drawn in the app's own loading style (src/ui/skeleton.ts bone() and .wf-bone, the same bars the Prototypes board shows while it loads), goes on the stage at the click. When the branch has a poster and it has decoded, it sits over the skeleton, so you see the board itself; the live canvas replaces both once it paints. A missing poster, one that fails to decode, or one still downloading at the click leaves the skeleton showing, never an empty stage. Toolbar status and tools behave as today: \"Loading the canvas…\" and tools off until live.",
  pros: [
    'No empty stage in any unprepared case, for every canvas: old branches and snapshots get the skeleton, branches with a poster get the board picture',
    "Matches the app's existing loading pattern instead of a new one, as you noted on B",
    'A poster that arrives late or breaks degrades to the skeleton, not to a blank or a broken image',
    "Reduced motion: no opening animation, and the bones' pulse stops (the app's existing reduced-motion rule)",
  ],
  cons: [
    'Two things to build: the skeleton, plus the poster capture step and its card-time request (one file read per card per new SHA, not measured, then #306 disk cache)',
    'A board with a poster and one without open differently, which is visible if you compare them',
    'Poster and skeleton are both still pictures: clicks and tool keys do nothing until the canvas paints (up to 738 ms localhost p90)',
    'The skeleton grid and the poster are both laid out for one viewer size; the live board can still shift when it replaces them',
  ],
};
const NAMES = { AB: 'Poster over skeleton', A: 'Poster', B: 'Skeleton', C: 'Hold the open', D: 'Lift the tile', E: 'Prepare earlier only' };

// What a frame shows, in words, for the board note.
const FIRST = {
  AB: 'The poster, over the skeleton, is on the stage from the click and rides the opening animation',
  A: 'The poster is on the stage from the click and rides the opening animation',
  B: 'The skeleton is on the stage from the click and rides the opening animation',
  C: 'The tile presses in; the viewer stays closed',
  D: "Tile A's picture grows into the stage from the click",
  E: 'The stage is empty under the opening animation',
};
const caseNote = (dir, ms) =>
  ms === 'prep'
    ? 'The pointer rests 400 ms first, so the canvas is ready about 16 ms after the click (#214: 12–21 ms). Every direction looks the same here: the live canvas rides the opening animation.'
    : `${FIRST[dir]}${dir === 'C' ? (ms > 150 ? ', and a ring appears at 150 ms' : '') + `. At ${ms} ms the viewer opens on the live canvas.` : `. The live canvas replaces it at ${ms} ms and the tools turn on.`}`;

// The timing matrix every direction shows: prepared, then 200, 440 and 740 ms with no lead-in, on both surfaces.
const matrix = (dir, extra = '') =>
  ['desktop', 'localhost'].map((surface) => ({
    title: surface === 'desktop' ? 'Desktop app' : 'Localhost UI',
    note: 'Each frame replays the open on a loop. Use Slow ×4 in the dashed prototype bar to watch the first 740 ms.',
    items: [
      { id: `${dir}-${surface[0]}0`, name: 'Prepared open (pointer rested 400 ms)', src: v(dir, `surface=${surface}&ready=prep${extra}`), ...FRAME, note: caseNote(dir, 'prep') },
      ...[200, 440, 740].map((ms) => ({ id: `${dir}-${surface[0]}${ms}`, name: `No lead-in · ready at ${ms} ms`, src: v(dir, `surface=${surface}&ready=${ms}${extra}`), ...FRAME, note: caseNote(dir, ms) })),
    ],
  }));

const page = (dir, edges, edgeNote) => ({
  id: `${dir.toLowerCase()}-${NAMES[dir].toLowerCase().replace(/[^a-z]+/g, '-')}`,
  title: `${dir} · ${NAMES[dir]}`,
  round: 'Baseline',
  sections: [
    ...matrix(dir, dir === 'D' ? '&entry=option' : ''),
    { title: 'Reduced motion and edge cases', note: edgeNote, items: edges },
    { title: 'Trade-offs', items: [{ id: `${dir}-why`, kind: 'note', name: `${dir} · ${NAMES[dir]}`, text: `${NOTES[dir].idea}\n\nFor: ${NOTES[dir].pros.join('. ')}.\n\nAgainst: ${NOTES[dir].cons.join(' ')}` }] },
  ],
});
const edge = (dir, key, name, query, note) => ({ id: `${dir}-${key}`, name, src: v(dir, query), ...FRAME, note });

window.CANVAS = {
  title: 'Opening an unprepared canvas',
  question: 'What should the viewer show between a no-lead-in click (touch, Enter, a fast click) and the moment the canvas can paint?',
  sampleState: 'A fake 16-option board standing in for #196, drawn with screenshots of earlier prototypes. Timings are simulated from the #214 measurements; nothing here was measured. The viewer toolbar is the shipped ACF4 bar with D4 tools, rendered from src/ui/canvasViewer.ts.',
  ticket: 310,
  pages: [
    {
      id: 'directions',
      title: 'Directions',
      round: 'Baseline',
      sections: [
        {
          title: 'Five directions · desktop app · no lead-in · ready at 440 ms',
          note: 'Same click, same canvas, same timing. D is shown from a variant tile, the only entry it covers. Open each direction\'s page for the full timing matrix, localhost and the edge cases.',
          items: [
            { id: 'A', name: NAMES.A, src: v('A', 'ready=440'), ...FRAME, boardWidth: 520, note: NOTES.A },
            { id: 'B', name: NAMES.B, src: v('B', 'ready=440'), ...FRAME, boardWidth: 520, note: NOTES.B },
            { id: 'C', name: NAMES.C, src: v('C', 'ready=440'), ...FRAME, boardWidth: 520, note: NOTES.C },
            { id: 'D', name: NAMES.D, src: v('D', 'ready=440&entry=option'), ...FRAME, boardWidth: 520, note: NOTES.D },
            { id: 'E', name: NAMES.E, src: v('E', 'ready=440'), ...FRAME, boardWidth: 520, note: NOTES.E },
          ],
        },
        {
          title: 'Notes',
          items: [
            {
              id: 'evidence',
              kind: 'note',
              name: 'Evidence these frames use',
              text: 'From #214 (2026-10-14, i7-8750H laptop, branch cached), #196 with no lead-in: desktop ready 241 ms (p90 296), empty stage median 207 ms; localhost ready 443 ms (p90 738), empty stage median 408 ms (max 705; up to 1,475 ms on the loaded laptop). With a 400 ms pointer rest: on screen in 12–21 ms, no empty frames. #163 (3 frames): 146 ms desktop, 75 ms localhost.\n\nFrom #306: startup and list refresh spend zero calls on speculative canvas downloads; tile and viewer requests choose what loads; successful SHA-addressed bytes persist in a 50 MiB account-scoped disk cache. From #206: one uncached GitHub file read took 506–690 ms.\n\nShipped viewer (main ab62ec7): one retained iframe, prepared after a 120 ms pointer or focus dwell or on pointerdown; a 220 ms tile-to-viewer animation; a tile screenshot is held under the canvas when the tile has one; the tools are off with "The canvas is still loading" until the canvas answers; after 3 s with no answer the viewer shows "View only".\n\nThe 200, 440 and 740 ms cases come from the ticket. The prototype plays them with timers, so they show what each direction looks like at those times, not how fast anything is.',
            },
            {
              id: 'review',
              kind: 'note',
              name: 'Design review',
              text: "Sources: the toolbar is rendered by src/ui/canvasViewer.ts canvasToolbarHtml with the D4 tool row from src/ui/canvasFeedback.ts (main ab62ec7; variants/toolbars.js), so Close, title, status, page menu, option strip, Feedback, GitHub and size controls are the shipped ones. Tokens, the card and tiles use src/ui/styles.css (.viz-root light and dark, .vw, .wf-proto, .wf-var). Behaviour copied from canvasViewer.ts: 220 ms animateFrom, posterFor, the 120 ms prepare dwell, focus to Close on open and back to the entry on close, and the tools' 'The canvas is still loading' state. Numbers from docs/design/in-app-canvas-viewer.md (#214), #306 and #206.\n\nChecked (Playwright Chromium 1280x800, no page errors): every direction opened by keyboard (focus the entry, Enter); focus moves to Close, Esc closes and focus returns to the entry; tools stay aria-disabled until live. C sets aria-busy on the held entry. prefers-reduced-motion: no viewer animation, no sheen or spin. Light and dark captured for A, B, C; posters exist in both themes. Missing and undecodable posters fall back to the plain stage with no console noise beyond the failed decode.\n\nFindings: C has no spoken cue while it holds (aria-busy only); production would need a status message. D's lift of a live tile frame is shown with the tile's picture; whether a live iframe can be lifted without clipping or reloading is not verified. The skeleton grid in B is a guess at the board's layout.\n\nRound 2 (A+B): the skeleton uses the app's own .wf-bone and bone() markup from src/ui/styles.css and src/ui/skeleton.ts, whose existing reduced-motion rule stops the pulse. Checked in light and dark: poster present, poster missing, poster undecodable, poster arriving after the click, and the variant tile on localhost (fixed: the page bone overflowed the localhost stage; it now fits its height).\n\nNot checked: screen readers, side pane and floating sizes (all frames are full window), touch input on a real device, 200% zoom, the real desktop app or localhost page (both surfaces are drawn), timing on real hardware (timers only).",
            },
          ],
        },
      ],
    },
    {
      id: 'ab-poster-over-skeleton',
      title: 'A+B · Poster over skeleton',
      round: 2,
      question: 'Is A+B, the poster over the app-style skeleton, the direction #304 should build?',
      sections: [
        {
          title: 'The combination',
          note: 'Desktop app, no lead-in, ready at 440 ms. Based on A and B.',
          items: [{ id: 'AB', name: NAMES.AB, src: v('AB', 'ready=440'), ...FRAME, boardWidth: 640, note: NOTE_AB }],
        },
        ...matrix('AB').map((section) => ({ ...section, items: section.items.map((item) => ({ ...item, note: { basedOn: ['A', 'B'], idea: item.note } })) })),
        {
          title: 'Reduced motion and poster cases',
          note: 'Every case where the poster is not there shows the skeleton.',
          items: [
            edge('AB', 'rm', 'Reduced motion · 440 ms', 'ready=440&motion=reduce', { basedOn: ['A', 'B'], idea: 'The viewer appears in place with the poster over a still skeleton; the live canvas replaces both at 440 ms.' }),
            edge('AB', 'opt', 'Variant tile · option screenshot · 440 ms', 'ready=440&entry=option', { basedOn: ['A', 'B'], idea: "Opens on option A's screenshot over a page-shaped skeleton, then the canvas presents A." }),
            edge('AB', 'miss', 'Poster missing · 440 ms', 'ready=440&poster=missing', { basedOn: ['A', 'B'], idea: 'No poster on the branch (older canvases, snapshots): the skeleton until the canvas paints.' }),
            edge('AB', 'fail', 'Poster fails to decode · 440 ms', 'ready=440&poster=failed', { basedOn: ['A', 'B'], idea: 'The poster is dropped silently and the skeleton stays: no broken image, no message.' }),
            edge('AB', 'late', 'Poster still downloading at the click · 440 ms', 'ready=440&poster=late', { basedOn: ['A', 'B'], idea: 'The skeleton shows first and the poster covers it when it decodes (200 ms here, a chosen case, not a measurement).' }),
          ],
        },
      ],
    },
    page('A', [
      edge('A', 'rm', 'Reduced motion · 440 ms', 'ready=440&motion=reduce', "No growth from the tile: the viewer and its poster appear in place at the click, and the live canvas replaces the poster at 440 ms."),
      edge('A', 'opt', 'Variant tile · option screenshot · 440 ms', 'ready=440&entry=option', "A variant tile opens on that option's screenshot, not the board poster. The live canvas then presents option A."),
      edge('A', 'miss', 'Poster missing · 440 ms', 'ready=440&poster=missing', "No poster on the branch (older canvases): today's plain stage until the canvas paints at 440 ms."),
      edge('A', 'fail', 'Poster fails to decode · 440 ms', 'ready=440&poster=failed', "The poster request returns bytes that do not decode. The image is dropped silently: today's plain stage, no broken-image icon, no message."),
    ], 'Missing and failed posters both fall back to the plain stage of today, with no broken-image icon and no message. Switch the canvas to dark (T) to see the dark capture.'),
    page('B', [
      edge('B', 'rm', 'Reduced motion · 440 ms', 'ready=440&motion=reduce', "The viewer appears in place with a still skeleton (no sheen); the live canvas replaces it at 440 ms."),
      edge('B', 'opt', 'Variant tile · 440 ms', 'ready=440&entry=option', "One page-shaped placeholder named after option A, then the live canvas presenting A."),
      { id: 'B-poster', kind: 'note', name: 'Missing or failed poster', text: 'B uses no image, so a missing or failed poster cannot happen. Every canvas, old or new, gets the same placeholder.' },
    ], 'Reduced motion keeps the placeholder and removes the sheen and the opening animation.'),
    page('C', [
      edge('C', 'rm', 'Reduced motion · 440 ms', 'ready=440&motion=reduce', "The Canvas button does not scale; a still ring shows from 150 ms; the viewer appears in place at 440 ms."),
      edge('C', 'opt', 'Variant tile · 440 ms', 'ready=440&entry=option', "Tile A presses in and shows the ring over its picture, then the viewer grows from it at 440 ms."),
      edge('C', 'cap', 'Past the 1 s cap · ready at 1,475 ms (loaded laptop, #214)', 'ready=1475', "At 1 s the hold gives up: the viewer opens in today's loading state with an empty stage, and the canvas paints at 1,475 ms."),
      { id: 'C-poster', kind: 'note', name: 'Missing or failed poster', text: 'C uses no image, so a missing or failed poster cannot happen. Past the 1 s cap it opens on today\'s plain stage until the canvas paints.' },
    ], 'Reduced motion: no press scale, a still ring, and the viewer appears without its animation.'),
    page('D', [
      edge('D', 'rm', 'Reduced motion · variant tile · 440 ms', 'ready=440&entry=option&motion=reduce', "The tile's picture fills the stage at once with no growth; the canvas presents A at 440 ms."),
      edge('D', 'board', 'Canvas button (board) · 440 ms: nothing to lift', 'ready=440', "No tile previews the whole board, so D shows today's plain stage until 440 ms."),
      { id: 'D-poster', kind: 'note', name: 'Missing or failed picture', text: 'D lifts the tile, not a stored poster. A tile whose preview has not loaded yet (tiles load lazily) or failed has nothing to lift, so the open falls back to today\'s plain stage, the same as the Canvas button frame.' },
    ], 'The matrix above opens variant tile A, the case D covers.'),
    page('E', [
      edge('E', 'rm', 'Reduced motion · 440 ms', 'ready=440&motion=reduce', "Today's reduced-motion open: the viewer appears in place with an empty stage until 440 ms."),
      edge('E', 'opt', 'Variant tile · 440 ms', 'ready=440&entry=option', "A live-preview tile has no screenshot to hold, so the stage is empty until 440 ms."),
      { id: 'E-poster', kind: 'note', name: 'Missing or failed poster', text: 'E adds no image. A variant tile that has a screenshot already shows it under the canvas today (posterFor); a tile that previews a live page, like #196\'s, has none.' },
    ], 'Today\'s screen. Only how often an open is prepared would change.'),
  ],
};
