/*
  Wayfinder's canvas for ticket #373 on map #217: the HTTPS landing page at https://wayfinder-links-pearl.vercel.app/open/<kind>/<id>.
  On a phone with the app, verified App Links skip this page. On desktop, and on a phone without the app, the page shows
  one Open in Wayfinder button that starts the existing wayfinder:// destination. The page reads only the link itself: it
  never fetches titles or GitHub data, and it can't tell whether the app opened, so it never says it did.
  Both options use the same copy, sample links and button; only the look differs. No option has been picked.
  Check with: node prototypes/373-https-open-in-wayfinder/tools/check.mjs
*/

const DESKTOP = { width: 1280, height: 800, boardWidth: 480 };
const NARROW = { width: 390, height: 844, boardWidth: 200 };

window.CANVAS = {
  ticket: 373,
  title: 'The Open in Wayfinder landing page',
  question: 'Which look should the HTTPS Open in Wayfinder page use?',
  sampleState:
    'Real links: repo RAbdelrhman/wayfinder-map (R_kgDOUfX94g), map #217 (I_kwDOUfX94s8AAAABU1Jndg), ticket #373 (I_kwDOUfX94s8AAAABbH5m2w), this board at its newest version, and #359\'s board fixed at f713a5f, page option-a. The invalid link is a prototype link cut off before its canvas. Open in Wayfinder and Install or update show what they would open.',

  base: {
    stylesheets: ['../../src/ui/styles.css'],
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
          title: 'Two looks for the same page, opening map #217 on desktop',
          note: 'Same behavior and copy in both: the kind comes from the link, one Open in Wayfinder button, and an always-visible "Nothing opened? Install or update Wayfinder" line. No title, repo name or "Opened" state, because the link host can\'t know them.',
          items: [
            {
              id: 'A',
              name: 'Centered card',
              src: 'variants/landing.html?o=A&d=map', ...DESKTOP,
              note: {
                idea: 'A small card in the middle of the page: app icon, a kind chip ("Map"), "Open this map in Wayfinder", a full-width button, and the install line under a divider. Prototype links add "Newest version" or "Version f713a5f · page option-a" under the heading.',
                pros: ['Reads in one glance; the button is the only thing to do', 'The heading names the kind in plain words', 'Looks the same on desktop and phone'],
                cons: ['Doesn\'t show the ID, so two links to the same kind look identical', 'The card floats on a mostly empty page on desktop'],
              },
            },
            {
              id: 'B',
              name: 'Plain page with link details',
              src: 'variants/landing.html?o=B&d=map', ...DESKTOP,
              note: {
                idea: 'A plain page with a small Wayfinder name at the top. "Open in Wayfinder" heading, then a short list of what the link holds (Kind, and for prototypes Version, Page, Item, then the ID), the button and the install line.',
                pros: ['Shows exactly what the link carries, including the ID, which helps when checking a link', 'Version and page are easy to compare for prototype links', 'Feels like a utility page, not a destination'],
                cons: ['The opaque ID is noise for most people', 'More to read before the button', 'The generic heading doesn\'t say map/ticket; the Kind row does'],
              },
            },
            {
              id: 'review',
              kind: 'note',
              name: 'Design review',
              text: 'Sources: #373 body; src/objectLinks.ts (kinds repo, map, ticket, prototype; prototype needs canvas, optional rev/page/item); src/ui/styles.css tokens (--plane, --surface-1, --hairline, --text-*, --accent-fill, .primary) and assets/wayfinder-icon.svg. IDs read from gh; the fixed revision is a real main commit that touched #359\'s board. Not product code: the parser in variants/landing.js is a stand-in. Checked in installed Chrome, light and dark, at 1280 × 800, 390 × 844, 390 × 560 and 844 × 390 for every option and link (96 pages): no page errors, no sideways scroll, no success wording, a 40px button on every valid link and none on the invalid one, the button first in Tab order with a visible focus ring. Fixed: the app icon nearly vanished on the dark page, so it gets a hairline ring. The board poster renders. Not checked: Present mode and Wayfinder\'s in-app viewer by hand, a real browser handing off to wayfinder:// (the button only shows what it would open), real phones and App Links, screen readers, large text.',
            },
          ],
        },
      ],
    },
    {
      id: 'option-a',
      title: 'A · Centered card',
      round: 1,
      sections: [
        {
          title: 'Desktop, each kind of link',
          items: [
            { id: 'A-map', name: 'Map', src: 'variants/landing.html?o=A&d=map', ...DESKTOP, note: { idea: '"Open this map in Wayfinder", chip "Map".' } },
            { id: 'A-ticket', name: 'Ticket', src: 'variants/landing.html?o=A&d=ticket', ...DESKTOP, note: { idea: '"Open this ticket in Wayfinder", chip "Ticket".' } },
            { id: 'A-repo', name: 'Repository', src: 'variants/landing.html?o=A&d=repo', ...DESKTOP, note: { idea: '"Open this repository in Wayfinder", chip "Repository".' } },
            { id: 'A-proto-new', name: 'Prototype, newest', src: 'variants/landing.html?o=A&d=proto-new', ...DESKTOP, note: { idea: 'No rev in the link: "Newest version" under the heading.' } },
            { id: 'A-proto-rev', name: 'Prototype, fixed version', src: 'variants/landing.html?o=A&d=proto-rev', ...DESKTOP, note: { idea: 'rev and page in the link: "Version f713a5f · page option-a".' } },
            { id: 'A-invalid', name: 'Invalid link', src: 'variants/landing.html?o=A&d=invalid', ...DESKTOP, note: { idea: 'No button and no redirect. "This link can\'t be opened. It may have been cut off. Ask for the link again."' } },
          ],
        },
        {
          title: 'Narrow browser or phone without the app',
          items: [
            { id: 'A-narrow-map', name: 'Map', src: 'variants/landing.html?o=A&d=map', ...NARROW, note: { idea: 'The same card, nearer the top. The install line is how a phone without the app gets it.' } },
            { id: 'A-narrow-proto', name: 'Prototype, fixed version', src: 'variants/landing.html?o=A&d=proto-rev', ...NARROW, note: { idea: 'Version and page wrap under the heading.' } },
            { id: 'A-narrow-invalid', name: 'Invalid link', src: 'variants/landing.html?o=A&d=invalid', ...NARROW, note: { idea: 'Same message as desktop.' } },
          ],
        },
      ],
    },
    {
      id: 'option-b',
      title: 'B · Plain page with link details',
      round: 1,
      sections: [
        {
          title: 'Desktop, each kind of link',
          items: [
            { id: 'B-map', name: 'Map', src: 'variants/landing.html?o=B&d=map', ...DESKTOP, note: { idea: 'Kind Map, then the map\'s ID.' } },
            { id: 'B-ticket', name: 'Ticket', src: 'variants/landing.html?o=B&d=ticket', ...DESKTOP, note: { idea: 'Kind Ticket, then the ticket\'s ID.' } },
            { id: 'B-repo', name: 'Repository', src: 'variants/landing.html?o=B&d=repo', ...DESKTOP, note: { idea: 'Kind Repository, then the repository\'s ID.' } },
            { id: 'B-proto-new', name: 'Prototype, newest', src: 'variants/landing.html?o=B&d=proto-new', ...DESKTOP, note: { idea: 'Version: Newest.' } },
            { id: 'B-proto-rev', name: 'Prototype, fixed version', src: 'variants/landing.html?o=B&d=proto-rev', ...DESKTOP, note: { idea: 'Version f713a5f and Page option-a, each on its own row.' } },
            { id: 'B-invalid', name: 'Invalid link', src: 'variants/landing.html?o=B&d=invalid', ...DESKTOP, note: { idea: 'No list, no button: "This link can\'t be opened. It isn\'t a complete Wayfinder link. It may have been cut off; ask for it again."' } },
          ],
        },
        {
          title: 'Narrow browser or phone without the app',
          items: [
            { id: 'B-narrow-map', name: 'Map', src: 'variants/landing.html?o=B&d=map', ...NARROW, note: { idea: 'The button goes full width; the ID wraps.' } },
            { id: 'B-narrow-proto', name: 'Prototype, fixed version', src: 'variants/landing.html?o=B&d=proto-rev', ...NARROW, note: { idea: 'Four rows: Kind, Version, Page, ID.' } },
            { id: 'B-narrow-invalid', name: 'Invalid link', src: 'variants/landing.html?o=B&d=invalid', ...NARROW, note: { idea: 'Same message as desktop.' } },
          ],
        },
      ],
    },
  ],
};
