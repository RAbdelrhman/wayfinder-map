/* Fake data for #353. Loaded after kit.js. Nothing here talks to GitHub. */
window.F = {
  user: { login: 'RAbdelrhman', initial: 'R' },
  otherLogin: 'ramon-work',
  // Your own maps always show (#147). Same rows as the approved #223 R-C2 screen.
  own: [
    { number: 217, repo: 'RAbdelrhman/wayfinder-map', title: 'A Wayfinder mobile app', updated: '12 min ago', counts: { done: 9, claimed: 3, frontier: 2, blocked: 8 } },
    { number: 140, repo: 'RAbdelrhman/wayfinder-map', title: 'Auto model picking', updated: '2 days ago', counts: { done: 9, claimed: 1, frontier: 2, blocked: 0 } },
    { number: 4, repo: 'RAbdelrhman/recipes-app', title: 'Offline shopping list', updated: 'yesterday', counts: { done: 2, claimed: 1, frontier: 1, blocked: 2 } },
  ],
  // Other authors' maps. Only `Visibility: public` maps can be followed (#145, #148).
  others: [
    { number: 198, repo: 'RAbdelrhman/wayfinder-map', author: 'tess-k', title: 'Linux desktop build', updated: '3 h ago', public: true, counts: { done: 4, claimed: 1, frontier: 2, blocked: 3 } },
    { number: 12, repo: 'mona/octo-notes', author: 'mona', title: 'Sync notes across devices', updated: '40 min ago', public: true, counts: { done: 3, claimed: 1, frontier: 1, blocked: 3 } },
    { number: 15, repo: 'mona/octo-notes', author: 'mona', title: 'Search rewrite', updated: '5 days ago', public: true, counts: { done: 1, claimed: 0, frontier: 2, blocked: 1 } },
    { number: 9, repo: 'mona/octo-notes', author: 'mona', title: 'Pricing experiments', updated: '1 week ago', public: false, counts: { done: 0, claimed: 0, frontier: 1, blocked: 0 } },
  ],
};

window.STATES = {
  frontier: { label: 'Next up', short: 'next', variable: '--state-frontier', icon: 'arrow' },
  claimed: { label: 'Claimed', short: 'claimed', variable: '--state-claimed', icon: 'person' },
  blocked: { label: 'Blocked', short: 'blocked', variable: '--state-blocked', icon: 'lock' },
  done: { label: 'Done', short: 'done', variable: '--state-done', icon: 'check' },
};
window.PROGRESS_ORDER = ['done', 'claimed', 'frontier', 'blocked'];

// The desktop's icons (src/ui/icons.ts), as in the #223 board, plus link and desktop.
Object.assign(Kit.icons, {
  check: '<path d="M20 6 9 17l-5-5"/>',
  lock: '<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  person: '<path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="7" r="4"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  github: '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  filter: '<path d="M4 6h16"/><path d="M7 12h10"/><path d="M10 18h4"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  desktop: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-2.6 3.4"/><path d="M6.6 6.6A17 17 0 0 0 2.5 12s3.5 7 9.5 7a9.6 9.6 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  share: '<path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
});
