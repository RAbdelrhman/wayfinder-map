/*
  The demo story and every line of tour copy. All three tour formats and the Wording
  sheet read from here, so they never disagree. Nothing in this file talks to GitHub
  or T3 Code: the demo map, the planning interview and the hand-off are all scripted.
*/
Kit.icons.help = '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6"/><path d="M12 17h.01"/>';

window.TOUR = {
  demo: {
    repo: 'demo/recipes',
    mapNumber: 1,
    mapTitle: 'Save recipes for offline cooking',
    goal: 'Let people save recipes so they can cook without a connection. Saved recipes should stay in sync across their devices.',
    destination: 'People can save any recipe, open it with no connection, and see the same saved recipes on every device.',
    interview: [
      { q: 'Should saved recipes sync between devices, or stay on one device?', a: 'Sync between devices.' },
      { q: 'What should happen if two devices edit the same recipe offline?', a: 'Not sure yet. Let me decide later.' },
    ],
    tickets: [
      { n: 2, type: 'research', state: 'done', col: 0, row: 0, title: 'Find storage that works offline in every browser', needs: [], question: 'Which browser storage keeps recipes available offline everywhere we ship?', doneWhen: ['Compare the options with their limits', 'Recommend one'] },
      { n: 3, type: 'grilling', state: 'next', col: 0, row: 1, title: 'Decide what happens when two devices edit one recipe', needs: [], question: 'When two devices change the same recipe offline, which change wins?', doneWhen: ['Record your decision on the map'] },
      { n: 4, type: 'prototype', state: 'next', col: 0, row: 2, title: 'Prototype the “Saved for offline” badge', needs: [], question: 'How should a recipe show that it is saved for offline use?', doneWhen: ['Show two or three options', 'Record the one you pick'] },
      { n: 5, type: 'task', state: 'next', col: 1, row: 0, title: 'Store saved recipes in the browser', needs: [2], question: 'Save recipes with the storage chosen in #2 so they open with no connection.', doneWhen: ['Saved recipes open offline', 'Tests cover saving and removing'] },
      { n: 6, type: 'task', state: 'blocked', col: 2, row: 1, title: 'Sync offline edits when the connection returns', needs: [3, 5], question: 'Send offline changes once the device is back online, using the rule decided in #3.', doneWhen: ['Edits made offline reach every device', 'Conflicts follow the #3 decision'] },
      { n: 7, type: 'task', state: 'blocked', col: 1, row: 2, title: 'Show the badge on saved recipes', needs: [4], question: 'Add the badge picked in #4 to every saved recipe.', doneWhen: ['The badge appears on saved recipes'] },
    ],
    handOff: [
      'Thread started in T3 Code',
      'Working on branch wayfinder/5-store-saved-recipes',
      'Pull request ready for your review',
    ],
  },

  types: {
    research: { icon: 'lens', label: 'research', line: 'Finds something out and reports back.' },
    grilling: { icon: 'grill', label: 'grilling', line: 'A decision you make with an agent asking the questions.' },
    prototype: { icon: 'beaker', label: 'prototype', line: 'Options you review side by side, then pick.' },
    task: { icon: 'list', label: 'task', line: 'A known job an agent can build on its own.' },
  },

  states: {
    done: { icon: 'check', label: 'done' },
    next: { icon: 'arrow', label: 'next up' },
    blocked: { icon: 'lock', label: 'blocked' },
  },

  copy: {
    demoPill: 'Demo',
    banner: 'You’re in the demo. Nothing here touches GitHub or T3 Code.',
    exit: 'Exit tour',
    next: 'Next',
    back: 'Back',
    stepOf: (i, n) => `Step ${i} of ${n}`,
    startMapNote: 'Demo: Start map plans a sample map. Nothing is created on GitHub.',
    openNote: 'Demo: nothing will run.',
    completion: {
      title: 'You’ve seen the whole journey',
      body: 'Goal, map, tickets, hand-off: that’s Wayfinder. Your real repositories were not touched.',
      primary: 'Start my first map',
      secondary: 'Back to Home',
      replay: (where) => `Take the tour again any time from ${where}.`,
    },
    skipped: (where) => `No problem. Take the tour any time from ${where}.`,
    exited: (where) => `Tour closed. Nothing was changed. Take it again any time from ${where}.`,
  },

  steps: [
    {
      id: 'purpose', label: 'Purpose', view: 'home',
      title: 'Wayfinder turns a goal into a map of work',
      body: 'Describe what you want to build. Wayfinder plans it as a map of GitHub issues, shows what is ready to start, and hands ready tickets to a coding agent in T3 Code. This tour walks through it with a demo project.',
      cta: 'Show me',
    },
    {
      id: 'goal', label: 'Goal', view: 'newmap', target: '.demo-composer',
      title: 'Start with a goal',
      body: 'Every map starts with a goal in plain words. We wrote one for the demo project.',
      hint: 'Press Start map to continue.',
    },
    {
      id: 'planning', label: 'Planning', view: 'planning', target: '#demo-plan',
      title: 'T3 Code plans it with you',
      body: 'In real use, T3 Code asks you a few questions about the goal, then drafts the map on GitHub. In the demo the answers are filled in for you.',
      wait: 'Planning the demo map…',
    },
    {
      id: 'map', label: 'Map', view: 'map', target: '.demo-canvas-inner',
      title: 'This is your map',
      body: 'The map is one GitHub issue. Each card is a ticket, a sub-issue of the map. Lines show what a ticket needs first. Green tickets are next up and can start now.',
    },
    {
      id: 'types', label: 'Ticket types', view: 'map', target: '#demo-types',
      title: 'Four kinds of ticket',
      body: 'Every ticket has one of four types. Grilling and prototype tickets wait for your decision; an agent can run research and task tickets on its own.',
      showTypes: true,
    },
    {
      id: 'blockers', label: 'Blockers', view: 'map', target: '[data-ticket="6"]',
      title: 'Blocked tickets wait their turn',
      body: '#6 needs #3 and #5 to close first, so it cannot start yet. When they close, it turns green on its own.',
      hint: 'Select #6 to see what it is waiting on.',
    },
    {
      id: 'handoff', label: 'Hand-off', view: 'map', target: '[data-ticket="5"]',
      title: 'Hand a ready ticket to an agent',
      body: '#5 is next up. Opening it in T3 Code starts an agent on its own branch, and you review the pull request when it is done.',
      hint: 'Select #5, then press Open in T3 Code.',
      wait: 'The demo agent is working…',
    },
  ],

  /*
    Where the invitation appears on first launch, and where the tour lives afterwards.
    Page 2 of the canvas compares these.
  */
  entries: {
    dialog: { label: 'Welcome dialog', where: 'the ? button at the bottom of the sidebar' },
    card: { label: 'Home card', where: 'the sidebar' },
    corner: { label: 'Corner card', where: 'the Tour button at the top of every page' },
  },

  invite: {
    title: 'Welcome to Wayfinder',
    cardTitle: 'New to Wayfinder?',
    body: 'Wayfinder turns a goal into a map of GitHub issues and hands ready tickets to coding agents. See how in a two-minute tour with a demo project. Nothing touches GitHub.',
    shortBody: 'See how a goal becomes a map and a hand-off, in a two-minute demo. Nothing touches GitHub.',
    accept: 'Take the tour',
    decline: 'Not now',
  },
};
