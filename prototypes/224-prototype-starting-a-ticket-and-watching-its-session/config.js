/*
  Wayfinder's canvas for ticket #224: starting a ticket from the phone and watching its session.
  Built on #223's picked screens (R-C2 Maps, M-C map, T-C ticket) and #316's Settings page (G-a),
  copied into variants/ with their CSS. Follows the confirmed #222 architecture; the desktop side
  of pairing is #335's and notifications are #225's.
  Round 2 (Choosing the model) follows Ramon's pick of A overall, with B's pairing pages; it is not a final choice.
  Check with: node prototypes/224-prototype-starting-a-ticket-and-watching-its-session/tools/check.mjs
*/

// Every frame is the whole phone app at one step; src stays a literal so Wayfinder can read each option's page.
const PHONE = { width: 390, height: 844, boardWidth: 300 };

window.CANVAS = {
  ticket: 224,
  title: 'Starting a ticket from the phone and watching its session',
  question: 'How do you start a ticket from the phone, what happens when the desktop is out of reach or not paired, and how do you watch the session it starts?',
  sampleState:
    'Map #217 with made-up states. The phone is signed in as @RAbdelrhman and paired with RAMON‑PC over Tailscale. #230 is next up and is started from the phone at 10:02. #233 and #226 wait while the phone can’t reach RAMON‑PC; at 10:41 #226 is sent and #233 is turned down, because the desktop started it at 10:38. Every frame is the whole clickable app; on the scanner, tap the code to scan it.',

  base: {
    stylesheets: ['../../src/ui/styles.css', 'variants/mobile.css', 'variants/account.css', 'variants/session.css'],
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
      title: 'Overview',
      round: 1,
      sections: [
        {
          title: 'Three options, at the same moment',
          note: '#230 is running on RAMON‑PC, started from this phone 12 minutes ago. Each frame is the whole app: go back to start another ticket, or open Settings → Desktop. Each option’s own page shows every step.',
          items: [
            {
              id: 'A',
              name: 'On the ticket',
              src: 'variants/phone.html?o=A&s=live', ...PHONE,
              note: {
                idea: 'Everything about a run lives on its ticket. Start is a button in the ticket’s action bar and asks once, in #316’s alert style. When T3 Code has a thread for the ticket, the ticket gets a fourth tab, Session: the tabs and the run’s status stay pinned while the whole history scrolls, oldest first, with tool calls inline. A start made while RAMON‑PC is out of reach waits on its ticket, and Settings → Desktop lists every waiting start.',
                pros: ['Maps and the map view stay as #223 picked them', 'The history reads top to bottom, like the thread in T3 Code', 'Start uses the alert you picked for Sign out'],
                cons: ['Checking on a run takes Maps → map → ticket → Session', 'Four tabs on a ticket', 'No single list of what is running; only waiting starts are listed, in Settings'],
              },
            },
            {
              id: 'B',
              name: 'Session page',
              src: 'variants/phone.html?o=B&s=live', ...PHONE,
              note: {
                idea: 'Start opens a sheet that says where the ticket goes and whether RAMON‑PC is reachable. A run gets its own page: a status card, then Summary (the latest message, T3 Code’s plan, changed files, details), Transcript and Tools. While starts wait, or just after they were sent, a banner on Maps opens Settings → Desktop’s list. Pairing is its own short flow, with a “Pair with RAMON‑PC?” check after the scan.',
                pros: ['Summary answers “how far along is it” without reading the history', 'Transcript and Tools keep the talk apart from the tool calls', 'The sheet says before you tap that an out-of-reach start will wait'],
                cons: ['The most screens: a sheet, a page and three tabs', 'A sheet again; for the account control in #316 you asked for a page instead', 'The plan only shows when T3 Code shares one'],
              },
            },
            {
              id: 'C',
              name: 'Desktop on Maps',
              src: 'variants/phone.html?o=C&s=live', ...PHONE,
              note: {
                idea: 'Start is one tap, with five seconds to Undo before anything is sent. Maps gains an “On RAMON‑PC” list above the maps whenever a start is waiting or a run is going or just finished, with Cancel and Dismiss on its rows. Live puts what is happening now at the top in large type and lists the history newest first. With no desktop paired, Start opens the scanner and carries on into the start.',
                pros: ['Open the app and the run is on the first screen', 'Fewest taps to start; Undo covers a mistap', 'Pairing happens at the moment it’s needed'],
                cons: ['Adds a list to #223’s Maps screen, which you already picked', 'No confirm: a start goes out after five seconds', 'Newest first reads backwards from the thread in T3 Code'],
              },
            },
            {
              id: 'review',
              kind: 'note',
              name: 'Design review',
              boardWidth: 340,
              text: "Sources: #224 (Oct 23), map #217’s decisions, #222’s confirmed architecture (comment 6184503526), #316’s G-a Settings page, #223’s picked phone parts (variants/mobile.css, account.css), #335 and #225 for what stays theirs. Tokens: src/ui/styles.css, the same values mobile/src/auth/theme.ts copies; the Desktop row matches the slot mobile/src/auth/SettingsScreen.tsx keeps for #224. No new tokens.\n\nChecked headless (Playwright, installed Chrome), all 59 frames in light and dark, at 390×844 and 320×640: every visible text ≥ 4.5:1 against its background (3:1 for large text), including the amber and green status words, timestamps and the scanner; no control under 24×24px; every button, tab and field has a name; every screen has a heading; no sideways scrolling at 320px; no page errors.\n\nInteraction, checked by script: A’s Start alert opens with focus on Cancel (role=alertdialog), Escape closes it and returns focus to Start, and Start opens Session at “Starting”. B’s sheet starts #230 and opens the Session page; its tabs move with the arrow keys. C’s Start shows Undo, and Undo puts Start back. Try now on a waiting list (A, C) sends #226 and turns #233 down. Cancel removes a waiting start with a toast. Pairing completes in A, B (with its “Pair with RAMON‑PC?” step) and C (which carries on into the start). Tab reaches every control with a visible focus ring; the search field shows its ring on its box.\n\nFindings: scrolled history slides under A’s pinned status line, so a cut-off row peeks out above the newest event; this is how the frame opens at the newest. Pairing’s desktop side, and what it shows, is #335’s; the Enter code screen only works if #335 shows the address and code as text. Notifications stays #225’s.\n\nNot checked: real iOS and Android devices, native alerts, sheets and camera, screen readers, large text, landscape, safe areas, motion and the streaming animation, and anything T3 Code would actually send.",
            },
          ],
        },
        {
          title: 'Settings → Desktop, the same in A, B and C',
          note: '#316’s Settings page keeps its Preferences → Desktop row; this is the page it opens. Waiting starts, unpair and replace live here in every option.',
          items: [
            { id: 'settings', name: 'Settings, Desktop row', src: 'variants/phone.html?o=A&s=settings', ...PHONE, note: '#316’s G-a page, unchanged except the Desktop row’s subtitle: which desktop, and whether it can be reached, or “Not paired”. Notifications stays #225’s.' },
            { id: 'desktop', name: 'Desktop, paired', src: 'variants/phone.html?o=A&s=desktop', ...PHONE, note: 'RAMON‑PC and whether it can be reached, then Connection (paired since, the Tailscale address, Pair a different desktop) and Unpair alone at the bottom, as Sign out is on Settings. Waiting starts and didn’t-start rows appear above Connection when there are any.' },
            { id: 'unpair', name: 'Unpair', src: 'variants/phone.html?o=A&s=unpair', ...PHONE, note: '#316’s confirm alert. Reachable, nothing waiting: RAMON‑PC is told, and it stops sending this phone pushes. Maps keep working.' },
            { id: 'replace', name: 'Replace, starts waiting', src: 'variants/phone.html?o=A&s=replace', ...PHONE, note: 'After scanning RAMON‑LAPTOP’s code. RAMON‑PC is out of reach with 2 starts waiting: they are discarded, not moved, and because RAMON‑PC can’t be told, the alert says to remove this phone there too.' },
          ],
        },
        {
          title: 'Pairing, the same in A, B and C',
          note: 'Where pairing starts and what follows the scan differ by option; these screens don’t. The desktop’s side of pairing is #335’s.',
          items: [
            { id: 'desktop-none', name: 'Desktop, not paired', src: 'variants/phone.html?o=A&s=desktop-unpaired', ...PHONE, note: 'Three steps, Scan pairing code, and Enter code instead. Step 2 doesn’t name a desktop control, because #335 designs it.' },
            { id: 'scan', name: 'Scan pairing code', src: 'variants/phone.html?o=A&s=scan', ...PHONE, note: 'The camera view, dark in both themes. In this prototype, tap the code to scan it. The code is single-use and short-lived; the phone swaps it for its own token.' },
            { id: 'code', name: 'Enter code instead', src: 'variants/phone.html?o=A&s=code', ...PHONE, note: 'For a phone with camera access off: the desktop’s address and code, typed. This only works if #335 shows both as text beside the QR code.' },
            { id: 'removed', name: 'Removed on the desktop', src: 'variants/phone.html?o=A&s=removed', ...PHONE, note: 'RAMON‑PC removed this phone (#335). The next contact says so, and the starts that were waiting for it are gone.' },
          ],
        },
        {
          title: 'When pairing fails, the same in A, B and C',
          note: 'In the style of S-A’s “That code expired”, with a way on from each.',
          items: [
            { id: 'expired', name: 'Code expired', src: 'variants/phone.html?o=A&s=expired', ...PHONE, note: 'Pairing codes are short-lived. Scan again, or enter the code.' },
            { id: 'used', name: 'Code already used', src: 'variants/phone.html?o=A&s=used', ...PHONE, note: 'Each code works once, so a second scan of the same code lands here.' },
            { id: 'unreachable', name: 'Can’t reach the desktop', src: 'variants/phone.html?o=A&s=unreachable', ...PHONE, note: 'The code is fine but the phone can’t reach RAMON‑PC: Tailscale off on either side, different accounts, or the desktop asleep.' },
          ],
        },
      ],
    },
    {
      title: 'A · On the ticket',
      round: 1,
      sections: [
        {
          title: 'Start',
          note: 'Start fills the action bar #223 kept for #224, with the desktop and whether it can be reached above it. It asks once.',
          items: [
            { id: 'A-start', name: 'Ready to start', src: 'variants/phone.html?o=A&s=start', ...PHONE, note: '#230 is next up and RAMON‑PC is online. Blocked and closed tickets show the button off, with the desktop’s reason under it.' },
            { id: 'A-confirm', name: 'Start alert', src: 'variants/phone.html?o=A&s=confirm', ...PHONE, note: '“Start #230 on RAMON‑PC?” in #316’s alert. Start opens the Session tab at “Starting”, and the first events follow.' },
          ],
        },
        {
          title: 'Watch',
          note: 'The Session tab appears on any ticket T3 Code has a thread for, started here or on the desktop. Watch only: the bar at the bottom says replies and approvals stay in T3 Code.',
          items: [
            { id: 'A-live', name: 'Live', src: 'variants/phone.html?o=A&s=live', ...PHONE, note: 'Oldest first, opened at the newest. Tool calls expand for their detail; the reply being written streams in at the bottom. Scroll up for the whole history, back to the prompt Wayfinder sent.' },
            { id: 'A-reconnecting', name: 'Reconnecting', src: 'variants/phone.html?o=A&s=reconnecting', ...PHONE, note: 'The connection dropped at 10:14. The pinned line says what is shown and offers Try now; the history stays readable.' },
            { id: 'A-caughtup', name: 'Caught up, needs you', src: 'variants/phone.html?o=A&s=caughtup', ...PHONE, note: 'Back in reach: the 6 updates missed while away arrive under a divider. T3 Code is waiting for an approval, which can only be given on the desktop.' },
          ],
        },
        {
          title: 'Outcome',
          note: 'The history ends with the outcome.',
          items: [
            { id: 'A-done', name: 'PR ready', src: 'variants/phone.html?o=A&s=done', ...PHONE, note: 'The pull request, its checks, and Open PR on GitHub.' },
            { id: 'A-failed', name: 'Failed', src: 'variants/phone.html?o=A&s=failed', ...PHONE, note: 'T3 Code stopped. The card says why, and that it is picked up in T3 Code on the desktop.' },
          ],
        },
        {
          title: 'Desktop out of reach',
          note: 'Maps keep loading from GitHub. A start made now waits on the phone, with no expiry, until it is sent, cancelled or turned down.',
          items: [
            { id: 'A-offline', name: 'Start while out of reach', src: 'variants/phone.html?o=A&s=offline', ...PHONE, note: 'The button says “Start when RAMON‑PC is back”, and the alert says the start will wait on the phone. Send later saves it.' },
            { id: 'A-queued', name: 'Waiting, on the ticket', src: 'variants/phone.html?o=A&s=queued', ...PHONE, note: 'The action bar holds the waiting start, with Cancel start.' },
            { id: 'A-pending', name: 'All waiting starts', src: 'variants/phone.html?o=A&s=pending', ...PHONE, note: 'Settings → Desktop lists every waiting start, oldest first, each with Cancel. Try now checks RAMON‑PC straight away: tap it to see both go out, and #233 turned down.' },
          ],
        },
        {
          title: 'Back in reach',
          note: 'Waiting starts go to the desktop they were made for, and RAMON‑PC checks each ticket again before it starts anything. A ticket that has since closed, become blocked or been started is turned down, with the reason.',
          items: [
            { id: 'A-sent', name: 'Sent on reconnect', src: 'variants/phone.html?o=A&s=sent', ...PHONE, note: 'Reaching RAMON‑PC again sent #226 by itself; the action bar says when, and the Session tab is there.' },
            { id: 'A-rejected', name: 'Turned down', src: 'variants/phone.html?o=A&s=rejected', ...PHONE, note: 'RAMON‑PC turned the #233 start down: it was already started on the desktop. Watch it opens that run.' },
          ],
        },
        {
          title: 'Pairing',
          note: 'With no desktop, the action bar sends you to Settings → Desktop, which has the steps and the scanner. Unpair and replace are on the Overview page.',
          items: [
            { id: 'A-unpaired', name: 'Not paired', src: 'variants/phone.html?o=A&s=unpaired', ...PHONE, note: '“Pair a desktop” replaces Start.' },
            { id: 'A-pair', name: 'Pair in Settings', src: 'variants/phone.html?o=A&s=pair', ...PHONE, note: 'Settings → Desktop, opened from the ticket. Scan pairing code opens the camera; tap the code to pair.' },
            { id: 'A-paired', name: 'Paired', src: 'variants/phone.html?o=A&s=paired', ...PHONE, note: 'A notice confirms the pairing; Back returns to the ticket, now with Start.' },
          ],
        },
      ],
    },
    {
      title: 'B · Session page',
      round: 1,
      sections: [
        {
          title: 'Start',
          note: 'The action bar’s Start opens a sheet: the ticket, the desktop and whether it can be reached, what will happen, and Start.',
          items: [
            { id: 'B-start', name: 'Ready to start', src: 'variants/phone.html?o=B&s=start', ...PHONE, note: 'The same action bar as A; the difference comes after the tap.' },
            { id: 'B-sheet', name: 'Start sheet', src: 'variants/phone.html?o=B&s=confirm', ...PHONE, note: 'RAMON‑PC is online. Start #230 opens the Session page at “Starting”.' },
          ],
        },
        {
          title: 'Watch',
          note: 'A run has its own page, opened from its ticket’s action bar. The status card stays on top; the tabs split the history. Watch only, as the bar at the bottom says.',
          items: [
            { id: 'B-live', name: 'Summary', src: 'variants/phone.html?o=B&s=live', ...PHONE, note: 'The latest message as it streams, T3 Code’s plan with the current step, changed files, and details.' },
            { id: 'B-transcript', name: 'Transcript', src: 'variants/phone.html?o=B&s=transcript', ...PHONE, note: 'The prompt Wayfinder sent and every message, oldest first, opened at the newest.' },
            { id: 'B-tools', name: 'Tools', src: 'variants/phone.html?o=B&s=tools', ...PHONE, note: 'Every tool call in order; each one expands for its detail.' },
          ],
        },
        {
          title: 'Reconnecting and outcome',
          note: 'The card on top carries the connection and the status; Summary leads with the outcome.',
          items: [
            { id: 'B-reconnecting', name: 'Reconnecting', src: 'variants/phone.html?o=B&s=reconnecting', ...PHONE, note: 'Under the card, a line says what is shown and offers Try now.' },
            { id: 'B-caughtup', name: 'Caught up, needs you', src: 'variants/phone.html?o=B&s=caughtup', ...PHONE, note: 'Back in reach: a line counts what arrived while away, and the tabs mark what is new. The approval waits in T3 Code on the desktop.' },
            { id: 'B-done', name: 'PR ready', src: 'variants/phone.html?o=B&s=done', ...PHONE, note: 'The outcome card heads Summary, with Open PR on GitHub.' },
            { id: 'B-failed', name: 'Failed', src: 'variants/phone.html?o=B&s=failed', ...PHONE, note: 'The card says why T3 Code stopped, and the plan marks the step it stopped at.' },
          ],
        },
        {
          title: 'Desktop out of reach',
          note: 'Maps keep loading from GitHub. While a start waits, Maps shows one banner that opens Settings → Desktop’s list.',
          items: [
            { id: 'B-offline', name: 'Start sheet, out of reach', src: 'variants/phone.html?o=B&s=offline', ...PHONE, note: 'The sheet says RAMON‑PC can’t be reached and that the start will wait on the phone. The button reads “Start when RAMON‑PC is back”.' },
            { id: 'B-queued', name: 'Waiting, on the ticket', src: 'variants/phone.html?o=B&s=queued', ...PHONE, note: 'The action bar holds the waiting start, with Cancel start.' },
            { id: 'B-pending', name: 'Banner on Maps', src: 'variants/phone.html?o=B&s=pending', ...PHONE, note: '“2 starts waiting for RAMON‑PC”. It opens Settings → Desktop, where each has Cancel and Try now checks straight away.' },
          ],
        },
        {
          title: 'Back in reach',
          note: 'Waiting starts go to the desktop they were made for, and RAMON‑PC checks each ticket again before it starts anything. A ticket that has since closed, become blocked or been started is turned down, with the reason.',
          items: [
            { id: 'B-sent', name: 'Back in touch', src: 'variants/phone.html?o=B&s=sent', ...PHONE, note: 'After reconnecting, the banner reports what happened: one sent, one didn’t start. It opens the details in Settings → Desktop, and is gone once opened.' },
            { id: 'B-rejected', name: 'Turned down', src: 'variants/phone.html?o=B&s=rejected', ...PHONE, note: 'The banner’s destination: #233 under “Didn’t start”, with the desktop’s reason, Watch and Dismiss.' },
          ],
        },
        {
          title: 'Pairing',
          note: 'Pairing is a short flow of its own, from the ticket or from Settings → Desktop, with a check before the phone pairs. Unpair and replace are on the Overview page.',
          items: [
            { id: 'B-unpaired', name: 'Not paired', src: 'variants/phone.html?o=B&s=unpaired', ...PHONE, note: '“Pair a desktop” replaces Start and opens the flow.' },
            { id: 'B-pair', name: 'Pair a desktop', src: 'variants/phone.html?o=B&s=pair', ...PHONE, note: 'What pairing is for, the three steps, and Scan pairing code.' },
            { id: 'B-pairconfirm', name: 'Pair with RAMON‑PC?', src: 'variants/phone.html?o=B&s=pairconfirm', ...PHONE, note: 'After the scan: the desktop’s name and address, and what this phone will be able to do there.' },
            { id: 'B-paired', name: 'Paired', src: 'variants/phone.html?o=B&s=paired', ...PHONE, note: 'Done returns to where pairing started.' },
          ],
        },
      ],
    },
    {
      title: 'C · Desktop on Maps',
      round: 1,
      sections: [
        {
          title: 'Start',
          note: 'One tap. The start waits five seconds on the phone, with Undo, before it goes to RAMON‑PC.',
          items: [
            { id: 'C-start', name: 'Ready to start', src: 'variants/phone.html?o=C&s=start', ...PHONE, note: 'The same action bar as A and B.' },
            { id: 'C-undo', name: 'Starting, with Undo', src: 'variants/phone.html?o=C&s=confirm', ...PHONE, note: 'Nothing has been sent yet, so the action bar says “Starting on RAMON‑PC…” and Undo takes it back. This frame holds still; tapping Start yourself runs the five seconds.' },
          ],
        },
        {
          title: 'Watch',
          note: 'Live opens from the list on Maps or from the ticket. What is happening now comes first, in large type; the history follows newest first, with reads folded together.',
          items: [
            { id: 'C-live', name: 'Live', src: 'variants/phone.html?o=C&s=live', ...PHONE, note: '“Now: Writing a reply”, then the reply as it streams, then everything before it. The history ends at the prompt Wayfinder sent.' },
            { id: 'C-reconnecting', name: 'Reconnecting', src: 'variants/phone.html?o=C&s=reconnecting', ...PHONE, note: 'The line under Now says what is shown and offers Try now.' },
            { id: 'C-caughtup', name: 'Caught up, needs you', src: 'variants/phone.html?o=C&s=caughtup', ...PHONE, note: 'Now says it is waiting for your approval and where to give it. What arrived while away is marked along its edge.' },
          ],
        },
        {
          title: 'Outcome',
          note: 'Now carries the outcome, with its card under it.',
          items: [
            { id: 'C-done', name: 'PR ready', src: 'variants/phone.html?o=C&s=done', ...PHONE, note: 'Now reads “Opened PR #341”, with the outcome card and Open PR on GitHub under it.' },
            { id: 'C-failed', name: 'Failed', src: 'variants/phone.html?o=C&s=failed', ...PHONE, note: 'Now reads “Stopped”, with the reason under it.' },
          ],
        },
        {
          title: 'Desktop out of reach',
          note: 'Maps keep loading from GitHub. The list on Maps carries the connection, the waiting starts and the last word from each run.',
          items: [
            { id: 'C-offline', name: 'Queued, with Undo', src: 'variants/phone.html?o=C&s=offline', ...PHONE, note: 'Out of reach, Start saves the start on the phone straight away, with Undo, and the action bar shows it waiting.' },
            { id: 'C-queued', name: 'Waiting, on the ticket', src: 'variants/phone.html?o=C&s=queued', ...PHONE, note: 'The action bar holds the waiting start, with Cancel start.' },
            { id: 'C-pending', name: 'On RAMON‑PC, out of reach', src: 'variants/phone.html?o=C&s=pending', ...PHONE, note: 'The list on Maps: “Can’t reach” with Try now, #230 as last seen at 10:14, and the two waiting starts with Cancel. Tap Try now to see them go out.' },
          ],
        },
        {
          title: 'Back in reach',
          note: 'Waiting starts go to the desktop they were made for, and RAMON‑PC checks each ticket again before it starts anything. A ticket that has since closed, become blocked or been started is turned down, with the reason.',
          items: [
            { id: 'C-sent', name: 'Back in touch', src: 'variants/phone.html?o=C&s=sent', ...PHONE, note: '#226 was sent and is starting; #233 didn’t start, with Dismiss; #230 finished with a PR.' },
            { id: 'C-rejected', name: 'Turned down, on the ticket', src: 'variants/phone.html?o=C&s=rejected', ...PHONE, note: 'The same reason on #233’s action bar, with Watch it.' },
          ],
        },
        {
          title: 'Pairing',
          note: 'With no desktop, Start still works: it opens the scanner, pairs, then carries on into the start. Settings → Desktop pairs too. Unpair and replace are on the Overview page.',
          items: [
            { id: 'C-unpaired', name: 'Start, not paired', src: 'variants/phone.html?o=C&s=unpaired', ...PHONE, note: '“No desktop paired. You’ll pair one first.” over “Start on desktop”.' },
            { id: 'C-pair', name: 'Scan to start', src: 'variants/phone.html?o=C&s=pair', ...PHONE, note: 'The scanner says why it opened: to start #230. Tap the code to pair.' },
            { id: 'C-paired', name: 'Paired, starting', src: 'variants/phone.html?o=C&s=paired', ...PHONE, note: 'Back on #230, paired and starting, with Undo.' },
          ],
        },
      ],
    },
    {
      title: 'Choosing the model',
      round: 'Round 2',
      question: 'With A’s start and Session tab, and B’s pairing pages, how do you choose the model a phone start runs on, and what happens to that choice while RAMON‑PC is out of reach?',
      sections: [
        {
          title: 'Where this round starts',
          note: 'Round 1’s pages above are unchanged. Nothing on this page is decided yet: pick, change or combine on the Wayfinder canvas.',
          items: [
            {
              id: 'R2-brief',
              kind: 'note',
              name: 'What you said',
              boardWidth: 340,
              text: "Your words in the parent thread: “Overall though I choose A. How every I like B pairing page. Another thing I didn’t see is the option to choose which model it is using to start the session.”\n\nSo every frame here starts from A (Start alert on the ticket, Session tab, waiting starts in Settings → Desktop) and pairs through B’s pages (Pair a desktop, “Pair with RAMON‑PC?”, Paired). How A and B combine is shown, not settled.\n\nWhat the desktop does today: the ticket panel’s “Run as” switch picks Simple, Mid or Hard; each tier maps to a model and effort in Settings → Tasks; the model can be changed for one hand-off; a model T3 Code no longer offers is dropped and T3 Code picks (src/ui/app.ts runWithHtml, src/models.ts liveChoice). The catalog is T3 Code’s providers, grouped, with signed-out ones marked “not ready”.\n\nNew here: the phone only knows the list RAMON‑PC last sent, so each option says what a waiting start carries and what RAMON‑PC does if that model has gone by the time it arrives.",
            },
          ],
        },
        {
          title: 'Three ways to choose the model, at the same moment',
          note: '#230 is next up, RAMON‑PC is online, and Start has just been tapped. Each frame is the whole app.',
          items: [
            {
              id: 'M1',
              name: 'Tier in the alert',
              src: 'variants/phone.html?m=M1&s=confirm', ...PHONE,
              note: {
                idea: 'A’s Start alert gains the desktop’s own Run as switch: Simple, Mid, Hard, with the model each one runs on today. The phone sends the tier; RAMON‑PC picks that tier’s model from Settings → Tasks when the start arrives.',
                pros: ['Same words and tiers as the desktop’s Run as', 'Nothing on the phone goes stale: a waiting start picks the model it finds on arrival', 'One control, inside the alert you already have'],
                cons: ['No exact model or effort from the phone; changing what Mid means is done on the desktop', 'The model shown while out of reach is only what Mid meant at 10:14', 'Puts a control inside an alert'],
                basedOn: ['A', 'A-confirm'],
              },
            },
            {
              id: 'M2',
              name: 'Model page from the alert',
              src: 'variants/phone.html?m=M2&s=confirm', ...PHONE,
              note: {
                idea: 'A’s Start alert names the model, with Change. Change opens a Model page laid out like B’s pairing page: the three tier defaults, then every model RAMON‑PC offers by provider, then its effort, with Use at the foot. The exact model is sent. If it has gone when a waiting start arrives, RAMON‑PC turns the start down and the phone offers Choose a model.',
                pros: ['Any model and effort T3 Code offers, per start', 'You get exactly what you picked, or nothing runs', 'The page reuses B’s pairing-page layout you liked'],
                cons: ['A turned-down start needs you again, possibly hours later', 'Two steps when you do want to change the model', 'Choice is per start; a ticket you restart asks again'],
                basedOn: ['A', 'A-confirm', 'B-pair'],
              },
            },
            {
              id: 'M3',
              name: 'Run as on the ticket',
              src: 'variants/phone.html?m=M3&s=start', ...PHONE,
              note: {
                idea: 'Like the desktop’s ticket panel: a Run as row sits above Start on the ticket, and opens the same Model page. The choice is kept for that ticket on the phone, and A’s alert names it. The exact model and tier are sent; if the model has gone on arrival, RAMON‑PC runs the tier’s default and the ticket says so.',
                pros: ['You see the model before tapping Start, as on the desktop', 'A waiting start always runs, even if its model went away', 'The alert stays a plain yes or no'],
                cons: ['A bigger action bar on every startable ticket', 'A fallback can run on a model you didn’t pick', 'One more thing remembered per ticket on the phone'],
                basedOn: ['A', 'A-start', 'B-pair'],
              },
            },
            {
              id: 'R2-review',
              kind: 'note',
              name: 'Design review',
              boardWidth: 340,
              text: "Sources: Ramon’s message in the parent thread (quoted under What you said); #224 and #222’s confirmed architecture (comment 6184503526: pending starts persist, auto-send to the original desktop, desktop rechecks eligibility, phone is watch-only); src/models.ts (ModelCatalog, liveChoice, toModelSelection) and src/ui/models.ts (tiers, hints, “T3 Code default”, “(not ready)”); src/ui/app.ts runWithHtml (desktop Run as); round 1’s A and B frames. Tokens: src/ui/styles.css only; model.css adds classes, no tokens. Catalog values are made up.\n\nThemes and states, checked headless (Playwright, installed Chrome): all 27 round 2 frames in light and dark at 390×844 and 320×640, no page errors. States: online, provider not ready, out of reach, waiting, back in reach (sent, fallback to the tier default, turned down), live, and B’s pairing steps. Round 1 is untouched: its 62 frames, light and dark, match the previous commit pixel for pixel with animations frozen.\n\nFocus and keyboard: the alerts open on Cancel and trap Tab; M1’s tier buttons and the effort switch are buttons with aria-pressed in a labelled group (as the desktop’s Task tier group); the Model page uses native radio inputs, so arrow keys move the choice, with a focus ring on the mark; Back and Cancel on the Model page return to the alert with its earlier choice.\n\nSemantics: alertdialog with title and description; radios grouped and named per provider; disabled not-ready models say why in text, not colour alone; the warning row names the provider.\n\nContrast and size, by script on the same 108 captures: every visible text ≥ 4.5:1 against its resolved background (3:1 for large text), no control under 24×24px, every button, radio and tab named, a heading on every screen, no sideways scrolling at 320px.\n\nInteraction, by script: M2’s Change opens the Model page, arrow keys move the radio, an effort can be set, Use returns to the alert with it and Start shows it on the Session tab; Escape returns with the old choice. M1’s tier buttons keep focus and update the model line. Try now on waiting starts sends #226 in M1 and M3 (M3 on the Mid default) and turns it down in M2 with Choose a model. Pairing from the ticket goes Pair a desktop → scan → Pair with RAMON‑PC? → Paired → Done back on #230.\n\nFindings: the Model page is long (three providers); the chosen model opens in view, but on the out-of-reach page the banner leads instead.\n\nNot checked: real devices, screen readers, large text, landscape, what T3 Code really relays over the paired connection (the phone catalog shape is assumed to match /api/models), and a phone that has never received a catalog (it would have tiers but no list).",
            },
          ],
        },
        {
          title: 'M1 · Tier in the alert',
          note: 'The phone sends { ticket, tier } with its request ID. RAMON‑PC resolves the tier with its own Settings → Tasks when the start arrives, as the desktop does today.',
          items: [
            { id: 'M1-confirm', name: 'Start alert, Run as', src: 'variants/phone.html?m=M1&s=confirm', ...PHONE, note: { idea: 'Mid is the default tier. Each tier button names its hint, as on the desktop; the line under it names the model Mid runs on today.', basedOn: ['A-confirm'] } },
            { id: 'M1-unavailable', name: 'Tier’s model not ready', src: 'variants/phone.html?m=M1&s=unavailable', ...PHONE, note: { idea: 'Codex is signed out in T3 Code on RAMON‑PC, so Mid’s GPT‑6.1 Sol can’t run. As on the desktop today, T3 Code then picks the model; Simple or Hard can be chosen instead.', basedOn: ['A-confirm'] } },
            { id: 'M1-offline', name: 'Out of reach', src: 'variants/phone.html?m=M1&s=offline', ...PHONE, note: { idea: 'A’s Send later alert with the same switch. The line says the model is only what that tier meant at 10:14.', basedOn: ['A-offline'] } },
            { id: 'M1-pending', name: 'Waiting starts', src: 'variants/phone.html?m=M1&s=pending', ...PHONE, note: { idea: 'Settings → Desktop: each waiting start lists the tier it carries, and the fine print says what is sent.', basedOn: ['A-pending'] } },
            { id: 'M1-sent', name: 'Sent on reconnect', src: 'variants/phone.html?m=M1&s=sent', ...PHONE, note: { idea: '#226 was sent at 10:41 as Hard; the action bar says which model RAMON‑PC picked for it.', basedOn: ['A-sent'] } },
          ],
        },
        {
          title: 'M2 · Model page from the alert',
          note: 'The phone sends { ticket, tier, model: { instanceId, model, effort } } with its request ID, the shape T3 Code’s modelSelection takes. RAMON‑PC rechecks the model with the ticket, and turns the start down if it isn’t offered.',
          items: [
            { id: 'M2-confirm', name: 'Start alert, Model row', src: 'variants/phone.html?m=M2&s=confirm', ...PHONE, note: { idea: 'The row names the model and where it comes from: RAMON‑PC’s Mid default. Tap it to change.', basedOn: ['A-confirm'] } },
            { id: 'M2-picker', name: 'Model page', src: 'variants/phone.html?m=M2&s=picker', ...PHONE, note: { idea: 'B’s pairing-page layout: tile and heading, Tier defaults, then Codex, Claude and Grok, then the picked model’s effort. Use returns to the alert with the choice; Back or Cancel returns without it.', basedOn: ['B-pair'] } },
            { id: 'M2-unavailable', name: 'Provider not ready', src: 'variants/phone.html?m=M2&s=unavailable', ...PHONE, note: { idea: 'Codex is signed out on RAMON‑PC: its models are off with the reason in words, and Mid says it isn’t ready.', basedOn: ['B-pair'] } },
            { id: 'M2-offline', name: 'Out of reach', src: 'variants/phone.html?m=M2&s=offline', ...PHONE, note: { idea: 'A’s Send later alert with the Model row; a line says the list is from 10:14 and what happens if the model goes.', basedOn: ['A-offline'] } },
            { id: 'M2-offline-picker', name: 'Model page, out of reach', src: 'variants/phone.html?m=M2&s=offline-picker', ...PHONE, note: { idea: 'The banner says this is RAMON‑PC’s list from 10:14.', basedOn: ['B-pair'] } },
            { id: 'M2-pending', name: 'Waiting starts', src: 'variants/phone.html?m=M2&s=pending', ...PHONE, note: { idea: 'Each waiting start lists its exact model. Tap Try now to see #226 turned down.', basedOn: ['A-pending'] } },
            { id: 'M2-rejected', name: 'Turned down, model gone', src: 'variants/phone.html?m=M2&s=sent', ...PHONE, note: { idea: 'By 10:41 GPT‑6.1 was hidden in T3 Code, so #226 didn’t start. Choose model opens the alert again; #233 is turned down as in round 1.', basedOn: ['A-rejected', 'B-rejected'] } },
          ],
        },
        {
          title: 'M3 · Run as on the ticket',
          note: 'The phone sends { ticket, tier, model } with its request ID. If the model isn’t offered on arrival, RAMON‑PC runs the tier’s default instead, and the ticket says so.',
          items: [
            { id: 'M3-start', name: 'Run as above Start', src: 'variants/phone.html?m=M3&s=start', ...PHONE, note: { idea: 'The row sits in A’s action bar, over the desktop and Start.', basedOn: ['A-start'] } },
            { id: 'M3-picker', name: 'Model page', src: 'variants/phone.html?m=M3&s=picker', ...PHONE, note: { idea: 'The same page as M2; Use keeps the choice for #230.', basedOn: ['B-pair'] } },
            { id: 'M3-confirm', name: 'Start alert', src: 'variants/phone.html?m=M3&s=confirm', ...PHONE, note: { idea: 'A’s alert, unchanged except that it names the model.', basedOn: ['A-confirm'] } },
            { id: 'M3-unavailable', name: 'Provider not ready', src: 'variants/phone.html?m=M3&s=unavailable', ...PHONE, note: { idea: 'The Run as row warns before you tap Start.', basedOn: ['A-start'] } },
            { id: 'M3-queued', name: 'Waiting, on the ticket', src: 'variants/phone.html?m=M3&s=queued', ...PHONE, note: { idea: 'The waiting start shows what it will send.', basedOn: ['A-queued'] } },
            { id: 'M3-pending', name: 'Waiting starts', src: 'variants/phone.html?m=M3&s=pending', ...PHONE, note: { idea: 'As M2, with M3’s fallback in the fine print.', basedOn: ['A-pending'] } },
            { id: 'M3-sent', name: 'Sent, on the default', src: 'variants/phone.html?m=M3&s=sent', ...PHONE, note: { idea: 'GPT‑6.1 had gone by 10:41, so #226 runs on Mid’s GPT‑6.1 Sol · High, and the action bar says so.', basedOn: ['A-sent'] } },
          ],
        },
        {
          title: 'In all three: the Session tab and B’s pairing pages',
          note: 'The model a run uses shows on A’s Session tab. Pairing from the ticket goes through B’s pages; after Done, Start uses the option above.',
          items: [
            { id: 'R2-live', name: 'Session, with its model', src: 'variants/phone.html?m=M1&s=live', ...PHONE, note: { idea: 'A’s Session tab; the report line names RAMON‑PC and the model.', basedOn: ['A-live'] } },
            { id: 'R2-unpaired', name: 'Not paired', src: 'variants/phone.html?m=M1&s=unpaired', ...PHONE, note: { idea: 'A’s action bar; Pair a desktop opens B’s page instead of Settings.', basedOn: ['A-unpaired', 'B-unpaired'] } },
            { id: 'R2-pair', name: 'Pair a desktop', src: 'variants/phone.html?m=M1&s=pair', ...PHONE, note: { idea: 'B’s page, unchanged.', basedOn: ['B-pair'] } },
            { id: 'R2-pairconfirm', name: 'Pair with RAMON‑PC?', src: 'variants/phone.html?m=M1&s=pairconfirm', ...PHONE, note: { idea: 'B’s check after the scan, unchanged.', basedOn: ['B-pairconfirm'] } },
            { id: 'R2-paired', name: 'Paired', src: 'variants/phone.html?m=M1&s=paired', ...PHONE, note: { idea: 'Done returns to #230 with Start.', basedOn: ['B-paired'] } },
          ],
        },
      ],
    },
    {
      title: 'Your pick, end to end',
      round: 'Chosen path',
      question: 'Does the combination you picked (A overall, B’s pairing pages, M2’s model page) hold together from start to finish, including a restart while RAMON‑PC is out of reach and pairing from Settings?',
      sections: [
        {
          title: 'What this page is',
          note: 'Not a new option. Every frame is a screen already on this canvas, run with A, B’s pairing and M2 together.',
          items: [
            {
              id: 'pick-brief',
              kind: 'note',
              name: 'Your pick',
              boardWidth: 340,
              text: "Recorded in #224 (comment 6451277279): round 1, “Overall though I choose A. How every I like B pairing page.” Round 2, “m2 is amazing i love it.”\n\nThis page lines up that combination in order: start with M2’s model page, watch on A’s Session tab, wait while RAMON‑PC is out of reach, close and reopen Wayfinder, get back in reach, and pair, both from a ticket and from Settings → Desktop. There are no new controls, copy or behaviour. The two reopened frames are A’s waiting-start screens at a later time; what makes them different is the note under each.\n\nThe last note on this page lists what your pick doesn’t settle yet.",
            },
          ],
        },
        {
          title: 'Start and watch',
          note: 'A’s Start alert with M2’s Model row; Change opens the Model page; Start opens A’s Session tab.',
          items: [
            { id: 'pick-confirm', name: 'Start alert, Model row', src: 'variants/phone.html?m=M2&s=confirm', ...PHONE, note: { idea: 'The same frame as M2’s.', basedOn: ['M2-confirm', 'A-confirm'] } },
            { id: 'pick-picker', name: 'Model page', src: 'variants/phone.html?m=M2&s=picker', ...PHONE, note: { idea: 'The same frame as M2’s, laid out like B’s pairing page.', basedOn: ['M2-picker', 'B-pair'] } },
            { id: 'pick-live', name: 'Session, with its model', src: 'variants/phone.html?m=M2&s=live', ...PHONE, note: { idea: 'A’s Session tab. Round 2 showed it with M1; here it runs with M2.', basedOn: ['R2-live', 'A-live'] } },
          ],
        },
        {
          title: 'Out of reach, through a restart',
          note: '#222: waiting starts stay on the phone across app restarts, with no expiry, until they are sent, cancelled or turned down. They send by themselves the next time Wayfinder is open and reaches RAMON‑PC. Here Wayfinder is closed at 10:26 and opened again at 10:36; RAMON‑PC is still out of reach.',
          items: [
            { id: 'pick-offline', name: 'Start while out of reach', src: 'variants/phone.html?m=M2&s=offline', ...PHONE, note: { idea: '10:24. A’s Send later alert with M2’s Model row. Send later saves the start on the phone.', basedOn: ['M2-offline', 'A-offline'] } },
            { id: 'pick-pending', name: 'Waiting, before closing', src: 'variants/phone.html?m=M2&s=pending', ...PHONE, note: { idea: '10:25. Settings → Desktop lists both waiting starts, each with its exact model. The fine print already says they stay even if Wayfinder closes.', basedOn: ['M2-pending', 'A-pending'] } },
            { id: 'pick-reopened-ticket', name: 'Reopened: still waiting on #226', src: 'variants/phone.html?m=M2&s=reopened-ticket', ...PHONE, note: { idea: '10:36, after Wayfinder was closed and opened again. #226’s action bar still holds its waiting start, with the model it was saved with, and Cancel start. The screen is A’s waiting frame; nothing marks the restart.', basedOn: ['M2-pending', 'A-queued'] } },
            { id: 'pick-reopened', name: 'Reopened: all waiting starts', src: 'variants/phone.html?m=M2&s=reopened', ...PHONE, note: { idea: '10:36. Settings → Desktop lists the same two starts, at their original times (10:20, 10:24) and models. Try now checks RAMON‑PC straight away.', basedOn: ['M2-pending', 'A-pending'] } },
            { id: 'pick-back', name: 'Back in reach', src: 'variants/phone.html?m=M2&s=sent', ...PHONE, note: { idea: '10:41. Reaching RAMON‑PC sends both by themselves. RAMON‑PC rechecks each: #233 had already been started on the desktop, and #226’s GPT‑6.1 is no longer offered, so under M2 nothing starts and Choose model asks again.', basedOn: ['M2-rejected', 'A-rejected'] } },
          ],
        },
        {
          title: 'Pairing from a ticket',
          note: 'A’s action bar; Pair a desktop opens B’s pages. Round 2 showed this with M1; here it runs with M2.',
          items: [
            { id: 'pick-unpaired', name: 'Not paired', src: 'variants/phone.html?m=M2&s=unpaired', ...PHONE, note: { idea: '“Pair a desktop” replaces Start.', basedOn: ['R2-unpaired', 'A-unpaired'] } },
            { id: 'pick-pair', name: 'Pair a desktop', src: 'variants/phone.html?m=M2&s=pair', ...PHONE, note: { idea: 'B’s page, unchanged.', basedOn: ['B-pair'] } },
            { id: 'pick-pairconfirm', name: 'Pair with RAMON‑PC?', src: 'variants/phone.html?m=M2&s=pairconfirm', ...PHONE, note: { idea: 'B’s check after the scan, unchanged.', basedOn: ['B-pairconfirm'] } },
            { id: 'pick-paired', name: 'Paired', src: 'variants/phone.html?m=M2&s=paired', ...PHONE, note: { idea: 'Done returns to #230, now with Start and M2’s alert.', basedOn: ['B-paired'] } },
          ],
        },
        {
          title: 'Pairing from Settings → Desktop',
          note: 'In round 1, Settings → Desktop’s “Not paired” page was the same in A, B and C, and B opened its own Pair a desktop page only from a ticket. So this path is the shared Desktop page, the scanner, then B’s check and Paired. Done returns to Settings → Desktop.',
          items: [
            { id: 'pick-settings', name: 'Settings, not paired', src: 'variants/phone.html?m=M2&s=settings-unpaired', ...PHONE, note: { idea: '#316’s Settings page; the Desktop row says “Not paired”.', basedOn: ['settings'] } },
            { id: 'pick-desktop-none', name: 'Desktop, not paired', src: 'variants/phone.html?m=M2&s=desktop-unpaired', ...PHONE, note: { idea: 'The shared page from round 1: the three steps, Scan pairing code and Enter code instead. Its steps are the same as on B’s Pair a desktop page.', basedOn: ['desktop-none'] } },
            { id: 'pick-scan', name: 'Scan pairing code', src: 'variants/phone.html?m=M2&s=scan', ...PHONE, note: { idea: 'The shared scanner. Tap the code to scan it; it goes on to B’s check, not straight to Paired as in A.', basedOn: ['scan'] } },
            { id: 'pick-desktop-pairconfirm', name: 'Pair with RAMON‑PC?', src: 'variants/phone.html?m=M2&s=desktop-pairconfirm', ...PHONE, note: { idea: 'B’s check, reached from Settings. Cancel returns to the Desktop page.', basedOn: ['B-pairconfirm'] } },
            { id: 'pick-desktop-paired', name: 'Paired', src: 'variants/phone.html?m=M2&s=desktop-paired', ...PHONE, note: { idea: 'B’s Paired. Done returns to Settings → Desktop, now showing RAMON‑PC.', basedOn: ['B-paired'] } },
          ],
        },
        {
          title: 'Not settled by your pick',
          note: 'Open questions only. Nothing above changes because of them.',
          items: [
            {
              id: 'pick-open',
              kind: 'note',
              name: 'Still open',
              boardWidth: 340,
              text: "1. Settings → Desktop when not paired. Round 1 showed the shared page there in every option, so this page keeps it. Whether “I like B pairing page” means B’s Pair a desktop page should replace it there too is yours to say; the two pages carry the same three steps.\n\n2. Reopening while out of reach. A shows waiting starts on their tickets and in Settings → Desktop, and nothing else. B’s banner on Maps was part of B, not of your pick, so after a restart nothing on Maps says starts are waiting.\n\n3. #230’s Session tab after a restart while out of reach. These frames show the history last relayed, with Reconnecting. #222 says reconnecting restores the history; whether the phone keeps it across a restart is not decided.\n\n4. M2 after a long wait. A start whose model has gone is turned down and asks again, possibly hours later. That is M2 as you picked it.\n\nShown here, not decided by this page: when a reopened app reconnects. #222 says sending is automatic once Wayfinder is open and reaches RAMON‑PC, and that a suspended or closed app may not reconnect straight away.\n\nOwned elsewhere: the desktop’s pairing code and phone list (#335), the desktop endpoint (#230), building the phone start (#231), notifications (#225).",
            },
          ],
        },
      ],
    },
  ],
};
