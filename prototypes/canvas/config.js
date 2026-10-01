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
      title: 'One tier choice, Auto by default',
      round: 5,
      sections: [
        {
          title: 'No map-level Tiers selector',
          note: 'The user found "Tiers: Mid for all / Auto" confusing and redundant with the per-ticket choice. Now each ticket has one choice, Auto by default, with Simple, Mid or Hard to override. The auto map’s setup has the same single choice. Everything else is round 4.',
          items: [
            {
              id: 'F',
              name: 'Start next: one tier choice per ticket',
              src: 'variants/start-final.html?phase=confirm',
              note: {
                idea:
                  'The dialog opens with one line under the title: each ticket starts on Auto, which picks its tier and model (rated with logic only, set in Settings); pick a tier on any row to choose yourself. Each row’s choice is Auto | Simple | Mid | Hard, Auto selected, with Auto’s pick and reason below it, or "your pick" once overridden.',
                pros: ['One decision per ticket instead of two layers', 'Auto by default, so most batches need no changes'],
                cons: ['No one-click way to set every ticket to the same tier'],
                basedOn: ['M'],
              },
            },
            {
              id: 'F-setup',
              name: 'Auto map setup: one tier choice',
              src: 'variants/start-final.html?menu=1&setup=1',
              note: {
                idea: 'The first turn-on dialog has one Tier choice for every ticket the auto map starts: Auto (default), Simple, Mid or Hard.',
                pros: ['Same control as the Start next rows'],
                cons: [],
                basedOn: ['AM-setup'],
              },
            },
          ],
        },
      ],
    },
    {
      title: 'Everything in the map menu',
      round: 4,
      sections: [
        {
          title: 'No Start next button in the topbar',
          note: 'The user asked to remove the blue Start next button. The map-name menu now holds both map-level controls: Start next, which opens A’s confirm dialog, and the Auto map toggle, whose first turn-on opens its setup dialog.',
          items: [
            {
              id: 'M',
              name: 'The map menu',
              src: 'variants/start-menu.html?menu=1',
              note: {
                idea:
                  'The topbar has no Start next button. Open the map-name menu: "Start next · 5 ready" opens A’s confirm dialog (Auto tiers, queue over the cap, skips, needs you, tier per ticket). Below it is the Auto map toggle; the first time it opens "Turn on auto map", after that it just flips.',
                pros: ['The topbar loses its biggest button', 'Both map-level controls sit together, apart from the single-ticket Open in T3 Code'],
                cons: ['Start next is one click deeper and not visible until you open the menu'],
                basedOn: ['AM-setup', 'AM-on'],
              },
            },
            {
              id: 'M-running',
              name: 'Running: progress stays in the topbar',
              src: 'variants/start-menu.html?phase=running',
              note: {
                idea: 'While a batch runs, "2 running · 3 queued" with its bar sits in the topbar as in A, and turns into "Stopped: usage limit" on a stop. It only appears during a batch.',
                pros: ['Progress and the usage-limit stop stay visible from anywhere on the map'],
                cons: ['The topbar still changes during a batch'],
                basedOn: ['A-running', 'A-stopped'],
              },
            },
          ],
        },
      ],
    },
    {
      title: 'Start next and the auto map, apart',
      round: 3,
      sections: [
        {
          title: 'Two separate controls',
          note: 'Start next is A: a topbar button that opens the confirm dialog, with Auto tiers inside. The auto map is a toggle in the map-name menu. The first time you turn it on, a setup dialog opens; after that the toggle just flips it.',
          items: [
            {
              id: 'AM-setup',
              name: 'Turning the auto map on for the first time',
              src: 'variants/start-am.html?menu=1&setup=1',
              note: {
                idea:
                  'The first flip of the toggle opens "Turn on auto map · #300" instead of switching it on. It says what will happen (task and research tickets start by themselves; grilling and prototype tickets only notify; they count toward the 4 running and queue over it; it pauses on a usage limit and only runs while the app is open), and sets the auto map’s own tiers: Mid for all or Auto. Turn on auto map switches it on; Cancel or Esc leaves it off.',
                pros: ['Nothing starts on its own before you have read what it does', 'Start next and the auto map no longer share a dialog'],
                cons: ['One more dialog to build'],
                basedOn: ['AC', 'C-automap'],
              },
            },
            {
              id: 'AM-on',
              name: 'After setup: a plain toggle',
              src: 'variants/start-am.html?menu=1&automap=1',
              note: {
                idea:
                  'Once set up, the toggle flips the auto map on and off directly. The menu shows what it does and its tiers, with "Auto map settings…" to reopen the setup dialog. While it is on, the map name carries the "auto" mark and next task/research cards say "auto map will start this". Start next stays A’s button and dialog.',
                pros: ['A one-click toggle after the first time'],
                cons: ['Settings sit one link deeper'],
                basedOn: ['AC-menu', 'C-automap'],
              },
            },
          ],
        },
      ],
    },
    {
      title: 'A + C: the pick',
      round: 2,
      sections: [
        {
          title: 'A with the auto map in the map menu',
          note: 'What you picked: A (topbar Start next, confirm dialog, progress in the button), with the auto map moved to C’s place. How Auto rates tickets is a Setting.',
          items: [
            {
              id: 'AC',
              name: 'Confirm list, Auto and auto map on',
              src: 'variants/start-ac.html?phase=confirm&auto=1&automap=1',
              note: {
                idea:
                  'A’s dialog, unchanged, except that the auto-map switch is gone from its foot. The foot says whether the auto map is on and points to the map menu. Under Auto, a line says how tickets are rated (logic only, or a model you choose) and that it is set in Settings.',
                pros: ['One place to start a batch, one place to set the map up', 'No extra topbar button'],
                cons: ['The auto map is one menu away from Start next'],
                basedOn: ['A', 'C-automap'],
                disposition: 'keep',
                feedback: 'Combines A (kept) and C-automap (combine), as the user agreed on 29 Sep 2026.',
              },
            },
            {
              id: 'AC-menu',
              name: 'Running, auto map in the map menu',
              src: 'variants/start-ac.html?phase=running&automap=1&menu=1',
              note: {
                idea:
                  'The map-name menu holds the auto-map switch and what it does. While it is on, the map name carries a blue “auto” mark and next task/research cards say “auto map will start this”. Start next shows batch progress in the button, as in A.',
                pros: ['The mark travels with the map name to every view of the map'],
                cons: ['On narrow windows the map name truncates further while progress shows'],
                basedOn: ['A-running', 'C-automap'],
                disposition: 'keep',
                feedback: 'Combines A (kept) and C-automap (combine), as the user agreed on 29 Sep 2026.',
              },
            },
          ],
        },
      ],
    },
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
                disposition: 'keep',
                feedback:
                  'User (29 Sep 2026, reviewed from screenshots on a phone): "I still like A." Added: how Auto rates a ticket is a Setting, either logic only (no model: ticket type, body length, files mentioned, blockers) or a model the user chooses. Each row’s reason says which one made the pick.',
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
                feedback:
                  'Not chosen (user, 29 Sep 2026): it fits the page better, but the panel area feels cramped, and tickets that become next could be missed while the panel shows another tab.',
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
                feedback: 'Not chosen as a whole (user, 29 Sep 2026). Only its auto-map placement (C-automap) is taken, combined into A.',
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
                disposition: 'combine',
                feedback: 'User agreed (29 Sep 2026): put the auto-map switch in the map-name menu with the “auto” mark on the map name, combined into A. No topbar tag, since the topbar is already crowded. Everything else stays as A.',
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
