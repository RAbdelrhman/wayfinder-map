/*
  The one file a prototype branch edits: what's being decided, and the variants on the board.
  Paths are relative to index.html. Keep them relative: Wayfinder serves this branch
  sandboxed, so root paths (/...) and fetch() don't work.
*/
window.CANVAS = {
  ticket: 39,
  title: 'Prototype canvas',
  question:
    'Is this the right board for picking a direction? Every prototype on map #35 (navigation, Home, new map, after hand-off) will be shown like this.',
  sampleState:
    'Two placeholder Home variants on fake data: 4 repositories, wayfinder-map has 2 open maps and 2 hand-offs in flight. Real directions come in P1–P4.',
  frame: { width: 1440, height: 900 },
  variants: [
    {
      id: 'A',
      name: 'Directory',
      src: 'variants/a.html',
      note: {
        idea: "Today's Home, tidied up: account, a search box, then every repository as a card with its open maps and progress.",
        pros: ['Familiar: nothing moves', 'Scales to many repositories'],
        cons: ["Doesn't say what to do next", 'In-flight work is invisible'],
      },
    },
    {
      id: 'B',
      name: 'Pick up where you left off',
      src: 'variants/b.html',
      note: {
        idea: 'Home leads with the map you were last on and what is in flight in T3 Code. Repositories drop to a compact list underneath.',
        pros: ['One obvious next action', 'Hand-offs are visible from the start'],
        cons: ['Needs hand-off tracking (G2)', 'Weaker for someone jumping between many repos'],
      },
    },
  ],
};
