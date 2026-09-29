/*
  Wayfinder's canvas for ticket #163: where Start next, its confirm list, Auto and the auto-map toggle go on the map.
  Paths are relative to index.html. Check with: node prototypes/canvas/tools/check.mjs
*/

window.CANVAS = {
  ticket: 163,
  title: 'Start next, Auto and the auto map',
  question:
    'Where do the map-level start controls go, and what do they look like: Start next, its confirm list (queue over the cap, skips, "needs you", tier per ticket), Auto, the auto-map toggle, and batch progress?',
  sampleState:
    'Fake map #300 "Offline drafts", with #125’s direction A already on it. Eight tickets are next: five task/research, grilling #215, prototype #222, and #223, which already has a hand-off starting. Two hand-offs run on this machine (#210, #223) and the cap is 4, so Start next starts 2 and queues the rest. Open any frame and use the Prototype bar (bottom right) to switch between Idle, Confirm, Running and Stopped (usage limit), and to turn Auto and the auto map on or off. Tick, untick and change tiers in the list; the counts follow.',

  base: {
    stylesheets: ['../../src/ui/styles.css', 'variants/start.css'],
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
      round: 'Baseline',
      sections: [
        {
          title: 'A · Topbar button, confirm dialog',
          note: '#125’s "Start next N" button stays in the topbar and opens a modal confirm list. The auto map is a switch in the dialog’s foot and a topbar tag while on. Batch progress takes over the button.',
          items: [
            {
              id: 'A',
              name: 'Confirm list, Auto on',
              src: 'variants/start-a.html?phase=confirm&auto=1',
              note: {
                idea:
                  'Start next opens a dialog grouped Ready, Needs you, Skipped. At the top: Tiers, "Mid for all" or Auto. Each row has a checkbox, its status (Starts now, Queued 2, Needs you, Skipped · already in T3 Code) and a tier switch. Under Auto the switch gains an Auto option and the row says "Auto · Hard · GPT-5.6 Sol — why". The foot has the auto-map switch, "2 start now · 3 queued · 2 of 4 running on this machine", and Start 5.',
                pros: [
                  'One focused place to decide, and it traps focus, so nothing on the map changes under you',
                  'Keeps the button #125 already chose',
                  'Room for the Auto reasons without squeezing',
                ],
                cons: [
                  'Covers the map, so you can’t see where a ticket sits while you pick',
                  'The auto map hides in a dialog you only see when you press Start next',
                ],
              },
            },
            {
              id: 'A-running',
              name: 'Running, auto map on',
              src: 'variants/start-a.html?phase=running&pop=1&automap=1',
              note: {
                idea:
                  'After Start, the button becomes a progress button: a small bar and "2 running · 3 queued". It opens a popover with one row per ticket and Stop the queue. Cards show Starting, Working or a dashed Queued pill. While the auto map is on, a blue "Auto map on" tag sits beside the button and opens the dialog.',
                pros: ['Progress is visible from anywhere on the map page', 'The tag makes "Wayfinder may start things" hard to miss'],
                cons: ['The topbar gets busy: path count, hand-offs, tag, progress', 'The tag is the only way back to the switch'],
              },
            },
            {
              id: 'A-stopped',
              name: 'Stopped: usage limit',
              src: 'variants/start-a.html?phase=stopped&pop=1',
              note: {
                idea:
                  'The button turns red: "Stopped: usage limit". The popover says what happened (#216 hit Claude’s limit; #214 still runs; the rest went back to next), when it resets, and offers Start again, which reopens the dialog.',
                pros: ['The stop reads at a glance, and the red is the existing failed colour'],
                cons: ['The explanation is one click away'],
              },
            },
          ],
        },
        {
          title: 'B · A Next tab in the panel',
          note: 'The confirm list is a tab in the side panel, beside the map, not over it. The auto map is a card at the top of that tab. Progress replaces the list in place.',
          items: [
            {
              id: 'B',
              name: 'Next tab, Auto and auto map on',
              src: 'variants/start-b.html?phase=confirm&auto=1&automap=1',
              note: {
                idea:
                  'The topbar button opens a "Next · 5" tab, first in the panel. It starts with the auto-map card (a switch and what it does), then Tiers, then every next ticket with its checkbox, status and tier. Start 5 is pinned to the bottom with the cap line. While the auto map is on, the tab shows a bolt and next task/research cards say "auto map starts this".',
                pros: [
                  'The map stays visible: click a card to see where it sits, then come back',
                  'The auto map sits with the thing it automates',
                  'The tab stays around, so there’s a record of what the batch did',
                ],
                cons: [
                  'The panel is narrow: titles cut off and the tier switch wraps under each row',
                  'Clicking a card switches to the Ticket tab, so you lose your place',
                  'A third tab competes with Brief and Ticket',
                ],
              },
            },
            {
              id: 'B-running',
              name: 'Running',
              src: 'variants/start-b.html?phase=running',
              note: {
                idea: 'The tab becomes "Next · 2 running": a bar, one row per ticket with its pill, and Stop the queue. The auto-map card moves to the bottom.',
                pros: ['Same place before and after Start'],
                cons: ['Hidden when you’re on the Ticket tab; only the tab label tells you'],
              },
            },
            {
              id: 'B-stopped',
              name: 'Stopped: usage limit',
              src: 'variants/start-b.html?phase=stopped',
              note: {
                idea: 'The tab says "Next · stopped" with an alert icon. Inside: the red stop notice, the rows (one Usage limit, three Back to next), and Review and start again.',
                pros: ['Full explanation without a popover'],
                cons: ['Nothing in the topbar changes, so it’s easy to miss if the panel shows a ticket'],
              },
            },
          ],
        },
        {
          title: 'C · Pick on the map, a dock to start',
          note: 'Start next turns the canvas into a picker. Each next card gets a checkbox, a status tag and its tier. A dock over the canvas holds Auto, the counts and Start, and opens into the full list. The auto map is a map setting in the map’s menu.',
          items: [
            {
              id: 'C',
              name: 'Picking on the canvas',
              src: 'variants/start-c.html?phase=confirm&auto=1',
              note: {
                idea:
                  'Everything that isn’t next fades. Each next card gets a checkbox on its corner, a tag on its edge (Starts now, Queued 2, Needs you, In T3 Code) and its tier and model on the meta line, with a spark when Auto picked it. The dock at the bottom has Tiers, "2 start now · 3 queued", Tiers and list, Cancel and Start 5.',
                pros: [
                  'You pick where the tickets are, and see what each one unblocks',
                  'Reuses #125’s snackbar spot, so notice → start → progress all happen in one place',
                  'The map stays the main thing on screen',
                ],
                cons: [
                  'Next tickets spread over a big map mean scrolling to find them all',
                  'Auto’s reasons and per-ticket tier overrides need the dock’s list',
                  'A new mode on the canvas to learn',
                ],
              },
            },
            {
              id: 'C-list',
              name: 'Dock open: tiers and reasons',
              src: 'variants/start-c.html?phase=confirm&list=1&auto=1',
              note: {
                idea: 'Tiers and list opens the dock upward into the same confirm list as A and B, for changing a tier and reading Auto’s reasons. Checkboxes stay in sync with the cards.',
                pros: ['The full list is one click away when you need it'],
                cons: ['Two places to tick the same thing'],
              },
            },
            {
              id: 'C-automap',
              name: 'Auto map in the map menu',
              src: 'variants/start-c.html?menu=1&automap=1',
              note: {
                idea:
                  'The auto map is a switch in the map’s own menu (the map name in the breadcrumb), next to its other map-wide actions. While on, the map name carries a blue "auto" mark and next task/research cards say "auto map will start this".',
                pros: ['It reads as a property of the map, which is what it is', 'Visible from every view of the map, through the name'],
                cons: ['The map menu is not somewhere you look for this today'],
              },
            },
            {
              id: 'C-stopped',
              name: 'Stopped: usage limit',
              src: 'variants/start-c.html?phase=stopped',
              note: {
                idea: 'The dock stays as the batch’s progress (bar, "2 running · 3 queued", Stop the queue). On a usage-limit stop it turns red with the notice and Pick again.',
                pros: ['Progress sits over the canvas where the cards change'],
                cons: ['Covers the bottom of the canvas until dismissed'],
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
              text:
                'Sources: src/ui/styles.css (tokens, .dialog, .segmented/.seg, .primary/.ghost, .handoff-pill, .node, .banner), src/ui/models.ts (Simple/Mid/Hard, Mid default), the Run as block in src/ui/app.ts, and #125’s chosen direction A (branch prototype/125-…), reused as the map page. New pieces: a switch (role=switch), a dashed Queued pill, a batch bar and a red stop notice, all built from existing tokens.\n\n' +
                'Checked (Playwright, Chromium, 1440×900): every variant in Confirm, Running and Stopped, light and dark; A’s dialog at 1024×700; the canvas index. Keyboard: A’s dialog is a real modal <dialog> (focus stays inside, Tab reaches the tier choice, every checkbox and tier, Esc closes); Space ticks a row and the counts update; B’s switch works with Enter and keeps focus; C’s card checkboxes have full labels and Esc leaves pick mode. Contrast of the new text colours: 4.8–10.7:1 in both themes (lowest: the Auto spark text in dark, 4.79).\n\n' +
                'Findings: A’s dialog opens with focus on Close, not Start. In A, the Prototype bar is blocked while the dialog is open (close it first). A’s topbar truncates the map name while progress and the auto-map tag show. B’s panel clips long titles. C’s card tags sit over the card edge and the dock covers the bottom of the canvas.\n\n' +
                'Not checked: screen-reader announcement of count changes (no live region yet), touch sizes, windows under 1024 px, reduced motion (nothing new animates), and the real app’s sandboxed viewer.',
            },
          ],
        },
      ],
    },
  ],
};
