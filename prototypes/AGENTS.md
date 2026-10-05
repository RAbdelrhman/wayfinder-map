# Independent design tasks

Each unrelated design task gets its own canvas in `prototypes/<task-id>/`.
Use a stable descriptive ID for non-ticket work, or `<ticket>-<title-slug>` for
ticket work. Do not append an unrelated task to `prototypes/canvas/config.js` or
another task's board. The legacy canvas and its pages remain available.

Create a fresh board from the repo root with:

```sh
bun run canvas:create <task-id>
# For a ticket, also preserve its association:
bun run canvas:create <ticket>-<title-slug> --ticket <ticket>
```

The command copies the existing canvas engine, creates fresh content, and refuses
to overwrite any existing directory. If the ID is already taken, inspect the
canvas. Continue there only when it is the same task; otherwise use a new ID.
For iterations of the same task, preserve baseline pages, feedback, and lineage.

Use the design-canvas skill with an explicit directory argument. Read the new
canvas's README, author real options, and run `node <dir>/tools/check.mjs`.
Keep sandbox rules and relative paths. Inspect the preview and provide the exact
canvas URL and visible preview before asking the user to choose. Ask one product
decision at a time. Do not infer an answer from an unsubmitted form.

Keep existing `prototype/<ticket>-<slug>` branches, ticket metadata, map
associations, and worktree boundaries. Non-ticket canvases need no new issues or
maps. Canvas creation never launches a T3 job or pushes a branch.
