/*
  Wayfinder's canvas for ticket #42: three navigation shells. README.md documents every field.
  Each variant is one clickable page (variants/nav-*.html) that starts on the view named by ?view=;
  the page bodies are shared (variants/nav-shared.js), so only the shell differs between A, B and C.
  Check with: node prototypes/canvas/tools/check.mjs
*/

const NOTES = {
  A: {
    idea: 'Path bar. The topbar is a live path, Home / repository ▾ / map ▾, and each segment is a switcher. The rail has one rule: above the divider are the places you can always go (Home, Start a new map), below it are the views of wherever you are (Maps and Prototypes in a repository, Map, Table and Prototypes in a map).',
    pros: [
      'Smallest change: the map page keeps its topbar and rail views, and only gains Home and New map above the divider',
      'Where you are is written out in full on every page',
      'You can jump to a sibling repository or map from the path, with no trip back to Home',
    ],
    cons: [
      'The rail still changes from page to page, though now by a stated rule',
      'Long repository and map names fight for width in the path',
      'The primary action is always "Start a new map" and never follows your context',
    ],
  },
  B: {
    idea: 'Scope and tabs. The rail is identical on every page and holds only global places: Home, New map, Jump to and settings. The topbar holds the scope switcher (repository, then map), the views of that scope as tabs, and one primary action that changes with where you are.',
    pros: [
      'The rail never changes, which fixes R1’s point that the rail’s meaning shifts between pages',
      'Maps ↔ Prototypes and Map ↔ Table ↔ Prototypes sit next to each other as tabs',
      'The primary action always does the next useful thing: New map in this repo, or Start #40 in T3 Code',
    ],
    cons: [
      'Changes the map page: its view buttons move from the rail into the topbar',
      'A primary button that changes can surprise you; on the map page it competes with the inspector’s Open in T3 Code',
      'Home has no scope, so its topbar looks emptier than the others',
    ],
  },
  C: {
    idea: 'Sidebar tree. A 256px sidebar lists every repository, its maps and its Prototypes, and you are the highlighted row. Start a new map and Jump to live at the top of it in the same place on every page. On the map page it folds back to today’s rail so the canvas keeps its width.',
    pros: [
      'Where you are and everywhere you can go are visible together, one click apiece',
      'Maps are shown in their repository before you get there, so the two-step Home → repository → map flow disappears',
      'The primary action never moves',
    ],
    cons: [
      'Takes 200px from every Home-owned page and repeats what Home lists',
      'Two shells to maintain, the open sidebar and the folded map rail, and the switch between them is a mode change',
      'Gets long with many repositories and would need search, pinning or recent-first ordering',
    ],
  },
};

// Ids are the direction plus the page number (A1 = A on Home … A5 = A on the map page), unique across pages.
const PAGE_NO = { home: 1, repo: 2, protos: 3, new: 4, map: 5 };
const variant = (id, view, name, note) => ({ id: `${id}${PAGE_NO[view]}`, name, src: `variants/nav-${id.toLowerCase()}.html?view=${view}`, note });

// R1 (#36) navigation findings against each direction, as a component sheet.
const FINDINGS = [
  ['Only the map page keeps repository/map context and search (P0/P1)', 'Path + Ctrl K on every page', 'Scope switcher + Ctrl K on every page', 'Tree highlights the location; Ctrl K in the sidebar'],
  ['The rail changes controls and meaning between Home and map (P1)', 'Still changes, by a stated rule (global ▸ divider ▸ views of here)', 'Never changes: global only', 'Sidebar everywhere; folds to the old rail on the map page'],
  ['Maps ↔ Prototypes has no visible sibling tab (P1)', 'Rail views below the divider', 'Segmented tabs in the topbar', 'Sibling rows in the tree'],
  ['Home → repository is an unannounced extra step (P1)', 'Repo ▾ lets you skip back and forth', 'Scope switcher; Home unchanged', 'Maps visible in the tree before you pick'],
  ['Primary CTA (map #35 scope)', '"Start a new map", same everywhere except the map page', 'Follows context: New map in repo / Start #40 in T3 Code', 'Fixed at the top of the sidebar'],
  ['Map page changes', 'Rail gains Home + New map', 'Rail views move into topbar tabs', 'None while folded'],
];
const FINDINGS_TABLE = `<table class="nv-compare"><thead><tr><th>R1 finding / question</th><th>A · Path bar</th><th>B · Scope and tabs</th><th>C · Sidebar tree</th></tr></thead><tbody>${FINDINGS.map(
  (row) => `<tr>${row.map((cell, i) => (i === 0 ? `<th>${cell}</th>` : `<td>${cell}</td>`)).join('')}</tr>`,
).join('')}</tbody></table>`;

window.CANVAS = {
  ticket: 42,
  title: 'Navigation shells',
  question:
    'How should navigation show where you are and where you can go? Three shells (rail, crumbs, topbar and primary CTA) across Home, repository, Prototypes, /new-map and the map page.',
  sampleState:
    'Fake data: 4 repositories, map #35 as it stands today. Every frame is clickable, so rail, path, switchers, tabs and tree rows move between views; Ctrl K opens Jump to. The page bodies are identical across A/B/C, so only the shell differs. Page layouts are #43/#44, not this ticket.',

  base: {
    stylesheets: ['../../src/ui/styles.css'],
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
      title: 'D · Your mix',
      question: 'Your mix: C’s sidebar tree everywhere, B’s scope switcher and tabs on the repository, Prototypes and map pages, and a redesigned folded sidebar. Is this the shell?',
      sections: [
        {
          title: 'Open sidebar',
          note: 'Home and /new-map are C1 and C4. The repository and map pages get B’s topbar next to the sidebar. Prototypes belong to a map: they are a tab on the map, not a repository page.',
          items: [
            { id: 'D1', name: 'D · Home', src: 'variants/nav-d.html?view=home', note: 'C1 as it was.' },
            { id: 'D2', name: 'D · Repository', src: 'variants/nav-d.html?view=repo', note: { idea: 'The sidebar shows the repository as your location; the topbar has the repository switcher and no tabs, since a repository is just its maps.', cons: ['Two blue buttons: the sidebar’s “Start a new map” and B’s “New map in wayfinder-map”'] } },
            { id: 'D3', name: 'D · Map prototypes', src: 'variants/nav-d.html?view=map&mapview=prototypes&side=open', note: 'Prototypes live with their map: the map’s Prototypes tab, counting only that map’s prototypes. There is no repository-level Prototypes row or page.' },
            { id: 'D4', name: 'D · New map', src: 'variants/nav-d.html?view=new', note: 'C4 as it was: the sidebar button stays put and the tree keeps your repository open.' },
            { id: 'D6', name: 'D · Map, sidebar open', src: 'variants/nav-d.html?view=map&side=open', note: 'B5’s topbar with the sidebar open. The tree lights the map; the views are topbar tabs, so the tree no longer lists them.' },
          ],
        },
        {
          title: 'Folded sidebar',
          note: 'Folded is now the same tree, compacted: New map, Jump to, Home, then one mark per repository. Hover a mark for its name, click it for a flyout of its maps and Prototypes. The current repository keeps the blue marker. The map page starts folded; the panel button at the top toggles it on any page.',
          items: [
            { id: 'D5', name: 'D · Map, folded (default)', src: 'variants/nav-d.html?view=map', note: { idea: 'The map page as it would ship: folded rail plus B5’s topbar. Click the WM mark to see the flyout.', pros: ['Map canvas keeps its width', 'Same items and order as the open sidebar, so folding isn’t a different shell'], cons: ['Map views moved from the rail to the topbar tabs (B5), so the map page changes'] } },
            { id: 'D7', name: 'D · Repository, folded', src: 'variants/nav-d.html?view=repo&side=folded', note: 'The same fold on a Home-owned page, for anyone who wants the width back.' },
          ],
        },
      ],
    },
    {
      title: 'Home',
      question: 'Home: which shell makes the first step obvious? Start here: every frame is the whole flow, so click through it.',
      sections: [
        {
          title: 'Directions',
          note: 'Each frame is a full clickable prototype that starts on Home. The note on each explains the idea and the trade-offs.',
          items: [variant('A', 'home', 'A · Path bar', NOTES.A), variant('B', 'home', 'B · Scope and tabs', NOTES.B), variant('C', 'home', 'C · Sidebar tree', NOTES.C)],
        },
      ],
    },
    {
      title: 'Repository',
      question: 'Repository: how does each shell say which repository you are in and let you switch?',
      sections: [
        {
          title: 'wayfinder-map',
          items: [
            variant('A', 'repo', 'A · Path bar', 'Home / WM wayfinder-map ▾. The rail gains Maps and Prototypes below the divider.'),
            variant('B', 'repo', 'B · Scope and tabs', 'The repository switcher replaces the page heading. Maps | Prototypes tabs; the CTA becomes "New map in wayfinder-map".'),
            variant('C', 'repo', 'C · Sidebar tree', 'The repository row is highlighted and expanded, with its maps and Prototypes underneath.'),
          ],
        },
      ],
    },
    {
      title: 'Prototypes',
      question: 'Prototypes: is it a sibling of Maps, and can you tell?',
      sections: [
        {
          title: 'wayfinder-map prototypes',
          items: [
            variant('A', 'protos', 'A · Path bar', 'Home / repo ▾ / Prototypes, and the beaker is lit below the rail divider.'),
            variant('B', 'protos', 'B · Scope and tabs', 'The same scope, with the Prototypes tab on.'),
            variant('C', 'protos', 'C · Sidebar tree', 'The Prototypes row under the repository is on.'),
          ],
        },
      ],
    },
    {
      title: 'New map',
      question: '/new-map: where does the primary action go once you are already starting a map?',
      sections: [
        {
          title: 'Start a new map',
          note: 'The form is a stand-in: #44 designs /new-map. Look at the shell around it.',
          items: [
            variant('A', 'new', 'A · Path bar', 'Home / Start a new map. The topbar CTA hides because you are already there, and the rail’s + is lit.'),
            variant('B', 'new', 'B · Scope and tabs', 'Title only, no CTA, and the rail’s + is lit. The form carries the repository you came from.'),
            variant('C', 'new', 'C · Sidebar tree', 'The sidebar button stays where it is. The tree keeps your repository open, so you can see where the map will go.'),
          ],
        },
      ],
    },
    {
      title: 'Map',
      question: 'Map page: how much does each shell change the visual anchor?',
      sections: [
        {
          title: 'Map #35',
          note: 'The map page itself is out of scope (map #35), so each shell should change it as little as possible.',
          items: [
            variant('A', 'map', 'A · Path bar', 'Today’s map page, plus Home and New map above a divider in the rail. The path adds the repository switcher.'),
            variant('B', 'map', 'B · Scope and tabs', 'The rail is the global one. Map | Table | Prototypes move into topbar tabs, and the CTA becomes "Start #40 in T3 Code".'),
            variant('C', 'map', 'C · Sidebar tree', 'Folded: today’s rail plus a sidebar button. Open the sidebar to see the tree, with the map’s views as rows.'),
          ],
        },
      ],
    },
    {
      title: 'Findings',
      question: 'How each direction answers R1’s navigation findings (#36).',
      sections: [
        {
          title: 'R1 × directions',
          items: [
            {
              id: 'F',
              kind: 'components',
              name: 'R1 navigation findings',
              width: 1200,
              boardWidth: 1200,
              columns: 1,
              css: `.nv-compare{width:100%;border-collapse:collapse;font-size:13px;line-height:1.45}
                .nv-compare th,.nv-compare td{padding:10px 12px;border-bottom:1px solid var(--hairline);text-align:left;vertical-align:top}
                .nv-compare thead th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted)}
                .nv-compare tbody th{font-weight:600;width:28%}
                .nv-compare td{color:var(--text-secondary)}`,
              items: [{ label: 'Findings', html: FINDINGS_TABLE, bare: true }],
              note: 'All three add a global Jump to (Ctrl K) for repositories, maps and tickets. They differ in how the rail behaves and where the CTA sits.',
            },
          ],
        },
      ],
    },
  ],
};
