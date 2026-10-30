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

Prototype links without `rev` resolve the current branch commit once on opening.
Assets and metadata then use that same immutable SHA, so a branch moving during
the download cannot mix versions. A fixed-revision link uses only that SHA.
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

Implementation status: portable URL factories/parser and malformed-link tests
exist. ID resolution and app navigation are still in progress. The installed
1.2.1 phone APK predates these new object-ID routes. Native canvas viewing is
owned by the selected #226 R2A design and implementation ticket #235. T3 chat's
custom-scheme compatibility remains a separate runtime requirement.
