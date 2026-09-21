/*
  Shared by every variant: fake data, the app's icons, the theme the canvas asks for
  (?theme=dark|light), and links that explain themselves instead of navigating.
  Variants link the real stylesheet (../../../src/ui/styles.css), so they look like the app.
*/
window.Kit = (() => {
  const params = new URLSearchParams(location.search);
  const theme = params.get('theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;

  // A named style from config.js, passed by the canvas. Same rules canvas.js writes for its own items.
  const decls = (vars) =>
    Object.entries(vars ?? {})
      .map(([key, value]) => `${key.startsWith('--') ? key : `--${key}`}:${value};`)
      .join('');
  try {
    const style = JSON.parse(params.get('style') ?? 'null');
    if (style) {
      for (const href of style.fonts ?? []) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.append(link);
      }
      const el = document.createElement('style');
      el.textContent = `.viz-root{${decls(style.vars)}${style.font ? `font-family:${style.font};` : ''}}
        :root[data-theme='dark'] .viz-root{${decls({ ...style.vars, ...style.dark })}}
        ${style.css ?? ''}`;
      document.head.append(el);
    }
  } catch {
    console.warn('Ignoring a style the canvas could not parse.');
  }

  const FIXTURES = {
    login: 'ramon',
    host: 'github.com',
    lastMap: { repo: 'RAbdelrhman/wayfinder-map', number: 35, title: 'Redesign Home and Start a new map', done: 3, total: 23 },
    repositories: [
      { name: 'RAbdelrhman/wayfinder-map', maps: 2, open: 29, done: 17, updated: '2 hours ago' },
      { name: 'RAbdelrhman/podcontrol', maps: 1, open: 6, done: 11, updated: 'yesterday' },
      { name: 'RAbdelrhman/pdfbuilder', maps: 1, open: 3, done: 9, updated: '3 days ago' },
      { name: 'entelech/ecpl-lockstep', maps: 3, open: 14, done: 22, updated: 'last week' },
    ],
    frontier: [
      { number: 36, type: 'R', title: 'Where do Home and Start a new map fall short of the map page?' },
      { number: 37, type: 'R', title: "What is the map page's design system, and where do the Home views drift from it?" },
      { number: 38, type: 'R', title: 'What can T3 Code tell Wayfinder about a thread after a hand-off?' },
    ],
    handOffs: [
      { ticket: 39, title: 'What should the prototype canvas look like?', state: 'needs-input', label: 'Waiting on you', since: '4 min' },
      { ticket: 50, title: 'Consolidate shared design tokens and components', state: 'working', label: 'Working', since: '12 min' },
      { ticket: 34, title: 'Draw the progress rings at their size again', state: 'done', label: 'PR #34 merged', since: '1 h' },
    ],
  };

  const ICONS = {
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    home: '<path d="m3 10.5 9-7 9 7"/><path d="M5.5 9.2V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    refresh:
      '<path d="M20 11a8 8 0 0 0-14.9-3.5L3 10"/><path d="M3 4v6h6"/><path d="M4 13a8 8 0 0 0 14.9 3.5L21 14"/><path d="M21 20v-6h-6"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    repo: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v18H6.5A1.5 1.5 0 0 1 5 19.5z"/><path d="M5 16.5A1.5 1.5 0 0 1 6.5 15H19"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    play: '<path d="M7 4v16l13-8z" fill="currentColor"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    person: '<path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="7" r="4"/>',
    search: '<circle cx="11" cy="11" r="6.4"/><path d="m20 20-4.4-4.4"/>',
  };

  const icon = (name) =>
    `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;

  const esc = (text) =>
    String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function toast(message) {
    let el = document.getElementById('kit-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'kit-toast';
      el.className = 'toast';
      el.setAttribute('role', 'status');
      document.body.append(el);
    }
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (el.hidden = true), 2600);
  }

  // A prototype has nowhere real to go: say where a link would lead instead.
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-to], button[data-to]');
    if (!link) return;
    event.preventDefault();
    toast(`Would open ${link.dataset.to}`);
  });

  function fillIcons(root = document) {
    for (const el of root.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon);
  }

  document.addEventListener('DOMContentLoaded', () => fillIcons());

  return { FIXTURES, icon, esc, fillIcons, toast };
})();
