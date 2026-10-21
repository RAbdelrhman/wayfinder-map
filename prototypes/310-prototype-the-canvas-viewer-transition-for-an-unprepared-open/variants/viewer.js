// #310: what the shipped ACF4 viewer shows while an unprepared canvas boots.
// One page; the query picks the direction and the case:
//   dir     AB poster over the app's skeleton (round 2) | A poster | B skeleton | C hold the open | D lift the tile | E prepare earlier only (today's screen)
//   ready   prep (pointer rested 400 ms, so ready ~16 ms after the click) | milliseconds after the click
//   surface desktop | localhost      entry board (Canvas button) | option (a variant tile)
//   poster  ok | missing | failed | late (AB: decodes 200 ms after the click)    motion reduce      slow 1 | 4      auto 0 stops the replay loop
//   capture board | option: only the live canvas, used to make the poster images in ../assets
(() => {
  const q = new URLSearchParams(location.search);
  const DIR = ['AB', 'A', 'B', 'C', 'D'].includes(q.get('dir')) ? q.get('dir') : 'E';
  const PREP = q.get('ready') === 'prep';
  const READY = PREP ? 16 : Math.max(0, Number(q.get('ready') ?? 440) || 0);
  const SURFACE = q.get('surface') === 'localhost' ? 'localhost' : 'desktop';
  const ENTRY = q.get('entry') === 'option' ? 'option' : 'board';
  const POSTER = ['ok', 'missing', 'failed', 'late'].includes(q.get('poster')) ? q.get('poster') : 'ok';
  const REDUCE = q.get('motion') === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (REDUCE) document.body.classList.add('is-reduce');
  const CAPTURE = q.get('capture');
  const THEME = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  let slow = q.get('slow') === '4' ? 4 : 1;
  let auto = q.get('auto') !== '0';
  /** C opens the viewer when the canvas is ready, or after this long at most (a design value, not a measurement). */
  const HOLD_CAP = 1000;
  /** C shows the busy ring only if the hold lasts longer than this, so quick opens do not flicker. */
  const RING_AFTER = 150;
  const OPEN_MS = 220;

  const esc = Kit.esc;
  const svg = (d) => `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = {
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    play: '<path d="M7 4v16l13-8z"/>',
    replay: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
  };

  // Fake data: #196's 16-option board, drawn with screenshots of other prototypes.
  const SHOTS = ['42-A', '42-B', '42-C', '42-D', '43-A', '43-B', '43-C', '44-A', '44-B', '44-C', '45-A', '45-B', '45-C', '45-AB', '8', '17'];
  const NAMES = ['One list, newest first', 'Two tabs', 'Grouped by map', 'Needs-you pinned', 'Bell plus badge', 'Split popover', 'Timeline', 'Digest card', 'Filters on top', 'Compact rows', 'Inline actions', 'Unread first', 'Muted maps', 'Combined A+B', 'Snapshot style', 'Sidebar drawer'];
  const OPTIONS = SHOTS.map((shot, i) => ({ id: String.fromCharCode(65 + i), name: NAMES[i], img: `../../canvas/assets/protos/${shot}.jpg` }));
  const TICKET = '#196 How should one topbar inbox hold map activity and needs-you alerts?';

  const liveCanvas = (entry, option = OPTIONS[0]) =>
    entry === 'option'
      ? `<div class="p310-cv is-present"><div class="p310-engine"><span class="p310-eng-back">‹ Board</span><b>${option.id} · ${esc(option.name)}</b><span class="p310-sp"></span><span>${OPTIONS.indexOf(option) + 1} / ${OPTIONS.length}</span><span>Notes</span></div><div class="p310-present"><img src="${option.img}" alt="" /></div></div>`
      : `<div class="p310-cv"><div class="p310-engine"><b>Inbox directions</b><span class="p310-eng-menu">Directions ▾</span><span class="p310-sp"></span><span>Fit · 31%</span><span>${THEME === 'dark' ? 'Dark' : 'Light'}</span><span>?</span></div><div class="p310-plane"><div class="p310-grid">${OPTIONS.map((o) => `<figure class="p310-fr" data-frame="${o.id}"><figcaption><b>${o.id}</b>${esc(o.name)}</figcaption><span class="p310-fr-body"><img src="${o.img}" alt="" /></span></figure>`).join('')}</div></div></div>`;

  // A placeholder drawn only from what the tile already knows: the option ids and names.
  const skeleton = (entry) =>
    entry === 'option'
      ? `<div class="p310-cv is-present is-skel" aria-hidden="true"><div class="p310-engine"><span class="p310-bone" style="width:54px"></span><b>A · ${esc(OPTIONS[0].name)}</b><span class="p310-sp"></span><span class="p310-bone" style="width:40px"></span></div><div class="p310-present"><span class="p310-skel-page"></span></div></div>`
      : `<div class="p310-cv is-skel" aria-hidden="true"><div class="p310-engine"><span class="p310-bone" style="width:120px"></span><span class="p310-sp"></span><span class="p310-bone" style="width:60px"></span></div><div class="p310-plane"><div class="p310-grid">${OPTIONS.map((o) => `<figure class="p310-fr"><figcaption><b>${o.id}</b>${esc(o.name)}</figcaption><span class="p310-fr-body"></span></figure>`).join('')}</div></div></div>`;

  // Round 2 (AB): the same placeholder in the app's own loading style, src/ui/skeleton.ts bone() and .wf-bone.
  const bone = (w) => `<span class="wf-bone" style="--w: ${w}">&nbsp;</span>`;
  const appSkeleton = (entry) =>
    entry === 'option'
      ? `<div class="p310-cv is-present is-bones" aria-hidden="true"><div class="p310-engine">${bone('54px')}<b>A · ${esc(OPTIONS[0].name)}</b><span class="p310-sp"></span>${bone('40px')}</div><div class="p310-present"><span class="wf-bone is-block p310-bone-page"></span></div></div>`
      : `<div class="p310-cv is-bones" aria-hidden="true"><div class="p310-engine">${bone('120px')}<span class="p310-sp"></span>${bone('60px')}</div><div class="p310-plane"><div class="p310-grid">${OPTIONS.map((o) => `<figure class="p310-fr"><figcaption><b>${o.id}</b>${esc(o.name)}</figcaption><span class="wf-bone is-block p310-bone-frame"></span></figure>`).join('')}</div></div></div>`;

  if (CAPTURE) {
    document.body.classList.add('is-capture');
    document.getElementById('surface').innerHTML = liveCanvas(CAPTURE === 'option' ? 'option' : 'board');
    document.getElementById('proto').remove();
    return;
  }

  // ---------- the app behind: the desktop window or a browser tab, then the map's Prototypes board ----------
  const chrome =
    SURFACE === 'desktop'
      ? `<div class="p310-win" aria-hidden="true"><span class="p310-win-logo"></span>Wayfinder<span class="p310-sp"></span><span class="p310-win-ctl">—</span><span class="p310-win-ctl">▢</span><span class="p310-win-ctl">✕</span></div>`
      : `<div class="p310-browser" aria-hidden="true"><div class="p310-tabs"><span class="p310-tab"><span class="p310-win-logo"></span>Wayfinder · map #205</span><span class="p310-tab is-off">+</span></div><div class="p310-url"><span>‹ ›  ⟳</span><span class="p310-url-box">localhost:4317/RAbdelrhman/wayfinder-map/maps/205?view=prototypes</span></div></div>`;
  const tiles = OPTIONS.slice(0, 8)
    .map((o) => `<a class="wf-var decision-variant" role="listitem" href="#" data-variant="${o.id}" aria-label="Open variant ${o.id}: ${esc(o.name)}"><span class="wf-frame proto-thumb"><img class="decision-variant-image" src="${o.img}" alt="" /><span class="tag">${o.id}</span></span><span class="lbl">${o.id} · ${esc(o.name)}</span></a>`)
    .join('');
  document.getElementById('surface').className = `p310-surface is-${SURFACE}`;
  document.getElementById('surface').innerHTML = `${chrome}<div class="p310-app" id="app">
    <header class="topbar"><span class="page-title">Map #205 · Prototypes</span></header>
    <main class="p310-main" id="main"><div class="wf-board-page"><div class="wf-board">
      <section class="wf-node wf-proto is-waiting" style="--accent: var(--state-claimed)">
        <div class="h"><span class="chip" style="--accent: var(--state-claimed)">${svg(ICON.hand)}Waiting on your pick</span><button type="button" class="wf-proto-title">${esc(TICKET)}</button><time class="when">Oct 14</time>
          <span class="acts"><button type="button" class="ghost">Pick in #197</button><a class="primary" href="#" data-canvas aria-label="Open the #196 prototype canvas">${svg(ICON.play)}Canvas</a></span></div>
        <p class="gist">Sixteen directions for one inbox in the top bar.</p>
        <div class="wf-strip" role="list" aria-label="Variants for #196">${tiles}</div>
      </section></div></div></main>
    <section class="vw is-a has-corner-grips" id="viewer" role="dialog" aria-modal="true" aria-labelledby="vw-title" hidden><div id="vw-toolbar"></div><div class="vw-stage" id="stage"></div></section>
    <span class="p310-cursor" id="cursor" aria-hidden="true"></span>
  </div>`;

  const $ = (id) => document.getElementById(id);
  const app = $('app'), main = $('main'), viewer = $('viewer'), toolbar = $('vw-toolbar'), stage = $('stage'), cursor = $('cursor');
  const originEl = () => (ENTRY === 'option' ? app.querySelector('[data-variant="A"]') : app.querySelector('[data-canvas]'));
  const posterSrc = POSTER === 'failed' ? '../assets/poster-damaged.jpg' : `../assets/poster-${ENTRY}-${THEME}.jpg`;
  // A real poster would be requested with the card, so it is decoded before the click. The late case starts its request after the click.
  if ((DIR === 'A' || DIR === 'AB') && POSTER !== 'missing' && POSTER !== 'late') new Image().src = posterSrc;

  // ---------- the open ----------
  let run = 0, t0 = 0, firstAt = null, liveAt = null, openAt = null, origin = null, timers = [];
  const later = (ms, fn) => timers.push(setTimeout(fn, ms * slow));
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  const paintToolbar = (state) => {
    toolbar.innerHTML = P310_TOOLBARS[`full-${state}`];
  };
  // The timeline shows the scheduled times; timers in a busy frame drift by a few ms.
  const mark = (kind, t) => {
    if (kind === 'first' && firstAt === null) firstAt = t;
    if (kind === 'live') liveAt = t;
    if (kind === 'open') openAt = t;
    drawTimeline();
  };
  const animateFrom = (reverse = false) => {
    if (REDUCE || !origin) return Promise.resolve();
    // Closing mid-open turns the opening around from where it is, rather than jumping to full size first.
    const running = viewer.getAnimations()[0];
    if (reverse && running && running.playState === 'running') {
      running.reverse();
      return running.finished.catch(() => {});
    }
    const from = origin.getBoundingClientRect(), to = viewer.getBoundingClientRect();
    const small = { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`, opacity: 0.2 };
    const large = { transform: 'none', opacity: 1 };
    return viewer.animate(reverse ? [large, small] : [small, large], { duration: OPEN_MS * slow, easing: 'cubic-bezier(.2,.8,.2,1)' }).finished.catch(() => {});
  };
  const showViewer = (t = 0) => {
    viewer.hidden = false;
    main.inert = true;
    mark('open', t);
    void animateFrom();
    viewer.querySelector('[data-close]')?.focus({ preventScroll: true });
  };
  /** What sits on the stage between the click and the canvas's first paint. */
  const placeholder = () => {
    if (DIR === 'AB') {
      // The skeleton is always laid first; a poster that decodes covers it, one that is missing or fails never does.
      stage.insertAdjacentHTML('afterbegin', appSkeleton(ENTRY));
      mark('first', 0);
      if (POSTER === 'missing') return;
      const img = new Image();
      img.className = 'vw-poster-image p310-over';
      img.alt = '';
      img.onerror = () => img.remove();
      const my = run;
      // A poster that arrives after the canvas went live is dropped, never laid over it.
      const put = () => { if (my !== run || liveAt !== null) return; img.src = posterSrc; stage.append(img); };
      if (POSTER === 'late') later(200, put);
      else put();
    } else if (DIR === 'A' && POSTER !== 'missing') {
      const img = new Image();
      img.className = 'vw-poster-image';
      img.alt = '';
      img.onerror = () => img.remove(); // a failed poster leaves what today's viewer shows: the plain stage
      img.src = posterSrc;
      stage.prepend(img);
      if (POSTER === 'ok') mark('first', 0);
    } else if (DIR === 'B') {
      stage.insertAdjacentHTML('afterbegin', skeleton(ENTRY));
      mark('first', 0);
    } else if (DIR === 'D' && ENTRY === 'option') {
      // The tile's own picture, lifted into the stage at the tile's crop; the live tile page in production.
      stage.insertAdjacentHTML('afterbegin', `<div class="p310-lift" aria-hidden="true"><img src="${OPTIONS[0].img}" alt="" /></div>`);
      mark('first', 0);
    }
  };
  const goLive = (my) => {
    if (my !== run) return;
    stage.innerHTML = `<div class="p310-live">${liveCanvas(ENTRY)}</div>`;
    paintToolbar(ENTRY === 'option' ? 'option' : 'board');
    mark('first', READY);
    mark('live', READY);
    if (DIR === 'C' && viewer.hidden) showViewer(READY);
    else viewer.querySelector('[data-close]')?.focus({ preventScroll: true });
    announce('Canvas ready');
  };
  const open = (from) => {
    if (!viewer.hidden || app.classList.contains('is-holding')) return;
    const my = ++run;
    origin = from;
    t0 = performance.now();
    firstAt = liveAt = openAt = null;
    stage.innerHTML = '';
    paintToolbar('loading');
    const ready = READY;
    if (PREP) {
      // Prepared ahead of the click: the retained live canvas rides the opening animation in every direction (#214: 12–21 ms).
      stage.innerHTML = `<div class="p310-live">${liveCanvas(ENTRY)}</div>`;
      paintToolbar(ENTRY === 'option' ? 'option' : 'board');
      showViewer();
      mark('first', ready);
      mark('live', ready);
    } else if (DIR === 'C') {
      // Hold: the tile answers at once, the viewer opens when the canvas can paint.
      app.classList.add('is-holding');
      from.classList.add('p310-held');
      from.setAttribute('aria-busy', 'true');
      later(RING_AFTER, () => my === run && from.classList.add('has-ring'));
      const release = () => {
        app.classList.remove('is-holding');
        from.classList.remove('p310-held', 'has-ring');
        from.removeAttribute('aria-busy');
      };
      later(Math.min(ready, HOLD_CAP), () => {
        if (my !== run) return;
        release();
        if (ready <= HOLD_CAP) goLive(my);
        else showViewer(HOLD_CAP);
      });
      if (ready > HOLD_CAP) later(ready, () => goLive(my));
    } else {
      placeholder();
      showViewer();
      later(ready, () => goLive(my));
    }
    drawTimeline();
    tick(my);
  };
  /** Esc during C's hold cancels the pending open: no viewer, the entry released. */
  const cancelHold = () => {
    if (!app.classList.contains('is-holding')) return false;
    run++;
    clearTimers();
    app.classList.remove('is-holding');
    for (const el of app.querySelectorAll('.p310-held')) {
      el.classList.remove('p310-held', 'has-ring');
      el.removeAttribute('aria-busy');
    }
    return true;
  };
  const close = () => {
    if (cancelHold()) {
      if (auto) loop();
      return;
    }
    if (viewer.hidden) return;
    const my = ++run;
    clearTimers();
    void animateFrom(true).then(() => {
      if (my !== run) return; // a replay opened meanwhile
      viewer.hidden = true;
      main.inert = false;
      stage.innerHTML = '';
      origin?.focus({ preventScroll: true });
    });
    if (REDUCE) {
      viewer.hidden = true;
      main.inert = false;
    }
    if (auto) loop();
  };

  // ---------- input ----------
  app.addEventListener('click', (event) => {
    const entry = event.target.closest('[data-canvas], [data-variant]');
    if (entry) {
      event.preventDefault();
      if (app.classList.contains('is-holding') || !viewer.hidden) return; // a second click during an open is ignored
      clearTimers();
      auto = false;
      paintProto();
      return open(entry);
    }
    // Only Close is wired: the question is the open itself, so the other shipped controls are shown but inert here.
    if (event.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  const live = document.createElement('div');
  live.className = 'sr-only';
  live.setAttribute('role', 'status');
  document.body.append(live);
  const announce = (text) => (live.textContent = text);

  // ---------- the scripted replay: pointer to the entry, click with no lead-in (or a 400 ms rest), hold, close ----------
  const moveCursor = (el) => {
    const r = el.getBoundingClientRect(), a = app.getBoundingClientRect();
    cursor.style.transform = `translate(${r.left - a.left + r.width * 0.5}px, ${r.top - a.top + Math.min(r.height * 0.5, 40)}px)`;
  };
  const loop = () => {
    clearTimers();
    const target = originEl();
    cursor.classList.remove('is-down');
    cursor.style.transform = 'translate(640px, 520px)';
    later(700, () => { cursor.classList.add('is-shown'); moveCursor(target); });
    const press = 700 + 450 + (PREP ? 400 : 0);
    if (PREP) later(1150, () => cursor.classList.add('is-rest'));
    later(press, () => {
      cursor.classList.remove('is-rest');
      cursor.classList.add('is-down');
      open(target);
      later(160, () => cursor.classList.remove('is-down'));
      later(Math.max(READY, OPEN_MS) + 2200, () => auto && close());
    });
  };

  // ---------- prototype controls and the timeline (not product UI) ----------
  const DIRNAME = { AB: 'A+B · Poster over skeleton', E: "E · Prepare earlier only (today's screen)", A: 'A · Poster', B: 'B · Skeleton', C: 'C · Hold the open', D: 'D · Lift the tile' };
  const scaleMax = Math.max(1000, READY + 120);
  const at = (ms) => `${Math.min(100, (ms / scaleMax) * 100)}%`;
  const caseLine = () =>
    [DIRNAME[DIR], SURFACE === 'desktop' ? 'Desktop app' : 'Localhost', ENTRY === 'board' ? 'Canvas button' : 'Variant tile', PREP ? 'Prepared (400 ms rest)' : `No lead-in · ready at ${READY} ms`, (DIR === 'A' || DIR === 'AB') && POSTER !== 'ok' ? `Poster ${POSTER}` : '', REDUCE ? 'Reduced motion' : '']
      .filter(Boolean)
      .join(' · ');
  let playhead = null;
  const tick = (my) => {
    const step = () => {
      if (my !== run || !playhead) return;
      const t = (performance.now() - t0) / slow;
      playhead.style.left = at(t);
      if (t < scaleMax) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const drawTimeline = () => {
    const el = $('p310-tl');
    if (!el) return;
    const first = firstAt, liveT = liveAt;
    const shown = DIR === 'C' && openAt === null ? null : openAt;
    el.innerHTML = `${REDUCE ? '' : `<span class="p310-tl-band" style="left:${at(shown ?? 0)};width:${at(OPEN_MS)}" title="Opening animation"></span>`}
      ${shown !== null ? `<span class="p310-tl-mk is-open" style="left:${at(shown)}"><i></i>Viewer ${shown} ms</span>` : ''}
      ${first !== null ? `<span class="p310-tl-mk is-first" style="left:${at(first)}"><i></i>First content ${first} ms</span>` : ''}
      ${liveT !== null ? `<span class="p310-tl-mk is-live" style="left:${at(liveT)}"><i></i>Live ${liveT} ms</span>` : ''}
      <span class="p310-tl-ph" id="p310-ph"></span>`;
    playhead = $('p310-ph');
  };
  const paintProto = () => {
    $('proto').innerHTML = `<span class="p310-proto-tag">Prototype</span><span class="p310-case">${esc(caseLine())}</span>
      <div class="p310-tl" id="p310-tl" aria-hidden="true"></div>
      <button type="button" data-p="replay">${svg(ICON.replay)}Replay</button>
      <button type="button" data-p="auto" aria-pressed="${auto}">${svg(auto ? ICON.pause : ICON.play)}${auto ? 'Pause loop' : 'Loop'}</button>
      <button type="button" data-p="slow" aria-pressed="${slow === 4}">Slow ×4</button>`;
    drawTimeline();
  };
  $('proto').addEventListener('click', (event) => {
    const b = event.target.closest('[data-p]');
    if (!b) return;
    if (b.dataset.p === 'slow') slow = slow === 4 ? 1 : 4;
    if (b.dataset.p === 'auto') auto = !auto;
    run++;
    clearTimers();
    for (const animation of viewer.getAnimations()) animation.cancel();
    viewer.hidden = true;
    main.inert = false;
    app.classList.remove('is-holding');
    for (const el of app.querySelectorAll('.p310-held')) {
      el.classList.remove('p310-held', 'has-ring');
      el.removeAttribute('aria-busy');
    }
    paintProto();
    if (b.dataset.p === 'replay' || auto) {
      if (b.dataset.p === 'replay' && !auto) {
        const target = originEl();
        moveCursor(target);
        later(PREP ? 400 : 0, () => open(target));
      } else loop();
    }
  });
  paintProto();
  if (auto) loop();
})();
