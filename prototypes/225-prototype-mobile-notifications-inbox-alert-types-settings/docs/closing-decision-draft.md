# Local closing decision draft for #225

Local only. Parent independent verification, PR, and ticket closeout are pending. Do not post this draft until the parent has verified the final revision.

Ramon approved D after [the Round 2 notes](https://github.com/RAbdelrhman/wayfinder-map/issues/225#issuecomment-6394435585): "you dont need the round three but yes approve with that one thing removed."

The requested removal is the redundant "5 need you · 2 new on your maps" summary in every D Inbox state, light and dark. Everything else in D stays. No Round 3.

Chosen source: `config.js`, page `round-2`, option `D`; `variants/mobile.html?v=C&remix=filter&acct=G&names=a&nt=D&screen=inbox`. D was reviewed at `ddc2b0f6f97d9e2bc088424c309d6d2c4dacc2ec`. It combines A's ticket rows and All / Needs you pills with unread count, B's icons, blue unread dots and grouped settings, and C's timeline and ticket-first pushes. Timeline nodes stay centred, and D's seven type colours stay. Earlier A/B/C options, feedback and `basedOn` lineage are preserved. The inherited phone pages come from #223 and #316's chosen G-a settings.

## Confirmed behavior represented by the prototype

- The desktop syncs its alert and map activity history to the phone Inbox. Read state belongs to this phone. Opening an alert marks it read locally; read needs-you alerts remain until the desktop sees them handled.
- Six needs-you types can push: T3 Code needs you, CI is failing, PR ready for review, hand-off error including usage limits, ticket stalled, and prototype ready to review. Tickets become ready is shared map activity, Inbox only, never pushed.
- Push to this phone is per phone. The seven type switches are shared with the desktop and other phones. Turning off this phone's pushes leaves Inbox delivery intact. Pushes pause while Wayfinder is being used on the computer; skipped pushes stay in the Inbox.
- Inbox All includes alerts and map activity; Needs you hides activity. The amber pill, Maps bell and app badge count unread needs-you alerts only. Blue dots mark unread rows, including activity. Reading an alert reduces the local count.
- An Inbox row or push opens its ticket detail, never a session, PR or canvas directly. The prototype returns from an Inbox ticket to Inbox, and from a push ticket to Maps.
- Settings are reached through Settings > Preferences > Notifications. They retain B's phone push card, six Pushed to phones switches and separate Inbox only group, with D's type icons and colours.
- When the desktop is unreachable, the Inbox shows cached history and settings show the last synced values with all eight switches disabled. New alerts arrive when the desktop returns.

Sources: `config.js`; `variants/notify.js`, `notify-data.js`, `notify.css`; existing desktop references named in the canvas Design review; [Round 1 feedback](https://github.com/RAbdelrhman/wayfinder-map/issues/225#issuecomment-6389446089); Round 2 feedback linked above; explicit approval supplied by the parent. This is prototype behavior, not live delivery proof.

## Final evidence

Installed Chrome, fresh headless run: all D states captured in light and dark at 390 × 844; widths 320, 360, 390 and 430 checked. Separate assertions pass in both themes for summary absence in All, Needs you, offline and empty Inbox, while pills/count, timeline rows, icons/dots, local read transition, settings groups/toggle, offline locks and ticket-first pushes remain. Light and dark Inbox screenshots visually inspected. Timeline node centres measured 0 px off the rail. No horizontal overflow reported. Keyboard, bell, row, push and settings flows pass. One initial console resource 404 remains in the broad run, as in the earlier baseline; no page exceptions. Detailed reports and screenshots are in `%TEMP%/nt225/final-*`.

`node <canvas>/tools/check.mjs`: Canvas config OK. `bun run typecheck` and `bun run lint`: exit 0. `bun run test`: 128 files and 1,711 tests passed. The separate copied `tools/check.test.mjs` suite has 12 passes and 3 ENOENT failures for legacy `canvas.js`, `variants/data.js` and `variants/shell.js`. Its file hash matches `prototypes/canvas/tools/check.test.mjs`; [#327](https://github.com/RAbdelrhman/wayfinder-map/issues/327) owns the copied fixture problem. This suite is failed, not waived or called green.

`bun run canvas:poster <canvas>` recaptured the board after the final metadata edits; `bun run canvas:poster --check <canvas>` passed at 1280 × 800. The poster bytes are unchanged because the default board opens the preserved Round 1 page. A source comparison also confirms the earlier A/B/C pages and feedback are unchanged, and the only renderer change is the D summary removal.

## Not checked and remaining limitations

Real iOS/Android devices, OS permission flow and notification delivery, desktop sync, screen readers, colour-blindness simulation, large text, 200% zoom, landscape, safe areas and Windows high contrast are not verified. The lock/home screens imitate iOS; Android is not drawn. The Type colours page is a design reference. Tickets outside the fixture map show a sample-data toast. Unpaired/permission-denied states and a skipped-push indicator are not drawn. Phone clear-activity/mark-all-read controls are absent. The desktop uses a different Inbox count; the prototype's back destination from pushes is a stand-in carried from the approved D. Four D colours need production tokens. Earlier inherited avatar contrast and small search/tab target findings remain documented in Design review.

Done-when status for the parent: canvas and chosen D exist; posting the closing decision remains pending by instruction. These prototype limitations do not prove production readiness and should stay in the posted decision.
