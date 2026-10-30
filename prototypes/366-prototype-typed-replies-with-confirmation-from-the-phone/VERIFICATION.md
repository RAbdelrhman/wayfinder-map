# #366 canvas verification (browser only)

Run on 2026-10-29 from this checkout, installed Chrome via playwright-core.

| Check | Result |
|---|---|
| `node prototypes/366-…/tools/check.mjs` | Canvas config OK |
| `bun run test:canvas` | 15 pass, 0 fail |
| `bun run test:device-presentation` | light and dark direct page at 8 viewports; board, Present, sandboxed viewer, resize, focus and Escape passed |
| `bun run canvas:poster` then `--check` | captured and checked `assets/poster.webp` |
| All 22 frames, light and dark, 390×844; 8 frames at 320×640 | no page errors, no horizontal overflow |
| Scripted flow (R1, R2) | 18/18: alert focus on Edit, Tab stays in alert, Escape returns to the field with text kept, Sending → Accepted, retry keeps reply ID `r-7K2Q-41FD`, a changed thread blocks Send until re-checked, a gone thread offers no Send, offline disables Review, R2 Edit/Back/Back to #230 |
| Board via `tools/serve.mjs` (sandbox CSP) | Overview, R1, R2 pages and Present render; theme toggle re-renders frames dark |

The board's copied `tools/check.test.mjs` points at the shared canvas fixtures,
as #226 and #353 do: `node --test` on it passes 15/15.

Not verified: real iOS/Android devices, the OS keyboard, safe areas, touch,
screen readers, large text, and any real RAMON‑PC or T3 Code response.

## R1 selection and code-review closeout, 2026-10-29

Ramon used the real canvas in the installed Samsung 1.3.0 viewer and chose overview/R1, Reply bar: I like R1 because you can see the activity and previous messages while typing. The related flow is page r1, all R1-* states. R2 is retained for history and is not selected. The approved R1 note records the user's exact reason with disposition keep.

CodeQL29 reported that SCENARIOS[query]() could call an inherited property. Dispatch now searches Object.entries, so only owned scenario functions can be selected; unknown names use session. The browser regression exercised __proto__, constructor, toString and the normal confirm state:4/4 rendered expected content with no page errors. Canvas checker and15checker tests passed. The board poster was recaptured and checked after the final content change. No reply layout or copy was changed by the dispatch fix.

The separate native viewer acceptance on clean2e4348a showed R1/R2 rendering, page/option switching, Notes, zoom/fit and prototype text surviving full-screen entry/exit. The real OS keyboard was exercised in R2's editor. This does not prove actual T3 delivery. Physical iOS, offline recovery, pinch, screen readers and large text remain unverified.
