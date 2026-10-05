/*
  Wayfinder's canvas for ticket #207: the in-app canvas viewer shell.
  Paths are relative to index.html. Check with: node prototypes/canvas/tools/check.mjs
*/

window.CANVAS = {
  ticket: 207,
  title: 'The in-app canvas viewer shell',
  question:
    'What should opening a canvas inside Wayfinder look like: an overlay, a route, or a pane; how it opens from the tile and closes back; what the toolbar holds; and how Esc or Back returns you to the exact place on the map?',
  sampleState:
    'Fake map #300 "Offline drafts". #211 is a design canvas waiting on a pick in #218, with two pages (Directions A/B/C, States S1/S2). #206 is an old snapshot that was decided. Every frame is live: open a canvas from the Prototypes board (the Canvas button or a variant tile) or from the ticket panel\'s tile on the Map view (select #211 or #206). The canvas inside is a stand-in that speaks the #206 bridge. The dashed Prototype bar switches the window between the desktop app and a localhost browser tab, slows the open down to show the poster, and turns the bridge off to show the view-only fallback. In the browser frame, the arrows by the address bar are the browser\'s Back and Forward; Alt+← and Alt+→ work in both frames.',

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
      title: 'Directions',
      round: 1,
      sections: [
        {
          title: 'A · Overlay',
          note: 'The canvas grows out of the tile and covers the whole window, rail and top bar included. The app stays mounted underneath, inert.',
          items: [
            {
              id: 'A',
              name: 'Overlay, desktop app, from the board',
              src: 'variants/viewer-a.html?frame=desktop&view=prototypes',
              note: {
                idea:
                  'Click the Canvas button or a variant tile and its picture grows to fill the window. The tile\'s picture is the poster, so there is no blank frame. The canvas fades in over it when the bridge says ready. One toolbar across the top: Close (Esc), the title, the canvas page menu, Board · A · B · C (an option opens full size), ← → while one is open, and the branch on GitHub. Close or Esc shrinks it back into the tile it came from and puts focus back on that tile. Opening adds one history entry (?canvas=211), so Back closes it too. Switching options or pages only replaces the hash: Back never steps through options.',
                pros: [
                  'Exact return for free: the map or board never unmounts, so scroll, pan, zoom and selection cannot drift',
                  'The biggest canvas: only one 52 px bar of chrome',
                  'The grow-from-tile transition reads clearly, because the target is the whole window',
                  'Keeping the iframe mounted after close is natural: the overlay is just hidden',
                ],
                cons: [
                  'Hides the app: hand-offs, Next and the map are out of sight while a canvas is open',
                  'A modal: it needs a focus trap, inert app and aria-modal, and the rail can\'t be used to jump elsewhere without closing first',
                  'Feels like a lightbox rather than a place in the app; a deep link opens an overlay over a page you have not seen yet',
                ],
                disposition: 'combine',
                feedback: 'Combine with C (round 2, AC). The user wrote: "They all look great could we default to A with option to go smaller like in C. We could even have a setting to make default canvas size pane or full."',
              },
            },
            {
              id: 'A-browser',
              name: 'Overlay, localhost browser, from the ticket panel',
              src: 'variants/viewer-a.html?frame=browser&view=map',
              note: {
                idea:
                  'The same overlay on the localhost page. Select #211 on the map and click its tile in the ticket panel. The address bar shows ?ticket=211&canvas=211#directions/B; the browser\'s Back closes the overlay and leaves the map exactly as it was.',
                pros: ['Back is the browser\'s own button, and a copied URL reopens the same canvas and option'],
                cons: ['The browser tab\'s own chrome plus the overlay bar: two rows of controls above the canvas'],
              },
            },
          ],
        },
        {
          title: 'B · Canvas route',
          note: 'The canvas is a page in the app. The rail stays; the top bar becomes the viewer\'s toolbar. The map view is unmounted and restored from saved state.',
          items: [
            {
              id: 'B',
              name: 'Route, desktop app, from the board',
              src: 'variants/viewer-b.html?frame=desktop&view=prototypes',
              note: {
                idea:
                  'The tile grows into the content area, beside the rail. The top bar turns into the viewer\'s bar: ← Prototypes (or ← Map, wherever you came from), the map name, the title, the page menu, Board · A · B · C, and GitHub. It is a real route, /repos/…/maps/300/canvas/211#directions/B, so Back, a reload and a shared link all land on the canvas. Leaving restores the view\'s scroll, pan, zoom and selection from what was saved on the way in.',
                pros: [
                  'Feels like a place in the app: the rail stays, so Home, Jump to and other maps are one click away',
                  'Deep links and reloads behave like every other Wayfinder page',
                  'One bar of chrome, because the toolbar replaces the top bar rather than stacking under it',
                ],
                cons: [
                  'Exact return depends on saving and restoring state: map pan, zoom and selection have to be captured on the way in, and anything missed drifts',
                  'The map unmounts, so its own redraw costs time on the way back',
                  'The top bar\'s usual controls (hand-offs, Synced, Next) disappear while you look at a canvas',
                  'Needs a new route and its routing tests',
                ],
              },
            },
            {
              id: 'B-browser',
              name: 'Route, localhost browser, from the ticket panel',
              src: 'variants/viewer-b.html?frame=browser&view=map',
              note: {
                idea:
                  'The same route on the localhost page, opened from #211\'s tile in the ticket panel. The address bar shows the canvas path. Back returns to /maps/300?ticket=211 with the map where you left it; Forward reopens the canvas instantly, because the frame stayed mounted.',
                pros: ['The URL is the clearest of the three: the canvas has its own path'],
                cons: ['A reload on the canvas route has to fetch the map too before ← Map can restore anything'],
              },
            },
          ],
        },
        {
          title: 'C · Side pane',
          note: 'The canvas opens in a wide pane beside the map or board. Expand fills the app the way B does.',
          items: [
            {
              id: 'C',
              name: 'Pane, desktop app, from the map',
              src: 'variants/viewer-c.html?frame=desktop&view=map',
              note: {
                idea:
                  'The tile slides out into a pane on the right (60% of the window, up to 820 px), under the top bar, replacing the ticket panel. The map stays live on the left: you can pan it, and the ticket you came from stays selected. The pane has two rows: the title with GitHub, Expand and Close, then the page menu and Board · A · B · C. Expand grows it to the whole content area. Close or Esc slides it back into the tile.',
                pros: [
                  'Keeps context: the map, its ticket and the pick ticket stay in view while you compare options',
                  'Exact return for free in pane mode: the map never unmounts',
                  'Expand gives a full-size canvas when you need it, so one direction covers both needs',
                ],
                cons: [
                  'Cramped at the default size: on a 1320 px window the canvas gets about 790 px, and at the 900 px minimum about 540 px',
                  'Two sizes and two layouts to build, test and polish (pane and expanded)',
                  'Two scrolling surfaces side by side, the map and the canvas, so wheel and drag can go to the wrong one',
                  'It takes the ticket panel\'s place, so the selected ticket\'s details are hidden while it is open',
                ],
                disposition: 'combine',
                feedback: 'Combine with A (round 2, AC): A\'s overlay by default, C\'s pane as the smaller size. The user wrote: "They all look great could we default to A with option to go smaller like in C. We could even have a setting to make default canvas size pane or full."',
              },
            },
            {
              id: 'C-browser',
              name: 'Pane, localhost browser, from the board',
              src: 'variants/viewer-c.html?frame=browser&view=prototypes',
              note: {
                idea:
                  'The same pane on the localhost page, opened from the Prototypes board. The board keeps the left side, so the other prototype cards stay in view. Opening adds ?canvas=211 to the URL; Back closes the pane.',
                pros: ['You can open another card\'s canvas from the left without closing first'],
                cons: ['The board\'s variant strip squeezes into the narrow left side'],
              },
            },
          ],
        },
      ],
    },
    {
      title: 'A + C remix',
      round: 2,
      question:
        'Round 2, from your feedback on round 1: open as A\'s overlay by default, shrink to C\'s side pane when you want the map beside it, and a setting for which size a canvas opens at. Does this combination work?',
      sections: [
        {
          title: 'AC · Overlay that shrinks to a pane',
          note: 'Opens full window like A. A Shrink button in the toolbar turns it into C\'s pane beside a live map or board; Fill the window turns it back. Settings › Preferences picks the size a canvas opens at. The dashed Prototype bar\'s "Setting: open as" switches it here.',
          items: [
            {
              id: 'AC',
              name: 'Overlay that shrinks to a pane, desktop app, from the board',
              src: 'variants/viewer-ac.html?frame=desktop&view=prototypes',
              note: {
                basedOn: ['A', 'C'],
                idea:
                  'Click Canvas on #211: it grows out of the tile into A\'s overlay, with A\'s one-row toolbar and a Shrink button at the right end. Shrink slides it into C\'s pane (60% of the window, up to 820 px) under the top bar. The overlay\'s scrim and modal go away, so the board or map on the left is live again. In the pane, Fill the window brings the overlay back. Close, Esc or Back closes from either size, back into the tile, and focus returns to the tile. Size changes do not add history entries, so Back always closes. The map stays mounted at both sizes, so you return to the exact place without saving and restoring state. C\'s third size, filling the content area beside the rail, is dropped: full window already covers it.',
                pros: [
                  'A\'s strengths by default: the biggest canvas, the clearest grow-from-tile transition, exact return for free',
                  'C\'s context when you want it: the map, its tickets and the pick ticket stay visible beside the options',
                  'Two sizes, not C\'s three: overlay and pane are the only layouts to build and test',
                  'People who always want the pane set it once',
                ],
                cons: [
                  'Two layouts and two toolbars (A\'s row and C\'s two rows), plus the switch between them, all need building and testing',
                  'The viewer is a modal dialog at one size and a region at the other, so focus handling and screen reader semantics change when you resize',
                  'In the pane, the ticket panel is hidden and two scroll surfaces sit side by side, as in C',
                  'Open question: should Shrink and Fill the window only last for this open, or update the setting (remember the last size)? Built here as this-open-only.',
                ],
                disposition: 'change',
                feedback: 'Change: add a floating window size (round 3, ACF). Keep the open-in-browser button at full window and side pane; drop it when floating. The user wrote: "looks amazing could you have a floating window option? Like this [screenshot of the viewer as a small window floating over another app]. When fullscreen or half view i want the open in browser button. but when floating that button could go away"',
              },
            },
            {
              id: 'AC-browser',
              name: 'Overlay that shrinks to a pane, localhost browser, from the ticket panel',
              src: 'variants/viewer-ac.html?frame=browser&view=map',
              note: {
                basedOn: ['A-browser', 'C'],
                idea:
                  'The same viewer on the localhost page, opened from #211\'s tile in the ticket panel. The URL gets ?canvas=211 at both sizes, so the browser\'s Back closes it. Shrink it to pan the map while the canvas stays open.',
                pros: ['In the pane, the browser chrome and one toolbar sit above a map you can still use'],
                cons: ['At full window, the tab\'s chrome plus the overlay bar still means two rows of controls, as in A'],
              },
            },
            {
              id: 'AC-pane',
              name: 'Setting on "Side pane": opens straight into the pane',
              src: 'variants/viewer-ac.html?frame=desktop&view=map&size=pane',
              note: {
                basedOn: ['A', 'C'],
                idea:
                  'The same viewer with the setting on Side pane. Select #211 on the map and click its tile: it opens straight into the pane, and Fill the window grows it to the overlay.',
                pros: ['Opening matches how you work, with no extra click each time'],
                cons: ['A setting has to be found first: until someone changes it, everyone gets the overlay'],
              },
            },
            {
              id: 'AC-setting',
              kind: 'components',
              name: 'The setting, in Settings › Preferences',
              width: 640,
              columns: 1,
              items: [
                {
                  label: 'Settings › Preferences, a new row under the existing ones (same segmented control as Theme)',
                  html: '<section class="settings-section" aria-labelledby="ac-prefs"><h3 id="ac-prefs">Preferences</h3><div class="settings-row"><span class="grow">Theme</span><span class="segmented" role="group" aria-label="Theme"><button type="button" class="seg" aria-pressed="false">Light</button><button type="button" class="seg is-on" aria-pressed="true">Dark</button></span></div><div class="settings-row"><span class="grow">Open canvases<span class="hint">How big a prototype canvas is when you open it. You can still resize it from its toolbar.</span></span><span class="segmented" role="group" aria-label="Open canvases"><button type="button" class="seg is-on" aria-pressed="true">Full window</button><button type="button" class="seg" aria-pressed="false">Side pane</button></span></div></section>',
                },
              ],
              note: {
                basedOn: ['A', 'C'],
                idea:
                  'One new row in the Preferences section of the existing Settings dialog, using the same segmented control as Theme and Default model tier. Full window is the default. This is the only place the default is set: the viewer\'s Shrink and Fill the window buttons change the open canvas only.',
                pros: ['Reuses the existing Settings dialog and control, so no new kind of UI'],
                cons: ['One more preference in a list that is already growing'],
              },
            },
          ],
        },
      ],
    },
    {
      title: 'Floating window',
      round: 3,
      question:
        'Round 3, from your feedback on AC: add a floating window as a third size. Full window and Side pane keep the ↗ button; the floating window drops it. Does this work?',
      sections: [
        {
          title: 'ACF · Full window, side pane or floating',
          note: 'AC with a third size. One size switch (Full window · Side pane · Floating) sits in every size\'s toolbar and replaces AC\'s Shrink and Fill the window buttons. The floating window moves by its title row and resizes from its bottom-right corner. Settings › Preferences gets the third choice too. The dashed Prototype bar\'s "Setting: open as" switches it here.',
          items: [
            {
              id: 'ACF',
              name: 'Full, pane or floating, desktop app, from the board',
              src: 'variants/viewer-acf.html?frame=desktop&view=prototypes',
              note: {
                basedOn: ['AC'],
                idea:
                  'Click Canvas on #211: it opens full window as in AC. The size switch at the right end of the toolbar has three icons: Full window, Side pane, Floating. Floating shrinks it into a 560 × 380 window in the bottom-right corner, with rounded corners and a shadow, over a board or map you can still use. Drag its title row to move it and its corner to resize it (at least 360 × 240). It stays where you left it the next time it floats. The floating toolbar keeps the title, the size switch, Close, and on a second row the page menu and Board · A · B · C. It has no ↗ button. Esc, Close or Back closes it from any size, back into the tile.',
                pros: [
                  'Compare the canvas with the map or another ticket at whatever size and place suits you, without a fixed split',
                  'One size switch instead of separate Shrink and Fill buttons, so every size is one click from every other',
                  'The floating toolbar is smaller, with nothing in it you need less often',
                ],
                cons: [
                  'Three layouts to build and test, plus moving, resizing and keeping the window inside the app',
                  'A small floating window shows the canvas scaled down: at 560 px wide, a canvas page is hard to read until you resize it or go full window',
                  'Moving and resizing are pointer only here. Keyboard users get the size switch but cannot move or resize the floating window yet',
                  'The floating window covers part of the map, and nothing moves the map out of its way',
                ],
              },
            },
            {
              id: 'ACF-float',
              name: 'Setting on "Floating": opens straight into the floating window',
              src: 'variants/viewer-acf.html?frame=desktop&view=map&size=float',
              note: {
                basedOn: ['AC'],
                idea:
                  'The setting on Floating. Select #211 on the map and click its tile: it opens as the floating window in the corner, and the map stays usable behind it. The size switch grows it to the pane or full window.',
                pros: ['Suits people who keep a canvas open while they work through the map'],
                cons: ['Opening into a small window first means an extra click for anyone who wants to read the canvas closely'],
              },
            },
            {
              id: 'ACF-browser',
              name: 'Full, pane or floating, localhost browser, from the ticket panel',
              src: 'variants/viewer-acf.html?frame=browser&view=map',
              note: {
                basedOn: ['AC-browser'],
                idea:
                  'The same viewer in the localhost tab, opened from #211\'s tile in the ticket panel. The URL gets ?canvas=211 at every size; changing size adds no history, so the browser\'s Back still closes it.',
                pros: ['The floating window keeps the canvas in reach without leaving the tab'],
                cons: ['At full window, the tab\'s chrome plus the viewer\'s bar is still two rows of controls, as in A'],
              },
            },
            {
              id: 'ACF-setting',
              kind: 'components',
              name: 'The setting, with a third choice',
              width: 640,
              columns: 1,
              items: [
                {
                  label: 'Settings › Preferences, the same row as round 2 with Floating added',
                  html: '<section class="settings-section" aria-labelledby="acf-prefs"><h3 id="acf-prefs">Preferences</h3><div class="settings-row"><span class="grow">Theme</span><span class="segmented" role="group" aria-label="Theme"><button type="button" class="seg" aria-pressed="false">Light</button><button type="button" class="seg is-on" aria-pressed="true">Dark</button></span></div><div class="settings-row"><span class="grow">Open canvases<span class="hint">How big a prototype canvas is when you open it. You can still resize it from its toolbar.</span></span><span class="segmented" role="group" aria-label="Open canvases"><button type="button" class="seg is-on" aria-pressed="true">Full window</button><button type="button" class="seg" aria-pressed="false">Side pane</button><button type="button" class="seg" aria-pressed="false">Floating</button></span></div></section>',
                },
              ],
              note: {
                basedOn: ['AC-setting'],
                idea:
                  'The round 2 row with a third choice, Floating. Full window stays the default. This is my guess: you asked for a floating option, not for it in the setting.',
                pros: ['Every size can be the one a canvas opens at'],
                cons: ['Three choices in a row that already sits in a long list'],
              },
            },
            {
              id: 'ACF-questions',
              kind: 'note',
              name: 'Two calls I made',
              text:
                'Open in browser: the ↗ button in every round opens the prototype branch on GitHub, in the system browser. I took that to be the button you meant, and kept it at full window and side pane only. If you meant a new button that opens the canvas itself in the browser, that is a different control. Say so and I will add it.\n\nThe setting: I added Floating as a third choice in Settings › Preferences.',
            },
          ],
        },
      ],
    },
    {
      title: 'Shared states',
      round: 1,
      question: 'States every direction has to handle, shown in one direction each. Every frame\'s Prototype bar can switch them on in any direction.',
      sections: [
        {
          title: 'Loading, fallback and snapshots',
          items: [
            {
              id: 'S1',
              name: 'Cold open: poster, then the canvas',
              src: 'variants/viewer-c.html?frame=desktop&view=prototypes&cold=1',
              note: {
                idea:
                  'With the branch not cached yet (here, a 1.2 s delay), the pane shows the tile\'s picture as a poster and "Loading the canvas…" in the toolbar. The canvas fades in when the wrapper says ready. Click Canvas on #211 to see it; open it a second time and it is instant, because the frame stayed mounted.',
                pros: ['Never a blank white frame, warm or cold'],
                cons: ['The poster is the tile\'s picture, so a canvas opened on page 2 briefly shows page 1'],
              },
            },
            {
              id: 'S2',
              name: 'No bridge: view only',
              src: 'variants/viewer-a.html?frame=desktop&view=prototypes&bridge=0',
              note: {
                idea:
                  'When the wrapper never answers (the research\'s fourth fallback), the canvas still opens in-app, after a short wait. The page menu and Board · A · B · C are replaced by a "View only" chip whose tooltip says why. The canvas still works inside the frame.',
                pros: ['Nothing breaks: the user still sees the canvas inside Wayfinder'],
                cons: [
                  'Esc pressed while focus is inside the canvas cannot reach Wayfinder without the bridge; only the toolbar, Back or Alt+← close it',
                ],
              },
            },
            {
              id: 'S3',
              name: 'A snapshot (#206)',
              src: 'variants/viewer-b.html?frame=desktop&view=prototypes',
              note: {
                idea:
                  'Click Canvas on #206. A snapshot is one page without a canvas engine, so the wrapper reports source "page". The toolbar shows a Snapshot chip and no page menu or options.',
                pros: ['Old prototypes (#8, #17) open in-app the same way as canvases'],
                cons: ['The variant strip\'s option letters can\'t be switched inside a snapshot'],
              },
            },
            {
              id: 'review',
              kind: 'note',
              name: 'Design review',
              text:
                'Sources inspected: src/ui/styles.css (tokens, .wf-proto, .wf-strip, .proto-tile, .topbar, .segmented, .ghost, .iconbtn, .chip), src/ui/prototypeBoard.ts and prototypeTile.ts (the board and tile markup copied here), src/ui/app.ts (routing via ?view= and pushState), src/desktop/main.ts (window 1320×860, minimum 900×620, setWindowOpenHandler), src/repoRoutes.ts, and docs/design/in-app-canvas-viewer.md (#206). The app chrome uses the real stylesheet and classes; the viewer adds only viewer.css, which uses existing tokens.\n\nChecked: dark (system) and light (?theme=light). In A, B and C: open from the tile, Esc to close, Alt+← to close and Alt+→ to reopen, with focus returning to the tile that opened the canvas (keys sent as scripted keydown events, not a physical keyboard). The browser frame’s Back and Forward buttons in B. Map scroll and selection after closing: B restored 120,60 with #211 selected; C kept 90,40 through Expand and Esc. The view-only fallback (bridge off) and a snapshot (#206). Layout at 1280×800 and at the desktop minimum of 900×620, where the toolbar drops its labels to icons and still fits. Contrast of the new colours, computed: address-bar host 4.92:1 (light) and 6.74:1 (dark), the sample canvas’s muted text 5.49:1 and 7.84:1, its warning text 5.02:1 and 10.51:1, the kbd hint 5.28:1. Semantics by reading the markup: A is role=dialog with aria-modal and an inert app behind it; B and C are labelled regions; the page menu is a menu of menuitemradio items; option buttons use aria-pressed; icon-only buttons have labels.\n\nRound 2 (AC) reuses A’s and C’s code paths and adds the Shrink and Fill the window toggle and the setting row (the real .settings-section, .settings-row and .segmented classes from src/ui/settings.ts). Round 2 checked in headless Chromium, dark and light: it opens full window by default as a dialog with an inert app; Shrink gives a 768 px region at 1280 px and a 540 px one at the 900×620 minimum, with the app live and focus on Fill the window; Fill the window brings the dialog back with focus on Shrink; Esc closes from either size, with focus back on the tile; browser Back closes from the pane and the URL returns to ?ticket=211; with the setting on Side pane it opens straight into the pane. Round 2 finding: in the pane, the board’s #211 card is narrow enough that its title wraps word by word (C’s cramped con, still there). Round 3 (ACF), headless Chromium, dark and light: the size switch moves between full window (dialog, ↗ shown), side pane (region, ↗ shown) and floating (region, 560×380 bottom right, no ↗), with the pressed size marked by aria-pressed and focus staying on the switch; dragging the title row moved it by −320,−258 and the corner resized it by +100,+60; the app behind stayed usable (the Map tab switched views under it); Esc and browser Back closed it from floating; with the setting on Floating it reopened where it was left; at 900×620 it fits all three sizes with no toolbar overflow. Round 3 findings: moving and resizing are pointer only, with no keyboard equivalent; at 900×620 the side pane covers the map’s Key and zoom controls (also true of C). Not checked for round 2: screen reader announcement when the role switches between dialog and region; the Settings row inside the real Settings dialog (shown as a component sheet only).\n\nFindings: in every direction the toolbar’s option letters rely on a title tooltip for the option name (the presented option’s name shows beside the arrows). The engine on today’s canvas branches sets location.hash itself when you click a frame, which pushes history entries; inside the viewer that would make Back step through options before closing. The stand-in canvas here uses location.replace. The build has to stop that in the wrapper or accept it (open question).\n\nNot checked: screen reader output (no NVDA or VoiceOver run); Tab trapping in A and arrow keys in the page menu (written, not exercised); real Electron framing and the mouse back button in Electron; real timing against the 300 ms warm-open bar; 60 fps of the transition on a real board; Windows High Contrast; touch.',
            },
          ],
        },
      ],
    },
  ],
};
