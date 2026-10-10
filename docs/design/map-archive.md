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

- **File:** `~/.wayfinder-map/settled.json`, kept as it is. It holds only hand-made choices: `{ "<login>": { "<owner/repo>": { "<map number>": { "settled": true | false, "at": "<ISO time>" } } } }`. Login and repository are stored lowercase.
- **Meaning of a choice:** `settled: true` is a manual archive. `settled: false` is a restore. Both win over every automatic rule.
- **Automatic archives are never stored as choices.** They are worked out whenever the repository's maps are fetched from GitHub, from facts the map list already has (`settlementOf` in `fetchMaps`). The result is cached with the rest of the snapshot, in memory and in the on-disk snapshot cache (`src/repositorySnapshotCache.ts`), but `settled.json` never holds it. A map stops being automatically archived on the first fresh fetch after the facts change, with nothing to clean up.
- **Migration:** none. Existing Settle choices become manual archives, and existing Unsettle choices become restores. The file name and its keys can stay; renaming them would only add a migration.
- **Writes** run one at a time inside one `SettleStore` (`set` chains on `writing`), so two quick clicks can't overwrite each other. Other processes are not locked. Ticket #241 may move the write to `SettingsFileWriter` (`src/settingsFile.ts`) for an atomic replace; the shape stays the same.

## Account isolation

- Choices are keyed by the signed-in GitHub login (`signedInLogin` in `src/server.ts`), so each account on the machine keeps its own archive. Archiving affects only that login's view; the GitHub issue and its tickets are never changed.
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
| Finished (new) | The map has at least one ticket and every ticket is done | No | `finished` (new) | A ticket reopens or a new ticket is added **(user)** |
| Idle | Open map, nothing on it or its tickets changed for 30 days (`IDLE_DAYS`) | No | `idle` | Something on the map changes **(user: keep this rule)** |
| Manual | The user archives it | Yes, `settled: true` | `manual` | Only the user's Restore, even if a ticket reopens **(user)** |

A **restore** stores `settled: false`. A restored map stays active until the user archives it again, even while it is finished, closed or idle (map decision). A restored map whose ticket reopens and is finished again still stays active, because the restore choice still wins.

Opening an archived map does not restore it (map decision). Opening reads its tickets once (`expand`, `src/github.ts`) but starts no watcher and no map-event inbox (`rememberMapOpen`, `src/ui/app.ts`).

### The finished rule

- Finished means `total > 0 && completed === total`, using the map issue's `sub_issues_summary`, which the map list already returns (`src/github.ts`). It needs no extra GitHub call, so a reopened ticket is noticed on the next fresh fetch even though archived maps are not watched. The conditional refresh (`refreshIfChanged`) skips unopened archived maps, so the return to active waits for the next full fetch; #243 decides whether that is soon enough or the map-issue list needs its own conditional read.
- When the rules overlap, the reason shown is the first that applies: manual choice, then closed, then finished, then idle.
- Two cases for #243 to check against GitHub before relying on the count: whether `completed` counts tickets closed as not planned, and tickets listed only in the map body and not attached as sub-issues (the app already warns about those; see `unattachedTicketsWarning`).

## Background activity

**(user)** Archiving pauses the map's background work, and restoring resumes it. Settled already does most of this:

- **Map watcher:** stops, drops its saved baseline and closes any open event streams (`MapWatcher.stop` via `reconcile`). No map-event notifications arrive for an archived map. Restart and a waiting Auto map batch (next point) are today's exceptions.
- **Auto map:** its setting is **kept**, not turned off, and it resumes when the map returns to the active list, whether by Restore or by a ticket reopening on a finished map. Today `AutoMapService` checks for a settled map only when Auto map is turned on (the `map.settled !== null` guard). A batch already waiting when the map is archived still loads the map and submits without checking (`start` in `src/autoMapService.ts`; the hand-off route in `src/server.ts` doesn't check either). If that submit fails, the batch also posts its "ready" notification for the tickets (`start` falls back to `unblocked` notices) with no archive check. **Contract (#241):** Auto map submits nothing and posts no notification for a map that is archived when the batch starts.
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

- #241 Persist per-user archive and restore state: reuse `SettleStore` and `settlementOf` and don't add a new file. Close the two gaps above: no watching or Auto map on archived maps at start-up, and no Auto map batch submitted, and no "ready" notification posted, for a map archived while the batch waited.
- #242 Archive, Archived maps, Open, and Restore controls: replace the Settle and Unsettle controls and the Settled section rather than adding new ones next to them. **(user)** No chosen prototype shows these controls yet, so #242 needs [#288](https://github.com/RAbdelrhman/wayfinder-map/issues/288), the prototype of the archive controls and the Archived maps view, and builds only what the picked prototype shows.
- #243 Automatically archive finished maps: owns the `finished` reason and the finished rule above, derived and not stored, including the return to active when a ticket reopens. It also settles the two open questions about `sub_issues_summary`.
