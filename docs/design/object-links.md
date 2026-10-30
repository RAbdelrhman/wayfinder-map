# Object IDs and destination links

Ramon requested IDs for repos, maps, tickets, prototypes and other linkable
objects on 2026-10-29. He chose prototype links that open the newest canvas by
default, with the capability to open a fixed revision too. Sol owns this API and
implementation work. Opus is reserved for UI design.

Use GitHub's existing opaque global node IDs for repositories and issues. A map
and a ticket are different Wayfinder roles for GitHub issues, so validate the
object type, labels and current owning map after resolving its ID. Never infer
the object type from the spelling of the ID. The current owner/repo name and
issue number remain readable labels and API coordinates, not permanent identity.

| Target | Identity | Destination |
| --- | --- | --- |
| RepoID | Repository node ID | `wayfinder://repo/<id>` |
| MapID | Map issue node ID | `wayfinder://map/<id>` |
| TicketID | Ticket issue node ID | `wayfinder://ticket/<id>` |
| PrototypeID | Prototype ticket node ID and its board path | `wayfinder://prototype/<ticket-id>?canvas=<board-path>` |
| PageID / FrameID | Authored IDs within that exact prototype | Optional `page` / `item` parameters |
| Revision | Immutable Git commit SHA | Optional `rev` parameter; absent means newest |
| T3 thread | T3 environment ID and raw thread ID | Existing T3 scoped reference / native thread route |
| Comment | GitHub comment node ID | Retain for a future comment destination; no new route yet |

The web server uses `/open/<kind>/<id>` with the same query parameters. Incoming
links contain neither a loopback address nor a desktop port. Legacy
`wayfinder://map?repo=owner%2Frepo&number=217` links remain supported.

An ID identifies a destination; it grants no access. Resolve with the current
viewer's GitHub sign-in, re-read the map's visibility and ownership, and apply the
existing follow policy. An unknown, deleted, inaccessible or wrongly typed
object must not resolve to another object or reveal saved private details.
Tickets open through their current map, and never enter a different map's graph,
counts, search or panel. A supplied map hint is not ownership evidence.
Server lookups honor the configured map label and ticket-type prefix. Ready
prompts advertise ticket/prototype destinations only after native parent-map
ownership is established; standalone and body-only tickets retain GitHub links.

Prototype links without `rev` resolve the current branch commit once on opening.
Assets and metadata then use that same immutable SHA, so a branch moving during
the download cannot mix versions. A fixed-revision link uses only that SHA.
Its board and adjacent config are read from the pinned commit, with the config's
ticket identity checked against the current owning ticket. It does not require
the board, a tile or even the prototype branch to survive in the latest version.
The existing viewer retains the canonical destination through reload and returns
to the owning ticket when closed.
Ready messages should include the newest destination and name the verified SHA;
an exact-revision link may accompany it when discussing that version.

Preserve the destination across sign-in. Reuse the existing screens and viewers.
Do not introduce a second browsing flow or display raw IDs throughout the UI.
New or changed UI still requires Ramon's prototype selection.

GitHub's node lookup is documented in
[Using global node IDs](https://docs.github.com/en/graphql/guides/using-global-node-ids).
Node IDs are opaque, including during GitHub's ID-format migrations.

Desktop delivery uses the existing release-please GitHub Actions workflow and
its next `chore: release` PR. Do not manually bump or install the desktop app.

Runtime routes now resolve these IDs using the current viewer on desktop/web and
mobile. Desktop queues cold and warm app links; the phone retains its object route
through sign-in. Prototype destinations reuse the existing canvas viewer, with
newest and pinned revisions. Live browser verification opened repository, map
#217, ticket #366, and both revisions of its actual canvas.

The installed 1.3.3 phone build contains the #226 R2A canvas viewer, object-ID
destinations and fixed revisions without a current branch. Physical Samsung
acceptance opened repo, map, ticket and newest/pinned canvas destinations, then
switched from a Wayfinder Activity link into the exact T3 delivery thread once
T3 was connected. Initial T3 reconnection showed its thread list instead.
Offline saved data must match an explicitly requested revision and board.
Every downloaded revision retains its own manifest. Pinned opens use that
manifest offline and do not replace the pointer used by newest destinations.
Consult `docs/mobile-builds.md` for actual build and
installation evidence. T3 must also preserve these explicit routes through its
Markdown sanitizer, native link presentation and desktop external-link boundary.
The companion change lives in T3's source; a Wayfinder update alone cannot change
the installed T3 client.
