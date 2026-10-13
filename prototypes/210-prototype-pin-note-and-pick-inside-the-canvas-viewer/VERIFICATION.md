# Independent verification of #210

Final pass by a fresh Codex agent (gpt-6.1-sol, high), on 2026-10-10. It was not the author (Claude Opus) and ran read-only. Base: origin/main. Head: 2e0f312. The user chose **D4** (D3 without Attach). This replaces the 2026-10-08 report on the A/B/A2/A3 artifact.

## Done when

The three requested prototype checks **Pass**. D4’s browser checks pass, but review-note and hosted-scope gaps remain.

| Item | Result | Evidence |
|---|---|---|
| 1. At least two directions on ACF4, with trade-offs | Pass | `config.js` retains A/B, A2/A3, D/E/F and D2/D3/D4. Options include pros/cons and use the ACF4 shell. Browser loads succeeded. |
| 2. Review-before-post and posted result | Pass | Playwright exercised review/post in A/B/A2/A3 and loaded D/E/F/D2 review/posted states. D4 showed “Review before posting,” then “Posted to #42,” including through the pane’s Feedback tab. D4 posts notes only; see the hosted requirement conflict below. |
| 3. No-bridge fallback | Pass | Playwright exercised A/B/A2/A3 fallbacks and loaded D/E/F/D2 fallback states. D4 disables Pin/Element/Colour, retains notes and an option chooser, and displays “Notes still work on a whole option or the whole page.” |

Browser evidence came from:

```powershell
node C:\Users\supie\shots\verify-210-directions.cjs
node C:\Users\supie\shots\verify-210-d4.cjs
```

Results: zero page errors and zero final script failures. Details: direction results (local), D4 results (local).

## Other checks

- `node prototypes/210-prototype-pin-note-and-pick-inside-the-canvas-viewer/tools/check.mjs` → `Canvas config OK.`, exit 0.
- `node --test prototypes/210-prototype-pin-note-and-pick-inside-the-canvas-viewer/tools/check.test.mjs` → **17 passed, 0 failed**, exit 0.
- D4’s six states loaded in both full and pane sizes: **12 HTTP 200 responses**, zero page errors or HTTP failures.
- Attach, attachment rows and Pick controls were absent throughout. A added nothing.
- P added a pin and editable note; E selected an element; C converted `rgb(10, 20, 30)` to `#0a141e`; N added a note; F closed/reopened feedback. Typing `pecnf` in a textarea triggered no shortcuts.
- Original options remain. A2/A3/D2/D3/D4 have named pages, rounds and `basedOn`. D2/D3 record Change and D4 Keep alongside user feedback.
- **Fail:** E and F have no visible “Design review” note. The other seven canvas pages have one.
- `git diff --name-only origin/main...HEAD` → all 30 changed files are under the ticket’s prototype directory. `git diff --check origin/main...HEAD` → no output.
- HEAD is `2e0f312`; actual local branch is `wayfinder/210-prototype-pin-note-and-pick-inside-the-canvas-viewer-2`, rather than the supplied `prototype/210`. Final `git status --porcelain` was empty. Repository and hosted state remained unchanged.

## Scope questions

- **Q1: No production UI beyond the chosen prototype.** The diff changes prototype artifacts only. Earlier, unchosen options remain available for comparison.
- **Q2: No additional production control.** The prototypes reproduce existing viewer controls; D4’s annotation controls match the selected direction.
- **Q3: Planned overlap, with a scope conflict.** Read-only `gh issue list --repo RAbdelrhman/wayfinder-map --state all --limit 1000 --json number,title,state,body` confirmed #211–#215 are OPEN. #213 implements D4’s pin/note behavior; #211 records the choice. [#212](https://github.com/RAbdelrhman/wayfinder-map/issues/212) still requires in-viewer picking, which D4 explicitly removes. [Map #205](https://github.com/RAbdelrhman/wayfinder-map/issues/205) also still records structured in-canvas picks.

## Findings

1. E and F need their own visible Design review notes. `config.js:107` adds the shared review notes only to D.
2. D4 follows the user’s removal of Pick, but the hosted contract is stale. Although the abbreviated review/posted-state check above passes, [#210’s full second criterion](https://github.com/RAbdelrhman/wayfinder-map/issues/210) still requires a pick-ticket comment. **That clause fails for D3/D4**, and #212/map #205 need reconciliation.
3. `VERIFICATION.md:3` still says no disposition exists and later says browser interactions were unverified. It describes the older A/B/A2/A3 artifact and does not reflect D4 or this verification.

## Not verified

Installed-app behavior, real GitHub posting, restart persistence, real bridge delivery, screen readers, complete contrast/focus coverage, floating-window behavior, touch, 200% zoom and performance. Posting here is simulated. Original user transcripts were unavailable; feedback quotations were checked in metadata against the selection supplied in this request.


## After the verifier

- **Finding 1 (E and F had no Design review note):** fixed. Each of E and F now has its own note, `review4-e` and `review4-f`.
- **Finding 3 (this file was stale):** replaced by this report.
- **Finding 2 (D3 and D4 post no pick comment):** this is deliberate. The user asked for it on 2026-10-10: "it should never post to the next thread the pick until final decision is made in the t3 code thread". Directions A to D2 still show the pick comment. #212 and the map's in-canvas pick decision still assume an in-viewer pick, so they need the user's call. That is flagged in the closeout.
- **Fixes from the PR #290 review bots:**
  - **Review showed a stale comment.** In D3 and D4, editing a mark while Review was open kept the old preview. Editing now returns the panel to the list.
  - **A pin inside an annotated element couldn't be clicked**, because the element's outline sat over it. Found while rechecking. Pins now sit above element outlines.
  - **Unvalidated select values (CodeQL).** The option, source and attach-target selects now accept only values from their own lists.
  - **Mojibake in round 1's notes:** corrected.
- **Rechecked after the fixes:**
  - The verifier's own `verify-210-directions.cjs` and `verify-210-d4.cjs` reran with no page errors and no failures.
  - `check.mjs`: Canvas config OK.
  - `check.test.mjs`: 17/17 pass.
