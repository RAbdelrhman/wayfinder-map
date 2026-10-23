# Tutorial and archive combined verification, #244

Verified on Windows 11 x64 on 2026-10-22 local time, against `387675081f0f4b34e1f4e1961cbbfbc9f4bb4b9a`, the current `origin/main` at the start of the run. No application code, UI, wording, or product behavior changed.

The contracts are #238's approved Spotlight A / E1 / S1 / F / G tour and wording sheet, including the #295 inert-background and #296 positioning fixes, and #288's approved G archive journey in `docs/design/map-archive-controls.md`. The archive lifecycle follows `docs/design/map-archive.md` and #243. All other sub-issues of map #236 were closed when #244 was claimed; native blockers #240, #242 and #243 were also closed.

## Runtime evidence

The same interaction sequence passed in installed Google Chrome at 1440 by 900 CSS pixels and in the actual Electron desktop shell loaded from this checkout's built `dist/desktop.cjs`. Electron launched the production main process, window, navigation boundary, runtime and HTTP server. This was a development Electron launch, not an installed release package.

Both runs used fictional GitHub issues and accounts. The browser fixture injects production `fetchMaps` into the real server. The desktop fixture loads the unmodified built desktop entry point and replaces `gh` subprocess results before startup. Both run the production GitHub map interpretation and automatic finished-map detection, archive HTTP handlers, UI and disk-backed `SettleStore`. Other subprocess APIs throw. Desktop home and Electron user data are redirected to `.shots/244/desktop-home`; browser preferences use `.shots/244/settled.json`. The fixture never launches a real `gh` or agent process. Desktop maps are public fixtures authored by Alice, with Bob following both, so both accounts legitimately see the same map IDs.

The browser fixture uses the injected-fetcher seam without a follow store, so it bypasses map visibility filtering; its Bob screenshot showing a private fixture map is an artifact of that seam. The desktop replay covers the real visibility and following path. Both replays exercise the real per-account archive store.

The browser first attempted T3 collaborative preview. Navigation worked, but two snapshots failed with `Preview automation snapshot timed out after 15000ms.` Verification then used the repository's `playwright-core` dependency and installed Chrome, plus Playwright's Electron driver for the desktop shell.

Both runs exercised:

- Fresh Home invitation, Not now, and a reload that did not invite again. A fresh invitation was then accepted, entered step one, and exited cleanly.
- Settings > Help > Take the tour, Exit tour, replay, all seven steps, scripted planning, Open the map, blocked ticket #6, ready ticket #5, Open in T3 Code, simulated hand-off completion and the completion card.
- Stored `completed` preference, return to Home without another invitation, replay after completion, and Escape to exit.
- Manual Archive of active fixture map #10, removal from active maps, archived list opening and the `Archived by you` reason.
- Opening archived map #10, checking the preference file before and after Open for exact equality, then restoring through the opened map's Restore control and seeing it active again.
- Automatic `Finished` archiving of map #20, whose single real-shaped fixture ticket is closed. Restore from the archived list persisted across a page reload even though the map stayed finished.
- Archiving #10 again, switching Alice to Bob in Settings > Account, observing #10 active and #20 automatically archived for Bob, then switching back and observing Alice's archived #10 and restored #20. Neither Alice's manual archive nor her Restore override leaked to Bob.

The complete demo sequence issued zero HTTP mutations in either run. The only application mutations in each complete recording were four archive/restore POSTs and two account-switch POSTs. The planning and hand-off were demo state changes only. Existing `demoIsolation.test.ts` also passed its dependency lint and hostile-global checks; the server suite's subprocess boundary tests passed.

Saved machine-readable observations are [browser results](244/browser-results.json) and [desktop results](244/desktop-results.json). Screenshots show the [browser archive](244/browser-archived.png), [browser Bob account](244/browser-bob.png), [desktop completion](244/desktop-completion.png), [desktop archive](244/desktop-archived.png), [desktop Bob account](244/desktop-bob.png), and [Alice after switching back](244/desktop-alice-return.png).

## Commands and replay

Run these from the repository root with the locked dependencies installed. Chrome and the development Electron binary must be available. The fixtures write only generated files under ignored `.shots/` and do not use real GitHub accounts. The desktop fixture seeds Bob's follows; it does not change product visibility rules.

```powershell
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run test --maxWorkers=2
bun run test:canvas
bun run test:tour-layout
bun run build
```

Results: frozen install and build succeeded; typecheck and lint exited 0; Vitest passed 128 files and 1,711 tests; canvas checks passed all 15 tests; rendered tour layout passed all nine viewports from 360 by 640 to 1440 by 900. The first pre-install attempts could not find `tsc`, `eslint` or `vitest`; they were rerun successfully after installation. The Vitest run emitted a Node localStorage-path warning without any failed tests.

Start the browser fixture in one terminal, then run the driver in another. Stop the fixture with Ctrl+C after the run.

```powershell
node docs/verification/244/browser-fixture.mjs
node docs/verification/244/flow.mjs
node docs/verification/244/desktop.mjs
```

The browser fixture listens on loopback port 4484. The desktop fixture uses the desktop runtime's port selection. The driver resets only the fixture preference file before each sequence, records mutation paths, asserts tour and archive state, captures screenshots and writes the result JSON. A failed assertion exits nonzero and saves a failure screenshot. The desktop driver closes its own Electron process on success or failure.

## Evidence limits

Installed Windows release packaging, Windows 10, ARM64, live GitHub keyring account switching, live-provider map data, cross-device preferences, screen-reader output and exhaustive accessibility are Not Verified. The ticket's desktop/browser flow checks passed with controlled provider fixtures; this report does not claim those untested integration or release layers. No real repository archive preferences or GitHub issues were changed by the runtime checks.

Independent verification and hosted PR state are recorded in the ticket closeout comment.
