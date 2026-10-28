/*
  Wayfinder's canvas for ticket #335: the desktop side of phone pairing and removal, on map #217.
  Counterpart of #224's chosen phone flow at 7e58300 (A overall, B's pairing pages, M2's model page):
  the phone scans a pairing code, or types the desktop address and code, from Settings → Desktop or a
  ticket's "Pair a desktop". #222's architecture: Tailscale, and a short-lived single-use secret swapped
  for a revocable per-phone token. It approved no placement, layout, controls or copy; this board picks none.
  Every frame is the whole clickable desktop page at one step: variants/desktop.html?o=A|B|C&s=<state>.
  Check with: node prototypes/335-prototype-desktop-phone-pairing-and-revocation/tools/check.mjs
*/

const DESK = { width: 1280, height: 800, boardWidth: 520 };
const frame = (o, s) => `variants/desktop.html?o=${o}&s=${s}`;

const NOTES = {
  A: {
    idea: 'A new Settings › Phones category. "This desktop" says whether Tailscale is ready; "Paired phones" lists every phone with Pair a phone above it. Pair a phone opens a dialog with the QR code, the typeable address and code, and its time left. Remove opens a confirm dialog.',
    pros: ['Sits with the other settings, under one stable URL a phone can name (“Settings › Phones”)', 'The dialog keeps the code front and centre while you hold the phone', 'Dialogs are the app’s existing pattern for a focused step (the models dialog)'],
    cons: ['Adds an eighth Settings category', 'The dialog hides the list, so you see the new phone only after Done', 'Two modal steps to remove a phone'],
    disposition: 'change',
    // Ramon's Wayfinder canvas notes on e62821c (#335 comment 6478544815), verbatim.
    feedback:
      "Overview · A: “I like A the best.” A · Three phones: “Paired phones” (Pixel 9’s details): “Center.” “Remove Ramon’s iPhone”: “Center.” “Paired phones” (the old iPhone’s details): “Allow this to be longer so it doesn't wrap as it cause it to look bad.” “This desktop section” (RAMON‑PC’s row, noted twice): “center.” “This desktop” heading: “Add a line between the div's.”",
  },
  B: {
    idea: 'The same Settings › Phones category, but nothing opens over the page. "Show pairing code" expands the Pair a phone section in place; Stop pairing collapses it. Remove turns that phone’s row into an inline confirm with Keep and Remove phone.',
    pros: ['The list stays visible while you pair, so the new phone appears under the code', 'No modal: easier to copy the address into another window', 'Removing one phone never hides the others'],
    cons: ['Adds an eighth Settings category', 'The expanded code pushes the list down on short windows', 'An inline confirm is easier to miss than a dialog'],
  },
  C: {
    idea: 'No Settings page. A Phones button in the top bar, with a count, opens a popover on any page: the phones list, Pair a phone at its foot, the code in the same popover, and removal as a step inside it. Escape or a click outside closes it.',
    pros: ['Reachable from every page in one click, including while a map is open', 'The count shows at a glance how many phones can start tickets', 'Smallest footprint: one button, one popover'],
    cons: ['A new top-bar control on every page for a task done rarely', 'A smaller QR (132 px) and a narrow column for the address', 'The phone’s steps say “Open Wayfinder on your desktop and show a pairing code”, with no page to name'],
  },
};

const option = (o, title, round = 1, intro) => ({
  id: `option-${o.toLowerCase()}`,
  title,
  round,
  sections: [
    ...(intro ? [intro] : []),
    {
      title: 'Before pairing',
      note: o === 'C' ? 'Where you start, with no phones and with Tailscale not running.' : 'With no phones, and with Tailscale not running on the desktop.',
      items: [
        ...(o === 'C' ? [{ id: `${o}-closed`, name: 'Phones button, closed', src: frame(o, 'closed'), ...DESK, note: { idea: 'The top bar on Home. The badge counts paired phones.' } }] : []),
        { id: `${o}-empty`, name: 'No phones yet', src: frame(o, 'empty'), ...DESK, note: { idea: 'Nothing paired. Pair a phone is the only action.' } },
        { id: `${o}-prereq`, name: 'Tailscale not running', src: frame(o, 'prereq'), ...DESK, note: { idea: 'No code can be shown: phones reach the desktop only through Tailscale. Pair a phone is disabled with a reason; Check again rechecks.' } },
      ],
    },
    {
      title: 'Showing the code',
      note: 'Single use, five minutes in this sample (#224 says “a few minutes”). Frames load still; show a code yourself to start the countdown. The dashed strip is prototype-only.',
      items: [
        { id: `${o}-code`, name: 'Code showing', src: frame(o, 'code'), ...DESK, note: { idea: 'QR, the typeable address and code with Copy buttons, and “Works once · expires in 4:52”. New code replaces it; the old one stops working.' } },
        { id: `${o}-ending`, name: 'Last minute', src: frame(o, 'ending'), ...DESK, note: { idea: 'Under a minute left: the time turns amber, and screen readers hear “expires in 1 minute” once.' } },
        { id: `${o}-expired`, name: 'Expired', src: frame(o, 'expired'), ...DESK, note: { idea: 'The QR fades and the code is struck through. Show a new code is the main action. Matches the phone’s “That pairing code expired”.' } },
        { id: `${o}-paired`, name: 'Used: phone paired', src: frame(o, 'paired'), ...DESK, note: { idea: 'Pixel 9 used the code at 10:16, so it no longer works. Pair another phone makes a fresh code; Pixel 9 joins the list, marked New.' } },
      ],
    },
    {
      title: 'Several phones',
      items: [
        { id: `${o}-list`, name: 'Three phones', src: frame(o, 'list'), ...DESK, note: { idea: 'Each phone has its own token. Rows show name, model, when it paired, when it last reached the desktop, and whether it is registered for pushes. Two iPhones are told apart by model and dates.' } },
      ],
    },
    {
      title: 'Removing a phone',
      items: [
        { id: `${o}-confirm`, name: 'Remove Pixel 9?', src: frame(o, 'confirm'), ...DESK, note: { idea: 'Says what removing does: no more starts or watching, its push registration deleted, starts it holds won’t send, pair again with a new code.' } },
        { id: `${o}-removed`, name: 'Removed', src: frame(o, 'removed'), ...DESK, note: { idea: 'Pixel 9 is gone from the list. The phone shows #224’s “RAMON‑PC removed this phone” the next time it reaches the desktop.' } },
        { id: `${o}-removed-offline`, name: 'Removed while away', src: frame(o, 'removed-offline'), ...DESK, note: { idea: 'The old iPhone hasn’t reached the desktop since Oct 2 and had no push registration. Removal is immediate on the desktop; the phone learns of it when it next tries.' } },
      ],
    },
  ],
});

/** A later round's page: every frame names the option it was remixed from. */
const remix = (page, from) => ({
  ...page,
  sections: page.sections.map((section) => ({
    ...section,
    items: section.items.map((item) => (item.kind === 'note' ? item : { ...item, note: { ...item.note, basedOn: from } })),
  })),
});

const ROUND2_INTRO = {
  title: 'What changed from A',
  note: 'Only what Ramon’s notes on A’s Three phones frame asked for. Flow, copy, dialogs and data are A’s, in every state.',
  items: [
    {
      id: 'A2-changes',
      kind: 'note',
      name: 'Round 2 changes',
      boardWidth: 360,
      text: `From Ramon’s notes on A · Three phones:

1. “Center.” Every row in This desktop and Paired phones is centred vertically: the icon, the text, Remove, Pair a phone and Ready to pair.
2. “Allow this to be longer so it doesn't wrap.” A phone’s two lines now use the row’s full width, so “Not registered for pushes · Expo reported its push token gone on Oct 3” fits on one line at 1280 px.
3. “Add a line between the div's.” A hairline now sits under the This desktop heading, above RAMON‑PC (or above the Tailscale problem).

B and C are unchanged and still on their pages.`,
    },
  ],
};

window.CANVAS = {
  ticket: 335,
  title: 'Desktop phone pairing and removal',
  question: 'Where on the desktop do you pair a phone, see its single-use code and time left, list every paired phone, and remove one?',
  sampleState:
    'RAMON‑PC at ramon-pc.tail5c2e.ts.net through Tailscale, 10:14. Paired: Ramon’s iPhone (today, registered for pushes) and an old iPhone (last reached Oct 2, push token gone). Pixel 9 pairs at 10:16 with code K7QF-3M9P. Every frame is the whole clickable page.',

  base: {
    stylesheets: ['../../src/ui/styles.css', 'variants/desktop.css'],
    bodyClass: 'viz-root',
    surfaces: { plane: 'var(--plane)', surface: 'var(--surface-1)', line: 'var(--hairline)', text: 'var(--text-primary)', muted: 'var(--text-muted)' },
  },

  pages: [
    {
      id: 'overview',
      title: 'Overview',
      round: 1,
      sections: [
        {
          title: 'Three options, at the same moment',
          note: 'A pairing code is showing for a new phone, with two phones already paired. Each option’s page has every step and state.',
          items: [
            { id: 'A', name: 'Settings page, dialogs', src: frame('A', 'code'), ...DESK, note: NOTES.A },
            { id: 'B', name: 'Settings page, in place', src: frame('B', 'code'), ...DESK, note: NOTES.B },
            { id: 'C', name: 'Top-bar Phones popover', src: frame('C', 'code'), ...DESK, note: NOTES.C },
          ],
        },
        {
          title: 'Shared by every option',
          note: 'The same in A, B and C, so the choice is about placement and flow.',
          items: [
            {
              id: 'shared',
              kind: 'note',
              name: 'The same everywhere',
              boardWidth: 360,
              text: 'The code: a QR code, the desktop address and pairing code as text you can type or copy (the phone’s Enter code instead asks for both), “Works once”, the time left and when it ends. One code at a time; New code or closing it ends the old one.\n\nStates: no phones, Tailscale not running, code showing, last minute, expired, used (paired), several phones, removing, removed, removed while the phone is away.\n\nRemoving deletes that phone’s token and its push registration. It adds no notification settings: which pushes a phone gets is #225’s.\n\nCopy follows #224’s phone screens: “pairing code”, “Scan pairing code”, “Enter code instead”, “RAMON‑PC removed this phone”.',
            },
            {
              id: 'phone-side',
              kind: 'note',
              name: 'What the phone shows',
              boardWidth: 360,
              text: 'From #224 at 7e58300, unchanged: Settings → Desktop or a ticket’s Pair a desktop → Scan pairing code / Enter code instead → “Pair with RAMON‑PC?” → Paired. Its errors are “That pairing code expired”, “That code was already used” and “Can’t reach RAMON‑PC”, which line up with the desktop’s Expired, Used and Tailscale states here.\n\nThe phone pairs with one desktop at a time; a desktop can have many phones.',
            },
            {
              id: 'open',
              kind: 'note',
              name: 'Not settled here',
              boardWidth: 360,
              text: '1. How long a code lasts. Five minutes is sample data.\n2. Whether the desktop also asks you to approve each phone. None of these options do; #224’s phone already asks “Pair with RAMON‑PC?”.\n3. Renaming a phone. Rows use the name the phone sends.\n4. Whether “Last reached” and push registration are shown at all; both are sample fields.\n5. Where #231 points the phone’s instructions (“Settings › Phones” in A and B; no page in C).',
            },
            {
              id: 'review',
              kind: 'note',
              name: 'Design review',
              boardWidth: 360,
              text: `Checked on 2026-10-28 in installed Chrome (Playwright) against this board’s own server, before any product pick.

Source: built on src/ui/styles.css tokens and Settings classes (settings-page, settings-section, settings-row, segmented, primary, ghost, dialog). Copy and data follow #224 at 7e58300. The only colours outside the tokens are the QR’s black on white and the danger button’s text.

Checked:
• Both themes: every state of A, B and C, light and dark.
• Contrast: text in 22 state and theme pairs measured at WCAG AA (4.5:1, 3:1 for large text). The “New” badge failed at 4.4 and 4.2, and now uses primary text. The disabled Pair a phone was not measured; it is disabled.
• Interactions: A, B and C each run Pair → countdown → Phone uses this code → Pair another phone → expire → Remove → Escape → Remove phone (23 scripted checks pass, no page errors).
• Focus: it returns to Pair a phone or Remove after closing; Escape closes A’s dialogs and C’s popover and cancels B’s inline confirm; it moves to the notice after a removal.
• Semantics: dialog, alertdialog, group, list, timer and labelled Copy and Remove buttons, read from the accessibility tree. The expired code reads “expired”. A live region speaks the code, the last minute, expiry, pairing and removal once each.
• Responsive: 1280×800, 1280×560 (short), 700×760 and 480×800 (narrow), plus the board, an option page and a deep link with Escape.

Not checked:
• A screen reader, Windows High Contrast and 200% zoom.
• The Electron window and Wayfinder’s own canvas viewer. Only this board’s sandboxed server was used.
• Real QR scanning. The QR is a pattern, not a code.
• Clipboard writes in the sandbox. Copy shows a toast either way.
• Tailscale and phone behaviour. Nothing here talks to a phone.

Known: in B, Escape does not stop pairing, because the code sits on the page and nothing is open over it. Stop pairing ends it.

Round 2 (A with your notes), checked 2026-10-28 the same way:
Source: three CSS rules under .p335-r2 in desktop.css; ?o=A2 runs A’s own script, so flow, copy, dialogs and focus are A’s. No new colours: the line is the hairline token.
Checked:
• All ten A2 states, light and dark, at 1280×800, 1280×560, 700×760 and 480×800 (80 frames, no page errors, no sideways overflow).
• Centring: every row’s button or Ready to pair sits within 1 px of the row’s middle.
• Wrapping: at 1280 and 700 wide no phone line wraps; the old iPhone’s push line is one line, not two. At 480 a line still wraps, because the window is narrower than the text.
• The line under This desktop shows in every state, also above Tailscale isn’t running.
• Contrast: text in the rows of Three phones and Removed is at least 5.26:1 in both themes (text colours unchanged).
• Keyboard: Tab reaches Remove Pixel 9 with a 2 px ring; Enter opens the alertdialog on Cancel; Escape returns to Remove; Remove phone moves focus to the notice; Pair a phone’s dialog closes on Escape back to Pair a phone.
Not checked in Round 2: everything listed under Not checked above. RAMON‑PC’s and Pair a phone’s own descriptions still wrap at 360 px; the notes asked only about phone lines.`,
            },
          ],
        },
      ],
    },
    option('A', 'A · Settings page, dialogs'),
    option('B', 'B · Settings page, in place'),
    option('C', 'C · Top-bar Phones popover'),
    remix(option('A2', 'A2 · A with your notes', 2, ROUND2_INTRO), 'A'),
  ],
};
