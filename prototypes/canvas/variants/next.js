/*
  PROTOTYPE (#125): shared fake map, chrome and map page for the "what's next, what's in the way,
  what has stalled" variants. Load after ../kit/kit.js. A variant calls NEXT.start(hooks), where
  hooks add signals to the real map page (markup and classes copied from src/ui on main).

  Fake map #300 "Offline drafts". It has a 7-ticket blocker chain (the critical path, 6 left),
  three open PRs (CI passing, failing, pending), a claimed ticket nobody has touched for 6 days,
  and a hand-off that died 2 days ago. #203 has just closed, which unblocked #214 and #216.
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
    play: '<path d="M7 4v16l13-8z" fill="currentColor"/>',
    alert: '<path d="m12 3 9 16H3z"/><path d="M12 9v4M12 17h.01"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.9-3.5L3 10"/><path d="M3 4v6h6"/><path d="M4 13a8 8 0 0 0 14.9 3.5L21 14"/><path d="M21 20v-6h-6"/>',
    graph: '<rect x="3" y="4" width="7" height="6" rx="1.5"/><rect x="14" y="14" width="7" height="6" rx="1.5"/><path d="M10 7h1.5a2.5 2.5 0 0 1 2.5 2.5V14"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    home: '<path d="m3 10.5 9-7 9 7"/><path d="M5.5 9.2V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    // New for #125. Same 24px stroke grid.
    pr: '<circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M6 8.4v7.2"/><path d="M18 15.6V9a3 3 0 0 0-3-3h-4"/><path d="m13 3.5-2.5 2.5L13 8.5"/>',
    ciPass: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    ciFail: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
    ciPending: '<circle cx="12" cy="12" r="9" stroke-dasharray="3.5 3"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    approved: '<path d="M20 6 9 17l-5-5"/>',
    changes: '<path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.5-5.6A8.5 8.5 0 1 1 21 12z"/><path d="M9 11h6M9 14h4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    unlock: '<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    next: '<path d="M5 4v16l10-8z" fill="currentColor"/><path d="M19 5v14"/>',
  });

  const esc = Kit.esc;
  const icon = Kit.icon;
  const params = new URLSearchParams(location.search);

  /* ---------- the fake map ---------- */

  const REPO = 'RAbdelrhman/wayfinder-map';
  const MAP = { number: 300, title: 'Offline drafts: write a map without GitHub' };

  // col/row place the card like src/layout.ts would (248 × 104, 56 across, 18 down).
  const TICKETS = [
    { n: 201, type: 'research', title: 'What can the browser store offline, and for how long?', state: 'done', who: 'RAbdelrhman', by: [], col: 0, row: 0 },
    { n: 202, type: 'grilling', title: 'Where does a draft live until it syncs?', state: 'done', who: 'RAbdelrhman', by: [], col: 0, row: 1 },
    { n: 203, type: 'task', title: 'Save drafts to IndexedDB', state: 'done', who: 'RAbdelrhman', by: [], col: 0, row: 2, closedJustNow: true },
    { n: 215, type: 'grilling', title: 'Should drafts sync on their own or when you ask?', state: 'frontier', who: null, by: [], col: 0, row: 3 },

    {
      n: 213, type: 'task', title: 'Queue edits made while offline', state: 'claimed', who: 'RAbdelrhman', by: [202], col: 1, row: 0,
      handOff: { state: 'failed', label: 'Failed', since: '2 days ago', report: 'T3 Code reported a problem.' },
      stalled: { kind: 'dead', age: '2 days', short: 'Hand-off failed 2 days ago', long: 'The T3 Code thread failed 2 days ago and nothing has happened since: no commits, no PR, no new hand-off.' },
    },
    {
      n: 204, type: 'task', title: 'Notice when GitHub is reachable again', state: 'claimed', who: 'RAbdelrhman', by: [202], col: 1, row: 1,
      handOff: { state: 'pr-ready', label: 'PR ready', since: '25 min ago', report: '' },
      pr: { n: 231, ci: 'pass', checks: '5 of 5 checks passed', review: 'approved', reviewer: 'sam-k' },
    },
    {
      n: 210, type: 'task', title: 'Mark unsynced cards with a draft badge', state: 'claimed', who: 'RAbdelrhman', by: [201], col: 1, row: 2,
      handOff: { state: 'working', label: 'Working', since: '4 min ago', report: 'T3 Code is working.' },
      pr: { n: 232, ci: 'fail', checks: '2 of 5 checks failed', review: 'changes', reviewer: 'sam-k' },
    },
    {
      n: 211, type: 'prototype', title: 'How should a sync conflict look?', state: 'claimed', who: 'RAbdelrhman', by: [201], col: 1, row: 3,
      handOff: { state: 'needs-you', label: 'Needs you', since: '12 min ago', report: 'T3 Code is waiting for your input.' },
      pr: { n: 233, ci: 'pending', checks: '3 of 5 checks running', review: 'requested', reviewer: 'sam-k' },
    },
    {
      n: 212, type: 'research', title: 'How do other tools merge offline edits?', state: 'claimed', who: 'sam-k', by: [], col: 1, row: 4,
      stalled: { kind: 'untouched', age: '6 days', short: 'Claimed 6 days ago, untouched', long: '@sam-k claimed it 6 days ago. No branch, PR, comment or hand-off since.' },
    },
    { n: 214, type: 'task', title: 'Load saved drafts when the app starts', state: 'frontier', who: null, by: [203], col: 1, row: 5, fresh: true },
    { n: 216, type: 'task', title: 'Clear a draft once it has synced', state: 'frontier', who: null, by: [203], col: 1, row: 6, fresh: true },

    { n: 205, type: 'task', title: 'Replay queued edits as GitHub issues', state: 'blocked', who: null, by: [213, 204], col: 2, row: 0 },
    { n: 217, type: 'task', title: 'Add the draft badge to the map key', state: 'blocked', who: null, by: [210, 212], col: 2, row: 2 },
    { n: 219, type: 'task', title: 'Build the conflict screen', state: 'blocked', who: null, by: [211], col: 2, row: 3 },
    { n: 206, type: 'task', title: 'Resolve conflicts found during replay', state: 'blocked', who: null, by: [205], col: 3, row: 0 },
    { n: 207, type: 'task', title: 'Retry failed replays with backoff', state: 'blocked', who: null, by: [206], col: 4, row: 0 },
    { n: 208, type: 'task', title: 'Show sync progress on the map', state: 'blocked', who: null, by: [207], col: 5, row: 0 },
    { n: 209, type: 'task', title: 'Turn offline drafts on by default', state: 'blocked', who: null, by: [208], col: 6, row: 0 },
  ];
  const byNumber = new Map(TICKETS.map((t) => [t.n, t]));
  for (const t of TICKETS) t.open = t.state !== 'done';
  for (const t of TICKETS) t.openBlockers = t.by.filter((n) => byNumber.get(n).open);
  const unlocks = (n) => TICKETS.filter((t) => t.by.includes(n)).map((t) => t.n);

  // The #126 critical path: the blocker chain with the most open tickets. Closed ones stay in it.
  const PATH = [202, 213, 205, 206, 207, 208, 209];
  const PATH_LEFT = PATH.filter((n) => byNumber.get(n).open).length;
  const onPath = (n) => PATH.includes(n);
  const pathEdge = (from, to) => PATH.indexOf(to) === PATH.indexOf(from) + 1 && PATH.includes(from);

  const READY = TICKETS.filter((t) => t.state === 'frontier');
  const STARTABLE = READY.filter((t) => t.type === 'task' || t.type === 'research'); // HITL types wait for you
  const FRESH = TICKETS.filter((t) => t.fresh);
  const STALLED = TICKETS.filter((t) => t.stalled);
  const WITH_PR = TICKETS.filter((t) => t.pr);

  /* ---------- words and looks shared by every variant ---------- */

  const TYPE_ICON = { research: 'lens', prototype: 'beaker', grilling: 'grill', task: 'list' };
  const STATE = {
    frontier: { label: 'next', long: 'Next up', variable: '--state-frontier', icon: 'arrow' },
    claimed: { label: 'claimed', long: 'Claimed', variable: '--state-claimed', icon: 'person' },
    blocked: { label: 'blocked', long: 'Blocked', variable: '--state-blocked', icon: 'lock' },
    done: { label: 'done', long: 'Done', variable: '--state-done', icon: 'check' },
  };
  const HANDOFF_ICON = { working: 'play', 'needs-you': 'person', 'pr-ready': 'check', failed: 'alert' };

  // CI and review reuse colours the page already has: hand-off green, the failed red, muted grey.
  // Nothing here is a fifth ticket-state colour, and each one has its own icon shape and word.
  const CI = {
    pass: { word: 'Checks passing', short: 'passing', icon: 'ciPass', tone: 'var(--handoff-pr-ready)' },
    fail: { word: 'Checks failing', short: 'failing', icon: 'ciFail', tone: 'var(--state-failed)' },
    pending: { word: 'Checks running', short: 'running', icon: 'ciPending', tone: 'var(--text-muted)' },
  };
  const REVIEW = {
    approved: { word: 'Approved', icon: 'approved', tone: 'var(--handoff-pr-ready)' },
    changes: { word: 'Changes requested', icon: 'changes', tone: 'var(--state-failed)' },
    requested: { word: 'Review requested', icon: 'eye', tone: 'var(--text-muted)' },
  };

  const typeGlyph = (t) => `<span class="glyph" title="${t.type}">${icon(TYPE_ICON[t.type])}</span>`;
  const stateChip = (state) => `<span class="chip" style="--accent: var(${STATE[state].variable})">${icon(STATE[state].icon)}${STATE[state].label}</span>`;
  const handOffPill = (t, compact = false) =>
    `<span class="${compact ? 'chip node-handoff-pill' : 'handoff-pill'} is-${t.handOff.state}" title="${esc(`${t.handOff.label}, updated ${t.handOff.since}`)}">${icon(HANDOFF_ICON[t.handOff.state])}<span>${t.handOff.label}</span></span>`;
  const ciIcon = (pr) => `<span class="nx-tone" style="--tone:${CI[pr.ci].tone}">${icon(CI[pr.ci].icon)}</span>`;
  const reviewIcon = (pr) => `<span class="nx-tone" style="--tone:${REVIEW[pr.review].tone}">${icon(REVIEW[pr.review].icon)}</span>`;
  const numbers = (items) => {
    const labels = items.map((t) => `#${t.n}`);
    return labels.length < 2 ? labels.join('') : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
  };
  const ticketPill = (n) => {
    const t = byNumber.get(n);
    return `<button type="button" class="pill" style="--accent: var(${STATE[t.state].variable})" data-jump="${n}" title="${esc(t.title)}"><span class="pill-text">#${n}</span></button>`;
  };

  /* ---------- state ---------- */

  const state = {
    selected: Number(params.get('ticket') ?? 210),
    tab: params.get('tab') ?? 'ticket',
    pathFocus: params.get('path') === '1',
    notice: params.get('notice') !== '0', // the "#203 closed" notification is showing
    started: false, // Start next was pressed
  };

  let hooks = {};
  const hook = (name, ...args) => (hooks[name] ? hooks[name](...args) : undefined);

  /* ---------- chrome, as on main ---------- */

  function rail() {
    return `<aside class="sidebar-shell"><nav class="navigation" aria-label="Primary"><div class="nav-compact-content mini">
      <div class="mini-head"><button type="button" class="fold mini-logo" aria-label="Open the sidebar"><img class="app-logo" src="../../../assets/wayfinder-icon.svg" alt="" width="30" height="30"></button></div>
      <a class="new" href="#" data-to="Start a new map" aria-label="Start a new map">${icon('plus')}</a>
      <button type="button" class="rail-btn" aria-label="Jump to">${icon('lens')}</button>
      <a class="rail-btn" href="#" data-to="Home" aria-label="Home">${icon('home')}</a>
      <span class="mini-sep" role="separator"></span>
    </div>
    <div class="nav-footer">
      <span class="rail-mark nav-account" role="img" aria-label="GitHub account: RAbdelrhman"><span class="avatar-initial">R</span></span>
      <button type="button" class="rail-btn" aria-label="Model defaults">${icon('sliders')}</button>
      <button type="button" class="rail-btn" aria-label="Theme">${icon('moon')}</button>
    </div></nav></aside>`;
  }

  function ring(size = 16) {
    const c = 2 * Math.PI * 6.5;
    const counts = [['done', 3], ['claimed', 5], ['frontier', 3], ['blocked', 7]];
    let offset = 0;
    const arcs = counts
      .map(([s, k]) => {
        const len = (k / 18) * c;
        const arc = `<circle cx="8" cy="8" r="6.5" fill="none" stroke="var(${STATE[s].variable})" stroke-width="3" stroke-dasharray="${Math.max(0, len - 1.5)} ${c}" stroke-dashoffset="${-offset}"/>`;
        offset += len;
        return arc;
      })
      .join('');
    return `<span class="mini-ring" aria-hidden="true"><svg viewBox="0 0 16 16" width="${size}" height="${size}">${arcs}</svg></span>`;
  }

  function topbar() {
    const handOffs = TICKETS.filter((t) => t.handOff);
    const needYou = handOffs.filter((t) => t.handOff.state === 'needs-you' || t.handOff.state === 'failed').length;
    const start =
      hook('startButton') ??
      `<button type="button" class="primary map-start" data-select="${READY[0].n}" title="Open #${READY[0].n} to start it">${icon('play')}<span class="topbar-action-label">Next: #${READY[0].n}</span></button>`;
    return `<header class="topbar map-topbar">
      <div class="nav-topbar"><div class="nav-map-strip"><nav class="nav-map-scopes" aria-label="Map location">
        <div class="nav-scope-control"><button type="button" class="scope is-quiet"><span class="repo-mono" aria-hidden="true">WM</span><span class="t">wayfinder-map</span>${icon('chevron')}</button></div>
        <span class="crumb-sep" aria-hidden="true">/</span>
        <div class="nav-scope-control"><button type="button" class="scope">${ring()}<span class="t">#${MAP.number} ${esc(MAP.title)}</span>${icon('chevron')}</button></div>
      </nav><nav class="segmented nav-map-tabs" aria-label="Map views"><a class="seg is-on" href="#" aria-current="page">${icon('graph')}<span>Map</span></a><a class="seg" href="#" data-to="Table">${icon('table')}<span>Table</span></a><a class="seg" href="#" data-to="Prototypes">${icon('beaker')}<span>Prototypes</span></a></nav></div></div>
      ${hook('topbarAfterTabs') ?? ''}
      <span class="topbar-spacer"></span>
      <div class="handoff-anchor"><button type="button" class="handoff-trigger${needYou ? ' is-urgent' : ''}" aria-label="${handOffs.length} hand-offs in T3 Code"><span class="handoff-dots" aria-hidden="true">${handOffs.map((t) => `<i class="is-${t.handOff.state}"></i>`).join('')}</span><span>${handOffs.length} hand-offs in T3 Code${needYou ? ` · ${needYou} need you` : ''}</span></button></div>
      ${hook('topbarBeforeSynced') ?? ''}
      <button type="button" class="synced" aria-label="Resync from GitHub">${icon('refresh')}<span class="synced-label">Synced just now</span></button>
      ${start}
    </header>`;
  }

  function filters() {
    const count = (s) => TICKETS.filter((t) => t.state === s).length;
    const chip = (s) => `<button type="button" class="fchip" aria-pressed="false" style="--accent: var(${STATE[s].variable})">${icon(STATE[s].icon)}${STATE[s].long} <b>${count(s)}</b></button>`;
    const types = ['research', 'prototype', 'grilling', 'task'].map((ty) => `<button type="button" class="fchip" aria-pressed="false">${icon(TYPE_ICON[ty])}${ty} <b>${TICKETS.filter((t) => t.type === ty).length}</b></button>`);
    const inT3 = TICKETS.filter((t) => t.handOff).length;
    return `<div class="map-toolbar"><div class="filters" role="toolbar" aria-label="Filter tickets">
      <button type="button" class="fchip is-on" aria-pressed="true">All <b>${TICKETS.length}</b></button>${['frontier', 'claimed', 'blocked', 'done'].map(chip).join('')}
      <span class="filter-sep" role="none"></span>${types.join('')}
      <span class="filter-sep" role="none"></span><button type="button" class="fchip" aria-pressed="false" style="--accent: var(--state-claimed)">${icon('play')}In T3 Code <b>${inT3}</b></button>${hook('filterExtra') ?? ''}</div>
      <label class="search map-local-search">${icon('lens')}<input type="search" placeholder="Filter tickets on this map…" aria-label="Filter tickets on this map"></label></div>`;
  }

  /* ---------- canvas ---------- */

  const W = 248;
  const H = 104;
  const X = (t) => 32 + t.col * (W + 56);
  const Y = (t) => 32 + t.row * (H + 18);

  function node(t) {
    const style = STATE[t.state];
    const o = hook('node', t) ?? {};
    const chip = o.chip ?? (t.handOff && t.open ? handOffPill(t, true) : stateChip(t.state));
    const meta =
      o.meta ??
      esc(t.state === 'blocked' ? `blocked by ${t.openBlockers.map((n) => `#${n}`).join(', ')}` : t.who ? `@${t.who}` : t.type);
    const dim = state.pathFocus && !onPath(t.n);
    const cls = ['node', t.state === 'done' ? 'is-done' : '', state.selected === t.n ? 'is-selected' : '', dim ? 'is-dim' : '', ...(o.classes ?? [])].filter(Boolean).join(' ');
    const aria = [`#${t.n} ${t.title}`, style.label, t.handOff && t.open ? `hand-off ${t.handOff.label}` : '', ...(o.aria ?? [])].filter(Boolean).join(', ');
    return `<button type="button" class="${cls}" data-select="${t.n}" style="--accent: var(${style.variable}); left:${X(t)}px; top:${Y(t)}px; width:${W}px; height:${H}px" aria-label="${esc(aria)}">
      <span class="node-top">${typeGlyph(t)}<span class="num">#${t.n}</span>${o.beforeChip ?? ''}${chip}${o.afterChip ?? ''}</span>
      <span class="title">${esc(t.title)}</span>
      <span class="meta">${meta}</span>${o.inner ?? ''}
    </button>`;
  }

  function edges() {
    const out = [];
    for (const t of TICKETS)
      for (const from of t.by) {
        const f = byNumber.get(from);
        const x1 = X(f) + W;
        const y1 = Y(f) + H / 2;
        const x2 = X(t);
        const y2 = Y(t) + H / 2;
        const bend = Math.max(28, (x2 - x1) / 2);
        const cls = [t.openBlockers.includes(from) ? 'is-live' : '', ...(hook('edgeClasses', from, t.n) ?? [])];
        if (state.pathFocus && !pathEdge(from, t.n)) cls.push('is-dim');
        out.push({ from, to: t.n, d: `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`, cls: cls.filter(Boolean).join(' ') });
      }
    return out;
  }

  function canvas() {
    const width = X({ col: 6 }) + W + 32;
    const height = Y({ row: 6 }) + H + 32;
    const es = edges();
    return `<section class="stage" aria-label="Tickets">
      <div class="canvas-wrap nx-wrap"><div class="canvas-stage nx-stage"><div class="canvas" style="width:${width}px;height:${height}px">
        <svg class="edges" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">${hook('edgesUnder', es) ?? ''}${es.map((e) => `<path class="${e.cls}" d="${e.d}"/>`).join('')}</svg>
        <div class="nodes">${hook('nodesUnder') ?? ''}${TICKETS.map(node).join('')}</div>
      </div></div></div>
      ${hook('stageOverlay') ?? ''}
      <div class="keybox"><button type="button" class="floatbox keybtn">${icon('info')}Key</button></div>
      <div class="zoom floatbox" role="group" aria-label="Zoom"><button type="button" class="iconbtn" aria-label="Zoom out">${icon('minus')}</button><button type="button" class="iconbtn pct">85%</button><button type="button" class="iconbtn" aria-label="Zoom in">${icon('plus')}</button></div>
    </section>`;
  }

  /* ---------- inspector ---------- */

  function handOffCard(t) {
    const actions = t.handOff.state === 'failed'
      ? `<button type="button" class="ghost">${icon('refresh')}Try again</button><button type="button" class="ghost">${icon('play')}Open in T3 Code</button>`
      : t.handOff.state === 'pr-ready'
        ? `<a class="ghost" href="#" data-to="PR #${t.pr.n} on GitHub">${icon('external')}Open PR #${t.pr.n}</a><button type="button" class="ghost">${icon('play')}Open in T3 Code</button>`
        : `<button type="button" class="ghost">${icon('play')}${t.handOff.state === 'needs-you' ? 'Answer in T3 Code' : 'Open in T3 Code'}</button>`;
    const o = hook('handOffCard', t) ?? {};
    return `<section class="handoff-card is-${t.handOff.state}" aria-label="${esc(`${t.handOff.label}: #${t.n} ${t.title}`)}">
      <div class="handoff-card-head">${handOffPill(t)}${o.head ?? ''}<time>${t.handOff.since}</time></div>
      ${t.handOff.report ? `<p class="handoff-report">${t.handOff.report}</p>` : ''}
      ${o.body ?? ''}
      <div class="handoff-actions">${actions}</div>
    </section>`;
  }

  function ticketPanel(t) {
    const style = STATE[t.state];
    const banner =
      t.state === 'blocked'
        ? `Waiting on <b>${t.openBlockers.map((n) => `#${n}`).join(' and ')}</b>. Copy the prompt now; starting unlocks when ${t.openBlockers.length === 1 ? 'it closes' : 'they close'}.`
        : t.state === 'done'
          ? 'This ticket is closed.'
          : t.state === 'claimed'
            ? `<b>@${t.who}</b> is on it.`
            : null;
    const o = hook('panel', t) ?? {};
    const launch = t.handOff
      ? handOffCard(t)
      : t.state === 'done'
        ? ''
        : `<div class="launch-actions"><button type="button" class="primary"${t.state === 'blocked' ? ' disabled' : ''}>${icon('play')}Open in T3 Code</button><button type="button" class="ghost">${icon('copy')}Copy prompt</button></div>`;
    return `<div class="dhead">${typeGlyph(t)}<span class="num">#${t.n}</span>${stateChip(t.state)}<a class="iconbtn" href="#" data-to="#${t.n} on GitHub" aria-label="Open on GitHub">${icon('external')}</a></div>
      <h2 class="dtitle">${esc(t.title)}</h2>
      ${o.banner ?? (banner ? `<div class="banner" style="--accent: var(${style.variable})">${icon(style.icon)}<span>${banner}</span></div>` : '')}
      ${o.beforeFacts ?? ''}
      <dl class="facts">
        <dt>Type</dt><dd>${icon(TYPE_ICON[t.type])}${t.type}</dd>
        <dt>Assignee</dt><dd>${t.who ? `@${t.who}` : '<span class="none">unclaimed</span>'}</dd>
        <dt>Needs</dt><dd>${t.by.length ? t.by.map(ticketPill).join('') : '<span class="none">—</span>'}</dd>
        <dt>Unlocks</dt><dd>${unlocks(t.n).length ? unlocks(t.n).map(ticketPill).join('') : '<span class="none">—</span>'}</dd>
        ${o.facts ?? ''}
      </dl>
      <div class="launch">${launch}</div>
      ${o.afterLaunch ?? ''}
      <details class="sec"><summary>Prompt this sends</summary><pre class="prompt">…</pre></details>
      <div class="body-text prose"><p>Fake ticket for the #125 prototype.</p></div>`;
  }

  function briefPanel() {
    return `<div class="brief"><span class="eyebrow"><a href="#" data-to="map #${MAP.number} on GitHub">Map · #${MAP.number} ↗</a></span><h1>${esc(MAP.title)}</h1>
      ${hook('brief') ?? ''}<p class="hint">The brief is unchanged in this prototype.</p></div>`;
  }

  function inspector() {
    const extraTabs = hook('tabs') ?? [];
    const tabs = [...extraTabs, { id: 'brief', label: 'Brief' }, { id: 'ticket', label: `Ticket #${state.selected}` }];
    const body = extraTabs.find((x) => x.id === state.tab)?.render() ?? (state.tab === 'brief' ? briefPanel() : ticketPanel(byNumber.get(state.selected)));
    return `<aside class="inspector" aria-label="Brief and ticket"><div class="insp-tabs"><div class="segmented" role="tablist" aria-label="Panel">${tabs
      .map((x) => `<button type="button" role="tab" aria-selected="${state.tab === x.id}" tabindex="${state.tab === x.id ? 0 : -1}" class="seg${state.tab === x.id ? ' is-on' : ''}" data-tab="${x.id}">${x.label}</button>`)
      .join('')}</div></div><div class="insp-panel" role="tabpanel">${body}</div></aside>`;
  }

  /* ---------- prototype bar ---------- */

  function protoBar() {
    return `<div class="nx-proto" role="group" aria-label="Prototype controls"><span class="nx-proto-tag">Prototype</span>
      <button type="button" data-proto="notice">${icon('bell')}Replay "#203 closed"</button>
      <span class="nx-proto-sep"></span><span class="nx-proto-lbl">Show</span>
      ${[210, 204, 211, 212, 213, 205].map((n) => `<button type="button" data-select="${n}" class="${state.selected === n && state.tab === 'ticket' ? 'is-on' : ''}">#${n}</button>`).join('')}
    </div>`;
  }

  /* ---------- paint ---------- */

  const root = () => document.getElementById('root');
  let scroll = null;

  function paint() {
    const wrap = document.querySelector('.nx-wrap');
    if (wrap) scroll = [wrap.scrollLeft, wrap.scrollTop];
    // Repainting replaces the DOM, so put focus back on the same control.
    const active = document.activeElement;
    const attr = ['select', 'tab', 'action', 'proto'].find((key) => active?.dataset?.[key]);
    const focusSel = attr ? `${active.closest('.nx-proto') ? '.nx-proto' : '.main'} [data-${attr}="${active.dataset[attr]}"]` : null;
    root().innerHTML = `<div class="app is-nav-collapsed">${rail()}<div class="main">${topbar()}${hook('belowTopbar') ?? ''}${filters()}${hook('belowToolbar') ?? ''}<div class="body">${canvas()}${inspector()}</div></div></div>${hook('overlay') ?? ''}${protoBar()}`;
    const next = document.querySelector('.nx-wrap');
    if (next && scroll) [next.scrollLeft, next.scrollTop] = scroll;
    if (focusSel) document.querySelector(focusSel)?.focus({ preventScroll: true });
    hook('afterPaint');
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-select], [data-jump], [data-tab], [data-proto], [data-action]');
    if (!el) return;
    if (el.dataset.select || el.dataset.jump) {
      state.selected = Number(el.dataset.select ?? el.dataset.jump);
      state.tab = 'ticket';
    } else if (el.dataset.tab) state.tab = el.dataset.tab;
    else if (el.dataset.proto === 'notice') {
      state.notice = true;
      state.started = false;
      state.replay = Date.now();
    } else if (el.dataset.action) {
      if (hook('action', el.dataset.action, el) === false) return;
    }
    paint();
  });

  function start(h) {
    hooks = h;
    paint();
  }

  window.NEXT = {
    start, paint, state, esc, icon, REPO, MAP, TICKETS, byNumber, PATH, PATH_LEFT, onPath, pathEdge, READY, STARTABLE, FRESH, STALLED, WITH_PR,
    STATE, CI, REVIEW, stateChip, handOffPill, ciIcon, reviewIcon, ticketPill, numbers, X, Y, W, H,
  };
})();
