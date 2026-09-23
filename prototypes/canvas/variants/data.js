/*
  PROTOTYPE (#43): icons and fake data for every direction. Load after ../kit/kit.js.
  ?data= picks the scenario the ticket asks for:
    many      12 repositories, a normal afternoon (default)
    inflight  the same repositories with a lot waiting on you and running in T3 Code
    none      a first run: no repositories, nothing done yet
    signedout gh is signed out: recents come from the local cache, GitHub-derived data is missing
*/
(() => {
  Object.assign(Kit.icons, {
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    home: '<path d="m3 10.5 9-7 9 7"/><path d="M5.5 9.2V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.9-3.5L3 10"/><path d="M3 4v6h6"/><path d="M4 13a8 8 0 0 0 14.9 3.5L21 14"/><path d="M21 20v-6h-6"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    repo: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v18H6.5A1.5 1.5 0 0 1 5 19.5z"/><path d="M5 16.5A1.5 1.5 0 0 1 6.5 15H19"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    graph: '<rect x="3" y="4" width="7" height="6" rx="1.5"/><rect x="14" y="14" width="7" height="6" rx="1.5"/><path d="M10 7h1.5a2.5 2.5 0 0 1 2.5 2.5V14"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>',
    beaker: '<path d="M9.5 3h5"/><path d="M10.8 3v6.4L5.5 17.9A2 2 0 0 0 7.2 21h9.6a2 2 0 0 0 1.7-3.1L13.2 9.4V3"/><path d="M7.8 15h8.4"/>',
    lens: '<circle cx="11" cy="11" r="6.4"/><path d="m20 20-4.4-4.4"/>',
    grill: '<path d="M3.5 8.5h17"/><path d="M5 8.5a7 7 0 0 0 14 0"/><path d="m8.4 14.5-2.4 6.3"/><path d="m15.6 14.5 2.4 6.3"/><path d="M9.6 2.3c-1 1.1.6 1.7 0 2.9"/><path d="M14.4 2.3c-1 1.1.6 1.7 0 2.9"/>',
    list: '<path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/><path d="M8.5 6H20"/><path d="M8.5 12H20"/><path d="M8.5 18H20"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    lock: '<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    person: '<path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="7" r="4"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    play: '<path d="M7 4v16l13-8z" fill="currentColor"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
    minus: '<path d="M5 12h14"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
    pr: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M6 8.5v7"/><path d="M18 15.5V9a3 3 0 0 0-3-3h-4"/><path d="m13 3.5-2.5 2.5L13 8.5"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.2.2 1.4 1.2 2.7 2.5 2.7z"/>',
    warn: '<path d="m10.3 3.9-8.5 14.6A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.5L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    terminal: '<path d="m4 17 6-5-6-5"/><path d="M12 19h8"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    dots: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    filter: '<path d="M3 5h18l-7 8.5V19l-4 2v-7.5z"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>',
    github: '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
  });

  const params = new URLSearchParams(location.search);
  const SCENARIO = ['many', 'inflight', 'none', 'signedout'].includes(params.get('data')) ? params.get('data') : 'many';

  const STATES = {
    frontier: { label: 'next', long: 'Next up', icon: 'arrow', v: '--state-frontier' },
    claimed: { label: 'claimed', long: 'Claimed', icon: 'person', v: '--state-claimed' },
    blocked: { label: 'blocked', long: 'Blocked', icon: 'lock', v: '--state-blocked' },
    done: { label: 'done', long: 'Done', icon: 'check', v: '--state-done' },
  };
  const TYPES = { R: ['research', 'lens'], P: ['prototype', 'beaker'], G: ['grilling', 'grill'], T: ['task', 'list'] };

  // Map #35 as it stands on GitHub today (2026-09-22).
  const T = (number, col, type, state, title, blockers = []) => ({ number, col, type, state, title, blockers });
  const MAP_35 = [
    T(36, 0, 'R', 'done', 'Where do Home and Start a new map fall short of the map page?'),
    T(37, 0, 'R', 'done', "What is the map page's design system, and where do the Home views drift from it?"),
    T(38, 0, 'R', 'done', 'What can T3 Code tell Wayfinder about a thread after a hand-off?'),
    T(39, 0, 'P', 'done', 'What should the prototype canvas look like, modelled on Claude Design artifacts?'),
    T(40, 1, 'G', 'done', 'What is Home for?'),
    T(41, 1, 'G', 'done', 'How deep does hand-off tracking go?'),
    T(42, 1, 'P', 'done', 'How should navigation show where you are and where you can go?'),
    T(44, 1, 'P', 'done', 'What should starting a new map feel like?'),
    T(50, 1, 'T', 'done', 'Consolidate shared design tokens and components in styles.css'),
    T(58, 1, 'T', 'done', 'Sync the design system into Claude Design'),
    T(43, 2, 'P', 'claimed', 'What should the Home, repository and Prototypes views look like?'),
    T(45, 2, 'P', 'done', 'What does the user see after handing off to T3 Code?'),
    T(46, 2, 'G', 'done', 'Which navigation direction ships?'),
    T(48, 2, 'G', 'done', 'Which Start a new map flow ships?'),
    T(55, 2, 'T', 'done', 'Track hand-offs on the server'),
    T(47, 3, 'G', 'blocked', 'Which Home, repository and Prototypes direction ships?', [43]),
    T(49, 3, 'G', 'frontier', 'Which after-hand-off experience ships?', [45]),
    T(51, 3, 'T', 'claimed', 'Build the new navigation shell', [46, 50]),
    T(68, 3, 'T', 'frontier', 'Open a new map at a temporary route while it is being planned', [48]),
    T(69, 3, 'T', 'frontier', 'Clone a repository from Start a new map', [48]),
    T(52, 4, 'T', 'blocked', 'Redesign the Home view', [47, 51]),
    T(53, 4, 'T', 'blocked', 'Redesign the repository and Prototypes views', [47, 51]),
    T(54, 4, 'T', 'blocked', 'Redesign the Start a new map flow', [51, 68, 69]),
    T(56, 4, 'T', 'blocked', 'Show hand-off status after starting a ticket or map', [49, 55]),
    T(57, 5, 'T', 'blocked', 'Audit the redesigned pages for accessibility and fidelity', [52, 53, 54]),
  ];

  const counts = (c, b, f, d) => ({ claimed: c, blocked: b, frontier: f, done: d });
  const map = (number, title, dest, c, extra = {}) => ({ number, title, dest, counts: c, ...extra });
  const repo = (name, mark, hue, opened, maps, extra = {}) => ({ name, mark, hue, opened, maps, prototypes: [], ...extra });

  // Prototypes belong to a map (#42). These are the real ones: each prototype/<n>-<slug> branch, its variants
  // (with a screenshot in assets/protos) and the verdict that closed it. status: waiting | picked | building.
  const PROTOS_35 = [
    {
      ticket: 43,
      map: 35,
      title: 'What should the Home, repository and Prototypes views look like?',
      gist: 'Three directions for Home, the repository page and a map’s Prototypes tab: Cards, Terrain and Ledger.',
      status: 'waiting',
      date: 'today',
      variants: [['A', 'Cards', '43-A'], ['B', 'Terrain', '43-B'], ['C', 'Ledger', '43-C']],
      decides: 47,
      branch: 'prototype/43-what-should-the-home-repository-and-prototypes-views-look-like',
    },
    {
      ticket: 45,
      map: 35,
      title: 'What does the user see after handing off to T3 Code?',
      gist: 'A + B: a live status card on the ticket, and every hand-off one click away in the topbar.',
      status: 'picked',
      picked: 'AB',
      date: 'today',
      variants: [['A', 'Stays on the ticket', '45-A'], ['B', 'A tray that follows you', '45-B'], ['C', 'Each hand-off gets a page', '45-C'], ['AB', 'A + B, list in the topbar', '45-AB']],
      decides: 49,
      branch: 'prototype/45-what-does-the-user-see-after-handing-off-to-t3-code',
    },
    {
      ticket: 44,
      map: 35,
      title: 'What should starting a new map feel like?',
      gist: 'Goal first: describe the goal, pick the repository in the composer, and Start lands on the map while it is planned.',
      status: 'picked',
      picked: 'C',
      date: 'today',
      variants: [['A', 'One page, map first', '44-A'], ['B', 'Stepped', '44-B'], ['C', 'Goal first', '44-C']],
      decides: 48,
      branch: 'prototype/44-what-should-starting-a-new-map-feel-like',
    },
    {
      ticket: 42,
      map: 35,
      title: 'How should navigation show where you are and where you can go?',
      gist: 'D: C’s sidebar tree on every page, with B’s repository and map switchers and the map’s tabs in the topbar.',
      status: 'picked',
      picked: 'D',
      date: 'today',
      variants: [['A', 'Path bar', '42-A'], ['B', 'Scope and tabs', '42-B'], ['C', 'Sidebar tree', '42-C'], ['D', 'Your mix', '42-D']],
      decides: 46,
      branch: 'prototype/42-how-should-navigation-show-where-you-are-and-where-you-can-go',
    },
    {
      ticket: 39,
      map: 35,
      title: 'What should the prototype canvas look like, modelled on Claude Design artifacts?',
      gist: 'A dark dotted board with every option side by side, a sticky note on each, and present mode for any one.',
      status: 'picked',
      picked: 'A',
      date: 'yesterday',
      variants: [['A', 'The board', '39-board']],
      branch: 'prototype/39-what-should-the-prototype-canvas-look-like-modelled-on-claude-de',
    },
  ];

  const ALL_REPOS = [
    repo(
      'RAbdelrhman/wayfinder-map',
      'WM',
      212,
      '12 min ago',
      [
        map(
          35,
          'Redesign Home and Start a new map, prototyped on a design canvas',
          "Home and every view it owns look polished, share the map page's visual language, and have a clear flow: finding the right repo and map, starting a map, and knowing what happened after a hand-off.",
          counts(2, 6, 3, 14),
          { tickets: MAP_35, updated: '12 min ago', next: [49, 'Which after-hand-off experience ships?'], running: 1 },
        ),
        map(
          14,
          'Installable desktop app with the CLI still available',
          'A user can install Wayfinder, launch it without a terminal, land on Home, choose a repository and map, and hand a ticket to T3 Code.',
          counts(1, 1, 0, 8),
          { updated: '2 days ago', next: null, running: 0 },
        ),
        map(3, 'Home page: connect GitHub, pick a repo, pick a map', 'A decided implementation contract for a Home page at the tool’s root.', counts(0, 0, 0, 6), { closed: true, updated: '1 month ago' }),
      ],
      {
        prototypes: [
          ...PROTOS_35,
          {
            ticket: 17,
            map: 14,
            title: 'Prototype desktop launch and first-run states',
            gist: 'Launch, starting up, second launch, gh missing or signed out, startup failed and quit, as one clickable flow.',
            status: 'picked',
            picked: 'A',
            date: '2 days ago',
            variants: [['A', 'Launch and recovery states', '17']],
            branch: 'prototype/17-prototype-desktop-launch-and-first-run-states',
          },
          {
            ticket: 8,
            map: 3,
            title: 'What does the home page look like, and how does it lead into the map?',
            gist: 'Home at / with Pinned above Recent; a repository opens its own map picker; the map header gets a compact switcher.',
            status: 'picked',
            picked: 'A',
            date: '3 days ago',
            variants: [['A', 'Pinned and Recent', '8']],
            branch: 'prototype/8-what-does-the-home-page-look-like-and-how-does-it-lead-into-the',
          },
        ],
      },
    ),
    repo('RAbdelrhman/podcontrol', 'PC', 150, 'yesterday', [
      map(2, 'Control playback from the phone', 'Play, pause and skip from a phone on the same network.', counts(1, 2, 3, 11), { updated: 'yesterday', next: [18, 'Pair a phone with a QR code'], running: 1 }),
    ]),
    repo('RAbdelrhman/pdfbuilder', 'PB', 28, '3 days ago', [
      map(5, 'Templates people can edit without code', 'A template editor with live preview.', counts(0, 2, 1, 9), { updated: '3 days ago', next: [9, 'What does the template editor look like?'], running: 0 }),
    ]),
    repo('entelech/ecpl-lockstep', 'EL', 280, 'last week', [
      map(11, 'Lockstep sync across regions', 'Every region applies the same ordered log.', counts(2, 5, 2, 14), { updated: '5 days ago', next: [31, 'Bound the log size during a partition'], running: 0 }),
      map(19, 'Operator dashboard', 'One screen for replication lag and failovers.', counts(0, 3, 1, 4), { updated: 'last week', next: [22, 'Which lag numbers do operators act on?'], running: 0 }),
    ]),
    repo('RAbdelrhman/recipe-box', 'RB', 350, 'last week', []),
    repo('RAbdelrhman/habit-grid', 'HG', 95, '2 weeks ago', [
      map(1, 'Streaks that survive a sick day', 'Freeze days without breaking a streak.', counts(0, 0, 0, 7), { closed: true, updated: '3 weeks ago' }),
    ]),
    repo('entelech/courseware', 'CW', 190, '2 weeks ago', [
      map(4, 'Self-paced modules with checkpoints', 'Learners resume exactly where they stopped.', counts(0, 4, 2, 3), { updated: '2 weeks ago', next: [12, 'Store checkpoints per learner'], running: 0 }),
    ]),
    repo('RAbdelrhman/dotfiles', 'DF', 60, '3 weeks ago', []),
    repo('RAbdelrhman/invoice-kit', 'IK', 250, 'last month', [
      map(2, 'Recurring invoices', 'Invoices send themselves on a schedule.', counts(0, 1, 1, 5), { updated: 'last month', next: [8, 'Pick the scheduler'], running: 0 }),
    ]),
    repo('RAbdelrhman/lab-notes', 'LN', 320, 'last month', []),
    repo('entelech/t3code-fork', 'TF', 5, '2 months ago', [
      map(1, 'Report thread status to Wayfinder', 'Wayfinder can see what a hand-off is doing.', counts(0, 0, 0, 4), { closed: true, updated: '2 months ago' }),
    ]),
    repo('RAbdelrhman/portfolio-site', 'PS', 170, '3 months ago', []),
  ];

  // What's waiting on you first, then what's running (#40). kind: pick | review | input | decide | running.
  const WM = 'RAbdelrhman/wayfinder-map';
  const INFLIGHT_ALL = [
    { kind: 'pick', repo: WM, map: 35, ticket: 43, title: 'Pick a direction for Home, repository and Prototypes', detail: '3 directions on the canvas', age: 'now', mapview: 'prototypes' },
    { kind: 'decide', repo: WM, map: 35, ticket: 49, title: 'Which after-hand-off experience ships?', detail: 'Grilling waiting on your answer', age: '2 h' },
    { kind: 'input', repo: 'RAbdelrhman/podcontrol', map: 2, ticket: 18, title: 'Pair a phone with a QR code', detail: 'T3 Code is asking which port to use', age: '8 min' },
    { kind: 'decide', repo: 'RAbdelrhman/pdfbuilder', map: 5, ticket: 9, title: 'What does the template editor look like?', detail: 'Grilling waiting on your answer', age: '2 d' },
    { kind: 'running', repo: WM, map: 35, ticket: 51, title: 'Build the new navigation shell', detail: 'T3 Code working · 14 min', age: '14 min' },
    { kind: 'running', repo: 'entelech/ecpl-lockstep', map: 11, ticket: 31, title: 'Bound the log size during a partition', detail: 'T3 Code working · 41 min', age: '41 min' },
    { kind: 'running', repo: 'RAbdelrhman/podcontrol', map: 2, ticket: 16, title: 'Show what’s playing on the lock screen', detail: 'T3 Code working · 1 h 5 min', age: '1 h' },
  ];
  const KINDS = {
    pick: { label: 'Pick a variant', icon: 'beaker', needs: true },
    review: { label: 'Review PR', icon: 'pr', needs: true },
    input: { label: 'Answer T3 Code', icon: 'terminal', needs: true },
    decide: { label: 'Decide', icon: 'grill', needs: true },
    running: { label: 'Running', icon: 'bolt', needs: false },
  };

  // Tickets completed per day, oldest first, ending today. The goal is 5 a day.
  const HISTORY = [2, 4, 0, 0, 5, 6, 3, 1, 5, 5, 7, 2, 0, 0, 3, 4, 6, 5, 2, 0, 1, 5, 8, 4, 6, 3, 0, 0, 4, 5, 6, 2, 5];

  const scenarios = {
    many: { repos: ALL_REPOS, inflight: INFLIGHT_ALL.filter((_, i) => [0, 4, 5].includes(i)), today: 3, history: HISTORY, signedIn: true, cont: 'map' },
    inflight: { repos: ALL_REPOS, inflight: INFLIGHT_ALL, today: 6, history: HISTORY, signedIn: true, cont: 'handoff' },
    none: { repos: [], inflight: [], today: 0, history: HISTORY.map(() => 0), signedIn: true, cont: null },
    signedout: { repos: ALL_REPOS, inflight: [], today: null, history: null, signedIn: false, cont: 'map' },
  };
  const sc = scenarios[SCENARIO];

  const CONTINUE =
    sc.cont === 'handoff'
      ? { kind: 'handoff', repo: WM, map: 35, ticket: 51, title: 'Build the new navigation shell', status: 'Running in T3 Code', since: '4 min ago' }
      : sc.cont === 'map'
        ? { kind: 'map', repo: WM, map: 35, since: '12 min ago' }
        : null;

  window.DATA = {
    SCENARIO,
    STATES,
    TYPES,
    KINDS,
    MAP_35,
    REPOS: sc.repos,
    INFLIGHT: sc.inflight,
    CONTINUE,
    SIGNED_IN: sc.signedIn,
    USER: 'RAbdelrhman',
    GOAL: 5,
    TODAY: sc.today,
    HISTORY: sc.history,
    STREAK: sc.today === null ? null : sc.today > 0 ? 4 : 0,
  };
})();
