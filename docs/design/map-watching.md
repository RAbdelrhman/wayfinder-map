# Watching a map: what Wayfinder can detect, and what it costs

Research for [#122](https://github.com/RAbdelrhman/wayfinder-map/issues/122) on map [#121](https://github.com/RAbdelrhman/wayfinder-map/issues/121). Measurements were taken on 2026-09-26 (UTC) against `RAbdelrhman/wayfinder-map` (4 maps, 63 tickets) and the local T3 Code server (106 threads).

## Recommendation

Watch each open map with one **conditional** `GET repos/{repo}/issues/{map}/sub_issues?per_page=100` every **2 minutes**, sending the last `ETag` in `If-None-Match`. A `304` costs nothing. A `200` means something on the map changed; diff the returned tickets against the last copy and re-read only what the diff needs. Get PR and CI state from T3 Code's shell for tickets that have a hand-off, and from one GraphQL query per repository for the rest.

In steady state this costs 0 REST points an hour. The worst case (every poll returns `200`) is 30 points per map per hour, so 20 maps is 600 points an hour, 12% of the 5,000 budget.

Also stop the map page's 30-second auto-refresh from forcing a full re-read of the repository. That refresh costs about 70 REST points each time, so one open tab costs about 8,400 points an hour, which is over the limit on its own (see [Today's cost](#todays-cost)).

## Today's cost

- The map page refreshes every 30 s while visible (`src/ui/autoRefresh.ts:1`), and every refresh after the first sends `?refresh=1` (`src/ui/app.ts:266`), which skips the server's snapshot cache (`src/repositoryStore.ts:43`).
- A forced snapshot runs `fetchMaps` (`src/github.ts:293`): one `gh issue list` for the maps, one `sub_issues` read per map (`src/github.ts:269`), then one `dependencies/blocked_by` read per ticket (`src/github.ts:207`), plus blocking and outside-ticket reads.
- Measured twice with the real `fetchMaps`: **70 and 71 REST points** plus about 1 GraphQL point, taking 10 to 13 s. It re-reads every map in the repository, including closed ones.
- 70 points × 120 refreshes an hour = **~8,400 REST points an hour** for one visible tab. That explains the rate-limit warnings the app already words for users (`RATE_LIMIT_WARNING`, `src/github.ts`).
- Hand-off tracking adds more: `gh pr list --head <branch>` every 5 min per hand-off without a PR, and `gh pr view --json state,mergedAt` every 60 s per open PR (`src/handOffTracking.ts:11-15`, `:289`, `:314`). Each is a GraphQL call of at least 1 point.

## What GitHub says about the limits

- REST: 5,000 requests an hour per user. Secondary limits: 100 concurrent requests and 900 points a minute, with most `GET`s counting 1 point. ([Rate limits for the REST API](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api))
- "Making a conditional request does not count against your primary rate limit if a `304` response is returned and the request was made while correctly authorized." Respect `x-poll-interval` when it is sent. ([Best practices for using the REST API](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api))
- GraphQL: a separate 5,000 points an hour per user; every query costs at least 1 point; secondary limit 2,000 points a minute. GraphQL has no ETag or conditional requests, so every poll pays. ([Rate limits and query limits for the GraphQL API](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api))

## Detecting a change

### Verified by measurement

| Probe | Result |
| --- | --- |
| `sub_issues` on #121, then 3 repeats with `If-None-Match` | `304 Not Modified` each time; `X-RateLimit-Used` stayed at 73 across all three |
| Two back-to-back reads of `issues?state=all&sort=updated&per_page=50` | Identical `ETag`, so the ETag is stable when nothing changes |
| `Cache-Control` on list endpoints | `private, max-age=60`: polling faster than once a minute buys nothing |
| `gh api -i -H 'If-None-Match: …'` on a 304 | Prints the 304 headers but **exits 1**. `gh()` (`src/github.ts:59`) turns that into a `GhError`, so the watcher must treat a 304 as success |
| `repos/{repo}/events` | Sends `X-Poll-Interval: 60` |

### Closed, claimed and unblocked: one `sub_issues` read covers all three

Each item in the `sub_issues` response carries `state`, `closed_at`, `assignees`, `updated_at` and `issue_dependencies_summary`. In that summary, `blocked_by` counts **open** blockers only, and `total_blocked_by` counts all of them. For example #40 on map #35 is `{"blocked_by":0,"total_blocked_by":2}` after both blockers closed. So:

- **Closed**: `state` flips to `closed`.
- **Claimed**: `assignees` gains someone.
- **Unblocked**: `blocked_by` drops to 0 while `total_blocked_by` stays above 0. When a blocker closes, the dependent's summary changes, so the map's ETag changes even though nobody touched the dependent.
- **New edge**: `total_blocked_by` or `total_blocking` changes. Only those tickets need a fresh `dependencies/blocked_by` read.

A map poll therefore costs 0 points when nothing changed and 1 point when something did, plus one `blocked_by` read per ticket whose edge counts changed. That replaces the ~70-point full re-read.

### Other sources, and why they come second

- **Repo-wide `issues?sort=updated`** (1 conditional request per repository): cheap, but it changes on any issue or PR activity in the repository, including comments. Useful as a gate in front of many maps in one repository, not as the detector.
- **`repos/{repo}/issues/events`**: types seen in the last 100 events were `closed`, `assigned`, `labeled`, `blocked_by_added`, `blocking_added`, `sub_issue_added`, `parent_issue_added`, `merged`, `referenced` and `head_ref_deleted`. It is a good audit trail for "what just happened", but it has no event for "your blocker closed". Unblocking still has to be derived from the graph.
- **Issue timeline** (`issues/{n}/timeline`): the only place that shows a PR mentioning a ticket (`cross-referenced`). It is one call per ticket, so it is too expensive to poll across a map.

## Finding a ticket's PR

| Source | Evidence | Verdict |
| --- | --- | --- |
| Closing references (`closingIssuesReferences`) | Empty on all 12 most recent PRs. The ticket flow avoids auto-close wording on purpose, so the closeout comment lands first. | Don't rely on it |
| `wayfinder/<n>-<slug>` branch | Every ticket PR among the 12 most recent (#110 to #115, #118) uses it; the others are `feature/` work with no ticket. #98 had two PRs with different slugs (#111, #113). | Primary GitHub key: match by the `wayfinder/<n>-` **prefix**, and expect more than one PR |
| `gh pr list --search "head:wayfinder/98-"` | Returned both #111 and #113, so `head:` matches the prefix | Works, but costs 1 GraphQL point per ticket |
| One GraphQL query per repository listing PRs with `headRefName`, `reviewDecision`, `mergeStateStatus` and the last commit's `statusCheckRollup { state }` | `rateLimit.cost` was **1** for 50 PRs | Best GitHub fallback: one point covers every ticket in the repository |
| `gh pr view --json statusCheckRollup,reviewDecision` | Works, 1 GraphQL point per PR | Only for a ticket the user opens |
| T3 Code hand-off tracking | See below | First choice for any ticket with a hand-off |

## What T3 Code already reports

The shell (`/api/orchestration/shell`, streamed over `orchestration.subscribeShell`, see `src/t3Api.ts`) returns `snapshotSequence`, `projects`, `threads` and `updatedAt`. Each thread has:

- **Branch and worktree**: `branch`, `worktreePath`. This thread reports `wayfinder/122-what-can-wayfinder-detect-…`, so thread ↔ ticket is a string match.
- **Done / needs input / errored**: `session.status` (`running`, `ready`, `stopped`), `session.lastError`, `latestTurn.state` (`running`, `completed`, `interrupted`, `error`), `hasPendingApprovals`, `hasPendingUserInput`, `settledAt`. Across 106 live threads: 86 `stopped/completed`, 4 `running/running`, 3 `stopped/error`, 2 `stopped/interrupted`. `mapT3Status` (`src/handOffTracking.ts`) already turns these into `running`, `waiting`, `finished`, `failed` and `interrupted`.
- **PR, with state and CI**: `pullRequests[]` items carry `number`, `url` and a `snapshot` with `state` (`merged`, …), `headBranch`, `isDraft`, `reviewDecision`, `checksState` (`passing`, …), `mergeability`, `mergedAt` and `syncedAt`. For #95 the snapshot said `merged` 45 s after the merge (`mergedAt 17:40:40Z`, `syncedAt 17:41:25Z`). 57 of 106 threads had a PR.

Two findings for the implementation:

1. `parsePullRequest` (`src/handOffTracking.ts:160`) reads `state` and `mergedAt` from the top level of each PR item, but T3 Code puts them under `snapshot`. Over the live shell, every one of the 114 PR refs parsed with no state. That is why Wayfinder rechecks each open PR with `gh pr view` every 60 s (`src/handOffTracking.ts:314`). Reading `snapshot.state`, `snapshot.checksState` and `snapshot.reviewDecision` makes that recheck unnecessary while T3 Code is online.
2. The shell is local and free, and the WebSocket pushes `thread-upserted` as soon as a thread changes (#38). For any ticket with a hand-off, T3 Code answers "done, needs input, errored, PR open, CI passing, merged" without a GitHub call. GitHub is only needed for tickets nobody handed off, and to confirm the issue itself closed.

## Budget

REST points an hour for the recommended watcher, worst case (every poll returns `200`), before the few `blocked_by` reads a real change triggers. Steady state with no changes is **0** at every size.

| Open maps | Every 1 min | Every 2 min | Every 5 min |
| --- | --- | --- | --- |
| 1 | 60 | 30 | 12 |
| 5 | 300 | 150 | 60 |
| 20 | 1,200 | 600 | 240 |

GraphQL PR fallback, one query per repository per poll, only while a map has a claimed ticket without a T3-tracked PR: at most the same numbers against the separate 5,000-point GraphQL budget, and usually far fewer, because maps share repositories.

For comparison, the current full re-read at those intervals:

| Open maps (~70 points per repository read) | Every 1 min | Every 2 min | Every 5 min |
| --- | --- | --- | --- |
| 1 repository | 4,200 | 2,100 | 840 |
| 5 repositories | 21,000 | 10,500 | 4,200 |
| 20 repositories | 84,000 | 42,000 | 16,800 |

A full re-read cannot watch more than one repository at a 5-minute interval without hitting the limit. The conditional watcher can watch 20 maps every minute and still leave three quarters of the budget, even if every poll misses.

## Why 2 minutes

- 1 minute is the floor anyway: list responses are `max-age=60`, and `/events` asks for 60 s. Polling faster returns cached data.
- 2 minutes keeps the worst case for 20 maps at 12% of the REST budget, leaving plenty for the user's own `gh` use and for Wayfinder's page loads.
- The time a ticket takes is minutes to hours, so a 2-minute delay before "#124 just became unblocked" is not noticeable. When T3 Code finishes a thread, the WebSocket push is immediate, and Wayfinder can poll that map at once instead of waiting.
- 5 minutes saves little: the steady state is already free.

## Not verified

- Whether a PR that only mentions a ticket changes the map's `sub_issues` ETag. Opening PR #133 ("Research note for #122") added a `cross-referenced` event to #122's timeline but left its `updated_at` at `00:16:52Z`, so the issue object did not change. The map's ETag did change in the same window, but other tickets on #121 were being claimed at the time, so the ETag test was inconclusive. Either way, a watcher should not count on the issue to reveal its PR; the branch-prefix lookup covers this.
- Behaviour of `sub_issues` past 100 children (needs `--paginate`, one conditional request per page).
- Secondary-limit accounting for `304` responses. The docs only exempt them from the primary limit, so the watcher should still cap concurrency, as `fetchMaps` does.
