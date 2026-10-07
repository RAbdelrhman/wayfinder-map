# Wayfinder map

Tool output truncates at about 42 KB, and `src/ui/app.ts`, `src/server.ts`, `src/handOffTracking.ts` and `src/github.ts` exceed it: find symbols with `rg -n`, then read line ranges.

## Where each concern lives

- **Hand-offs** (ticket to T3 Code thread): `src/t3.ts` starts one down the thread, app, clipboard rungs; `src/t3Api.ts` talks to the T3 server; `src/handOffTracking.ts` stores and polls status (`HandOffStore`, `HandOffTracker`); `src/prompt.ts` builds the prompt and branch names; UI in `src/ui/handOffs.ts`.
- **Inbox and notifications**: `src/notificationTypes.ts` holds kinds and settings; `src/ui/notifications.ts` keeps the localStorage inbox behind `withInboxLock`; `src/ui/unifiedInbox.ts` merges alerts with watcher events; `src/ui/mapEventInbox.ts` keeps per-map event cursors; native toasts and the badge live in `src/desktop/main.ts` and `src/desktop/notificationBadge.ts`.
- **Map watcher**: `src/mapWatcher.ts` polls each open map (ETag, backoff); `src/mapWatch.ts` diffs tickets into `MapEvent`s and reads PR and check state; `src/mapWatchStore.ts` persists it. Design: `docs/design/map-watching.md`.
- **Auto map and Start next**: `src/startNext.ts` plans against the hand-off cap; `src/startNextRunner.ts` runs batches and stops on usage limits; `src/autoMapService.ts` starts tickets as they become next; `src/autoPick.ts` and `src/autoCalibration.ts` choose tier and model; `src/autoMapStore.ts` persists. UI in `src/ui/startNext.ts`, `src/ui/autoMap.ts`. Design: `docs/design/parallel-hand-offs.md`, `docs/design/auto-tier-and-provider-usage.md`.
- **GitHub client**: `src/github.ts` wraps `gh` calls, rate-limit messages, and map, ticket and prototype fetches; `src/repositoryStore.ts` caches a repository's maps; `src/authFlow.ts` runs `gh auth` login and account switching.
- **Server routes**: `src/server.ts`, one `if` block per route: global routes match `path === '/api/…'`, per-repository routes match `scoped?.action` (`rg -n "path === '/api|scoped\?\.action" src/server.ts`); `startServer` wires the subsystems; `src/runtime.ts` boots the server and T3.
- **Desktop and updater**: `src/desktop/main.ts` (Electron window, tray, folder picker); `src/desktop/updater.ts` and `src/desktop/updaterPolicy.ts`. Releases: `docs/release-windows.md`.
- **Canvas prototypes**: `src/prototypes.ts` owns branch, route and variant rules; `src/server.ts` serves `/proto/` files via `parsePrototypeFilePath`; `src/canvasBridge.ts` runs inside the sandboxed frame; `src/ui/canvasViewer.ts` is the in-app viewer; `src/ui/prototypeBoard.ts` draws the board. Authoring a canvas: `prototypes/AGENTS.md`.
- **Pages**: map page `src/ui/app.ts`, Home `src/ui/home.ts`, Settings `src/ui/settingsPage.ts`. Phone app: `mobile/AGENTS.md`.

## Pull requests

- Check the diff against `CODING_STANDARDS.md`; `.github/workflows/claude-review.yml` applies it on every push once the `CLAUDE_CODE_OAUTH_TOKEN` secret is set.
- Sourcery reviews when a PR opens; CodeRabbit reviews only on request while the repo has under 10 stars. Request each re-review once, after your last push. Reply once per flagged line, even when a scanner flags it under two rules. Post any `/gemini` command from PowerShell: Git Bash rewrites a leading `/` into a Windows path.
