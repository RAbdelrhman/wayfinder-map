/*
  The one file a prototype edits. README.md documents every field; this demo uses all of them.
  Paths are relative to index.html. Keep them relative: Wayfinder serves this branch
  sandboxed, so root paths (/...) and fetch() don't work. Check with: node prototypes/canvas/tools/check.mjs
*/

// Snippets reused below. Component HTML uses the app's own classes from src/ui/styles.css.
const BUTTONS = `<div style="display:flex;gap:10px;flex-wrap:wrap">
  <button class="primary">Start a new map</button>
  <button class="ghost">Refresh</button>
  <button class="primary" disabled>Handing off…</button>
</div>`;
const FIELD = `<div class="field" style="margin:0"><label>Open a repository</label>
  <div class="row"><input class="input" placeholder="owner/name" /><button class="primary">Open</button></div></div>`;
const REPO_CARD = `<a class="card repo-card" style="margin:0">
  <span class="grow">RAbdelrhman/wayfinder-map</span><span style="color:var(--text-muted);font-size:12px">2 maps</span></a>`;
const PANEL = `<div class="panel" style="margin:0"><span class="avatar">R</span>
  <span class="grow"><strong>ramon</strong><p>github.com</p></span></div>`;

window.CANVAS = {
  ticket: 39,
  title: 'Prototype canvas',
  question:
    'Is this the right board for design decisions? Every prototype on map #35 will be shown like this: full pages, and also style directions, component sheets, palettes, type and moodboards.',
  sampleState: 'Placeholder content on fake data. Real directions come in P1–P4.',

  // Named token sets. `vars` override the app's CSS variables (light), `dark` overrides in dark mode.
  styles: {
    app: { label: 'Wayfinder today', vars: {} },
    warm: {
      label: 'Warm paper',
      font: "Georgia, 'Iowan Old Style', serif",
      vars: {
        '--surface-1': '#fffdf8',
        '--plane': '#f3efe6',
        '--text-primary': '#1f1b16',
        '--text-secondary': '#5b5347',
        '--text-muted': '#8c8375',
        '--hairline': 'rgba(60, 40, 10, 0.12)',
        '--state-claimed': '#c2552d',
      },
      dark: {
        '--surface-1': '#211e1a',
        '--plane': '#171512',
        '--text-primary': '#f5efe4',
        '--text-secondary': '#cfc5b4',
        '--hairline': 'rgba(255, 240, 210, 0.12)',
        '--state-claimed': '#e07a52',
      },
    },
    crisp: {
      label: 'Crisp',
      vars: {
        '--surface-1': '#ffffff',
        '--plane': '#eef1f5',
        '--text-primary': '#0a0f1a',
        '--text-secondary': '#3d4657',
        '--text-muted': '#7a8496',
        '--hairline': 'rgba(10, 15, 26, 0.12)',
        '--state-claimed': '#4f46e5',
      },
      dark: {
        '--surface-1': '#141821',
        '--plane': '#0b0e14',
        '--text-primary': '#f4f6fb',
        '--text-secondary': '#b6bfcf',
        '--hairline': 'rgba(255, 255, 255, 0.1)',
        '--state-claimed': '#818cf8',
      },
      css: '.primary, .ghost, .input { border-radius: 999px; }',
    },
  },

  sections: [
    {
      title: 'Pages',
      note: 'Full pages you can click through. Each is an HTML file under variants/.',
      items: [
        {
          id: 'A',
          name: 'Directory',
          src: 'variants/a.html',
          note: {
            idea: "Today's Home, tidied up: account, a search box, then every repository as a card with its open maps and progress.",
            pros: ['Familiar: nothing moves', 'Scales to many repositories'],
            cons: ["Doesn't say what to do next", 'In-flight work is invisible'],
          },
        },
        {
          id: 'B',
          name: 'Pick up where you left off',
          src: 'variants/b.html',
          note: {
            idea: 'Home leads with the map you were last on and what is in flight in T3 Code.',
            pros: ['One obvious next action', 'Hand-offs are visible from the start'],
            cons: ['Needs hand-off tracking (G2)'],
          },
        },
      ],
    },
    {
      title: 'Style directions',
      note: 'The same component sheet under each style. One item with `styles: [...]` expands into one frame per style.',
      items: [
        {
          id: 'S',
          kind: 'components',
          name: 'Core components',
          styles: ['app', 'warm', 'crisp'],
          note: 'Buttons, a field, a card and a panel: enough to feel a style.',
          columns: 2,
          items: [
            { label: 'Buttons', html: BUTTONS, span: 2 },
            { label: 'Field', html: FIELD, span: 2 },
            { label: 'Repository card', html: REPO_CARD },
            { label: 'Account panel', html: PANEL },
          ],
        },
      ],
    },
    {
      title: 'Palette and type',
      items: [
        { id: 'P', kind: 'swatches', name: 'Warm paper palette', style: 'warm', note: 'Pulled straight from the style’s colour tokens.' },
        { id: 'T', kind: 'type', name: 'Warm paper type', style: 'warm', text: 'Pick up where you left off', note: 'A serif gives Home a calmer, editorial voice.' },
        { kind: 'note', name: 'Why a palette?', text: 'Palettes and type sit next to the pages that use them, so a style is judged on real screens, not swatches alone.' },
      ],
    },
    {
      title: 'Composition',
      note: 'Layered images, shapes, text and HTML placed on an artboard: for moodboards, hero ideas and annotated screenshots.',
      items: [
        {
          id: 'M',
          kind: 'compose',
          name: 'Annotated screenshot',
          width: 1200,
          height: 720,
          background: '#1c1b19',
          layers: [
            { type: 'image', src: 'assets/home-b.png', x: 60, y: 60, w: 800, h: 500, radius: 10, shadow: '0 30px 60px -20px rgba(0,0,0,.6)' },
            { type: 'rect', x: 165, y: 283, w: 385, h: 95, fill: 'transparent', border: '3px solid #f59e0b', radius: 12 },
            { type: 'text', text: 'The next action lives here', x: 900, y: 290, w: 260, size: 26, weight: 650, color: '#fbbf24' },
            { type: 'text', text: 'Frontier tickets start right from Home, one click to T3 Code.', x: 900, y: 360, w: 250, size: 15, color: '#d6d3cd', lineHeight: 1.5 },
            { type: 'image', src: '../../assets/wayfinder-icon.svg', x: 1080, y: 600, w: 64, h: 64, fit: 'contain', opacity: 0.9 },
            { type: 'html', x: 60, y: 610, w: 520, style: 'color:#d6d3cd', html: '<button class="primary">Real app button, layered in</button>' },
          ],
          note: { idea: 'Screenshot, highlight box, callout text, a logo and a real app button, all as layers.' },
        },
        { id: 'I', kind: 'image', name: 'Plain image', src: 'assets/home-b.png', width: 800, note: 'Any screenshot or reference image.' },
      ],
    },
  ],
};
