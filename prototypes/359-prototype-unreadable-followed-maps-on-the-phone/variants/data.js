/* Fake data for #359. Loaded after kit.js. Nothing here talks to GitHub.
   Readable maps are #353's fixture. `refs` are follows Wayfinder can't read: the phone only has the
   reference the user saved (owner/repo#number), never a title, author or progress. */
window.F = {
  user: { login: 'RAbdelrhman', initial: 'R' },
  otherLogin: 'ramon-work',
  own: [
    { number: 217, repo: 'RAbdelrhman/wayfinder-map', title: 'A Wayfinder mobile app', updated: '12 min ago', counts: { done: 9, claimed: 3, frontier: 2, blocked: 8 } },
    { number: 140, repo: 'RAbdelrhman/wayfinder-map', title: 'Auto model picking', updated: '2 days ago', counts: { done: 9, claimed: 1, frontier: 2, blocked: 0 } },
    { number: 4, repo: 'RAbdelrhman/recipes-app', title: 'Offline shopping list', updated: 'yesterday', counts: { done: 2, claimed: 1, frontier: 1, blocked: 2 } },
  ],
  others: [
    { number: 198, repo: 'RAbdelrhman/wayfinder-map', author: 'tess-k', title: 'Linux desktop build', updated: '3 h ago', public: true, counts: { done: 4, claimed: 1, frontier: 2, blocked: 3 } },
    { number: 12, repo: 'mona/octo-notes', author: 'mona', title: 'Sync notes across devices', updated: '40 min ago', public: true, counts: { done: 3, claimed: 1, frontier: 1, blocked: 3 } },
    { number: 15, repo: 'mona/octo-notes', author: 'mona', title: 'Search rewrite', updated: '5 days ago', public: true, counts: { done: 1, claimed: 0, frontier: 2, blocked: 1 } },
    // Readable again in the recovery state only.
    { number: 3, repo: 'kai-r/trailhead', author: 'kai-r', title: 'Trail conditions feed', updated: '2 h ago', public: true, counts: { done: 2, claimed: 1, frontier: 1, blocked: 1 } },
    { number: 8, repo: 'jo-park/garden-planner', author: 'jo-park', title: 'Raised bed planner', updated: '1 day ago', public: true, counts: { done: 5, claimed: 0, frontier: 1, blocked: 2 } },
  ],
  // Why a follow can't be shown. Only `private` is a confirmed visibility; every other reason leaves it unknown.
  refs: [
    { repo: 'mona/octo-notes', number: 21, why: 'issue' },
    { repo: 'kai-r/trailhead', number: 3, why: 'repo' },
    { repo: 'RAbdelrhman/wayfinder-map', number: 201, why: 'label' },
    { repo: 'jo-park/garden-planner', number: 8, why: 'nosave' },
  ],
};

window.WHY = {
  issue: { icon: 'help', head: "Can't read this map", text: "GitHub didn't return the issue. It may be deleted or moved, or you may no longer have access." },
  repo: { icon: 'help', head: "Can't read this repository", text: "GitHub didn't return the repository. It may be deleted or renamed, or you may no longer have access." },
  label: { icon: 'tag', head: 'Not a map now', text: "The issue isn't labelled as a Wayfinder map any more." },
  nosave: { icon: 'cloudoff', head: 'No saved details', text: "You're offline and this phone hasn't loaded the map yet. It shows when GitHub can be reached." },
};

window.STATES = {
  frontier: { variable: '--state-frontier' },
  claimed: { variable: '--state-claimed' },
  blocked: { variable: '--state-blocked' },
  done: { variable: '--state-done' },
};
window.PROGRESS_ORDER = ['done', 'claimed', 'frontier', 'blocked'];

// The desktop's icons (src/ui/icons.ts) as on the #223 and #353 boards, plus help, tag and cloud-off.
Object.assign(Kit.icons, {
  check: '<path d="M20 6 9 17l-5-5"/>',
  lock: '<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  person: '<path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="7" r="4"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  github: '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  filter: '<path d="M4 6h16"/><path d="M7 12h10"/><path d="M10 18h4"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-2.6 3.4"/><path d="M6.6 6.6A17 17 0 0 0 2.5 12s3.5 7 9.5 7a9.6 9.6 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17h.01"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  cloudoff: '<path d="M3 3l18 18"/><path d="M8.5 6.2A6 6 0 0 1 17.7 10H18a4 4 0 0 1 2.6 7"/><path d="M17 19H7a5 5 0 0 1-1.6-9.7"/>',
});
