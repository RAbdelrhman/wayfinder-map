# Hosting a sandboxed canvas inside Wayfinder

Research for [#206](https://github.com/RAbdelrhman/wayfinder-map/issues/206) on map [#205](https://github.com/RAbdelrhman/wayfinder-map/issues/205). Measurements were taken on 2026-10-03 with Electron 44.4.3 (the version in `package.json`) and `gh` against `RAbdelrhman/wayfinder-map`.

## Recommendation

- **Hosting:** use one plain `<iframe sandbox="allow-scripts">` in the shared web UI for both entry points. The desktop app runs the same page, so it gets the viewer for free. Don't use an Electron-native view.
- **Bridge:** Wayfinder owns the postMessage protocol. A small wrapper script that the server injects into the canvas document implements it. The wrapper reads state through the engine's existing hooks (the URL hash, `[data-frame]` and `#stage`), which every canvas branch already has. Later, the design-canvas engine adds one in-page event, `canvas:change`, that the wrapper prefers when it is there. The engine never learns about Wayfinder or postMessage.
- **Fallback:** the wrapper's DOM reading covers every canvas on every branch today. Snapshots and plain HTML pages get page-level pins, and the option comes from the viewer's own variant list.
- **Warm open under 300 ms:** serve prototype files from a commit SHA in the URL, with `immutable` caching. Keep an in-memory server cache keyed by `(repo, sha, path)`, and prefetch each canvas when the prototype list loads. Keep the last viewer iframe mounted after close.
- **Sandbox:** unchanged. Every response still carries `PROTOTYPE_CSP`, and the iframe keeps `sandbox="allow-scripts"` without `allow-same-origin` or `allow-popups`. The bridge only moves messages. It gives the prototype no handle on Wayfinder's API.

## Where things stand

### Implementation in #209

The approved #207 round 4 ACF4 shell is implemented by `src/ui/canvasViewer.ts`, shared by the desktop and localhost UI. Tiles, board Canvas links, variants and the existing ticket panel pass entry metadata to that viewer. Settings stores the opening size on the same origin as the app. Full window keeps the app mounted and inert; the side pane keeps the map live; the floating window retains its session geometry and resizes from all four corners.

The viewer owns one history entry. Size and page/option switches add none. The server adapts copied engines when serving `canvas.js`: hash assignments use `location.replace`, and presentation-frame navigation uses replacement navigation too. Generated presentation documents retain their relative asset base and opaque sandbox origin. This addresses the nested iframe's joint history as well as the engine hash. Repository prototype files are not edited.

The wrapper announces readiness at DOM readiness, rather than waiting for every nested option's load. It supports implicit page IDs, one-page shorthand configs and expanded style comparisons in old copied engines. The viewer checks the sending iframe and validates message shapes; commands only select known pages/options. Pin, note and pick commands are not implemented here.

Files use `/proto/<owner>/<repo>/<branch>/<sha>/viewer-4/<path>`. The rendition segment versions the injected wrapper and engine adaptation as well as the SHA-addressed repo bytes. Bump `PROTOTYPE_HOST_VERSION` when either adaptation changes. Versioned SHA responses keep the original CSP and have immutable caching; legacy branch and unversioned SHA URLs remain uncached. The server keeps a 50 MB LRU of raw commit bytes and coalesces reads. Prototype lists queue up to 64 relevant files per unseen SHA with three reads at once. The last viewer iframe stays mounted after close.

The sandbox headers and `sandbox="allow-scripts"` iframe are unchanged. The wrapper provides no API proxy. Installed-app validation, provider hand-offs, performance measurements for #214, annotations/picking and release work remain separate.

The observations below describe the pre-implementation baseline measured for #206.

- The tile's **Canvas** button and every variant tile are `target="_blank"` links (`src/ui/prototypeBoard.ts:213`, `:223`; `src/ui/prototypeTile.ts:63`, `:71`). On desktop, `setWindowOpenHandler` sends them to `shell.openExternal` (`src/desktop/main.ts:128`).
- Previews are already sandboxed twice: `PROTOTYPE_CSP` on the response (`src/server.ts:81`) and `sandbox="allow-scripts"` on the iframe (`src/ui/prototypeBoard.ts:178`, `src/ui/prototypeTile.ts:64`). The effective sandbox is the intersection of the two, so forms, popups, modals and downloads are blocked in the preview.
- Every `/proto/â€¦` file is one `gh api â€¦/contents/â€¦?ref=<branch>` call (`src/github.ts:1025`), served with `cache-control: no-store` (`src/server.ts:1357`). Nothing is cached, so every open is cold.
- The canvas engine (`prototypes/canvas/canvas.js`) keeps its page and presented item in `location.hash` (`#page/B`, lines 508, 588, 666). It tags each option frame with `data-frame="<id>"` (line 356), zooms with CSS `zoom` on `#stage` (line 429), and pans by scrolling `#board` (lines 449â€“458). It already uses `postMessage`, but only between its own option frames and the board (`canvasHeight`, lines 136 and 401).

## What was measured

### The sandbox, in Electron 44

A throwaway Electron app ran the desktop window's `webPreferences`. Its page mounted an `<iframe sandbox="allow-scripts">`, and the server answered the iframe with `PROTOTYPE_CSP`.

| Probe | Result |
| --- | --- |
| Parent reads `iframe.contentWindow.location` | `SecurityError`. The viewer cannot read the hash, so it needs a bridge. |
| Frame â†’ parent `postMessage` | Arrives with `event.origin === "null"`; `event.source === iframe.contentWindow` is `true` |
| Parent â†’ frame `postMessage(msg, '*')` | Arrives, with the parent's real origin as `event.origin` |
| Frame `fetch('/api/x')` | Reaches the server with `Origin: null`. Wayfinder's `originAllowed` (`src/server.ts:225`) returns 403 for that, and CORS blocks the read anyway (`TypeError: Failed to fetch`). |
| Frame `localStorage` | Throws |
| Initial `src` with `#p/B` | The frame sees `location.hash === "#p/B"`, so the viewer can open a canvas straight to a page and option |
| Process | The sandboxed frame ran in a different OS process (pid 15732) from the page (pid 28572), so a heavy canvas cannot block the viewer's own UI |
| Remount with `cache-control: max-age=31536000, immutable` | **0 requests** to the server. `onload` came after 12 ms, against 82 ms cold. The cached document still ran at origin `null`, so the CSP header is cached and applied along with the body. |

### Cold open cost today

- One `gh api` raw file read on a prototype branch took **690, 545 and 506 ms**.
- The canvas on `prototype/43-â€¦` is 21 files (excluding `tools/` and screenshots). It loads in at least three serial waves: `index.html`, then `canvas.css`, `config.js` and `canvas.js`, then each option page with its CSS and `kit/kit.js`. That puts a cold open at **about 1.5 to 2 s or more**, and today every open is cold.

### Engine hooks on every canvas branch

| Branch | Canvas engine | `data-frame` | `hashchange` | `#stage` zoom |
| --- | --- | --- | --- | --- |
| `prototype/39`, `42`, `43`, `44`, `45`, `125`, `163`, `196` | yes | yes | yes | yes |
| `prototype/8`, `17` | no (`prototype-snapshot.html` only) | â€” | â€” | â€” |

## Hosting: plain iframe vs Electron-native view

| | Plain iframe in the shared UI | Electron `WebContentsView` on desktop |
| --- | --- | --- |
| Entry points | One implementation for desktop and localhost | Desktop only. The localhost page still needs the iframe, so there are two viewers. |
| Pins, notes, toolbar, pick | Ordinary DOM over or beside the frame | Native views always paint above the page's DOM. Overlays need a second view or IPC into the canvas. |
| Animated transition from the tile, no blank flash | CSS/FLIP on the frame's container, with the tile's screenshot as a poster | Native view bounds are set from the main process. Animating them in step with DOM is not practical. |
| Isolation | Opaque origin, Origin check and CORS; measured above | Similar, through a separate `partition`. It adds nothing the sandbox lacks. |
| Rendering cost | Its own renderer process (measured), so 60 fps pan and zoom depend on the canvas, not Wayfinder | Same |
| Esc / Back to the map | The viewer is a route in the same page, so history and scroll restore are the app's existing navigation | Needs IPC to tear down the view and restore the page |

**Pick the iframe.** The only desktop change is to stop canvas opens from reaching `setWindowOpenHandler`: the tiles open the viewer instead of a `_blank` link. Keep `allow-popups` off the iframe so that a canvas's own `target="_blank"` links (such as the present-mode â†— button, `prototypes/canvas/index.html`) do nothing rather than open the system browser.

## The bridge

### Who owns what

- **Wayfinder owns the wire protocol.** The messages, their versions and their validation all live in the Wayfinder repo. The server injects a wrapper script into the HTML it serves for a canvas board (`index.html` beside `config.js`) and for `prototype-snapshot.html`, nowhere else. `PROTOTYPE_CSP` is only a `sandbox` directive with no `script-src`, so an inline script runs, as the engine's own inline `RESIZE` script already shows (`canvas.js:136`). The wrapper runs inside the opaque origin with exactly the prototype's privileges, so injecting it widens nothing.
- **The design-canvas engine owns one in-page event and nothing else.** On every change of page, presented item, zoom or scroll, it dispatches `canvas:change` on `window`, with `{ page, item, zoom }` in `detail`. That stays project-agnostic: the engine knows nothing about Wayfinder, and the skill's README documents the event as a public hook.
- **Why not put the protocol in the engine?** The engine is copied into each repo when a branch is cut. Any protocol in it is frozen per branch forever, and the old branches in the table above would never speak it. A Wayfinder-owned wrapper reaches every branch the day it ships, and the protocol can change without re-scaffolding canvases.

### Message shapes

Every message is a plain object with `wf: 1` (the protocol version) and a `type`. The viewer accepts a message only when `event.source === iframe.contentWindow`. The origin is always `"null"`, so it can't be used. The viewer sends with target `'*'`, because an opaque origin can't be named. That is safe only because the viewer never sends anything secret.

```ts
// canvas (wrapper) â†’ viewer
type FromCanvas =
  | { wf: 1; type: 'ready'; source: 'engine' | 'dom' | 'page'; pages: { id: string; title: string }[]; options: { id: string; name: string }[] }
  | { wf: 1; type: 'state'; page: string | null; option: string | null; presenting: boolean; zoom: number | null }
  | { wf: 1; type: 'hit'; requestId: number; page: string | null; option: string | null; fx: number; fy: number } // fx, fy: 0â€“1 inside the option frame, or the page when option is null
  | { wf: 1; type: 'key'; key: 'Escape' }; // only when the canvas did not use it (not presenting, no dialog open)

// viewer â†’ canvas (wrapper)
type ToCanvas =
  | { wf: 1; type: 'go'; page: string; option: string | null } // the wrapper sets location.hash
  | { wf: 1; type: 'hitTest'; requestId: number; x: number; y: number } // viewport px inside the iframe
  | { wf: 1; type: 'locate'; requestId: number; page: string; option: string | null; fx: number; fy: number }; // answered with a 'hit'-shaped reply plus the point's x, y, for drawing a pin
```

- Pins are stored as **option-relative fractions** (`option`, `fx`, `fy`) plus the page. They survive zoom, pan, window size and a different laptop, and they read well when written out in the GitHub comment the map decided on.
- `state` is posted on `canvas:change`, on `hashchange`, and (for `dom`) when a `MutationObserver` sees `#stage`'s style or `#present-view`'s `hidden` change. It is throttled to one per animation frame.
- `key: 'Escape'` lets Esc return to the map even while focus is inside the iframe. The canvas still gets Esc first to leave present mode.

### Fallback for canvases without the engine hook

The wrapper picks the best source it finds and reports it in `ready.source`:

1. **`engine`:** `canvas:change` fires. Page, option, presenting and zoom come straight from the engine.
2. **`dom`:** every canvas branch today. Page and option come from `location.hash`, presenting from `#present-view[hidden]`, and zoom from `#stage.style.zoom`. Hit testing uses `document.elementFromPoint(...).closest('[data-frame]')` on the board, and the `#present-frame` rect while presenting. Options come from `window.CANVAS` (the canvas's `config.js` global).
3. **`page`:** a snapshot or plain HTML page, with no canvas engine. The wrapper reports `option: null` and page-relative `fx`, `fy`. The viewer takes the option from its own variant list (`Prototype.variants`, already parsed on the server, `src/prototypes.ts`).
4. **No wrapper reply** (it failed to load, or the page threw before it ran): after a short timeout the viewer treats the canvas as view-only. It still opens in-app; pins and the in-canvas pick are disabled, and the existing "Pick in #N" path still works.

## Caching for a warm open under 300 ms

The map defines warm as "once the branch is cached". The plan makes a warm open a local, cache-only load.

1. **Address files by commit.** `git/matching-refs/heads/prototype/` (`src/github.ts:913`) already returns each branch's head SHA in `object.sha`; today only `ref` is typed (`RawRef`, `src/github.ts:840`). Carry it on `Prototype`, and serve files at `/proto/<owner>/<name>/<branch>/<sha>/<path>`, so relative links still resolve under one prefix. A pushed branch gets a new SHA, and with it a new URL, when the 60 s prototype list cache (`PROTOTYPE_TTL_MS`) refreshes.
2. **Make SHA-addressed responses `immutable`.** Use `cache-control: max-age=31536000, immutable` with `PROTOTYPE_CSP` unchanged. A remount was measured at 0 server requests and 12 ms. Keep `no-store` for any branch-addressed URL that is left.
3. **Server cache keyed by `(repo, sha, path)`.** An in-memory LRU of bytes, about 50 MB, so a browser-cache miss (a new window, a restart of the localhost page) costs a local read, not a 500 ms `gh` call. Commit contents never change, so it never needs invalidating, only eviction.
4. **Prefetch when the prototype list loads.** For each canvas, read its `config.js` (already read for variants), then fetch the board's files and every page it lists into the server cache, with the existing `pool` and a low concurrency. This is the step that makes a branch "cached".
5. **Keep the last viewer mounted.** On close, hide the iframe instead of removing it. Reopening the same canvas then costs nothing, and the wrapper's `go` message restores the page and option without a reload.
6. **No blank flash.** Paint the tile's screenshot (`/proto-shot/â€¦`, already `max-age=300`) as a poster under the iframe. Fade the iframe in on the wrapper's `ready` message, or on `load` when no wrapper answers.

Switching options or pages goes through `go`, which changes only the hash, so the canvas never reloads. That meets the bar's "switching options or canvas pages never reloads the whole canvas" with no extra work.

## The sandbox stays as it is

- The server keeps sending `content-security-policy: PROTOTYPE_CSP` on every prototype file, including SHA-addressed and cached ones. The measured cache hit still ran at origin `null`.
- The viewer's iframe uses `sandbox="allow-scripts"`, the same as today's previews. It never adds `allow-same-origin`, which would let a prototype script reach the page's origin and its API, and never adds `allow-popups` or `allow-top-navigation`.
- The prototype's requests to `/api/*` carry `Origin: null` and get 403 from `originAllowed`. Every state-changing route is a `POST`, so it always carries an Origin. A no-Origin `GET` (such as `<img src="/api/snapshot">`) can reach a read-only route, but the opaque origin cannot read the response.
- The injected wrapper runs inside the sandbox with the prototype's privileges. The bridge carries only state the viewer could see anyway: page, option, zoom and hit positions. The viewer validates each message's shape and `event.source` and acts only on the listed types. No message makes the viewer call the API on the canvas's behalf without the user's own click.
- `PAGE_CSP`'s `frame-src 'self'` already allows the viewer's iframe, so no CSP change is needed.

## Open questions for the map's Fog

- **Pins drawn inside or over the canvas.** Pins have to follow pan and zoom at 60 fps. The wrapper could draw them inside the canvas, which keeps them in sync with no per-frame messages. The viewer could draw them as an overlay, which keeps all pin UI in Wayfinder but needs a `layout` message every frame while panning. This shapes the pin prototype (#210).
- **60 fps pan and zoom with the engine's CSS `zoom`.** `#stage` zooms with CSS `zoom`, which re-lays out the board on every step. Whether that holds 60 fps on large boards on a typical laptop is unmeasured. If it doesn't, the engine fix is a `transform: scale`. A measurement for #214.
- **Whether the server cache should persist to disk** so a warm open survives an app restart. The bar only says "once the branch is cached".
- **Where the injection lives.** Either rewrite HTML on `/proto/` responses (simple; touches repo bytes in flight) or serve a Wayfinder-owned shell page that loads the canvas. The second needs a nested frame and breaks relative paths, so the rewrite is favoured, but the build ticket should confirm it.
- **Clipboard inside the sandbox.** The engine's "copy feedback" flow relies on manual select and copy. The desktop app denies every permission request (`src/desktop/main.ts:300`), so `navigator.clipboard` in the canvas will not work in-app. That is probably fine once the in-canvas pick posts the comment itself.
- **Prefetch budget.** Prefetching every canvas on a map costs `gh` calls (and, through `contents`, REST points) on each prototype list refresh. Should prefetch run once per SHA and only for open prototype tickets?
