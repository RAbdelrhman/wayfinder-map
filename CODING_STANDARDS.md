# Coding standards

Judgement calls the Claude reviewer applies to every PR. Each rule is followed by why.

## Only evidence changes state

Move a stored state (resolve an alert, finish a hand-off, clear a stall, close a ticket) only on a positive observation of the new state. Treat a failed fetch, a timeout, `null`, a missing field or an unrecognised value as unknown, and keep the last known state.

Why: otherwise an outage or a partial read looks like progress, and alerts resolve or hand-offs finish that never did (#260).

## Newest write wins

Write shared state (the JSON stores, localStorage) as read, merge, write under a lock, as `HandOffStore` does with its lock file and `withInboxLock` does across tabs, and keep a record only when it is newer than the stored one. Handle a `storage` event by re-reading; any write it triggers is idempotent, so another tab's echo writes nothing.

Why: tabs, the desktop app and pollers write concurrently, so a slow older snapshot overwrites a newer one, or two tabs echo writes back and forth (#260).
