/*
  PROTOTYPE (#359): followed maps the phone can't show, on the selected #353 A + B-share screens (R3 option 1).
  ?o=A  In its repository     the reference row stays in its repository group on Public maps
  ?o=B  Its own section       Public maps gains "Followed, can't show now" under "Followed, not public now"
  ?o=C  A sheet from Maps     the Maps notice opens a sheet; Public maps stays as #353 drew it
  ?s=maps|unknown|offline|shared|unfollowed|recovered|account   (&at=moved scrolls to the shared card's group line)
  &r=2  Round 2 of A: only the edits Ramon pinned on A's Overview frame (#359 viewer notes at 44d0be5), keyed by map, not position.
  A follow Wayfinder can't read shows only the reference the user saved (owner/repo#number) and why.
  Only a readable map without `Visibility: public` is called private; every other failure stays unknown.
  Every map keeps one Follow / Unfollow per screen. Unfollow only changes this phone; nothing is written to GitHub.
*/
(() => {
  const params = new URLSearchParams(location.search);
  const O = ['A', 'B', 'C'].includes(params.get('o')) ? params.get('o') : 'A';
  const STATES_LIST = ['maps', 'unknown', 'offline', 'shared', 'unfollowed', 'recovered', 'account'];
  const S0 = STATES_LIST.includes(params.get('s')) ? params.get('s') : 'maps';
  const R2 = O === 'A' && params.get('r') === '2';
  // Round 2 pins: center #15's Follow; remove two group labels, Public maps' fine print and #3's reason line.
  const R2_CENTER = R2 ? 'mona/octo-notes#15' : '';
  const R2_NO_WHY = R2 ? ['RAbdelrhman/recipes-app', 'mona/octo-notes'] : [];
  const R2_NO_REASON = R2 ? 'kai-r/trailhead#3' : '';
  const D = window.F;
  const esc = Kit.esc;
  const ic = Kit.icon;
  const key = (m) => `${m.repo}#${m.number}`;
  const short = (repo) => repo.split('/')[1];
  const other = (k) => D.others.find((m) => key(m) === k);
  const refOf = (k) => D.refs.find((r) => key(r) === k);

  /* ---------- state per starting screen ---------- */
  const unreadable = new Map(); // key → reason, for follows Wayfinder can't show
  const privateNow = new Set(); // readable maps whose author removed Visibility: public (confirmed)
  const follows = new Set(['mona/octo-notes#12', 'RAbdelrhman/wayfinder-map#198']);
  const offlineState = S0 === 'offline';
  if (offlineState) {
    follows.add('jo-park/garden-planner#8');
    unreadable.set('jo-park/garden-planner#8', 'nosave');
  } else if (S0 === 'recovered') {
    follows.add('jo-park/garden-planner#8');
    follows.add('kai-r/trailhead#3');
  } else if (S0 !== 'account') {
    privateNow.add('RAbdelrhman/wayfinder-map#198');
    for (const r of D.refs.filter((r) => r.why !== 'nosave')) {
      follows.add(key(r));
      unreadable.set(key(r), r.why);
    }
  }
  if (S0 === 'unfollowed') {
    follows.delete('mona/octo-notes#21');
    unreadable.delete('mona/octo-notes#21');
  }
  if (S0 === 'account') follows.clear();

  const sheetFirst = O === 'C' && ['unknown', 'offline', 'unfollowed'].includes(S0);
  const ui = {
    screen: S0 === 'maps' || (O === 'C' && S0 !== 'shared') ? 'maps' : 'find',
    stack: S0 === 'maps' || (O === 'C' && S0 !== 'shared') ? [] : ['maps'],
    sheet: sheetFirst,
    offline: offlineState,
    login: S0 === 'account' ? D.otherLogin : D.user.login,
    shared: S0 === 'shared' ? 'mona/octo-notes#21' : '',
    toast: {
      unfollowed: 'Unfollowed mona/octo-notes#21.',
      recovered: 'Back online. jo-park/garden-planner#8 and kai-r/trailhead#3 show again.',
    }[S0] ?? '',
  };

  const isShown = (k) => follows.has(k) && !unreadable.has(k) && !privateNow.has(k) && !!other(k);
  const privateList = () => [...follows].filter((k) => privateNow.has(k)).map(other);
  const refList = () => [...follows].filter((k) => unreadable.has(k)).map((k) => ({ ...refOf(k), why: unreadable.get(k) }));

  /* ---------- shared pieces (from the #223 / #353 boards) ---------- */
  const status = () => `<div class="m-status" aria-hidden="true"><span>9:41</span><span>●●● ▮</span></div>`;
  const backBtn = (label) => `<button class="m-back" data-act="back" aria-label="Back to ${esc(label)}"><span class="m-back-face">${ic('back')}${esc(label)}</span></button>`;
  const bar = (title, left = '') => `<header class="m-bar">${left || '<span style="width:44px"></span>'}<h1 tabindex="-1">${esc(title)}</h1><span style="width:44px"></span></header>`;
  const avatar = () => `<button class="m-icon-btn" data-toast="Settings (#316). Nothing about follows changes there." aria-label="Settings, signed in as ${esc(ui.login)}"><span class="avatar" style="width:30px;height:30px">${ui.login === D.user.login ? D.user.initial : 'W'}</span></button>`;
  const largeBar = (title, right = '') => `<header class="m-bar is-large"><div class="m-bar-row"><span></span>${right}</div><h1 tabindex="-1">${esc(title)}</h1></header>`;
  const total = (c) => c.done + c.claimed + c.frontier + c.blocked;
  const progress = (c) =>
    `<div class="m-progress" role="img" aria-label="${c.done} of ${total(c)} done">${PROGRESS_ORDER.filter((s) => c[s] > 0)
      .map((s) => `<span style="--accent: var(${STATES[s].variable}); flex:${c[s]}"></span>`)
      .join('')}</div>`;
  const banner = (icon, text) => `<div class="m-cached" role="status">${ic(icon)}<span>${text}</span></div>`;
  const toastEl = () => (ui.toast ? `<div class="f-toast" role="status">${esc(ui.toast)}</div>` : '');
  const minutes = (s) => {
    const [n, unit] = s.replace('yesterday', '1 day').split(' ');
    return Number(n) * ({ min: 1, h: 60, day: 1440, days: 1440, week: 10080 }[unit] ?? 1);
  };
  const fine = () =>
    `<p class="m-fine f-fine">Only maps their authors marked public. Follows are saved on this phone for @${esc(ui.login)}, and Unfollow changes only this phone. Wayfinder never writes to GitHub; your desktop keeps its own list.</p>`;
  const accountBanner = () =>
    ui.login !== D.user.login ? banner('person', `Signed in as @${esc(ui.login)}. @${D.user.login}'s follows stay saved on this phone for when you sign back in.`) : '';
  const offlineBanner = (what) => (ui.offline ? banner('refresh', `Offline. ${what}`) : '');

  /* ---------- rows ---------- */
  function mapRow(m) {
    const by = m.author ? ` · @${esc(m.author)}` : '';
    return `<button class="m-row" data-toast="Would open #${m.number} (#223 map view)" style="align-items:flex-start;flex-wrap:wrap">
      <span class="m-row-main"><span class="m-row-title">${esc(m.title)}</span>
      <span class="m-row-sub">${esc(short(m.repo))} · #${m.number}${by} · ${m.counts.done}/${total(m.counts)} done · ${m.updated}</span>
      <span style="display:block;margin-top:8px">${progress(m.counts)}</span></span>${ic('chevron')}</button>`;
  }
  function followBtn(m) {
    const on = follows.has(key(m));
    const off = ui.offline && !on;
    return `<span class="f-act${key(m) === R2_CENTER ? ' u-center' : ''}"><button class="f-follow${on ? '' : ' is-add'}" data-act="${on ? 'unfollow' : 'follow'}" data-k="${esc(key(m))}" ${off ? 'disabled aria-disabled="true"' : ''} aria-label="${on ? 'Unfollow' : 'Follow'} map #${m.number}: ${esc(m.title)}">${on ? 'Unfollow' : 'Follow'}</button></span>`;
  }
  // Unfollow on a reference changes only this phone, so it works offline and without GitHub.
  const refBtn = (r) => `<span class="f-act"><button class="f-follow" data-act="unfollow" data-k="${esc(key(r))}" aria-label="Unfollow map ${esc(key(r))}">Unfollow</button></span>`;
  function publicRow(m) {
    return `<div class="m-row f-prow"><span class="m-row-main"><span class="m-row-title">${esc(m.title)}</span>
      <span class="m-row-sub">#${m.number} · @${esc(m.author)} · ${m.counts.done}/${total(m.counts)} done</span><span style="display:block;margin-top:8px">${progress(m.counts)}</span></span>${followBtn(m)}</div>`;
  }
  // #353's confirmed-private row, unchanged: the map is readable, so its title is shown.
  function hiddenRow(m) {
    return `<div class="m-row f-prow"><span class="f-hid">${ic('eyeoff')}</span><span class="m-row-main"><span class="m-row-title">${esc(m.title)}</span>
      <span class="m-row-sub f-wrap">@${esc(m.author)} made #${m.number} private. It's hidden until it's public again.</span></span>${followBtn(m)}</div>`;
  }
  // A follow Wayfinder can't show: the saved reference and the reason, never a title.
  function refRow(r, inRepo) {
    const w = WHY[r.why];
    const name = inRepo ? `#${r.number}` : key(r);
    return `<div class="m-row f-prow u-ref${key(r) === R2_NO_REASON ? ' u-center-row' : ''}"><span class="f-hid u-why-${r.why}">${ic(w.icon)}</span><span class="m-row-main"><span class="m-row-title u-name">${esc(name)}</span>
      ${key(r) === R2_NO_REASON ? '' : `<span class="m-row-sub f-wrap"><b class="u-head">${esc(w.head)}.</b> ${esc(w.text)}</span>`}</span>${refBtn(r)}</div>`;
  }
  const movedLine = (r) => `<p class="f-none f-moved">#${r.number} is above, under Shared from GitHub.</p>`;

  /* ---------- Maps (#223 R-C2, with #353's footer) ---------- */
  function notice() {
    const priv = privateList().length;
    const refs = refList();
    const n = priv + refs.length;
    if (!n) return '';
    const count = (why) => refs.filter((r) => why.includes(r.why)).length;
    const nosave = count(['nosave']);
    const parts = [priv && `${priv} not public now`, count(['issue', 'repo']) && `${count(['issue', 'repo'])} can't be read`, count(['label']) && `${count(['label'])} not a map now`, nosave && `${nosave} with no saved details`].filter(Boolean);
    const head = n === 1 && nosave ? '1 followed map has no saved details' : `${n} followed map${n === 1 ? ' isn\'t' : 's aren\'t'} showing`;
    const sub = n === 1 && nosave ? 'It shows when GitHub can be reached.' : parts.join(' · ');
    const attrs = O === 'C' ? 'data-act="sheet" aria-haspopup="dialog"' : 'data-act="go" data-to="find"';
    return `<button class="f-notice" ${attrs}>${ic(nosave && n === 1 ? 'cloudoff' : 'eyeoff')}<span class="m-row-main"><b>${head}</b><span>${sub}</span></span>${ic('chevron')}</button>`;
  }
  function maps() {
    const own = ui.login === D.user.login ? D.own : [];
    const rows = [...own, ...[...follows].filter(isShown).map(other)].sort((a, b) => minutes(a.updated) - minutes(b.updated));
    const foot = `<button class="m-btn is-quiet f-gap" data-act="go" data-to="find">${ic('search')}Find public maps</button><p class="m-fine f-fine">Other people's maps show here after you follow them.</p>`;
    return `${status()}${largeBar('Maps', avatar())}${offlineBanner('Showing what this phone saved.')}${O === 'C' ? accountBanner() : ''}<div class="m-scroll">
      <div class="m-search">${ic('search')}<input aria-label="Search maps" placeholder="Search maps and repos"></div>
      <div class="m-filter-row"><button class="m-filter-btn" data-toast="#223 filter sheet, unchanged" aria-label="Filter by repository, showing All maps">${ic('filter')}<span>Filter by</span><b>All maps</b>${ic('down')}</button></div>
      <div class="m-section-title">Latest</div>
      ${rows.length ? `<div class="m-group">${rows.map(mapRow).join('')}</div>` : `<div class="m-empty"><b>No maps yet</b>Your maps and the public maps you follow show here.</div>`}
      ${notice()}${foot}</div>${ui.sheet ? sheet() : ''}${toastEl()}`;
  }

  /* ---------- C: the sheet that lists what isn't showing ---------- */
  function sheet() {
    const priv = privateList();
    const refs = refList();
    return `<div class="m-scrim" data-act="close"></div><section class="m-sheet u-sheet" role="dialog" aria-modal="true" aria-labelledby="u-sheet-title">
      <div class="u-sheet-head"><h2 class="m-sheet-title" id="u-sheet-title">Followed maps not showing</h2><button class="u-close" data-act="close" aria-label="Close">${ic('close')}</button></div>
      <div class="u-sheet-body">
      ${priv.length ? `<div class="m-section-title">Not public now</div><div class="m-group">${priv.map(hiddenRow).join('')}</div>` : ''}
      ${refs.length ? `<div class="m-section-title">${ui.offline ? 'Waiting for GitHub' : "Can't show now"}</div><div class="m-group">${refs.map((r) => refRow(r, false)).join('')}</div>` : ''}
      <p class="m-fine f-fine">They come back on Maps when GitHub shows them again. Unfollow changes only this phone, for @${esc(ui.login)}.</p></div></section>`;
  }

  /* ---------- Public maps (#353 A, R3 option 1 card) ---------- */
  function sharedCard() {
    const r = refOf(ui.shared);
    if (!follows.has(ui.shared))
      return `<div class="f-card is-warn" role="alert">${ic('info')}<div><b>Can't read that issue</b><span>The link may be wrong, or the repository is private to you.</span></div></div>`;
    const w = WHY[unreadable.get(ui.shared)];
    return `<div class="f-preview u-card"><span class="m-row-sub">${esc(key(r))} · you follow it</span><h2>${ic(w.icon)}${esc(w.head)}</h2>
      <p class="u-card-text">${esc(w.text)}</p><button class="m-btn is-quiet" data-act="unfollow" data-k="${esc(key(r))}" aria-label="Unfollow map ${esc(key(r))}">Unfollow</button></div>`;
  }
  function find() {
    const priv = privateList();
    const refs = refList();
    const sharedRef = ui.shared && follows.has(ui.shared) ? refs.find((r) => key(r) === ui.shared) : null;
    const listed = refs.filter((r) => r !== sharedRef);
    const repoNames = [...new Set([...D.own.map((m) => m.repo), ...[...follows].map((k) => k.split('#')[0])])];
    const groups = repoNames
      .map((name) => {
        const readable = D.others.filter((m) => m.repo === name && m.public && !privateNow.has(key(m)) && !unreadable.has(key(m)));
        const mine = O === 'A' ? listed.filter((r) => r.repo === name) : [];
        const moved = O === 'A' && sharedRef && sharedRef.repo === name ? movedLine(sharedRef) : '';
        const rows = readable.map(publicRow).join('') + mine.map((r) => refRow(r, true)).join('');
        if (!rows && !moved && !D.own.some((m) => m.repo === name)) return '';
        const why = D.own.some((m) => m.repo === name) ? 'Has your maps' : 'You follow a map here';
        const label = R2_NO_WHY.includes(name) ? '' : `<span class="f-why">${why}</span>`;
        return `<div class="m-section-title">${esc(short(name))}${label}</div>${rows ? `<div class="m-group">${rows}</div>` : moved ? '' : '<p class="f-none">No public maps from other people.</p>'}${moved}`;
      })
      .join('');
    const own = O === 'B' && (listed.length || sharedRef)
      ? `<div class="m-section-title">${ui.offline ? 'Followed, waiting for GitHub' : "Followed, can't show now"}</div>${listed.length ? `<div class="m-group">${listed.map((r) => refRow(r, false)).join('')}</div>` : ''}${sharedRef ? movedLine(sharedRef) : ''}`
      : '';
    return `${status()}${bar('Public maps', backBtn('Maps'))}${offlineBanner('Finding maps needs GitHub. Unfollow still works.')}${accountBanner()}<div class="m-scroll">
      <label class="m-search">${ic('search')}<input aria-label="Look in a repository" placeholder="Look in a repository: owner/repo" ${ui.offline ? 'disabled' : ''}></label>
      ${ui.shared ? `<div class="m-section-title">Shared from GitHub</div>${sharedCard()}` : ''}
      ${priv.length ? `<div class="m-section-title">Followed, not public now</div><div class="m-group">${priv.map(hiddenRow).join('')}</div>` : ''}
      ${own}${groups}${R2 ? '' : fine()}</div>${toastEl()}`;
  }

  /* ---------- render + events ---------- */
  const app = document.getElementById('app');
  let shown = '';
  function render() {
    const s = ui.screen;
    const box0 = app.querySelector(ui.sheet ? '.u-sheet-body' : '.m-scroll');
    const top = s === shown ? box0?.scrollTop ?? 0 : 0;
    app.innerHTML = s === 'find' ? find() : maps();
    document.title = `${O}${R2 ? ' R2' : ''} · ${S0} · ${s}${ui.sheet ? ' · sheet' : ''}`;
    const box = app.querySelector(ui.sheet ? '.u-sheet-body' : '.m-scroll');
    if (box) box.scrollTop = top;
    shown = s;
  }
  function closeSheet() {
    ui.sheet = false;
    render();
    (app.querySelector('.f-notice') ?? app.querySelector('h1'))?.focus();
  }
  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act],[data-toast]');
    if (!el || el.disabled) return;
    if (el.dataset.toast) return Kit.toast(el.dataset.toast);
    const act = el.dataset.act;
    ui.toast = '';
    if (act === 'go') {
      ui.stack.push(ui.screen);
      ui.screen = el.dataset.to;
      ui.sheet = false;
      render();
      return app.querySelector('h1')?.focus();
    }
    if (act === 'back') {
      ui.screen = ui.stack.pop() ?? 'maps';
      return render();
    }
    if (act === 'sheet') {
      ui.sheet = true;
      render();
      return app.querySelector('.u-close')?.focus();
    }
    if (act === 'close') return closeSheet();
    if (act === 'follow' || act === 'unfollow') {
      const k = el.dataset.k;
      if (act === 'follow') follows.add(k);
      else {
        follows.delete(k);
        unreadable.delete(k);
        privateNow.delete(k);
      }
      const closedSheet = ui.sheet && !refList().length && !privateList().length;
      if (closedSheet) ui.sheet = false;
      render();
      const m = other(k);
      const named = m && !refOf(k) ? `#${m.number} ${m.title}` : k;
      // The desktop's toast copy (src/ui/home.ts); a reference has no title, so it names owner/repo#number.
      Kit.toast(act === 'follow' ? `Following ${named}. It is on your maps now.` : `Unfollowed ${named}.`);
      if (ui.sheet) app.querySelector('.u-close')?.focus();
      else if (closedSheet) (app.querySelector('.f-notice') ?? app.querySelector('h1'))?.focus();
    }
  });
  app.addEventListener('keydown', (e) => {
    if (!ui.sheet) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      return closeSheet();
    }
    if (e.key === 'Tab') {
      const f = [...app.querySelectorAll('.u-sheet button:not([disabled])')];
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  render();
  // ?at=moved scrolls a board frame to the line a shared card leaves behind (R3 option 1).
  if (params.get('at') === 'moved') {
    const line = app.querySelector('.f-moved');
    const box = app.querySelector('.m-scroll');
    if (line && box) box.scrollTop += line.getBoundingClientRect().top - box.getBoundingClientRect().top - box.clientHeight / 2;
  }
})();
