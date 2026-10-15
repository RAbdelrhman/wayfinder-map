# Archive controls review

Ticket #288 on map #236. No layout or wording is approved yet. Round 1 (A, B) and round 2 (C, D) remain on the canvas. The implementation ticket #242 already has a native blocked-by relationship to #288.

## Round 1

- A: Active and Archived maps tabs in the repository view; compact archived rows.
- B: Archived maps opens a dedicated repository page; archived map cards.
- Both: Archive replaces Settle, Restore replaces Unsettle, and the Archived maps view replaces the collapsed Settled section. Opening an archived map retains its archive status. Restore is a separate action in the list and on the opened map.
- Reasons shown: Closed, Finished, Idle 30 days, Archived by you. Closed describes the GitHub issue; Finished describes all tickets being done. These fixtures do not implement automatic archive rules.
- All state is in memory. Reset demo restores the original fixture. No GitHub or app preference calls occur.
- The map detail uses schematic ticket cards solely to demonstrate archive status and Restore placement. It is not a replacement map design.

### Round 1 evidence

- `node prototypes/288-prototype-the-archive-controls-and-the-archived-maps-view/tools/check.mjs`: Canvas config OK.
- `bun run test src/ui/archivePrototype.test.ts`: four tests passed, covering the archive/open/restore journey and failed saves for both options.
- T3 collaborative browser: both variants inspected in light and dark at desktop and 390px widths. Both archive journeys passed evaluated assertions. Empty, loading, read failure and save failure fixtures rendered for both. No horizontal overflow at 390px.
- Keyboard: Tab and Enter exercised on A; focus-visible rendered a 3px blue outline. Restore hover exercised. Semantic headings, list, buttons, named searches and live alert/status roles inspected in the browser.
- Sampled contrast from runtime tokens: muted on plane 4.91:1 light, 6.73:1 dark; secondary on surface 7.73:1 light, 9.72:1 dark; primary button 5.25:1 both; focus on plane 4.76:1 light, 5.34:1 dark.
- `bun run typecheck` and `bun run lint`: passed after routing the test fixture HTML through `setTrustedHtml`.
- Initial full `bun run test`: 15 failed, 1343 passed, 33 skipped across 112 files. Failures in updaterEnabled, server, canvasScaffold, and eslintConfig under concurrent load. Rerun `bun run test --maxWorkers=4`: 113 files and 1395 tests passed, including the four archive prototype tests. The latest trustedHtml-only test edit passed typecheck/lint and a final focused rerun: four tests passed.
- Not checked: screen reader, exhaustive keyboard traversal, every color pair/control boundary, disabled/saving state, installed app, live persistence. No independent final verifier yet; approval is pending.

## Feedback process

Review A first, then B. For each, choose Keep, Change, or Combine in Notes, add detail, select the generated feedback line and paste it into the thread. Only submitted and agreed feedback is recorded in `note.disposition` and `note.feedback`. Remixes go on a new named round page with source IDs in `note.basedOn`.

Recorded on A and B (`disposition: 'change'`), word for word: "I'll be honest neither one looks great could you redo with an opus 5.5 subagent i forgot how bad 6.1 was at ui compared to opus". No layout was chosen.

## Round 2: Opus archive directions

Page `round-2`, options C and D, each with `basedOn: ['A', 'B']`, plus 390px frames of each. Built by Claude Opus 5.5 on the real repository page: real `src/ui/styles.css`, the app's sidebar, top bar, `wf-map` cards with their ticket graphs, and `node` tickets on the opened map. `variants/r2.css` adds only shell glue and the archive pieces; `variants/r2-shared.js` holds fixtures and drawing helpers.

- C, one list, two views: labelled Archive where Settle is; an Active maps | Archived maps switch replaces the Settled section; archived rows show graph thumbnail, reason, date and how the map comes back; reason filter chips; status strip with Restore on an opened archived map.
- D, archive is a place: icon Archive on cards; an Archived maps row at the foot of the list and in the sidebar; a page grouping maps by reason (manual, closed, finished, idle, the contract's precedence order) with a detail pane showing why, how it returns, and what is paused or still running; floating status card with Restore on an opened archived map.

### Evidence

- `node prototypes/288-prototype-the-archive-controls-and-the-archived-maps-view/tools/check.mjs`: Canvas config OK.
- `bun run test src/ui/archivePrototype.test.ts`: 10 passed (4 round 1, 6 for C and D: archive, archived list with all four reasons, open without restoring, restore and its "stays active" wording, reason filter, paused and running facts, a failed save keeps the map in place).
- `bun run typecheck` and `bun run lint`: exit 0.
- T3 browser against `tools/serve.mjs` (sandbox CSP, port 4398): C and D at 1280px in light and dark, and at 390px. No horizontal overflow on active, archived and opened-map views. Journeys run: Archive with its saving state, toast and undo; Archived maps; Open without restoring; Restore from the list, the detail pane and the opened map. D: empty, loading, read error and save error with Try again, no script errors. C: save error and retry.
- Keyboard with real key presses: C tabs switch with ArrowRight; D listbox ArrowDown moves the selection with a visible 2px focus ring; Tab order runs h1, filter, selected map, Open map.
- Computed text contrast over sidebar, top bar and main: lowest 4.75:1 in light, 5.13:1 in dark. Done ticket nodes use the real app's 0.66 opacity and were excluded.
- Fixed in this pass: Restore copy says a restored map stays active until it is archived again, as the contract requires for finished, idle and closed maps. Phone reason filters went from 28px to 32px.
- Not checked: screen reader, full Tab traversal of every view, non-text contrast of borders and focus rings, reduced-motion rendering, touch devices, installed desktop app, live persistence.
- Known unrelated failure: `node --test tools/check.test.mjs` in this canvas reads a scaffold `variants/shell.js` that round 1 removed; it fails the same way at HEAD.

### Parent verification

- Re-ran canvas validation, `git diff --check`, typecheck, lint and the focused Vitest file after the Opus handoff. All passed; focused tests: 10 of 10.
- Inspected the running C archive view and the saved Opus screenshots of C and D.
- Full suite `bun run test --maxWorkers=4`: 1400 passed, one failed in `src/desktop/updaterEnabled.test.ts`, the not-ready UI retry readiness assertion. This run is not green. No updater code was changed, and no baseline attribution is claimed from this run.
