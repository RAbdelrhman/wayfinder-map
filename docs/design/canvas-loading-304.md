# Unprepared canvas opening, #304

Decision: implement the user's **A+B, round 2** choice from #310, merged in PR #321. The stage immediately holds a skeleton using the app's `.wf-bone` style and the entry's actual option names. A decoded stored board poster, when available, covers it. The live iframe replaces both. The toolbar, tools, sandbox and 220 ms opening animation keep their existing behavior.

## Options and budget

#214 measured the heavy #196 board at 241 ms ready / 207 ms empty on desktop and 443 ms ready / 408 ms empty on localhost, with localhost readiness p90 738 ms. A 400 ms pointer lead-in brought visible content to 12–21 ms.

- Earlier preparation improves the common case, but cannot cover an immediate unprepared activation. Preparing every visible board would need a separate CPU/memory budget. The existing one-frame, 120 ms intent preparation remains.
- A stored poster covers boot time without reducing live readiness. Whole-board entries use `assets/poster.png`, `.jpg`, `.jpeg` or `.webp` beside the selected board. Variant entries reuse their tile image when present. No screenshot is generated automatically, and a poster is only as fresh as its SHA-addressed branch content.
- The chosen skeleton covers missing, failed and still-decoding posters. A late decode cannot cover an already-live or replaced canvas. A stalled document retains the skeleton after the existing status timeout.

#306's zero server-wide speculative file-download budget on startup and list refresh remains. As the #310 decision explicitly permits, each rendered card selects its one stored poster per new SHA. The viewer requests that picture with the card so it can decode before activation. Decoded pictures have a bounded 24-entry cache. A failed read can retry on viewer intent.

Prototype authors run `bun run canvas:poster prototypes/<task-id>` after their final edit, then `bun run canvas:poster --check prototypes/<task-id>`, and commit `assets/poster.webp` on that prototype branch. The capture uses installed Chrome, real board content and a 1280 × 800 viewport. It does not push or modify other branches. Existing branches without a poster keep the chosen skeleton fallback.

## Initial measurements, 2026-10-22

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

The chosen loading state opens under 300 ms in every sampled run and covers the previously empty interval. Live interactivity still exceeds 300 ms on some heavy-board opens. This change does not claim faster document boot, universal sub-300 ms interactivity, or the pan/zoom performance owned by #305. These initial runs preceded the independent review's system-theme and poster-workflow corrections below.

Raw local records: `.audit/desktop-final.json`, `.audit/localhost-final.json`; the desktop CDP driver is `.audit/measure-desktop.mjs`, and the shared browser probe is `.audit/probe.js`. Localhost was driven through `preview_evaluate` using that probe. The initial run overlapped repository tests; the final repeated samples above did not.

## Checks

- `bun run typecheck`: passed.
- `bun run lint`: passed.
- `bun run test`: 128 files, 1,682 tests passed after the review fixes.
- New Vitest cases cover named escaped skeleton content, same-origin poster addresses, stored-poster selection, decoded-only cache behavior, cache bounds, startup request budget, poster failure, late decode, immediate loading coverage and stalled-load coverage.

Physical touch, screen-reader output, and the installed release are not verified by these development measurements.

## Independent review corrections

Round 1 correctly rejected a light skeleton under the system dark theme and the missing poster producer/card preload. Both are corrected. A structural stylesheet test now pairs every explicit-dark skeleton override with its system-dark twin. Runtime checks with no saved theme report `rgb(22,22,21)` under system dark and `rgb(236,235,230)` under system light. A stalled load stops pulsing at the status timeout; transient poster failures can retry. Narrow pane/float skeleton captions retain the prototype's fixed grid and its disclosed layout tradeoff.

The capture command was exercised on #310 and on an archive of the real #196 branch at `ee804286cc4227ba817e03c0de0cb2e5a1e57c2a`. Both produced valid WebPs. The #196 capture was visually inspected. An Electron network fixture supplies that captured image and adds its filename to the prototype discovery response, exercising the actual card metadata, preloader, decode, stage and live handoff. It records one request before the click, one total, both poster and skeleton present synchronously at the click, poster frames before the live frame, and zero empty frames. This is an integration fixture; it does not claim the old remote #196 branch was backfilled. No other prototype branch was modified.

The same-session before-change Electron baseline in `.audit/desktop-baseline.jsonl` measured #196 at 319.8 ms median live ready and 272 ms median empty stage, with a cold first-open outlier of 1,457 ms empty. #163 had 102 ms median empty stage. These complement the earlier #214 baseline above.

## Final measurements after review corrections

Implementation `dda472918a928b5e4084ad69d3d658f6820c8fca`, built before these runs. The served app bundle on both localhost and Electron matched SHA-256 `7ee35c5146cc45a6fcd4312ed8fe493e254e904b3ed34e63f6b8a5e1d7c28943`. The raw records and provenance are retained in [the runtime evidence](../evidence/canvas-loading-304.json).

The same five-opens-per-board method was repeated. Ready messages are restricted to the viewer's current iframe, excluding background tile previews. Electron used a fresh development profile on port 63210 with native window-occlusion/backgrounding optimization disabled for measurement; batches with no visible render frames were rejected. These settings keep render sampling active while automation operates. They do not prove installed-app performance under occlusion. Localhost used the ordinary T3 Code browser tab on port 4494. Neither run overlapped the test suite.

| Surface / board | Lead-in | First covered stage median / max | Live ready median / max after click | Empty frames |
| --- | --- | --- | --- | --- |
| Desktop #196 | None | 15.5 / 109.7 ms | 236.8 / 513.4 ms | 0 |
| Desktop #163 | None | 14.6 / 19.1 ms | 118.7 / 213.8 ms | 0 |
| Desktop #196 | 400 ms focus | 5.7 / 16.5 ms | Ready before click in all five | 0 |
| Desktop #163 | 400 ms focus | 4.9 / 20.2 ms | Ready before click in all five | 0 |
| Localhost #196 | None | 10.8 / 21.9 ms | 206.0 / 236.0 ms | 0 |
| Localhost #163 | None | 18.4 / 33.2 ms | 106.5 / 162.0 ms | 0 |

Every sampled opening ran the expansion animation. The first loading content met the 300 ms bar in all samples; one heavy-board live-ready sample was 513.4 ms. Differences in live-ready times between these batches reflect workload/cache variation, not a document-boot optimization in this change. The poster integration fixture repeated against the same final build recorded one card-selected request before activation, a decoded poster and skeleton synchronously at activation, and zero empty frames through the live handoff.
