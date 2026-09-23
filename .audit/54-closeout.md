Implemented the G3c goal-first, maps-only `/new-map` flow: repository search and contextual preselection, inline clone resolution with a fresh destination picker for each “Clone it for me” attempt, the existing Simple / Mid / Hard tier control (Mid default), example goals, prompt copy, and Start. The #68 planning route now carries the selected tier, reports hand-off status, offers retry/copy recovery after failed starts, and shows finished branch and pull-request links. Per #44 and #48, single-ticket hand-off stays in its map flow.

Integrated the local #55 / #68 / #69 prerequisite commits on this ticket branch. Implementation commit: `7fa709d` (`feat: redesign start a new map flow`). Branch: `wayfinder/54-redesign-the-start-a-new-map-flow`; local only, with no push or PR.

**PASS**
- `bun run test`: 32 files, 289 tests passed.
- `bun run typecheck` and `bun run lint` passed.
- `git diff --check` passed.

**NOT VERIFIED**
- Rendered light/dark browser comparison: there is no browser server serving this worktree, and I did not start one. The page styles use the existing theme tokens.
- Electron folder-picker interaction, a real GitHub clone, and a live T3 Code hand-off.