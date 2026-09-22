/*
  Wayfinder's canvas for ticket #45: what the user sees after handing off to T3 Code.
  Paths are relative to index.html. Check with: node prototypes/canvas/tools/check.mjs
*/

const G2 = 'Tracking per #41: live thread status, branch and PR links, stale (not failed) when T3 Code is off.';

window.CANVAS = {
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
