# Archive controls review, round 1

Ticket #288 on map #236. No layout or wording is approved yet. Both original options remain on the canvas. The implementation ticket #242 already has a native blocked-by relationship to #288.

- A: Active and Archived maps tabs in the repository view; compact archived rows.
- B: Archived maps opens a dedicated repository page; archived map cards.
- Both: Archive replaces Settle, Restore replaces Unsettle, and the Archived maps view replaces the collapsed Settled section. Opening an archived map retains its archive status. Restore is a separate action in the list and on the opened map.
- Reasons shown: Closed, Finished, Idle 30 days, Archived by you. Closed describes the GitHub issue; Finished describes all tickets being done. These fixtures do not implement automatic archive rules.
- All state is in memory. Reset demo restores the original fixture. No GitHub or app preference calls occur.
- The map detail uses schematic ticket cards solely to demonstrate archive status and Restore placement. It is not a replacement map design.

## Evidence

- `node prototypes/288-prototype-the-archive-controls-and-the-archived-maps-view/tools/check.mjs`: Canvas config OK.
- `bun run test src/ui/archivePrototype.test.ts`: four tests passed, covering the archive/open/restore journey and failed saves for both options.
- T3 collaborative browser: both variants inspected in light and dark at desktop and 390px widths. Both archive journeys passed evaluated assertions. Empty, loading, read failure and save failure fixtures rendered for both. No horizontal overflow at 390px.
- Keyboard: Tab and Enter exercised on A; focus-visible rendered a 3px blue outline. Restore hover exercised. Semantic headings, list, buttons, named searches and live alert/status roles inspected in the browser.
- Sampled contrast from runtime tokens: muted on plane 4.91:1 light, 6.73:1 dark; secondary on surface 7.73:1 light, 9.72:1 dark; primary button 5.25:1 both; focus on plane 4.76:1 light, 5.34:1 dark.
- `bun run typecheck` and `bun run lint`: passed after routing the test fixture HTML through `setTrustedHtml`.
- Initial full `bun run test`: 15 failed, 1343 passed, 33 skipped across 112 files. Failures in updaterEnabled, server, canvasScaffold, and eslintConfig under concurrent load. Rerun `bun run test --maxWorkers=4`: 113 files and 1395 tests passed, including the four archive prototype tests. The latest trustedHtml-only test edit passed typecheck/lint and a final focused rerun: four tests passed.
- Not checked: screen reader, exhaustive keyboard traversal, every color pair/control boundary, disabled/saving state, installed app, live persistence. No independent final verifier yet; approval is pending.

## Feedback process

Review A first, then B. For each, choose Keep, Change, or Combine in Notes, add detail, select the generated feedback line and paste it into the thread. Only submitted and agreed feedback is recorded in `note.disposition` and `note.feedback`. Remixes go on a new named round page with source IDs in `note.basedOn`. No disposition has been inferred or recorded.
