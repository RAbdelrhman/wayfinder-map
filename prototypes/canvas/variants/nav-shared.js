/*
  PROTOTYPE (#42): shared fake data, icons and page bodies for the navigation-shell variants.
  The bodies (Home, repository, Prototypes, /new-map, map) are the same in every variant, so the
  only thing that differs between nav-a/b/c.html is the shell around them. Load after ../kit/kit.js.

  A variant calls NAV.start(shell), where shell(state, body) returns the whole .app markup.
  Navigation inside the prototype is real: anything with data-view (plus optional data-repo,
  data-map, data-mapview) moves there and re-renders. ?view= picks the starting view.
*/
(() => {
  Object.assign(Kit.icons, {
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    home: '<path d="m3 10.5 9-7 9 7"/><path d="M5.5 9.2V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.9-3.5L3 10"/><path d="M3 4v6h6"/><path d="M4 13a8 8 0 0 0 14.9 3.5L21 14"/><path d="M21 20v-6h-6"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    repo: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v18H6.5A1.5 1.5 0 0 1 5 19.5z"/><path d="M5 16.5A1.5 1.5 0 0 1 6.5 15H19"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    graph: '<rect x="3" y="4" width="7" height="6" rx="1.5"/><rect x="14" y="14" width="7" height="6" rx="1.5"/><path d="M10 7h1.5a2.5 2.5 0 0 1 2.5 2.5V14"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>',
    beaker: '<path d="M9.5 3h5"/><path d="M10.8 3v6.4L5.5 17.9A2 2 0 0 0 7.2 21h9.6a2 2 0 0 0 1.7-3.1L13.2 9.4V3"/><path d="M7.8 15h8.4"/>',
    lens: '<circle cx="11" cy="11" r="6.4"/><path d="m20 20-4.4-4.4"/>',
    grill: '<path d="M3.5 8.5h17"/><path d="M5 8.5a7 7 0 0 0 14 0"/><path d="m8.4 14.5-2.4 6.3"/><path d="m15.6 14.5 2.4 6.3"/><path d="M9.6 2.3c-1 1.1.6 1.7 0 2.9"/><path d="M14.4 2.3c-1 1.1.6 1.7 0 2.9"/>',
    list: '<path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/><path d="M8.5 6H20"/><path d="M8.5 12H20"/><path d="M8.5 18H20"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    lock: '<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    person: '<path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="7" r="4"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    play: '<path d="M7 4v16l13-8z" fill="currentColor"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
    minus: '<path d="M5 12h14"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  });

  const STATES = {
    frontier: { label: 'next', long: 'Next up', icon: 'arrow', v: '--state-frontier' },
    claimed: { label: 'claimed', long: 'Claimed', icon: 'person', v: '--state-claimed' },
    blocked: { label: 'blocked', long: 'Blocked', icon: 'lock', v: '--state-blocked' },
    done: { label: 'done', long: 'Done', icon: 'check', v: '--state-done' },
  };
  const TYPES = { R: ['research', 'lens'], P: ['prototype', 'beaker'], G: ['grilling', 'grill'], T: ['task', 'list'] };

  // Map #35 as it stands today: column, type, state, blockers.
  const T = (number, col, type, state, title, blockers = []) => ({ number, col, type, state, title, blockers });
  const MAP_35 = [
    T(36, 0, 'R', 'done', 'Where do Home and Start a new map fall short of the map page?'),
    T(37, 0, 'R', 'done', "What is the map page's design system, and where do the Home views drift?"),
    T(38, 0, 'R', 'done', 'What can T3 Code tell Wayfinder about a thread after a hand-off?'),
    T(39, 0, 'P', 'done', 'What should the prototype canvas look like?'),
    T(40, 1, 'G', 'frontier', 'What is Home for?'),
    T(41, 1, 'G', 'frontier', 'How deep does hand-off tracking go?'),
    T(42, 1, 'P', 'claimed', 'How should navigation show where you are and where you can go?'),
    T(44, 1, 'P', 'frontier', 'What should starting a new map feel like?'),
    T(50, 1, 'T', 'frontier', 'Consolidate shared design tokens and components in styles.css'),
    T(43, 2, 'P', 'blocked', 'What should the Home, repository and Prototypes views look like?', [40, 42]),
    T(45, 2, 'P', 'blocked', 'What does the user see after handing off to T3 Code?', [41]),
    T(46, 2, 'G', 'blocked', 'Which navigation direction ships?', [42]),
    T(48, 2, 'G', 'blocked', 'Which Start a new map flow ships?', [44]),
    T(55, 2, 'T', 'blocked', 'Track hand-offs on the server', [41]),
    T(47, 3, 'G', 'blocked', 'Which Home, repository and Prototypes direction ships?', [43]),
    T(49, 3, 'G', 'blocked', 'Which after-hand-off experience ships?', [45]),
    T(51, 3, 'T', 'blocked', 'Build the new navigation shell', [46, 50]),
    T(52, 4, 'T', 'blocked', 'Redesign the Home view', [47, 51]),
    T(53, 4, 'T', 'blocked', 'Redesign the repository and Prototypes views', [47, 51]),
    T(54, 4, 'T', 'blocked', 'Redesign the Start a new map flow', [48, 51]),
  ];

  const counts = (c, b, f, d) => ({ claimed: c, blocked: b, frontier: f, done: d });
  const REPOS = [
    {
      name: 'RAbdelrhman/wayfinder-map',
      mark: 'WM',
      hue: 212,
      updated: '2 hours ago',
      maps: [
        {
          number: 35,
          title: 'Redesign Home and Start a new map, prototyped on a design canvas',
          dest: "Home and every view it owns look polished, share the map page's visual language, and have a clear flow: finding the right repo and map, starting a map, and knowing what happened after a hand-off.",
          counts: counts(1, 11, 4, 4),
          tickets: MAP_35,
        },
        {
          number: 14,
          title: 'Installable desktop app with the CLI still available',
          dest: 'A user can install Wayfinder, launch it from the operating system without opening a terminal, land on Home, choose a repository and map, and hand a ticket to T3 Code.',
          counts: counts(1, 1, 0, 8),
        },
        { number: 3, title: 'Home page: connect GitHub, pick a repo, pick a map', dest: 'A decided implementation contract for a Home page at the tool’s root.', counts: counts(0, 0, 0, 6), closed: true },
      ],
      prototypes: [
        { ticket: 39, map: 35, title: 'What should the prototype canvas look like?', gist: 'A dark board with one live frame per variant and a note on each.', date: '3 days ago', img: true },
        { ticket: 17, map: 14, title: 'Desktop launch and first-run states', gist: 'Splash, first run and the tray menu, side by side.', date: '2 weeks ago' },
        { ticket: 8, map: 3, title: 'What does the Home page look like?', gist: 'Three Home layouts: directory, dashboard and last-used.', date: '1 month ago' },
      ],
    },
    {
      name: 'RAbdelrhman/podcontrol',
      mark: 'PC',
      hue: 150,
      updated: 'yesterday',
      maps: [{ number: 2, title: 'Control playback from the phone', dest: 'Play, pause and skip from a phone on the same network.', counts: counts(1, 2, 3, 11) }],
      prototypes: [],
    },
    {
      name: 'RAbdelrhman/pdfbuilder',
      mark: 'PB',
      hue: 28,
      updated: '3 days ago',
      maps: [{ number: 5, title: 'Templates people can edit without code', dest: 'A template editor with live preview.', counts: counts(0, 2, 1, 9) }],
      prototypes: [{ ticket: 9, map: 5, title: 'What does the template editor look like?', gist: 'Split view vs. inline editing.', date: '5 days ago' }],
    },
    {
      name: 'entelech/ecpl-lockstep',
      mark: 'EL',
      hue: 280,
      updated: 'last week',
      maps: [
        { number: 11, title: 'Lockstep sync across regions', dest: 'Every region applies the same ordered log.', counts: counts(2, 5, 2, 14) },
        { number: 19, title: 'Operator dashboard', dest: 'One screen for replication lag and failovers.', counts: counts(0, 3, 1, 4) },
      ],
      prototypes: [],
    },
  ];

  const esc = Kit.esc;
  const icon = Kit.icon;
  const repoOf = (name) => REPOS.find((r) => r.name === name) ?? REPOS[0];
  const mapOf = (repo, number) => repo.maps.find((m) => m.number === number) ?? repo.maps[0];
  const total = (c) => c.claimed + c.blocked + c.frontier + c.done;
  const short = (name) => name.split('/')[1];

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

  const go = (view, extra = '') => `data-view="${view}"${extra}`;
  const goRepo = (repo, view = 'repo') => go(view, ` data-repo="${esc(repo.name)}"`);
  const goMap = (repo, map, mapview) => go('map', ` data-repo="${esc(repo.name)}" data-map="${map.number}"${mapview ? ` data-mapview="${mapview}"` : ''}`);

  /* ---------- page bodies: identical in every variant ---------- */

  function homeBody(s) {
    const last = repoOf(REPOS[0].name);
    const lastMap = last.maps[0];
    return `<div class="sheet">
      <div class="page-head"><div class="grow"><p class="eyebrow">Wayfinder</p><h1>Where do you want to go?</h1>
        <p>Pick up the map you were on, or open a repository.</p></div></div>
      <a class="card nv-continue" href="#" ${goMap(last, lastMap)}>
        <div class="ring nv-ring-sm">${ring(lastMap.counts, 52, 6)}</div>
        <div class="grow"><p class="eyebrow">Continue · ${esc(last.name)}</p><strong>#${lastMap.number} ${esc(lastMap.title)}</strong>
        <p>${lastMap.counts.frontier} next up · ${lastMap.counts.claimed} claimed</p></div>
        <span class="nv-go">${icon('arrow')}</span></a>
      <section class="section"><div class="section-head"><h2>Repositories with maps</h2></div>
        <div class="repo-grid">${REPOS.map(
          (r) => `<a class="card repo-card" href="#" ${goRepo(r)}>${repoMark(r, 20)}<span class="grow">${esc(r.name)}</span>
            <span class="nv-meta">${r.maps.length} map${r.maps.length === 1 ? '' : 's'}</span>${icon('arrow').replace('class="i"', 'class="i go"')}</a>`,
        ).join('')}</div></section>
    </div>`;
  }

  function mapCard(repo, map) {
    return `<a class="card map-card" href="#" ${goMap(repo, map)}>
      <div><p class="eyebrow">Map · #${map.number}${map.closed ? ' · completed' : ''}</p><h2>${esc(map.title)}</h2></div>
      <p class="dest">${esc(map.dest)}</p>${summary(map.counts)}</a>`;
  }

  function repoBody(s, { head = true } = {}) {
    const repo = repoOf(s.repo);
    return `<div class="sheet">
      ${head ? `<div class="page-head"><div class="grow"><p class="eyebrow">Repository</p><h1 class="nv-h1">${repoMark(repo, 26)}${esc(repo.name)}</h1></div></div>` : ''}
      <div class="map-grid">${repo.maps.map((m) => mapCard(repo, m)).join('')}</div>
    </div>`;
  }

  function protoTile(repo, p) {
    return `<a class="card nv-proto" href="#" data-to="prototype #${p.ticket} full size">
      <span class="nv-thumb${p.img ? ' has-img' : ''}">${p.img ? '<img src="../assets/home-b.png" alt="">' : `<i></i><i></i><i></i>`}</span>
      <span class="nv-proto-body"><span class="eyebrow">#${p.ticket} · map #${p.map} · ${esc(p.date)}</span><strong>${esc(p.title)}</strong><span class="nv-meta">${esc(p.gist)}</span></span></a>`;
  }

  function protosBody(s, { head = true, map = null } = {}) {
    const repo = repoOf(s.repo);
    const list = repo.prototypes.filter((p) => map === null || p.map === map);
    return `<div class="sheet">
      ${head ? `<div class="page-head"><div class="grow"><p class="eyebrow">Prototypes${map === null ? '' : ` · map #${map}`}</p><h1 class="nv-h1">${repoMark(repo, 26)}${esc(repo.name)}</h1><p>Every prototype a ticket in this repository left behind.</p></div></div>` : ''}
      ${list.length ? `<div class="nv-proto-grid">${list.map((p) => protoTile(repo, p)).join('')}</div>` : `<div class="empty"><strong>No prototypes yet</strong><p>Prototype tickets leave their work on a prototype/&lt;n&gt;-&lt;slug&gt; branch.</p></div>`}
    </div>`;
  }

  function newBody(s) {
    const repo = repoOf(s.repo);
    return `<div class="sheet nv-new">
      <div class="page-head"><div class="grow"><p class="eyebrow">Start a new map</p><h1>Where should this map go?</h1>
        <p>Describe the destination. T3 Code opens a planning thread in the repository's clone and drafts the map with you.</p></div></div>
      <div class="field"><label>Repository</label><div class="row"><input class="input" value="${esc(repo.name)}" /><button class="ghost" data-to="the repository picker">Change</button></div></div>
      <div class="field"><label>Destination</label><textarea class="input nv-textarea" placeholder="e.g. Users can export a map as a shareable image"></textarea></div>
      <p class="hint">Runs as Mid in T3 Code · clone at C:\\src\\${esc(short(repo.name))}</p>
      <div class="nv-actions"><button class="primary" data-to="T3 Code with a planning thread">${icon('play')}Start in T3 Code</button><button class="ghost" data-to="the clipboard">${icon('copy')}Copy prompt</button></div>
    </div>`;
  }

  /* ---------- the map page ---------- */

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
      <span class="node-top"><span class="glyph">${icon(TYPES[t.type][1])}</span><span class="num">#${t.number}</span><span class="chip" style="--accent: var(${st.v})">${icon(st.icon)}${st.label}</span></span>
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
    const chip = (label, n, st, on) =>
      `<button type="button" class="fchip${on ? ' is-on' : ''}"${st ? ` style="--accent: var(${STATES[st].v})"` : ''}${n === 0 && !on ? ' disabled' : ''}>${st ? icon(STATES[st].icon) : ''}${label} <b>${n}</b></button>`;
    const types = Object.entries(TYPES).map(([k, [label, ic]]) => `<button type="button" class="fchip">${icon(ic)}${label} <b>${(map.tickets ?? []).filter((t) => t.type === k).length}</b></button>`);
    return `<div class="filters">${chip('All', total(c), null, true)}${['frontier', 'claimed', 'blocked', 'done'].map((s) => chip(STATES[s].long, c[s], s)).join('')}<span class="filter-sep" role="none"></span>${types.join('')}</div>`;
  }

  function inspector(repo, map) {
    return `<aside class="inspector"><div class="insp-tabs"><div class="segmented"><button class="seg is-on">Brief</button><button class="seg" disabled>Ticket</button></div></div>
      <div class="insp-panel brief"><p class="eyebrow">Map · #${map.number}</p><h1>${esc(map.title)}</h1>${summary(map.counts)}
      <div class="tabs nv-insp-tabs"><button class="tab is-on">Destination</button><button class="tab">Not yet specified</button><button class="tab">Decided</button></div>
      <div class="prose"><p>${esc(map.dest)}</p></div></div></aside>`;
  }

  function tableView(map) {
    return `<div class="nv-table"><table><thead><tr><th>#</th><th>Title</th><th>Type</th><th>State</th></tr></thead><tbody>${map.tickets
      .map(
        (t) =>
          `<tr><td class="num">#${t.number}</td><td>${esc(t.title)}</td><td><span class="nv-cell">${icon(TYPES[t.type][1])}${TYPES[t.type][0]}</span></td><td><span class="chip" style="--accent: var(${STATES[t.state].v});margin:0">${icon(STATES[t.state].icon)}${STATES[t.state].label}</span></td></tr>`,
      )
      .join('')}</tbody></table></div>`;
  }

  /** The map page's body under the topbar: filters, canvas (or table / prototypes) and inspector. */
  function mapBody(s) {
    const repo = repoOf(s.repo);
    const map = mapOf(repo, s.map);
    if (!map.tickets) map.tickets = MAP_35.slice(0, 0);
    const laid = mapLayout(map.tickets);
    const stage =
      s.mapView === 'table'
        ? tableView(map)
        : s.mapView === 'prototypes'
          ? `<div class="nv-stage-scroll">${protosBody(s, { head: false, map: map.number })}</div>`
          : `<div class="canvas-wrap nv-canvas"><div class="canvas" style="width:1560px;height:720px"><svg class="edges" width="1560" height="720">${edges(laid)}</svg><div class="nodes">${laid
              .map(nodeHtml)
              .join('')}</div></div>${
              laid.length ? '' : '<div class="empty" style="position:absolute;inset:40px">This map is fake in the prototype: open map #35 to see tickets.</div>'
            }</div>
            <div class="keybox"><button type="button" class="floatbox keybtn">${icon('info')}Key</button></div>
            <div class="zoom floatbox"><button class="iconbtn">${icon('minus')}</button><button class="iconbtn pct">100%</button><button class="iconbtn">${icon('plus')}</button></div>`;
    return `${s.mapView === 'map' || !s.mapView ? filters(map) : ''}<div class="body"><section class="stage">${stage}</section>${inspector(repo, map)}</div>`;
  }

  /* ---------- menus and the jump palette ---------- */

  function repoMenu(s, view = 'repo') {
    return REPOS.map(
      (r) => `<button type="button" class="menu-item${r.name === s.repo ? ' is-on' : ''}" ${goRepo(r, view)}>${repoMark(r)}<span class="grow">${esc(r.name)}</span><span class="nv-meta">${r.maps.length}</span></button>`,
    ).join('');
  }

  function mapMenu(s) {
    const repo = repoOf(s.repo);
    return `<div class="menu-label">Maps in ${esc(short(repo.name))}</div>${repo.maps
      .map(
        (m) =>
          `<button type="button" class="menu-item${s.view === 'map' && m.number === s.map ? ' is-on' : ''}" ${goMap(repo, m)}>${miniRing(m.counts)}<span class="grow">#${m.number} ${esc(m.title)}</span></button>`,
      )
      .join('')}<div class="menu-sep"></div><button type="button" class="menu-item" ${go('new')}>${icon('plus')}<span class="grow">Start a new map</span></button>`;
  }

  function paletteItems(query) {
    const q = query.trim().toLowerCase();
    const items = [{ label: 'Start a new map', meta: 'Action', attrs: go('new'), ic: 'plus' }, { label: 'Home', meta: 'Page', attrs: go('home'), ic: 'home' }];
    for (const r of REPOS) {
      items.push({ label: r.name, meta: 'Repository', attrs: goRepo(r), mark: r });
      for (const m of r.maps) items.push({ label: `#${m.number} ${m.title}`, meta: `Map · ${short(r.name)}`, attrs: goMap(r, m), ring: m.counts });
    }
    for (const t of MAP_35) items.push({ label: `#${t.number} ${t.title}`, meta: 'Ticket · map #35', attrs: goMap(REPOS[0], REPOS[0].maps[0]), ic: TYPES[t.type][1] });
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
    Kit.fillIcons(list);
  }

  function openPalette() {
    closeMenus();
    let el = document.querySelector('.nv-palette');
    if (!el) {
      el = document.createElement('div');
      el.className = 'nv-palette';
      el.innerHTML = `<div class="nv-palette-box" role="dialog" aria-label="Jump to"><label class="search nv-palette-search">${icon('lens')}<input type="search" placeholder="Jump to a repository, map or ticket…" autocomplete="off"><kbd>Esc</kbd></label><div class="nv-palette-list"></div></div>`;
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
    repo: REPOS[0].name,
    map: 35,
    mapView: params.get('mapview') ?? 'map',
    expanded: {},
  };
  let shell = null;

  function render() {
    closePalette();
    document.getElementById('root').innerHTML = shell(state, body(state));
    Kit.fillIcons();
    document.querySelector('.page')?.scrollTo(0, 0);
  }

  function body(s, opts) {
    switch (s.view) {
      case 'repo':
        return repoBody(s, opts);
      case 'protos':
        return protosBody(s, opts);
      case 'new':
        return newBody(s, opts);
      case 'map':
        return mapBody(s, opts);
      default:
        return homeBody(s, opts);
    }
  }

  document.addEventListener('click', (e) => {
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
      state.mapView = link.dataset.mapview ?? (link.dataset.view === 'map' && !link.dataset.map ? state.mapView : 'map');
      if (link.dataset.repo) state.expanded[link.dataset.repo] = true;
      render();
      return;
    }
    if (!e.target.closest('.menu')) closeMenus();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openPalette();
    } else if (e.key === 'Escape') {
      closePalette();
      closeMenus();
    }
  });

  window.NAV = {
    STATES,
    REPOS,
    icon,
    esc,
    repoOf,
    mapOf,
    short,
    repoMark,
    ring,
    miniRing,
    go,
    goRepo,
    goMap,
    repoMenu,
    mapMenu,
    body,
    state,
    render,
    /** The next ticket to start on the current map: the first frontier ticket. */
    nextTicket: (s) => (mapOf(repoOf(s.repo), s.map).tickets ?? []).find((t) => t.state === 'frontier') ?? null,
    start(fn) {
      shell = fn;
      state.expanded[state.repo] = true;
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
      else render();
    },
  };
})();
