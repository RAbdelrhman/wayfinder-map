# Design canvas

A board for design decisions, modelled on Claude Design artifacts. It lays out the options side by side: full pages, style directions, component sheets, palettes, type, and layered compositions. The user compares them, opens any one full size, and picks.

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
      question: 'Optional: overrides the top-level question on this page.',
      sections: [{ title: 'Pages', note: 'Optional line under the title.', items: [/* items */] }],
    },
  ],
};
```

One page? Skip `pages` and put `sections` at the top level. With more than one page the bar shows a page switcher (<kbd>P</kbd>, or <kbd>[</kbd> / <kbd>]</kbd>). A page's id is `id`, or its title slugified.

Every item takes `id` (short, e.g. `A`: shown on the board, used for keys and `#page/A` links), `name` and `note`. A note is a string or `{ idea, pros: [], cons: [] }`. Always write one: the user decides from the notes. Optional: `style`, `styles`, `boardWidth` (board size in px, default ≤ 600), `css` (extra CSS for the item).

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

## Using the board

- **Present an item:** click a frame (or ▶) to show it full size. In present mode:
  - <kbd>←</kbd>/<kbd>→</kbd> or <kbd>1</kbd>–<kbd>9</kbd> switch items.
  - <kbd>Esc</kbd> goes back.
  - <kbd>N</kbd> toggles the note.
- **Switch pages:** <kbd>P</kbd> opens the page menu. <kbd>[</kbd>/<kbd>]</kbd> step through pages.
- **Theme:** <kbd>T</kbd> switches every frame between light and dark.
- **Zoom and pan:** <kbd>+</kbd>/<kbd>−</kbd>/<kbd>0</kbd> zoom, or use Ctrl + wheel. Drag empty space to pan.
- **Help:** <kbd>?</kbd>.
- **Links:** `index.html#page` opens a page. `index.html#page/B` presents item B.

## Tools

| Command | Does |
|---|---|
| `node <dir>/tools/serve.mjs [port]` | Serves the repo root with a sandbox CSP (default port 4390) and prints the canvas URL |
| `node <dir>/tools/check.mjs` | Validates config.js: pages, kinds, ids, styles, that every file exists, and that pages are sandbox-safe |
| `node --test <dir>/tools/check.test.mjs` | Tests for the checker |
