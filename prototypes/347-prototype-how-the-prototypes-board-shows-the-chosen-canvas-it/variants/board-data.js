/*
  Real data for #347's options, read on 27 Oct 2026 from the prototype branches' config.js files and
  the tickets' closing comments. Pictures are headless-Chrome captures of those exact items (assets/shots).
  `ref` is how the canvas itself links an item: index.html#<page id>/<item id>.
*/
window.BOARD = {
  map: { number: 205, title: 'A polished, smooth canvas built into Wayfinder' },
  cards: [
    {
      ticket: 225,
      title: 'Prototype mobile notifications: inbox, alert types, settings',
      state: 'decided',
      date: 'Oct 25',
      canvas: 'prototypes/225-…-settings/index.html',
      // What today's board prints for this ticket (verdictGist of the closing comment).
      todayGist: 'Completed through PR #345. Chosen design and confirmed behavior:',
      // Today's guess from the closing text: every letter it mentions.
      todayPicked: ['A', 'B', 'C', 'D'],
      chosen: {
        id: 'D', name: 'Timeline remix', page: 'round-2', pageTitle: 'D remix', round: 2, ref: 'round-2/D',
        shot: '225-D', phone: true,
        why: 'C’s timeline with A’s pills and B’s icons and blue dots; the redundant summary line removed. No Round 3.',
        basedOn: ['A', 'B', 'C'],
        also: [
          { id: 'D-push', name: 'Pushes', shot: '225-D-push', ref: 'round-2/D-push' },
          { id: 'D-settings', name: 'Settings', shot: '225-D-settings', ref: 'round-2/D-settings' },
        ],
        alsoCount: 16,
      },
      rounds: [
        {
          round: 1, page: 'round-1', pageTitle: 'Options', items: [
            { id: 'A', name: 'Desktop panel', shot: '225-A', phone: true, disposition: 'combine', into: 'D', ref: 'round-1/A' },
            { id: 'B', name: 'Grouped by day', shot: '225-B', phone: true, disposition: 'combine', into: 'D', ref: 'round-1/B' },
            { id: 'C', name: 'Timeline', shot: '225-C', phone: true, disposition: 'combine', into: 'D', ref: 'round-1/C' },
          ],
          // Same letters on a second page of the same round.
          alsoPages: [{ page: 'round-1-dark', pageTitle: 'Dark', ids: ['A', 'B', 'C'] }],
        },
        { round: 2, page: 'round-2', pageTitle: 'D remix', items: [
          { id: 'D', name: 'Timeline remix', shot: '225-D', phone: true, disposition: 'keep', chosen: true, ref: 'round-2/D' },
        ] },
      ],
      // Other canvases on the same branch that also have a D (the #225 branch carries main's boards).
      sameIdElsewhere: ['#292 D, Round 3', '#210 D4', '#314 D'],
    },
    {
      ticket: 163,
      title: 'Where do Start next, Auto and the auto-map toggle go on the map?',
      state: 'decided',
      date: 'Sep 30',
      canvas: 'prototypes/canvas/index.html',
      todayGist: 'Decided with the user on 29–30 Sep 2026, over five rounds on the canvas.',
      todayPicked: ['A'],
      chosen: {
        id: 'F', name: 'Start next: one tier choice per ticket', page: 'one-tier-choice-auto-by-default',
        pageTitle: 'One tier choice, Auto by default', round: 5, ref: 'one-tier-choice-auto-by-default/F',
        shot: '163-F',
        why: 'One tier choice per ticket, Auto by default; Start next and the auto-map toggle live in the map menu.',
        basedOn: ['M'],
        also: [
          { id: 'F-setup', name: 'Auto map setup', shot: '163-F-setup', ref: 'one-tier-choice-auto-by-default/F-setup' },
          { id: 'M-running', name: 'Running, Round 4', shot: '163-M', ref: 'everything-in-the-map-menu/M-running' },
        ],
        alsoCount: 2,
      },
      rounds: [
        { round: 'Baseline', page: 'directions', pageTitle: 'Directions', items: [
          { id: 'A', name: 'Topbar button, confirm dialog', shot: '163-A', disposition: 'keep', into: 'AC', ref: 'directions/A' },
          { id: 'B', name: 'A Next tab in the panel', shot: '163-B', disposition: null, ref: 'directions/B' },
          { id: 'C', name: 'Pick on the map, a dock to start', shot: '163-C', disposition: 'combine', into: 'AC', ref: 'directions/C' },
        ] },
        { round: 2, page: 'a-c-the-pick', pageTitle: 'A + C: the pick', items: [
          { id: 'AC', name: 'Confirm list, Auto and auto map on', shot: '163-AC', disposition: 'change', into: 'AM-setup', ref: 'a-c-the-pick/AC' },
        ] },
        { round: 3, page: 'start-next-and-the-auto-map-apart', pageTitle: 'Start next and the auto map, apart', items: [
          { id: 'AM-setup', name: 'Turning the auto map on', shot: '163-AM-setup', disposition: 'keep', into: 'M', ref: 'start-next-and-the-auto-map-apart/AM-setup' },
        ] },
        { round: 4, page: 'everything-in-the-map-menu', pageTitle: 'Everything in the map menu', items: [
          { id: 'M', name: 'The map menu', shot: '163-M', disposition: 'change', into: 'F', ref: 'everything-in-the-map-menu/M' },
        ] },
        { round: 5, page: 'one-tier-choice-auto-by-default', pageTitle: 'One tier choice, Auto by default', items: [
          { id: 'F', name: 'One tier choice per ticket', shot: '163-F', disposition: 'keep', chosen: true, ref: 'one-tier-choice-auto-by-default/F' },
        ] },
      ],
      sameIdElsewhere: ['legacy shared canvas: other tickets’ A, B, C'],
    },
    {
      ticket: 224,
      title: 'Prototype starting a ticket and watching its session',
      state: 'building',
      date: 'Oct 27',
      canvas: 'prototypes/224-…-session/index.html',
      todayGist: 'This prototype is still being built.',
      todayPicked: [],
      chosen: null,
      rounds: [
        { round: 1, page: 'overview', pageTitle: 'Overview', items: [
          { id: 'A', name: 'On the ticket', shot: '224-A', phone: true, disposition: null, ref: 'overview/A' },
          { id: 'B', name: 'Session page', shot: '224-B', phone: true, disposition: null, ref: 'overview/B' },
          { id: 'C', name: 'Desktop on Maps', shot: '224-C', phone: true, disposition: null, ref: 'overview/C' },
        ] },
      ],
    },
  ],
};
