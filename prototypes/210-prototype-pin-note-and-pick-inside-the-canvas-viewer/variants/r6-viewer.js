/*
  D3 (round 6): D2's tool row with a key for every tool, F's pins, a real colour picker,
  E's feedback panel (closable) and E's review. No pick: the viewer only posts notes to the
  prototype ticket; the pick is made in the T3 Code thread once revisions settle.
  ?state=pin|closed|review|posted|nobridge|snapshot sets where it opens; ?size=pane opens the side pane.
*/
Object.assign(Kit.icons, {
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
});

(() => {
  const { canvas, regions, opt, commentCard } = P210;
  const q = new URLSearchParams(location.search);
  const START = q.get('state') ?? 'pin';
  const icon = (name) => Kit.icon(name);
  const esc = Kit.esc;

  // Every tool has a key. The keys can be changed in Settings › Keyboard shortcuts.
  const TOOLS = [
    { id: 'pin', name: 'Pin', icon: 'pin', key: 'P', mode: true },
    { id: 'element', name: 'Select element', icon: 'cursor', key: 'E', mode: true },
    { id: 'color', name: 'Color picker', icon: 'drop', key: 'C', mode: true },
    { id: 'attach', name: 'Attach', icon: 'clip', key: 'A' },
    { id: 'note', name: 'Note', icon: 'note', key: 'N' },
  ];
  const PANEL_KEY = 'F';
  const KIND = { pin: 'Pin', element: 'Element', color: 'Colour', attach: 'Attachment', note: 'Note' };

  const S = {
    size: q.get('size') === 'pane' ? 'pane' : 'full',
    source: START === 'nobridge' ? 'none' : START === 'snapshot' ? 'page' : 'dom',
    option: 'B',
    items: [],
    tool: null, // 'pin' | 'element' | 'color'
    editing: null, // index of the item whose popover is open
    panelOpen: true,
    panel: 'edit', // 'edit' | 'review' | 'posted'
    paneTab: 'canvas',
    posted: false,
    fmt: 'hex', // colour value field: 'hex' | 'rgb'
    ptab: 'canvas', // colour presets: 'canvas' | 'project' | 'basic'
    hsv: null, // the open colour's hue, saturation and value, so hue survives greys
  };

  // ---------- sample content ----------
  if (S.source === 'dom') {
    const [hero, button] = [regions.B[1], regions.B[2]];
    S.items = [
      { type: 'pin', option: 'B', fx: 0.34, fy: 0.3, note: 'The hero card is too tall: the next ticket drops below the fold.' },
      { type: 'pin', option: 'B', fx: 0.84, fy: 0.16, note: 'Keep the Trail · Hexes · Bar switch.' },
      { type: 'element', option: 'B', target: hero.name, note: 'Too tall: cut the illustration.' },
      { type: 'color', option: 'B', target: button.name, from: button.color, to: '#1659a8', note: 'A shade darker, to match the primary buttons.' },
      { type: 'attach', option: 'B', on: 'item:0', files: ['hero-shorter.png'], note: 'Roughly this height.' },
      { type: 'note', option: 'B', note: 'Closest to what I want. Tighten the spacing under the hero.' },
      { type: 'note', option: null, note: 'Every option uses too much padding around the cards.' },
    ];
  } else if (S.source === 'page') {
    S.option = 'A';
    S.items = [
      { type: 'pin', option: 'A', fx: 0.5, fy: 0.42, note: 'Recovery cards need a status colour.' },
      { type: 'attach', option: null, on: 'page', files: ['launch-flow.png'], note: 'The order I expect.' },
      { type: 'note', option: null, note: 'The empty state reads well.' },
    ];
  } else {
    S.items = [
      { type: 'note', option: 'B', note: 'The hero card is too tall.' },
      { type: 'note', option: null, note: 'Every option uses too much padding around the cards.' },
    ];
  }
  if (START === 'pin' && S.source === 'dom') {
    S.tool = 'color';
    S.editing = 3;
  }
  if (START === 'closed') {
    S.panelOpen = false;
    S.editing = 0;
  }
  if (START === 'review' || START === 'posted') S.panel = START;
  S.posted = START === 'posted';
  if (S.size === 'pane') S.editing = START === 'pin' ? 0 : S.editing;

  const viewer = document.getElementById('viewer');
  const toolbar = document.getElementById('vw-toolbar');
  const stage = document.getElementById('stage');
  const live = (text) => (document.getElementById('live').textContent = text);
  const count = () => S.items.length;
  const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

  // ---------- colours ----------
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const hex2 = (n) => Math.round(n).toString(16).padStart(2, '0');
  const toHex = ([r, g, b]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  const toRgb = (hex) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
  const rgbText = (hex) => `rgb(${toRgb(hex).join(', ')})`;
  /** Accepts #1659a8, 1659a8, #15a, rgb(22, 89, 168), 22, 89, 168 or 22 89 168. */
  function parseColor(raw) {
    const t = raw.trim().toLowerCase();
    let m = /^#?([0-9a-f]{6})$/.exec(t);
    if (m) return `#${m[1]}`;
    m = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(t);
    if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
    m = /^(?:rgba?\()?\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)?$/.exec(t);
    if (m && [m[1], m[2], m[3]].every((n) => +n <= 255)) return toHex([+m[1], +m[2], +m[3]]);
    return null;
  }
  function toHsv(hex) {
    const [r, g, b] = toRgb(hex).map((n) => n / 255);
    const max = Math.max(r, g, b),
      d = max - Math.min(r, g, b);
    let h = 0;
    if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
  }
  function fromHsv({ h, s, v }) {
    const f = (n) => {
      const k = (n + h / 60) % 6;
      return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255;
    };
    return toHex([f(5), f(3), f(1)]);
  }
  // Colours a reviewer is likely to want: ones on this canvas, the project's own tokens, and plain basics.
  const cssHex = (() => {
    const ctx = document.createElement('canvas').getContext('2d');
    return (value) => {
      ctx.fillStyle = '#000';
      ctx.fillStyle = value.trim();
      return /^#[0-9a-f]{6}$/i.test(ctx.fillStyle) ? ctx.fillStyle : null;
    };
  })();
  const PRESETS = {
    canvas: () => {
      const seen = new Map();
      for (const r of regions[S.option ?? 'B'] ?? []) if (!seen.has(r.color)) seen.set(r.color, r.name);
      [['#52514e', 'Body text'], ['#0b0b0b', 'Headings'], ['#f4f4f1', 'Page background']].forEach(([c, n]) => seen.has(c) || seen.set(c, n));
      return [...seen].map(([c, n]) => [c, n]);
    },
    project: () => {
      const css = getComputedStyle(document.body);
      return [
        ['--accent-fill', 'Accent'],
        ['--accent-text', 'Accent text'],
        ['--state-claimed', 'Claimed'],
        ['--state-frontier', 'Frontier'],
        ['--state-blocked', 'Blocked'],
        ['--handoff-needs-you', 'Needs you'],
        ['--handoff-pr-ready', 'PR ready'],
        ['--text-primary', 'Text'],
        ['--text-muted', 'Muted text'],
        ['--surface-1', 'Surface'],
        ['--plane', 'Plane'],
      ]
        .map(([v, n]) => [cssHex(css.getPropertyValue(v)), `${n} (${v})`])
        .filter(([c]) => c);
    },
    basic: () => [
      ['#000000', 'Black'], ['#ffffff', 'White'], ['#808080', 'Grey'], ['#e53935', 'Red'], ['#fb8c00', 'Orange'], ['#fdd835', 'Yellow'],
      ['#43a047', 'Green'], ['#00897b', 'Teal'], ['#1e88e5', 'Blue'], ['#3949ab', 'Indigo'], ['#8e24aa', 'Purple'], ['#d81b60', 'Pink'],
    ],
  };

  // ---------- where things are ----------
  const regionAt = (it) => (regions[it.option] ?? []).find((r) => it.fx >= r.x && it.fx <= r.x + r.w && it.fy >= r.y && it.fy <= r.y + r.h);
  const near = (it) => (S.source === 'dom' ? regionAt(it)?.name : null);
  // Numbers follow the panel and the comment: whole page first, then options A, B, C.
  const rank = (it) => (it.option ? 1 + canvas.options.findIndex((o) => o.id === it.option) : 0);
  const order = () => [...S.items.keys()].sort((a, b) => rank(S.items[a]) - rank(S.items[b]) || a - b);
  const num = (i) => order().indexOf(i) + 1;
  const onIndex = (it) => (it.on?.startsWith('item:') ? +it.on.slice(5) : null);
  function onLabel(it) {
    const k = onIndex(it);
    if (k !== null) return `${KIND[S.items[k].type].toLowerCase()} ${num(k)}`;
    return it.on === 'option' ? `option ${it.option}` : 'the whole page';
  }
  const scopeName = (it) => (it.option ? `${it.option} · ${opt(it.option).name}` : 'Whole page');
  function kindLine(it, i) {
    const n = num(i);
    if (it.type === 'pin') return `Pin ${n} · ${near(it) ? `on ${near(it)}` : S.source === 'page' ? 'on the page' : `on ${it.option}`}`;
    if (it.type === 'element') return `Element ${n} · ${it.target}`;
    if (it.type === 'color') return `Colour ${n} · ${it.target}`;
    if (it.type === 'attach') return `Attachment ${n} · on ${onLabel(it)}`;
    return `Note ${n}`;
  }
  const onCanvas = (it) => it.type === 'pin' || it.type === 'element' || it.type === 'color' || (it.type === 'attach' && onIndex(it) !== null);

  // ---------- the one comment: notes on the prototype ticket ----------
  function whereMd(it) {
    if (it.type === 'pin') return near(it) ? `pin on "${near(it)}"` : S.source === 'page' ? 'pin on the page' : 'pin';
    if (it.type === 'element') return `element "${it.target}"`;
    if (it.type === 'color') return `colour of "${it.target}": \`${it.from}\` → \`${it.to}\``;
    if (it.type === 'attach') return `${it.files.map((f) => `\`${f}\``).join(', ') || '_(no file yet)_'} attached to ${onLabel(it)}`;
    return it.option ? 'note on the whole option' : 'note';
  }
  function notesMd() {
    const page = S.source === 'page' ? canvas.snapshot.file : canvas.page.id;
    const head = S.source === 'page' ? `\`${canvas.branch}\` @ \`${canvas.sha}\` · snapshot` : `\`${canvas.branch}\` @ \`${canvas.sha}\` · page **${canvas.page.title}**`;
    const scope = (it) => (it.option ? (S.source === 'page' ? `\`${canvas.snapshot.file}\` · option **${it.option}**` : `**${it.option} · ${opt(it.option).name}**`) : '**Whole page**');
    const lines = order().map((i, k) => S.items[i]).map((it, k) => `${k + 1}. ${scope(it)}, ${whereMd(it)}: ${it.note || '_(no note)_'}`);
    // Positions stay in the hidden block for agents; people read element names instead of percentages.
    const data = order().map((i) => S.items[i]).map((it) => ({
      type: it.type,
      page,
      option: it.option,
      ...(it.fx !== undefined ? { x: +it.fx.toFixed(3), y: +it.fy.toFixed(3) } : {}),
      ...(near(it) ? { near: near(it) } : {}),
      ...(it.target ? { element: it.target } : {}),
      ...(it.type === 'color' ? { from: it.from, to: it.to } : {}),
      ...(it.type === 'attach' ? { on: it.on, files: it.files } : {}),
      note: it.note,
    }));
    const json = JSON.stringify({ branch: canvas.branch, sha: canvas.sha, pins: data });
    return `### Canvas notes from Wayfinder\n${head}\n\n${lines.join('\n')}\n\n<!-- wayfinder:notes v1 ${json} -->`;
  }

  // ---------- toolbar ----------
  function sizes() {
    const label = { full: 'Full window', pane: 'Side pane', float: 'Floating window' };
    return `<div class="segmented vw-sizes" role="group" aria-label="Canvas size">${['full', 'pane', 'float']
      .map((s) => `<button type="button" class="seg${s === S.size ? ' is-on' : ''}" data-size="${s}" aria-pressed="${s === S.size}" aria-label="${label[s]}" title="${label[s]}">${icon(s)}</button>`)
      .join('')}</div>`;
  }
  function options() {
    if (S.source === 'page') return `<span class="vw-status">Snapshot · option A from the tile</span>`;
    if (S.source === 'none') return `<span class="vw-status">View only</span>`;
    const seg = `<div class="segmented vw-options" role="group" aria-label="Show the board, or open one option full size"><button type="button" class="seg${S.option === null ? ' is-on' : ''}" data-go="" aria-pressed="${S.option === null}">Board</button>${canvas.options
      .map((o) => `<button type="button" class="seg${S.option === o.id ? ' is-on' : ''}" data-go="${o.id}" aria-pressed="${S.option === o.id}" title="${esc(o.name)}">${o.id}</button>`)
      .join('')}</div>`;
    const page = `<div class="vw-menu-anchor"><button type="button" class="ghost" data-to="the page menu" aria-haspopup="menu" aria-expanded="false" aria-label="Canvas page: Home">Home${icon('chevron')}</button></div>`;
    return `${page}${seg}${S.option ? `<span class="vw-optname">${esc(opt(S.option).name)}</span>` : ''}`;
  }
  const NO_BRIDGE = 'This canvas did not answer, so Wayfinder cannot tell where you are pointing.';
  function offReason(id) {
    if (id === 'note' || id === 'attach') return '';
    if (S.source === 'none') return NO_BRIDGE;
    if (S.source === 'page') return id === 'pin' ? '' : 'Snapshots do not report their elements or colours';
    return S.option === null ? 'Open an option first' : '';
  }
  function toolRow(compact) {
    const tools = `<div class="segmented p210-toolgroup" role="group" aria-label="Feedback tools">${TOOLS.map((t) => {
      const off = offReason(t.id);
      const on = t.mode && S.tool === t.id;
      return `<button type="button" class="seg${on ? ' is-on' : ''}" data-tool="${t.id}" aria-label="${t.name}" aria-keyshortcuts="${t.key}"${t.mode ? ` aria-pressed="${on}"` : ''}${off ? ` aria-disabled="true" title="${off}"` : ` title="${t.name} (${t.key})"`}>${icon(t.icon)}${compact ? '' : `<span class="vw-lbl">${t.name}</span><kbd>${t.key}</kbd>`}</button>`;
    }).join('')}</div>`;
    const why = S.source === 'none' ? `<span class="p210-chip is-warn" title="${NO_BRIDGE}">${icon('info')}${compact ? 'Notes only' : 'Notes only: this canvas did not answer'}</span>` : '';
    const keys = `<button type="button" class="ghost p6-keys" data-act="shortcuts" title="Change these keys in Settings › Keyboard shortcuts">${icon('keyboard')}${compact ? '' : 'Shortcuts'}</button>`;
    return `${tools}${why}<span class="topbar-spacer"></span>${keys}`;
  }
  function panelToggle(compact) {
    const n = count();
    return `<button type="button" class="ghost p210-tool${S.panelOpen ? ' is-on' : ''}" data-act="panel" aria-pressed="${S.panelOpen}" aria-controls="p6-panel" aria-keyshortcuts="${PANEL_KEY}" title="Feedback panel (${PANEL_KEY})">${icon('panel')}${compact ? '' : '<span class="vw-lbl">Feedback</span>'}${n ? `<span class="badge p210-badge">${n}</span>` : ''}${compact ? '' : `<kbd>${PANEL_KEY}</kbd>`}</button>`;
  }
  function toolbarHtml() {
    const title = `<span class="vw-title" id="vw-title">${icon('beaker')}<span class="vw-title-t">${esc(canvas.title)}</span></span>`;
    const gh = `<a class="iconbtn" href="#" data-to="the branch on GitHub" aria-label="Open the branch on GitHub">${icon('external')}</a>`;
    if (S.size === 'full') {
      const close = `<button type="button" class="ghost vw-close" data-to="the map (closes the canvas)" aria-label="Close the canvas">${icon('close')}<span class="vw-lbl">Close</span><kbd>Esc</kbd></button>`;
      return `<div class="vw-bar is-a">${close}${title}<span class="vw-sep"></span>${options()}<span class="topbar-spacer"></span>${S.posted ? `<span class="p210-chip is-ok">${icon('check')}Posted to #${canvas.protoTicket.number}</span>` : ''}${panelToggle(false)}<span class="vw-sep"></span>${gh}${sizes()}</div><div class="p210-toolrow" role="toolbar" aria-label="Annotate">${toolRow(false)}</div>`;
    }
    const close = `<button type="button" class="iconbtn vw-close" data-to="the map (closes the canvas)" aria-label="Close the canvas">${icon('close')}</button>`;
    const n = count();
    const tabs = `<div class="segmented p210-tabs" role="tablist" aria-label="Pane view"><button type="button" role="tab" class="seg${S.paneTab === 'canvas' ? ' is-on' : ''}" aria-selected="${S.paneTab === 'canvas'}" data-tab="canvas">Canvas</button><button type="button" role="tab" class="seg${S.paneTab === 'feedback' ? ' is-on' : ''}" aria-selected="${S.paneTab === 'feedback'}" data-tab="feedback" aria-keyshortcuts="${PANEL_KEY}">Feedback${n ? ` <span class="badge p210-badge">${n}</span>` : ''}</button></div>`;
    return `<div class="vw-bar is-c"><div class="vw-c-row">${title}<span class="topbar-spacer"></span>${gh}${sizes()}${close}</div><div class="vw-c-row">${options()}<span class="topbar-spacer"></span>${tabs}</div></div><div class="p210-toolrow" role="toolbar" aria-label="Annotate">${toolRow(true)}</div>`;
  }

  // ---------- canvas ----------
  function markHtml(it, i) {
    const open = S.editing === i ? ' is-open' : '';
    const posted = S.posted ? ' is-posted' : '';
    const label = `${esc(kindLine(it, i))}: ${esc(it.note || 'no note yet')}`;
    if (it.type === 'pin')
      return `<button type="button" class="p210-pin is-drop${open}${posted}" style="left:${it.fx * 100}%;top:${it.fy * 100}%" data-mark="${i}" aria-label="${label}. Arrow keys move it."><span>${num(i)}</span></button>`;
    if (it.type === 'element' || it.type === 'color') {
      const r = regions[it.option].find((x) => x.name === it.target);
      const chip = it.type === 'color' ? `<span class="p6-el-colors" aria-hidden="true"><i style="background:${it.from}"></i><i style="background:${it.to}"></i></span>` : '';
      return `<button type="button" class="p210-el p6-el${open}${posted}" style="left:${r.x * 100}%;top:${r.y * 100}%;width:${r.w * 100}%;height:${r.h * 100}%" data-mark="${i}" aria-label="${label}"><span class="p6-el-n">${num(i)}</span>${chip}</button>`;
    }
    if (it.type === 'attach' && onIndex(it) !== null) {
      const a = S.items[onIndex(it)];
      const r = a.type === 'pin' ? { x: a.fx, y: a.fy } : regions[a.option].find((x) => x.name === a.target);
      return `<button type="button" class="p6-clip${open}${posted}" style="left:${r.x * 100}%;top:${r.y * 100}%" data-mark="${i}" aria-label="${label}"><span>${icon('clip')}</span></button>`;
    }
    return '';
  }
  function regionsHtml() {
    if ((S.tool !== 'element' && S.tool !== 'color') || !S.option || S.source !== 'dom') return '';
    return regions[S.option]
      .map((r, k) => `<button type="button" class="p210-region" style="left:${r.x * 100}%;top:${r.y * 100}%;width:${r.w * 100}%;height:${r.h * 100}%" data-region="${k}" aria-label="${S.tool === 'color' ? 'Pick the colour of' : 'Select'} ${esc(r.name)}"><span>${esc(r.name)}</span></button>`)
      .join('');
  }
  function canvasHtml() {
    const shown = S.items.map((it, i) => [it, i]).filter(([it]) => onCanvas(it) && (S.source === 'page' || it.option === S.option));
    // While selecting, element targets sit above existing marks so an annotated element can be picked again.
    const layer = `<div class="p210-pins">${shown.map(([it, i]) => markHtml(it, i)).join('')}${regionsHtml()}</div>`;
    const pop = S.editing !== null && !S.posted && onCanvas(S.items[S.editing]) && shown.some(([, i]) => i === S.editing) ? `<div class="p6-poplayer">${popover(S.editing)}</div>` : '';
    const hint = (() => {
      if (S.tool === 'pin') return `${icon('pin')}Click to drop a pin. Enter drops one in the middle; arrow keys move it. <kbd>Esc</kbd> stops.`;
      if (S.tool === 'element') return `${icon('cursor')}Hover or Tab to an element, then click or press Enter. <kbd>Esc</kbd> stops.`;
      if (S.tool === 'color') return `${icon('drop')}Pick an element to change its colour. <kbd>Esc</kbd> stops.`;
      return '';
    })();
    const hintHtml = hint && S.editing === null ? `<div class="p210-hint" role="status">${hint}</div>` : '';
    if (S.source === 'page')
      return `<div class="p210-cv is-page${S.tool === 'pin' ? ' is-pinning' : ''}"><div class="p210-cv-body"><div class="p210-opt" id="opt"><img src="${canvas.snapshot.img}" alt="Snapshot: Desktop launch and recovery states" />${layer}</div></div>${pop}${hintHtml}</div>`;
    if (S.option === null)
      return `<div class="p210-cv"><div class="p210-cv-body is-board"><img src="${canvas.board}" alt="The canvas board with every option" /></div><div class="p210-hint is-soft" role="status">${icon('info')}Open an option to pin it. Notes and files work here too.</div></div>`;
    const engine = `<div class="p210-engine" aria-hidden="true"><span>← Canvas</span><span class="p210-engine-tabs">${canvas.options.map((o) => `<i${o.id === S.option ? ' class="is-on"' : ''}>${o.id}</i>`).join('')}</span><span class="topbar-spacer"></span><span>Notes</span><span>↗</span></div>`;
    const mode = S.tool === 'pin' ? ' is-pinning' : S.tool ? ' is-selecting' : '';
    return `<div class="p210-cv${mode}">${engine}<div class="p210-cv-body"><div class="p210-opt" id="opt"><img src="${opt(S.option).img}" alt="Option ${S.option}: ${esc(opt(S.option).name)}" />${layer}</div></div>${pop}${hintHtml}</div>`;
  }

  // ---------- popovers ----------
  function colorEditor(it, i) {
    const hsv = S.hsv ?? toHsv(it.to);
    const value = S.fmt === 'hex' ? it.to : rgbText(it.to);
    const presets = PRESETS[S.ptab]();
    const tab = (id, name) => `<button type="button" class="seg${S.ptab === id ? ' is-on' : ''}" role="tab" aria-selected="${S.ptab === id}" data-ptab="${id}">${name}</button>`;
    return `<div class="p6-cmp"><span class="p210-sw" style="background:${it.from}" aria-hidden="true"></span><code>${it.from}</code><span aria-hidden="true">→</span><span class="p210-sw" data-to-sw style="background:${it.to}" aria-hidden="true"></span><code data-to-code>${it.to}</code></div>
      <div class="p6-sv" data-sv="${i}" style="background-color:hsl(${hsv.h} 100% 50%)"><span class="p6-sv-dot" tabindex="0" role="slider" aria-label="Saturation and brightness" aria-valuetext="saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%" data-svdot="${i}" style="left:${hsv.s * 100}%;top:${(1 - hsv.v) * 100}%"></span></div>
      <input type="range" class="p6-hue" min="0" max="359" value="${Math.round(hsv.h)}" data-hue="${i}" aria-label="Hue" />
      <div class="p6-val"><div class="segmented p6-fmt" role="group" aria-label="Colour format"><button type="button" class="seg${S.fmt === 'hex' ? ' is-on' : ''}" aria-pressed="${S.fmt === 'hex'}" data-fmt="hex">Hex</button><button type="button" class="seg${S.fmt === 'rgb' ? ' is-on' : ''}" aria-pressed="${S.fmt === 'rgb'}" data-fmt="rgb">RGB</button></div><input class="input" data-colorval="${i}" value="${value}" aria-label="Colour, as hex or rgb. Paste either." spellcheck="false" /></div>
      <div class="segmented p6-ptabs" role="tablist" aria-label="Preset colours">${tab('canvas', 'This canvas')}${tab('project', 'Project')}${tab('basic', 'Basic')}</div>
      <div class="p6-swatches" role="group" aria-label="${S.ptab === 'canvas' ? 'Colours on this canvas' : S.ptab === 'project' ? 'Project colours' : 'Basic colours'}">${presets.map(([c, n]) => `<button type="button" class="p210-swatch${c === it.to ? ' is-on' : ''}" style="background:${c}" data-swatch="${i}" data-color="${c}" aria-pressed="${c === it.to}" aria-label="${esc(n)}, ${c}" title="${esc(n)} · ${c}"></button>`).join('')}</div>`;
  }
  function attachEditor(it, i) {
    const targets = [['page', 'The whole page'], ...(it.option ? [['option', `Option ${it.option}`]] : []), ...S.items.map((x, k) => [x, k]).filter(([x]) => x.type === 'pin' || x.type === 'element' || x.type === 'color').filter(([x]) => !it.option || x.option === it.option).map(([x, k]) => [`item:${k}`, kindLine(x, k)])];
    return `<label class="p210-field">Attached to<select class="input" data-attach-on="${i}">${targets.map(([v, t]) => `<option value="${v}"${v === it.on ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      <div class="p210-files">${it.files.map((f) => `<span class="p210-file">${icon('clip')}${esc(f)}</span>`).join('')}<button type="button" class="ghost p210-sm" data-addfile="${i}">${icon('plus')}Add file</button></div>`;
  }
  function popover(i) {
    const it = S.items[i];
    const extra = it.type === 'color' ? colorEditor(it, i) : it.type === 'attach' ? attachEditor(it, i) : '';
    const optionField = S.source === 'page' && it.type === 'pin'
      ? `<label class="p210-field">Option<select class="input" data-item-option="${i}">${canvas.options.map((x) => `<option value="${x.id}"${x.id === it.option ? ' selected' : ''}>${x.id} · ${esc(x.name)}</option>`).join('')}</select></label>`
      : '';
    return `<div class="p6-pop${it.type === 'color' ? ' is-color' : ''}" role="dialog" aria-label="${esc(kindLine(it, i))}">
      <div class="p6-pop-head"><b>${esc(kindLine(it, i))}</b><span>${esc(scopeName(it))}</span></div>
      ${optionField}${extra}
      <textarea class="input" rows="2" data-note="${i}" aria-label="Note for ${esc(kindLine(it, i))}" placeholder="${it.type === 'color' ? 'Why this colour? (optional)' : 'What should change here?'}">${esc(it.note)}</textarea>
      <div class="p6-pop-foot"><button type="button" class="iconbtn" data-del="${i}" aria-label="Delete ${esc(kindLine(it, i))}">${icon('trash')}</button><span class="topbar-spacer"></span><button type="button" class="primary" data-act="done">Done</button></div>
    </div>`;
  }

  // ---------- the feedback panel (E's list and review) ----------
  function markerHtml(it, i) {
    if (it.type === 'pin') return `<span class="p6-mk is-pin" aria-hidden="true">${num(i)}</span>`;
    if (it.type === 'element') return `<span class="p6-mk is-el" aria-hidden="true">${num(i)}</span>`;
    if (it.type === 'color') return `<span class="p6-mk is-color" aria-hidden="true" style="--to:${it.to}">${num(i)}</span>`;
    if (it.type === 'attach') return `<span class="p6-mk is-plain" aria-hidden="true">${icon('clip')}</span>`;
    return `<span class="p6-mk is-plain" aria-hidden="true">${icon('note')}</span>`;
  }
  function rowHtml(it, i) {
    const meta =
      it.type === 'color'
        ? `<span class="p6-row-colors"><i style="background:${it.from}"></i><code>${it.from}</code>→<i style="background:${it.to}"></i><code>${it.to}</code></span>`
        : it.type === 'attach'
          ? `<span class="p210-files">${it.files.map((f) => `<span class="p210-file">${icon('clip')}${esc(f)}</span>`).join('')}<button type="button" class="ghost p210-sm" data-addfile="${i}">${icon('plus')}Add file</button></span>`
          : '';
    const title = onCanvas(it)
      ? `<button type="button" class="p6-row-kind" data-show="${i}" title="Show it on the canvas">${esc(kindLine(it, i))}</button>`
      : `<span class="p6-row-kind">${esc(kindLine(it, i))}</span>`;
    return `<div class="p6-row${S.editing === i ? ' is-open' : ''}">${markerHtml(it, i)}<div class="p6-row-main">${title}${meta}<textarea class="input" rows="2" data-note="${i}" aria-label="Note for ${esc(kindLine(it, i))}" placeholder="What should change?">${esc(it.note)}</textarea></div><button type="button" class="iconbtn" data-del="${i}" aria-label="Delete ${esc(kindLine(it, i))}">${icon('trash')}</button></div>`;
  }
  function panelHtml() {
    const close = `<button type="button" class="iconbtn" data-act="panel-close" aria-label="Close the feedback panel (${PANEL_KEY})" title="Close (${PANEL_KEY})">${icon('close')}</button>`;
    const card = (posted) => commentCard(canvas.protoTicket, notesMd(), { posted, id: 'notes' });
    if (S.panel === 'review')
      return `<header class="p6-panel-head"><button type="button" class="iconbtn" data-act="panel-edit" aria-label="Back to edit">${icon('left')}</button><h2>Review before posting</h2><span class="topbar-spacer"></span>${close}</header>
        <div class="p6-panel-body"><p class="p210-muted">Exactly what goes to #${canvas.protoTicket.number}. Your marks stay on the canvas while you read.</p>${card(false)}</div>
        <footer class="p6-panel-foot"><button type="button" class="ghost" data-act="panel-edit">Edit</button><span class="topbar-spacer"></span><button type="button" class="primary" data-act="post">${icon('send')}Post to #${canvas.protoTicket.number}</button></footer>`;
    if (S.panel === 'posted')
      return `<header class="p6-panel-head"><span class="p210-ok">${icon('check')}</span><h2>Posted to #${canvas.protoTicket.number}</h2><span class="topbar-spacer"></span>${close}</header>
        <div class="p6-panel-body"><p class="p210-muted">The agent picks these up for the next revision. When you stop revising, make the pick in the T3 Code thread for #${canvas.pickTicket.number}.</p>${card(true)}</div>
        <footer class="p6-panel-foot"><span class="topbar-spacer"></span><button type="button" class="primary" data-act="panel-fresh">Start new feedback</button></footer>`;
    const cur = S.option;
    const showing = (id) => (id === cur ? ' <span class="p210-tag">Showing</span>' : '');
    const group = (title, list, add) => `<section class="p6-group"><h3>${title}</h3>${list.map(([it, i]) => rowHtml(it, i)).join('')}${add}</section>`;
    const all = S.items.map((it, i) => [it, i]);
    const pageRows = all.filter(([it]) => !it.option);
    const addPage = `<button type="button" class="p6-add" data-addnote="page">${icon('plus')}Note on the whole page</button>`;
    const groups = canvas.options
      .map((o) => {
        const rows = all.filter(([it]) => it.option === o.id);
        if (!rows.length && o.id !== cur) return '';
        return group(`${o.id} · ${esc(o.name)}${showing(o.id)}`, rows, `<button type="button" class="p6-add" data-addnote="${o.id}">${icon('plus')}Note on ${o.id}</button>`);
      })
      .join('');
    const chooser = S.source === 'none'
      ? `<label class="p210-field">Which option is showing? This canvas does not say.<select class="input" data-cur>${canvas.options.map((x) => `<option value="${x.id}"${x.id === cur ? ' selected' : ''}>${x.id} · ${esc(x.name)}</option>`).join('')}</select></label>`
      : '';
    const warn = S.source === 'none'
      ? `<div class="p210-banner">${icon('info')}<span>This canvas did not answer, so pins, elements and colours are off. Notes and files still work on a whole option or the whole page.</span></div>`
      : S.source === 'page'
        ? `<div class="p210-banner is-info">${icon('info')}<span>Snapshot: pins mark the page. Elements and colours are off.</span></div>`
        : '';
    const n = count();
    return `<header class="p6-panel-head"><h2>Feedback</h2>${n ? `<span class="badge">${n}</span>` : ''}<span class="topbar-spacer"></span><span class="p210-muted">Notes for #${canvas.protoTicket.number}</span>${close}</header>
      <div class="p6-panel-body">${warn}${chooser}${group('Whole page', pageRows, addPage)}${groups}</div>
      <footer class="p6-panel-foot"><span class="p210-muted">${plural(n, 'note')}</span><span class="topbar-spacer"></span><button type="button" class="primary" data-act="panel-review"${n ? '' : ' disabled title="Add a note first"'}>Review</button></footer>`;
  }

  // ---------- paint and layout ----------
  function paint() {
    const focus = document.activeElement;
    const key = focus && focus !== document.body ? [...focus.attributes].find((a) => a.name.startsWith('data-')) : null;
    viewer.className = `vw ${S.size === 'full' ? 'is-a' : 'is-c'} p6`;
    document.body.classList.toggle('has-pane', S.size === 'pane');
    viewer.setAttribute('role', S.size === 'full' ? 'dialog' : 'region');
    toolbar.innerHTML = toolbarHtml();
    const showPanel = S.size === 'pane' ? S.paneTab === 'feedback' : S.panelOpen;
    const showCanvas = S.size !== 'pane' || S.paneTab === 'canvas';
    stage.innerHTML = `<div class="p210-split${showPanel && showCanvas ? ' has-panel' : ''}">${showCanvas ? canvasHtml() : ''}${showPanel ? `<aside class="p6-panel" id="p6-panel" aria-label="Feedback">${panelHtml()}</aside>` : ''}</div>`;
    Kit.fillIcons(document);
    layout();
    if (key) [...document.querySelectorAll(`[${key.name}]`)].find((el) => el.getAttribute(key.name) === key.value)?.focus({ preventScroll: true });
  }
  // Fit the option at 16:9, then keep the open popover beside its mark and inside the canvas.
  function layout() {
    const box = document.getElementById('opt');
    if (box) {
      const body = box.parentElement;
      const w = body.clientWidth - 24,
        h = body.clientHeight - 24;
      const width = Math.min(w, h * (16 / 9));
      box.style.width = `${width}px`;
      box.style.height = `${width / (16 / 9)}px`;
    }
    const pop = document.querySelector('.p6-pop');
    const mark = document.querySelector(`[data-mark="${S.editing}"]`);
    if (!pop || !mark) return;
    const cv = pop.closest('.p210-cv').getBoundingClientRect();
    const a = mark.getBoundingClientRect();
    const small = a.width < 60;
    let x = (small ? a.right : a.left + Math.min(a.width, 120)) - cv.left + 10;
    if (x + pop.offsetWidth > cv.width - 8) x = a.left - cv.left - pop.offsetWidth - 10;
    let y = (small ? a.top : a.top + 8) - cv.top;
    y = clamp(y, 8, cv.height - pop.offsetHeight - 8);
    pop.style.left = `${clamp(x, 8, cv.width - pop.offsetWidth - 8)}px`;
    pop.style.top = `${y}px`;
  }
  addEventListener('resize', layout);

  // ---------- actions ----------
  const disabled = (el) => el.getAttribute('aria-disabled') === 'true' || el.disabled;
  function edit(i, { focusNote = true } = {}) {
    S.editing = i;
    S.posted = false;
    if (S.panel === 'posted') S.panel = 'edit';
    const it = S.items[i];
    S.hsv = it?.type === 'color' ? toHsv(it.to) : null;
    if (it && !onCanvas(it)) {
      if (S.size === 'pane') S.paneTab = 'feedback';
      else S.panelOpen = true;
    }
    paint();
    if (focusNote) document.querySelector(onCanvas(it) ? `.p6-pop [data-note="${i}"]` : `.p6-panel [data-note="${i}"]`)?.focus();
  }
  function add(item) {
    S.items.push(item);
    live(`${kindLine(item, S.items.length - 1)} added.`);
    edit(S.items.length - 1);
  }
  function useTool(id) {
    const off = offReason(id);
    if (off) return Kit.toast(off);
    if (S.size === 'pane') S.paneTab = id === 'note' ? 'feedback' : 'canvas';
    if (id === 'note') return add({ type: 'note', option: S.source === 'page' ? null : S.option, note: '' });
    if (id === 'attach') {
      const open = S.editing !== null ? S.items[S.editing] : null;
      const on = open && open.type !== 'attach' && onCanvas(open) ? `item:${S.editing}` : S.option && S.source !== 'page' ? 'option' : 'page';
      return add({ type: 'attach', option: on === 'page' ? null : (open?.option ?? S.option), on, files: [], note: '' });
    }
    S.tool = S.tool === id ? null : id;
    S.editing = null;
    paint();
  }
  function setColor(i, hex, { hsv = toHsv(hex), repaint = true } = {}) {
    S.items[i].to = hex;
    S.hsv = hsv;
    if (repaint) return paint();
    // Light update while dragging, so the pointer keeps its capture.
    const pop = document.querySelector('.p6-pop');
    pop.querySelector('[data-sv]').style.backgroundColor = `hsl(${hsv.h} 100% 50%)`;
    const dot = pop.querySelector('[data-svdot]');
    dot.style.left = `${hsv.s * 100}%`;
    dot.style.top = `${(1 - hsv.v) * 100}%`;
    pop.querySelector('[data-to-sw]').style.background = hex;
    pop.querySelector('[data-to-code]').textContent = hex;
    const val = pop.querySelector('[data-colorval]');
    if (document.activeElement !== val) val.value = S.fmt === 'hex' ? hex : rgbText(hex);
    const chip = document.querySelector(`[data-mark="${i}"] .p6-el-colors i:last-child`);
    if (chip) chip.style.background = hex;
  }
  function remove(i) {
    S.items.splice(i, 1);
    for (const it of S.items) {
      const k = onIndex(it);
      if (k === i) it.on = it.option ? 'option' : 'page';
      else if (k !== null && k > i) it.on = `item:${k - 1}`;
    }
    S.editing = null;
    live('Deleted.');
    paint();
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('button, .p210-opt');
    if (!t || t.matches('[data-to]')) return;
    const d = t.dataset;
    if (d.size) {
      if (d.size === 'float') return Kit.toast('The floating window works the same as the side pane here');
      S.size = d.size;
      return paint();
    }
    if (d.go !== undefined) {
      S.option = d.go || null;
      S.tool = null;
      S.editing = null;
      return paint();
    }
    if (d.tab) {
      S.paneTab = d.tab;
      return paint();
    }
    if (d.view) {
      const md = d.view === 'markdown';
      document.querySelector(`[data-body="${d.card}"]`).hidden = md;
      document.querySelector(`[data-md="${d.card}"]`).hidden = !md;
      t.parentElement.querySelectorAll('.seg').forEach((b) => {
        b.classList.toggle('is-on', b === t);
        b.setAttribute('aria-pressed', String(b === t));
      });
      return;
    }
    if (d.tool) return useTool(d.tool);
    if (d.region !== undefined) {
      const r = regions[S.option][+d.region];
      const base = { option: S.option, target: r.name, note: '' };
      return add(S.tool === 'color' ? { type: 'color', from: r.color, to: r.color, ...base } : { type: 'element', ...base });
    }
    if (d.mark !== undefined) return S.editing === +d.mark ? ((S.editing = null), paint()) : edit(+d.mark, { focusNote: false });
    if (d.show !== undefined) {
      const it = S.items[+d.show];
      if (S.source === 'dom' && it.option !== S.option) S.option = it.option;
      if (S.size === 'pane') S.paneTab = 'canvas';
      return edit(+d.show, { focusNote: false });
    }
    if (d.del !== undefined) return remove(+d.del);
    if (d.addnote) return add({ type: 'note', option: d.addnote === 'page' ? null : d.addnote, note: '' });
    if (d.addfile !== undefined) {
      const files = S.items[+d.addfile].files;
      files.push(`screenshot-${files.length + 1}.png`);
      return paint();
    }
    if (d.swatch !== undefined) return setColor(+d.swatch, d.color);
    if (d.fmt) {
      S.fmt = d.fmt;
      return paint();
    }
    if (d.ptab) {
      S.ptab = d.ptab;
      return paint();
    }
    if (t.classList.contains('p210-opt')) {
      if (S.tool !== 'pin' || e.target.closest('[data-mark], .p210-region')) return;
      const r = t.getBoundingClientRect();
      return add({ type: 'pin', option: S.source === 'page' ? 'A' : S.option, fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height, note: '' });
    }
    if (d.act && disabled(t)) return Kit.toast(t.title || 'Not available here');
    switch (d.act) {
      case 'done':
        S.editing = null;
        return paint();
      case 'panel':
        S.panelOpen = !S.panelOpen;
        return paint();
      case 'panel-close':
        if (S.size === 'pane') S.paneTab = 'canvas';
        else S.panelOpen = false;
        return paint();
      case 'panel-review':
        S.panel = 'review';
        S.tool = null;
        S.editing = null;
        return paint();
      case 'panel-edit':
        S.panel = 'edit';
        return paint();
      case 'post':
        S.posted = true;
        S.panel = 'posted';
        S.editing = null;
        live(`Posted to #${canvas.protoTicket.number}.`);
        return paint();
      case 'panel-fresh':
        S.items = [];
        S.posted = false;
        S.panel = 'edit';
        return paint();
      case 'shortcuts':
        return Kit.toast('Opens Settings › Keyboard shortcuts, where P, E, C, A, N and F can be changed');
    }
  });

  // The saturation and brightness square: drag, click, or arrow keys on its handle.
  document.addEventListener('pointerdown', (e) => {
    const sv = e.target.closest('[data-sv]');
    if (!sv) return;
    e.preventDefault();
    const i = +sv.dataset.sv;
    const move = (ev) => {
      const r = sv.getBoundingClientRect();
      const hsv = { h: S.hsv.h, s: clamp((ev.clientX - r.left) / r.width, 0, 1), v: 1 - clamp((ev.clientY - r.top) / r.height, 0, 1) };
      setColor(i, fromHsv(hsv), { hsv, repaint: false });
    };
    move(e);
    sv.setPointerCapture(e.pointerId);
    sv.addEventListener('pointermove', move);
    sv.addEventListener('pointerup', () => {
      sv.removeEventListener('pointermove', move);
      paint();
    }, { once: true });
  });

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.note !== undefined) S.items[+t.dataset.note].note = t.value;
    if (t.dataset.hue !== undefined) {
      const hsv = { ...S.hsv, h: +t.value };
      setColor(+t.dataset.hue, fromHsv(hsv), { hsv, repaint: false });
    }
    if (t.dataset.colorval !== undefined) {
      const hex = parseColor(t.value);
      t.setAttribute('aria-invalid', String(!hex));
      if (hex) setColor(+t.dataset.colorval, hex, { repaint: false });
    }
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.hue !== undefined) paint();
    if (t.dataset.colorval !== undefined && parseColor(t.value)) paint();
    if (t.dataset.itemOption !== undefined) S.items[+t.dataset.itemOption].option = t.value;
    if (t.dataset.attachOn !== undefined) {
      const a = S.items[+t.dataset.attachOn];
      a.on = t.value;
      if (t.value === 'page') a.option = null;
      const k = onIndex(a);
      if (k !== null) a.option = S.items[k].option;
      paint();
    }
    if (t.dataset.cur !== undefined) {
      S.option = t.value;
      paint();
    }
  });

  document.addEventListener('keydown', (e) => {
    const typing = e.target.matches('textarea, input:not([type=range]), select');
    if (e.key === 'Escape') {
      if (S.editing !== null || S.tool) {
        e.preventDefault();
        S.editing = null;
        S.tool = null;
        return paint();
      }
      return;
    }
    const dot = e.target.closest?.('[data-svdot]');
    if (dot && e.key.startsWith('Arrow')) {
      e.preventDefault();
      const step = e.shiftKey ? 0.1 : 0.02;
      const hsv = { ...S.hsv };
      if (e.key === 'ArrowLeft') hsv.s = clamp(hsv.s - step, 0, 1);
      if (e.key === 'ArrowRight') hsv.s = clamp(hsv.s + step, 0, 1);
      if (e.key === 'ArrowUp') hsv.v = clamp(hsv.v + step, 0, 1);
      if (e.key === 'ArrowDown') hsv.v = clamp(hsv.v - step, 0, 1);
      return setColor(+dot.dataset.svdot, fromHsv(hsv), { hsv });
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toUpperCase();
    const tool = TOOLS.find((x) => x.key === k);
    if (tool) {
      e.preventDefault();
      return useTool(tool.id);
    }
    if (k === PANEL_KEY) {
      e.preventDefault();
      if (S.size === 'pane') S.paneTab = S.paneTab === 'feedback' ? 'canvas' : 'feedback';
      else S.panelOpen = !S.panelOpen;
      return paint();
    }
    if (e.key === 'Enter' && S.tool === 'pin' && !e.target.matches('button')) {
      e.preventDefault();
      return add({ type: 'pin', option: S.source === 'page' ? 'A' : S.option, fx: 0.5, fy: 0.5, note: '' });
    }
    const mark = e.target.closest?.('[data-mark]');
    if (mark && e.key.startsWith('Arrow') && S.items[+mark.dataset.mark].type === 'pin') {
      e.preventDefault();
      const p = S.items[+mark.dataset.mark];
      const step = e.shiftKey ? 0.05 : 0.01;
      if (e.key === 'ArrowLeft') p.fx = clamp(p.fx - step, 0, 1);
      if (e.key === 'ArrowRight') p.fx = clamp(p.fx + step, 0, 1);
      if (e.key === 'ArrowUp') p.fy = clamp(p.fy - step, 0, 1);
      if (e.key === 'ArrowDown') p.fy = clamp(p.fy + step, 0, 1);
      paint();
    }
  });

  if (S.editing !== null) S.hsv = S.items[S.editing].type === 'color' ? toHsv(S.items[S.editing].to) : null;
  paint();
})();
