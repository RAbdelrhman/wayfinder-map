# Settings page

Replace the Settings modal with a dedicated page. Move the sidebar theme switch
and model defaults into that page. Keep ticket-specific tier and model overrides
in the ticket panel.

The design canvas has two options on its Settings page:

- A shows one category at a time with a category menu.
- B stacks all settings on a single page with section jump links.

Both group settings into Appearance, Tasks & models, Notifications, Progress and
Account. Tasks & models brings together the default task tier, hand-off limit,
per-tier models and reasoning effort, Auto rating and optional Calibration.
Calibration is collapsed under Advanced. Existing choices and persistence rules
must carry over to the implementation.

The fixture account and model names are sample data. Its controls change only the
preview. Account actions show a destination notice. The preview starts no T3 work
and makes no GitHub or settings API requests.

The user approved A. The app now serves a dedicated `/settings` page with
Appearance, Tasks & models, Notifications, Progress and Account categories.
Category links use `?section=` URLs and browser history. The shared sidebar links
to this page; its separate theme and model-default buttons have been removed.
The ticket panel's Defaults link opens Tasks & models. Ticket-specific tier and
model overrides remain in the ticket panel.

Existing storage keys and settings APIs are retained. Loading failures expose a
retry action, failed API saves restore the previous choice, and redraws preserve
keyboard focus and the Advanced section's open state.

## Verification

Both layouts were inspected in light and dark mode at 1280×900. Browser checks
exercised theme switching, tier selection, rating and calibration pickers,
notification checkboxes, and all category links. All categories fit without
horizontal overflow at 900×620 and 390×844. Keyboard focus has a visible outline.

The implementation was checked in a browser against a local, in-memory API
fixture using the built app documents and scripts. Checks passed for theme and
default-tier persistence, model and reasoning effort selection, reload and Back,
notification saves, failed-goal rollback, loading-error retry, and Calibration
focus restoration. Both themes and all five categories fit at 1280 by 900,
900 by 620 and 390 by 844 with no horizontal overflow or page errors.

The sandbox canvas checker and its 14 tests passed. Typecheck, lint and build
passed. Unit and HTTP tests cover category URLs, isolated category content,
model fallbacks, focus selectors, shared navigation and the dedicated document.
All 1,164 Vitest tests across 92 files passed with two workers and a 15-second
test timeout. The unrestricted run hit two existing tests' five-second timeouts;
a focused rerun passed the desktop test but timed out a different server test.
Installed Electron behavior, real account switching, screen readers and forced
colours remain Not Verified. The browser fixture does not save real preferences
or start GitHub or T3 work.
