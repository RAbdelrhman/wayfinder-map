# #385 independent final review

Reviewer: Claude Opus 5.5, worked alone with no subagents. Date: 2026-10-31.
Reviewed `git diff origin/main...HEAD` at HEAD `4cae8bf` against origin/main `2e18090`.
The application source is `fad6c75`. `git diff fad6c75 HEAD -- src package.json` is empty, so HEAD adds only evidence docs.

**Verdict: Pass. All four Done-when criteria pass, and all three scope answers are No.**

The acceptance is the owner-amended issue body. Ramon chose restoration of the exact selected control, which replaces strict prevention. This review adds no gate for OS foreground, strict prevention or runtime upgrades.

## Done when

| # | Criterion (verbatim) | Result | Evidence |
|---|---|---|---|
| 1 | After browser-native autofocus, modal dialogs, SVG focus or nested background frames take focus, restore the user's exact selected host control and text selection. Verify continued typing in that control. In pane and float modes, preserve a deliberately selected map control too. | **Pass** | `canvasFocus.ts` stores the owner, the textarea selection range and direction, and DOM Ranges. On window blur it restores them with `preventScroll`. The runner covers seven attacks: svg, dialog, autofocus, nested, nested-svg, native-load and window. Each runs inside the real AC3 #347 board3 live preview. Every guarded iteration asserts four things: a background-frame blur was observed, the same textarea is active, the selection is `[2,4,'backward']`, and typing Z gives `abZef`. Final guarded runs on `fad6c75` restored 63/70/70 attacks in Chrome and 49/56/49 in Electron (full/pane/float), with no failures. In pane and float, the runner also asserts that a focused `#app` button survives a native-load attack. |
| 2 | Loading the open canvas restores the focus target deliberately selected in the host viewer, including the exact #314 loading/autofocus flow. | **Pass** | The runner holds the real B4 repost document for 1.2 s, focuses Close, and waits for the real `#p314-dialog[open]`. Its `showModal` and autofocus Cancel then run. `loading314.selectedClose` was true in the guarded Chrome and Electron runs and false in both controls. Unit test: "restores the host when the loading open canvas takes focus". |
| 3 | Live previews render and click through; deliberate pointer and Tab entry into the interactive canvas and native dialog keyboard behavior still work. | **Pass** | The live preview `#347 · Prototypes board, Round 3` rendered with textLength 4215. Clicking the live decision tile opened its canvas `src` in the same app window with the page count unchanged, in both guarded runs. In every size, the actual #314 Post click put focus on the autofocus Cancel, the vw-frame got focus, Tab moved to Post, Escape closed the dialog, the canvas owner survived a tile SVG attack, keyboard Tab entered the canvas, and in full size Shift+Tab wrapped into it. |
| 4 | Regression tests and focusin/window-blur probes exercise the complete localhost viewer and branch-built Electron application for 30 seconds in full, pane and float sizes, including actual tile/decision-board previews, native document-load autofocus, and an unguarded positive control that demonstrably steals focus. Preserve any positive-control failure as a failure. | **Pass** | Probe durations, all at least 30 s: Chrome control 30.2/31.1/32.1 s, Chrome guarded 31.7/31.8/31.7 s, Electron control 32.2/32.2/30.4 s, Electron guarded 30.4/31.3/34.4 s. The control removes exactly one `mountCanvasFocus` call (`split(call).length === 2` is asserted), and every attack stole focus: 91/98/98 in Chrome and 91/91/77 in Electron. Electron ran as the branch `electron .` (Electron 44.4.3, Chromium 152) with a fresh profile. Chrome 156 ran headed. `earlierFailures` keeps seven failed runs as Fail, including the post-a86 pane dialog failure. `control-setup-failure.json` keeps the OS-foreground experiment as failed and Not verified. |

## Checks I ran

- **Evidence integrity:** the SHA-256 of each timestamped raw result matches `runtime-evidence.json` `rawSha256` for all four runs. Each canonical `chrome-control.json`, `chrome-restoration.json`, `electron-control.json` and `electron-restoration.json` is byte-identical (`cmp`) to its timestamped file. The current `dist/cli.js`, `dist/desktop.cjs` and `dist/ui/app.js` hashes match the recorded `buildHashes`. The `prototypes-live.json` SHA `67268e66…` matches the recorded metadata hash. Every run records `sourceHead` `fad6c75`. `run-final.ps1` runs the four commands serially, stops on the first failure, and clears `FOCUS_GIT_REPLAY`.
- **Focused tests:** `bunx vitest run` on the canvasFocus, canvasBridge, canvasViewer, canvasViewerMount and canvasDestination tests: 5 files and 79 tests passed. `bun run typecheck` and `bun run lint` are clean. I did not rerun the full suite. The author's full-suite result (154 files, 2052 tests) is accepted as reported.
- **Gap I closed:** every final guarded run used `--slow-entry` (350 ms), so the normal-timing pointer path was not in the final evidence. That path goes through the 50 ms allowance branch and the `document.activeElement === frame` branch. I ran a copy of the runner whose only change was the artifact directory, with zero delay and `--smoke`, against a fresh branch CLI server and the same metadata replay, in headed Chrome. It exited cleanly on HEAD `4cae8bf`. Each size restored 7 of 7 attacks, the #314 loading flow restored Close, and every size passed the dialog, Tab, Escape, keyboard entry and map-focus checks. The click-through stayed in the app. Raw file: `.shots/focus-385-independent/chrome-restoration-1793447490911.json`, SHA-256 `24c0b69d…3d32`. This is a 2-second smoke run, not 30-second acceptance evidence. I did not repeat it in Electron.

## Source findings

None of these blocks the merge.

1. **Minor inconsistency.** `canvasOptionFocusBridge` accepts a `focus-config` token of any length. `canvasBridge` caps it at 100 characters (`src/canvasBridge.ts`, `focus-config` handlers). The host always sends a UUID, so the behavior is the same either way.
2. **Redundant check.** `data['wf'] === 1` is tested again on the `focus-leave` line of `src/ui/canvasFocus.ts`, after the early return has already established it.
3. **Documented boundary.** A canvas prototype in the configured subtree can forge `focus-entry` and `focus-leave`. Keystrokes can also reach the frame during the transient window of 0 to 50 ms before recovery. The README calls both out ("not a security boundary", "not proof that every keystroke… can never be redirected"). This is within the restoration acceptance.
4. **Evidence wording.** Control runs are labelled `result: "Pass"` in `runtime-evidence.json`, meaning the positive control stole focus. Each probe's per-method `result: "Focus theft observed"` makes that clear, so this is acceptable.
5. **Behavior change, in scope.** The old handler restored focus only when an out-of-viewer `aria-hidden` tile took it. The new one also covers the open canvas frame, which criterion 2 requires, and it falls back to `viewer [data-close]` where the old code used `toolbar [data-close]`. Close stays in the same toolbar. No UI changes.

## Scope (map #205, rechecked live)

The `issues/205/sub_issues` endpoint lists #385 as the only open sibling. Open PRs: #368 is prototype #366 on map #217 and touches only its own `prototypes/366-*` files. #381 is the release-please PR. origin/main `2e18090` is ahead in `app.ts`, `index.html`, `notifications.ts` and `styles.css` (snackbar removal from #386). That does not touch `canvasFocus`, `canvasBridge`, `canvasViewer` or `prototypes`.

1. **Does the diff add or change UI that no chosen prototype shows? No.** No markup, CSS, copy or controls change. Focus restoration stays inside the existing ACF4/D4/AC3 viewer.
2. **Does it add a control for something the app already has one for? No.** It adds no control. It replaces the existing tile focus-restore handler inside `canvasViewer.ts`.
3. **Does it change a part of the app that another open ticket on the map also changes, when neither needs the other? No.** No other ticket on map #205 is open, and the open PRs don't overlap with these files.
