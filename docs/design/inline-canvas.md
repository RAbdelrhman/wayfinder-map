# Canvas feedback inside T3 Code

Ramon requested the full canvas inside the conversation, with saved Wayfinder
feedback. A floating browser and a disconnected HTML copy do not satisfy that
workflow. He also asked to remove the notes overlay when a frame opens, while
keeping the authored notes on the board.

## Existing UI and saved feedback

The Wayfinder MCP App reuses the existing canvas toolbar and `CanvasFeedback`
controls. This includes notes, pins, element selection, colours, Review, Post,
the posted-comment link, and the separate Send to T3 Code action. Narrow views
use the existing Canvas/Feedback tabs. There is no floating-window mode or
local-browser step. The inline host does not expose the desktop settings dialog.

The shared canvas stylesheet and the existing sandbox bridge suppress the
legacy Present-mode notes overlay and its toggle. Board notes are preserved.
The Wayfinder feedback panel remains available on demand.

`open_canvas` accepts the same HTTPS or native prototype destination agents
already share. Newest resolves once to an immutable commit. A supplied `rev`
keeps that commit. Every asset in an embed comes from that commit. The bundle
currently supports repository-local HTML, classic JavaScript, CSS and image/font
assets; it refuses foreign network dependencies and oversized bundles.

The tool returns an MCP App resource. Its trusted controls surround an opaque
prototype iframe. Prototype scripts cannot use the MCP client. Canvas messages
are accepted only from that iframe, parsed by the existing bridge validator, and
cannot request arbitrary tools or posts.

The feedback UI calls `post_canvas_feedback`. Its address binds the GitHub object
ID, board, revision, repository, native parent map and prototype ticket. This
address is restorable after a process restart; it grants no access. Resource
reads and saves re-resolve it through the signed-in Wayfinder server. A moved
ticket, changed version or unknown page/frame blocks posting until reopened.
The service rebuilds the canonical `Canvas notes from Wayfinder` comment from
validated marks, then uses the existing `canvas-notes` route. It reports success
only after that route returns a comment URL on the bound ticket.

Completed requests retain their result within the server process, so a repeated
request ID returns the same URL. Reusing an active/completed request ID with a
different body is rejected. Failed requests do not retry themselves. The tool
does not advertise global idempotency across process restarts. Drafts stay in
the existing viewer session until posted; the GitHub comment is the persisted
record.

Posting and notifying T3 are mutating tools, declared `readOnlyHint: false`.
Stock T3 may require its own confirmation in addition to Wayfinder's Review.
Nothing automatically sends a message to a T3 thread. Only the separate Send
button invokes the existing ticket-thread route.

## Setup and agent use

Run the MCP command from the built CLI, with the running Wayfinder origin:

```powershell
bun run build
codex mcp add wayfinder-canvas -- node C:\path\to\wayfinder-map\dist\cli.js mcp --origin http://127.0.0.1:4479
```

The origin must be a local HTTP origin; use the actual address of the running
Wayfinder instance. The MCP process uses the same machine's `gh` sign-in to read
the requested immutable repository files. It never sends GitHub credentials to
the embedded document. T3's connected mobile client uses the same MCP tools on
the desktop environment; phone code never fetches the desktop's loopback URL.
Configure the same stdio server in each provider that needs to publish embedded
canvases. A server registered in Codex's configuration is not automatically a
Claude configuration entry; verify discovery in the actual provider before
claiming the integration is active there.

After adding the server, the provider may need its MCP configuration reloaded.
Use the host's supported reconnection mechanism. A stopped provider session can
prevent tool calls even while a saved app document remains visible.

When a canvas is ready, agents call `open_canvas` on the exact destination and
include the normal HTTPS destination, GitHub fallback and current T3 thread
reference. They must not substitute `html_render` for this MCP App when saved
feedback is required. `html_render` remains useful for self-contained previews,
but its copy-feedback composer does not post to Wayfinder.

## Verification boundaries

Unit checks cover asset collection, query preservation, untrusted configuration,
frame isolation, feedback posting, retry identity, failed saves, wrong versions,
unknown frames, changed map ownership and restart restoration. The built MCP
command must also pass tool/resource interoperability and authenticated
save/readback checks before an installed workflow is claimed.

Physical phone interaction, T3's actual approval dialog and the installed
provider's rendered app require native acceptance. An isolated render or a
backend comment is evidence for that layer only.
