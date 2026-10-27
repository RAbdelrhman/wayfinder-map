/*
  PROTOTYPE (#353): how another author's public map reaches the phone.
  ?o=A  Browse public maps on the phone   ?s=maps|find|repo|followed|offline|hidden|account
  ?o=B  Add a map by its link             ?s=maps|add|preview|private|share|offline|hidden|account
  ?o=C  Mirror the desktop's follows      ?s=maps|pcoff|unpaired|hidden|account
  The Maps screen is #223's approved R-C2 list; only the rows and the footer named in each option change.
*/
(() => {
  const params = new URLSearchParams(location.search);
  const O = ['A', 'B', 'C'].includes(params.get('o')) ? params.get('o') : 'A';
  const SCREENS = { A: ['maps', 'find', 'repo', 'followed', 'offline', 'hidden', 'account'], B: ['maps', 'add', 'preview', 'private', 'share', 'offline', 'hidden', 'account'], C: ['maps', 'pcoff', 'unpaired', 'hidden', 'account'] };
  const S0 = SCREENS[O].includes(params.get('s')) ? params.get('s') : 'maps';
  const D = window.F;
  const esc = Kit.esc;
  const ic = Kit.icon;
  const key = (m) => `${m.repo}#${m.number}`;
  const short = (repo) => repo.split('/')[1];
  const other = (k) => D.others.find((m) => key(m) === k);

  /* ---------- state per starting screen ---------- */
  const ui = {
    screen: { followed: 'maps', offline: O === 'A' ? 'find' : 'add', hidden: O === 'C' ? 'maps' : O === 'A' ? 'find' : 'add', account: O === 'C' ? 'maps' : O === 'A' ? 'find' : 'add', repo: 'find', private: 'add', preview: 'add', pcoff: 'maps', unpaired: 'maps' }[S0] ?? S0,
    stack: [],
    follows: new Set(['mona/octo-notes#12']),
    offline: S0 === 'offline',
    login: S0 === 'account' && O !== 'C' ? D.otherLogin : D.user.login,
    query: S0 === 'repo' ? 'mona/octo-notes' : '',
    paste: { preview: 'https://github.com/RAbdelrhman/wayfinder-map/issues/198', private: 'mona/octo-notes#9', offline: 'https://github.com/RAbdelrhman/wayfinder-map/issues/198', share: '' }[S0] ?? '',
    sharing: S0 === 'share',
    toast: S0 === 'followed' ? 'Following #198 Linux desktop build. It is on your maps now.' : '',
  };
  if (S0 === 'followed') ui.follows.add('RAbdelrhman/wayfinder-map#198');
  if (S0 === 'hidden') {
    ui.follows.add('RAbdelrhman/wayfinder-map#198');
    D.others.find((m) => m.number === 198).public = false;
  }
  if (S0 === 'account' && O !== 'C') ui.follows.clear();
  if (O === 'C' && S0 === 'unpaired') ui.follows.clear();
  if (O === 'C' && S0 === 'account') ui.follows.clear();

  /* ---------- shared pieces (from the #223 board) ---------- */
  const status = () => `<div class="m-status" aria-hidden="true"><span>9:41</span><span>●●● ▮</span></div>`;
  const backBtn = (label) => `<button class="m-back" data-act="back" aria-label="Back to ${esc(label)}"><span class="m-back-face">${ic('back')}${esc(label)}</span></button>`;
  const bar = (title, left = '') => `<header class="m-bar">${left || '<span style="width:44px"></span>'}<h1>${esc(title)}</h1><span style="width:44px"></span></header>`;
  const avatar = () => `<button class="m-icon-btn" data-toast="Settings (#316). Nothing about follows changes there." aria-label="Settings, signed in as ${esc(ui.login)}"><span class="avatar" style="width:30px;height:30px">${ui.login === D.user.login ? D.user.initial : 'W'}</span></button>`;
  const largeBar = (title, right = '') => `<header class="m-bar is-large"><div class="m-bar-row"><span></span>${right}</div><h1>${esc(title)}</h1></header>`;
  const total = (c) => c.done + c.claimed + c.frontier + c.blocked;
  const progress = (c) =>
    `<div class="m-progress" role="img" aria-label="${c.done} of ${total(c)} done">${PROGRESS_ORDER.filter((s) => c[s] > 0)
      .map((s) => `<span style="--accent: var(${STATES[s].variable}); flex:${c[s]}"></span>`)
      .join('')}</div>`;
  const banner = (icon, text) => `<div class="m-cached" role="status">${ic(icon)}<span>${text}</span></div>`;
  const minutes = (s) => {
    const [n, unit] = s.replace('yesterday', '1 day').split(' ');
    return Number(n) * ({ min: 1, h: 60, hour: 60, hours: 60, day: 1440, days: 1440, week: 10080, weeks: 10080 }[unit] ?? 1);
  };

  /* ---------- Maps (#223 R-C2) ---------- */
  function mapRow(m) {
    const by = m.author ? ` · @${esc(m.author)}` : '';
    return `<button class="m-row" data-toast="Would open #${m.number} (#223 map view)" style="align-items:flex-start;flex-wrap:wrap">
      <span class="m-row-main"><span class="m-row-title">${esc(m.title)}</span>
      <span class="m-row-sub">${esc(short(m.repo))} · #${m.number}${by} · ${m.counts.done}/${total(m.counts)} done · ${m.updated}</span>
      <span style="display:block;margin-top:8px">${progress(m.counts)}</span></span>${ic('chevron')}</button>`;
  }
  const followedList = () => [...ui.follows].map(other).filter(Boolean);
  const hiddenFollows = () => followedList().filter((m) => !m.public);

  function maps() {
    const own = ui.login === D.user.login ? D.own : [];
    const rows = [...own, ...followedList().filter((m) => m.public)].sort((a, b) => minutes(a.updated) - minutes(b.updated));
    const hidden = hiddenFollows();
    let foot = '';
    if (O === 'A') foot = `<button class="m-btn is-quiet f-gap" data-act="go" data-to="find">${ic('search')}Find public maps</button><p class="m-fine f-fine">Other people's maps show here after you follow them.</p>`;
    if (O === 'B') foot = `<button class="m-btn is-quiet f-gap" data-act="go" data-to="add">${ic('link')}Add a public map</button><p class="m-fine f-fine">Paste a map's GitHub link to follow it.</p>`;
    if (O === 'C') foot = desktopNote();
    const hiddenNote =
      hidden.length && O !== 'C'
        ? `<button class="f-notice" data-act="go" data-to="${O === 'A' ? 'find' : 'add'}">${ic('eyeoff')}<span class="m-row-main"><b>1 followed map is hidden</b><span>#${hidden[0].number} is no longer public.</span></span>${ic('chevron')}</button>`
        : '';
    return `${status()}${largeBar('Maps', avatar())}<div class="m-scroll">
      <div class="m-search">${ic('search')}<input aria-label="Search maps" placeholder="Search maps and repos"></div>
      <div class="m-filter-row"><button class="m-filter-btn" data-toast="#223 filter sheet, unchanged" aria-label="Filter by repository, showing All maps">${ic('filter')}<span>Filter by</span><b>All maps</b>${ic('down')}</button></div>
      <div class="m-section-title">Latest</div>
      ${rows.length ? `<div class="m-group">${rows.map(mapRow).join('')}</div>` : `<div class="m-empty"><b>No maps yet</b>Your maps and the public maps you follow show here.</div>`}
      ${hiddenNote}${foot}</div>${ui.toast ? `<div class="f-toast" role="status">${esc(ui.toast)}</div>` : ''}`;
  }

  function desktopNote() {
    const hidden = hiddenFollows();
    if (S0 === 'unpaired')
      return `<div class="f-desk">${ic('desktop')}<div><b>Follows come from your desktop</b><span>Pair this phone with Wayfinder on your desktop to see the public maps you follow there.</span>
        <button class="m-link" data-toast="Would open Settings › Desktop (#224 owns pairing)">Open Settings › Desktop</button></div></div>`;
    if (S0 === 'account')
      return `<div class="f-desk is-warn">${ic('info')}<div><b>Different GitHub accounts</b><span>Your desktop is signed in as @${esc(D.otherLogin)}. Its follows show here only when the phone and desktop use the same account.</span></div></div>`;
    const synced = S0 === 'pcoff' ? 'Your desktop is off. Showing the follows it sent 2 h ago; the maps still update from GitHub.' : 'Synced with your desktop 4 min ago.';
    return `${hidden.length ? `<div class="f-desk is-warn">${ic('eyeoff')}<div><b>#${hidden[0].number} ${esc(hidden[0].title)} is hidden</b><span>@${esc(hidden[0].author)} made it private. Unfollow it in Wayfinder on your desktop, or wait for it to be public again.</span></div></div>` : ''}
      <div class="f-desk">${ic('desktop')}<div><b>Follow and unfollow on your desktop</b><span>Public maps you follow in Wayfinder on your PC show here. ${synced}</span></div></div>`;
  }

  /* ---------- follow buttons ---------- */
  function followBtn(m) {
    const on = ui.follows.has(key(m));
    const off = ui.offline && !on;
    return `<span class="f-act"><button class="f-follow${on ? '' : ' is-add'}" data-act="${on ? 'unfollow' : 'follow'}" data-k="${esc(key(m))}" ${off ? 'disabled aria-disabled="true"' : ''} aria-label="${on ? 'Unfollow' : 'Follow'} map #${m.number}: ${esc(m.title)}">${on ? 'Unfollow' : 'Follow'}</button></span>`;
  }
  function publicRow(m) {
    return `<div class="m-row f-prow"><span class="m-row-main"><span class="m-row-title">${esc(m.title)}</span>
      <span class="m-row-sub">#${m.number} · @${esc(m.author)} · ${m.counts.done}/${total(m.counts)} done</span><span style="display:block;margin-top:8px">${progress(m.counts)}</span></span>${followBtn(m)}</div>`;
  }
  function hiddenRow(m) {
    return `<div class="m-row f-prow"><span class="f-hid">${ic('eyeoff')}</span><span class="m-row-main"><span class="m-row-title">${esc(m.title)}</span>
      <span class="m-row-sub f-wrap">@${esc(m.author)} made #${m.number} private. It's hidden until it's public again.</span></span>${followBtn(m)}</div>`;
  }
  const accountBanner = () =>
    ui.login !== D.user.login ? banner('person', `Signed in as @${esc(ui.login)}. @${D.user.login}'s follows stay saved on this phone for when you sign back in.`) : '';
  const offlineBanner = (what) => (ui.offline ? banner('refresh', `Offline. ${what}`) : '');

  /* ---------- A: Public maps ---------- */
  function find() {
    const hidden = hiddenFollows();
    const q = ui.query.trim().toLowerCase();
    const repos = q ? [q] : ['rabdelrhman/wayfinder-map', 'rabdelrhman/recipes-app', 'mona/octo-notes'];
    const groups = repos
      .map((r) => {
        const list = D.others.filter((m) => m.repo.toLowerCase() === r && m.public);
        const why = r.startsWith('rabdelrhman/') ? 'Has your maps' : q ? 'Searched' : 'You follow a map here';
        const name = D.others.find((m) => m.repo.toLowerCase() === r)?.repo ?? D.own.find((m) => m.repo.toLowerCase() === r)?.repo ?? r;
        return `<div class="m-section-title">${esc(short(name))}<span class="f-why">${why}</span></div>${
          list.length ? `<div class="m-group">${list.map(publicRow).join('')}</div>` : `<p class="f-none">No public maps from other people.</p>`
        }`;
      })
      .join('');
    return `${status()}${bar('Public maps', backBtn('Maps'))}${offlineBanner('Finding maps needs GitHub. Unfollow still works.')}${accountBanner()}<div class="m-scroll">
      <label class="m-search">${ic('search')}<input data-act="query" value="${esc(ui.query)}" aria-label="Look in a repository" placeholder="Look in a repository: owner/repo" ${ui.offline ? 'disabled' : ''}></label>
      ${hidden.length ? `<div class="m-section-title">Followed, not public now</div><div class="m-group">${hidden.map(hiddenRow).join('')}</div>` : ''}
      ${groups}
      ${q ? '<p class="m-fine f-fine">Private maps are never listed.</p>' : ''}
      <p class="m-fine f-fine">Only maps their authors marked public. Follows are saved on this phone for @${esc(ui.login)}; your desktop keeps its own list.</p></div>${ui.toast ? `<div class="f-toast" role="status">${esc(ui.toast)}</div>` : ''}`;
  }

  /* ---------- B: Followed maps + paste ---------- */
  function lookup(text) {
    const t = text.trim();
    const m = t.match(/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)/i) || t.match(/^([\w.-]+\/[\w.-]+)#(\d+)$/);
    if (!m) return null;
    const k = `${m[1]}#${m[2]}`.toLowerCase();
    return D.others.find((x) => key(x).toLowerCase() === k) ?? D.own.find((x) => key(x).toLowerCase() === k) ?? { missing: true };
  }
  function preview() {
    if (!ui.paste) return '';
    if (ui.offline)
      return `<div class="f-card is-warn" role="status">${ic('refresh')}<div><b>You're offline</b><span>Wayfinder checks with GitHub that a map is public before following it. Try again when you're online.</span></div></div>`;
    const m = lookup(ui.paste);
    if (!m) return `<div class="f-card is-warn" role="alert">${ic('info')}<div><b>That isn't a map link</b><span>Paste a GitHub issue link or owner/repo#number.</span></div></div>`;
    if (m.missing) return `<div class="f-card is-warn" role="alert">${ic('info')}<div><b>Can't read that issue</b><span>The link may be wrong, or the repository is private to you.</span></div></div>`;
    if (!m.author) return `<div class="f-card" role="status">${ic('check')}<div><b>That's your map</b><span>Your maps always show on Maps.</span></div></div>`;
    if (!m.public)
      return `<div class="f-card is-warn" role="alert">${ic('lock')}<div><b>#${m.number} isn't public</b><span>@${esc(m.author)} has to add <code>Visibility: public</code> to the map before anyone can follow it.</span></div></div>
        <div class="m-section-title">The check can also say</div><ul class="f-list"><li>That's your map. Your maps always show.</li><li>That isn't a map link.</li><li>Can't read that issue. The link may be wrong, or the repository is private to you.</li></ul>`;
    const on = ui.follows.has(key(m));
    return `<div class="f-preview"><span class="m-row-sub">${esc(m.repo)} · #${m.number} · @${esc(m.author)}</span><h2>${esc(m.title)}</h2>${progress(m.counts)}
      <p class="f-ok">${ic('check')}Public map · ${m.counts.done}/${total(m.counts)} done · ${m.updated}</p>
      <button class="m-btn" data-act="${on ? 'unfollow' : 'follow'}" data-k="${esc(key(m))}">${on ? 'Unfollow' : `${ic('plus')}Follow map`}</button></div>`;
  }
  function add() {
    const list = followedList();
    const rows = list.map((m) => (m.public ? publicRow(m) : hiddenRow(m))).join('');
    return `${status()}${bar('Followed maps', backBtn('Maps'))}${offlineBanner('Unfollow works now; following needs GitHub.')}${accountBanner()}<div class="m-scroll">
      <div class="m-section-title">Add a public map</div>
      <div class="f-field"><input data-act="paste" value="${esc(ui.paste)}" aria-label="Map link" placeholder="Paste a map link"><button class="f-follow" data-act="do-paste">Paste</button></div>
      <p class="f-hint">A GitHub issue link, like github.com/mona/octo-notes/issues/12, or mona/octo-notes#12.</p>
      ${preview()}
      <div class="m-section-title">Following <span class="f-why">${list.length}</span></div>
      ${list.length ? `<div class="m-group">${rows}</div>` : `<p class="f-none">No maps followed on this phone for @${esc(ui.login)}.</p>`}
      <p class="m-fine f-fine">Saved on this phone for @${esc(ui.login)}. Your desktop keeps its own list.</p></div>${ui.toast ? `<div class="f-toast" role="status">${esc(ui.toast)}</div>` : ''}`;
  }
  function share() {
    return `${status()}<div class="f-ghpage" aria-hidden="true"><div class="f-ghbar">${ic('github')}<span>RAbdelrhman/wayfinder-map</span></div>
      <h2>Linux desktop build <span>#198</span></h2><p>Opened by tess-k · Visibility: public</p><div class="m-skel" style="width:90%"></div><div class="m-skel" style="width:70%;margin-top:10px"></div></div>
      <div class="m-scrim"></div><section class="m-sheet f-share" role="dialog" aria-label="Share">
      <div class="m-grab" aria-hidden="true"></div><h2 class="m-sheet-title">Share from GitHub</h2>
      <div class="f-targets"><button data-toast="Would copy the link">${ic('link')}<span>Copy link</span></button><button class="is-us" data-act="from-share">${ic('plus')}<span>Wayfinder</span></button><button data-toast="Would open Mail">${ic('share')}<span>Mail</span></button></div>
      <p class="m-fine">Wayfinder opens Followed maps with the link already checked.</p></section>`;
  }

  /* ---------- render + events ---------- */
  const app = document.getElementById('app');
  function render() {
    const s = ui.sharing ? 'share' : ui.screen;
    app.innerHTML = s === 'share' ? share() : s === 'find' ? find() : s === 'add' ? add() : maps();
    document.title = `${O} · ${s}`;
  }
  function flash(text) {
    ui.toast = '';
    Kit.toast(text);
  }
  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act],[data-toast]');
    if (!el || el.disabled) return;
    if (el.dataset.toast) return Kit.toast(el.dataset.toast);
    const act = el.dataset.act;
    if (act === 'go') {
      ui.stack.push(ui.screen);
      ui.screen = el.dataset.to;
      ui.toast = '';
      render();
      return app.querySelector('h1')?.focus();
    }
    if (act === 'back') {
      ui.screen = ui.stack.pop() ?? 'maps';
      ui.toast = '';
      return render();
    }
    if (act === 'follow' || act === 'unfollow') {
      const m = other(el.dataset.k);
      if (act === 'follow') ui.follows.add(el.dataset.k);
      else ui.follows.delete(el.dataset.k);
      render();
      // The desktop's own toast copy (src/ui/home.ts).
      return flash(act === 'follow' ? `Following #${m.number} ${m.title}. It is on your maps now.` : `Unfollowed #${m.number} ${m.title}.`);
    }
    if (act === 'do-paste') {
      ui.paste = ui.paste || 'https://github.com/RAbdelrhman/wayfinder-map/issues/198';
      return render();
    }
    if (act === 'from-share') {
      ui.sharing = false;
      ui.screen = 'add';
      ui.stack = ['maps'];
      ui.paste = 'https://github.com/RAbdelrhman/wayfinder-map/issues/198';
      return render();
    }
  });
  app.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.act === 'query') ui.query = el.value;
    if (el.dataset.act === 'paste') ui.paste = el.value;
    render();
  });
  render();
})();
