/*
  Round 2 data for #347: eight real prototype tickets, one per kind of choice, read on 27 Oct 2026 from
  each ticket's prototype branch (config.js pages, rounds, note.basedOn, note.disposition, note.feedback)
  and its closing comment. Pictures are captures of those exact items (tools/capture-shots.mjs).

  The tickets come from five maps (#205, #217, #121, #35); a real board shows one map. They are gathered
  here only to test every card type on one screen.

  Item keys are the canvas's own links: <page id>/<item id>. `disp` is the recorded disposition
  (keep, change, combine), 'not' when the canvas records "Not chosen" in the feedback text, and absent
  when nothing was recorded. `from` lists the keys an item was built from (note.basedOn).
*/
(function () {
  const item = (page, id, name, shot, extra) => ({ key: `${page}/${id}`, page, id, name, shot, ...extra });

  window.BOARD2 = {
    cards: [
      {
        ticket: 225, map: 217, date: 'Oct 25', state: 'decided', kind: 'One remix chosen', lettersRepeatAcrossPages: true,
        title: 'Prototype mobile notifications: inbox, alert types, settings',
        canvas: 'prototypes/225-…-settings/index.html',
        rounds: [
          { round: 1, pages: [
            { page: 'round-1', title: 'Options', items: [
              item('round-1', 'A', 'Desktop panel', '225-A', { phone: true, disp: 'combine' }),
              item('round-1', 'B', 'Grouped by day', '225-B', { phone: true, disp: 'combine' }),
              item('round-1', 'C', 'Timeline', '225-C', { phone: true, disp: 'combine' }),
            ] },
            { page: 'round-1-dark', title: 'Dark', items: [
              item('round-1-dark', 'A-dark-inbox', 'A · Inbox', '225-A-dark-inbox', { phone: true }),
              item('round-1-dark', 'B-dark-inbox', 'B · Inbox', '225-B-dark-inbox', { phone: true }),
              item('round-1-dark', 'C-dark-inbox', 'C · Inbox', '225-C-dark-inbox', { phone: true }),
            ] },
          ] },
          { round: 2, pages: [
            { page: 'round-2', title: 'D remix', items: [
              item('round-2', 'D', 'Timeline remix', '225-D', { phone: true, disp: 'keep', from: ['round-1/A', 'round-1/B', 'round-1/C'] }),
            ] },
          ] },
        ],
        picks: [{ key: 'round-2/D' }],
        why: 'C’s timeline with A’s pills and B’s icons and blue dots; the redundant summary line removed.',
        also: [
          item('round-2', 'D-push', 'Pushes', '225-D-push', { phone: true, round: 2 }),
          item('round-2', 'D-settings', 'Settings', '225-D-settings', { phone: true, round: 2 }),
        ],
        alsoCount: 14,
        repeats: 'D is also an item ID in #292 (Round 3), #314 (Round 2) and #210 on this branch.',
      },
      {
        ticket: 316, map: 217, date: 'Oct 22', state: 'decided', kind: 'Chosen, plus a piece kept two rounds earlier',
        title: 'Prototype the account control: who is signed in, and sign out',
        canvas: 'prototypes/316-…-sign-out/index.html',
        rounds: [
          { round: 1, pages: [
            { page: 'options', title: 'Options', items: [
              item('options', 'A', 'Sheet open', '316-A', { phone: true, disp: 'change' }),
              item('options', 'B-confirm', 'Confirm alert', '316-B-confirm', { phone: true, disp: 'keep' }),
              item('options', 'C', 'Account screen', '316-C', { phone: true, disp: 'combine' }),
              item('options', 'D', 'Settings, Account on top', '316-D', { phone: true, disp: 'combine' }),
            ] },
          ] },
          { round: 2, pages: [
            { page: 'round-2-settings-page', title: 'Settings page', items: [
              item('round-2-settings-page', 'E', 'Settings, account only', '316-E', { phone: true, from: ['options/A', 'options/B-confirm', 'options/C', 'options/D'] }),
              item('round-2-settings-page', 'F', 'Settings, with app rows', '316-F', { phone: true, disp: 'change', from: ['options/A', 'options/B-confirm', 'options/C', 'options/D'] }),
            ] },
          ] },
          { round: 3, pages: [
            { page: 'round-3-section-names', title: 'Section names', items: [
              item('round-3-section-names', 'G-a', 'Account / Preferences', '316-G-a', { phone: true, disp: 'keep', from: ['round-2-settings-page/F'] }),
              item('round-3-section-names', 'G-b', 'No section names', '316-G-b', { phone: true, from: ['round-2-settings-page/F'] }),
              item('round-3-section-names', 'G-c', 'Account / Notifications and desktop', '316-G-c', { phone: true, from: ['round-2-settings-page/F'] }),
            ] },
          ] },
        ],
        picks: [{ key: 'round-3-section-names/G-a' }],
        why: '“G-a is my choice.” Settings opens from the Maps avatar, with Account and Preferences sections; signing out uses Round 1’s confirm alert.',
        also: [
          item('round-3-section-names', 'G-confirm', 'Sign-out confirm', '316-G-confirm', { phone: true, round: 3, from: ['options/B-confirm', 'round-3-section-names/G-a'] }),
          item('options', 'B-confirm', 'Kept in Round 1', '316-B-confirm', { phone: true, round: 1 }),
        ],
        alsoCount: 2,
        repeats: 'A, C and D are also Round 1 letters on #225 and #314; B has no picture here because only its confirm state was kept.',
      },
      {
        ticket: 314, map: 205, date: 'Oct 16', state: 'decided', kind: 'Chosen over a sibling',
        title: 'Prototype an in-viewer confirmation after posting canvas feedback to GitHub',
        canvas: 'prototypes/314-…-feedbac/index.html',
        rounds: [
          { round: 'Baseline', pages: [
            { page: 'directions', title: 'Directions', items: [
              item('directions', 'A', 'Receipt in the panel', '314-A', { disp: 'combine' }),
              item('directions', 'B', 'Bar over the canvas', '314-B', { disp: 'combine' }),
              item('directions', 'C', 'Toolbar chip and popover', '314-C', { disp: 'not' }),
            ] },
          ] },
          { round: 2, pages: [
            { page: 'round-2', title: 'B with Copy message', items: [
              item('round-2', 'D', 'Copy and open (B + A)', '314-D', { disp: 'not', from: ['directions/B', 'directions/A'] }),
              item('round-2', 'E', 'Send to thread (B + A)', '314-E', { disp: 'keep', from: ['directions/B', 'directions/A'] }),
            ] },
          ] },
        ],
        picks: [{ key: 'round-2/E' }],
        why: '“I like E.” B’s bar with one Send to T3 Code button; Copy message stays as the fallback.',
        also: [],
        alsoCount: 0,
        repeats: 'D here is not #225’s D: same letter, same page id (round-2), different canvas.',
      },
      {
        ticket: 223, map: 217, date: 'Oct 5', state: 'decided', kind: 'One pick per question',
        title: 'Prototype the following screens: sign-in, repos, map view, ticket detail',
        canvas: 'prototypes/canvas/index.html (shared legacy canvas)',
        questions: ['Sign-in', 'Repos and maps', 'Map view', 'Ticket detail'],
        rounds: [
          { round: 1, pages: [
            { page: 'directions', title: 'Directions', items: [
              item('directions', 'S-A', 'Button, then code', '223-S-A', { phone: true, q: 'Sign-in', disp: 'keep' }),
              item('directions', 'S-B', 'Welcome, then steps', '223-S-B', { phone: true, q: 'Sign-in' }),
              item('directions', 'S-C', 'Code on the first screen', '223-S-C', { phone: true, q: 'Sign-in' }),
              item('directions', 'R-A', 'Repos, then maps', '223-R-A', { phone: true, q: 'Repos and maps' }),
              item('directions', 'R-B', 'Following', '223-R-B', { phone: true, q: 'Repos and maps' }),
              item('directions', 'R-C', 'All maps, one list', '223-R-C', { phone: true, q: 'Repos and maps' }),
              item('directions', 'M-A', 'Grouped by state', '223-M-A', { phone: true, q: 'Map view' }),
              item('directions', 'M-B', 'Graph, like the desktop', '223-M-B', { phone: true, q: 'Map view' }),
              item('directions', 'M-C', 'Path, Tickets, Brief', '223-M-C', { phone: true, q: 'Map view', disp: 'keep' }),
              item('directions', 'T-A', 'Full page', '223-T-A', { phone: true, q: 'Ticket detail' }),
              item('directions', 'T-B', 'Sheet over the map', '223-T-B', { phone: true, q: 'Ticket detail' }),
              item('directions', 'T-C', 'Tabs: Overview, Links, Activity', '223-T-C', { phone: true, q: 'Ticket detail', disp: 'keep' }),
            ] },
          ] },
          { round: 2, pages: [
            { page: 'repos-and-maps-round-2', title: 'Repos and maps, round 2', items: [
              item('repos-and-maps-round-2', 'R-C2', 'All maps, Filter by', '223-R-C2', { phone: true, q: 'Repos and maps', disp: 'keep', from: ['directions/R-C', 'directions/R-A'] }),
            ] },
          ] },
        ],
        picks: [
          { key: 'directions/S-A', q: 'Sign-in' },
          { key: 'repos-and-maps-round-2/R-C2', q: 'Repos and maps' },
          { key: 'directions/M-C', q: 'Map view' },
          { key: 'directions/T-C', q: 'Ticket detail' },
        ],
        why: 'Four screens, four separate choices: three in Round 1, Repos and maps after a second round.',
        also: [],
        alsoCount: 0,
        repeats: 'Shared legacy canvas: other tickets’ A, B and C live beside these on prototypes/canvas.',
      },
      {
        ticket: 163, map: 121, date: 'Sep 30', state: 'decided', kind: 'Chosen after five rounds',
        title: 'Where do Start next, Auto and the auto-map toggle go on the map?',
        canvas: 'prototypes/canvas/index.html (shared legacy canvas)',
        rounds: [
          { round: 'Baseline', pages: [{ page: 'directions', title: 'Directions', items: [
            item('directions', 'A', 'Topbar button, confirm dialog', '163-A', { disp: 'keep' }),
            item('directions', 'B', 'A Next tab in the panel', '163-B'),
            item('directions', 'C', 'Pick on the map, a dock to start', '163-C', { disp: 'combine' }),
          ] }] },
          { round: 2, pages: [{ page: 'a-c-the-pick', title: 'A + C: the pick', items: [
            item('a-c-the-pick', 'AC', 'Confirm list, Auto and auto map on', '163-AC', { disp: 'change', from: ['directions/A', 'directions/C'] }),
          ] }] },
          { round: 3, pages: [{ page: 'start-next-and-the-auto-map-apart', title: 'Start next and the auto map, apart', items: [
            item('start-next-and-the-auto-map-apart', 'AM-setup', 'Turning the auto map on', '163-AM-setup', { disp: 'keep', from: ['a-c-the-pick/AC'] }),
          ] }] },
          { round: 4, pages: [{ page: 'everything-in-the-map-menu', title: 'Everything in the map menu', items: [
            item('everything-in-the-map-menu', 'M', 'The map menu', '163-M', { disp: 'change', from: ['start-next-and-the-auto-map-apart/AM-setup'] }),
          ] }] },
          { round: 5, pages: [{ page: 'one-tier-choice-auto-by-default', title: 'One tier choice, Auto by default', items: [
            item('one-tier-choice-auto-by-default', 'F', 'One tier choice per ticket', '163-F', { disp: 'keep', from: ['everything-in-the-map-menu/M'] }),
          ] }] },
        ],
        picks: [{ key: 'one-tier-choice-auto-by-default/F' }],
        why: 'One tier choice per ticket, Auto by default; Start next and the auto-map toggle live in the map menu.',
        also: [
          item('one-tier-choice-auto-by-default', 'F-setup', 'Auto map setup', '163-F-setup', { round: 5 }),
          item('everything-in-the-map-menu', 'M-running', 'Running', '163-M-running', { round: 4 }),
        ],
        alsoCount: 2,
        repeats: 'Shared legacy canvas: other tickets’ A, B and C live beside these.',
      },
      {
        ticket: 44, map: 35, date: 'Sep 22', state: 'unrecorded', kind: 'Closed, no pick recorded',
        title: 'What should starting a new map feel like?',
        canvas: 'prototypes/canvas/index.html (shared legacy canvas)',
        rounds: [
          { round: null, pages: [
            { page: 'flows', title: 'Flows', items: [
              item('flows', 'A', 'One page, map first', '44-A'),
              item('flows', 'B', 'Stepped', '44-B'),
              item('flows', 'C', 'From the + button', '44-C'),
              item('flows', 'R', 'From a repository page', '44-R'),
              item('flows', 'P', 'After Start: the map being planned', '44-P'),
            ] },
            { page: 'shared-pieces', title: 'Shared pieces', items: [
              item('shared-pieces', 'K', 'Clone states', null),
              item('shared-pieces', 'H', 'Hand-off', null),
            ] },
          ] },
        ],
        picks: [],
        why: 'Closed on Sep 22. No item has a Keep, Change or Combine, and the closing comment lists follow-ups (#68, #69) without naming a pick.',
        also: [],
        alsoCount: 0,
        repeats: 'Shared legacy canvas: other tickets’ A, B and C live beside these.',
      },
      {
        ticket: 347, map: 205, date: 'Oct 27', state: 'waiting', kind: 'Waiting on your pick, two rounds',
        title: 'Prototype how the Prototypes board shows the chosen canvas item across pages and rounds',
        canvas: 'prototypes/347-…-canvas-it/index.html',
        rounds: [
          { round: 1, pages: [{ page: 'round-1', title: 'Options', items: [
            item('round-1', 'A', 'Chosen first', '347-A'),
            item('round-1', 'B', 'Round rail', '347-B'),
            item('round-1', 'C', 'One round at a time', '347-C'),
            item('round-1', 'D', 'Decision line', '347-D'),
          ] }] },
          { round: 2, pages: [{ page: 'round-2', title: 'More choice types', items: [
            item('round-2', 'A2', 'Chosen first, more cases', '347-A2', { from: ['round-1/A'] }),
            item('round-2', 'B2', 'Round rail, more cases', '347-B2', { from: ['round-1/B'] }),
            item('round-2', 'C2', 'One round at a time, more cases', '347-C2', { from: ['round-1/C'] }),
            item('round-2', 'D2', 'Decision line, more cases', '347-D2', { from: ['round-1/D'] }),
          ] }] },
        ],
        picks: [],
        why: 'Two rounds posted; nothing kept yet.',
        also: [],
        alsoCount: 0,
      },
      {
        ticket: 224, map: 217, date: 'Oct 27', state: 'building', kind: 'Being built',
        title: 'Prototype starting a ticket and watching its session',
        canvas: 'prototypes/224-…-session/index.html',
        rounds: [
          { round: 1, pages: [{ page: 'overview', title: 'Overview', items: [
            item('overview', 'A', 'On the ticket', '224-A', { phone: true }),
            item('overview', 'B', 'Session page', '224-B', { phone: true }),
            item('overview', 'C', 'Desktop on Maps', '224-C', { phone: true }),
          ] }] },
        ],
        picks: [],
        why: 'Round 1 is on the branch; no review comment yet.',
        also: [],
        alsoCount: 0,
      },
    ],
  };
})();
