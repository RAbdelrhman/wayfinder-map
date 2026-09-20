# wayfinder-map

An interactive map of a repo's wayfinder maps, served on localhost. Click a ticket
and T3 Code starts a thread on it, in its own worktree, already working.

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
npx wayfinder-map            # opens Home; inside a checkout, opens that repository
npx wayfinder-map --repo owner/name  # opens that repository's map list
```

Needs [`gh`](https://cli.github.com) on your PATH and logged in. That is the only
credential involved: no token to paste, no GitHub App, no config.

Home shows the active `gh` account and discovers repositories that contain maps.
You can always enter `owner/name` when discovery misses one. Repository and map
pages have bookmarkable URLs, and snapshots are isolated per repository in memory.

From a clone:

```bash
bun install
bun run build
node dist/cli.js --repo owner/name
```

To run the desktop shell from a built checkout:

```bash
bun run desktop
```

Closing its window keeps Wayfinder in the system tray. The tray can reopen the
current page, go Home, start a new map, or quit. Quit stops the loopback server
and revokes the in-memory T3 Code session.

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

Run the tool inside a clone of the repo, click a ticket, then **Open in T3 Code**.
T3 Code gets a new thread on its own worktree and branch (`wayfinder/<n>-<title>`,
under `~/.t3/worktrees`), and the agent is already reading the ticket. Done and
blocked tickets have the button disabled, with the reason.

Under the hood it talks to the T3 Code server on this machine the way T3 Code's own
composer does. It gets a session token from T3 Code's own CLI
(`t3 auth session issue`), keeps it in memory, and revokes it when the tool exits.
Nothing leaves the machine.

When that is not possible it steps down one rung at a time, and the page says why
in one line:

1. **Running thread.** Needs T3 Code running and the tool started in a clone of the
   repo.
2. **New empty thread, prompt on the clipboard.** Uses the desktop app's control
   socket, the same one `t3 app <path>` uses. Paste and hit enter.
3. **Prompt on the clipboard.** Works with no T3 Code at all.

**Copy prompt** always just copies. On Linux the clipboard goes through `wl-copy`,
`xclip` or `xsel`, whichever is installed.

### Picking the model

**Models** (the sliders icon in the left rail) sets a default model and reasoning level for three task
tiers: Simple, Mid and Hard. The list is whatever T3 Code can run right now, across
every provider you have enabled (Codex, Claude, Grok, OpenCode, Antigravity, …),
read live from T3 Code.

In the ticket panel, **Run as** switches the ticket between tiers, and the model
and reasoning below it can be changed for that one hand-off. Each ticket remembers
its tier; new tickets start on Mid. A tier with no default, or a model T3 Code no
longer offers, falls back to T3 Code's own default. The defaults live in the
browser's local storage.

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
`{{baseBranch}}`, `{{worktreeSteps}}`, `{{typeSteps}}`, `{{blockedLine}}`.
`{{worktreeSteps}}` asks the agent to make its worktree, or tells it that T3 Code
already did. `{{typeSteps}}` tells the agent that grilling and prototype tickets are
human-in-the-loop: grill the user one question at a time and decide nothing without
them. It is empty for other types. An unknown one is left in the text rather than silently blanked,
so a typo is visible.

## Options

```
--repo <owner/name>   Repository to open. Defaults to the one gh resolves in --cwd.
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
`Origin`, because it shells out to `gh`, writes your clipboard and starts T3 Code
threads.

```
src/github.ts    gh calls to maps, tickets, blockers
src/mapBody.ts   the map body's sections, and the fallback parsers
src/layout.ts    dependency depth to x/y
src/prompt.ts    ticket to prompt
src/t3.ts        the hand-off ladder
src/t3Api.ts     T3 Code server: session token, snapshot, thread commands, RPC
src/models.ts    T3 Code models to the picker catalog
src/ui/models.ts the model picker and tier defaults
src/t3App.ts     the desktop app's control socket
src/clipboard.ts clipboard per platform
src/server.ts    routes
src/home.ts      gh account state and scoped repository discovery
src/ui/          Home, repository list and map pages
```

```bash
bun run test        # vitest
bun run typecheck   # tsc --noEmit
```

## License

MIT.
