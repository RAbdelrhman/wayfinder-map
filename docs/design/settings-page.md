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

The layout choice is pending. The app still uses its existing Settings modal.

## Verification

Both layouts were inspected in light and dark mode at 1280×900. Browser checks
exercised theme switching, tier selection, rating and calibration pickers,
notification checkboxes, and all category links. All categories fit without
horizontal overflow at 900×620 and 390×844. Keyboard focus has a visible outline.

The sandbox canvas checker and its 14 tests passed. Typecheck, lint and all 1,157
Vitest tests across 92 files passed. Installed Electron behavior, screen readers,
forced colours, saving, loading errors and rollback remain unverified because
this change contains only the design fixture.
