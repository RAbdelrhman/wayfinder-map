# The map format

A wayfinder map is made of plain GitHub issues. You can create one by hand on
github.com, with `gh`, or with any agent or skill. Wayfinder reads whatever it finds
and doesn't care what made it. This page lists everything Wayfinder looks at.

Labels below use the defaults. If you changed `--map-label` or `--type-prefix`, use
those instead.

## The map issue

- **Label:** `wayfinder:map`. This label is the only thing that makes an issue a map.
- **Title:** the destination, in a few words.
- **Author:** the GitHub account that opens the issue owns the map. Your own maps
  always show to you in Wayfinder.
- **Body:** `##` sections. Each one is optional, and Wayfinder shows any that are
  there:

```markdown
## Destination

Where the work ends up, in a sentence or two.

## Notes

Context, constraints, and skills or docs worth reading first.

## Decisions so far

- [#12](https://github.com/owner/repo/issues/12#issuecomment-1): what was decided, in one line.

## Fog

- Questions nobody can answer yet, one per line.

## Out of scope

- What this map will not do.
```

`Decisions` works as a heading too, and so do `Not yet specified` and `Fog`.
Headings are matched without regard to case.

### Visibility

A map is **private** unless its body has this line on its own:

```
Visibility: public
```

Private maps show only to their author. Other people see a public map in the
repository's Public maps list and can follow it. Remove the line to make the map
private again. This only affects what Wayfinder shows. GitHub still decides who
can read the issue.

## Tickets

- **Label:** one of `wayfinder:research`, `wayfinder:prototype`,
  `wayfinder:grilling` or `wayfinder:task`.
- **Belonging to the map:** add the ticket as a **sub-issue** of the map issue.
  Wayfinder also picks up tickets the map body lists, either as a task list
  (`- [ ] #12`) or as full issue links, and warns you that they aren't attached.
- **Waiting on other tickets:** use GitHub's native "blocked by" issue
  relationship. If you can't, put a `Blocked by: #4, #7` line in the ticket body.
- **Body:** usually a `## Question` (or `## What to build`) and a `## Done when`.
  Wayfinder shows the body as written.

### Ticket state

Wayfinder works out each ticket's state from GitHub. You never set it directly.

| State   | When                                                     |
|---------|----------------------------------------------------------|
| done    | the issue is closed                                      |
| blocked | an issue it is blocked by is still open                  |
| claimed | it is open, not blocked, and has an assignee             |
| next up | it is open, not blocked, and nobody is assigned          |

To claim a ticket, assign it to yourself. To finish it, post the answer as a
comment and close the issue. Add a one-line pointer to that comment under the map's
`## Decisions so far`.

## With `gh`

```sh
# Labels, once per repository
gh label create wayfinder:map
for type in research prototype grilling task; do gh label create "wayfinder:$type"; done

# The map, from a file holding the body above
gh issue create --title "Offline-first sync" --label wayfinder:map --body-file map.md

# A ticket, attached to map #10 as a sub-issue
gh issue create --title "Pick a conflict strategy" --label wayfinder:grilling --body-file ticket.md
id=$(gh api repos/{owner}/{repo}/issues/11 --jq .id)
gh api -X POST repos/{owner}/{repo}/issues/10/sub_issues -F sub_issue_id="$id"

# Ticket #12 waits on #11
blocker=$(gh api repos/{owner}/{repo}/issues/11 --jq .id)
gh api -X POST repos/{owner}/{repo}/issues/12/dependencies/blocked_by -F issue_id="$blocker"
```
