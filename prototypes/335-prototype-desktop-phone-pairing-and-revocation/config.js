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

// Ramon's Wayfinder canvas notes on A2 · Three phones at caf3a61 (#335 comment 6478969468), verbatim.
const A2_FEEDBACK =
  '“This desktop section” (RAMON‑PC’s row): “Make this longer so it doesn\'t start a new line.” “This desktop” heading: “Add more bottom padding. Or i think it needs to be in Div.” “Paired phones 3”: “Same thing as Element 1. I want there to be a line here and make sure the padding is consistent. Actually I think you can remove this and add something that shows the amount of phones connected somewhere else.” “Phones” (the category heading): “You can remove this.” “Registered for pushes” (Ramon’s iPhone): “Can make the heading bigger.”';

const a3 = (c, s) => `variants/desktop.html?o=A3&c=${c}&s=${s}`;

/** Round 3: the notes' changes in every frame, and three places for the phone count, one per frame. */
const COUNT_PLACES = [
  {
    c: 'nav',
    name: 'In the Settings categories',
    idea: 'A small 3 sits at the end of Phones in the Settings categories. Screen readers hear “Phones, 3 phones paired”.',
    pros: ['Visible from the categories, without reading the page', 'Takes no room in the page itself', 'Stays with Phones if the categories are reordered'],
    cons: ['No other category carries a count, so it is the only one', 'Below 720 px the categories become a row of links and the badge is small there', 'Could be read as unread items rather than phones'],
  },
  {
    c: 'lead',
    name: 'In the page’s first line',
    idea: 'The line that was under the removed “Phones” heading now opens with the count: “3 phones paired with RAMON‑PC. They start tickets here and watch them run.”',
    pros: ['Says what the number is in words, with no badge to decode', 'Uses a line that is already there, so nothing is added', 'Read first, before either section'],
    cons: ['Plain text, so it is the easiest of the three to skip', 'Sits away from the list it counts', 'At no phones the line drops the count and keeps only its description'],
  },
  {
    c: 'desk',
    name: 'In This desktop’s row',
    idea: 'Under Ready to pair on RAMON‑PC’s row: “3 phones paired”. The desktop’s state and how many phones reach it sit together.',
    pros: ['Answers “how many phones use this desktop” where the desktop is described', 'Right-aligned under Ready to pair, so it reads as status, not as a heading', 'Stays above the list, however long the list gets'],
    cons: ['Hidden while Tailscale isn’t running, because that row becomes the problem notice', 'Puts a phone fact in the desktop’s section', 'The right side of the row becomes two lines'],
  },
];

const ROUND3_INTRO = {
  title: 'What changed from A2',
  note: 'Only what Ramon’s notes on A2’s Three phones frame asked for. Flow, copy, dialogs and data are A2’s. B and C are unchanged on their pages.',
  items: [
    {
      id: 'A3-changes',
      kind: 'note',
      name: 'Round 3 changes',
      boardWidth: 360,
      text: `From Ramon’s notes on A2 · Three phones (comment 6478969468). A2 is marked Change, with the notes recorded on its Three phones frame.

1. RAMON‑PC’s row: “Make this longer so it doesn't start a new line.” Changed: “Phones reach it at … through Tailscale.” is one line. Pair a phone’s description is one line too, reading note 3’s “Same thing as Element 1” as the same request.
2. This desktop: “Add more bottom padding. Or i think it needs to be in Div.” Changed: the heading sits in its own header, 14 px above and below, and the line runs under that header.
3. Paired phones 3: “I want there to be a line here and make sure the padding is consistent. Actually I think you can remove this and add something that shows the amount of phones connected somewhere else.” Changed: Paired phones gets the same lined header as This desktop and loses its 3. Where the count goes is open; “Where the count goes” shows three places, one per frame. None is picked.
4. Phones: “You can remove this.” Changed: the category heading is gone. Its line (“Phones paired with RAMON‑PC …”) stays as the page’s first line.
5. Registered for pushes: “Can make the heading bigger.” Changed, read as that row’s heading, the phone’s name: every row’s name is 14 px semibold (was 13 px medium). Section headings went to 15 px so they stay above row names.

Frames after “The count with no phones” leave the count out, so they lean towards no place.`,
    },
  ],
};

const ROUND3_REVIEW = {
  id: 'A3-review',
  kind: 'note',
  name: 'Design review, Round 3',
  boardWidth: 360,
  text: `Checked on 2026-10-28 in installed Chrome (Playwright) against this board’s own sandboxed server, before any pick.

Source: ?o=A3 runs A’s script, so flow, copy, dialogs and focus are A’s. desktop.js adds only the lined section headers, no Phones heading, and &c= for the count’s place. desktop.css adds rules under .p335-r3. No new colours: the line is the hairline token and the count uses the app’s badge and text tokens.

Checked:
• Sweep: all ten states × the four count settings (three places and none) × 1280×800, 1280×560, 700×760 and 480×800 × light and dark: 320 frames, no page errors, no sideways overflow, no Phones heading, no count beside Paired phones.
• One count per frame: the count shows exactly once, in its own place, whenever phones are paired; never with no phones; never in the none frames; and not in This desktop’s row while Tailscale is off.
• Wrapping: at 1280 every row’s lines are one line, RAMON‑PC’s and Pair a phone’s included. At 700 and 480 some still wrap; the window is narrower than the text.
• Headers: This desktop and Paired phones both 14 px above and below, one 1 px line under each, no second line under it. Headings 15 px; row names 14 px semibold; row lines 12 px.
• Centring kept from A2: every row’s button or status is within 0.5 px of the row’s middle.
• Contrast, both themes: lead line 7.20 and 10.85:1, lead count 17.86 and 19.44:1, desk count 7.73 and 9.72:1, nav badge 5.87 and 8.16:1, row lines 5.28 and 6.04:1.
• Interactions, in each place: Pair a phone → Phone uses this code → Done reads 4 phones paired; Remove Pixel 9 → Escape returns to its Remove; Remove phone → focus on the notice, 3 phones paired; Dismiss → focus on Pair a phone (the Phones heading it used to go to is gone).
• Screen reader text, from the accessibility tree: the nav link reads “Phones, 3 phones paired”.
• A, A2, B and C still render with their own heading and count.

Not checked:
• A screen reader, Windows High Contrast and 200% zoom.
• The Electron window. Wayfinder’s viewer was not opened; the board was inspected on this server.
• Note 5 is read as the row’s name. If “the heading” meant the push line or the section headings only, this is the wrong change.
• Real QR scanning, clipboard writes, Tailscale and phones, as in Round 1.`,
};

/** Round 3's page: A3's flow with the count left out, plus each place the count could go. */
function round3() {
  const base = option('A3', 'A3 · A2 with your notes', 3, ROUND3_INTRO);
  const places = {
    title: 'Where the count goes',
    note: 'The notes ask for the number of phones “somewhere else” and leave the place open. Three places; each frame shows the count once, and nothing else differs.',
    items: COUNT_PLACES.map((p) => ({ id: `A3-${p.c}`, name: p.name, src: a3(p.c, 'list'), ...DESK, note: { idea: p.idea, pros: p.pros, cons: p.cons } })),
  };
  const edges = {
    title: 'The count with no phones, and after a removal',
    note: 'With no phones the count hides in every place, because the list already says “No phones paired yet”. After Pixel 9 is removed each place reads 2.',
    items: COUNT_PLACES.flatMap((p) => [
      { id: `A3-${p.c}-empty`, name: `${p.name}: no phones`, src: a3(p.c, 'empty'), ...DESK, note: { idea: 'Nothing paired, so no count shows.' } },
      { id: `A3-${p.c}-removed`, name: `${p.name}: removed`, src: a3(p.c, 'removed'), ...DESK, note: { idea: 'Pixel 9 removed: the count reads 2 phones paired.' } },
    ]),
  };
  const shown = new Set(['A3-list', 'A3-empty', 'A3-removed']);
  const rest = base.sections
    .slice(1)
    .map((section) => ({
      ...section,
      note: `${section.note ? `${section.note} ` : ''}The count is left out of these frames.`,
      items: section.items.filter((item) => !shown.has(item.id)),
    }))
    .filter((section) => section.items.length);
  const page = remix({ ...base, sections: [{ ...base.sections[0], items: [...base.sections[0].items, ROUND3_REVIEW] }, places, edges, ...rest] }, 'A2');
  // Ramon picked the Settings categories place on 5ca95b2; the other two places have no disposition.
  const record = (item) => (item.id === 'A3-nav' ? { ...item, note: { ...item.note, disposition: 'keep', feedback: A3_FEEDBACK } } : item);
  return { ...page, sections: page.sections.map((section) => ({ ...section, items: section.items.map(record) })) };
}

// Ramon's Wayfinder canvas notes on A3 at 5ca95b2 (#335 comment 6481838489), verbatim.
const A3_FEEDBACK =
  '“Phones3, 3 phones paired” (the count in the Settings categories): “Have this a my pin”. Pin on “Paired phones” (x 0.856, y 0.461): “Where I want a second phone count placement.”';

const a4 = (s) => `variants/desktop.html?o=A4&s=${s}`;

const ROUND4_INTRO = {
  title: 'What changed from A3-nav',
  note: 'Only what Ramon’s notes on A3 asked for. Flow, copy, dialogs and data are A3’s. A, B, C, A2 and A3 (all three count places) are unchanged on their pages.',
  items: [
    {
      id: 'A4-changes',
      kind: 'note',
      name: 'Round 4 changes',
      boardWidth: 360,
      text: `From Ramon’s notes on A3 (comment 6481838489). A3 · In the Settings categories is marked Keep, with the notes recorded on that frame.

1. The count in the Settings categories: “Have this a my pin”. Read as “my pick”: kept as it was in A3-nav. Phones ends in a small badge; screen readers hear “Phones, 3 phones paired”.
2. Pin on Paired phones: “Where I want a second phone count placement.” Added: “3 phones paired” at the right end of Paired phones’ header line, right-aligned with the rows’ Pair a phone and Remove buttons below it. It is 12 px secondary text, the same as A3-desk’s count, and sits outside the heading, so the heading still reads “Paired phones”.

Both counts follow the same rule as in A3: they read the list, so they always agree and change together when a phone pairs or is removed, and both hide when no phone is paired, because the list says “No phones paired yet”.

The pin’s point (x 0.856, y 0.461) is on the right of the page, at Paired phones’ header in Wayfinder’s viewer. In a 1280 × 800 frame that point lands about 30 px above the header, so the count goes on the header line the note names.`,
    },
  ],
};

const ROUND4_REVIEW = {
  id: 'A4-review',
  kind: 'note',
  name: 'Design review, Round 4',
  boardWidth: 360,
  text: `Checked on 2026-10-28 in installed Chrome (Playwright) against this board’s own sandboxed server.

Source: ?o=A4 runs A3’s script with the count fixed in the Settings categories, plus the header count. desktop.js adds one span outside the Paired phones heading; desktop.css adds two rules under .p335-r4. No new colours: the count uses the secondary text token, as A3-desk’s did.

Checked:
• Sweep: all ten states × 1280×800, 1280×560, 700×760 and 480×800 × light and dark: 80 frames, no page errors, no sideways overflow.
• The two counts agree: in every frame the badge and “N phones paired” equal the rows in the list, and both are absent at no phones (No phones, Tailscale not running).
• Live updates, clicking through: 3 → Phone uses this code → 4 and 4 → Remove Pixel 9, Escape → still 4 → Remove phone → 3 and 3 → down to “1 phone paired”, then none.
• Placement at 1280×800: the count’s right edge is at 1217 px, the same as Pair a phone and Remove; it starts at 1131 px (x 0.884) and sits on the heading’s line, 12 px. At 480 it stays at the header’s right end.
• Contrast: header count 7.73:1 light, 9.72:1 dark. Nav badge unchanged from A3 (5.87 and 8.16:1).
• Semantics, from the accessibility tree: the heading still reads “Paired phones”; the nav link reads “Phones, 3 phones paired”; the header count is plain text after the heading.
• Focus: Done → Pair a phone; Escape → Remove Pixel 9; Remove phone → the notice; Dismiss → Pair a phone. The count is not focusable.
• A, B, C, A2 and A3 still render on their pages.

Not checked:
• A screen reader, Windows High Contrast and 200% zoom.
• The Electron window and Wayfinder’s own viewer. The pin’s exact point was not replayed in the viewer; at 1280×800 it lands about 30 px above the header.
• Whether a count change is announced: it isn’t on its own. The existing pairing and removal messages are.
• Real QR scanning, clipboard writes, Tailscale and phones, as in Round 1.`,
};

/** Round 4's page: A3-nav with both counts, in every state. */
function round4() {
  const base = option('A4', 'A4 · A3-nav with a second count', 4, ROUND4_INTRO);
  const counts = {
    title: 'The two counts as phones change',
    note: 'The same page from no phones to three and back to two. Both counts show the same number in every frame, and neither shows at no phones.',
    items: [
      { id: 'A4-count-empty', name: 'No phones: no counts', src: a4('empty'), ...DESK, note: { idea: 'Nothing paired. Neither count shows; the list says “No phones paired yet”.' } },
      { id: 'A4-count-two', name: 'Two phones: 2 and 2', src: a4('code'), ...DESK, note: { idea: 'Before Pixel 9 pairs: the badge reads 2 and the header “2 phones paired”, behind the open code.' } },
      { id: 'A4-count-paired', name: 'Pixel 9 pairs: 3 and 3', src: a4('paired'), ...DESK, note: { idea: 'Pixel 9 used the code: both counts read 3 as it joins the list, marked New.' } },
      { id: 'A4-count-removed', name: 'Pixel 9 removed: 2 and 2', src: a4('removed'), ...DESK, note: { idea: 'After Remove phone, both counts drop to 2 with the row.' } },
    ],
  };
  const top = base.sections[0];
  const list = { id: 'A4-list', name: 'Three phones', src: a4('list'), ...DESK, note: { idea: 'Ramon’s pick, A3-nav, with the second count he pinned: the badge on Phones and “3 phones paired” at the right of Paired phones’ header.' } };
  // Three phones moves up beside the changes; the rest of A's flow follows in order.
  const rest = base.sections
    .slice(1)
    .map((section) => ({ ...section, items: section.items.filter((item) => item.id !== 'A4-list') }))
    .filter((section) => section.items.length);
  const page = { ...base, sections: [{ ...top, items: [...top.items, list, ROUND4_REVIEW] }, counts, ...rest] };
  return remix(page, 'A3-nav');
}

/** A2's page, with Ramon's notes on its Three phones frame recorded there. */
function round2() {
  const page = remix(option('A2', 'A2 · A with your notes', 2, ROUND2_INTRO), 'A');
  const record = (item) => (item.id === 'A2-list' ? { ...item, note: { ...item.note, disposition: 'change', feedback: A2_FEEDBACK } } : item);
  return { ...page, sections: page.sections.map((section) => ({ ...section, items: section.items.map(record) })) };
}

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
    round2(),
    round3(),
    round4(),
  ],
};
