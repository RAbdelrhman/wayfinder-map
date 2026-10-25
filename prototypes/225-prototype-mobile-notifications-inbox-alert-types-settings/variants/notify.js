/*
  PROTOTYPE (#225): pushes, the Inbox and Notifications settings on the phone.
  Hooks into #316's window.ACCOUNT (G-a Settings) the same way account.js hooks into #223's mobile.js.
  ?nt=A|B|C picks a Round 1 look; ?nt=D is Round 2's remix of them (C's timeline and pushes, A's header and rows,
  B's icons, unread dots and settings, one colour per alert type). Every option shows the same confirmed behaviour:
    - Six needs-you kinds push; Ready to start is shared, never pushed. One Push to this phone switch per phone.
    - The Inbox is the desktop's synced history (alerts and map activity); read state is this phone's own.
    - The badge counts unread needs-you only. Every alert or push opens ticket detail.
    - While the desktop is unreachable: cached history, read-only settings.
  ?screen=inbox|notif|lock|home, ?filter=needs, ?desk=offline, ?push=off, ?empty=1, ?tap=<row id> open a state. Every tap is fake.
*/
(() => {
  const params = new URLSearchParams(location.search);
  const OPT = ['A', 'B', 'C', 'D'].includes(params.get('nt')) ? params.get('nt') : null;
  if (!OPT || !window.ACCOUNT) return;
  const ACC = window.ACCOUNT;
  const N = window.NOTIFY;
  const D = window.MOBILE;
  const esc = Kit.esc;
  const ic = (name) => Kit.icon(name);
  const KIND = Object.fromEntries(N.kinds.map((k) => [k.kind, k]));
  const PUSH_KINDS = N.kinds.filter((k) => k.push);

  const st = {
    filter: params.get('filter') === 'needs' ? 'needs' : 'all',
    offline: params.get('desk') === 'offline',
    push: params.get('push') !== 'off',
    types: Object.fromEntries(N.kinds.map((k) => [k.kind, true])),
    rows: params.get('empty') === '1' ? [] : N.rows.map((r) => ({ ...r })),
  };
  // Delivered pushes stay on the lock screen until opened (or dismissed in the OS).
  st.lock = st.rows.filter((r) => r.type === 'needs' && !r.read && st.push).map((r) => r.id);

  const rowBy = (id) => st.rows.find((r) => r.id === id);
  const mapOf = (r) => r.map ?? N.map;
  const shortRepo = (repo) => repo.split('/')[1];
  const scope = (r) => `${shortRepo(mapOf(r).repo)} · Map #${mapOf(r).number} ${mapOf(r).title}`;
  const unreadNeeds = () => st.rows.filter((r) => r.type === 'needs' && !r.read).length;
  const unreadActivity = () => st.rows.filter((r) => r.type === 'activity' && !r.read).length;
  const activeNeeds = () => st.rows.filter((r) => r.type === 'needs').length;
  const shown = () => (st.filter === 'needs' ? st.rows.filter((r) => r.type === 'needs') : st.rows);
  const titleOf = (r) => (r.type === 'needs' ? `#${r.ticket} ${r.title}` : r.summary);
  const unreadSr = (r) => (r.read ? '' : '<span class="m-sr">Unread. </span>');
  const rowLabel = (r) => `${r.read ? '' : 'Unread. '}${r.type === 'needs' ? `${KIND[r.kind].label}. ` : ''}${titleOf(r)}. ${scope(r)}. ${r.at}.`;

  /* ---------- top bar: the #196 bell, phone width = bell and count ---------- */
  const origAvatar = ACC.avatar;
  function bell() {
    const n = unreadNeeds();
    const label = n ? `Inbox, ${n} need${n === 1 ? 's' : ''} you` : 'Inbox';
    return `<button class="nt-bell" data-act="nt-inbox" aria-label="${label}"><span class="nt-bell-face">${ic('bell')}${n ? `<span class="nt-count" aria-hidden="true">${n}</span>` : ''}</span></button>`;
  }
  ACC.avatar = () => `<span class="nt-bar-right">${bell()}${origAvatar()}</span>`;

  const syncBanner = (what) =>
    st.offline
      ? `<div class="m-cached nt-offline" role="status">${ic('cloudoff')}<span><b>Can’t reach your desktop.</b> ${what}</span></div>`
      : '';
  const inboxBar = (status, backBtn) => `${status()}<header class="m-bar ac-bar3">${backBtn('Maps')}<h1>Inbox</h1><span></span></header>`;
  const fine = `<p class="m-fine nt-fine">Opening an alert marks it read on this phone only. Handled alerts leave after the next sync.</p>`;

  function empty() {
    if (!st.rows.length)
      return `<div class="m-empty nt-empty">${ic('bell')}<b>Nothing here yet</b>Alerts and map activity from your desktop show up here${st.offline ? ' once it’s back' : ''}.</div>`;
    return `<div class="m-empty nt-empty">${ic('check')}<b>Nothing needs you</b>Switch to All to see map activity.</div>`;
  }

  /* ---------- A · Desktop panel: #196's panel at phone size ---------- */
  function filtersA() {
    const n = unreadNeeds();
    const btn = (f, label, extra = '') => `<button class="nt-a-filter" data-act="nt-filter" data-f="${f}" aria-pressed="${st.filter === f}">${label}${extra}</button>`;
    return `<div class="nt-a-filters" role="group" aria-label="Show">${btn('all', 'All')}${btn('needs', 'Needs you', n ? ` <span class="nt-needs-count" aria-label="${n} unread">${n}</span>` : '')}</div>`;
  }
  function rowA(r) {
    const needs = r.type === 'needs';
    return `<button class="nt-a-row${needs ? ' is-needs' : ''}${r.read ? ' is-read' : ''}" data-act="nt-open" data-id="${r.id}" aria-label="${esc(rowLabel(r))}">
      <span class="nt-a-main">${needs ? `<span class="nt-kind">${esc(KIND[r.kind].label)}</span>` : ''}<span class="nt-a-title">${esc(titleOf(r))}</span><span class="nt-a-scope">${esc(scope(r))}</span>${r.away ? '<span class="nt-away">While you were away</span>' : ''}</span>
      <time class="nt-a-time">${esc(r.at)}</time></button>`;
  }
  function inboxA({ status, backBtn }) {
    const list = shown();
    return `${inboxBar(status, backBtn)}${syncBanner(`Showing history from ${N.syncedAt}. New alerts arrive when it’s back.`)}<div class="m-scroll nt-a">
      ${st.rows.length ? `<p class="nt-a-summary">${activeNeeds()} need you · ${unreadActivity()} new on your maps</p>` : ''}
      ${filtersA()}
      ${list.length ? `<div class="nt-a-list">${list.map(rowA).join('')}</div>${fine}` : empty()}</div>`;
  }

  /* ---------- B · Grouped by day: inset lists, kind icons ---------- */
  function filtersB() {
    const n = unreadNeeds();
    const btn = (f, label) => `<button data-act="nt-filter" data-f="${f}" aria-pressed="${st.filter === f}">${label}</button>`;
    return `<div class="m-seg nt-b-seg" role="group" aria-label="Show">${btn('all', 'All')}${btn('needs', `Needs you${n ? ` <span class="nt-needs-count" aria-label="${n} unread">${n}</span>` : ''}`)}</div>`;
  }
  function rowB(r) {
    const needs = r.type === 'needs';
    const icon = needs ? KIND[r.kind].icon : r.icon;
    return `<button class="m-row nt-b-row${needs ? ' is-needs' : ''}${r.read ? ' is-read' : ''}" data-act="nt-open" data-id="${r.id}" aria-label="${esc(rowLabel(r))}">
      <span class="nt-b-icon${needs ? ' is-needs' : ''}">${ic(icon)}</span>
      <span class="m-row-main">${needs ? `<span class="nt-kind">${esc(KIND[r.kind].label)}</span>` : ''}<span class="m-row-title">${esc(titleOf(r))}</span>
        <span class="m-row-sub">${r.clock} · Map #${mapOf(r).number}${r.away ? ' · <span class="nt-away">While you were away</span>' : ''}</span></span>
      ${r.read ? '<span class="nt-b-dot is-read"></span>' : '<span class="nt-b-dot"></span>'}</button>`;
  }
  function inboxB({ status, backBtn }) {
    const list = shown();
    const days = [...new Set(list.map((r) => r.day))];
    const groups = days.map((d) => `<div class="m-section-title">${d}</div><div class="m-group">${list.filter((r) => r.day === d).map(rowB).join('')}</div>`).join('');
    return `${inboxBar(status, backBtn)}${syncBanner(`Showing history from ${N.syncedAt}. New alerts arrive when it’s back.`)}<div class="m-scroll nt-b">
      ${filtersB()}${list.length ? groups + fine : empty()}</div>`;
  }

  /* ---------- C · Timeline: a count up top, needs-you as cards on a time rail ---------- */
  function filtersC() {
    const btn = (f, label) => `<button class="nt-c-tab" data-act="nt-filter" data-f="${f}" aria-pressed="${st.filter === f}">${label}</button>`;
    return `<div class="nt-c-tabs" role="group" aria-label="Show">${btn('all', 'All')}${btn('needs', 'Needs you')}</div>`;
  }
  function rowC(r) {
    const needs = r.type === 'needs';
    const body = needs
      ? `<span class="nt-kind">${ic(KIND[r.kind].icon)}${esc(KIND[r.kind].label)}</span><span class="nt-c-title">${esc(titleOf(r))}</span><span class="nt-c-scope">${esc(scope(r))}</span>`
      : `<span class="nt-c-act">${esc(titleOf(r))}</span><span class="nt-c-scope">${esc(scope(r))}${r.away ? ' · <span class="nt-away">While you were away</span>' : ''}</span>`;
    return `<li class="nt-c-item${needs ? ' is-needs' : ''}${r.read ? ' is-read' : ''}"><time class="nt-c-time">${esc(r.clock)}</time><span class="nt-c-node" aria-hidden="true"></span>
      <button class="nt-c-body" data-act="nt-open" data-id="${r.id}" aria-label="${esc(rowLabel(r))}">${body}</button></li>`;
  }
  function inboxC({ status, backBtn }) {
    const list = shown();
    const n = unreadNeeds();
    const head = st.rows.length
      ? `<div class="nt-c-head"><span class="nt-c-big${n ? '' : ' is-zero'}">${n}</span><span><b>unread need${n === 1 ? 's' : ''} you</b><span class="nt-c-sub">${unreadActivity()} new on your maps</span></span></div>`
      : '';
    let day = null;
    const items = list
      .map((r) => {
        const label = r.day !== day ? `<li class="nt-c-day">${r.day}</li>` : '';
        day = r.day;
        return label + rowC(r);
      })
      .join('');
    return `${inboxBar(status, backBtn)}${syncBanner(`Showing history from ${N.syncedAt}. New alerts arrive when it’s back.`)}<div class="m-scroll nt-c">
      ${head}${filtersC()}${list.length ? `<ol class="nt-c-rail">${items}</ol>${fine}` : empty()}</div>`;
  }

  /* ---------- D · Round 2 remix: C's timeline under A's header, A's rows, B's icons and dots ---------- */
  // Each alert type gets its own colour (--nt-t-<kind>, notify.css); the icon and kind text still say the type.
  // "Ready to start" is map activity here as on the desktop, so its activity row takes that type's colour; other activity stays grey.
  const EVENT_KIND = { 'ticket-next': 'unblocked' };
  const kindOf = (r) => (r.type === 'needs' ? r.kind : EVENT_KIND[r.event]);
  const tone = (kind) => (kind ? ` style="--t: var(--nt-t-${kind})"` : '');
  function rowD(r) {
    const needs = r.type === 'needs';
    const kind = kindOf(r);
    const icon = needs ? KIND[r.kind].icon : r.icon;
    const body = needs
      ? `<span class="nt-kind">${esc(KIND[r.kind].label)}</span><span class="nt-d-title">${esc(titleOf(r))}</span><span class="nt-d-scope">${esc(scope(r))}</span>`
      : `<span class="nt-d-act">${esc(titleOf(r))}</span><span class="nt-d-scope">${esc(scope(r))}${r.away ? ' · <span class="nt-away">While you were away</span>' : ''}</span>`;
    return `<li class="nt-d-item${needs ? ' is-needs' : ''}${kind ? ' is-typed' : ''}${r.read ? ' is-read' : ''}"${tone(kind)}><time class="nt-d-time">${esc(r.clock)}</time><span class="nt-d-node" aria-hidden="true">${ic(icon)}</span>
      <button class="nt-d-body" data-act="nt-open" data-id="${r.id}" aria-label="${esc(rowLabel(r))}"><span class="nt-d-main">${body}</span>${r.read ? '' : '<span class="nt-b-dot nt-d-dot"></span>'}</button></li>`;
  }
  function inboxD({ status, backBtn }) {
    const list = shown();
    let day = null;
    const items = list
      .map((r) => {
        const label = r.day !== day ? `<li class="nt-d-day">${r.day}</li>` : '';
        day = r.day;
        return label + rowD(r);
      })
      .join('');
    return `${inboxBar(status, backBtn)}${syncBanner(`Showing history from ${N.syncedAt}. New alerts arrive when it’s back.`)}<div class="m-scroll nt-a nt-d">
      ${st.rows.length ? `<p class="nt-a-summary">${activeNeeds()} need you · ${unreadActivity()} new on your maps</p>` : ''}
      ${filtersA()}
      ${list.length ? `<ol class="nt-d-rail">${items}</ol>${fine}` : empty()}</div>`;
  }

  // B's settings layout, with each type's icon in its colour.
  function typeRowD(k, hint) {
    return `<label class="m-row nt-srow nt-d-srow${st.offline ? ' is-locked' : ''}" for="nt-sw-${k.kind}"${tone(k.kind)}><span class="nt-d-ico">${ic(k.icon)}</span>
      <span class="m-row-main"><span class="m-row-title" id="nt-t-${k.kind}">${esc(k.setting)}</span><span class="nt-hint" id="nt-h-${k.kind}">${hint}</span></span>${sw(k.kind, st.types[k.kind], k.setting, true)}</label>`;
  }
  function settingsD({ status, backBtn }) {
    const pushed = PUSH_KINDS.map((k) => typeRowD(k, esc(k.hint))).join('');
    const ready = KIND.unblocked;
    return `${settingsBar(status, backBtn)}${offlineSettings()}<div class="m-scroll">
      <div class="m-card nt-b-hero${st.push ? ' is-on' : ''}${st.offline ? ' is-locked' : ''}">
        <div class="nt-b-hero-head"><span class="nt-b-icon is-phone">${ic('phone')}</span><h3 id="nt-t-push">Push to this phone</h3>${sw('push', st.push, 'Push to this phone', true)}</div>
        <p id="nt-h-push">${pushHint()}</p><p class="nt-b-only">Only this phone. Your desktop and other phones keep their own.</p></div>
      <div class="m-section-title">Pushed to phones</div>
      <p class="nt-note">${SHARED}</p>
      <div class="m-group">${pushed}</div>
      <div class="m-section-title">Inbox only</div>
      <div class="m-group">${typeRowD(ready, `${esc(ready.hint)} Never pushed.`)}</div></div>`;
  }

  // A design reference, not an app screen: the seven type colours with their contrast on this theme's surfaces.
  function colorsD({ status }) {
    const rows = N.kinds
      .map((k) => `<li class="nt-d-swatch"${tone(k.kind)}><span class="nt-d-ico">${ic(k.icon)}</span><span class="m-row-main"><span class="nt-kind">${esc(k.label)}</span><span class="nt-hint">${k.push ? 'Needs you · pushed' : 'Map activity · never pushed'}</span></span><span class="nt-d-ratio" data-kind="${k.kind}"></span></li>`)
      .join('');
    return `${status()}<header class="m-bar ac-bar3"><span></span><h1>Type colours</h1><span></span></header><div class="m-scroll">
      <p class="nt-note nt-d-ref">Design reference for option D, not an app screen. Kind text on the card surface; the ratio is measured live in this theme. The unread dot keeps blue (--accent-text), which no type uses.</p>
      <ul class="m-group nt-d-swatches">${rows}</ul>
      <p class="nt-note nt-after">Amber, red and green are the desktop’s tokens (--handoff-needs-you, --state-failed, --handoff-pr-ready). Orange, magenta, violet and teal are new, proposed for this prototype only.</p></div>`;
  }

  /* ---------- settings ---------- */
  const lock = () => (st.offline ? ' disabled' : '');
  const sw = (key, on, title, hint) =>
    `<input type="checkbox" role="switch" class="nt-switch" id="nt-sw-${key}" data-act="nt-toggle" data-k="${key}"${on ? ' checked' : ''}${lock()} aria-labelledby="nt-t-${key}"${hint ? ` aria-describedby="nt-h-${key}"` : ''}>`;
  function switchRow(key, on, title, hint, extra = '') {
    return `<label class="m-row nt-srow${st.offline ? ' is-locked' : ''}" for="nt-sw-${key}"><span class="m-row-main"><span class="m-row-title" id="nt-t-${key}">${esc(title)}</span>${hint ? `<span class="nt-hint" id="nt-h-${key}">${hint}</span>` : ''}${extra}</span>${sw(key, on, title, hint)}</label>`;
  }
  const settingsBar = (status, backBtn) => `${status()}<header class="m-bar ac-bar3">${backBtn('Settings')}<h1>Notifications</h1><span></span></header>`;
  const offlineSettings = () => syncBanner(`Showing settings from ${N.syncedAt}. You can change them when it’s back.`);
  const PAUSE = 'They pause while you’re using Wayfinder on your computer; skipped ones stay in the Inbox.';
  const pushHint = () => (st.push ? `Your desktop pushes needs-you alerts here. ${PAUSE}` : 'Off. Your desktop won’t push to this phone. Alerts still reach the Inbox.');
  const SHARED = 'Shared with your desktop and other phones: a change here changes them too.';

  function settingsA({ status, backBtn }) {
    const rows = N.kinds
      .map((k) => switchRow(k.kind, st.types[k.kind], k.setting, esc(k.hint), k.push ? '' : '<span class="nt-tag">Inbox only · never pushed</span>'))
      .join('');
    return `${settingsBar(status, backBtn)}${offlineSettings()}<div class="m-scroll">
      <div class="m-section-title">This phone</div>
      <div class="m-group">${switchRow('push', st.push, 'Push to this phone', pushHint())}</div>
      <p class="nt-note nt-after">Only this phone. Your desktop and other phones keep their own.</p>
      <div class="m-section-title">Alert types</div>
      <p class="nt-note">${SHARED}</p>
      <div class="m-group">${rows}</div></div>`;
  }

  function settingsB({ status, backBtn }) {
    const pushed = PUSH_KINDS.map((k) => switchRow(k.kind, st.types[k.kind], k.setting, esc(k.hint))).join('');
    const ready = KIND.unblocked;
    return `${settingsBar(status, backBtn)}${offlineSettings()}<div class="m-scroll">
      <div class="m-card nt-b-hero${st.push ? ' is-on' : ''}${st.offline ? ' is-locked' : ''}">
        <div class="nt-b-hero-head"><span class="nt-b-icon is-phone">${ic('phone')}</span><h3 id="nt-t-push">Push to this phone</h3>${sw('push', st.push, 'Push to this phone', true)}</div>
        <p id="nt-h-push">${pushHint()}</p><p class="nt-b-only">Only this phone. Your desktop and other phones keep their own.</p></div>
      <div class="m-section-title">Pushed to phones</div>
      <p class="nt-note">${SHARED}</p>
      <div class="m-group">${pushed}</div>
      <div class="m-section-title">Inbox only</div>
      <div class="m-group">${switchRow(ready.kind, st.types.unblocked, ready.setting, `${esc(ready.hint)} Never pushed.`)}</div></div>`;
  }

  function settingsC({ status, backBtn }) {
    const on = PUSH_KINDS.filter((k) => st.types[k.kind]).length;
    const line = st.offline
      ? `Last synced ${N.syncedAt}`
      : st.push
        ? `${on} of ${PUSH_KINDS.length} alert types push here`
        : 'Pushes are off for this phone';
    const rows = N.kinds
      .map((k) => {
        const where = k.push ? (st.push ? 'Inbox and push' : 'Inbox · push is off') : 'Inbox only · never pushed';
        return `<label class="m-row nt-srow nt-c-srow${st.offline ? ' is-locked' : ''}" for="nt-sw-${k.kind}"><span class="nt-c-ico${k.push ? ' is-needs' : ''}">${ic(k.icon)}</span>
          <span class="m-row-main"><span class="m-row-title" id="nt-t-${k.kind}">${esc(k.setting)}</span><span class="nt-hint" id="nt-h-${k.kind}">${where}</span></span>${sw(k.kind, st.types[k.kind], k.setting, true)}</label>`;
      })
      .join('');
    return `${settingsBar(status, backBtn)}${offlineSettings()}<div class="m-scroll">
      <div class="nt-c-hero"><span class="nt-c-hero-ico${st.push ? ' is-on' : ''}">${ic('bell')}</span><b>${line}</b></div>
      <div class="m-group">${switchRow('push', st.push, 'Push to this phone', st.push ? `Pushes ${PAUSE.slice(5)}` : 'Alerts still reach the Inbox.')}</div>
      <p class="nt-note nt-c-only">Only this phone. Your desktop and other phones keep their own.</p>
      <div class="m-section-title">Alert types</div>
      <div class="m-group">${rows}</div>
      <p class="nt-note">${SHARED}</p></div>`;
  }

  /* ---------- the phone's lock screen and home screen ---------- */
  function pushFields(r) {
    const k = KIND[r.kind].label;
    const m = mapOf(r);
    if (OPT === 'A') return { title: `${m.repo} · Map #${m.number} ${m.title}`, sub: '', body: `${k}: #${r.ticket} ${r.title}` };
    if (OPT === 'B') return { title: k, sub: `Map #${m.number} · ${m.title}`, body: `#${r.ticket} ${r.title}` };
    // C, and D (which keeps C's pushes): the ticket leads.
    return { title: `#${r.ticket} ${r.title}`, sub: '', body: `${k} · Map #${m.number} ${m.title}` };
  }
  function lockScreen() {
    const pushes = st.lock.map(rowBy).filter(Boolean);
    const cards = pushes.length
      ? pushes
          .map((r) => {
            const f = pushFields(r);
            return `<button class="nt-push" data-act="nt-push" data-id="${r.id}" aria-label="Wayfinder, ${esc(r.at)}. ${esc(f.title)}. ${esc(f.sub ? `${f.sub}. ` : '')}${esc(f.body)}">
              <span class="nt-push-app"><span class="nt-app-ico" aria-hidden="true">${ic('compass')}</span>Wayfinder<time>${esc(r.at)}</time></span>
              <span class="nt-push-title">${esc(f.title)}</span>${f.sub ? `<span class="nt-push-sub">${esc(f.sub)}</span>` : ''}<span class="nt-push-body">${esc(f.body)}</span></button>`;
          })
          .join('')
      : '<p class="nt-lock-none">No notifications</p>';
    return `<div class="nt-wall"><div class="m-status nt-on-wall" aria-hidden="true"><span>9:41</span><span>●●● ▮</span></div>
      <div class="nt-lock-clock nt-on-wall"><span>Saturday, October 24</span><b>9:41</b></div>
      <section class="nt-lock-list" aria-label="Notifications">${cards}</section>
      <p class="nt-lock-hint nt-on-wall">Tap a push to open its ticket in Wayfinder.</p></div>`;
  }
  function homeScreen() {
    const n = unreadNeeds();
    const apps = ['Mail', 'Calendar', 'Photos', 'Camera', 'Maps', 'Notes', 'Settings'];
    const tiles = apps.map((a) => `<span class="nt-home-app" aria-hidden="true"><span class="nt-home-ico"></span>${a}</span>`).join('');
    return `<div class="nt-wall"><div class="m-status nt-on-wall" aria-hidden="true"><span>9:41</span><span>●●● ▮</span></div>
      <div class="nt-home-grid">${tiles}<button class="nt-home-app" data-act="nt-launch" aria-label="Wayfinder${n ? `, ${n} unread need${n === 1 ? 's' : ''} you` : ''}"><span class="nt-home-ico is-wayfinder">${ic('compass')}${n ? `<span class="nt-badge" aria-hidden="true">${n}</span>` : ''}</span>Wayfinder</button></div>
      <p class="nt-lock-hint nt-on-wall">The badge counts unread needs-you alerts only: ${n}, not the ${unreadActivity()} new map updates.</p></div>`;
  }

  /* ---------- wiring into #316's hooks ---------- */
  const origSettings = ACC.screens.settings;
  function settingsG(ctx) {
    const sub = st.offline ? `Last synced ${N.syncedAt}` : st.push ? 'Pushes on for this phone' : 'Pushes off for this phone';
    return origSettings(ctx)
      .replace('data-toast="Notifications settings are designed in #225"', 'data-act="nt-settings"')
      .replace('<span class="m-row-sub">Designed in #225</span>', `<span class="m-row-sub">${sub}</span>`);
  }
  Object.assign(ACC.screens, {
    settings: settingsG,
    inbox: { A: inboxA, B: inboxB, C: inboxC, D: inboxD }[OPT],
    notif: { A: settingsA, B: settingsB, C: settingsC, D: settingsD }[OPT],
    lock: lockScreen,
    home: homeScreen,
    ...(OPT === 'D' ? { colors: colorsD } : {}),
  });

  const app = () => document.getElementById('app');
  let ctxStack = null;
  const ROOT_BACK = { inbox: 'repos', notif: 'settings', ticket: 'repos' };
  const origHandle = ACC.handle;
  ACC.handle = (act, el, ctx) => {
    ctxStack = ctx.stack;
    const here = ctx.stack[ctx.stack.length - 1];
    switch (act) {
      case 'nt-inbox': ctx.go('inbox'); return true;
      case 'nt-settings': ctx.go('notif'); return true;
      case 'nt-filter':
        st.filter = el.dataset.f; ctx.render();
        app().querySelector(`[data-act="nt-filter"][data-f="${st.filter}"]`)?.focus();
        return true;
      case 'nt-toggle': {
        const k = el.dataset.k;
        if (k === 'push') st.push = el.checked; else st.types[k] = el.checked;
        ctx.render(); app().querySelector(`#nt-sw-${k}`)?.focus();
        return true;
      }
      case 'nt-open': {
        const r = rowBy(el.dataset.id);
        if (!r) return true;
        r.read = true;
        st.lock = st.lock.filter((id) => id !== r.id);
        if (D.tickets.some((t) => t.number === r.ticket)) ctx.go('ticket', { ticket: r.ticket });
        else { ctx.render(); Kit.toast(`Sample data: would open #${r.ticket} on map #${mapOf(r).number}`); }
        return true;
      }
      case 'nt-push': {
        const r = rowBy(el.dataset.id);
        if (!r) return true;
        r.read = true;
        st.lock = st.lock.filter((id) => id !== r.id);
        // Opening a push lands on ticket detail, with Maps underneath.
        ctx.stack.length = 0;
        ctx.stack.push({ screen: 'repos', ticket: r.ticket, repo: D.repos[0].name }, { screen: 'ticket', ticket: r.ticket, repo: D.repos[0].name });
        ctx.render();
        return true;
      }
      case 'nt-launch':
        ctx.stack.length = 0; ctx.stack.push({ screen: 'repos', ticket: 223, repo: D.repos[0].name }); ctx.render();
        return true;
      case 'back':
        if (ctx.stack.length === 1 && ROOT_BACK[here.screen]) { here.screen = ROOT_BACK[here.screen]; ctx.render(); return true; }
        break;
    }
    return origHandle(act, el, ctx);
  };

  const origKey = ACC.key;
  ACC.key = (e, ctx) => {
    if (origKey(e, ctx)) return true;
    const here = ctx.stack[ctx.stack.length - 1];
    if (e.key === 'Escape' && ctx.stack.length === 1 && ROOT_BACK[here.screen] && here.screen !== 'ticket') {
      e.preventDefault(); here.screen = ROOT_BACK[here.screen]; ctx.render(); return true;
    }
    return false;
  };

  // #223's ticket detail labels Back with the map; from the Inbox or a push it goes back somewhere else, so say so.
  const BACK_NAME = { inbox: 'Inbox', repos: 'Maps' };
  new MutationObserver(() => {
    const s = ctxStack;
    if (!s || s.length < 2 || s[s.length - 1].screen !== 'ticket') return;
    const name = BACK_NAME[s[s.length - 2].screen];
    const face = app().querySelector('.m-back .m-back-face');
    if (!name || !face || face.textContent === name) return;
    face.innerHTML = `${ic('back')}${name}`;
    face.parentElement.setAttribute('aria-label', `Back to ${name}`);
  }).observe(document.getElementById('app'), { childList: true });

  // D's colour reference: measure each kind colour against its row's surface in the current theme.
  if (OPT === 'D') {
    const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; const [r, g, b] = rgb(c).map(f); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    new MutationObserver(() => {
      for (const out of app().querySelectorAll('.nt-d-ratio:empty')) {
        const li = out.closest('li');
        const a = lum(getComputedStyle(li.querySelector('.nt-kind')).color);
        const b = lum(getComputedStyle(li.closest('.m-group')).backgroundColor);
        out.textContent = `${((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(1)}:1`;
      }
    }).observe(app(), { childList: true });
  }

  // ?tap=<row id> opens the Inbox and taps that row, through the same path as a real tap.
  const tap = params.get('tap');
  if (tap) window.addEventListener('load', () => app().querySelector(`[data-act="nt-open"][data-id="${CSS.escape(tap)}"]`)?.click());
})();
