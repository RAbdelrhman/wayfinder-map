/*
  PROTOTYPE (#224): starting a ticket from the phone and watching its session, on #223's picked
  screens (R-C2 Maps, M-C map tabs, T-C ticket tabs) and #316's Settings page (G-a).
  ?o=A|B|C picks the option; ?s= opens a scenario from SCENARIOS. Every tap is fake: nothing
  reaches GitHub, T3 Code or a desktop. Timers start only after a tap, so every frame loads still.
    A  On the ticket: Start asks in an alert; the run lives in a Session tab on its ticket.
    B  Session page: Start opens a sheet; a run gets its own page with Summary, Transcript and
       Tools; Maps shows a banner while starts wait or after they were sent.
    C  On Maps: Start is one tap with Undo; Maps lists what is on the desktop; Live reads
       newest first.
  Settings → Desktop (pairing, waiting starts, unpair, replace) is the same page in all three.
*/
(() => {
  const params = new URLSearchParams(location.search);
  const O = ['A', 'B', 'C'].includes(params.get('o')) ? params.get('o') : 'A';
  const P = window.PHONE;
  const R = P.run230;
  const L = window.RUN_LOOKS;
  const S = window.STATES;
  const esc = Kit.esc;
  const ic = Kit.icon;
  const app = document.getElementById('app');

  // Match #226's phone-sized presentation while leaving narrow phone views full width.
  const fitDevice = () => document.documentElement.style.setProperty('--device-fit', String(Math.min(1, (innerHeight - 24) / 844, (innerWidth - 24) / 390)));
  addEventListener('resize', fitDevice);
  fitDevice();

  const ticketBy = (n) => P.tickets.find((t) => t.number === n);
  const toMin = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const span = (from, to) => `${Math.max(1, toMin(to) - toMin(from))} min`;
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  /* ---------- state ---------- */
  const st = {
    clock: '10:14',
    pairing: { ...P.desktop },
    net: 'online', // online | offline | checking
    lastReached: '10:14',
    queue: [], // starts this phone holds: { n, at, phase: waiting | sending }
    holding: null, // C: a start inside its Undo window
    outcomes: {}, // n → { kind: sent | rejected, at, why }
    runs: {}, // n → a run the desktop relays
    notice: null, // { tone, text, more } at the top of the Desktop page
    overlay: null, // { kind: start | queue | sheet | unpair | replace | scan, … }
    snack: null, // C: { text, n, frozen }
    found: null, // the desktop a replacement scan found
  };
  const stack = [{ screen: 'maps' }];
  const ui = { tab: 'overview', mapTab: 'path', filter: 'all', btab: 'summary', picker: false, focus: null, scroll: null };
  const here = () => stack[stack.length - 1];
  const desk = () => st.pairing?.name ?? 'your desktop';

  function run230(phase) {
    const whole = { t: R.streaming.t, kind: 'msg', text: R.streaming.text };
    const run = {
      n: 230, origin: 'phone', started: R.started, model: R.model, branch: R.branch,
      status: 'working', link: 'live', events: [...R.base], streaming: null, awayFrom: null,
      finished: null, pr: null, plan: R.plan, planDone: 2,
    };
    if (phase === 'live' || phase === 'reconnecting') run.streaming = R.streaming.text.slice(0, R.streaming.cut);
    if (phase === 'reconnecting') run.link = 'reconnecting';
    if (phase === 'caughtup' || phase === 'done') {
      run.events.push(whole);
      run.awayFrom = run.events.length;
      run.events.push(...R.away);
      Object.assign(run, { status: 'needs', link: 'caughtup', planDone: 4 });
    }
    if (phase === 'done') {
      run.events.push(...R.after);
      Object.assign(run, { status: 'pr', link: 'ended', finished: '10:31', pr: R.pr, awayFrom: null, planDone: 6 });
    }
    if (phase === 'failed') {
      run.events.push(whole, ...R.failed);
      Object.assign(run, { status: 'failed', link: 'ended', finished: '10:16' });
    }
    return run;
  }

  // A run the desktop already relays (started there, or sent from this phone's queue).
  function relayed(n) {
    const r = JSON.parse(JSON.stringify(P.runs[n]));
    return { n, link: r.finished ? 'ended' : 'live', streaming: null, awayFrom: null, plan: null, planDone: 0, ...r };
  }

  function freshRun(n) {
    const t = ticketBy(n);
    return {
      n, origin: 'phone', started: st.clock, model: R.model, branch: `wayfinder/${n}-${t.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32).replace(/-$/, '')}`,
      status: 'starting', link: 'live', streaming: null, awayFrom: null, finished: null, pr: null, plan: null, planDone: 0,
      events: [{ t: st.clock, kind: 'prompt', text: `Work on #${n} from map #${P.map.number} in ${P.map.repo}: ${t.title}.` }],
    };
  }

  /* ---------- scenarios: the step each frame opens at ---------- */
  const ticketPath = (n) => [{ screen: 'maps' }, { screen: 'map' }, { screen: 'ticket', n }];
  const watchPath = (n) => {
    if (O === 'A') {
      ui.tab = 'session';
      return ticketPath(n);
    }
    return O === 'C' ? [{ screen: 'maps' }, { screen: 'session', n }] : [...ticketPath(n), { screen: 'session', n }];
  };
  const desktopPath = () => [{ screen: 'maps' }, { screen: 'settings' }, { screen: 'desktop' }];
  const open = (...screens) => stack.splice(0, stack.length, ...screens);
  const two = () => [{ n: 233, at: '10:20', phase: 'waiting' }, { n: 226, at: '10:24', phase: 'waiting' }];

  function phoneOffline() {
    st.net = 'offline';
    st.lastReached = '10:14';
    st.runs[230] = run230('reconnecting');
  }

  // 10:41: the phone reached RAMON-PC again and sent its two waiting starts.
  function backInTouch() {
    st.clock = '10:42';
    st.lastReached = '10:41';
    st.runs[230] = run230('done');
    st.runs[226] = relayed(226);
    st.runs[233] = relayed(233);
    st.outcomes[226] = { kind: 'sent', at: '10:41' };
    st.outcomes[233] = { kind: 'rejected', at: '10:41', why: 'It was already started on the desktop at 10:38.', watch: true };
  }

  const SCENARIOS = {
    maps() {},
    start: () => open(...ticketPath(230)),
    confirm() {
      open(...ticketPath(230));
      askStart(230, true);
    },
    live() {
      st.runs[230] = run230('live');
      open(...watchPath(230));
    },
    transcript() {
      SCENARIOS.live();
      ui.btab = 'transcript';
    },
    tools() {
      SCENARIOS.live();
      ui.btab = 'tools';
    },
    reconnecting() {
      phoneOffline();
      st.clock = '10:22';
      open(...watchPath(230));
    },
    caughtup() {
      st.runs[230] = run230('caughtup');
      st.clock = '10:24';
      st.lastReached = '10:24';
      open(...watchPath(230));
    },
    done() {
      st.runs[230] = run230('done');
      st.clock = '10:33';
      open(...watchPath(230));
    },
    failed() {
      st.runs[230] = run230('failed');
      st.clock = '10:18';
      open(...watchPath(230));
    },
    offline() {
      phoneOffline();
      st.clock = '10:20';
      open(...ticketPath(233));
      askStart(233, true);
    },
    queued() {
      phoneOffline();
      st.clock = '10:21';
      st.queue = [{ n: 233, at: '10:20', phase: 'waiting' }];
      open(...ticketPath(233));
    },
    pending() {
      phoneOffline();
      st.clock = '10:25';
      st.queue = two();
      open(...(O === 'A' ? desktopPath() : [{ screen: 'maps' }]));
    },
    sent() {
      backInTouch();
      open(...(O === 'A' ? ticketPath(226) : [{ screen: 'maps' }]));
    },
    rejected() {
      backInTouch();
      if (O === 'B') {
        st.notice = { tone: 'ok', text: `Back in touch with ${desk()}.`, more: 'Sent #226. #233 didn’t start.' };
        st.reportSeen = true;
        open({ screen: 'maps' }, { screen: 'desktop' });
      } else open(...ticketPath(233));
    },
    unpaired() {
      st.pairing = null;
      open(...ticketPath(230));
    },
    pair() {
      st.pairing = null;
      if (O === 'A') open(...ticketPath(230), { screen: 'desktop' });
      else if (O === 'B') open(...ticketPath(230), { screen: 'pair' });
      else {
        open(...ticketPath(230));
        ui.pairFor = 230;
        st.overlay = { kind: 'scan', forTicket: 230 };
      }
    },
    pairconfirm() {
      st.pairing = null;
      st.found = P.desktop;
      open(...ticketPath(230), { screen: 'pair' }, { screen: 'pairconfirm' });
    },
    paired() {
      if (O === 'A') {
        st.notice = { tone: 'ok', text: `Paired with ${desk()}.`, more: 'Start a next-up ticket from its page.' };
        open(...ticketPath(230), { screen: 'desktop' });
      } else if (O === 'B') open(...ticketPath(230), { screen: 'pair' }, { screen: 'paired' });
      else {
        open(...ticketPath(230));
        st.holding = { n: 230 };
        st.snack = { text: `Paired with ${desk()}. Starting #230.`, n: 230, frozen: true };
      }
    },
    // Settings → Desktop, the same in A, B and C.
    settings: () => open({ screen: 'maps' }, { screen: 'settings' }),
    desktop: () => open(...desktopPath()),
    'desktop-unpaired'() {
      st.pairing = null;
      open(...desktopPath());
    },
    scan() {
      st.pairing = null;
      open(...desktopPath());
      st.overlay = { kind: 'scan' };
    },
    code() {
      st.pairing = null;
      open(...desktopPath(), { screen: 'code' });
    },
    unpair() {
      open(...desktopPath());
      st.overlay = { kind: 'unpair' };
    },
    replace() {
      phoneOffline();
      st.clock = '10:25';
      st.queue = two();
      st.found = P.other;
      open(...desktopPath());
      st.overlay = { kind: 'replace' };
    },
    expired() {
      st.pairing = null;
      open(...desktopPath(), { screen: 'error', kind: 'expired' });
    },
    used() {
      st.pairing = null;
      open(...desktopPath(), { screen: 'error', kind: 'used' });
    },
    unreachable() {
      st.pairing = null;
      st.found = P.desktop;
      open(...desktopPath(), { screen: 'error', kind: 'unreachable' });
    },
    removed() {
      st.pairing = null;
      st.notice = { tone: 'warn', text: `${P.desktop.name} removed this phone.`, more: 'The 2 starts waiting for it were discarded. Pair again to start tickets from here.' };
      open(...desktopPath());
    },
  };

  /* ---------- shared pieces ---------- */
  const status = () => `<div class="m-status" aria-hidden="true"><span>${st.clock}</span><span>●●● ▮</span></div>`;
  const backBtn = (label) =>
    `<button class="m-back" data-act="back" aria-label="Back to ${esc(label)}"><span class="m-back-face">${ic('back')}${esc(label)}</span></button>`;
  // #316 G-a's bar, as mobile/src/auth/SettingsScreen.tsx builds it: title on the true centre, Back on the 16px content edge.
  const bar = (title, right = '<span></span>') => `<header class="m-bar ac-bar3">${stack.length > 1 ? backBtn(backLabel()) : '<span></span>'}<h1>${esc(title)}</h1>${right}</header>`;
  const largeBar = (title, right) => `<header class="m-bar is-large"><div class="m-bar-row"><span></span>${right}</div><h1>${esc(title)}</h1></header>`;
  const chip = (state) => `<span class="m-chip" style="--accent: var(${S[state].variable})">${ic(S[state].icon)}${S[state].label}</span>`;
  const glyph = (type) => `<span class="m-glyph" title="${type}">${ic(TYPE_ICON[type])}<span class="m-sr">${type}</span></span>`;
  const dot = (state) => `<span class="m-dot" style="--accent: var(${S[state].variable})">${ic(S[state].icon)}</span>`;
  const face = (size) => `<span class="avatar ac-face" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px" aria-hidden="true">${esc(P.user.initial)}</span>`;
  const ghLink = (what, label) => `<button class="m-icon-btn" data-toast="Would open ${esc(what)} on GitHub" aria-label="${esc(label)}">${ic('external')}</button>`;

  // A run's status as the desktop's .handoff-pill, with its icon and word.
  function pill(kind, extra = '') {
    const look = L[kind];
    const mark = look.icon ? ic(look.icon) : '<span class="handoff-spinner" aria-hidden="true"></span>';
    return `<span class="handoff-pill st-pill ${look.pill}${extra}">${mark}<span>${look.label}</span></span>`;
  }

  const titleOf = (entry) =>
    ({ maps: 'Maps', map: 'Map', ticket: `#${entry.n}`, session: O === 'C' ? 'Live' : 'Session', settings: 'Settings', desktop: 'Desktop', pair: 'Pair', pairconfirm: 'Pair', paired: 'Pair', code: 'Enter code', error: 'Pair' })[entry.screen] ?? 'Back';
  const backLabel = () => titleOf(stack[stack.length - 2] ?? { screen: 'maps' });

  function stateOf(t) {
    const run = st.runs[t.number];
    return run && t.state === 'frontier' && run.status !== 'starting' ? 'claimed' : t.state;
  }
  const counts = () => Object.fromEntries(STATE_ORDER.map((s) => [s, P.tickets.filter((t) => stateOf(t) === s).length]));

  function progress(c, total) {
    const segs = PROGRESS_ORDER.filter((s) => c[s] > 0)
      .map((s) => `<span style="--accent: var(${S[s].variable}); flex:${c[s]}"></span>`)
      .join('');
    return `<div class="m-progress" role="img" aria-label="${c.done} of ${total} done, ${c.claimed} claimed, ${c.frontier} next up, ${c.blocked} blocked">${segs}</div>`;
  }

  // What the dock, a map row and the Maps list say about a ticket's start or run, if anything.
  function runState(n) {
    const q = st.queue.find((x) => x.n === n);
    if (q) return q.phase === 'sending' ? 'sending' : 'waiting';
    if (st.holding?.n === n) return 'sending';
    if (st.outcomes[n]?.kind === 'rejected') return 'rejected';
    return st.runs[n]?.status ?? null;
  }

  /* ---------- Maps (R-C2), with B's banner or C's "On the desktop" list ---------- */
  function maps() {
    const avatar = `<button class="m-icon-btn ac-avatar" data-act="settings" aria-label="Account, signed in as ${esc(P.user.login)}">${face(30)}</button>`;
    const rows = P.maps
      .map((m) => {
        const c = m.number === P.map.number ? counts() : m.counts;
        const total = Object.values(c).reduce((a, b) => a + b, 0);
        const target = m.number === P.map.number ? 'data-act="map"' : `data-toast="Sample data: only #${P.map.number} has tickets in this prototype."`;
        return `<button class="m-row" ${target} style="align-items:flex-start;flex-wrap:wrap"><span class="m-row-main"><span class="m-row-title">${esc(m.title)}</span>
          <span class="m-row-sub">${esc(m.repo.split('/')[1])} · #${m.number} · ${c.done}/${total} done · ${m.updated}</span>
          <span style="display:block;margin-top:8px">${progress(c, total)}</span></span>${ic('chevron')}</button>`;
      })
      .join('');
    return `${status()}${largeBar('Maps', avatar)}<div class="m-scroll">
      <div class="m-search">${ic('search')}<input aria-label="Search maps" placeholder="Search maps and repos"></div>
      <div class="m-filter-row"><button class="m-filter-btn" data-toast="Filter by is #223’s: unchanged here." aria-label="Filter by repository, showing All maps">${ic('filter')}<span>Filter by</span><b>All maps</b>${ic('down')}</button></div>
      ${O === 'B' ? mapsBannerB() : ''}${O === 'C' ? onDesktopC() : ''}
      <div class="m-section-title">Latest</div><div class="m-group">${rows}</div></div>`;
  }

  // B: one banner on Maps while starts wait, or after they were sent. It opens Settings → Desktop.
  function mapsBannerB() {
    if (!st.pairing) return '';
    const waiting = st.queue.length;
    const sent = Object.values(st.outcomes).filter((o) => o.kind === 'sent').length;
    const missed = Object.values(st.outcomes).filter((o) => o.kind === 'rejected').length;
    if (!waiting && (st.reportSeen || (!sent && !missed))) return '';
    const [accent, icon, title, sub] = waiting
      ? ['--state-blocked', 'clock', `${plural(waiting, 'start')} waiting for ${desk()}`, st.net === 'offline' ? `Can’t reach ${desk()} right now. They send when this phone can.` : 'Sending now.']
      : [missed ? '--state-failed' : '--state-frontier', missed ? 'ban' : 'send', `Back in touch with ${desk()}`, [sent ? `Sent ${plural(sent, 'waiting start')}.` : '', missed ? `${missed} didn’t start.` : ''].filter(Boolean).join(' ')];
    return `<button class="m-banner st-mbanner" data-act="desktop" style="--accent: var(${accent})">${ic(icon)}<span class="m-row-main"><b>${esc(title)}</b><span class="st-mbanner-sub">${esc(sub)}</span></span>${ic('chevron')}</button>`;
  }

  // C: what this phone has on the desktop, above the maps. Only while something is waiting, running or just finished.
  function onDesktopC() {
    if (!st.pairing) return '';
    const items = [];
    for (const q of st.queue) items.push({ n: q.n, kind: q.phase === 'sending' ? 'sending' : 'waiting', q });
    if (st.holding) items.push({ n: st.holding.n, kind: 'sending' });
    for (const [n, out] of Object.entries(st.outcomes)) if (out.kind === 'rejected') items.push({ n: Number(n), kind: 'rejected', out });
    for (const run of Object.values(st.runs)) if (!items.some((i) => i.n === run.n)) items.push({ n: run.n, kind: run.status, run });
    if (!items.length) return '';
    const order = ['needs', 'rejected', 'working', 'starting', 'sending', 'waiting', 'failed', 'pr'];
    items.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    const conn =
      st.net === 'checking'
        ? `<span class="st-sconn"><span class="handoff-spinner" aria-hidden="true"></span>Checking</span>`
        : st.net === 'offline'
          ? `<span class="st-sconn"><span class="st-dot is-offline" aria-hidden="true"></span>Can’t reach<button class="st-try" data-act="try">Try now</button></span>`
          : `<span class="st-sconn"><span class="st-dot is-online" aria-hidden="true"></span>Online</span>`;
    const rows = items.map((i) => desktopItemC(i)).join('');
    return `<div class="m-section-title st-stitle"><span>On ${esc(desk())}</span>${conn}</div><div class="m-group">${rows}</div>
      ${st.net === 'offline' ? `<p class="m-fine st-left">Showing what ${esc(desk())} last sent, at ${st.lastReached}. Maps still load from GitHub.</p>` : ''}`;
  }

  function desktopItemC({ n, kind, run, q, out }) {
    const t = ticketBy(n);
    const look = L[kind];
    const tone = { working: '--handoff-working', starting: '--handoff-working', sending: '--handoff-working', needs: '--handoff-needs-you', pr: '--handoff-pr-ready', failed: '--state-failed', rejected: '--state-failed', waiting: '--text-secondary' }[kind];
    const mark = look.icon ? ic(look.icon) : '<span class="handoff-spinner" aria-hidden="true"></span>';
    const lead = `<span class="m-dot" style="--accent: var(${tone})">${mark}</span>`;
    const name = `<span class="m-row-title">#${n} ${esc(t.title)}</span>`;
    if (kind === 'waiting')
      return `<div class="m-row st-qrow">${lead}<button class="st-qmain" data-act="ticket" data-n="${n}"><span class="m-row-main">${name}<span class="m-row-sub">Waiting to send · since ${q.at}</span></span></button><button class="st-qbtn" data-act="cancel" data-n="${n}" aria-label="Cancel the start of #${n}">Cancel</button></div>`;
    if (kind === 'rejected')
      return `<div class="m-row st-qrow">${lead}<button class="st-qmain" data-act="ticket" data-n="${n}"><span class="m-row-main">${name}<span class="m-row-sub st-wrap">Didn’t start: already started on the desktop</span></span></button><button class="st-qbtn" data-act="dismiss" data-n="${n}" aria-label="Dismiss #${n}">Dismiss</button></div>`;
    if (kind === 'sending')
      return `<button class="m-row" data-act="ticket" data-n="${n}">${lead}<span class="m-row-main">${name}<span class="m-row-sub">Sending to ${esc(desk())}</span></span>${ic('chevron')}</button>`;
    const sub =
      kind === 'sending'
        ? `Sending to ${desk()}`
        : st.net === 'offline' && run?.link !== 'ended'
          ? `${look.label} at ${st.lastReached} · can’t reach now`
          : kind === 'pr'
            ? `PR ready · #${run.pr.number} · ${run.finished}`
            : kind === 'needs'
              ? 'Needs you · answer in T3 Code'
              : kind === 'failed'
                ? `Failed · ${run.finished}`
                : `${look.label} · ${span(run.started, st.clock)}${st.outcomes[n]?.kind === 'sent' ? ' · sent from this phone' : ''}`;
    return `<button class="m-row" data-act="watch" data-n="${n}">${lead}<span class="m-row-main">${name}<span class="m-row-sub">${esc(sub)}</span></span>${ic('chevron')}</button>`;
  }

  /* ---------- map view (M-C): Path, Tickets, Brief ---------- */
  function runTag(n) {
    const kind = runState(n);
    return kind ? pill(kind, ' is-compact') : '';
  }

  function ticketRow(t) {
    const state = stateOf(t);
    const why = state === 'blocked' ? `Needs ${t.needs.map((n) => `#${n}`).join(', ')}` : state === 'claimed' ? `@${t.assignee ?? P.user.login}` : t.type;
    return `<button class="m-row" data-act="ticket" data-n="${t.number}" style="align-items:flex-start">${dot(state)}
      <span class="m-row-main"><span class="m-row-title">${esc(t.title)}</span><span class="m-row-sub st-subrow"><span class="m-num">#${t.number}</span> · ${esc(why)}${runTag(t.number)}</span></span>${ic('chevron')}</button>`;
  }

  function mapView() {
    const tabs = [
      ['path', 'Path'],
      ['tickets', 'Tickets'],
      ['brief', 'Brief'],
    ];
    const c = counts();
    let body;
    if (ui.mapTab === 'path') {
      const layers = [...new Set(P.tickets.map((t) => t.layer))].sort();
      body = `<div class="m-maphead"><p style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(P.map.destination)}</p>${progress(c, P.tickets.length)}</div>${layers
        .map((l) => {
          const list = P.tickets.filter((t) => t.layer === l);
          return `<div class="m-layer"><div class="m-layer-label">${l === 0 ? 'Can start now or already moving' : `Step ${l + 1} · after step ${l}`}</div>${list
            .map((t) => {
              const state = stateOf(t);
              return `<button class="m-tile${state === 'done' ? ' is-done' : ''}" data-act="ticket" data-n="${t.number}" style="--accent: var(${S[state].variable})">${glyph(t.type)}
                <span class="m-row-main">${esc(t.title)}<span class="m-row-sub"><span class="m-num">#${t.number}</span>${chip(state)}${runTag(t.number)}</span></span></button>`;
            })
            .join('')}</div>`;
        })
        .join('')}`;
    } else if (ui.mapTab === 'tickets') {
      const shown = P.tickets.filter((t) => ui.filter === 'all' || stateOf(t) === ui.filter).sort((a, b) => a.number - b.number);
      body = `<div class="m-filter" role="group" aria-label="Filter by state">${['all', ...STATE_ORDER].map((s) => `<button data-act="filter" data-f="${s}" aria-pressed="${ui.filter === s}">${s === 'all' ? `All ${P.tickets.length}` : `${S[s].label} ${c[s]}`}</button>`).join('')}</div>
        <div class="m-group" style="margin-top:12px">${shown.map(ticketRow).join('')}</div>`;
    } else {
      body = `<div class="m-section-title">Destination</div><div class="m-card m-prose">${esc(P.map.destination)}</div>
        <div class="m-section-title">Out of scope</div><div class="m-card m-prose"><ul><li>Answering grilling tickets from the phone.</li><li>Starting a new map on the phone.</li><li>Running tickets in the cloud.</li></ul></div>`;
    }
    return `${status()}${bar(P.map.title, ghLink(`#${P.map.number}`, 'Open map on GitHub'))}
      <div style="padding:0 16px 10px">${tablist('Map view', tabs, ui.mapTab, 'map-tab')}</div><div class="m-scroll" ${panelAttrs('map-tab', ui.mapTab)}>${body}</div>`;
  }

  // #223's segmented tabs, with roving focus so arrow keys move between them. One panel shows the selected tab.
  function tablist(label, tabs, current, act) {
    return `<div class="m-seg" role="tablist" aria-label="${esc(label)}">${tabs
      .map(([k, l, aria]) => `<button role="tab" id="tab-${act}-${k}" aria-controls="panel-${act}" aria-selected="${current === k}" tabindex="${current === k ? 0 : -1}" data-act="${act}" data-tab="${k}"${aria ? ` aria-label="${esc(aria)}"` : ''}>${l}</button>`)
      .join('')}</div>`;
  }
  const panelAttrs = (act, current) => `role="tabpanel" id="panel-${act}" aria-labelledby="tab-${act}-${current}"`;

  /* ---------- ticket detail (T-C) and its start dock ---------- */
  function startableReason(t) {
    const state = stateOf(t);
    if (state === 'done') return 'This ticket is closed.';
    if (state === 'blocked') return `Waiting on ${t.needs.map((n) => `#${n}`).join(' and ')}.`;
    return null;
  }

  function bannerFor(t) {
    const state = stateOf(t);
    if (state === 'blocked') return `<div class="m-banner" style="--accent: var(--state-blocked)">${ic('lock')}<span>Waiting on <b>${t.needs.map((n) => `#${n}`).join(' and ')}</b>.</span></div>`;
    if (state === 'claimed') return `<div class="m-banner" style="--accent: var(--state-claimed)">${ic('person')}<span><b>@${esc(t.assignee ?? P.user.login)}</b> is on it.</span></div>`;
    if (state === 'done') return `<div class="m-banner" style="--accent: var(--state-done)">${ic('check')}<span>This ticket is closed.</span></div>`;
    return `<div class="m-banner" style="--accent: var(--state-frontier)">${ic('arrow')}<span>Open, unblocked and unclaimed: ready to start.</span></div>`;
  }

  function overview(t) {
    const body = t.body ?? { question: 'Placeholder body: the ticket’s question from GitHub, rendered as Markdown.', done: ['Done-when items render as a list.'] };
    return `${bannerFor(t)}<div class="m-prose"><h4>Question</h4><p>${esc(body.question)}</p><h4>Done when</h4><ul>${body.done.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></div>`;
  }

  const pills = (list) =>
    list.length
      ? list.map((n) => { const x = ticketBy(n); const s = x ? stateOf(x) : 'done'; return `<button class="m-pill" data-act="ticket" data-n="${n}" style="--accent: var(${S[s].variable})" aria-label="#${n}, ${S[s].label}">#${n}</button>`; }).join('')
      : '<span class="m-fine">None</span>';

  function ticketPage() {
    const t = ticketBy(here().n);
    const run = st.runs[t.number];
    const comments = P.comments[t.number] ?? [];
    const tabs = [
      ['overview', 'Overview'],
      ['links', `Links ${t.needs.length + t.unblocks.length}`],
      ['activity', `Activity ${comments.length}`],
    ];
    // A: a ticket with a T3 Code thread gets a fourth tab.
    if (O === 'A' && run) tabs.push(['session', `Session${run.link === 'live' && run.status !== 'pr' && run.status !== 'failed' ? '<span class="st-tabdot" aria-hidden="true"></span>' : ''}`, `Session, ${L[run.status].label}`]);
    if (!tabs.some(([k]) => k === ui.tab)) ui.tab = 'overview';
    const body =
      ui.tab === 'overview'
        ? overview(t)
        : ui.tab === 'links'
          ? `<dl class="m-rel"><div><dt>Needs</dt><dd>${pills(t.needs)}</dd></div><div><dt>Unblocks</dt><dd>${pills(t.unblocks)}</dd></div></dl>`
          : ui.tab === 'activity'
            ? comments.map((c) => `<div class="m-comment"><b>@${esc(c.author)}</b><span class="m-num">${c.when}</span><div>${esc(c.text)}</div></div>`).join('') || '<p class="m-fine">No comments yet.</p>'
            : sessionTabA(run);
    const state = stateOf(t);
    const tabsHtml = tablist('Ticket sections', tabs, ui.tab, 'ticket-tab');
    const pinned = ui.tab === 'session' ? `<div class="st-stick">${tabsHtml}${statusRow(run)}${cachedLine(run)}</div>` : tabsHtml;
    return `${status()}${bar(`#${t.number}`, ghLink(`#${t.number}`, 'Open on GitHub'))}<div class="m-scroll" data-scroll>
        <div class="m-dhead">${glyph(t.type)}<span class="m-num">#${t.number} · ${t.type}</span>${chip(state)}</div><h2 class="m-dtitle">${esc(t.title)}</h2>
        ${pinned}<div ${panelAttrs('ticket-tab', ui.tab)} style="margin-top:${ui.tab === 'session' ? 4 : 14}px">${body}</div></div>${dock(t)}`;
  }

  function connLine() {
    if (st.net === 'checking') return `<p class="st-conn"><span class="handoff-spinner" aria-hidden="true"></span><span>Checking ${esc(desk())}…</span></p>`;
    if (st.net === 'offline') return `<p class="st-conn"><span class="st-dot is-offline" aria-hidden="true"></span><span><b>Can’t reach ${esc(desk())}</b> · last reached ${st.lastReached}</span></p>`;
    return `<p class="st-conn"><span class="st-dot is-online" aria-hidden="true"></span><span><b>${esc(desk())}</b> · Online</span></p>`;
  }

  function dock(t) {
    const n = t.number;
    const run = st.runs[n];
    const q = st.queue.find((x) => x.n === n);
    const out = st.outcomes[n];
    if (O === 'A' && run && ui.tab === 'session') return watchBar();
    if (!st.pairing) {
      // C pairs on the way to starting; A and B send you to pair first.
      if (O === 'C')
        return `<div class="m-actionbar st-dock"><p class="st-conn"><span class="st-dot" aria-hidden="true"></span><span><b>No desktop paired.</b> You’ll pair one first.</span></p>
          <button class="m-btn" data-act="start" data-n="${n}">${ic('play')}Start on desktop</button></div>`;
      return `<div class="m-actionbar st-dock"><p class="st-conn"><span class="st-dot" aria-hidden="true"></span><span><b>No desktop paired.</b> Pair one to start tickets from here.</span></p>
        <button class="m-btn is-quiet" data-act="pair-start">${ic('desktop')}Pair a desktop</button></div>`;
    }
    if (out?.kind === 'rejected')
      return `<div class="m-actionbar st-dock"><div class="m-banner st-banner" style="--accent: var(--state-failed)" role="status">${ic('ban')}<span><b>${esc(desk())} didn’t start #${n}.</b> ${esc(out.why)}</span></div>
        <div class="st-dock-row"><button class="m-btn is-quiet" data-act="dismiss" data-n="${n}">OK</button>${out.watch ? `<button class="m-btn" data-act="watch" data-n="${n}">${ic('eye')}Watch it</button>` : ''}</div></div>`;
    if (st.holding?.n === n)
      return `<div class="m-actionbar st-dock">${connLine()}<button class="m-btn is-quiet" disabled aria-busy="true"><span class="m-spinner" aria-hidden="true"></span>Starting on ${esc(desk())}…</button></div>`;
    if (q) {
      const sending = q.phase === 'sending';
      const line = sending ? `Sending to ${esc(desk())}…` : `To ${esc(desk())} · since ${q.at}. It sends when this phone can reach ${esc(desk())}.`;
      return `<div class="m-actionbar st-dock"><div class="st-runline">${pill(sending ? 'sending' : 'waiting')}<span class="st-runmeta">${line}</span></div>
        <button class="m-btn is-quiet" data-act="cancel" data-n="${n}"${sending ? ' disabled' : ''}>${ic('close')}Cancel start</button></div>`;
    }
    if (run) {
      const meta =
        run.status === 'needs'
          ? `Answer it in T3 Code on ${esc(desk())}.`
          : run.status === 'pr'
            ? `#${run.pr.number} · ${esc(run.pr.checks)}`
            : run.status === 'failed'
              ? `Stopped at ${run.finished}.`
              : run.status === 'starting'
                ? `On ${esc(desk())}.`
                : `${span(run.started, st.clock)} on ${esc(desk())}.`;
      const sent = out?.kind === 'sent' ? `<p class="st-sentline">${ic('send')}<span>Sent at ${out.at}, when this phone reached ${esc(desk())} again.</span></p>` : '';
      const label = O === 'A' ? 'Watch session' : O === 'B' ? 'Open session' : 'Watch live';
      return `<div class="m-actionbar st-dock">${sent}<div class="st-runline">${pill(run.status)}<span class="st-runmeta">${meta}</span></div>
        <button class="m-btn" data-act="watch" data-n="${n}">${ic('eye')}${label}</button></div>`;
    }
    const reason = startableReason(t);
    const offline = st.net === 'offline';
    return `<div class="m-actionbar st-dock">${connLine()}
      <button class="m-btn" data-act="start" data-n="${n}"${reason ? ' disabled aria-describedby="start-why"' : ''}>${ic(offline ? 'clock' : 'play')}${offline ? `Start when ${esc(desk())} is back` : `Start on ${esc(desk())}`}</button>
      ${reason ? `<p class="st-why" id="start-why">${esc(reason)}</p>` : ''}</div>`;
  }

  const watchBar = () => `<div class="m-actionbar st-watchbar"><p class="st-watchonly">${ic('info')}<span>Watch only. Reply and approve in T3 Code on ${esc(desk())}.</span></p></div>`;

  /* ---------- watching: the parts every option uses ---------- */
  const TOOL_ICON = { read: 'file', search: 'search', create: 'filePlus', edit: 'pencil', run: 'terminal' };

  function liveChip(run) {
    if (run.link === 'reconnecting') return `<span class="st-live is-off"><span class="handoff-spinner" aria-hidden="true"></span>Reconnecting</span>`;
    if (run.link === 'caughtup') return `<span class="st-live is-caught">${ic('check')}Caught up</span>`;
    if (run.link === 'ended') return `<span class="st-live is-ended">Finished ${run.finished}</span>`;
    return '<span class="st-live">Live</span>';
  }

  const elapsed = (run) => span(run.started, run.finished ?? st.clock);
  const startedLine = (run) => `Started ${run.started} ${run.origin === 'phone' ? 'from this phone' : 'on the desktop'}`;

  function report(run) {
    if (run.status === 'needs') return `T3 Code is waiting for your approval. Answer it in T3 Code on ${esc(desk())}.`;
    return L[run.status].report;
  }

  // #223's offline line ("Offline. Showing what GitHub sent …"), for the desktop.
  function cachedLine(run) {
    if (run.link !== 'reconnecting') return '';
    return `<div class="m-cached st-cached" role="status">${ic('refresh')}<span>Can’t reach ${esc(desk())}. Showing what it sent by ${st.lastReached}; the rest arrives when it’s back.</span><button class="st-try" data-act="try">Try now</button></div>`;
  }

  function toolHtml(e) {
    const head = `<span class="st-tool-ic">${ic(TOOL_ICON[e.tool])}</span><span class="st-ev-main"><span class="st-tool-line"><b>${esc(e.verb)}</b> <code>${esc(e.target)}</code></span>${e.result ? `<span class="st-ev-sub">${esc(e.result)}</span>` : ''}</span><span class="st-time">${e.t}</span>`;
    return e.detail
      ? `<details class="st-ev st-tool" data-k="${e.t} ${esc(e.target)}"><summary>${head}${ic('down')}</summary><p class="st-tool-detail">${esc(e.detail)}</p></details>`
      : `<div class="st-ev st-tool">${head}</div>`;
  }

  function eventHtml(e, run) {
    if (e.kind === 'prompt')
      return `<details class="st-ev st-tool st-prompt" data-k="prompt"><summary><span class="st-tool-ic">${ic('message')}</span><span class="st-ev-main"><span class="st-tool-line"><b>Prompt from Wayfinder</b></span><span class="st-ev-sub">What Wayfinder asked T3 Code to do for #${run.n}</span></span><span class="st-time">${e.t}</span>${ic('down')}</summary><p class="st-tool-detail">${esc(e.text)}</p></details>`;
    if (e.kind === 'msg') return `<div class="st-ev st-msg"><p class="st-msg-meta">T3 Code · ${e.t}</p><p class="st-msg-text">${esc(e.text)}</p></div>`;
    if (e.kind === 'tool') return toolHtml(e);
    if (e.kind === 'approval')
      return `<div class="st-ev st-flag" style="--accent: var(--handoff-needs-you)"><span class="st-tool-ic">${ic('person')}</span><span class="st-ev-main"><span class="st-tool-line"><b>${esc(e.verb)}</b> <code>${esc(e.target)}</code></span><span class="st-ev-sub">Approve or decline in T3 Code on ${esc(desk())}.</span></span><span class="st-time">${e.t}</span></div>`;
    if (e.kind === 'error')
      return `<div class="st-ev st-flag" style="--accent: var(--state-failed)"><span class="st-tool-ic">${ic('alert')}</span><span class="st-ev-main"><span class="st-tool-line"><b>Stopped</b></span><span class="st-ev-sub">${esc(e.text)}</span></span><span class="st-time">${e.t}</span></div>`;
    return '';
  }

  function streamingHtml(run) {
    if (run.streaming === null) return '';
    const live = run.link === 'live';
    return `<div class="st-ev st-msg${live ? ' is-streaming' : ''}"><p class="st-msg-meta">T3 Code · ${live ? 'writing' : `${R.streaming.t}, cut off`}</p><p class="st-msg-text">${esc(run.streaming)}${live ? '<span class="st-caret" aria-hidden="true"></span>' : '…'}</p></div>`;
  }

  const awayCount = (run, filter = () => true) => (run.awayFrom === null ? 0 : run.events.slice(run.awayFrom).filter(filter).length);
  const awayDivider = (run, filter) => `<li class="st-div is-new">While you were away · ${plural(awayCount(run, filter), 'update')}</li>`;

  // Oldest first, as T3 Code shows it: A's Session tab and B's Transcript and Tools.
  function timeline(run, filter = () => true) {
    const items = run.events
      .map((e, i) => `${i === run.awayFrom && awayCount(run, filter) ? awayDivider(run, filter) : ''}${filter(e) ? `<li>${eventHtml(e, run)}</li>` : ''}`)
      .join('');
    const tail = filter({ kind: 'msg' }) ? streamingHtml(run) : '';
    return `<ol class="st-tl" aria-label="Session history"><li class="st-div">${startedLine(run)}</li>${items}${tail ? `<li>${tail}</li>` : ''}</ol>`;
  }

  function outcomeCard(run) {
    if (run.status === 'pr')
      return `<section class="st-card" style="--accent: var(--state-frontier)" aria-label="Outcome"><div class="st-card-head">${pill('pr')}<span class="st-time">${run.finished}</span></div>
        <p class="st-card-title">#${run.pr.number} · ${esc(run.pr.title)}</p><p class="st-card-sub">${esc(run.pr.checks)} · ${esc(run.branch)}</p>
        <button class="m-btn is-quiet" data-toast="Would open #${run.pr.number} on GitHub">${ic('external')}Open PR on GitHub</button></section>`;
    if (run.status === 'failed')
      return `<section class="st-card" style="--accent: var(--state-failed)" aria-label="Outcome"><div class="st-card-head">${pill('failed')}<span class="st-time">${run.finished}</span></div>
        <p class="st-card-title">T3 Code stopped: the provider’s usage limit was reached.</p><p class="st-card-sub">Pick it up in T3 Code on ${esc(desk())}. Nothing on this ticket changed on GitHub.</p></section>`;
    return '';
  }

  /* ---------- A: the Session tab on the ticket ---------- */
  const statusRow = (run) => `<div class="st-status">${pill(run.status)}<span class="st-elapsed">${elapsed(run)}</span>${liveChip(run)}</div>`;

  function sessionTabA(run) {
    const meta = `${esc(desk())} · ${esc(run.model)} · ${startedLine(run).toLowerCase()}`;
    return `<p class="st-report">${report(run)}<span>${meta}</span></p>
      ${timeline(run)}${outcomeCard(run)}${run.link === 'live' ? '<button class="st-jump" data-act="jump" hidden>Jump to latest</button>' : ''}`;
  }

  /* ---------- B: a Session page with Summary, Transcript and Tools ---------- */
  function planHtml(run) {
    if (!run.plan) return '<p class="m-fine st-left">T3 Code hasn’t shared a plan for this run yet.</p>';
    const now = run.status === 'pr' ? -1 : run.planDone;
    return `<ol class="m-steps st-plan" aria-label="Plan">${run.plan
      .map((step, i) => {
        const done = i < run.planDone;
        const isNow = i === now && run.status !== 'starting';
        const mark = done ? ic('check') : isNow ? (run.status === 'needs' ? ic('person') : run.status === 'failed' ? ic('alert') : '<span class="handoff-spinner" aria-hidden="true"></span>') : String(i + 1);
        const tone = isNow ? (run.status === 'needs' ? ' is-needs' : run.status === 'failed' ? ' is-failed' : '') : '';
        const note = isNow ? `<div class="m-row-sub">${run.status === 'needs' ? 'Waiting for your approval on the desktop' : run.status === 'failed' ? 'Stopped here' : 'In progress'}</div>` : '';
        return `<li class="${done ? 'is-done' : isNow ? `is-now${tone}` : ''}"${isNow ? ' aria-current="step"' : ''}><span class="m-step-mark">${mark}</span><div>${esc(step)}${note}</div></li>`;
      })
      .join('')}</ol>`;
  }

  function changesHtml(run) {
    const files = run.events.filter((e) => e.kind === 'tool' && (e.tool === 'create' || e.tool === 'edit'));
    if (!files.length) return '<p class="m-fine st-left">No files changed yet.</p>';
    return `<div class="m-group">${files.map((e) => `<div class="m-row st-file">${ic(TOOL_ICON[e.tool])}<span class="m-row-main"><code>${esc(e.target)}</code></span><span class="st-diff">${esc(e.result)}</span></div>`).join('')}</div>`;
  }

  function sessionPageB(run) {
    const t = ticketBy(run.n);
    const tools = run.events.filter((e) => e.kind === 'tool');
    const away = run.awayFrom === null ? [] : run.events.slice(run.awayFrom);
    const newTools = away.filter((e) => e.kind === 'tool').length;
    const newTalk = away.length - newTools;
    const badge = (n) => (n ? `<span class="st-new" aria-hidden="true">+${n}</span>` : '');
    const tabs = [
      ['summary', 'Summary'],
      ['transcript', `Transcript${badge(newTalk)}`, `Transcript${newTalk ? `, ${newTalk} new` : ''}`],
      ['tools', `Tools ${tools.length}${badge(newTools)}`, `Tools, ${tools.length}${newTools ? `, ${newTools} new` : ''}`],
    ];
    let body;
    if (ui.btab === 'summary') {
      const latest = run.streaming !== null ? streamingHtml(run) : [...run.events].reverse().map((e) => (e.kind === 'msg' || e.kind === 'approval' || e.kind === 'error' ? eventHtml(e, run) : '')).find(Boolean) ?? '<p class="m-fine st-left">Nothing yet.</p>';
      body = `${outcomeCard(run)}<div class="m-section-title">Latest</div><div class="m-card st-latest">${latest}</div>
        <div class="m-section-title">Plan${run.plan ? ` · ${Math.min(run.planDone, run.plan.length)} of ${run.plan.length}` : ''}</div><div class="m-card">${planHtml(run)}</div>
        <div class="m-section-title">Changed files</div>${changesHtml(run)}
        <div class="m-section-title">Details</div><div class="m-group">
          <div class="m-row">${ic('desktop')}<span class="m-row-main"><span class="m-row-title">${esc(desk())}</span><span class="m-row-sub">${startedLine(run)}</span></span></div>
          <div class="m-row">${ic('pr')}<span class="m-row-main"><span class="m-row-title">Branch</span><span class="m-row-sub st-wrap"><code>${esc(run.branch)}</code></span></span></div>
          <div class="m-row">${ic('terminal')}<span class="m-row-main"><span class="m-row-title">Model</span><span class="m-row-sub">${esc(run.model)}</span></span></div></div>`;
    } else if (ui.btab === 'transcript') body = timeline(run, (e) => e.kind !== 'tool');
    else body = timeline(run, (e) => e.kind === 'tool');
    return `${status()}${bar('Session')}<div class="m-scroll" data-scroll>
      <section class="st-card st-head" style="--accent: var(${{ working: '--state-claimed', starting: '--state-claimed', needs: '--state-blocked', pr: '--state-frontier', failed: '--state-failed' }[run.status]})">
        <div class="st-card-head">${pill(run.status)}<span class="st-elapsed">${elapsed(run)}</span>${liveChip(run)}</div>
        <p class="st-card-title">#${run.n} · ${esc(t.title)}</p><p class="st-card-sub">${report(run)}</p></section>
      ${cachedLine(run)}${run.link === 'caughtup' ? `<p class="st-caughtline" role="status">${ic('check')}Caught up with ${esc(desk())}: ${plural(awayCount(run), 'update')} while you were away.</p>` : ''}
      <div class="st-tabs">${tablist('Session', tabs, ui.btab, 'b-tab')}</div>
      <div ${panelAttrs('b-tab', ui.btab)} class="st-panel">${body}</div>${run.link === 'live' && ui.btab !== 'summary' ? '<button class="st-jump" data-act="jump" hidden>Jump to latest</button>' : ''}</div>${watchBar()}`;
  }

  /* ---------- C: Live, newest first ---------- */
  function nowLine(run) {
    if (run.status === 'needs') return 'Waiting for your approval';
    if (run.status === 'pr') return `Opened PR #${run.pr.number}`;
    if (run.status === 'failed') return 'Stopped';
    if (run.status === 'starting') return 'Starting the thread';
    if (run.link === 'reconnecting') return 'Last seen writing a reply';
    if (run.streaming !== null) return 'Writing a reply';
    const last = [...run.events].reverse().find((e) => e.kind === 'tool');
    return last ? `${last.verb} ${last.target}` : 'Working';
  }

  // Newest first; runs of reads fold into one row.
  function feed(run) {
    const out = [];
    const list = run.events.map((e, i) => ({ e, i })).reverse();
    for (let k = 0; k < list.length; k++) {
      const { e, i } = list[k];
      const isNew = run.awayFrom !== null && i >= run.awayFrom;
      if (e.kind === 'tool' && e.tool === 'read' && list[k + 1]?.e.tool === 'read') {
        const group = [e];
        while (list[k + 1]?.e.tool === 'read') group.push(list[++k].e);
        out.push({ isNew, html: `<details class="st-ev st-tool" data-k="reads ${group[group.length - 1].t} ${esc(group[group.length - 1].target)}"><summary><span class="st-tool-ic">${ic('file')}</span><span class="st-ev-main"><span class="st-tool-line"><b>Read</b> ${plural(group.length, 'file')}</span><span class="st-ev-sub">${group.map((g) => esc(g.target.split('/').pop())).join(', ')}</span></span><span class="st-time">${group[group.length - 1].t}</span>${ic('down')}</summary><ul class="st-tool-detail">${group.map((g) => `<li><code>${esc(g.target)}</code></li>`).join('')}</ul></details>` });
      } else out.push({ isNew, html: eventHtml(e, run) });
    }
    const n = awayCount(run);
    const rows = out
      .map((o, k) => {
        const lead = o.isNew && k === 0 ? `<li class="st-div is-new">New while you were away · ${n}</li>` : !o.isNew && out[k - 1]?.isNew ? '<li class="st-div">Before that</li>' : '';
        return `${lead}<li${o.isNew ? ' class="is-new"' : ''}>${o.html}</li>`;
      })
      .join('');
    const tail = streamingHtml(run);
    return `<ol class="st-tl st-feed" aria-label="Session history, newest first">${tail ? `<li>${tail}</li>` : ''}${rows}<li class="st-div">${startedLine(run)}</li></ol>`;
  }

  function livePageC(run) {
    const t = ticketBy(run.n);
    const flag =
      run.status === 'needs'
        ? `<div class="m-banner" style="--accent: var(--state-blocked)">${ic('person')}<span><b>Answer it in T3 Code on ${esc(desk())}.</b> Wayfinder on the phone only watches.</span></div>`
        : outcomeCard(run);
    return `${status()}${bar('Live')}<div class="m-scroll" data-scroll>
      <section class="st-now"><div class="st-card-head">${pill(run.status)}${liveChip(run)}</div>
        <p class="st-now-ticket">#${run.n} · ${esc(t.title)}</p><p class="st-kicker">Now</p><p class="st-now-line">${esc(nowLine(run))}</p>
        <p class="st-now-meta">${elapsed(run)} · ${esc(desk())} · ${startedLine(run).toLowerCase()}</p>
        ${run.status === 'needs' ? '' : `<p class="st-now-meta">${ic('info')}Watch only: reply and approve in T3 Code on ${esc(desk())}.</p>`}</section>
      ${cachedLine(run)}${flag}
      <div class="m-section-title">Newest first</div>${feed(run)}</div>`;
  }

  /* ---------- Settings (#316 G-a) and Settings → Desktop ---------- */
  function settings() {
    const sub = !st.pairing
      ? 'Not paired'
      : st.queue.length
        ? `${desk()} · ${st.queue.length} waiting to send`
        : `${desk()} · ${st.net === 'offline' ? 'Can’t reach' : 'Online'}`;
    return `${status()}${bar('Settings')}<div class="m-scroll">
      <div class="ac-profile is-page">${face(72)}<h2 class="ac-name-lg">${esc(P.user.name)}</h2><span class="ac-login">@${esc(P.user.login)}</span></div>
      <div class="m-section-title">Account</div><div class="m-group">
        <div class="m-row">${ic('check')}<span class="m-row-main"><span class="m-row-title">Signed in</span><span class="m-row-sub">With a device code · since ${esc(P.user.since)}</span></span></div>
        <button class="m-row" data-toast="Would open github.com/${esc(P.user.login)}">${ic('github')}<span class="m-row-main"><span class="m-row-title">Open profile on GitHub</span></span>${ic('external')}</button></div>
      <div class="m-section-title">Preferences</div><div class="m-group">
        <button class="m-row" data-toast="Notifications are designed in #225, not here.">${ic('bell')}<span class="m-row-main"><span class="m-row-title">Notifications</span><span class="m-row-sub">Designed in #225</span></span>${ic('chevron')}</button>
        <button class="m-row" data-act="desktop">${ic('desktop')}<span class="m-row-main"><span class="m-row-title">Desktop</span><span class="m-row-sub">${esc(sub)}</span></span>${ic('chevron')}</button></div>
      <div class="ac-gap"></div><div class="m-group"><button class="m-row ac-danger" data-toast="Sign out is #316’s, unchanged here.">${ic('signout')}<span class="m-row-main"><span class="m-row-title">Sign out</span><span class="m-row-sub">Forgets your GitHub sign-in on this phone</span></span></button></div></div>`;
  }

  function noticeHtml() {
    if (!st.notice) return '';
    const n = st.notice;
    return `<div class="ac-notice st-notice${n.tone === 'warn' ? ' is-warn' : ''}" role="status" tabindex="-1">${ic(n.tone === 'warn' ? 'alert' : 'check')}<span><b>${esc(n.text)}</b>${n.more ? `<span class="ac-notice-more">${esc(n.more)}</span>` : ''}</span></div>`;
  }

  function desktopPage() {
    if (!st.pairing) {
      return `${status()}${bar('Desktop')}<div class="m-scroll">${noticeHtml()}
        <div class="ac-profile is-page"><span class="st-tile is-muted" aria-hidden="true">${ic('desktop')}</span><h2 class="ac-name-lg">No desktop paired</h2><span class="ac-login st-center">Pair Wayfinder on your desktop to start tickets there and watch them run here.</span></div>
        <div class="m-section-title">How to pair</div><div class="m-card st-howto">${steps()}</div>
        <div class="st-actions"><button class="m-btn" data-act="pair-scan">${ic('qr')}Scan pairing code</button><button class="m-link" data-act="pair-code">Enter code instead</button></div>
        <p class="m-fine st-left">Maps load straight from GitHub, so they work without a desktop.</p></div>`;
    }
    const d = st.pairing;
    const conn =
      st.net === 'checking'
        ? `<span class="st-connrow"><span class="handoff-spinner" aria-hidden="true"></span>Checking…</span>`
        : st.net === 'offline'
          ? `<span class="st-connrow"><span class="st-dot is-offline" aria-hidden="true"></span>Can’t reach · last reached ${st.lastReached}</span><button class="m-link st-trylink" data-act="try">Try now</button>`
          : `<span class="st-connrow"><span class="st-dot is-online" aria-hidden="true"></span>Online · through Tailscale</span>`;
    const waiting = st.queue.length
      ? `<div class="m-section-title">Waiting to send</div><div class="m-group">${st.queue
          .map((q) => {
            const t = ticketBy(q.n);
            const busy = q.phase === 'sending';
            return `<div class="m-row st-qrow"><button class="st-qmain" data-act="ticket" data-n="${q.n}"><span class="m-row-main"><span class="m-row-title">#${q.n} ${esc(t.title)}</span><span class="m-row-sub">${busy ? 'Sending…' : `Waiting since ${q.at}`}</span></span></button><button class="st-qbtn" data-act="cancel" data-n="${q.n}"${busy ? ' disabled' : ''} aria-label="Cancel the start of #${q.n}">Cancel</button></div>`;
          })
          .join('')}</div><p class="m-fine st-left">They stay on this phone, even if Wayfinder closes, until they’re sent or cancelled. They send by themselves, oldest first, the next time Wayfinder is open and reaches ${esc(d.name)}, which checks each ticket is still ready.</p>`
      : '';
    const missed = Object.entries(st.outcomes).filter(([, o]) => o.kind === 'rejected');
    const rejected = missed.length
      ? `<div class="m-section-title">Didn’t start</div><div class="m-group">${missed
          .map(([n, o]) => {
            const t = ticketBy(Number(n));
            return `<div class="m-row st-qrow"><button class="st-qmain" data-act="ticket" data-n="${n}"><span class="m-row-main"><span class="m-row-title">#${n} ${esc(t.title)}</span><span class="m-row-sub st-wrap">${esc(o.why)}</span></span></button>${o.watch ? `<button class="st-qbtn" data-act="watch" data-n="${n}" aria-label="Watch #${n}">Watch</button>` : ''}<button class="st-qbtn" data-act="dismiss" data-n="${n}" aria-label="Dismiss #${n}">Dismiss</button></div>`;
          })
          .join('')}</div>`
      : '';
    return `${status()}${bar('Desktop')}<div class="m-scroll">${noticeHtml()}
      <div class="ac-profile is-page"><span class="st-tile" aria-hidden="true">${ic('desktop')}</span><h2 class="ac-name-lg">${esc(d.name)}</h2>${conn}</div>
      ${waiting}${rejected}
      <div class="m-section-title">Connection</div><div class="m-group">
        <div class="m-row">${ic('check')}<span class="m-row-main"><span class="m-row-title">Paired since ${esc(d.since)}</span><span class="m-row-sub">Starts and watching go through ${esc(d.name)}</span></span></div>
        <div class="m-row">${ic('link')}<span class="m-row-main"><span class="m-row-title">Through Tailscale</span><span class="m-row-sub"><code>${esc(d.host)}</code></span></span></div>
        <button class="m-row" data-act="replace">${ic('swap')}<span class="m-row-main"><span class="m-row-title">Pair a different desktop</span><span class="m-row-sub">This phone pairs with one desktop at a time</span></span>${ic('chevron')}</button></div>
      <div class="ac-gap"></div><div class="m-group"><button class="m-row ac-danger" data-act="unpair">${ic('unlink')}<span class="m-row-main"><span class="m-row-title">Unpair</span><span class="m-row-sub">Forgets ${esc(d.name)} on this phone</span></span></button></div>
      <p class="m-fine st-left">Maps load straight from GitHub, so they work while ${esc(d.name)} is off.</p></div>`;
  }

  const steps = () => `<ol class="m-steps st-steps">
      <li><span class="m-step-mark">1</span><div>Turn on Tailscale on this phone and on your desktop, signed in to the same account.</div></li>
      <li><span class="m-step-mark">2</span><div>Open Wayfinder on your desktop and show a pairing code.</div></li>
      <li><span class="m-step-mark">3</span><div>Scan it here. Each code works once and expires after a few minutes.</div></li></ol>`;

  /* ---------- B: pairing as its own short flow ---------- */
  function pairGuideB() {
    return `${status()}${bar('Pair a desktop')}<div class="m-scroll">
      <div class="ac-profile is-page"><span class="st-tile" aria-hidden="true">${ic('desktop')}</span><h2 class="ac-name-lg">Start tickets from here</h2><span class="ac-login st-center">Pair Wayfinder on your desktop. T3 Code runs the tickets there; this phone starts them and watches.</span></div>
      <div class="m-card st-howto">${steps()}</div></div>
      <div class="m-foot st-foot"><button class="m-btn" data-act="pair-scan">${ic('qr')}Scan pairing code</button><button class="m-link" data-act="pair-code">Enter code instead</button></div>`;
  }

  function pairConfirmB() {
    const d = st.found ?? P.desktop;
    const busy = ui.pairing;
    return `${status()}${bar('Pair a desktop')}<div class="m-scroll">
      <div class="ac-profile is-page"><span class="st-tile" aria-hidden="true">${ic('desktop')}</span><h2 class="ac-name-lg">Pair with ${esc(d.name)}?</h2><span class="ac-login"><code>${esc(d.host)}</code></span></div>
      <div class="m-section-title">This phone will</div><div class="m-group">
        <div class="m-row">${ic('play')}<span class="m-row-main"><span class="m-row-title">Start tickets on ${esc(d.name)}</span><span class="m-row-sub">T3 Code runs them there</span></span></div>
        <div class="m-row">${ic('eye')}<span class="m-row-main"><span class="m-row-title">Watch their sessions live</span><span class="m-row-sub">History, tools, status and outcome</span></span></div></div>
      <p class="m-fine st-left">Replies and approvals stay in T3 Code on ${esc(d.name)}. You can unpair in Settings → Desktop.</p></div>
      <div class="m-foot st-foot"><button class="m-btn" data-act="pair-confirm"${busy ? ' disabled aria-busy="true"' : ''}>${busy ? '<span class="m-spinner" aria-hidden="true"></span>Pairing…' : `${ic('link')}Pair with ${esc(d.name)}`}</button><button class="m-btn is-quiet" data-act="back"${busy ? ' disabled' : ''}>Cancel</button></div>`;
  }

  function pairedB() {
    return `${status()}<div class="m-hero" role="status"><div class="m-logo st-ok">${ic('check')}</div><h2>Paired with ${esc(desk())}</h2><p>Start a next-up ticket from its page. Settings → Desktop shows this pairing.</p></div>
      <div class="m-foot"><button class="m-btn" data-act="pair-done">Done</button></div>`;
  }

  /* ---------- pairing pages every option shares ---------- */
  function codePage() {
    return `${status()}${bar('Enter code')}<div class="m-scroll">
      <p class="ac-copy st-lead">Type the address and pairing code that Wayfinder shows on your desktop.</p>
      <label class="st-label" for="pc-host">Desktop address</label><div class="m-search st-field"><input id="pc-host" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="ramon-pc.tail5c2e.ts.net"></div>
      <label class="st-label" for="pc-code">Pairing code</label><div class="m-search st-field"><input id="pc-code" class="st-mono" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX" aria-describedby="pc-hint"></div>
      <p class="m-fine st-left" id="pc-hint">Each code works once and expires after a few minutes.</p>
      <div class="st-actions"><button class="m-btn" data-act="code-submit">${ic('link')}Pair</button></div></div>`;
  }

  function errorPage(kind) {
    const d = st.found ?? P.desktop;
    const copy = {
      expired: ['refresh', 'That pairing code expired', 'Pairing codes only last a few minutes. Show a new one in Wayfinder on your desktop, then scan it.', 'Scan again', 'Enter code instead'],
      used: ['qr', 'That code was already used', 'Each pairing code works once. Show a new one in Wayfinder on your desktop.', 'Scan again', 'Enter code instead'],
      unreachable: ['desktop', `Can’t reach ${d.name}`, `Check that Tailscale is on, on this phone and on ${d.name}, signed in to the same account, and that ${d.name} is awake.`, 'Try again', 'Scan a different code'],
    }[kind];
    return `${status()}${bar('Pair')}<div class="m-hero" role="alert"><div class="m-logo" style="background:var(--state-blocked);color:#000">${ic(copy[0])}</div><h2>${esc(copy[1])}</h2><p>${esc(copy[2])}</p></div>
      <div class="m-foot"><button class="m-btn" data-act="${kind === 'unreachable' ? 'pair-retry' : 'pair-scan'}">${esc(copy[3])}</button><button class="m-link" data-act="${kind === 'unreachable' ? 'pair-scan' : 'pair-code'}">${esc(copy[4])}</button></div>`;
  }

  /* ---------- overlays ---------- */
  function alertHtml({ title, body, cancel = 'Cancel', ok, okAct, danger }) {
    return `<div class="ac-layer"><div class="m-scrim"></div>
      <section class="ac-alert" role="alertdialog" aria-modal="true" aria-labelledby="ov-title" aria-describedby="ov-desc">
        <h2 id="ov-title">${esc(title)}</h2><p id="ov-desc">${body}</p>
        <div class="ac-alert-actions"><button data-act="ov-close" data-focus>${esc(cancel)}</button><button class="${danger ? 'ac-danger' : ''}" data-act="${okAct}">${esc(ok)}</button></div></section></div>`;
  }

  function overlay() {
    const ov = st.overlay;
    if (!ov) return '';
    const d = desk();
    if (ov.kind === 'start')
      return alertHtml({ title: `Start #${ov.n} on ${d}?`, body: `T3 Code opens a new thread for it there. You can watch it here.`, ok: 'Start', okAct: 'ov-start' });
    if (ov.kind === 'queue')
      return alertHtml({ title: `Can’t reach ${d}`, body: `It may be asleep, or Tailscale may be off. Wayfinder can keep this start and send it when this phone reaches ${esc(d)}.`, ok: 'Send later', okAct: 'ov-queue' });
    // What unpairing costs: the starts this phone holds for the desktop, and its pushes. Offline, the desktop can't be told.
    const lost = st.queue.length ? ` Its ${plural(st.queue.length, 'waiting start')} ${st.queue.length === 1 ? 'is' : 'are'} discarded.` : '';
    const pushes = st.net === 'offline' ? ` ${esc(d)} can’t be reached, so remove this phone there too to stop its pushes.` : ` ${esc(d)} stops sending it pushes.`;
    if (ov.kind === 'unpair')
      return alertHtml({ title: `Unpair ${d}?`, body: `This phone stops starting and watching tickets on ${esc(d)}.${lost}${pushes}`, ok: 'Unpair', okAct: 'ov-unpair', danger: true });
    if (ov.kind === 'replace')
      return alertHtml({ title: `Pair ${(st.found ?? P.other).name} instead?`, body: `This phone pairs with one desktop at a time, so ${esc(d)} is unpaired.${lost}${pushes}`, ok: 'Replace', okAct: 'ov-replace', danger: true });
    if (ov.kind === 'sheet') return sheetB(ov.n);
    if (ov.kind === 'scan') return scanner(ov);
    return '';
  }

  // B: Start opens a sheet that says where the ticket goes, and what happens if the desktop is away.
  function sheetB(n) {
    const t = ticketBy(n);
    const offline = st.net === 'offline';
    const d = desk();
    const where = offline
      ? `<span class="m-row-sub"><span class="st-dot is-offline" aria-hidden="true"></span> Can’t reach · last reached ${st.lastReached}</span>`
      : `<span class="m-row-sub"><span class="st-dot is-online" aria-hidden="true"></span> Online · through Tailscale</span>`;
    const copy = offline
      ? `Wayfinder keeps this start on the phone and sends it when it can reach ${esc(d)}. ${esc(d)} checks the ticket is still ready when it arrives.`
      : `T3 Code opens a new thread and worktree for #${n} on ${esc(d)}. ${esc(d)} checks the ticket is still ready first.`;
    return `<div class="ac-layer"><div class="m-scrim" data-act="ov-close"></div>
      <section class="m-sheet st-sheet" role="dialog" aria-modal="true" aria-labelledby="ov-title">
        <button class="m-grab" data-act="ov-close" aria-label="Close"></button>
        <div class="st-sheet-body"><h2 class="m-sheet-title" id="ov-title">Start #${n}</h2><p class="st-sheet-ticket">${esc(t.title)}</p>
          <div class="m-group"><div class="m-row">${ic('desktop')}<span class="m-row-main"><span class="m-row-title">${esc(d)}</span>${where}</span></div></div>
          <p class="ac-copy">${copy}</p>
          <button class="m-btn" data-act="${offline ? 'ov-queue' : 'ov-start'}" data-focus>${ic(offline ? 'clock' : 'play')}${offline ? `Start when ${esc(d)} is back` : `Start #${n}`}</button>
          <button class="m-btn is-quiet" data-act="ov-close">Cancel</button>
          <p class="m-fine">You can watch it here. Replies and approvals stay in T3 Code on ${esc(d)}.</p></div></section></div>`;
  }

  // A made-up QR code (fixed pattern), so the camera view reads as a pairing code on a screen.
  const QR = (() => {
    const n = 25;
    let seed = 224;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const finder = (x, y) => [[0, 0], [n - 7, 0], [0, n - 7]].some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);
    const on = (x, y) => {
      for (const [fx, fy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
        if (x >= fx && x < fx + 7 && y >= fy && y < fy + 7) {
          const dx = x - fx;
          const dy = y - fy;
          return dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
        }
      }
      return false;
    };
    let rects = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (finder(x, y) ? on(x, y) : rnd() > 0.52) rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" aria-hidden="true"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><g fill="#111">${rects}</g></svg>`;
  })();

  function scanner(ov) {
    const busy = ov.phase === 'pairing' || ov.phase === 'found';
    const caption = ov.phase === 'pairing' ? `Pairing with ${esc((st.found ?? P.desktop).name)}…` : ov.phase === 'found' ? `Found ${esc(st.found.name)}` : 'Point the camera at the pairing code in Wayfinder on your desktop.';
    return `<section class="st-scan" role="dialog" aria-modal="true" aria-labelledby="ov-title">
      <div class="m-status" aria-hidden="true"><span>${st.clock}</span><span>●●● ▮</span></div>
      <header class="st-scan-bar"><button class="st-scan-close" data-act="ov-close" aria-label="Close" data-focus>${ic('close')}</button><h1 id="ov-title">${ov.replace ? 'Scan the new desktop’s code' : 'Scan pairing code'}</h1><span></span></header>
      ${ov.forTicket ? `<p class="st-scan-ctx">Pair a desktop to start #${ov.forTicket}</p>` : ''}
      <div class="st-cam"><button class="st-finder${busy ? ' is-busy' : ''}" data-act="scan-hit" aria-label="Prototype: scan ${esc((ov.replace ? P.other : P.desktop).name)}’s pairing code"${busy ? ' disabled' : ''}>
        <span class="st-screen">${QR}</span><span class="st-corner is-tl"></span><span class="st-corner is-tr"></span><span class="st-corner is-bl"></span><span class="st-corner is-br"></span>
        ${busy ? `<span class="st-finder-done">${ov.phase === 'pairing' ? '<span class="m-spinner" aria-hidden="true"></span>' : ic('check')}</span>` : ''}</button>
        <p class="st-scan-cap" role="status">${caption}</p>
        ${busy ? '' : '<p class="st-proto">Prototype: tap the code to scan it</p>'}</div>
      <div class="st-scan-foot"><button class="st-scan-alt" data-act="pair-code"${busy ? ' disabled' : ''}>Enter code instead</button></div></section>`;
  }

  function snackHtml() {
    if (!st.snack) return '';
    return `<div class="st-snack" role="status"><span>${esc(st.snack.text)}</span><button data-act="snack-undo">Undo</button></div>`;
  }

  /* ---------- render ---------- */
  function screenHtml() {
    const s = here();
    switch (s.screen) {
      case 'maps': return maps();
      case 'map': return mapView();
      case 'ticket': return ticketPage();
      case 'session': return !st.runs[s.n] ? ticketPage() : O === 'B' ? sessionPageB(st.runs[s.n]) : livePageC(st.runs[s.n]);
      case 'settings': return settings();
      case 'desktop': return desktopPage();
      case 'pair': return pairGuideB();
      case 'pairconfirm': return pairConfirmB();
      case 'paired': return pairedB();
      case 'code': return codePage();
      case 'error': return errorPage(s.kind);
      default: return maps();
    }
  }

  // A live update redraws the screen: keep the focused control and the tool calls left open.
  function remember() {
    const el = document.activeElement;
    const focus = el && el !== app && app.contains(el) ? { act: el.dataset.act, n: el.dataset.n, tab: el.dataset.tab, f: el.dataset.f, id: el.id, k: el.tagName === 'SUMMARY' ? el.parentElement.dataset.k : null } : null;
    return { focus, open: new Set([...app.querySelectorAll('details[open]')].map((d) => d.dataset.k)) };
  }

  // The open dialog's title, else the screen's: where focus goes when the focused control went away.
  const titleEl = () => app.querySelector('#ov-title') ?? app.querySelector('h1, .m-hero h2');

  function restore({ focus, open }) {
    for (const d of app.querySelectorAll('details[data-k]')) if (open.has(d.dataset.k)) d.open = true;
    if (!focus) return;
    const same = (x) => x.dataset.act === focus.act && x.dataset.n === focus.n && x.dataset.tab === focus.tab && x.dataset.f === focus.f;
    const el = focus.k
      ? [...app.querySelectorAll('details[data-k] > summary')].find((s) => s.parentElement.dataset.k === focus.k)
      : focus.id
        ? document.getElementById(focus.id)
        : [...app.querySelectorAll('[data-act]')].find(same);
    el?.focus({ preventScroll: true });
    if (!app.contains(document.activeElement)) titleEl()?.focus({ preventScroll: true });
  }

  let lastKey = null;
  function render() {
    const key = JSON.stringify([stack.length, here(), ui.tab, ui.btab, ui.mapTab]);
    const scroller = app.querySelector('[data-scroll], .m-scroll');
    const keep = key === lastKey && scroller ? scroller.scrollTop : null;
    const following = scroller ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 40 : false;
    const kept = key === lastKey ? remember() : null;
    app.innerHTML = `${screenHtml()}${overlay()}${snackHtml()}`;
    document.title = `${O} · ${here().screen}`;
    for (const el of [app.querySelector('h1, .m-hero h2'), app.querySelector('#ov-title')]) el?.setAttribute('tabindex', '-1');
    if (kept) restore(kept);
    const next = app.querySelector('[data-scroll], .m-scroll');
    if (next) {
      // A's Session tab and B's Transcript and Tools read oldest first: open them at the newest.
      const atEnd = (here().screen === 'ticket' && ui.tab === 'session') || (here().screen === 'session' && O === 'B' && ui.btab !== 'summary');
      if (keep !== null) next.scrollTop = atEnd && following ? next.scrollHeight : keep;
      else if (atEnd && ui.scroll !== 'top') next.scrollTop = next.scrollHeight;
      next.addEventListener('scroll', jumpVisibility, { passive: true });
      jumpVisibility();
    }
    // The snackbar and Jump to latest float just above whatever bar sits at the bottom.
    const bottom = app.querySelector('.m-actionbar, .m-foot');
    for (const el of app.querySelectorAll('.st-snack, .st-jump')) el.style.bottom = `${(bottom?.offsetHeight ?? 34) + 10}px`;
    lastKey = key;
    ui.scroll = null;
  }

  function jumpVisibility() {
    const jump = app.querySelector('.st-jump');
    const box = app.querySelector('[data-scroll]');
    if (!jump || !box) return;
    jump.hidden = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
  }

  // Move focus after a step, as #316 did: into an overlay, onto a notice, or to the new screen's title.
  function settle(target) {
    if (st.overlay) return (app.querySelector('.ac-layer [data-focus], .st-scan [data-focus]') ?? app.querySelector('.ac-layer button'))?.focus();
    if (target) return app.querySelector(target)?.focus();
    app.querySelector('h1, .m-hero h2')?.focus();
  }

  function go(entry) {
    stack.push(entry);
    if (entry.screen === 'ticket') ui.tab = 'overview';
    if (entry.screen === 'session') ui.btab = 'summary';
    render();
    settle();
  }

  function back() {
    if (stack.length > 1) stack.pop();
    st.notice = null;
    render();
    settle();
  }

  const timers = new Set();
  const later = (ms, fn) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };

  /* ---------- starting ---------- */
  function askStart(n, still = false) {
    if (!st.pairing) {
      if (O === 'A') return go({ screen: 'desktop' });
      if (O === 'B') return go({ screen: 'pair' });
      st.overlay = { kind: 'scan', forTicket: n };
      return;
    }
    if (O === 'A') st.overlay = { kind: st.net === 'offline' ? 'queue' : 'start', n };
    else if (O === 'B') st.overlay = { kind: 'sheet', n };
    else if (st.net === 'offline') {
      st.queue.push({ n, at: st.clock, phase: 'waiting' });
      st.snack = { text: `#${n} waits for ${desk()}. It sends when this phone can reach it.`, n, undo: 'queue', frozen: still };
      if (!still) later(5000, () => dropSnack(n));
    } else {
      st.holding = { n };
      st.snack = { text: `Starting #${n} on ${desk()}`, n, undo: 'hold', frozen: still };
      if (!still) later(5000, () => {
        if (st.holding?.n !== n) return;
        st.holding = null;
        dropSnack(n);
        begin(n, false);
      });
    }
  }

  function dropSnack(n) {
    if (st.snack?.n !== n) return;
    st.snack = null;
    render();
  }

  // The desktop accepted a start: T3 Code makes the thread, then the first events arrive.
  function begin(n, open) {
    const run = n === 230 ? { ...run230('live'), status: 'starting', events: [R.base[0]], streaming: null, started: st.clock, planDone: 0 } : freshRun(n);
    st.runs[n] = run;
    if (open) {
      if (O === 'A') ui.tab = 'session';
      else if (here().screen !== 'session') stack.push({ screen: 'session', n });
    }
    render();
    settle(open && O === 'A' ? '[role="tab"][aria-selected="true"]' : undefined);
    later(1400, () => {
      run.status = 'working';
      run.events.push(n === 230 ? R.base[1] : { t: st.clock, kind: 'msg', text: 'Reading the ticket and the map’s decisions first.' });
      render();
    });
    later(2800, () => {
      if (n === 230) run.events.push(R.base[2]);
      else run.events.push({ t: st.clock, kind: 'tool', tool: 'read', verb: 'Read', target: 'AGENTS.md' });
      render();
    });
  }

  // Try now (or the app coming back): reach the desktop, send what waits, catch up what was missed.
  function reconnect() {
    st.net = 'checking';
    render();
    later(1200, () => {
      st.net = 'online';
      st.lastReached = st.clock;
      const run = st.runs[230];
      if (run && run.link === 'reconnecting') {
        Object.assign(run, run230('caughtup'));
        st.clock = '10:24';
        Kit.toast(`Caught up with ${desk()}: ${plural(awayCount(run), 'update')} while you were away.`);
      }
      const waiting = [...st.queue];
      waiting.forEach((q) => (q.phase = 'sending'));
      render();
      if (!waiting.length) return;
      later(1100, () => {
        for (const q of waiting) {
          st.queue = st.queue.filter((x) => x !== q);
          if (q.n === 233) {
            st.runs[233] = relayed(233);
            st.outcomes[233] = { kind: 'rejected', at: st.clock, why: 'It was already started on the desktop at 10:38.', watch: true };
          } else {
            st.outcomes[q.n] = { kind: 'sent', at: st.clock };
            st.runs[q.n] = freshRun(q.n);
          }
        }
        const names = (list) => list.map((q) => `#${q.n}`).join(' and ');
        const sent = waiting.filter((q) => q.n !== 233);
        const missed = waiting.filter((q) => q.n === 233);
        st.reportSeen = false;
        Kit.toast([sent.length ? `Sent ${names(sent)} to ${desk()}.` : '', missed.length ? `${names(missed)} didn’t start.` : ''].filter(Boolean).join(' '));
        render();
      });
    });
  }

  /* ---------- pairing ---------- */
  function openScan(extra = {}) {
    if (extra.forTicket) ui.pairFor = extra.forTicket;
    st.overlay = { kind: 'scan', ...extra };
    render();
    settle();
  }

  const PAIRING_PAGES = ['pair', 'pairconfirm', 'paired', 'code', 'error'];
  function landOnDesktop(text) {
    while (stack.length > 1 && PAIRING_PAGES.includes(here().screen)) stack.pop();
    st.notice = { tone: 'ok', text, more: 'Start a next-up ticket from its page.' };
    if (here().screen !== 'desktop') stack.push({ screen: 'desktop' });
    render();
    settle('.st-notice');
  }

  // C: pairing started from Start carries on into the start.
  function startAfterPairing(n) {
    while (stack.length > 1 && PAIRING_PAGES.includes(here().screen)) stack.pop();
    ui.pairFor = null;
    askStart(n);
    st.snack.text = `Paired with ${desk()}. Starting #${n}.`;
    render();
    settle();
  }

  function pairWith(d, then) {
    st.pairing = { ...d, since: 'Oct 23' };
    st.net = 'online';
    st.lastReached = st.clock;
    then();
  }

  function afterScan(ov) {
    if (ov.replace) {
      st.found = P.other;
      st.overlay = { kind: 'scan', ...ov, phase: 'found' };
      render();
      return later(700, () => {
        st.overlay = { kind: 'replace' };
        render();
        settle();
      });
    }
    st.found = P.desktop;
    if (O === 'B') {
      st.overlay = null;
      return go({ screen: 'pairconfirm' });
    }
    st.overlay = { kind: 'scan', ...ov, phase: 'pairing' };
    render();
    later(1200, () => {
      st.overlay = null;
      pairWith(P.desktop, () => (O === 'C' && ov.forTicket ? startAfterPairing(ov.forTicket) : landOnDesktop(`Paired with ${desk()}.`)));
    });
  }

  /* ---------- events ---------- */
  app.addEventListener('click', (event) => {
    const el = event.target.closest('[data-act],[data-toast]');
    if (!el || el.disabled) return;
    if (el.dataset.toast) return Kit.toast(el.dataset.toast);
    const n = Number(el.dataset.n);
    switch (el.dataset.act) {
      case 'back': return back();
      case 'settings': return go({ screen: 'settings' });
      case 'desktop':
        if (O === 'B' && !st.queue.length && Object.keys(st.outcomes).length && !st.reportSeen) {
          const sent = Object.entries(st.outcomes).filter(([, o]) => o.kind === 'sent').map(([n]) => `#${n}`);
          const missed = Object.entries(st.outcomes).filter(([, o]) => o.kind === 'rejected').map(([n]) => `#${n}`);
          st.reportSeen = true;
          st.notice = { tone: 'ok', text: `Back in touch with ${desk()}.`, more: [sent.length ? `Sent ${sent.join(' and ')}.` : '', missed.length ? `${missed.join(' and ')} didn’t start.` : ''].filter(Boolean).join(' ') };
        }
        return go({ screen: 'desktop' });
      case 'map': return go({ screen: 'map' });
      case 'ticket': return go({ screen: 'ticket', n });
      case 'map-tab': ui.mapTab = el.dataset.tab; render(); return settle('[role="tab"][aria-selected="true"]');
      case 'filter': ui.filter = el.dataset.f; return render();
      case 'ticket-tab': ui.tab = el.dataset.tab; render(); return settle('[role="tab"][aria-selected="true"]');
      case 'b-tab': ui.btab = el.dataset.tab; render(); return settle('[role="tab"][aria-selected="true"]');
      case 'start': askStart(n); render(); return settle();
      case 'ov-close': {
        const was = st.overlay;
        st.overlay = null;
        render();
        return settle(was?.kind === 'unpair' ? '[data-act="unpair"]' : was?.kind === 'replace' ? '[data-act="replace"]' : '[data-act="start"], [data-act="pair-scan"]');
      }
      case 'ov-start': {
        const k = st.overlay.n;
        st.overlay = null;
        return begin(k, true);
      }
      case 'ov-queue': {
        const k = st.overlay.n;
        st.overlay = null;
        st.queue.push({ n: k, at: st.clock, phase: 'waiting' });
        render();
        Kit.toast(`Saved on this phone. #${k} sends when it can reach ${desk()}.`);
        return settle('[data-act="cancel"]');
      }
      case 'snack-undo': {
        const s = st.snack;
        st.snack = null;
        if (s.undo === 'queue') st.queue = st.queue.filter((q) => q.n !== s.n);
        if (st.holding?.n === s.n) st.holding = null;
        render();
        Kit.toast(`Undone. #${s.n} won’t be sent.`);
        return settle('[data-act="start"]');
      }
      case 'cancel':
        st.queue = st.queue.filter((q) => q.n !== n);
        render();
        Kit.toast(`Cancelled. #${n} won’t be sent.`);
        return settle('[data-act="start"], .m-scroll h1, h1');
      case 'dismiss':
        delete st.outcomes[n];
        render();
        return settle('[data-act="start"], [data-act="watch"], h1');
      case 'watch':
        if (O === 'A') {
          if (here().screen !== 'ticket' || here().n !== n) stack.push({ screen: 'ticket', n });
          ui.tab = 'session';
          render();
          return settle('[role="tab"][aria-selected="true"]');
        }
        return go({ screen: 'session', n });
      case 'jump': {
        const box = app.querySelector('[data-scroll]');
        box.scrollTop = box.scrollHeight;
        return jumpVisibility();
      }
      case 'try': return reconnect();
      case 'pair-start': return go({ screen: O === 'B' ? 'pair' : 'desktop' });
      case 'pair-scan': return openScan(here().screen === 'error' ? {} : { forTicket: O === 'C' && here().screen === 'ticket' ? here().n : undefined });
      case 'pair-code':
        st.overlay = null;
        return go({ screen: 'code' });
      case 'pair-retry':
        st.found = P.desktop;
        return afterScan({});
      case 'scan-hit': return afterScan(st.overlay);
      case 'code-submit':
        if (O === 'B') {
          st.found = P.desktop;
          stack.pop();
          return go({ screen: 'pairconfirm' });
        }
        return pairWith(P.desktop, () => (O === 'C' && ui.pairFor ? startAfterPairing(ui.pairFor) : landOnDesktop(`Paired with ${desk()}.`)));
      case 'pair-confirm':
        ui.pairing = true;
        render();
        return later(1100, () => {
          ui.pairing = false;
          pairWith(st.found ?? P.desktop, () => {
            stack.pop();
            stack.push({ screen: 'paired' });
            render();
            settle();
          });
        });
      case 'pair-done': {
        // Back to where pairing began: the ticket, or Settings → Desktop.
        while (stack.length > 1 && ['pair', 'pairconfirm', 'paired', 'code', 'error'].includes(here().screen)) stack.pop();
        render();
        return settle('[data-act="start"]');
      }
      case 'unpair':
        st.overlay = { kind: 'unpair' };
        render();
        return settle();
      case 'replace': return openScan({ replace: true });
      case 'ov-unpair': {
        const name = desk();
        const lost = st.queue.length;
        Object.assign(st, { pairing: null, queue: [], outcomes: {}, overlay: null, holding: null });
        st.notice = { tone: 'ok', text: `Unpaired ${name}.`, more: lost ? `Discarded ${plural(lost, 'waiting start')}.` : '' };
        render();
        return settle('.st-notice');
      }
      case 'ov-replace': {
        const old = desk();
        const lost = st.queue.length;
        Object.assign(st, { queue: [], outcomes: {}, overlay: null, runs: {} });
        pairWith(st.found ?? P.other, () => {
          st.notice = { tone: 'ok', text: `Paired with ${desk()}.`, more: `${old} is unpaired.${lost ? ` Discarded ${plural(lost, 'waiting start')}.` : ''}` };
          render();
          settle('.st-notice');
        });
        return;
      }
    }
  });

  // Escape closes what is open, or goes back. Tab stays inside an open overlay. Arrows move between tabs.
  window.addEventListener('keydown', (event) => {
    const layer = app.querySelector('.ac-layer, .st-scan');
    if (event.key === 'Escape') {
      if (st.overlay) {
        event.preventDefault();
        app.querySelector('[data-act="ov-close"]')?.click();
      } else if (st.snack) {
        st.snack = null;
        render();
      } else if (stack.length > 1) back();
      return;
    }
    if (event.key === 'Tab' && layer) {
      const items = [...layer.querySelectorAll('button:not([disabled]):not(.m-grab), input')];
      if (!items.length) return;
      const i = items.indexOf(document.activeElement);
      event.preventDefault();
      if (i < 0) return items[event.shiftKey ? items.length - 1 : 0].focus();
      items[(i + (event.shiftKey ? items.length - 1 : 1)) % items.length].focus();
      return;
    }
    const tab = event.target.closest?.('[role="tab"]');
    if (tab && (event.key === 'ArrowRight' || event.key === 'ArrowLeft' || event.key === 'Home' || event.key === 'End')) {
      const tabs = [...tab.parentElement.querySelectorAll('[role="tab"]')];
      const i = tabs.indexOf(tab);
      const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : tabs[(i + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      event.preventDefault();
      next.click();
    }
  });

  const scenario = params.get('s');
  if (scenario && Object.hasOwn(SCENARIOS, scenario)) SCENARIOS[scenario]();
  render();
})();
