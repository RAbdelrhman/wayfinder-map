/*
  PROTOTYPE (#196): one topbar inbox for needs-you alerts and map activity.
  ?v=today|A|B|C|D|E|F picks the option. ?data=full|activity|empty picks the sample state.
  ?open=0 starts with the panel closed. ?sheet=1 draws every option's trigger in every state.
*/
(() => {
  const ICONS = {
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
    inbox: '<path d="M4 4h16v16H4z"/><path d="M4 13h4l2 3h4l2-3h4"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.9-3.5L3 10"/><path d="M3 4v6h6"/><path d="M4 13a8 8 0 0 0 14.9 3.5L21 14"/><path d="M21 20v-6h-6"/>',
    play: '<path d="M7 4v16l13-8z" fill="currentColor"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>',
    ciFail: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    beaker: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 15h9"/>',
    alert: '<path d="m12 3 9 16H3z"/><path d="M12 9v4M12 17h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    graph: '<rect x="3" y="4" width="7" height="6" rx="1.5"/><rect x="14" y="14" width="7" height="6" rx="1.5"/><path d="M10 7h1.5a2.5 2.5 0 0 1 2.5 2.5v5"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    left: '<path d="m15 6-6 6 6 6"/>',
  };
  const icon = (name) =>
    `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  const esc = (text) => Kit.esc(text);

  const REPO = 'RAbdelrhman/wayfinder-map';
  const MAPS = { 300: 'Offline drafts', 121: 'Keep a map moving' };
  // Kind labels are the bell's own (src/ui/notifications.ts KIND_LABEL).
  const KIND = {
    threadWaiting: { label: 'T3 Code needs you', icon: 'hand' },
    failingCi: { label: 'CI is failing', icon: 'ciFail' },
    reviewReady: { label: 'PR ready for review', icon: 'eye' },
    prototypeReady: { label: 'Prototype ready to review', icon: 'beaker' },
    handOffError: { label: 'Hand-off error', icon: 'alert' },
    stalled: { label: 'Ticket stalled', icon: 'clock' },
  };
  const NEEDS = [
    { id: 'n1', kind: 'threadWaiting', ticket: 214, title: 'Sync drafts on reconnect', map: 300, at: '2 min ago', t: 2 },
    { id: 'n2', kind: 'failingCi', ticket: 210, title: 'Retry queue for failed uploads', map: 300, at: '18 min ago', t: 18 },
    { id: 'n3', kind: 'reviewReady', ticket: 204, title: 'Draft conflict banner', map: 300, at: '1 h ago', t: 60 },
    { id: 'n4', kind: 'prototypeReady', ticket: 196, title: 'How should one topbar inbox hold map activity?', map: 121, at: '3 h ago', t: 180 },
  ];
  // Activity summaries follow src/ui/mapEventInbox.ts eventSummary().
  const ACTIVITY = [
    { id: 'a1', text: '#203 Local draft store closed', map: 300, at: '5 min ago', t: 5 },
    { id: 'a2', text: '#216 Offline indicator is ready to start', map: 300, at: '5 min ago', t: 5 },
    { id: 'a3', text: 'PR #211 opened for #209 Background sync', map: 300, at: '40 min ago', t: 40 },
    { id: 'a4', text: 'CI for #211 Background sync changed to pending', map: 300, at: '41 min ago', t: 41 },
    { id: 'a5', text: 'PR #202 merged for #201 Draft schema', map: 300, at: 'Yesterday', t: 900, away: true },
    { id: 'a6', text: '#189 Re-pick a queued model closed', map: 121, at: 'Yesterday', t: 960, away: true },
    { id: 'a7', text: 'PR #194 merged for #189 Re-pick a queued model', map: 121, at: 'Yesterday', t: 970, away: true },
  ];

  const params = new URLSearchParams(location.search);
  const V = (params.get('v') || 'A').toUpperCase() === 'TODAY' ? 'today' : (params.get('v') || 'A').toUpperCase();
  const DATA = params.get('data') || 'full';

  const state = {
    open: params.get('open') !== '0',
    bellOpen: false,
    needs: DATA === 'full' ? NEEDS.map((n) => ({ ...n, read: false })) : [],
    activity: DATA === 'empty' ? [] : ACTIVITY.map((a) => ({ ...a, read: false })),
    tab: 'needs',
    filter: 'all',
    view: 'needs',
  };
  if (V === 'C' && state.needs.length === 0) state.tab = 'activity';

  const unreadNeeds = () => state.needs.filter((n) => !n.read).length;
  const unreadActivity = () => state.activity.filter((a) => !a.read).length;
  const mapLabel = (m) => `Map #${m} ${MAPS[m]}`;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  /* ---------- rows ---------- */
  const needRow = (n, { scope = true } = {}) =>
    `<a class="ib-need${n.read ? ' is-read' : ''}" href="#" data-row="${n.id}" data-to="#${n.ticket} on ${esc(mapLabel(n.map))}">
      ${icon(KIND[n.kind].icon)}
      <span class="ib-need-kind">${esc(KIND[n.kind].label)}</span>
      <span class="ib-need-title">#${n.ticket} ${esc(n.title)}</span>
      ${scope ? `<span class="ib-need-scope">${esc(REPO)} · ${esc(mapLabel(n.map))}</span>` : ''}
      <time>${esc(n.at)}</time></a>`;

  const actRow = (a, { scope = true } = {}) => {
    const away = a.away ? '<span class="map-inbox-away">While you were away</span>' : '';
    return `<article class="map-inbox-item${a.read ? ' is-read' : ''}"><a class="map-inbox-event" href="#" data-row="${a.id}" data-to="${esc(a.text.split(' ')[0])} on ${esc(mapLabel(a.map))}"><span class="map-inbox-event-title">${esc(a.text)}</span>${scope ? `<span class="map-inbox-event-scope">${esc(REPO)} · Map #${a.map}</span>` : ''}</a>${away}<time class="map-inbox-time">${esc(a.at)}</time></article>`;
  };

  const needsSection = (heading = 'Needs you') =>
    `<div class="ib-section-head"><h3 id="ib-needs-h">${heading}</h3><span class="hint">${state.needs.length ? 'Leaves on its own once handled' : ''}</span></div>
     ${state.needs.length ? state.needs.map((n) => needRow(n)).join('') : '<p class="ib-empty">Nothing needs you.</p>'}`;

  const activitySection = (heading = 'Map activity') =>
    `<div class="ib-section-head"><h3>${heading}</h3>${state.activity.length ? '<button type="button" class="map-inbox-clear" data-act="clear">Clear</button>' : ''}</div>
     ${state.activity.length ? state.activity.map((a) => actRow(a)).join('') : '<p class="map-inbox-empty">No map changes yet.</p>'}`;

  /* ---------- triggers ---------- */
  function triggerLabel() {
    const n = unreadNeeds();
    const a = unreadActivity();
    const parts = [];
    if (n) parts.push(`${n} need you`);
    if (a) parts.push(`${a} new`);
    return parts.length ? parts.join(', ') : 'nothing new';
  }

  function trigger(v, { forceFocus = false } = {}) {
    const n = unreadNeeds();
    const a = unreadActivity();
    const focus = forceFocus ? ' ib-forced-focus' : '';
    const exp = `aria-haspopup="dialog" aria-expanded="${state.open}" aria-controls="ib-panel"`;
    if (v === 'today') {
      const bellCount = n + (a ? 2 : 0); // today the bell also carries "Ready to start" and CI/review changes
      return `<div class="notification-anchor"><button type="button" class="notification-trigger${focus}" data-act="bell" aria-haspopup="dialog" aria-expanded="${state.bellOpen}" aria-label="Notifications" title="Notifications">${icon('bell')}<span class="notification-count"${bellCount ? '' : ' hidden'}>${bellCount}</span></button>
        <section class="notification-panel" role="dialog" aria-labelledby="ib-bell-title"${state.bellOpen ? '' : ' hidden'}><header class="notification-panel-head"><h2 id="ib-bell-title">Notifications</h2><button type="button" class="handoff-close" data-act="close" aria-label="Close notifications">×</button></header>
        <div class="notification-body">${state.needs.length ? `<ol class="notification-items">${state.needs.map((x) => `<li><a class="notification-item is-unread" href="#" data-to="#${x.ticket} on the map"><span class="notification-kind">${esc(KIND[x.kind].label)}</span><strong>#${x.ticket} ${esc(x.title)}</strong><span class="notification-context">${esc(REPO)} · ${esc(mapLabel(x.map))}</span><time>${esc(x.at)}</time></a></li>`).join('')}</ol>` : '<p class="notification-empty">No notifications yet.</p>'}</div></section></div>
        <div class="map-inbox-anchor"><button type="button" class="map-inbox-trigger${focus}" data-act="toggle" ${exp} aria-label="Map activity inbox">${icon('inbox')}<span class="map-inbox-label">Inbox</span><span class="map-inbox-count"${a ? '' : ' hidden'}>${a}</span></button>`;
    }
    if (v === 'B') {
      const badge = n ? `<span class="ib-count-need">${n}</span>` : a ? '<span class="ib-dot"></span>' : '';
      return `<div class="ib-anchor"><button type="button" class="notification-trigger${focus}" data-act="toggle" ${exp} aria-label="Notifications, ${triggerLabel()}" title="Notifications">${icon('bell')}${badge}</button>`;
    }
    let badge = '';
    if (v === 'A' || v === 'C') badge = n ? `<span class="ib-count-need">${n}</span>` : a ? `<span class="ib-count-quiet">${a}</span>` : '';
    if (v === 'D' || v === 'D2') badge = n + a ? `<span class="map-inbox-count">${n + a}</span>` : '';
    if (v === 'E') badge = n ? `<span class="ib-count-need">${n}</span>` : '';
    if (v === 'F') badge = `${n ? `<span class="ib-count-need">${n}</span>` : ''}${a ? `<span class="ib-count-quiet">${a} new</span>` : ''}`;
    const label = v === 'E' ? `Inbox, ${n ? `${n} need you` : 'nothing needs you'}` : `Inbox, ${triggerLabel()}`;
    return `<div class="ib-anchor"><button type="button" class="map-inbox-trigger${focus}" data-act="toggle" ${exp} aria-label="${label}">${icon(v === 'D2' ? 'bell' : 'inbox')}<span class="map-inbox-label">Inbox</span>${badge}</button>`;
  }

  /* ---------- panels ---------- */
  function head(title, summary, extra = '') {
    return `<header class="map-inbox-head"><div><h2 id="ib-title">${title}</h2><p>${summary}</p></div>${extra}<button type="button" class="handoff-close" data-act="close" aria-label="Close ${title.toLowerCase()}">×</button></header>`;
  }
  const summary = () => {
    const n = state.needs.length;
    const a = unreadActivity();
    if (!n && !state.activity.length) return 'Nothing yet on maps you have opened';
    return [n ? plural(n, 'needs you', 'need you') : 'Nothing needs you', a ? `${a} new on maps you have opened` : ''].filter(Boolean).join(' · ');
  };

  function body(v) {
    if (v === 'today') {
      return `${head('Map activity', 'Changes on maps you have opened', state.activity.length ? '<button type="button" class="map-inbox-clear" data-act="clear">Clear</button>' : '')}
        <div class="map-inbox-body">${state.activity.length ? state.activity.map((a) => actRow(a)).join('') : '<p class="map-inbox-empty">No map changes yet.</p>'}</div>`;
    }
    if (v === 'A' || v === 'B') {
      return `${head(v === 'A' ? 'Inbox' : 'Notifications', summary())}<div class="map-inbox-body">${needsSection()}${activitySection()}</div>`;
    }
    if (v === 'C') {
      const tab = (id, text, count, need) =>
        `<button type="button" role="tab" class="ib-tab" id="ib-tab-${id}" aria-selected="${state.tab === id}" aria-controls="ib-tabpanel" tabindex="${state.tab === id ? 0 : -1}" data-tab="${id}">${text}${count ? `<span class="${need ? 'ib-count-need' : 'ib-count-quiet'}">${count}</span>` : ''}</button>`;
      const panel =
        state.tab === 'needs'
          ? state.needs.length
            ? state.needs.map((n) => needRow(n)).join('')
            : '<p class="ib-empty">Nothing needs you.</p>'
          : state.activity.length
            ? `<div class="ib-section-head"><h3>Changes on maps you have opened</h3><button type="button" class="map-inbox-clear" data-act="clear">Clear</button></div>${state.activity.map((a) => actRow(a)).join('')}`
            : '<p class="map-inbox-empty">No map changes yet.</p>';
      return `${head('Inbox', summary())}
        <div class="ib-tabs" role="tablist" aria-label="Inbox">${tab('needs', 'Needs you', state.needs.length, true)}${tab('activity', 'Activity', unreadActivity(), false)}</div>
        <div class="map-inbox-body" role="tabpanel" id="ib-tabpanel" aria-labelledby="ib-tab-${state.tab}">${panel}</div>`;
    }
    if (v === 'D' || v === 'D2') {
      const rows = [
        ...(state.filter === 'all' ? state.activity.map((a) => ({ t: a.t, html: actRow(a) })) : []),
        ...state.needs.map((n) => ({ t: n.t, html: needRow(n) })),
      ].sort((x, y) => x.t - y.t);
      const chip = (id, text) =>
        `<button type="button" class="ib-chip" aria-pressed="${state.filter === id}" data-filter="${id}">${text}</button>`;
      return `${head('Inbox', summary(), state.activity.length ? '<button type="button" class="map-inbox-clear" data-act="clear">Clear activity</button>' : '')}
        <div class="ib-chips" role="group" aria-label="Show">${chip('all', 'All')}${chip('needs', `Needs you${state.needs.length ? ` <span class="ib-count-need">${state.needs.length}</span>` : ''}`)}</div>
        <div class="map-inbox-body">${rows.length ? rows.map((r) => r.html).join('') : `<p class="ib-empty">${state.filter === 'needs' ? 'Nothing needs you.' : 'Nothing yet.'}</p>`}</div>`;
    }
    if (v === 'E') {
      if (state.view === 'activity') {
        return `${head('Map activity', 'Changes on maps you have opened', state.activity.length ? '<button type="button" class="map-inbox-clear" data-act="clear">Clear</button>' : '')}
          <button type="button" class="ib-back" data-view="needs">${icon('left')}Needs you${state.needs.length ? ` <span class="ib-count-need">${state.needs.length}</span>` : ''}</button>
          <div class="map-inbox-body">${state.activity.length ? state.activity.map((a) => actRow(a)).join('') : '<p class="map-inbox-empty">No map changes yet.</p>'}</div>`;
      }
      const a = unreadActivity();
      return `${head('Needs you', state.needs.length ? 'Each one leaves on its own once handled' : 'You are all caught up')}
        <div class="map-inbox-body">${state.needs.length ? state.needs.map((n) => needRow(n)).join('') : '<p class="ib-empty">Nothing needs you.</p>'}</div>
        <button type="button" class="ib-more" data-view="activity">${icon('graph')}<span>Map activity</span>${a ? `<span class="ib-count-quiet">${a} new</span>` : ''}${icon('right')}</button>`;
    }
    if (v === 'F') {
      const maps = [...new Set([...state.needs.map((n) => n.map), ...state.activity.map((a) => a.map)])];
      const groups = maps
        .map((m) => {
          const needs = state.needs.filter((n) => n.map === m);
          const acts = state.activity.filter((a) => a.map === m);
          return `<div class="ib-map-head"><h3>${esc(mapLabel(m))}</h3>${needs.length ? `<span class="ib-need-kind">${plural(needs.length, 'needs you', 'need you')}</span>` : ''}${acts.length ? `<span class="hint">${acts.length} new</span>` : ''}</div>
            ${needs.map((n) => needRow(n, { scope: false })).join('')}${acts.map((a) => actRow(a, { scope: false })).join('')}`;
        })
        .join('');
      return `${head('Inbox', summary(), state.activity.length ? '<button type="button" class="map-inbox-clear" data-act="clear">Clear activity</button>' : '')}
        <div class="map-inbox-body">${groups || '<p class="map-inbox-empty">Nothing yet on maps you have opened.</p>'}</div>`;
    }
    return '';
  }

  /* ---------- page ---------- */
  const GHOSTS = [
    [60, 80], [300, 80], [540, 80], [60, 200], [300, 200], [540, 230], [780, 140], [180, 330], [420, 360], [660, 380], [900, 300], [120, 470],
  ];

  function render() {
    const root = document.getElementById('root');
    if (params.get('sheet') === '1') return renderSheet(root);
    const panelClass = V === 'today' ? 'map-inbox-list' : 'map-inbox-list ib-panel';
    root.innerHTML = `<div class="ib-app">
      <header class="topbar map-topbar">
        <div class="ib-crumb">${icon('graph')}<span class="ib-hide-narrow">wayfinder-map</span><span class="crumb-sep ib-hide-narrow">/</span><b class="ib-map-name">#300 Offline drafts</b></div>
        <span class="topbar-spacer" style="flex:1"></span>
        ${trigger(V)}
          <section class="${panelClass}" id="ib-panel" role="dialog" aria-labelledby="ib-title"${state.open ? '' : ' hidden'}>${body(V)}</section>
        </div>
        <button type="button" class="synced" data-to="Resync from GitHub">${icon('refresh')}<span class="synced-label">Synced 1 min ago</span></button>
        <button type="button" class="primary map-start" data-to="Start next" aria-label="Start next">${icon('play')}<span class="topbar-action-label">Start next</span></button>
      </header>
      <main class="ib-stage" aria-label="Map canvas (placeholder)">${GHOSTS.map(([x, y]) => `<div class="ib-ghost" style="left:${x}px;top:${y}px"></div>`).join('')}</main>
      <span class="sr-only" role="status" aria-live="polite" id="ib-live"></span>
    </div>`;
  }

  function renderSheet(root) {
    const save = { needs: state.needs, activity: state.activity, open: state.open };
    const STATES = [
      ['Nothing new', [], []],
      ['Activity only', [], ACTIVITY],
      ['Needs you + activity', NEEDS, ACTIVITY],
      ['Keyboard focus', NEEDS, ACTIVITY, true],
    ];
    const ROWS = [
      ['today', 'Today: bell + Inbox'],
      ['A', 'A · Inbox takes the bell in'],
      ['B', 'B · Bell takes the Inbox in'],
      ['C', 'C · Two tabs'],
      ['D', 'D · One timeline'],
      ['E', 'E · Needs you first'],
      ['F', 'F · By map'],
      ['D2', 'D+B · Timeline, bell icon'],
    ];
    state.open = false;
    let cells = `<div class="h">Option</div>${STATES.map(([s]) => `<div class="h">${s}</div>`).join('')}`;
    for (const [v, name] of ROWS) {
      cells += `<div class="rowname">${name}</div>`;
      for (const [, needs, acts, focus] of STATES) {
        state.needs = needs.map((n) => ({ ...n, read: false }));
        state.activity = acts.map((a) => ({ ...a, read: false }));
        const html = trigger(v, { forceFocus: !!focus }).replace(/<section[\s\S]*?<\/section>/g, '');
        cells += `<div><div class="ib-pair">${html}</div></div></div>`;
      }
    }
    Object.assign(state, save);
    root.innerHTML = `<div class="ib-sheet"><h1>The topbar control, every option, every state</h1><p>Sample: 4 need you, 7 new on maps you have opened. Focus ring forced on in the last column.</p><div class="ib-grid">${cells}</div></div>`;
    root.querySelectorAll('button').forEach((b) => b.setAttribute('tabindex', '-1'));
  }

  function focusPanel() {
    const panel = document.getElementById('ib-panel');
    panel?.querySelector('.ib-tab[aria-selected="true"], .ib-chip, a, button:not(.handoff-close)')?.focus();
  }
  function announce(text) {
    const live = document.getElementById('ib-live');
    if (live) live.textContent = text;
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act], [data-tab], [data-filter], [data-view], [data-row]');
    if (!el) {
      if (!e.target.closest('#ib-panel, .notification-panel') && (state.open || state.bellOpen)) {
        state.open = false;
        state.bellOpen = false;
        render();
      }
      return;
    }
    const act = el.dataset.act;
    if (act === 'toggle') {
      state.open = !state.open;
      state.bellOpen = false;
      render();
      if (state.open) focusPanel();
    } else if (act === 'bell') {
      state.bellOpen = !state.bellOpen;
      state.open = false;
      render();
    } else if (act === 'close') {
      state.open = false;
      state.bellOpen = false;
      render();
      document.querySelector('[data-act="toggle"]')?.focus();
    } else if (act === 'clear') {
      state.activity = [];
      render();
      announce('Map activity cleared');
      focusPanel();
    } else if (el.dataset.tab) {
      state.tab = el.dataset.tab;
      render();
      document.getElementById(`ib-tab-${state.tab}`)?.focus();
    } else if (el.dataset.filter) {
      state.filter = el.dataset.filter;
      render();
      document.querySelector(`[data-filter="${state.filter}"]`)?.focus();
    } else if (el.dataset.view) {
      state.view = el.dataset.view;
      render();
      focusPanel();
    } else if (el.dataset.row) {
      const item = [...state.needs, ...state.activity].find((x) => x.id === el.dataset.row);
      if (item) item.read = true;
      setTimeout(render, 0); // let kit.js show its "Would open" toast first
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (state.open || state.bellOpen)) {
      const wasBell = state.bellOpen;
      state.open = false;
      state.bellOpen = false;
      render();
      document.querySelector(wasBell ? '[data-act="bell"]' : '[data-act="toggle"]')?.focus();
    }
    const tab = e.target.closest?.('.ib-tab');
    if (tab && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      state.tab = state.tab === 'needs' ? 'activity' : 'needs';
      render();
      document.getElementById(`ib-tab-${state.tab}`)?.focus();
    }
  });

  render();
})();
