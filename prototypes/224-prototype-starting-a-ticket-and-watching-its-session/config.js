/*
  Wayfinder's canvas for ticket #224: starting a ticket from the phone and watching its session.
  Built on #223's picked screens (R-C2 Maps, M-C map, T-C ticket) and #316's Settings page (G-a),
  copied into variants/ with their CSS. Follows the confirmed #222 architecture; the desktop side
  of pairing is #335's and notifications are #225's.
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
  ],
};
