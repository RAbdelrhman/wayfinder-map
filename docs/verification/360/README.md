# #360 focus prevention evidence

Ramon initially required supported browser and Electron runtimes before shipping.
After reviewing the runtime failures and missing application proof, he explicitly
authorized shipping this patch: "you can ship I'm telling you ship". That direction
supersedes the earlier shipping hold; it does not change the observed results into
passes. The [earlier decision](https://github.com/RAbdelrhman/wayfinder-map/issues/360#issuecomment-6524917203)
is retained as history. No detect-and-restore fallback is included.

## Change

The viewer, prototype tile and decision-board preview iframes deny the
`focus-without-user-activation` permission. Supporting browsers enforce this
across descendant documents, including opaque-origin and srcdoc frames. User
interaction can enter the frame, and focus can move within its focused subtree.
The sandbox capabilities, visible controls, copy and layout are unchanged.
The separate inline canvas embedded in the T3 MCP tool host is outside this
map-viewer ticket; it has no background map tiles. This patch does not change it.

No runtime switch or dependency upgrade enables experimental enforcement in the
shipped application. The existing limited preview script guard remains in place.
Older browsers ignore the new permission, so this patch alone does not complete
the original strict acceptance criteria on current stable runtimes.

## Reproduce

Run `node scripts/check-prototype-focus.mjs` in a visible, focused browser. Set
`CHROME_PATH` to a supported Chrome executable to select a different runtime, or
`ELECTRON_PATH` to an Electron executable for the Electron fixture. The script
bundles the current branch's `canvasFrameHtml` and serves a localhost fixture.
It does not launch the complete Wayfinder application. No experimental launch
flags are used. Results are written under `.shots/focus-360/`.

The script records host `focusin` and window `blur`, with explicit allow-policy
positive controls and deny-policy cases. It exercises HTML focus, SVG focus,
modal dialogs, autofocus inside a dynamically opened dialog, window focus, and
nested srcdoc focus, both with and without the preview frame name. It also
checks click entry, native dialog autofocus after entry, Tab and Escape.
It also navigates a blank iframe after the host button owns focus, then opens
a modal with an autofocus field synchronously during document parsing. The
allow control must steal focus; the deny case must retain the host target.
This synthetic load case does not replace testing the actual #314 document.

## Observed results

- Chrome 158.0.8127.2 **Beta**, no experimental flags: all 12 allow controls moved
  focus to the iframe and logged blur; all 12 deny cases retained the host button
  without blur. Click entry and dialog autofocus, Tab and Escape passed.
  The added parser-time modal/autofocus control also stole focus, and the
  matching denied load retained the deliberately chosen host button.
- Installed Chrome 156: policy unsupported. The positive controls worked, and
  the first denied HTML-focus case still moved focus and logged blur. Exit 1.
- Electron 44.4.3 / Chromium 152.0.7977.130, visible fixture: policy unsupported.
  The positive controls worked, and the first denied HTML-focus case still moved
  focus and logged blur. Exit 1.

The checked-in JSON files preserve those observations. Chrome Beta fixture proof
does not establish stable-browser, installed-app or complete-viewer acceptance.
The checked-in Chrome 156 and Electron 44 files came from an earlier runner
revision with four mechanisms, before window focus and dialog-autofocus cases
were added. They establish failure of the first denied HTML-focus case, not a
completed run of the current matrix. Independent verification also reproduced
that failure with the current runner.

The independent verifier found an Electron control race while the visible window
was acquiring focus. The runner now explicitly focuses the Electron window,
waits for the host button to own focus before each attempt, and waits for actual
focus transfer in allow controls. It never retries or treats an unobserved
positive control as a pass. This setup still needs re-verification on a future
supporting Electron runtime. Current failure is not acceptance proof.

The independent report was written against commit `916f0e8`, before these probe
setup and synthetic loading additions. Its acceptance findings remain unchanged;
the follow-up probe changes do not constitute a new independent all-Pass review.
The owner subsequently authorized shipping despite those findings.

After merging current `origin/main`, `bun run typecheck`, `bun run lint` and
`bun run test` passed: 153 test files and 2,030 tests. `bun install --frozen-lockfile`
also completed the branch build. Three hand-off restart failures on the original
base reproduced unchanged in a detached baseline; main's existing scenario-clock
fix resolved them without changes to that subsystem in this ticket's diff.

## Remaining verification

None of the ticket's four original Done-when items is claimed complete. Remaining:
supported stable runtime enforcement; the exact #314 loading/autofocus flow;
30-second full, pane and float probes in the complete localhost viewer and
branch-built Electron application; preview click-through; interactive canvas
and dialog behavior in those application flows; independent all-Pass verification
and independent all-Pass verification. The verifier answered all three scope
questions No. These gaps remain recorded for follow-up after the owner-authorized
shipment; they are not represented as completed acceptance proof.
