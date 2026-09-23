/*
  Wayfinder's canvas for ticket #45: what the user sees after handing off to T3 Code.
  Paths are relative to index.html. Check with: node prototypes/canvas/tools/check.mjs
*/

const G2 = 'Tracking per #41: live thread status, branch and PR links, stale (not failed) when T3 Code is off.';

const HANDOFF = {
  ticket: 45,
  title: 'After the hand-off',
  question:
    'What do you see after pressing Open in T3 Code: the confirmation, live status, the way back to the ticket or map, and the list of everything in flight?',
  sampleState:
    'Fake T3 Code. Open any frame and use the Prototype bar at the bottom to switch #55 between Starting, Working, Needs input, Done with PR, Failed and T3 Code not running, or press Replay hand-off to see the confirmation. Five other hand-offs stay put so the lists have something in them, one of them from podcontrol.',

  base: {
    stylesheets: ['../../src/ui/styles.css', 'variants/after.css'],
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
      title: 'Directions',
      sections: [
        {
          title: 'A + B, with the list in the topbar',
          note: 'What you picked: A’s live card and node pill, and B’s list behind a topbar button (placement 2). The button only exists while something is in T3 Code (rule 3). Nothing floats over the canvas.',
          items: [
            {
              id: 'AB',
              name: 'Closed: the topbar button',
              src: 'variants/after-ab.html?state=input',
              note: {
                idea:
                  'The ticket panel card and node pill are A, unchanged. Next to "Synced just now" sits "6 in T3 Code · 2 need you", with one dot per hand-off, most urgent first. Its border turns amber while something needs you. Handing off never opens it: the card changing in place is the confirmation.',
                pros: ['Nothing covers the map canvas or the ticket panel', '"Needs you" is visible from every page, on any map', 'Same rows and actions as B'],
                cons: ['Quieter than a floating pill: a count, not an interruption', 'The topbar gets busier on narrow windows'],
              },
            },
            {
              id: 'AB-open',
              name: 'Open: every hand-off',
              src: 'variants/after-ab.html?state=input&open=1',
              note: {
                idea:
                  'The button opens B’s list as a dropdown under it, grouped Waiting on you, In T3 Code, Done, across every map and repository. Every row names its repository and map, so a podcontrol hand-off sits next to wayfinder-map ones. Each row has its one action and a link back to the ticket or map. Clicking outside closes it.',
                pros: ['One list for all maps, one click from anywhere'],
                cons: ['Duplicates Home’s In flight strip'],
              },
            },
            {
              id: 'AB-quiet',
              name: 'Nothing in flight yet',
              src: 'variants/after-ab.html?others=0&fresh=1',
              note: {
                idea:
                  'Rule 3: with nothing in T3 Code there is no button at all. Press Open in T3 Code in the ticket panel: the card goes live and the button pops into the topbar. Toggle "Only #55" in the Prototype bar to bring the other hand-offs back.',
                pros: ['No empty chrome on a quiet day'],
                cons: ['The topbar shifts when the button appears'],
              },
            },
            {
              kind: 'note',
              name: 'Agreed so far',
              text: 'A + B with the list in the topbar. The list covers every map and repository, and each row names its repo and map. No hand-off chrome while nothing is in T3 Code, whatever the placement. A finished hand-off (PR ready, Failed) leaves the list once you act on it or open the list after it finished; it stays on its ticket card and in Home history for 30 days (#41).',
            },
          ],
        },
        {
          title: 'The three directions',
          note: `A and B are combined above. C is not chosen: it takes you away from the map. ${G2} All three keep Home's In flight strip from #40.`,
          items: [
            {
              id: 'A',
              name: 'Stays on the ticket',
              src: 'variants/after-a.html?state=working',
              note: {
                idea:
                  'Nothing moves. Open in T3 Code turns into a live card in the ticket panel: the status, the last thing T3 Code did, the one action that fits (Answer, Open PR, Try again), and branch, worktree and timeline behind a fold. The node on the map carries the same pill, and an "In T3 Code" filter finds them all. The only list is Home\'s In flight strip. A map hand-off works the same way: the card sits on top of the draft map (#44).',
                pros: [
                  'Smallest change, and the way back is free: you never leave',
                  'Status sits right where the work is on the map',
                  'Least new UI to build for #56',
                ],
                cons: [
                  'On another map or page you only find out from Home',
                  'The panel fills with hand-off detail, pushing the ticket body down',
                ],
              },
            },
            {
              id: 'B',
              name: 'A tray that follows you',
              src: 'variants/after-b.html?state=input',
              note: {
                idea:
                  'Every hand-off, ticket or map, drops into a tray at the bottom right of every page, like a download manager. Closed, it reads "6 in T3 Code · 2 need you". Open, it groups hand-offs into Waiting on you, In T3 Code and Done, each with its action and a link back to the ticket. The ticket panel and node only say it is in T3 Code.',
                pros: [
                  'You hear about "needs you" wherever you are',
                  'One place for everything, whatever map it came from',
                  'The confirmation is the new row arriving',
                ],
                cons: [
                  'Something floats over every page, including the map canvas',
                  'Duplicates Home\'s In flight strip',
                  'Status is one click away from the ticket, not on it',
                ],
              },
            },
            {
              id: 'C',
              name: 'Each hand-off gets a page (not chosen)',
              src: 'variants/after-c.html?state=done',
              note: {
                idea:
                  'Open in T3 Code takes you to the hand-off\'s own page: a big status callout with its action, a timeline of what the thread did, branch, PR and worktree, and a card back to the ticket. The sidebar (#42) grows an In flight group with one dot per hand-off, and All hand-offs lists them in a table. The draft map from #44 would be this page for a map hand-off.',
                pros: [
                  'Room for the whole story: questions asked, failures, the PR',
                  'The sidebar always shows what is in flight and what needs you',
                  'Each hand-off has a link you can come back to',
                ],
                cons: [
                  'Takes you away from the map you were working on',
                  'A new page type and route to build',
                  'The sidebar gets longer with every hand-off',
                ],
              },
            },
          ],
        },
        {
          title: 'The same directions on Home',
          note: 'Home keeps #40\'s In flight strip in every direction: cards ordered by what waits on you, each with its action and a link back.',
          items: [
            {
              id: 'H',
              name: 'Home · In flight strip',
              src: 'variants/after-a.html?view=home&state=failed',
              note: {
                idea: 'The shared Home strip, here with #55 failed. It sorts Needs you, Failed, PR ready, Working, Starting.',
                pros: ['The same cards in every direction'],
                cons: ['In A it is the only list'],
              },
            },
            {
              id: 'CL',
              name: 'C · All hand-offs (not chosen)',
              src: 'variants/after-c.html?view=flight&state=working',
              note: { idea: "C's list page, reached from the sidebar's In flight group or the rail's plane button on the map." },
            },
          ],
        },
      ],
    },
    {
      title: 'States',
      question: 'Do the six states read right? The words, icons, tones and actions are the same in every direction.',
      sections: [
        {
          title: 'Shared vocabulary',
          items: [
            {
              id: 'S',
              name: 'The six states',
              src: 'variants/states.html',
              height: 620,
              note: {
                idea:
                  'Starting and Working share the claimed blue, Needs you uses the amber of blocked, PR ready the green of next, Failed a new red. When T3 Code is off the last status stays, drawn dashed and marked stale.',
                pros: ['Hue always comes with an icon and a word', 'Offline never reads as failure'],
                cons: ['Failed adds a red the map page does not use yet'],
              },
            },
          ],
        },
        {
          title: 'T3 Code not running, per direction',
          note: 'The same moment in each direction: the last report stays, dashed and marked stale.',
          items: [
            { id: 'A-off', name: 'A · offline', src: 'variants/after-a.html?state=offline', note: 'The canvas banner and the card both say T3 Code is off; the card keeps its last status.' },
            { id: 'B-off', name: 'B · offline', src: 'variants/after-b.html?state=offline', note: 'The tray button swaps its dots for a plug and every row turns stale.' },
            { id: 'C-off', name: 'C · offline', src: 'variants/after-c.html?state=offline', note: 'The callout becomes "T3 Code isn\'t running" with the last report under it.' },
          ],
        },
      ],
    },
  ],
};

const HOME = (() => {
/*
  Wayfinder's canvas for ticket #43: three directions for Home, the repository page and a map's Prototypes tab.
  README.md documents every field. Every frame is a whole clickable prototype (variants/a|b|c.html) inside #42's
  settled shell (direction D); only the page bodies differ. ?data= picks the fake-data state (see variants/data.js).
  Check with: node prototypes/canvas/tools/check.mjs
*/

const DIRECTIONS = {
  A: {
    name: 'A · Cards',
    note: {
      idea: 'Cards. #40’s layout at its calmest: one card per job, the map page’s cards and rings, lots of air. Progress is a small fogged terrain whose trail clears one waypoint per ticket, over a 5-week calendar of fog.',
      pros: [
        'Closest to today’s Home and the map page’s cards, so it’s the cheapest to build (#52, #53)',
        'Each job reads on its own: Continue, then what’s waiting, then where else to go',
        'Empty and signed-out states swap the Continue card and leave the rest of the page in place',
      ],
      cons: [
        'Shows the least per screen: with many repositories the list sits below the fold',
        'The fog is small and decorative next to the numbers, so the reward is quieter',
        'Map cards repeat a destination paragraph you usually already know',
      ],
    },
  },
  B: {
    name: 'B · Terrain',
    note: {
      idea: 'Terrain. The Home-owned pages borrow the map page itself: its dotted canvas, node cards with a state edge, and a mini ticket graph for every map with the frontier glowing. Progress is a hex fog-of-war map, one hex per day, that clears as you close tickets.',
      pros: [
        'Looks and feels like the same product as the map page, which was map #35’s main complaint',
        'You can see the shape of a map (how much is done, what is next, what is blocked) before you open it',
        'The fog-of-war panel makes the progress goal feel like a place you are uncovering, the most satisfying of the three',
      ],
      cons: [
        'The most to build: a mini-graph renderer and a hex chart',
        'Mini graphs are only a sketch at this size; very large maps turn into texture',
        'Busier: every surface has a pattern or a coloured edge',
      ],
    },
  },
  C: {
    name: 'C · Ledger',
    note: {
      idea: 'Ledger. Dense, list-first and keyboard-led, like Linear: one line per thing with its action at the end (Pick, Review, Answer, Open), a table of maps, and list-detail for prototypes. Progress is numbers, a fog bar that burns off toward the goal, and a 12-week strip.',
      pros: [
        'The most per screen: every repository, every in-flight item and every map fit without scrolling',
        'Each in-flight line names its next action, so “what’s waiting on me” can be answered in a glance',
        'Keyboard hints (J/K, Enter, /, N) make getting back into work one keystroke',
      ],
      cons: [
        'Plainest look, so it shares the least with the map page’s visual language',
        'Less warmth: the fog is a bar, not a picture',
        'Tables need care at narrow widths',
      ],
    },
  },
};

const LETTERS = ['A', 'B', 'C'];
const PAGE = { home: 'H', repo: 'R', protos: 'P' };

/** One frame per direction for a view and data state. ids: page letter + direction + state number, e.g. HA1. */
function trio(view, n, query, noteFor) {
  const path = view === 'protos' ? 'view=map&mapview=prototypes' : `view=${view}`;
  return LETTERS.map((d) => ({
    id: `${PAGE[view]}${d}${n}`,
    name: DIRECTIONS[d].name,
    src: `variants/${d.toLowerCase()}.html?${path}${query ? `&${query}` : ''}`,
    note: noteFor ? noteFor(d) : DIRECTIONS[d].note,
  }));
}

return {
  ticket: 43,
  title: 'Home, repository and Prototypes',
  question:
    'What should Home, the repository page and a map’s Prototypes tab look like? Three directions (A Cards, B Terrain, C Ledger) on #40’s job for Home and inside #42’s sidebar shell.',
  sampleState:
    'Fake data in four states: 12 repositories on a normal afternoon, a lot in flight, a first run with no repositories, and gh signed out. Every frame is clickable: sidebar, Continue, in-flight items, repositories, maps and tabs all move between views, and repository search filters as you type.',

  base: {
    stylesheets: ['assets/app.css'],
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
      title: 'Your mix',
      question:
        'Your mix: B’s UI everywhere (dots only on the map page), A’s repository list with B’s progress bars, progress in the style each user picks (A’s trail by default) with A’s streak and C’s 3 / 5 / 8 goal, and B’s decision board for a map’s prototypes with A’s empty state.',
      sections: [
        {
          title: 'Home',
          note: 'B’s Home without the dotted canvas. Repositories are A’s list with B’s progress bar on each row and no New map button (starting a map is the sidebar’s job). The Trail / Hexes / Bar switch is live in every frame; each frame just starts on a different style.',
          items: [
            {
              id: 'M1',
              name: 'Home · Trail (default)',
              src: 'variants/b.html?view=home&data=many&fog=trail',
              note: {
                idea: 'The mix on a normal afternoon. Progress defaults to A’s fog trail and 5-week calendar, with C’s 3 / 5 / 8 goal and A’s streak underneath.',
                pros: ['B’s node cards, mini graph and in-flight lanes', 'A’s list reads faster than tiles, and the bar still shows each repository’s shape'],
                cons: ['The progress style is a per-user setting to build and store (locally, like pins and recents)'],
              },
            },
            { id: 'M2', name: 'Home · Hexes', src: 'variants/b.html?view=home&data=many&fog=hex', note: 'Same Home with B’s hex fog-of-war picked.' },
            { id: 'M3', name: 'Home · Bar', src: 'variants/b.html?view=home&data=inflight&fog=bar', note: 'C’s fog bar and 12-week strip on the busy day, past the goal.' },
            { id: 'M11', name: 'Home · No repositories', src: 'variants/b.html?view=home&data=none', note: 'First run: the list says what will appear there; everything is still fogged.' },
            { id: 'M12', name: 'Home · gh signed out', src: 'variants/b.html?view=home&data=signedout', note: 'The blocking banner replaces Continue; the list comes from the local cache.' },
          ],
        },
        {
          title: 'Repository',
          items: [
            { id: 'M4', name: 'Repository · wayfinder-map', src: 'variants/b.html?view=repo&data=many', note: 'B’s map rows with mini graphs on a plain panel. Map #35 is drawn from its real 25 tickets.' },
            { id: 'M13', name: 'Repository · no maps', src: 'variants/b.html?view=repo&data=many&repo=RAbdelrhman/recipe-box', note: 'B’s empty state, with the one Start a new map action.' },
          ],
        },
        {
          title: 'A map’s Prototypes tab: B’s decision board, on real data',
          note: 'Map #35’s real prototypes: #43 (waiting on your pick), #45 (picked A + B), #44 (picked C), #42 (picked D) and #39 (the canvas). Each thumbnail is a screenshot of that variant from its prototype branch. Every variant stays visible next to the winner, so the long page is the record of how the map was decided.',
          items: [
            { id: 'M6', name: 'Prototypes · map #35', src: 'variants/b.html?view=map&mapview=prototypes&data=many', note: 'Waiting first with dashed outlines, then each decision with its winner outlined green and the rest dimmed.' },
            { id: 'M9', name: 'Prototypes · map #14', src: 'variants/b.html?view=map&mapview=prototypes&data=many&map=14', note: 'A map with one older prototype (#17, desktop launch states).' },
            { id: 'M14', name: 'Prototypes · none yet', src: 'variants/b.html?view=map&mapview=prototypes&data=many&repo=RAbdelrhman/podcontrol&map=2', note: 'A’s empty state: a plain heading and the one sentence on what makes a prototype appear.' },
          ],
        },
        {
          title: 'Not chosen: the other two Prototypes layouts on the same real data',
          items: [
            { id: 'M5', name: 'A · Gallery', src: 'variants/a.html?view=map&mapview=prototypes&data=many', note: 'Waiting callout, then one tile per decision showing only the winner.' },
            { id: 'M7', name: 'C · List and detail', src: 'variants/c.html?view=map&mapview=prototypes&data=many', note: 'One prototype at a time, with branch and decision facts.' },
          ],
        },
      ],
    },
    {
      title: 'Home',
      question: 'Home: which direction gets you back into work in one click, and makes the fog worth clearing?',
      sections: [
        {
          title: 'Many repositories, a normal afternoon',
          note: '12 repositories, 3 tickets cleared of a goal of 5, one prototype waiting on your pick and two hand-offs running. Start here: each frame is the whole flow.',
          items: trio('home', 1, 'data=many'),
        },
        {
          title: 'Lots in flight',
          note: 'Four things need you (a pick, a PR, a question from T3 Code, a grilling) and three hand-offs are running. Continue becomes your latest hand-off because it’s newer than the last map you opened. Today is past the goal.',
          items: trio('home', 2, 'data=inflight', (d) =>
            ({
              A: 'Needs you and Running as two groups in one card, capped at 4 and 3 with See all. The hand-off Continue card has Open in T3 Code as its main action.',
              B: 'Two lanes side by side, three cards each. You see both halves at once, but a lane with more than three items needs See all sooner.',
              C: 'Every item fits, each with its verb at the end of the line. The first line has the keyboard cursor.',
            })[d],
          ),
        },
        {
          title: 'First run: no repositories',
          note: 'Nothing opened, nothing done. Continue turns into the one next step, and the progress panel shows its empty form.',
          items: trio('home', 3, 'data=none', (d) =>
            ({
              A: 'A welcome card with Start a new map; the repository list says what will appear there. The trail sits fully in fog.',
              B: 'The Continue slot shows a dashed destination node, the start of a graph. Every hex is fogged.',
              C: 'One line: Start your first map (N). The numbers read 0 and the bar is all fog.',
            })[d],
          ),
        },
        {
          title: 'gh signed out',
          note: '#40: the account only takes over when action is needed, as a blocking banner in place of Continue. Recents come from the local cache; in-flight work and progress need GitHub. The sidebar footer warns too.',
          items: trio('home', 4, 'data=signedout', (d) =>
            ({
              A: 'An amber card with the command, a Copy button and Check again. In flight and progress say why they’re empty.',
              B: 'The same banner as a node card with an amber edge. The hex map fogs over entirely.',
              C: 'A single amber line with Check again; numbers show dashes.',
            })[d],
          ),
        },
      ],
    },
    {
      title: 'Repository',
      question: 'Repository: choose or start a map. Which layout makes the right map and its next step obvious?',
      sections: [
        {
          title: 'wayfinder-map: two active maps and one completed',
          note: '#40: map search/filter and a visible Open on every map. #42: the topbar has the repository switcher and no Start button, since starting a map is the sidebar’s job.',
          items: trio('repo', 1, 'data=many', (d) =>
            ({
              A: {
                idea: 'Map cards with the ring summary; the footer names the next ticket and has Open. Completed maps sit in their own section.',
                pros: ['Familiar: today’s map card plus a footer'],
                cons: ['Two maps fill the screen; a repository with ten maps scrolls a lot'],
              },
              B: {
                idea: 'Each map is a wide card with its mini ticket graph on the left: done, claimed, next up and blocked are visible as shapes. Filter chips match the map page.',
                pros: ['You recognise a map by its shape', 'Clicking the graph opens the map'],
                cons: ['Tall rows; the graph is a sketch, not the real layout, for maps without loaded tickets'],
              },
              C: {
                idea: 'A table: number, title and destination, progress bar, next up, running, updated, Open. Active, Completed and All as a segmented filter.',
                pros: ['Scales to many maps', 'Next up and running are comparable down a column'],
                cons: ['The least visual, and the furthest from the map page’s look'],
              },
            })[d],
          ),
        },
        {
          title: 'A repository with no maps',
          note: '#40: the empty state becomes one “Start a new map” action. recipe-box has been opened but never had a map.',
          items: trio('repo', 2, 'data=many&repo=RAbdelrhman/recipe-box', (d) =>
            ({
              A: 'A dashed empty card with one primary action, pre-filled with the repository.',
              B: 'An empty graph with a dashed Destination node, then the one action.',
              C: 'A dashed box with one action and its N shortcut.',
            })[d],
          ),
        },
      ],
    },
    {
      title: 'Prototypes tab',
      question: 'A map’s Prototypes tab (#42): compare and open the map’s prototypes. Which makes the one waiting on your pick impossible to miss?',
      sections: [
        {
          title: 'Map #35: one waiting on your pick, four picked',
          note: 'The in-flight “Pick a variant” item deep-links here (#40). The badge on the Prototypes tab turns blue while something waits on you. The sidebar is folded, as on every map page (#42).',
          items: trio('protos', 1, 'data=many', (d) =>
            ({
              A: {
                idea: 'Gallery. The waiting prototype is a highlighted callout with its variants and Open the canvas; the rest are tiles showing the picked variant.',
                pros: ['Clear hierarchy: one thing to do, then history'],
                cons: ['Decided prototypes only show the winner, not what it beat'],
              },
              B: {
                idea: 'Decision board. One row per prototype with every variant side by side like the canvas; the picked one is outlined green, the losers dimmed; the waiting row has dashed outlines.',
                pros: ['Reads like a record of decisions: what was on the table and what won', 'Closest to the canvas the user already knows'],
                cons: ['Long page once a map has many prototypes'],
              },
              C: {
                idea: 'List and detail. The list sorts waiting first; the detail shows the variants large, plus branch and decision facts. Click a row to switch.',
                pros: ['Scales to many prototypes', 'Room for the facts #47/#53 might need (branch, decision)'],
                cons: ['One prototype at a time; comparing across prototypes takes clicks'],
              },
            })[d],
          ),
        },
        {
          title: 'A map with no prototypes',
          note: 'podcontrol map #2 has never had a prototype ticket.',
          items: trio('protos', 2, 'data=many&repo=RAbdelrhman/podcontrol&map=2', (d) =>
            ({
              A: 'Heading “No prototypes yet” and what makes one appear.',
              B: 'An empty board with a dashed placeholder where the variants will go.',
              C: 'A dashed box with the same sentence.',
            })[d],
          ),
        },
      ],
    },
  ],
};

})();

window.CANVAS = {
  ...HANDOFF,
  title: 'Wayfinder design prototypes',
  base: {
    ...HANDOFF.base,
    stylesheets: [...new Set([...(HOME.base.stylesheets ?? []), ...(HANDOFF.base.stylesheets ?? [])])],
  },
  pages: [
    ...HANDOFF.pages,
    ...HOME.pages.map((page) => ({
      ...page,
      ticket: page.ticket ?? HOME.ticket,
      sampleState: page.sampleState ?? HOME.sampleState,
    })),
  ],
};
