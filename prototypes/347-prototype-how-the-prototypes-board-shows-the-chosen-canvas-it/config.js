/*
  Wayfinder's canvas for ticket #347: how a card on the map's Prototypes board shows the chosen canvas item.
  Every option draws the same real data (variants/board-data.js) with the app's own classes (src/ui/styles.css).
  Check with: node prototypes/347-prototype-how-the-prototypes-board-shows-the-chosen-canvas-it/tools/check.mjs
*/

// One frame is the whole Prototypes tab at desktop width; src stays a literal so Wayfinder can read each option's page.
const BOARD = { width: 1280, height: 1000 };
// Round 2 frames are interactive boards with eight cards; they scroll inside the frame.
const BOARD2 = { width: 1280, height: 1100 };

window.CANVAS = {
  ticket: 347,
  title: 'The Prototypes board: the chosen item, across pages and rounds',
  question: 'How should a prototype card show what was chosen, so the exact chosen canvas item is visible and opens on its own page and round?',
  sampleState:
    'Round 1 (Options): three real tickets. #225 chose D, Round 2 (page “D remix”), built from A, B and C of Round 1, which also has a Dark page with the same letters. #163 chose F, Round 5, after AC (Round 2), AM-setup (Round 3) and M (Round 4); F-setup and M-running are part of the choice. #224 is still being built. Round 2 (More choice types): eight real tickets, one per kind of choice, from maps #205, #217, #121 and #35, gathered on one board to test every card type; a real board shows one map. Pictures are captures of those exact canvas items. Clicking any frame or Open button says where it would open.',

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
    {
      title: 'More choice types',
      id: 'round-2',
      round: 2,
      sections: [
        {
          title: 'Round 2 · A2–D2, interactive, eight kinds of choice',
          note: 'Ramon, in this ticket’s thread (27 Oct): “I think i like A the best. But I would like to test all the options more. With a little more functionality and variety in the choice types.” A is a preference, not a pick; all four are carried forward. Each frame is a working board: click, hover and switch inside it. The dashed “Prototype · show” menu at the top and the dashed label on each card are prototype controls, not part of any option.',
          items: [
            {
              id: 'cases',
              kind: 'note',
              name: 'The eight cards',
              text: '#225 · One remix chosen: D (Round 2) from A + B + C; Round 1 has a second page (Dark) that repeats the letters.\n#316 · Chosen, plus a piece kept two rounds earlier: G-a (Round 3); its sign-out confirm comes from B-confirm, kept in Round 1. G-b and G-c have no outcome recorded.\n#314 · Chosen over a sibling: E beside D in Round 2; C and D are recorded “Not chosen”. Its D is not #225’s D.\n#223 · One pick per question: Sign-in S-A, Map view M-C and Ticket detail T-C in Round 1; Repos and maps R-C2 in Round 2. Shared legacy canvas.\n#163 · Chosen after five rounds: F (Round 5), with F-setup and Round 4’s M-running.\n#44 · Closed, no pick recorded: 7 items on two pages with no round labels; no Keep, Change or Combine, and the closing comment names no pick. Two items have no picture.\n#347 · Waiting on your pick: this ticket, Round 1 A–D and Round 2 A2–D2.\n#224 · Being built: Round 1 on its branch, no review comment yet.',
            },
            {
              id: 'A2',
              name: 'A2 · Chosen first',
              src: 'variants/board2.html?o=A', ...BOARD2,
              note: {
                idea: 'A, run against every case. Click a thumbnail under “Also part of the choice” to put it in the large frame (Open follows it; Back returns to the pick). The “Built from F” links unfold the other items and highlight that source. #223 gets a question switch (Sign-in S-A · Repos and maps R-C2 · Map view M-C · Ticket detail T-C) and the large frame follows it. #44 has no large frame: it says no pick is recorded and shows every item, by page. #347 and #224 show their latest round, with earlier rounds behind a button.',
                basedOn: 'A',
                pros: ['The choice stays first on a decided card, including choices that span rounds (#316, #163) and several questions (#223).', 'Undecided and unknown cards look clearly different: no large frame unless something was chosen.'],
                cons: ['Still the tallest card: eight cards are about four screens.', 'A pick per question needs an extra switch row.'],
              },
            },
            {
              id: 'B2',
              name: 'B2 · Round rail',
              src: 'variants/board2.html?o=B', ...BOARD2,
              note: {
                idea: 'B, run against every case. Hover or keyboard-focus any picture: its sources and everything built from it stay lit, the rest fade, and a label names the exact round, page and item it opens. A round with several pages shows each page as a group (#225’s Options and Dark). “Show the rest of the choice” adds the items that come with the pick. #223 becomes a grid: one lane per question, one column per round. The rail starts scrolled to the latest round.',
                basedOn: 'B',
                pros: ['The only option that shows how every item led to the pick, including combines (#225) and pieces kept from earlier rounds (#316).', 'Repeated letters are never ambiguous: each picture sits under its own round and page.'],
                cons: ['The pick is the same size as everything else.', 'Long canvases (#225 with its Dark page, #163) scroll sideways and cut off the first round.'],
              },
            },
            {
              id: 'C2',
              name: 'C2 · One round at a time',
              src: 'variants/board2.html?o=C', ...BOARD2,
              note: {
                idea: 'C, run against every case. The round switch works; a page switch appears when a round has several pages (#225 Round 1: Options · Dark; #44: Flows · Shared pieces). Away from the chosen round, “Back to Round N ✓” returns. #223 gets a question switch that also moves to that question’s round. More than four items: “+N more on this page”.',
                basedOn: 'C',
                pros: ['Closest to today’s card size.', 'Every round and page is one click away without leaving the board.'],
                cons: ['Up to three rows of switches (#223, #225).', 'What an item became (combined into D, kept into E) shows only on the round you are viewing.'],
              },
            },
            {
              id: 'D2',
              name: 'D2 · Decision line',
              src: 'variants/board2.html?o=D', ...BOARD2,
              note: {
                idea: 'D, run against every case. A filter at the top: All · Chosen · Not chosen yet. Each row names the pick in words (#223 names all four, one per question; #44 says “No pick recorded”). Click a round in the path to unfold just that round’s items under the row, with their outcomes; the chevron unfolds every round.',
                basedOn: 'D',
                pros: ['All eight fit on about two screens.', 'The filter makes a map’s open prototypes easy to find.'],
                cons: ['One picture per row until you unfold it.', 'Lineage is text (Round 1 A B C › Round 2 D) until unfolded.'],
              },
            },
          ],
        },
        {
          title: 'Review',
          items: [
            {
              id: 'review-2',
              kind: 'note',
              name: 'Design review, Round 2',
              text: 'Sources: each ticket’s prototype branch (origin/prototype/<ticket>-…) config.js, read on 27 Oct 2026 (pages, round labels, note.basedOn, note.disposition, note.feedback), and each closing comment. Item links use each canvas’s own page id; pages without an id use the canvas engine’s slug of the title (round-2-settings-page, repos-and-maps-round-2, flows). Pictures: tools/capture-shots.mjs, headless Chrome on those branches.\n\nCorrections to Round 1’s facts: Round 1’s board says map #205, but #225 and #224 are on map #217 and #163 on #121. Its #163 “M-running” frame showed M’s picture; Round 2 uses a capture of M-running. Its #225 card says 16 items come with D; the D remix page has 14 besides D. Round 1’s frames are left as they were.\n\nUncertain: “Being built” (#224) and “Waiting on your pick” (#347) come from the ticket state (open, branch pushed; #224 has no review comment); the app may derive these from hand-off status instead. #44 is labelled “no pick recorded” because nothing on its canvas or in its closing comment names one; the decision may live elsewhere (follow-ups #68, #69). Items without an outcome read “No outcome recorded”, not “Not chosen”, unless the canvas says “Not chosen”.\n\nChecked: headless Chrome at 1280 px, each option with all eight cards, and the interactions (A2 thumbnail, reveal and question switch; B2 hover trace; C2 round and page switch; D2 filter and round unfold); no script errors; no horizontal page overflow. A2 also in dark theme and at 1000 px. The canvas’s own check passes; 3 of its 15 local checker tests fail on scaffold starter files (variants/shell.js, assets/protos) that this canvas never had, the same 3 as on the Round 1 commit.\n\nNot checked: B2–D2 in dark theme or under 1280 px, screen readers, and the canvas viewer in the installed desktop app.',
            },
          ],
        },
      ],
    },
    {
      title: 'A2 + C2 remix',
      id: 'round-3',
      round: 3,
      sections: [
        {
          title: 'Round 3 · AC3, the choice first, then how it got there',
          note: 'Ramon, in this ticket’s thread (27 Oct): “I think a mix of A2 and C2. I like the idea of seeing how we got there with the rounds but I like A2 showing as the first. Also remove the text at the bottom causing weird centering. Also as a side note I cant scroll on any option.” This is a remix for review, not a pick. A2 and C2 stay on Round 2, unchanged. Every frame on every page now scrolls.',
          items: [
            {
              id: 'AC3',
              name: 'AC3 · A2 + C2 remix',
              src: 'variants/board3.html?o=R', ...BOARD2,
              note: {
                idea: 'A decided card opens exactly like A2: the chosen item large, why it was chosen, Built from, Open, and the pieces that are part of the choice. The “Same IDs elsewhere” line under the thumbnails is gone. Under the choice, a “How it got here” row lists every round in order (Round 1 › Round 2 › Round 3 ✓, with item counts). Click a round to see its items in a strip under the choice, C2-style: each item shows what became of it (Combined into D, Kept into G-confirm, Not chosen), items that led to the pick keep a dashed outline and the rest dim; a page switch appears when the round has several pages (#225 Round 1: Options · Dark), and “+N more” past four. Click the round again or Hide to fold it. The Built from links open their round with that item lit. Undecided cards show the latest round’s strip and the same round row to switch rounds in place; #44 switches pages. #223 keeps A2’s question switch, and the round row follows the question.',
                basedOn: ['A2', 'C2'],
                pros: ['The choice is still the first and largest thing on a decided card.', 'Every round and page is one click away, and you can see which earlier items led to the pick.', 'Folded, a decided card is A2’s height plus one row.'],
                cons: ['Opening a round makes the card taller (about one strip).', 'Only one round shows at a time, so a combine across two earlier rounds (#163) takes two clicks to follow.'],
              },
            },
            {
              id: 'AC3-open',
              name: 'Rounds opened at the source',
              src: 'variants/board3.html?o=R&s=open', ...BOARD2,
              note: {
                idea: 'The same board with each decided card’s history opened on the round its pick was built from: #225 on Round 1 (A, B and C, Combined into D), #316 on Round 2 (F, Changed into G-a), #314 on its Baseline (B and A combined into D and E, C not chosen), #163 on Round 4 (M, changed into F). #223 records no source for its picks, so it opens on the pick’s own round. Everything stays clickable.',
                basedOn: 'AC3',
              },
            },
          ],
        },
        {
          title: 'Review',
          items: [
            {
              id: 'review-3',
              kind: 'note',
              name: 'Design review, Round 3',
              text: 'AC3 uses Round 2’s eight cards and data (variants/board2-data.js) and the A2 and C2 code in variants/board2.js; A2–D2 draw exactly as before. Removed from AC3 only: the “Same IDs elsewhere” line and A2’s “Show the other N items” fold, which the round row replaces.\n\nScrolling: every option page loads the app’s src/ui/styles.css, which sets body { overflow: hidden } because the app scrolls inside its .page element. These pages have no .page, so nothing could scroll in Present view or in Wayfinder’s viewer. variants/board.css now lets the document scroll. The cause was this canvas’s CSS, not the Wayfinder viewer.',
            },
          ],
        },
      ],
    },
  ],
};
