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

Wayfinder has two entry points over the same local server: the desktop app, which
is how most people should launch it, and the `wayfinder-map` command for terminal
use and automation. Both need [`gh`](https://cli.github.com) on your PATH and logged
in. That is the only credential involved: no token to paste, no GitHub App, no config.

Home shows the active `gh` account and discovers repositories that contain maps.
You can always enter `owner/name` when discovery misses one. Repository and map
pages have bookmarkable URLs, and snapshots are isolated per repository in memory.

### Desktop app

Install Wayfinder from the Windows installer on the
[releases page](https://github.com/RAbdelrhman/wayfinder-map/releases) and open it
from the Start menu or the desktop shortcut. No terminal needed: it opens on Home.

Closing its window keeps Wayfinder in the system tray. The tray can reopen the
current page, go Home, start a new map, or quit. Quit stops the loopback server
and revokes the in-memory T3 Code session.

The first public release targets Windows 10 and Windows 11. Stable installers must
be signed and support x64 and ARM64. `gh` remains an explicit prerequisite; if it
is missing or signed out, Home stays available and shows the diagnostic with a link
to install or sign in to GitHub CLI. Architecture-specific installed-flow gates are documented in
[`docs/release-windows.md`](docs/release-windows.md).

### Terminal

The command needs Node 22 or newer. Each release attaches it as an npm package,
`wayfinder-map-<version>.tgz`; install that straight from the release (it is not on
the npm registry, so `npx wayfinder-map` does not work):

```bash
npm install --global https://github.com/RAbdelrhman/wayfinder-map/releases/download/v0.1.0/wayfinder-map-0.1.0.tgz
```

Swap in the version you want. The command reports the same version as the desktop
app it was released with.

```bash
wayfinder-map                        # opens Home; inside a checkout, opens that repository
wayfinder-map --repo owner/name      # opens that repository's map list
wayfinder-map --no-open --port 0     # serves on a free port without opening a browser
wayfinder-map --version
```

It prints the address it serves on and runs until Ctrl+C. It never loads the desktop
shell.

### From a clone

```bash
bun install
bun run build
node dist/cli.js --repo owner/name   # the terminal command
bun run desktop                      # the desktop shell
```

Unsigned owner-test installers can be built for Windows x64 or ARM64. They are named
`Test-Setup.exe` and are not public stable releases:

```powershell
bun run package:win -- x64
bun run package:win -- arm64
```

On Windows, the packaged smoke gate installs and launches the artifact, verifies Home,
and confirms that quitting leaves no loopback server behind:

```powershell
bun run smoke:win -- x64
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

## Prototypes

Prototype tickets keep their prototype on a throwaway branch named
`prototype/<ticket>-<slug>`, e.g. `prototype/8-what-does-the-home-page-look-like`.
The hand-off prompt tells the agent to push there. If you work a prototype ticket by
hand, use the same name, because the name is the only way the tool finds it.

A prototype that asks a visual or UX question is built as a **design canvas**: a board
that lays the options out side by side (full pages, style directions, component sheets,
palettes, type, layered moodboards), each with a note giving its pros and cons. It can
have several pages, and any option opens full size. It lives in `prototypes/canvas/`:
the options are described in `config.js`, and its `README.md` is the full reference.
To add one, use the `design-canvas` skill:

```sh
node ~/.claude/skills/design-canvas/scaffold.mjs prototypes/canvas  # engine + starter; never overwrites your config.js, variants/ or assets/
node prototypes/canvas/tools/check.mjs                              # validates the config and the sandbox rules
node prototypes/canvas/tools/serve.mjs                              # previews it under the same CSP the tool serves it with
```

Any other prototype carries `prototype-snapshot.html` at its branch root: the prototype
as one HTML file with its styles and script inlined, no paths starting with `/`, and no
calls to a server. The hand-off prompt asks for one or the other. Either is what lets
you open a prototype months later, after the app it was built in has moved on.

**Prototypes** is a gallery. Each tile shows the prototype running, scaled down, with
its ticket and the one-line decision it led to underneath. Click a tile and the
prototype opens full size in a new tab, live and clickable. It lives in two places:
the beaker in a map's left rail shows that map's prototypes, and the repository page
links to every prototype across its maps. A prototype ticket's panel shows its tile
too.

The server reads the prototype off the branch through `gh` and serves it sandboxed, so
a prototype's scripts cannot reach the tool's API. A tile opens the design canvas when
the branch has one (an `index.html` with its `config.js` beside it), then the snapshot,
then any other standalone HTML page. With none of these, the tile says there is no preview.

## Starting a thread

Click a ticket, then **Open in T3 Code**. T3 Code gets a new thread on its own
worktree and branch (`wayfinder/<n>-<title>`, under `~/.t3/worktrees`), and the agent
is already reading the ticket. Done and blocked tickets have the button disabled,
with the reason.

A thread needs a checkout of the repo on disk, which Wayfinder finds rather than
assumes: the clone the CLI was launched in, then the clone you last picked for this
repository, then T3 Code's own projects. A candidate only counts once its remotes
resolve to the repository you are looking at. If none does, the ticket offers
**Choose local clone** (a folder picker, desktop app only) and the choice is
remembered in `~/.wayfinder-map/clones.json`, re-checked before every hand-off.

Under the hood it talks to the T3 Code server on this machine the way T3 Code's own
composer does. It gets a session token from T3 Code's own CLI
(`t3 auth session issue`), keeps it in memory, and revokes it when the tool exits.
Nothing leaves the machine.

When that is not possible it steps down one rung at a time, and the page says why
in one line:

1. **Running thread.** Needs T3 Code running and a verified clone of the repo.
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
wayfinder-map --prompt ./my-prompt.txt
```

Placeholders: `{{repo}}`, `{{mapNumber}}`, `{{mapTitle}}`, `{{mapUrl}}`,
`{{destination}}`, `{{notes}}`, `{{decisions}}`, `{{fog}}`, `{{ticketNumber}}`,
`{{ticketTitle}}`, `{{ticketType}}`, `{{ticketState}}`, `{{ticketUrl}}`,
`{{ticketBody}}`, `{{ticketSlug}}`, `{{worktreeName}}`, `{{branchName}}`, `{{prototypeBranch}}`,
`{{baseBranch}}`, `{{worktreeSteps}}`, `{{typeSteps}}`, `{{blockedLine}}`.
`{{worktreeSteps}}` asks the agent to make its worktree, or tells it that T3 Code
already did. `{{typeSteps}}` tells the agent that grilling and prototype tickets are
human-in-the-loop: grill the user one question at a time and decide nothing without
them, and tells prototype agents which branch to push to and to build a design canvas (or a snapshot). It is empty for other types. An unknown one is left in the text rather than silently blanked,
so a typo is visible.

## Terminal options

```
--repo <owner/name>   Repository to open. Uses the one in --cwd, or Home when none.
--cwd <path>          Directory used to resolve the repo. Defaults to the shell's.
--port <number>       Port to serve on. Default 4478; 0 picks a free one.
--map-label <label>   Label that marks a map issue. Default wayfinder:map.
--type-prefix <text>  Prefix on a ticket's type label. Default wayfinder:.
--prompt <file>       Prompt template.
--no-open             Do not open a browser on start.
-v, --version         Print the version.
-h, --help            This text.
```

A `wayfinder-map.config.json` in the working directory sets the same keys. Flags win
over it.

### Different labels

Nothing assumes the word "wayfinder". Point it at whatever your repo uses:

```bash
wayfinder-map --map-label epic --type-prefix 'kind/'
```

Types still have to be one of research, prototype, grilling or task to get a
monogram. Anything else shows as untyped and still works.

## Falling back

Repos without sub-issues or issue dependencies still render. The tool reads children
from a task list or issue links in the map body, and blockers from a
`Blocked by: #4, #7` line, then says in the header bar that it did so.

## How it is put together

The CLI package has zero runtime dependencies. A Node HTTP server reads GitHub through `gh`, and the
page is plain TypeScript bundled by esbuild.

The server binds to loopback only and refuses any request carrying a foreign
`Origin`, because it shells out to `gh`, writes your clipboard and starts T3 Code
threads.

```
src/github.ts    gh calls to maps, tickets, blockers
src/mapBody.ts   the map body's sections, and the fallback parsers
src/layout.ts    dependency depth to x/y
src/prompt.ts    ticket to prompt
src/prototypes.ts prototype branch names and file URLs
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
bun run test        # vitest, including a smoke test of the packed and installed CLI
bun run typecheck   # tsc --noEmit
```

## License

MIT.
