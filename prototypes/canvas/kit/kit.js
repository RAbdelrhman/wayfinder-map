/*
  Optional helpers for pages in variants/. Load it with <script src="../kit/kit.js"></script>.
  It applies the theme and style the canvas passes (?theme=, ?style=), makes links marked
  data-to="…" explain themselves instead of navigating, fills data-icon="name" from Kit.icons,
  and gives you Kit.toast and Kit.esc. It knows nothing about any project: put fake data and
  icons in your own file (see variants/ for an example).
*/
window.Kit = (() => {
  const params = new URLSearchParams(location.search);
  const theme = params.get('theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;

  // A named style from config.js. Same rules canvas.js writes for its own items.
  const decls = (vars) =>
    Object.entries(vars ?? {})
      .map(([key, value]) => `${key.startsWith('--') ? key : `--${key}`}:${value};`)
      .join('');
  try {
    const style = JSON.parse(params.get('style') ?? 'null');
    if (style) {
      for (const href of [...(style.stylesheets ?? []), ...(style.fonts ?? [])]) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.append(link);
      }
      const body = `body${style.bodyClass ? `.${style.bodyClass}` : ''}`;
      const el = document.createElement('style');
      el.textContent = `:root,:root ${body}{${decls(style.vars)}}:root ${body}{${style.font ? `font-family:${style.font};` : ''}}
        :root[data-theme='dark'],:root[data-theme='dark'] ${body}{${decls({ ...style.vars, ...style.dark })}}
        ${style.css ?? ''}`;
      document.head.append(el);
    }
  } catch {
    console.warn('Ignoring a style the canvas could not parse.');
  }

  const esc = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /** Inner SVG markup by name, drawn on a 24px grid in currentColor. Add your own: Kit.icons.star = '<path …/>'. */
  const icons = {};
  const icon = (name) =>
    `<svg class="i" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${
      icons[name] ?? ''
    }</svg>`;

  function fillIcons(root = document) {
    for (const el of root.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon);
  }

  const toastCss = document.createElement('style');
  toastCss.textContent = `#kit-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;padding:9px 14px;border-radius:8px;
    background:#1b1b1a;color:#f3f2ee;font:13px/1.4 system-ui,sans-serif;box-shadow:0 10px 30px -10px rgba(0,0,0,.5)}#kit-toast[hidden]{display:none}`;
  document.head.append(toastCss);

  let timer;
  function toast(message) {
    let el = document.getElementById('kit-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'kit-toast';
      el.setAttribute('role', 'status');
      document.body.append(el);
    }
    el.textContent = message;
    el.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(() => (el.hidden = true), 2600);
  }

  // A prototype has nowhere real to go: say where a link would lead instead.
  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-to]');
    if (!link) return;
    event.preventDefault();
    toast(`Would open ${link.dataset.to}`);
  });

  document.addEventListener('DOMContentLoaded', () => fillIcons());

  return { icons, icon, fillIcons, toast, esc };
})();
