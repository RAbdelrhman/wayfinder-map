/*
  Wayfinder's canvas for ticket #196: one topbar inbox for needs-you alerts and map activity.
  Paths are relative to index.html. Check with: node prototypes/canvas/tools/check.mjs
*/

const FRAME = { width: 1280, height: 760 };
const NARROW = { width: 390, height: 760 };

window.CANVAS = {
  ticket: 196,
  title: 'One topbar inbox',
  question:
    'The map topbar has two controls for one job: the bell (needs-you alerts, #128) and the Inbox (map activity and "while you were away", #167). #124 decided on one topbar inbox. What should that one control look like, and how do needs-you alerts and plain map activity sit inside it?',
  sampleState:
    'Fake map #300 "Offline drafts", plus map #121. 4 things need you: a T3 Code thread waiting (#214), failing CI (#210), a PR ready for review (#204) and a prototype ready (#196). 7 map changes are new, 3 of them from while you were away. Click the topbar control to open or close it; click a row to mark it read; Clear empties map activity. Needs-you rows never clear by hand: they leave once handled (#124 point 6).',

  base: {
    stylesheets: ['../../src/ui/styles.css', 'variants/inbox.css'],
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
      round: 'Baseline',
      sections: [
        {
          title: 'Today',
          note: 'What ships now, for comparison. Not an option: #124 already chose one control.',
          items: [
            {
              id: 'T',
              name: 'Today: bell + Inbox',
              src: 'variants/inbox.html?v=today',
              ...FRAME,
              note: {
                idea: 'Two controls side by side. The bell (icon only, blue count) lists needs-you alerts plus "Ready to start". The Inbox (icon, label, green count) lists every map change. Some events (a PR ready for review, failing CI) land in both.',
                pros: ['Already built and tested'],
                cons: [
                  'Two counts for one job; the same event can show twice',
                  'Two panels, opened separately',
                  'The bell panel uses three CSS tokens that do not exist (--surface-0, --hairline-strong, --shadow-float), so it draws with no background or shadow',
                ],
              },
            },
          ],
        },
        {
          title: 'Fold one into the other',
          note: 'Keep one of today\'s two controls and move the other\'s items into it.',
          items: [
            {
              id: 'A',
              name: 'Inbox takes the bell in',
              src: 'variants/inbox.html?v=A',
              ...FRAME,
              note: {
                idea: 'The Inbox button stays (icon + "Inbox" label); the bell goes. Its count is the needs-you count in amber. With nothing needing you, a grey count shows new activity. One panel: a "Needs you" section pinned on top, then "Map activity" with its own Clear.',
                pros: [
                  'Smallest change: the control people already open, plus one section',
                  'Amber reuses the hand-off "needs you" colour, so it means the same thing everywhere',
                  'Needs you can never scroll away under activity',
                ],
                cons: [
                  'The label costs about 90 px of topbar width',
                  'With many needs-you items, activity is pushed far down',
                ],
              },
            },
            {
              id: 'B',
              name: 'Bell takes the Inbox in',
              src: 'variants/inbox.html?v=B',
              ...FRAME,
              note: {
                idea: 'The bell stays (icon only); the Inbox button goes. Amber count for needs-you; a small green dot when only activity is new. Same two-section panel as A, titled "Notifications".',
                pros: [
                  'Narrowest topbar: 34 px instead of about 120 px',
                  'A bell is the common pattern for "something wants you"',
                ],
                cons: [
                  'Icon only: "while you were away" history hides behind a symbol that says "alerts"',
                  'A dot for activity is easy to miss',
                ],
                disposition: 'combine',
                feedback: 'User (3 Oct 2026): "ok could we do D with the Bell for mobile size. Keep it called inbox change Icon." Read as: the one timeline from D, with the bell icon from B replacing the inbox icon; still labelled Inbox; bell + count only at phone width. Built as Round 2, D+B.',
              },
            },
          ],
        },
        {
          title: 'One new control',
          note: 'Same "Inbox" button as A in every case. What changes is how the panel sorts the two kinds and what the count means.',
          items: [
            {
              id: 'C',
              name: 'Two tabs',
              src: 'variants/inbox.html?v=C',
              ...FRAME,
              note: {
                idea: 'One panel with two tabs, "Needs you 4" and "Activity 7". It opens on Needs you, or on Activity when nothing needs you. Clear sits only on Activity. Arrow keys switch tabs.',
                pros: [
                  'Each kind gets the full panel height',
                  'Each tab carries its own count',
                ],
                cons: [
                  'One extra click to see activity',
                  'Hides one list at a time, so you never see the whole picture at once',
                ],
              },
            },
            {
              id: 'D',
              name: 'One timeline',
              src: 'variants/inbox.html?v=D',
              ...FRAME,
              note: {
                idea: 'Everything in one list, newest first. Needs-you rows have an amber bar and kind line; activity rows look like today\'s Inbox. An "All / Needs you" chip filters. The count is everything unread, in today\'s green. "Clear activity" leaves needs-you rows in place.',
                pros: [
                  'Shows what happened in order: CI failed, then the PR was reviewed',
                  'Simplest model: one list, one count',
                ],
                cons: [
                  'Needs-you items sink below newer activity unless you filter',
                  'The count no longer says whether anything needs you',
                ],
                disposition: 'combine',
                feedback: 'User (3 Oct 2026): "ok could we do D with the Bell for mobile size. Keep it called inbox change Icon." Read as: the one timeline from D, with the bell icon from B replacing the inbox icon; still labelled Inbox; bell + count only at phone width. Built as Round 2, D+B.',
              },
            },
            {
              id: 'E',
              name: 'Needs you first',
              src: 'variants/inbox.html?v=E',
              ...FRAME,
              note: {
                idea: 'The panel is a "Needs you" list. Map activity is one row at the bottom ("Map activity · 7 new ›") that swaps the panel to the activity list, with a back row. The count is needs-you only; activity never adds to it.',
                pros: [
                  'The count only moves when you are actually needed',
                  'Activity is still one click away, never gone',
                ],
                cons: [
                  'New activity has no signal on the button at all',
                  'Two levels inside one popover',
                ],
              },
            },
            {
              id: 'F',
              name: 'By map',
              src: 'variants/inbox.html?v=F',
              ...FRAME,
              note: {
                idea: 'One list grouped by map. Each map has a sticky header ("Map #300 Offline drafts · 3 need you · 5 new"), its needs-you rows first, then its activity. The button shows two counts: amber needs-you and grey "7 new".',
                pros: [
                  'Fits the watcher covering every open map (#124 point 5)',
                  'Both counts visible without opening',
                ],
                cons: [
                  'Widest button',
                  'A needs-you item on a second map sits below the first map\'s activity',
                ],
              },
            },
          ],
        },
        {
          title: 'The button in every state',
          items: [
            {
              id: 'S',
              name: 'Triggers side by side',
              src: 'variants/inbox.html?sheet=1',
              width: 1280,
              height: 700,
              note: {
                idea: 'Every option\'s topbar control with nothing new, activity only, needs-you plus activity, and keyboard focus.',
                pros: ['Compare the closed state, which is what you see most of the time'],
                cons: ['Static: open each option above to try it'],
              },
            },
          ],
        },
        {
          title: 'Narrow (390 px)',
          note: 'The label and "Synced" text drop; the panel spans the width.',
          items: ['T', 'A', 'B', 'C', 'D', 'E', 'F'].map((v) => ({
            id: `${v}-narrow`,
            name: `${v === 'T' ? 'Today' : v} at 390 px`,
            src: `variants/inbox.html?v=${v === 'T' ? 'today' : v}`,
            ...NARROW,
            boardWidth: 300,
            note: `Option ${v === 'T' ? 'Today' : v} on a phone-width page.`,
          })),
        },
        {
          title: 'Review',
          items: [
            {
              id: 'R',
              kind: 'note',
              name: 'Design review',
              text:
                'Sources: src/ui/styles.css (tokens; .map-inbox-*, .notification-*, .topbar, .synced, .handoff-close), src/ui/index.html topbar, src/ui/mapEventInbox.ts (activity row markup and summaries), src/ui/notifications.ts (KIND_LABEL, bell rows), src/ui/icons.ts.\n\n' +
                'Checked: light and dark; empty, activity-only and full states; open/closed; hover; keyboard (Tab, Esc returns focus to the button, arrow keys on C\'s tabs); aria-expanded, dialog labels, button names carrying counts ("Inbox, 4 need you, 7 new"); 390 px width.\n\n' +
                'Findings: (1) Today\'s bell panel uses --surface-0, --hairline-strong and --shadow-float, which styles.css never defines, so it renders transparent with no shadow. Any option that keeps the bell\'s styles must fix this. (2) The amber needs-you count uses --handoff-needs-you on --surface-1: 6.7:1 light (#7a5200 on #fcfcfb) and 10.7:1 dark (#f6c453 on #1a1a19). (3) Today\'s green Inbox count (--state-frontier #0ca30c with --surface-1 text) is 3.3:1 in light (5.2:1 dark), short of 4.5:1 for 11 px text. D keeps it; the other options use amber or grey. (4) "Ready to start" (unblocked) is in today\'s bell but is not a needs-you event in #124 point 6; the options treat it as activity.\n\n' +
                'Not checked: screen-reader output in NVDA/VoiceOver; Windows high-contrast mode; desktop tray badge and OS notifications (out of scope here); 200% zoom.',
            },
          ],
        },
      ],
    },
    {
      title: 'Round 2: timeline with the bell',
      round: 2,
      question: 'The one timeline from D, with the bell icon, still called Inbox. Does this combination work?',
      sections: [
        {
          title: 'D + B',
          note: 'Desktop shows the bell icon and the Inbox label. At phone width the label goes and only the bell and its count stay.',
          items: [
            {
              id: 'DB',
              name: 'Timeline, bell icon, called Inbox',
              src: 'variants/inbox.html?v=D2',
              ...FRAME,
              note: {
                idea: 'The panel from D, unchanged: one list newest first, needs-you rows with an amber bar and kind line, an "All / Needs you" filter, and "Clear activity" that leaves needs-you rows in place. The button takes the bell icon from B in place of the inbox tray, but keeps the "Inbox" label and the single count of everything unread from D.',
                pros: [
                  'One control, one list, one count',
                  'The bell says "something wants you"; the label says it also holds history',
                  'At phone width it is as narrow as B (bell + count)',
                ],
                cons: [
                  'The count still mixes needs-you and activity, as in D',
                  'Keeps the green count used today,3.3:1 in light (short of 4.5:1 for 11 px text)',
                ],
                basedOn: ['D', 'B'],
              },
            },
            {
              id: 'DB-narrow',
              name: 'D + B at 390 px',
              src: 'variants/inbox.html?v=D2',
              ...NARROW,
              boardWidth: 300,
              note: { idea: 'Phone width: bell + count only, the panel spans the screen.', pros: ['As narrow as B'], cons: ['No label at this width'], basedOn: ['D', 'B'] },
            },
            {
              id: 'DB-closed',
              name: 'D + B closed, needs you filter',
              src: 'variants/inbox.html?v=D2&open=0',
              width: 1280,
              height: 200,
              note: { idea: 'The topbar with the panel closed, as you see it most of the time.', pros: ['Bell + "Inbox" + one count'], cons: ['Same width as A'], basedOn: ['D', 'B'] },
            },
          ],
        },
      ],
    },
  ],
};
