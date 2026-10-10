# Archiving maps: lifecycle and persistence contract

Research for [#237](https://github.com/RAbdelrhman/wayfinder-map/issues/237) on map [#236](https://github.com/RAbdelrhman/wayfinder-map/issues/236). Read against `main` at `515dc34` on 2026-10-09. The decisions marked **(user)** were made by Ramon, one question at a time, in the #237 session.

## Recommendation

Archive is the existing **Settled** mechanism under a new name, with one more automatic rule: a finished map archives itself. **(user)** No second store, list or button is added. Settled already does most of what the map asks for:

- per-account choices in `~/.wayfinder-map/settled.json` (`SettleStore`, `src/settling.ts`);
- a hand-made choice that wins over the automatic rules (`settlementOf`, `src/settling.ts`);
- a collapsed list of settled maps with an Unsettle button (`settledSection`, `src/ui/repositoryView.ts`);
- background work that stops for settled maps (`reconcileMapWatches`, `src/server.ts`; `AutoMapService`, `src/autoMapService.ts`).

The tickets that build it rename Settled to Archive and add the finished rule. The labels, list and buttons they show come from the prototype the user picks, not from this document.

## Storage

- **File:** `~/.wayfinder-map/settled.json`, kept, with a host level added by #241. It holds only hand-made choices, today shaped as `{ "<login>": { "<owner/repo>": { "<map number>": { "settled": true | false, "at": "<ISO time>" } } } }`. Login and repository are stored lowercase.
- **Meaning of a choice:** `settled: true` is a manual archive. `settled: false` is a restore. Both win over every automatic rule.
- **Automatic archives are never stored as choices.** They are worked out whenever the repository's maps are fetched from GitHub (`settlementOf` in `fetchMaps`). Closed and finished come from the map list itself (finished can need one sub-issue read; see Ticket scope). Idle also needs ticket activity: when some open map has gone quiet, `fetchMaps` makes one search, `recentlyUpdated(repo, idleCutoff(now))`, and if that search fails or passes 1000 results, every map counts as recently changed, so nothing archives as idle. The result is cached with the rest of the snapshot, in memory and in the on-disk snapshot cache (`src/repositorySnapshotCache.ts`), but `settled.json` never holds it. A map stops being automatically archived on the first fresh fetch after the facts change, with nothing to clean up.
- **Migration:** none. Existing Settle choices become manual archives, and existing Unsettle choices become restores. The file name and the `settled` field can stay; renaming them would only add a migration. #241 adds a host level to the keys (see Account isolation) and reads today's login-only entries as `github.com`, so no rewrite of the file is needed.
- **Unreadable file:** today `readAll` turns a missing, unreadable or malformed file into `{}`, so no choices apply and the next write replaces the file, losing every saved choice. **Contract (#241):** only a missing file reads as empty. Any other read or parse failure applies no choices and blocks writes, and the file is left as it is until it reads cleanly. A blocked write fails through the archive route's existing error response (`502` with the store's message); the wording the user sees is a #241 question for the user. Keys are lowercased on read as well as on write, so a hand-edited file with mixed-case keys still applies.
- **Writes** run one at a time inside one `SettleStore` (`set` chains on `writing`), so two quick clicks can't overwrite each other. Other processes are not locked. Ticket #241 may move the write to `SettingsFileWriter` (`src/settingsFile.ts`) for an atomic replace; the shape stays the same.

## Account isolation

- Choices are keyed by the signed-in GitHub login (`signedInLogin` in `src/server.ts`), so each account on the machine keeps its own archive. Archiving affects only that login's view; the GitHub issue and its tickets are never changed.
- **Today's gap:** the keys hold the login only, as `follows.json` does. Two accounts with the same login on different GitHub hosts would share choices, even though the snapshot cache already scopes by host and login (`identity` in `src/repositoryStore.ts`). **Contract (#241):** key choices by host and login, reading today's entries as `github.com`. A renamed login starts with no choices, as it does for follows; that is accepted rather than keyed by user id, which would need a migration.
- Switching accounts applies the other login's choices on the next list. The on-disk snapshot cache is scoped by identity and choices (`persistedScope`, `src/repositoryStore.ts`), so one account's cached list is never shown to another.
- Signed out: no manual choices apply and the archive endpoint answers `409` (`Sign in with GitHub to settle maps.`). Automatic archives still apply, because they need no login.
- No cross-device sync in this version (out of scope on the map).

## Restart behavior

- Manual archives and restores survive restarts: `settled.json` is read on every fresh fetch from GitHub.
- After a restart, when a matching saved snapshot under 24 hours old exists (`src/repositorySnapshotCache.ts`), the first page shows it, archive state included, then refreshes it from GitHub in the background (`restore` in `src/repositoryStore.ts`). Automatic archives can change in that refresh: something may have changed on GitHub, and the idle rule counts 30 days from the current clock, so a map can turn idle while the app was closed. Without such a snapshot the first page waits for a fresh fetch.
- **Today's gap:** at start-up `AutoMapService.init` re-watches every map whose Auto map is on and asks for a catch-up read before any snapshot is listed, and the watcher's saved baselines (`src/mapWatchStore.ts`) are restored the same way. Watches on archived maps are dropped only when the first successful snapshot runs `reconcile`, so an archived map with Auto map on can be read after a restart.
- **Contract (#241):** after a restart an archived map is not watched and Auto map starts nothing on it. Start-up respects the stored and cached archive state before watching, rather than waiting for the first snapshot.

## Kinds of archive

| Kind | How it happens | Stored? | `reason` | Leaves the archive when |
| --- | --- | --- | --- | --- |
| Closed | The map issue is closed on GitHub | No | `closed` | The map issue reopens |
| Finished (new) | The map has at least one ticket and every ticket is done | No | `finished` (new) | A ticket reopens or a new ticket is added, so the map is no longer finished **(user)** |
| Idle | Open map, nothing on it or its tickets changed for 30 days (`IDLE_DAYS`) | No | `idle` | Something on the map changes **(user: keep this rule)** |
| Manual | The user archives it | Yes, `settled: true` | `manual` | Only the user's Restore, even if a ticket reopens **(user)** |

A **restore** stores `settled: false`. A restored map stays active until the user archives it again, even while it is finished, closed or idle (map decision). A restored map whose ticket reopens and is finished again still stays active, because the restore choice still wins.

Opening an archived map does not restore it (map decision). Opening reads its tickets once (the `expand` option of `fetchMaps`, then `withTickets` in `src/repositoryStore.ts`) but starts no watcher and no map-event inbox (`rememberMapOpen`, `src/ui/app.ts`).

### The finished rule

- Finished means `total > 0 && completed === total`, using the map issue's `sub_issues_summary`, which the map list already returns (`src/github.ts`). Usually it needs no extra GitHub call (the exception is under Ticket scope), so a reopened ticket is noticed on the next fresh fetch even though archived maps are not watched. The conditional refresh (`refreshIfChanged`) skips unopened archived maps, so the return to active waits for the next full fetch; #243 decides whether that is soon enough or the map-issue list needs its own conditional read.
- When the rules overlap, the reason shown is the first that applies: manual choice, then closed, then finished, then idle.
- **Ticket scope:** "every ticket" means every ticket the map shows, and the finished and reopen rules use the same scope. `sub_issues_summary` counts only attached sub-issues, so a map whose body lists a ticket that isn't attached (`parseChildNumbers`; the app warns about these with `unattachedTicketsWarning`) is never finished by this rule. It stays active until those tickets are attached, so the finished rule can't hide an open body-only ticket or miss its reopening. This guarantee belongs to the finished rule only: the idle rule (30 days with no change to the map or any of its tickets) and a manual archive can still archive such a map, as they do today. Adding a ticket that is already done keeps a finished map finished, so the map stays archived. It returns to active only when the map stops being finished. The list alone can't always tell: an archived map that was never opened has no sub-issue numbers read (`settledMap`), so a ticket added to its body later is invisible to the summary. Today `knownTickets` is taken only from maps whose tickets were loaded (`src/repositoryStore.ts`), so an archived map loses its ticket numbers after one fetch. **Contract (#243):** carry each map's last-read **attached sub-issue** numbers forward while it is archived, in the snapshot and its disk cache, instead of dropping them. Body-only tickets are not added to that set, because `knownTickets` today mixes both kinds. Then compare the ticket numbers in the map body, which the list already returns, with the attached set. A body ticket outside the set triggers one read of the map's sub-issues, which refreshes the set. If the ticket is still not attached, the map is not finished. #243 may remember the numbers it found unattached, so the same ticket doesn't cost a read on every fetch. A map with no carried-forward numbers (a cold start with no saved snapshot) gets that one read. A map the rule can't confirm as finished stays or becomes active.
- One case for #243 to check against GitHub before relying on the count: whether `completed` counts tickets closed as not planned.

## Background activity

**(user)** Archiving pauses the map's background work, and restoring resumes it. Settled already does most of this:

- **Map watcher:** stops, drops its saved baseline and closes any open event streams (`MapWatcher.stop` via `reconcile`). No map-event notifications arrive for an archived map. Restart and a waiting Auto map batch (next point) are today's exceptions.
- **Auto map:** its setting is **kept**, not turned off, and it resumes when the map returns to the active list, whether by Restore or by a ticket reopening on a finished map. Today `AutoMapService` checks for a settled map only when Auto map is turned on (the `map.settled !== null` guard). A batch already waiting when the map is archived still loads the map and submits without checking (`start` in `src/autoMapService.ts`; `startNextBatch` in `src/server.ts`, shared by Auto map and the hand-off route, doesn't check either). If that submit fails, the batch also posts its "ready" notification for the tickets (`start` falls back to `unblocked` notices) with no archive check. **Contract (#241):** Auto map submits nothing and posts no notification for a map that is archived at any point before submission. It checks the archive state when the batch starts and again just before it submits or posts the fallback notices, and `startNextBatch` refuses batches marked `auto: true` for an archived map.
- **Closed maps:** watching and Auto map need an open map issue (`reconcileMapWatches` keeps `map.open && map.settled === null`). Restoring a closed map puts it back in the active list but starts no background work; that resumes only if the map issue reopens.
- **Start next and hand-offs started by hand:** unchanged. An opened archived map still offers them, as an opened settled map does today, because the user starts them. Starting work from an archived map does not restore it. This was not asked; ask the user before changing it.
- **Running hand-offs (user):** keep being tracked until they finish. They stay in the hand-off list and inbox and keep their status changes and notifications. `HandOffTracker` already ignores whether a map is settled.
- **Failed reads:** watches and Auto map are reconciled only after a successful snapshot. If a read fails, the last good snapshot and its watches stay as they were.

## Authored, followed, and inaccessible maps

- **Authored maps:** every rule applies, and the author's choices are theirs alone.
- **Followed maps** (someone else's public map): the follower can archive and restore it for themselves, and the automatic rules apply to it as to their own. Archiving does not unfollow, and unfollowing does not delete the archive choice. Other followers and the author are not affected.
- **Maps that drop out of the list** (the map is deleted or transferred, or loses its map label; a followed map turns private, or the user unfollows it): a successful fetch no longer returns the map, so it leaves both the active and the archived list. The next snapshot request runs `reconcile`, which stops its watcher and Auto map, since both act only on maps in the active set. The follow route returns a fresh snapshot without reconciling (`scoped?.action === 'follow'` in `src/server.ts`), so after an unfollow the watcher stops on the page's next snapshot read rather than at once. Running hand-offs keep their own tracking.
- **Repositories that can't be read** (access lost, network or rate-limit failure): the snapshot route answers `502` and keeps the last good snapshot. Nothing is reconciled, so maps neither move between lists nor change their background work until a read succeeds. Switching accounts is different: it clears the repository caches (`clearAccountCaches` in `src/server.ts`), so the new account sees only what its own reads return.
- **Stored choices are never pruned.** If a map becomes visible again, its manual archive or restore applies as before. Its automatic archive is worked out again from its current state, so it may differ. A stale entry costs a few bytes and nothing else.

## What the follow-up tickets inherit

- #241 Persist per-user archive and restore state: reuse `SettleStore` and `settlementOf` and don't add a new file. Key choices by host and login, and keep an unreadable `settled.json` instead of overwriting it. Close the two background gaps above: no watching or Auto map on archived maps at start-up, and no Auto map batch submitted, and no "ready" notification posted, for a map archived while the batch waited.
- #242 Archive, Archived maps, Open, and Restore controls: replace the Settle and Unsettle controls and the Settled section rather than adding new ones next to them. **(user)** No chosen prototype shows these controls yet, so #242 needs [#288](https://github.com/RAbdelrhman/wayfinder-map/issues/288), the prototype of the archive controls and the Archived maps view, and builds only what the picked prototype shows.
- #243 Automatically archive finished maps: owns the `finished` reason and the finished rule above, derived and not stored, including the return to active when a ticket reopens. It also checks how `completed` counts tickets closed as not planned.
