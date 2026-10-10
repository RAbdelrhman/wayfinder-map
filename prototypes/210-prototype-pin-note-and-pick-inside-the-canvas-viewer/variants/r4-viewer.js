/*
  One page, three directions for pinning, noting and picking inside the approved ACF4 viewer.
  ?dir=D|E|F picks the direction. ?state=pin|review|posted|nobridge|snapshot sets where it opens,
  and ?size=full|pane sets the viewer size. Everything after that is clickable.
*/
(() => {
  const { canvas, opt, notesComment, pickComment, commentCard, where } = P210;
  const q = new URLSearchParams(location.search);
  // Round 4 option IDs D, E, F on the board; the code calls them A, B, C internally.
  const DIR = { D: 'A', E: 'B', F: 'C' }[q.get('dir')] ?? 'A';
  const START = q.get('state') ?? 'pin';
  const icon = (name) => Kit.icon(name);
  const esc = Kit.esc;

  const S = {
    size: q.get('size') === 'pane' ? 'pane' : 'full',
    source: START === 'nobridge' ? 'none' : START === 'snapshot' ? 'page' : 'dom',
    option: 'B',
    pins: [],
    pinMode: false,
    editing: null, // index of the pin whose note is open
    pick: null,
    picking: false, // A: the pick popover
    dialog: null, // A: 'review' | 'posted'
    panel: 'edit', // B: 'edit' | 'review' | 'posted'
    paneTab: 'feedback', // B, side pane only
    sheet: null, // C: 'review' | 'notes' | 'posted'
    include: new Set(), // C: pins that go out with the post
    posted: false,
    menu: false,
  };

  // Sample content per direction. Each one starts from the same canvas and the same two pins on B.
  const pinsFor = () => {
    const base = [
      { option: 'B', fx: 0.34, fy: 0.3, note: 'The hero card is too tall: the next ticket drops below the fold.' },
      { option: 'B', fx: 0.84, fy: 0.16, note: 'Keep the Trail · Hexes · Bar switch.' },
    ];
    if (S.source === 'page') return [{ option: 'A', fx: 0.5, fy: 0.42, note: 'Recovery cards need a status colour.' }];
    if (S.source === 'none') {
      if (DIR === 'A') return [];
      if (DIR === 'B') return [{ option: 'B', fx: null, fy: null, note: 'The hero card is too tall.' }];
      return [{ option: 'B', fx: 0.33, fy: 0.36, note: 'The hero card is too tall.', approximate: true }];
    }
    if (DIR === 'B') return [...base, { option: 'C', fx: null, fy: null, note: 'Too dense to scan at this size.' }];
    return [...base, { option: 'C', fx: 0.5, fy: 0.64, note: 'Too dense to scan at this size.' }];
  };
  S.pins = pinsFor();
  S.include = new Set(S.pins.map((_, i) => i));
  if (S.source === 'page') S.option = 'A';
  if (S.source !== 'none' || DIR !== 'A') S.pick = START === 'pin' && DIR === 'A' ? null : { option: S.option, note: "B, with C's denser In flight list." };
  if (S.source === 'page' && S.pick) S.pick.note = 'A, but keep the recovery cards.';
  if (START === 'pin') {
    if (DIR === 'A') S.editing = 1;
    if (DIR === 'C') S.editing = 0;
  }
  if (START === 'review' || START === 'posted') {
    S.pick = S.pick ?? { option: 'B', note: "B, with C's denser In flight list." };
    if (DIR === 'A') S.dialog = START;
    if (DIR === 'B') S.panel = START;
    if (DIR === 'C') S.sheet = START;
    S.posted = START === 'posted';
  }

  const kindOf = () => (S.source === 'page' ? 'page' : 'dom');
  const pinKind = (p) => (p.approximate ? 'window' : kindOf());
  const canPin = () => S.source !== 'none' || DIR === 'C';
  const canPick = () => S.source !== 'none' || DIR !== 'A';
  const live = (text) => (document.getElementById('live').textContent = text);
  const viewer = document.getElementById('viewer');
  const toolbar = document.getElementById('vw-toolbar');
  const stage = document.getElementById('stage');
  const dialog = document.getElementById('dialog');

  // ---------- toolbar: the real ACF4 markup, plus each direction's controls ----------

  function sizes() {
    const label = { full: 'Full window', pane: 'Side pane', float: 'Floating window' };
    return `<div class="segmented vw-sizes" role="group" aria-label="Canvas size">${['full', 'pane', 'float']
      .map((s) => `<button type="button" class="seg${s === S.size ? ' is-on' : ''}" data-size="${s}" aria-pressed="${s === S.size}" aria-label="${label[s]}" title="${label[s]}">${icon(s)}</button>`)
      .join('')}</div>`;
  }
  function options() {
    if (S.source === 'page') return `<span class="vw-status">Snapshot · option A from the tile</span>`;
    if (S.source === 'none') return `<span class="vw-status">View only</span>`;
    const opts = canvas.options;
    const seg = `<div class="segmented vw-options" role="group" aria-label="Show the board, or open one option full size"><button type="button" class="seg${S.option === null ? ' is-on' : ''}" data-go="" aria-pressed="${S.option === null}">Board</button>${opts
      .map((o) => `<button type="button" class="seg${S.option === o.id ? ' is-on' : ''}" data-go="${o.id}" aria-pressed="${S.option === o.id}" title="${esc(o.name)}">${o.id}</button>`)
      .join('')}</div>`;
    const page = `<div class="vw-menu-anchor"><button type="button" class="ghost" data-to="the page menu" aria-haspopup="menu" aria-expanded="false" aria-label="Canvas page: Home">Home${icon('chevron')}</button></div>`;
    const name = S.option ? `<span class="vw-optname">${esc(opt(S.option).name)}</span>` : '';
    return `${page}${seg}${name}`;
  }
  const count = () => S.pins.length;

  function toolsA(compact) {
    const pinOff = !canPin();
    const pickOff = !canPick() || (S.option === null && S.source !== 'page');
    const why = pinOff ? 'This canvas did not answer, so Wayfinder cannot tell where a pin lands.' : '';
    const pin = `<button type="button" class="ghost p210-tool${S.pinMode ? ' is-on' : ''}" data-act="pinmode" aria-label="Pin" aria-pressed="${S.pinMode}" ${pinOff ? `aria-disabled="true" title="${why}"` : 'title="Drop pins on the option (N)"'}>${icon('pin')}${compact ? '' : '<span class="vw-lbl">Pin</span><kbd>N</kbd>'}</button>`;
    const pick = `<div class="vw-menu-anchor"><button type="button" class="ghost p210-tool" data-act="pick" aria-label="Pick${S.option ? ` ${S.option}` : ''}" aria-haspopup="dialog" aria-expanded="${S.picking}" ${pickOff ? `aria-disabled="true" title="${S.option === null ? 'Open an option to pick it' : why}"` : ''}>${icon('flag')}${compact ? '' : `<span class="vw-lbl">Pick${S.option && !pickOff ? ` ${S.option}` : ''}…</span>`}</button>${S.picking ? pickPopoverA() : ''}</div>`;
    const review = count() || S.pick
      ? `<button type="button" class="ghost p210-tool p210-count" data-act="review">${icon('send')}<span>${count()} ${count() === 1 ? 'note' : 'notes'}${S.pick ? ` · pick ${S.pick.option}` : ''}</span><span class="p210-sep">Review</span></button>`
      : '';
    const fallback = S.source === 'none'
      ? `<span class="p210-chip is-warn" title="${why}">${icon('info')}Pins and picking are off: this canvas did not answer.</span><a class="ghost" href="#" data-to="GitHub issue #43">Pick in #43${icon('external')}</a>`
      : '';
    return { left: `<span class="vw-sep"></span>${fallback || pin + pick}`, right: S.posted ? `<span class="p210-chip is-ok">${icon('check')}Posted</span>` : review };
  }
  function toolsB() {
    const n = count() + (S.pick ? 1 : 0);
    return {
      left: '',
      right: `<button type="button" class="ghost p210-tool${S.panelOpen !== false ? ' is-on' : ''}" data-act="panel" aria-pressed="${S.panelOpen !== false}" aria-controls="p210-panel">${icon('panel')}<span class="vw-lbl">Feedback</span>${n ? `<span class="badge p210-badge">${n}</span>` : ''}</button>`,
    };
  }
  function toolsC() {
    return { left: '', right: S.posted ? `<span class="p210-chip is-ok">${icon('check')}Posted</span>` : '' };
  }

  function toolbarHtml() {
    const compact = S.size !== 'full';
    const t = DIR === 'A' ? toolsA(compact) : DIR === 'B' ? toolsB() : toolsC();
    const title = `<span class="vw-title" id="vw-title">${icon('beaker')}<span class="vw-title-t">${esc(canvas.title)}</span></span>`;
    const gh = `<a class="iconbtn" href="#" data-to="the branch on GitHub" aria-label="Open the branch on GitHub">${icon('external')}</a>`;
    if (!compact) {
      const close = `<button type="button" class="ghost vw-close" data-to="the map (closes the canvas)" aria-label="Close the canvas">${icon('close')}<span class="vw-lbl">Close</span><kbd>Esc</kbd></button>`;
      return `<div class="vw-bar is-a">${close}${title}<span class="vw-sep"></span>${options()}${t.left}<span class="topbar-spacer"></span>${t.right}${gh}${sizes()}</div>`;
    }
    const close = `<button type="button" class="iconbtn vw-close" data-to="the map (closes the canvas)" aria-label="Close the canvas">${icon('close')}</button>`;
    const tabs = DIR === 'B'
      ? `<div class="segmented p210-tabs" role="tablist" aria-label="Pane view"><button type="button" role="tab" class="seg${S.paneTab === 'canvas' ? ' is-on' : ''}" aria-selected="${S.paneTab === 'canvas'}" data-tab="canvas">Canvas</button><button type="button" role="tab" class="seg${S.paneTab === 'feedback' ? ' is-on' : ''}" aria-selected="${S.paneTab === 'feedback'}" data-tab="feedback">Feedback${count() + (S.pick ? 1 : 0) ? ` <span class="badge p210-badge">${count() + (S.pick ? 1 : 0)}</span>` : ''}</button></div>`
      : '';
    return `<div class="vw-bar is-c"><div class="vw-c-row">${title}<span class="topbar-spacer"></span>${gh}${sizes()}${close}</div><div class="vw-c-row">${options()}${DIR === 'A' ? t.left + '<span class="topbar-spacer"></span>' + t.right : ''}${tabs}</div></div>`;
  }

  // ---------- the canvas inside the frame, and pins over it ----------

  function pinHtml(p, i) {
    if (p.fx === null) return '';
    const posted = S.posted ? ' is-posted' : '';
    const shape = DIR === 'C' ? ' is-drop' : '';
    const approx = p.approximate ? ' is-approx' : '';
    return `<button type="button" class="p210-pin${shape}${posted}${approx}${S.editing === i ? ' is-open' : ''}" style="left:${p.fx * 100}%;top:${p.fy * 100}%" data-pin="${i}" aria-label="Pin ${i + 1}${p.approximate ? ', approximate' : ''}: ${esc((p.note || "no note yet").replace(/\.$/, ''))}. Arrow keys move it."><span>${p.approximate ? '≈' : ''}${i + 1}</span></button>`;
  }
  function notePopover(i) {
    const p = S.pins[i];
    if (!p || p.fx === null) return '';
    const left = p.fx > 0.62;
    const o = opt(p.option);
    const optionField = S.source === 'page'
      ? `<label class="p210-field">Option<select class="input" data-pin-option="${i}">${canvas.options.map((x) => `<option value="${x.id}"${x.id === p.option ? ' selected' : ''}>${x.id} · ${esc(x.name)}</option>`).join('')}</select></label>`
      : '';
    return `<div class="p210-pop${left ? ' is-left' : ''}${DIR === 'C' ? ' is-bubble' : ''}" style="left:${p.fx * 100}%;top:${p.fy * 100}%" role="dialog" aria-label="Note for pin ${i + 1}">
      <div class="p210-pop-head"><b>Pin ${i + 1}</b><span>${S.source === 'page' ? 'Snapshot page' : `${o.id} · ${esc(o.name)}`} · ${esc(where({ ...p, kind: pinKind(p) }))}</span></div>
      ${optionField}
      <textarea class="input" rows="3" data-note="${i}" aria-label="Note for pin ${i + 1}" placeholder="What should change here?">${esc(p.note)}</textarea>
      <div class="p210-pop-foot"><button type="button" class="iconbtn" data-del="${i}" aria-label="Delete pin ${i + 1}">${icon('trash')}</button><span class="topbar-spacer"></span><button type="button" class="primary" data-act="done">Done</button></div>
    </div>`;
  }
  function pickPopoverA() {
    const o = opt(S.pick?.option ?? S.option ?? 'A');
    const mine = S.pins.filter((p) => p.option === o.id).length;
    return `<div class="vw-menu p210-pickpop" role="dialog" aria-label="Pick ${o.id}">
      <b>Pick ${o.id} · ${esc(o.name)}</b>
      <span class="p210-muted">Posts one comment on #${canvas.pickTicket.number}. The ticket stays open.</span>
      <textarea class="input" rows="3" data-picknote aria-label="Note for the pick (optional)" placeholder="Why this one? (optional)">${esc(S.pick?.note ?? '')}</textarea>
      <span class="p210-muted">${mine ? `Your ${mine} ${mine === 1 ? 'pin' : 'pins'} on ${o.id} go with it.` : `No pins on ${o.id}.`}</span>
      <div class="p210-pop-foot"><button type="button" class="ghost" data-act="pick-cancel">Cancel</button><span class="topbar-spacer"></span><button type="button" class="primary" data-act="pick-save">Review</button></div>
    </div>`;
  }

  function canvasHtml() {
    if (S.source === 'page')
      return `<div class="p210-cv is-page"><div class="p210-cv-body"><div class="p210-opt" id="opt"><img src="${canvas.snapshot.img}" alt="Snapshot: Desktop launch and recovery states" />${pinsLayer()}</div></div></div>`;
    const engine = `<div class="p210-engine" aria-hidden="true"><span>← Canvas</span><span class="p210-engine-tabs">${canvas.options.map((o) => `<i${o.id === S.option ? ' class="is-on"' : ''}>${o.id}</i>`).join('')}</span><span class="topbar-spacer"></span><span>Notes</span><span>↗</span></div>`;
    if (S.option === null)
      return `<div class="p210-cv"><div class="p210-cv-body is-board"><img src="${canvas.board}" alt="The canvas board with every option" /></div>${hintBoard()}</div>`;
    return `<div class="p210-cv${S.pinMode ? ' is-pinning' : ''}">${engine}<div class="p210-cv-body"><div class="p210-opt" id="opt"><img src="${opt(S.option).img}" alt="Option ${S.option}: ${esc(opt(S.option).name)}" />${pinsLayer()}</div></div>${S.pinMode ? `<div class="p210-hint" role="status">${icon('pin')}Click the option to drop a pin. Enter drops one in the middle; arrow keys move it. <kbd>Esc</kbd> stops.</div>` : ''}</div>`;
  }
  const hintBoard = () => `<div class="p210-hint is-soft" role="status">${icon('info')}Open an option to pin or pick it.</div>`;
  function pinsLayer() {
    const shown = S.pins.map((p, i) => [p, i]).filter(([p]) => S.source === 'page' || p.option === S.option || p.approximate);
    const layer = shown.map(([p, i]) => pinHtml(p, i)).join('');
    const pop = S.editing !== null && !S.posted && shown.some(([, i]) => i === S.editing) ? notePopover(S.editing) : '';
    return `<div class="p210-pins">${layer}${pop}</div>`;
  }

  // ---------- review and posted: the same two comments, three ways of getting there ----------

  function cards(posted) {
    const out = [];
    const kind = kindOf();
    const pins = DIR === 'C' ? S.pins.filter((_, i) => S.include.has(i)) : S.pins;
    const sendNotes = DIR !== 'C' || S.sheet !== 'review' || pins.length;
    const withKinds = pins.map((p) => ({ ...p, kind: pinKind(p) }));
    if (sendNotes && pins.length)
      out.push(commentCard(canvas.protoTicket, notesWith(withKinds, kind), { posted, id: 'notes' }));
    if (S.pick && (DIR !== 'C' || S.sheet !== 'notes'))
      out.push(commentCard(canvas.pickTicket, pickWith(withKinds, kind), { posted, id: 'pick' }));
    return out;
  }
  const notesWith = (pins, kind) => notesComment(pins, kind);
  const pickWith = (pins, kind) => pickComment(S.pick, pins, kind);
  const postLabel = () => {
    const n = (count() ? 1 : 0) + (S.pick ? 1 : 0);
    return n === 2 ? 'Post 2 comments' : S.pick ? `Post to #${canvas.pickTicket.number}` : `Post to #${canvas.protoTicket.number}`;
  };

  function dialogA() {
    if (!S.dialog) return '';
    if (S.dialog === 'posted')
      return `<header class="p210-dialog-head"><span class="p210-ok">${icon('check')}</span><div><h2 id="dialog-title">Posted to GitHub</h2><p>#${canvas.pickTicket.number} stays open. The grilling session records the decision with you.</p></div></header>
        <div class="p210-dialog-body">${cards(true).join('')}</div>
        <footer class="p210-dialog-foot"><span class="topbar-spacer"></span><button type="button" class="primary" data-act="close-dialog">Back to the canvas</button></footer>`;
    return `<header class="p210-dialog-head"><div><h2 id="dialog-title">Review before posting</h2><p>This is exactly what goes to GitHub. Nothing is posted until you press ${postLabel()}.</p></div></header>
      <div class="p210-dialog-body">${cards(false).join('')}</div>
      <footer class="p210-dialog-foot"><button type="button" class="ghost" data-act="close-dialog">Back to edit</button><span class="topbar-spacer"></span><button type="button" class="primary" data-act="post" autofocus>${icon('send')}${postLabel()}</button></footer>`;
  }

  function panelB() {
    if (S.panel === 'review')
      return `<header class="p210-panel-head"><button type="button" class="iconbtn" data-act="panel-edit" aria-label="Back to edit">${icon('left')}</button><h2>Review before posting</h2></header>
        <div class="p210-panel-body"><p class="p210-muted">Exactly what goes to GitHub. Pins stay on the canvas while you read.</p>${cards(false).join('')}</div>
        <footer class="p210-panel-foot"><button type="button" class="ghost" data-act="panel-edit">Edit</button><span class="topbar-spacer"></span><button type="button" class="primary" data-act="post" autofocus>${icon('send')}${postLabel()}</button></footer>`;
    if (S.panel === 'posted')
      return `<header class="p210-panel-head"><span class="p210-ok">${icon('check')}</span><h2>Posted</h2></header>
        <div class="p210-panel-body"><p class="p210-muted">#${canvas.pickTicket.number} stays open. The grilling session records the decision with you.</p>${cards(true).join('')}</div>
        <footer class="p210-panel-foot"><span class="topbar-spacer"></span><button type="button" class="primary" data-act="panel-fresh">Start new feedback</button></footer>`;
    const cur = S.option ?? 'A';
    const groups = canvas.options
      .map((o) => {
        const rows = S.pins.map((p, i) => [p, i]).filter(([p]) => p.option === o.id);
        if (!rows.length && o.id !== cur) return '';
        return `<section class="p210-group"><h4>${o.id} · ${esc(o.name)}${o.id === S.option ? ' <span class="p210-tag">Showing</span>' : ''}</h4>
          ${rows.map(([p, i]) => `<div class="p210-row">${p.fx === null ? `<span class="p210-dot is-note" aria-hidden="true">${icon('note')}</span>` : `<span class="p210-dot" aria-hidden="true">${i + 1}</span>`}<textarea class="input" rows="2" data-note="${i}" aria-label="${p.fx === null ? `Note on ${o.id}` : `Note for pin ${i + 1}`}">${esc(p.note)}</textarea><button type="button" class="iconbtn" data-del="${i}" aria-label="Delete">${icon('trash')}</button></div>`).join('')}
        </section>`;
      })
      .join('');
    const pinOff = !canPin() || S.option === null;
    const chooser = S.source === 'none'
      ? `<label class="p210-field">Which option is showing? This canvas does not say.<select class="input" data-cur>${canvas.options.map((x) => `<option value="${x.id}"${x.id === cur ? ' selected' : ''}>${x.id} · ${esc(x.name)}</option>`).join('')}</select></label>`
      : '';
    const addRow = `${chooser}<div class="p210-add"><button type="button" class="ghost${S.pinMode ? ' is-on' : ''}" data-act="pinmode" aria-pressed="${S.pinMode}"${pinOff ? ` aria-disabled="true" title="${S.source === 'none' ? 'This canvas did not answer, so pins are off. Notes still work.' : 'Open an option first'}"` : ''}>${icon('pin')}Pin on ${cur}</button><button type="button" class="ghost" data-act="note-option"${S.option === null ? ' aria-disabled="true" title="Open an option first"' : ''}>${icon('note')}Note on ${cur}</button></div>`;
    const picks = `<div class="p210-picks" role="radiogroup" aria-label="Pick an option">${canvas.options
      .map((o) => `<button type="button" role="radio" aria-checked="${S.pick?.option === o.id}" class="p210-pickrow${S.pick?.option === o.id ? ' is-on' : ''}" data-pickopt="${o.id}"><span class="p210-radio" aria-hidden="true"></span><b>${o.id}</b> ${esc(o.name)}</button>`)
      .join('')}</div>${S.pick ? `<textarea class="input" rows="2" data-picknote aria-label="Note for the pick (optional)" placeholder="Why this one? (optional)">${esc(S.pick.note)}</textarea><button type="button" class="p210-link" data-act="unpick">Clear the pick</button>` : ''}`;
    const warn = S.source === 'none' ? `<div class="p210-banner">${icon('info')}<span>This canvas did not answer, so pins are off. Notes attach to a whole option, from Wayfinder's own option list.</span></div>` : '';
    const total = count() + (S.pick ? 1 : 0);
    return `<header class="p210-panel-head"><h2>Feedback</h2><span class="p210-muted">#${canvas.protoTicket.number} notes · #${canvas.pickTicket.number} pick</span></header>
      <div class="p210-panel-body">${warn}
        <h3 class="eyebrow">Notes</h3>${groups}${addRow}
        <h3 class="eyebrow">Pick</h3>${picks}
      </div>
      <footer class="p210-panel-foot"><span class="p210-muted">${count()} ${count() === 1 ? 'note' : 'notes'}${S.pick ? ` · pick ${S.pick.option}` : ''}</span><span class="topbar-spacer"></span><button type="button" class="primary" data-act="panel-review"${total ? '' : ' disabled title="Add a note or pick first"'}>Review</button></footer>`;
  }

  function barC() {
    if (S.sheet) return '';
    if (S.option === null && S.source !== 'page') return '';
    const o = opt(S.source === 'page' ? 'A' : S.option);
    const compact = S.size !== 'full';
    const approx = S.source === 'none';
    const optSel = approx
      ? `<label class="p210-barsel">${icon('info')}<span class="vw-lbl">Option</span><select class="input" data-cur aria-label="Which option is showing (this canvas does not say)">${canvas.options.map((x) => `<option value="${x.id}"${x.id === o.id ? ' selected' : ''}>${x.id} · ${esc(x.name)}</option>`).join('')}</select></label>`
      : `<span class="p210-barname"><b>${o.id}</b>${compact ? '' : ` · ${esc(o.name)}`}</span>`;
    return `<div class="p210-bar${compact ? ' is-compact' : ''}" role="toolbar" aria-label="Pin and pick">
      ${optSel}<span class="p210-bar-sep"></span>
      <button type="button" class="ghost${S.pinMode ? ' is-on' : ''}" data-act="pinmode" aria-label="${approx ? 'Pin (approximate)' : 'Add pin'}" aria-pressed="${S.pinMode}" title="${approx ? 'Pins mark the viewer window: this canvas does not report options' : 'Add a pin (N)'}">${icon('pin')}${compact ? '' : approx ? 'Pin (approximate)' : 'Add pin'}</button>
      <button type="button" class="ghost" data-act="sheet-notes" aria-label="${count()} notes, review">${icon('note')}${count()}</button>
      <button type="button" class="primary" data-act="sheet-review">${icon('flag')}Pick ${o.id}</button>
    </div>`;
  }
  function sheetC() {
    if (!S.sheet) return '';
    if (S.sheet === 'posted')
      return `<header class="p210-panel-head"><span class="p210-ok">${icon('check')}</span><h2>Posted to GitHub</h2><span class="topbar-spacer"></span><button type="button" class="iconbtn" data-act="sheet-close" aria-label="Close">${icon('close')}</button></header>
        <div class="p210-panel-body"><p class="p210-muted">#${canvas.pickTicket.number} stays open. The grilling session records the decision with you.</p>${cards(true).join('')}</div>
        <footer class="p210-panel-foot"><span class="topbar-spacer"></span><button type="button" class="primary" data-act="sheet-close">Back to the canvas</button></footer>`;
    const notesOnly = S.sheet === 'notes';
    const o = opt(S.pick?.option ?? S.option ?? 'A');
    const pickPart = notesOnly
      ? ''
      : `<h3 class="eyebrow">1 · Your pick</h3><div class="p210-pickcard"><img src="${o.img}" alt="" /><div><b>${o.id} · ${esc(o.name)}</b><span class="p210-muted">Posts on #${canvas.pickTicket.number}. It stays open.</span></div></div>
        <textarea class="input" rows="2" data-picknote aria-label="Note for the pick (optional)" placeholder="Why this one? (optional)">${esc(S.pick?.note ?? '')}</textarea>`;
    const list = S.pins
      .map((p, i) => `<label class="p210-check"><input type="checkbox" data-inc="${i}"${S.include.has(i) ? ' checked' : ''} /><span class="p210-dot${p.approximate ? ' is-approx' : ''}" aria-hidden="true">${p.approximate ? '≈' : ''}${i + 1}</span><span><b>${p.option}</b> ${esc(p.note)}</span></label>`)
      .join('');
    return `<header class="p210-panel-head"><h2>${notesOnly ? 'Post your notes' : `Pick ${o.id} and post`}</h2><span class="topbar-spacer"></span><button type="button" class="iconbtn" data-act="sheet-close" aria-label="Close">${icon('close')}</button></header>
      <div class="p210-panel-body">${pickPart}
        <h3 class="eyebrow">${notesOnly ? '1' : '2'} · Notes for #${canvas.protoTicket.number}</h3>${list || '<p class="p210-muted">No pins yet.</p>'}
        <h3 class="eyebrow">${notesOnly ? '2' : '3'} · What GitHub will show</h3>${cards(false).join('') || '<p class="p210-muted">Nothing to post.</p>'}
      </div>
      <footer class="p210-panel-foot">${notesOnly ? '' : `<button type="button" class="ghost" data-act="post-notes"${S.include.size ? '' : ' disabled'}>Post notes only</button>`}<span class="topbar-spacer"></span><button type="button" class="primary" data-act="post" autofocus>${icon('send')}${notesOnly ? `Post to #${canvas.protoTicket.number}` : S.include.size ? 'Post pick and notes' : 'Post pick'}</button></footer>`;
  }

  // ---------- paint ----------

  function paint() {
    const focus = document.activeElement;
    const key = focus && focus !== document.body ? [...focus.attributes].find((a) => a.name.startsWith('data-')) : null;
    if (S.dialog === null && DIR === 'A' && dialog.open) dialog.close();
    viewer.className = `vw ${S.size === 'full' ? 'is-a' : 'is-c'} p210-dir-${DIR}`;
    document.body.classList.toggle('has-pane', S.size === 'pane');
    viewer.setAttribute('role', S.size === 'full' ? 'dialog' : 'region');
    toolbar.innerHTML = toolbarHtml();
    if (DIR === 'B') {
      const showPanel = S.size === 'pane' ? S.paneTab === 'feedback' : S.panelOpen !== false;
      const showCanvas = S.size !== 'pane' || S.paneTab === 'canvas';
      stage.innerHTML = `<div class="p210-split${showPanel && showCanvas ? ' has-panel' : ''}">${showCanvas ? canvasHtml() : ''}${showPanel ? `<aside class="p210-panel" id="p210-panel" aria-label="Feedback">${panelB()}</aside>` : ''}</div>`;
    } else if (DIR === 'C') {
      stage.innerHTML = `${canvasHtml()}${barC()}${S.sheet ? `<div class="p210-scrim" data-act="sheet-close"></div><aside class="p210-sheet" role="dialog" aria-modal="true" aria-label="Pick and post">${sheetC()}</aside>` : ''}`;
    } else {
      stage.innerHTML = canvasHtml();
      dialog.innerHTML = dialogA();
      if (S.dialog && !dialog.open) dialog.showModal();
    }
    Kit.fillIcons(document);
    layout();
    if (key) {
      const again = [...document.querySelectorAll(`[${key.name}]`)].find((el) => el.getAttribute(key.name) === key.value);
      again?.focus({ preventScroll: true });
    }
  }

  // Fit the option at 16:9 inside the stage, the way the engine's present view does.
  function layout() {
    const box = document.getElementById('opt');
    if (!box) return;
    const body = box.parentElement;
    const w = body.clientWidth - 24,
      h = body.clientHeight - 24;
    const ratio = S.source === 'page' ? 16 / 9 : 16 / 9;
    const width = Math.min(w, h * ratio);
    box.style.width = `${width}px`;
    box.style.height = `${width / ratio}px`;
  }
  addEventListener('resize', layout);

  // ---------- interaction ----------

  const disabled = (el) => el.getAttribute('aria-disabled') === 'true' || el.disabled;
  function addPin(fx, fy) {
    const pin = { option: S.source === 'page' ? 'A' : S.option, fx, fy, note: '' };
    if (S.source === 'none') pin.approximate = true;
    S.pins.push(pin);
    S.include.add(S.pins.length - 1);
    S.editing = S.pins.length - 1;
    S.posted = false;
    live(`Pin ${S.pins.length} dropped. Write its note.`);
    paint();
    document.querySelector(`[data-note="${S.editing}"]`)?.focus();
  }
  function post() {
    S.posted = true;
    S.editing = null;
    if (DIR === 'A') S.dialog = 'posted';
    if (DIR === 'B') S.panel = 'posted';
    if (DIR === 'C') S.sheet = 'posted';
    live('Posted to GitHub.');
    paint();
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-act], .p210-opt, .p210-scrim');
    if (!t) return;
    if (t.matches('[data-to]')) return;
    const act = t.dataset.act;
    if (t.dataset.size) {
      S.size = t.dataset.size === 'float' ? S.size : t.dataset.size;
      if (t.dataset.size === 'float') Kit.toast('The floating window works the same as the side pane here');
      return paint();
    }
    if (t.dataset.go !== undefined) {
      S.option = t.dataset.go || null;
      S.pinMode = false;
      S.editing = null;
      S.picking = false;
      return paint();
    }
    if (t.dataset.tab) {
      S.paneTab = t.dataset.tab;
      return paint();
    }
    if (t.dataset.view) {
      const md = t.dataset.view === 'markdown';
      document.querySelector(`[data-body="${t.dataset.card}"]`).hidden = md;
      document.querySelector(`[data-md="${t.dataset.card}"]`).hidden = !md;
      t.parentElement.querySelectorAll('.seg').forEach((b) => {
        b.classList.toggle('is-on', b === t);
        b.setAttribute('aria-pressed', String(b === t));
      });
      return;
    }
    if (t.dataset.pin !== undefined) {
      S.editing = S.editing === +t.dataset.pin ? null : +t.dataset.pin;
      return paint();
    }
    if (t.dataset.del !== undefined) {
      const i = +t.dataset.del;
      S.pins.splice(i, 1);
      S.include = new Set(S.pins.map((_, k) => k));
      S.editing = null;
      live('Pin deleted.');
      return paint();
    }
    if (t.dataset.pickopt) {
      S.pick = { option: t.dataset.pickopt, note: S.pick?.note ?? '' };
      return paint();
    }
    if (t.classList.contains('p210-opt')) {
      if (!S.pinMode) return;
      const r = t.getBoundingClientRect();
      return addPin((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    }
    if (act && disabled(t)) {
      Kit.toast(t.title || 'Not available here');
      return;
    }
    switch (act) {
      case 'pinmode':
        S.pinMode = !S.pinMode;
        S.editing = null;
        if (DIR === 'B' && S.size === 'pane') S.paneTab = 'canvas';
        return paint();
      case 'done':
        S.editing = null;
        return paint();
      case 'pick':
        S.picking = !S.picking;
        S.pick = S.pick ?? { option: S.option ?? 'A', note: '' };
        if (S.pick.option !== S.option && S.option) S.pick.option = S.option;
        paint();
        return document.querySelector('[data-picknote]')?.focus();
      case 'pick-cancel':
        S.picking = false;
        if (!S.pick?.note) S.pick = null;
        return paint();
      case 'pick-save':
        S.picking = false;
        S.dialog = 'review';
        return paint();
      case 'review':
        S.dialog = S.posted ? 'posted' : 'review';
        S.picking = false;
        return paint();
      case 'close-dialog':
        S.dialog = null;
        if (S.posted) {
          S.pins = [];
          S.pick = null;
          S.posted = false;
        }
        return paint();
      case 'post':
        return post();
      case 'post-notes':
        S.pick = null;
        return post();
      case 'panel':
        S.panelOpen = S.panelOpen === false;
        return paint();
      case 'panel-review':
        S.panel = 'review';
        S.pinMode = false;
        return paint();
      case 'panel-edit':
        S.panel = 'edit';
        return paint();
      case 'panel-fresh':
        S.panel = 'edit';
        S.pins = [];
        S.pick = null;
        S.posted = false;
        return paint();
      case 'note-option':
        S.pins.push({ option: S.option, fx: null, fy: null, note: '' });
        paint();
        return document.querySelector(`[data-note="${S.pins.length - 1}"]`)?.focus();
      case 'unpick':
        S.pick = null;
        return paint();
      case 'sheet-review':
        S.pick = { option: S.source === 'page' ? 'A' : S.option, note: S.pick?.note ?? '' };
        S.sheet = 'review';
        S.editing = null;
        S.pinMode = false;
        return paint();
      case 'sheet-notes':
        S.sheet = 'notes';
        S.editing = null;
        return paint();
      case 'sheet-close':
        if (S.sheet === 'posted') {
          S.pins = [];
          S.pick = null;
          S.posted = false;
          S.include = new Set();
        }
        S.sheet = null;
        return paint();
    }
  });

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.note !== undefined) S.pins[+t.dataset.note].note = t.value;
    if (t.dataset.picknote !== undefined && S.pick) S.pick.note = t.value;
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.inc !== undefined) {
      t.checked ? S.include.add(+t.dataset.inc) : S.include.delete(+t.dataset.inc);
      paint();
    }
    if (t.dataset.pinOption !== undefined) S.pins[+t.dataset.pinOption].option = t.value;
    if (t.dataset.cur !== undefined) {
      S.option = t.value;
      paint();
    }
  });

  document.addEventListener('keydown', (e) => {
    const typing = e.target.matches('textarea, input, select');
    if (e.key === 'Escape') {
      if (S.editing !== null || S.pinMode || S.picking || S.sheet) {
        e.preventDefault();
        S.editing = null;
        S.pinMode = false;
        S.picking = false;
        if (S.sheet && S.sheet !== 'posted') S.sheet = null;
        return paint();
      }
      return;
    }
    if (typing) return;
    if ((e.key === 'n' || e.key === 'N') && canPin() && S.option !== null) {
      S.pinMode = !S.pinMode;
      return paint();
    }
    if (e.key === 'Enter' && S.pinMode && !e.target.matches('button')) {
      e.preventDefault();
      return addPin(0.5, 0.5);
    }
    const pin = e.target.closest?.('[data-pin]');
    if (pin && e.key.startsWith('Arrow')) {
      e.preventDefault();
      const p = S.pins[+pin.dataset.pin];
      const step = e.shiftKey ? 0.05 : 0.01;
      if (e.key === 'ArrowLeft') p.fx = Math.max(0, p.fx - step);
      if (e.key === 'ArrowRight') p.fx = Math.min(1, p.fx + step);
      if (e.key === 'ArrowUp') p.fy = Math.max(0, p.fy - step);
      if (e.key === 'ArrowDown') p.fy = Math.min(1, p.fy + step);
      paint();
    }
  });
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    S.dialog = null;
    paint();
  });

  paint();
})();
