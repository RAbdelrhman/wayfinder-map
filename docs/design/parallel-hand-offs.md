# Parallel hand-offs: how many at once, and what breaks

Research for [#123](https://github.com/RAbdelrhman/wayfinder-map/issues/123) on map [#121](https://github.com/RAbdelrhman/wayfinder-map/issues/121). Measured on 2026-09-26 on one Windows 11 machine (12 logical cores, 64 GB RAM, git 2.53.0.windows.3, Node 25.7) against a local T3 Code Nightly server.

## Recommendation

**Default cap: 4 hand-offs running at once per machine, and let the user change it.** One cap for every model and provider.

- The limit is the local machine, not git, T3 Code or the providers. At 8, CPU stays at 100% even when every turn is trivial, and turns finish in waves 3-5 s apart. Real sessions also run builds and tests, so 4 leaves headroom.
- Don't set a different cap per provider. Neither Claude nor Codex throttled on concurrency. Codex has a usage quota that runs out whatever the concurrency. When a start fails with a usage-limit error, stop auto-starting the rest of the batch and tell the user, rather than retrying.
- Fix the start-up races before anything starts hand-offs in parallel: #137 (same-clone prepare) and #138 (cold connect). Until #137 lands, run the prepare step one start at a time. It takes about 2 s per start.

## Method

`scripts/measure-parallel-hand-offs.ts` runs the real code paths. Bundle it with esbuild and run it under Node, because Bun 1.1's `promisify(execFile)` returns no stdout:

```sh
npx esbuild scripts/measure-parallel-hand-offs.ts --bundle --platform=node --format=esm --outfile=$TMP/probe.mjs
node $TMP/probe.mjs git 5        # N concurrent `git worktree add -b` on a scratch clone
node $TMP/probe.mjs store        # N concurrent HandOffStore.record, one store and two
node $TMP/probe.mjs t3 4 warm hot [model=codex/gpt-6-luna]
node $TMP/probe.mjs cleanup      # delete leftover probe threads and projects
```

The `t3` phase calls `T3HandOff.steps().startThread` N times at once on a fresh clone, against the running T3 Code. Every prompt asks the agent to reply "OK" and use no tools. The phase polls T3 Code's shell until every turn settles, then deletes the threads, projects and worktrees it created. `warm` creates the T3 project for the clone first, as in the usual case. `hot` connects once before the starts, like a Wayfinder that has already loaded the model picker. CPU and memory were sampled every 500 ms with `Get-Counter` and T3 Code's process tree.

## Results

### Git: worktree creation and lock contention

5 trials per size, each on a fresh clone.

| Concurrent | Distinct branches (ticket hand-offs) | Median / max wall | Shared branch (new-map hand-offs) |
| --- | --- | --- | --- |
| 2 | 0/10 failed | 0.7-0.9 s | 5/10 failed |
| 4 | 0/20 failed | 0.9-1.3 s | 15/20 failed |
| 8 | 0/40 failed | 1.1-1.4 s / 1.7 s | 35/40 failed |

Git never hit `index.lock` or ref-lock contention with distinct branches. With a shared branch exactly one start succeeds per batch. See [What breaks](#what-breaks).

### T3 Code: starting threads

Claude (`claudeAgent` / `claude-opus-5-5`, effort medium, T3 Code's default), warm project, hot connection. Every start succeeded.

| Concurrent | Start (connect → turn dispatched) | Every turn settled | Load while running |
| --- | --- | --- | --- |
| 1 | 2.0-2.9 s | 14.5-17.8 s | not isolated (see caveats) |
| 4 | 2.0-5.4 s | 23.7-29.9 s | CPU 100% peak, 92% mean; +0.8 GB |
| 8 | 5.5-7.5 s | first 23-26 s, last 42-47.5 s | CPU 100%; +9 processes, +2.3 GB (~285 MB each) |

T3 Code's server stayed responsive at 8, and no dispatch was rejected. The start time grows because T3 Code spawns a provider process per session. The process count fell back to baseline within a minute after the turns ended.

A cold connection (a fresh `T3HandOff`, as right after Wayfinder starts) is much slower. One start took 2.9 s. At 2, 4 and 8 concurrent starts each took 9-11.6 s, because every caller runs its own server lookup and issues its own session (#138).

### Providers: rate limits

- **Claude:** 8 concurrent turns all completed. No 429s and no errors.
- **Codex** (`codex` / `gpt-6-luna`, 8 concurrent): starts took 2.8-4.2 s. 3 turns completed in 47-59 s. The other 5 failed with "Codex usage limit reached. Send the message again once the limit resets." A single start afterwards failed the same way, so the account's usage window had run out. This was not a concurrency throttle. Wayfinder's tracker shows these hand-offs as `failed` (`mapT3Status` reads `session.lastError`).

Neither provider showed a per-account concurrency limit at 8.

## What breaks

1. **Concurrent starts on one clone race** (#137). With no T3 project for the clone yet, every start dispatches `project.create`, and all but one fail with `OrchestrationCommandInvariantError: project … already exists for workspace root` (500 `orchestration_dispatch_failed`). New-map hand-offs all request `wayfinder/new-map` (`src/server.ts:705`). `freeBranch` (`src/t3.ts:87`) returns the same free name to every caller before any `worktree add` runs, so all but one fail with `a branch named 'wayfinder/new-map' already exists`. In both cases the loser falls back to the clipboard.
2. **Cold connections duplicate work and leak sessions** (#138). `connect()` (`src/t3.ts:217`) awaits `serverCommand` between its check and its assignment. N cold callers run N PowerShell lookups and issue N 12-hour `wayfinder-map` sessions, and N−1 of them are never revoked (15 → 18 sessions after 4 starts). Each start is also 3-5x slower.
3. **Two Wayfinder processes overwrite each other's records** (#139). See below.
4. **Leftover worktree directories block a start.** `freeBranch` checks only the branch, not the target path. If a worktree directory survives without its branch (a crashed start, or files Windows kept locked), `worktree add` fails with "already exists". This came up during the probes. It was not filed, because it needs a crash first.

## The #98 lock and the store

- **Per-ticket lock: works.** `startingTickets` (`src/server.ts:258`, `:792-848`) is an in-process set keyed `repo#ticket`, checked before `liveTicketHandOff` (`src/handOffTracking.ts:741`). A second start for the same ticket gets a 409 while the first one runs. Starts for different tickets run in parallel, which is what races in #137. New-map hand-offs have no lock at all.
- **`HandOffStore` within one process: safe.** `persist()` (`src/handOffTracking.ts:599`) builds the payload synchronously and chains its writes through `this.writes`, then writes a temp file and renames it. 2, 4 and 8 concurrent `record()` calls saved every record.
- **`HandOffStore` across processes: loses records** (#139). Each process loads the file once and writes its whole in-memory copy. The desktop app holds a single-instance lock (`src/desktop/main.ts:246`), but the CLI can run next to it. Two stores on one file kept only half the records every time (1/2, 2/4, 4/8), and the Windows rename sometimes failed with `EPERM`.

## Caveats

- Every turn was trivial ("reply OK"). Real sessions read files and run builds and tests, so they use more CPU and memory than these numbers show. That argues for a cap below 8, not above it.
- The machine had other work running, so the CPU baseline was noisy: a single start also read 100% peak and 91% mean. The memory and process deltas are more reliable than the CPU numbers.
- One machine and one account per provider. Other plans have different Codex windows and Claude limits.
- The Codex runs used up that account's usage window. The Codex numbers are from 8 concurrent starts only.
