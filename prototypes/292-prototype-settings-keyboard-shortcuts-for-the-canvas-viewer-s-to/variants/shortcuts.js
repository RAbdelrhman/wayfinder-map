/*
  #292: Settings › Keyboard shortcuts for the canvas viewer's five tool keys.
  ?dir=a  A · the list is the editor: each row's key is a button that records a new one.
  ?dir=b  B · a read-only list beside one focused editor for the chosen key.
  ?dir=c  C · round 2: B's compact rows that record in place like A, without the extra headings.
  ?start=viewer opens in the viewer, whose Shortcuts button lands on Settings; Back to canvas
  returns to the same option, tool and panel. ?state=land|capture|saved|clash|reset opens Settings
  in that state for the board. Every change stays in this page.
*/
(() => {
  const { TOOLS, NAME, defaults, label, spoken, kbd, same, read, matches } = P292;
  const q = new URLSearchParams(location.search);
  const requestedDirection = q.get('dir');
  // Only fixed literals enter generated HTML; never return query text after validation.
  const DIR = requestedDirection === 'b' ? 'b' : requestedDirection === 'c' ? 'c' : requestedDirection === 'd' ? 'd' : 'a';
  const STATE = q.get('state');
  const STATIC = STATE !== null;
  const icon = (name) => Kit.icon(name);
  const esc = Kit.esc;
  const TOOL = Object.fromEntries(TOOLS.map((t) => [t.id, t]));

  const CANVAS = {
    title: 'Home redesign',
    page: 'Directions',
    options: [
      { id: 'A', name: 'A · Today first', img: '43-A.jpg' },
      { id: 'B', name: 'B · Next up', img: '43-B.jpg' },
    ],
  };

  const S = {
    view: q.get('start') === 'viewer' ? 'viewer' : 'settings',
    keys: defaults(),
    /** The tool whose key is being recorded, and the modifiers held so far. */
    capturing: null,
    pending: [],
    /** A key that was refused: { tool, text, owner } where owner is the tool that has it. */
    error: null,
    /** The last saved change: { tool | 'all', text }. */
    saved: null,
    /** B: the tool in the editor. */
    selected: 'pin',
    /** Reached through the viewer's Shortcuts button, so Settings offers Back to canvas. */
    arrived: q.get('start') !== 'viewer',
    arriving: false,
    /** What Back to canvas restores. */
    viewer: { option: 'B', tool: 'pin', panel: true },
  };
  const V = S.viewer;

  if (STATE === 'land') S.arriving = true;
  if (STATE === 'capture') S.capturing = 'pin';
  if (STATE === 'saved') {
    S.keys.pin = { key: 'P', shift: true };
    S.saved = { tool: 'pin', text: 'Pin is now Shift+P' };
  }
  if (STATE === 'clash') {
    S.capturing = 'pin';
    S.error = { tool: 'pin', owner: 'color', text: 'C is already Color picker.' };
  }
  if (STATE === 'reset') {
    S.keys.pin = { key: 'P', shift: true };
    S.keys.note = { key: 'M' };
  }
  if (STATE === 'reset-one') S.keys.pin = { key: 'P', shift: true };

  const ariaKeys = (b) => [b.ctrl && 'Control', b.alt && 'Alt', b.shift && 'Shift', b.key].filter(Boolean).join('+');
  const changed = (id) => !same(S.keys[id], TOOL[id].key);
  const allDefault = () => TOOLS.every((t) => !changed(t.id));
  const $ = (selector) => document.querySelector(selector);

  let liveTimer;
  function announce(text) {
    const live = $('#live');
    live.textContent = '';
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => (live.textContent = text), 40);
  }
  let savedTimer;
  function showSaved(saved) {
    S.saved = saved;
    clearTimeout(savedTimer);
    if (!STATIC) savedTimer = setTimeout(() => { S.saved = null; paint(); }, 5000);
  }

  // ---------- Settings ----------
  const CATEGORIES = [
    ['appearance', 'Appearance', 'moon'],
    ['shortcuts', 'Keyboard shortcuts', 'keyboard'],
    ['tasks', 'Tasks & models', 'sliders'],
    ['notifications', 'Notifications', 'bell'],
    ['progress', 'Progress', 'map'],
    ['account', 'Account', 'person'],
    ['help', 'Help', 'help'],
  ];
  const nav = () =>
    CATEGORIES.map(([id, name, ic]) =>
      id === 'shortcuts'
        ? `<a href="#" aria-current="location" data-category="shortcuts">${icon(ic)}${name}</a>`
        : `<a href="#" data-to="Settings › ${name}">${icon(ic)}${name}</a>`,
    ).join('');

  const helpLine = (t) => {
    const err = S.error?.tool === t.id ? S.error : null;
    const fix = err?.owner ? ` <button type="button" class="linkish k292-fix" data-fix="${err.owner}">Change ${esc(NAME[err.owner])} instead</button>` : '';
    return err
      ? `<p class="k292-help is-error" id="k-help-${t.id}">${icon('alert')}<span>${esc(err.text)} Press another key, or <kbd>Esc</kbd> to keep ${esc(label(S.keys[t.id]))}.${fix}</span></p>`
      : `<p class="k292-help" id="k-help-${t.id}"><span>Press a letter, or Shift, Alt or Ctrl with a letter. <kbd>Esc</kbd> cancels.</span></p>`;
  };
  const listening = () =>
    S.pending.length
      ? `${S.pending.map((m) => `<kbd>${esc(m)}</kbd>`).join('<span class="k292-plus" aria-hidden="true">+</span>')}<span class="k292-plus" aria-hidden="true">+</span><span class="k292-wait">…</span>`
      : '<span class="k292-wait">Press a key…</span>';

  // A · the list is the editor.
  function rowA(t) {
    const b = S.keys[t.id];
    const cap = S.capturing === t.id;
    const err = S.error?.tool === t.id;
    const saved = S.saved && (S.saved.tool === t.id || S.saved.tool === 'all');
    const key = cap
      ? `<button type="button" class="k292-key is-capturing" data-edit="${t.id}" aria-describedby="k-help-${t.id}" aria-label="Recording a new ${t.name} shortcut. Now ${spoken(b)}.">${listening()}</button>`
      : `<button type="button" class="k292-key" data-edit="${t.id}" aria-label="${t.name} shortcut, ${spoken(b)}. Change">${kbd(b)}<span class="k292-change" aria-hidden="true">Change</span></button>`;
    const status = cap
      ? ''
      : saved
        ? `<span class="cf-chip is-ok k292-chip">${icon('check')}Saved</span>`
        : changed(t.id)
          ? `<span class="k292-default">Default ${kbd(t.key)}</span>`
          : '';
    return `<li class="k292-item${cap ? ' is-capturing' : ''}${err ? ' is-error' : ''}"><div class="settings-row k292-row"><span class="k292-icon">${icon(t.icon)}</span><span class="grow">${t.name}<span class="hint">${t.hint}</span></span>${status}${key}</div>${cap ? helpLine(t) : ''}</li>`;
  }

  // B · a list that picks, and one editor for the picked key.
  function pickB(t) {
    const on = S.selected === t.id;
    return `<button type="button" class="k292-pick-row${on ? ' is-on' : ''}" data-select="${t.id}" aria-pressed="${on}" aria-controls="k-editor"><span class="k292-icon">${icon(t.icon)}</span><span class="grow">${t.name}</span>${changed(t.id) ? '<span class="k292-dot" aria-hidden="true"></span><span class="k292-sr">, changed from the default,</span>' : ''}<span class="k292-pick-key">${kbd(S.keys[t.id])}</span></button>`;
  }
  function editorB() {
    const t = TOOL[S.selected];
    const b = S.keys[t.id];
    const cap = S.capturing === t.id;
    const saved = S.saved && (S.saved.tool === t.id || S.saved.tool === 'all');
    const big = cap
      ? `<button type="button" class="k292-capture is-capturing" data-edit="${t.id}" aria-describedby="k-help-${t.id}" aria-label="Recording a new ${t.name} shortcut. Now ${spoken(b)}.">${listening()}</button>${helpLine(t)}`
      : `<div class="k292-current" aria-label="Current shortcut, ${spoken(b)}">${kbd(b)}</div><button type="button" class="primary" data-edit="${t.id}">${icon('keyboard')}Record a new shortcut</button>`;
    const note = saved && !cap ? `<p class="cf-chip is-ok k292-saved">${icon('check')}Saved. ${esc(S.saved.tool === 'all' ? 'Back to the default.' : `${t.name} is now ${label(b)}.`)}</p>` : '';
    const foot = `<div class="k292-ed-foot"><span class="hint">Default ${kbd(t.key)}</span>${changed(t.id) && !cap ? `<button type="button" class="ghost" data-default="${t.id}">${icon('undo')}Use ${esc(label(t.key))}</button>` : ''}</div>`;
    return `<div class="k292-editor${cap ? ' is-capturing' : ''}${S.error ? ' is-error' : ''}" id="k-editor" role="region" aria-labelledby="k-ed-title"><h4 id="k-ed-title">${icon(t.icon)}${t.name}</h4><p class="hint k292-ed-hint">${t.hint}. Works while a canvas is open.</p><div class="k292-ed-body">${big}</div>${note}${foot}</div>`;
  }

  // C · B's compact rows; the row records in place, as A's key does.
  function rowC(t) {
    const b = S.keys[t.id];
    const cap = S.capturing === t.id;
    const err = S.error?.tool === t.id;
    const saved = !cap && S.saved && (S.saved.tool === t.id || S.saved.tool === 'all' || S.saved.tools?.includes(t.id));
    const was = changed(t.id) ? `, changed from ${spoken(t.key)}` : '';
    const name = cap ? `Recording a new ${t.name} shortcut. Now ${spoken(b)}.` : `${t.name} shortcut, ${spoken(b)}${was}. Change`;
    const mark = saved
      ? `<span class="k292c-saved">${icon('check')}Saved</span>`
      : changed(t.id) && !cap
        ? `<span class="k292-dot" aria-hidden="true"></span>`
        : '';
    return `<li class="k292c-item${cap ? ' is-capturing' : ''}${err ? ' is-error' : ''}"><button type="button" class="k292-pick-row k292c-row" data-edit="${t.id}"${cap ? ` aria-describedby="k-help-${t.id}"` : ''} aria-label="${name}"><span class="k292-icon">${icon(t.icon)}</span><span class="grow">${t.name}</span>${mark}<span class="k292c-key${cap ? ' is-capturing' : ''}">${cap ? listening() : kbd(b)}</span></button>${cap ? helpLine(t) : ''}</li>`;
  }

  function resetRow() {
    const none = allDefault();
    return `<div class="settings-row k292-reset"><span class="grow">Reset to defaults<span class="hint">${none ? 'All five use the keys Wayfinder ships with.' : 'Put all five back to P, E, C, N and F.'}</span></span><button type="button" class="ghost" data-act="reset"${none ? ' aria-disabled="true"' : ''}>${icon('undo')}Reset…</button></div>`;
  }

  function settingsHtmlC() {
    const none = allDefault();
    const note = S.saved
      ? `<span class="settings-save-note k292-save is-saved k292c-save">${icon('check')}Saved · ${esc(S.saved.text)}</span>`
      : `<span class="settings-save-note k292-save">${icon('check')}Changes save automatically</span>`;
    return `<header class="settings-page-heading"><div><h1>Settings</h1><p>Make Wayfinder work your way.</p></div>${note}</header>
      <div class="settings-page-layout"><nav class="settings-categories" aria-label="Settings categories">${nav()}</nav><div>
        <header class="settings-category-heading"><h2 id="k-title" tabindex="-1">Keyboard shortcuts</h2><p>Keys for the canvas viewer’s tools. Click one, then press a letter, alone or with Shift, Alt or Ctrl.</p></header>
        <section class="settings-section k292-section k292-c${S.arriving ? ' is-arriving' : ''}" aria-labelledby="k-title"><ul class="k292c-list" aria-label="Canvas viewer shortcuts">${TOOLS.map(rowC).join('')}</ul>
        <div class="k292c-foot"><span>Defaults: P, E, C, N and F</span><button type="button" class="ghost" data-act="reset"${none ? ' aria-disabled="true"' : ''}>${icon('undo')}Reset…</button></div></section>
      </div></div>`;
  }

  function settingsHtml() {
    if (DIR === 'c' || DIR === 'd') return settingsHtmlC();
    const lede = '<p class="hint k292-lede">These keys work while a canvas is open. Use a letter, alone or with Shift, Alt or Ctrl.</p>';
    const body =
      DIR === 'a'
        ? `<ul class="k292-list" aria-label="Canvas viewer shortcuts">${TOOLS.map(rowA).join('')}</ul>`
        : `<div class="k292-split"><div class="k292-pick" role="group" aria-label="Canvas viewer shortcuts">${TOOLS.map(pickB).join('')}</div>${editorB()}</div>`;
    const note = S.saved
      ? `<span class="settings-save-note k292-save is-saved">${icon('check')}Saved · ${esc(S.saved.text)}</span>`
      : `<span class="settings-save-note k292-save">${icon('check')}Changes save automatically</span>`;
    return `<header class="settings-page-heading"><div><h1>Settings</h1><p>Make Wayfinder work your way.</p></div>${note}</header>
      <div class="settings-page-layout"><nav class="settings-categories" aria-label="Settings categories">${nav()}</nav><div>
        <header class="settings-category-heading"><h2 id="k-title" tabindex="-1">Keyboard shortcuts</h2><p>Change the keys for the canvas viewer’s tools.</p></header>
        <section class="settings-section k292-section k292-${DIR}${S.arriving ? ' is-arriving' : ''}" aria-labelledby="k-viewer-title"><h3 id="k-viewer-title">Canvas viewer</h3>${lede}${body}${resetRow()}</section>
      </div></div>`;
  }

  function topbarHtml() {
    const option = V.option ? `option ${V.option}` : 'the board';
    const back = S.arrived
      ? `<button type="button" class="ghost k292-back" data-act="back" aria-label="Back to canvas: ${CANVAS.title}, ${option}">${icon('left')}Back to canvas<span class="k292-back-ctx" aria-hidden="true">${esc(CANVAS.title)} · ${V.option ?? 'Board'}</span></button><span class="vw-sep"></span>`
      : '';
    return `${back}<span class="page-title">Settings</span><span class="topbar-spacer"></span><button type="button" class="iconbtn" data-to="Notifications" aria-label="Notifications">${icon('bell')}</button>`;
  }

  // ---------- the viewer ----------
  function viewerToolbar() {
    const option = CANVAS.options.find((o) => o.id === V.option);
    const tools = TOOLS.filter((t) => t.id !== 'panel')
      .map((t) => {
        const b = S.keys[t.id];
        const mode = t.id !== 'note';
        const on = mode && V.tool === t.id;
        return `<button type="button" class="seg${on ? ' is-on' : ''}" data-tool="${t.id}" aria-label="${t.name}" aria-keyshortcuts="${ariaKeys(b)}"${mode ? ` aria-pressed="${on}"` : ''} title="${t.name} (${label(b)})">${icon(t.icon)}<span class="vw-lbl">${t.name}</span><kbd>${esc(label(b))}</kbd></button>`;
      })
      .join('');
    const F = S.keys.panel;
    const strip = `<div class="vw-strip"><div class="segmented vw-options" role="group" aria-label="Show the board, or open one option full size"><button type="button" class="seg${V.option === null ? ' is-on' : ''}" data-go="" aria-pressed="${V.option === null}">Board</button>${CANVAS.options.map((o) => `<button type="button" class="seg${V.option === o.id ? ' is-on' : ''}" data-go="${o.id}" aria-pressed="${V.option === o.id}" title="${o.name}">${o.id}</button>`).join('')}</div></div>`;
    const steps = option
      ? `<button type="button" class="iconbtn vw-step" data-step="-1" aria-label="Previous option"><span class="vw-flip">${icon('chevronRight')}</span></button><button type="button" class="iconbtn vw-step" data-step="1" aria-label="Next option">${icon('chevronRight')}</button><span class="vw-optname">${option.name}</span>`
      : '';
    const sizes = `<div class="segmented vw-sizes" role="group" aria-label="Canvas size">${[['full', 'Full window'], ['pane', 'Side pane'], ['float', 'Floating window']].map(([id, name]) => `<button type="button" class="seg${id === 'full' ? ' is-on' : ''}" aria-pressed="${id === 'full'}" aria-label="${name}" title="${name}"${id === 'full' ? '' : ` data-to="the ${name.toLowerCase()}"`}>${icon(id)}</button>`).join('')}</div>`;
    return `<div class="vw-bar is-a"><button type="button" class="ghost vw-close" data-to="the map (closes the canvas)" aria-label="Close the canvas">${icon('close')}<span class="vw-lbl">Close</span><kbd>Esc</kbd></button><span class="vw-title" id="vw-title">${icon('beaker')}<span class="vw-title-t">${CANVAS.title}</span></span><span class="vw-sep"></span><div class="vw-menu-anchor"><button type="button" class="ghost" data-to="the canvas page menu" aria-label="Canvas page: ${CANVAS.page}">${CANVAS.page}${icon('chevron')}</button></div>${strip}${steps}<span class="topbar-spacer"></span><button type="button" class="ghost cf-toggle${V.panel ? ' is-on' : ''}" data-act="panel" aria-pressed="${V.panel}" aria-controls="vw-feedback" aria-keyshortcuts="${ariaKeys(F)}" title="Feedback panel (${label(F)})">${icon('panel')}<span class="vw-lbl">Feedback</span><span class="badge cf-badge">2</span><kbd>${esc(label(F))}</kbd></button><span class="vw-sep"></span><a class="iconbtn" href="#" data-to="the branch on GitHub" aria-label="Open the branch on GitHub">${icon('external')}</a>${sizes}</div>
      <div class="cf-toolrow" role="toolbar" aria-label="Annotate"><div class="segmented cf-toolgroup" role="group" aria-label="Feedback tools">${tools}</div><span class="topbar-spacer"></span><button type="button" class="ghost k292-shortcuts" data-act="shortcuts" title="Change these keys in Settings › Keyboard shortcuts">${icon('keyboard')}Shortcuts</button></div>`;
  }
  function viewerStage() {
    const option = CANVAS.options.find((o) => o.id === V.option);
    const img = option ? option.img : '39-board.jpg';
    const alt = option ? `Canvas option ${option.name}` : 'The canvas board with both options';
    const hint =
      V.tool === 'pin'
        ? `<div class="cf-hint" role="status">${icon('pin')}Click to drop a pin. <kbd>Esc</kbd> stops.</div>`
        : V.tool === 'element'
          ? `<div class="cf-hint" role="status">${icon('cursor')}Hover or Tab to an element, then click or press Enter. <kbd>Esc</kbd> stops.</div>`
          : V.tool === 'color'
            ? `<div class="cf-hint" role="status">${icon('drop')}Pick an element to change its colour. <kbd>Esc</kbd> stops.</div>`
            : '';
    const pins = option?.id === 'B' ? '<div class="cf-layer"><span class="cf-pin" style="left:34%;top:30%">1</span><span class="cf-pin" style="left:84%;top:18%">2</span></div>' : '';
    const panel = V.panel
      ? `<aside class="cf-panel" id="vw-feedback" aria-label="Feedback"><div class="cf-panel-head"><h2>Feedback</h2><span class="badge">2</span><span class="topbar-spacer"></span><button type="button" class="iconbtn" data-act="panel" aria-label="Close the feedback panel (${label(S.keys.panel)})">${icon('close')}</button></div><div class="cf-panel-body"><div class="k292-note"><b>1 · Pin on B</b><p>The hero card is too tall: the next ticket drops below the fold.</p></div><div class="k292-note"><b>2 · Pin on B</b><p>Keep the Trail · Hexes · Bar switch.</p></div></div><div class="cf-panel-foot"><button type="button" class="primary" data-to="Post 2 notes to #43">Post 2 notes to #43</button></div></aside>`
      : '';
    return `<div class="vw-canvas k292-canvas${V.tool ? ' is-tool' : ''}"><img src="../../canvas/assets/protos/${img}" alt="${alt}" />${pins}${hint}</div>${panel}`;
  }

  // ---------- paint ----------
  function paint() {
    const viewer = $('#viewer');
    const settings = $('#settings-view');
    viewer.hidden = S.view !== 'viewer';
    settings.hidden = S.view !== 'settings';
    if (S.view === 'viewer') {
      $('#vw-toolbar').innerHTML = viewerToolbar();
      const stage = $('#vw-stage');
      stage.className = `vw-stage${V.panel ? ' has-feedback' : ''}`;
      stage.innerHTML = viewerStage();
    } else {
      $('#settings-topbar').innerHTML = topbarHtml();
      $('#main').innerHTML = settingsHtml();
    }
  }
  /** Repaint, then put focus back on the control the person was using. */
  function repaint(focusSelector) {
    const active = document.activeElement;
    const key = focusSelector ?? (active && [...active.attributes].find((a) => a.name.startsWith('data-') && a.name !== 'data-icon'));
    paint();
    if (typeof key === 'string') return $(key)?.focus({ preventScroll: false });
    if (key) document.querySelector(`[${key.name}="${CSS.escape(key.value)}"]`)?.focus();
  }

  // ---------- recording ----------
  function startCapture(id) {
    S.capturing = id;
    S.pending = [];
    S.error = null;
    S.saved = null;
    if (DIR === 'b') S.selected = id;
    repaint(`[data-edit="${id}"]`);
    announce(`Recording a new ${NAME[id]} shortcut. Press a letter, or Shift, Alt or Control with a letter. Escape cancels.`);
  }
  function cancelCapture(refocus = true) {
    const id = S.capturing;
    if (!id) return;
    S.capturing = null;
    S.pending = [];
    S.error = null;
    if (refocus) repaint(`[data-edit="${id}"]`);
    else paint();
    announce(`Kept ${spoken(S.keys[id])} for ${NAME[id]}.`);
  }
  function commit(id, binding) {
    S.capturing = null;
    S.pending = [];
    S.error = null;
    if (same(binding, S.keys[id])) {
      repaint(`[data-edit="${id}"]`);
      return announce(`${NAME[id]} stays ${spoken(binding)}.`);
    }
    S.keys[id] = binding;
    showSaved({ tool: id, text: `${NAME[id]} is now ${label(binding)}` });
    repaint(`[data-edit="${id}"]`);
    announce(`Saved. ${NAME[id]} is now ${spoken(binding)}.`);
  }
  function useDefault(id) {
    const b = TOOL[id].key;
    const owner = Object.keys(S.keys).find((other) => other !== id && same(S.keys[other], b));
    if (owner) {
      S.capturing = id;
      S.error = { tool: id, owner, text: `${label(b)} is already ${NAME[owner]}.` };
      repaint(`[data-edit="${id}"]`);
      return announce(`${S.error.text} Change ${NAME[owner]} first, or press another key.`);
    }
    commit(id, { ...b });
  }

  // ---------- reset ----------
  let resetTargets = [];
  function openReset() {
    if (allDefault()) return announce('All five shortcuts already use their defaults.');
    const dialog = $('#reset-dialog');
    resetTargets = DIR === 'd' ? TOOLS.filter((t) => changed(t.id)) : TOOLS;
    const count = resetTargets.length;
    const title = DIR === 'd' ? `Reset ${count} changed shortcut${count === 1 ? '' : 's'}?` : 'Reset all five shortcuts?';
    const items = resetTargets.map((t) => {
      const was = changed(t.id) ? `<span class="k292-was">${kbd(S.keys[t.id])}</span><span class="k292-arrow" aria-hidden="true">→</span><span class="k292-sr">, goes back to</span>` : '';
      return `<li><span class="k292-icon">${icon(t.icon)}</span><span class="grow">${t.name}</span>${was}${kbd(t.key)}</li>`;
    }).join('');
    dialog.innerHTML = `<form method="dialog"><div class="dialog-head"><h2 id="reset-title">${title}</h2></div><p class="hint" id="reset-desc">${DIR === 'd' ? 'Only the shortcuts below return to their defaults and save immediately.' : 'They go back to the keys Wayfinder ships with, and save straight away.'}</p><ul class="k292-reset-list">${items}</ul><div class="k292-dialog-foot"><button type="button" class="ghost" data-reset-result="cancel" autofocus>Cancel</button><button type="button" class="primary" data-reset-result="reset">Reset shortcuts</button></div></form>`;
    dialog.returnValue = '';
    dialog.showModal();
  }
  // The viewer allows scripts but blocks form submissions, including method=dialog.
  $('#reset-dialog').addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-reset-result]') : null;
    if (button) $('#reset-dialog').close(button.dataset.resetResult);
  });
  $('#reset-dialog').addEventListener('close', () => {
    const dialog = $('#reset-dialog');
    if (dialog.returnValue === 'reset') {
      if (DIR === 'd') {
        const ids = resetTargets.map((t) => t.id);
        for (const t of resetTargets) S.keys[t.id] = { ...t.key };
        const text = `${ids.length} shortcut${ids.length === 1 ? '' : 's'} restored to default${ids.length === 1 ? '' : 's'}`;
        showSaved({ tools: ids, text });
        repaint('#k-title');
        announce(`Saved. ${text}.`);
        return;
      }
      S.keys = defaults();
      showSaved({ tool: 'all', text: 'All five shortcuts are back to P, E, C, N and F' });
      repaint('#k-title');
      announce('Saved. Pin is P, Select element E, Color picker C, Note N and Feedback panel F.');
    } else {
      $('[data-act="reset"]')?.focus();
    }
  });

  // ---------- viewer ↔ Settings ----------
  function toSettings() {
    S.view = 'settings';
    S.arrived = true;
    S.arriving = true;
    S.capturing = null;
    S.error = null;
    if (DIR === 'b') S.selected = V.tool ?? 'pin';
    repaint('#k-title');
    announce('Settings, Keyboard shortcuts. Back to canvas returns to the viewer.');
    if (!STATIC) setTimeout(() => { S.arriving = false; $('.k292-section')?.classList.remove('is-arriving'); }, 1800);
  }
  function toViewer() {
    S.view = 'viewer';
    S.capturing = null;
    S.error = null;
    repaint('[data-act="shortcuts"]');
    const tool = V.tool ? `${NAME[V.tool]} is on, ${spoken(S.keys[V.tool])}.` : '';
    announce(`Back to ${CANVAS.title}, ${V.option ? `option ${V.option}` : 'the board'}. ${tool}`);
  }
  function useTool(id) {
    if (id === 'panel') V.panel = !V.panel;
    else if (id === 'note') Kit.toast(`Would open a note for ${V.option ? `option ${V.option}` : 'the board'}`);
    else V.tool = V.tool === id ? null : id;
    repaint();
    if (id !== 'note' && id !== 'panel') announce(V.tool ? `${NAME[id]} on.` : `${NAME[id]} off.`);
  }

  // ---------- events ----------
  document.addEventListener('click', (event) => {
    const el = event.target instanceof Element ? event.target : null;
    if (!el || el.closest('[data-to]') || el.closest('dialog')) return;
    if (S.capturing && !el.closest(`[data-edit="${S.capturing}"]`) && !el.closest('[data-fix]')) cancelCapture(false);
    const edit = el.closest('[data-edit]')?.dataset.edit;
    if (edit) {
      if (S.capturing === edit) return cancelCapture();
      return startCapture(edit);
    }
    const fix = el.closest('[data-fix]')?.dataset.fix;
    if (fix) return startCapture(fix);
    const select = el.closest('[data-select]')?.dataset.select;
    if (select) {
      S.selected = select;
      S.saved = null;
      return repaint();
    }
    const def = el.closest('[data-default]')?.dataset.default;
    if (def) return useDefault(def);
    const act = el.closest('[data-act]')?.dataset.act;
    if (act === 'reset') return openReset();
    if (act === 'back') return toViewer();
    if (act === 'shortcuts') return toSettings();
    if (act === 'panel') return useTool('panel');
    if (el.closest('[data-category]')) return event.preventDefault();
    const tool = el.closest('[data-tool]')?.dataset.tool;
    if (tool) return useTool(tool);
    const go = el.closest('[data-go]');
    if (go) {
      V.option = go.dataset.go || null;
      return repaint();
    }
    const step = el.closest('[data-step]')?.dataset.step;
    if (step) {
      const ids = CANVAS.options.map((o) => o.id);
      V.option = ids[(ids.indexOf(V.option) + Number(step) + ids.length) % ids.length];
      repaint();
    }
  });

  document.addEventListener(
    'keydown',
    (event) => {
      if ($('#reset-dialog').open) return;
      if (S.view === 'settings' && S.capturing) {
        const result = read(event, S.capturing, S.keys);
        if (result.kind === 'leave') return cancelCapture(false);
        event.preventDefault();
        event.stopPropagation();
        if (result.kind === 'cancel') return cancelCapture();
        if (result.kind === 'pending') {
          S.pending = result.mods;
          return repaint(`[data-edit="${S.capturing}"]`);
        }
        if (result.kind === 'ok') return commit(S.capturing, result.binding);
        S.error = { tool: S.capturing, owner: result.owner ?? null, text: result.text };
        S.pending = [];
        repaint(`[data-edit="${S.capturing}"]`);
        return announce(`${result.text} Press another key, or Escape to keep ${spoken(S.keys[S.capturing])}.`);
      }
      if (S.view !== 'viewer') return;
      const typing = event.target instanceof Element && event.target.matches('textarea, input, select');
      if (typing) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (V.tool) return useTool(V.tool);
        return Kit.toast('Would close the canvas and return to the map');
      }
      const hit = TOOLS.find((t) => matches(event, S.keys[t.id]));
      if (hit) {
        event.preventDefault();
        useTool(hit.id);
      }
    },
    true,
  );
  document.addEventListener('keyup', (event) => {
    if (!S.capturing || !S.pending.length) return;
    const mods = [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift'].filter(Boolean);
    if (mods.join() !== S.pending.join()) {
      S.pending = mods;
      repaint(`[data-edit="${S.capturing}"]`);
    }
  });

  paint();
  if (STATE === 'reset' || STATE === 'reset-one') openReset();
  if (S.capturing) $(`[data-edit="${S.capturing}"]`)?.focus();
})();
