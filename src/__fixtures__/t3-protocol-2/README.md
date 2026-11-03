Recorded on 2026-11-03 from the installed T3 Code `0.1.7-nightly.20261103.4119`, which reports orchestration protocol 2 (#254).

- `environment.json`: `GET /.well-known/t3/environment`, capabilities removed.
- `shell-rows.json`: one real `GET /api/orchestration/shell` row per status seen on this machine.
- `thread-start.json`: a disposable thread started through `threadCommands` and `T3Api.dispatch`, as Wayfinder starts a ticket. It holds the `orchestration.dispatchCommand` frames sent and received, the `subscribeShell` frames that followed while the thread ran to completion, and the statuses the hand-off store mapped at recording time. The thread was deleted afterwards.

Titles, paths, branch names and message text are replaced with `Recorded …` placeholders, and fields Wayfinder does not read (lineage, goals, PR links, opens, repository identity roots) are dropped. Status, run, request, error and sequence fields are kept as recorded.
