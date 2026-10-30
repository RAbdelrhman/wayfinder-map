I reran the targeted tests and both runtime probes myself, and checked the source, the artifacts and the live map #205. **The preparation is correct: the patch is right for what it does and the evidence matches the code. Shipping, merging and closing #360 stay blocked.** No Done-when item passes at the runtime and application layer you required, and the stable runtimes we ship on ignore the policy. I made no edits.

## What I ran
- **Diff (`origin/main...HEAD`, HEAD 916f0e8):** 11 files. The app code change is one `allow="focus-without-user-activation 'none'"` attribute added to the iframe in `src/ui/canvasViewer.ts:50`, `src/ui/prototypeTile.ts:75` and `src/ui/prototypeBoard.ts:188`. Sandbox, `tabindex`, `aria-hidden` and the existing preview focus guard (`PREVIEW_FOCUS_GUARD`, `src/canvasBridge.ts:426`) are unchanged.
- **Targeted tests:** `npx vitest run` on the three changed test files gave 3 files and 87 tests passed.
- **Chrome 158 Beta, no flags:** `CHROME_PATH=…beta… node scripts/check-prototype-focus.mjs` exited 0. The policy is reported as supported. All 12 allow controls moved focus into the iframe and logged `blur`. All 12 deny cases kept focus on the host button with no `blur`. Click entry, dialog autofocus, Tab and Escape passed. This matches the committed `chrome-158-beta.json`.
- **Electron 44.4.3 / Chromium 152:** two runs with `ELECTRON_PATH=…` both exited 1 and reported the policy as unsupported.
  - Run 2: all 6 viewer allow controls stole focus, then the first denied HTML case also moved focus and logged `blur`. This matches the README.
  - Run 1 failed earlier, on a positive control: it expected focus in the iframe and found it on the host button. So the controls are flaky in Electron.
- **Map #205:** the live GraphQL query shows #360 is the only open sub-issue.

## Findings
1. **High (blocks shipping, not preparation):** the stable runtimes ignore the policy. Electron 44 (pinned in `package.json:49`) and installed Chrome 156 both fail the denied cases, so the change protects no shipped user today. Your strict-prevention gate stands.
2. **Medium, `scripts/check-prototype-focus.mjs`:** the fixture doesn't cover the loading case in Done-when 2.
   - Every focus attempt is triggered by a `postMessage` after the iframe has loaded. Nothing tests an `autofocus` attribute or a `focus()` call that fires while the document is loading, which is the #314 flow.
   - The "autofocus" case is a dialog opened later on command, not document-load autofocus.
   - Each probe watches for 500 ms, not the 30-second window.
3. **Medium, coverage:** the tile and decision-board iframes (lazy-loaded, `tabindex=-1`, sometimes `hidden`) are only checked by string tests. The fixture renders only `canvasFrameHtml`, with an optional name attribute added.
4. **Medium, possible scope gap, `src/ui/inlineCanvas.ts:23`:** the inline canvas embed added in #382 creates a sandboxed canvas iframe without the attribute. If #360's "viewer" includes that embed, it is still exposed. If not, the README should say it's excluded. I didn't run a probe against that surface.
5. **Low, `docs/verification/360/chrome-156.json` and `electron-44.json`:** both were recorded with an earlier script revision. They have 6 rows covering html, svg, dialog and nested only, with no autofocus or window cases. The README doesn't say this. The conclusion is unchanged; my Electron run on the current script reproduces it.
6. **Low:** the Electron positive control is flaky (run 1 above). The 500 ms wait plus `bringToFront` timing likely needs a retry or a longer settle time before the Electron result counts as a gate.
7. **Low, not verified:** runtimes without support may log an "Unrecognized feature" console warning for every tile iframe. I didn't check this.

## Done-when grades (required runtime and application layer)
| Item | Grade | Basis |
|---|---|---|
| 1. Native autofocus, dialog, SVG and nested focus can't leave the viewer | **Fail** at stable Chrome and Electron 44. Pass only in the Beta fixture. | My Electron runs; the Beta fixture |
| 2. Loading doesn't override the host's chosen focus target | **Not verified** | No load-time probe; the #314 flow was never run |
| 3. Previews render and click through; canvas focus and dialog keys still work | **Not verified** in the app. Pass in the Beta fixture only (click, dialog, Tab, Escape). | Fixture only; no full viewer or tiles |
| 4. Regression tests and probes on localhost and branch-built Electron, with positive controls | **Fail** | Probes target a fixture page, not the app; Electron controls flaky; denied cases fail |

## Your three questions
- Does the diff add or change UI that no chosen prototype shows? **No.** It adds an invisible permission attribute only: no markup, copy, layout or control changes.
- Does it add a duplicate control? **No.**
- Does it change a part that another open ticket on map #205 also changes, without a dependency? **No.** #360 is the only open sub-issue.

## Verdict
- **Preparation:** correct and honestly documented. The attribute is the right mechanism, the string tests pin it, the fixture has real positive controls and fails closed on runtimes without support, and the README claims no Done-when item.
- **Shipping, merge and close:** blocked. It needs:
  - a stable Chrome and an Electron version that enforce the policy without flags;
  - a load-time autofocus probe for the #314 flow;
  - 30-second probes in full, pane and float layouts, in the complete localhost app and the branch-built Electron app, covering tiles and the board;
  - a decision on whether the inline canvas embed is in scope.

No fallback is recommended, in line with your decision.
