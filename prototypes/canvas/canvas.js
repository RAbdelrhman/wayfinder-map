/*
  Design canvas. Reads window.CANVAS (config.js): pages, each with sections of items (full
  pages, layered compositions, component sheets, palettes, type specimens, images, notes).
  Nothing here knows about any one project: a project brings its own stylesheets and tokens
  through `base`, and named `styles` restyle any item for side-by-side comparison.

  Classic script on purpose: it has to run at an opaque origin (sandboxed hosting), where
  module scripts and fetch() fail CORS and localStorage throws. See README.md.
*/
(() => {
  const cfg = window.CANVAS;
  const BOARD_WIDTH = 600;
  const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2];
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
  const esc = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const slug = (text) =>
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'page';
  const roundLabel = (page) => {
    if (page.round === undefined || page.round === null || page.round === '') return '';
    return typeof page.round === 'number' ? `Round ${page.round}` : String(page.round);
  };

  const state = {
    theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    zoom: 1,
    notes: true,
    page: null,
  };

  /* ---------- model ---------- */

  const base = cfg.base ?? {};
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

  // `pages`, or the one-page shorthands `sections` and `variants`.
  const pages = (cfg.pages ?? [{ title: cfg.title, sections: cfg.sections ?? [{ items: cfg.variants ?? [] }] }]).map((page, i) => {
    const sections = (page.sections ?? []).map((section) => ({ ...section, items: (section.items ?? []).flatMap(expand) }));
    const items = sections.flatMap((s) => s.items);
    return { ...page, id: page.id ?? slug(page.title ?? `page-${i + 1}`), sections, items, presentable: items.filter((it) => it.kind !== 'note') };
  });
  const itemIndex = new Map(pages.flatMap((page) => page.items.map((item) => [item.id, { item, page }])));

  const naturalWidth = (item) => item.width ?? (item.kind === 'page' ? cfg.frame?.width : undefined) ?? DEFAULT_WIDTH[item.kind];
  const naturalHeight = (item) =>
    item.kind === 'page' ? (item.height ?? cfg.frame?.height ?? 900) : item.kind === 'compose' ? (item.height ?? 800) : null;

  /* ---------- styles ---------- */

  const decls = (vars) =>
    Object.entries(vars ?? {})
      .map(([key, value]) => `${key.startsWith('--') ? key : `--${key}`}:${value};`)
      .join('');

  /**
   * A style overrides CSS variables at the document root and on the body (plus base.bodyClass,
   * where some projects scope their tokens), a step more specific than a project's own theme
   * rules so it wins in both light and dark. Dark falls back to the light values.
   */
  function styleCss(style, bodyClass = base.bodyClass) {
    if (!style) return '';
    const body = `body${bodyClass ? `.${bodyClass}` : ''}`;
    const font = style.font ? `font-family:${style.font};` : '';
    return `:root,:root ${body}{${decls(style.vars)}}:root ${body}{${font}}
      :root[data-theme='dark'],:root[data-theme='dark'] ${body}{${decls({ ...style.vars, ...style.dark })}}
      ${style.css ?? ''}`;
  }

  function styleOf(item) {
    if (!item.style) return null;
    return styles[item.style] ?? { missing: item.style };
  }

  /* ---------- item documents ---------- */

  // The canvas's own neutral surfaces for sheets it draws. A project maps them to its tokens with base.surfaces.
  const SURFACE_DEFAULTS = {
    light: { plane: '#f4f4f1', surface: '#ffffff', line: 'rgba(0,0,0,.1)', text: '#141413', muted: '#7a786f' },
    dark: { plane: '#111110', surface: '#1b1b1a', line: 'rgba(255,255,255,.1)', text: '#f3f2ee', muted: '#9a978f' },
  };
  const surfaceVars = (map) =>
    Object.entries(map)
      .map(([key, value]) => `--cv-${key}:${value};`)
      .join('');

  const DOC_CSS = `:root{${surfaceVars(SURFACE_DEFAULTS.light)}}:root[data-theme='dark']{${surfaceVars(SURFACE_DEFAULTS.dark)}}
    :where(html){color-scheme:light}:where(html[data-theme='dark']){color-scheme:dark}
    :where(body){margin:0;font:14px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--cv-text)}
    html{overflow:auto}body{margin:0;height:auto;overflow:visible}
    .cv-sheet{display:grid;gap:18px;padding:28px;background:var(--cv-plane)}
    .cv-cell{min-width:0}
    .cv-label{margin:0 0 8px;font:600 11px/1.3 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--cv-muted)}
    .cv-demo{padding:18px;background:var(--cv-surface);border:1px solid var(--cv-line);border-radius:10px}
    .cv-swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px;padding:28px;background:var(--cv-plane)}
    .cv-chip{border:1px solid var(--cv-line);border-radius:10px;overflow:hidden;background:var(--cv-surface)}
    .cv-chip i{display:block;height:84px}
    .cv-chip p{margin:0;padding:8px 10px;font:12px/1.4 system-ui,sans-serif;color:var(--cv-muted)}
    .cv-chip b{display:block;color:var(--cv-text);font-weight:600}
    .cv-type{padding:28px;background:var(--cv-surface);color:var(--cv-text)}
    .cv-row{display:grid;grid-template-columns:120px 1fr;gap:18px;align-items:baseline;padding:14px 0;border-bottom:1px solid var(--cv-line)}
    .cv-row .cv-label{margin:0}
    .cv-art{position:relative;overflow:hidden}
    .cv-art>*{position:absolute;margin:0;box-sizing:border-box}
    .cv-error{padding:24px;font:14px system-ui,sans-serif;color:#a1331b;background:#fdecea}`;

  /** Tells the board how tall an auto-height item is. Only the frame's own window is trusted. */
  const RESIZE = `<script>(()=>{const root=document.getElementById('root');const post=()=>parent.postMessage({canvasHeight:Math.ceil(root.getBoundingClientRect().height)},'*');new ResizeObserver(post).observe(root);addEventListener('load',post);post();})()<\/script>`;

  function head(item, extraCss = '') {
    const style = styleOf(item);
    const useBase = (style?.base ?? item.base) !== 'none';
    const sheets = [...(useBase ? (base.stylesheets ?? []) : []), ...(style?.stylesheets ?? []), ...(style?.fonts ?? [])];
    const links = sheets.map((href) => `<link rel="stylesheet" href="${esc(href)}">`).join('');
    const surfaces = useBase && base.surfaces ? `body{${surfaceVars(base.surfaces)}}` : '';
    return `<!doctype html><html data-theme="${state.theme}"><head><meta charset="utf-8">${links}<style>${DOC_CSS}${surfaces}${styleCss(style)}${extraCss}${
      item.css ?? ''
    }</style></head>`;
  }

  const bodyOpen = (item) => {
    const useBase = (styleOf(item)?.base ?? item.base) !== 'none';
    return useBase && base.bodyClass ? `<body class="${esc(base.bodyClass)}">` : '<body>';
  };

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
          layer.color ?? 'var(--cv-text)'
        };font-family:${layer.font ?? 'inherit'};text-align:${layer.align ?? 'left'};line-height:${layer.lineHeight ?? 1.3};letter-spacing:${
          layer.letterSpacing ?? 'normal'
        }">${esc(layer.text)}</p>`;
      case 'rect':
        return `<div${cls} style="${css};background:${layer.fill ?? 'var(--cv-surface)'};border:${layer.border ?? 'none'}"></div>`;
      case 'html':
        return `<div${cls} style="${css}">${layer.html ?? ''}</div>`;
      default:
        return `<p class="cv-error" style="${css}">Unknown layer type: ${esc(layer.type)}</p>`;
    }
  }

  function luminance(color) {
    const match = /^#?([0-9a-f]{6})$/i.exec(String(color).trim());
    if (!match) return null;
    const [r, g, b] = [0, 2, 4]
      .map((i) => parseInt(match[1].slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
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
    { label: 'Display', size: 40, weight: 700 },
    { label: 'Heading', size: 26, weight: 650 },
    { label: 'Title', size: 18, weight: 600 },
    { label: 'Body', size: 15, weight: 400 },
    { label: 'Small', size: 12, weight: 500 },
  ];

  /** The HTML for everything but a page. `present` lays it out for the full-size view. */
  function srcdoc(item, present) {
    const style = styleOf(item);
    if (style?.missing)
      return `${head({})}<body><main id="root" class="cv-error">No style named "${esc(style.missing)}" in config.js.</main>${RESIZE}</body></html>`;
    const width = naturalWidth(item);
    // On the board a frame is a thumbnail, so no scrollbars; presented, it scrolls.
    const frame = present ? `#root{margin:40px auto}html{background:var(--cv-plane)}` : 'html{overflow:hidden}';
    const open = bodyOpen(item);
    switch (item.kind) {
      case 'compose':
        return `${head(item, frame)}${open}<main id="root" class="cv-art" style="width:${width}px;height:${naturalHeight(item)}px;background:${
          item.background ?? 'var(--cv-plane)'
        }">${(item.layers ?? []).map(layerHtml).join('')}</main>${RESIZE}</body></html>`;
      case 'components':
        return `${head(item, `${frame}#root{max-width:${width}px}`)}${open}<main id="root" class="cv-sheet" style="grid-template-columns:repeat(${
          item.columns ?? 2
        },minmax(0,1fr))">${(item.items ?? [])
          .map(
            (c) =>
              `<section class="cv-cell" style="grid-column:span ${c.span ?? 1}">${c.label ? `<p class="cv-label">${esc(c.label)}</p>` : ''}<div class="cv-demo"${
                c.bare ? ' style="padding:0;border:0;background:none"' : ''
              }>${c.html ?? ''}</div></section>`,
          )
          .join('')}</main>${RESIZE}</body></html>`;
      case 'swatches':
        return `${head(item, `${frame}#root{max-width:${width}px}`)}${open}<main id="root" class="cv-swatches">${swatchList(item)
          .map((c) => {
            const lum = luminance(c.value);
            return `<div class="cv-chip"><i style="background:${esc(c.value)}"></i><p><b>${esc(c.name)}</b>${esc(c.value)}${
              lum === null ? '' : ` · ${lum > 0.4 ? 'dark text' : 'light text'}`
            }</p></div>`;
          })
          .join('')}</main>${RESIZE}</body></html>`;
      case 'type': {
        const font = item.font ?? style?.font ?? 'inherit';
        return `${head(item, `${frame}#root{max-width:${width}px}`)}${open}<main id="root" class="cv-type">${(item.samples ?? DEFAULT_TYPE)
          .map(
            (s) =>
              `<div class="cv-row"><p class="cv-label">${esc(s.label)}<br>${esc(s.size)}px · ${esc(s.weight ?? 400)}</p><p style="margin:0;font-family:${
                s.font ?? font
              };font-size:${s.size}px;font-weight:${s.weight ?? 400};line-height:${s.lineHeight ?? 1.3};letter-spacing:${s.letterSpacing ?? 'normal'}">${esc(
                s.text ?? item.text ?? 'Sphinx of black quartz, judge my vow',
              )}</p></div>`,
          )
          .join('')}</main>${RESIZE}</body></html>`;
      }
      case 'image':
        return `${head(item, `${frame}#root{max-width:${width}px}`)}${open}<main id="root"><img src="${esc(item.src)}" alt="${esc(
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
    if (style && !style.missing) params.set('style', JSON.stringify({ ...style, bodyClass: base.bodyClass }));
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
    const note = typeof item.note === 'string' ? { idea: item.note } : (item.note ?? {});
    const { idea = item.text ?? '', pros = [], cons = [], basedOn, disposition, feedback } = note;
    const kicker = item.kind === 'note' ? (item.name ?? 'Note') : `${item.id} · ${item.name ?? KIND_LABEL[item.kind]}`;
    const sources = Array.isArray(basedOn) ? basedOn : basedOn ? [basedOn] : [];
    const decision = new Map([
      ['keep', 'Keep'],
      ['change', 'Change'],
      ['combine', 'Combine'],
    ]).get(disposition) ?? disposition;
    return `<p class="kicker">${esc(kicker)}</p>
      ${idea ? `<p>${esc(idea)}</p>` : ''}
      ${
        pros.length + cons.length > 0
          ? `<ul>${pros.map((p) => `<li class="pro">${esc(p)}</li>`).join('')}${cons.map((c) => `<li class="con">${esc(c)}</li>`).join('')}</ul>`
          : ''
      }
      ${sources.length > 0 ? `<p class="lineage"><b>Remixed from:</b> ${sources.map(esc).join(' + ')}</p>` : ''}
      ${
        decision || feedback
          ? `<div class="review-feedback"><p class="kicker">Recorded feedback${decision ? ` · ${esc(decision)}` : ''}</p>${feedback ? `<p>${esc(feedback)}</p>` : ''}</div>`
          : ''
      }`;
  }

  function feedbackComposerHtml(item) {
    return `<section class="feedback-capture" aria-labelledby="feedback-title">
      <p class="kicker" id="feedback-title">Feedback on ${esc(item.id ?? 'this option')}</p>
      <label for="feedback-disposition">What should happen to this option?</label>
      <select id="feedback-disposition">
        <option value="">Choose one</option>
        <option value="keep">Keep</option>
        <option value="change">Change</option>
        <option value="combine">Combine</option>
      </select>
      <label for="feedback-details">What should we keep, change, or combine?</label>
      <textarea id="feedback-details" rows="3" maxlength="500" placeholder="Point to the part you mean."></textarea>
      <label for="feedback-output">Feedback to paste into the ticket or next-round request</label>
      <textarea id="feedback-output" rows="3" readonly aria-live="polite"></textarea>
      <button class="btn feedback-select" id="feedback-select" type="button">Select feedback to copy</button>
      <p class="feedback-status" id="feedback-status" role="status" aria-live="polite">Choose an action, then add a detail if useful.</p>
    </section>`;
  }

  function itemHtml(item) {
    if (item.kind === 'note') return `<aside class="note free-note" style="width:${item.boardWidth ?? 280}px">${noteHtml(item)}</aside>`;
    const width = naturalWidth(item);
    const height = naturalHeight(item);
    const boardWidth = item.boardWidth ?? Math.min(width, BOARD_WIDTH);
    const scale = boardWidth / width;
    const label = esc(`${item.id} · ${item.name ?? KIND_LABEL[item.kind]}`);
    return `<figure class="frame" style="width:${boardWidth}px">
      <figcaption class="frame-head">
        <span class="tag">${esc(item.id)}</span><span>·</span><span class="name">${esc(item.name ?? KIND_LABEL[item.kind])}</span>
        <span class="kind">${esc(KIND_LABEL[item.kind] ?? item.kind)}${item.style ? ` · ${esc(styles[item.style]?.label ?? item.style)}` : ''}</span>
        <span class="spacer"></span>
        <button type="button" class="icon-btn" data-play="${esc(item.id)}" aria-label="Present ${label}" title="Present">▶</button>
        ${item.kind === 'page' ? `<a data-tab="${esc(item.id)}" target="_blank" rel="noreferrer" aria-label="Open ${label} in a new tab" title="Open in a new tab">↗</a>` : ''}
      </figcaption>
      <div class="viewport" style="width:${boardWidth}px;height:${height === null ? 120 : Math.round(height * scale)}px">
        <iframe data-frame="${esc(item.id)}" style="width:${width}px;height:${height ?? 150}px;transform:scale(${scale})" data-scale="${scale}" tabindex="-1" title="${label}"></iframe>
        <button type="button" class="hit" data-play="${esc(item.id)}" aria-label="Present ${label}"></button>
      </div>
      ${item.note !== undefined ? `<aside class="note">${noteHtml(item)}</aside>` : ''}
    </figure>`;
  }

  function renderBoard() {
    const page = state.page;
    const multi = pages.length > 1;
    document.title = `${multi ? `${page.title} · ` : ''}${cfg.title} · Canvas`;
    $('title').textContent = cfg.title;
    $('pages-label').textContent = `${pages.length} pages`;
    $('pages-btn').hidden = !multi;
    $('page-title').textContent = multi ? `${roundLabel(page) ? `${roundLabel(page)} · ` : ''}${page.title}` : '';
    const pageTicket = page.ticket ?? cfg.ticket;
    $('count').textContent = `${pageTicket ? `#${pageTicket} · ` : ''}${page.presentable.length} item${page.presentable.length === 1 ? '' : 's'}`;
    const question = page.question ?? cfg.question;
    const sample = page.sampleState ?? cfg.sampleState;
    $('banner').hidden = !question;
    $('banner').innerHTML =
      `<p class="kicker">Deciding</p><p>${esc(question)}</p>${sample ? `<p class="sample"><b>Sample state:</b> ${esc(sample)}</p>` : ''}`;
    $('sections').innerHTML = page.sections
      .map(
        (section) => `<section class="section">
          ${section.title ? `<h2 class="section-title">${esc(section.title)}</h2>` : ''}
          ${section.note ? `<p class="section-note">${esc(section.note)}</p>` : ''}
          <div class="frames">${section.items.map(itemHtml).join('')}</div>
        </section>`,
      )
      .join('');
    renderPagesMenu();
    loadBoardFrames();
  }

  function loadBoardFrames() {
    for (const item of state.page.presentable) {
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
      const item = itemIndex.get(frame.dataset.frame)?.item;
      if (!item || naturalHeight(item) !== null) return;
      frame.style.height = `${height}px`;
      frame.parentElement.style.height = `${Math.round(height * Number(frame.dataset.scale))}px`;
      return;
    }
  });

  function themeLabel() {
    const label = state.theme === 'dark' ? '☾ Dark' : '☀ Light';
    $('theme').textContent = label;
    $('present-theme').textContent = label;
  }

  function renderTheme() {
    themeLabel();
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
    const board = $('board');
    setZoom(Math.min(1, board.clientWidth / $('stage').scrollWidth));
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

  /* ---------- pages menu ---------- */

  function renderPagesMenu() {
    $('pages-menu').innerHTML = pages
      .map((page) => {
        const round = roundLabel(page);
        return `<button type="button" role="menuitemradio" aria-checked="${page === state.page}" data-page="${esc(page.id)}">
          <span class="check" aria-hidden="true">${page === state.page ? '✓' : ''}</span>
          <span class="page-name">${round ? `<b class="round-label">${esc(round)}</b> · ` : ''}${esc(page.title ?? page.id)}</span>
          <span class="page-count" aria-label="${page.presentable.length} items">${page.presentable.length}</span>
        </button>`;
      })
      .join('');
  }

  function toggleMenu(open) {
    const menu = $('pages-menu');
    const show = open ?? menu.hidden;
    menu.hidden = !show;
    $('pages-btn').setAttribute('aria-expanded', String(show));
    if (show) (menu.querySelector('[aria-checked="true"]') ?? menu.querySelector('button'))?.focus();
  }

  function stepPage(direction) {
    const index = pages.indexOf(state.page);
    go(pages[(index + direction + pages.length) % pages.length].id);
  }

  /* ---------- routing: #page or #page/item ---------- */

  function parseHash() {
    const raw = decodeURIComponent(location.hash.slice(1));
    const [first = '', second] = raw.split('/');
    const page = pages.find((p) => p.id === first);
    if (page) return { page, item: second ? (page.items.find((i) => i.id === second) ?? null) : null };
    // A bare item id (older links) opens that item on its own page.
    const hit = itemIndex.get(first);
    if (hit) return { page: hit.page, item: hit.item };
    return { page: pages[0], item: null };
  }

  function presenting() {
    const { item } = parseHash();
    return item && item.kind !== 'note' ? item : null;
  }

  function showItem(item, reload) {
    const frame = $('present-frame');
    if (reload || frame.dataset.item !== item.id) loadFrame(frame, item, true);
    frame.dataset.item = item.id;
    frame.title = `${item.id} · ${item.name ?? KIND_LABEL[item.kind]}`;
    $('new-tab').hidden = item.kind !== 'page';
    if (item.kind === 'page') $('new-tab').href = pageSrc(item);
    $('side-note').innerHTML = `${noteHtml(item)}${feedbackComposerHtml(item)}`;
    $('side-note').hidden = !state.notes;
    const disposition = $('feedback-disposition');
    const details = $('feedback-details');
    const output = $('feedback-output');
    const status = $('feedback-status');
    const updateFeedback = () => {
      const action = disposition.value;
      const detail = details.value.trim();
      const round = roundLabel(state.page) || state.page.title || 'Current round';
      const pageTicket = state.page.ticket ?? cfg.ticket;
      const ticket = pageTicket ? `Ticket #${pageTicket} | ` : '';
      const option = `${item.id ?? 'Option'}${item.name ? ` (${item.name})` : ''}`;
      output.value = action ? `${ticket}${round} | ${option} | ${action}${detail ? `: ${detail}` : ''}` : '';
    };
    disposition.addEventListener('change', updateFeedback);
    details.addEventListener('input', updateFeedback);
    $('feedback-select').addEventListener('click', () => {
      updateFeedback();
      if (output.value === '') {
        status.textContent = 'Choose Keep, Change, or Combine first. Add a detail if useful.';
        return;
      }
      output.focus();
      output.select();
      status.textContent = 'Feedback selected. Press Ctrl+C, then paste it into the ticket or next-round request.';
    });
    $('notes').setAttribute('aria-pressed', String(state.notes));
    $('tabs').innerHTML = state.page.presentable
      .map(
        (i) =>
          `<button type="button" data-go="${esc(i.id)}" aria-current="${i.id === item.id}"><b>${esc(i.id)}</b>${esc(i.name ?? KIND_LABEL[i.kind])}</button>`,
      )
      .join('');
    $('tabs').querySelector('[aria-current="true"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }

  function route() {
    const { page, item } = parseHash();
    if (page !== state.page) {
      state.page = page;
      renderBoard();
      requestAnimationFrame(fit);
    }
    const shown = item && item.kind !== 'note' ? item : null;
    $('present-view').hidden = shown === null;
    if (shown) showItem(shown, false);
    else {
      const frame = $('present-frame');
      frame.removeAttribute('src');
      frame.removeAttribute('srcdoc');
      delete frame.dataset.item;
    }
  }

  /** Go to a page (`go('home')`), or present an item on the current page (`go(null, 'B')`). */
  function go(pageId, itemId) {
    const page = pageId ?? state.page.id;
    location.hash = encodeURIComponent(page) + (itemId ? `/${encodeURIComponent(itemId)}` : '');
  }

  function step(direction) {
    const current = presenting();
    if (!current) return;
    const list = state.page.presentable;
    go(null, list[(list.indexOf(current) + direction + list.length) % list.length].id);
  }

  /* ---------- wiring ---------- */

  document.addEventListener('click', (event) => {
    const play = event.target.closest('[data-play]');
    if (play) return go(null, play.dataset.play);
    const tab = event.target.closest('[data-go]');
    if (tab) return go(null, tab.dataset.go);
    const pick = event.target.closest('[data-page]');
    if (pick) {
      toggleMenu(false);
      $('pages-btn').focus();
      return go(pick.dataset.page);
    }
    if (!event.target.closest('#pages-menu, #pages-btn')) toggleMenu(false);
  });
  $('pages-btn').addEventListener('click', () => toggleMenu());
  $('pages-menu').addEventListener('keydown', (event) => {
    const buttons = [...$('pages-menu').querySelectorAll('button')];
    const index = buttons.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') buttons[(index + 1) % buttons.length].focus();
    else if (event.key === 'ArrowUp') buttons[(index - 1 + buttons.length) % buttons.length].focus();
    else if (event.key === 'Escape') {
      toggleMenu(false);
      $('pages-btn').focus();
    } else return;
    event.preventDefault();
    event.stopPropagation();
  });
  $('present').addEventListener('click', () => go(null, state.page.presentable[0]?.id));
  $('back').addEventListener('click', () => go());
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
    if (event.target.closest('input, textarea, select, #pages-menu') || $('help-dialog').open) return;
    const inPresent = presenting() !== null;
    const byNumber = state.page.presentable[Number(event.key) - 1];
    if (event.key === 'Escape' && inPresent) go();
    else if (event.key === 'ArrowRight' && inPresent) step(1);
    else if (event.key === 'ArrowLeft' && inPresent) step(-1);
    else if (byNumber && /^[1-9]$/.test(event.key)) go(null, byNumber.id);
    else if (event.key === ']' && pages.length > 1) stepPage(1);
    else if (event.key === '[' && pages.length > 1) stepPage(-1);
    else if (event.key === 'p' || event.key === 'P') pages.length > 1 && toggleMenu(true);
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

  enablePan();
  themeLabel();
  route();
})();
