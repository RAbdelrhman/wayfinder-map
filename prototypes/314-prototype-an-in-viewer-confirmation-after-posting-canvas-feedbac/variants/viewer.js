/*
 * #314: how the shipped D4 viewer confirms that feedback went to GitHub.
 * Markup copies src/ui/canvasViewer.ts and src/ui/canvasFeedback.ts; classes and tokens come
 * from src/ui/styles.css. Only the confirmation pieces (p314-*) are new.
 *
 * ?dir=A|B|C      A: receipt in the panel · B: bar over the canvas · C: toolbar chip and popover
 *       B2|B3     round 2: B with A's Copy message; B2 copies and opens the thread, B3 sends to it
 * ?t3=sending|done|fail (B2, B3) ?t3fail=1 (B3: the first send fails)
 * ?state=review|posting|posted|failed|repost
 * ?size=full|pane ?fail=1 (the first post fails) ?thread=0 (no tracked T3 Code thread)
 */
(() => {
  const q = new URLSearchParams(location.search);
  const DIR = ['A', 'B', 'C', 'B2', 'B3'].includes(q.get('dir')) ? q.get('dir') : 'A';
  const IS_B = DIR[0] === 'B';
  const STATES = ['review', 'posting', 'posted', 'failed', 'repost'];
  const S = {
    state: STATES.includes(q.get('state')) ? q.get('state') : 'review',
    size: q.get('size') === 'pane' ? 'pane' : 'full',
    fail: q.get('fail') === '1',
    thread: q.get('thread') !== '0',
    panelOpen: true,
    tab: 'feedback',
    bar: true, // B: the bar over the canvas is showing
    pop: true, // C: the chip's popover is open
    copied: false,
    t3fail: q.get('t3fail') === '1', // B3: the first send fails
    dialog: false, // B: the post-again check is open
    view: 'rendered',
    t3: ['sending', 'done', 'fail'].includes(q.get('t3')) ? q.get('t3') : null,
    when: 'just now',
  };
  if (S.state === 'repost') {
    S.when = '4 minutes ago';
    if (IS_B) S.dialog = true;
    if (DIR === 'C') S.pop = false;
  }
  if (S.state === 'posted' && IS_B) S.panelOpen = false;
  if (S.size === 'pane') S.tab = IS_B && S.state === 'posted' ? 'canvas' : 'feedback';

  const T = {
    n: 292,
    title: 'Prototype Settings › Keyboard shortcuts for the canvas viewer’s tool keys',
    url: 'https://github.com/RAbdelrhman/wayfinder-map/issues/292#issuecomment-6184146230',
    branch: 'prototype/292-prototype-settings-keyboard-shortcuts-for-the-canvas-viewer-s-to',
    sha: '2d84090',
  };
  const MARKS = [
    { kind: 'plain', scope: 'Whole page', title: 'Note', note: 'Overall I like A better.' },
    { kind: 'pin', scope: 'A1 · Landing', title: 'Pin 1', near: 'Pin shortcut, P. Change', note: 'The box has too much space on the left.', x: 0.31, y: 0.42 },
    { kind: 'el', scope: 'A1 · Landing', title: 'Element', near: 'Color picker', note: 'I like this look; open the change dialog when you click the letter.', x: 0.55, y: 0.6, w: 0.22, h: 0.09 },
  ];

  const ICONS = {
    beaker: '<path d="M9 3h6"/><path d="M10 3v6.5L4.6 18.4A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.4-2.6L14 9.5V3"/><path d="M7.5 15h9"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    left: '<path d="m15 6-6 6 6 6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    full: '<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/>',
    pane: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M13 4v16"/>',
    float: '<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="11.5" y="11.5" width="6.5" height="5.5" rx="1"/>',
    pin: '<path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    cursor: '<path d="M5 3l14 7-6 2-2 6z"/>',
    drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
    note: '<path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.5-5.6A8.5 8.5 0 1 1 21 12z"/><path d="M9 11h6M9 14h4"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
    send: '<path d="M21 3 10 14"/><path d="M21 3 14 21l-4-7-7-4z"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    play: '<path d="M7 4v16l13-8z"/>',
    retry: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M4 20v-5h5"/>',
  };
  const icon = (name) =>
    `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  const esc = Kit.esc;
  const say = (text) => (document.getElementById('live').textContent = text);
  const posted = () => S.state === 'posted' || S.state === 'repost';
  const viewer = document.getElementById('viewer');
  const ticket = `#${T.n}`;
  const where = `GitHub · ${ticket}`;
  const t3 = 'Return to your T3 Code thread to continue.';
  const viewLink = (label = 'View comment', cls = 'ghost cf-sm') =>
    `<a class="${cls}" href="${T.url}" target="_blank" rel="noreferrer" data-to="the comment on GitHub (${esc(T.url)})">${icon('external')}${label}</a>`;
  const openT3 = (cls = 'primary cf-sm') =>
    S.thread
      ? `<button type="button" class="${cls}" data-open-handoff="h-292" data-to="the T3 Code thread for ${ticket}">${icon('play')}Open in T3 Code</button>`
      : `<button type="button" class="${cls.replace('primary', 'ghost')}" data-act="copy">${icon('copy')}${S.copied ? 'Copied' : 'Copy link'}</button>`;

  // ---------- toolbar (canvasViewer.ts, canvasFeedback.ts toolbar()) ----------
  function sizes() {
    const label = { full: 'Full window', pane: 'Side pane', float: 'Floating window' };
    return `<div class="segmented vw-sizes" role="group" aria-label="Canvas size">${['full', 'pane', 'float']
      .map((s) => `<button type="button" class="seg${s === S.size ? ' is-on' : ''}" data-size="${s}" aria-pressed="${s === S.size}" aria-label="${label[s]}" title="${label[s]}">${icon(s)}</button>`)
      .join('')}</div>`;
  }
  function options() {
    const seg = `<div class="segmented vw-options" role="group" aria-label="Show the board, or open one option full size"><button type="button" class="seg" aria-pressed="false" data-to="the board">Board</button><button type="button" class="seg is-on" aria-pressed="true" title="Landing">A1</button><button type="button" class="seg" aria-pressed="false" data-to="option B1">B1</button></div>`;
    return `<div class="vw-menu-anchor"><button type="button" class="ghost" data-to="the page menu" aria-haspopup="menu" aria-expanded="false" aria-label="Canvas page: Directions">Directions${icon('chevron')}</button></div>${seg}${S.size === 'full' ? '<span class="vw-optname">Landing</span>' : ''}`;
  }
  function chip() {
    if (S.state === 'posting' && DIR === 'C') return `<span class="cf-chip p314-chip is-busy">${'<span class="p314-spin" aria-hidden="true"></span>'}Posting to ${where}…</span>`;
    if (S.state === 'failed' && DIR === 'C')
      return `<button type="button" class="cf-chip is-warn p314-chip" data-act="pop" aria-expanded="${S.pop}" aria-controls="p314-pop">${icon('info')}Not posted · ${ticket}</button>`;
    if (!posted()) return '';
    if (DIR === 'C')
      return `<button type="button" class="cf-chip is-ok p314-chip" data-act="pop" aria-expanded="${S.pop}" aria-controls="p314-pop">${icon('check')}Posted to ${where}</button>`;
    return `<span class="cf-chip is-ok">${icon('check')}Posted to ${where}</span>`;
  }
  function toolRow(compact) {
    const tools = [
      ['Pin', 'pin', 'P'],
      ['Select element', 'cursor', 'E'],
      ['Color picker', 'drop', 'C'],
      ['Note', 'note', 'N'],
    ]
      .map(([name, ic, key], i) => `<button type="button" class="seg" aria-label="${name}" aria-keyshortcuts="${key}"${i < 3 ? ' aria-pressed="false"' : ''} title="${name} (${key})" data-to="the ${name} tool">${icon(ic)}${compact ? '' : `<span class="vw-lbl">${name}</span><kbd>${key}</kbd>`}</button>`)
      .join('');
    return `<div class="cf-toolrow" role="toolbar" aria-label="Annotate"><div class="segmented cf-toolgroup" role="group" aria-label="Feedback tools">${tools}</div></div>`;
  }
  function toolbar() {
    const title = `<span class="vw-title" id="vw-title">${icon('beaker')}<span class="vw-title-t">Keyboard shortcuts for the canvas viewer</span></span>`;
    const gh = `<a class="iconbtn" href="#" data-to="the branch on GitHub" aria-label="Open the branch on GitHub">${icon('external')}</a>`;
    const badge = `<span class="badge cf-badge">${MARKS.length}</span>`;
    if (S.size === 'full') {
      const close = `<button type="button" class="ghost vw-close" data-to="the map (closes the canvas)" aria-label="Close the canvas">${icon('close')}<span class="vw-lbl">Close</span><kbd>Esc</kbd></button>`;
      const toggle = `<button type="button" class="ghost cf-toggle${S.panelOpen ? ' is-on' : ''}" data-act="panel" aria-pressed="${S.panelOpen}" aria-controls="vw-feedback" aria-keyshortcuts="F" title="Feedback panel (F)">${icon('panel')}<span class="vw-lbl">Feedback</span>${badge}<kbd>F</kbd></button>`;
      return `<div class="vw-bar is-a">${close}${title}<span class="vw-sep"></span>${options()}<span class="topbar-spacer"></span><span class="p314-anchor">${chip()}${DIR === 'C' ? popover() : ''}</span>${toggle}<span class="vw-sep"></span>${gh}${sizes()}</div>${toolRow(false)}`;
    }
    const close = `<button type="button" class="iconbtn vw-close" data-to="the map (closes the canvas)" aria-label="Close the canvas">${icon('close')}</button>`;
    const tab = (id, label) =>
      `<button type="button" role="tab" class="seg${S.tab === id ? ' is-on' : ''}" aria-selected="${S.tab === id}" data-tab="${id}"${id === 'feedback' ? ' aria-keyshortcuts="F"' : ''}>${label}${id === 'feedback' ? ` ${badge}` : ''}</button>`;
    return `<div class="vw-bar is-c"><div class="vw-c-row">${title}<span class="topbar-spacer"></span>${gh}${sizes()}${close}</div><div class="vw-c-row">${options()}<span class="topbar-spacer"></span><div class="segmented cf-tabs" role="tablist" aria-label="Pane view">${tab('canvas', 'Canvas')}${tab('feedback', 'Feedback')}</div></div></div>${toolRow(true)}${DIR === 'C' && (posted() || S.state === 'failed') ? `<div class="p314-panechip p314-anchor">${chip()}${popover()}</div>` : ''}`;
  }

  // ---------- C: the chip's popover ----------
  function popover() {
    if (DIR !== 'C' || !S.pop || !(posted() || S.state === 'failed')) return '';
    if (S.state === 'failed')
      return `<div class="p314-pop is-warn" id="p314-pop" role="dialog" aria-labelledby="p314-pop-h" tabindex="-1">
        <h2 id="p314-pop-h">${icon('info')}Not posted to ${where}</h2>
        <p>GitHub did not answer in time. Your ${MARKS.length} notes are still here.</p>
        <p class="cf-muted">If the connection dropped while posting, check ${ticket} before you try again so it isn’t posted twice.</p>
        <div class="p314-row">${viewLink(`Check ${ticket}`)}</div>
        <p class="cf-muted">Try again from the panel.</p>
      </div>`;
    return `<div class="p314-pop" id="p314-pop" role="dialog" aria-labelledby="p314-pop-h" tabindex="-1">
      <h2 id="p314-pop-h">${icon('check')}Posted to ${where}</h2>
      <p class="p314-dest-t">${esc(T.title)}</p>
      <div class="p314-row">${viewLink()}<button type="button" class="ghost cf-sm" data-act="copy">${icon('copy')}${S.copied ? 'Copied' : 'Copy link'}</button></div>
      <p class="p314-next-t">${t3}</p>
      <p class="cf-muted">The thread doesn’t get these notes by itself. Tell the agent they’re posted, or paste the link.</p>
    </div>`;
  }

  // ---------- canvas ----------
  function canvas() {
    const done = posted() ? ' is-posted' : '';
    const marks = MARKS.map((m, i) => {
      if (m.kind === 'pin') return `<button type="button" class="cf-pin${done}" style="left:${m.x * 100}%;top:${m.y * 100}%" aria-label="${i + 1}. ${m.title}: ${esc(m.note)}"><span>${i + 1}</span></button>`;
      if (m.kind === 'el')
        return `<button type="button" class="cf-el${done}" style="left:${m.x * 100}%;top:${m.y * 100}%;width:${m.w * 100}%;height:${m.h * 100}%" aria-label="${i + 1}. ${m.title} ${esc(m.near)}: ${esc(m.note)}"><span class="cf-el-n">${i + 1}</span></button>`;
      return '';
    }).join('');
    return `<div class="vw-canvas p314-canvas">${bar()}<div class="p314-art"><img src="../../canvas/assets/protos/42-B.jpg" alt="Option A1 of the open canvas" /><div class="cf-layer">${marks}</div></div></div>`;
  }

  // ---------- B: the bar over the canvas ----------
  function bar() {
    if (!IS_B) return '';
    if (S.state === 'failed')
      return `<div class="p314-bar is-warn" role="alert"><span class="p314-bar-ic">${icon('info')}</span><div class="p314-bar-t"><b>Not posted to ${where}</b><span>GitHub did not answer in time. Your ${MARKS.length} notes are still here. If the connection dropped while posting, check ${ticket} before you try again from the panel.</span></div><div class="p314-row">${viewLink(`Check ${ticket}`)}</div></div>`;
    if (!posted() || !S.bar) return '';
    if (DIR !== 'B') return remixBar();
    return `<div class="p314-bar" role="status" aria-labelledby="p314-bar-h"><span class="cf-ok">${icon('check')}</span><div class="p314-bar-t"><b id="p314-bar-h" tabindex="-1">Posted to ${where}</b><span>${t3} The agent doesn’t see these notes until you tell it.</span></div><div class="p314-row">${viewLink()}${openT3()}</div><button type="button" class="iconbtn" data-act="bar-close" aria-label="Dismiss the posted message">${icon('close')}</button></div>`;
  }

  // ---------- Round 2: B with A's Copy message, opening the thread in the same click ----------
  // B2 copies the message and opens the thread; B3 sends the message into the thread, then opens it.
  const MSG = `Canvas notes are posted on ${ticket}: ${T.url}`;
  function remixBar() {
    const close = `<button type="button" class="iconbtn" data-act="bar-close" aria-label="Dismiss the posted message">${icon('close')}</button>`;
    const shell = (cls, role, ic, head, text, row) =>
      `<div class="p314-bar${cls}" role="${role}" aria-labelledby="p314-bar-h">${ic}<div class="p314-bar-t"><b id="p314-bar-h" tabindex="-1">${head}</b>${text}</div><div class="p314-row">${row}</div>${close}</div>`;
    const ok = `<span class="cf-ok">${icon('check')}</span>`;
    const quote = `<span class="p314-msg">${DIR === 'B3' ? 'Sends' : 'Copies'}: “${esc(MSG)}”</span>`;
    const copyOnly = `<button type="button" class="primary cf-sm" data-act="copy">${icon('copy')}${S.copied ? 'Copied' : 'Copy message for T3 Code'}</button>`;
    if (!S.thread)
      return shell('', 'status', ok, `Posted to ${where}`, `<span>${t3} Wayfinder doesn’t know this ticket’s thread, so paste the message there yourself.</span>${quote}`, `${viewLink()}${copyOnly}`);
    if (DIR === 'B2') {
      if (S.t3 === 'done')
        return shell('', 'status', ok, `Posted to ${where}`, `<span>Message copied and your T3 Code thread for ${ticket} is open. Paste it there to continue.</span>`, `${viewLink()}<button type="button" class="ghost cf-sm" data-act="t3go">${icon('play')}Copy and open again</button>`);
      return shell('', 'status', ok, `Posted to ${where}`, `<span>${t3} The agent doesn’t see these notes until you tell it.</span>${quote}`, `${viewLink()}<button type="button" class="primary cf-sm" data-act="t3go">${icon('play')}Copy message and open T3 Code</button>`);
    }
    // B3
    if (S.t3 === 'sending')
      return shell('', 'status', ok, `Posted to ${where}`, `<span>Sending the link to your T3 Code thread for ${ticket}…</span>${quote}`, `${viewLink()}<button type="button" class="primary cf-sm" disabled aria-busy="true"><span class="p314-spin" aria-hidden="true"></span>Sending…</button>`);
    if (S.t3 === 'done')
      return shell('', 'status', ok, `Posted to ${where} · sent to T3 Code`, `<span>Your T3 Code thread for ${ticket} has the link, and the agent is reading it. Continue there.</span>`, `${viewLink()}<button type="button" class="primary cf-sm" data-open-handoff="h-292" data-to="the T3 Code thread for ${ticket}">${icon('play')}Open T3 Code thread</button>`);
    if (S.t3 === 'fail')
      return shell(' is-warn', 'alert', `<span class="p314-bar-ic">${icon('info')}</span>`, `Posted to ${where} · not sent to T3 Code`, `<span>T3 Code isn’t running, so the message didn’t reach the thread. The notes are safe on GitHub.</span>${quote}`, `${copyOnly}<button type="button" class="ghost cf-sm" data-act="t3go">${icon('retry')}Try sending again</button>`);
    return shell('', 'status', ok, `Posted to ${where}`, `<span>${t3} Send the link so the agent picks up these notes.</span>${quote}`, `${viewLink()}<button type="button" class="primary cf-sm" data-act="t3go">${icon('send')}Send to T3 Code</button>`);
  }

  // ---------- panel (canvasFeedback.ts panelHtml()) ----------
  const closeBtn = `<button type="button" class="iconbtn" data-act="panel" aria-label="Close the feedback panel (F)" title="Close (F)">${icon('close')}</button>`;
  function marker(m, i) {
    if (m.kind === 'pin') return `<span class="cf-mk is-pin" aria-hidden="true">${i + 1}</span>`;
    if (m.kind === 'el') return `<span class="cf-mk is-el" aria-hidden="true">${i + 1}</span>`;
    return `<span class="cf-mk is-plain" aria-hidden="true">${icon('note')}</span>`;
  }
  function card(isPosted) {
    const lines = MARKS.map((m, i) => `<li><b>${m.kind === 'plain' ? 'Whole page' : esc(m.scope)}</b>${m.near ? `, element “${esc(m.near)}”` : ''}: ${esc(m.note)}</li>`).join('');
    const md = `### Canvas notes from Wayfinder\n\`${T.branch}\` @ \`${T.sha}\` · page **Directions**\n\n${MARKS.map((m, i) => `${i + 1}. **${m.kind === 'plain' ? 'Whole page' : m.scope}**${m.near ? `, element "${m.near}"` : ''}: ${m.note}`).join('\n')}\n\n<!-- wayfinder:notes v1 {…} -->`;
    const body = S.view === 'markdown' ? `<pre class="cf-gh-md">${esc(md)}</pre>` : `<div class="cf-gh-body"><h4>Canvas notes from Wayfinder</h4><p><code>${T.branch.slice(0, 34)}…</code> @ <code>${T.sha}</code> · page <b>Directions</b></p><ol>${lines}</ol></div>`;
    return `<article class="cf-gh" aria-label="${isPosted ? 'Posted' : 'Comment'} on ${ticket}">
      <header class="cf-gh-head"><span>${isPosted ? 'Posted' : 'Comment'} on <b>${esc(T.title)}</b></span>${isPosted ? viewLink('Open') : ''}</header>
      <div class="cf-gh-tabs segmented" role="group" aria-label="Preview of the comment on ${ticket}"><button type="button" class="seg${S.view === 'rendered' ? ' is-on' : ''}" aria-pressed="${S.view === 'rendered'}" data-view="rendered">Preview</button><button type="button" class="seg${S.view === 'markdown' ? ' is-on' : ''}" aria-pressed="${S.view === 'markdown'}" data-view="markdown">Markdown</button></div>
      ${body}</article>`;
  }
  function listPanel(foot) {
    const row = (m, i) =>
      `<div class="cf-row">${marker(m, i)}<div class="cf-row-main"><span class="cf-row-kind">${m.title}${m.near ? ` · “${esc(m.near)}”` : ''}</span><textarea class="input" rows="2" aria-label="Note for ${m.title}" data-act="edit">${esc(m.note)}</textarea></div><button type="button" class="iconbtn" aria-label="Delete ${m.title}" data-to="delete this note">${icon('trash')}</button></div>`;
    return `<header class="cf-panel-head"><h2>Feedback</h2><span class="badge">${MARKS.length}</span><span class="topbar-spacer"></span><span class="cf-muted">Notes for ${ticket}</span>${S.size === 'full' ? closeBtn : ''}</header>
      <div class="cf-panel-body"><section class="cf-group"><h3>Whole page</h3>${row(MARKS[0], 0)}<button type="button" class="cf-add" data-to="a new note">${icon('plus')}Note on the whole page</button></section><section class="cf-group"><h3>A1 · Landing <span class="cf-tag">Showing</span></h3>${row(MARKS[1], 1)}${row(MARKS[2], 2)}<button type="button" class="cf-add" data-to="a new note">${icon('plus')}Note on A1</button></section></div>
      <footer class="cf-panel-foot">${foot}</footer>`;
  }
  function reviewPanel() {
    const busy = S.state === 'posting';
    const failed = S.state === 'failed';
    let error = '';
    // B's bar lives on the canvas, which the side pane hides on the Feedback tab: the panel says it there.
    if (failed && (DIR === 'A' || (IS_B && S.size === 'pane')))
      error = `<div class="cf-banner" role="alert">${icon('info')}<div class="p314-banner-t"><b>Not posted to ${where}</b><span>GitHub did not answer in time. Your ${MARKS.length} notes are still here. If the connection dropped while posting, check ${ticket} before you try again so it isn’t posted twice.</span>${viewLink(`Check ${ticket}`)}</div></div>`;
    let post = `<button type="button" class="primary" data-act="post"${busy ? ' disabled aria-busy="true"' : ''}>${busy ? '<span class="p314-spin" aria-hidden="true"></span>Posting to GitHub…' : `${icon(failed ? 'retry' : 'send')}${failed ? 'Try again' : `Post to ${where}`}`}</button>`;
    let lead = `<p class="cf-muted">Exactly what goes to GitHub, as a comment on ${ticket}. It does not go to your T3 Code thread. Your marks stay on the canvas while you read.</p>`;
    if (S.state === 'repost' && DIR === 'A') {
      post = `<button type="button" class="primary" disabled>${icon('check')}Already posted</button>`;
      lead = `<div class="cf-banner is-info p314-already">${icon('check')}<div class="p314-banner-t"><b>These notes are already on ${where}</b><span>Posted ${S.when}. Change a note to post an update; each post adds a new comment.</span>${viewLink()}</div></div>`;
    }
    return `<header class="cf-panel-head"><button type="button" class="iconbtn" data-act="edit" aria-label="Back to edit">${icon('left')}</button><h2>Review before posting</h2><span class="topbar-spacer"></span>${S.size === 'full' ? closeBtn : ''}</header>
      <div class="cf-panel-body">${lead}${card(false)}${error}</div>
      <footer class="cf-panel-foot"><button type="button" class="ghost" data-act="edit">Edit</button><span class="topbar-spacer"></span>${post}</footer>`;
  }
  function receiptA() {
    return `<header class="cf-panel-head"><span class="cf-ok">${icon('check')}</span><h2 id="p314-h" tabindex="-1">Posted to ${where}</h2><span class="topbar-spacer"></span>${S.size === 'full' ? closeBtn : ''}</header>
      <div class="cf-panel-body">
        <section class="p314-dest" aria-label="Where it went"><span class="p314-k">Comment on GitHub</span><a class="p314-dest-t" href="${T.url}" target="_blank" rel="noreferrer" data-to="the comment on GitHub">${ticket} ${esc(T.title)}</a><span class="cf-muted">Posted ${S.when} · ${MARKS.length} notes</span><div class="p314-row">${viewLink('View comment on GitHub')}</div></section>
        <section class="p314-next" aria-labelledby="p314-next-h"><h3 id="p314-next-h">Next: continue in T3 Code</h3><p>${t3} These notes are on GitHub, not in the thread; the agent reads them when you tell it they’re posted.</p><div class="p314-row"><button type="button" class="ghost cf-sm" data-act="copy">${icon('copy')}${S.copied ? 'Copied' : 'Copy message for T3 Code'}</button></div>${S.copied ? `<p class="cf-muted p314-copied">Copied: “Canvas notes are posted on ${ticket}: ${T.url}”</p>` : ''}</section>
        <details class="p314-what"><summary>What was posted</summary>${card(true)}</details>
      </div>
      <footer class="cf-panel-foot"><span class="cf-muted">Change a note to post an update.</span><span class="topbar-spacer"></span><button type="button" class="ghost" data-act="fresh">Start new feedback</button></footer>`;
  }
  function panel() {
    const s = S.state;
    if (s === 'review' || s === 'posting' || s === 'failed') return reviewPanel();
    if (DIR === 'A') return s === 'repost' ? reviewPanel() : receiptA();
    if (IS_B) {
      if (s === 'repost') return reviewPanel();
      return `<header class="cf-panel-head"><span class="cf-ok">${icon('check')}</span><h2 id="p314-h" tabindex="-1">Posted to ${where}</h2><span class="topbar-spacer"></span>${S.size === 'full' ? closeBtn : ''}</header>
        <div class="cf-panel-body"><p class="cf-muted">${t3}</p>${card(true)}</div>
        <footer class="cf-panel-foot"><span class="topbar-spacer"></span><button type="button" class="ghost" data-act="fresh">Start new feedback</button></footer>`;
    }
    // C: back to the list; the chip in the toolbar holds the confirmation.
    const foot =
      s === 'repost'
        ? `<span class="cf-muted">Already on ${ticket}</span>${viewLink()}<span class="topbar-spacer"></span><button type="button" class="primary" disabled title="Change a note to post again">Review</button>`
        : `<span class="cf-muted">${MARKS.length} notes · posted</span><span class="topbar-spacer"></span><button type="button" class="primary" disabled title="Change a note to post again">Review</button>`;
    return listPanel(foot);
  }

  // ---------- B: the post-again check ----------
  function dialog() {
    if (!IS_B || !S.dialog) return '';
    return `<dialog class="p314-dialog" id="p314-dialog" aria-labelledby="p314-dlg-h" aria-describedby="p314-dlg-d">
      <h2 id="p314-dlg-h">Post these notes again?</h2>
      <p id="p314-dlg-d">These exact notes are already a comment on ${where}, posted ${S.when}. Posting again adds a second copy. Nothing goes to your T3 Code thread either way.</p>
      <div class="p314-row">${viewLink()}<span class="topbar-spacer"></span><button type="button" class="ghost" data-act="dlg-cancel" autofocus>Cancel</button><button type="button" class="ghost p314-danger" data-act="dlg-post">Post a second copy</button></div>
    </dialog>`;
  }

  // ---------- paint ----------
  function paint(focus) {
    document.body.classList.toggle('has-pane', S.size === 'pane');
    viewer.className = `vw ${S.size === 'pane' ? 'is-c' : 'is-a'} p314-dir-${DIR}`;
    const showPanel = S.size === 'full' ? S.panelOpen : S.tab === 'feedback';
    const showCanvas = S.size === 'full' || S.tab === 'canvas';
    viewer.innerHTML = `<div id="vw-toolbar">${toolbar()}</div><div class="vw-stage p314-stage${showPanel && showCanvas ? ' has-feedback' : ''}">${showCanvas ? canvas() : ''}${showPanel ? `<aside class="cf-panel" id="vw-feedback" aria-label="Feedback">${panel()}</aside>` : ''}</div>${dialog()}`;
    const dlg = document.getElementById('p314-dialog');
    if (dlg && !dlg.open) {
      dlg.showModal();
      dlg.addEventListener('close', () => {
        S.dialog = false;
        paint('[data-act="post"]');
      });
    }
    if (focus) viewer.querySelector(focus)?.focus();
  }

  function post() {
    S.dialog = false;
    S.copied = false;
    S.state = 'posting';
    S.pop = false;
    say(`Posting to GitHub, ${ticket}…`);
    paint();
    setTimeout(() => {
      if (S.fail) {
        S.fail = false;
        S.state = 'failed';
        S.pop = true;
        say(`Not posted to ${ticket}. Your notes are still here.`);
        return paint(DIR === 'C' ? '#p314-pop' : '[data-act="post"]');
      }
      S.state = 'posted';
      S.when = 'just now';
      S.t3 = null;
      S.bar = true;
      S.pop = true;
      if (IS_B) {
        S.panelOpen = false;
        if (S.size === 'pane') S.tab = 'canvas';
      }
      say(`Posted to GitHub, ${ticket}. ${t3}`);
      paint(DIR === 'C' ? '#p314-pop' : IS_B ? '#p314-bar-h' : '#p314-h');
    }, 1200);
  }

  viewer.addEventListener('click', (event) => {
    const el = event.target.closest('[data-act], [data-size], [data-tab], [data-view]');
    if (!el || el.disabled) return;
    if (el.dataset.size) {
      S.size = el.dataset.size === 'float' ? S.size : el.dataset.size;
      if (el.dataset.size === 'float') Kit.toast('The floating window works as the side pane does');
      return paint();
    }
    if (el.dataset.tab) {
      S.tab = el.dataset.tab;
      return paint(`[data-tab="${S.tab}"]`);
    }
    if (el.dataset.view) {
      S.view = el.dataset.view;
      return paint(`[data-view="${S.view}"]`);
    }
    const act = el.dataset.act;
    if (act === 'panel') {
      S.panelOpen = !S.panelOpen;
      return paint('[data-act="panel"]');
    }
    if (act === 'post') {
      if (IS_B && posted()) {
        S.dialog = true;
        return paint();
      }
      return post();
    }
    if (act === 'edit') {
      if (el.tagName === 'TEXTAREA') return;
      if (posted()) {
        Kit.toast('Would go back to the list. Changing a note lets you post an update.');
        return;
      }
      Kit.toast('Would go back to the list of notes');
      return;
    }
    if (act === 'copy') {
      S.copied = true;
      say('Copied. Paste it in your T3 Code thread.');
      Kit.toast(`Copied ${DIR === 'A' ? 'a message' : 'the comment link'} for your T3 Code thread`);
      return paint(`[data-act="copy"]`);
    }
    if (act === 't3go') {
      if (DIR === 'B2') {
        S.t3 = 'done';
        say(`Message copied. Opening your T3 Code thread for ${ticket}.`);
        Kit.toast(`Copied, and would open the T3 Code thread for ${ticket}`);
        return paint('#p314-bar-h');
      }
      S.t3 = 'sending';
      say(`Sending to your T3 Code thread for ${ticket}…`);
      paint();
      setTimeout(() => {
        S.t3 = S.t3fail ? 'fail' : 'done';
        S.t3fail = false;
        say(S.t3 === 'done' ? `Sent to your T3 Code thread for ${ticket}.` : 'Not sent to T3 Code. The notes are safe on GitHub.');
        paint('#p314-bar-h');
      }, 1000);
      return;
    }
    if (act === 'fresh') {
      Kit.toast('Would clear these notes and start new feedback');
      return;
    }
    if (act === 'bar-close') {
      S.bar = false;
      return paint('.cf-toggle');
    }
    if (act === 'pop') {
      S.pop = !S.pop;
      return paint(S.pop ? '#p314-pop' : '[data-act="pop"]');
    }
    if (act === 'dlg-cancel') return document.getElementById('p314-dialog')?.close();
    if (act === 'dlg-post') return post();
  });
  viewer.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && DIR === 'C' && S.pop && event.target.closest?.('#p314-pop, .p314-chip')) {
      event.preventDefault();
      S.pop = false;
      paint('[data-act="pop"]');
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.target.closest?.('textarea, input, dialog')) return;
    if (event.key === 'f' || event.key === 'F') {
      if (S.size === 'full') S.panelOpen = !S.panelOpen;
      else S.tab = S.tab === 'feedback' ? 'canvas' : 'feedback';
      paint();
    }
  });
  // Clicking outside the popover closes it, as menus in the viewer do.
  document.addEventListener('pointerdown', (event) => {
    if (document.getElementById('p314-pop') && !event.target.closest('#p314-pop, .p314-chip')) {
      S.pop = false;
      paint();
    }
  });
  paint();
})();
