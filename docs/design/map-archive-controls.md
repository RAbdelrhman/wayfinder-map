# Approved map list and archive controls

Decision for [#288](https://github.com/RAbdelrhman/wayfinder-map/issues/288), on map [#236](https://github.com/RAbdelrhman/wayfinder-map/issues/236). Ramon approved option **G, Active maps use the same layout**, with the message **"This looks amazing lets do it"** in the ticket's T3 thread.

The chosen canvas is [round 5, G](../../prototypes/288-prototype-the-archive-controls-and-the-archived-maps-view/index.html#round-5/G), on branch `prototype/288-prototype-the-archive-controls-and-the-archived-maps-view`. The visual revision reviewed was `1a6d85c`. Its note records `disposition: 'keep'` and the exact approval. Earlier rounds remain available as design history, not implementation alternatives.

## Layout and actions

- The repository's active maps list and Archived maps view share a left selection list and right preview. At narrow widths the preview stacks below the list.
- Each active map is one selectable block containing its name, destination and progress. Clicking the text or padding selects that map without opening it. Running hand-off and needs-you counts use existing data.
- Each archived map is one selectable block containing its name, archive reason and explanation. The reason and explanation belong to that map, including when several maps share a reason. This is the clickable area Ramon requested in his [review of E](https://github.com/RAbdelrhman/wayfinder-map/issues/288#issuecomment-6202620477).
- The right preview's graph, title, destination and ticket counts form one large **Open map** target. It has one semantic link and one keyboard stop, with a visible Open map affordance. It replaces a separate Open button in the preview.
- Active previews show a separate **Archive** action. Archived previews show a separate **Restore** action. Neither is nested inside Open.
- Archived maps is accessible through the entry shown in G. The canvas includes the sidebar entry and the repository list's archive entry; implementation must follow that approved placement, not add another archive mechanism.
- Selecting, opening, archiving and restoring are distinct actions. Opening an archived map leaves it archived, with visible archive status and a separate Restore action on the opened map.
- Filtering keeps the preview on a visible map or clears it when nothing matches. Removing the selected active map by Archive selects the next available map. Active and archived selections do not interfere with each other.

## Approved wording and archive reasons

The complete visible wording is the G fixture in [g.js](../../prototypes/288-prototype-the-archive-controls-and-the-archived-maps-view/variants/g.js), using the shared reason definitions in [r2-shared.js](../../prototypes/288-prototype-the-archive-controls-and-the-archived-maps-view/variants/r2-shared.js). Implement that wording and layout rather than borrowing unchosen earlier controls.

The reasons are **Archived by you**, **Closed**, **Finished**, and **Idle 30 days**. Each has its explanation and return behavior. Reasons use an icon plus text; ticket state retains the app's color system.

Archive replaces Settle, Restore replaces Unsettle, and the Archived maps view replaces the collapsed Settled section. Existing per-account persistence is reused. GitHub issues and tickets are unchanged. The lifecycle remains [map-archive.md](map-archive.md), including manual precedence, background-work pauses, running hand-off tracking, and the persistent active override after Restore.

Restore says the map stays active until the user archives it again. The active preview preserves private-map visibility guidance and existing progress/next-ticket information. Error and loading fixtures are included in G's Preview state control.

## Implementation boundary

[#242](https://github.com/RAbdelrhman/wayfinder-map/issues/242) implements these controls and the complete manual journey. It must replace existing controls rather than add parallel ones. [#243](https://github.com/RAbdelrhman/wayfinder-map/issues/243) owns automatic finished-map archiving; the prototype's Finished fixture does not implement that rule. The top-bar Choose a map dropdown is outside this decision. No production UI was changed in #288.

## Evidence and limits

The [canvas review record](../../prototypes/288-prototype-the-archive-controls-and-the-archived-maps-view/REVIEW.md) and visible Design review notes preserve each round's checks and feedback. Focused tests cover the complete fixture journey and selection/filtering failure cases. Browser checks cover both themes, desktop and 390px layouts, relevant states, real keyboard selection, visible focus, and sampled text contrast.

**Not checked:** screen reader output, exhaustive keyboard traversal, non-text contrast, installed desktop implementation and live archive persistence. Prototype browser evidence does not establish production or installed-app behavior; #242 and #244 must verify the real flow.
