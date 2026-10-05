/* Fake data for the #223 phone prototype. Loaded after kit.js. Nothing here talks to GitHub. */
window.MOBILE = {
  user: { login: 'RAbdelrhman', initial: 'R' },
  deviceCode: 'WDJB-MJHT',
  repos: [
    { name: 'RAbdelrhman/wayfinder-map', maps: 3, open: 22, updated: '12 min ago' },
    { name: 'RAbdelrhman/recipes-app', maps: 1, open: 6, updated: 'yesterday' },
    { name: 'RAbdelrhman/dotfiles', maps: 0, open: 0, updated: '3 weeks ago' },
  ],
  maps: [
    {
      number: 217,
      repo: 'RAbdelrhman/wayfinder-map',
      title: 'A Wayfinder mobile app',
      destination:
        'An Expo (iOS + Android) Wayfinder app that lets you follow your maps, start tickets that T3 Code runs on your desktop, watch those sessions live, and get pushes for needs-you alerts.',
      updated: '12 min ago',
      followed: true,
    },
    { number: 140, repo: 'RAbdelrhman/wayfinder-map', title: 'Auto model picking', updated: '2 days ago', followed: true, counts: { done: 9, claimed: 1, frontier: 2, blocked: 0 } },
    { number: 96, repo: 'RAbdelrhman/wayfinder-map', title: 'Desktop app polish', updated: '3 weeks ago', followed: false, counts: { done: 14, claimed: 0, frontier: 0, blocked: 0 } },
    { number: 4, repo: 'RAbdelrhman/recipes-app', title: 'Offline shopping list', updated: 'yesterday', followed: true, counts: { done: 2, claimed: 1, frontier: 1, blocked: 2 } },
  ],
  // Map #217's tickets. layer = dependency depth, used by the layered view.
  tickets: [
    { number: 218, type: 'research', state: 'done', layer: 0, title: 'How can the phone reach the desktop’s Wayfinder and T3 Code securely?', needs: [], unblocks: [222] },
    { number: 219, type: 'research', state: 'claimed', assignee: 'RAbdelrhman', layer: 0, title: 'Which push path can deliver needs-you alerts to a phone?', needs: [], unblocks: [222] },
    { number: 220, type: 'research', state: 'frontier', layer: 0, title: 'What does T3 Code expose for watching a running thread from another device?', needs: [], unblocks: [222] },
    { number: 221, type: 'research', state: 'done', layer: 0, title: 'Can prototype canvases render on a phone?', needs: [], unblocks: [226] },
    { number: 223, type: 'prototype', state: 'claimed', assignee: 'RAbdelrhman', layer: 0, title: 'Prototype the following screens: sign-in, repos, map view, ticket detail', needs: [], unblocks: [224, 225, 226, 229],
      body: { question: 'What should following a map look like on a phone: GitHub sign-in, the repo and map lists, a map view with ticket states, and ticket detail?', done: ['A design canvas shows clickable phone-sized options for each screen.', 'The user has picked a direction, and the choice is posted as a comment.'] } },
    { number: 227, type: 'task', state: 'frontier', layer: 0, title: 'Scaffold the Expo app in mobile/ with shared map code', needs: [], unblocks: [228, 229] },
    { number: 222, type: 'grilling', state: 'blocked', layer: 1, title: 'Which connection, pairing and push architecture ships?', needs: [219, 220], unblocks: [224, 225, 230] },
    { number: 226, type: 'prototype', state: 'blocked', layer: 1, title: 'Prototype viewing a prototype canvas on mobile', needs: [223], unblocks: [235] },
    { number: 228, type: 'task', state: 'blocked', layer: 1, title: 'Sign in to GitHub on the phone', needs: [227], unblocks: [229] },
    { number: 224, type: 'prototype', state: 'blocked', layer: 2, title: 'Prototype starting a ticket and watching its session', needs: [222, 223], unblocks: [231] },
    { number: 225, type: 'prototype', state: 'blocked', layer: 2, title: 'Prototype mobile notifications: inbox, alert types, settings', needs: [222, 223], unblocks: [234] },
    { number: 229, type: 'task', state: 'blocked', layer: 2, title: 'Follow maps on the phone: repos, maps, map view, ticket detail', needs: [223, 227, 228], unblocks: [] },
    { number: 230, type: 'task', state: 'blocked', layer: 2, title: 'Desktop side: pairing and a remote endpoint', needs: [222], unblocks: [231, 232] },
    { number: 231, type: 'task', state: 'blocked', layer: 3, title: 'Start a ticket from the phone on the paired desktop', needs: [224, 230], unblocks: [] },
    { number: 232, type: 'task', state: 'blocked', layer: 3, title: 'Watch a running session on the phone', needs: [230], unblocks: [] },
    { number: 234, type: 'task', state: 'blocked', layer: 3, title: 'Push notifications for needs-you alerts', needs: [225], unblocks: [] },
    { number: 235, type: 'task', state: 'blocked', layer: 2, title: 'Open prototype canvases from ticket detail', needs: [226], unblocks: [] },
    { number: 233, type: 'task', state: 'blocked', layer: 1, title: 'Personal builds: TestFlight and Android internal testing', needs: [227], unblocks: [] },
  ],
  comments: [
    { author: 'RAbdelrhman', when: '3 h ago', text: 'Claimed. Building the canvas on prototype/223.' },
  ],
};

// The desktop's own state vocabulary (src/ui/chrome.ts STATE_LOOKS) and icons (src/ui/icons.ts).
window.STATES = {
  frontier: { label: 'Next up', short: 'next', variable: '--state-frontier', icon: 'arrow' },
  claimed: { label: 'Claimed', short: 'claimed', variable: '--state-claimed', icon: 'person' },
  blocked: { label: 'Blocked', short: 'blocked', variable: '--state-blocked', icon: 'lock' },
  done: { label: 'Done', short: 'done', variable: '--state-done', icon: 'check' },
};
window.STATE_ORDER = ['frontier', 'claimed', 'blocked', 'done'];
window.PROGRESS_ORDER = ['done', 'claimed', 'frontier', 'blocked'];
window.TYPE_ICON = { research: 'lens', prototype: 'beaker', grilling: 'grill', task: 'list' };

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
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  github: '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  graph: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="12" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8.5 6.5 15.5 11"/><path d="M8.5 17.5 15.5 13"/>',
  rows: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  filter: '<path d="M4 6h16"/><path d="M7 12h10"/><path d="M10 18h4"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  play: '<path d="m7 4 13 8-13 8z"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
});
