# Prototype canvas

A design board for prototype tickets, modelled on Claude Design artifacts. It shows the options for a decision side by side: full pages, style directions, component sheets, palettes, type, and layered compositions. The user compares them, opens any one full size, and picks.

Use it for every prototype that asks a **visual or UX** question. Logic-only prototypes don't need it.

## Quick start (agents)

1. Branch from the canvas branch into your ticket's prototype branch:
   `git switch -c prototype/<ticket>-<slug> origin/prototype/39-what-should-the-prototype-canvas-look-like-modelled-on-claude-de`
2. Replace the demo content in `prototypes/canvas/config.js` with your options. Put full pages in `variants/`, images in `assets/`.
3. Preview it exactly as Wayfinder serves it:
   `node prototypes/canvas/tools/serve.mjs` → open `http://127.0.0.1:4390/prototypes/canvas/index.html`
4. Check it: `node prototypes/canvas/tools/check.mjs`. It exits 1 on errors.
5. Commit, push, and show the user. In Wayfinder: the map → **Prototypes** (beaker) → `prototypes/canvas/index.html`.

## Rules (the sandbox)

Wayfinder serves prototype files off the branch with a sandbox CSP: an opaque origin. So:

- **Relative paths only.** A `/...` path makes Wayfinder refuse to open the page live.
- **Classic `<script src>` only.** Module scripts and `fetch()` fail CORS. Put data in `.js` files.
- **No `localStorage` or `sessionStorage`.** They throw.
- The real app stylesheet is at `../../src/ui/styles.css` from `index.html`, and `../../../src/ui/styles.css` from `variants/*.html`.

`check.mjs` catches all of these.

## config.js

```js
window.CANVAS = {
  ticket: 42,
  title: 'Navigation',
  question: 'What the user is deciding, in one sentence.',
  sampleState: 'What fake data the options show.',
  styles: { /* named token sets, see below */ },
  sections: [
    { title: 'Pages', note: 'Optional line under the title.', items: [ /* items */ ] },
  ],
};
```

Every item takes `id` (short, e.g. `A`, shown on the board, used for keys and `#id` links), `name`, and `note`. A note is a string or `{ idea, pros: [], cons: [] }`. Always write one: the user decides from the notes. Optional: `style`, `styles`, `boardWidth` (board size in px, default ≤ 600), `css` (extra CSS for the item).

### Item kinds

| kind | For | Fields |
|---|---|---|
| `page` (default when `src` is set) | A full clickable page | `src: 'variants/a.html'`, `width`/`height` (default 1440×900) |
| `compose` | Moodboards, hero ideas, annotated screenshots | `width`, `height`, `background`, `layers: []` |
| `components` | A sheet of UI pieces | `items: [{ label, html, span?, bare? }]`, `columns` (2), `width` (960) |
| `swatches` | A palette | `colors: [{ name, value }]`, or `style: 'key'` to use that style's colour tokens |
| `type` | A type specimen | `samples: [{ label, size, weight, font?, text? }]`, `text`, `font` |
| `image` | A screenshot or reference | `src`, `width` |
| `note` | A free sticky note | `text`, `name` |

**Compose layers** are absolutely placed on the artboard. Later layers sit on top unless `z` is set.

- Every layer takes `x`, `y`, `w`, `h`, `z`, `opacity`, `rotate` (deg), `radius`, `shadow`, `blend` (mix-blend-mode), `class`, `style`.
- `{ type: 'image', src, fit: 'cover' | 'contain', alt }`
- `{ type: 'text', text, size, weight, color, font, align, lineHeight, letterSpacing }`
- `{ type: 'rect', fill, border }`
- `{ type: 'html', html }`: any markup, and it gets the app stylesheet, so `<button class="primary">` is the real button.

Component `html` and compose `html` layers render on `.viz-root` with the app stylesheet. Use the app's classes (`primary`, `ghost`, `input`, `card`, `panel`, `chip`, …) and tokens (`var(--surface-1)`, `var(--text-primary)`, …).

### Styles: deciding a look

A style is a set of overrides for the app's CSS variables:

```js
styles: {
  warm: {
    label: 'Warm paper',
    vars: { '--surface-1': '#fffdf8', '--state-claimed': '#c2552d' }, // light
    dark: { '--surface-1': '#211e1a' },   // dark, falls back to vars
    font: "Georgia, serif",                // body font
    fonts: ['https://fonts.googleapis.com/css2?family=…'], // optional webfont stylesheets
    css: '.primary { border-radius: 999px; }',             // anything tokens can't say
    base: 'app',                           // 'none' to start without the app stylesheet
  },
},
```

- `style: 'warm'` puts one item in that style. It works on every kind, pages included (`kit.js` applies it).
- `styles: ['app', 'warm', 'crisp']` on one item expands it into one frame per style, side by side. This is the fastest way to compare looks. Define `app: { label: 'Wayfinder today', vars: {} }` as the baseline.

## Pages and kit.js

A page is ordinary HTML in `variants/`. Link the app stylesheet, put `class="viz-root"` on `<body>`, and load `../kit/kit.js`. That gives you:

- **Theme and style:** the canvas's light/dark toggle and the item's `style` are applied for you.
- **`Kit.FIXTURES`:** fake repositories, maps, frontier tickets and hand-offs. Add what you need.
- **`Kit.icon(name)`** and `data-icon="name"`: the app's stroke icons.
- **`data-to="Somewhere"`** on a link or button: clicking shows "Would open Somewhere" instead of navigating.
- **`Kit.toast(text)`** and **`Kit.esc(text)`**.

`variants/a.html` and `variants/b.html` are working examples.

## Using the board

Click a frame (or ▶) to present it full size. In present mode, <kbd>←</kbd>/<kbd>→</kbd> or <kbd>1</kbd>–<kbd>9</kbd> switch items, <kbd>Esc</kbd> goes back, <kbd>N</kbd> toggles the note. <kbd>T</kbd> switches every frame between light and dark. <kbd>+</kbd>/<kbd>−</kbd>/<kbd>0</kbd> zoom, or use Ctrl + wheel. Drag empty space to pan. <kbd>?</kbd> shows help. `index.html#B` links straight to item B.

## Tools

| Command | Does |
|---|---|
| `node prototypes/canvas/tools/serve.mjs [port]` | Serves the repo with Wayfinder's sandbox CSP, for previewing before you push |
| `node prototypes/canvas/tools/check.mjs` | Validates config.js: kinds, ids, styles, that every file exists, and that pages are sandbox-safe |
| `node --test prototypes/canvas/tools/check.test.mjs` | Tests for the checker |
