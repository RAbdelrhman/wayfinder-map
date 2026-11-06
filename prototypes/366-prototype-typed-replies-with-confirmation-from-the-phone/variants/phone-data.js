/*
  Fake data for #224's phone prototype. Loaded after kit.js. Nothing here talks to GitHub,
  T3 Code or a desktop. Map #217's states are made up for the story: #230 is next up and gets
  started from the phone; #233 and #226 wait while the desktop sleeps.
*/
window.PHONE = {
  user: { login: 'RAbdelrhman', name: 'Ramon Abdelrhman', initial: 'R', since: 'Oct 20' },
  // The one paired desktop, and the one a replacement scan finds.
  desktop: { name: 'RAMON\u2011PC', host: 'ramon-pc.tail5c2e.ts.net', since: 'Oct 21' },
  other: { name: 'RAMON\u2011LAPTOP', host: 'ramon-laptop.tail5c2e.ts.net' },
  map: {
    number: 217,
    repo: 'RAbdelrhman/wayfinder-map',
    title: 'A Wayfinder mobile app',
    destination:
      'An Expo (iOS + Android) Wayfinder app that lets you follow your maps, start tickets that T3 Code runs on your desktop, watch those sessions live, and get pushes for needs-you alerts.',
  },
  maps: [
    { number: 217, repo: 'RAbdelrhman/wayfinder-map', title: 'A Wayfinder mobile app', updated: '6 min ago' },
    { number: 140, repo: 'RAbdelrhman/wayfinder-map', title: 'Auto model picking', updated: '2 days ago', counts: { done: 9, claimed: 1, frontier: 2, blocked: 0 } },
    { number: 4, repo: 'RAbdelrhman/recipes-app', title: 'Offline shopping list', updated: 'yesterday', counts: { done: 2, claimed: 1, frontier: 1, blocked: 2 } },
    { number: 96, repo: 'RAbdelrhman/wayfinder-map', title: 'Desktop app polish', updated: '3 weeks ago', counts: { done: 14, claimed: 0, frontier: 0, blocked: 0 } },
  ],
  // layer = dependency step, as #223's Path tab draws it.
  tickets: [
    { number: 218, type: 'research', state: 'done', layer: 0, title: 'How can the phone reach the desktop’s Wayfinder and T3 Code securely?', needs: [], unblocks: [222] },
    { number: 219, type: 'research', state: 'done', layer: 0, title: 'Which push path can deliver needs-you alerts to a phone?', needs: [], unblocks: [222] },
    { number: 220, type: 'research', state: 'done', layer: 0, title: 'What does T3 Code expose for watching a running thread from another device?', needs: [], unblocks: [222] },
    { number: 221, type: 'research', state: 'done', layer: 0, title: 'Can prototype canvases render on a phone?', needs: [], unblocks: [226] },
    { number: 227, type: 'task', state: 'done', layer: 0, title: 'Scaffold the Expo app in mobile/ with shared map code', needs: [], unblocks: [228, 229, 233] },
    { number: 222, type: 'grilling', state: 'done', layer: 1, title: 'Which connection, pairing and push architecture ships?', needs: [218, 219, 220], unblocks: [224, 225, 230] },
    { number: 223, type: 'prototype', state: 'done', layer: 1, title: 'Prototype the following screens: sign-in, repos, map view, ticket detail', needs: [], unblocks: [224, 225, 226, 229] },
    { number: 228, type: 'task', state: 'done', layer: 1, title: 'Sign in to GitHub on the phone', needs: [227], unblocks: [229] },
    { number: 316, type: 'prototype', state: 'done', layer: 1, title: 'Prototype the account control: who is signed in, and sign out', needs: [223], unblocks: [] },
    { number: 224, type: 'prototype', state: 'claimed', assignee: 'RAbdelrhman', layer: 2, title: 'Prototype starting a ticket and watching its session', needs: [222, 223], unblocks: [231, 335] },
    { number: 229, type: 'task', state: 'claimed', assignee: 'RAbdelrhman', layer: 2, title: 'Follow maps on the phone: repos, maps, map view, ticket detail', needs: [223, 227, 228], unblocks: [] },
    {
      number: 230, type: 'task', state: 'frontier', layer: 2, title: 'Desktop side: pairing and a remote endpoint for starting and watching tickets', needs: [222], unblocks: [231, 232],
      body: {
        question: 'Add the chosen pairing and remote endpoint to the desktop Wayfinder so a paired phone can start a ticket and follow its session.',
        done: ['A phone can pair with and unpair from the desktop, and unpaired requests are rejected.', 'Start and watch calls work end to end against a test client.', 'Tests cover auth and the endpoints.'],
      },
    },
    {
      number: 233, type: 'task', state: 'frontier', layer: 1, title: 'Personal builds: TestFlight and Android internal testing', needs: [227], unblocks: [],
      body: {
        question: 'Ship personal builds of the app through TestFlight and Android internal testing.',
        done: ['A build installs on an iPhone from TestFlight.', 'A build installs on an Android phone from internal testing.', 'docs/ says how to cut the next build.'],
      },
    },
    {
      number: 226, type: 'prototype', state: 'frontier', layer: 2, title: 'Prototype viewing a prototype canvas on mobile', needs: [223], unblocks: [235],
      body: {
        question: 'How does a prototype canvas open on the phone, one option at a time, in Present?',
        done: ['A design canvas shows phone-sized options for opening a canvas.', 'The user has picked one, and the choice is posted as a comment.'],
      },
    },
    { number: 225, type: 'prototype', state: 'frontier', layer: 2, title: 'Prototype mobile notifications: inbox, alert types, settings', needs: [222, 223], unblocks: [234] },
    { number: 231, type: 'task', state: 'blocked', layer: 3, title: 'Start a ticket from the phone on the paired desktop', needs: [224, 230], unblocks: [] },
    { number: 232, type: 'task', state: 'blocked', layer: 3, title: 'Watch a running session on the phone', needs: [230], unblocks: [] },
    { number: 234, type: 'task', state: 'blocked', layer: 3, title: 'Push notifications for needs-you alerts', needs: [225], unblocks: [] },
    { number: 235, type: 'task', state: 'blocked', layer: 3, title: 'Open prototype canvases from ticket detail', needs: [226], unblocks: [] },
    { number: 335, type: 'prototype', state: 'blocked', layer: 3, title: 'Prototype desktop phone pairing and revocation', needs: [224], unblocks: [] },
  ],
  comments: {
    230: [{ author: 'RAbdelrhman', when: 'Oct 15', text: 'Unblocked by #222. Pairing is a single-use secret swapped for a token per phone.' }],
    233: [{ author: 'RAbdelrhman', when: 'Oct 19', text: 'Needs the Apple developer account first.' }],
    226: [{ author: 'RAbdelrhman', when: 'Oct 12', text: 'See docs/research/mobile-canvas-rendering.md for what works in a WebView.' }],
  },

  /*
    #230's session, in the pieces the scenarios stitch together. Times are the desktop's clock.
    kind: prompt | msg | tool | approval | error. tool: read | search | create | edit | run.
  */
  run230: {
    started: '10:02',
    model: 'GPT-6.1',
    branch: 'wayfinder/230-desktop-side-pairing-and-a-remote-endpoint',
    base: [
      { t: '10:02', kind: 'prompt', text: 'Work on #230 from map #217 in RAbdelrhman/wayfinder-map: Desktop side: pairing and a remote endpoint for starting and watching tickets. Claim it, read the map’s decisions, follow AGENTS.md, and open a pull request when the done-when list is met.' },
      { t: '10:03', kind: 'msg', text: 'I’ll read how the server guards its routes first, then add a separate remote endpoint so the loopback checks stay as they are.' },
      { t: '10:03', kind: 'tool', tool: 'read', verb: 'Read', target: 'src/server.ts', detail: '2,914 lines. originAllowed and hostAllowed guard /api/* to loopback.' },
      { t: '10:03', kind: 'tool', tool: 'read', verb: 'Read', target: 'docs/phone-to-desktop-connection.md', detail: 'Tailscale Serve in front of a loopback port; a token alone is not enough.' },
      { t: '10:04', kind: 'tool', tool: 'search', verb: 'Searched', target: 'originAllowed', result: '4 matches', detail: 'src/server.ts (3), src/server.test.ts (1)' },
      { t: '10:06', kind: 'msg', text: 'Pairing gets its own module: a single-use secret that expires, swapped for a token per phone. Tokens are stored hashed so each phone can be revoked on its own.' },
      { t: '10:07', kind: 'tool', tool: 'create', verb: 'Created', target: 'src/remote/pairing.ts', result: '+148', detail: 'createPairingSecret, redeemSecret, revokePhone' },
      { t: '10:11', kind: 'tool', tool: 'create', verb: 'Created', target: 'src/remote/pairing.test.ts', result: '+122', detail: '14 tests: expiry, single use, revoke, unknown token' },
      { t: '10:12', kind: 'tool', tool: 'edit', verb: 'Edited', target: 'src/server.ts', result: '+36 −4', detail: 'Mounts the remote router on its own port; loopback routes unchanged.' },
      { t: '10:13', kind: 'tool', tool: 'run', verb: 'Ran', target: 'bun run test', result: '1,284 passed', detail: 'Test Files 212 passed (212) · Tests 1,284 passed (1,284)' },
    ],
    // The live frame shows this message still streaming, up to `cut` characters.
    streaming: { t: '10:14', text: 'Tests pass. Next, the start endpoint: it rechecks that the ticket is still next up, and uses the phone’s request ID so a retry never opens a second thread.', cut: 64 },
    // What arrived while the phone couldn't reach RAMON-PC (10:15–10:21).
    away: [
      { t: '10:15', kind: 'tool', tool: 'create', verb: 'Created', target: 'src/remote/startEndpoint.ts', result: '+96', detail: 'POST /remote/start: recheck eligibility, dedupe by request ID.' },
      { t: '10:16', kind: 'tool', tool: 'create', verb: 'Created', target: 'src/remote/startEndpoint.test.ts', result: '+88', detail: '11 tests: closed, claimed, blocked, duplicate request ID' },
      { t: '10:17', kind: 'tool', tool: 'edit', verb: 'Edited', target: 'src/handOffTracking.ts', result: '+18 −2', detail: 'Records the phone’s request ID on the hand-off.' },
      { t: '10:18', kind: 'tool', tool: 'run', verb: 'Ran', target: 'bun run test', result: '1,302 passed', detail: 'Tests 1,302 passed (1,302)' },
      { t: '10:20', kind: 'msg', text: 'Both endpoints pass their tests. To reach them from the phone, Tailscale Serve has to publish the new port. That changes this machine’s network settings, so I’m asking first.' },
      { t: '10:21', kind: 'approval', verb: 'Wants to run', target: 'tailscale serve --bg --https=8443 http://127.0.0.1:4479' },
    ],
    // After the approval was answered on the desktop.
    after: [
      { t: '10:26', kind: 'tool', tool: 'run', verb: 'Ran', target: 'tailscale serve --bg --https=8443 …', result: 'approved on RAMON\u2011PC', detail: 'Available within your tailnet: https://ramon-pc.tail5c2e.ts.net:8443' },
      { t: '10:27', kind: 'tool', tool: 'edit', verb: 'Edited', target: 'README.md', result: '+12', detail: 'How to publish the remote endpoint with Tailscale Serve.' },
      { t: '10:29', kind: 'tool', tool: 'run', verb: 'Ran', target: 'bun run test', result: '1,309 passed', detail: 'Tests 1,309 passed (1,309)' },
      { t: '10:30', kind: 'tool', tool: 'run', verb: 'Ran', target: 'gh pr create', result: '#341', detail: 'https://github.com/RAbdelrhman/wayfinder-map/pull/341' },
      { t: '10:31', kind: 'msg', text: 'Opened #341. Pairing, the start endpoint and the event relay are in, with tests. The README covers the Tailscale Serve step.' },
    ],
    failed: [{ t: '10:16', kind: 'error', text: 'The provider’s usage limit was reached. T3 Code stopped this turn.' }],
    pr: { number: 341, title: 'feat: pair phones and relay starts to T3 Code', checks: '4 checks passing' },
    // T3 Code's plan progress, for B's Summary tab.
    plan: ['Read the server’s route guards', 'Pairing: single-use secret, token per phone', 'Start endpoint that rechecks the ticket', 'Relay session events, with resume', 'Publish the port with Tailscale Serve', 'Open a pull request'],
  },

  // Other runs the desktop relays: started on the desktop, or sent from the phone's queue.
  runs: {
    229: {
      origin: 'desktop', started: '9:12', finished: '9:58', status: 'pr', model: 'GPT-6.1', branch: 'wayfinder/229-follow-maps-on-the-phone',
      pr: { number: 338, title: 'feat(mobile): follow maps on the phone', checks: '4 checks passing' },
      events: [
        { t: '9:12', kind: 'prompt', text: 'Work on #229 from map #217 in RAbdelrhman/wayfinder-map: Follow maps on the phone.' },
        { t: '9:14', kind: 'msg', text: 'Building the picked #223 screens on the Expo app: Maps, map view tabs and ticket detail.' },
        { t: '9:40', kind: 'tool', tool: 'run', verb: 'Ran', target: 'bun run test', result: '214 passed' },
        { t: '9:57', kind: 'tool', tool: 'run', verb: 'Ran', target: 'gh pr create', result: '#338' },
        { t: '9:58', kind: 'msg', text: 'Opened #338 with the Maps list, map tabs and ticket detail.' },
      ],
    },
    233: {
      origin: 'desktop', started: '10:38', status: 'working', model: 'GPT-6.1', branch: 'wayfinder/233-personal-builds',
      events: [
        { t: '10:38', kind: 'prompt', text: 'Work on #233 from map #217 in RAbdelrhman/wayfinder-map: Personal builds.' },
        { t: '10:39', kind: 'msg', text: 'Checking eas.json and the app config before setting up the build profiles.' },
        { t: '10:40', kind: 'tool', tool: 'read', verb: 'Read', target: 'mobile/app.json' },
      ],
    },
    226: {
      origin: 'phone', started: '10:41', status: 'starting', model: 'GPT-6.1', branch: 'wayfinder/226-prototype-viewing-a-prototype-canvas',
      events: [{ t: '10:41', kind: 'prompt', text: 'Work on #226 from map #217 in RAbdelrhman/wayfinder-map: Prototype viewing a prototype canvas on mobile.' }],
    },
  },
};

// The desktop's state vocabulary (src/ui/chrome.ts STATE_LOOKS) and icons (src/ui/icons.ts), as #223 drew them.
window.STATES = {
  frontier: { label: 'Next up', short: 'next', variable: '--state-frontier', icon: 'arrow' },
  claimed: { label: 'Claimed', short: 'claimed', variable: '--state-claimed', icon: 'person' },
  blocked: { label: 'Blocked', short: 'blocked', variable: '--state-blocked', icon: 'lock' },
  done: { label: 'Done', short: 'done', variable: '--state-done', icon: 'check' },
};
window.STATE_ORDER = ['frontier', 'claimed', 'blocked', 'done'];
window.PROGRESS_ORDER = ['done', 'claimed', 'frontier', 'blocked'];
window.TYPE_ICON = { research: 'lens', prototype: 'beaker', grilling: 'grill', task: 'list' };

/*
  A run's status, in the desktop hand-off words (src/ui/handOffs.ts handOffPresentation) and its
  .handoff-pill classes. Waiting, Sending and Didn't start are the phone's own: a start it holds.
*/
window.RUN_LOOKS = {
  starting: { label: 'Starting', pill: 'is-starting', icon: null, report: 'T3 Code is starting the thread.' },
  working: { label: 'Working', pill: 'is-working', icon: 'play', report: 'T3 Code is working.' },
  needs: { label: 'Needs you', pill: 'is-needs-you', icon: 'person', report: 'T3 Code is waiting for your approval.' },
  pr: { label: 'PR ready', pill: 'is-pr-ready', icon: 'check', report: 'T3 Code opened a pull request.' },
  failed: { label: 'Failed', pill: 'is-failed', icon: 'alert', report: 'T3 Code reported a problem.' },
  waiting: { label: 'Waiting to send', pill: 'is-waiting', icon: 'clock', report: '' },
  sending: { label: 'Sending', pill: 'is-starting', icon: null, report: '' },
  rejected: { label: 'Didn’t start', pill: 'is-failed', icon: 'ban', report: '' },
};

Object.assign(Kit.icons, {
  check: '<path d="M20 6 9 17l-5-5"/>',
  lock: '<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  person: '<path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="7" r="4"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  lens: '<circle cx="11" cy="11" r="6.4"/><path d="m20 20-4.4-4.4"/>',
  beaker: '<path d="M9.5 3h5"/><path d="M10.8 3v6.4L5.5 17.9A2 2 0 0 0 7.2 21h9.6a2 2 0 0 0 1.7-3.1L13.2 9.4V3"/><path d="M7.8 15h8.4"/>',
  grill: '<path d="M3.5 8.5h17"/><path d="M5 8.5a7 7 0 0 0 14 0"/><path d="m8.4 14.5-2.4 6.3"/><path d="m15.6 14.5 2.4 6.3"/>',
  list: '<path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/><path d="M8.5 6H20"/><path d="M8.5 12H20"/><path d="M8.5 18H20"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  github: '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  filter: '<path d="M4 6h16"/><path d="M7 12h10"/><path d="M10 18h4"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  play: '<path d="m7 4 13 8-13 8z"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  signout: '<path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  desktop: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  // New for #224.
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  filePlus: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 11v6"/><path d="M9 14h6"/>',
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  terminal: '<path d="m4 17 6-5-6-5"/><path d="M12 19h8"/>',
  message: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3z"/><path d="M20 14v.01"/><path d="M14 20h.01"/><path d="M17 20h4v-3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  unlink: '<path d="M9 17H7A5 5 0 0 1 7 7"/><path d="M15 7h2a5 5 0 0 1 4 8"/><path d="M8 12h4"/><path d="m2 2 20 20"/>',
  pr: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M6 8.5v7"/><path d="M18 15.5V9a3 3 0 0 0-3-3h-4"/><path d="m13 3-3 3 3 3"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  swap: '<path d="M7 4 3 8l4 4"/><path d="M3 8h13"/><path d="m17 20 4-4-4-4"/><path d="M21 16H8"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
});
