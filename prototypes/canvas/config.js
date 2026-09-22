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

window.CANVAS = {
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
          title: 'Map #35: one waiting on your pick, three picked, one being built',
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
