/*
  Draws the demo Wayfinder app: sidebar, top bar and the four views the tour visits.
  It only returns markup for a state; tour.js owns the state and the clicks.
*/
window.DemoApp = (() => {
  const { demo, types, states, copy, entries } = window.TOUR;
  const esc = Kit.esc;
  const icon = Kit.icon;
  const NODE_W = 184;
  const NODE_H = 100;
  const COL_X = [16, 220, 424];
  const ROW_Y = [20, 152, 284];

  const ticket = (n) => demo.tickets.find((t) => t.n === n);
  const typeIcon = (type) => `<span class="demo-type" title="${esc(types[type].label)}">${icon(types[type].icon)}</span>`;
  const stateBadge = (state) => `<span class="demo-state is-${state}">${icon(states[state].icon)}${esc(states[state].label)}</span>`;
  const pill = () => `<span class="demo-pill">${esc(copy.demoPill)}</span>`;

  function sidebar(s) {
    const rail = s.view === 'map' || s.view === 'planning';
    const tourItem = s.entry === 'card'
      ? `<button type="button" class="demo-nav${s.pulse ? ' is-pulse' : ''}" data-act="take-tour" id="entry-persistent">${icon('help')}<span>Take the tour</span></button>`
      : '';
    const helpBtn = s.entry === 'dialog'
      ? `<button type="button" class="iconbtn${s.pulse ? ' is-pulse' : ''}" data-act="take-tour" id="entry-persistent" aria-label="Take the tour" title="Take the tour">${icon('help')}</button>`
      : '';
    const repos = `
      ${s.tourOn ? `<li><button type="button" class="demo-nav${s.view === 'map' ? ' is-current' : ''}" data-act="noop"><span class="demo-mono is-demo" aria-hidden="true">DR</span><span>recipes</span>${pill()}</button></li>` : ''}
      <li><button type="button" class="demo-nav" data-to="acme/storefront (outside the demo)"><span class="demo-mono" aria-hidden="true">AS</span><span>storefront</span></button></li>`;
    if (rail) {
      return `<aside class="demo-sidebar is-rail" aria-label="Wayfinder navigation">
        <span class="demo-logo" aria-hidden="true">${icon('compass')}</span>
        <button type="button" class="demo-rail-btn is-primary" aria-label="Start a new map" data-act="noop">${icon('plus')}</button>
        <button type="button" class="demo-rail-btn" aria-label="Home" data-act="noop">${icon('home')}</button>
        ${s.entry === 'card' ? `<button type="button" class="demo-rail-btn${s.pulse ? ' is-pulse' : ''}" aria-label="Take the tour" data-act="take-tour" id="entry-persistent">${icon('help')}</button>` : ''}
        <span class="demo-rail-sep"></span>
        ${s.tourOn ? '<span class="demo-rail-btn is-current" aria-label="demo/recipes, demo repository"><span class="demo-mono is-demo">DR</span></span>' : ''}
        <span class="demo-rail-btn" aria-label="acme/storefront"><span class="demo-mono">AS</span></span>
        <span class="demo-rail-foot">
          ${s.entry === 'dialog' ? `<button type="button" class="demo-rail-btn${s.pulse ? ' is-pulse' : ''}" aria-label="Take the tour" title="Take the tour" data-act="take-tour" id="entry-persistent">${icon('help')}</button>` : ''}
          <span class="demo-rail-btn" aria-label="Settings">${icon('gear')}</span>
        </span>
      </aside>`;
    }
    return `<aside class="demo-sidebar" aria-label="Wayfinder navigation">
      <div class="demo-brand"><span class="demo-logo" aria-hidden="true">${icon('compass')}</span>Wayfinder</div>
      <button type="button" class="primary demo-new" data-act="${s.tourOn ? 'noop' : 'new-map'}">${icon('plus')}Start a new map</button>
      <button type="button" class="demo-nav${s.view === 'home' ? ' is-current' : ''}" data-act="noop">${icon('home')}<span>Home</span></button>
      ${tourItem}
      <h2 class="eyebrow demo-eyebrow">Repositories</h2>
      <ul class="demo-repos">${repos}</ul>
      <div class="demo-foot">
        <span class="demo-avatar" aria-hidden="true">M</span><span class="demo-user">mira-dev</span>
        ${helpBtn}
        <button type="button" class="iconbtn" aria-label="Settings" data-to="Settings">${icon('gear')}</button>
      </div>
    </aside>`;
  }

  function topbar(s) {
    let title = '<span class="demo-title">Home</span>';
    if (s.view === 'newmap' || s.view === 'planning') title = '<span class="demo-title">Start a new map</span>';
    if (s.view === 'map') {
      title = `<span class="demo-crumb"><span class="demo-mono is-demo" aria-hidden="true">DR</span>${esc(demo.repo)}</span><span class="demo-slash">/</span><span class="demo-crumb is-map">#${demo.mapNumber} ${esc(demo.mapTitle)}</span>`;
    }
    const tour = s.entry === 'corner'
      ? `<button type="button" class="ghost demo-tour-btn${s.pulse ? ' is-pulse' : ''}" data-act="take-tour" id="entry-persistent">${icon('help')}Tour</button>`
      : '';
    return `<header class="demo-topbar">${title}<span class="demo-spacer"></span>${tour}
      <button type="button" class="demo-inbox" data-to="Inbox">${icon('bell')}<span>Inbox</span></button></header>`;
  }

  function banner(s) {
    if (!s.tourOn) return '';
    return `<div class="demo-banner" role="note">${pill()}<span>${esc(copy.banner)}</span>
      <button type="button" class="demo-link" data-act="exit">${esc(copy.exit)}</button></div>`;
  }

  function home(s) {
    const card = s.invite && s.entry === 'card'
      ? `<section class="demo-invite-card" aria-labelledby="invite-title">
          <button type="button" class="iconbtn demo-invite-x" aria-label="Dismiss" data-act="not-now">${icon('close')}</button>
          <span class="demo-invite-icon" aria-hidden="true">${icon('compass')}</span>
          <div><h2 id="invite-title">${esc(TOUR.invite.cardTitle)}</h2><p>${esc(TOUR.invite.shortBody)}</p>
          <div class="demo-actions"><button type="button" class="primary" data-act="take-tour">${icon('play')}${esc(TOUR.invite.accept)}</button>
          <button type="button" class="ghost" data-act="not-now">${esc(TOUR.invite.decline)}</button></div></div>
        </section>`
      : '';
    return `<main class="demo-page demo-home">
      ${card}
      <section class="demo-empty">
        <p class="eyebrow">Continue</p>
        <h2>No maps yet</h2>
        <p>Describe a goal and Wayfinder plans it as a map of tickets.</p>
        <button type="button" class="primary" data-act="${s.tourOn ? 'noop' : 'new-map'}">${icon('plus')}Start a new map</button>
      </section>
      <section>
        <p class="eyebrow">Repositories</p>
        <div class="demo-list">
          ${s.tourOn ? `<div class="demo-row"><span class="demo-mono is-demo" aria-hidden="true">DR</span><strong>${esc(demo.repo)}</strong>${pill()}<span class="demo-muted">no maps yet</span></div>` : ''}
          <div class="demo-row"><span class="demo-mono" aria-hidden="true">AS</span><strong>acme/storefront</strong><span class="demo-muted">no maps yet</span></div>
        </div>
      </section>
    </main>`;
  }

  function newMap(s) {
    return `<main class="demo-page demo-newmap">
      <h1>What do you want to get done?</h1>
      <div class="demo-composer">
        <label class="sr-only" for="demo-goal">Goal</label>
        <textarea id="demo-goal" rows="3">${esc(demo.goal)}</textarea>
        <div class="demo-composer-bar">
          <span class="demo-chip">${icon('repo')}${esc(demo.repo)}${pill()}</span>
          <span class="demo-chip is-quiet">${icon('sliders')}Mid</span>
          <span class="demo-spacer"></span>
          <button type="button" class="primary" id="demo-start" data-act="start-map">Start map${icon('arrow')}</button>
        </div>
        <p class="demo-note">${esc(copy.startMapNote)}</p>
      </div>
    </main>`;
  }

  function planning(s) {
    const lines = demo.interview.slice(0, Math.min(s.plan, 2)).map((x) => `
      <li class="demo-qa"><p class="demo-q"><span class="demo-who">T3 Code</span>${esc(x.q)}</p><p class="demo-a"><span class="demo-who">You</span>${esc(x.a)}</p></li>`).join('');
    const drafting = s.plan >= 3 ? `<li class="demo-step-line">${icon(s.plan >= 4 ? 'check' : 'clock')}${s.plan >= 4 ? `Drafted ${demo.tickets.length} tickets on map #${demo.mapNumber}` : 'Drafting tickets…'}</li>` : '';
    return `<main class="demo-page demo-newmap">
      <h1>Planning “${esc(demo.mapTitle)}”</h1>
      <section class="demo-plan" id="demo-plan" aria-live="polite" aria-busy="${s.plan < 4}">
        <p class="demo-plan-head">${pill()}<span>${s.plan < 4 ? 'T3 Code is asking about your goal' : 'The demo map is ready'}</span></p>
        <ol class="demo-transcript">${lines}${drafting}</ol>
        ${s.plan >= 4 ? `<button type="button" class="primary" data-act="next">Open the map${icon('arrow')}</button>` : ''}
      </section>
    </main>`;
  }

  function node(t, s) {
    const needs = t.needs.length ? `needs ${t.needs.map((n) => `#${n}`).join(', ')}` : t.state === 'done' ? 'closed' : 'ready to start';
    const sel = s.selected === t.n;
    return `<button type="button" class="demo-node is-${t.state}${sel ? ' is-selected' : ''}" data-ticket="${t.n}" data-act="select" aria-pressed="${sel}"
      style="left:${COL_X[t.col]}px;top:${ROW_Y[t.row]}px;width:${NODE_W}px"
      aria-label="#${t.n} ${esc(t.title)}, ${t.type}, ${states[t.state].label}${t.needs.length ? `, needs ${t.needs.map((n) => `#${n}`).join(' and ')}` : ''}">
      <span class="demo-node-top">${typeIcon(t.type)}<span class="demo-num">#${t.n}</span>${stateBadge(t.state)}</span>
      <span class="demo-node-title">${esc(t.title)}</span>
      <span class="demo-node-foot">${needs}</span>
    </button>`;
  }

  function edges() {
    const paths = [];
    for (const t of demo.tickets) {
      for (const n of t.needs) {
        const from = ticket(n);
        const x1 = COL_X[from.col] + NODE_W;
        const y1 = ROW_Y[from.row] + NODE_H / 2;
        const x2 = COL_X[t.col];
        const y2 = ROW_Y[t.row] + NODE_H / 2;
        const mid = (x1 + x2) / 2;
        const open = from.state !== 'done';
        paths.push(`<path d="M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}" class="${open ? 'is-open' : ''}"/>`);
      }
    }
    return `<svg class="demo-edges" aria-hidden="true" width="${COL_X[2] + NODE_W + 20}" height="${ROW_Y[2] + NODE_H + 20}">${paths.join('')}</svg>`;
  }

  function filters(s) {
    const count = (fn) => demo.tickets.filter(fn).length;
    const typeChips = Object.entries(types).map(([key, t]) =>
      `<span class="demo-filter">${icon(t.icon)}${t.label}<span class="num">${count((x) => x.type === key)}</span></span>`).join('');
    return `<div class="demo-filters" role="group" aria-label="Ticket filters">
      <span class="demo-filter is-on">All<span class="num">${demo.tickets.length}</span></span>
      <span class="demo-filter">${icon('arrow')}Next up<span class="num">${count((x) => x.state === 'next')}</span></span>
      <span class="demo-filter">${icon('lock')}Blocked<span class="num">${count((x) => x.state === 'blocked')}</span></span>
      <span class="demo-filter">${icon('check')}Done<span class="num">${count((x) => x.state === 'done')}</span></span>
      <span class="demo-sep" aria-hidden="true"></span>
      <span class="demo-types-group" id="demo-types">${typeChips}</span>
    </div>`;
  }

  function typeLegend() {
    return `<ul class="demo-type-legend">${Object.values(types).map((t) =>
      `<li>${icon(t.icon)}<strong>${t.label}</strong><span>${esc(t.line)}</span></li>`).join('')}</ul>`;
  }

  function inspector(s) {
    const t = s.selected ? ticket(s.selected) : null;
    if (!t) {
      return `<aside class="demo-inspector" aria-label="Brief and ticket">
        <p class="eyebrow">Brief</p>
        <h2>#${demo.mapNumber} ${esc(demo.mapTitle)}</h2>
        <h3>Where this is heading</h3><p>${esc(demo.destination)}</p>
        <h3>Goal</h3><p class="demo-muted">${esc(demo.goal)}</p>
        <p class="demo-hint">${icon('info')}Select a ticket to see what it needs.</p>
      </aside>`;
    }
    const waiting = t.needs.filter((n) => ticket(n).state !== 'done');
    const blockedNote = t.state === 'blocked'
      ? `<p class="demo-waiting">${icon('lock')}<span>Waiting on ${waiting.map((n) => `<strong>#${n}</strong>`).join(' and ')}. It can start once ${waiting.length > 1 ? 'they close' : 'it closes'}.</span></p>`
      : '';
    const unlocks = demo.tickets.filter((x) => x.needs.includes(t.n)).map((x) => `<span class="demo-ref">#${x.n}</span>`).join(' ') || '<span class="demo-muted">nothing</span>';
    const needs = t.needs.map((n) => `<span class="demo-ref">#${n}</span>`).join(' ') || '<span class="demo-muted">nothing</span>';
    const canOpen = t.state === 'next' && t.type === 'task';
    const handoff = s.selected === 5 && s.handoff > 0
      ? `<ol class="demo-handoff" id="demo-handoff" tabindex="-1" aria-live="polite" aria-label="Hand-off status">${demo.handOff.map((line, i) => {
          const done = s.handoff > i + 1 || (i === 2 && s.handoff >= 3);
          const now = !done && s.handoff === i + 1;
          if (!done && !now) return '';
          return `<li class="${done ? 'is-done' : 'is-now'}">${icon(i === 2 ? 'pull-request' : done ? 'check' : 'clock')}${esc(line)}</li>`;
        }).join('')}</ol>`
      : '';
    return `<aside class="demo-inspector" aria-label="Brief and ticket">
      <p class="demo-ins-top">${typeIcon(t.type)}<span class="demo-num">#${t.n}</span>${stateBadge(t.state)}</p>
      <h2>${esc(t.title)}</h2>
      ${blockedNote}
      <dl class="demo-meta"><dt>Type</dt><dd>${types[t.type].label}</dd><dt>Needs</dt><dd>${needs}</dd><dt>Unlocks</dt><dd>${unlocks}</dd></dl>
      <div class="demo-launch">
        <button type="button" class="primary" id="demo-open" data-act="open-t3" ${canOpen && !s.handoff ? '' : 'disabled'}>${icon('play')}Open in T3 Code</button>
        <p class="demo-note">${t.state === 'blocked' ? 'Starts once its needs close.' : t.state === 'done' ? 'Already done.' : canOpen ? esc(copy.openNote) : 'Waits for you: open it to decide. ' + esc(copy.openNote)}</p>
      </div>
      ${handoff}
      <h3>Question</h3><p>${esc(t.question)}</p>
      <h3>Done when</h3><ul class="demo-done">${t.doneWhen.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
    </aside>`;
  }

  function mapView(s) {
    return `<main class="demo-mapview">
      ${filters(s)}
      <div class="demo-map-body">
        <section class="demo-canvas" id="demo-canvas" aria-label="Tickets">
          <div class="demo-canvas-inner">${edges()}${demo.tickets.map((t) => node(t, s)).join('')}</div>
        </section>
        ${inspector(s)}
      </div>
    </main>`;
  }

  function render(s) {
    const view = { home, newmap: newMap, planning, map: mapView }[s.view](s);
    return `<div class="demo-app is-${s.view}">${sidebar(s)}<div class="demo-main">${topbar(s)}${banner(s)}${view}</div></div>`;
  }

  return { render, typeLegend, entries };
})();
