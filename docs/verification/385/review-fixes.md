# #385 review corrections

The independent acceptance report covers source `fad6c75`. CodeRabbit then found
two minor correctness issues on PR #387. The author verified and corrected both
in `974704a`; the independent report is retained unchanged.

- Saved pinned URLs now recognize supported older viewer cache versions. New
  URLs still use viewer-14. Parameterized regressions cover viewer-12 and viewer-13
  and preserve unversioned paths that happen to contain a directory with that
  name. Real HTTP GETs of the pinned #314 document through both older prefixes
  returned 200 with the focus bridge present.
- Both focus-entry paths now require a finite timestamp at or after the latest
  host intent. A stale report cannot authorize the frame merely because later
  autofocus made it active. The new regression selects a newer map input,
  simulates canvas autofocus, delivers the older pointer report before recovery,
  and requires focus to return to that input. Test helpers now send the real
  bridge protocol's timestamp.

The sandboxed documents have opaque origins. Message validation continues to
use the actual canvas window or configured descendant token. An origin allowlist
would reject legitimate sandboxed documents; this is not a new security claim.

Typecheck, lint and build pass. The complete suite passes 154 files and 2,055
tests in 131.00 seconds. The focused prototype/focus/mount tests pass 57 tests.
`runtime-evidence.json` records the repeated complete-application matrix on
974704a, with raw-result hashes, source and bundle fingerprints, and normal-timing
smokes. `runtime-evidence-fad6c75.json` preserves the earlier accepted matrix.

The first corrected-source Electron run failed the float/nested-SVG takeover
observation assertion. Restoration and typing passed, but theft was not observed
within the harness's fixed window, so that run remains a failure. Nested attacks
now wait for the child document's load. A capture-phase blur probe also samples
the completed transfer before queued recovery, since Chromium can expose BODY
while dispatching blur. The assertion still requires an actual background-frame
takeover. The subsequent Electron run exited 0 with 31.263/32.180/32.354-second
probes, 63 attacks in each size, and all dialog/click-through checks passing.
After the coordinator's explicit release, normal-timing smoke runs also passed
on both Chrome and branch-built Electron, covering all three sizes, seven
attacks per size, #314 loading, dialog keys, map focus and in-app click-through.
They use two-second probes and do not replace the 30-second acceptance runs.
No UI, copy, controls, dependencies or map scope changed in these corrections.
