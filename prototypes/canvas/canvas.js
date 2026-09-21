/*
  The board. Reads window.CANVAS (config.js) and lays out its sections of items: full pages,
  layered compositions, component sheets, palettes, type specimens, images and notes. Any
  item can wear a named style, so the same thing can be compared under different looks.

  Classic script on purpose: Wayfinder serves prototypes at an opaque origin, where module
  scripts and fetch() fail CORS and localStorage throws. See README.md for the config format.
*/
(() => {
  const cfg = window.CANVAS;
  const BOARD_WIDTH = 600;
  const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2];
  /** The app's real stylesheet, relative to index.html, so items look like Wayfinder by default. */
  const APP_CSS = '../../src/ui/styles.css';
  const KIND_LABEL = {
    page: 'Page',
    compose: 'Composition',
    components: 'Components',
    swatches: 'Palette',
    type: 'Type',
    image: 'Image',
    note: 'Note',
  };
  const DEFAULT_WIDTH = { page: 1440, compose: 1200, components: 960, swatches: 720, type: 960, image: 1200 };

  const $ = (id) => document.getElementById(id);
  const esc = (text) =>
    String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const state = {
    theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    zoom: 1,
    notes: true,
  };

  /* ---------- model ---------- */

  const styles = cfg.styles ?? {};
  let autoId = 0;

  /** Fills in kind and id, and expands `styles: [...]` into one item per style. */
  function expand(item) {
    const kind = item.kind ?? (item.src ? 'page' : 'note');
    const id = item.id ?? `${kind}-${++autoId}`;
    if (!Array.isArray(item.styles)) return [{ ...item, kind, id }];
    return item.styles.map((key) => ({
      ...item,
      kind,
      id: `${id}-${key}`,
      style: key,
      styles: undefined,
      name: `${item.name ?? KIND_LABEL[kind]} · ${styles[key]?.label ?? key}`,
    }));
  }

  const sections = (cfg.sections ?? [{ items: cfg.variants ?? [] }]).map((section) => ({
    ...section,
    items: section.items.flatMap(expand),
  }));
  const items = sections.flatMap((s) => s.items);
  const presentable = items.filter((i) => i.kind !== 'note');
  const byId = new Map(items.map((i) => [i.id, i]));

  const naturalWidth = (item) => item.width ?? (item.kind === 'page' ? cfg.frame?.width : undefined) ?? DEFAULT_WIDTH[item.kind];
  const naturalHeight = (item) =>
    item.kind === 'page' ? item.height ?? cfg.frame?.height ?? 900 : item.kind === 'compose' ? item.height ?? 800 : null;

  /* ---------- styles ---------- */

  const decls = (vars) =>
    Object.entries(vars ?? {})
      .map(([key, value]) => `${key.startsWith('--') ? key : `--${key}`}:${value};`)
      .join('');

  /** A style is token overrides on .viz-root, the app's theme root; dark falls back to light. */
  function styleCss(style) {
    if (!style) return '';
    return `.viz-root{${decls(style.vars)}${style.font ? `font-family:${style.font};` : ''}}
      :root[data-theme='dark'] .viz-root{${decls({ ...style.vars, ...style.dark })}}
      ${style.css ?? ''}`;
  }

  function styleOf(item) {
    if (!item.style) return null;
    return styles[item.style] ?? { missing: item.style };
  }

  /* ---------- item documents ---------- */

  const DOC_CSS = `html{overflow:auto}body{margin:0;height:auto;overflow:visible}
    .cv-sheet{display:grid;gap:18px;padding:28px;background:var(--plane)}
    .cv-cell{min-width:0}
    .cv-label{margin:0 0 8px;font:600 11px/1.3 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted)}
    .cv-demo{padding:18px;background:var(--surface-1);border:1px solid var(--hairline);border-radius:10px}
    .cv-swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px;padding:28px;background:var(--plane)}
    .cv-chip{border:1px solid var(--hairline);border-radius:10px;overflow:hidden;background:var(--surface-1)}
    .cv-chip i{display:block;height:84px}
    .cv-chip p{margin:0;padding:8px 10px;font:12px/1.4 system-ui,sans-serif;color:var(--text-secondary)}
    .cv-chip b{display:block;color:var(--text-primary);font-weight:600}
    .cv-type{padding:28px;background:var(--surface-1);color:var(--text-primary)}
    .cv-row{display:grid;grid-template-columns:120px 1fr;gap:18px;align-items:baseline;padding:14px 0;border-bottom:1px solid var(--hairline)}
    .cv-row .cv-label{margin:0}
    .cv-art{position:relative;overflow:hidden}
    .cv-art>*{position:absolute;margin:0;box-sizing:border-box}
    .cv-error{padding:24px;font:14px system-ui,sans-serif;color:#a1331b;background:#fdecea}`;

  /** Tells the board how tall an auto-height item is. Only the frame's own window is trusted. */
  const RESIZE = `<script>(()=>{const root=document.getElementById('root');const post=()=>parent.postMessage({canvasHeight:Math.ceil(root.getBoundingClientRect().height)},'*');new ResizeObserver(post).observe(root);addEventListener('load',post);post();})()<\/script>`;

  function head(item, extraCss = '') {
    const style = styleOf(item);
    const base = (style?.base ?? item.base ?? 'app') === 'app' ? `<link rel="stylesheet" href="${APP_CSS}">` : '';
    const fonts = (style?.fonts ?? []).map((href) => `<link rel="stylesheet" href="${esc(href)}">`).join('');
    return `<!doctype html><html data-theme="${state.theme}"><head><meta charset="utf-8">${base}${fonts}<style>${DOC_CSS}${styleCss(style)}${extraCss}${item.css ?? ''}</style></head>`;
  }

  const px = (value) => (typeof value === 'number' ? `${value}px` : value);

  /** One layer of a composition: absolutely placed image, text, rect or HTML. */
  function layerHtml(layer) {
    const box = [
      ['left', layer.x ?? 0],
      ['top', layer.y ?? 0],
      ['width', layer.w],
      ['height', layer.h],
      ['z-index', layer.z],
      ['opacity', layer.opacity],
      ['border-radius', layer.radius],
      ['box-shadow', layer.shadow],
      ['mix-blend-mode', layer.blend],
      ['transform', layer.rotate === undefined ? undefined : `rotate(${layer.rotate}deg)`],
    ]
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}:${['z-index', 'opacity'].includes(key) ? value : px(value)}`)
      .join(';');
    const css = `${box};${layer.style ?? ''}`;
    const cls = layer.class ? ` class="${esc(layer.class)}"` : '';
    switch (layer.type) {
      case 'image':
        return `<img${cls} src="${esc(layer.src)}" alt="${esc(layer.alt)}" style="${css};object-fit:${layer.fit ?? 'cover'}">`;
      case 'text':
        return `<p${cls} style="${css};font-size:${px(layer.size ?? 16)};font-weight:${layer.weight ?? 400};color:${
          layer.color ?? 'var(--text-primary)'
        };font-family:${layer.font ?? 'inherit'};text-align:${layer.align ?? 'left'};line-height:${layer.lineHeight ?? 1.3};letter-spacing:${
          layer.letterSpacing ?? 'normal'
        }">${esc(layer.text)}</p>`;
      case 'rect':
        return `<div${cls} style="${css};background:${layer.fill ?? 'var(--surface-1)'};border:${layer.border ?? 'none'}"></div>`;
      case 'html':
        return `<div${cls} style="${css}">${layer.html ?? ''}</div>`;
      default:
        return `<p class="cv-error" style="${css}">Unknown layer type: ${esc(layer.type)}</p>`;
    }
  }

  function luminance(color) {
    const match = /^#?([0-9a-f]{6})$/i.exec(String(color).trim());
    if (!match) return null;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(match[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function swatchList(item) {
    if (item.colors) return item.colors;
    const style = styleOf(item);
    const vars = state.theme === 'dark' ? { ...style?.vars, ...style?.dark } : style?.vars;
    return Object.entries(vars ?? {})
      .filter(([, value]) => /^#|^rgb|^hsl|^oklch/i.test(String(value)))
      .map(([name, value]) => ({ name, value }));
  }

  const DEFAULT_TYPE = [
    { label: 'Display', size: 32, weight: 650 },
    { label: 'Heading', size: 25, weight: 650 },
    { label: 'Title', size: 16, weight: 600 },
    { label: 'Body', size: 14, weight: 400 },
    { label: 'Small', size: 12, weight: 500 },
  ];

  /** The HTML for everything but a page. `present` lays it out for the full-size view. */
  function srcdoc(item, present) {
    const style = styleOf(item);
    if (style?.missing) return `${head({})}<body><main id="root" class="cv-error">No style named "${esc(style.missing)}" in config.js.</main>${RESIZE}</body></html>`;
    const width = naturalWidth(item);
    // On the board a frame is a thumbnail, so no scrollbars; presented, it scrolls.
    const center = present
      ? `#root{margin:40px auto}body{background:#e9e8e4}:root[data-theme='dark'] body{background:#121211}`
      : 'html{overflow:hidden}';
    switch (item.kind) {
      case 'compose':
        return `${head(item, center)}<body class="viz-root"><main id="root" class="cv-art" style="width:${width}px;height:${naturalHeight(item)}px;background:${
          item.background ?? 'var(--plane)'
        }">${(item.layers ?? []).map(layerHtml).join('')}</main>${RESIZE}</body></html>`;
      case 'components':
        return `${head(item, `${center}#root{max-width:${width}px}`)}<body class="viz-root"><main id="root" class="cv-sheet" style="grid-template-columns:repeat(${
          item.columns ?? 2
        },minmax(0,1fr))">${(item.items ?? [])
          .map(
            (c) => `<section class="cv-cell" style="grid-column:span ${c.span ?? 1}">${
              c.label ? `<p class="cv-label">${esc(c.label)}</p>` : ''
            }<div class="cv-demo"${c.bare ? ' style="padding:0;border:0;background:none"' : ''}>${c.html ?? ''}</div></section>`,
          )
          .join('')}</main>${RESIZE}</body></html>`;
      case 'swatches':
        return `${head(item, `${center}#root{max-width:${width}px}`)}<body class="viz-root"><main id="root" class="cv-swatches">${swatchList(item)
          .map((c) => {
            const lum = luminance(c.value);
            return `<div class="cv-chip"><i style="background:${esc(c.value)}"></i><p><b>${esc(c.name)}</b>${esc(c.value)}${
              lum === null ? '' : ` · ${lum > 0.4 ? 'dark text' : 'light text'}`
            }</p></div>`;
          })
          .join('')}</main>${RESIZE}</body></html>`;
      case 'type': {
        const font = item.font ?? style?.font ?? 'inherit';
        return `${head(item, `${center}#root{max-width:${width}px}`)}<body class="viz-root"><main id="root" class="cv-type">${(item.samples ?? DEFAULT_TYPE)
          .map(
            (s) => `<div class="cv-row"><p class="cv-label">${esc(s.label)}<br>${esc(s.size)}px · ${esc(s.weight ?? 400)}</p><p style="margin:0;font-family:${
              s.font ?? font
            };font-size:${s.size}px;font-weight:${s.weight ?? 400};line-height:${s.lineHeight ?? 1.3};letter-spacing:${s.letterSpacing ?? 'normal'}">${esc(
              s.text ?? item.text ?? 'Where do you want to go?',
            )}</p></div>`,
          )
          .join('')}</main>${RESIZE}</body></html>`;
      }
      case 'image':
        return `${head(item, `${center}#root{max-width:${width}px}`)}<body class="viz-root"><main id="root"><img src="${esc(item.src)}" alt="${esc(
          item.alt ?? item.name,
        )}" style="display:block;width:100%"></main>${RESIZE}</body></html>`;
      default:
        return `${head(item)}<body><main id="root" class="cv-error">Unknown kind: ${esc(item.kind)}</main>${RESIZE}</body></html>`;
    }
  }

  /** A page's URL, carrying the theme and (when set) its style for kit.js to apply. */
  function pageSrc(item) {
    const params = new URLSearchParams({ theme: state.theme });
    const style = styleOf(item);
    if (style && !style.missing) params.set('style', JSON.stringify(style));
    return `${item.src}${item.src.includes('?') ? '&' : '?'}${params}`;
  }

  function loadFrame(frame, item, present) {
    if (item.kind === 'page') {
      frame.removeAttribute('srcdoc');
      const src = pageSrc(item);
      if (frame.getAttribute('src') !== src) frame.setAttribute('src', src);
    } else {
      frame.removeAttribute('src');
      frame.srcdoc = srcdoc(item, present);
    }
  }

  /* ---------- board ---------- */

  function noteHtml(item) {
    const note = typeof item.note === 'string' ? { idea: item.note } : item.note ?? {};
    const { idea = item.text ?? '', pros = [], cons = [] } = note;
    const kicker = item.kind === 'note' ? item.name ?? 'Note' : `${item.id} · ${item.name ?? KIND_LABEL[item.kind]}`;
    return `<p class="kicker">${esc(kicker)}</p>
      ${idea ? `<p>${esc(idea)}</p>` : ''}
      ${
        pros.length + cons.length > 0
          ? `<ul>${pros.map((p) => `<li class="pro">${esc(p)}</li>`).join('')}${cons.map((c) => `<li class="con">${esc(c)}</li>`).join('')}</ul>`
          : ''
      }`;
  }

  function itemHtml(item) {
    if (item.kind === 'note') return `<aside class="note free-note" style="width:${item.boardWidth ?? 280}px">${noteHtml(item)}</aside>`;
    const width = naturalWidth(item);
    const height = naturalHeight(item);
    const boardWidth = item.boardWidth ?? Math.min(width, BOARD_WIDTH);
    const scale = boardWidth / width;
    const label = esc(`${item.id} · ${item.name ?? KIND_LABEL[item.kind]}`);
    const hasNote = item.note !== undefined;
    return `<figure class="frame" style="width:${boardWidth}px" data-item="${esc(item.id)}">
      <figcaption class="frame-head">
        <span class="tag">${esc(item.id)}</span><span>·</span><span class="name">${esc(item.name ?? KIND_LABEL[item.kind])}</span>
        <span class="kind">${esc(KIND_LABEL[item.kind] ?? item.kind)}${item.style ? ` · ${esc(styles[item.style]?.label ?? item.style)}` : ''}</span>
        <span class="spacer"></span>
        <button type="button" class="icon-btn" data-play="${esc(item.id)}" aria-label="Present ${label}" title="Present">▶</button>
        ${
          item.kind === 'page'
            ? `<a data-tab="${esc(item.id)}" target="_blank" rel="noreferrer" aria-label="Open ${label} in a new tab" title="Open in a new tab">↗</a>`
            : ''
        }
      </figcaption>
      <div class="viewport" style="width:${boardWidth}px;height:${height === null ? 120 : Math.round(height * scale)}px">
        <iframe data-frame="${esc(item.id)}" style="width:${width}px;height:${height ?? 150}px;transform:scale(${scale})" data-scale="${scale}" tabindex="-1" title="${label}"></iframe>
        <button type="button" class="hit" data-play="${esc(item.id)}" aria-label="Present ${label}"></button>
      </div>
      ${hasNote ? `<aside class="note">${noteHtml(item)}</aside>` : ''}
    </figure>`;
  }

  function renderBoard() {
    document.title = `${cfg.title} · Prototype canvas`;
    $('title').textContent = cfg.title;
    $('count').textContent = `${cfg.ticket ? `#${cfg.ticket} · ` : ''}${presentable.length} item${presentable.length === 1 ? '' : 's'}`;
    $('banner').innerHTML = `<p class="kicker">Deciding</p><p>${esc(cfg.question)}</p>${
      cfg.sampleState ? `<p class="sample"><b>Sample state:</b> ${esc(cfg.sampleState)}</p>` : ''
    }`;
    $('sections').innerHTML = sections
      .map(
        (section) => `<section class="section">
          ${section.title ? `<h2 class="section-title">${esc(section.title)}</h2>` : ''}
          ${section.note ? `<p class="section-note">${esc(section.note)}</p>` : ''}
          <div class="frames">${section.items.map(itemHtml).join('')}</div>
        </section>`,
      )
      .join('');
    loadBoardFrames();
  }

  function loadBoardFrames() {
    for (const item of presentable) {
      const frame = document.querySelector(`[data-frame="${CSS.escape(item.id)}"]`);
      if (frame) loadFrame(frame, item, false);
      const tab = document.querySelector(`[data-tab="${CSS.escape(item.id)}"]`);
      if (tab) tab.setAttribute('href', pageSrc(item));
    }
  }

  // Auto-height items report their size; match the message to the frame that sent it.
  addEventListener('message', (event) => {
    const height = event.data?.canvasHeight;
    if (typeof height !== 'number') return;
    for (const frame of document.querySelectorAll('[data-frame]')) {
      if (frame.contentWindow !== event.source) continue;
      const item = byId.get(frame.dataset.frame);
      if (!item || naturalHeight(item) !== null) return;
      const scale = Number(frame.dataset.scale);
      frame.style.height = `${height}px`;
      frame.parentElement.style.height = `${Math.round(height * scale)}px`;
      return;
    }
  });

  function renderTheme() {
    const label = state.theme === 'dark' ? '☾ Dark' : '☀ Light';
    $('theme').textContent = label;
    $('present-theme').textContent = label;
    loadBoardFrames();
    const current = presenting();
    if (current) showItem(current, true);
  }

  function setZoom(zoom) {
    state.zoom = Math.min(2, Math.max(0.1, zoom));
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
    setZoom(Math.min(1, board.clientWidth / stage.scrollWidth));
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
    const item = byId.get(decodeURIComponent(location.hash.slice(1)));
    return item && item.kind !== 'note' ? item : null;
  }

  function showItem(item, reload) {
    const frame = $('present-frame');
    if (reload || frame.dataset.item !== item.id) loadFrame(frame, item, true);
    frame.dataset.item = item.id;
    frame.title = `${item.id} · ${item.name ?? KIND_LABEL[item.kind]}`;
    $('new-tab').hidden = item.kind !== 'page';
    if (item.kind === 'page') $('new-tab').href = pageSrc(item);
    $('side-note').innerHTML = noteHtml(item);
    $('side-note').hidden = !state.notes || item.note === undefined;
    $('notes').setAttribute('aria-pressed', String(state.notes));
    $('tabs').innerHTML = presentable
      .map(
        (i) =>
          `<button type="button" data-go="${esc(i.id)}" aria-current="${i.id === item.id}"><b>${esc(i.id)}</b>${esc(i.name ?? KIND_LABEL[i.kind])}</button>`,
      )
      .join('');
    $('tabs').querySelector('[aria-current="true"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }

  function route() {
    const item = presenting();
    $('present-view').hidden = item === null;
    if (item) showItem(item, false);
    else {
      const frame = $('present-frame');
      frame.removeAttribute('src');
      frame.removeAttribute('srcdoc');
      delete frame.dataset.item;
    }
  }

  const go = (id) => {
    location.hash = id ? encodeURIComponent(id) : '';
  };

  function step(direction) {
    const current = presenting();
    if (!current) return;
    const index = presentable.indexOf(current);
    go(presentable[(index + direction + presentable.length) % presentable.length].id);
  }

  /* ---------- wiring ---------- */

  document.addEventListener('click', (event) => {
    const play = event.target.closest('[data-play]');
    if (play) return go(play.dataset.play);
    const tab = event.target.closest('[data-go]');
    if (tab) return go(tab.dataset.go);
  });
  $('present').addEventListener('click', () => go(presentable[0]?.id));
  $('back').addEventListener('click', () => go(''));
  $('zoom-in').addEventListener('click', () => stepZoom(1));
  $('zoom-out').addEventListener('click', () => stepZoom(-1));
  $('zoom-fit').addEventListener('click', fit);
  $('help').addEventListener('click', () => $('help-dialog').showModal());
  const toggleTheme = () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    renderTheme();
  };
  $('theme').addEventListener('click', toggleTheme);
  $('present-theme').addEventListener('click', toggleTheme);
  const toggleNotes = () => {
    state.notes = !state.notes;
    const current = presenting();
    if (current) showItem(current, false);
  };
  $('notes').addEventListener('click', toggleNotes);

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest('input, textarea, select') || $('help-dialog').open) return;
    const inPresent = presenting() !== null;
    const byNumber = presentable[Number(event.key) - 1];
    if (event.key === 'Escape' && inPresent) go('');
    else if (event.key === 'ArrowRight' && inPresent) step(1);
    else if (event.key === 'ArrowLeft' && inPresent) step(-1);
    else if (byNumber && /^[1-9]$/.test(event.key)) go(byNumber.id);
    else if (event.key === 't' || event.key === 'T') toggleTheme();
    else if ((event.key === 'n' || event.key === 'N') && inPresent) toggleNotes();
    else if (event.key === '?') $('help-dialog').showModal();
    else if ((event.key === '+' || event.key === '=') && !inPresent) stepZoom(1);
    else if (event.key === '-' && !inPresent) stepZoom(-1);
    else if (event.key === '0' && !inPresent) fit();
    else return;
    event.preventDefault();
  });
  addEventListener('hashchange', route);

  renderBoard();
  renderTheme();
  enablePan();
  route();
  requestAnimationFrame(fit);
})();
