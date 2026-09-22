/*
  PROTOTYPE (#43): the shell #42 settled (direction D) plus the prototype's routing, menus and map page.
  Only the page bodies differ between directions: a direction calls WF.start({ home, repo, protos }),
  each a function (state) => markup. protos renders the stage of a map's Prototypes tab.
  Load after ../kit/kit.js and data.js.

  Navigation is real: anything with data-view (plus data-repo, data-map, data-mapview) moves there.
  ?view= home | repo | map, ?mapview= map | table | prototypes, ?repo=owner/name, ?side= open | folded.
*/
(() => {
  const { STATES, TYPES, REPOS } = DATA;
  const esc = Kit.esc;
  const icon = Kit.icon;

  const repoOf = (name) => REPOS.find((r) => r.name === name) ?? REPOS[0];
  const mapOf = (repo, number) => repo.maps.find((m) => m.number === number) ?? repo.maps[0];
  const total = (c) => c.claimed + c.blocked + c.frontier + c.done;
  const open = (c) => c.claimed + c.blocked + c.frontier;
  const short = (name) => name.split('/')[1];
  const openTickets = (repo) => repo.maps.filter((m) => !m.closed).reduce((n, m) => n + open(m.counts), 0);
  const protosOf = (repo, map) => repo.prototypes.filter((p) => p.map === map.number);

  /** The repository identity mark, like the map page's topbar mark. */
  const repoMark = (repo, size = 18) =>
    `<span class="nv-mark" style="--h:${repo.hue};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px">${esc(repo.mark)}</span>`;

  /** chrome.ts's progress ring, at any size. */
  function ring(c, size = 76, stroke = 7) {
    const all = total(c);
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    let off = 0;
    const arcs = ['done', 'claimed', 'frontier', 'blocked']
      .filter((s) => c[s] > 0)
      .map((s) => {
        const len = (c[s] / all) * circ;
        const gap = c[s] === all ? 0 : size < 30 ? 1.5 : 3;
        const arc = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(${STATES[s].v})" stroke-width="${stroke}" stroke-dasharray="${Math.max(0, len - gap)} ${circ}" stroke-dashoffset="${-off}"/>`;
        off += len;
        return arc;
      })
      .join('');
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="transform:rotate(-90deg)" aria-hidden="true">${arcs}</svg>`;
  }
  const miniRing = (c) => `<span class="nv-miniring">${ring(c, 16, 3)}</span>`;

  function summary(c) {
    const rows = ['frontier', 'claimed', 'blocked', 'done']
      .filter((s) => c[s] > 0)
      .map((s) => `<span class="srow" style="--accent: var(${STATES[s].v})">${icon(STATES[s].icon)}${STATES[s].long}<b>${c[s]}</b></span>`)
      .join('');
    return `<div class="summary"><div class="ring">${ring(c)}<div class="lbl"><b>${c.done}/${total(c)}</b><span>done</span></div></div><div class="status-rows">${rows}</div></div>`;
  }

  /** A sketch of one variant's page, standing in for its live frame. img uses the one real screenshot we have. */
  const frame = (letter, { img = false, tag = true } = {}) =>
    `<span class="wf-frame v-${letter.toLowerCase()}">${
      img ? '<img src="../assets/home-b.png" alt="">' : `<span class="col"><i></i><i></i><i></i><i></i></span><span class="fb"><i class="wide"></i><i></i><i></i><i></i><i></i></span>`
    }${tag ? `<span class="tag">${esc(letter)}</span>` : ''}</span>`;

  /**
    Progress as fog being cleared (#40). A small terrain under fog; each ticket done today clears one
    waypoint along a trail, left to right, so the goal is the whole trail. Past the goal the fog lifts further.
  */
  let fogN = 0;
  function fog({ w = 300, h = 170, done = 0, goal = 5, blank = false } = {}) {
    const id = `fog${++fogN}`;
    const pts = Array.from({ length: goal }, (_, i) => {
      const t = (i + 0.5) / goal;
      return [Math.round(w * (0.08 + t * 0.84)), Math.round(h * (0.55 + 0.22 * Math.sin(t * Math.PI * 2.2)))];
    });
    const trail = `M${pts.map((p) => p.join(' ')).join(' L')}`;
    const contours = [
      [0.28, 0.42, 1],
      [0.74, 0.34, 0.8],
      [0.55, 0.9, 0.7],
    ]
      .flatMap(([cx, cy, k]) =>
        [1, 2, 3, 4].map((n) => `<ellipse cx="${w * cx}" cy="${h * cy}" rx="${n * 26 * k + 6}" ry="${n * 15 * k + 4}" transform="rotate(${-12 + n * 3} ${w * cx} ${h * cy})"/>`),
      )
      .join('');
    const cleared = blank ? 0 : Math.min(done, goal);
    const extra = blank ? 0 : Math.max(0, done - goal);
    const holes = pts
      .slice(0, cleared)
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${h * 0.24}"/>`)
      .join('');
    const lift = extra ? `<rect x="0" y="0" width="${w}" height="${h}" fill-opacity="${Math.min(0.6, extra * 0.2)}"/>` : '';
    const dots = pts
      .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i < cleared ? 5 : 3.5}" style="fill:${i < cleared ? 'var(--state-frontier)' : 'var(--text-muted)'};stroke:var(--surface-1);stroke-width:2"/>`)
      .join('');
    return `<svg class="wf-fog" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${blank ? 'No data' : `${done} of ${goal} tickets cleared today`}">
      <defs><filter id="${id}b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${h * 0.07}"/></filter>
        <mask id="${id}m"><rect width="${w}" height="${h}" fill="#fff"/><g fill="#000" filter="url(#${id}b)">${holes}${lift}</g></mask></defs>
      <rect width="${w}" height="${h}" style="fill:var(--surface-1)"/>
      <g style="fill:none;stroke:var(--gridline);stroke-width:1.2">${contours}</g>
      <path d="${trail}" style="fill:none;stroke:var(--baseline);stroke-width:2;stroke-dasharray:1 6;stroke-linecap:round"/>
      ${dots}
      <rect width="${w}" height="${h}" mask="url(#${id}m)" style="fill:var(--plane);opacity:.94"/>
    </svg>`;
  }

  const chip = (state) => `<span class="chip" style="--accent: var(${STATES[state].v})">${icon(STATES[state].icon)}${STATES[state].label}</span>`;

  const go = (view, extra = '') => `data-view="${view}"${extra}`;
  const goRepo = (repo) => go('repo', ` data-repo="${esc(repo.name)}"`);
  const goMap = (repo, map, mapview) => go('map', ` data-repo="${esc(repo.name)}" data-map="${map.number}"${mapview ? ` data-mapview="${mapview}"` : ''}`);
  /** Where an in-flight item or Continue target leads. */
  const goItem = (item) => {
    const repo = REPOS.find((r) => r.name === item.repo);
    const map = repo && repo.maps.find((m) => m.number === item.map);
    return repo && map ? goMap(repo, map, item.mapview) : 'data-to="that ticket"';
  };

  /* ---------- the map page (unchanged by #43, it only hosts the Prototypes tab) ---------- */

  const NODE_W = 232;
  const NODE_H = 104;
  const COL_GAP = 72;
  const ROW_GAP = 18;

  function mapLayout(tickets) {
    const rows = {};
    return tickets.map((t) => {
      const row = (rows[t.col] = (rows[t.col] ?? -1) + 1);
      return { ...t, x: 28 + t.col * (NODE_W + COL_GAP), y: 26 + row * (NODE_H + ROW_GAP) };
    });
  }

  function nodeHtml(t) {
    const st = STATES[t.state];
    const meta = t.state === 'blocked' ? `blocked by ${t.blockers.map((n) => `#${n}`).join(', ')}` : t.state === 'claimed' || t.state === 'done' ? '@RAbdelrhman' : TYPES[t.type][0];
    return `<button type="button" class="node${t.state === 'done' ? ' is-done' : ''}" data-to="ticket #${t.number} in the inspector" style="--accent: var(${st.v}); left:${t.x}px; top:${t.y}px; width:${NODE_W}px; height:${NODE_H}px">
      <span class="node-top"><span class="glyph">${icon(TYPES[t.type][1])}</span><span class="num">#${t.number}</span>${chip(t.state)}</span>
      <span class="title">${esc(t.title)}</span><span class="meta">${esc(meta)}</span></button>`;
  }

  function edges(laid) {
    const at = Object.fromEntries(laid.map((t) => [t.number, t]));
    return laid
      .flatMap((t) =>
        t.blockers
          .filter((b) => at[b])
          .map((b) => {
            const a = at[b];
            const x1 = a.x + NODE_W;
            const y1 = a.y + NODE_H / 2;
            const x2 = t.x;
            const y2 = t.y + NODE_H / 2;
            const mid = (x1 + x2) / 2;
            return `<path d="M${x1} ${y1}C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}" class="is-live"/>`;
          }),
      )
      .join('');
  }

  function filters(map) {
    const c = map.counts;
    const fchip = (label, n, st, on) =>
      `<button type="button" class="fchip${on ? ' is-on' : ''}"${st ? ` style="--accent: var(${STATES[st].v})"` : ''}${n === 0 && !on ? ' disabled' : ''}>${st ? icon(STATES[st].icon) : ''}${label} <b>${n}</b></button>`;
    const types = Object.entries(TYPES).map(([k, [label, ic]]) => `<button type="button" class="fchip">${icon(ic)}${label} <b>${(map.tickets ?? []).filter((t) => t.type === k).length}</b></button>`);
    return `<div class="filters">${fchip('All', total(c), null, true)}${['frontier', 'claimed', 'blocked', 'done'].map((s) => fchip(STATES[s].long, c[s], s)).join('')}<span class="filter-sep" role="none"></span>${types.join('')}</div>`;
  }

  function inspector(map) {
    return `<aside class="inspector"><div class="insp-tabs"><div class="segmented"><button class="seg is-on">Brief</button><button class="seg" disabled>Ticket</button></div></div>
      <div class="insp-panel brief"><p class="eyebrow">Map · #${map.number}</p><h1>${esc(map.title)}</h1>${summary(map.counts)}
      <div class="tabs nv-insp-tabs"><button class="tab is-on">Destination</button><button class="tab">Not yet specified</button><button class="tab">Decided</button></div>
      <div class="prose"><p>${esc(map.dest)}</p></div></div></aside>`;
  }

  function tableView(map) {
    return `<div class="nv-table"><table><thead><tr><th>#</th><th>Title</th><th>Type</th><th>State</th></tr></thead><tbody>${(map.tickets ?? [])
      .map((t) => `<tr><td class="num">#${t.number}</td><td>${esc(t.title)}</td><td><span class="nv-cell">${icon(TYPES[t.type][1])}${TYPES[t.type][0]}</span></td><td>${chip(t.state)}</td></tr>`)
      .join('')}</tbody></table></div>`;
  }

  function mapBody(s) {
    const repo = repoOf(s.repo);
    const map = mapOf(repo, s.map);
    const laid = mapLayout(map.tickets ?? []);
    if (s.mapView === 'prototypes') return `<div class="body wf-protos-body"><section class="stage wf-protos-stage">${dir.protos(s)}</section></div>`;
    const stage =
      s.mapView === 'table'
        ? tableView(map)
        : `<div class="canvas-wrap nv-canvas"><div class="canvas" style="width:1560px;height:720px"><svg class="edges" width="1560" height="720">${edges(laid)}</svg><div class="nodes">${laid
            .map(nodeHtml)
            .join('')}</div></div>${laid.length ? '' : '<div class="empty" style="position:absolute;inset:40px">This map is fake in the prototype: open map #35 to see tickets.</div>'}</div>
          <div class="zoom floatbox"><button class="iconbtn">${icon('minus')}</button><button class="iconbtn pct">100%</button><button class="iconbtn">${icon('plus')}</button></div>`;
    return `${s.mapView === 'map' ? filters(map) : ''}<div class="body"><section class="stage">${stage}</section>${inspector(map)}</div>`;
  }

  /* ---------- the shell: #42 direction D ---------- */

  const inRepo = (s, r) => s.repo === r.name && (s.view === 'repo' || s.view === 'map');

  function tree(s) {
    const row = (attrs, inner, cls = '') => `<a class="row${cls}" href="#" ${attrs}>${inner}</a>`;
    const repos = REPOS.map((r) => {
      const isOpen = !!s.expanded[r.name];
      const here = inRepo(s, r);
      const twist = r.maps.length
        ? `<span class="twist${isOpen ? ' is-open' : ''}" data-expand="${esc(r.name)}" role="button" aria-label="${isOpen ? 'Collapse' : 'Expand'}">${icon('right')}</span>`
        : '<span class="twist"></span>';
      const kids =
        isOpen && r.maps.length
          ? `<div class="kids">${r.maps
              .map((m) => row(goMap(r, m), `${miniRing(m.counts)}<span class="grow">#${m.number} ${esc(m.title)}</span>`, here && s.view === 'map' && s.map === m.number ? ' is-on' : ''))
              .join('')}</div>`
          : '';
      return row(goRepo(r), `${twist}${repoMark(r)}<span class="grow">${esc(short(r.name))}</span>`, here && s.view === 'repo' ? ' is-on' : here ? ' is-trail' : '') + kids;
    }).join('');
    return `${row(go('home'), `${icon('home')}<span class="grow">Home</span>`, s.view === 'home' ? ' is-on' : '')}<div class="tree-label">Repositories</div>${
      repos || '<p class="wf-tree-empty">No repositories yet. Open one from Home.</p>'
    }`;
  }

  const account = () =>
    DATA.SIGNED_IN
      ? `<span class="rail-mark">R</span><span class="grow">ramon</span>`
      : `<span class="rail-mark wf-mark-warn">${icon('warn')}</span><span class="grow wf-foot-warn">gh signed out</span>`;

  function side(s) {
    return `<nav class="side" aria-label="App">
      <div class="side-head"><a class="logo" href="#" ${go('home')} aria-label="Wayfinder Home">${icon('compass')}</a><b>Wayfinder</b>
        <button type="button" class="fold" data-fold title="Fold the sidebar" aria-label="Fold the sidebar">${icon('panel')}</button></div>
      <div class="side-actions">
        <a class="primary" href="#" data-to="Start a new map (#44)">${icon('plus')}Start a new map</a>
        <button type="button" class="search" data-palette>${icon('lens')}<span class="ph">Jump to…</span><kbd>Ctrl K</kbd></button>
      </div>
      <div class="tree">${tree(s)}</div>
      <div class="side-foot">${account()}
        <button type="button" class="rail-btn" data-to="settings: account, GitHub status and Stop server" aria-label="Settings">${icon('sliders')}</button>
        <button type="button" class="rail-btn" data-to="the theme switch" aria-label="Theme">${icon('moon')}</button></div>
    </nav>`;
  }

  function mini(s) {
    const repos = REPOS.map((r) => {
      const here = inRepo(s, r);
      const items = `<div class="menu-label">${esc(r.name)}</div>
        <button type="button" class="menu-item${here && s.view === 'repo' ? ' is-on' : ''}" ${goRepo(r)}>${icon('graph')}<span class="grow">All maps</span><span class="nv-meta">${r.maps.length}</span></button>
        ${r.maps.map((m) => `<button type="button" class="menu-item${here && s.view === 'map' && s.map === m.number ? ' is-on' : ''}" ${goMap(r, m)}>${miniRing(m.counts)}<span class="grow">#${m.number} ${esc(m.title)}</span></button>`).join('')}`;
      return `<span class="menu-anchor"><button type="button" class="rail-btn${here ? ' is-here' : ''}" data-menu="mini-${esc(r.mark)}" data-tip="${esc(short(r.name))}" aria-label="${esc(r.name)}" aria-haspopup="menu" aria-expanded="false">${repoMark(r)}</button>
        <div class="menu is-side" data-menu-for="mini-${esc(r.mark)}" hidden>${items}</div></span>`;
    })
      .slice(0, 8)
      .join('');
    return `<nav class="mini" aria-label="App">
      <div class="mini-head"><button type="button" class="fold mini-logo" data-fold title="Open the sidebar" aria-label="Open the sidebar"><span class="logo">${icon('compass')}</span>${icon('panel')}</button></div>
      <a class="new" href="#" data-to="Start a new map (#44)" data-tip="Start a new map" aria-label="Start a new map">${icon('plus')}</a>
      <button type="button" class="rail-btn" data-palette data-tip="Jump to… Ctrl K" aria-label="Jump to">${icon('lens')}</button>
      <a class="rail-btn${s.view === 'home' ? ' is-on' : ''}" href="#" ${go('home')} data-tip="Home" aria-label="Home">${icon('home')}</a>
      <span class="mini-sep" role="none"></span>
      <div class="mini-repos">${repos}</div>
      <span class="rail-spacer"></span>
      <button type="button" class="rail-btn" data-to="settings" data-tip="Settings" aria-label="Settings">${icon('sliders')}</button>
      <button type="button" class="rail-btn" data-to="the theme switch" data-tip="Theme" aria-label="Theme">${icon('moon')}</button>
      <span class="rail-mark">R</span>
    </nav>`;
  }

  function tabs(s) {
    if (s.view !== 'map') return '';
    const repo = repoOf(s.repo);
    const map = mapOf(repo, s.map);
    const tab = (label, ic, attrs, on, badge = '') => `<a class="seg${on ? ' is-on' : ''}" href="#" ${attrs}${on ? ' aria-current="page"' : ''}>${icon(ic)}${label}${badge}</a>`;
    const waiting = protosOf(repo, map).some((p) => p.status === 'waiting');
    return `<nav class="segmented" aria-label="Map views">${tab('Map', 'graph', goMap(repo, map, 'map'), s.mapView === 'map')}${tab('Table', 'table', goMap(repo, map, 'table'), s.mapView === 'table')}${tab(
      'Prototypes',
      'beaker',
      goMap(repo, map, 'prototypes'),
      s.mapView === 'prototypes',
      ` <span class="badge${waiting ? ' wf-badge-wait' : ''}">${protosOf(repo, map).length}</span>`,
    )}</nav>`;
  }

  function repoMenu(s) {
    return REPOS.map(
      (r) =>
        `<button type="button" class="menu-item${r.name === s.repo ? ' is-on' : ''}" ${goRepo(r)}>${repoMark(r)}<span class="grow">${esc(r.name)}</span><span class="nv-meta">${r.maps.length}</span></button>`,
    ).join('');
  }

  function mapMenu(s) {
    const repo = repoOf(s.repo);
    return `<div class="menu-label">Maps in ${esc(short(repo.name))}</div>${repo.maps
      .map((m) => `<button type="button" class="menu-item${s.view === 'map' && m.number === s.map ? ' is-on' : ''}" ${goMap(repo, m)}>${miniRing(m.counts)}<span class="grow">#${m.number} ${esc(m.title)}</span></button>`)
      .join('')}`;
  }

  function scope(s) {
    const repo = repoOf(s.repo);
    const repoBtn = `<span class="menu-anchor"><button type="button" class="scope${s.view === 'map' ? ' is-quiet' : ''}" data-menu="repos" aria-haspopup="menu" aria-expanded="false">
      ${repoMark(repo, 20)}<span class="t">${esc(s.view === 'map' ? short(repo.name) : repo.name)}</span>${icon('chevron')}</button>
      <div class="menu" data-menu-for="repos" hidden><div class="menu-label">Switch repository</div>${repoMenu(s)}</div></span>`;
    if (s.view !== 'map') return repoBtn;
    const map = mapOf(repo, s.map);
    return `${repoBtn}<span class="crumb-sep">/</span><span class="menu-anchor"><button type="button" class="scope" data-menu="maps" aria-haspopup="menu" aria-expanded="false">
      ${miniRing(map.counts)}<span class="t">#${map.number} ${esc(map.title)}</span>${icon('chevron')}</button>
      <div class="menu" data-menu-for="maps" hidden>${mapMenu(s)}</div></span>`;
  }

  const nextTicket = (s) => (mapOf(repoOf(s.repo), s.map).tickets ?? []).find((t) => t.state === 'frontier') ?? null;

  function topbar(s) {
    const search = isFolded(s) ? `<button type="button" class="search" data-palette>${icon('lens')}<span class="ph">Jump to…</span><kbd>Ctrl K</kbd></button>` : '';
    const synced = DATA.SIGNED_IN ? '<span class="synced">Synced just now</span>' : '<span class="synced wf-stale">Showing cached data</span>';
    if (s.view === 'home') return `<header class="topbar"><span class="page-title">Home</span><span class="topbar-spacer"></span>${search}${synced}</header>`;
    const next = s.view === 'map' ? nextTicket(s) : null;
    const cta = next ? `<a class="primary" href="#" data-to="T3 Code with ticket #${next.number}" title="${esc(next.title)}">${icon('play')}Start #${next.number} in T3 Code</a>` : '';
    return `<header class="topbar">${scope(s)}${tabs(s)}<span class="topbar-spacer"></span>${search}${synced}${cta}</header>`;
  }

  /* ---------- jump palette and menus ---------- */

  function paletteItems(query) {
    const q = query.trim().toLowerCase();
    const items = [{ label: 'Home', meta: 'Page', attrs: go('home'), ic: 'home' }];
    for (const r of REPOS) {
      items.push({ label: r.name, meta: 'Repository', attrs: goRepo(r), mark: r });
      for (const m of r.maps) items.push({ label: `#${m.number} ${m.title}`, meta: `Map · ${short(r.name)}`, attrs: goMap(r, m), ring: m.counts });
    }
    return items.filter((i) => !q || i.label.toLowerCase().includes(q) || i.meta.toLowerCase().includes(q)).slice(0, 9);
  }

  function renderPalette(query) {
    const list = document.querySelector('.nv-palette-list');
    if (!list) return;
    const items = paletteItems(query);
    list.innerHTML = items.length
      ? items
          .map(
            (i, n) =>
              `<button type="button" class="menu-item${n === 0 ? ' is-on' : ''}" ${i.attrs}>${i.mark ? repoMark(i.mark) : i.ring ? miniRing(i.ring) : icon(i.ic)}<span class="grow">${esc(i.label)}</span><span class="nv-meta">${esc(i.meta)}</span></button>`,
          )
          .join('')
      : '<p class="hint" style="padding:10px 12px">Nothing matches.</p>';
  }

  function openPalette() {
    closeMenus();
    let el = document.querySelector('.nv-palette');
    if (!el) {
      el = document.createElement('div');
      el.className = 'nv-palette';
      el.innerHTML = `<div class="nv-palette-box" role="dialog" aria-label="Jump to"><label class="search nv-palette-search">${icon('lens')}<input type="search" placeholder="Jump to a repository or map…" autocomplete="off"><kbd>Esc</kbd></label><div class="nv-palette-list"></div></div>`;
      document.body.append(el);
      el.addEventListener('click', (e) => {
        if (e.target === el) closePalette();
      });
      el.querySelector('input').addEventListener('input', (e) => renderPalette(e.target.value));
      el.querySelector('input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') el.querySelector('.menu-item.is-on')?.click();
      });
    }
    el.hidden = false;
    el.querySelector('input').value = '';
    renderPalette('');
    el.querySelector('input').focus();
  }
  function closePalette() {
    const el = document.querySelector('.nv-palette');
    if (el) el.hidden = true;
  }

  function closeMenus(except) {
    for (const m of document.querySelectorAll('.menu[data-menu-for]')) if (m !== except) m.hidden = true;
    for (const b of document.querySelectorAll('[data-menu]')) if (!except || b.dataset.menu !== except.dataset.menuFor) b.setAttribute('aria-expanded', 'false');
  }

  /* ---------- state and rendering ---------- */

  const params = new URLSearchParams(location.search);
  const state = {
    view: params.get('view') ?? 'home',
    repo: params.get('repo') ?? REPOS[0]?.name,
    map: Number(params.get('map') ?? 35),
    mapView: params.get('mapview') ?? 'map',
    expanded: {},
    q: '',
  };
  if (!REPOS.length) state.view = 'home';

  // The sidebar starts folded on the map page only (#42).
  const folded = { map: params.get('side') !== 'open' };
  if (params.get('side') === 'folded') folded[state.view] = true;
  const isFolded = (s) => !!folded[s.view];

  let dir = null;

  function render() {
    closePalette();
    const s = state;
    const isOpen = !isFolded(s);
    const body = s.view === 'map' ? mapBody(s) : `<main class="page">${s.view === 'repo' ? dir.repo(s) : dir.home(s)}</main>`;
    document.getElementById('root').innerHTML = `<div class="app${isOpen ? ' has-side' : ''} wf-${s.view}">${isOpen ? side(s) : mini(s)}<div class="main">${topbar(s)}${body}</div></div>`;
    Kit.fillIcons();
    dir.after?.(s);
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-fold]')) {
      folded[state.view] = !isFolded(state);
      render();
      return;
    }
    const toggle = e.target.closest('[data-menu]');
    if (toggle) {
      e.preventDefault();
      const menu = document.querySelector(`.menu[data-menu-for="${toggle.dataset.menu}"]`);
      closeMenus(menu);
      menu.hidden = !menu.hidden;
      toggle.setAttribute('aria-expanded', String(!menu.hidden));
      return;
    }
    if (e.target.closest('[data-palette]')) {
      e.preventDefault();
      openPalette();
      return;
    }
    const expand = e.target.closest('[data-expand]');
    if (expand) {
      e.preventDefault();
      e.stopPropagation();
      state.expanded[expand.dataset.expand] = !state.expanded[expand.dataset.expand];
      render();
      return;
    }
    const link = e.target.closest('[data-view]');
    if (link) {
      e.preventDefault();
      state.view = link.dataset.view;
      if (link.dataset.repo) state.repo = link.dataset.repo;
      if (link.dataset.map) state.map = Number(link.dataset.map);
      state.mapView = link.dataset.mapview ?? 'map';
      state.q = '';
      if (link.dataset.repo) state.expanded[link.dataset.repo] = true;
      render();
      document.querySelector('.page')?.scrollTo(0, 0);
      return;
    }
    if (!e.target.closest('.menu')) closeMenus();
  });

  // Search fields that filter a list: <input data-filter> inside [data-filter-scope], rows marked data-name.
  document.addEventListener('input', (e) => {
    if (!e.target.matches('[data-filter]')) return;
    const scope = e.target.closest('[data-filter-scope]');
    const q = e.target.value.trim().toLowerCase();
    let shown = 0;
    for (const el of scope.querySelectorAll('[data-name]')) {
      const hit = !q || el.dataset.name.toLowerCase().includes(q);
      el.hidden = q ? !hit : el.hasAttribute('data-overflow');
      shown += hit;
    }
    const none = scope.querySelector('[data-filter-none]');
    if (none) {
      none.hidden = shown > 0;
      none.querySelector('b').textContent = e.target.value.trim();
    }
    for (const el of scope.querySelectorAll('[data-filter-more]')) el.hidden = !!q;
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-filter]') && e.target.value.includes('/')) {
      Kit.toast(`Would open ${e.target.value.trim()}`);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openPalette();
    } else if (e.key === 'Escape') {
      closePalette();
      closeMenus();
    }
  });

  window.WF = {
    ...DATA,
    icon,
    esc,
    repoOf,
    mapOf,
    total,
    open,
    short,
    openTickets,
    protosOf,
    repoMark,
    ring,
    miniRing,
    summary,
    frame,
    fog,
    chip,
    go,
    goRepo,
    goMap,
    goItem,
    state,
    render,
    start(direction) {
      dir = direction;
      if (state.repo) state.expanded[state.repo] = true;
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
      else render();
    },
  };
})();
