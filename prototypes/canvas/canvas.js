/*
  The board: frames for each variant in window.CANVAS, a sticky note under each, and a
  full-size present mode. Classic script on purpose: Wayfinder serves prototypes at an
  opaque origin, where module scripts and fetch() fail CORS and localStorage throws.
*/
(() => {
  const cfg = window.CANVAS;
  const FRAME_WIDTH = 600;
  const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2];
  const $ = (id) => document.getElementById(id);

  const esc = (text) =>
    String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const state = {
    theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    zoom: 1,
    notes: true,
  };

  const srcFor = (variant) => `${variant.src}${variant.src.includes('?') ? '&' : '?'}theme=${state.theme}`;

  function noteHtml(variant) {
    const { idea = '', pros = [], cons = [] } = variant.note ?? {};
    return `<p class="kicker">${esc(variant.id)} · ${esc(variant.name)}</p>
      <p>${esc(idea)}</p>
      ${pros.length + cons.length > 0 ? `<ul>${pros.map((p) => `<li class="pro">${esc(p)}</li>`).join('')}${cons
        .map((c) => `<li class="con">${esc(c)}</li>`)
        .join('')}</ul>` : ''}`;
  }

  /* ---------- board ---------- */

  function renderBoard() {
    document.title = `${cfg.title} · Prototype canvas`;
    $('title').textContent = cfg.title;
    $('count').textContent = `${cfg.ticket ? `#${cfg.ticket} · ` : ''}${cfg.variants.length} variant${cfg.variants.length === 1 ? '' : 's'}`;
    $('banner').innerHTML = `<p class="kicker">Deciding</p><p>${esc(cfg.question)}</p>${
      cfg.sampleState ? `<p class="sample"><b>Sample state:</b> ${esc(cfg.sampleState)}</p>` : ''
    }`;

    const { width, height } = cfg.frame;
    const scale = FRAME_WIDTH / width;
    $('frames').innerHTML = cfg.variants
      .map(
        (v) => `<figure class="frame" style="width:${FRAME_WIDTH}px">
          <figcaption class="frame-head">
            <span class="tag">${esc(v.id)}</span><span>·</span><span>${esc(v.name)}</span>
            <span class="spacer"></span>
            <button type="button" class="icon-btn" data-play="${esc(v.id)}" aria-label="Present ${esc(v.id)}" title="Present">▶</button>
            <a data-tab="${esc(v.id)}" href="${esc(srcFor(v))}" target="_blank" rel="noreferrer" aria-label="Open ${esc(v.id)} in a new tab" title="Open in a new tab">↗</a>
          </figcaption>
          <div class="viewport" style="width:${FRAME_WIDTH}px;height:${Math.round(height * scale)}px">
            <iframe data-frame="${esc(v.id)}" src="${esc(srcFor(v))}" style="width:${width}px;height:${height}px;transform:scale(${scale})" tabindex="-1" loading="lazy" title="${esc(v.id)} · ${esc(v.name)}"></iframe>
            <button type="button" class="hit" data-play="${esc(v.id)}" aria-label="Present ${esc(v.id)}, ${esc(v.name)}"></button>
          </div>
          <aside class="note">${noteHtml(v)}</aside>
        </figure>`,
      )
      .join('');
    renderTheme();
  }

  function renderTheme() {
    const label = state.theme === 'dark' ? '☾ Dark' : '☀ Light';
    $('theme').textContent = label;
    $('present-theme').textContent = label;
    for (const v of cfg.variants) {
      const src = srcFor(v);
      const frame = document.querySelector(`[data-frame="${v.id}"]`);
      if (frame && frame.getAttribute('src') !== src) frame.setAttribute('src', src);
      const tab = document.querySelector(`[data-tab="${v.id}"]`);
      if (tab) tab.setAttribute('href', src);
    }
    const current = presenting();
    if (current) showVariant(current);
  }

  function setZoom(zoom) {
    state.zoom = Math.min(2, Math.max(0.2, zoom));
    $('stage').style.zoom = String(state.zoom);
    $('zoom-fit').textContent = `${Math.round(state.zoom * 100)}%`;
  }

  function stepZoom(direction) {
    const next = direction > 0 ? ZOOMS.find((z) => z > state.zoom + 0.001) : [...ZOOMS].reverse().find((z) => z < state.zoom - 0.001);
    setZoom(next ?? state.zoom);
  }

  function fit() {
    setZoom(1);
    const stage = $('stage');
    const board = $('board');
    setZoom(Math.min(1, board.clientWidth / stage.scrollWidth, board.clientHeight / stage.scrollHeight));
    board.scrollTo(0, 0);
  }

  // Drag the empty board to pan, as on a design canvas.
  function enablePan() {
    const board = $('board');
    let start = null;
    board.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('.frame, .note, button, a')) return;
      start = { x: event.clientX, y: event.clientY, left: board.scrollLeft, top: board.scrollTop };
      board.setPointerCapture(event.pointerId);
      board.classList.add('is-panning');
    });
    board.addEventListener('pointermove', (event) => {
      if (!start) return;
      board.scrollLeft = start.left - (event.clientX - start.x);
      board.scrollTop = start.top - (event.clientY - start.y);
    });
    const stop = () => {
      start = null;
      board.classList.remove('is-panning');
    };
    board.addEventListener('pointerup', stop);
    board.addEventListener('pointercancel', stop);
    board.addEventListener(
      'wheel',
      (event) => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        stepZoom(event.deltaY < 0 ? 1 : -1);
      },
      { passive: false },
    );
  }

  /* ---------- present ---------- */

  function presenting() {
    const id = decodeURIComponent(location.hash.slice(1));
    return cfg.variants.find((v) => v.id === id) ?? null;
  }

  function showVariant(variant) {
    const frame = $('present-frame');
    const src = srcFor(variant);
    if (frame.getAttribute('src') !== src) frame.setAttribute('src', src);
    frame.title = `${variant.id} · ${variant.name}`;
    $('new-tab').href = src;
    $('side-note').innerHTML = noteHtml(variant);
    $('side-note').hidden = !state.notes;
    $('notes').setAttribute('aria-pressed', String(state.notes));
    $('tabs').innerHTML = cfg.variants
      .map(
        (v) =>
          `<button type="button" data-go="${esc(v.id)}" aria-current="${v.id === variant.id}"><b>${esc(v.id)}</b>${esc(v.name)}</button>`,
      )
      .join('');
  }

  function route() {
    const variant = presenting();
    $('present-view').hidden = variant === null;
    if (variant) showVariant(variant);
    else $('present-frame').removeAttribute('src');
  }

  const go = (id) => {
    location.hash = id ? encodeURIComponent(id) : '';
  };

  function stepVariant(direction) {
    const current = presenting();
    if (!current) return;
    const index = cfg.variants.indexOf(current);
    const next = cfg.variants[(index + direction + cfg.variants.length) % cfg.variants.length];
    go(next.id);
  }

  /* ---------- wiring ---------- */

  document.addEventListener('click', (event) => {
    const play = event.target.closest('[data-play]');
    if (play) return go(play.dataset.play);
    const tab = event.target.closest('[data-go]');
    if (tab) return go(tab.dataset.go);
  });
  $('present').addEventListener('click', () => go(cfg.variants[0]?.id));
  $('back').addEventListener('click', () => go(''));
  $('zoom-in').addEventListener('click', () => stepZoom(1));
  $('zoom-out').addEventListener('click', () => stepZoom(-1));
  $('zoom-fit').addEventListener('click', fit);
  const toggleTheme = () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    renderTheme();
  };
  $('theme').addEventListener('click', toggleTheme);
  $('present-theme').addEventListener('click', toggleTheme);
  const toggleNotes = () => {
    state.notes = !state.notes;
    const current = presenting();
    if (current) showVariant(current);
  };
  $('notes').addEventListener('click', toggleNotes);

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest('input, textarea, select')) return;
    const inPresent = presenting() !== null;
    const byNumber = cfg.variants[Number(event.key) - 1];
    if (event.key === 'Escape' && inPresent) go('');
    else if (event.key === 'ArrowRight' && inPresent) stepVariant(1);
    else if (event.key === 'ArrowLeft' && inPresent) stepVariant(-1);
    else if (byNumber && /^[1-9]$/.test(event.key)) go(byNumber.id);
    else if (event.key === 't' || event.key === 'T') toggleTheme();
    else if ((event.key === 'n' || event.key === 'N') && inPresent) toggleNotes();
    else if ((event.key === '+' || event.key === '=') && !inPresent) stepZoom(1);
    else if (event.key === '-' && !inPresent) stepZoom(-1);
    else if (event.key === '0' && !inPresent) fit();
    else return;
    event.preventDefault();
  });
  addEventListener('hashchange', route);

  renderBoard();
  enablePan();
  route();
  requestAnimationFrame(fit);
})();
