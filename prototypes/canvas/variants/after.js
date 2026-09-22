/*
  PROTOTYPE (#45): shared fake data, T3 Code states, chrome and page bodies for the
  after-hand-off variants. Load after ../kit/kit.js. A variant calls AFTER.start(render),
  where render(state) returns the whole page; everything here is the same in every variant.

  The focus hand-off is ticket #55. Its T3 Code state is faked by the Prototype bar at the
  bottom left (or ?state=starting|working|input|done|failed|offline). The other hand-offs
  stay put so the in-flight list always has something in it.
*/
(() => {
  Object.assign(Kit.icons, {
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    home: '<path d="m3 10.5 9-7 9 7"/><path d="M5.5 9.2V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.9-3.5L3 10"/><path d="M3 4v6h6"/><path d="M4 13a8 8 0 0 0 14.9 3.5L21 14"/><path d="M21 20v-6h-6"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    back: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    graph: '<rect x="3" y="4" width="7" height="6" rx="1.5"/><rect x="14" y="14" width="7" height="6" rx="1.5"/><path d="M10 7h1.5a2.5 2.5 0 0 1 2.5 2.5V14"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>',
    beaker: '<path d="M9.5 3h5"/><path d="M10.8 3v6.4L5.5 17.9A2 2 0 0 0 7.2 21h9.6a2 2 0 0 0 1.7-3.1L13.2 9.4V3"/><path d="M7.8 15h8.4"/>',
    lens: '<circle cx="11" cy="11" r="6.4"/><path d="m20 20-4.4-4.4"/>',
    grill: '<path d="M3.5 8.5h17"/><path d="M5 8.5a7 7 0 0 0 14 0"/><path d="m8.4 14.5-2.4 6.3"/><path d="m15.6 14.5 2.4 6.3"/>',
    list: '<path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/><path d="M8.5 6H20"/><path d="M8.5 12H20"/><path d="M8.5 18H20"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    lock: '<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    person: '<path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="7" r="4"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    play: '<path d="M7 4v16l13-8z" fill="currentColor"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
    pulse: '<path d="M3 12h4l2.5-6 5 12 2.5-6H21"/>',
    ask: '<path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.5-5.6A8.5 8.5 0 1 1 21 12z"/><path d="M9.8 9.6a2.3 2.3 0 0 1 4.4.9c0 1.5-2.2 2-2.2 3.2M12 16.5h.01"/>',
    pr: '<circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M6 8.4v7.2"/><path d="M18 15.6V9a3 3 0 0 0-3-3h-4"/><path d="m13 3.5-2.5 2.5L13 8.5"/>',
    x: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
    plug: '<path d="M9 2v5M15 2v5"/><path d="M6 7h12v4a6 6 0 0 1-12 0z"/><path d="M12 17v5"/><path d="M3 3l18 18"/>',
    branch: '<circle cx="6" cy="5" r="2.2"/><circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="7" r="2.2"/><path d="M6 7.2v9.6"/><path d="M18 9.2c0 5-6 3.5-11 7.6"/>',
    folder: '<path d="M4 20a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5l2 2.5h8a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1z"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    retry: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    flight: '<path d="M2 16.5 22 9l-4 11-5-4-3 3v-5l7-6"/>',
    map: '<path d="m9 4-6 2.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
    dot: '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
  });

  const esc = Kit.esc;
  const icon = Kit.icon;

  /* ---------- T3 Code states ---------- */

  // One word, one icon and one tone per state. Offline is not a status of its own: the
  // last known status stays, marked stale (#41).
  const STATUS = {
    starting: { word: 'Starting', icon: 'spin', tone: 'var(--state-claimed)', rank: 4 },
    working: { word: 'Working', icon: 'pulse', tone: 'var(--state-claimed)', rank: 3 },
    input: { word: 'Needs you', icon: 'ask', tone: 'var(--state-blocked)', rank: 0 },
    done: { word: 'PR ready', icon: 'pr', tone: 'var(--state-frontier)', rank: 2 },
    failed: { word: 'Failed', icon: 'x', tone: 'var(--ho-failed)', rank: 1 },
  };
  const FAKE_STATES = [
    ['starting', 'Starting'],
    ['working', 'Working'],
    ['input', 'Needs input'],
    ['done', 'Done with PR'],
    ['failed', 'Failed'],
    ['offline', 'T3 Code not running'],
  ];

  const REPO = 'RAbdelrhman/wayfinder-map';
  const MAP = { number: 35, title: 'Redesign Home and Start a new map, prototyped on a design canvas' };

  // What each state says about the focus ticket, #55.
  const FOCUS_DETAIL = {
    starting: { line: 'Opening a worktree and starting the thread…', since: 'just now' },
    working: { line: 'Editing src/server/handOffs.ts', since: '12 min' },
    input: { line: 'Asked: "Should a hand-off that T3 Code archived count as done or failed?"', since: '3 min ago' },
    done: { line: 'PR #76 · 7 files · checks passing', since: '4 min ago', pr: 76 },
    failed: { line: 'The thread stopped: "npm test" failed 3 times in src/server/handOffs.test.ts.', since: '6 min ago' },
  };

  const OTHERS = [
    {
      id: 'h48',
      kind: 'ticket',
      number: 48,
      type: 'G',
      title: 'Which Start a new map flow ships?',
      status: 'input',
      line: 'Asked: "Keep the Simple / Mid / Hard chip, or hide it behind More?"',
      since: '8 min ago',
      branch: 'wayfinder/48-which-start-a-new-map-flow-ships',
      model: 'Hard · Fable 5 · high',
    },
    {
      id: 'h50',
      kind: 'ticket',
      number: 50,
      type: 'T',
      title: 'Consolidate shared design tokens and components in styles.css',
      status: 'done',
      line: 'PR #74 · 12 files · checks passing',
      since: '1 h ago',
      pr: 74,
      branch: 'wayfinder/50-consolidate-shared-design-tokens',
      model: 'Mid · Opus 5 · high',
    },
    {
      id: 'hmap',
      kind: 'map',
      title: 'Offline draft mode',
      status: 'working',
      line: 'Planning the map: 6 tickets drafted',
      since: '4 min',
      branch: 'wayfinder/new-map-offline-draft-mode',
      model: 'Mid · Opus 5 · high',
    },
    {
      id: 'h53',
      kind: 'ticket',
      number: 53,
      type: 'T',
      title: 'Redesign the repository views',
      status: 'working',
      line: 'Running npm test',
      since: '27 min',
      branch: 'wayfinder/53-redesign-the-repository-views',
      model: 'Mid · Opus 5 · high',
    },
  ];

  const params = new URLSearchParams(location.search);
  const startState = params.get('state') ?? 'working';
  const state = {
    fake: FAKE_STATES.some(([k]) => k === startState) ? startState : 'working',
    view: params.get('view') ?? 'map',
    handedOff: params.get('fresh') !== '1',
    open: params.get('open') !== '0', // variant-owned panels (B's tray)
    others: params.get('others') !== '0', // the four other hand-offs; off shows an empty start
  };
  let lastFake = state.fake === 'offline' ? 'working' : state.fake;

  const offline = () => state.fake === 'offline';

  /** Every hand-off, the focus one first, each with its status and lines. */
  function handOffs() {
    const focusStatus = offline() ? lastFake : state.fake;
    const d = FOCUS_DETAIL[focusStatus];
    const focus = {
      id: 'h55',
      kind: 'ticket',
      number: 55,
      type: 'T',
      title: 'Track hand-offs on the server',
      status: focusStatus,
      line: d.line,
      since: d.since,
      pr: d.pr,
      branch: 'wayfinder/55-track-hand-offs-on-the-server',
      model: 'Mid · Opus 5 · high',
      focus: true,
    };
    const rest = state.others ? OTHERS : [];
    const list = state.handedOff ? [focus, ...rest] : rest.slice();
    return list.map((h) => ({ ...h, stale: offline() }));
  }
  /** Ordered by what is waiting on you: needs you, failed, PR ready, working, starting. */
  const byUrgency = (list) => list.slice().sort((a, b) => STATUS[a.status].rank - STATUS[b.status].rank);
  const focusHandOff = () => handOffs().find((h) => h.focus) ?? null;
  const waiting = (list) => list.filter((h) => h.status === 'input' || h.status === 'failed').length;

  const label = (h) => (h.kind === 'map' ? `New map · ${h.title}` : `#${h.number} ${h.title}`);
  const where = (h) => (h.kind === 'map' ? 'Being planned · wayfinder-map' : `Map #${MAP.number} · wayfinder-map`);
  const target = (h) => (h.kind === 'map' ? `the draft map "${h.title}"` : `ticket #${h.number} on map #${MAP.number}`);

  /* ---------- small pieces ---------- */

  const statusIcon = (status) => (status === 'starting' ? '<span class="ho-spin" aria-hidden="true"></span>' : icon(STATUS[status].icon));

  /** The status pill: tone, icon and a word. Stale when T3 Code is off. */
  function pill(h, { size = '' } = {}) {
    const s = STATUS[h.status];
    return `<span class="ho-pill${h.stale ? ' is-stale' : ''}${size ? ` is-${size}` : ''}${h.status === 'working' && !h.stale ? ' is-live' : ''}" style="--tone:${s.tone}">${statusIcon(h.status)}${s.word}${h.stale ? '<i>· stale</i>' : ''}</span>`;
  }
  const dot = (h) =>
    `<span class="ho-dot${h.stale ? ' is-stale' : ''}${h.status === 'working' && !h.stale ? ' is-live' : ''}" style="--tone:${STATUS[h.status].tone}" title="${STATUS[h.status].word}"></span>`;
  const sinceText = (h) => (h.stale ? 'as of 14 min ago' : h.status === 'working' || h.status === 'starting' ? `for ${h.since}`.replace('for just now', 'just now') : h.since);

  /** The actions a hand-off offers in its state. `compact` gives icon-light buttons for lists. */
  function actions(h, { compact = false, back = true } = {}) {
    const b = (cls, ic, text, to) => `<button type="button" class="${cls}${compact ? ' ho-sm' : ''}" data-to="${esc(to)}">${icon(ic)}${text}</button>`;
    const t3 = (cls = 'ghost') => b(cls, 'external', 'Open in T3 Code', 'the thread in T3 Code');
    const out = [];
    if (h.stale) out.push(b('primary', 'play', 'Start T3 Code', 'T3 Code (it reconnects and catches up)'));
    else if (h.status === 'input') out.push(b('primary', 'ask', 'Answer in T3 Code', 'the thread in T3 Code, at the question'));
    else if (h.status === 'done') out.push(b('primary', 'pr', `Open PR #${h.pr}`, `PR #${h.pr} on GitHub`), t3());
    else if (h.status === 'failed') out.push(b('primary', 'retry', 'Try again', `a fresh hand-off for ${h.kind === 'map' ? 'the map' : `#${h.number}`}`), t3());
    else out.push(t3(compact ? 'ghost' : 'primary'));
    if (back) out.push(`<button type="button" class="linkish ho-back" data-to="${esc(target(h))}">${h.kind === 'map' ? 'Go to the map' : 'Go to the ticket'}</button>`);
    return out.join('');
  }

  /** The "T3 Code isn't running" line, shared by every variant. */
  const offlineBanner = (extra = '') =>
    offline()
      ? `<div class="ho-offline" role="status">${icon('plug')}<span class="grow"><b>T3 Code isn't running.</b> Showing what it last reported, 14 min ago. Nothing has failed.</span>${extra}<button type="button" class="ghost ho-sm" data-to="T3 Code">${icon('play')}Start T3 Code</button></div>`
      : '';

  /** A timeline of what the thread did, as far as the focus state goes. */
  function timeline(h) {
    const steps = [
      ['Handed off', '10:02', 'Prompt sent with Mid · Opus 5 · high', true],
      ['Thread started', '10:02', 'Worktree at C:\\code\\wayfinder-map\\.t3\\55-track-hand-offs', h.status !== 'starting'],
    ];
    if (h.status === 'working') steps.push(['Working', 'now', 'Editing src/server/handOffs.ts', 'live']);
    if (h.status === 'input') steps.push(['Asked you a question', '10:11', h.line.replace(/^Asked: /, ''), 'wait']);
    if (h.status === 'done') steps.push(['Asked you a question', '10:11', 'Archived counts as done', true], ['Answered', '10:13', '', true], ['PR #76 opened', '10:29', 'wayfinder/55-track-hand-offs-on-the-server → main · checks passing', 'good']);
    if (h.status === 'failed') steps.push(['Working', '10:03', '', true], ['Stopped', '10:24', h.line.replace(/^The thread stopped: /, ''), 'bad']);
    if (h.status === 'starting') steps[1][3] = 'live';
    return `<ol class="ho-timeline">${steps
      .map(
        ([t, at, sub, st]) =>
          `<li class="${st === true ? 'is-done' : st === 'live' ? 'is-live' : st === 'wait' ? 'is-wait' : st === 'good' ? 'is-good' : st === 'bad' ? 'is-bad' : ''}${h.stale && st === 'live' ? ' is-stale' : ''}"><span class="ho-tl-dot"></span><span class="grow"><b>${esc(t)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</span><time>${esc(at)}</time></li>`,
      )
      .join('')}</ol>`;
  }

  /** Key facts about a hand-off, in the ticket panel's .facts grid. */
  const facts = (h) => `<dl class="facts ho-facts">
      <dt>Branch</dt><dd>${icon('branch')}<code>${esc(h.branch)}</code></dd>
      ${h.pr ? `<dt>PR</dt><dd>${icon('pr')}<a class="linkish" href="#" data-to="PR #${h.pr}">#${h.pr}</a> · checks passing</dd>` : ''}
      <dt>Worktree</dt><dd>${icon('folder')}<code>.t3\\${h.kind === 'map' ? 'new-map' : `${h.number}-…`}</code></dd>
      <dt>Model</dt><dd>${icon('cpu')}${esc(h.model)}</dd>
    </dl>`;

  /* ---------- the map page ---------- */

  const STATES = {
    frontier: { label: 'next', icon: 'arrow', v: '--state-frontier' },
    claimed: { label: 'claimed', icon: 'person', v: '--state-claimed' },
    blocked: { label: 'blocked', icon: 'lock', v: '--state-blocked' },
    done: { label: 'done', icon: 'check', v: '--state-done' },
  };
  const TYPES = { R: ['research', 'lens'], P: ['prototype', 'beaker'], G: ['grilling', 'grill'], T: ['task', 'list'] };
  const T = (number, col, row, type, st, title) => ({ number, col, row, type, state: st, title });
  const TICKETS = [
    T(41, 0, 0, 'G', 'done', 'How deep does hand-off tracking go?'),
    T(44, 0, 1, 'P', 'done', 'What should starting a new map feel like?'),
    T(37, 0, 2, 'R', 'done', "What is the map page's design system?"),
    T(45, 1, 0, 'P', 'claimed', 'What does the user see after handing off to T3 Code?'),
    T(55, 1, 1, 'T', 'frontier', 'Track hand-offs on the server'),
    T(48, 1, 2, 'G', 'claimed', 'Which Start a new map flow ships?'),
    T(50, 1, 3, 'T', 'claimed', 'Consolidate shared design tokens and components'),
    T(49, 2, 0, 'G', 'blocked', 'Which after-hand-off experience ships?'),
    T(56, 2, 1, 'T', 'blocked', 'Show hand-off status and links'),
    T(53, 2, 2, 'T', 'claimed', 'Redesign the repository views'),
    T(54, 2, 3, 'T', 'blocked', 'Redesign the Start a new map flow'),
  ];
  const EDGES = [
    [41, 45],
    [41, 55],
    [44, 48],
    [45, 49],
    [55, 56],
    [49, 56],
    [48, 54],
  ];
  const NODE_W = 236;
  const NODE_H = 104;
  const pos = (t) => ({ x: 28 + t.col * (NODE_W + 70), y: 28 + t.row * (NODE_H + 20) });

  /** A ticket's state while it is handed off: #55 is claimed from the moment it leaves. */
  const ticketState = (t) => (t.number === 55 && state.handedOff ? 'claimed' : t.state);

  function nodeHtml(t, { badge, selected }) {
    const st = STATES[ticketState(t)];
    const p = pos(t);
    const b = badge ? badge(t) : '';
    return `<button type="button" class="node${ticketState(t) === 'done' ? ' is-done' : ''}${selected === t.number ? ' is-selected' : ''}${b ? ' ho-has-badge' : ''}" data-to="ticket #${t.number} in the ticket panel" style="--accent: var(${st.v}); left:${p.x}px; top:${p.y}px; width:${NODE_W}px; height:${NODE_H}px">
      <span class="node-top"><span class="glyph">${icon(TYPES[t.type][1])}</span><span class="num">#${t.number}</span><span class="chip" style="--accent: var(${st.v})">${icon(st.icon)}${st.label}</span></span>
      <span class="title">${esc(t.title)}</span>${b || `<span class="meta">${ticketState(t) === 'claimed' || ticketState(t) === 'done' ? '@RAbdelrhman' : TYPES[t.type][0]}</span>`}</button>`;
  }

  function edgesSvg() {
    const at = Object.fromEntries(TICKETS.map((t) => [t.number, pos(t)]));
    return EDGES.map(([a, b]) => {
      const x1 = at[a].x + NODE_W;
      const y1 = at[a].y + NODE_H / 2;
      const x2 = at[b].x;
      const y2 = at[b].y + NODE_H / 2;
      const m = (x1 + x2) / 2;
      return `<path d="M${x1} ${y1}C${m} ${y1} ${m} ${y2} ${x2} ${y2}"/>`;
    }).join('');
  }

  /** Filters row; `extra` is a variant's own chip. */
  const filters = (extra = '') =>
    `<div class="filters"><button type="button" class="fchip is-on">All <b>${TICKETS.length}</b></button>${['frontier', 'claimed', 'blocked', 'done']
      .map((s) => `<button type="button" class="fchip" style="--accent: var(${STATES[s].v})">${icon(STATES[s].icon)}${{ frontier: 'Next up', claimed: 'Claimed', blocked: 'Blocked', done: 'Done' }[s]} <b>${TICKETS.filter((t) => ticketState(t) === s).length}</b></button>`)
      .join('')}${extra}</div>`;

  /** The ticket panel for #55. `slot` replaces the launch block. */
  function ticketPanel(slot) {
    const t = TICKETS.find((x) => x.number === 55);
    const st = STATES[ticketState(t)];
    return `<aside class="inspector"><div class="insp-tabs"><div class="segmented"><button class="seg">Brief</button><button class="seg is-on">Ticket</button></div></div>
      <div class="insp-panel">
        <div class="dhead"><span class="glyph">${icon('list')}</span><span class="num">#55</span><span class="chip" style="--accent: var(${st.v})">${icon(st.icon)}${st.label}</span></div>
        <h2 class="dtitle">${esc(t.title)}</h2>
        ${slot}
        <div class="prose ho-prose"><h3>Question</h3><p>Persist a minimal record of every hand-off under <code>~/.wayfinder-map/</code> and keep it current from T3 Code's WebSocket, reconciling against <code>/api/orchestration/snapshot</code> every minute.</p>
        <h3>Done when</h3><ul><li>Records survive a restart</li><li>Branch and PR links are picked up when T3 reports them</li><li>Offline shows the last record as stale</li></ul></div>
      </div></aside>`;
  }

  /** Today's launch block: what the panel shows before (or instead of) a hand-off. */
  const launchBlock = () => `<div class="launch"><div class="launch-actions"><button type="button" class="primary" data-handoff>${icon('play')}Open in T3 Code</button><button type="button" class="ghost" data-to="the clipboard">${icon('copy')}Copy prompt</button></div></div>`;

  function mapPage({ badge, slot, filterExtra = '', overlay = '' } = {}) {
    return `${filters(filterExtra)}<div class="body"><section class="stage">${offlineBanner() ? `<div class="ho-stage-banner">${offlineBanner()}</div>` : ''}<div class="canvas-wrap"><div class="canvas" style="width:980px;height:560px"><svg class="edges" width="980" height="560">${edgesSvg()}</svg><div class="nodes">${TICKETS.map((t) => nodeHtml(t, { badge, selected: 55 })).join('')}</div></div></div>
      <div class="zoom floatbox"><button class="iconbtn">${icon('minus')}</button><button class="iconbtn pct">100%</button><button class="iconbtn">${icon('plus')}</button></div>${overlay}</section>${ticketPanel(slot ?? launchBlock())}</div>`;
  }

  /* ---------- Home (#40): Continue, then In flight ordered by what waits on you ---------- */

  function flightCard(h) {
    return `<div class="card ho-fcard" style="--tone:${STATUS[h.status].tone}">
      <div class="ho-fcard-top">${pill(h)}<span class="ho-when">${esc(sinceText(h))}</span></div>
      <strong>${esc(label(h))}</strong><p class="ho-line">${esc(h.line)}</p><span class="ho-where">${h.kind === 'map' ? icon('map') : icon('graph')}${esc(where(h))}</span>
      <div class="ho-row">${actions(h, { compact: true })}</div></div>`;
  }

  function homePage({ strip } = {}) {
    const list = byUrgency(handOffs());
    return `<main class="page"><div class="sheet ho-home">
      <div class="page-head"><div class="grow"><p class="eyebrow">Home</p><h1>Pick up where you left off</h1></div></div>
      <a class="card ho-continue" href="#" data-view="map"><span class="ho-cont-ic">${icon('graph')}</span><span class="grow"><span class="eyebrow">Continue · wayfinder-map</span><strong>#35 ${esc(MAP.title)}</strong><span class="ho-line">4 next up · 5 claimed</span></span>${icon('arrow')}</a>
      ${offlineBanner()}
      <section class="section"><div class="section-head"><h2>In flight</h2><span class="ho-count">${list.length}${waiting(list) ? ` · ${waiting(list)} waiting on you` : ''}</span></div>
        ${list.length === 0 ? '<p class="ho-line">Nothing in T3 Code right now.</p>' : strip ? strip(list) : `<div class="ho-strip">${list.map(flightCard).join('')}</div>`}</section>
    </div></main>`;
  }

  /* ---------- chrome (#42 D): sidebar tree on pages, folded rail on the map ---------- */

  function side(s, { top = '' } = {}) {
    const row = (attrs, inner, cls = '') => `<a class="ho-trow${cls}" href="#" ${attrs}>${inner}</a>`;
    return `<nav class="ho-side" aria-label="App">
      <div class="ho-side-head"><span class="logo">${icon('compass')}</span><b>Wayfinder</b></div>
      <div class="ho-side-actions"><a class="primary" href="#" data-to="Start a new map">${icon('plus')}Start a new map</a>
        <button type="button" class="search" data-to="Jump to">${icon('lens')}<span class="grow">Jump to…</span><kbd>Ctrl K</kbd></button></div>
      <div class="ho-tree">${top}
        ${row('data-view="home"', `${icon('home')}<span class="grow">Home</span>`, s.view === 'home' ? ' is-on' : '')}
        <div class="ho-tlabel">Repositories</div>
        ${row('data-to="the repository page"', `${icon('chevron')}<span class="ho-mark">WM</span><span class="grow">wayfinder-map</span>`, ' is-trail')}
        <div class="ho-kids">${row('data-view="map"', `${icon('graph')}<span class="grow">#35 Redesign Home and Start a…</span>`, s.view === 'map' ? ' is-on' : '')}
          ${row('data-to="map #14"', `${icon('graph')}<span class="grow">#14 Installable desktop app</span>`)}</div>
        ${row('data-to="podcontrol"', `${icon('right')}<span class="ho-mark" style="--h:150">PC</span><span class="grow">podcontrol</span>`)}
        ${row('data-to="pdfbuilder"', `${icon('right')}<span class="ho-mark" style="--h:28">PB</span><span class="grow">pdfbuilder</span>`)}
      </div>
      <div class="ho-side-foot"><span class="rail-mark">R</span><span class="grow">ramon</span><button type="button" class="rail-btn" data-to="settings">${icon('moon')}</button></div></nav>`;
  }

  function rail(s, { extra = '' } = {}) {
    return `<nav class="rail" aria-label="App"><a class="logo" href="#" data-view="home">${icon('compass')}</a>
      <button type="button" class="rail-btn" data-to="the sidebar" title="Open the sidebar">${icon('panel')}</button>
      <a class="rail-btn${s.view === 'map' ? ' is-on' : ''}" href="#" data-view="map" title="Map">${icon('graph')}</a>
      <a class="rail-btn" href="#" data-to="the table view" title="Table">${icon('table')}</a>
      <a class="rail-btn" href="#" data-to="this map's prototypes" title="Prototypes">${icon('beaker')}</a>
      ${extra}<span class="rail-spacer"></span>
      <button type="button" class="rail-btn" data-to="the theme switch">${icon('moon')}</button></nav>`;
  }

  function topbar(s, { right = '', title } = {}) {
    const t =
      title ??
      (s.view === 'map'
        ? `<span class="crumbs"><span class="ho-mark">WM</span>wayfinder-map<span class="crumb-sep">/</span></span><span class="ho-ptitle">#35 ${esc(MAP.title)}</span>`
        : `<span class="ho-ptitle">${s.view === 'home' ? 'Home' : ''}</span>`);
    return `<header class="topbar">${t}<span class="topbar-spacer"></span>${right}<span class="synced">${offline() ? 'T3 Code offline' : 'Synced just now'}</span></header>`;
  }

  /* ---------- the Prototype bar: fakes T3 Code's state ---------- */

  function protoBar() {
    return `<div class="ho-proto" role="group" aria-label="Prototype: fake T3 Code state"><span class="ho-proto-tag">Prototype</span><span class="ho-proto-lbl">#55 in T3 Code:</span>
      ${FAKE_STATES.map(([k, l]) => `<button type="button" class="${state.fake === k ? 'is-on' : ''}" data-fake="${k}">${l}</button>`).join('')}
      <span class="ho-proto-sep"></span><button type="button" class="${state.others ? '' : 'is-on'}" data-others title="Hide the four other hand-offs, to see a quiet start">Only #55</button><button type="button" data-replay title="Undo the hand-off and press Open in T3 Code again">${icon('retry')}Replay hand-off</button></div>`;
  }

  /* ---------- state and rendering ---------- */

  let render = null;
  let timer = null;

  function paint() {
    document.getElementById('root').innerHTML = render(state) + protoBar();
    Kit.fillIcons();
  }

  function setFake(k) {
    state.fake = k;
    if (k !== 'offline') lastFake = k;
    state.handedOff = true;
    paint();
  }

  /** What pressing Open in T3 Code does in every variant: start, then settle into Working. */
  function handOff() {
    clearTimeout(timer);
    state.handedOff = true;
    state.justHandedOff = true;
    setFake('starting');
    timer = setTimeout(() => {
      state.justHandedOff = false;
      if (state.fake === 'starting') setFake('working');
    }, 2600);
  }

  document.addEventListener('click', (e) => {
    const fake = e.target.closest('[data-fake]');
    if (fake) {
      clearTimeout(timer);
      state.justHandedOff = false;
      return setFake(fake.dataset.fake);
    }
    if (e.target.closest('[data-others]')) {
      state.others = !state.others;
      return paint();
    }
    if (e.target.closest('[data-replay]')) {
      clearTimeout(timer);
      state.handedOff = false;
      state.justHandedOff = false;
      state.view = 'map';
      state.fake = 'working';
      lastFake = 'working';
      paint();
      return Kit.toast('Press Open in T3 Code in the ticket panel');
    }
    if (e.target.closest('[data-handoff]')) {
      e.preventDefault();
      return handOff();
    }
    const view = e.target.closest('[data-view]');
    if (view) {
      e.preventDefault();
      state.view = view.dataset.view;
      state.justHandedOff = false;
      return paint();
    }
    const toggle = e.target.closest('[data-toggle]');
    if (toggle) {
      e.preventDefault();
      state.open = !state.open;
      return paint();
    }
  });

  window.AFTER = {
    STATUS,
    FAKE_STATES,
    MAP,
    state,
    esc,
    icon,
    offline,
    handOffs,
    byUrgency,
    focusHandOff,
    waiting,
    label,
    where,
    target,
    pill,
    dot,
    statusIcon,
    sinceText,
    actions,
    offlineBanner,
    timeline,
    facts,
    launchBlock,
    mapPage,
    homePage,
    flightCard,
    side,
    rail,
    topbar,
    paint,
    handOff,
    start(fn) {
      render = fn;
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint);
      else paint();
    },
  };
})();
