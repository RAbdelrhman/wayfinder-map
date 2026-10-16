# Manual archive journey, #242

Implements the G decision in `docs/design/map-archive-controls.md`. The existing per-account archive endpoint and persistence contract from #241 remain in use. #243 owns automatic finished-map archiving.

## Browser evidence

On 2026-10-16, the T3 collaborative Chromium preview exercised the built production `home.js`, `app.js`, styles, HTTP routes and disk-backed `SettleStore`. The server injected two isolated fixture maps under `octo/one` and a separate preference file, so the journey made no GitHub issue changes and did not modify the user's archive preferences.

- Archive on a finished map removed it from the active selection list and sidebar, and increased the Archived maps count.
- The sidebar Archived maps link opened the selectable archived list. The preview remained one Open map link, with Restore separate.
- Open displayed the archived map and its archive status without restoring it. The on-map Restore returned it to active, and a fresh repository page load showed it active. The saved preference contained `settled: false`.
- An unreadable fixture preference file caused Archive to show the save error and Try again, retaining the map in active lists. Repairing the file and pressing Try again completed Archive.
- Restore from the archived list removed its last entry and displayed the approved No archived maps state.
- Visual inspection covered the desktop active and archived layouts, the desktop dark theme, and the stacked archived view at 390 by 844 CSS pixels. The preview and action remain separate at narrow widths.

The fictional repository's icon endpoint returned 502 and used the existing initials fallback. Archive, snapshot and restore requests returned successfully except the deliberately failed save.

## Regression coverage

`src/ui/repositoryPage.test.ts` exercises selection without opening, the full manual journey, save failure and retry, refresh failure, archived preview failure and recovery, filtering, independent list selections and keyboard browsing. `archive.test.ts`, `repositoryView.test.ts` and `navigation.test.ts` cover archive wording, all four reasons, empty/loading states, zero-ticket previews and archive navigation. Existing server and settling tests cover the persistence endpoint and account isolation.

Preview reads retain the latest archive choice if a read completes during a save. A refreshed list starts a new preview generation, so older reads cannot replace newer data; a failed preview uses the approved refresh error and retry path.

Local checks passed: `bun run typecheck`, `bun run lint`, `bun run test --maxWorkers=2` with 124 files and 1,653 tests, the four focused archive/navigation suites with 57 tests, `bun run test:canvas` with 15 tests, `bun run test:tour-layout` with nine viewports, and `bun run build`. The first full run preceded the escaping fix and also hit the existing demo lint hook's 30-second timeout; the complete rerun passed without changing that hook or weakening its checks.

## Evidence limits

The browser journey used production code with fixture GitHub data, not live-provider data. Installed Windows release behavior, screen reader output and exhaustive accessibility checks were not verified here. Combined tutorial/archive verification belongs to #244.
