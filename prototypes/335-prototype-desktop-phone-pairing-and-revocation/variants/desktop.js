/*
  #335: the desktop side of phone pairing and removal, for #224's chosen phone flow.
  ?o=A  Settings › Phones, pairing and removal in dialogs.
  ?o=B  Settings › Phones, pairing and removal in place on the page.
  ?o=C  A Phones button in the top bar; everything happens in its popover.
  ?o=A2 Round 2: A with Ramon's notes on the Three phones frame (centred rows, unwrapped phone lines,
        a line under "This desktop"). Behaves exactly like A; only desktop.css's .p335-r2 rules differ.
  ?o=A3 Round 3: A2 with Ramon's notes on A2's Three phones frame. No Phones page heading, a lined
        header on each section, larger row names, no count beside Paired phones. &c= places the count:
        nav (Settings › Phones in the categories), lead (the page's first line), desk (RAMON‑PC's row),
        none (left out, for frames about something else). Behaves like A otherwise.
  ?o=A4 Round 4: A3-nav, Ramon's pick, plus a second count at the right end of Paired phones' header,
        where his pin sits. Both counts read the same list, so they always agree. Behaves like A3 otherwise.
  ?s=closed|empty|prereq|list|code|ending|expired|paired|confirm|removed|removed-offline opens that state.
  Frames load still: the code's countdown only runs after you show a code yourself. Nothing leaves the page.
*/
(() => {
  const q = new URLSearchParams(location.search);
  const R4 = q.get('o') === 'A4';
  const R3 = q.get('o') === 'A3' || R4;
  const R2 = q.get('o') === 'A2' || R3;
  const O = R2 ? 'A' : ['A', 'B', 'C'].includes(q.get('o')) ? q.get('o') : 'A';
  // Round 3's open question: where the count of paired phones shows. One place per frame, never two.
  const COUNT = R4 ? 'nav' : R3 ? (['nav', 'lead', 'desk'].includes(q.get('c')) ? q.get('c') : 'none') : null;
  document.body.classList.toggle('p335-r2', R2);
  document.body.classList.toggle('p335-r3', R3);
  document.body.classList.toggle('p335-r4', R4);
  const STATES = ['closed', 'empty', 'prereq', 'list', 'code', 'ending', 'expired', 'paired', 'confirm', 'removed', 'removed-offline'];
  const START = STATES.includes(q.get('s')) ? q.get('s') : 'list';
  const P = window.P335;
  const D = P.desktop;
  const esc = Kit.esc;
  const ic = Kit.icon;
  const $ = (s) => document.querySelector(s);
  const byId = (id) => [...P.phones, P.newPhone].find((p) => p.id === id);
  const phoneNamed = (id) => st.phones.find((p) => p.id === id);

  /* ---------- state ---------- */
  const st = {
    phones: [byId('iphone'), byId('pixel'), byId('old')],
    tailscale: 'ok', // ok | off
    pair: null, // { phase: fresh | expired | used, code, left (s), by }
    confirm: null, // id of the phone being removed
    removing: false,
    notice: null, // { text, more }
    fresh: null, // id of a phone that just paired
    open: true, // C: the popover is open
    view: 'list', // C: list | code | confirm
    ticking: false,
  };
  const codeOf = (c, left) => ({ phase: 'fresh', code: c, left });
  const removedNotice = (p) => ({
    text: `Removed ${p.name}.`,
    more: [
      `Its token no longer works on ${D.name}${p.push ? ' and its push registration is deleted, so this desktop sends it no more pushes' : '. It had no push registration to delete'}.`,
      p.seen.startsWith('Today')
        ? `If it is holding starts, they won’t send; the phone says so the next time it reaches ${D.name}.`
        : `It hasn’t reached ${D.name} since ${p.seen}, so it finds out the next time it tries.`,
    ].join(' '),
  });
  ({
    closed() { st.open = false; },
    empty() { st.phones = []; },
    prereq() { st.phones = []; st.tailscale = 'off'; },
    list() {},
    code() { st.phones = [byId('iphone'), byId('old')]; st.pair = codeOf(P.code, 292); st.view = 'code'; },
    ending() { st.phones = [byId('iphone'), byId('old')]; st.pair = codeOf(P.code, 38); st.view = 'code'; },
    expired() { st.phones = [byId('iphone'), byId('old')]; st.pair = { ...codeOf(P.code, 0), phase: 'expired' }; st.view = 'code'; },
    paired() { st.pair = { ...codeOf(P.code, 0), phase: 'used', by: 'pixel' }; st.fresh = 'pixel'; st.view = 'code'; },
    confirm() { st.confirm = 'pixel'; st.view = 'confirm'; },
    removed() { st.phones = [byId('iphone'), byId('old')]; st.notice = removedNotice(byId('pixel')); },
    'removed-offline'() { st.phones = [byId('iphone'), byId('pixel')]; st.notice = removedNotice(byId('old')); },
  })[START]();
  if (O !== 'C') st.open = true;

  /* ---------- announcements ---------- */
  let liveTimer;
  function announce(text) {
    const live = $('#live');
    live.textContent = '';
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => (live.textContent = text), 40);
  }

  /* ---------- shared pieces ---------- */
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const ready = () => st.tailscale === 'ok';

  // A stand-in QR: a seeded pattern with the three finder squares. Not scannable.
  function qr(text, size, expired) {
    const n = 25;
    let seed = [...text].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 16) & 1;
    const finder = (x, y) => [[0, 0], [n - 7, 0], [0, n - 7]].some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);
    let cells = '';
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        if (finder(x, y)) continue;
        if (rnd()) cells += `M${x} ${y}h1v1h-1z`;
      }
    const fsq = ([fx, fy]) => `<path d="M${fx} ${fy}h7v7h-7zM${fx + 1} ${fy + 1}v5h5v-5z" fill-rule="evenodd"/><path d="M${fx + 2} ${fy + 2}h3v3h-3z"/>`;
    return `<svg class="p335-qr-svg" width="${size}" height="${size}" viewBox="-2 -2 ${n + 4} ${n + 4}" role="img" aria-label="${expired ? 'Expired pairing' : 'Pairing'} QR code for ${esc(D.name)} (prototype pattern, not scannable)"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><g fill="#0b0b0b"><path d="${cells}"/>${[[0, 0], [n - 7, 0], [0, n - 7]].map(fsq).join('')}</g></svg>`;
  }

  const copyBtn = (what, label) => `<button type="button" class="iconbtn p335-copy" data-act="copy" data-what="${what}" aria-label="Copy ${label}" title="Copy ${label}">${ic('copy')}</button>`;

  function timerLine() {
    const p = st.pair;
    const c = p.code;
    if (p.phase === 'expired') return `<p class="p335-timer is-over" id="pair-timer">${ic('alert')}<span>Expired at ${c.expires}. This code no longer works.</span></p>`;
    const warn = p.left <= 60;
    return `<p class="p335-timer${warn ? ' is-warn' : ''}" id="pair-timer" role="timer" aria-live="off">${ic('clock')}<span>Works once · expires in <b class="p335-left">${mmss(p.left)}</b> <span class="p335-at">(at ${c.expires})</span></span></p>`;
  }

  /** The code itself, in every option: QR, typeable address and code, and its time left. */
  function codePanel(compact) {
    const p = st.pair;
    const c = p.code;
    if (p.phase === 'used') {
      const by = phoneNamed(p.by) ?? byId(p.by);
      return `<div class="p335-done" role="status">
          <span class="p335-done-mark" aria-hidden="true">${ic('check')}</span>
          <div><h3 class="p335-done-title" id="pair-title" tabindex="-1">Paired with ${esc(by.name)}</h3>
          <p class="hint">Code <code class="p335-used">${esc(c.text)}</code> was used at 10:16 and no longer works. ${esc(by.name)} ${compact ? 'is in the list' : 'is in Paired phones'}.</p></div></div>
        <div class="p335-actions"><button type="button" class="primary" data-act="new-code">${ic('plus')}Pair another phone</button><button type="button" class="ghost" data-act="stop" data-focus-first>Done</button></div>`;
    }
    const expired = p.phase === 'expired';
    const lead = `On your phone, choose <b>Scan pairing code</b>. Or choose <b>Enter code instead</b> and type both lines.`;
    return `<div class="p335-code${compact ? ' is-compact' : ''}${expired ? ' is-expired' : ''}">
        <div class="p335-qr">${qr(c.text, compact ? 132 : 168, expired)}${expired ? `<span class="p335-qr-over" aria-hidden="true">Expired</span>` : ''}</div>
        <div class="p335-code-main">
          <p class="p335-lead">${lead}</p>
          <dl class="p335-fields">
            <div><dt id="lbl-host">Desktop address</dt><dd><code class="p335-type" aria-labelledby="lbl-host">${esc(D.host)}</code>${copyBtn('host', 'desktop address')}</dd></div>
            <div><dt id="lbl-code">Pairing code</dt><dd>${expired ? `<span class="p335-type is-code is-expired">${esc(c.text)}<span class="p335-sr">, expired</span></span>` : `<code class="p335-type is-code" aria-labelledby="lbl-code">${esc(c.text)}</code>${copyBtn('code', 'pairing code')}`}</dd></div>
          </dl>
          ${timerLine()}
        </div>
      </div>
      <div class="p335-actions">${
        expired
          ? `<button type="button" class="primary" data-act="new-code" data-focus-first>${ic('refresh')}Show a new code</button><button type="button" class="ghost" data-act="stop">${O === 'C' ? 'Back' : 'Close'}</button>`
          : `<button type="button" class="ghost" data-act="new-code">${ic('refresh')}New code</button><button type="button" class="ghost" data-act="stop" data-focus-first>${O === 'B' ? 'Stop pairing' : O === 'C' ? 'Back' : 'Cancel'}</button>`
      }</div>
      ${expired ? '' : `<div class="p335-proto" role="group" aria-label="Prototype controls"><span>Prototype:</span><button type="button" data-act="sim-use">Phone uses this code</button><button type="button" data-act="sim-ending">Skip to the last minute</button><button type="button" data-act="sim-expire">Let it expire</button></div>`}`;
  }

  const pushLine = (p) =>
    p.push
      ? `<span class="p335-push">${ic('push')}Registered for pushes</span>`
      : `<span class="p335-push is-off">${ic('pushOff')}Not registered for pushes · ${esc(p.pushWhy)}</span>`;
  const phoneMeta = (p) => `${esc(p.model)} · Paired ${esc(p.paired)} · Last reached ${esc(p.seen)}`;

  /** What removing does, said the same way in every option. */
  const removeBody = (p) =>
    `${esc(p.name)} can no longer start tickets or watch sessions on ${esc(D.name)}. ${
      p.push ? 'Its push registration is deleted, so it gets no more pushes from this desktop.' : 'It has no push registration to delete.'
    } Starts it is holding won’t send. To use it again, pair it with a new code.`;

  function noticeHtml() {
    if (!st.notice) return '';
    return `<div class="p335-notice" role="status" tabindex="-1" id="notice">${ic('check')}<span><b>${esc(st.notice.text)}</b> ${esc(st.notice.more)}</span><button type="button" class="iconbtn" data-act="dismiss" aria-label="Dismiss">${ic('close')}</button></div>`;
  }

  function tailscaleOff() {
    return `<div class="p335-prereq" role="alert">${ic('alert')}<div><b>Tailscale isn’t running on ${esc(D.name)}</b><p class="hint">Phones reach this desktop through Tailscale. Start it, signed in to the same account as your phone, then check again. Phones already paired reconnect by themselves.</p></div><button type="button" class="ghost" data-act="recheck">${ic('refresh')}Check again</button></div>`;
  }

  /* ---------- Settings (A and B) ---------- */
  const CATEGORIES = [
    ['appearance', 'Appearance', 'moon'],
    ['shortcuts', 'Keyboard shortcuts', 'keyboard'],
    ['tasks', 'Tasks & models', 'sliders'],
    ['notifications', 'Notifications', 'bell'],
    ['phones', 'Phones', 'phone'],
    ['progress', 'Progress', 'map'],
    ['account', 'Account', 'person'],
    ['help', 'Help', 'help'],
  ];
  /** Round 3: "3 phones paired". At zero the count hides wherever it sits; the list says "No phones paired yet". */
  const pairedCount = () => (st.phones.length === 1 ? '1 phone paired' : `${st.phones.length} phones paired`);
  const navCount = (id) =>
    COUNT === 'nav' && id === 'phones' && st.phones.length
      ? `<span class="badge p335-nav-count"><span aria-hidden="true">${st.phones.length}</span><span class="p335-sr">, ${pairedCount()}</span></span>`
      : '';
  const nav = (current) =>
    CATEGORIES.map(([id, name, icon]) => `<a href="#" ${id === current ? 'aria-current="location"' : `data-to="Settings › ${name}"`}>${ic(icon)}${name}${navCount(id)}</a>`).join('');

  function categoryHeading() {
    const lead = `Phones paired with ${esc(D.name)} start tickets here and watch them run.`;
    if (!R3) return `<header class="settings-category-heading"><h2 id="cat-title">Phones</h2><p>${lead}</p></header>`;
    // Round 3: "Phones" is gone; the line under it stays as the page's lead.
    if (COUNT === 'lead' && st.phones.length)
      return `<p class="p335-lead-line"><b class="p335-lead-count">${pairedCount()}</b> with ${esc(D.name)}. They start tickets here and watch them run.</p>`;
    return `<p class="p335-lead-line">${lead}</p>`;
  }

  function settingsShell(body) {
    return `<header class="settings-page-heading"><div><h1>Settings</h1><p>Make Wayfinder work your way.</p></div><span class="settings-save-note">${ic('check')}Changes save automatically</span></header>
      <div class="settings-page-layout"><nav class="settings-categories" aria-label="Settings categories">${nav('phones')}</nav>
      <div>${categoryHeading()}${noticeHtml()}${body}</div></div>`;
  }

  /** A section's heading: Round 3 sets it in its own lined header. */
  const sectionHead = (id, text, side = '') => (R3 ? `<div class="p335-sec-head"><h3 id="${id}">${text}</h3>${side}</div>` : `<h3 id="${id}">${text}</h3>`);

  function desktopRow() {
    if (!ready()) return tailscaleOff();
    return `<div class="settings-row p335-row"><span class="p335-tile" aria-hidden="true">${ic('desktop')}</span><span class="grow">${esc(D.name)}<span class="hint">Phones reach it at <code>${esc(D.host)}</code> through Tailscale.</span></span>${
      COUNT === 'desk' && st.phones.length
        ? `<span class="p335-desk-side"><span class="p335-status"><span class="p335-dot" aria-hidden="true"></span>Ready to pair</span><span class="p335-desk-count">${pairedCount()}</span></span>`
        : `<span class="p335-status"><span class="p335-dot" aria-hidden="true"></span>Ready to pair</span>`
    }</div>`;
  }

  function phoneRowA(p) {
    const isNew = st.fresh === p.id;
    return `<li class="settings-row p335-row p335-phone${isNew ? ' is-new' : ''}"><span class="p335-tile" aria-hidden="true">${ic('phone')}</span>
      <span class="grow">${esc(p.name)}${isNew ? ' <span class="badge p335-new">New</span>' : ''}<span class="hint">${phoneMeta(p)}</span><span class="hint">${pushLine(p)}</span></span>
      <button type="button" class="ghost" data-act="remove" data-id="${p.id}" aria-label="Remove ${esc(p.name)}">${ic('unlink')}Remove</button></li>`;
  }

  function phoneRowB(p) {
    if (st.confirm !== p.id) return phoneRowA(p);
    return `<li class="settings-row p335-row p335-phone is-confirming" role="group" aria-labelledby="rm-title" aria-describedby="rm-desc"><span class="p335-tile is-danger" aria-hidden="true">${ic('unlink')}</span>
      <span class="grow"><span id="rm-title">Remove ${esc(p.name)}?</span><span class="hint" id="rm-desc">${removeBody(p)}</span>
      <span class="p335-inline-actions"><button type="button" class="p335-danger" data-act="remove-yes"${st.removing ? ' disabled aria-busy="true"' : ''}>${st.removing ? 'Removing…' : `${ic('unlink')}Remove phone`}</button><button type="button" class="ghost" data-act="remove-no" data-focus-first${st.removing ? ' disabled' : ''}>Keep</button></span></span></li>`;
  }

  function phonesSection(row, withPair) {
    const count = st.phones.length;
    const pair = withPair
      ? `<div class="settings-row p335-row"><span class="grow">Pair a phone<span class="hint">Shows a code that works once and expires after ${P.code.minutes} minutes. Each phone gets its own token you can remove here.</span></span><button type="button" class="primary" data-act="pair"${ready() ? '' : ' disabled title="Start Tailscale on this desktop first"'}>${ic('qr')}Pair a phone</button></div>`
      : '';
    const list = count
      ? `<ul class="p335-list" aria-label="Paired phones">${st.phones.map(row).join('')}</ul>`
      : `<p class="p335-empty">${ic('phone')}<span>No phones paired yet. Pair one to start tickets from it and watch them run.</span></p>`;
    // Round 4: the second count, at the header's right end. Outside the h3, so the heading still reads "Paired phones".
    const side = R4 && count ? `<span class="p335-head-count">${pairedCount()}</span>` : '';
    const head = R3 ? sectionHead('phones-title', 'Paired phones', side) : `<h3 id="phones-title">Paired phones <span class="badge">${count}</span></h3>`;
    return `<section class="settings-section" aria-labelledby="phones-title">${head}${pair}${list}</section>`;
  }

  function mainA() {
    return settingsShell(`<section class="settings-section" aria-labelledby="desk-title">${sectionHead('desk-title', 'This desktop')}${desktopRow()}</section>${phonesSection(phoneRowA, true)}`);
  }

  function mainB() {
    let pairBody;
    if (!ready()) pairBody = tailscaleOff();
    else if (st.pair) pairBody = `<div class="p335-inplace">${codePanel(false)}</div>`;
    else
      pairBody = `<div class="settings-row p335-row"><span class="grow">Show a pairing code<span class="hint">For your phone to scan or type. It works once and expires after ${P.code.minutes} minutes. Phones reach ${esc(D.name)} at <code>${esc(D.host)}</code> through Tailscale.</span></span><button type="button" class="primary" data-act="pair">${ic('qr')}Show pairing code</button></div>`;
    const pairSection = `<section class="settings-section${st.pair ? ' is-pairing' : ''}" aria-labelledby="pair-h"><h3 id="pair-h" tabindex="-1">Pair a phone</h3>${pairBody}</section>`;
    return settingsShell(`${pairSection}${phonesSection(phoneRowB, false)}`);
  }

  /* ---------- A: dialogs ---------- */
  function layerA() {
    if (st.pair) {
      return `<dialog class="dialog p335-dialog" id="dlg" aria-labelledby="dlg-title"><div class="dialog-head"><h2 id="dlg-title" tabindex="-1">Pair a phone</h2><button type="button" class="detail-close" data-act="stop" aria-label="Close">×</button></div>${codePanel(false)}</dialog>`;
    }
    if (st.confirm) {
      const p = phoneNamed(st.confirm);
      return `<dialog class="dialog p335-dialog is-small" id="dlg" role="alertdialog" aria-labelledby="dlg-title" aria-describedby="dlg-desc"><div class="dialog-head"><h2 id="dlg-title" tabindex="-1">Remove ${esc(p.name)}?</h2></div>
        <p class="p335-dlg-body" id="dlg-desc">${removeBody(p)}</p>
        <div class="p335-actions is-end"><button type="button" class="ghost" data-act="remove-no" data-focus-first${st.removing ? ' disabled' : ''}>Cancel</button><button type="button" class="p335-danger" data-act="remove-yes"${st.removing ? ' disabled aria-busy="true"' : ''}>${st.removing ? 'Removing…' : `${ic('unlink')}Remove phone`}</button></div></dialog>`;
    }
    return '';
  }

  /* ---------- C: the top bar's Phones popover ---------- */
  function mainC() {
    return `<header class="settings-page-heading"><div><h1>Good morning, Ramon</h1><p>Home is unchanged; the Phones button sits in the top bar on every page.</p></div></header>
      <div class="p335-home" aria-hidden="true"><div></div><div></div><div></div></div>`;
  }

  function popoverC() {
    if (!st.open) return '';
    let body;
    if (st.view === 'code' && st.pair) {
      body = `<div class="p335-pop-head"><button type="button" class="iconbtn" data-act="stop" aria-label="Back to phones">${ic('back')}</button><h2 id="pop-title" tabindex="-1">Pair a phone</h2></div><div class="p335-pop-body">${codePanel(true)}</div>`;
    } else if (st.view === 'confirm' && st.confirm) {
      const p = phoneNamed(st.confirm);
      body = `<div class="p335-pop-head"><button type="button" class="iconbtn" data-act="remove-no" aria-label="Back to phones">${ic('back')}</button><h2 id="pop-title" tabindex="-1">Remove ${esc(p.name)}?</h2></div>
        <div class="p335-pop-body"><p class="p335-dlg-body" id="pop-desc">${removeBody(p)}</p>
        <div class="p335-actions is-end"><button type="button" class="ghost" data-act="remove-no" data-focus-first${st.removing ? ' disabled' : ''}>Keep</button><button type="button" class="p335-danger" data-act="remove-yes"${st.removing ? ' disabled aria-busy="true"' : ''}>${st.removing ? 'Removing…' : `${ic('unlink')}Remove phone`}</button></div></div>`;
    } else {
      const rows = st.phones.length
        ? `<ul class="p335-pop-list" aria-label="Paired phones">${st.phones
            .map(
              (p) => `<li class="${st.fresh === p.id ? 'is-new' : ''}"><span class="p335-tile" aria-hidden="true">${ic('phone')}</span><span class="grow"><b>${esc(p.name)}</b>${st.fresh === p.id ? ' <span class="badge p335-new">New</span>' : ''}<span class="hint">${esc(p.model)} · Last reached ${esc(p.seen)}</span><span class="hint">${pushLine(p)}</span></span><button type="button" class="iconbtn" data-act="remove" data-id="${p.id}" aria-label="Remove ${esc(p.name)}" title="Remove ${esc(p.name)}">${ic('unlink')}</button></li>`,
            )
            .join('')}</ul>`
        : `<p class="p335-empty">${ic('phone')}<span>No phones paired yet. Pair one to start tickets from it and watch them run.</span></p>`;
      const status = ready()
        ? `<p class="p335-pop-status"><span class="p335-dot" aria-hidden="true"></span>${esc(D.name)} · <code>${esc(D.host)}</code></p>`
        : tailscaleOff();
      body = `<div class="p335-pop-head"><h2 id="pop-title" tabindex="-1">Phones</h2><span class="badge">${st.phones.length} paired</span></div>
        <div class="p335-pop-body">${status}${noticeHtml()}${rows}</div>
        <div class="p335-pop-foot"><button type="button" class="primary" data-act="pair"${ready() ? '' : ' disabled title="Start Tailscale on this desktop first"'}>${ic('qr')}Pair a phone</button></div>`;
    }
    return `<section class="p335-pop" id="phones-pop" role="dialog" aria-labelledby="pop-title">${body}</section>`;
  }

  /* ---------- paint ---------- */
  function topbar() {
    const title = O === 'C' ? 'Home' : 'Settings';
    const phones =
      O === 'C'
        ? `<button type="button" class="ghost p335-phones-btn" id="phones-btn" data-act="toggle" aria-expanded="${st.open}" aria-controls="phones-pop">${ic('phone')}Phones<span class="badge">${st.phones.length}</span></button>`
        : '';
    return `<span class="page-title">${title}</span><span class="topbar-spacer"></span>${phones}<button type="button" class="iconbtn" data-to="Notifications" aria-label="Notifications">${ic('bell')}</button>`;
  }

  let pendingFocus = null;
  function paint() {
    const active = document.activeElement;
    const key = active?.dataset?.act ? `[data-act="${active.dataset.act}"]${active.dataset.id ? `[data-id="${active.dataset.id}"]` : ''}` : null;
    $('#topbar').innerHTML = topbar();
    $('#main').innerHTML = O === 'A' ? mainA() : O === 'B' ? mainB() : mainC();
    document.body.classList.toggle('is-c', O === 'C');
    if (O === 'A') {
      $('#layer').innerHTML = layerA();
      const dlg = $('#dlg');
      if (dlg) {
        dlg.showModal();
        // Start on the heading, not the first button, so a frame opens without a focus ring.
        dlg.querySelector('h2').focus({ preventScroll: true });
        dlg.addEventListener('cancel', (e) => {
          e.preventDefault();
          act(st.pair ? 'stop' : 'remove-no');
        });
      }
    } else if (O === 'C') {
      $('#layer').innerHTML = popoverC();
    }
    Kit.fillIcons();
    const target = pendingFocus ?? key;
    pendingFocus = null;
    if (target) (document.querySelector(target) ?? null)?.focus();
  }

  /* ---------- the countdown, only after a tap ---------- */
  let tick;
  function startTicking() {
    clearInterval(tick);
    tick = setInterval(() => {
      const p = st.pair;
      if (!p || p.phase !== 'fresh') return clearInterval(tick);
      p.left = Math.max(0, p.left - 1);
      if (p.left === 60) announce('The pairing code expires in 1 minute.');
      if (p.left === 0) {
        p.phase = 'expired';
        clearInterval(tick);
        announce('The pairing code expired. Show a new code to pair.');
        pendingFocus = '[data-act="new-code"]';
        return paint();
      }
      const left = document.querySelector('.p335-left');
      if (left) left.textContent = mmss(p.left);
      document.querySelector('#pair-timer')?.classList.toggle('is-warn', p.left <= 60);
    }, 1000);
  }

  function newCode() {
    // A new code always replaces the one showing; the old one stops working.
    const c = st.pair?.code === P.code ? P.nextCode : P.code;
    st.pair = codeOf(c, c.minutes * 60);
    st.view = 'code';
    st.notice = null;
    startTicking();
  }

  let returnTo = null;
  const SAMPLE_NEXT = [P.newPhone, { id: 'ipad', name: 'Ramon’s iPad', model: 'iPad Air · iPadOS', paired: 'Today 10:17', seen: 'Today 10:17', push: true }];

  function act(name, el) {
    switch (name) {
      case 'pair':
        returnTo = '[data-act="pair"]';
        newCode();
        pendingFocus = O === 'A' ? '[data-act="stop"][data-focus-first]' : O === 'B' ? '#pair-h' : '#pop-title';
        announce(`Pairing code ${st.pair.code.text} is showing. It works once and expires in ${st.pair.code.minutes} minutes.`);
        return paint();
      case 'new-code': {
        const wasUsed = st.pair?.phase === 'used';
        newCode();
        pendingFocus = O === 'B' ? '#pair-h' : O === 'C' ? '#pop-title' : '[data-act="stop"][data-focus-first]';
        announce(`${wasUsed ? 'New code for another phone' : 'New pairing code'}: ${st.pair.code.text}. The old code no longer works.`);
        return paint();
      }
      case 'stop': {
        const was = st.pair?.phase;
        st.pair = null;
        st.view = 'list';
        clearInterval(tick);
        if (was === 'fresh') announce('Pairing stopped. That code no longer works.');
        pendingFocus = returnTo ?? (O === 'C' ? '#pop-title' : '[data-act="pair"]');
        return paint();
      }
      case 'sim-use': {
        const next = SAMPLE_NEXT.find((p) => !st.phones.some((x) => x.id === p.id)) ?? SAMPLE_NEXT[1];
        st.phones = [...st.phones.filter((p) => p.id !== next.id), next];
        st.pair = { ...st.pair, phase: 'used', by: next.id };
        st.fresh = next.id;
        clearInterval(tick);
        announce(`Paired with ${next.name}. The code is used up.`);
        pendingFocus = O === 'C' ? '#pop-title' : '#pair-title';
        return paint();
      }
      case 'sim-ending':
        st.pair.left = 38;
        startTicking();
        return paint();
      case 'sim-expire':
        st.pair.left = 1;
        startTicking();
        return paint();
      case 'copy': {
        const text = el.dataset.what === 'host' ? D.host : st.pair.code.text;
        try {
          navigator.clipboard?.writeText(text)?.catch(() => {});
        } catch {
          /* A sandboxed frame may refuse; the toast still shows what would be copied. */
        }
        Kit.toast(`Copied ${text}`);
        return announce(`Copied ${el.dataset.what === 'host' ? 'the desktop address' : 'the pairing code'}.`);
      }
      case 'remove':
        st.confirm = el.dataset.id;
        st.view = 'confirm';
        st.notice = null;
        returnTo = `[data-act="remove"][data-id="${el.dataset.id}"]`;
        pendingFocus = O === 'C' ? '#pop-title' : '[data-act="remove-no"][data-focus-first]';
        return paint();
      case 'remove-no':
        st.confirm = null;
        st.view = 'list';
        pendingFocus = returnTo;
        return paint();
      case 'remove-yes': {
        const p = phoneNamed(st.confirm);
        st.removing = true;
        paint();
        return setTimeout(() => {
          st.removing = false;
          st.phones = st.phones.filter((x) => x.id !== p.id);
          st.confirm = null;
          st.view = 'list';
          if (st.fresh === p.id) st.fresh = null;
          st.notice = removedNotice(p);
          announce(`${st.notice.text} ${st.notice.more}`);
          pendingFocus = '#notice';
          paint();
        }, 700);
      }
      case 'dismiss':
        st.notice = null;
        pendingFocus = O === 'C' ? '#pop-title' : R3 ? '[data-act="pair"]' : '#cat-title';
        return paint();
      case 'recheck':
        st.tailscale = 'ok';
        announce(`Tailscale is running. ${D.name} is ready to pair.`);
        pendingFocus = '[data-act="pair"]';
        return paint();
      case 'toggle':
        st.open = !st.open;
        if (!st.open) {
          st.view = 'list';
          st.confirm = null;
        }
        pendingFocus = st.open ? '#pop-title' : '#phones-btn';
        return paint();
    }
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (el && !el.disabled) {
      e.preventDefault();
      act(el.dataset.act, el);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (O === 'B' && st.confirm && !st.removing) return act('remove-no');
    if (O === 'C' && st.open) {
      e.preventDefault();
      if (st.view === 'confirm') return act('remove-no');
      if (st.view === 'code') return act('stop');
      return act('toggle');
    }
  });
  // C's popover closes on a click outside it, like the app's other popovers.
  document.addEventListener('pointerdown', (e) => {
    if (O !== 'C' || !st.open || st.removing) return;
    if (e.target.closest('#phones-pop, #phones-btn, #kit-toast')) return;
    st.open = false;
    st.view = 'list';
    st.confirm = null;
    paint();
  });

  paint();
})();
