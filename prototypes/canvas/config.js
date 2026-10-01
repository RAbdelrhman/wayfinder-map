/*
  Wayfinder's canvas for ticket #125: how the map shows what's next, what's in the way, and what has stalled.
  Paths are relative to index.html. Check with: node prototypes/canvas/tools/check.mjs
*/

window.CANVAS = {
  ticket: 125,
  title: "What's next, what's in the way, what has stalled",
  question:
    'How should the map show the critical path, PR and CI state, stalled tickets, and where Start next and the "just unblocked" notice land, without redesigning the canvas or adding a fifth state colour?',
  sampleState:
    'Fake map #300 "Offline drafts". A 7-ticket blocker chain is the critical path (6 left) and a dead hand-off (#213) holds it up. Three open PRs: #204 passing and approved, #210 failing with changes requested, #211 running with review requested. #212 was claimed 6 days ago and not touched since. #203 just closed, which unblocked #214 and #216. Click any card to open it in the panel. The Prototype bar (bottom right) replays the notice or jumps to a ticket.',

  base: {
    stylesheets: ['../../src/ui/styles.css', 'variants/next.css'],
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
      round: 1,
      sections: [
        {
          title: 'A · On the card',
          note: 'Each signal goes on the card it belongs to. Start next goes in the topbar. The notice is a snackbar over the canvas.',
          items: [
            {
              id: 'A',
              name: 'Map with the notice',
              src: 'variants/next-a.html?ticket=210',
              note: {
                idea:
                  'The critical path is its chain of edges drawn solid and darker in the text colour. The selection lineage keeps its dashed flow. "6 left on the critical path" sits after the view tabs, and clicking it dims everything off the path. A PR takes over the card\'s meta line: "#232 · failing · changes requested", with a CI icon and a review icon. A stalled card gets a dashed frame and says "Stalled · …" on its meta line. The topbar button becomes "Start next 2". When a ticket closes, a snackbar says "#203 closed. #214 and #216 are ready." with Start both, and the new cards pulse once.',
                pros: [
                  'Smallest change: every signal sits where you already look',
                  'The meta line is free on claimed cards, so PR state costs no new space',
                  'Start next is where Next: #N already lives',
                ],
                cons: [
                  'The @assignee disappears from cards with a PR',
                  'A snackbar is gone once dismissed, so there is no record of what moved',
                  'Nothing adds up what is in the way: you scan the canvas for dashed frames and red icons',
                ],
                disposition: 'keep',
                feedback:
                  'User (27 Sep 2026): "I only like A." B and C are not taken forward. Agreed details: the PR line replaces @assignee on cards with a PR. Stalled is two settings, untouched claim and dead hand-off, 7 days each by default. The snackbar stays until dismissed or started, merges events, and lists but never starts grilling/prototype tickets. Start next hands off every startable (unblocked, unclaimed, task or research) ticket up to the #123 cap, shows "Start next 4 of 6" when capped, falls back to "Next: #N" when only HITL tickets are ready, and does not ask to confirm.',
              },
            },
            {
              id: 'A-stalled',
              name: 'Stalled ticket, path focused',
              src: 'variants/next-a.html?ticket=213&path=1&notice=0',
              note: {
                idea:
                  'Path focus is on, so everything off the chain dims. The panel shows #213 with a neutral "Stalled" banner in place of the state banner, above the failed hand-off card.',
                pros: ['Path focus reuses the canvas\'s existing dim treatment'],
                cons: ['Two ways to dim the canvas (selection and path focus) can fight'],
                disposition: 'keep',
                feedback: 'Part of direction A, which the user chose ("I only like A").',
              },
            },
          ],
        },
        {
          title: 'B · Path lane and a moving strip',
          note: 'One strip under the filters says what just moved and what is in the way. The critical path is a lane with numbered steps.',
          items: [
            {
              id: 'B',
              name: 'Map with the strip',
              src: 'variants/next-b.html?ticket=210',
              note: {
                idea:
                  'A soft lane runs under the critical path and its open cards carry step numbers 1–6. The topbar has a meter with one pip per path ticket, coloured by state, hatched if stalled, then "6 left". A strip under the filters shows the notice ("#203 closed 2 min ago · #214 and #216 unblocked · Start next · 2") and an "In the way" list sorted by urgency: stalled on the path, failing CI, needs you, then stalled elsewhere. Cards get a small PR · CI · review icon strip in the corner. Stalled cards are hatched. The panel adds a Pull request section with checks and review.',
                pros: [
                  'Answers "what\'s in the way" in one row, sorted, without scanning',
                  'The path reads even when it runs off screen: the meter and step numbers count it',
                  'Start next sits right next to the news that made it possible',
                ],
                cons: [
                  'One more full-width bar pushes the canvas down about 45 px',
                  'The icon-only strip on cards needs hover or the panel to read',
                  'Hatching and a lane are new visual ideas on the canvas',
                ],
              },
            },
            {
              id: 'B-stalled',
              name: 'Stalled ticket, notice dismissed',
              src: 'variants/next-b.html?ticket=212&notice=0',
              note: {
                idea:
                  'With the notice dismissed, the strip keeps a quiet "Start next · 2" and the In the way list. #212 is open: a neutral "Stalled for 6 days" banner.',
                pros: ['The strip stays useful after the news is read'],
                cons: ['An empty-ish strip on a quiet map is wasted height unless it hides'],
              },
            },
          ],
        },
        {
          title: 'C · A Next tab in the panel',
          note: 'The canvas barely changes. The panel gets a Next tab that lists what just unblocked, the path, PRs and stalled tickets.',
          items: [
            {
              id: 'C',
              name: 'Next tab open',
              src: 'variants/next-c.html',
              note: {
                idea:
                  'A new Next tab, before Brief, with a count badge. It opens on a green "Just now" card: "#203 closed. #214 and #216 are ready." with the two tickets and Start next · 2. It also says why #215 (grilling) is left out. Then the Critical path listed in order ("6 left", with #213 flagged "Holding up the path"), Pull requests with CI and review, and Stalled. On the canvas, path cards get a "1/6" badge, PR cards get a CI glyph after the pill, and stalled cards get a clock. The topbar says "6 left on the critical path" and the primary button says "3 ready", and both open the tab.',
                pros: [
                  'The canvas stays almost untouched',
                  'The fullest answer: order, reasons and actions in one list',
                  'The notice has a home that lasts, and the badge shows there is news',
                ],
                cons: [
                  'Takes the panel away from the ticket you were reading',
                  'Signals on the canvas are small; you rely on the tab',
                  'A third tab makes the panel busier',
                ],
              },
            },
            {
              id: 'C-ticket',
              name: 'Ticket panel with a PR',
              src: 'variants/next-c.html?tab=ticket&ticket=211&notice=0',
              note: {
                idea: 'The ticket tab for #211: one line under the hand-off pill reads "PR #233 · Checks running · Review requested".',
                pros: ['One compact line, next to the pill'],
                cons: ['No check counts or reviewer without opening the PR'],
              },
            },
          ],
        },
        {
          title: 'Review',
          items: [
            {
              id: 'R',
              kind: 'note',
              name: 'Design review',
              text: [
                'Sources: src/ui/styles.css (tokens --state-*, --handoff-*, --state-failed; .node, .chip, .edges, .handoff-pill/card, .banner, .facts, .fchip, .map-start), src/ui/app.ts (nodeHtml, ticketHtml, edges), src/ui/handOffs.ts (handOffPill, handOffCard), src/ui/index.html. The chrome was copied from the live map page (Wayfinder on localhost, map #121).',
                'No new colour: CI and review reuse --handoff-pr-ready (pass/approved), --state-failed (fail/changes) and --text-muted (running/requested). Each also has its own icon shape and word. Stalled uses neutral grey plus a pattern (dashed, hatched or a clock), never a hue.',
                'Checked: light and dark in all three pages (Chromium, 1440×900). Selected, dimmed (path focus), done and just-unblocked card states. Keyboard: every new control is a native button; focus is restored after each repaint, and path focus toggles aria-pressed. Cards\' aria-label adds path, PR/CI/review and stalled text. Notices are role="status" aria-live="polite". The pulse respects prefers-reduced-motion.',
                'Contrast (computed): new text uses --text-secondary/--text-muted on --surface-1 (≥ 4.5:1 in both themes). CI red #b42318 / #ff8782 and green #087008 / #58d66a pass 4.5:1 on their surfaces.',
                'Findings: in B, extra filter chips wrapped the toolbar to two rows at 1440 px, so they were dropped. The prototype bar covers the panel\'s bottom-right corner (padding added).',
                'Not checked: screen reader walk-through, Windows High Contrast / forced-colors, widths under 1100 px (panel stacks), the table view, and zoom above 100%.',
              ].join('\n\n'),
            },
          ],
        },
      ],
    },
  ],
};
