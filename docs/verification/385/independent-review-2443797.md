# #385 independent review of 2443797 (base 7097bd1)

Reviewer: fresh review agent, 2026-10-31. Implementation source was not changed.
The runtime proof was stopped partway by ECPL root #444 coordination, which put
new runtime runs on hold. Nothing here counts an assumption as proof.

## Code findings (most severe first)

1. **Medium: deliberate pointer entry depends on a 50 ms race** (`src/ui/canvasFocus.ts`, `recover`).
   If the canvas takes focus without a prior `focus-entry`, the code waits
   0 ms + 50 ms for the bridge's `pointerdown` message, then restores the host.
   On a loaded machine, or a slow out-of-process frame, a real click into the
   canvas can be reverted. The late `focus-entry` is then ignored because
   `activeElement !== frame`. The unit test sends the entry before the steal,
   so this order is never exercised. Only the full-app probe can show this, and
   it has not passed on the final build (see below).
2. **Low: a stale Tab intent can authorize a later steal.** `tabbing` is set on
   any Tab keydown and cleared only by a non-iframe `focusin`, `pointerdown` or
   a prevented Tab. If Tab moves focus out of the document (to the browser UI),
   no host `focusin` fires. A later canvas load or autofocus is then accepted as
   deliberate keyboard entry and not restored.
3. **Low: undocumented behaviour change in board options.** `viewerPrototypeBytes`
   now appends the full bridge to every `srcdoc` option on a canvas board, not
   only the focus messages. Inside a board option, tool shortcut keys and Escape
   now reach the viewer: Escape forwards to the host when no dialog or menu is
   open. `pushState` is also rewritten to `replaceState`. This is probably
   desirable and matches present mode, but neither the commit nor the tests
   state it. It needs an explicit check that Escape in a board option does what
   the approved viewer design expects.
4. **Low: the token is not a boundary.** The token goes to every document in the
   viewer subtree (`'*'` origin), so any prototype document there can forge
   `focus-entry`. The README states this, and the impact is limited to the
   prototype author's own canvas. Tiles never get the token. This is correct.
5. **Nit:** document and window listeners are never removed. The old code had
   the same pattern, and the viewer mounts once per page.

The core logic is correct for the stated cases. The owner is tracked from any
non-iframe `focusin` while the viewer is open, which covers pane/float map
controls. Restoration covers only iframe focus and checks `hasFocus()` so it
never activates an OS window. Tiles are `aria-hidden` in both `prototypeTile.ts`
and `prototypeBoard.ts`, which the non-canvas restore path requires.

## Do the harness assertions establish the criteria?

- Guarded probes check the exact field, the backward selection and `abZef`
  after typing. They do **not** check that focus actually left in the same
  guarded run (the recorded `focusEvents` are never asserted). Theft is shown
  only by the separate control. The control runs one pass in the pane size,
  not 30 s or all three sizes. That is enough to show each attack steals. It
  does not show theft happened during every guarded iteration.
- The #314 loading check asserts the right state on both the guarded and the
  control side. That is good.
- Restoration of a control **inside** the canvas is not asserted. Only the
  canvas frame as owner is checked, which matches the criteria wording.
- **Earlier screenshots and passes are stale.** `dist/` was built at 21:38 and
  the commit is from 22:01. No earlier run can be attributed to 2443797.

## Runtime attempts in this review (real server, no Git replay)

`bun run build` (06:52 local, OK). Then
`node dist/cli.js --repo RAbdelrhman/wayfinder-map --port 0 --no-open` → `http://127.0.0.1:57751`.
I left this server running (background task bpzfdt5u2) because coordination
forbids killing processes. The harness later stopped it when it hit its
background time limit. It has not been restarted while the hold is in place. With `FOCUS_APP_ORIGIN` set to that server and
`FOCUS_PROTOTYPES_FILE=.shots/focus-385/prototypes-live.json`:

1. `node docs/verification/385/runtime-matrix.mjs --control` → **Fail**:
   `locator.click: Timeout 15000ms` on the #314 "All rounds" entry (element not
   visible/stable). The page diagnostic itself timed out. Cold server: the page
   was likely busy with eager tile loads. Not yet confirmed.
2. The same command again → **Fail**: `waiting for locator('.vw-frame.is-ready')`
   timed out after 90 s. The canvas never reported ready from the real server.
   The earlier Electron replay runs failed the same way. So the replay route
   is not the only cause of the ready failure. The cause is undiagnosed: it
   could be a production ready regression from the srcdoc bridge injection, or
   slow first fetches of the pinned prototype files.

Raw files: `.shots/focus-385/chrome-control-failure*.json`. Both are kept as
failures.

## Acceptance

| Done when | Result | Evidence |
|---|---|---|
| Restore exact host control + selection after autofocus/dialog/SVG/nested-frame theft; continued typing; pane/float map control | **Not verified** | Unit tests pass (`vitest` 4 files, 73 tests). No full-app pass on the final build. |
| Open canvas load restores the selected viewer target, exact #314 flow | **Not verified** | The #314 step was not reached on the final build (ready timeout). |
| Live previews render and click through; pointer/Tab entry; native dialog keys | **Not verified** | Finding 1 is a risk to pointer entry. Finding 3 changes keyboard behaviour in board options. |
| 30 s full/pane/float probes, localhost + branch Electron, real previews, native load autofocus, stealing positive control | **Fail (current state)** | Both control runs failed before any probe. Electron was not run (on hold). |

Native OS foreground: stays **Not verified** and outside acceptance, as the owner decided.

## Map scope

1. New or changed UI that no chosen prototype shows? **No.** There is no new
   markup, copy or control. Focus moves back to existing controls. Finding 3
   changes keyboard behaviour inside board options, not visible UI.
2. A new control for something the app already has a control for? **No.**
3. Changes the same app part as another open #205 ticket that neither needs?
   **No.** At 10:59 UTC, #385 was the only open native sub-issue of #205
   (`gh api repos/RAbdelrhman/wayfinder-map/issues/205/sub_issues`).

## Smallest next step after root releases runtime work

Open the #314 canvas on the 57751 server (or a fresh one) in Chrome and read
the console and network logs for the `.vw-frame`. Find why `is-ready` never
sets, and check `ready` messages from the srcdoc-bridged options. Compare against
a 7097bd1 build. Only then rerun control → restoration for Chrome, and then
Electron.
