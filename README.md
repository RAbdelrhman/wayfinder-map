# wayfinder-map

An interactive map of a repo's wayfinder maps, served on localhost. Click a ticket
and the prompt for it lands on your clipboard with T3 Code up front, ready to paste
into a new thread.

Works against any repo that keeps its wayfinder maps in GitHub Issues. Nothing about
it is specific to one project.

## What a wayfinder map is

A **map** is a GitHub issue labelled `wayfinder:map`. It holds the destination, the
notes, the decisions so far, and the fog. Its **tickets** are sub-issues, each
labelled `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling` or
`wayfinder:task`. Tickets wait on each other through GitHub's native issue
dependencies.

This tool reads that structure and draws it.

## Run it

```bash
npx wayfinder-map            # inside a git checkout, reads the repo gh resolves
npx wayfinder-map --repo owner/name
```

Needs [`gh`](https://cli.github.com) on your PATH and logged in. That is the only
credential involved: no token to paste, no GitHub App, no config.

From a clone:

```bash
bun install
bun run build
node dist/cli.js --repo owner/name
```

## What you see

Tickets are laid out left to right by dependency depth, so a ticket sits one column
right of whatever blocks it. Arrows are blocker edges: an amber arrow is still
holding the ticket up, a gray one is satisfied.

Ticket state is the only thing carrying color, and it always comes with an icon and
a word:

| State | Means |
|---|---|
| next | Open, unblocked, nobody assigned. Pick this up. |
| claimed | Open and unblocked, someone is on it. |
| blocked | Open, waiting on a ticket that is still open. |
| done | The issue is closed. |

Ticket type rides a monogram (R, P, G, T) rather than a fifth color, because four
categorical hues cannot clear the colorblind separation floor on a scatter of nodes.

The left panel carries the map's own prose: destination, fog, notes, decisions,
out of scope. A table view sits behind the Map/Table toggle for anyone who would
rather read rows than a graph, and for screen readers.

## Starting a thread

Click a ticket, then **Start T3 Code thread**. The server builds the prompt, copies
it to your clipboard, and brings T3 Code forward. Paste and hit enter.

It stops one step short of sending because T3 Code's thread-creation API is internal
and DPoP-authenticated against a nightly build. Driving it directly would mint
credentials this tool has no business holding, and would break the next time T3
ships. A clipboard hand-off is one keystroke worse and does not rot.

If T3 Code is not installed, **Copy prompt** still works and the tool says so on
startup.

## Prompt template

The default prompt names the repo, the map, the ticket, the map's destination and
the ticket body. It directs the agent into a ticket-specific git worktree before
claiming the ticket, then asks the agent to close it the way the wayfinder flow
does. Replace it with your own:

```bash
npx wayfinder-map --prompt ./my-prompt.txt
```

Placeholders: `{{repo}}`, `{{mapNumber}}`, `{{mapTitle}}`, `{{mapUrl}}`,
`{{destination}}`, `{{notes}}`, `{{decisions}}`, `{{fog}}`, `{{ticketNumber}}`,
`{{ticketTitle}}`, `{{ticketType}}`, `{{ticketState}}`, `{{ticketUrl}}`,
`{{ticketBody}}`, `{{ticketSlug}}`, `{{worktreeName}}`, `{{branchName}}`,
`{{blockedLine}}`. An unknown one is left in the text rather than silently blanked,
so a typo is visible.

## Options

```
--repo <owner/name>   Repo to read. Defaults to the one gh resolves in --cwd.
--cwd <path>          Directory used to resolve the repo.
--port <number>       Port to serve on. Default 4478.
--map-label <label>   Label that marks a map issue. Default wayfinder:map.
--type-prefix <text>  Prefix on a ticket's type label. Default wayfinder:.
--prompt <file>       Prompt template.
--no-open             Do not open a browser on start.
```

A `wayfinder-map.config.json` in the working directory sets the same keys. Flags win
over it.

### Different labels

Nothing assumes the word "wayfinder". Point it at whatever your repo uses:

```bash
npx wayfinder-map --map-label epic --type-prefix 'kind/'
```

Types still have to be one of research, prototype, grilling or task to get a
monogram. Anything else shows as untyped and still works.

## Falling back

Repos without sub-issues or issue dependencies still render. The tool reads children
from a task list or issue links in the map body, and blockers from a
`Blocked by: #4, #7` line, then says in the header bar that it did so.

## How it is put together

Zero runtime dependencies. A Node HTTP server reads GitHub through `gh`, and the
page is plain TypeScript bundled by esbuild.

The server binds to loopback only and refuses any request carrying a foreign
`Origin`, because it shells out to `gh` and writes your clipboard.

```
src/github.ts    gh calls to maps, tickets, blockers
src/mapBody.ts   the map body's sections, and the fallback parsers
src/layout.ts    dependency depth to x/y
src/prompt.ts    ticket to prompt
src/t3.ts        clipboard and launching T3 Code
src/server.ts    routes
src/ui/          the page
```

```bash
bun run test        # vitest
bun run typecheck   # tsc --noEmit
```

## License

MIT.
