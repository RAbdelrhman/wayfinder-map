# Design canvas

An in-repo board for design decisions. It lays out options side by side: full pages, style directions, component sheets, palettes, type, and layered compositions. The user compares them, opens any one full size, and picks.

It knows nothing about any project. Everything project-specific lives in `config.js`, `variants/` and `assets/`. The engine (`index.html`, `canvas.js`, `canvas.css`, `kit/`, `tools/`) stays the same everywhere.

Use it when a decision is **visual or UX**. Logic-only prototypes don't need it.

## Quick start (agents)

1. Put the canvas in the repo: `node ~/.claude/skills/design-canvas/scaffold.mjs [dir]` (default `prototypes/canvas`). It never overwrites `config.js`, `variants/` or `assets/`, so running it again just updates the engine.
2. Describe your options in `config.js`. Put full pages in `variants/`, images in `assets/`.
3. Preview it under the same sandbox a prototype viewer uses: `node <dir>/tools/serve.mjs` → the URL it prints.
4. Check it: `node <dir>/tools/check.mjs`. It exits 1 on errors.
5. Commit and show the user.

## Rules (the sandbox)

The canvas has to work when served as sandboxed files at an opaque origin, as prototype viewers (Wayfinder, for one) serve them. So:

- **Relative paths only.** No `/...` paths.
- **Classic `<script src>` only.** Module scripts and `fetch()` fail CORS. Put data in `.js` files.
- **No `localStorage` or `sessionStorage`.** They throw.

`check.mjs` catches all of these.

## config.js

```js
window.CANVAS = {
  title: 'Onboarding',
  question: 'What the user is deciding, in one sentence.',
  sampleState: 'What fake data the options show.', // optional
  ticket: 42,                                        // optional, shown as #42
  base: { /* the project's own look, optional */ },
  styles: { /* named looks to compare, optional */ },
  pages: [
    {
      title: 'Flows',
      round: 'Baseline', // optional; a positive number is shown as "Round N"
      question: 'Optional: overrides the top-level question on this page.',
      sections: [{ title: 'Pages', note: 'Optional line under the title.', items: [/* items */] }],
    },
  ],
};
```

One page? Skip `pages` and put `sections` at the top level. With more than one page the bar shows a page switcher (<kbd>P</kbd>, or <kbd>[</kbd> / <kbd>]</kbd>). A page's id is `id`, or its title slugified.

Every item takes `id` (short, e.g. `A`: shown on the board, used for keys and `#page/A` links), `name` and `note`. A note is a string or `{ idea, pros: [], cons: [], basedOn, disposition, feedback }`. Use `basedOn` for source option IDs (one name or an array); use `disposition` for `keep`, `change`, or `combine`, and `feedback` for the user's recorded detail. Always write an idea and trade-offs: the user decides from the notes. Optional: `style`, `styles`, `boardWidth` (board size in px, default ≤ 600), `css` (extra CSS for the item).

### Preserve iterations

Keep the baseline page and options when making a remix. Add a named page for each new round, set its `round` label, and put the source option IDs in each remixed item's `note.basedOn`. Do not replace the earlier options; the page menu keeps each round available for comparison. A string round label is shown as written; a positive number is shown as `Round N`.

### Item kinds

| kind | For | Fields |
|---|---|---|
| `page` (default when `src` is set) | A full clickable page | `src: 'variants/a.html'`, `width`/`height` (default 1440×900) |
| `compose` | Moodboards, hero ideas, annotated screenshots, posters | `width`, `height`, `background`, `layers: []` |
| `components` | A sheet of UI pieces | `items: [{ label, html, span?, bare? }]`, `columns` (2), `width` (960) |
| `swatches` | A palette | `colors: [{ name, value }]`, or `style: 'key'` to read that style's colour tokens |
| `type` | A type specimen | `samples: [{ label, size, weight, font?, text? }]`, `text`, `font` |
| `image` | A screenshot or reference | `src`, `width` |
| `note` | A free sticky note | `text`, `name` |

**Compose layers** are placed absolutely on the artboard. Later layers sit on top unless `z` is set.

- Every layer takes `x`, `y`, `w`, `h`, `z`, `opacity`, `rotate` (deg), `radius`, `shadow`, `blend` (mix-blend-mode), `class`, `style`.
- `{ type: 'image', src, fit: 'cover' | 'contain', alt }`
- `{ type: 'text', text, size, weight, color, font, align, lineHeight, letterSpacing }`
- `{ type: 'rect', fill, border }`
- `{ type: 'html', html }`: any markup. With a `base`, it's styled by the project's CSS, so a real button is the real button.

### base: the project's own look

Without `base`, items render on a plain neutral surface: fine for moodboards, palettes, and anything that isn't software yet. To show a project's real components, point at its CSS:

```js
base: {
  stylesheets: ['../../src/styles.css'],   // relative to index.html
  bodyClass: 'app',                        // if the CSS is scoped to a body class
  surfaces: {                              // map the canvas surfaces to the project's tokens
    plane: 'var(--bg)', surface: 'var(--card)', line: 'var(--border)',
    text: 'var(--fg)', muted: 'var(--fg-muted)',
  },
},
```

Items then use the project's classes and tokens. Your own markup can use the canvas surface variables, which work with or without a base: `--cv-plane`, `--cv-surface`, `--cv-line`, `--cv-text`, `--cv-muted`.

### styles: deciding a look

A style is a named set of CSS variable overrides, plus anything tokens can't say:

```js
styles: {
  current: { label: 'Today', vars: {} },    // the baseline
  warm: {
    label: 'Warm paper',
    vars: { '--bg': '#fffdf8', '--accent': '#c2552d' }, // light
    dark: { '--bg': '#211e1a' },                         // dark, falls back to vars
    font: 'Georgia, serif',                              // body font
    fonts: ['https://fonts.googleapis.com/css2?family=…'], // webfont stylesheets
    stylesheets: ['assets/warm.css'],                    // extra CSS files
    css: 'button { border-radius: 999px; }',
    base: 'none',                                        // start without base.stylesheets
  },
},
```

- `style: 'warm'` puts one item in that style. It works on every kind, pages included (`kit.js` applies it).
- `styles: ['current', 'warm', 'crisp']` on one item expands it into one frame per style (ids `K-current`, `K-warm`, …), side by side. This is the fastest way to compare looks.
- A style with no base project is fine too: define the variables your own markup uses.

## Pages and kit.js

A page is ordinary HTML in `variants/`. Link whatever CSS it needs (relative paths) and load `../kit/kit.js`. That gives you:

- **Theme and style:** the canvas's light/dark toggle and the item's `style` are applied for you.
- **Icons:** `Kit.icons` starts empty. Add your own inner SVG (24px grid, currentColor): `Kit.icons.star = '<path d="…"/>'`. Then use `data-icon="star"`, or `Kit.icon('star')` in markup you build.
- **`data-to="Somewhere"`** on a link or button: clicking shows "Would open Somewhere" instead of navigating.
- **`Kit.toast(text)`** and **`Kit.esc(text)`**.

Keep fake data and icons in your own classic script next to the pages (e.g. `variants/fixtures.js`) and load it after `kit.js`.

## Before presenting

Inspect the actual source design system before drawing conclusions or adding tokens:

1. Read the repository's token and component sources. Point `base.stylesheets` at the real stylesheet where practical, and use its component classes and semantic tokens in previews.
2. Switch between light and dark. Check the states relevant to the design, including hover, focus, disabled, selected, loading, and error states when they exist.
3. Review keyboard operation, visible focus, labels and semantics, responsive behavior, and text/control contrast. Fix issues that are in scope; list unresolved findings plainly.
4. Add a visible `kind: 'note'` item named `Design review` to the canvas. Record the sources inspected, themes and states checked, accessibility checks, findings, and anything not checked. Keep the review concise and specific.
5. Run `node <dir>/tools/check.mjs` and review the sandboxed canvas before sharing it. The checker cannot establish that the design looks right or passes accessibility review.

Do not report a check as passed just because the code or config passed a source-level check. Mark unperformed visual or accessibility checks as `Not checked` in the review note and handoff.

## Using the board

- **Present an item:** click a frame (or ▶) to show it full size. In present mode:
  - <kbd>←</kbd>/<kbd>→</kbd> or <kbd>1</kbd>–<kbd>9</kbd> switch items.
  - <kbd>Esc</kbd> goes back.
  - **Notes** or <kbd>N</kbd> toggles the note and feedback controls.
- **Capture feedback:** choose **Keep**, **Change**, or **Combine** for the presented option, add a detail if useful, then select and copy the generated line. Paste it into the ticket or next-round request. The canvas does not save or send this text; record the user's agreed choice in that option's note metadata before building another round.
- **Switch pages:** <kbd>P</kbd> opens the page menu. <kbd>[</kbd>/<kbd>]</kbd> step through pages.
- **Theme:** <kbd>T</kbd> switches every frame between light and dark.
- **Zoom and pan:** <kbd>+</kbd>/<kbd>−</kbd>/<kbd>0</kbd> zoom, or use Ctrl + wheel. Drag empty space to pan.
- **Help:** <kbd>?</kbd>.
- **Links:** `index.html#page` opens a page. `index.html#page/B` presents item B.

## Tools

| Command | Does |
|---|---|
| `node <dir>/tools/serve.mjs [port]` | Serves the repo root with a sandbox CSP (default port 4390) and prints the canvas URL |
| `node <dir>/tools/check.mjs` | Validates config.js: pages and round labels, kinds, ids, feedback metadata, styles, files, and sandbox safety |
| `node --test <dir>/tools/check.test.mjs` | Tests for the checker |
