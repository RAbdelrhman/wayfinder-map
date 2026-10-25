/*
  PROTOTYPE (#226): viewing a prototype canvas on a phone, opened from #223's picked ticket
  detail (T-C). The ticket screen is T-C as picked; the Prototype card on Overview is the only
  new part of it. ?d=A|B|C picks the direction: A option strip and toolbars, B options list,
  C one bar you swipe. Frames open at one step with ?screen=ticket|list|viewer|cards
  ?canvas=223|207 ?page= ?opt= ?panel=notes|pages|menu|drawer|options ?zoom=fit|<scale>
  ?full=1 ?state=ready|loading|offline|failed|limited ?saved=1. Every tap is fake; nothing
  calls GitHub, and pinch is described, not simulated: zoom with the buttons.
*/
(() => {
  const params = new URLSearchParams(location.search);
  const D = ['A', 'B', 'C'].includes(params.get('d')) ? params.get('d') : 'A';
  const DATA = window.V226;
  const S = window.STATES;
  const esc = Kit.esc;
  const ic = Kit.icon;
  const app = document.getElementById('app');
  const $ = (id) => document.getElementById(id);

  // Shown full size in a wide window, the phone keeps its 390 × 844 and shrinks only to fit (viewer.css).
  const fitDevice = () => document.documentElement.style.setProperty('--device-fit', String(Math.min(1, (innerHeight - 24) / 844, (innerWidth - 24) / 390)));
  addEventListener('resize', fitDevice);
  fitDevice();

  const zoomParam = Number(params.get('zoom'));
  const STATES_OK = ['loading', 'offline', 'failed', 'limited'];
  const ui = {
    canvas: Object.hasOwn(DATA.canvases, params.get('canvas') ?? '') ? params.get('canvas') : '223',
    page: params.get('page'),
    opt: params.get('opt'),
    ticketTab: 'overview',
    panel: params.get('panel'),
    zoom: zoomParam > 0 ? zoomParam : 'fit',
    full: params.get('full') === '1',
    state: STATES_OK.includes(params.get('state')) ? params.get('state') : 'ready',
    files: Number(params.get('files') ?? 31),
    saved: params.get('saved') === '1',
    theme: null,
    seen: new Set((params.get('seen') ?? '').split(',').filter(Boolean)),
    drawerTab: params.get('panel') === 'options' ? 'options' : 'notes',
    fit: 1,
    scale: 1,
  };
  if (ui.panel === 'options') ui.panel = 'drawer';
  if (ui.state === 'offline') ui.saved = true;

  const first = params.get('screen') ?? 'ticket';
  const stack = ['ticket'];
  if (first === 'cards') stack[0] = 'cards';
  if (D === 'B' && (first === 'list' || first === 'viewer')) stack.push('list');
  if (first === 'viewer') stack.push('viewer');
  if (first === 'viewer' && ui.state === 'ready') ui.saved = true;
  const here = () => stack[stack.length - 1];

  /* ---------- the canvas being viewed ---------- */
  const cv = () => DATA.canvases[ui.canvas];
  const ticket = () => DATA.tickets[cv().ticket];
  const optsOf = (page) => page.sections.flatMap((s, si) => s.items.map((it) => ({ ...it, section: s.title, sectionIndex: si, page: page.id })));
  const everyIn = (c) => c.pages.flatMap(optsOf);
  const pageOf = () => cv().pages.find((p) => p.id === ui.page) ?? cv().pages[0];
  const current = () => {
    const list = optsOf(pageOf());
    return list.find((o) => o.id === ui.opt) ?? list[0];
  };
  const siblings = (o) => optsOf(pageOf()).filter((x) => x.sectionIndex === o.sectionIndex);
  const sizeOf = (o) => ({ w: o.width ?? cv().width, h: o.height ?? cv().height });
  const roundTitle = (p) => `${p.round} · ${p.title}`;
  const pct = (s) => `${Math.round(s * 100)}%`;
  const phoneTheme = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const frameTheme = () => ui.theme ?? phoneTheme();
  const frameSrc = (o) => `${o.src}${o.src.includes('?') ? '&' : '?'}theme=${frameTheme()}`;
  const viewable = () => ui.state === 'ready' || ui.state === 'offline';
  const isDesktop = (o) => sizeOf(o).w > 600;

  /* ---------- #223's T-C parts, copied as picked (prototype/223 variants/mobile.js) ---------- */
  const status = () => `<div class="m-status" aria-hidden="true"><span>9:41</span><span>●●● ▮</span></div>`;
  const chip = (state) => `<span class="m-chip" style="--accent: var(${S[state].variable})">${ic(S[state].icon)}${S[state].label}</span>`;
  const glyph = (type) => `<span class="m-glyph" title="${type}">${ic(TYPE_ICON[type])}<span class="m-sr">${type}</span></span>`;
  const backBtn = (label, act = 'back') => `<button class="m-back" data-act="${act}" aria-label="Back to ${esc(label)}"><span class="m-back-face">${ic('back')}${esc(label)}</span></button>`;
  const bar = (title, left = '', right = '<span style="width:44px"></span>') =>
    `<header class="m-bar">${left || '<span style="width:44px"></span>'}<h1>${esc(title)}</h1>${right}</header>`;
  const stateOf = (n) => DATA.tickets[n]?.state ?? DATA.states[n] ?? 'done';
  function bannerFor(t) {
    if (t.state === 'blocked') return `<div class="m-banner" style="--accent: var(--state-blocked)">${ic('lock')}<span>Waiting on <b>${t.needs.map((n) => `#${n}`).join(' and ')}</b>.</span></div>`;
    if (t.state === 'claimed') return `<div class="m-banner" style="--accent: var(--state-claimed)">${ic('person')}<span><b>@${esc(t.assignee)}</b> is on it.</span></div>`;
    if (t.state === 'done') return `<div class="m-banner" style="--accent: var(--state-done)">${ic('check')}<span>This ticket is closed.</span></div>`;
    return `<div class="m-banner" style="--accent: var(--state-frontier)">${ic('arrow')}<span>Open, unblocked and unclaimed: ready to start.</span></div>`;
  }
  const pills = (list) =>
    list.length
      ? list.map((n) => `<button class="m-pill" data-toast="Would open #${n}. Only #${cv().ticket} has sample data here." style="--accent: var(${S[stateOf(n)].variable})" aria-label="#${n}, ${S[stateOf(n)].label}">#${n}</button>`).join('')
      : '<span class="m-fine">None</span>';
  const overview = (t) => `<div class="m-prose"><h4>Question</h4><p>${esc(t.body.question)}</p><h4>Done when</h4><ul>${t.body.done.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></div>`;
  const relations = (t) => `<dl class="m-rel"><div><dt>Needs</dt><dd>${pills(t.needs)}</dd></div><div><dt>Unblocks</dt><dd>${pills(t.unblocks)}</dd></div></dl>`;
  const startSlot = `<div class="m-slot" role="note">${ic('play')}Start and watch: designed in #224</div>`;
  const head = (t) => `<div class="m-dhead">${glyph(t.type)}<span class="m-num">#${t.number} · ${t.type}</span>${chip(t.state)}</div><h2 class="m-dtitle">${esc(t.title)}</h2>`;

  // New screens use #316 G-a's centred bar.
  const vbar = (middle, left, right = '<span></span>') => `<header class="m-bar v-bar">${left}${middle}${right}</header>`;
  const cached = () => `<div class="m-cached" role="status">${ic('offline')}<span>Offline. Showing the copy saved ${esc(DATA.saved.when)}.</span></div>`;

  /* ---------- the new Prototype card, on Overview after the state banner ---------- */
  function cardTop(c) {
    const n = everyIn(c).length;
    return `<p class="v-eyebrow">${ic('beaker')}Prototype canvas</p><h3>${esc(c.title)}</h3>
      <p class="v-meta">${n} options on ${c.pages.length} pages · ${esc(c.sizeLabel.toLowerCase())} · updated ${esc(c.updated)}</p>`;
  }
  const savedLine = (c) => (ui.saved ? `Saved on this phone · ${c.mb} MB` : `About ${Math.round(c.mb)} MB. It downloads once, then opens from this phone.`);

  function protoCard(c, dir = D) {
    const firstOpt = optsOf(c.pages[0])[0];
    if (dir === 'A')
      return `<section class="v-proto" aria-label="Prototype canvas">${cardTop(c)}<button class="m-btn" data-act="open">${ic('play')}Open canvas</button><p class="v-fine">${esc(savedLine(c))}</p></section>`;
    if (dir === 'B')
      return `<section class="v-proto" aria-label="Prototype canvas">${cardTop(c)}<p class="v-fine">${esc(savedLine(c))}</p>
        <button class="m-row v-open-row" data-act="open"><span class="m-row-main"><span class="m-row-title">Browse ${everyIn(c).length} options</span><span class="m-row-sub">Read each note, then open one full size</span></span>${ic('chevron')}</button></section>`;
    return `<section class="v-proto" aria-label="Prototype canvas">${cardTop(c)}<button class="m-btn" data-act="open">${ic('play')}View prototype</button>
      <p class="v-fine">Opens at ${esc(firstOpt.id)} · ${esc(firstOpt.name)}, then where you left off. ${esc(savedLine(c))}</p></section>`;
  }

  function ticketScreen() {
    const t = ticket();
    const map = DATA.maps[t.map];
    const backLabel = map.title.split(' ').slice(0, 2).join(' ').replace(/[,.;:]$/, '');
    const gh = `<button class="m-icon-btn" data-toast="Would open #${t.number} on GitHub" aria-label="Open on GitHub">${ic('external')}</button>`;
    const tabs = [
      ['overview', 'Overview'],
      ['links', `Links ${t.needs.length + t.unblocks.length}`],
      ['activity', `Activity ${t.comments.length}`],
    ];
    const body =
      ui.ticketTab === 'overview'
        ? `${bannerFor(t)}${protoCard(cv())}${overview(t)}`
        : ui.ticketTab === 'links'
          ? relations(t)
          : t.comments.map((c) => `<div class="m-comment"><b>@${esc(c.author)}</b><span class="m-num">${c.when}</span><div>${esc(c.text)}</div></div>`).join('');
    return `${status()}${bar(`#${t.number}`, backBtn(backLabel, 'map'), gh)}<div class="m-scroll">${head(t)}
      <div class="m-seg" role="tablist" aria-label="Ticket sections">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${ui.ticketTab === k}" data-act="ticket-tab" data-tab="${k}">${l}</button>`).join('')}</div>
      <div role="tabpanel" style="margin-top:14px">${body}</div></div><div class="m-actionbar">${startSlot}</div>`;
  }

  // Every state of the card, for the board. The first three use the desktop panel's own words.
  function cardsScreen() {
    const c = DATA.canvases['223'];
    const quiet = (text, extra = '', attrs = '') => `<section class="v-proto is-quiet"${attrs}><p class="v-eyebrow">${ic('beaker')}Prototype</p><p>${text}</p>${extra}</section>`;
    const label = (text) => `<div class="m-section-title">${esc(text)}</div>`;
    const keep = ui.saved;
    ui.saved = false;
    const fresh = ['A', 'B', 'C'].map((dir) => `${label(`Ready, first time · ${dir}`)}${protoCard(c, dir)}`).join('');
    ui.saved = true;
    const saved = `${label('Ready, saved on this phone · A')}${protoCard(c, 'A')}`;
    ui.saved = keep;
    return `${status()}${vbar('<h1>Prototype card states</h1>', '<span></span>')}<div class="m-scroll" style="padding-bottom:40px">
      ${label('Looking')}${quiet('Looking for its prototype…', '<div class="m-skel" style="width:70%;margin-top:10px"></div>', ' aria-busy="true"')}
      ${label('No prototype yet')}${quiet('No prototype yet. It will be kept on <code>prototype/226-prototype-viewing-a-prototype-canvas-on-mobile</code>.')}
      ${label('Could not read')}${quiet(`Could not read the prototypes: GitHub’s limit for this hour is used up. Try again after ${DATA.limitReset}.`, `<button class="m-btn is-quiet" style="margin-top:12px" data-toast="Would try again after ${DATA.limitReset}">${ic('refresh')}Try again</button>`, ' role="alert"')}
      ${fresh}${saved}</div>`;
  }

  /* ---------- note text, shared by every direction ---------- */
  function noteBody(o, { ask = true } = {}) {
    const n = o.note ?? {};
    const [verdict, ...rest] = (n.recorded ?? '').split(' · ');
    const list = [...(n.pros ?? []).map((x) => `<li class="pro"><span class="m-sr">Pro: </span>${esc(x)}</li>`), ...(n.cons ?? []).map((x) => `<li class="con"><span class="m-sr">Con: </span>${esc(x)}</li>`)];
    return `${n.idea ? `<p>${esc(n.idea)}</p>` : '<p>No note on this option.</p>'}
      ${list.length ? `<ul>${list.join('')}</ul>` : ''}
      ${n.basedOn ? `<p class="v-src"><b>Remixed from:</b> ${esc(n.basedOn)}</p>` : ''}
      ${n.recorded ? `<p class="v-rec"><b>Recorded feedback · ${esc(verdict)}.</b> ${esc(rest.join(' · '))}</p>` : ''}
      ${ask ? `<p class="v-ask"><b>Deciding</b> ${esc(cv().question)}</p>` : ''}`;
  }

  /* ---------- loading and errors, shared ---------- */
  function loadingCard() {
    const c = cv();
    const share = ui.files / c.files;
    return `<div class="v-card" role="status"><div class="v-card-mark">${ic('download')}</div><h2>Downloading the canvas</h2>
      <div class="v-bar-progress" role="progressbar" aria-label="Download" aria-valuemin="0" aria-valuemax="${c.files}" aria-valuenow="${ui.files}" aria-valuetext="${ui.files} of ${c.files} files"><span style="width:${Math.round(share * 100)}%"></span></div>
      <p class="v-meta">${ui.files} of ${c.files} files · ${(c.mb * share).toFixed(1)} of ${c.mb} MB</p>
      <p>It’s saved on this phone after this, so next time it opens at once, even offline.</p>
      <button class="m-link" data-act="cancel">Cancel</button></div>`;
  }
  function errorCard() {
    const c = cv();
    if (ui.state === 'limited')
      return `<div class="v-card" role="alert"><div class="v-card-mark">${ic('clock')}</div><h2>GitHub’s limit for this hour is used up</h2>
        <p>Wayfinder can download this canvas again after ${DATA.limitReset}.</p><button class="m-btn is-quiet" disabled>Try again at ${DATA.limitReset}</button>
        <button class="m-link" data-toast="Would open ${esc(c.branch)} on GitHub">Open on GitHub</button></div>`;
    return `<div class="v-card" role="alert"><div class="v-card-mark">${ic('offline')}</div><h2>Can’t download this canvas</h2>
      <p>You’re offline, and it isn’t saved on this phone yet. It’s about ${Math.round(c.mb)} MB.</p><button class="m-btn is-quiet" data-act="retry">${ic('refresh')}Try again</button></div>`;
  }
  const hint = (o) =>
    viewable() && isDesktop(o) && ui.zoom === 'fit' && !ui.full
      ? `<p class="v-hint">Desktop page, ${sizeOf(o).w} px wide, shown at <span data-zoom-label>${pct(ui.fit)}</span>. ${D === 'A' ? 'Pinch or use + to zoom.' : D === 'B' ? 'Pinch or tap the zoom chip.' : 'Pinch to zoom, or tap the bar for zoom steps.'}</p>`
      : '';
  const exit = () => (ui.full && D !== 'C' ? `<button class="v-exit" data-act="full" aria-label="Exit full screen">${ic('shrink')}Exit full screen</button>` : '');

  // The theme choices are menu items too, so the menu's arrow keys reach them.
  function themeRow() {
    const seg = [
      [null, 'Phone'],
      ['light', 'Light'],
      ['dark', 'Dark'],
    ]
      .map(([v, l]) => `<button role="menuitemradio" data-act="theme" data-theme="${v ?? ''}" aria-checked="${ui.theme === v}">${l}</button>`)
      .join('');
    return `<div class="v-theme" role="group" aria-label="Canvas theme"><span class="v-theme-label" aria-hidden="true">${ic('theme')}Theme</span><div class="m-seg">${seg}</div></div>`;
  }
  function moreMenu(where = 'is-right') {
    const c = cv();
    return `<div class="v-scrim-clear" data-act="close-panel"></div><div class="v-pop ${where}" role="menu" id="v-menu" aria-label="Canvas">
      <button role="menuitem" data-toast="Would open ${esc(c.branch)} on GitHub">${ic('external')}<span class="v-pop-main">Open on GitHub<small>The prototype branch</small></span></button>
      <button role="menuitem" data-act="check">${ic('refresh')}<span class="v-pop-main">Check for changes<small>Downloads only files that changed</small></span></button>
      <hr />${themeRow()}<hr /><p class="v-pop-info">Saved on this phone · ${c.mb} MB · ${c.files} files</p></div>`;
  }

  /* ---------- A: option strip and toolbars, like the desktop viewer ---------- */
  function partsA() {
    const c = cv();
    const p = pageOf();
    const o = current();
    const list = optsOf(p);
    const ok = viewable();
    const dis = ok ? '' : ' disabled';
    const pos = list.findIndex((x) => x.id === o.id) + 1;
    const title = `<h1 style="margin:0;min-width:0"><button class="v-title" data-act="pages" aria-haspopup="menu" aria-expanded="${ui.panel === 'pages'}" aria-controls="v-pages"${dis}>
      <span class="v-title-main"><span>${ok ? esc(p.title) : ui.state === 'loading' ? 'Downloading…' : esc(`#${c.ticket}’s canvas`)}</span>${ok ? ic('down') : ''}</span><span class="v-title-sub">${esc(c.title)}</span></button></h1>`;
    const more = `<button class="m-icon-btn" data-act="menu" aria-label="More" aria-haspopup="menu" aria-expanded="${ui.panel === 'menu'}" aria-controls="v-menu"${dis}>${ic('more')}</button>`;
    const top = `${status()}${vbar(title, backBtn(`#${c.ticket}`), more)}${ui.state === 'offline' ? cached() : ''}`;

    const notes =
      ui.panel === 'notes' && ok
        ? `<section class="v-notes" id="v-notes" aria-label="Notes for ${esc(o.id)}"><div class="v-notes-head"><span class="v-tag">${esc(o.id)}</span><b>${esc(o.name)}</b>
            <button class="m-icon-btn" data-act="notes" aria-label="Hide notes" style="color:var(--text-secondary)">${ic('close')}</button></div><div class="v-notes-body v-note">${noteBody(o)}</div></section>`
        : '';
    const strip = ok
      ? `<div class="v-strip" role="group" aria-label="Options on ${esc(p.title)}">${p.sections
          .map((s, si) => `${si ? '<span class="v-sep" aria-hidden="true"></span>' : ''}${s.items.map((it) => `<button class="v-chip" data-act="go" data-id="${esc(it.id)}" aria-current="${it.id === o.id}" aria-label="${esc(it.id)}, ${esc(it.name)}">${esc(it.id)}</button>`).join('')}`)
          .join('')}</div>`
      : `<div class="v-strip" aria-hidden="true">${'<span class="v-skel-chip"></span>'.repeat(6)}</div>`;
    // The strip already marks the id, so the name line gets the room.
    const name = ok
      ? `<div class="v-name"><b><span>${esc(o.name)}</span></b><small>${esc(o.id)} · ${esc(o.section)} · ${pos} of ${list.length}</small></div>`
      : `<div class="v-name"><div class="m-skel" style="width:70%"></div><div class="m-skel" style="width:45%;height:10px;margin-top:8px"></div></div>`;
    const ctrl = `<div class="v-ctrl"><button class="m-icon-btn" data-act="prev" aria-label="Previous option"${dis}>${ic('back')}</button>${name}
      <button class="m-icon-btn" data-act="next" aria-label="Next option"${dis}>${ic('chevron')}</button>
      <button class="v-pill" data-act="notes" aria-pressed="${ui.panel === 'notes'}"${dis}>${ic('notes')}Notes</button>
      <button class="m-icon-btn" data-act="full" aria-label="Full screen"${dis}>${ic('expand')}</button></div>`;

    const zoom = ok && !ui.full && ui.panel !== 'notes'
      ? `<div class="v-zoom" role="group" aria-label="Zoom"><button data-act="zoom-out" aria-label="Zoom out"${ui.zoom === 'fit' ? ' disabled' : ''}>${ic('minus')}</button>
          <button class="v-zoom-label" data-act="fit" aria-label="Fit to the screen" data-zoom-label>${pct(ui.scale)}</button><button data-act="zoom-in" aria-label="Zoom in">${ic('plus')}</button></div>`
      : '';
    const over = ui.state === 'loading' ? loadingCard() : ok ? `${hint(o)}${zoom}${exit()}` : errorCard();
    const pagesMenu =
      ui.panel === 'pages'
        ? `<div class="v-scrim-clear" data-act="close-panel"></div><div class="v-pop is-center" role="menu" id="v-pages" aria-label="Canvas pages">${c.pages
            .map((pg) => `<button role="menuitemradio" aria-checked="${pg.id === p.id}" data-act="page" data-id="${esc(pg.id)}"><span class="v-check">${pg.id === p.id ? ic('check') : ''}</span><span class="v-pop-main">${esc(pg.title)}<small>${esc(pg.round)}</small></span><span class="v-count">${optsOf(pg).length}</span></button>`)
            .join('')}</div>`
        : '';
    const layer = ui.panel === 'menu' ? moreMenu() : pagesMenu;
    return { top, bottom: `${notes}${strip}${ctrl}`, over, layer };
  }

  /* ---------- B: the options as a list, then one option with its note under it ---------- */
  const row = (it) =>
    `<button class="m-row v-orow" data-act="open-opt" data-id="${esc(it.id)}"><span class="v-tag">${esc(it.id)}</span><span class="m-row-main"><span class="m-row-title">${esc(it.name)}</span>
      <span class="v-idea">${esc(it.note?.idea ?? '')}</span>${ui.seen.has(it.id) ? `<span class="v-seen">${ic('check')}Viewed</span>` : ''}</span>${ic('chevron')}</button>`;

  function listScreen() {
    const c = cv();
    const p = pageOf();
    const more = `<button class="m-icon-btn" data-act="menu" aria-label="More" aria-haspopup="menu" aria-expanded="${ui.panel === 'menu'}" aria-controls="v-menu"${ui.state === 'failed' ? ' disabled' : ''}>${ic('more')}</button>`;
    const top = `${status()}${vbar('<h1>Canvas</h1>', backBtn(`#${c.ticket}`), more)}`;
    if (ui.state === 'failed' || ui.state === 'limited')
      return `${top}<div class="m-scroll"><div class="v-list-head"><h2>#${c.ticket}’s canvas</h2><p class="v-meta">${esc(c.branch)}</p></div>
        <div style="position:relative;height:360px">${errorCard()}</div></div>`;
    const loading = ui.state === 'loading';
    const share = Math.round((ui.files / c.files) * 100);
    const progress = loading
      ? `<div class="v-line-progress" role="progressbar" aria-label="Downloading the canvas" aria-valuemin="0" aria-valuemax="${c.files}" aria-valuenow="${ui.files}" aria-valuetext="${ui.files} of ${c.files} files"><span style="width:${share}%"></span></div>
         <p class="v-status-line" style="margin-top:8px">${ic('download')}Downloading the rest · ${ui.files} of ${c.files} files · you can start reading</p>`
      : ui.state === 'offline'
        ? cached()
        : '';
    const n = everyIn(c).length;
    const headHtml = `<div class="v-list-head"><h2>${esc(c.title)}</h2><p class="v-meta">${n} options · ${c.pages.length} pages · ${esc(c.sizeLabel.toLowerCase())}${loading ? '' : ' · saved on this phone'}</p></div>
      <div class="v-ask-card"><span class="v-kick">Deciding</span><p>${esc(c.question)}</p></div>`;
    const pageBtn = `<div class="m-filter-row"><button class="m-filter-btn" data-act="pagesheet" aria-haspopup="dialog" aria-label="Canvas page, showing ${esc(roundTitle(p))}">${ic('layers')}<span>Page</span><b>${esc(roundTitle(p))}</b>${ic('down')}</button></div>`;
    const sections = p.sections.map((s) => `<div class="m-section-title">${esc(s.title)}</div><div class="m-group">${s.items.map(row).join('')}</div>`).join('');
    const boardNotes = p.boardNotes.length
      ? `<div class="m-section-title">Notes on the board</div><div class="m-group">${p.boardNotes.map((bn, i) => `<button class="m-row" data-act="board-note" data-i="${i}">${ic('notes')}<span class="m-row-main"><span class="m-row-title">${esc(bn.name)}</span></span>${ic('chevron')}</button>`).join('')}</div>`
      : '';
    const layer = ui.panel === 'pagesheet' ? pageSheet() : ui.panel === 'menu' ? moreMenu() : ui.panel?.startsWith('note-') ? boardNoteSheet(Number(ui.panel.slice(5))) : '';
    return `${top}${progress}<div class="m-scroll">${headHtml}${pageBtn}${sections}${boardNotes}</div>${layer}`;
  }

  function pageSheet() {
    const c = cv();
    const p = pageOf();
    return `<div class="m-scrim" data-act="close-panel"></div><section class="m-sheet" role="dialog" aria-modal="true" aria-labelledby="v-page-title">
      <button class="m-grab" data-act="close-panel" aria-label="Close"></button>
      <div class="m-scroll"><h2 class="m-sheet-title" id="v-page-title" tabindex="-1">Canvas pages</h2><div class="m-group">${c.pages
        .map((pg) => `<button class="m-row" data-act="page" data-id="${esc(pg.id)}" aria-pressed="${pg.id === p.id}"><span class="m-row-main"><span class="m-row-title">${esc(pg.title)}</span><span class="m-row-sub">${esc(pg.round)} · ${optsOf(pg).length} options</span></span>${pg.id === p.id ? `<span class="m-pick">${ic('check')}</span>` : ''}</button>`)
        .join('')}</div></div></section>`;
  }

  function boardNoteSheet(i) {
    const bn = pageOf().boardNotes[i];
    if (!bn) return '';
    return `<div class="m-scrim" data-act="close-panel"></div><section class="m-sheet is-half" role="dialog" aria-modal="true" aria-labelledby="v-bn-title">
      <button class="m-grab" data-act="close-panel" aria-label="Close"></button>
      <div class="v-sheet-head"><b id="v-bn-title" tabindex="-1">${esc(bn.name)}</b><button class="m-icon-btn" data-act="close-panel" aria-label="Close" style="color:var(--text-secondary)">${ic('close')}</button></div>
      <div class="m-scroll v-note"><p>${esc(bn.text)}</p></div></section>`;
  }

  function partsB() {
    const o = current();
    const sib = siblings(o);
    const k = sib.findIndex((x) => x.id === o.id) + 1;
    const ok = viewable();
    const title = `<h1 class="v-name" tabindex="-1" style="margin:0;max-width:210px;align-items:center;font:inherit"><b><span class="v-tag">${esc(o.id)}</span><span>${esc(o.name)}</span></b><small>${esc(o.section)} · ${k} of ${sib.length}</small></h1>`;
    const top = `${status()}${vbar(title, backBtn('Options'), `<button class="m-icon-btn" data-act="full" aria-label="Full screen"${ok ? '' : ' disabled'}>${ic('expand')}</button>`)}${ui.state === 'offline' ? cached() : ''}`;
    const bottom = `<button class="v-notestrip" data-act="notes" aria-haspopup="dialog" aria-expanded="${ui.panel === 'notes'}" aria-label="Note for ${esc(o.id)}: ${esc(o.note?.idea ?? 'none')}. Open the full note.">${ic('info')}<span class="v-ns-text">${esc(o.note?.idea ?? 'No note on this option.')}</span>${ic('up')}</button>`;
    const zoomed = ui.zoom !== 'fit';
    const chipBtn =
      ok && !ui.full && (zoomed || isDesktop(o))
        ? `<button class="v-zchip" data-act="zoom-cycle" aria-label="Zoom, now ${pct(ui.scale)}. ${zoomed ? 'Tap to fit' : 'Tap for 100%'}"><b data-zoom-label>${pct(ui.scale)}</b><span>· ${zoomed ? 'Fit' : 'Zoom'}</span></button>`
        : '';
    const over = ui.state === 'loading' ? loadingCard() : ok ? `${hint(o)}${chipBtn}${exit()}` : errorCard();
    const list = optsOf(pageOf());
    const next = list[(list.findIndex((x) => x.id === o.id) + 1) % list.length];
    const layer =
      ui.panel === 'notes'
        ? `<div class="m-scrim" data-act="notes"></div><section class="m-sheet is-half" role="dialog" aria-modal="true" aria-labelledby="v-note-title">
            <button class="m-grab" data-act="notes" aria-label="Close the note"></button>
            <div class="v-sheet-head"><span class="v-tag">${esc(o.id)}</span><b id="v-note-title" tabindex="-1">${esc(o.name)}</b><button class="m-icon-btn" data-act="notes" aria-label="Close the note" style="color:var(--text-secondary)">${ic('close')}</button></div>
            <div class="m-scroll"><div class="v-note">${noteBody(o, { ask: false })}</div>
            <button class="m-btn is-quiet v-next" data-act="next-from-note">Next: ${esc(next.id)} · ${esc(next.name)}</button></div></section>`
        : '';
    return { top, bottom, over, layer };
  }

  /* ---------- C: the option fills the screen; one bar you swipe ---------- */
  function partsC() {
    const c = cv();
    const o = current();
    const sib = siblings(o);
    const k = sib.findIndex((x) => x.id === o.id) + 1;
    const ok = viewable();
    const loading = ui.state === 'loading';
    const dis = ok ? '' : ' disabled';
    let kicker = `${o.section} · ${k} of ${sib.length}`;
    let name = `<span class="v-tag">${esc(o.id)}</span><span>${esc(o.name)}</span>`;
    let extra = '';
    let cls = '';
    if (loading) {
      kicker = `Downloading · ${ui.files} of ${c.files} files`;
      name = `<span>${esc(c.title)}</span>`;
      extra = `<span class="v-fill" aria-hidden="true"><span style="width:${Math.round((ui.files / c.files) * 100)}%"></span></span>`;
    } else if (!ok) {
      kicker = ui.state === 'limited' ? 'GitHub’s limit is used up' : 'Can’t download';
      name = `<span>${ui.state === 'limited' ? `Try again after ${DATA.limitReset}` : `You’re offline · about ${Math.round(c.mb)} MB`}</span>`;
      cls = ' is-error';
    } else if (ui.state === 'offline') {
      kicker = `Offline · copy saved ${DATA.saved.when}`;
    } else if (ui.zoom !== 'fit') {
      kicker = `Zoomed to ${pct(ui.scale)} · ${k} of ${sib.length}`;
    }
    const dots = ok ? `<span class="v-dots" aria-hidden="true">${sib.map((x) => `<i class="${x.id === o.id ? 'is-on' : ''}"></i>`).join('')}</span>` : '';
    const label = ok ? `${o.id}, ${o.name}. ${o.section}, ${k} of ${sib.length}. Swipe, use the arrow keys, or press Enter for notes and all options.` : kicker;
    const swipe = `<div class="v-swipe${cls}" ${ok ? 'data-swipe tabindex="0"' : ''} role="group" aria-roledescription="option switcher" aria-label="${esc(label)}">${extra}<span class="v-kick">${esc(kicker)}</span><b>${name}</b>${dots}</div>`;
    const right = ok
      ? `<button class="m-icon-btn" data-act="drawer" aria-label="Notes and all options" aria-haspopup="dialog" aria-expanded="${ui.panel === 'drawer'}">${ic('up')}</button>`
      : loading
        ? '<span style="width:44px"></span>'
        : `<button class="m-icon-btn" data-act="retry" aria-label="Try again"${ui.state === 'limited' ? ' disabled' : ''}>${ic('refresh')}</button>`;
    const cbar = `<div class="v-cbar"><button class="m-icon-btn" data-act="back" aria-label="Close the canvas, back to #${c.ticket}">${ic('close')}</button>
      <button class="m-icon-btn" data-act="prev" aria-label="Previous option"${dis}>${ic('back')}</button>${swipe}
      <button class="m-icon-btn" data-act="next" aria-label="Next option"${dis}>${ic('chevron')}</button>${right}</div>`;
    const mini = `<button class="v-mini" data-act="full" aria-label="Show the bar. ${esc(o.id)}, ${k} of ${sib.length}"><span class="v-tag">${esc(o.id)}</span>${k} of ${sib.length}${ic('up')}</button>`;
    // C hides the status bar while a canvas is open, so a phone-sized option fills the screen as it would on a phone.
    const top = `<h1 class="m-sr">${esc(o.id)} · ${esc(o.name)}</h1>`;
    const placeholder = `<div class="v-placeholder" role="status"><span class="v-kick">Deciding</span><p style="margin:0">${esc(c.question)}</p><p class="v-meta" style="margin-top:12px">The first option opens here when the download finishes.</p></div>`;
    const zoomChip = ok && ui.zoom !== 'fit' && !ui.full ? `<button class="v-zchip" data-act="fit" aria-label="Zoomed to ${pct(ui.scale)}. Fit to the screen"><b data-zoom-label>${pct(ui.scale)}</b><span>· Fit</span></button>` : '';
    const over = loading ? placeholder : ok ? `${hint(o)}${zoomChip}` : errorCard();
    return { top, bottom: ui.full ? mini : cbar, over, layer: ui.panel === 'drawer' && ok ? drawerC() : '' };
  }

  function zoomSteps() {
    const fit = ui.fit;
    const steps = fit < 0.6 ? [0.5, 1] : [1.5, 2];
    return [['fit', `Fit ${pct(fit)}`], ...steps.map((z) => [z, pct(z)])];
  }

  function drawerC() {
    const c = cv();
    const o = current();
    const tab = ui.drawerTab;
    // Roving tabindex: Tab reaches the selected tab, ← → switch (keydown below).
    const tabs = `<div class="m-seg" role="tablist" aria-label="Notes or all options">${[
      ['notes', 'Notes'],
      ['options', `All options ${everyIn(c).length}`],
    ]
      .map(([k, l]) => `<button role="tab" id="v-dt-${k}" aria-selected="${tab === k}" aria-controls="v-drawer-panel" tabindex="${tab === k ? 0 : -1}" data-act="drawer-tab" data-tab="${k}">${l}</button>`)
      .join('')}</div>`;
    const grid = c.pages
      .map(
        (pg) => `<p class="v-grid-page">${esc(roundTitle(pg))}</p>${pg.sections
          .map((s) => `<p class="v-grid-title">${esc(s.title)}</p><div class="v-grid">${s.items.map((it) => `<button data-act="go-any" data-page="${esc(pg.id)}" data-id="${esc(it.id)}" aria-current="${pg.id === pageOf().id && it.id === o.id}" aria-label="${esc(it.id)}, ${esc(it.name)}"><b>${esc(it.id)}</b><span>${esc(it.name)}</span></button>`).join('')}</div>`)
          .join('')}`,
      )
      .join('');
    const body = tab === 'notes' ? `<div class="v-note">${noteBody(o)}</div>` : grid;
    const zoom = zoomSteps()
      .map(([z, l]) => `<button data-act="zoom-to" data-z="${z}" aria-pressed="${ui.zoom === z}">${l}</button>`)
      .join('');
    const themeName = ui.theme === null ? 'follows the phone' : ui.theme;
    const tools = `<div class="v-drawer-tools"><div class="m-seg" role="group" aria-label="Zoom">${zoom}</div><span style="flex:1"></span>
      <button class="m-icon-btn" data-act="full" aria-label="Full screen">${ic('expand')}</button>
      <button class="m-icon-btn" data-act="theme-cycle" aria-label="Canvas theme, ${themeName}">${ic('theme')}</button>
      <button class="m-icon-btn" data-toast="Would open ${esc(c.branch)} on GitHub" aria-label="Open on GitHub">${ic('external')}</button></div>`;
    return `<div class="m-scrim" data-act="close-panel"></div><section class="m-sheet v-drawer" role="dialog" aria-modal="true" aria-labelledby="v-drawer-title" style="height:64%">
      <button class="m-grab" data-act="close-panel" aria-label="Close"></button>
      <div class="v-sheet-head"><span class="v-tag">${esc(o.id)}</span><b id="v-drawer-title" tabindex="-1">${esc(o.name)}</b><button class="m-icon-btn" data-act="close-panel" aria-label="Close" style="color:var(--text-secondary)">${ic('close')}</button></div>
      ${tabs}<div class="v-drawer-body" role="tabpanel" id="v-drawer-panel" aria-labelledby="v-dt-${tab}"${tab === 'notes' ? ' tabindex="0"' : ''}>${body}</div>${tools}</section>`;
  }

  /* ---------- the viewer's stage: one option, fitted to its declared width ---------- */
  function mountViewer() {
    if ($('v-stage')) return;
    // The overlay (zoom, hint, exit) comes before the stage, so Tab reaches it before the option's own controls.
    app.innerHTML = `<div class="v-viewer d-${D}" id="v-viewer"><div class="v-top" id="v-top"></div><div class="v-wrap"><div class="v-over" id="v-over"></div><div class="v-stage" id="v-stage">
      <div class="v-canvas" id="v-canvas"><iframe id="v-frame" sandbox="allow-scripts" title="Option"></iframe></div></div></div>
      <div class="v-bottom" id="v-bottom"></div><div id="v-layer"></div></div>`;
    new ResizeObserver(() => layout()).observe($('v-stage'));
  }

  function layout() {
    const stage = $('v-stage');
    if (!stage) return;
    const o = current();
    const { w, h } = sizeOf(o);
    // A and B leave a strip of stage above and below, so the option reads as a page, not the app.
    const gap = D === 'C' || ui.full ? 0 : 10;
    const sw = stage.clientWidth;
    const sh = stage.clientHeight - gap * 2;
    if (!sw || sh <= 0) return;
    // A's notes push the stage up; keep the option's layout and shrink it whole instead.
    const pushed = D === 'A' && ui.panel === 'notes' ? ($('v-notes')?.offsetHeight ?? 0) : 0;
    const layoutH = Math.round(Math.min(h, (sh + pushed) / (sw / w)));
    ui.fit = Math.min(sw / w, sh / layoutH);
    ui.scale = ui.zoom === 'fit' ? ui.fit : ui.zoom;
    const frame = $('v-frame');
    frame.style.width = `${w}px`;
    frame.style.height = `${layoutH}px`;
    frame.style.transform = `scale(${ui.scale})`;
    $('v-canvas').style.width = `${Math.round(w * ui.scale)}px`;
    $('v-canvas').style.height = `${Math.round(layoutH * ui.scale)}px`;
    for (const el of app.querySelectorAll('[data-zoom-label]')) el.textContent = pct(ui.scale);
  }

  function renderViewer() {
    mountViewer();
    $('v-viewer').classList.toggle('is-full', ui.full);
    const partsOf = () => (D === 'A' ? partsA() : D === 'B' ? partsB() : partsC());
    // Bars first, so the stage has its size; then the parts that print the fitted zoom.
    let parts = partsOf();
    $('v-top').innerHTML = parts.top;
    $('v-bottom').innerHTML = parts.bottom;
    const o = current();
    const ok = viewable();
    $('v-canvas').hidden = !ok;
    if (ok) {
      const src = frameSrc(o);
      const frame = $('v-frame');
      if (frame.getAttribute('src') !== src) frame.setAttribute('src', src);
      frame.title = `Option ${o.id}: ${o.name}`;
    }
    layout();
    parts = partsOf();
    $('v-over').innerHTML = parts.over;
    $('v-layer').innerHTML = parts.layer;
    layout();
    const strip = app.querySelector('.v-strip');
    const on = strip?.querySelector('[aria-current="true"]');
    if (strip && on) strip.scrollLeft = on.offsetLeft - strip.clientWidth / 2 + on.offsetWidth / 2;
  }

  /* ---------- render, navigation ---------- */
  function render() {
    const screen = here();
    const key = focusKey(document.activeElement);
    if (screen === 'viewer') renderViewer();
    else app.innerHTML = screen === 'list' ? listScreen() : screen === 'cards' ? cardsScreen() : ticketScreen();
    document.title = `${D} · ${screen}`;
    // A render replaces the bars (the download ticks every 120 ms), so put focus back on the same control.
    if (key && !app.contains(document.activeElement)) app.querySelector(key)?.focus();
  }
  function focusKey(el) {
    if (!el || el === document.body || !app.contains(el)) return null;
    const attrs = ['data-act', 'data-id', 'data-tab', 'data-theme', 'data-z', 'data-page', 'data-i']
      .filter((name) => el.hasAttribute(name))
      .map((name) => `[${name}="${CSS.escape(el.getAttribute(name))}"]`)
      .join('');
    if (attrs) return attrs;
    if (el.id) return `#${CSS.escape(el.id)}`;
    return el.classList.length ? `${el.tagName.toLowerCase()}.${[...el.classList].map((c) => CSS.escape(c)).join('.')}` : el.tagName.toLowerCase();
  }
  // Renders are synchronous, so focus lands on the new markup on the next frame.
  const focusLater = (selector) => requestAnimationFrame(() => app.querySelector(selector)?.focus());
  const announce = (text) => {
    const el = $('v-live');
    el.textContent = '';
    setTimeout(() => (el.textContent = text), 30);
  };
  const announceOption = () => {
    const o = current();
    announce(`${o.id}, ${o.name}. ${o.section}.`);
  };

  let timer = null;
  function download() {
    clearInterval(timer);
    ui.state = 'loading';
    ui.files = 2;
    ui.panel = null;
    render();
    timer = setInterval(() => {
      ui.files = Math.min(cv().files, ui.files + 4);
      if (ui.files >= cv().files) {
        clearInterval(timer);
        ui.state = 'ready';
        ui.saved = true;
        announce('Canvas downloaded.');
      }
      render();
    }, 120);
  }

  function step(dir) {
    if (D === 'C') {
      const all = everyIn(cv());
      const i = all.findIndex((o) => o.page === pageOf().id && o.id === current().id);
      const next = all[(i + dir + all.length) % all.length];
      ui.page = next.page;
      ui.opt = next.id;
    } else {
      const list = optsOf(pageOf());
      const i = list.findIndex((o) => o.id === current().id);
      ui.opt = list[(i + dir + list.length) % list.length].id;
    }
    ui.zoom = 'fit';
    ui.seen.add(ui.opt);
    render();
    announceOption();
  }

  function openViewer() {
    if (D === 'B') stack.push('list');
    else stack.push('viewer');
    ui.panel = null;
    ui.zoom = 'fit';
    focusLater(!ui.saved ? (D === 'C' ? '[data-act="back"]' : '.m-back') : D === 'A' ? '.v-title' : D === 'B' ? '.m-filter-btn' : '.v-swipe');
    if (!ui.saved) download();
    else render();
  }

  function back() {
    if (stack.length > 1) stack.pop();
    ui.panel = null;
    ui.full = false;
    ui.zoom = 'fit';
    if (here() === 'ticket' && ui.state === 'loading') {
      clearInterval(timer);
      ui.state = 'ready';
    }
    render();
    focusLater(here() === 'list' ? `[data-act="open-opt"][data-id="${CSS.escape(current().id)}"]` : '[data-act="open"]');
  }

  function zoomBy(dir) {
    const ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3];
    const cur = ui.scale;
    if (dir > 0) ui.zoom = ZOOMS.find((z) => z > cur + 0.001) ?? cur;
    else {
      const lower = [...ZOOMS].reverse().find((z) => z < cur - 0.001);
      ui.zoom = lower === undefined || lower <= ui.fit + 0.001 ? 'fit' : lower;
    }
    keepCentre(render);
  }
  function keepCentre(fn) {
    const stage = $('v-stage');
    const box = $('v-canvas');
    const rx = stage && box?.offsetWidth ? (stage.scrollLeft + stage.clientWidth / 2) / box.offsetWidth : 0.5;
    const ry = stage && box?.offsetHeight ? (stage.scrollTop + stage.clientHeight / 2) / box.offsetHeight : 0.5;
    fn();
    if (stage && box) {
      stage.scrollLeft = rx * box.offsetWidth - stage.clientWidth / 2;
      stage.scrollTop = ry * box.offsetHeight - stage.clientHeight / 2;
    }
  }

  // Closing a panel puts focus back on the control that opened it (C's drawer opens from the bar or from ⌃).
  let opener = null;
  function togglePanel(name, from) {
    ui.panel = ui.panel === name ? null : name;
    render();
    if (ui.panel) {
      opener = from;
      focusLater(name.startsWith('note-') ? '#v-bn-title' : { pages: '#v-pages [role^="menuitem"]', menu: '#v-menu [role^="menuitem"]', notes: D === 'A' ? '#v-notes .m-icon-btn' : '#v-note-title', drawer: '#v-drawer-title', pagesheet: '#v-page-title' }[name] ?? 'h1');
    } else focusLater(from);
  }
  const openerFor = (panel) =>
    ({ pages: '[data-act="pages"]', menu: '[data-act="menu"]', notes: '[data-act="notes"]', drawer: '[data-act="drawer"]', pagesheet: '[data-act="pagesheet"]' })[panel] ?? (panel?.startsWith('note-') ? `[data-act="board-note"][data-i="${panel.slice(5)}"]` : 'h1');
  function closePanel() {
    const back = opener ?? openerFor(ui.panel);
    opener = null;
    ui.panel = null;
    render();
    focusLater(back);
  }

  let swiped = false;
  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act],[data-toast],[data-swipe]');
    if (!el || el.disabled) return;
    if (el.dataset.toast) return Kit.toast(el.dataset.toast);
    if (el.hasAttribute('data-swipe')) {
      if (swiped) return (swiped = false);
      ui.drawerTab = 'notes';
      return togglePanel('drawer', '.v-swipe');
    }
    const act = el.dataset.act;
    switch (act) {
      case 'map':
        return Kit.toast(`Would go back to map #${ticket().map}`);
      case 'ticket-tab':
        ui.ticketTab = el.dataset.tab;
        render();
        return focusLater(`[data-tab="${el.dataset.tab}"]`);
      case 'open':
        return openViewer();
      case 'back':
        return back();
      case 'cancel':
        clearInterval(timer);
        ui.state = 'ready';
        ui.saved = false;
        return back();
      case 'retry':
        return download();
      case 'check':
        ui.panel = null;
        render();
        return Kit.toast(`Checked GitHub: nothing changed since ${cv().updated}, so nothing downloaded.`);
      case 'open-opt':
        ui.opt = el.dataset.id;
        ui.seen.add(ui.opt);
        ui.zoom = 'fit';
        ui.panel = null;
        stack.push('viewer');
        render();
        return focusLater('.v-bar h1');
      case 'go':
        ui.opt = el.dataset.id;
        ui.zoom = 'fit';
        render();
        announceOption();
        return focusLater(`.v-chip[data-id="${CSS.escape(el.dataset.id)}"]`);
      case 'go-any':
        ui.page = el.dataset.page;
        ui.opt = el.dataset.id;
        ui.zoom = 'fit';
        ui.panel = null;
        render();
        announceOption();
        return focusLater('.v-swipe');
      case 'prev':
      case 'next':
        step(act === 'next' ? 1 : -1);
        return focusLater(`[data-act="${act}"]`);
      case 'next-from-note': {
        const list = optsOf(pageOf());
        ui.opt = list[(list.findIndex((x) => x.id === current().id) + 1) % list.length].id;
        ui.seen.add(ui.opt);
        ui.zoom = 'fit';
        render();
        announceOption();
        return focusLater('#v-note-title');
      }
      case 'page':
        ui.page = el.dataset.id;
        ui.opt = null;
        ui.zoom = 'fit';
        ui.panel = null;
        render();
        announce(`${roundTitle(pageOf())}. ${optsOf(pageOf()).length} options.`);
        return focusLater(D === 'A' ? '.v-title' : '.m-filter-btn');
      case 'pages':
      case 'menu':
      case 'notes':
      case 'drawer':
      case 'pagesheet':
        return togglePanel(act, openerFor(act));
      case 'board-note':
        return togglePanel(`note-${el.dataset.i}`, openerFor(`note-${el.dataset.i}`));
      case 'close-panel':
        return closePanel();
      case 'drawer-tab':
        ui.drawerTab = el.dataset.tab;
        render();
        return focusLater(`[data-act="drawer-tab"][data-tab="${el.dataset.tab}"]`);
      case 'full':
        ui.full = !ui.full;
        ui.panel = null;
        render();
        announce(ui.full ? 'Full screen.' : 'Left full screen.');
        return focusLater(ui.full ? (D === 'C' ? '.v-mini' : '.v-exit') : D === 'C' ? '[data-act="drawer"]' : '[data-act="full"]');
      case 'zoom-in':
      case 'zoom-out':
        return zoomBy(act === 'zoom-in' ? 1 : -1);
      case 'fit':
        ui.zoom = 'fit';
        return render();
      case 'zoom-cycle':
        ui.zoom = ui.zoom === 'fit' ? (ui.fit < 0.6 ? 1 : 2) : 'fit';
        return keepCentre(render);
      case 'zoom-to':
        // A zoom step closes the drawer, so the zoomed option shows at once.
        ui.zoom = el.dataset.z === 'fit' ? 'fit' : Number(el.dataset.z);
        ui.panel = null;
        keepCentre(render);
        return focusLater('.v-swipe');
      case 'theme':
        ui.theme = el.dataset.theme || null;
        return render();
      case 'theme-cycle':
        ui.theme = ui.theme === null ? 'light' : ui.theme === 'light' ? 'dark' : null;
        render();
        return announce(`Canvas theme: ${ui.theme ?? 'follows the phone'}.`);
    }
  });

  // C: swipe the bar sideways to step through options.
  let drag = null;
  app.addEventListener('pointerdown', (e) => {
    const target = e.target.closest('[data-swipe]');
    if (target) drag = { x: e.clientX, target };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const name = drag.target.querySelector('b');
    if (name) name.style.transform = `translateX(${(e.clientX - drag.x) * 0.6}px)`;
  });
  window.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const name = drag.target.querySelector('b');
    drag = null;
    if (Math.abs(dx) > 48) {
      swiped = true;
      step(dx < 0 ? 1 : -1);
      focusLater('.v-swipe');
    } else {
      if (Math.abs(dx) > 8) swiped = true;
      if (name) name.style.transform = '';
    }
  });

  window.addEventListener('keydown', (e) => {
    const menu = e.target.closest?.('[role="menu"]');
    if (menu && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const items = [...menu.querySelectorAll('[role^="menuitem"]')];
      const i = items.indexOf(e.target);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      return e.preventDefault();
    }
    const drawerTab = e.target.closest?.('[data-act="drawer-tab"]');
    if (drawerTab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      const keys = ['notes', 'options'];
      const i = keys.indexOf(drawerTab.dataset.tab);
      ui.drawerTab = keys[e.key === 'Home' ? 0 : e.key === 'End' ? keys.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + keys.length) % keys.length];
      render();
      focusLater(`[data-act="drawer-tab"][data-tab="${ui.drawerTab}"]`);
      return e.preventDefault();
    }
    // Tab leaves a menu by closing it; inside a modal sheet or drawer, Tab cycles within it.
    if (e.key === 'Tab' && menu) {
      e.preventDefault();
      return closePanel();
    }
    const modal = e.key === 'Tab' ? app.querySelector('[aria-modal="true"]') : null;
    if (modal) {
      const items = [...modal.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null);
      const inside = modal.contains(document.activeElement);
      const [firstItem, lastItem] = [items[0], items[items.length - 1]];
      if (e.shiftKey && (!inside || document.activeElement === firstItem)) {
        lastItem?.focus();
        e.preventDefault();
      } else if (!e.shiftKey && (!inside || document.activeElement === lastItem)) {
        firstItem?.focus();
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'Escape') {
      if (ui.panel) return closePanel();
      if (ui.full) {
        ui.full = false;
        render();
        return focusLater(D === 'C' ? '[data-act="drawer"]' : '[data-act="full"]');
      }
      if (stack.length > 1) return back();
    }
    if (e.target.closest?.('[data-swipe]') && e.key === 'Enter') {
      ui.drawerTab = 'notes';
      return togglePanel('drawer', '.v-swipe');
    }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && here() === 'viewer' && !ui.panel && D !== 'B' && viewable()) {
      step(e.key === 'ArrowRight' ? 1 : -1);
      if (e.target.closest?.('[data-swipe]')) focusLater('.v-swipe');
      e.preventDefault();
    }
  });

  render();
})();
