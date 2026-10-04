# Watching a running T3 Code thread from another device

Research for [#220](https://github.com/RAbdelrhman/wayfinder-map/issues/220) on map [#217](https://github.com/RAbdelrhman/wayfinder-map/issues/217). Checked on 2026-10-03 against the installed T3 Code `0.0.45-nightly.20261001.2552` (orchestration protocol 1) and against upstream `main` at `88744f3` (protocol 2). T3 Code links below point at the installed tag, `v0.0.45-nightly.20261001.2552`, unless they say `main`.

## Answer

**Yes, a live view is possible, at the same fidelity as T3 Code's own window.** T3 Code's server already serves remote clients. It has a scoped auth model, a per-thread snapshot over HTTP and a per-thread event stream over WebSocket. Upstream also has its own Expo mobile client in development (`apps/mobile`, not distributed yet). A phone can follow a thread's status, its streaming assistant text, the agent's reasoning, every tool call as it starts, updates and finishes, pending approvals and questions, errors, diffs and the thread's PRs. Events arrive as the server appends them; there is no polling.

The limits are about reaching the server, not about what it exposes:

- The desktop has to be awake with T3 Code running. Nothing is stored off the machine, so a sleeping PC means no live view and no history. The phone can still show what it cached.
- Off the home network the phone needs a route to the server: Tailscale, or T3 Connect (T3's hosted relay and tunnel). Picking the route is [#218](https://github.com/RAbdelrhman/wayfinder-map/issues/218) and [#222](https://github.com/RAbdelrhman/wayfinder-map/issues/222).
- T3 Code's protocol is mid-migration (see [The protocol is changing](#the-protocol-is-changing)). A phone client has to read the server's protocol version and handle both shapes, or pin to one.

## Verified by measurement

Run from this machine against the LAN address `http://192.168.4.36:3773`, not loopback, with a 10-minute session that was revoked afterwards. The subject was this ticket's own thread while it ran.

| Check | Result |
| --- | --- |
| `GET /.well-known/t3/environment`, no credential | `200`: environment ID, label, `serverVersion`, `orchestrationProtocolVersion: 1`, capabilities |
| `GET /api/orchestration/shell`, no credential | `401 auth_invalid / missing_credential` |
| `GET /api/orchestration/shell`, bearer | `200`, 160 threads, `snapshotSequence` 139116 |
| `GET /api/orchestration/threads/:id`, bearer | `200`, 92 KB in 336 ms: 26 messages, 108 activities |
| `orchestration.subscribeThread` over `/ws?wsTicket=…`, resuming at the snapshot's sequence | `synchronized` marker, then live events for 30 s: streaming reasoning, `tool.started`, `tool.updated`, `task.started`, `context-window.updated` |

T3 Code's desktop already listens on every interface here (`server-runtime.json` says `"host":"0.0.0.0"`, because Network access is on), and every data route requires a credential.

## What T3 Code exposes for a running thread

### Endpoints (installed, protocol 1)

| Route | Scope | What it gives |
| --- | --- | --- |
| `GET /.well-known/t3/environment` ([environmentHttp.ts:412](https://github.com/pingdotgg/t3code/blob/v0.0.45-nightly.20261001.2552/packages/contracts/src/environmentHttp.ts#L412)) | none | Environment ID, version, protocol version, capabilities |
| `GET /api/orchestration/shell` ([environmentHttp.ts:517](https://github.com/pingdotgg/t3code/blob/v0.0.45-nightly.20261001.2552/packages/contracts/src/environmentHttp.ts#L517)) | `orchestration:read` | Every project and thread as a summary row (the "shell") |
| `GET /api/orchestration/threads/:threadId` ([environmentHttp.ts:524](https://github.com/pingdotgg/t3code/blob/v0.0.45-nightly.20261001.2552/packages/contracts/src/environmentHttp.ts#L524)) | `orchestration:read` | One thread in full, with `snapshotSequence`. It can be windowed to the last N turns ([orchestration.ts:1045](https://github.com/pingdotgg/t3code/blob/v0.0.45-nightly.20261001.2552/packages/contracts/src/orchestration.ts#L1045)) |
| `POST /api/auth/websocket-ticket` ([environmentHttp.ts:441](https://github.com/pingdotgg/t3code/blob/v0.0.45-nightly.20261001.2552/packages/contracts/src/environmentHttp.ts#L441)) | any session | A short-lived ticket for opening `/ws`, which cannot carry a bearer header |
| WS `orchestration.subscribeShell` | `orchestration:read` ([RpcAuthorization.ts:30](https://github.com/pingdotgg/t3code/blob/v0.0.45-nightly.20261001.2552/apps/server/src/auth/RpcAuthorization.ts#L30)) | Every thread's summary row, live. Wayfinder's desktop already uses this |
| WS `orchestration.subscribeThread` | `orchestration:read` ([RpcAuthorization.ts:32](https://github.com/pingdotgg/t3code/blob/v0.0.45-nightly.20261001.2552/apps/server/src/auth/RpcAuthorization.ts#L32)) | One thread's events, live, resumable by `afterSequence` |
| WS `orchestration.getTurnDiff` / `getFullThreadDiff` | `orchestration:read` | The code a turn changed |

The WebSocket speaks Effect RPC as JSON frames: send `{_tag:'Request', id, tag, payload, headers:[]}`, receive `Chunk` frames with `values`, and answer `Ping` with `Pong`. `src/t3Api.ts:167-301` already does all of this for `subscribeShell`.

### What a subscriber sees

The thread summary row ([orchestration.ts:884](https://github.com/pingdotgg/t3code/blob/v0.0.45-nightly.20261001.2552/packages/contracts/src/orchestration.ts#L884)) carries title, branch, worktree, model, `session.status`, `latestTurn.state` and its timestamps, `session.lastError`, `hasPendingApprovals`, `hasPendingUserInput`, `backgroundLiveness`, `planProgress`, linked and branch PRs, and the settled and snoozed state. That is enough for a status card.

`subscribeThread` ([orchestration.ts:1008](https://github.com/pingdotgg/t3code/blob/v0.0.45-nightly.20261001.2552/packages/contracts/src/orchestration.ts#L1008), stream item at [:2213](https://github.com/pingdotgg/t3code/blob/v0.0.45-nightly.20261001.2552/packages/contracts/src/orchestration.ts#L2213)) sends a `snapshot` (unless `afterSequence` is given), a `synchronized` marker if asked for, then `event` items. The events that matter for a transcript ([orchestration.ts:1690](https://github.com/pingdotgg/t3code/blob/v0.0.45-nightly.20261001.2552/packages/contracts/src/orchestration.ts#L1690)):

- `thread.message-sent`: user, assistant and system messages. `streaming: true` marks text still arriving. With `reasoningMessages: true` the agent's reasoning comes through as its own role.
- `thread.activity-appended`: tool and task progress ([orchestration.ts:661](https://github.com/pingdotgg/t3code/blob/v0.0.45-nightly.20261001.2552/packages/contracts/src/orchestration.ts#L661)), each with a tone (`info`, `tool`, `approval`, `error`), a kind such as `tool.started` or `task.completed`, a one-line `summary` and a payload with the tool's title and detail.
- `thread.session-set`: the session's status changing (starting, running, ready, error and so on).
- `thread.turn-diff-completed`, `thread.proposed-plan-upserted`, `thread.pull-request-synced`, `thread.settled`.

It is the stream T3 Code's own window renders, so a phone can match it line for line. A phone UI would likely show less: status, the latest assistant text, a tool-call feed and alerts.

### Authentication

From [environment-auth.md](https://github.com/pingdotgg/t3code/blob/v0.0.45-nightly.20261001.2552/docs/internals/environment-auth.md) and the code it cites:

- Every route except the descriptor needs a session: a browser cookie, a bearer token, or a DPoP-bound token. Every RPC declares the scope it needs and is checked before its handler runs.
- Scopes ([auth.ts:81-115](https://github.com/pingdotgg/t3code/blob/v0.0.45-nightly.20261001.2552/packages/contracts/src/auth.ts#L81)): `orchestration:read` is enough to watch. `orchestration:operate` is what starts, stops and answers threads. `terminal:operate` drives terminals. `access:*` and `relay:*` manage the server itself.
- A device joins by **pairing**: an admin creates a one-time credential, and the device exchanges it at `POST /oauth/token` ([environmentHttp.ts:433](https://github.com/pingdotgg/t3code/blob/v0.0.45-nightly.20261001.2552/packages/contracts/src/environmentHttp.ts#L433)) for its own session. Sessions can be listed and revoked per device.
- `POST /api/auth/pairing-token` ([environmentHttp.ts:448](https://github.com/pingdotgg/t3code/blob/v0.0.45-nightly.20261001.2552/packages/contracts/src/environmentHttp.ts#L448)) takes a `scopes` list, so a caller holding `access:write` can mint a **watch-only** pairing (`["orchestration:read"]`). A grant can be narrowed but never widened ([auth/http.ts:405-416](https://github.com/pingdotgg/t3code/blob/v0.0.45-nightly.20261001.2552/apps/server/src/auth/http.ts#L405)). The CLI's `t3 pair` and `t3 auth pairing create` always grant the standard client scopes ([cli/auth.ts:98](https://github.com/pingdotgg/t3code/blob/v0.0.45-nightly.20261001.2552/apps/server/src/cli/auth.ts#L98)), which include operate and terminal.
- **Do not hand the phone Wayfinder's own T3 token.** `src/t3Api.ts:108` mints it with `t3 auth session issue`, which grants the administrative scopes ([cli/auth.ts:177](https://github.com/pingdotgg/t3code/blob/v0.0.45-nightly.20261001.2552/apps/server/src/cli/auth.ts#L177)). Whoever holds it can create more pairings and run commands on the PC.

### What upstream already does for phones

- **T3 Code Mobile** (`apps/mobile` on `main`, Expo, "in development and not distributed yet") pairs by QR code or URL and shares one connection runtime with the web app ([connection-runtime.md](https://github.com/pingdotgg/t3code/blob/88744f3ddba9d3883ba631f0f4801f1a97fe77ce/docs/internals/connection-runtime.md)). It handles reconnect backoff, resuming from a cached sequence after the OS kills a backgrounded socket, and keeping cached data readable while offline.
- **Routes** ([remote-access.md](https://github.com/pingdotgg/t3code/blob/v0.0.45-nightly.20261001.2552/docs/user/remote-access.md)): LAN pairing (Settings → Connections → Network access), Tailscale HTTPS (`t3 pair --tailscale`), and T3 Connect. T3 Connect signs in through Clerk, gives the environment a Cloudflare tunnel hostname, and brokers a DPoP-bound bootstrap. The relay never sees the session token ([t3-connect.md](https://github.com/pingdotgg/t3code/blob/v0.0.45-nightly.20261001.2552/docs/internals/t3-connect.md)).
- **Agent activity publishing** ([AgentAwarenessRelay.ts](https://github.com/pingdotgg/t3code/blob/v0.0.45-nightly.20261001.2552/apps/server/src/relay/AgentAwarenessRelay.ts)): with T3 Connect linked, the server can push a per-thread phase and headline to the relay for T3's own iOS Live Activities. It only reaches devices registered with T3's app, so Wayfinder's app cannot receive it. It does show the summary-level fields T3 considers enough for a lock screen.

## What Wayfinder's desktop already tracks

- `src/handOffTracking.ts` keeps one record per ticket started from Wayfinder in `~/.wayfinder-map/hand-offs.json` (`handOffStorePath`, line 361). Each record holds `repo`, `mapNumber`, `ticketNumber`, `environmentId`, `t3Origin`, `projectId`, `threadId`, `branch`, `worktreePath`, a mapped `status` (`starting | running | waiting | ready | finished | interrupted | failed | untracked`), `pendingApproval`, `pendingUserInput`, `lastError` and the PRs (lines 53-86).
- `HandOffTracker` reads the shell every 30 s and holds a `subscribeShell` stream open between reads (lines 1099-1170). `mapT3Status` (line 269) turns the summary row into that status. Thread changes nudge the map watcher (`onThreadChange`, line 1084).
- `src/handOffLiveness.ts` defines a live hand-off as one with a `threadId` whose status is not finished, failed, interrupted or untracked.
- `GET /api/hand-offs` returns the status DTOs (`HandOffStatusDto`, line 106), but Wayfinder's server accepts only loopback `Host` and `Origin` headers (`src/server.ts:220-243`), so no other device can read it today.
- The desktop **never subscribes to a thread's events**. It knows that a ticket is running, waiting or done. It does not know what the agent is saying or doing.

## What the desktop would have to relay

What the phone needs, and where it can come from:

| The phone needs | Source |
| --- | --- |
| Which thread works ticket #N in repo R | Only Wayfinder's hand-off store. T3 Code doesn't know about tickets. Branch names (`wayfinder/<n>-…`) and titles (`#<n> …`) hint, but they are not reliable keys |
| Status, needs-you flags, PRs | Either source: the hand-off DTO or T3 Code's shell row |
| Transcript, tool feed, live text | Only T3 Code: `GET /api/orchestration/threads/:id`, then `subscribeThread` |
| A route to the PC and a credential | The desktop has to set these up (#218, #222) |

That leaves two ways to build it:

1. **The phone talks to T3 Code directly for the transcript.** The desktop relays only the ticket-to-thread mapping (a read-only view of the hand-off store) and the pairing bootstrap. To bootstrap, it mints a watch-only T3 pairing with its admin session through `POST /api/auth/pairing-token {scopes:["orchestration:read"]}` and gives the phone that one-time credential with the T3 endpoint. The desktop relays the least, and the phone gets T3's own stream with nothing in between. The cost is two endpoints and two credentials on the phone (Wayfinder's and T3 Code's), and two routes to keep reachable unless both sit behind one tunnel. It also ties the phone client to T3 Code's protocol churn.
2. **The desktop proxies everything.** Wayfinder's server opens `subscribeThread` itself and re-serves a trimmed event feed (status, message text, tool summaries) on its own paired endpoint. The phone holds one credential and one route, and Wayfinder hides T3's protocol versions behind its own shape. The cost is that Wayfinder has to build and maintain a streaming relay, with resume-from-sequence and backpressure, in a server that only answers loopback today.

Either way, start and watch must not share one over-broad credential. Watching needs only `orchestration:read`; starting needs `orchestration:operate` (Wayfinder dispatches `thread.create` and `thread.turn.start`, `src/t3Api.ts:378-409`).

Choosing between the two belongs to #222. The first option suits a fast v1; the second suits keeping the phone stable across T3 Code updates.

## The protocol is changing

Upstream `main` is on orchestration protocol 2 ([environment.ts:13](https://github.com/pingdotgg/t3code/blob/88744f3ddba9d3883ba631f0f4801f1a97fe77ce/packages/contracts/src/environment.ts#L13)); the installed nightly reports 1. On `main`:

- `GET /api/orchestration/snapshot` and `POST /api/orchestration/dispatch` are gone. The HTTP API is `shell`, `threads/:id`, `threads/:id/bounded` and `threads/:id/history` ([environmentHttp.ts:528-551 on main](https://github.com/pingdotgg/t3code/blob/88744f3ddba9d3883ba631f0f4801f1a97fe77ce/packages/contracts/src/environmentHttp.ts#L528)). Commands go over the `orchestration.dispatchCommand` RPC.
- The thread summary row drops `session` and `latestTurn` for `status`, `activityRunStatus`, `pendingRuntimeRequest`, `latestVisibleMessage` and `lastErrorClass` ([orchestrationV2.ts:1685 on main](https://github.com/pingdotgg/t3code/blob/88744f3ddba9d3883ba631f0f4801f1a97fe77ce/packages/contracts/src/orchestrationV2.ts#L1685)).
- The thread stream sends a `projection` (runs, attempts, messages, turn items, runtime requests) and domain events with their own `sequence` ([orchestrationV2.ts:3147 on main](https://github.com/pingdotgg/t3code/blob/88744f3ddba9d3883ba631f0f4801f1a97fe77ce/packages/contracts/src/orchestrationV2.ts#L3147)).

Watching still works on protocol 2, with the same routes, the same scope and the same RPC names, and gets richer (bounded snapshots, history pages, a latest-message field on the summary row). The desktop is the part at risk. `T3Api.snapshot()` and `dispatch()` (`src/t3Api.ts:142`, `:158`) call routes that `main` no longer has, and `mapT3Status` reads `session` and `latestTurn`, so on a protocol-2 server every hand-off would sit at `starting`. That breaks starting tickets and the hand-off status before any phone work begins. Filed as [#254](https://github.com/RAbdelrhman/wayfinder-map/issues/254) on this map.
