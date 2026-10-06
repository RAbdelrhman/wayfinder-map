# Settings design canvas

Open `index.html` to compare the Settings layouts. A uses categories and B stacks
all settings on one page. The user selected A; `config.js` records the decision.
Demo controls change only the preview and make no application API calls.

This board has its own config, variants and URL. It shares the unchanged engine
and kit from `../canvas/`; the mobile board's config is independent of this one.
See [the engine reference](../canvas/README.md) for canvas authoring instructions.

Check: `node prototypes/settings-page/tools/check.mjs`

Preview: `node prototypes/settings-page/tools/serve.mjs 4392`, then open
`http://127.0.0.1:4392/prototypes/settings-page/index.html`.
