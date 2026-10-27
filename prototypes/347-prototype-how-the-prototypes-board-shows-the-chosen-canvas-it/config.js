/*
  Wayfinder's canvas for ticket #347: how a card on the map's Prototypes board shows the chosen canvas item.
  Every option draws the same real data (variants/board-data.js) with the app's own classes (src/ui/styles.css).
  Check with: node prototypes/347-prototype-how-the-prototypes-board-shows-the-chosen-canvas-it/tools/check.mjs
*/

// One frame is the whole Prototypes tab at desktop width; src stays a literal so Wayfinder can read each option's page.
const BOARD = { width: 1280, height: 1000 };

window.CANVAS = {
  ticket: 347,
  title: 'The Prototypes board: the chosen item, across pages and rounds',
  question: 'How should a prototype card show what was chosen, so the exact chosen canvas item is visible and opens on its own page and round?',
  sampleState:
    'Map #205’s Prototypes tab with three real tickets. #225 chose D, Round 2 (page “D remix”), built from A, B and C of Round 1, which also has a Dark page with the same letters. #163 chose F, Round 5, after AC (Round 2), AM-setup (Round 3) and M (Round 4); F-setup and M-running are part of the choice. #224 is still being built, Round 1 with A, B and C. Pictures are captures of those exact canvas items. Clicking any frame or button says where it would open.',

  base: {
    stylesheets: ['../../src/ui/styles.css', 'variants/board.css'],
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
      title: 'Options',
      id: 'round-1',
      round: 1,
      sections: [
        {
          title: 'Today',
          note: 'What the board draws for these tickets now (src/ui/prototypeBoard.ts), for comparison. Not an option.',
          items: [
            {
              id: 'today',
              name: 'Today · guessed picks, one flat strip',
              src: 'variants/board.html?o=today', ...BOARD,
              note: {
                idea: 'One strip of every lettered item from the whole canvas, sorted A–Z, with the pick guessed from the closing comment’s text. #225 lights up A + B + C + D because the closing text names all four; #163 lights up A because the text mentions “option A’s dialog”; F, the real choice, is dimmed. Rounds and pages are not shown, items like F-setup are dropped, and a frame opens the bare variant page outside the canvas.',
                cons: ['Wrong picks on both decided examples.', 'No round or page, so a repeated letter can point at the wrong item.', '#225’s summary line is a cut-off sentence.'],
              },
            },
          ],
        },
        {
          title: 'A · Chosen first',
          note: 'A decided card leads with one large picture of the chosen item, its round and page, and Open. Earlier rounds fold away.',
          items: [
            {
              id: 'A',
              name: 'Board',
              src: 'variants/board.html?o=A', ...BOARD,
              note: {
                idea: 'Decided cards: a large frame of the chosen item on the left. On the right: “Chosen · Round 2 · D remix”, the item’s name, why it was chosen (from the chosen item’s own feedback, not the closing comment), what it was built from, and Open D, which opens the canvas viewer on that page with that item presented. Below, the other items that are part of the choice (D’s pushes and settings; #163’s F-setup and Round 4’s M-running). “1 earlier round · 3 options” unfolds the history. The header button becomes All rounds. Undecided cards keep today’s strip, showing the latest round only.',
                pros: ['The choice is the first thing you see and one click from opening.', 'Shows that a choice can be several items, across rounds.', 'Earlier rounds stay out of the way.'],
                cons: ['Tallest decided card; a board of many decided prototypes scrolls more.', 'You have to unfold to see what was not chosen.'],
              },
            },
            {
              id: 'A-earlier',
              name: 'Earlier rounds unfolded (#225)',
              src: 'variants/board.html?o=A&s=earlier', ...BOARD,
              note: {
                idea: '#225 with “1 earlier round” open: Round 1’s A, B and C, dimmed, each marked “Combined into D”, and a line saying the same letters also appear on the Round 1 Dark page. Each opens its own page and item.',
                basedOn: 'A',
              },
            },
          ],
        },
        {
          title: 'B · Round rail',
          note: 'Every round in order, left to right, with arrows between rounds and each item’s outcome under it.',
          items: [
            {
              id: 'B',
              name: 'Board',
              src: 'variants/board.html?o=B', ...BOARD,
              note: {
                idea: 'The strip becomes a rail: one column per round (Baseline, Round 2 … Round 5), labelled with its round and page, arrows between them. Each item shows its outcome: Kept → AC, Combined → D, Changed → F, Not chosen, or Chosen (green, with the outline). Every frame opens its exact page and item, so a repeated letter is never ambiguous. Pages that repeat the same letters (#225’s Dark page) are a line under their round. The rail scrolls sideways when a canvas has many rounds.',
                pros: ['The whole decision path at a glance, without opening the canvas.', 'Uses the canvas’s own Keep / Change / Combine record.'],
                cons: ['Small frames: the chosen item is no bigger than the rest.', 'Long histories scroll sideways; only the lead item of each round fits.'],
              },
            },
            {
              id: 'B-focus',
              name: 'Chosen item focused (#163)',
              src: 'variants/board.html?o=B&s=focus', ...BOARD,
              note: {
                idea: 'Keyboard focus or hover on #163’s F: a focus ring and a label naming exactly where it opens, “Round 5 · One tier choice, Auto by default › F”.',
                basedOn: 'B',
              },
            },
          ],
        },
        {
          title: 'C · Today’s strip, one round at a time',
          note: 'The smallest change: the same strip, now showing one round, with a round switcher in the card.',
          items: [
            {
              id: 'C',
              name: 'Board',
              src: 'variants/board.html?o=C', ...BOARD,
              note: {
                idea: 'The card keeps today’s four-up strip and header, but the strip shows the round with the choice (or the latest round while undecided). A line names that round and page; a switcher (Round 5 ✓, Round 4 … Baseline) swaps the strip to another round in place. On the chosen round, the strip shows the chosen item outlined and the other items that are part of the choice beside it.',
                pros: ['Closest to today: same size, same strip.', 'Every round is reachable from the board.'],
                cons: ['Lineage is hidden: you don’t see that D came from A, B and C unless you switch rounds.', 'The switcher adds a control to every card with more than one round.'],
              },
            },
            {
              id: 'C-round1',
              name: 'Switched to Round 1 (#225)',
              src: 'variants/board.html?o=C&s=round1', ...BOARD,
              note: {
                idea: '#225 switched to Round 1: A, B and C each marked “Combined into D”; the line says the letters also appear on the Dark page.',
                basedOn: 'C',
              },
            },
          ],
        },
        {
          title: 'D · Decision line',
          note: 'Compact rows: one picture, the chosen item named in words, and the round path as text.',
          items: [
            {
              id: 'D',
              name: 'Board',
              src: 'variants/board.html?o=D', ...BOARD,
              note: {
                idea: 'Each prototype is one short row: a picture of the chosen item (or the first option while undecided), then “✓ D · Timeline remix  Round 2 · D remix” as a link that opens it, then the path in text: “Round 1 A B C › Round 2 D”, with the chosen letter in green. The chevron unfolds every item’s picture, labelled with its round.',
                pros: ['Densest board: many prototypes fit on one screen.', 'The choice is readable as text, for scanning a map’s history.'],
                cons: ['Pictures only for the choice until you unfold.', 'Item outcomes (kept, combined, changed) are not shown in the row.'],
              },
            },
            {
              id: 'D-open',
              name: 'Row unfolded (#163)',
              src: 'variants/board.html?o=D&s=open', ...BOARD,
              note: {
                idea: '#163 unfolded: all seven items in round order, each labelled with its round, F outlined.',
                basedOn: 'D',
              },
            },
          ],
        },
        {
          title: 'Review',
          items: [
            {
              id: 'review',
              kind: 'note',
              name: 'Design review',
              text: 'Sources: src/ui/prototypeBoard.ts, prototypeTile.ts, canvasEntry.ts, src/prototypes.ts (prototypeVariantInfo), src/ui/styles.css (.wf-board, .wf-proto, .wf-var, .wf-frame, .chip, .segmented); the #225, #163 and #224 prototype branches’ config.js; the closing comments on #225 and #163. Today’s picks (#225 → A, B, C, D; #163 → A) were computed by running the current pickedVariantIds and prototypeVariantInfo on that real data. Draft PR #346 is not used as a decision.\n\nAll options keep today’s three card states (waiting on your pick, being built, decided) and the header Canvas button. Every frame opens the canvas viewer at its own page and item (index.html#<page>/<id>), so repeated letters (the same A–C on #225’s Round 1 and Dark pages, other canvases’ D on the #225 branch, other tickets’ letters on #163’s shared legacy canvas) never resolve to the wrong item.\n\nChecked: headless Chrome at 1280 px in light and dark, every option state, plus A and D at 1000 px; no page errors; no horizontal page overflow (B’s rail scrolls inside its card). The item captures stay light in dark theme.\n\nNot checked: widths under 1000 px, keyboard order and screen-reader names in the frames, contrast of the new grey disposition labels, the T3 preview pane, and the installed desktop app.',
            },
          ],
        },
      ],
    },
  ],
};
