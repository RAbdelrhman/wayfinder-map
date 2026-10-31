# #385 selected-focus restoration

Ramon chose the structured question card: "Restore the exact selected host
control after unwanted focus moves (Recommended). Smaller change; revise strict
prevention acceptance to allow restoration, then verify typing, dialogs and all
viewer sizes." The approval is recorded in the #385 thread and the issue's
Owner-approved acceptance amendment. This supersedes the supported-runtime
waiting gate and strict source-prevention criteria. It does not turn the earlier
Chrome/Electron permission-policy failures into passes.

## Implementation

The shared viewer remembers the selected host control and restores its text
selection when a background preview or loading canvas takes focus. Deliberate
map focus remains the owner in pane and float sizes. A missing/hidden control
falls back to Close. Restoration uses `preventScroll` and does not call
`window.focus()` to activate an OS window.

The canvas bridge reports trusted pointer entry and blur directly from the
configured viewer subtree. A per-frame token separates that subtree from tile
previews. Child-to-child transfers need these blur reports because they do not
necessarily emit another host-window blur. Generated srcdoc options receive the
same bridge. The new bridge messages remain dormant without configuration from
the map viewer, including in the separate inline MCP embed.

Chromium can blur the host before dispatching pointerdown in another renderer.
An unexpected move into the viewer therefore gets a 50 ms allowance for the
entry notification. A later trusted entry report still restores canvas ownership
if no newer host action has superseded the click, so deliberate pointer entry
does not depend on that deadline. The reporting document then resumes its last
focused element, preserving native dialog keyboard focus after recovery.
Background tiles recover on the next task. Tab entry has a
single-navigation allowance consumed by the focus transition and cancelled by
intervening host focus, other input, a prevented Tab, or leaving the document for
browser chrome. It does not expire while
Chromium is still handling the transfer. This is focus recovery, not a promise
that focus cannot transiently leave the host. The existing
browser permission remains in place for supporting runtimes. No runtime upgrade,
experimental enforcement flags, new UI, copy or controls are included.

Generated board options receive only focus reporting, preserving their existing
history and keyboard behavior. Presented options retain their existing full bridge.

The served prototype version changes to viewer-14 so cached HTML/engine copies
receive the bridge update. Route tests use the shared version constant instead
of repeating a literal version.

## Reproduce

On Windows, install with `bun install --frozen-lockfile`, run
`node node_modules/electron/install.js` if Bun has not installed the Electron
binary, then `bun run build`. Start a branch CLI server with
`node dist/cli.js --repo RAbdelrhman/wayfinder-map --port 0 --no-open`.

In another PowerShell terminal, set `FOCUS_APP_ORIGIN` to its printed origin:

```powershell
$env:FOCUS_APP_ORIGIN = 'http://127.0.0.1:PORT'
node docs/verification/385/runtime-matrix.mjs --control
node docs/verification/385/runtime-matrix.mjs
node docs/verification/385/runtime-matrix.mjs --desktop --control
node docs/verification/385/runtime-matrix.mjs --desktop
```

Use `--slow-entry` on guarded runs to delay pointer-entry messages by 350 ms,
past the recovery allowance, while exercising the actual #314 dialog.

Run serially with the tested surface visible and focused. `--desktop` launches
the actual branch-built desktop entry point, runtime and server in a fresh
profile. It does not create an Electron fixture or use the installed app.
`--smoke` shortens probes to two seconds and is not acceptance evidence.

To avoid refetching GitHub history on every cold start, capture the live
`/api/repos/RAbdelrhman/wayfinder-map/prototypes?map=205` JSON from the branch
server and set `FOCUS_PROTOTYPES_FILE` to that file. The runner records its hash
and pinned prototype revisions and replays only that metadata response. The full
application UI, native desktop entry point/server and actual prototype documents
remain in use. This is a transport boundary for repeatable focus tests, not a
standalone viewer fixture or proof of repeated live-provider calls.

The runner loads the real map #205 and its actual #314 prototype. It delays
requests with `route.continue()`, leaving the real server response and its
loopback address-space identity intact. It opens B4, the original repost page,
whose real paint function calls showModal with an autofocus Cancel button.
The guarded case must restore Close; the unguarded case must lose it.

The shipped screenshot-error fallback is exercised to render actual live AC3
decision-board previews. Attack instrumentation runs inside that real preview,
covering SVG focus, modal focus, dynamic autofocus, nested HTML/SVG focus,
parser-time modal/autofocus and nested window focus. For each attack, guarded
probes assert the exact host field, backward selection and `abZef` after typing
over `cd` in `abcdef`. Each size runs for at least 30 seconds. The real #314
Cancel/Post dialog tests pointer entry, native autofocus, Tab and Escape. Canvas
ownership recovery, keyboard entry and pane/float map focus are checked too.

The control removes exactly one restoration mount from the served application
bundle. Every listed attack must demonstrably steal focus, with 30-second probes
in each size on both surfaces. Guarded iterations additionally require an observed
background-frame blur before restoration. It is a test-only
transport change, never a product switch. Results and screenshots are written to
`.shots/focus-385/`; compact delivery evidence is kept alongside this README.

## Failed attempts retained

The original no-flags fixtures failed on Chrome 156 and Electron 44. Those results
remain failures in the earlier #385 comments and docs/verification/360.

Early application probes found real implementation gaps in child-to-child blur
notification and cross-renderer pointer/Tab timing. Regression tests and bridge
changes address those gaps. Early loading instrumentation used route.fulfill on
the document; Chromium then rejected its loopback subresources. It was replaced
with a delayed real network request, not weakened browser security settings.

An extra OS-activation experiment was added by the implementation agent beyond
Ramon's selected viewer-restoration scope. Its controls failed to establish the
external window as foreground. The failed checks remain in
control-setup-failure.json and are not counted as successful acceptance runs.
That experiment and its helpers were removed from the delivery scope. Native OS
foreground behavior remains Not verified. The source does not call window.focus
and has a regression case for an inactive document; these do not substitute for
OS-level proof.

A full-suite run failed to start one Vitest worker. No assertion was relaxed.
The complete suite subsequently passed with two workers: 154 files, 2,048 tests.

The first independent review of 2443797 did not pass. It identified delayed
pointer entry, stale Tab intent and broader-than-required bridge injection into
generated board options. The revised source has regression coverage for those
cases and gives board options only focus reporting. A subsequent 350 ms delayed
pointer run exposed loss of the native dialog's inner focus in pane mode; that
run remains a failure. The follow-up restores the reporting document's last
focused element, rather than stopping at the top-level canvas iframe.

Two independent Chrome control attempts timed out before probes, first at the
All rounds entry and then at frame readiness. They remain failures. The precise
cause was not established. A fresh real-server diagnostic and subsequent control
run reached #314 without any loading-source workaround. Final evidence records
the source head, built-bundle hashes, immutable raw-result hashes and metadata
revision so older runs cannot stand in for the final implementation.

On source fad6c75, typecheck, lint, build and the complete two-worker suite pass:
154 files, 2,052 tests. The full test command took 129.94 seconds. See
`runtime-evidence.json` for the full-application runs and retained failed attempts,
and the independent review reports for their separate acceptance judgments.

Final review corrections are on source 974704a. Typecheck, lint, build and all
2,055 tests pass. The twelve 30-second probes were repeated on that source, and
normal-timing smoke runs passed on both surfaces. See `review-fixes.md` and the
current `runtime-evidence.json`. The independent acceptance report remains the
report for fad6c75; its original evidence is preserved separately in
`runtime-evidence-fad6c75.json`. Both subsequent CodeRabbit findings have explicit
regressions and corrected-source runtime proof.

## Boundaries

This is recovery on the owner's revised criteria. It is not strict browser-level
focus prevention, a security boundary against a prototype forging bridge
messages, or proof that every keystroke during the transient transfer can never
be redirected. Installed-app, physical-device and screen-reader acceptance are
not claimed. The tested desktop surface is the branch-built application.
