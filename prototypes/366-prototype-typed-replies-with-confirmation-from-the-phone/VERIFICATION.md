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

`node --test prototypes/366-…/tools/check.test.mjs` fails 3 tests that read the
legacy `prototypes/canvas` fixtures (`variants/shell.js`); the scaffolded copies in
#316 and #225 fail the same 3. CI runs `test:canvas`, which passes.

Not verified: real iOS/Android devices, the OS keyboard, safe areas, touch,
screen readers, large text, and any real RAMON‑PC or T3 Code response.
