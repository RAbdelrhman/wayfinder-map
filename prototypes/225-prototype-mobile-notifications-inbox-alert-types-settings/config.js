/*
  Wayfinder's canvas for ticket #225: pushes, the Inbox and Notifications settings on the phone.
  Built on #316's picked G-a Settings and #223's picked screens (variants/mobile.*, account.* copied unchanged);
  variants/notify.* adds this ticket. Check with:
  node prototypes/225-prototype-mobile-notifications-inbox-alert-types-settings/tools/check.mjs
*/

// Every frame is the whole phone app; src stays a literal so Wayfinder can read each option's page.
const PHONE = { width: 390, height: 844, boardWidth: 300 };

window.CANVAS = {
  ticket: 225,
  title: 'Phone notifications: pushes, Inbox, settings',
  question: 'Which look should the phone’s pushes, Inbox and Notifications settings take?',
  sampleState:
    'Signed in as @RAbdelrhman, paired with one desktop. The desktop has synced 5 needs-you alerts (3 unread) and 3 map updates (2 new). Behaviour is the confirmed brief and is identical in A, B, C and Round 2’s D; only the look differs. Tap a push or an Inbox row to open its ticket; flip switches in Notifications. Frames follow the T toggle for light and dark, except on the Dark page, which pins dark.',

  base: {
    stylesheets: ['../../src/ui/styles.css', 'variants/mobile.css', 'variants/account.css', 'variants/notify.css'],
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
      title: 'Options',
      id: 'round-1',
      round: 1,
      sections: [
        {
          title: 'A · Desktop panel',
          note: 'The desktop’s #196 Inbox panel at phone size, and pushes worded exactly like the desktop’s own notifications.',
          items: [
            {
              id: 'A',
              name: 'Desktop panel',
              src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=A&screen=inbox', ...PHONE,
              note: {
                idea: 'Inbox: #196’s summary line (“5 need you · 2 new on your maps”), All / Needs you pills with the amber unread count, then one list on one card. Needs-you rows carry the amber bar and kind line; read rows fade the bar and the title. Activity rows look like the desktop’s, with “While you were away”. Push: the desktop’s wording, title “RAbdelrhman/wayfinder-map · Map #217 A Wayfinder mobile app”, body “T3 Code needs you: #223 …”. Settings: a “This phone” group with Push to this phone, then all seven alert types in one list with the desktop’s own labels and hints; Tickets become ready carries an “Inbox only · never pushed” tag.',
                pros: ['Same panel, words and amber cues as the desktop, so nothing new to learn', 'Pushes read the same as desktop notifications', 'Settings rows match the desktop’s Notifications section line for line'],
                cons: ['Densest of the three: small scope lines, long rows', 'The push title leads with the repo and map, so the alert kind is cut to the second line on the lock screen', 'One long settings list; Ready to start is told apart only by its tag'],
                disposition: 'combine',
                feedback: 'Source: Wayfinder canvas notes on #225, issuecomment-6389446089 (Round 1 @ 6799739). Notes: “Show”: “I like this show element”; a needs-you row: “I like how the tickets look on A overall with the things like like from C.” Confirmed summary for Round 2: combine A, B and C into D. C’s overall timeline and ticket-first pushes; A’s ticket styling, summary line and All / Needs you pills replacing C’s large amber count panel; B’s notification icons, blue unread dots and grouped settings layout; timeline dots centred on the line; explore distinct accessible colours by alert type. From A: ticket styling, summary line, All / Needs you pills.',
              },
            },
            { id: 'A-push', name: 'A · Pushes on the lock screen', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=A&screen=lock', ...PHONE, note: 'Three unread needs-you alerts arrived as pushes. Tap one: it opens that ticket’s detail, with Maps underneath, and leaves the lock screen.' },
            { id: 'A-needs', name: 'A · Needs you filter', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=A&screen=inbox&filter=needs', ...PHONE, note: 'Needs you hides map activity. Read alerts stay until the desktop sees them handled.' },
            { id: 'A-settings', name: 'A · Notifications settings', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=A&screen=notif', ...PHONE, note: 'Reached from Settings › Preferences › Notifications. Push to this phone is this phone’s own; the seven types are shared.' },
            { id: 'A-pushoff', name: 'A · Push off', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=A&screen=notif&push=off', ...PHONE, note: 'Push to this phone off: the desktop stops pushing here; alerts still reach the Inbox.' },
            { id: 'A-offline', name: 'A · Desktop unreachable', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=A&screen=inbox&desk=offline', ...PHONE, note: 'The last synced history, cached. New alerts arrive once the desktop is back.' },
            { id: 'A-offline-set', name: 'A · Settings, read-only', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=A&screen=notif&desk=offline', ...PHONE, note: 'Every switch shows the last synced value and can’t be changed until the desktop is back.' },
            { id: 'A-empty', name: 'A · Empty', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=A&screen=inbox&empty=1', ...PHONE, note: 'Nothing synced yet.' },
          ],
        },
        {
          title: 'B · Grouped by day',
          note: 'The phone’s own list style: Today / Yesterday groups, a kind icon on every row, and pushes that lead with the alert kind.',
          items: [
            {
              id: 'B',
              name: 'Grouped by day',
              src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=B&screen=inbox', ...PHONE,
              note: {
                idea: 'Inbox: an All / Needs you segmented control (the ticket tabs’ look) with the amber unread count, then inset groups under Today and Yesterday. Each row has a round icon: amber with the kind’s icon for needs-you, grey for activity. Amber kind line above the ticket title, “9:23 · Map #217” below, and a blue dot while unread. Push: title is the kind (“T3 Code needs you”), subtitle the map, body “#223 …”. Settings: a Push to this phone card on top, then “Pushed to phones” (six switches) and a separate “Inbox only” group for Tickets become ready.',
                pros: ['Kind first everywhere: the push title and the row icon say what happened at a glance', 'Day groups make “what came in this morning” easy to scan', 'Settings split “pushes” from “inbox only”, so it’s plain why Ready to start never pushes'],
                cons: ['Looks least like the desktop panel (segmented control, icons, dots)', 'A blue unread dot is a new cue the desktop doesn’t use', 'Full repo name is gone from rows; only the map number shows'],
                disposition: 'combine',
                feedback: 'Source: Wayfinder canvas notes on #225, issuecomment-6389446089 (Round 1 @ 6799739). Note on a needs-you row: “I like the icons and the blue dot on the notifications.” Confirmed summary for Round 2: combine A, B and C into D. C’s overall timeline and ticket-first pushes; A’s ticket styling, summary line and All / Needs you pills replacing C’s large amber count panel; B’s notification icons, blue unread dots and grouped settings layout; timeline dots centred on the line; explore distinct accessible colours by alert type. From B: the kind icons and the blue unread dot.',
              },
            },
            { id: 'B-push', name: 'B · Pushes on the lock screen', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=B&screen=lock', ...PHONE, note: 'Same three pushes, kind as the title, map as the subtitle. Tap one to open its ticket.' },
            { id: 'B-needs', name: 'B · Needs you filter', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=B&screen=inbox&filter=needs', ...PHONE, note: 'Needs you only, still grouped by day.' },
            { id: 'B-settings', name: 'B · Notifications settings', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=B&screen=notif', ...PHONE, note: {
                idea: 'The push card is this phone’s; both groups below are shared.',
                disposition: 'combine',
                feedback: 'Source: Wayfinder canvas notes on #225, issuecomment-6389446089 (Round 1 @ 6799739). Note: “I like these settings,” Confirmed summary for Round 2: combine A, B and C into D. C’s overall timeline and ticket-first pushes; A’s ticket styling, summary line and All / Needs you pills replacing C’s large amber count panel; B’s notification icons, blue unread dots and grouped settings layout; timeline dots centred on the line; explore distinct accessible colours by alert type. From B-settings: the whole grouped layout (Push to this phone card, Pushed to phones, Inbox only).',
              },
            },
            { id: 'B-pushoff', name: 'B · Push off', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=B&screen=notif&push=off', ...PHONE, note: 'The card goes grey and says alerts still reach the Inbox.' },
            { id: 'B-offline', name: 'B · Desktop unreachable', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=B&screen=inbox&desk=offline', ...PHONE, note: 'Cached history under the same banner #223 uses for cached maps.' },
            { id: 'B-offline-set', name: 'B · Settings, read-only', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=B&screen=notif&desk=offline', ...PHONE, note: 'Last synced values, switches locked.' },
            { id: 'B-empty', name: 'B · Empty', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=B&screen=inbox&empty=1', ...PHONE, note: 'Nothing synced yet.' },
          ],
        },
        {
          title: 'C · Timeline',
          note: 'A big unread count on top, then a time rail where needs-you alerts are cards and map activity is plain text. Pushes lead with the ticket.',
          items: [
            {
              id: 'C',
              name: 'Timeline',
              src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=C&screen=inbox', ...PHONE,
              note: {
                idea: 'Inbox: an amber card with the unread needs-you count (“3 unread need you · 2 new on your maps”), underline tabs All / Needs you, then a timeline: clock times on the left, a rail, and amber nodes. Needs-you alerts are raised cards with an amber edge (the map tiles’ look); activity sits as plain text between them. Push: title is the ticket (“#223 Prototype the following screens…”), body “T3 Code needs you · Map #217 …”. Settings: a summary on top (“6 of 6 alert types push here”), the Push to this phone row, then the seven types with icons and “Inbox and push” or “Inbox only · never pushed” under each.',
                pros: ['Needs-you stands out most: cards against plain activity', 'The count on top matches the badge, so the number you saw on the icon is the first thing you read', 'Settings say for every type exactly where it goes'],
                cons: ['The tallest rows: fewer items per screen', 'The rail and times take 80px of width on a narrow phone', 'Ticket-first pushes hide the kind until the second line'],
                disposition: 'combine',
                feedback: 'Source: Wayfinder canvas notes on #225, issuecomment-6389446089 (Round 1 @ 6799739). Notes: “Overall this is my favorite maybe different colors for each type of notification.”; the count panel: “This is ugly.”; a timeline node: “The dots need to be venter on the line.” Confirmed summary for Round 2: combine A, B and C into D. C’s overall timeline and ticket-first pushes; A’s ticket styling, summary line and All / Needs you pills replacing C’s large amber count panel; B’s notification icons, blue unread dots and grouped settings layout; timeline dots centred on the line; explore distinct accessible colours by alert type. From C: the overall timeline; its amber count panel is replaced by A’s summary and pills; dots centred; colours by type explored.',
              },
            },
            { id: 'C-push', name: 'C · Pushes on the lock screen', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=C&screen=lock', ...PHONE, note: {
                idea: 'Same three pushes, ticket as the title. Tap one to open its ticket.',
                disposition: 'combine',
                feedback: 'Source: Wayfinder canvas notes on #225, issuecomment-6389446089 (Round 1 @ 6799739). Note on a push: “These are the best notifications.” Confirmed summary for Round 2: combine A, B and C into D. C’s overall timeline and ticket-first pushes; A’s ticket styling, summary line and All / Needs you pills replacing C’s large amber count panel; B’s notification icons, blue unread dots and grouped settings layout; timeline dots centred on the line; explore distinct accessible colours by alert type. From C-push: ticket-first pushes, unchanged in D.',
              },
            },
            { id: 'C-needs', name: 'C · Needs you filter', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=C&screen=inbox&filter=needs', ...PHONE, note: 'Only the cards remain on the rail.' },
            { id: 'C-settings', name: 'C · Notifications settings', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=C&screen=notif', ...PHONE, note: 'The summary counts the push types switched on; it changes as you flip them.' },
            { id: 'C-pushoff', name: 'C · Push off', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=C&screen=notif&push=off', ...PHONE, note: 'The summary and every row say push is off; the types stay editable.' },
            { id: 'C-offline', name: 'C · Desktop unreachable', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=C&screen=inbox&desk=offline', ...PHONE, note: 'Cached history on the rail.' },
            { id: 'C-offline-set', name: 'C · Settings, read-only', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=C&screen=notif&desk=offline', ...PHONE, note: 'The summary becomes “Last synced 9:12 AM”; switches locked.' },
            { id: 'C-empty', name: 'C · Empty', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=C&screen=inbox&empty=1', ...PHONE, note: 'Nothing synced yet.' },
          ],
        },
        {
          title: 'The same in every option',
          note: 'Where the Inbox and settings live, the badge, and where a tap lands. Shown with A; B and C are identical here.',
          items: [
            { id: 'S-maps', name: 'Maps · Inbox bell', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=A&screen=repos', ...PHONE, note: '#196’s bell, in the ghost shape #223 uses for top-bar buttons, beside the avatar. Its count is unread needs-you only (amber), the same number as the app badge. Tap it for the Inbox.' },
            { id: 'S-settings', name: 'Settings · Notifications row', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=A&screen=settings', ...PHONE, note: '#316’s G-a page, unchanged except the Notifications row now opens this ticket’s settings and says whether this phone gets pushes.' },
            { id: 'S-badge', name: 'Home screen badge', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=A&screen=home', ...PHONE, note: 'The badge counts unread needs-you alerts only (3); map activity never adds to it. Tap the icon to open Maps.' },
            { id: 'S-ticket', name: 'After a tap · ticket detail', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=A&screen=inbox&tap=n1', ...PHONE, note: 'Tap any row: it marks the alert read on this phone and opens #223’s ticket detail (T-C), never the session, PR or canvas directly. Back returns to the Inbox.' },
          ],
        },
        {
          title: 'Review',
          items: [
            {
              id: 'review',
              kind: 'note',
              name: 'Design review',
              text: 'Sources: src/ui/styles.css tokens (plane, surface-1, text-*, hairline, gridline, wash, accent-fill/-text, state-*, handoff-needs-you for amber, handoff-pr-ready) and the #196 topbar Inbox rules (.map-inbox-trigger, -count, -filter, -needs::before, -kind, -away); src/notificationTypes.ts (seven kinds, defaults); src/ui/notifications.ts KIND_LABEL and desktopNotificationFor (push wording in A); src/ui/settings.ts NOTIFICATION_LABEL (switch labels and hints); src/ui/unifiedInbox.ts (All / Needs you, summary line, Ready to start as activity); src/ui/mapEventInbox.ts eventSummary and “While you were away”; mobile/src/auth/theme.ts and SettingsScreen.tsx (the built G-a page); #223 and #316 phone parts copied unchanged (variants/mobile.*, account.*). No new tokens.\n\nChecked headless (Playwright, installed Chrome), every Round 1 frame at 390×844 in light and dark, screenshots looked at: no page errors. Text contrast scripted on every text node: all ≥ 4.5:1 except #316’s avatar initial (4.42:1 light, 3.64:1 dark; inherited, not changed here). Disabled switches in read-only settings are dimmed on purpose; their row text stays full contrast. Touch targets ≥ 44px for everything this ticket adds; B’s segmented control (was 40px) and C’s All tab (was 22px wide) were fixed. Inherited from #223: search field 25px tall, ticket tabs 40px. Widths 320, 360 and 430: no horizontal overflow in Inbox, Notifications, lock screen or Maps for A, B, C.\n\nInteraction, scripted for A, B and C: Maps bell (“Inbox, 3 need you”) opens Inbox; tapping an alert opens #223 ticket detail with Back to Inbox; Escape returns, the row reads as read, and the bell drops to 2. A push opens ticket detail with Back to Maps. Settings › Notifications row opens settings; Space on a switch toggles it and keeps focus; Tab moves to the next switch; tapping a row’s label toggles it; switches are role=switch named by their row title and described by its hint; Escape goes back. Offline: 8 of 8 switches disabled under the banner. Filters are aria-pressed buttons and keep focus. Home badge reads 3 and launches Maps.\n\nFindings: the desktop’s green “While you were away” (--state-frontier) is 3.3:1 for small text, so these frames use --handoff-pr-ready (≥ 4.5:1); the build should pick one. Rows other than map #217 show a sample-data toast instead of a ticket.\n\nNot checked: real iOS/Android devices and real system notifications (the lock screen imitates iOS; Android not drawn), screen readers (VoiceOver/TalkBack output), large text and 200% zoom, landscape, safe areas, Windows high contrast, the T3 preview pane (its screenshots timed out in this session, so all visual checks used headless Chrome).',
            },
            {
              id: 'gaps',
              kind: 'note',
              name: 'Open questions (not decided here)',
              text: 'The brief doesn’t settle these; every option shows the same stand-in, so none of them is a choice yet.\n\n1. In-app count: the Maps bell shows unread needs-you only (amber), the same number as the app badge. The desktop’s Inbox count is all unread, in green.\n2. Back from a push: ticket detail sits on Maps. It could sit on the Inbox instead.\n3. Not paired, or OS notification permission denied: not drawn. Pairing is #224’s; permission isn’t in the brief.\n4. Whether an Inbox row says its push was skipped (desktop in use): not shown.\n5. Clear activity and Mark all read: left off the phone, because the brief gives no phone-side clear; read state is this phone’s own.\n6. Summary numbers: A keeps the desktop’s “5 need you” (all unresolved), while the badge counts 3 unread. C leads with the unread 3.',
            },
          ],
        },
      ],
    },
    {
      title: 'Dark',
      id: 'round-1-dark',
      round: 1,
      question: 'The same options pinned to dark, so both themes sit side by side.',
      sections: [
        {
          title: 'A · Desktop panel, dark',
          items: [
            { id: 'A-dark-inbox', name: 'A · Inbox', src: 'variants/mobile.html?theme=dark&v=C&remix=filter&acct=G&names=a&nt=A&screen=inbox', ...PHONE, note: 'A in dark: the amber is the desktop’s dark needs-you (#f6c453).' },
            { id: 'A-dark-push', name: 'A · Pushes', src: 'variants/mobile.html?theme=dark&v=C&remix=filter&acct=G&names=a&nt=A&screen=lock', ...PHONE, note: 'Dark lock screen.' },
            { id: 'A-dark-settings', name: 'A · Settings', src: 'variants/mobile.html?theme=dark&v=C&remix=filter&acct=G&names=a&nt=A&screen=notif', ...PHONE, note: 'A settings in dark.' },
          ],
        },
        {
          title: 'B · Grouped by day, dark',
          items: [
            { id: 'B-dark-inbox', name: 'B · Inbox', src: 'variants/mobile.html?theme=dark&v=C&remix=filter&acct=G&names=a&nt=B&screen=inbox', ...PHONE, note: 'B in dark.' },
            { id: 'B-dark-push', name: 'B · Pushes', src: 'variants/mobile.html?theme=dark&v=C&remix=filter&acct=G&names=a&nt=B&screen=lock', ...PHONE, note: 'Dark lock screen.' },
            { id: 'B-dark-settings', name: 'B · Settings', src: 'variants/mobile.html?theme=dark&v=C&remix=filter&acct=G&names=a&nt=B&screen=notif', ...PHONE, note: 'B settings in dark.' },
          ],
        },
        {
          title: 'C · Timeline, dark',
          items: [
            { id: 'C-dark-inbox', name: 'C · Inbox', src: 'variants/mobile.html?theme=dark&v=C&remix=filter&acct=G&names=a&nt=C&screen=inbox', ...PHONE, note: 'C in dark.' },
            { id: 'C-dark-push', name: 'C · Pushes', src: 'variants/mobile.html?theme=dark&v=C&remix=filter&acct=G&names=a&nt=C&screen=lock', ...PHONE, note: 'Dark lock screen.' },
            { id: 'C-dark-settings', name: 'C · Settings', src: 'variants/mobile.html?theme=dark&v=C&remix=filter&acct=G&names=a&nt=C&screen=notif', ...PHONE, note: 'C settings in dark.' },
          ],
        },
      ],
    },
    {
      title: 'D remix',
      id: 'round-2',
      round: 2,
      question: 'Does D, the combined remix of A, B and C, work as the phone’s pushes, Inbox and Notifications settings?',
      sections: [
        {
          title: 'D · Timeline remix',
          note: 'Not selected: D combines the Round 1 parts you named and waits for your review. C’s timeline and ticket-first pushes; A’s summary, All / Needs you pills and ticket rows in place of C’s count panel; B’s icons, blue unread dots and settings; dots centred on the line; one colour per alert type. Behaviour is the confirmed brief, the same as Round 1.',
          items: [
            {
              id: 'D',
              name: 'D · Timeline remix',
              src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=D&screen=inbox', ...PHONE,
              note: {
                idea: 'Inbox: A’s summary line (“5 need you · 2 new on your maps”) and A’s All / Needs you pills with the amber unread count sit where C’s amber count panel was. Below them, C’s timeline: clock times, a rail, day labels. Each node is B’s round kind icon, centred on the rail by construction (the rail and the node column share one set of widths). Needs-you alerts use A’s row on A’s card: kind line, ticket title, full map scope, a left bar; read rows fade the bar and the title. Activity stays plain text between them, as in C. B’s blue dot marks every unread row. Each alert type has its own colour on its icon, bar and kind line; the icon and the kind text still name the type. Ready to start is map activity, so its row takes that type’s teal; other activity stays grey.',
                pros: ['Keeps C’s timeline, which you called your favourite, without the count panel you called ugly', 'Type is readable three ways: icon, kind text, colour', 'Blue stays the unread dot’s only colour; no alert type uses blue', 'Rail and nodes stay aligned at 320, 390 and 430 px (measured)'],
                cons: ['Seven colours is a lot to learn; amber, orange and red are the closest trio', 'Orange, magenta, violet and teal are new colours the desktop doesn’t have yet', 'The time column, node and gaps take 96 px, so text wraps more on a 320 px phone than in A or B'],
                basedOn: ['A', 'B', 'C'],
              },
            },
            { id: 'D-push', name: 'D · Pushes on the lock screen', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=D&screen=lock', ...PHONE, note: { idea: 'C’s pushes unchanged: the ticket is the title, “T3 Code needs you · Map #217 …” the body. The OS draws pushes, so they carry no type colour. Tap one: ticket detail, Back to Maps.', basedOn: 'C-push' } },
            { id: 'D-needs', name: 'D · Needs you filter', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=D&screen=inbox&filter=needs', ...PHONE, note: { idea: 'Needs you hides map activity; only the needs-you rows stay on the rail.', basedOn: ['A-needs', 'C-needs'] } },
            { id: 'D-settings', name: 'D · Notifications settings', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=D&screen=notif', ...PHONE, note: { idea: 'B’s settings kept whole: the Push to this phone card, “Pushed to phones” with six switches, and a separate “Inbox only” group for Tickets become ready. Added: each type’s icon in its colour, so settings and Inbox match.', basedOn: 'B-settings' } },
            { id: 'D-pushoff', name: 'D · Push off', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=D&screen=notif&push=off', ...PHONE, note: { idea: 'B’s card goes grey and says alerts still reach the Inbox; the shared types stay editable.', basedOn: 'B-pushoff' } },
            { id: 'D-offline', name: 'D · Desktop unreachable', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=D&screen=inbox&desk=offline', ...PHONE, note: { idea: 'Cached history on the rail under #223’s cached banner. New alerts arrive once the desktop is back.', basedOn: ['A-offline', 'C-offline'] } },
            { id: 'D-offline-set', name: 'D · Settings, read-only', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=D&screen=notif&desk=offline', ...PHONE, note: { idea: 'Last synced values; all eight switches locked until the desktop is back.', basedOn: 'B-offline-set' } },
            { id: 'D-empty', name: 'D · Empty', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=D&screen=inbox&empty=1', ...PHONE, note: { idea: 'Nothing synced yet.', basedOn: ['A-empty', 'C-empty'] } },
            { id: 'D-ticket', name: 'D · After a tap · ticket detail', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=D&screen=inbox&tap=n1', ...PHONE, note: { idea: 'Same as Round 1: a tap marks the alert read on this phone and opens #223’s ticket detail; Back returns to the Inbox.', basedOn: 'S-ticket' } },
            { id: 'D-320', name: 'D · Inbox at 320 px', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=D&screen=inbox', width: 320, height: 844, boardWidth: 246, note: { idea: 'The narrowest phone: rows wrap, the rail stays centred on the icons, nothing overflows.', basedOn: 'C' } },
            { id: 'D-colors', name: 'D · Type colours (reference)', src: 'variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=D&screen=colors', ...PHONE, note: { idea: 'A design reference, not an app screen: the seven type colours with icons, and each kind colour’s contrast on the card, measured live in the current theme. One palette for D, explored from your “different colors for each type” note; not a pick.', basedOn: 'C' } },
          ],
        },
        {
          title: 'D · Dark',
          note: 'The same frames pinned to dark.',
          items: [
            { id: 'D-dark-inbox', name: 'D · Inbox', src: 'variants/mobile.html?theme=dark&v=C&remix=filter&acct=G&names=a&nt=D&screen=inbox', ...PHONE, note: { idea: 'D in dark: the new type colours switch to lighter dark-theme values.', basedOn: ['A-dark-inbox', 'B-dark-inbox', 'C-dark-inbox'] } },
            { id: 'D-dark-push', name: 'D · Pushes', src: 'variants/mobile.html?theme=dark&v=C&remix=filter&acct=G&names=a&nt=D&screen=lock', ...PHONE, note: { idea: 'Dark lock screen, C’s pushes.', basedOn: 'C-dark-push' } },
            { id: 'D-dark-settings', name: 'D · Settings', src: 'variants/mobile.html?theme=dark&v=C&remix=filter&acct=G&names=a&nt=D&screen=notif', ...PHONE, note: { idea: 'B’s settings in dark with type icons.', basedOn: 'B-dark-settings' } },
            { id: 'D-dark-colors', name: 'D · Type colours', src: 'variants/mobile.html?theme=dark&v=C&remix=filter&acct=G&names=a&nt=D&screen=colors', ...PHONE, note: { idea: 'The palette’s dark values with live contrast.', basedOn: 'C' } },
          ],
        },
        {
          title: 'Round 2 review',
          items: [
            {
              id: 'review-2',
              kind: 'note',
              name: 'Design review',
              text: 'Round 2 source: Wayfinder canvas notes on #225 (issuecomment-6389446089, Round 1 @ 6799739) and the confirmed summary: combine A, B and C into D (C’s timeline and ticket-first pushes; A’s ticket styling, summary and All / Needs you pills replacing C’s amber count panel; B’s icons, blue unread dots and grouped settings; dots centred on the line; distinct accessible colours by type). D is not selected. Code sources as in Round 1 (src/ui/styles.css tokens, src/notificationTypes.ts, notifications.ts, settings.ts, unifiedInbox.ts, mapEventInbox.ts); D reuses A’s, B’s and C’s classes and adds .nt-d-* plus seven --nt-t-* type colours in variants/notify.css. Four of those (orange, magenta, violet, teal) are new prototype values, not desktop tokens.\n\nChecked headless (Playwright, installed Chrome; the T3 preview opened but its snapshot timed out after 15000 ms again), every D state at 390×844 in light and dark, screenshots looked at: no page errors (one 404 on the first load, the same as Round 1’s baseline run). Text contrast scripted on every text node: all ≥ 4.5:1 except the inherited avatar initial below. Type kind colours on the card: light 5.7–6.7:1, dark 7.4–10.7:1. Type icons on their tinted circles: light ≥ 4.3:1, dark ≥ 5.9:1 (3:1 needed). Colour is never the only cue: every type also has its own icon and kind text. Timeline: rail centre to node centre measured 0 px off for every node at 320, 360, 390 and 430 px, in All, Needs you and offline. No horizontal overflow at those widths in Inbox, Needs you, offline Inbox, Notifications, read-only settings, lock screen, Maps or Type colours. Touch targets ≥ 44 px for everything D adds.\n\nInteraction, scripted for D: Maps bell (“Inbox, 3 need you”) opens Inbox; tapping #223 opens ticket detail with Back to Inbox; Escape returns, the row reads as read, the bell drops to 2. Keyboard: a row takes a 2 px focus ring; Enter on #228 opens it; back in the Inbox the Needs you pill goes 3 → 2 and blue dots 5 → 4. Needs you filter: aria-pressed, focus kept, 5 rows and no activity. A push opens ticket detail with Back to Maps. Settings › Notifications: Space toggles Push to this phone and keeps focus; Tab moves to the next switch; tapping a label toggles it; switches are role=switch named by their row. Offline: 8 of 8 switches disabled under the banner. Home badge reads 3 and opens Maps. Round 1: all 68 A–C screenshots re-captured after this change are byte-identical to before it.\n\nFindings: inherited, not changed here: #316’s avatar initial 4.42:1 light, 3.64:1 dark; #223’s search field 25 px tall and ticket tabs 40 px tall. New in D: amber, orange and red are the closest trio of type colours; the four new colours need desktop tokens before a build.\n\nNot checked: real iOS/Android devices and real system notifications (the lock screen imitates iOS; Android not drawn), screen readers (VoiceOver/TalkBack output), colour-blindness simulation of the seven type colours, large text and 200% zoom, landscape, safe areas, Windows high contrast, and the T3 preview pane (snapshot timeout).',
            },
            {
              id: 'gaps-2',
              kind: 'note',
              name: 'Open questions (not decided here)',
              text: 'Still open from Round 1; D shows the same stand-ins, so none of them is a choice yet.\n\n1. In-app count: the Maps bell shows unread needs-you only (amber), the same number as the app badge. The desktop’s Inbox count is all unread, in green.\n2. Back from a push: ticket detail sits on Maps. It could sit on the Inbox instead.\n3. Not paired, or OS notification permission denied: not drawn. Pairing is #224’s; permission isn’t in the brief.\n4. Whether an Inbox row says its push was skipped (desktop in use): not shown.\n5. Clear activity and Mark all read: left off the phone, because the brief gives no phone-side clear; read state is this phone’s own.\n6. Summary numbers: D keeps A’s “5 need you” (all unresolved), while the badge and pill count 3 unread.\n\nNew with D:\n7. The four new type colours (orange, magenta, violet, teal) are prototype values, not desktop tokens. Adopting them means adding tokens on the desktop too, or mapping types to fewer colours.\n\nPreview placeholders, not designs: the lock and home screens imitate iOS; rows outside map #217 show a sample-data toast instead of a ticket; the Type colours frame is a reference sheet, not an app screen.',
            },
          ],
        },
      ],
    },

  ],
};
