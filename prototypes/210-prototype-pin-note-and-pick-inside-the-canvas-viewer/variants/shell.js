/*
  Shared viewer shell for both directions: the desktop behind it, the ACF4 full/pane/float
  chrome, the simulated canvas, the pin overlay, and the prototype-only demo bar. The two
  directions differ only in the feedback UI they draw via decorate(). No storage, no network.
*/
window.WF = window.WF || {};
WF.Shell = (() => {
  const { icon, esc, data, SOURCES, optionName } = WF;

  const SIZE_ICON = {
    full: '<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/>',
    pane: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M13 4v16"/>',
    float: '<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="11.5" y="11.5" width="6.5" height="5.5" rx="1"/>',
  };
  const SIZE_LABEL = { full: 'Full window', pane: 'Side pane', float: 'Floating window' };
  const svg = (inner, cls) => `<svg class="i${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

  function mount(root, opts) {
    const st = opts.state;
    let floatRect = null;

    root.innerHTML =
      '<div class="desk">' +
      '  <div class="app is-inert" aria-hidden="true">' +
      '    <div class="app-top"><span class="app-logo">' + icon('logo') + '</span><strong>Wayfinder</strong><span>› map #205 › Onboarding</span></div>' +
      '    <div class="map-skeleton">' +
      '      <div class="map-card"><div class="bar"></div><div class="bar w2"></div><div class="bar w3"></div></div>' +
      '      <div class="map-card"><div class="bar"></div><div class="bar w2"></div><div class="bar w3"></div></div>' +
      '      <div class="map-card"><div class="bar"></div><div class="bar w2"></div><div class="bar w3"></div></div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="scrim" hidden></div>' +
      '  <section class="vw is-a" role="dialog" aria-modal="true" aria-label="Canvas: Onboarding">' +
      '    <div class="vw-bar is-a" id="vwbar"></div>' +
      '    <div class="vw-stage"><div class="canvas-surface"></div></div>' +
      ['nw', 'ne', 'sw', 'se'].map(corner => `<span class="vw-grip" data-corner="${corner}" title="Drag to resize" aria-hidden="true"></span>`).join('') +
      '  </section>' +
      '</div>' +
      '<div class="demobar" role="group" aria-label="Prototype controls"></div>';

    const desk = root.querySelector('.desk');
    const app = root.querySelector('.app');
    const scrim = root.querySelector('.scrim');
    const vw = root.querySelector('.vw');
    const bar = root.querySelector('#vwbar');
    const stage = root.querySelector('.vw-stage');
    const canvasEl = root.querySelector('.canvas-surface');
    const demobar = root.querySelector('.demobar');

    const api = {
      root, state: st, stage, canvasEl,
      armed: false,
      toast: (m) => window.Kit && window.Kit.toast(m),
      render,
      setSize,
      setSource,
      barFbSlot: null,
    };

    function setSize(size) {
      st.size = size;
      if (size === 'float' && !floatRect) {
        const w = Math.min(560, desk.clientWidth - 32), h = Math.min(380, desk.clientHeight - 32);
        floatRect = { w, h, left: desk.clientWidth - w - 16, top: desk.clientHeight - h - 16 };
      }
      render();
    }
    function setSource(src) {
      st.source = src;
      // A view-only canvas can't hold feedback; clear the armed tool and any in-progress pick note UI owner decides.
      if (SOURCES[src].viewOnly) api.armed = false;
      // Page source has no option geometry: re-home option-relative pins onto the current variant as page-level.
      render();
    }

    function toolbar() {
      const src = SOURCES[st.source];
      const sizes = `<div class="segmented vw-sizes" role="group" aria-label="Canvas size">` +
        ['full', 'pane', 'float'].map((v) =>
          `<button type="button" class="seg${v === st.size ? ' is-on' : ''}" data-size="${v}" aria-pressed="${v === st.size}" aria-label="${SIZE_LABEL[v]}" title="${SIZE_LABEL[v]}">${svg(SIZE_ICON[v])}</button>`).join('') +
        `</div>`;
      const title = `<span class="vw-title">${icon('beaker')}<span class="vw-title-t">${esc(data.title)}</span></span>`;
      const github = st.size === 'float' ? '' : `<a class="iconbtn" data-to="${esc(data.github)}" href="#" aria-label="Open the branch on GitHub">${icon('external')}</a>`;
      const close = `<button type="button" class="${st.size === 'full' ? 'ghost' : 'iconbtn'}" data-close aria-label="Close the canvas">${icon('close')}${st.size === 'full' ? '<span>Close</span><kbd>Esc</kbd>' : ''}</button>`;
      const opts = `<div class="segmented vw-options" role="group" aria-label="Show the board, or open one option full size">` +
        `<button type="button" class="seg${st.presenting === null ? ' is-on' : ''}" data-go="" aria-pressed="${st.presenting === null}">Board</button>` +
        data.options.map((o) => `<button type="button" class="seg${st.presenting === o.id ? ' is-on' : ''}" data-go="${esc(o.id)}" aria-pressed="${st.presenting === o.id}" title="${esc(o.name)}">${esc(o.id)}</button>`).join('') +
        `</div>`;
      const optname = st.presenting ? `<span class="vw-optname">${esc(optionName(st.presenting))}</span>` : '';
      const controls = `<span class="vw-page">${esc(data.page.title)}</span>${opts}${optname}`;
      const fbSlot = `<span class="vw-fb-slot" data-fb-slot></span>`;
      if (st.size === 'full')
        return `<div class="vw-c-row" style="display:flex;gap:8px;align-items:center;width:100%">${close}${title}<span class="vw-sep"></span>${controls}${fbSlot}<span class="spacer"></span>${github}${sizes}</div>`;
      return `<div class="vw-c-row vw-drag">${title}<span class="spacer"></span>${github}${sizes}${close}</div><div class="vw-c-row">${controls}${fbSlot}</div>`;
    }

    function optionCard(o, big) {
      return `<div class="optioncard" data-variant="${esc(o.variant)}">` +
        `<h3>${icon('beaker')} ${esc(o.name)} <code>${esc(o.id)}</code></h3>` +
        `<div class="mock" data-option="${esc(o.id)}">` +
        `<div class="hero"></div><div class="mline m"></div><div class="mline s"></div>` +
        `<div class="mline m"></div><div class="mbtn" data-to="Get started">Get started</div>` +
        `</div></div>`;
    }

    function placePins() {
      const src = SOURCES[st.source];
      // option-relative pins: inside their option's mock (when that mock is on screen).
      canvasEl.querySelectorAll('.mock').forEach((mock) => {
        const opt = mock.dataset.option;
        st.pins.filter((p) => src.optionRelative && p.option === opt).forEach((p) => mock.appendChild(pinEl(p)));
      });
      // page-level pins: over the whole board.
      if (!src.optionRelative) {
        const layer = document.createElement('div');
        layer.className = 'pagepins';
        layer.style.cssText = 'position:absolute;inset:0;pointer-events:none';
        st.pins.forEach((p) => layer.appendChild(pinEl(p, true)));
        canvasEl.querySelector('.board').appendChild(layer);
      }
    }
    function pinEl(p, pageLevel) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pin' + (st.activePin === p.n ? ' is-active' : '');
      b.style.left = (p.fx * 100) + '%';
      b.style.top = (p.fy * 100) + '%';
      if (pageLevel) b.style.pointerEvents = 'auto';
      b.setAttribute('data-pin', p.n);
      b.setAttribute('aria-label', `Pin ${p.n}: ${p.note || 'no note'}`);
      b.innerHTML = WF.pinMarker(p.n);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        opts.onPinClick && opts.onPinClick(p.n);
      });
      return b;
    }

    function render() {
      const src = SOURCES[st.source];
      // viewer size
      vw.className = 'vw is-' + (st.size === 'full' ? 'a' : st.size === 'pane' ? 'c' : 'f');
      vw.classList.toggle('arming', !!api.armed);
      app.classList.toggle('is-inert', st.size === 'full');
      scrim.hidden = st.size !== 'full';
      vw.style.cssText = '';
      if (st.size === 'float' && floatRect)
        vw.style.cssText = `left:${floatRect.left}px;top:${floatRect.top}px;width:${floatRect.w}px;height:${floatRect.h}px`;

      // toolbar
      bar.className = 'vw-bar ' + (st.size === 'full' ? 'is-a' : 'is-c');
      bar.innerHTML = toolbar();
      api.barFbSlot = bar.querySelector('[data-fb-slot]');

      // canvas
      const presenting = st.presenting;
      const cards = presenting ? [data.options.find((o) => o.id === presenting)] : data.options;
      canvasEl.innerHTML = `<div class="board${presenting ? ' present' : ''}">${cards.map((o) => optionCard(o, !!presenting)).join('')}</div>`;
      if (src.banner)
        canvasEl.insertAdjacentHTML('beforeend', `<div class="cbanner"><span class="dot"></span>${esc(src.banner)}</div>`);
      placePins();

      // direction-specific feedback UI
      opts.decorate && opts.decorate(api);
    }

    // clicking the canvas to drop a pin
    canvasEl.addEventListener('click', (e) => {
      if (e.button !== 0 || e.target.closest('.pin') || e.target.closest('[data-to]')) return;
      const src = SOURCES[st.source];
      if (!src.canPin) return;
      const mock = e.target.closest('.mock');
      let hit;
      if (src.optionRelative) {
        if (!mock) return; // an option-relative pin must land on an option
        const r = mock.getBoundingClientRect();
        hit = { option: mock.dataset.option, fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height, pageLevel: false };
      } else {
        const board = canvasEl.querySelector('.board');
        const r = board.getBoundingClientRect();
        hit = { option: presentingOption(), fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height, pageLevel: true };
      }
      hit.fx = Math.max(0, Math.min(1, hit.fx));
      hit.fy = Math.max(0, Math.min(1, hit.fy));
      opts.onCanvasPoint && opts.onCanvasPoint(hit, e);
    });
    const presentingOption = () => st.presenting || data.options[0].id;

    // toolbar clicks (size / close / option / page)
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('button, a');
      if (!btn) return;
      if (btn.dataset.size) { setSize(btn.dataset.size); syncDemo(); return; }
      if (btn.hasAttribute('data-close')) { api.toast('Would close the canvas and return to the map'); return; }
      if (btn.hasAttribute('data-go')) { st.presenting = btn.dataset.go || null; st.activePin = null; render(); return; }
    });

    // Float drag and the approved four-corner resize.
    let drag = null;
    vw.addEventListener('pointerdown', (e) => {
      if (st.size !== 'float' || e.button !== 0) return;
      const onDrag = e.target.closest('.vw-drag') && !e.target.closest('button, a');
      const onGrip = e.target.closest('[data-corner]');
      if (!onDrag && !onGrip) return;
      e.preventDefault();
      vw.setPointerCapture(e.pointerId);
      drag = { mode: onGrip ? 'size' : 'move', corner: onGrip?.dataset.corner, x: e.clientX, y: e.clientY, start: { ...floatRect }, id: e.pointerId };
    });
    vw.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (drag.mode === 'move') {
        floatRect.left = Math.max(0, Math.min(desk.clientWidth - floatRect.w, drag.start.left + dx));
        floatRect.top = Math.max(0, Math.min(desk.clientHeight - floatRect.h, drag.start.top + dy));
      } else {
        const start = drag.start;
        const right = start.left + start.w, bottom = start.top + start.h;
        const west = drag.corner.includes('w'), north = drag.corner.includes('n');
        const minW = Math.min(360, desk.clientWidth), minH = Math.min(240, desk.clientHeight);
        floatRect.left = west ? Math.max(0, Math.min(right - minW, start.left + dx)) : start.left;
        floatRect.top = north ? Math.max(0, Math.min(bottom - minH, start.top + dy)) : start.top;
        floatRect.w = west ? right - floatRect.left : Math.max(minW, Math.min(desk.clientWidth - start.left, start.w + dx));
        floatRect.h = north ? bottom - floatRect.top : Math.max(minH, Math.min(desk.clientHeight - start.top, start.h + dy));
      }
      vw.style.cssText = `left:${floatRect.left}px;top:${floatRect.top}px;width:${floatRect.w}px;height:${floatRect.h}px`;
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => vw.addEventListener(t, () => (drag = null)));

    // demo bar (prototype only)
    demobar.innerHTML =
      `<span class="eyebrow">Prototype controls</span>` +
      `<span><label for="d-size">Shell</label><select id="d-size"><option value="full">Full</option><option value="pane">Pane</option><option value="float">Float</option></select></span>` +
      `<span><label for="d-src">Canvas source</label><select id="d-src">${Object.entries(SOURCES).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select></span>` +
      `<span><label for="d-theme">Theme</label><select id="d-theme"><option value="light">Light</option><option value="dark">Dark</option></select></span>` +
      `<button type="button" class="ghost" id="d-reset">Reset</button>` +
      `<span id="d-note" style="color:var(--text-muted)"></span>`;
    const dSize = demobar.querySelector('#d-size'), dSrc = demobar.querySelector('#d-src'), dTheme = demobar.querySelector('#d-theme'), dNote = demobar.querySelector('#d-note');
    function syncDemo() {
      dSize.value = st.size;
      dSrc.value = st.source;
      dNote.textContent = SOURCES[st.source].note;
    }
    dSize.addEventListener('change', () => setSize(dSize.value));
    dSrc.addEventListener('change', () => { setSource(dSrc.value); syncDemo(); });
    dTheme.addEventListener('change', () => { document.documentElement.dataset.theme = dTheme.value; });
    demobar.querySelector('#d-reset').addEventListener('click', () => opts.onReset && opts.onReset());
    dTheme.value = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

    api.syncDemo = syncDemo;
    render();
    syncDemo();
    return api;
  }

  return { mount };
})();
