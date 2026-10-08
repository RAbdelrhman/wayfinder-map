# Independent verification of #210

Reviewed by a fresh GPT-6.1 agent on 2026-10-08. Base: 3105dda. Artifact: existing A/B/A2/A3 canvas plus test and shell corrections. No direction has a submitted disposition. This report does not approve production implementation or ticket closeout.

## Done when

- Pass, source/artifact: A design canvas on the prototype branch shows at least two directions for pin, note and pick, built on the chosen viewer shell, with trade-offs in the option notes.
  Evidence: config.js preserves A/B trade-offs, A2/A3 provenance and named rounds. Shared shell renders full/pane/float, four resize corners and GitHub only in full/pane.
- Pass, source/artifact: Each direction shows the review-before-post step and the posted result: the prototype ticket comment with pins and notes, and the pick ticket comment with option ID, name, note and pins.
  Evidence: A review dialog, B inline review, simulated posted comments in both; fixtures.js includes prototype pins/notes and pick ID/name/note/pins. A3 commentsHtml includes additional annotations and option notes.
- Pass, source/artifact: Each direction shows what happens on a canvas without the bridge (the research's fallback).
  Evidence: engine/DOM/page/no-wrapper scenarios, unavailable annotation/pick tools and Pick in #211 fallback; A3 preserves its draft.

## Independent checks

- Task tools/check.mjs: Canvas config OK.
- Task tools/check.test.mjs: 17/17 passed.
- bun run test:canvas: 15/15 passed.
- bun run typecheck and bun run lint: exit 0.
- bun run test -- --maxWorkers=2: 112 files, 1336 tests passed, exit 0.
- node --check variants/shell.js: exit 0.
- git diff --check 3105dda: exit 0.

Found and corrected: copied task-local tests referenced unrelated fixtures; extra blank EOF line in config; shared A/B float exposed only southeast resize and its handle remained hidden. Author made the corrections; verifier independently rechecked the source and automated checks.

## Scope questions

- UI absent from a chosen prototype: proposed prototype UI exists and remains unchosen. No production UI is changed. Human approval remains required before implementation or closeout.
- Duplicate app controls: no production controls added; shell controls are reproduced inside design simulations.
- Independent overlap with another open map ticket: no production implementation overlap. Live reads: #208/#209 closed, #210-#215 open; #211 needs #210, #212 needs #209/#211, #213 needs #212.

## Not verified

Independent browser clicking, dragging, keyboard/focus, responsive states and opaque-origin behavior; installed-app interactions; screen-reader announcements; all color picker contrast states; actual restart persistence, uploads and GitHub posting. Existing screenshots are author evidence. T3 preview snapshot/evaluate operations timed out during resumed verification. New shared-shell four-corner resize was source/automated checked, not independently dragged in a browser.

Draft retention, attachments and posting are simulations. No decision recorded, PR opened, merge performed, issue closed or map decision added.
