## Destination

Home and every view it owns (landing, repository, Prototypes) plus /new-map look polished, share the map page's visual language, and have a clear flow: finding the right repo and map, starting a map, and knowing what happened after a hand-off to T3 Code. Every design direction is chosen by the user from clickable prototype variants laid out on Wayfinder's own design canvas.

## Notes

- Domain: this repo, wayfinder-map. Home, repository, Prototypes and /new-map all render from src/ui/home.ts and share src/ui/styles.css with the map page.
- /new-map was redesigned in #31 (singular ticket and map hand-offs) and #32 added choosing the local clone. This map builds on that rather than discarding it.
- The user's pain: the pages look unpolished, the flow is confusing (overall navigation, Home: which repo/map, starting a map, and what happens after hand-off), and Home and new-map feel inconsistent with the map page.
- Design skills: design:design-critique and design:design-system for research, /prototype for clickable variants, design:design-handoff for the chosen direction, design:accessibility-review for the final pass.
- T3 Code already exposes /api/orchestration/snapshot and a websocket, which may be enough to track a hand-off.
- New functionality needs colocated Vitest coverage. Verify with typecheck, lint and tests.

## Decisions so far

- [#54 implementation and verification](https://github.com/RAbdelrhman/wayfinder-map/issues/54#issuecomment-5797360827): goal-first maps-only `/new-map` with repository selection, inline clone resolution, the Simple / Mid / Hard tier, and #68 hand-off status/recovery. Commit `7fa709d`; typecheck, lint, and 289 tests pass. Rendered light/dark comparison, native folder picker, real clone, and live T3 Code hand-off remain Not Verified. Local #55 / #68 / #69 prerequisites are integrated on the unpushed #54 branch.

- [#69 implementation and verification](https://github.com/RAbdelrhman/wayfinder-map/issues/69#issuecomment-5795776227): `Clone it for me` opens a fresh destination picker, shows clone progress and inline empty-folder, GitHub access, and network errors, and keeps prompt copy available without a clone. Local commit `b5d1902`; typecheck, lint, and all 269 tests pass. The native Electron picker and real GitHub cloning remain Not Verified.

- [#68 implementation and verification](https://github.com/RAbdelrhman/wayfinder-map/issues/68#issuecomment-5795683019): draft route is keyed by #55's saved hand-off; Start opens it, Home lists it while planning, and it switches to the matching map issue route. See the closeout comment for test results and live checks that remain Not Verified.

- [#74 implementation and verification](https://github.com/RAbdelrhman/wayfinder-map/issues/74#issuecomment-5787500158): improved the Wayfinder-owned canvas with option-specific feedback, named remix rounds and lineage, and a design-system/accessibility review handoff. Typecheck, lint, 247 tests, and 12 canvas checker tests pass; live sandbox visual, keyboard, and screen-reader review remains Not Verified.

- [#51 implementation and verification](https://github.com/RAbdelrhman/wayfinder-map/issues/51#issuecomment-5786605767): the shared navigation shell is committed locally as 3eda256 and dd72b3d on wayfinder/51-build-the-new-navigation-shell. Typecheck, lint, and 246 non-packaging tests pass. The package smoke test and live visual/keyboard/screen-reader verification remain Not Verified as recorded in the closeout comment.
- [#46 navigation handoff](https://github.com/RAbdelrhman/wayfinder-map/issues/46#issuecomment-5785155680) is complete: ship direction D, combining C's sidebar tree with B's repository/map switchers and Map | Table | Prototypes tabs. At widths below 720px, Home, repository, and /new-map auto-fold to the 56px rail; the map topbar keeps its switchers and tabs in a horizontal strip, hides sync, and uses compact Jump to and Start controls. The full developer handoff is attached to #46.

- In scope: the Home landing page, the repository page, the Prototypes page, and /new-map, plus shared navigation (rail, crumbs, topbar).
- The map page is the visual anchor. Its tokens, type and components are extracted and applied to these pages. The map page itself does not change.
- Server and T3 Code integration work is allowed, including real hand-off tracking if the chosen design calls for it.
- Each prototype builds 2-3 divergent variants on its prototype/<n>-<slug> branch, with fake data where needed. Prototypes stay off main (#26).
- Variants are presented on Wayfinder's own prototype canvas: a dark board with one live, scaled frame per variant (iframe), not a screenshot, a sticky note per variant explaining the idea and trade-offs, a banner stating the choice being made, and a play button that opens the variant full size and clickable. The canvas lives on prototype/39-what-should-the-prototype-canvas-look-like-modelled-on-claude-de, under prototypes/canvas/. Every prototype branch starts from it and edits prototypes/canvas/config.js.
- Each prototype gets its own grilling ticket, so the implementation tracks do not wait on each other.
- Design exploration and visual variants stay on Wayfinder's own prototype canvas; Claude Design is not part of this map's workflow.
- [#58 disposition](https://github.com/RAbdelrhman/wayfinder-map/issues/58#issuecomment-5785320064): closed as not planned after correcting the direction.
- Research [#37](https://github.com/RAbdelrhman/wayfinder-map/issues/37) is complete: [the map-page design-system inventory](https://github.com/RAbdelrhman/wayfinder-map/blob/a6de434/docs/design/map-page-design-system.md) is the T1 source for canonical tokens/components and the Home/new-map drift list.
- Research [#36](https://github.com/RAbdelrhman/wayfinder-map/issues/36) is complete: [the Home-owned views critique](https://github.com/RAbdelrhman/wayfinder-map/blob/6865a3e/docs/design/home-views-critique.md) ranks visual, flow and consistency gaps against the map page; signed-out and post-submit T3 states remain Not Verified.

- Research [#38 closeout](https://github.com/RAbdelrhman/wayfinder-map/issues/38#issuecomment-5766023556) is complete: T3 hand-off tracking is feasible; the local note is docs/design/t3-hand-off-tracking.md at commit d9c682e (this branch has not been pushed). T6 should start with durable records plus shell polling and add sequence-aware WebSocket push with periodic reconciliation.
- [#41 decision](https://github.com/RAbdelrhman/wayfinder-map/issues/41) is complete: track the live T3 thread and its reported branch/PR links; use WebSocket push with periodic snapshot reconciliation; retain the minimum local hand-off record for 30 days after terminal status, showing it as stale when T3 Code is offline. Keep the implementation split: [#55](https://github.com/RAbdelrhman/wayfinder-map/issues/55) provides durable tracking and [#56](https://github.com/RAbdelrhman/wayfinder-map/issues/56) presents it.
- Grilling [#40](https://github.com/RAbdelrhman/wayfinder-map/issues/40#issuecomment-5766522331) is decided: Home's job is getting you back into work in one click. It has a Continue card, an In flight strip (ordered by what's waiting on you), and repo search merged with recent repos on the left, plus a progress panel on the right (completed Wayfinder tickets per day, history, daily goal; drawn as fog being cleared). The account panel moves behind a new rail settings button, and Prototypes becomes a Maps | Prototypes tab of the repository view.
- Grilling [#44](https://github.com/RAbdelrhman/wayfinder-map/issues/44#issuecomment-5777597685) is decided: /new-map is goal first (C), maps only. The repo chip is in the composer, preselected only from a repository page. Clone fix-it opens under the composer, and Clone it for me asks where each time. Simple/Mid/Hard tier chip. Start lands on the new map at a temporary draft route with the hand-off card on top. Input for #48; follow-ups #68 (draft route) and #69 (Clone it for me), both blocking #54.
- [#50](https://github.com/RAbdelrhman/wayfinder-map/issues/50) - Shared design tokens and components consolidated in commit 45edbb0; tests pass, while typecheck/lint and light/dark screenshot comparison remain Not Verified as recorded on #50.
- Prototype [#42](https://github.com/RAbdelrhman/wayfinder-map/issues/42#issuecomment-5776791196) is decided: navigation is C's sidebar tree on every page (Start a new map and Jump to at the top, then Home, then repositories and their maps; you are the highlighted row), with B's repository/map switcher in the topbar and a map's Map | Table | Prototypes tabs. Prototypes belong to a map, so there is no repository Prototypes page (supersedes that part of #40). The sidebar folds to a compact rail of the same tree, folded by default on the map page. "The map page itself does not change" now covers its canvas, inspector and ticket panel; its navigation chrome follows #42. Prototype: prototype/42-how-should-navigation-show-where-you-are-and-where-you-can-go.

- [#55 closeout](https://github.com/RAbdelrhman/wayfinder-map/issues/55#issuecomment-5784959868): durable server-side hand-off records and GET /api/hand-offs are implemented in commit 34d57f9; #56 owns the user-facing status and branch/PR links.

- Grilling [#48 decision and handoff spec](https://github.com/RAbdelrhman/wayfinder-map/issues/48#issuecomment-5785261533) is decided: flow C, goal first and maps only; inline clone resolution; one spinner until step-level events exist; no local worktree path on the finished card.
- Prototype [#45](https://github.com/RAbdelrhman/wayfinder-map/issues/45#issuecomment-5785711186) is done: after a hand-off you stay on the map. A's live card in the ticket panel and a pill on the node, plus B's list behind a topbar button ("6 in T3 Code - 2 need you") covering all maps and repos, each row naming its repo and map. The button exists only while something is in flight, and finished hand-offs leave the list once acknowledged. C (a page per hand-off) is not chosen. #49 confirms and writes the spec; #56 needs an acknowledged flag. Prototype: prototype/45-what-does-the-user-see-after-handing-off-to-t3-code.
- [#49 after-hand-off decision and handoff spec](https://github.com/RAbdelrhman/wayfinder-map/issues/49#issuecomment-5787420380) is complete: the user confirmed P4's A + B. Ticket hand-offs keep a live card in the ticket panel and matching map-node pill; map hand-offs stay on the #44 draft-map landing. A topbar dropdown lists unacknowledged hand-offs across repositories and maps with repo/map context and source links. It is absent when empty; PR-ready and failed items clear after acknowledgement while cards and Home history remain for 30 days. Offline records retain a stale last status. This unblocks #56.

- [#43 decision and closeout](https://github.com/RAbdelrhman/wayfinder-map/issues/43#issuecomment-5787755850) is complete: B's Home/repository UI, A's last-opened repository list with B's progress bars, the user-selectable Trail / Hexes / Bar panel (Trail default, 3 / 5 / 8 goal, streak), and B's map Prototypes decision board with A's empty state. The prototype is on `prototype/43-what-should-the-home-repository-and-prototypes-views-look-like`; the canvas checker passed.
- [#47 starting point](https://github.com/RAbdelrhman/wayfinder-map/issues/47#issuecomment-5787761447): these picks were made on #43; #47 can carry them into the handoff spec. #42 places Prototypes on the map tab.

- [#47 decision and handoff](https://github.com/RAbdelrhman/wayfinder-map/issues/47#issuecomment-5795455398): the user confirmed the #43 mix and both empty-state CTA placements. Home with no repositories has no Start a new map button inside Continue; start maps from the sidebar. A repository with no maps keeps its contextual Start action. The full handoff is attached to #47. #80 remains a prerequisite for #52, and #81 remains a prerequisite for #53.
- [#80 progress panel](https://github.com/RAbdelrhman/wayfinder-map/issues/80) blocks [#52](https://github.com/RAbdelrhman/wayfinder-map/issues/52); [#81 prototype screenshots](https://github.com/RAbdelrhman/wayfinder-map/issues/81) blocks [#53](https://github.com/RAbdelrhman/wayfinder-map/issues/53).

- [#81 implementation and verification](https://github.com/RAbdelrhman/wayfinder-map/issues/81#issuecomment-5795797583): regenerated all 17 Prototypes decision-board screenshots at 1280 × 720 from their source branches, added a refresh command and a sketch fallback, and passed the canvas and project checks. Local commit `985ebe9`.
- [#80 closeout](https://github.com/RAbdelrhman/wayfinder-map/issues/80#issuecomment-5795325164): the Home progress panel is in PR #85 (stacked on #84). Trail / Hexes / Bar with Trail as the default, the 3 / 5 / 8 goal and the streak line, stored per GitHub login in ~/.wayfinder-map/progress.json, counting completed assigned Wayfinder tickets per local day. Typecheck and 287 tests pass; light mode and a live in-app check are Not Verified. This unblocks #52.

## Fog


- Smart goal suggestions on /new-map (like ChatGPT's), replacing the static "Try a goal" examples (#44).
- How much T3 Code can report after a hand-off (thread status, branch, PR) and how deep tracking should go.
- Whether T6 (hand-off tracking server) is one ticket or several. Split it at G2 if R3 shows it is large.

## Out of scope

- Redesigning the map canvas or ticket panel.
- A new visual language that diverges from the map page.
- Editing GitHub issues from Wayfinder.
- Figma or other external design connectors.

