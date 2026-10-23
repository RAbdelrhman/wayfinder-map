# #318 independent acceptance review, round 3

Reviewed 2026-10-23. **Verdict: Pass. All six Done-when items pass within the evidence boundaries below; all three scope answers are No. No outstanding correctness finding.** R2's held-key defect is fixed. This is acceptance review of the local change, not hosted CI, installed-release, or merge approval.

I did not implement this change or delegate this review. My only authored workspace file is this report. I did not commit, push, merge, change a ticket, post a message/comment, or rerun the parent-owned full test suite.

## Scope and identity

- Reviewed the complete tracked production/test diff against `origin/main`, all six untracked production/test files, and the verification document, durable runtime script, both result JSON files and both documentation screenshots. Browser profiles and generated output are supporting artifacts, not proposed application source.
- Read applicable `AGENTS.md` and `CODING_STANDARDS.md`, and R1/R2 reports as leads. Compared production with the actual #292 `config.js` changed-reset/D round-3 selection, `variants/shortcuts.js`, `variants/fixtures.js`, and associated styling. The explicit owner decisions supplied in this review request govern the policies that the original prototype left proposed.
- Repository: `RAbdelrhman/wayfinder-map`. `origin/HEAD` resolves to `origin/main`. Both local HEAD and `origin/main` are `838ef875dea9f5e41b86a19cd308a7f28767a710`; a live `git ls-remote origin refs/heads/main` returned that same SHA. The change remains uncommitted in this dedicated worktree. No unrelated default-branch reversion was found.
- The ten tracked modified files and six new source/test files stayed unchanged during my review. Verification scripts/results were updated by the implementer during this review, and I read their final versions.
- Final SHA-256 fingerprints: `src/canvasBridge.ts` = `9f19f03d3da7caf0b90864b33cc97d641c5323a18d619593812a76a0f3c98648`; `src/canvasShortcuts.ts` = `b0763b1065d24cfede82515d62ca9843f8c409f69357a52db96a078586e541d0`; `src/canvasBridge.test.ts` = `25f3959e7e3f9275f701fa0a4f98073b66343d1c645331b4dea0ae717cb69d61`. These identify the reviewed uncommitted fix more precisely than HEAD alone.

## Independent repeat verification

The production matcher now accepts an optional `includeRepeat` argument. The bridge calls it with `true`, consumes matching initial and repeat keydowns in window capture, and posts only a nonrepeat activation. This preserves ownership before the engine's document listener regardless of registration order. Capture in Settings and ordinary host tool activation still reject repeats.

I ran a separate PowerShell here-string through `node --input-type=module`, with no written script or production changes. It bundled the current bridge through esbuild with `write:false`, registered the actual listener extracted from `prototypes/canvas/canvas.js` before the production bridge in Happy DOM, supplied the parent configuration, then dispatched the initial keydown followed by three repeat keydowns. Engine action callbacks were counters; both listeners, matching and propagation were actual source.

| Configuration/input | Tool messages after all four keydowns | Engine theme/menu/notes calls | All keydowns consumed |
| --- | --- | --- | --- |
| Pin=T, `t` | 1 | 0 / 0 / 0 | Yes |
| Pin=Shift+P, shifted `P` | 1 | 0 / 0 / 0 | Yes |
| Pin=Q, default Note=N, `n` | 1 | 0 / 0 / 0 | Yes |

Text input produced no extra tool messages. The script exited 0 and printed `PASS: actual engine registered before production bridge; three repeated keydowns consumed, one tool message per scenario.` Unlike a check of `defaultPrevented` alone, the counters would detect the original engine action even if that listener subsequently prevented the event.

I also independently exercised the real viewer in a new headless Chrome context against localhost port 4488. A Node stdin script used Playwright Core, the real canvas HTML/CSS/engine, in-memory-built `viewerPrototypeBytes`, controlled prototype responses at the network boundary, real Settings saves and Back, and real browser `keyboard.down` twice then `up` with engine-toolbar focus. No capture, store, history, viewer handler or engine command was mocked. Observed output:

```json
{"assignment":"T","pressed":"true","messages":[{"wf":1,"type":"key","key":"T"}],"themeBefore":"☀ Light","themeAfter":"☀ Light","menu":false}
{"assignment":"Shift+P","pressed":"true","messages":[{"wf":1,"type":"key","key":"Shift+P"}],"themeBefore":"☀ Light","themeAfter":"☀ Light","menu":false}
```

That script exited 0. This is fresh localhost Chromium integration evidence, not a reviewer-run desktop matrix. The durable regression in `src/canvasBridge.test.ts` independently covers initial/repeat T, Shift+P and N through the real engine listener, one message per action, unassigned P, standalone behavior and text exclusion.

T3 preview opened successfully, but two snapshot attempts returned the raw error `Preview automation snapshot timed out after 15000ms.` I then used the repository's browser automation approach. No failed T3 inspection is counted as successful runtime evidence; I closed my preview tab afterward.

## Done-when assessment, word for word

### 1. Pass

> Implement the selected D UI using the existing Settings components and tokens, without adding controls or behavior beyond the chosen prototype. Keep all five tools and D's selective-reset confirmation.

`src/ui/canvasShortcutSettings.ts` preserves D/inherited C's five compact icon/name/key rows, row/key inline capture, named clash and owner action, changed marker, Saved treatment, defaults footer and selective reset dialog. `src/ui/settings.ts` and `settingsPage.ts` integrate the existing Settings category structure, icon helpers and save note; added CSS uses existing app tokens. There is no B per-key default button, extra policy control, or feedback-post confirmation.

The changed-only dialog count/list uses differences from P/E/C/N/F, including singular/plural copy. Zero changes makes Reset aria-disabled with a guarded no-op. Cancel/Escape preserve assignments; only returned `restored` IDs receive Saved. Focused tests cover these cases and newer competing edits. I independently inspected the supplied Electron light and localhost 390px dark screenshots; their visible rows, Settings navigation, return button and Saved/default treatment agree with D. These screenshots were captured by the implementer, not by me.

### 2. Pass

> Persist valid assignments with precise validation, preserve the previous assignment on clash/cancellation, and keep the displayed viewer hints and actual tool-key handlers consistent. Prevent tool shortcuts from firing while editing text.

`src/canvasShortcuts.ts` provides typed ASCII event.key matching, canonical Ctrl/Alt/Shift ordering, complete-snapshot validation, named tool and app/browser conflicts, validation again at write time, read/merge/write under Web Locks, and selective reset against the confirmation snapshot. Storage failures do not announce durable success; newer edits are preserved or a conflicting reset is rejected. Storage notifications re-read without echo writes, satisfying the repository's shared-state standards.

Settings preserves assignments on conflict and cancellation and announces success after persistence. `CanvasFeedback` derives visible/ARIA hints and host handlers from the same saved assignments. Text controls and contenteditable descendants are excluded. The bridge validates actual-parent configuration, forwards configuration through nested frames, restricts relayed keys to configured assignments, and excludes text entry. Viewer message-source and Settings return-source/origin guards remain intact.

R1's ordinary-key collision and R2's repeat leak are both resolved. The independent listener and browser checks above establish that configured held keys retain priority without repeated tool activation. Composition/dead/AltGr/Meta behavior has focused tests and follows the submitted decisions.

### 3. Pass for the specified desktop/localhost matrix, with explicit limits

> Shortcuts lands on Keyboard shortcuts with appropriate focus; Back to canvas restores the canvas option and viewer context. Exercise the full flow in desktop and localhost, both themes, narrow layout, keyboard/focus and announcements.

`src/ui/canvasSettings.ts` retains the live mounted viewer behind full Settings, focuses the arrival heading on load, passes canvas title/option context, verifies the return sender, and restores the previous history entry. `canvasViewer.ts` resynchronizes hints, restores Shortcuts focus, suppresses hidden-viewer keys and retains inert state during resize. `canvasShortcutSettings.ts` and `settings.ts` implement the contextual Back, arrival highlight, live region and category navigation.

I inspected the final durable script and results plus implementer-run `.audit/localhost-r3-fixed.log` and `.audit/desktop-r3-diagnostic.log`. Both logs complete all 12 cases and the held T/Shift+P engine-priority checks. The final script writes results only after those checks and the real engine theme-button assertion succeed. Both copied documentation result files have `realEngine: true`; programmatic inspection found every required flag true in all 24 cases:

- Source-built Electron, origin `http://127.0.0.1:62897`: light/dark, 1280/900px, full/pane/float, 12 cases.
- Localhost Chromium, origin `http://127.0.0.1:4488`: light/dark, 1280/390px, full/pane/float, 12 cases.

Each case asserts heading focus, named tool/reserved clashes, capture Escape, immediate save/live-region text, one-change reset/Escape, two-change reset/Cancel/confirmation, Saved on exactly the restored rows, contextual Back, the same canvas iframe and option B, updated hints, host/nested-frame handling, and text exclusion. The script uses actual served app code and controlled prototype bytes, not mocked Settings/history/keyboard handlers. This full matrix is implementer-run evidence inspected independently; my fresh browser replay was the focused repeat check above.

Earlier failures remain part of the record. `.audit/localhost-r3.log` completed 12 cases but timed out in the held-key assertion. The implementer identified a harness action that toggled the tool twice; the final script focuses the engine, sends two downs and one up, and succeeds. `.audit/desktop-r3.log` timed out taking a screenshot; `.audit/desktop-r3-fixed.log` timed out waiting for the option-B return label. The final diagnostic run completes every assertion without a production change. These failed attempts do not prove a product defect, and I do not claim their precise causes were all established. They are superseded for successful-flow evidence by the completed run, while remaining evidence of automation flakiness. Final catch diagnostics retain frame URL and Back-button HTML.

At 390px, baseline pane/float toolbar clipping remains; those two modes enter Shortcuts by keyboard. Full/390 and wider cases use the pointer. Settings itself has no tested horizontal overflow. This does not claim pointer access to the clipped narrow pane/float button or authorize a new layout. Desktop means source-built Electron, not an installed release/update. Announcements mean verified live text/ARIA/focus, not physical screen-reader speech. Physical IME hardware, arbitrary OS/user-installed hotkeys, forced colors and a comprehensive Tab-order audit remain Not Verified. The initial real-#292 roundtrip and browser category/Back/Forward exploration are carried-forward implementer evidence, not my fresh replay.

### 4. Pass

> Add meaningful tests with the repository runner for normalization, conflicts, save/reset/cancel and viewer integration. Typecheck, lint, tests and changed-flow checks pass with evidence.

Independently executed against the reviewed source:

```text
npx vitest run src/canvasShortcuts.test.ts src/ui/canvasShortcutSettings.test.ts src/ui/canvasSettings.test.ts src/canvasBridge.test.ts src/ui/canvasFeedback.test.ts src/ui/canvasViewer.test.ts --maxWorkers=1 --cache=false
Test Files  6 passed (6)
Tests       83 passed (83)
Exit        0

npm run typecheck
Exit        0, no diagnostics

npm run lint
Exit        0, no diagnostics

git diff --check
Exit        0, LF-to-CRLF warning only
```

These tests cover normalization, invalid/duplicate/reserved snapshots, named conflicts, durable save and storage failures, competing writes, snapshot reset/cancel, selective Saved marks, focus/live regions, contextual return, sender boundaries, hints/handlers and the actual-engine held-key regression. They exercise behavior rather than merely mirroring markup or helper implementation.

I inspected the completed parent-owned `.audit/tests-318-r3.log`: `npm test -- --maxWorkers=2`, **132 files and 1765 tests passed**, start 09:21:13, duration 193.88s, after the final production/test edit at 09:20:48. The owner reports exit 0. Existing Node localstorage-file warnings are present, with no failing tests. I did not repeat that full suite. Auxiliary carried-forward logs show canvas checks 15/15 and tour checks 9/9. Build exit 0 is owner-reported; built app output was exercised by the runtime checks, and I did not rebuild.

The final two completed 12-case matrices, their engine screen-control assertions, and my independent listener and real-viewer held-key checks provide changed-flow evidence. The earlier incomplete attempts are disclosed under item 3, not counted as passing runs.

### 5. Pass

> Resolve any unchosen system-reserved shortcut policy, platform/IME handling or pane/float routing behavior with the user before building additional UI or behavior. Reserved combinations and baseline B's per-key default button were proposals, not automatically chosen with C.

The supplied current owner decisions explicitly settle this: block and name existing app/browser actions in D's error treatment; typed A-Z with Shift/Alt/Ctrl; ignore composition/dead/AltGr; Meta unavailable; saved viewer keys win engine commands; preserve existing pane/float routing. The implementation follows those submitted decisions and adds no per-key default or policy-selection UI. There is no unresolved product question. I use the user's supplied decisions as authority; I did not independently retrieve the private T3 question-card transcript.

### 6. Pass, this report

> A fresh independent verifier checks these Done-when items word for word and the three map scope questions before merge.

This report independently checks all six original items verbatim and all three exact scope questions below. It does not substitute for required hosted CI/review or perform merge/closeout.

## Exact map scope questions

### Does the diff add or change UI that no chosen prototype shows?

**No.** Compact inline rows, five tools, named conflict/owner action, Saved/default treatment, selective reset, viewer entry, full Settings and contextual Back are in D/inherited C. Reserved-action names reuse D's error line under the explicit owner decision. No B per-key default or #314/#322 posting-confirmation UI is added.

### Does it add a control for something the app already has one for?

**No.** There is one shortcut editor and one selective Reset. The viewer entry opens that same editor. No duplicate tool/editor/viewer-size control is introduced. Existing engine screen controls remain available under the explicit priority decision.

### Does it change a part of the app that another open ticket on the map also changes, when neither needs the other?

**No, checked live.** I read GitHub map #205 and its native sub-issues, #318, and native `blocked_by` edges for #318/#322. Open map children are #215, #318 and #322. #215 owns README/release documentation, untouched here. #322 overlaps production viewer/feedback code but explicitly depends on #318; its other blocker is closed #304. #318's required predecessors #292/#304/#305 are closed. Prototype-only #310/#314 are closed and their isolated canvases are unchanged. No unsequenced open overlap was found.

Live `git ls-remote --heads origin prototype/292-prototype-settings-keyboard-shortcuts-for-the-canvas-viewer-s-to` confirmed the retained #292 branch at `40b30553c3b2fdb895afbf2da71506ae63e496d0`. Retain it through later merge/closeout as required.

## Handoff

The local acceptance review passes, with R2's sole correctness objection closed and all three scope answers No. No required local acceptance item remains failed or missing within the stated evidence boundary. Hosted CI/review and lifecycle actions remain with the parent task. I left #318 open and made no commit, push, merge or hosted mutation.
