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
- **Automatic archives are never stored.** They are worked out each time the repository's maps are listed, from facts the map list already has. A map stops being automatically archived as soon as the facts change, with nothing to clean up.
- **Migration:** none. Existing Settle choices become manual archives, and existing Unsettle choices become restores. The file name and its keys can stay; renaming them would only add a migration.
- **Writes** run one at a time inside one `SettleStore` (`set` chains on `writing`), so two quick clicks can't overwrite each other. Other processes are not locked. Ticket #241 may move the write to `SettingsFileWriter` (`src/settingsFile.ts`) for an atomic replace; the shape stays the same.

## Account isolation

- Choices are keyed by the signed-in GitHub login (`signedInLogin` in `src/server.ts`), so each account on the machine keeps its own archive. Archiving affects only that login's view; the GitHub issue and its tickets are never changed.
- Switching accounts applies the other login's choices on the next list. The on-disk snapshot cache is scoped by identity and choices (`persistedScope`, `src/repositoryStore.ts`), so one account's cached list is never shown to another.
- Signed out: no manual choices apply and the archive endpoint answers `409` (`Sign in with GitHub to settle maps.`). Automatic archives still apply, because they need no login.
- No cross-device sync in this version (out of scope on the map).

## Restart behavior

- Manual archives and restores survive restarts: they are read from `settled.json` on every list.
- Automatic archives are recomputed on the first list after a restart, so they come out the same as before it unless something changed on GitHub while the app was closed.
- The map watcher's saved baselines (`src/mapWatchStore.ts`) are restored at start-up, then the first snapshot drops watches on archived maps (`reconcile`). An archived map is never polled again after a restart.

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

- Finished means `total > 0 && completed === total`, using the map issue's `sub_issues_summary`, which the map list already returns (`src/github.ts`). It needs no extra GitHub call, so a reopened ticket is noticed on the next list even though archived maps are not watched.
- When the rules overlap, the reason shown is the first that applies: manual choice, then closed, then finished, then idle.
- Two cases for #243 to check against GitHub before relying on the count: whether `completed` counts tickets closed as not planned, and tickets listed only in the map body and not attached as sub-issues (the app already warns about those; see `unattachedTicketsWarning`).

## Background activity

**(user)** Archiving pauses the map's background work, and restoring resumes it. This is what Settled already does:

- **Map watcher:** stops, drops its saved baseline and closes any open event streams (`MapWatcher.stop` via `reconcile`). No map-event notifications arrive for an archived map.
- **Auto map:** starts nothing on an archived map (`AutoMapService`). Its setting is **kept**, not turned off, and it resumes when the map returns to the active list, whether by Restore or by a ticket reopening on a finished map.
- **Start next:** offered only on active maps, as today.
- **Running hand-offs (user):** keep being tracked until they finish. They stay in the hand-off list and inbox and keep their status changes and notifications. `HandOffTracker` already ignores whether a map is settled. Only new hand-offs from Auto map stop.

## Authored, followed, and inaccessible maps

- **Authored maps:** every rule applies, and the author's choices are theirs alone.
- **Followed maps** (someone else's public map): the follower can archive and restore it for themselves, and the automatic rules apply to it as to their own. Archiving does not unfollow, and unfollowing does not delete the archive choice. Other followers and the author are not affected.
- **Maps that become inaccessible** (the map is deleted or transferred, the repository is no longer readable, a followed map turns private, or the user unfollows it): the map leaves both the active and the archived list, because the map list never returns it. Its watcher and Auto map stop on the next snapshot (`reconcile` drops maps missing from the active set). Running hand-offs keep their own tracking. Its stored choice is kept and not pruned, so if the map becomes visible again it comes back in the same state. A stale entry costs a few bytes and nothing else.

## What the follow-up tickets inherit

- #241 Persist per-user archive and restore state: reuse `SettleStore` and `settlementOf`, add the `finished` reason, and don't add a new file.
- #242 Archive, Archived maps, Open, and Restore controls: replace the Settle and Unsettle controls and the Settled section rather than adding new ones next to them, following the chosen prototype.
- #243 Automatically archive finished maps: the finished rule above, derived and not stored, including the return to active when a ticket reopens.
