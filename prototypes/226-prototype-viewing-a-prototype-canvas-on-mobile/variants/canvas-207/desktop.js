/*
  Stand-in for #207's desktop options inside the #226 phone viewer. It draws the Wayfinder
  window with the canvas viewer where each direction puts it (overlay, route, pane, floating),
  using #207's fake map #300 and canvas #211. Every tap is fake.
*/
(() => {
  const opt = new URLSearchParams(location.search).get('opt') ?? 'A';
  const esc = Kit.esc;
  const browser = opt.endsWith('-browser');
  const family = opt.startsWith('ACF') ? 'float' : opt.startsWith('AC') ? 'pane' : opt[0] === 'A' ? 'full' : opt[0] === 'B' ? 'route' : opt[0] === 'C' ? 'pane' : 'full';

  const chrome = browser
    ? `<div class="d-browser"><span>◀ ▶ ⟳</span><span class="d-url">localhost:4747/maps/300?ticket=211&amp;canvas=211#directions/B</span><span>⋮</span></div>`
    : '';
  const top = `<header class="d-top"><b>Wayfinder</b><span class="d-chip">Offline drafts · #300</span>
    <span class="d-chip${family === 'pane' ? ' is-on' : ''}">Map</span><span class="d-chip${family === 'pane' ? '' : ' is-on'}">Prototypes</span>
    <span class="d-spacer"></span><span class="d-chip">2 hand-offs</span><span class="d-chip">Synced 1 min ago</span></header>`;
  const cards = ['#211 Offline drafts: list or cards', '#206 Draft sync settings', '#214 Conflict banner'].map(
    (title, i) => `<div class="d-card"><div class="pic">${i === 0 ? 'Canvas · 2 pages · A B C' : 'Snapshot'}</div><div class="txt"><b>${esc(title)}</b><span>${i === 0 ? 'Waiting on a pick in #218' : 'Decided'}</span></div></div>`,
  );
  const board = `<h2>Prototypes</h2><p>Every prototype on map #300, newest first. Open a card to view its canvas in the app.</p><div class="d-cards">${cards.join('')}</div>`;
  const map = `<div class="d-map">${[
    ['#205', 'Research: offline storage', 40, 40, '--state-done'],
    ['#206', 'Draft sync settings', 40, 150, '--state-done'],
    ['#211', 'Offline drafts: list or cards', 300, 95, '--state-claimed'],
    ['#218', 'Pick the drafts layout', 560, 95, '--state-blocked'],
  ]
    .map(([n, t, x, y, v]) => `<div class="d-node" style="left:${x}px;top:${y}px;--accent:var(${v})"><b>${n}</b>${esc(t)}</div>`)
    .join('')}</div>`;

  const bar = `<div class="d-vbar"><span class="d-chip">✕ Close <kbd>Esc</kbd></span><b>⚗ #211 Offline drafts: list or cards</b>
    <span class="d-chip">Directions ▾</span><span class="d-seg"><span>Board</span><span>A</span><span class="is-on">B</span><span>C</span></span>
    <span class="d-chip">‹</span><span class="d-chip">›</span><span>B · List</span><span class="d-spacer"></span><span class="d-chip">↗</span>
    <span class="d-seg"><span class="${family === 'full' || family === 'route' ? 'is-on' : ''}">Full</span><span class="${family === 'pane' ? 'is-on' : ''}">Pane</span><span class="${family === 'float' ? 'is-on' : ''}">Float</span></span></div>`;
  const frames = ['A · Cards', 'B · List', 'C · Split']
    .map((label) => `<div class="d-frame"><div class="head">${label}</div><div class="shot">${label.split(' · ')[1]} layout</div></div>`)
    .join('');
  const viewer = `<section class="d-viewer is-${family}">${bar}<div class="d-board">${frames}</div></section>`;

  const main = family === 'pane' ? map : board;
  const scrim = family === 'full' ? '<div class="d-scrim"></div>' : '';
  const rail = family === 'full' ? '' : '<nav class="d-rail"><span></span><span></span><span></span></nav>';
  const appTop = family === 'route' ? '' : top;

  document.getElementById('win').innerHTML = `${chrome}${appTop}<div class="d-body">${rail}<main class="d-main">${main}</main>${scrim}${viewer}</div>`;
  document.title = `#207 · ${opt}`;
})();
