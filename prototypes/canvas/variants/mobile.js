/*
  PROTOTYPE (#223): following a map on a phone. One page, three directions.
  ?v=A|B|C picks the direction, ?screen=signin|repos|maps|map|ticket picks where it opens,
  ?state=expired|offline|empty|loading shows an edge state. Every tap is fake; nothing calls GitHub.
*/
(() => {
  const params = new URLSearchParams(location.search);
  const V = ['A', 'B', 'C'].includes(params.get('v')) ? params.get('v') : 'A';
  const EDGE = params.get('state');
  // ?remix=filter: round 2's R-C, with a "Filter by" button instead of repo chips.
  const REMIX = params.get('remix');
  const D = window.MOBILE;
  const S = window.STATES;
  const esc = Kit.esc;
  const ic = Kit.icon;

  const ticketBy = (n) => D.tickets.find((t) => t.number === n);
  const map = D.maps[0];
  const counts = () => Object.fromEntries(STATE_ORDER.map((s) => [s, D.tickets.filter((t) => t.state === s).length]));

  /* ---------- navigation ---------- */
  const start = params.get('screen') ?? 'signin';
  const stack = [{ screen: start, ticket: Number(params.get('ticket') ?? 223), repo: D.repos[0].name }];
  const ui = { signin: 0, mapTab: 'path', ticketTab: 'overview', filter: 'all', sheet: params.get('sheet') ?? null, selected: 223, zoom: 0.8, panX: 8, panY: 12, mapsFilter: 'All', picker: params.get('picker') === '1' };
  const here = () => stack[stack.length - 1];
  function go(screen, extra = {}) {
    stack.push({ ...here(), screen, ...extra });
    ui.ticketTab = 'overview';
    render();
  }
  function back() {
    if (stack.length > 1) stack.pop();
    else if (here().screen === 'ticket') here().screen = 'map';
    else if (here().screen === 'map') here().screen = V === 'A' ? 'maps' : 'repos';
    else if (here().screen === 'maps') here().screen = 'repos';
    render();
  }

  /* ---------- shared pieces ---------- */
  const status = () => `<div class="m-status" aria-hidden="true"><span>9:41</span><span>●●● ▮</span></div>`;
  const chip = (state) => `<span class="m-chip" style="--accent: var(${S[state].variable})">${ic(S[state].icon)}${S[state].label}</span>`;
  const glyph = (type) => `<span class="m-glyph" title="${type}">${ic(TYPE_ICON[type])}<span class="m-sr">${type}</span></span>`;
  const dot = (state) => `<span class="m-dot" style="--accent: var(${S[state].variable})">${ic(S[state].icon)}</span>`;
  const backBtn = (label) => `<button class="m-back" data-act="back" aria-label="Back to ${esc(label)}"><span class="m-back-face">${ic('back')}${esc(label)}</span></button>`;
  const bar = (title, left = '', right = '<span style="width:44px"></span>') =>
    `<header class="m-bar">${left || '<span style="width:44px"></span>'}<h1>${esc(title)}</h1>${right}</header>`;
  const largeBar = (title, left = '', right = '') =>
    `<header class="m-bar is-large"><div class="m-bar-row">${left || '<span></span>'}${right}</div><h1>${esc(title)}</h1></header>`;
  const avatar = `<button class="m-icon-btn" data-toast="Account: signed in as @${D.user.login}. Sign out lives here." aria-label="Account, signed in as ${D.user.login}"><span class="avatar" style="width:30px;height:30px">${D.user.initial}</span></button>`;
  const cached = EDGE === 'offline' ? `<div class="m-cached" role="status">${ic('refresh')}<span>Offline. Showing what GitHub sent 18 min ago.</span></div>` : '';

  function progress(c, total, withLegend = true) {
    const segs = PROGRESS_ORDER.filter((s) => c[s] > 0)
      .map((s) => `<span style="--accent: var(${S[s].variable}); flex:${c[s]}"></span>`)
      .join('');
    const legend = withLegend
      ? `<div class="m-legend">${PROGRESS_ORDER.map((s) => `<span class="m-chip" style="--accent: var(${S[s].variable})">${ic(S[s].icon)}${c[s]} ${S[s].short}</span>`).join('')}</div>`
      : '';
    return `<div class="m-progress" role="img" aria-label="${c.done} of ${total} done, ${c.claimed} claimed, ${c.frontier} next up, ${c.blocked} blocked">${segs}</div>${legend}`;
  }

  function ring(c, total, size = 52) {
    const stroke = 6;
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    let offset = 0;
    const arcs = PROGRESS_ORDER.filter((s) => c[s] > 0)
      .map((s) => {
        const len = (c[s] / total) * circ;
        const arc = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(${S[s].variable})" stroke-width="${stroke}" stroke-dasharray="${Math.max(len - 2, 0)} ${circ}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
        offset += len;
        return arc;
      })
      .join('');
    return `<svg class="m-ring" width="${size}" height="${size}" role="img" aria-label="${c.done} of ${total} done">${arcs}<text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-size="13" font-weight="600" fill="var(--text-primary)">${c.done}/${total}</text></svg>`;
  }

  const mapCounts = (m) => (m.number === map.number ? counts() : m.counts);
  const mapTotal = (m) => Object.values(mapCounts(m)).reduce((a, b) => a + b, 0);
  const nextUp = () => D.tickets.filter((t) => t.state === 'frontier');

  /* ---------- sign-in ---------- */
  function code() {
    return `<div class="m-code" aria-label="Device code ${D.deviceCode.split('').join(' ')}">${D.deviceCode
      .split('')
      .map((ch) => (ch === '-' ? '<span class="dash">–</span>' : `<span>${ch}</span>`))
      .join('')}</div>`;
  }

  function expired() {
    return `${status()}<div class="m-hero" role="alert">
      <div class="m-logo" style="background:var(--state-blocked);color:#000">${ic('refresh')}</div>
      <h2>That code expired</h2><p>GitHub codes last 15 minutes. Get a new one and try again.</p></div>
      <div class="m-foot"><button class="m-btn" data-act="restart">Get a new code</button></div>`;
  }

  function signin() {
    if (EDGE === 'expired') return expired();
    const step = ui.signin;
    if (V === 'A') {
      if (step === 0)
        return `${status()}<div class="m-hero"><div class="m-logo">${ic('compass')}</div><h2>Wayfinder</h2><p>Follow your maps from anywhere.</p></div>
          <div class="m-foot"><button class="m-btn is-dark" data-act="signin-next">${ic('github')}Sign in with GitHub</button>
          <p class="m-fine">Wayfinder reads your repos and issues through GitHub.</p></div>`;
      return `${status()}${bar('Sign in', backBtn('Back').replace('data-act="back"', 'data-act="signin-prev"'))}
        <div class="m-hero" style="justify-content:flex-start;padding-top:24px">
          <p>Enter this code on GitHub to let Wayfinder read your maps.</p>${code()}
          <p class="m-fine">Expires in 14:52</p></div>
        <div class="m-foot">${
          step === 1
            ? `<button class="m-btn" data-act="signin-wait">${ic('copy')}Copy code and open GitHub</button>`
            : `<button class="m-btn is-quiet" data-act="signin-done" aria-live="polite"><span class="m-spinner" aria-hidden="true"></span>Waiting for GitHub…</button><p class="m-fine">Approve on github.com/login/device. This screen moves on by itself.</p>`
        }</div>`;
    }
    if (V === 'B') {
      if (step === 0)
        return `${status()}<div class="m-hero" style="align-items:flex-start;text-align:left">
          <div class="m-logo">${ic('compass')}</div><h2>Your maps, in your pocket</h2>
          <ul class="m-features">
            <li><span class="m-dot">${ic('layers')}</span><div><b>Follow maps</b><span>See what’s next, claimed and blocked, even with your PC off.</span></div></li>
            <li><span class="m-dot">${ic('play')}</span><div><b>Start tickets</b><span>Your desktop runs them in T3 Code.</span></div></li>
            <li><span class="m-dot">${ic('bell')}</span><div><b>Know when you’re needed</b><span>Get a push when a ticket needs you.</span></div></li>
          </ul></div>
          <div class="m-foot"><button class="m-btn is-dark" data-act="signin-wait">${ic('github')}Continue with GitHub</button></div>`;
      const done = step > 1;
      return `${status()}${bar('Sign in', backBtn('Back').replace('data-act="back"', 'data-act="signin-prev"'))}
        <div class="m-scroll"><div class="m-hero" style="padding:12px 4px 0">${code()}
          <ol class="m-steps" aria-label="Sign-in steps">
            <li class="is-done"><span class="m-step-mark">${ic('check')}</span><div>Code copied</div></li>
            <li class="${done ? 'is-done' : 'is-now'}" aria-current="${done ? 'false' : 'step'}"><span class="m-step-mark">${done ? ic('check') : '2'}</span><div>Paste it on GitHub and approve<div class="m-row-sub">github.com/login/device</div></div></li>
            <li class="${done ? 'is-now' : ''}"><span class="m-step-mark">${done ? '<span class="m-spinner"></span>' : '3'}</span><div>${done ? 'Signing you in…' : 'You’re in'}</div></li>
          </ol></div></div>
        <div class="m-foot"><button class="m-btn" data-act="${done ? 'signin-done' : 'signin-wait2'}">${ic('external')}${done ? 'Continue' : 'Open GitHub'}</button></div>`;
    }
    // C: one screen, code up front.
    return `${status()}<div class="m-hero">
        <div class="m-logo" style="width:56px;height:56px;border-radius:16px">${ic('compass')}</div>
        <h2 style="font-size:24px">Sign in to Wayfinder</h2>
        <p>Your code is copied. Paste it on GitHub.</p>${code()}
        <p class="m-fine">${step > 0 ? '<span class="m-spinner" style="display:inline-block;vertical-align:-4px;margin-right:6px"></span>Waiting for you to approve…' : 'Expires in 14:52'}</p></div>
      <div class="m-foot"><button class="m-btn is-dark" data-act="${step > 0 ? 'signin-done' : 'signin-wait'}">${ic('github')}Open GitHub</button>
      <button class="m-link" data-toast="Copied ${D.deviceCode}">Copy code again</button></div>`;
  }

  /* ---------- repos and maps ---------- */
  function repoRows() {
    return D.repos
      .map(
        (r) => `<button class="m-row" data-act="repo" data-repo="${esc(r.name)}"><span class="m-dot" style="--accent: var(--text-secondary)">${ic('github')}</span>
          <span class="m-row-main"><span class="m-row-title">${esc(r.name.split('/')[1])}</span><span class="m-row-sub">${r.maps === 0 ? 'No maps' : `${r.maps} map${r.maps === 1 ? '' : 's'} · ${r.open} open tickets`} · ${r.updated}</span></span>${ic('chevron')}</button>`,
      )
      .join('');
  }

  function mapRow(m, opts = {}) {
    const c = mapCounts(m);
    const total = mapTotal(m);
    return `<button class="m-row" data-act="map" style="align-items:flex-start;flex-wrap:wrap">
      <span class="m-row-main"><span class="m-row-title">${esc(m.title)}</span>
      <span class="m-row-sub">${opts.repo ? `${esc(m.repo.split('/')[1])} · ` : ''}#${m.number} · ${c.done}/${total} done · ${m.updated}</span>
      <span style="display:block;margin-top:8px">${progress(c, total, false)}</span></span>${opts.star ? `<span class="m-icon-btn" role="img" aria-label="${m.followed ? 'Following' : 'Not following'}" style="color:${m.followed ? 'var(--state-blocked)' : 'var(--text-muted)'};width:32px;height:32px">${ic('star')}</span>` : ic('chevron')}</button>`;
  }

  function emptyMaps() {
    return `<div class="m-empty"><b>No maps here yet</b>Start a map in Wayfinder on your desktop. It shows up here once its issue is on GitHub.</div>`;
  }

  function loadingRows() {
    return `<div class="m-group" aria-busy="true" aria-label="Loading">${[1, 2, 3]
      .map(() => `<div class="m-row"><span class="m-dot" style="--accent:var(--baseline)"></span><span class="m-row-main"><div class="m-skel" style="width:60%"></div><div class="m-skel" style="width:40%;margin-top:8px;height:10px"></div></span></div>`)
      .join('')}</div>`;
  }

  function repos() {
    if (V === 'A') {
      const body = EDGE === 'loading' ? loadingRows() : EDGE === 'empty' ? emptyMaps() : `<div class="m-group">${repoRows()}</div>`;
      return `${status()}${largeBar('Repositories', '', avatar)}${cached}<div class="m-scroll">
        <div class="m-search">${ic('search')}<input aria-label="Search repositories" placeholder="Search"></div>
        <div class="m-section-title">With maps</div>${body}</div>`;
    }
    if (V === 'B') {
      const followed = D.maps.filter((m) => m.followed);
      const cards =
        EDGE === 'empty'
          ? `<div class="m-empty"><b>Follow a map to see it here</b>Browse your repositories and tap the star on a map.</div>`
          : EDGE === 'loading'
            ? loadingRows()
            : followed
                .map((m) => {
                  const c = mapCounts(m);
                  const n = m.number === map.number ? nextUp()[0] : null;
                  return `<button class="m-card" data-act="map"><div style="display:flex;gap:14px;align-items:center">${ring(c, mapTotal(m))}
                    <div class="m-row-main"><h3>${esc(m.title)}</h3><div class="m-row-sub">${esc(m.repo.split('/')[1])} · #${m.number} · ${m.updated}</div></div></div>
                    ${n ? `<div class="m-next">${dot('frontier')}<span class="m-row-main"><b>Next:</b> #${n.number} ${esc(n.title)}</span></div>` : c.frontier ? `<div class="m-next">${dot('frontier')}<span class="m-row-main">${c.frontier} ready to start</span></div>` : ''}</button>`;
                })
                .join('');
      return `${status()}${largeBar('Following', '', avatar)}${cached}<div class="m-scroll">${cards}
        <button class="m-btn is-quiet" data-act="browse" style="margin-top:4px">${ic('plus')}Follow another map</button></div>`;
    }
    if (REMIX === 'filter') return reposFiltered();
    // C: every map from every repo in one list.
    const repoNames = ['All', ...new Set(D.maps.map((m) => m.repo.split('/')[1]))];
    const shown = D.maps.filter((m) => ui.mapsFilter === 'All' || m.repo.endsWith(`/${ui.mapsFilter}`));
    const body = EDGE === 'loading' ? loadingRows() : EDGE === 'empty' ? emptyMaps() : `<div class="m-group">${shown.map((m) => mapRow(m, { repo: true })).join('')}</div>`;
    return `${status()}${largeBar('Maps', '', avatar)}${cached}<div class="m-scroll">
      <div class="m-search">${ic('search')}<input aria-label="Search maps" placeholder="Search maps and repos"></div>
      <div class="m-filter" role="group" aria-label="Filter by repository">${repoNames.map((r) => `<button data-act="maps-filter" data-f="${esc(r)}" aria-pressed="${ui.mapsFilter === r}">${esc(r)}</button>`).join('')}</div>
      <div class="m-section-title">Recently active</div>${body}</div>`;
  }

  // Round 2 R-C: all maps, latest first; "Filter by" opens a sheet to narrow to one repo.
  const minutesAgo = (s) => {
    const [n, unit] = s.replace('yesterday', '1 day').split(' ');
    return Number(n) * ({ min: 1, hour: 60, hours: 60, day: 1440, days: 1440, week: 10080, weeks: 10080 }[unit] ?? 1);
  };
  function reposFiltered() {
    const shown = D.maps.filter((m) => ui.mapsFilter === 'All' || m.repo === ui.mapsFilter).sort((a, b) => minutesAgo(a.updated) - minutesAgo(b.updated));
    const label = ui.mapsFilter === 'All' ? 'All maps' : ui.mapsFilter.split('/')[1];
    const body = EDGE === 'loading' ? loadingRows() : EDGE === 'empty' ? emptyMaps() : `<div class="m-group">${shown.map((m) => mapRow(m, { repo: ui.mapsFilter === 'All' })).join('')}</div>`;
    return `${status()}${largeBar('Maps', '', avatar)}${cached}<div class="m-scroll">
      <div class="m-search">${ic('search')}<input aria-label="Search maps" placeholder="Search maps and repos"></div>
      <div class="m-filter-row"><button class="m-filter-btn" data-act="filter-open" aria-haspopup="dialog" aria-label="Filter by repository, showing ${esc(label)}">${ic('filter')}<span>Filter by</span><b>${esc(label)}</b>${ic('down')}</button></div>
      <div class="m-section-title">${ui.mapsFilter === 'All' ? 'Latest' : `${shown.length} map${shown.length === 1 ? '' : 's'} · latest first`}</div>${body}</div>${ui.picker ? repoPicker() : ''}`;
  }
  function repoPicker() {
    const opts = [{ value: 'All', name: 'All maps', sub: `${D.maps.length} maps · every repository` }, ...D.repos.filter((r) => r.maps > 0).map((r) => ({ value: r.name, name: r.name.split('/')[1], sub: `${r.maps} map${r.maps === 1 ? '' : 's'}` }))];
    return `<div class="m-scrim" data-act="filter-close"></div><section class="m-sheet" role="dialog" aria-label="Filter by repository">
      <button class="m-grab" data-act="filter-close" aria-label="Close"></button>
      <div class="m-scroll"><h2 class="m-sheet-title">Filter by repository</h2><div class="m-group">${opts
        .map((o) => `<button class="m-row" data-act="maps-pick" data-f="${esc(o.value)}" aria-pressed="${ui.mapsFilter === o.value}"><span class="m-row-main"><span class="m-row-title">${esc(o.name)}</span><span class="m-row-sub">${esc(o.sub)}</span></span>${ui.mapsFilter === o.value ? `<span class="m-pick">${ic('check')}</span>` : ''}</button>`)
        .join('')}</div></div></section>`;
  }

  // B: "Follow another map" browses repositories, then stars maps.
  const reposBrowse = () => `${status()}${bar('Repositories', backBtn('Following'))}<div class="m-scroll"><div class="m-group">${repoRows()}</div></div>`;

  // A and B: the maps inside one repository.
  function maps() {
    const repo = here().repo;
    const list = D.maps.filter((m) => m.repo === repo);
    const short = repo.split('/')[1];
    return `${status()}${bar(short, backBtn(V === 'B' ? 'Following' : 'Repos'))}<div class="m-scroll">
      <div class="m-section-title">${list.length} map${list.length === 1 ? '' : 's'}</div>
      ${list.length ? `<div class="m-group">${list.map((m) => mapRow(m, { star: V === 'B' })).join('')}</div>` : emptyMaps()}
      ${V === 'B' ? '<p class="m-fine" style="margin-top:12px">Starred maps show on Following.</p>' : ''}</div>`;
  }

  /* ---------- map view ---------- */
  function ticketRow(t) {
    const why = t.state === 'blocked' ? `Needs ${t.needs.map((n) => `#${n}`).join(', ')}` : t.state === 'claimed' ? `@${t.assignee}` : t.type;
    return `<button class="m-row" data-act="ticket" data-n="${t.number}" style="align-items:flex-start">${glyph(t.type)}
      <span class="m-row-main"><span class="m-row-title">${esc(t.title)}</span><span class="m-row-sub"><span class="m-num">#${t.number}</span> · ${esc(why)}</span></span>${ic('chevron')}</button>`;
  }

  function mapHead(lines = 2) {
    const c = counts();
    return `<div class="m-maphead"><p style="display:-webkit-box;-webkit-line-clamp:${lines};-webkit-box-orient:vertical;overflow:hidden">${esc(map.destination)}</p>${progress(c, D.tickets.length)}</div>`;
  }

  function stateList() {
    return STATE_ORDER.map((s) => {
      const list = D.tickets.filter((t) => t.state === s);
      if (!list.length) return '';
      const open = s !== 'done' || ui.showDone;
      return `<div class="m-section-title" style="--accent: var(${S[s].variable})">${chip(s)}<span>${list.length}</span>${
        s === 'done' ? `<button class="m-link" style="margin-left:auto;min-height:44px;text-transform:none;letter-spacing:0" data-act="toggle-done" aria-expanded="${open}">${open ? 'Hide' : 'Show'}</button>` : ''
      }</div>${open ? `<div class="m-group">${list.map(ticketRow).join('')}</div>` : ''}`;
    }).join('');
  }

  function layered() {
    const layers = [...new Set(D.tickets.map((t) => t.layer))].sort();
    return layers
      .map((l) => {
        const list = D.tickets.filter((t) => t.layer === l);
        return `<div class="m-layer"><div class="m-layer-label">${l === 0 ? 'Can start now or already moving' : `Step ${l + 1} · after step ${l}`}</div>${list
          .map(
            (t) => `<button class="m-tile${t.state === 'done' ? ' is-done' : ''}" data-act="ticket" data-n="${t.number}" style="--accent: var(${S[t.state].variable})">${glyph(t.type)}
            <span class="m-row-main">${esc(t.title)}<span class="m-row-sub"><span class="m-num">#${t.number}</span>${chip(t.state)}${t.needs.length ? `<span>needs ${t.needs.map((n) => `#${n}`).join(' ')}</span>` : ''}</span></span></button>`,
          )
          .join('')}</div>`;
      })
      .join('');
  }

  function brief() {
    const block = (title, items) => `<div class="m-section-title">${title}</div><div class="m-card m-prose"><ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`;
    return `<div class="m-section-title">Destination</div><div class="m-card m-prose">${esc(map.destination)}</div>
      ${block('Decided', ['Tickets run on your desktop, not in the cloud.', 'Built with Expo for iOS and Android.', 'The phone reads GitHub directly.'])}
      ${block('Not yet specified', ['How the phone reaches the PC securely.', 'Where pushes come from.'])}
      ${block('Out of scope', ['Answering grilling tickets from the phone.', 'Starting a new map on the phone.'])}`;
  }

  // B: a pan-and-zoom graph, like the desktop map, sized for a thumb.
  function graph() {
    const W = 150;
    const H = 86;
    const pos = {};
    const byLayer = {};
    for (const t of D.tickets) (byLayer[t.layer] ??= []).push(t);
    for (const [l, list] of Object.entries(byLayer)) list.forEach((t, i) => (pos[t.number] = { x: Number(l) * W, y: i * H }));
    const sel = ui.selected;
    const edges = D.tickets
      .flatMap((t) =>
        t.needs.map((n) => {
          const a = pos[n];
          const b = pos[t.number];
          if (!a || !b) return '';
          const live = n === sel || t.number === sel;
          return `<path class="${live ? 'is-live' : ''}" d="M${a.x + 132} ${a.y + 32} C ${a.x + 141} ${a.y + 32}, ${b.x - 9} ${b.y + 32}, ${b.x} ${b.y + 32}"/>`;
        }),
      )
      .join('');
    const nodes = D.tickets
      .map((t) => {
        const p = pos[t.number];
        return `<button class="m-node${t.state === 'done' ? ' is-done' : ''}" data-act="select" data-n="${t.number}" aria-pressed="${t.number === sel}" style="left:${p.x}px;top:${p.y}px;--accent: var(${S[t.state].variable})">
          <span class="m-chip" style="font-size:11px">${ic(S[t.state].icon)}<span class="m-num">#${t.number}</span></span><span class="t">${esc(t.title)}</span><span class="m-sr">${S[t.state].label}</span></button>`;
      })
      .join('');
    return `<div class="m-graph" data-pan><div class="m-graph-tools"><button class="m-icon-btn" data-act="zoom-in" aria-label="Zoom in">+</button><button class="m-icon-btn" data-act="zoom-out" aria-label="Zoom out">−</button><button class="m-icon-btn" data-act="fit" aria-label="Fit map">${ic('layers')}</button></div>
      <div class="m-graph-inner" style="transform:translate(${ui.panX}px,${ui.panY}px) scale(${ui.zoom})"><svg class="m-edges" width="700" height="600">${edges}</svg>${nodes}</div></div>`;
  }

  function mapView() {
    const top = (extra = '') => `${status()}${bar(map.title, backBtn(V === 'B' ? 'Following' : V === 'C' ? 'Maps' : 'Maps'), `<button class="m-icon-btn" data-toast="Would open #${map.number} on GitHub" aria-label="Open map on GitHub">${ic('external')}</button>`)}${extra}${cached}`;
    if (V === 'A') return `${top()}<div class="m-scroll">${mapHead()}${stateList()}</div>`;
    if (V === 'B') {
      const t = ticketBy(ui.selected);
      const c = counts();
      return `${top(`<div style="padding:0 16px 10px">${progress(c, D.tickets.length)}</div>`)}${graph()}
        ${ui.sheet ? sheetTicket() : `<div class="m-peek"><button class="m-grab" data-act="open-sheet" aria-label="Open ticket #${t.number}"></button>
        <button class="m-row" data-act="open-sheet" style="padding:0;border:0">${dot(t.state)}<span class="m-row-main"><span class="m-row-title">${esc(t.title)}</span><span class="m-row-sub">#${t.number} · ${S[t.state].label}</span></span>${ic('chevron')}</button></div>`}`;
    }
    const tabs = [
      ['path', 'Path'],
      ['tickets', 'Tickets'],
      ['brief', 'Brief'],
    ];
    const body =
      ui.mapTab === 'path'
        ? `${mapHead(2)}${layered()}`
        : ui.mapTab === 'tickets'
          ? `<div class="m-filter" role="group" aria-label="Filter by state">${['all', ...STATE_ORDER].map((s) => `<button data-act="filter" data-f="${s}" aria-pressed="${ui.filter === s}">${s === 'all' ? `All ${D.tickets.length}` : `${S[s].label} ${counts()[s]}`}</button>`).join('')}</div>
             <div class="m-group" style="margin-top:12px">${D.tickets.filter((t) => ui.filter === 'all' || t.state === ui.filter).sort((a, b) => a.number - b.number).map((t) => ticketRow(t).replace(glyph(t.type), dot(t.state))).join('')}</div>`
          : brief();
    return `${top(`<div style="padding:0 16px 10px"><div class="m-seg" role="tablist" aria-label="Map view">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${ui.mapTab === k}" data-act="map-tab" data-tab="${k}">${l}</button>`).join('')}</div></div>`)}<div class="m-scroll" role="tabpanel">${body}</div>`;
  }

  /* ---------- ticket detail ---------- */
  function bannerFor(t) {
    if (t.state === 'blocked') return `<div class="m-banner" style="--accent: var(--state-blocked)">${ic('lock')}<span>Waiting on <b>${t.needs.map((n) => `#${n}`).join(' and ')}</b>.</span></div>`;
    if (t.state === 'claimed') return `<div class="m-banner" style="--accent: var(--state-claimed)">${ic('person')}<span><b>@${esc(t.assignee)}</b> is on it.</span></div>`;
    if (t.state === 'done') return `<div class="m-banner" style="--accent: var(--state-done)">${ic('check')}<span>This ticket is closed.</span></div>`;
    return `<div class="m-banner" style="--accent: var(--state-frontier)">${ic('arrow')}<span>Open, unblocked and unclaimed: ready to start.</span></div>`;
  }

  const pills = (list) => (list.length ? list.map((n) => { const x = ticketBy(n); return `<button class="m-pill" data-act="ticket" data-n="${n}" style="--accent: var(${S[x?.state ?? 'done'].variable})" aria-label="#${n}, ${S[x?.state ?? 'done'].label}">#${n}</button>`; }).join('') : '<span class="m-fine">None</span>');

  function overview(t) {
    const body = t.body ?? { question: 'Placeholder body: the ticket’s question from GitHub, rendered as Markdown.', done: ['Done-when items render as a list.'] };
    return `<div class="m-prose"><h4>Question</h4><p>${esc(body.question)}</p><h4>Done when</h4><ul>${body.done.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></div>`;
  }
  const relations = (t) => `<dl class="m-rel"><div><dt>Needs</dt><dd>${pills(t.needs)}</dd></div><div><dt>Unblocks</dt><dd>${pills(t.unblocks)}</dd></div></dl>`;
  const startSlot = `<div class="m-slot" role="note">${ic('play')}Start and watch: designed in #224</div>`;
  const head = (t) => `<div class="m-dhead">${glyph(t.type)}<span class="m-num">#${t.number} · ${t.type}</span>${chip(t.state)}</div><h2 class="m-dtitle">${esc(t.title)}</h2>`;

  function ticketPage() {
    const t = ticketBy(here().ticket);
    const gh = `<button class="m-icon-btn" data-toast="Would open #${t.number} on GitHub" aria-label="Open on GitHub">${ic('external')}</button>`;
    if (V === 'C') {
      const tabs = [
        ['overview', 'Overview'],
        ['links', `Links ${t.needs.length + t.unblocks.length}`],
        ['activity', `Activity ${D.comments.length}`],
      ];
      const body =
        ui.ticketTab === 'overview'
          ? `${bannerFor(t)}${overview(t)}`
          : ui.ticketTab === 'links'
            ? relations(t)
            : D.comments.map((c) => `<div class="m-comment"><b>@${esc(c.author)}</b><span class="m-num">${c.when}</span><div>${esc(c.text)}</div></div>`).join('');
      return `${status()}${bar(`#${t.number}`, backBtn(map.title.split(' ').slice(0, 2).join(' ')), gh)}<div class="m-scroll">${head(t)}
        <div class="m-seg" role="tablist" aria-label="Ticket sections">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${ui.ticketTab === k}" data-act="ticket-tab" data-tab="${k}">${l}</button>`).join('')}</div>
        <div role="tabpanel" style="margin-top:14px">${body}</div></div><div class="m-actionbar">${startSlot}</div>`;
    }
    return `${status()}${bar(`#${t.number}`, backBtn('Map'), gh)}<div class="m-scroll">${head(t)}${bannerFor(t)}${overview(t)}${relations(t)}</div>
      <div class="m-actionbar">${startSlot}</div>`;
  }

  // B: ticket detail as a sheet over the graph.
  function sheetTicket() {
    const t = ticketBy(ui.selected);
    return `<div class="m-scrim" data-act="close-sheet"></div><section class="m-sheet ${ui.sheet === 'full' ? 'is-full' : 'is-half'}" role="dialog" aria-label="Ticket #${t.number}">
      <button class="m-grab" data-act="grow-sheet" aria-label="${ui.sheet === 'full' ? 'Shrink sheet' : 'Expand sheet'}"></button>
      <div style="display:flex;justify-content:flex-end;padding:0 8px;margin-top:-28px"><button class="m-icon-btn" data-act="close-sheet" aria-label="Close">${ic('close')}</button></div>
      <div class="m-scroll">${head(t)}${bannerFor(t)}${overview(t)}${relations(t)}<div style="margin-top:18px">${startSlot}</div>
      <button class="m-btn is-quiet" style="margin-top:10px" data-toast="Would open #${t.number} on GitHub">${ic('external')}Open on GitHub</button></div></section>`;
  }

  /* ---------- render + events ---------- */
  const app = document.getElementById('app');
  function render() {
    const s = here().screen;
    if (V === 'B' && s === 'ticket') {
      ui.selected = here().ticket;
      ui.sheet = ui.sheet ?? 'half';
      here().screen = 'map';
    }
    const screen = here().screen;
    app.innerHTML = screen === 'signin' ? signin() : screen === 'repos' ? repos() : screen === 'repos-browse' ? reposBrowse() : screen === 'maps' ? maps() : screen === 'map' ? mapView() : ticketPage();
    document.title = `${V} · ${screen}`;
    const sheet = app.querySelector('.m-sheet .m-scroll');
    (sheet ?? app.querySelector('h1, h2, .m-hero'))?.setAttribute('tabindex', '-1');
  }

  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act],[data-toast]');
    if (!el) return;
    if (el.dataset.toast) return Kit.toast(el.dataset.toast);
    const act = el.dataset.act;
    const n = Number(el.dataset.n);
    switch (act) {
      case 'back': return back();
      case 'signin-next': ui.signin = 1; return render();
      case 'signin-prev': ui.signin = 0; return render();
      case 'signin-wait': ui.signin = 2; Kit.toast(`Copied ${D.deviceCode}. Would open GitHub.`); return render();
      case 'signin-wait2': ui.signin = 3; Kit.toast('Would open github.com/login/device'); return render();
      case 'signin-done': ui.signin = 0; stack.length = 0; stack.push({ screen: 'repos', ticket: 223, repo: D.repos[0].name }); return render();
      case 'restart': location.search = location.search.replace(/[?&]state=expired/, ''); return;
      case 'repo': return go('maps', { repo: el.dataset.repo });
      case 'browse': return go('repos-browse');
      case 'map': return go('map');
      case 'maps-filter': ui.mapsFilter = el.dataset.f; return render();
      case 'filter-open': ui.picker = true; render(); return app.querySelector('.m-sheet [aria-pressed="true"]')?.focus();
      case 'filter-close': ui.picker = false; render(); return app.querySelector('.m-filter-btn')?.focus();
      case 'maps-pick': ui.mapsFilter = el.dataset.f; ui.picker = false; render(); return app.querySelector('.m-filter-btn')?.focus();
      case 'ticket': if (V === 'B') { ui.selected = n; ui.sheet = 'half'; return render(); } return go('ticket', { ticket: n });
      case 'toggle-done': ui.showDone = !ui.showDone; return render();
      case 'map-tab': ui.mapTab = el.dataset.tab; return render();
      case 'ticket-tab': ui.ticketTab = el.dataset.tab; return render();
      case 'filter': ui.filter = el.dataset.f; return render();
      case 'select': if (ui.selected === n) { ui.sheet = 'half'; } ui.selected = n; return render();
      case 'open-sheet': ui.sheet = 'half'; return render();
      case 'grow-sheet': ui.sheet = ui.sheet === 'full' ? 'half' : 'full'; return render();
      case 'close-sheet': ui.sheet = null; return render();
      case 'zoom-in': ui.zoom = Math.min(1.6, ui.zoom + 0.2); return render();
      case 'zoom-out': ui.zoom = Math.max(0.4, ui.zoom - 0.2); return render();
      case 'fit': ui.zoom = 0.48; ui.panX = 8; ui.panY = 12; return render();
    }
  });

  // Drag to pan the graph.
  let drag = null;
  app.addEventListener('pointerdown', (e) => {
    const g = e.target.closest('[data-pan]');
    if (!g || e.target.closest('button')) return;
    drag = { x: e.clientX - ui.panX, y: e.clientY - ui.panY };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    ui.panX = e.clientX - drag.x;
    ui.panY = e.clientY - drag.y;
    const inner = app.querySelector('.m-graph-inner');
    if (inner) inner.style.transform = `translate(${ui.panX}px,${ui.panY}px) scale(${ui.zoom})`;
  });
  window.addEventListener('pointerup', () => (drag = null));

  // Escape closes a sheet or goes back.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (ui.picker) { ui.picker = false; render(); app.querySelector('.m-filter-btn')?.focus(); } else if (ui.sheet) { ui.sheet = null; render(); } else if (here().screen !== 'signin' && stack.length > 1) back();
  });

  if (EDGE === 'sheet-full') ui.sheet = 'full';
  render();
})();
