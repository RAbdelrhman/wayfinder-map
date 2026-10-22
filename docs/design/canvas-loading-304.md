# Unprepared canvas opening, #304

Decision: implement the user's **A+B, round 2** choice from #310, merged in PR #321. The stage immediately holds a skeleton using the app's `.wf-bone` style and the entry's actual option names. A decoded stored board poster, when available, covers it. The live iframe replaces both. The toolbar, tools, sandbox and 220 ms opening animation keep their existing behavior.

## Options and budget

#214 measured the heavy #196 board at 241 ms ready / 207 ms empty on desktop and 443 ms ready / 408 ms empty on localhost, with localhost readiness p90 738 ms. A 400 ms pointer lead-in brought visible content to 12–21 ms.

- Earlier preparation improves the common case, but cannot cover an immediate unprepared activation. Preparing every visible board would need a separate CPU/memory budget. The existing one-frame, 120 ms intent preparation remains.
- A stored poster covers boot time without reducing live readiness. Whole-board entries use `assets/poster.png`, `.jpg`, `.jpeg` or `.webp` beside the selected board. Variant entries reuse their tile image when present. No screenshot is generated automatically, and a poster is only as fresh as its SHA-addressed branch content.
- The chosen skeleton covers missing, failed and still-decoding posters. A late decode cannot cover an already-live or replaced canvas. A stalled document retains the skeleton after the existing status timeout.

#306's zero speculative file-download budget on startup and list refresh remains: poster requests start on focus, pointer intent or activation, never by scanning a rendered list. Decoded pictures have a bounded 24-entry cache.

## Measurements, 2026-10-22

Same Intel i7-8750H laptop as #214. Actual production shared UI from this worktree, built with `node scripts/build.mjs`. Localhost ran the CLI server on port 4494 in T3 Code's Chromium preview; desktop ran Electron 44.4.3 with its own server and isolated development profile. These are development builds, not an installed release update.

Five opens per board per case, alternating #196 and #163 to force iframe remounts. Branch and resource caches were warm. The no-lead-in distribution uses synchronous DOM activation of the actual entry, with no hover or focus preparation. This deliberately measures the unprepared path without browser automation's pointer dwell. It is not a physical touch test. Additional ordinary pointer activation exercised the localhost entry.

The probe samples each `requestAnimationFrame`: a visible stage is covered by its skeleton, decoded poster or opaque iframe. It separately records the iframe's `wf:ready` message. These are DOM/render-frame observations, not pixel-based filmstrip timings. All sampled openings ran the existing expansion animation.

| Surface / board | Lead-in | First covered stage median / max | Live ready median / max after click | Empty frames |
| --- | --- | --- | --- | --- |
| Desktop #196 | None | 17.2 / 31.5 ms | 309.7 / 433.2 ms | 0 |
| Desktop #163 | None | 9.3 / 21.7 ms | 215.3 / 277.4 ms | 0 |
| Desktop #196 | 400 ms focus | 9.6 / 15.6 ms | Ready before click in all five | 0 |
| Desktop #163 | 400 ms focus | 9.5 / 16.2 ms | Ready before click in all five | 0 |
| Localhost #196 | None | 20.8 / 25.5 ms | 295.2 / 342.1 ms | 0 |
| Localhost #163 | None | 29.9 / 38.4 ms | 152.3 / 228.6 ms | 0 |

The chosen loading state opens under 300 ms in every sampled run and covers the previously empty interval. Live interactivity still exceeds 300 ms on some heavy-board opens. This change does not claim faster document boot, universal sub-300 ms interactivity, or the pan/zoom performance owned by #305.

Raw local records: `.audit/desktop-final.json`, `.audit/localhost-final.json`; the desktop CDP driver is `.audit/measure-desktop.mjs`, and the shared browser probe is `.audit/probe.js`. Localhost was driven through `preview_evaluate` using that probe. The initial run overlapped repository tests; the final repeated samples above did not.

## Checks

- `bun run typecheck`: passed.
- `bun run lint`: passed.
- `bun run test`: 127 files, 1,678 tests passed.
- New Vitest cases cover named escaped skeleton content, same-origin poster addresses, stored-poster selection, decoded-only cache behavior, cache bounds, startup request budget, poster failure, late decode, immediate loading coverage and stalled-load coverage.

Physical touch, screen-reader output, and the installed release are not verified by these development measurements.
