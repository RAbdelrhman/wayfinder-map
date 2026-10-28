/*
  Wayfinder's canvas for ticket #226: viewing a prototype canvas on a phone.
  Every frame is the whole phone app (variants/phone.html), opened at one step of a direction.
  Entry is #223's picked ticket detail (T-C); #223's phone parts are copied into variants/.
  src stays a literal string so Wayfinder can read each direction's page.
  Check with: node prototypes/226-prototype-viewing-a-prototype-canvas-on-mobile/tools/check.mjs
*/

const PHONE = { width: 390, height: 844, boardWidth: 240 };

window.CANVAS = {
  ticket: 226,
  title: 'Viewing a prototype canvas on a phone',
  question:
    'How should the phone open a prototype canvas from ticket detail, switch options, zoom, go full screen and show notes, within R4 (#221): no live board, one option at a time from a copy saved on the phone, pages fitted to their declared width, notes hidden at first, and zoom on the option only?',
  sampleState:
    'Map #217, ticket #223 (closed), on #223’s picked T-C ticket detail. Its canvas is #223’s real one: 18 phone-sized options on 2 pages, drawn live from copies of prototype/223’s pages. The desktop-sized example is #207’s canvas (1440 × 900): real option names and notes on simplified stand-in pages drawn for this canvas. Download sizes are sample numbers inside what #221 measured (52–57 requests, about 2 MB). Each frame is the whole clickable app opened at one step; the first frame of each direction starts on ticket detail, so tap the Prototype card’s button there to walk the flow. Pinch is described, not simulated: zoom with the buttons. Nothing calls GitHub. How R4 is read, and what is new on ticket detail, are in the notes at the end.',

  base: {
    stylesheets: ['../../src/ui/styles.css', 'variants/mobile.css', 'variants/viewer.css'],
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
          title: 'A · Option strip',
          note: 'The desktop viewer, sized for a thumb: a top bar with the page menu, and a bottom bar with every option’s id, ‹ the name ›, Notes and Full screen.',
          items: [
            {
              id: 'A',
              name: 'Option strip',
              src: 'variants/phone.html?d=A', ...PHONE,
              note: {
                idea: 'Open canvas pushes a viewer. The top bar holds Back to #223, the page name as the canvas’s page menu, and More (Open on GitHub, Check for changes, canvas theme). The bottom bar has two rows: every option on the page as a strip of ids, then ‹ the option’s name › with Notes and Full screen. The option sits on a grey stage at its declared width, with a − 100% + pill to zoom. Notes rise between the option and the bar, and the option shrinks so it stays whole. Full screen hides every bar and leaves one Exit full screen pill. The download shows in the stage.',
                pros: [
                  'Every control is on screen and labelled; nothing depends on a gesture',
                  'Same parts as #209’s desktop viewer: page menu, id strip, ‹ ›, Notes, GitHub. That fits #235’s note to reuse #209’s viewer rather than add another viewer or controls',
                  'Notes never cover the option, and ‹ › keeps them in step while you compare',
                ],
                cons: [
                  'The most chrome: a phone-sized option gets 583 px of the 844 px screen',
                  'The id strip gets long on big canvases (16 ids on #223’s first page)',
                  'With notes open, the option shrinks to about half size',
                ],
              },
            },
            { id: 'A2', name: 'Open', src: 'variants/phone.html?d=A&screen=viewer', ...PHONE, note: 'After the download, the viewer opens on the first option. A phone-sized option shows at 100%, with a strip of grey stage above and below so it reads as a page, not as the app.' },
            { id: 'A3', name: 'Pages', src: 'variants/phone.html?d=A&screen=viewer&panel=pages', ...PHONE, note: 'The page name is the canvas’s page menu, with each page’s round and option count, as on the desktop. Options on a page switch from the strip or ‹ ›.' },
            { id: 'A4', name: 'Notes', src: 'variants/phone.html?d=A&screen=viewer&opt=S-B&panel=notes', ...PHONE, note: 'Notes rise from the bottom bar. The option shrinks to fit above them (49% here), so nothing is covered. The note ends with what the canvas is deciding, which the phone otherwise never shows.' },
            { id: 'A5', name: 'Desktop page', src: 'variants/phone.html?d=A&screen=viewer&canvas=207', ...PHONE, note: '#207’s 1440 px page fits the phone’s width at 27%: whole, but too small to read. A line under it says so and how to zoom.' },
            { id: 'A6', name: 'Zoomed', src: 'variants/phone.html?d=A&screen=viewer&canvas=207&zoom=1', ...PHONE, note: 'Zoomed to 100% with + (or pinch). Only the option grows; the bars stay put. Drag to move around the page. Tapping 100% goes back to fit.' },
            { id: 'A7', name: 'Full screen', src: 'variants/phone.html?d=A&screen=viewer&full=1&opt=M-C', ...PHONE, note: 'Full screen hides the status bar and every bar: the 390 × 844 option, M-C here, fills the screen at its own size. One Exit full screen pill stays. After three seconds its background turns more see-through, with the option blurred behind it, and its label keeps full strength. It sits over the option’s bottom edge.' },
          ],
        },
        {
          title: 'Loading and errors in A',
          note: 'Shown in the stage, with the bars in place.',
          items: [
            { id: 'A8', name: 'Downloading', src: 'variants/phone.html?d=A&screen=viewer&state=loading', ...PHONE, note: 'First open: progress in files and MB, with Cancel. The strip waits as placeholders until the option list arrives.' },
            { id: 'A9', name: 'Offline copy', src: 'variants/phone.html?d=A&screen=viewer&state=offline&opt=M-C', ...PHONE, note: 'Offline with a saved copy: the canvas opens from the phone under #223’s offline banner, with the copy’s date.' },
            { id: 'A10', name: 'Can’t download', src: 'variants/phone.html?d=A&screen=viewer&state=failed', ...PHONE, note: 'Offline and never saved: the stage says why and how big the download is. Try again starts it. GitHub’s hourly limit uses the same card: “GitHub’s limit for this hour is used up. Wayfinder can download this canvas again after 14:05.”' },
          ],
        },
        {
          title: 'B · Options list',
          note: 'Read the canvas as a list first, then look at one option at a time with its note’s first line under it.',
          items: [
            {
              id: 'B',
              name: 'Options list',
              src: 'variants/phone.html?d=B', ...PHONE,
              note: {
                idea: 'The card’s Browse 18 options pushes a native list: the canvas’s question, a Page filter (#223’s Filter by button), and every option grouped by section with its id, name and the first two lines of its note. Options you have opened get Viewed. Tap one and it opens under a slim top bar (Back to Options, its name and place, Full screen), with its note’s first line under it. Tap that line for the whole note and a Next button. To compare, go back to the list.',
                pros: [
                  'The notes are readable before you open anything',
                  'The list needs only config.js, so it can appear while the rest downloads (reading it on a phone is not tried; #221)',
                  'More room than A: a phone-sized option gets 637 px',
                ],
                cons: [
                  'Comparing is slow: back to the list and into the next row, two taps per switch',
                  'No strip or swipe for flipping between S-A, S-B and S-C',
                  'A second screen to build: the list, its page filter and Viewed marks. These are parts #209’s viewer doesn’t have, where #235 asks to reuse that viewer',
                ],
              },
            },
            { id: 'B2', name: 'The list', src: 'variants/phone.html?d=B&screen=list', ...PHONE, note: 'The list: the canvas’s question, the Page filter, then each section’s options with the start of their notes. More holds Open on GitHub, Check for changes and the canvas theme. The board’s free notes, like #223’s Design review, sit at the end as rows.' },
            { id: 'B3', name: 'One option', src: 'variants/phone.html?d=B&screen=viewer&opt=S-B&seen=S-B', ...PHONE, note: 'S-B from the list. The top bar names it and its place in its section. The note’s first line sits under the option, never over it.' },
            { id: 'B4', name: 'Whole note', src: 'variants/phone.html?d=B&screen=viewer&opt=S-B&panel=notes', ...PHONE, note: 'Tap the line for the whole note in a sheet, with Next to step to the following option without the list. The sheet covers the option’s lower half until you close it.' },
            { id: 'B5', name: 'Desktop page', src: 'variants/phone.html?d=B&screen=viewer&canvas=207', ...PHONE, note: '#207’s 1440 px page at 27%. A zoom chip appears only for pages wider than the phone, or once you zoom.' },
            { id: 'B6', name: 'Zoomed', src: 'variants/phone.html?d=B&screen=viewer&canvas=207&zoom=1', ...PHONE, note: 'The chip, or pinch, zooms the option only. At 100% the chip says Fit, to go back.' },
            { id: 'B7', name: 'Full screen', src: 'variants/phone.html?d=B&screen=viewer&full=1&opt=M-C', ...PHONE, note: 'Full screen hides the bar and the note line, as in A, with the same Exit full screen pill.' },
          ],
        },
        {
          title: 'Loading and errors in B',
          note: 'Shown on the list, so you can read while it downloads.',
          items: [
            { id: 'B8', name: 'Downloading', src: 'variants/phone.html?d=B&screen=list&state=loading', ...PHONE, note: 'A thin progress line under the bar and a status line. The rows are already there; an option opened before its files arrive waits in the viewer with the same progress.' },
            { id: 'B9', name: 'Offline copy', src: 'variants/phone.html?d=B&screen=list&state=offline', ...PHONE, note: 'Offline with a saved copy: the list opens from the phone under #223’s offline banner.' },
            { id: 'B10', name: 'Can’t download', src: 'variants/phone.html?d=B&screen=list&state=failed', ...PHONE, note: 'Offline and never saved: the list has nothing to show, so it names the branch and says why. The GitHub limit uses the same card.' },
          ],
        },
        {
          title: 'C · Swipe bar',
          note: 'The option fills the screen. One bar at the bottom names it; swipe the bar to step through options, tap it for the note and every option.',
          items: [
            {
              id: 'C',
              name: 'Swipe bar',
              src: 'variants/phone.html?d=C', ...PHONE,
              note: {
                idea: 'View prototype opens the first option full height, and the status bar hides while a canvas is open, so a phone-sized option looks as it would on a phone. One bar at the bottom shows the option’s section, its id and name, and a dot for each option in that section. Swipe the bar, or use ‹ ›, to step through every option, across sections and pages. Tap the bar or ⌃ for a drawer with two tabs, Notes and All options (a text grid by page and section), and a row for zoom steps, full screen, the canvas theme and GitHub. Full screen shrinks the bar to a one-line tab. The card says where it will open: the first option, then where you left off.',
                pros: [
                  'The most room: a phone-sized option gets 745 px, with no grey stage around it',
                  'Fast comparing: swipe S-A → S-B → S-C without leaving the option',
                  'No second status bar: the option’s own stands in for the phone’s',
                ],
                cons: [
                  'Swiping the bar is a gesture to discover; ‹ › are there, but small',
                  'Notes and the option list hide in a drawer that covers the option’s lower half',
                  'The time and battery are hidden while a canvas is open',
                  'The swipe bar and drawer are parts #209’s viewer doesn’t have, where #235 asks to reuse that viewer',
                ],
              },
            },
            { id: 'C2', name: 'Open', src: 'variants/phone.html?d=C&screen=viewer', ...PHONE, note: 'S-A fills the screen down to the bar. The section, the dots and ‹ › show where you are.' },
            { id: 'C3', name: 'All options', src: 'variants/phone.html?d=C&screen=viewer&opt=S-B&panel=options', ...PHONE, note: 'The drawer’s All options tab: every option of every page as text tiles, the current one outlined. Tap one to jump there.' },
            { id: 'C4', name: 'Notes', src: 'variants/phone.html?d=C&screen=viewer&opt=S-B&panel=drawer', ...PHONE, note: 'Tap the bar for the note, ending with what the canvas is deciding. The drawer covers the option’s lower half until you close it.' },
            { id: 'C5', name: 'Desktop page', src: 'variants/phone.html?d=C&screen=viewer&canvas=207', ...PHONE, note: '#207’s 1440 px page at 27%, with a line saying so. Zoom steps are in the drawer; pinch on a phone.' },
            { id: 'C6', name: 'Zoomed', src: 'variants/phone.html?d=C&screen=viewer&canvas=207&zoom=1', ...PHONE, note: 'Zoomed: the bar says so, and a Fit chip goes back. Only the option grows.' },
            { id: 'C7', name: 'Full screen', src: 'variants/phone.html?d=C&screen=viewer&full=1&opt=M-C', ...PHONE, note: 'Full screen shrinks the bar to a tab with the id and place. Tap it to bring the bar back.' },
          ],
        },
        {
          title: 'Loading and errors in C',
          note: 'Shown in the bar, the way a browser shows a page loading.',
          items: [
            { id: 'C8', name: 'Downloading', src: 'variants/phone.html?d=C&screen=viewer&state=loading', ...PHONE, note: 'The bar shows the file count and a thin progress line. The stage shows what the canvas is deciding while you wait.' },
            { id: 'C9', name: 'Offline copy', src: 'variants/phone.html?d=C&screen=viewer&state=offline', ...PHONE, note: 'Offline with a saved copy: the bar’s top line says so, with the copy’s date, in place of the section.' },
            { id: 'C10', name: 'Can’t download', src: 'variants/phone.html?d=C&screen=viewer&state=failed', ...PHONE, note: 'Offline and never saved: the bar turns into the error, with Try again at its end, and the stage explains. The GitHub limit uses the same card.' },
          ],
        },
        {
          title: 'About this canvas',
          items: [
            {
              id: 'r4',
              kind: 'note',
              name: 'R4: the limits every direction keeps',
              boardWidth: 360,
              note: {
                idea: 'This canvas reads R4 as #221, the map’s fourth research ticket. The map’s build tickets number prototypes the same way: #229 builds “the P1 following screens”, which are #223’s, and #235 adds “the P4 canvas viewer”, which is this ticket. The limits are #221’s recommendations 1, 3 and 4 in docs/research/mobile-canvas-rendering.md. Every direction keeps all six (+). Two questions stay open (−).',
                pros: [
                  'No live board on the phone. Board thumbnails painted wrong in iOS WKWebView and Android System WebView 124, so no option list here draws a live frame: lists are text.',
                  'One option at a time, as the canvas’s Present mode shows it.',
                  'The app downloads the canvas through the GitHub API into app-private storage, keyed by blob SHA, and opens it from there. A later open only checks for changed files; a saved canvas opens offline.',
                  'Fit to the declared width. A 1440 px page fits a 390 px phone at about 27% instead of being cut off. A phone-sized page keeps its 390 px width and takes the height the viewer leaves it.',
                  'Notes start hidden. No direction opens with a note over the option.',
                  'Phone-sized controls, and zoom that grows only the option, never the app’s bars. Every canvas shortcut (N, P, T, ← →, Esc) has a button.',
                ],
                cons: [
                  'How the app gets the option list. The desktop viewer gets it from the bridge’s ready message; that is not tried on a phone.',
                  'How a scaled-down page paints on iOS. Scaled board frames painted wrong there, and the 27% fit is a scaled page. Not checked.',
                ],
              },
            },
            {
              id: 'entry',
              kind: 'note',
              name: 'Entry: #223’s T-C ticket detail, as picked',
              boardWidth: 300,
              note: {
                idea: 'Each direction starts on #223’s picked ticket detail (T-C), unchanged: top bar, tabs, state banner, body, and the dashed Start slot that #224 designs. The only new part is a Prototype card on Overview, after the banner, where the desktop ticket panel puts its Prototype block. The card never shows a live thumbnail. It says how big the first download is, or that the canvas is saved on the phone. Its other states use the desktop panel’s own words (Card states, beside this note).',
                cons: ['Not in any direction: giving canvas feedback from the phone (the desktop viewer’s Keep / Change / Combine and pin notes). #226 asks about viewing only.'],
              },
            },
            { id: 'cards', name: 'Card states', src: 'variants/phone.html?screen=cards', width: 390, height: 1720, boardWidth: 240, note: 'Every state of the new card. Looking, No prototype yet and Could not read use the desktop ticket panel’s words. Ready differs only in its action: A Open canvas, B Browse 18 options, C View prototype.' },
            {
              id: 'review',
              kind: 'note',
              name: 'Design review',
              boardWidth: 380,
              note: {
                idea: 'Sources: the tokens in src/ui/styles.css, with no new ones; the grey stage mixes --plane with --text-primary. Their React Native copy in mobile/src/auth/theme.ts, BackButton.tsx, and SettingsScreen.tsx’s centred bar, which the new bars follow. #223’s picked parts: variants/mobile.css, variants/canvas-223/mobile.js and mobile-data.js are byte-identical to prototype/223, and the ticket screen is its T-C markup with one card added. #209’s desktop viewer toolbar in src/ui/canvasViewer.ts, the bridge’s ready message in src/canvasBridge.ts, the live tiles in src/ui/prototypeTile.ts that this canvas avoids, the ticket panel’s Prototype words in src/ui/app.ts, prototypeBranch in src/prompt.ts, #221’s research doc, and issues #217, #221, #223, #224, #229 and #235. Checked in headless Chrome under the canvas’s sandbox CSP, at 390 × 844 unless noted (+). Findings and what was not checked (−).',
                pros: [
                  'Both themes: all 31 frames load in light and dark with no page errors and no failed requests apart from the browser’s favicon. I looked at every frame in both.',
                  'Contrast: 1,230 text checks over the 31 frames in both themes, from computed colours, all reach 4.5:1, or 3:1 for large text. The check covers the Exit full screen pill after its fade, over white and over black. Disabled controls, drawn at 40%, are left out, as WCAG allows. Fixed: C’s download placeholder on the grey stage was 3.97:1, and the faded Exit pill was 4.41:1. Its label now keeps full strength.',
                  'Interaction: 116 scripted checks pass in both themes, four runs each. They open from the card through the download, and switch options with A’s strip, ‹ ›, → key and page menu, B’s rows, the note’s Next and page filter, and C’s bar drag, arrow keys, ‹ › across sections and All options tiles across pages. They also cover notes, zoom on #207’s page from 27% to 50%, 100% and back to fit with the bars unchanged, full screen and back, Cancel, Try again, the offline copy, and the canvas theme from More and from C’s drawer.',
                  'Keyboard and focus: Tab runs top bar → zoom → option → bottom bar, and full screen starts on Exit full screen. 638 focus checks over 26 states in both themes: every control shows a 2 px ring, and none is cut off. Focus returns to the control that opened a menu, sheet, drawer or full screen. Escape closes the top layer. Tab cycles inside sheets and C’s drawer, and closes menus. Arrow keys move in menus, step options in A and C, and switch C’s drawer tabs.',
                  'Fixed in this round: keyboard users could not reach the More menu’s theme choices, which are now menu items; C’s drawer tabs had no arrow keys; a zoom step left C’s drawer over the option; the zoom pill came after the option in Tab order; the screen edge cut the rings of full-width controls; closing C’s drawer sent focus to ⌃ even when the bar opened it; the Card states frame cut off its last card.',
                  'Semantics: menus are role=menu with menuitem or menuitemradio. Sheets and the drawer are role=dialog and aria-modal, labelled by their titles. Tabs use aria-selected, and C’s drawer tabs add roving tabindex and aria-controls. The id strip uses aria-current; toggles use aria-pressed. Downloads are progressbars with value text. The offline banner is a status, and error cards are alerts. A polite live region announces option and page changes. The option frame has a title and sandbox="allow-scripts".',
                  'Responsive: at 360 × 780 and 430 × 932 every frame passes the same contrast check, nothing overflows sideways, and long names end in an ellipsis. A 390 px option fits a 360 px phone at 92%. Shown full size in a wide window, as in Present or Wayfinder’s viewer, the phone stays 390 × 844, centred and scaled to fit.',
                  'Touch targets: every new control is at least 44 × 44. Motion: the only new motion, the Exit pill’s fade, is instant under reduced motion.',
                  'Measured as the notes quote them: a phone-sized option gets 583 px in A, 637 px in B and 745 px in C; A’s notes shrink it to 49%; #207’s 1440 px page fits at 27%.',
                ],
                cons: [
                  'From #223, unchanged here: T-C’s Overview / Links / Activity tabs are 40 px tall and have no arrow keys, and the sheet handle is 28 px tall. ×, the scrim and Escape also close a sheet.',
                  'A’s zoom pill and B’s and C’s zoom chips sit over the option’s top-right corner; A’s and B’s Exit full screen pill sits over its bottom edge.',
                  'Phone mocks carry their own status bar, so A and B show two; C hides the phone’s.',
                  'Hairline borders on chips and pills are about 1.2:1 in light and 1.3:1 in dark against their background. Their labels identify them, as on #223’s chips.',
                  'Not checked in T3’s preview: the board and phone pages load and run there, and a scripted tap on Open canvas downloaded and opened S-A, but its screenshots and clicks timed out while the preview tab was hidden.',
                  'Not checked: real iPhones and Android phones, WKWebView and the Android WebView, and how a scaled-down option paints on iOS.',
                  'Not checked: pinch, finger swipes and panning on touch hardware. The prototype zooms with buttons and swipes with a mouse drag.',
                  'Not checked: VoiceOver and TalkBack, large text, landscape, and safe areas and the notch while C hides the status bar.',
                  'Not checked: real download sizes and times, how the app reads the option list, and isolating canvas code from the app, which are #221’s open items.',
                  'Not checked: the option pages inside the frames. #223 reviewed its own, and the #207 pages are simplified stand-ins.',
                ],
              },
            },
          ],
        },
      ],
    },
    {
      id: 'round-2',
      title: 'A with Notes in More',
      round: 2,
      question:
        'Does A read better with Notes moved from the bottom bar into the top bar’s More menu, and is everything else about A still right?',
      sections: [
        {
          title: 'A · Notes in More',
          note: 'Round 1’s A, with Notes moved from the bottom bar to More (•••, top right). Ramon approved this remix in the ticket thread.',
          items: [
            {
              id: 'R2A',
              name: 'Notes in More',
              src: 'variants/phone.html?d=A&r=2', ...PHONE,
              note: {
                idea: 'A, unchanged except for Notes. The bottom bar keeps the id strip and ‹ the option’s name › with Full screen; the Notes pill is gone. More (•••, top right) now starts with Notes, above Open on GitHub, Check for changes and the canvas theme. Choosing Notes closes the menu and raises the notes between the option and the bottom bar, as in round 1, with the option shrunk so it stays whole. While they are open the item is ticked and reads “Shown under the option”. The notes’ ×, Escape, or Notes in More again hides them. Notes now stay open while More or the page menu is over them, and ‹ › and the arrow keys keep them in step.',
                pros: [
                  'A calmer bottom bar: one row of ‹ name › and Full screen, with the name line 240 px wide instead of 151 px, so long names cut off less',
                  'More already holds the other canvas tools (GitHub, Check for changes, theme), so Notes joins them rather than adding a new place',
                  'Notes behave as in round 1 once open: under the option, never over it, and they follow ‹ ›',
                ],
                cons: [
                  'Notes take two taps instead of one, and the • • • menu has to be found first',
                  'No extra room for the option: the bottom bar keeps its height (145 px), so a phone-sized option still gets 583 px',
                  'Further from #209’s desktop viewer, which keeps Notes in its toolbar',
                ],
                basedOn: 'A',
                disposition: 'keep',
                feedback: 'Ramon liked A and asked to move Notes into the top-right menu. After reviewing this remix, he said: “looks good to me.”',
              },
            },
            { id: 'R2A2', name: 'Open', src: 'variants/phone.html?d=A&r=2&screen=viewer', ...PHONE, note: { idea: 'After the download, as in A2. The bottom bar is now ‹ the option’s name › and Full screen; the name gets the room the Notes pill had.', basedOn: 'A' } },
            { id: 'R2A3', name: 'More', src: 'variants/phone.html?d=A&r=2&screen=viewer&panel=menu', ...PHONE, note: { idea: '••• opens More with Notes first, then Open on GitHub, Check for changes and the canvas theme. It is a checkbox menu item: unticked while the notes are hidden.', basedOn: 'A' } },
            { id: 'R2A4', name: 'Notes open', src: 'variants/phone.html?d=A&r=2&screen=viewer&opt=S-B&notes=1', ...PHONE, note: { idea: 'Notes rise from the bottom bar as in round 1’s A4. The option shrinks to fit above them (49% here), so nothing is covered. × hides them and returns focus to •••.', basedOn: 'A' } },
            { id: 'R2A5', name: 'More over notes', src: 'variants/phone.html?d=A&r=2&screen=viewer&opt=S-B&notes=1&panel=menu', ...PHONE, note: { idea: 'With the notes open, More opens over them and Notes is ticked, reading “Shown under the option”. Choosing it hides them. Escape or a tap outside closes only the menu.', basedOn: 'A' } },
            { id: 'R2A6', name: 'Desktop page with notes', src: 'variants/phone.html?d=A&r=2&screen=viewer&canvas=207&notes=1', ...PHONE, note: { idea: '#207’s 1440 px page with its notes open from More. It is already fitted to the phone’s width, so it stays at 27% above them. The zoom pill hides until the notes close, as in round 1.', basedOn: 'A' } },
          ],
        },
        {
          title: 'About this round',
          items: [
            {
              id: 'review-r2',
              kind: 'note',
              name: 'Design review, round 2',
              boardWidth: 380,
              note: {
                idea: 'Covers only what round 2 changes in A: the bottom bar without Notes, the Notes item in More, and opening and hiding the notes from there. Round 1’s Design review still stands for everything else and was not re-run. Same sources and tokens as round 1, with no new tokens or CSS: the item uses the menu’s existing menuitem, v-check and v-pop-main styles. Checked in headless Chrome (playwright-core, installed Chrome) under the canvas’s sandbox CSP, at 390 × 844 unless noted (+). Findings and what was not checked (−).',
                pros: [
                  'Flow, from ticket detail: Open canvas → download → viewer with no Notes control in the bottom bar → ••• → Notes → notes open → → steps to S-B and the notes follow → ••• over open notes shows Notes ticked → Escape closes the menu only → Escape hides the notes → page menu over open notes, choosing a page keeps them → Full screen hides them → Exit → Back to #223. With the checks below, 32 scripted checks, all passed.',
                  'Keyboard and focus: Enter on ••• focuses Notes; ↑ ↓ move through the menu; Enter on Notes closes the menu and focuses the notes’ ×; ×, Escape, or Notes again hides them and puts focus on •••; Tab out of the menu closes it and leaves the notes open. The focused item shows the 2 px ring and stays on screen in both themes. Bottom bar Tab order is now strip → ‹ → › → Full screen.',
                  'Semantics: Notes is role=menuitemcheckbox with aria-checked; ••• keeps aria-haspopup=menu and aria-expanded. Showing notes announces “Notes for S-A shown.” in the polite live region; hiding announces “Notes hidden.”',
                  'Contrast on the menu surface: light, label 19.2:1, subtitle 5.3:1, icon and tick 7.7:1; dark, 17.4:1, 6.0:1 and 9.7:1. The item is 48 px tall.',
                  'Responsive: at 360 × 780 and 430 × 932, the viewer, More over open notes, and #207 with notes all fit without sideways scrolling, and the menu stays inside the screen.',
                  'Loading: ••• is disabled while the canvas downloads, so Notes is too, as the Notes pill was in round 1.',
                  'Fixed while building: the subtitle “This option’s idea, pros and cons” wrapped to two lines and became “Idea, pros and cons”.',
                ],
                cons: [
                  'Changed from round 1, beyond the move: notes now stay open under More and the page menu, choosing a page keeps them, and ← → step options while they are open. Round 1 closed them in those cases because only one panel could be open.',
                  'With notes open on a desktop page, the hint still says “Pinch or use + to zoom” while the zoom pill is hidden. Round 1’s A does the same; left as it was.',
                  'Round 1 frames were spot-checked, not re-reviewed: A still has its Notes pill and no Notes item in More.',
                  'Not checked: round 1’s full focus-ring sweep over every state; only the new item and the states above were checked.',
                  'Not checked: real phones, VoiceOver and TalkBack, large text, and touch hardware, as in round 1.',
                  'Not checked: whether people find Notes in •••. That is for Ramon’s review.',
                ],
              },
            },
          ],
        },
      ],
    },
  ],
};
