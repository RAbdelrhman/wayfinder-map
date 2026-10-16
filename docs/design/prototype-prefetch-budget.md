# Prototype prefetch budget

Decision for #306 on map #205.

## Budget and selection

Startup and prototype-list refresh may spend **zero REST calls on speculative canvas file downloads**. The server no longer queues every file on every historical prototype branch. The existing tile previews and viewer preparation request the canvas the person is viewing or about to open. This applies equally to open and decided tickets; an old canvas can still open when requested.

Discovery still reads the branch list, comparisons, verdict comments and the HTML/configuration needed to describe the gallery. Those required metadata reads are separate from the zero speculative-download budget. This change does not cap all GitHub activity on startup, including saved map watchers, or claim that a cold list is free. Missing files and failed reads remain retryable, rather than saving an authorization failure as an immutable absence.

## Restart cache

Discovery and `/proto/` responses share the same SHA-addressed raw-byte cache. Branch-addressed requests remain uncached. Successful reads are coalesced in flight, retained in a 50 MiB memory cache, and saved under `~/.wayfinder-map/prototype-files-v1/<account-scope>/`. Scope is a hash of GitHub host and login; the file key includes scope, repository, commit and path. Different revisions and accounts never share an entry.

Disk writes use unique temporary files and atomic rename. Each entry has a checksum; missing, damaged, oversized or inaccessible entries fall back to GitHub. A write prunes the oldest disk entries to a 50 MiB byte budget including entry checksums, with space for one checksum. Evicted files may be fetched again. Concurrent processes may temporarily exceed the budget until a prune finishes. Memory hits use LRU; disk eviction uses write time. Cache writes run in a serialized background queue and cannot delay or fail a canvas response. Graceful runtime shutdown drains that queue before returning; forced termination can interrupt a pending write. No credentials or response headers are stored. The server applies sandbox and content headers on every response, including cache hits.

The first measurement populated 74 entries totaling 7,430,459 bytes, so persisting this repository's canvas bytes is inexpensive. Account changes clear in-memory state. Generation checks prevent older reads from refilling cleared memory and skip stale queued writes. A write already executing remains confined to its original account directory. The existing identity reader may revalidate the account once per 30 seconds while assets are requested; this small authentication cost is retained for isolation.

## Measurements

Measured on 2026-10-15 with the built localhost CLI, 15 prototype branches, using `gh api rate_limit` core `used` before and after each two-minute window. The first window starts a server and loads `/api/prototypes`; the second forces `/api/prototypes?refresh=1`; the third starts a fresh process and loads the list using the persisted cache. No UI automation was run during those windows. Normal saved-map startup activity was enabled. These are shared-account quota deltas, not isolated per-endpoint counts.

Initial measurement, before moving persistence off the response path:

- cold-start: core used 102 -> 262, **160 calls**; list **50.003 s**; HTTP 200, 15 prototypes.
- forced-refresh: core used 262 -> 333, **71 calls**; list **32.797 s**; HTTP 200, 15 prototypes.
- restart: core used 333 -> 415, **82 calls**; list **15.870 s**; HTTP 200, 15 prototypes.

Final cache implementation, with asynchronous persistence:

- cached-start: core used 433 -> 519, **86 calls**; list **35.862 s**; HTTP 200, 15 prototypes.
- forced-refresh: core used 519 -> 588, **69 calls**; list **7.125 s**; HTTP 200, 15 prototypes.

The final cached start is a new process using files saved by the earlier process. All windows were at least 120 seconds. The shared quota also includes other callers; the diagnostic call counter is not a quota measure. In the initial trace, contents calls fell from 77 on a cold load to 3 on refresh and restart: the screenshot-directory listing plus two missing files. Successful SHA-addressed file bytes were reused. The final process also retained just those three contents calls per list read.

Validation on the final source: `bun run typecheck` exit 0, `bun run lint` exit 0, `bun run test` exit 0, 121 files and 1,583 tests passed. Focused tests cover stalled disk writes, graceful shutdown draining, restart reuse, scopes, corruption, disk bounds, failed writes, shared discovery reads and zero speculative reads. One earlier full run timed out in the existing demo lint-boundary setup hook; subsequent complete runs passed unchanged.

The #214 historical reference was 275 calls and about 31 seconds with 13 branches. Branch count, saved watcher state, machine load and network timing differ, so that reference is not a controlled before/after benchmark. The policy guarantee is zero speculative file calls; successful cached SHA bytes do not need another GitHub read while retained. List latency includes required discovery and is not guaranteed by this budget.
