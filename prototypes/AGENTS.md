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
# Phone prototypes use the shared #226 presentation from the start:
bun run canvas:create <ticket>-<title-slug> --ticket <ticket> --mobile
```

The command loads the shared canvas engine, creates fresh content, and refuses
to overwrite any existing directory. If the ID is already taken, inspect the
canvas. Continue there only when it is the same task; otherwise use a new ID.
For iterations of the same task, preserve baseline pages, feedback, and lineage.

For multi-screen flow comparisons, start with an Overview comparing all options,
then give each option a separate named page containing its individual screens
and states in flow order. Keep phone-shaped Present views where relevant.
Follow [Comparing flow options](canvas/README.md#comparing-flow-options), based on
#224. This is guidance for suitable flows, not a requirement for single screens,
component sheets, palettes, or other non-flow canvases. It records no product pick.

Use the design-canvas skill with an explicit directory argument. Read the new
canvas's README, author real options, and run `node <dir>/tools/check.mjs`.
Keep sandbox rules and relative paths. Inspect the preview and provide the exact
canvas URL and visible preview before asking the user to choose. Ask one product
decision at a time. Do not infer an answer from an unsubmitted form.

## Mobile screens and layout testing

For every new phone prototype, use `canvas:create --mobile` and keep its shared
`../../canvas/device.js` script. It applies the phone presentation Ramon chose
from #226, without adding viewer controls. Read the Mobile presentation section
in `prototypes/canvas/README.md` before authoring or testing a phone screen.
Keep `width: 390, height: 844, boardWidth: 240` on phone items. The blank generated
screen is a starting file, not an option ready for review.

Existing canvases keep their authored presentation. Never stack this helper over
an existing frame or infer a device from a small width or a mobile ticket title.
The explicit `phone` preset applies only to that phone reference. Desktop,
tablet, watch and other device shapes need their own declared dimensions and
chosen presentation; do not force them into the phone preset.

Exercise both themes, board thumbnails, Present mode, Wayfinder's viewer,
direct page, resize, keyboard focus and Escape. Check a narrow responsive
viewport separately from the framed desktop presentation, including short and
landscape windows. `bun run test:device-presentation` checks the shared layout
in installed Chrome. Report browser viewport checks as layout evidence. They
do not prove native/device, OS keyboard, safe areas, touch or screen reader
behavior. Use the actual device/emulator for claims about those layers.

Before sharing or pushing a prototype branch, capture its board poster after the
final content change, from this checkout's root:

```sh
bun run canvas:poster prototypes/<task-id>
bun run canvas:poster --check prototypes/<task-id>
```

This uses installed Chrome to render the actual board at 1280 × 800 and writes
`assets/poster.webp` beside its `index.html`. Commit the poster with that canvas
on its `prototype/` branch. Recapture whenever the board changes. Wayfinder
requests this one SHA-addressed picture with the card and holds it over the
loading skeleton while the live canvas boots. A missing or failed poster keeps
the skeleton. The command does not push or edit another branch. Existing
canvases without a poster remain valid; do not invent a poster or reuse one from
another board. If Chrome or a board resource is unavailable, report the capture
as Not Verified and keep the skeleton fallback.

Keep existing `prototype/<ticket>-<slug>` branches, ticket metadata, map
associations, and worktree boundaries. Non-ticket canvases need no new issues or
maps. Canvas creation never launches a T3 job or pushes a branch.
