# #360 focus prevention preparation

Ramon chose strict prevention on 2026-10-30. The ticket remains open and shipping
requires supported browser and Electron runtimes. A detect-and-restore fallback
with transient focus loss is not accepted. See the
[decision](https://github.com/RAbdelrhman/wayfinder-map/issues/360#issuecomment-6524917203).

## Change

The viewer, prototype tile and decision-board preview iframes deny the
`focus-without-user-activation` permission. Supporting browsers enforce this
across descendant documents, including opaque-origin and srcdoc frames. User
interaction can enter the frame, and focus can move within its focused subtree.
The sandbox capabilities, visible controls, copy and layout are unchanged.

No runtime switch or dependency upgrade enables experimental enforcement in the
shipped application. The existing limited preview script guard remains in place.
Older browsers ignore the new permission, so this patch alone does not complete
the ticket on current stable runtimes.

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

## Observed results

- Chrome 158.0.8127.2 **Beta**, no experimental flags: all 12 allow controls moved
  focus to the iframe and logged blur; all 12 deny cases retained the host button
  without blur. Click entry and dialog autofocus, Tab and Escape passed.
- Installed Chrome 156: policy unsupported. The positive controls worked, and
  the first denied HTML-focus case still moved focus and logged blur. Exit 1.
- Electron 44.4.3 / Chromium 152.0.7977.130, visible fixture: policy unsupported.
  The positive controls worked, and the first denied HTML-focus case still moved
  focus and logged blur. Exit 1.

The checked-in JSON files preserve those observations. Chrome Beta fixture proof
does not establish stable-browser, installed-app or complete-viewer acceptance.

After merging current `origin/main`, `bun run typecheck`, `bun run lint` and
`bun run test` passed: 153 test files and 2,030 tests. `bun install --frozen-lockfile`
also completed the branch build. Three hand-off restart failures on the original
base reproduced unchanged in a detached baseline; main's existing scenario-clock
fix resolved them without changes to that subsystem in this ticket's diff.

## Remaining acceptance gates

None of the ticket's four Done-when items is claimed complete. Still required:
supported stable runtime enforcement; the exact #314 loading/autofocus flow;
30-second full, pane and float probes in the complete localhost viewer and
branch-built Electron application; preview click-through; interactive canvas
and dialog behavior in those application flows; independent all-Pass verification
and all three scope answers No before shipping, merge or closure.
