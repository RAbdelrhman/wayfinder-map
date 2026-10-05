/*
  PROTOTYPE (#207): the in-app canvas viewer shell. Load after ../kit/kit.js, then call
  VIEWER.start('A' | 'B' | 'C' | 'AC' | 'ACF').

    A  Overlay: the canvas grows out of the tile and covers the whole window. The app stays
       mounted, inert, underneath.
    B  Route: the canvas is a page inside the app. The rail stays; the top bar becomes the
       viewer's toolbar. The map view is unmounted and restored from saved state.
    C  Pane: the canvas opens in a wide pane beside the map or board. Expand makes it fill
       the app, the same way B does.
    AC Round 2, A + C: opens as A's overlay by default; Shrink turns it into C's pane, and
       Fill the window turns it back. A setting picks which size a canvas opens at.
    ACF Round 3, AC + a floating window: a size switch (Full window, Side pane, Floating)
       replaces Shrink. The floating window moves by its toolbar and resizes from its corner,
       and has no Open-on-GitHub button.
       VIEWER.start('ACF', { grips: 'all' }) is round 4: it resizes from all four corners, with
       handles that only show on hover.

  The app chrome and both entry points (the Prototypes board and the ticket panel's tile)
  copy the markup and classes of src/ui on main, so ../../../src/ui/styles.css styles them.
  The window frame (?frame=desktop | browser) is drawn around the app. The browser frame
  has a working Back and Forward over a fake history. The canvas itself is
  sample-canvas.html in a sandboxed iframe, speaking the #206 bridge.

  Query: ?frame=desktop|browser  ?view=prototypes|map  ?cold=1  ?bridge=0  ?open=211[/B]
         ?size=full|pane|float (AC and ACF: the setting's value; float is ACF only)
*/
(() => {
  Object.assign(Kit.icons, {
    lens: '<circle cx="11" cy="11" r="6.4"/><path d="m20 20-4.4-4.4"/>',
    beaker: '<path d="M9.5 3h5"/><path d="M10.8 3v6.4L5.5 17.9A2 2 0 0 0 7.2 21h9.6a2 2 0 0 0 1.7-3.1L13.2 9.4V3"/><path d="M7.8 15h8.4"/>',
    grill: '<path d="M3.5 8.5h17"/><path d="M5 8.5a7 7 0 0 0 14 0"/><path d="m8.4 14.5-2.4 6.3"/><path d="m15.6 14.5 2.4 6.3"/>',
    list: '<path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/><path d="M8.5 6H20"/><path d="M8.5 12H20"/><path d="M8.5 18H20"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    lock: '<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    person: '<path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="7" r="4"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    back: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
    play: '<path d="M7 4v16l13-8z" fill="currentColor"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.9-3.5L3 10"/><path d="M3 4v6h6"/><path d="M4 13a8 8 0 0 0 14.9 3.5L21 14"/><path d="M21 20v-6h-6"/>',
    graph: '<rect x="3" y="4" width="7" height="6" rx="1.5"/><rect x="14" y="14" width="7" height="6" rx="1.5"/><path d="M10 7h1.5a2.5 2.5 0 0 1 2.5 2.5V14"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    chevronL: '<path d="m15 18-6-6 6-6"/>',
    chevronR: '<path d="m9 18 6-6-6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    home: '<path d="m3 10.5 9-7 9 7"/><path d="M5.5 9.2V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    expand: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
    shrink: '<path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/>',
    board: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    pages: '<path d="M7 3h8l4 4v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5"/>',
    sizePane: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M13 4v16"/>',
    sizeFloat: '<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="11.5" y="11.5" width="6.5" height="5.5" rx="1"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  });

  const esc = Kit.esc;
  const icon = Kit.icon;
  const params = new URLSearchParams(location.search);
  const theme = document.documentElement.dataset.theme ?? '';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- the fake map ---------- */

  const REPO = 'RAbdelrhman/wayfinder-map';
  const HOST = 'localhost:4478';
  const MAP = { number: 300, title: 'Offline drafts: write a map without GitHub' };
  const TICKETS = [
    { n: 201, type: 'research', title: 'What can the browser store offline, and for how long?', state: 'done', who: 'RAbdelrhman', by: [], col: 0, row: 0 },
    { n: 202, type: 'grilling', title: 'Where does a draft live until it syncs?', state: 'done', who: 'RAbdelrhman', by: [], col: 0, row: 1 },
    { n: 206, type: 'prototype', title: 'How should the draft badge look?', state: 'done', who: 'RAbdelrhman', by: [201], col: 1, row: 0 },
    { n: 211, type: 'prototype', title: 'How should a sync conflict look?', state: 'claimed', who: 'RAbdelrhman', by: [202], col: 1, row: 1 },
    { n: 213, type: 'task', title: 'Queue edits made while offline', state: 'frontier', who: null, by: [202], col: 1, row: 2 },
    { n: 210, type: 'task', title: 'Mark unsynced cards with a draft badge', state: 'claimed', who: 'RAbdelrhman', by: [206], col: 2, row: 0 },
    { n: 218, type: 'grilling', title: 'Pick the sync conflict screen', state: 'blocked', who: null, by: [211], col: 2, row: 1 },
    { n: 205, type: 'task', title: 'Replay queued edits as GitHub issues', state: 'blocked', who: null, by: [213], col: 2, row: 2 },
    { n: 219, type: 'task', title: 'Build the conflict screen', state: 'blocked', who: null, by: [218], col: 3, row: 1 },
    { n: 217, type: 'task', title: 'Add the draft badge to the map key', state: 'blocked', who: null, by: [210], col: 3, row: 0 },
  ];
  const byNumber = new Map(TICKETS.map((t) => [t.n, t]));
  const unlocks = (n) => TICKETS.filter((t) => t.by.includes(n)).map((t) => t.n);

  // Two prototypes: a canvas waiting on a pick, and an old snapshot that was decided.
  const PROTOS = {
    211: {
      n: 211, kind: 'canvas', state: 'waiting', pick: 218, date: 'Oct 2', branch: 'prototype/211-how-should-a-sync-conflict-look',
      gist: 'Three ways to show a sync conflict: an inline banner, side by side, or a step-through.',
      variants: [{ id: 'A', title: 'Inline banner' }, { id: 'B', title: 'Side by side' }, { id: 'C', title: 'Step through' }],
    },
    206: {
      n: 206, kind: 'snapshot', state: 'decided', picked: 'B', date: 'Sep 24', branch: 'prototype/206-how-should-the-draft-badge-look',
      gist: 'A dashed Draft badge on the card, before the title.',
      variants: [{ id: 'A', title: 'Dot' }, { id: 'B', title: 'Dashed badge' }],
    },
  };

  const TYPE_ICON = { research: 'lens', prototype: 'beaker', grilling: 'grill', task: 'list' };
  const STATE = {
    frontier: { label: 'next', long: 'Next up', variable: '--state-frontier', icon: 'arrow' },
    claimed: { label: 'claimed', long: 'Claimed', variable: '--state-claimed', icon: 'person' },
    blocked: { label: 'blocked', long: 'Blocked', variable: '--state-blocked', icon: 'lock' },
    done: { label: 'done', long: 'Done', variable: '--state-done', icon: 'check' },
  };
  const typeGlyph = (t) => `<span class="glyph" title="${t.type}">${icon(TYPE_ICON[t.type])}</span>`;
  const stateChip = (state) => `<span class="chip" style="--accent: var(${STATE[state].variable})">${icon(STATE[state].icon)}${STATE[state].label}</span>`;
  const ticketPill = (n) => {
    const t = byNumber.get(n);
    return `<button type="button" class="pill" style="--accent: var(${STATE[t.state].variable})" data-select="${n}" title="${esc(t.title)}"><span class="pill-text">#${n}</span></button>`;
  };
  const canvasSrc = (n, { thumb = false, hash = '' } = {}) => {
    const q = new URLSearchParams({ proto: String(n) });
    if (theme) q.set('theme', theme);
    if (thumb) q.set('thumb', '1');
    else {
      if (S.cold) q.set('delay', '1200');
      if (!S.bridge) q.set('bridge', '0');
    }
    return `sample-canvas.html?${q}${hash ? `#${hash}` : ''}`;
  };

  /* ---------- state ---------- */

  const opening = (params.get('open') ?? '').split('/');
  const S = {
    dir: 'A',
    frame: params.get('frame') === 'browser' ? 'browser' : 'desktop',
    view: params.get('view') === 'map' ? 'map' : 'prototypes',
    selected: 211,
    cold: params.get('cold') === '1',
    bridge: params.get('bridge') !== '0',
    open: null, // { n, origin } while the viewer shows
    expanded: false, // C: the pane fills the app
    defaultSize: ['pane', 'float'].includes(params.get('size')) ? params.get('size') : 'full', // AC, ACF: the setting
    size: 'full', // AC, ACF: the open viewer's size, starts at the setting
    floatRect: null, // ACF: where the floating window was left, kept between opens
    grips: 'se', // ACF: resize from the bottom-right corner ('se') or every corner ('all')
    canvas: null, // what the bridge last said: { source, pages, options, page, option, presenting } or { source: 'none' }
    mounted: null, // the prototype whose iframe is kept mounted
    menu: false,
    scroll: { map: [0, 0], prototypes: [0, 0] },
    returnFocus: null,
  };

  // AC and ACF switch between A's overlay, C's pane and (ACF) a floating window; every
  // other direction is one mode.
  const MODE_OF_SIZE = { full: 'A', pane: 'C', float: 'F' };
  const sized = () => S.dir === 'AC' || S.dir === 'ACF';
  const mode = () => (sized() ? MODE_OF_SIZE[S.size] : S.dir);

  /* ---------- a fake history, so Back and the address bar can be shown ---------- */

  const H = { stack: [], i: -1 };
  const mapUrl = (view) => `/repos/${REPO}/maps/${MAP.number}${view === 'map' ? `?ticket=${S.selected}` : '?view=prototypes'}`;
  function canvasUrl(n, hash) {
    const tail = hash ? `#${hash}` : '';
    if (S.dir === 'B') return `/repos/${REPO}/maps/${MAP.number}/canvas/${n}${tail}`;
    return `${mapUrl(S.view)}&canvas=${n}${tail}`;
  }
  function entry() {
    return H.stack[H.i];
  }
  function push(e) {
    H.stack = H.stack.slice(0, H.i + 1);
    H.stack.push(e);
    H.i += 1;
    paintAddress();
  }
  function replace(e) {
    H.stack[H.i] = e;
    paintAddress();
  }
  function travel(delta) {
    const next = H.stack[H.i + delta];
    if (!next) return;
    H.i += delta;
    const target = next;
    if (target.canvas === null && S.open) closeViewer();
    else if (target.canvas !== null && !S.open) openViewer(target.canvas, target.option ?? null, null);
    else if (target.canvas === null && target.view !== S.view) setView(target.view, false);
    paintAddress();
  }

  /* ---------- window frame ---------- */

  function frameHtml() {
    if (S.frame === 'desktop') {
      return `<div class="vw-chrome is-desktop" role="presentation"><img src="../../../assets/wayfinder-icon.svg" alt="" width="16" height="16"><span class="vw-chrome-title">Wayfinder</span><span class="vw-chrome-sp"></span>
        <span class="vw-winbtn" aria-hidden="true">${icon('minus')}</span><span class="vw-winbtn" aria-hidden="true"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="5" width="14" height="14" rx="1"/></svg></span><span class="vw-winbtn is-close" aria-hidden="true">${icon('x')}</span></div>`;
    }
    return `<div class="vw-chrome is-browser" role="group" aria-label="Browser (prototype)">
      <div class="vw-tabs"><span class="vw-tab"><img src="../../../assets/wayfinder-icon.svg" alt="" width="14" height="14">Wayfinder · ${esc(MAP.title)}</span></div>
      <div class="vw-urlbar"><button type="button" class="vw-nav" data-hist="-1" aria-label="Browser back">${icon('back')}</button><button type="button" class="vw-nav" data-hist="1" aria-label="Browser forward"><span class="vw-flip">${icon('back')}</span></button><span class="vw-nav" aria-hidden="true">${icon('refresh')}</span>
      <span class="vw-url" id="vw-url"></span></div></div>`;
  }

  function paintAddress() {
    const el = document.getElementById('vw-url');
    const e = entry();
    if (el && e) el.innerHTML = `<span class="vw-url-host">${HOST}</span>${esc(e.url)}`;
    for (const button of document.querySelectorAll('[data-hist]')) button.disabled = !H.stack[H.i + Number(button.dataset.hist)];
  }

  /* ---------- app chrome, as on main ---------- */

  function rail() {
    return `<aside class="sidebar-shell"><nav class="navigation" aria-label="Primary"><div class="nav-compact-content mini">
      <div class="mini-head"><button type="button" class="fold mini-logo" aria-label="Open the sidebar"><img class="app-logo" src="../../../assets/wayfinder-icon.svg" alt="" width="30" height="30"></button></div>
      <a class="new" href="#" data-to="Start a new map" aria-label="Start a new map">${icon('plus')}</a>
      <button type="button" class="rail-btn" aria-label="Jump to" data-to="Jump to">${icon('lens')}</button>
      <a class="rail-btn" href="#" data-to="Home" aria-label="Home">${icon('home')}</a>
      <span class="mini-sep" role="separator"></span>
    </div>
    <div class="nav-footer">
      <span class="rail-mark nav-account" role="img" aria-label="GitHub account: RAbdelrhman"><span class="avatar-initial">R</span></span>
      <button type="button" class="rail-btn" aria-label="Model defaults">${icon('sliders')}</button>
      <button type="button" class="rail-btn" aria-label="Theme">${icon('moon')}</button>
    </div></nav></aside>`;
  }

  function crumbs() {
    return `<nav class="nav-map-scopes" aria-label="Map location">
      <div class="nav-scope-control"><button type="button" class="scope is-quiet"><span class="repo-mono" aria-hidden="true">WM</span><span class="t">wayfinder-map</span>${icon('chevron')}</button></div>
      <span class="crumb-sep" aria-hidden="true">/</span>
      <div class="nav-scope-control"><button type="button" class="scope"><span class="t">#${MAP.number} ${esc(MAP.title)}</span>${icon('chevron')}</button></div>
    </nav>`;
  }

  function topbar() {
    const tab = (id, label, ic) =>
      `<a class="seg${S.view === id ? ' is-on' : ''}" href="#" data-view="${id}"${S.view === id ? ' aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></a>`;
    return `<header class="topbar map-topbar">
      <div class="nav-topbar"><div class="nav-map-strip">${crumbs()}<nav class="segmented nav-map-tabs" aria-label="Map views">${tab('map', 'Map', 'graph')}<a class="seg" href="#" data-to="Table">${icon('table')}<span>Table</span></a>${tab('prototypes', 'Prototypes', 'beaker')}</nav></div></div>
      <span class="topbar-spacer"></span>
      <button type="button" class="synced" aria-label="Resync from GitHub">${icon('refresh')}<span class="synced-label">Synced just now</span></button>
      <button type="button" class="primary map-start" data-select="213">${icon('play')}<span class="topbar-action-label">Next: #213</span></button>
    </header>`;
  }

  /* ---------- Prototypes view: the board, as prototypeBoard.ts draws it ---------- */

  function variantFrame(p, v) {
    const src = p.kind === 'canvas' ? canvasSrc(p.n, { thumb: true, hash: `directions/${v.id}` }) : canvasSrc(p.n, { thumb: true });
    return `<span class="wf-frame proto-thumb" data-origin="${p.n}-${v.id}"><iframe class="decision-variant-page" src="${esc(src)}" sandbox="allow-scripts" tabindex="-1" aria-hidden="true" title="" width="1280" height="800"></iframe><span class="tag">${v.id}</span></span>`;
  }

  function protoCard(p) {
    const t = byNumber.get(p.n);
    const status = p.state === 'waiting'
      ? `<span class="chip" style="--accent: var(--state-claimed)">${icon('hand')}Waiting on your pick</span>`
      : `<span class="chip" style="--accent: var(--state-done)">${icon('check')}Picked ${p.picked}</span>`;
    const strip = p.variants
      .map((v) => {
        const picked = p.picked === v.id;
        const cls = picked ? ' is-picked' : p.picked ? ' is-dim' : '';
        return `<button type="button" class="wf-var decision-variant vw-var${cls}" role="listitem" data-open="${p.n}" data-option="${v.id}" aria-label="Open variant ${v.id}: ${esc(v.title)}${picked ? ' (picked)' : ''}">${variantFrame(p, v)}<span class="lbl">${picked ? icon('check') : ''}${esc(`${v.id} · ${v.title}`)}</span></button>`;
      })
      .join('');
    const pick = p.pick ? `<button type="button" class="ghost" data-select="${p.pick}">Pick in #${p.pick}</button>` : '';
    return `<section class="wf-node wf-proto is-${p.state}" style="--accent: var(${p.state === 'waiting' ? '--state-claimed' : '--state-done'})" data-origin="${p.n}">
      <div class="h">${status}<button type="button" class="wf-proto-title" data-select="${p.n}">#${p.n} ${esc(t.title)}</button><time class="when">${p.date}</time>
        <span class="acts">${pick}<button type="button" class="${p.state === 'waiting' ? 'primary' : 'ghost'}" data-open="${p.n}" aria-label="Open the #${p.n} prototype canvas">${icon('play')}Canvas</button></span></div>
      <p class="gist">${esc(p.gist)}</p>
      <div class="wf-strip" role="list" aria-label="Variants for #${p.n}">${strip}</div>
    </section>`;
  }

  function boardView() {
    return `<div class="vw-scroll" data-scroll="prototypes"><div class="wf-board-page"><div class="wf-board">${protoCard(PROTOS[211])}${protoCard(PROTOS[206])}</div></div></div>`;
  }

  /* ---------- Map view: canvas and ticket panel ---------- */

  const W = 248;
  const HH = 104;
  const X = (t) => 32 + t.col * (W + 56);
  const Y = (t) => 32 + t.row * (HH + 18);

  function mapView() {
    const width = X({ col: 3 }) + W + 360;
    const height = Y({ row: 2 }) + HH + 420;
    const paths = TICKETS.flatMap((t) =>
      t.by.map((from) => {
        const f = byNumber.get(from);
        const x1 = X(f) + W;
        const y1 = Y(f) + HH / 2;
        const x2 = X(t);
        const y2 = Y(t) + HH / 2;
        const bend = Math.max(28, (x2 - x1) / 2);
        return `<path class="${f.state === 'done' ? '' : 'is-live'}" d="M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}"/>`;
      }),
    );
    const nodes = TICKETS.map((t) => {
      const meta = t.state === 'blocked' ? `blocked by ${t.by.map((n) => `#${n}`).join(', ')}` : t.who ? `@${t.who}` : t.type;
      return `<button type="button" class="node${t.state === 'done' ? ' is-done' : ''}${S.selected === t.n ? ' is-selected' : ''}" data-select="${t.n}" style="--accent: var(${STATE[t.state].variable}); left:${X(t)}px; top:${Y(t)}px; width:${W}px; height:${HH}px" aria-label="${esc(`#${t.n} ${t.title}, ${STATE[t.state].label}`)}">
        <span class="node-top">${typeGlyph(t)}<span class="num">#${t.n}</span>${stateChip(t.state)}</span><span class="title">${esc(t.title)}</span><span class="meta">${esc(meta)}</span></button>`;
    }).join('');
    return `<div class="body"><section class="stage" aria-label="Tickets">
      <div class="canvas-wrap vw-wrap" data-scroll="map"><div class="canvas-stage vw-mapstage"><div class="canvas" style="width:${width}px;height:${height}px">
        <svg class="edges" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">${paths.join('')}</svg>
        <div class="nodes">${nodes}</div></div></div></div>
      <div class="keybox"><button type="button" class="floatbox keybtn">${icon('info')}Key</button></div>
      <div class="zoom floatbox" role="group" aria-label="Zoom"><button type="button" class="iconbtn" aria-label="Zoom out">${icon('minus')}</button><button type="button" class="iconbtn pct">100%</button><button type="button" class="iconbtn" aria-label="Zoom in">${icon('plus')}</button></div>
    </section>${inspector()}</div>`;
  }

  function protoTile(p) {
    const t = byNumber.get(p.n);
    const src = canvasSrc(p.n, { thumb: true });
    return `<section class="ticket-proto"><article class="proto-tile">
      <button type="button" class="proto-thumb vw-thumb" data-open="${p.n}" data-origin="${p.n}-tile" aria-label="Open the ${esc(t.title)} canvas">
        <iframe src="${esc(src)}" sandbox="allow-scripts" tabindex="-1" aria-hidden="true" title="" width="1280" height="800"></iframe>
        <span class="proto-open">Open</span></button>
      <div class="proto-tile-body"><p class="eyebrow">Prototype</p><h2><button type="button" class="vw-linkish" data-open="${p.n}">${esc(t.title)}</button></h2>
        <p class="proto-gist">${esc(p.state === 'waiting' ? 'Still being worked on.' : p.gist)}</p>
        <div class="proto-tile-foot"><span>${p.date}, 2026</span></div></div>
    </article></section>`;
  }

  function inspector() {
    const t = byNumber.get(S.selected);
    const banner = t.state === 'claimed' ? `<div class="banner" style="--accent: var(--state-claimed)">${icon('person')}<span><b>@${t.who}</b> is on it.</span></div>` : '';
    return `<aside class="inspector" aria-label="Brief and ticket"><div class="insp-tabs"><div class="segmented" role="tablist" aria-label="Panel">
      <button type="button" role="tab" aria-selected="false" tabindex="-1" class="seg">Brief</button><button type="button" role="tab" aria-selected="true" class="seg is-on">Ticket #${t.n}</button></div></div>
      <div class="insp-panel" role="tabpanel"><div class="dhead">${typeGlyph(t)}<span class="num">#${t.n}</span>${stateChip(t.state)}<a class="iconbtn" href="#" data-to="#${t.n} on GitHub" aria-label="Open on GitHub">${icon('external')}</a></div>
      <h2 class="dtitle">${esc(t.title)}</h2>${banner}
      <dl class="facts"><dt>Type</dt><dd>${icon(TYPE_ICON[t.type])}${t.type}</dd><dt>Assignee</dt><dd>${t.who ? `@${t.who}` : '<span class="none">unclaimed</span>'}</dd>
        <dt>Needs</dt><dd>${t.by.length ? t.by.map(ticketPill).join('') : '<span class="none">—</span>'}</dd><dt>Unlocks</dt><dd>${unlocks(t.n).length ? unlocks(t.n).map(ticketPill).join('') : '<span class="none">—</span>'}</dd></dl>
      ${PROTOS[t.n] ? protoTile(PROTOS[t.n]) : ''}
      <div class="body-text prose"><p>Fake ticket for the #207 prototype. Select #211 or #206 to see a prototype tile.</p></div></div></aside>`;
  }

  /* ---------- the viewer ---------- */

  function posterHtml(n, option) {
    if (PROTOS[n].kind === 'snapshot') return '<div class="vw-poster is-snapshot"><span></span><span></span><span></span></div>';
    if (option) return `<div class="vw-poster is-present"><span class="vw-poster-art"></span></div>`;
    return '<div class="vw-poster"><span class="vw-poster-bar"></span><span class="vw-poster-art"></span><span class="vw-poster-art"></span><span class="vw-poster-art"></span></div>';
  }

  function pagesMenu(c) {
    if (!c.pages?.length) return '';
    const current = c.pages.find((p) => p.id === c.page) ?? c.pages[0];
    return `<div class="vw-menu-anchor"><button type="button" class="ghost vw-pages" data-act="menu" aria-haspopup="menu" aria-expanded="${S.menu}" aria-label="Canvas page: ${esc(current.title)}">${icon('pages')}<span class="vw-lbl">${esc(current.title)}</span>${icon('chevron')}</button>
      <div class="vw-menu" role="menu" aria-label="Canvas pages"${S.menu ? '' : ' hidden'}>${c.pages
        .map((p) => `<button type="button" role="menuitemradio" aria-checked="${p.id === current.id}" data-page="${p.id}">${p.id === current.id ? icon('check') : '<span class="i"></span>'}${esc(p.title)}<span class="vw-count">${p.options.length}</span></button>`)
        .join('')}</div></div>`;
  }

  function optionsGroup(c) {
    const page = c.pages?.find((p) => p.id === c.page);
    if (!page) return '';
    const seg = (id, label, title) => {
      const on = (c.option ?? '') === id;
      return `<button type="button" class="seg${on ? ' is-on' : ''}" aria-pressed="${on}" data-go="${id}" title="${esc(title)}"${id ? '' : ' aria-label="Board"'}>${label}</button>`;
    };
    const step = c.option
      ? `<button type="button" class="iconbtn vw-step" data-step="-1" aria-label="Previous option">${icon('chevronL')}</button><button type="button" class="iconbtn vw-step" data-step="1" aria-label="Next option">${icon('chevronR')}</button>`
      : '';
    return `<div class="segmented vw-options" role="group" aria-label="Show the board, or open one option full size">${seg('', `${icon('board')}<span class="vw-lbl">Board</span>`, 'All options side by side')}${page.options
      .map((o) => seg(o.id, esc(o.id), `Open ${o.id} · ${o.name} full size`))
      .join('')}</div>${step}${c.option ? `<span class="vw-optname">${esc(page.options.find((o) => o.id === c.option)?.name ?? '')}</span>` : ''}`;
  }

  function sourceNote(c) {
    if (!c || c.source === 'loading') return `<span class="vw-status" role="status">${icon('refresh')}Loading the canvas…</span>`;
    if (c.source === 'none') return `<span class="chip vw-viewonly" style="--accent: var(--state-done)" title="This canvas did not answer Wayfinder, so its pages and options can't be switched from here. It still works inside the frame.">${icon('eye')}View only</span>`;
    if (c.source === 'page') return `<span class="chip" style="--accent: var(--state-done)" title="A snapshot is one page with no options to switch.">${icon('pages')}Snapshot</span>`;
    return '';
  }

  function closeLabel() {
    return S.open?.from === 'map' ? 'Map' : 'Prototypes';
  }

  function toolbarHtml() {
    const p = PROTOS[S.open.n];
    const t = byNumber.get(p.n);
    const c = S.canvas;
    const live = c && (c.source === 'engine' || c.source === 'dom');
    const controls = live ? `${pagesMenu(c)}${optionsGroup(c)}` : sourceNote(c);
    const title = `<span class="vw-title" id="vw-title">${icon('beaker')}<span class="num">#${p.n}</span><span class="vw-title-t">${esc(t.title)}</span></span>`;
    const github = `<a class="iconbtn" href="#" data-to="${esc(p.branch)} on GitHub" aria-label="Open the branch on GitHub">${icon('external')}</a>`;
    if (mode() === 'F') {
      // Floating: compact, no Open on GitHub. Drag the first row to move it.
      return `<div class="vw-bar is-c is-f"><div class="vw-c-row vw-drag" title="Drag to move">${title}<span class="topbar-spacer"></span>${sizeGroup()}<button type="button" class="iconbtn vw-close" data-act="close" aria-label="Close the canvas">${icon('x')}</button></div>
        ${controls ? `<div class="vw-c-row">${controls}</div>` : ''}</div>`;
    }
    if (mode() === 'A') {
      if (S.dir === 'ACF') {
        return `<div class="vw-bar is-a"><button type="button" class="ghost vw-close" data-act="close" aria-label="Close the canvas and go back to ${closeLabel()}">${icon('x')}<span class="vw-lbl">Close</span><kbd>Esc</kbd></button>${title}<span class="vw-sep"></span>${controls}<span class="topbar-spacer"></span>${github}${sizeGroup()}</div>`;
      }
      const shrink = S.dir === 'AC' ? `<button type="button" class="iconbtn" data-act="expand" aria-label="Shrink to a side pane" title="Shrink to a side pane">${icon('shrink')}</button>` : '';
      return `<div class="vw-bar is-a"><button type="button" class="ghost vw-close" data-act="close" aria-label="Close the canvas and go back to ${closeLabel()}">${icon('x')}<span class="vw-lbl">Close</span><kbd>Esc</kbd></button>${title}<span class="vw-sep"></span>${controls}<span class="topbar-spacer"></span>${github}${shrink}</div>`;
    }
    if (S.dir === 'B' || S.expanded) {
      const shrink = S.dir === 'C' ? `<button type="button" class="iconbtn" data-act="expand" aria-label="Back to the side pane" title="Back to the side pane">${icon('shrink')}</button>` : '';
      return `<header class="topbar vw-bar is-b"><button type="button" class="ghost vw-back" data-act="close" aria-label="Back to ${closeLabel()}">${icon('back')}<span class="vw-lbl">${closeLabel()}</span></button>
        <nav class="nav-map-scopes vw-crumbs" aria-label="Where you are"><span class="t">#${MAP.number} ${esc(MAP.title)}</span><span class="crumb-sep" aria-hidden="true">/</span></nav>${title}<span class="vw-sep"></span>${controls}<span class="topbar-spacer"></span>${github}${shrink}${S.dir === 'C' ? `<button type="button" class="iconbtn" data-act="close" aria-label="Close the canvas">${icon('x')}</button>` : ''}</header>`;
    }
    const grow = S.dir === 'AC' ? 'Fill the window' : 'Fill the app';
    if (S.dir === 'ACF') {
      return `<div class="vw-bar is-c"><div class="vw-c-row">${title}<span class="topbar-spacer"></span>${github}${sizeGroup()}<button type="button" class="iconbtn vw-close" data-act="close" aria-label="Close the canvas">${icon('x')}</button></div>
        ${controls ? `<div class="vw-c-row">${controls}</div>` : ''}</div>`;
    }
    return `<div class="vw-bar is-c"><div class="vw-c-row">${title}<span class="topbar-spacer"></span>${github}<button type="button" class="iconbtn" data-act="expand" aria-label="${grow}" title="${grow}">${icon('expand')}</button><button type="button" class="iconbtn vw-close" data-act="close" aria-label="Close the canvas">${icon('x')}</button></div>
      ${controls ? `<div class="vw-c-row">${controls}</div>` : ''}</div>`;
  }

  // ACF: one switch for the three sizes, in every size's toolbar.
  function sizeGroup() {
    const b = (size, ic, label) =>
      `<button type="button" class="seg${S.size === size ? ' is-on' : ''}" data-size="${size}" aria-pressed="${S.size === size}" aria-label="${label}" title="${label}">${icon(ic)}</button>`;
    return `<div class="segmented vw-sizes" role="group" aria-label="Canvas size">${b('full', 'expand', 'Full window')}${b('pane', 'sizePane', 'Side pane')}${b('float', 'sizeFloat', 'Floating window')}</div>`;
  }

  function paintToolbar() {
    const bar = document.getElementById('vw-toolbar');
    if (!bar || !S.open) return;
    const focused = document.activeElement && bar.contains(document.activeElement) ? keyOf(document.activeElement) : null;
    bar.innerHTML = toolbarHtml();
    if (focused) bar.querySelector(focused)?.focus();
  }

  function keyOf(el) {
    for (const key of ['act', 'size', 'go', 'page', 'step']) if (el.dataset[key] !== undefined) return `[data-${key}="${el.dataset[key]}"]`;
    return null;
  }

  const frameEl = () => document.getElementById('vw-frame');
  const send = (msg) => frameEl()?.contentWindow?.postMessage({ wf: 1, ...msg }, '*');
  let readyTimer = null;

  function mountFrame(n, option) {
    const holder = document.getElementById('vw-stage');
    const hash = PROTOS[n].kind === 'canvas' ? `directions${option ? `/${option}` : ''}` : '';
    if (S.mounted === n && S.canvas && S.canvas.source !== 'none') {
      // Kept mounted: reopening costs nothing, and `go` restores the option without a reload.
      if (PROTOS[n].kind === 'canvas') send({ type: 'go', page: S.canvas.page ?? 'directions', option: option ?? S.canvas.option ?? null });
      return;
    }
    S.mounted = n;
    S.canvas = { source: 'loading' };
    holder.innerHTML = `${posterHtml(n, option)}<iframe id="vw-frame" class="vw-frame" src="${esc(canvasSrc(n, { hash }))}" sandbox="allow-scripts" title="Canvas: #${n} ${esc(byNumber.get(n).title)}"></iframe>`;
    clearTimeout(readyTimer);
    // No wrapper reply: treat the canvas as view-only, show it anyway.
    readyTimer = setTimeout(() => {
      if (S.canvas?.source === 'loading') {
        S.canvas = { source: 'none' };
        frameEl()?.classList.add('is-ready');
        paintToolbar();
      }
    }, S.cold ? 2000 : 900);
  }

  window.addEventListener('message', (event) => {
    const frame = frameEl();
    // The origin is always "null" for a sandboxed frame, so trust only our own frame's window.
    if (!frame || event.source !== frame.contentWindow) return;
    const msg = event.data;
    if (!msg || msg.wf !== 1) return;
    if (msg.type === 'ready') {
      S.canvas = { source: msg.source, pages: msg.pages, options: msg.options, page: null, option: null, presenting: false };
      frame.classList.add('is-ready');
    } else if (msg.type === 'state' && S.canvas && S.canvas.source !== 'none') {
      Object.assign(S.canvas, { page: msg.page, option: msg.option, presenting: msg.presenting });
      if (S.open && entry()?.canvas) replace({ ...entry(), option: msg.option, url: canvasUrl(S.open.n, msg.page ? `${msg.page}${msg.option ? `/${msg.option}` : ''}` : '') });
    } else if (msg.type === 'key' && msg.key === 'Escape' && S.open) {
      requestClose();
    }
    paintToolbar();
  });

  /* ---------- geometry and motion ---------- */

  const bodyEl = () => document.getElementById('vw-body');
  function rectIn(el) {
    const b = bodyEl().getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { left: r.left - b.left, top: r.top - b.top, width: r.width, height: r.height };
  }
  function visibleOrigin() {
    const el = S.open?.origin ? document.querySelector(`[data-origin="${S.open.origin}"]`) : null;
    if (!el) return null;
    const r = rectIn(el);
    const b = bodyEl().getBoundingClientRect();
    return r.width > 0 && r.top < b.height && r.top + r.height > 0 ? r : null;
  }

  // One poster-filled ghost travels between the tile and the viewer, so nothing stretches and
  // nothing flashes blank: the tile's picture becomes the canvas's poster.
  function ghost(from, to, n, option, reverse) {
    return new Promise((done) => {
      const viewer = document.getElementById('vw');
      if (!from || reduceMotion) {
        viewer.animate([{ opacity: reverse ? 1 : 0 }, { opacity: reverse ? 0 : 1 }], { duration: reduceMotion ? 120 : 160, easing: 'ease-out' }).finished.then(done);
        return;
      }
      const g = document.createElement('div');
      g.className = 'vw-ghost';
      g.innerHTML = posterHtml(n, option);
      bodyEl().append(g);
      const box = (r, radius) => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: radius });
      const frames = [box(from, '8px'), box(to, S.dir === 'A' ? '0px' : '0px')];
      if (reverse) frames.reverse();
      if (!reverse) viewer.style.opacity = '0';
      const anim = g.animate(frames, { duration: reverse ? 220 : 280, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
      anim.finished.then(() => {
        if (!reverse) {
          viewer.style.opacity = '';
          viewer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 90 });
        }
        g.remove();
        done();
      });
    });
  }

  /* ---------- open and close ---------- */

  function viewerTarget() {
    return rectIn(document.getElementById('vw'));
  }

  function openViewer(n, option, originEl, { fromHistory = true } = {}) {
    if (S.open) return;
    // Reopened mid-close: drop the closing ghost and fades so they can't land on the new viewer.
    for (const g of document.querySelectorAll('.vw-ghost')) g.remove();
    for (const a of document.getElementById('vw-scrim').getAnimations()) a.cancel();
    saveScroll();
    const originKey = originEl?.closest('[data-origin]')?.dataset.origin ?? (originEl ? null : null);
    const from = originEl ? rectIn(originEl.closest('[data-origin]') ?? originEl) : null;
    S.returnFocus = originEl ? keySel(originEl) : null;
    S.open = { n, origin: originKey ?? (S.view === 'map' ? `${n}-tile` : `${n}`), from: S.view };
    S.menu = false;
    if (!fromHistory) push({ canvas: n, option, view: S.view, url: canvasUrl(n, PROTOS[n].kind === 'canvas' ? `directions${option ? `/${option}` : ''}` : '') });
    S.size = S.defaultSize;
    document.getElementById('vw').hidden = false;
    applyMode();
    mountFrame(n, option);
    paintToolbar();
    if (S.dir === 'B') document.getElementById('vw-main').hidden = true;
    const to = viewerTarget();
    if (mode() === 'A') document.getElementById('vw-scrim').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    ghost(from, to, n, option, false);
    document.querySelector('#vw-toolbar [data-act="close"]')?.focus({ preventScroll: true });
    if (mode() === 'C') restoreScroll();
  }

  // A is a modal dialog over an inert app; B and C are regions beside a live one.
  function applyMode() {
    const m = mode();
    const viewer = document.getElementById('vw');
    viewer.className = `vw is-${m.toLowerCase()}${S.expanded ? ' is-expanded' : ''}${S.grips === 'all' ? ' has-corner-grips' : ''}${float ? ' is-dragging' : ''}`;
    if (m === 'F') {
      S.floatRect ??= defaultFloatRect();
      Object.assign(viewer.style, Object.fromEntries(Object.entries(S.floatRect).map(([k, v]) => [k, `${v}px`])));
    } else Object.assign(viewer.style, { left: '', top: '', width: '', height: '' });
    viewer.setAttribute('role', m === 'A' ? 'dialog' : 'region');
    if (m === 'A') viewer.setAttribute('aria-modal', 'true');
    else viewer.removeAttribute('aria-modal');
    const app = document.querySelector('.vw-app');
    app.classList.toggle('has-pane', m === 'C' && !S.expanded);
    app.inert = m === 'A';
    document.getElementById('vw-scrim').hidden = m !== 'A';
  }

  // Bottom right of the window, clear of the edges and of the dashed Prototype bar (64 px).
  function defaultFloatRect() {
    const b = bodyEl().getBoundingClientRect();
    const width = Math.min(560, b.width - 32);
    const height = Math.min(380, b.height - 80);
    return { left: b.width - width - 16, top: b.height - height - 64, width, height };
  }

  function setSize(size) {
    if (size === S.size) return;
    const viewer = document.getElementById('vw');
    const before = rectIn(viewer);
    S.size = size;
    applyMode();
    paintToolbar();
    const after = rectIn(viewer);
    if (!reduceMotion) {
      viewer.animate(
        [{ transform: `translate(${before.left - after.left}px, ${before.top - after.top}px)`, width: `${before.width}px`, height: `${before.height}px` }, { transform: 'none', width: `${after.width}px`, height: `${after.height}px` }],
        { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' },
      );
    }
    document.querySelector(`#vw-toolbar [data-size="${size}"]`)?.focus();
  }

  function keySel(el) {
    const target = el.closest('[data-open]');
    if (!target) return null;
    return `[data-open="${target.dataset.open}"]${target.dataset.option ? `[data-option="${target.dataset.option}"]` : ':not([data-option])'}${target.classList.contains('vw-thumb') ? '.vw-thumb' : ''}`;
  }

  // Closing is a step back in history, so Esc, the close button and Back all do the same thing.
  function requestClose() {
    if (entry()?.canvas && H.stack[H.i - 1]?.canvas === null) travel(-1);
    else {
      replace({ canvas: null, view: S.view, url: mapUrl(S.view) });
      closeViewer();
    }
  }

  function closeViewer() {
    if (!S.open) return;
    const viewer = document.getElementById('vw');
    const n = S.open.n;
    const option = S.canvas?.option ?? null;
    if (S.dir === 'B' || S.expanded) {
      document.getElementById('vw-main').hidden = false;
      restoreScroll();
    }
    const to = viewerTarget();
    const back = visibleOrigin();
    const app = document.querySelector('.vw-app');
    app.inert = false;
    S.menu = false;
    ghost(back, to, n, option, true).then(() => {
      if (S.open) return; // reopened while closing
      viewer.hidden = true;
    });
    // The viewer stays mounted but hidden, so the next open of the same canvas is instant.
    viewer.classList.add('is-closing');
    setTimeout(() => viewer.classList.remove('is-closing'), 260);
    if (mode() === 'A') {
      const scrim = document.getElementById('vw-scrim');
      scrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200 }).finished.then(() => {
        if (!S.open) scrim.hidden = true; // reopened while fading: keep the new overlay's scrim
      });
    }
    app.classList.remove('has-pane');
    S.open = null;
    S.expanded = false;
    const focusTarget = S.returnFocus ? document.querySelector(S.returnFocus) : null;
    (focusTarget ?? document.querySelector('.nav-map-tabs .is-on'))?.focus({ preventScroll: true });
  }

  function toggleExpand() {
    const viewer = document.getElementById('vw');
    const before = rectIn(viewer);
    if (S.dir === 'AC') {
      // Overlay and pane: the map stays mounted in both, so there is nothing to save or restore.
      S.size = S.size === 'full' ? 'pane' : 'full';
      applyMode();
    } else {
      S.expanded = !S.expanded;
      viewer.classList.toggle('is-expanded', S.expanded);
      document.querySelector('.vw-app').classList.toggle('has-pane', !S.expanded);
      if (S.expanded) saveScroll();
      document.getElementById('vw-main').hidden = S.expanded;
      if (!S.expanded) restoreScroll();
    }
    paintToolbar();
    const after = rectIn(viewer);
    if (!reduceMotion) {
      viewer.animate(
        [{ transform: `translate(${before.left - after.left}px, ${before.top - after.top}px)`, width: `${before.width}px`, height: `${before.height}px` }, { transform: 'none', width: `${after.width}px`, height: `${after.height}px` }],
        { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' },
      );
    }
    document.querySelector('#vw-toolbar [data-act="expand"]')?.focus();
  }

  /* ---------- the app's own views ---------- */

  function saveScroll() {
    const el = document.querySelector('[data-scroll]');
    if (el) S.scroll[el.dataset.scroll] = [el.scrollLeft, el.scrollTop];
  }
  function restoreScroll() {
    const el = document.querySelector('[data-scroll]');
    if (el) [el.scrollLeft, el.scrollTop] = S.scroll[el.dataset.scroll];
  }

  function paintMain() {
    saveScroll();
    const main = document.getElementById('vw-main');
    main.innerHTML = `${topbar()}${S.view === 'map' ? mapView() : boardView()}`;
    restoreScroll();
    fitThumbs();
  }

  function fitThumbs() {
    for (const thumb of document.querySelectorAll('.proto-thumb')) {
      const fit = () => thumb.style.setProperty('--thumb-scale', String(thumb.clientWidth / 1280));
      fit();
      new ResizeObserver(fit).observe(thumb);
    }
  }

  function setView(view, record = true) {
    if (view === S.view) return;
    saveScroll();
    S.view = view;
    if (record) push({ canvas: null, view, url: mapUrl(view) });
    paintMain();
  }

  /* ---------- prototype controls ---------- */

  function protoBar() {
    const t = (key, on, label) => `<button type="button" data-proto="${key}" aria-pressed="${on}" class="${on ? 'is-on' : ''}">${label}</button>`;
    const size = sized()
      ? `<span class="nx-proto-sep"></span><span class="nx-proto-lbl">Setting: open as</span>${t('full', S.defaultSize === 'full', 'Full window')}${t('pane', S.defaultSize === 'pane', 'Side pane')}${S.dir === 'ACF' ? t('float', S.defaultSize === 'float', 'Floating') : ''}`
      : '';
    return `<div class="nx-proto vw-proto" role="group" aria-label="Prototype controls"><span class="nx-proto-tag">Prototype</span>
      <span class="nx-proto-lbl">Window</span>${t('desktop', S.frame === 'desktop', 'Desktop')}${t('browser', S.frame === 'browser', 'Browser')}
      <span class="nx-proto-sep"></span>${t('cold', S.cold, 'Cold open')}${t('nobridge', !S.bridge, 'No bridge')}${size}</div>`;
  }

  /* ---------- paint and wire ---------- */

  function paintAll() {
    document.getElementById('root').innerHTML = `<div class="vw-window is-${S.frame}">${frameHtml()}
      <div class="vw-body" id="vw-body">
        <div class="app is-nav-collapsed vw-app">${rail()}<div class="main" id="vw-main"></div></div>
        <div class="vw-scrim" id="vw-scrim" hidden></div>
        <section class="vw" id="vw" hidden role="${mode() === 'A' ? 'dialog' : 'region'}" ${mode() === 'A' ? 'aria-modal="true"' : ''} aria-labelledby="vw-title">
          <div id="vw-toolbar"></div><div class="vw-stage" id="vw-stage"></div>${(S.grips === 'all' ? ['nw', 'ne', 'sw', 'se'] : ['se']).map((c) => `<span class="vw-grip" data-corner="${c}" title="Drag to resize" aria-hidden="true"></span>`).join('')}</section>
      </div></div>${protoBar()}`;
    S.mounted = null;
    S.canvas = null;
    paintMain();
    paintAddress();
  }

  document.addEventListener('click', (event) => {
    const el = event.target.closest('[data-open], [data-select], [data-view], [data-act], [data-size], [data-go], [data-page], [data-step], [data-hist], [data-proto]');
    if (!el) {
      if (S.menu && !event.target.closest('.vw-menu-anchor')) {
        S.menu = false;
        paintToolbar();
      }
      return;
    }
    event.preventDefault();
    const d = el.dataset;
    if (d.open) openViewer(Number(d.open), d.option ?? null, el, { fromHistory: false });
    else if (d.select) {
      S.selected = Number(d.select);
      if (S.view !== 'map') setView('map');
      else {
        replace({ canvas: null, view: 'map', url: mapUrl('map') });
        paintMain();
      }
    } else if (d.view) setView(d.view);
    else if (d.act === 'close') requestClose();
    else if (d.act === 'expand') toggleExpand();
    else if (d.size) setSize(d.size);
    else if (d.act === 'menu') {
      S.menu = !S.menu;
      paintToolbar();
      if (S.menu) document.querySelector('.vw-menu [aria-checked="true"]')?.focus();
    } else if (d.go !== undefined) send({ type: 'go', page: S.canvas.page, option: d.go || null });
    else if (d.page) {
      S.menu = false;
      send({ type: 'go', page: d.page, option: null });
      paintToolbar();
      document.querySelector('[data-act="menu"]')?.focus();
    } else if (d.step) {
      const page = S.canvas.pages.find((p) => p.id === S.canvas.page);
      const i = page.options.findIndex((o) => o.id === S.canvas.option) + Number(d.step);
      send({ type: 'go', page: page.id, option: page.options[(i + page.options.length) % page.options.length].id });
    } else if (d.hist) travel(Number(d.hist));
    else if (d.proto) {
      if (d.proto === 'desktop' || d.proto === 'browser') S.frame = d.proto;
      if (d.proto === 'cold') S.cold = !S.cold;
      if (d.proto === 'nobridge') S.bridge = !S.bridge;
      if (d.proto === 'full' || d.proto === 'pane' || d.proto === 'float') S.defaultSize = d.proto;
      const wasOpen = S.open;
      S.open = null;
      S.expanded = false;
      paintAll();
      H.stack = [{ canvas: null, view: S.view, url: mapUrl(S.view) }];
      H.i = 0;
      paintAddress();
      if (wasOpen) openViewer(wasOpen.n, null, null, { fromHistory: false });
      document.querySelector(`[data-proto="${d.proto}"]`)?.focus();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      // Alt+← / Alt+→: the browser's and the desktop window's Back and Forward.
      event.preventDefault();
      travel(event.key === 'ArrowLeft' ? -1 : 1);
      return;
    }
    if (!S.open) return;
    if (S.menu) {
      const items = [...document.querySelectorAll('.vw-menu [role="menuitemradio"]')];
      const i = items.indexOf(document.activeElement);
      if (event.key === 'Escape') {
        S.menu = false;
        paintToolbar();
        document.querySelector('[data-act="menu"]')?.focus();
        event.preventDefault();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        items[(i + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
        event.preventDefault();
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      // Esc in Wayfinder's own toolbar: leave the presented option first, then close.
      if (S.canvas?.option) send({ type: 'go', page: S.canvas.page, option: null });
      else requestClose();
    }
    if (mode() === 'A' && event.key === 'Tab') {
      // Keep focus inside the overlay: the toolbar, then the canvas frame.
      const focusables = [...document.querySelectorAll('#vw button:not([disabled]), #vw a[href], #vw iframe')];
      const first = focusables[0];
      const last = focusables.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        last.focus();
        event.preventDefault();
      } else if (!event.shiftKey && document.activeElement === last) {
        first.focus();
        event.preventDefault();
      }
    }
  });

  // The mouse's back button (button 3) is Back in the desktop window too.
  document.addEventListener('mouseup', (event) => {
    if (event.button === 3 || event.button === 4) {
      event.preventDefault();
      travel(event.button === 3 ? -1 : 1);
    }
  });

  // ACF: move the floating window by its toolbar's first row, resize it from its corner.
  // The frame ignores the pointer meanwhile, or it would swallow the drag.
  let float = null;
  document.addEventListener('pointerdown', (event) => {
    if (mode() !== 'F' || !S.open) return;
    const grip = event.target.closest('.vw-grip');
    if (!grip && (!event.target.closest('.vw-drag') || event.target.closest('button, a'))) return;
    event.preventDefault();
    float = { corner: grip?.dataset.corner ?? null, x: event.clientX, y: event.clientY, start: { ...S.floatRect } };
    document.getElementById('vw').classList.add('is-dragging');
  });
  document.addEventListener('pointermove', (event) => {
    if (!float) return;
    const b = bodyEl().getBoundingClientRect();
    const dx = event.clientX - float.x;
    const dy = event.clientY - float.y;
    const r = { ...float.start };
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const c = float.corner;
    if (c) {
      // Each corner moves its own two edges; the opposite edges stay put.
      if (c.includes('e')) r.width = clamp(r.width + dx, 360, b.width - r.left);
      if (c.includes('s')) r.height = clamp(r.height + dy, 240, b.height - r.top);
      if (c.includes('w')) {
        const right = r.left + r.width;
        r.left = clamp(r.left + dx, 0, right - 360);
        r.width = right - r.left;
      }
      if (c.includes('n')) {
        const bottom = r.top + r.height;
        r.top = clamp(r.top + dy, 0, bottom - 240);
        r.height = bottom - r.top;
      }
    } else {
      r.left = Math.max(0, Math.min(b.width - r.width, r.left + dx));
      r.top = Math.max(0, Math.min(b.height - r.height, r.top + dy));
    }
    S.floatRect = r;
    applyMode();
  });
  document.addEventListener('pointerup', () => {
    if (!float) return;
    float = null;
    document.getElementById('vw').classList.remove('is-dragging');
  });

  // Drag the map's empty space to pan, like the real map.
  let drag = null;
  document.addEventListener('pointerdown', (event) => {
    const wrap = event.target.closest('.vw-wrap');
    if (!wrap || event.target.closest('button')) return;
    drag = { wrap, x: event.clientX, y: event.clientY, l: wrap.scrollLeft, t: wrap.scrollTop };
  });
  document.addEventListener('pointermove', (event) => {
    if (!drag) return;
    drag.wrap.scrollLeft = drag.l - (event.clientX - drag.x);
    drag.wrap.scrollTop = drag.t - (event.clientY - drag.y);
  });
  document.addEventListener('pointerup', () => (drag = null));

  function start(direction, { grips = 'se' } = {}) {
    S.dir = direction;
    S.grips = grips;
    document.body.classList.add(`vw-dir-${direction.toLowerCase()}`);
    paintAll();
    H.stack = [{ canvas: null, view: S.view, url: mapUrl(S.view) }];
    H.i = 0;
    paintAddress();
    if (opening[0]) {
      const n = Number(opening[0]);
      requestAnimationFrame(() => {
        const origin = document.querySelector(S.view === 'map' ? `[data-open="${n}"].vw-thumb` : `[data-open="${n}"]${opening[1] ? `[data-option="${opening[1]}"]` : ':not([data-option])'}`);
        openViewer(n, opening[1] ?? null, origin, { fromHistory: false });
      });
    }
  }

  window.VIEWER = { start, state: S };
})();
