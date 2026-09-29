/*
  PROTOTYPE (#163): shared fake map, chrome, map page and batch model for the "where do Start next,
  Auto and the auto-map toggle go" variants. Load after ../kit/kit.js. A variant calls
  START.start(hooks); hooks place the controls. The map page already carries #125's direction A
  (critical path, PR line on the card, stalled frame), since that is decided.

  Fake map #300 "Offline drafts". Eight tickets are next: five task/research, one grilling, one
  prototype, and #223, which already has a live hand-off starting. Two hand-offs are running on
  this machine (#210, #223) against a cap of 4, so Start next can start 2 and queues the rest.
*/
(() => {
  Object.assign(Kit.icons, {
    lens: '<circle cx="11" cy="11" r="6.4"/><path d="m20 20-4.4-4.4"/>',
    beaker: '<path d="M9.5 3h5"/><path d="M10.8 3v6.4L5.5 17.9A2 2 0 0 0 7.2 21h9.6a2 2 0 0 0 1.7-3.1L13.2 9.4V3"/><path d="M7.8 15h8.4"/>',
    grill: '<path d="M3.5 8.5h17"/><path d="M5 8.5a7 7 0 0 0 14 0"/><path d="m8.4 14.5-2.4 6.3"/><path d="m15.6 14.5 2.4 6.3"/>',
    list: '<path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/><path d="M8.5 6H20"/><path d="M8.5 12H20"/><path d="M8.5 18H20"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    lock: '<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    person: '<path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="7" r="4"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    play: '<path d="M7 4v16l13-8z" fill="currentColor"/>',
    alert: '<path d="m12 3 9 16H3z"/><path d="M12 9v4M12 17h.01"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.9-3.5L3 10"/><path d="M3 4v6h6"/><path d="M4 13a8 8 0 0 0 14.9 3.5L21 14"/><path d="M21 20v-6h-6"/>',
    graph: '<rect x="3" y="4" width="7" height="6" rx="1.5"/><rect x="14" y="14" width="7" height="6" rx="1.5"/><path d="M10 7h1.5a2.5 2.5 0 0 1 2.5 2.5V14"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    home: '<path d="m3 10.5 9-7 9 7"/><path d="M5.5 9.2V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    pr: '<circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M6 8.4v7.2"/><path d="M18 15.6V9a3 3 0 0 0-3-3h-4"/><path d="m13 3.5-2.5 2.5L13 8.5"/>',
    ciPass: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    ciFail: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
    ciPending: '<circle cx="12" cy="12" r="9" stroke-dasharray="3.5 3"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    approved: '<path d="M20 6 9 17l-5-5"/>',
    changes: '<path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.5-5.6A8.5 8.5 0 1 1 21 12z"/><path d="M9 11h6M9 14h4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    // New for #163. Same 24px stroke grid.
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m6.3 6.3 2.1 2.1M15.6 15.6l2.1 2.1M6.3 17.7l2.1-2.1M15.6 8.4l2.1-2.1"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    queue: '<path d="M4 6h16M4 12h10M4 18h6"/><path d="m17 15 3 3-3 3"/>',
    gauge: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="m12 18 4-6"/>',
  });

  const esc = Kit.esc;
  const icon = Kit.icon;
  const params = new URLSearchParams(location.search);

  /* ---------- the fake map ---------- */

  const MAP = { number: 300, title: 'Offline drafts: write a map without GitHub' };
  const CAP = 4; // #124: 4 running hand-offs per machine, counted across every map
  const ELSEWHERE = 0; // running on other maps

  // col/row place the card like src/layout.ts would (248 × 104, 56 across, 18 down).
  const TICKETS = [
    { n: 201, type: 'research', title: 'What can the browser store offline, and for how long?', state: 'done', who: 'RAbdelrhman', by: [], col: 0, row: 0 },
    { n: 202, type: 'grilling', title: 'Where does a draft live until it syncs?', state: 'done', who: 'RAbdelrhman', by: [], col: 0, row: 1 },
    { n: 203, type: 'task', title: 'Save drafts to IndexedDB', state: 'done', who: 'RAbdelrhman', by: [], col: 0, row: 2 },
    { n: 215, type: 'grilling', title: 'Should drafts sync on their own or when you ask?', state: 'frontier', by: [], col: 0, row: 3 },
    { n: 218, type: 'research', title: 'How much can IndexedDB hold before the browser evicts it?', state: 'frontier', by: [], col: 0, row: 4 },
    { n: 222, type: 'prototype', title: 'What does the draft badge look like?', state: 'frontier', by: [], col: 0, row: 5 },
    { n: 220, type: 'task', title: 'Show a draft count in the map header', state: 'frontier', by: [], col: 0, row: 6 },
    { n: 221, type: 'task', title: 'Add an Export drafts button', state: 'frontier', by: [], col: 0, row: 7 },

    {
      n: 213, type: 'task', title: 'Queue edits made while offline', state: 'claimed', who: 'RAbdelrhman', by: [202], col: 1, row: 0,
      handOff: { state: 'failed', label: 'Failed', since: '2 days ago' },
      stalled: { short: 'hand-off failed 2 days ago' },
    },
    { n: 204, type: 'task', title: 'Notice when GitHub is reachable again', state: 'claimed', who: 'RAbdelrhman', by: [202], col: 1, row: 1, handOff: { state: 'pr-ready', label: 'PR ready', since: '25 min ago' }, pr: { n: 231, ci: 'pass', review: 'approved' } },
    { n: 210, type: 'task', title: 'Mark unsynced cards with a draft badge', state: 'claimed', who: 'RAbdelrhman', by: [201], col: 1, row: 2, handOff: { state: 'working', label: 'Working', since: '4 min ago' }, pr: { n: 232, ci: 'fail', review: 'changes' } },
    { n: 211, type: 'prototype', title: 'How should a sync conflict look?', state: 'claimed', who: 'RAbdelrhman', by: [201], col: 1, row: 3, pr: { n: 233, ci: 'pending', review: 'requested' } },
    { n: 212, type: 'research', title: 'How do other tools merge offline edits?', state: 'claimed', who: 'sam-k', by: [], col: 1, row: 4, stalled: { short: 'claimed 6 days ago, untouched' } },
    { n: 214, type: 'task', title: 'Load saved drafts when the app starts', state: 'frontier', by: [203], col: 1, row: 5 },
    { n: 216, type: 'task', title: 'Clear a draft once it has synced', state: 'frontier', by: [203], col: 1, row: 6 },
    // Next on GitHub, but a hand-off from this machine is already starting it (no claim yet).
    { n: 223, type: 'task', title: 'Warn before closing with unsynced drafts', state: 'frontier', by: [203], col: 1, row: 7, handOff: { state: 'starting', label: 'Starting', since: '1 min ago' } },

    { n: 205, type: 'task', title: 'Replay queued edits as GitHub issues', state: 'blocked', by: [213, 204], col: 2, row: 0 },
    { n: 217, type: 'task', title: 'Add the draft badge to the map key', state: 'blocked', by: [210, 212], col: 2, row: 2 },
    { n: 219, type: 'task', title: 'Build the conflict screen', state: 'blocked', by: [211], col: 2, row: 3 },
    { n: 224, type: 'task', title: 'Evict the oldest drafts when storage runs low', state: 'blocked', by: [218, 214], col: 2, row: 5 },
    { n: 206, type: 'task', title: 'Resolve conflicts found during replay', state: 'blocked', by: [205], col: 3, row: 0 },
    { n: 207, type: 'task', title: 'Retry failed replays with backoff', state: 'blocked', by: [206], col: 4, row: 0 },
    { n: 208, type: 'task', title: 'Turn offline drafts on by default', state: 'blocked', by: [207], col: 5, row: 0 },
  ];
  const byNumber = new Map(TICKETS.map((t) => [t.n, t]));
  for (const t of TICKETS) t.open = t.state !== 'done';
  for (const t of TICKETS) t.openBlockers = t.by.filter((n) => byNumber.get(n).open);
  const unlocks = (n) => TICKETS.filter((t) => t.by.includes(n)).map((t) => t.n);

  const PATH = [202, 213, 205, 206, 207, 208];
  const PATH_LEFT = PATH.filter((n) => byNumber.get(n).open).length;
  const pathEdge = (from, to) => PATH.indexOf(to) === PATH.indexOf(from) + 1 && PATH.includes(from);

  /* ---------- tiers and Auto ---------- */

  const TIERS = ['simple', 'mid', 'hard'];
  const TIER_LABEL = { simple: 'Simple', mid: 'Mid', hard: 'Hard' };
  // Settings' tier-to-model mapping (fake).
  const TIER_MODEL = { simple: 'Sonnet 5', mid: 'GPT-5.6 Sol', hard: 'Opus 5.5' };
  // What Auto would pick (#165/#166): a tier, a model from what you have, and one line of why.
  const AUTO = {
    214: { tier: 'simple', model: 'GPT-5.6 Luna', why: 'One read at start-up, with tests beside it.' },
    216: { tier: 'mid', model: 'GPT-5.6 Sol', why: 'Touches the sync path, which #204 is changing.' },
    218: { tier: 'hard', model: 'GPT-5.6 Sol', why: 'Research needs judgment. Claude is at 91% of this week’s limit, so Sol, not Opus.' },
    220: { tier: 'simple', model: 'GPT-5.6 Luna', why: 'Copies the critical-path count next to it.' },
    221: { tier: 'mid', model: 'Sonnet 5', why: 'A new button and its wording: taste matters more than depth.' },
    215: { tier: 'hard', model: 'Opus 5.5', why: 'You will be in the thread; picks for judgment.' },
    222: { tier: 'mid', model: 'Opus 5.5', why: 'A design canvas: picks for taste.' },
  };

  const TYPE_ICON = { research: 'lens', prototype: 'beaker', grilling: 'grill', task: 'list' };
  const HITL = (t) => t.type === 'grilling' || t.type === 'prototype';
  const STATE = {
    frontier: { label: 'next', long: 'Next up', variable: '--state-frontier', icon: 'arrow' },
    claimed: { label: 'claimed', long: 'Claimed', variable: '--state-claimed', icon: 'person' },
    blocked: { label: 'blocked', long: 'Blocked', variable: '--state-blocked', icon: 'lock' },
    done: { label: 'done', long: 'Done', variable: '--state-done', icon: 'check' },
  };
  const HANDOFF_ICON = { queued: 'queue', merged: 'arrow', starting: 'play', working: 'play', 'needs-you': 'person', 'pr-ready': 'check', failed: 'alert' };
  const CI = { pass: ['ciPass', 'passing', 'var(--handoff-pr-ready)'], fail: ['ciFail', 'failing', 'var(--state-failed)'], pending: ['ciPending', 'running', 'var(--text-muted)'] };
  const REVIEW = { approved: ['approved', 'approved', 'var(--handoff-pr-ready)'], changes: ['changes', 'changes requested', 'var(--state-failed)'], requested: ['eye', 'review requested', 'var(--text-muted)'] };

  /* ---------- state ---------- */

  const READY = TICKETS.filter((t) => t.state === 'frontier').sort((a, b) => a.n - b.n);
  // Order in the confirm list: what can start, then what needs you, then what is skipped.
  const LIST = [...READY.filter((t) => !HITL(t) && !t.handOff), ...READY.filter((t) => HITL(t) && !t.handOff), ...READY.filter((t) => t.handOff)];

  const state = {
    selected: Number(params.get('ticket') ?? 214),
    tab: params.get('tab') ?? 'ticket',
    // idle → confirm → running → (stopped) ; the confirm list is open while phase is 'confirm'
    phase: params.get('phase') ?? 'idle',
    auto: params.get('auto') === '1',
    autoMap: params.get('automap') === '1',
    rows: new Map(LIST.map((t) => [t.n, { on: !HITL(t) && !t.handOff, tier: null }])), // tier null = map default
    ui: {}, // free space for a variant
  };

  const running = () => TICKETS.filter((t) => t.handOff && ['starting', 'working', 'needs-you'].includes(t.handOff.state)).length + ELSEWHERE;

  /** Every row of the confirm list with what will happen to it. */
  function plan() {
    let free = Math.max(0, CAP - running());
    let queued = 0;
    return LIST.map((t) => {
      const row = state.rows.get(t.n);
      const auto = state.auto ? AUTO[t.n] : null;
      const tier = row.tier ?? (auto ? auto.tier : 'mid');
      const model = row.tier === null && auto ? auto.model : TIER_MODEL[tier];
      let status;
      if (t.handOff) status = { kind: 'skip', word: 'Skipped', why: `Already in T3 Code · ${t.handOff.label.toLowerCase()} ${t.handOff.since}` };
      else if (!row.on) status = { kind: 'off', word: HITL(t) ? 'Needs you' : 'Not starting', why: HITL(t) ? `${t.type === 'grilling' ? 'Grilling' : 'Prototype'} tickets wait for you in the thread` : '' };
      else if (free > 0) {
        free -= 1;
        status = { kind: 'start', word: 'Starts now', why: '' };
      } else {
        queued += 1;
        status = { kind: 'queue', word: `Queued ${queued}`, why: 'Starts when a slot frees' };
      }
      return { t, row, auto, tier, model, overridden: row.tier !== null, hitl: HITL(t), status };
    });
  }

  const counts = () => {
    const p = plan();
    return {
      start: p.filter((r) => r.status.kind === 'start').length,
      queue: p.filter((r) => r.status.kind === 'queue').length,
      picked: p.filter((r) => r.status.kind === 'start' || r.status.kind === 'queue').length,
      needYou: p.filter((r) => r.hitl).length,
      skip: p.filter((r) => r.status.kind === 'skip').length,
      startable: LIST.filter((t) => !HITL(t) && !t.handOff).length,
    };
  };

  /** After Start: what each picked ticket is doing. Stopped = the first usage-limit error halted the batch. */
  function batch() {
    const p = plan().filter((r) => r.status.kind === 'start' || r.status.kind === 'queue');
    const stopped = state.phase === 'stopped';
    return p.map((r, i) => {
      let s;
      if (!stopped) s = r.status.kind === 'start' ? (i === 0 ? { k: 'working', w: 'Working' } : { k: 'starting', w: 'Starting' }) : { k: 'queued', w: r.status.word };
      else s = i === 0 ? { k: 'working', w: 'Working' } : i === 1 ? { k: 'failed', w: 'Usage limit' } : { k: 'back', w: 'Back to next' };
      return { ...r, run: s };
    });
  }
  const batchCounts = () => {
    const b = batch();
    const c = (k) => b.filter((r) => r.run.k === k).length;
    return { running: c('working') + c('starting'), queued: c('queued'), failed: c('failed'), back: c('back'), total: b.length };
  };

  /* ---------- shared markup ---------- */

  const typeGlyph = (t) => `<span class="glyph" title="${t.type}">${icon(TYPE_ICON[t.type])}</span>`;
  const stateChip = (s) => `<span class="chip" style="--accent: var(${STATE[s].variable})">${icon(STATE[s].icon)}${STATE[s].label}</span>`;
  const pill = (h, compact = false) =>
    `<span class="${compact ? 'chip node-handoff-pill' : 'handoff-pill'} is-${h.state}">${icon(HANDOFF_ICON[h.state] ?? 'play')}<span>${esc(h.label)}</span></span>`;
  const numbers = (items) => {
    const labels = items.map((t) => `#${t.n}`);
    return labels.length < 2 ? labels.join('') : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
  };

  /** The tier control for one row: Simple/Mid/Hard, with Auto first when the map uses Auto. */
  function tierControl(r, { size = '' } = {}) {
    const opts = [...(state.auto ? [['auto', 'Auto']] : []), ...TIERS.map((x) => [x, TIER_LABEL[x]])];
    const current = r.overridden ? r.tier : state.auto ? 'auto' : 'mid';
    const disabled = r.status.kind === 'skip' || (r.hitl && !r.row.on) ? ' disabled' : '';
    return `<div class="segmented st-tier ${size}" role="group" aria-label="Tier for #${r.t.n}">${opts
      .map(([id, label]) => `<button type="button" class="seg${current === id ? ' is-on' : ''}" aria-pressed="${current === id}" data-action="tier" data-n="${r.t.n}" data-tier="${id}"${disabled}>${label}</button>`)
      .join('')}</div>`;
  }

  /** "Hard · GPT-5.6 Sol" and, under Auto, the reason. */
  function modelLine(r) {
    if (r.status.kind === 'skip') return '';
    const lead = r.auto && !r.overridden ? `<span class="st-auto-tag">${icon('spark')}</span>Auto picked ` : r.overridden && state.auto ? '<span class="st-over">your pick</span>' : '';
    return `<p class="st-model">${lead}<b>${TIER_LABEL[r.tier]}</b> · ${esc(r.model)}${r.auto && !r.overridden ? `<span class="st-why"> — ${esc(r.auto.why)}</span>` : ''}</p>`;
  }

  function statusTag(r) {
    return `<span class="st-status is-${r.status.kind}">${r.status.kind === 'queue' ? icon('queue') : r.status.kind === 'start' ? icon('play') : r.status.kind === 'skip' ? icon('x') : r.hitl ? icon('person') : ''}${esc(r.status.word)}</span>`;
  }

  /** One confirm-list row. */
  function rowHtml(r, { tiers = true } = {}) {
    const id = `st-cb-${r.t.n}`;
    const box = r.status.kind === 'skip'
      ? `<span class="st-box is-none" aria-hidden="true"></span>`
      : `<input type="checkbox" class="st-cb" id="${id}" data-action="toggle" data-n="${r.t.n}"${r.row.on ? ' checked' : ''} aria-describedby="${id}-s">`;
    return `<li class="st-row is-${r.status.kind}${r.hitl ? ' is-hitl' : ''}">
      ${box}
      <label class="st-main" for="${id}">
        <span class="st-head">${typeGlyph(r.t)}<span class="num">#${r.t.n}</span><span class="st-title">${esc(r.t.title)}</span></span>
        <span class="st-sub" id="${id}-s">${statusTag(r)}${r.status.why ? `<span class="st-reason">${esc(r.status.why)}</span>` : ''}</span>
      </label>
      ${tiers && r.status.kind !== 'skip' ? `<div class="st-tiers">${tierControl(r)}${modelLine(r)}</div>` : ''}
    </li>`;
  }

  /** The map-level tier choice: everything on Mid (override per row), or Auto. */
  function autoControl() {
    return `<div class="st-autoctl"><span class="st-lbl" id="st-auto-lbl">Tiers</span><div class="segmented" role="group" aria-labelledby="st-auto-lbl">
      <button type="button" class="seg${state.auto ? '' : ' is-on'}" aria-pressed="${!state.auto}" data-action="auto" data-on="0">Mid for all</button>
      <button type="button" class="seg${state.auto ? ' is-on' : ''}" aria-pressed="${state.auto}" data-action="auto" data-on="1">${icon('spark')}Auto</button></div>
      <span class="st-hint">${state.auto ? 'Wayfinder picks each ticket’s tier and model. Change any row.' : 'Mid runs on GPT-5.6 Sol. Change any row.'}</span></div>`;
  }

  function capLine() {
    const c = counts();
    return `${c.start} start now${c.queue ? ` · ${c.queue} queued` : ''} <span class="st-muted">· ${running()} of ${CAP} running on this machine</span>`;
  }

  /** A switch (role=switch) for the auto map. */
  function autoMapSwitch(label = 'Auto map') {
    return `<button type="button" class="st-switch" role="switch" aria-checked="${state.autoMap}" data-action="automap"><span class="st-knob" aria-hidden="true"></span><span>${label}</span></button>`;
  }
  const AUTOMAP_HINT = 'Starts task and research tickets as they become next. Grilling and prototype tickets only notify you.';

  /* ---------- chrome, as on main ---------- */

  function rail() {
    return `<aside class="sidebar-shell"><nav class="navigation" aria-label="Primary"><div class="nav-compact-content mini">
      <div class="mini-head"><button type="button" class="fold mini-logo" aria-label="Open the sidebar"><img class="app-logo" src="../../../assets/wayfinder-icon.svg" alt="" width="30" height="30"></button></div>
      <a class="new" href="#" data-to="Start a new map" aria-label="Start a new map">${icon('plus')}</a>
      <button type="button" class="rail-btn" aria-label="Jump to">${icon('lens')}</button>
      <a class="rail-btn" href="#" data-to="Home" aria-label="Home">${icon('home')}</a>
      <span class="mini-sep" role="separator"></span>
    </div>
    <div class="nav-footer">
      <span class="rail-mark nav-account" role="img" aria-label="GitHub account: RAbdelrhman"><span class="avatar-initial">R</span></span>
      <button type="button" class="rail-btn" aria-label="Model defaults">${icon('sliders')}</button>
      <button type="button" class="rail-btn" aria-label="Theme">${icon('moon')}</button>
    </div></nav></aside>`;
  }

  function ring(size = 16) {
    const c = 2 * Math.PI * 6.5;
    const counts = ['done', 'claimed', 'frontier', 'blocked'].map((s) => [s, TICKETS.filter((t) => t.state === s).length]);
    let offset = 0;
    const arcs = counts
      .map(([s, k]) => {
        const len = (k / TICKETS.length) * c;
        const arc = `<circle cx="8" cy="8" r="6.5" fill="none" stroke="var(${STATE[s].variable})" stroke-width="3" stroke-dasharray="${Math.max(0, len - 1.5)} ${c}" stroke-dashoffset="${-offset}"/>`;
        offset += len;
        return arc;
      })
      .join('');
    return `<span class="mini-ring" aria-hidden="true"><svg viewBox="0 0 16 16" width="${size}" height="${size}">${arcs}</svg></span>`;
  }

  function topbar() {
    const handOffs = TICKETS.filter((t) => t.handOff);
    const needYou = handOffs.filter((t) => t.handOff.state === 'failed').length;
    return `<header class="topbar map-topbar">
      <div class="nav-topbar"><div class="nav-map-strip"><nav class="nav-map-scopes" aria-label="Map location">
        <div class="nav-scope-control"><button type="button" class="scope is-quiet"><span class="repo-mono" aria-hidden="true">WM</span><span class="t">wayfinder-map</span>${icon('chevron')}</button></div>
        <span class="crumb-sep" aria-hidden="true">/</span>
        <div class="nav-scope-control">${hook('scope') ?? `<button type="button" class="scope">${ring()}<span class="t">#${MAP.number} ${esc(MAP.title)}</span>${icon('chevron')}</button>`}</div>
      </nav><nav class="segmented nav-map-tabs" aria-label="Map views"><a class="seg is-on" href="#" aria-current="page">${icon('graph')}<span>Map</span></a><a class="seg" href="#" data-to="Table">${icon('table')}<span>Table</span></a><a class="seg" href="#" data-to="Prototypes">${icon('beaker')}<span>Prototypes</span></a></nav></div></div>
      <button type="button" class="st-pathcount" title="Show only the critical path">${icon('route')}<b>${PATH_LEFT}</b> left on the critical path</button>
      ${hook('topbarAfterTabs') ?? ''}
      <span class="topbar-spacer"></span>
      <div class="handoff-anchor"><button type="button" class="handoff-trigger${needYou ? ' is-urgent' : ''}" aria-label="${handOffs.length} hand-offs in T3 Code"><span class="handoff-dots" aria-hidden="true">${handOffs.map((t) => `<i class="is-${t.handOff.state}"></i>`).join('')}</span><span>${handOffs.length} in T3 Code${needYou ? ` · ${needYou} need you` : ''}</span></button></div>
      <button type="button" class="synced" aria-label="Resync from GitHub">${icon('refresh')}<span class="synced-label">Synced just now</span></button>
      ${hook('startButton') ?? ''}
    </header>`;
  }

  function filters() {
    const count = (s) => TICKETS.filter((t) => t.state === s).length;
    const chip = (s) => `<button type="button" class="fchip" aria-pressed="false" style="--accent: var(${STATE[s].variable})">${icon(STATE[s].icon)}${STATE[s].long} <b>${count(s)}</b></button>`;
    const types = ['research', 'prototype', 'grilling', 'task'].map((ty) => `<button type="button" class="fchip" aria-pressed="false">${icon(TYPE_ICON[ty])}${ty} <b>${TICKETS.filter((t) => t.type === ty).length}</b></button>`);
    return `<div class="map-toolbar"><div class="filters" role="toolbar" aria-label="Filter tickets">
      <button type="button" class="fchip is-on" aria-pressed="true">All <b>${TICKETS.length}</b></button>${['frontier', 'claimed', 'blocked', 'done'].map(chip).join('')}
      <span class="filter-sep" role="none"></span>${types.join('')}</div>
      ${hook('toolbarEnd') ?? `<label class="search map-local-search">${icon('lens')}<input type="search" placeholder="Filter tickets on this map…" aria-label="Filter tickets on this map"></label>`}</div>`;
  }

  /* ---------- canvas ---------- */

  const W = 248;
  const H = 104;
  const X = (t) => 32 + t.col * (W + 56);
  const Y = (t) => 32 + t.row * (H + 18);

  /** During a batch, a picked ticket shows its run state as a hand-off pill (queued ones too). */
  function runFor(n) {
    if (state.phase !== 'running' && state.phase !== 'stopped') return null;
    return batch().find((r) => r.t.n === n)?.run ?? null;
  }
  const RUN_PILL = { working: 'working', starting: 'starting', queued: 'queued', failed: 'failed', back: null };

  function defaultMeta(t) {
    if (t.stalled) return `<span class="st-meta">${icon('clock')}Stalled · ${esc(t.stalled.short)}</span>`;
    if (t.pr) {
      const [ci, ciw, cit] = CI[t.pr.ci];
      const [rv, rvw, rvt] = REVIEW[t.pr.review];
      return `<span class="st-meta">${icon('pr')}#${t.pr.n}<span class="st-dot">·</span><span class="st-tone" style="--tone:${cit}">${icon(ci)}</span>${ciw}<span class="st-dot">·</span><span class="st-tone" style="--tone:${rvt}">${icon(rv)}</span>${rvw}</span>`;
    }
    return esc(t.state === 'blocked' ? `blocked by ${t.openBlockers.map((n) => `#${n}`).join(', ')}` : t.who ? `@${t.who}` : t.type);
  }

  function node(t) {
    const style = STATE[t.state];
    const o = hook('node', t) ?? {};
    const run = runFor(t.n);
    const runPill = run && RUN_PILL[run.k] ? pill({ state: RUN_PILL[run.k], label: run.w }, true) : null;
    const chip = o.chip ?? runPill ?? (t.handOff && t.open ? pill(t.handOff, true) : stateChip(t.state));
    const cls = ['node', t.state === 'done' ? 'is-done' : '', state.selected === t.n ? 'is-selected' : '', t.stalled ? 'st-stalled' : '', ...(o.classes ?? [])].filter(Boolean).join(' ');
    const aria = [`#${t.n} ${t.title}`, style.label, t.handOff && t.open ? `hand-off ${t.handOff.label}` : '', run ? run.w : '', ...(o.aria ?? [])].filter(Boolean).join(', ');
    return `<div class="st-node-wrap" style="left:${X(t)}px; top:${Y(t)}px; width:${W}px; height:${H}px">${o.before ?? ''}<button type="button" class="${cls}" data-select="${t.n}" style="--accent: var(${style.variable}); left:0; top:0; width:${W}px; height:${H}px" aria-label="${esc(aria)}">
      <span class="node-top">${typeGlyph(t)}<span class="num">#${t.n}</span>${o.beforeChip ?? ''}${chip}${o.afterChip ?? ''}</span>
      <span class="title">${esc(t.title)}</span>
      <span class="meta">${o.meta ?? defaultMeta(t)}</span>
    </button>${o.after ?? ''}</div>`;
  }

  function canvas() {
    const width = X({ col: 5 }) + W + 32;
    const height = Y({ row: 7 }) + H + 32;
    const paths = [];
    for (const t of TICKETS)
      for (const from of t.by) {
        const f = byNumber.get(from);
        const x1 = X(f) + W;
        const y1 = Y(f) + H / 2;
        const x2 = X(t);
        const y2 = Y(t) + H / 2;
        const bend = Math.max(28, (x2 - x1) / 2);
        const cls = [t.openBlockers.includes(from) ? 'is-live' : '', pathEdge(from, t.n) ? 'st-path' : ''].filter(Boolean).join(' ');
        paths.push(`<path class="${cls}" d="M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}"/>`);
      }
    return `<section class="stage" aria-label="Tickets">
      <div class="canvas-wrap st-wrap"><div class="canvas-stage st-stage"><div class="canvas" style="width:${width}px;height:${height}px">
        <svg class="edges" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">${paths.join('')}</svg>
        <div class="nodes">${TICKETS.map(node).join('')}</div>
      </div></div></div>
      ${hook('stageOverlay') ?? ''}
      <div class="keybox"><button type="button" class="floatbox keybtn">${icon('info')}Key</button></div>
      <div class="zoom floatbox" role="group" aria-label="Zoom"><button type="button" class="iconbtn" aria-label="Zoom out">${icon('minus')}</button><button type="button" class="iconbtn pct">85%</button><button type="button" class="iconbtn" aria-label="Zoom in">${icon('plus')}</button></div>
    </section>`;
  }

  /* ---------- inspector ---------- */

  function ticketPanel(t) {
    const style = STATE[t.state];
    const run = runFor(t.n);
    const banner = t.state === 'blocked' ? `Waiting on <b>${t.openBlockers.map((n) => `#${n}`).join(' and ')}</b>.` : t.state === 'done' ? 'This ticket is closed.' : t.state === 'claimed' ? `<b>@${t.who}</b> is on it.` : null;
    const launch = run
      ? `<section class="handoff-card is-${RUN_PILL[run.k] ?? 'working'}"><div class="handoff-card-head">${pill({ state: RUN_PILL[run.k] ?? 'working', label: run.w })}<time>Start next</time></div></section>`
      : t.handOff
        ? `<section class="handoff-card is-${t.handOff.state}"><div class="handoff-card-head">${pill(t.handOff)}<time>${t.handOff.since}</time></div></section>`
        : t.state === 'done'
          ? ''
          : `<div class="runwith"><div class="runwith-row"><span class="runwith-label">Run as</span><div class="segmented" role="group" aria-label="Task tier"><button type="button" class="seg">Simple</button><button type="button" class="seg is-on" aria-pressed="true">Mid</button><button type="button" class="seg">Hard</button></div><button type="button" class="linkish">Defaults</button></div></div>
            <div class="launch-actions"><button type="button" class="primary"${t.state === 'blocked' ? ' disabled' : ''}>${icon('play')}Open in T3 Code</button><button type="button" class="ghost">${icon('copy')}Copy prompt</button></div>`;
    return `<div class="dhead">${typeGlyph(t)}<span class="num">#${t.n}</span>${stateChip(t.state)}<a class="iconbtn" href="#" data-to="#${t.n} on GitHub" aria-label="Open on GitHub">${icon('external')}</a></div>
      <h2 class="dtitle">${esc(t.title)}</h2>
      ${banner ? `<div class="banner" style="--accent: var(${style.variable})">${icon(style.icon)}<span>${banner}</span></div>` : ''}
      <dl class="facts">
        <dt>Type</dt><dd>${icon(TYPE_ICON[t.type])}${t.type}</dd>
        <dt>Assignee</dt><dd>${t.who ? `@${t.who}` : '<span class="none">unclaimed</span>'}</dd>
        <dt>Needs</dt><dd>${t.by.length ? t.by.map((n) => `#${n}`).join(', ') : '<span class="none">—</span>'}</dd>
        <dt>Unlocks</dt><dd>${unlocks(t.n).length ? unlocks(t.n).map((n) => `#${n}`).join(', ') : '<span class="none">—</span>'}</dd>
      </dl>
      <div class="launch">${launch}</div>
      <p class="hint">A single ticket’s hand-off keeps Simple / Mid / Hard. Not part of #163.</p>`;
  }

  function briefPanel() {
    return `<div class="brief"><span class="eyebrow"><a href="#" data-to="map #${MAP.number} on GitHub">Map · #${MAP.number} ↗</a></span><h1>${esc(MAP.title)}</h1>
      ${hook('brief') ?? ''}<p class="hint">The rest of the brief is unchanged in this prototype.</p></div>`;
  }

  function inspector() {
    const extraTabs = hook('tabs') ?? [];
    const tabs = [...extraTabs, { id: 'brief', label: 'Brief' }, { id: 'ticket', label: `Ticket #${state.selected}` }];
    const body = extraTabs.find((x) => x.id === state.tab)?.render() ?? (state.tab === 'brief' ? briefPanel() : ticketPanel(byNumber.get(state.selected)));
    return `<aside class="inspector" aria-label="Brief and ticket"><div class="insp-tabs"><div class="segmented" role="tablist" aria-label="Panel">${tabs
      .map((x) => `<button type="button" role="tab" aria-selected="${state.tab === x.id}" tabindex="${state.tab === x.id ? 0 : -1}" class="seg${state.tab === x.id ? ' is-on' : ''}" data-tab="${x.id}">${x.label}</button>`)
      .join('')}</div></div><div class="insp-panel${hook('panelClass') ?? ''}" role="tabpanel">${body}</div></aside>`;
  }

  /* ---------- prototype bar ---------- */

  function protoBar() {
    const ph = (id, label) => `<button type="button" data-proto="phase" data-v="${id}" class="${state.phase === id ? 'is-on' : ''}" aria-pressed="${state.phase === id}">${label}</button>`;
    const tg = (key, label) => `<button type="button" data-proto="${key}" class="${state[key === 'automap' ? 'autoMap' : 'auto'] ? 'is-on' : ''}" aria-pressed="${state[key === 'automap' ? 'autoMap' : 'auto']}">${label}</button>`;
    return `<div class="st-proto" role="group" aria-label="Prototype controls"><span class="st-proto-tag">Prototype</span>
      ${ph('idle', 'Idle')}${ph('confirm', 'Confirm')}${ph('running', 'Running')}${ph('stopped', 'Stopped')}
      <span class="st-proto-sep"></span>${tg('auto', 'Auto')}${tg('automap', 'Auto map')}</div>`;
  }

  /* ---------- paint and events ---------- */

  let hooks = {};
  function hook(name, ...args) {
    return hooks[name] ? hooks[name](...args) : undefined;
  }

  let scroll = null;
  function paint() {
    const wrap = document.querySelector('.st-wrap');
    if (wrap) scroll = [wrap.scrollLeft, wrap.scrollTop];
    const listEl = document.querySelector('[data-keep-scroll]');
    const listScroll = listEl ? listEl.scrollTop : 0;
    // Repainting replaces the DOM, so put focus back on the same control.
    const a = document.activeElement;
    const keys = ['action', 'n', 'tier', 'on', 'select', 'tab', 'proto', 'v'];
    const focusSel = a && a !== document.body && keys.some((k) => a.dataset?.[k])
      ? keys.filter((k) => a.dataset[k] !== undefined).map((k) => `[data-${k}="${a.dataset[k]}"]`).join('')
      : null;
    document.getElementById('root').innerHTML = `<div class="app is-nav-collapsed">${rail()}<div class="main">${topbar()}${hook('belowTopbar') ?? ''}${filters()}<div class="body">${canvas()}${inspector()}</div></div></div>${hook('overlay') ?? ''}${protoBar()}`;
    const next = document.querySelector('.st-wrap');
    if (next && scroll) [next.scrollLeft, next.scrollTop] = scroll;
    const nextList = document.querySelector('[data-keep-scroll]');
    if (nextList) nextList.scrollTop = listScroll;
    hook('afterPaint'); // may open a modal, so focus comes after
    const target = (focusSel && document.querySelector(focusSel)) || document.querySelector('[data-autofocus]');
    target?.focus({ preventScroll: true });
  }

  function act(name, el) {
    if (hook('action', name, el) === false) return;
    const n = Number(el.dataset.n);
    if (name === 'toggle') state.rows.get(n).on = el.checked;
    if (name === 'tier') {
      const row = state.rows.get(n);
      const v = el.dataset.tier;
      row.tier = v === 'auto' || (!state.auto && v === 'mid') ? null : v;
    }
    if (name === 'auto') {
      state.auto = el.dataset.on === '1';
      for (const row of state.rows.values()) row.tier = null;
    }
    if (name === 'automap') state.autoMap = !state.autoMap;
    if (name === 'open') state.phase = 'confirm';
    if (name === 'cancel') state.phase = 'idle';
    if (name === 'go') {
      state.phase = 'running';
      Kit.toast(`Would hand off ${counts().picked} tickets to T3 Code`);
    }
    if (name === 'retry') state.phase = 'confirm';
    if (name === 'clear') state.phase = 'idle';
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-select], [data-tab], [data-proto], [data-action]');
    if (!el || el.matches('input[type=checkbox]')) return;
    if (el.dataset.select) {
      state.selected = Number(el.dataset.select);
      state.tab = 'ticket';
    } else if (el.dataset.tab) state.tab = el.dataset.tab;
    else if (el.dataset.proto === 'phase') state.phase = el.dataset.v;
    else if (el.dataset.proto === 'auto') act('auto', { dataset: { on: state.auto ? '0' : '1' } });
    else if (el.dataset.proto === 'automap') state.autoMap = !state.autoMap;
    else if (el.dataset.action) act(el.dataset.action, el);
    paint();
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.matches?.('input[type=checkbox][data-action]')) {
      act(el.dataset.action, el);
      paint();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.phase === 'confirm' && hook('escCloses')) {
      state.phase = 'idle';
      paint();
    }
  });

  function start(h) {
    hooks = h;
    paint();
  }

  window.START = {
    start, paint, state, esc, icon, ring, MAP, CAP, TICKETS, byNumber, READY, LIST, HITL, AUTO, TIER_LABEL, TIER_MODEL,
    plan, counts, batch, batchCounts, running, numbers, pill, typeGlyph, rowHtml, tierControl, modelLine, statusTag,
    autoControl, capLine, autoMapSwitch, AUTOMAP_HINT, X, Y, W, H,
  };
})();
