/*
  PROTOTYPE (#366): typing a reply to a ticket's T3 Code thread from the phone, and confirming it
  before it is sent. Built on #224's chosen A: the run lives in a Session tab on its ticket.
  ?o=R1|R2 picks the layout; ?s= opens a state from SCENARIOS. Every tap is fake: nothing reaches
  GitHub, T3 Code or a desktop. Timers start only after a tap, so every frame loads still.
    R1  Reply bar: the Session tab's watch-only line becomes a reply field. Review opens #316's
        alert with the map, ticket, thread and the whole message; the reply's progress shows on
        the message in the history.
    R2  Reply page: the Session tab gets a Reply button. Writing and checking are their own
        pages, in the layout of #224 B's pairing pages; the outcome is a page of its own.
  Out of scope: quick prompts, answering T3 Code's questions or approvals, and pairing (#224/#335).
*/
(() => {
  const params = new URLSearchParams(location.search);
  const O = params.get('o') === 'R2' ? 'R2' : 'R1';
  const P = window.PHONE;
  const X = window.REPLY;
  const R = P.run230;
  const L = window.RUN_LOOKS;
  const S = window.STATES;
  const esc = Kit.esc;
  const ic = Kit.icon;
  const app = document.getElementById('app');
  const desk = P.desktop.name;
  const t230 = P.tickets.find((t) => t.number === 230);

  /* ---------- state ---------- */
  const st = {
    clock: '10:33',
    net: 'online', // online | offline | checking
    paired: true,
    thread: { ...X.thread }, // the thread #230 has on RAMON-PC right now
    reviewed: null, // the thread the draft was checked against
    draft: '',
    reply: null, // { id, text, at, phase: sending | accepted | failed | unknown | changed | missing }
    overlay: null, // R1: { kind: confirm | changed | missing }
    screen: 'session', // session | compose | review | result
  };
  let outcome = 'accepted'; // what the fake desktop answers to the next Send
  const sameThread = () => st.reviewed && st.reviewed.id === st.thread.id;

  const SCENARIOS = {
    session() {},
    compose() {
      st.draft = X.message;
      st.screen = O === 'R2' ? 'compose' : 'session';
    },
    confirm() {
      SCENARIOS.compose();
      review();
    },
    sending() {
      SCENARIOS.confirm();
      send(true);
    },
    accepted() {
      SCENARIOS.confirm();
      send(true);
      settle('accepted');
    },
    failed() {
      SCENARIOS.confirm();
      send(true);
      settle('failed');
    },
    unknown() {
      SCENARIOS.confirm();
      send(true);
      settle('unknown');
    },
    offline() {
      st.net = 'offline';
      SCENARIOS.compose();
    },
    revoked() {
      st.paired = false;
      SCENARIOS.compose();
    },
    changed() {
      SCENARIOS.confirm();
      st.thread = { ...X.newThread };
      send(true);
    },
    missing() {
      SCENARIOS.confirm();
      st.thread = null;
      send(true);
    },
  };

  /* ---------- #224's pieces, unchanged ---------- */
  const status = () => `<div class="m-status" aria-hidden="true"><span>${st.clock}</span><span>●●● ▮</span></div>`;
  const backBtn = (label, act = 'back') => `<button class="m-back" data-act="${act}" aria-label="Back to ${esc(label)}"><span class="m-back-face">${ic('back')}${esc(label)}</span></button>`;
  const bar = (title, back, right = '<span></span>') => `<header class="m-bar ac-bar3">${back}<h1>${esc(title)}</h1>${right}</header>`;
  const chip = (state) => `<span class="m-chip" style="--accent: var(${S[state].variable})">${ic(S[state].icon)}${S[state].label}</span>`;
  const glyph = (type) => `<span class="m-glyph" title="${type}">${ic(TYPE_ICON[type])}<span class="m-sr">${type}</span></span>`;
  const ghLink = (what, label) => `<button class="m-icon-btn" data-toast="Would open ${esc(what)} on GitHub" aria-label="${esc(label)}">${ic('external')}</button>`;
  function pill(kind) {
    const look = L[kind];
    const mark = look.icon ? ic(look.icon) : '<span class="handoff-spinner" aria-hidden="true"></span>';
    return `<span class="handoff-pill st-pill ${look.pill}">${mark}<span>${look.label}</span></span>`;
  }
  const tablist = (tabs, current) =>
    `<div class="m-seg" role="tablist" aria-label="Ticket sections">${tabs
      .map(([k, l]) => `<button role="tab" id="tab-${k}" aria-selected="${current === k}" tabindex="${current === k ? 0 : -1}" data-act="tab" data-tab="${k}">${l}</button>`)
      .join('')}</div>`;

  const TOOL_ICON = { read: 'file', search: 'search', create: 'filePlus', edit: 'pencil', run: 'terminal' };
  function eventHtml(e) {
    if (e.kind === 'prompt')
      return `<details class="st-ev st-tool st-prompt"><summary><span class="st-tool-ic">${ic('message')}</span><span class="st-ev-main"><span class="st-tool-line"><b>Prompt from Wayfinder</b></span><span class="st-ev-sub">What Wayfinder asked T3 Code to do for #230</span></span><span class="st-time">${e.t}</span>${ic('down')}</summary><p class="st-tool-detail">${esc(e.text)}</p></details>`;
    if (e.kind === 'msg') return `<div class="st-ev st-msg"><p class="st-msg-meta">T3 Code · ${e.t}</p><p class="st-msg-text">${esc(e.text)}</p></div>`;
    if (e.kind === 'tool') {
      const head = `<span class="st-tool-ic">${ic(TOOL_ICON[e.tool])}</span><span class="st-ev-main"><span class="st-tool-line"><b>${esc(e.verb)}</b> <code>${esc(e.target)}</code></span>${e.result ? `<span class="st-ev-sub">${esc(e.result)}</span>` : ''}</span><span class="st-time">${e.t}</span>`;
      return e.detail ? `<details class="st-ev st-tool"><summary>${head}${ic('down')}</summary><p class="st-tool-detail">${esc(e.detail)}</p></details>` : `<div class="st-ev st-tool">${head}</div>`;
    }
    return '';
  }
  // #230 as #224's "PR ready" frame left it: finished at 10:31, after the approval was answered on the desktop.
  const history = [...R.base, { t: R.streaming.t, kind: 'msg', text: R.streaming.text }, ...R.away.filter((e) => e.kind !== 'approval'), ...R.after];

  /* ---------- the reply, as the history shows it ---------- */
  const LOOK = {
    sending: { cls: 'is-sending', mark: '<span class="handoff-spinner" aria-hidden="true"></span>', word: () => `Sending to ${desk}…` },
    accepted: { cls: 'is-accepted', mark: ic('check'), word: (r) => `T3 Code accepted it at ${r.at}. No answer yet.` },
    failed: { cls: 'is-failed', mark: ic('alert'), word: () => 'Not sent.' },
    unknown: { cls: 'is-unknown', mark: ic('clock'), word: () => 'Not confirmed.' },
    changed: { cls: 'is-failed', mark: ic('ban'), word: () => 'Not sent: the thread changed.' },
    missing: { cls: 'is-failed', mark: ic('ban'), word: () => 'Not sent: the thread is gone.' },
  };

  function replyBubble(r) {
    const look = LOOK[r.phase];
    const more =
      r.phase === 'failed'
        ? `<p class="rp-why">${esc(X.failedWhy)}</p><div class="rp-acts"><button class="m-btn is-quiet rp-small" data-act="edit">${ic('pencil')}Edit</button><button class="m-btn rp-small" data-act="retry">${ic('refresh')}Send again</button></div>`
        : r.phase === 'unknown'
          ? `<p class="rp-why">${esc(desk)} stopped answering before it said whether T3 Code got this. It may be in the thread.</p><div class="rp-acts"><button class="m-btn rp-small" data-act="retry">${ic('refresh')}Check and send</button></div><p class="rp-id">Reply ${esc(r.id)}. Sending again uses the same ID, so T3 Code adds it at most once.</p>`
          : '';
    return `<div class="st-ev rp-mine ${look.cls}"><p class="st-msg-meta">You · from this phone · ${r.at}</p><p class="st-msg-text">${esc(r.text)}</p>
      <p class="rp-state" role="status">${look.mark}<span>${look.word(r)}</span></p>${more}</div>`;
  }

  /* ---------- the ticket's Session tab (#224 A) ---------- */
  function sessionTab() {
    const tabs = [['overview', 'Overview'], ['links', `Links ${t230.needs.length + t230.unblocks.length}`], ['activity', 'Activity 1'], ['session', 'Session']];
    const cached = st.net === 'offline'
      ? `<div class="m-cached st-cached" role="status">${ic('refresh')}<span>Can’t reach ${esc(desk)}. Showing what it sent by 10:31.</span><button class="st-try" data-act="try">Try now</button></div>`
      : !st.paired
        ? `<div class="m-cached st-cached" role="status">${ic('ban')}<span>${esc(desk)} removed this phone. Showing what it sent by 10:31.</span></div>`
        : '';
    const stick = `<div class="st-stick">${tablist(tabs, 'session')}<div class="st-status">${pill('pr')}<span class="st-elapsed">29 min</span><span class="st-live is-ended">Finished 10:31</span></div>${cached}</div>`;
    const report = `<p class="st-report">${L.pr.report}<span>${esc(desk)} · ${esc(R.model)} · started 10:02 from this phone</span></p>`;
    const items = history.map((e) => `<li>${eventHtml(e)}</li>`).join('');
    const mine = st.reply && (O === 'R1' || st.reply.phase === 'accepted') ? `<li>${replyBubble(st.reply)}</li>` : '';
    const card = `<section class="st-card" style="--accent: var(--state-frontier)" aria-label="Outcome"><div class="st-card-head">${pill('pr')}<span class="st-time">10:31</span></div>
      <p class="st-card-title">#${R.pr.number} · ${esc(R.pr.title)}</p><p class="st-card-sub">${esc(R.pr.checks)} · ${esc(R.branch)}</p></section>`;
    return `${status()}${bar('#230', backBtn('Map', 'map'), ghLink('#230', 'Open on GitHub'))}<div class="m-scroll" data-scroll>
      <div class="m-dhead">${glyph(t230.type)}<span class="m-num">#230 · ${t230.type}</span>${chip('claimed')}</div><h2 class="m-dtitle">${esc(t230.title)}</h2>
      ${stick}<div role="tabpanel" aria-labelledby="tab-session" style="margin-top:4px">${report}
      <ol class="st-tl" aria-label="Session history"><li class="st-div">Started 10:02 from this phone</li>${items}<li>${card}</li>${mine}</ol></div></div>${O === 'R1' ? replyBar() : replyDock()}`;
  }

  /* ---------- R1: the reply bar ---------- */
  function blockLine() {
    if (!st.paired) return `<p class="st-conn rp-block">${ic('ban')}<span><b>${esc(desk)} removed this phone.</b> Your draft stays here. Pair again in Settings → Desktop to send it.</span></p>`;
    if (!st.thread) return `<p class="st-conn rp-block">${ic('ban')}<span><b>#230 has no T3 thread on ${esc(desk)}.</b> Your reply is kept here.</span></p>`;
    if (st.net === 'offline') return `<p class="st-conn"><span class="st-dot is-offline" aria-hidden="true"></span><span><b>Can’t reach ${esc(desk)}</b> · last reached 10:31. Your draft stays here.</span></p>`;
    if (st.net === 'checking') return `<p class="st-conn"><span class="handoff-spinner" aria-hidden="true"></span><span>Checking ${esc(desk)}…</span></p>`;
    return '';
  }
  const blocked = () => !st.paired || !st.thread || st.net !== 'online';

  function replyBar() {
    // Once sent, the reply lives in the history until it is accepted, edited or dropped.
    const busy = !!st.reply && st.reply.phase !== 'accepted';
    const line = blockLine() || `<p class="st-conn"><span class="st-dot is-online" aria-hidden="true"></span><span>Reply to T3 Code on <b>${esc(desk)}</b>. You check it before it sends.</span></p>`;
    const off = busy || blocked() || !st.draft.trim();
    const extra = !st.paired
      ? `<button class="m-btn is-quiet" data-toast="Would open Settings → Desktop">${ic('desktop')}Settings → Desktop</button>`
      : !st.thread
        ? `<button class="m-btn is-quiet" data-act="copy">${ic('file')}Copy reply</button>`
        : '';
    return `<div class="m-actionbar st-dock rp-bar">${line}
      <div class="rp-entry"><label class="m-sr" for="rp-text">Reply to T3 Code</label><textarea id="rp-text" class="rp-field" rows="1" placeholder="${busy ? 'Your reply is above' : 'Reply to T3 Code…'}" data-f="draft"${busy ? ' disabled' : ''}>${busy ? '' : esc(st.draft)}</textarea>
      <button class="rp-review" data-act="review"${off ? ' disabled' : ''}>Review</button></div>${extra}</div>`;
  }

  // The confirmation every Send needs: where it goes, then the whole message.
  function targetRows(thread, changedFrom) {
    return `<dl class="rp-to">
      <div><dt>Map</dt><dd>#${P.map.number} · ${esc(P.map.title)}</dd></div>
      <div><dt>Ticket</dt><dd>#230 · ${esc(t230.title)}</dd></div>
      <div${changedFrom ? ' class="is-changed"' : ''}><dt>T3 thread</dt><dd>${esc(thread.title)}<span class="rp-sub">${changedFrom ? `New at ${thread.since}, replacing ${esc(changedFrom.short)} · ` : ''}${esc(thread.short)} · ${esc(thread.project)} on ${esc(desk)}</span></dd></div>
    </dl>`;
  }

  function alertR1() {
    const ov = st.overlay;
    if (!ov) return '';
    if (ov.kind === 'confirm') {
      const changedFrom = ov.changedFrom ?? null;
      return `<div class="ac-layer"><div class="m-scrim"></div>
        <section class="ac-alert rp-alert" role="alertdialog" aria-modal="true" aria-labelledby="ov-title" aria-describedby="ov-desc">
          <h2 id="ov-title">${changedFrom ? 'Send to the new thread?' : 'Send this reply?'}</h2>
          <div id="ov-desc" class="rp-alert-body">${targetRows(st.reviewed, changedFrom)}<p class="rp-label">Message</p><blockquote class="rp-quote">${esc(st.draft)}</blockquote>
          <p class="rp-alert-fine">T3 Code gets it as your next message in this thread.</p></div>
          <div class="ac-alert-actions"><button data-act="ov-close" data-focus>Edit</button><button data-act="send">Send</button></div></section></div>`;
    }
    if (ov.kind === 'changed')
      return `<div class="ac-layer"><div class="m-scrim"></div>
        <section class="ac-alert rp-alert" role="alertdialog" aria-modal="true" aria-labelledby="ov-title" aria-describedby="ov-desc">
          <h2 id="ov-title">#230’s thread changed</h2>
          <p id="ov-desc">You checked this reply for ${esc(X.thread.short)}. Since then ${esc(desk)} started ${esc(X.newThread.short)} for #230, at ${X.newThread.since}. Nothing was sent; check it again for the new thread.</p>
          <div class="ac-alert-actions"><button data-act="ov-close" data-focus>Keep draft</button><button data-act="rereview">Review again</button></div></section></div>`;
    if (ov.kind === 'missing')
      return `<div class="ac-layer"><div class="m-scrim"></div>
        <section class="ac-alert rp-alert" role="alertdialog" aria-modal="true" aria-labelledby="ov-title" aria-describedby="ov-desc">
          <h2 id="ov-title">#230’s thread is gone</h2>
          <p id="ov-desc">${esc(X.thread.short)} was deleted in T3 Code on ${esc(desk)}, and #230 has no other thread. Nothing was sent; your reply is kept on this phone.</p>
          <div class="ac-alert-actions"><button data-act="ov-close" data-focus>OK</button><button data-act="copy">Copy reply</button></div></section></div>`;
    return '';
  }

  /* ---------- R2: Reply button, then pages ---------- */
  function replyDock() {
    const line = blockLine() || `<p class="st-conn"><span class="st-dot is-online" aria-hidden="true"></span><span><b>${esc(desk)}</b> · Online</span></p>`;
    const draftNote = st.draft && !st.reply ? '<p class="rp-draftnote">Draft kept</p>' : '';
    return `<div class="m-actionbar st-dock">${line}<button class="m-btn" data-act="compose"${st.paired && st.thread ? '' : ' disabled'}>${ic('message')}${st.draft && !st.reply ? 'Continue reply' : 'Reply to T3 Code'}</button>${draftNote}</div>`;
  }

  const head = (icon, title, sub, tone = '') => `<div class="ac-profile is-page rp-head"><span class="st-tile${tone}" aria-hidden="true">${ic(icon)}</span><h2 class="ac-name-lg">${title}</h2>${sub ? `<span class="ac-login st-center">${sub}</span>` : ''}</div>`;
  const notice = (tone, text, more) => `<div class="ac-notice st-notice rp-notice${tone === 'warn' ? ' is-warn' : ''}" role="status">${ic(tone === 'warn' ? 'alert' : tone === 'ban' ? 'ban' : 'check')}<span><b>${text}</b>${more ? `<span class="ac-notice-more">${more}</span>` : ''}</span></div>`;

  function composePage() {
    const top = !st.paired
      ? notice('ban', `${esc(desk)} removed this phone.`, 'Your draft stays here. Pair again in Settings → Desktop to send it.')
      : st.net === 'offline'
        ? notice('warn', `Can’t reach ${esc(desk)}.`, 'Last reached 10:31. Your draft stays here; check it once the phone can reach it.')
        : '';
    const off = blocked() || !st.draft.trim();
    const cta = !st.paired
      ? `<button class="m-btn is-quiet" data-toast="Would open Settings → Desktop">${ic('desktop')}Settings → Desktop</button>`
      : st.net === 'offline'
        ? `<button class="m-btn" disabled>${ic('clock')}Review when ${esc(desk)} is back</button><button class="m-link" data-act="try">Try now</button>`
        : `<button class="m-btn" data-act="review"${off ? ' disabled' : ''}>Review reply</button>`;
    return `${status()}${bar('Reply', backBtn('#230'))}<div class="m-scroll">${top}
      <div class="m-section-title">To</div><div class="m-group">
        <div class="m-row">${ic('terminal')}<span class="m-row-main"><span class="m-row-title">${esc(X.thread.title)}</span><span class="m-row-sub">T3 thread · ${esc(X.thread.project)} on ${esc(desk)}</span></span></div></div>
      <label class="m-section-title" for="rp-text">Message</label>
      <textarea id="rp-text" class="rp-field is-page" rows="9" placeholder="What should T3 Code do next?" data-f="draft">${esc(st.draft)}</textarea>
      <p class="m-fine st-left rp-hint">You check where it goes and the whole message before it sends.</p></div>
      <div class="m-foot st-foot">${cta}</div>`;
  }

  function reviewPage() {
    const r = st.reply;
    const busy = r?.phase === 'sending';
    const changed = r?.phase === 'changed';
    const missing = r?.phase === 'missing';
    const top = changed
      ? notice('warn', 'Not sent: #230’s thread changed.', `${esc(desk)} started ${esc(X.newThread.short)} at ${X.newThread.since}. Check the new thread below, then send.`)
      : missing
        ? notice('ban', 'Not sent: #230’s thread is gone.', `It was deleted in T3 Code on ${esc(desk)}. Your reply is kept on this phone.`)
        : '';
    const thread = changed ? st.thread : st.reviewed ?? X.thread;
    const rows = `<div class="m-group rp-group">
      <div class="m-row">${ic('compass')}<span class="m-row-main"><span class="m-row-sub">Map</span><span class="m-row-title">#${P.map.number} · ${esc(P.map.title)}</span></span></div>
      <div class="m-row">${ic('list')}<span class="m-row-main"><span class="m-row-sub">Ticket</span><span class="m-row-title">#230 · ${esc(t230.title)}</span></span></div>
      <div class="m-row${changed ? ' is-changed' : missing ? ' is-gone' : ''}">${ic('terminal')}<span class="m-row-main"><span class="m-row-sub">${changed ? `T3 thread · new at ${thread.since}` : missing ? 'T3 thread · deleted' : 'T3 thread'}</span><span class="m-row-title">${esc(thread.title)}</span><span class="m-row-sub">${esc(thread.short)} · ${esc(thread.project)} on ${esc(desk)}</span></span></div></div>`;
    const cta = missing
      ? `<button class="m-btn" data-act="copy">${ic('file')}Copy reply</button><button class="m-btn is-quiet" data-act="back">Back to #230</button>`
      : `<button class="m-btn" data-act="${changed ? 'send-new' : 'send'}"${busy ? ' disabled aria-busy="true"' : ''}>${busy ? '<span class="m-spinner" aria-hidden="true"></span>Sending…' : `${ic('send')}${changed ? 'Send to the new thread' : 'Send reply'}`}</button>
         <button class="m-btn is-quiet" data-act="edit"${busy ? ' disabled' : ''}>Edit</button>`;
    return `${status()}${bar('Check reply', backBtn('Reply', 'edit'))}<div class="m-scroll">${top}
      ${top ? '' : head('send', `Send to T3 Code on ${esc(desk)}?`, '')}
      <div class="m-section-title">Goes to</div>${rows}
      <div class="m-section-title">Message</div><div class="m-card rp-msgcard"><p>${esc(st.draft)}</p></div>
      <p class="m-fine st-left rp-hint">T3 Code gets it as your next message in this thread.</p></div>
      <div class="m-foot st-foot">${cta}</div>`;
  }

  function resultPage() {
    const r = st.reply;
    if (r.phase === 'accepted')
      return `${status()}<div class="m-hero" role="status"><div class="m-logo st-ok">${ic('check')}</div><h2>T3 Code has your reply</h2><p>It accepted it into ${esc(X.thread.short)} at ${r.at}. It hasn’t answered yet; its answer shows in #230’s Session tab.</p></div>
        <div class="m-foot"><button class="m-btn" data-act="to-session">Back to #230</button></div>`;
    if (r.phase === 'failed')
      return `${status()}<div class="m-hero" role="status"><div class="m-logo rp-bad">${ic('alert')}</div><h2>Not sent</h2><p>${esc(X.failedWhy)} The thread didn’t get it.</p></div>
        <div class="m-foot"><button class="m-btn" data-act="retry">${ic('refresh')}Send again</button><button class="m-btn is-quiet" data-act="edit">Edit reply</button></div>`;
    return `${status()}<div class="m-hero" role="status"><div class="m-logo rp-unsure">${ic('clock')}</div><h2>Not confirmed</h2><p>${esc(desk)} stopped answering before it said whether T3 Code got your reply. It may be in the thread.</p>
        <p class="rp-id">Reply ${esc(r.id)}. Sending again uses the same ID, so T3 Code adds it at most once.</p></div>
      <div class="m-foot"><button class="m-btn" data-act="retry">${ic('refresh')}Check and send</button><button class="m-btn is-quiet" data-act="to-session">Back to #230</button></div>`;
  }

  /* ---------- flow ---------- */
  let timer = null;
  function review() {
    st.reviewed = { ...st.thread };
    st.reply = null;
    if (O === 'R1') st.overlay = { kind: 'confirm' };
    else st.screen = 'review';
  }

  function send(still = false) {
    clearTimeout(timer);
    // Each confirmed reply carries one ID; Send again reuses it.
    if (!st.reply || !['failed', 'unknown'].includes(st.reply.phase)) st.reply = { id: X.replyId, text: st.draft, at: st.clock, phase: 'sending' };
    else st.reply.phase = 'sending';
    st.overlay = null;
    if (O === 'R2') st.screen = 'review';
    if (!st.thread) return settle('missing');
    if (!sameThread()) return settle('changed');
    if (!still) timer = setTimeout(() => { settle(outcome); render(); focusAfter(); }, 1400);
  }

  function settle(phase) {
    st.reply.phase = phase;
    if (phase === 'accepted') {
      st.draft = '';
      if (O === 'R2') st.screen = 'result';
    }
    if (phase === 'failed' || phase === 'unknown') {
      if (O === 'R2') st.screen = 'result';
      // The fake desktop takes the retry.
      outcome = 'accepted';
    }
    if (phase === 'changed' && O === 'R1') st.overlay = { kind: 'changed' };
    if (phase === 'missing' && O === 'R1') st.overlay = { kind: 'missing' };
  }

  /* ---------- render ---------- */
  function render() {
    const active = document.activeElement;
    const keepField = active?.id === 'rp-text' ? { s: active.selectionStart, e: active.selectionEnd } : null;
    const screen = O === 'R1' || st.screen === 'session' ? sessionTab() : st.screen === 'compose' ? composePage() : st.screen === 'review' ? reviewPage() : resultPage();
    app.innerHTML = `${screen}${O === 'R1' ? alertR1() : ''}`;
    document.title = `${O} · ${st.reply?.phase ?? st.overlay?.kind ?? st.screen}`;
    for (const el of [app.querySelector('h1'), app.querySelector('#ov-title'), app.querySelector('.m-hero h2')]) el?.setAttribute('tabindex', '-1');
    const scroller = app.querySelector('[data-scroll]');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
    grow();
    if (keepField) {
      const f = app.querySelector('#rp-text');
      f?.focus({ preventScroll: true });
      f?.setSelectionRange(keepField.s, keepField.e);
    }
  }

  function grow() {
    const f = app.querySelector('.rp-bar .rp-field');
    if (!f) return;
    f.style.height = 'auto';
    f.style.height = `${Math.min(f.scrollHeight + 2, 132)}px`;
  }

  function focusAfter() {
    const target = app.querySelector('[data-focus]') ?? app.querySelector('.m-hero h2') ?? app.querySelector('.rp-state') ?? app.querySelector('h1');
    target?.focus({ preventScroll: true });
  }

  function act(name) {
    switch (name) {
      case 'tab':
        return Kit.toast('Overview, Links and Activity are #223’s tabs');
      case 'map':
        return Kit.toast('Would open map #217');
      case 'back':
        st.screen = st.screen === 'review' ? 'compose' : 'session';
        if (st.reply && st.reply.phase !== 'accepted') st.reply = null;
        break;
      case 'compose':
        st.screen = 'compose';
        break;
      case 'review':
        if (blocked() || !st.draft.trim()) return;
        review();
        break;
      case 'send':
        send();
        break;
      case 'send-new':
        st.reviewed = { ...st.thread };
        send();
        break;
      case 'retry':
        // Same reply ID, and the same thread check, before anything is sent again.
        if (O === 'R2') st.screen = 'review';
        send();
        break;
      case 'edit':
        st.overlay = null;
        st.reply = null;
        st.screen = O === 'R2' ? 'compose' : st.screen;
        render();
        app.querySelector('#rp-text')?.focus();
        return;
      case 'ov-close':
        st.overlay = null;
        if (st.reply?.phase === 'changed' || st.reply?.phase === 'missing') st.reply = null;
        render();
        app.querySelector('#rp-text')?.focus();
        return;
      case 'rereview':
        st.reply = null;
        st.reviewed = { ...st.thread };
        st.overlay = { kind: 'confirm', changedFrom: X.thread };
        break;
      case 'copy':
        return Kit.toast('Reply copied');
      case 'try':
        st.net = 'checking';
        render();
        setTimeout(() => { st.net = 'online'; render(); }, 1100);
        return;
      case 'to-session':
        st.screen = 'session';
        if (st.reply?.phase !== 'accepted') st.reply = null;
        break;
      default:
        return;
    }
    render();
    focusAfter();
  }

  app.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act], [data-toast]');
    if (!t || t.disabled) return;
    if (t.dataset.toast) return Kit.toast(t.dataset.toast);
    act(t.dataset.act);
  });
  app.addEventListener('input', (e) => {
    if (e.target.dataset.f !== 'draft') return;
    st.draft = e.target.value;
    grow();
    const go = app.querySelector('[data-act="review"]');
    if (go) go.disabled = blocked() || !st.draft.trim();
  });
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (O === 'R1' && st.overlay && st.reply?.phase !== 'sending') {
      e.preventDefault();
      act('ov-close');
    }
  });
  // Keep Tab inside an open alert, as #316's alert does.
  app.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !st.overlay) return;
    const box = app.querySelector('.ac-alert');
    const items = [...box.querySelectorAll('button')];
    const i = items.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
    else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
  });

  const scenario = Object.entries(SCENARIOS).find(([name]) => name === params.get('s'))?.[1] ?? SCENARIOS.session;
  scenario();
  render();
})();
