/*
  Option G: F's selectable blocks and preview also serve the active maps list. A separate control archives a
  map. Archived maps is its own page, reached from the foot of the list and from the sidebar
  tree: maps grouped by why they are archived, with a detail pane that says what is paused,
  what still runs, and how the map comes back. In-memory fixtures only.
*/
(() => {
  const R = R2;
  const esc = Kit.esc;
  const nav = document.getElementById('nav');
  const topbar = document.getElementById('topbar');
  const main = document.getElementById('main');
  let s;

  function reset(fixture = 'normal') {
    const maps = R.fresh();
    s = {
      maps: fixture === 'empty' ? maps.filter((m) => m.archive === null) : maps,
      fixture, view: 'active', selected: null, activeSelected: null, opened: null, from: 'archived', query: '', pending: null, error: null, restored: null, arrived: null,
    };
  }
  reset();

  const byNumber = (n) => s.maps.find((m) => m.number === n);
  const loading = () => s.fixture === 'loading';

  function errorBanner() {
    if (s.error) {
      const m = byNumber(s.error.number);
      const what = s.error.kind === 'archive' ? `Couldn't archive #${m.number}. It's still in your active maps.` : `Couldn't restore #${m.number}. It's still archived.`;
      return `<div class="r2-alert" role="alert"><span data-icon="alert" aria-hidden="true"></span><span class="grow"><b>${esc(what)}</b> Your archive choices couldn't be saved on this computer.</span><button type="button" class="ghost" data-retry>Try again</button></div>`;
    }
    if (s.fixture === 'error') {
      return `<div class="r2-alert is-stale" role="alert"><span data-icon="alert" aria-hidden="true"></span><span class="grow"><b>Couldn't refresh from GitHub.</b> Showing your maps from 2 minutes ago; nothing has moved in or out of the archive.</span><button type="button" class="ghost" data-retry><span data-icon="refresh" aria-hidden="true"></span>Try again</button></div>`;
    }
    return '';
  }

  function archiveIcon(m) {
    const busy = s.pending === m.number;
    return `<button type="button" class="ghost" data-archive="${m.number}" aria-label="${esc(`Archive map #${m.number}: ${m.title}`)}"${busy ? ' aria-disabled="true" aria-busy="true"' : ''}>${busy ? '<span class="r2-spin" aria-hidden="true"></span>Archiving…' : '<span data-icon="archive" aria-hidden="true"></span>Archive'}</button>`;
  }

  function activeOption(m) {
    const done = m.tickets.filter((ticket) => ticket.state === 'done').length;
    return `<div class="r2-opt r2f-opt r2g-opt" role="option" id="r2g-opt-${m.number}" data-select="${m.number}" aria-labelledby="r2g-name-${m.number}" aria-describedby="r2g-dest-${m.number} r2g-progress-${m.number}" aria-selected="${m.number === s.activeSelected}" tabindex="${m.number === s.activeSelected ? 0 : -1}">
      <span class="r2f-identity">${R.ring(m)}<span class="t" id="r2g-name-${m.number}"><span class="num">#${m.number}</span> ${esc(m.title)}</span></span>
      <span class="r2g-destination" id="r2g-dest-${m.number}">${esc(m.destination)}</span>
      <span class="r2g-progress" id="r2g-progress-${m.number}">${done} of ${m.tickets.length} tickets done${m.running ? ` · ${m.running} running` : ''}${m.needsYou ? ` · ${m.needsYou} needs you` : ''}</span>
    </div>`;
  }

  function activeDetail(m) {
    const next = m.tickets.find((ticket) => ticket.state === 'frontier');
    return `<aside class="r2d-detail" aria-labelledby="r2d-detail-title">
      <a class="r2e-preview" href="#map-${m.number}" data-open="${m.number}" aria-label="${esc(`Open map #${m.number}: ${m.title}`)}">
        <div class="r2d-detail-graph" aria-hidden="true">${R.graphSvg(m)}</div>
        <div class="r2d-detail-body r2e-overview"><p class="eyebrow">Map · #${m.number} · Active</p><h2 id="r2d-detail-title">${esc(m.title)}</h2><p class="dest">${esc(m.destination)}</p>${R.countsHtml(m)}<span class="r2e-open">Open map<span data-icon="arrow" aria-hidden="true"></span></span></div>
      </a>
      <div class="r2d-detail-body r2e-facts"><dl class="r2d-facts">
        <div><dt>Next up</dt><dd>${next ? `#${next.number} ${esc(next.title)}` : 'Nothing next up'}</dd></div>
        <div><dt>Hand-offs</dt><dd>${m.running ? `${m.running} running in T3 Code` : 'None running'}</dd></div>
        ${m.needsYou ? `<div><dt>Needs you</dt><dd>${m.needsYou} ticket needs your attention</dd></div>` : ''}
        <div><dt>Visibility</dt><dd>${m.visibility === 'public' ? 'Public' : 'Private in Wayfinder only. If the repository is public, this issue can still be read on GitHub.'}</dd></div>
      </dl>${s.error && s.error.number === m.number ? errorBanner() : ''}<div class="r2d-acts">${archiveIcon(m)}</div><p class="r2d-fine">Archive moves this map out of your active list for your account. GitHub is unchanged.</p></div>
    </aside>`;
  }

  function restoreButton(m, primary) {
    const busy = s.pending === m.number;
    return `<button type="button" class="${primary ? 'primary' : 'ghost'}" data-restore="${m.number}" aria-label="${esc(`Restore map #${m.number}: ${m.title}`)}"${busy ? ' aria-disabled="true" aria-busy="true"' : ''}>${busy ? '<span class="r2-spin" aria-hidden="true"></span>Restoring…' : '<span data-icon="restore" aria-hidden="true"></span>Restore'}</button>`;
  }

  function door(archived) {
    if (loading()) return `<div class="r2d-door" aria-hidden="true"><span class="r2d-door-ic"></span><span class="grow">${R.bone('120px')}${R.bone('220px')}</span></div>`;
    const counts = {};
    for (const m of archived) counts[m.archive.reason] = (counts[m.archive.reason] ?? 0) + 1;
    const parts = R.REASON_ORDER.filter((k) => counts[k]).map((k) => `${counts[k]} ${R.REASONS[k].short.toLowerCase()}`);
    const sub = archived.length === 0 ? 'None yet. Closed, finished and idle maps move here on their own.' : `${archived.length} map${archived.length === 1 ? '' : 's'} · ${parts.join(', ')}`;
    return `<a class="r2d-door" href="#" data-view="archived"><span class="r2d-door-ic"><span data-icon="archive" aria-hidden="true"></span></span><span class="grow"><b>Archived maps</b><span class="sub">${sub}</span></span><span class="r2d-door-stack" aria-hidden="true">${archived.slice(0, 3).map((m) => `<span>${R.graphSvg(m)}</span>`).join('')}</span><span data-icon="right" aria-hidden="true"></span></a>`;
  }

  function activePage() {
    const active = R.active(s.maps);
    const archived = R.archived(s.maps);
    const list = active.filter((m) => R.matches(m, s.query));
    if (!list.some((m) => m.number === s.activeSelected)) s.activeSelected = list[0]?.number ?? null;
    let body;
    if (loading()) body = `<div class="wf-maps" role="status" aria-label="Loading maps">${R.mapCardSkeleton().repeat(2)}</div>`;
    else if (active.length === 0) body = `<p class="wf-none" role="status">Every map here is archived.</p>`;
    else if (list.length === 0) body = `<p class="wf-none" role="status">No active maps match “${esc(s.query)}”.</p>`;
    else body = `<div class="r2d-split"><div class="r2d-list"><div class="r2d-listbox" role="listbox" aria-label="Active maps"><div class="r2d-group">${list.map(activeOption).join('')}</div></div><p class="r2d-hint"><kbd>↑</kbd> <kbd>↓</kbd> browse · <kbd>Enter</kbd> open map</p></div>${activeDetail(byNumber(s.activeSelected))}</div>`;
    const meta = loading() ? R.bone('170px') : `${active.length} active · ${archived.length} archived`;
    return `<div class="sheet"><div class="wf-repo-page">
      <header class="wf-head">${R.repoBadge()}<div class="grow"><h1 tabindex="-1">wayfinder-map</h1><p>RAbdelrhman/wayfinder-map · ${meta}</p></div></header>
      ${s.error ? '' : errorBanner()}
      <div class="wf-filters"><label class="search"><span data-icon="lens" aria-hidden="true"></span><span class="sr-only">Filter active maps</span><input id="r2-search" type="search" placeholder="Filter maps" autocomplete="off" value="${esc(s.query)}"></label></div>
      ${body}
      ${door(archived)}
    </div></div>`;
  }

  function option(m) {
    const on = m.number === s.selected;
    const reason = R.REASONS[m.archive.reason];
    return `<div class="r2-opt r2f-opt" role="option" id="r2d-opt-${m.number}" data-select="${m.number}" aria-labelledby="r2f-name-${m.number}" aria-describedby="r2f-reason-${m.number} r2f-explanation-${m.number}" aria-selected="${on}" tabindex="${on ? 0 : -1}">
      <span class="r2f-reason" id="r2f-reason-${m.number}"><span data-icon="${reason.icon}" aria-hidden="true"></span>${reason.label}</span>
      <span class="r2f-explanation" id="r2f-explanation-${m.number}">${reason.rule}</span>
      <span class="r2f-identity">${R.ring(m)}<span class="t" id="r2f-name-${m.number}"><span class="num">#${m.number}</span> ${esc(m.title)}</span><time datetime="${m.archive.since}">${R.ago(m.archive.since)}</time></span>
    </div>`;
  }

  function detail(m) {
    const r = R.REASONS[m.archive.reason];
    return `<aside class="r2d-detail" aria-labelledby="r2d-detail-title">
      <a class="r2e-preview" href="#map-${m.number}" data-open="${m.number}" aria-label="${esc(`Open map #${m.number}: ${m.title}. It stays archived.`)}">
      <div class="r2d-detail-graph" aria-hidden="true">${R.graphSvg(m)}</div>
      <div class="r2d-detail-body r2e-overview">
        <p class="eyebrow">Map · #${m.number}${m.open ? '' : ' · closed'}</p>
        <h2 id="r2d-detail-title">${esc(m.title)}</h2>
        <p class="dest">${esc(m.destination)}</p>
        ${R.countsHtml(m)}
        <span class="r2e-open">Open map<span data-icon="arrow" aria-hidden="true"></span></span>
      </div>
      </a>
      <div class="r2d-detail-body r2e-facts">
        <dl class="r2d-facts">
          <div><dt>Why it's here</dt><dd><span class="r2-reason"><span data-icon="${r.icon}" aria-hidden="true"></span>${r.label}</span>${esc(r.why(m))} Archived <time datetime="${m.archive.since}">${R.day(m.archive.since)}</time>.</dd></div>
          <div><dt>Returns</dt><dd>${esc(r.returns)}</dd></div>
          <div><dt>While archived</dt><dd><ul>${R.whileArchived(m)}</ul></dd></div>
        </dl>
        ${s.error && s.error.number === m.number ? errorBanner() : ''}
        <div class="r2d-acts">${restoreButton(m, false)}</div>
        <p class="r2d-fine">Opening keeps it archived. Restore puts it back in your active maps until you archive it again${m.open ? '' : '; watching resumes only if the issue reopens'}.</p>
      </div>
    </aside>`;
  }

  function archivedPage() {
    const all = R.archived(s.maps);
    const list = all.filter((m) => R.matches(m, s.query));
    if (!list.some((m) => m.number === s.selected)) s.selected = list[0]?.number ?? null;
    const meta = loading() ? R.bone('220px') : `${all.length} archived for RAbdelrhman · the issues on GitHub are unchanged`;
    const head = `<div class="r2d-page-head"><div class="grow"><a class="r2d-back" href="#" data-view="active"><span data-icon="back" aria-hidden="true"></span>wayfinder-map</a><h1 tabindex="-1">Archived maps</h1><p>${meta}</p></div><label class="search"><span data-icon="lens" aria-hidden="true"></span><span class="sr-only">Filter archived maps</span><input id="r2-search" type="search" placeholder="Filter archived maps" autocomplete="off" value="${esc(s.query)}"></label></div>`;
    // Save errors show beside the map they belong to; only a failed read shows up here.
    const banner = s.error ? '' : errorBanner();
    let body;
    if (loading()) {
      const opt = `<div class="r2-opt" aria-hidden="true"><span></span><span class="t">${R.bone('80%')}</span>${R.bone('50px')}</div>`;
      body = `<div class="r2d-split" role="status" aria-label="Loading archived maps"><div class="r2d-list"><div class="r2d-group"><div class="r2d-group-h"><span></span>${R.bone('120px')}</div>${opt.repeat(4)}</div></div><div class="r2d-detail"><div class="r2d-detail-graph"></div><div class="r2d-detail-body"><p class="eyebrow">${R.bone('90px')}</p><h2>${R.bone('60%')}</h2><p class="dest">${R.bone('90%')}</p><div class="r2d-acts"><span class="wf-bone is-button" style="--w: 120px"></span></div></div></div></div>`;
    } else if (all.length === 0) {
      const kinds = R.REASON_ORDER.map((k) => `<li><span data-icon="${R.REASONS[k].icon}" aria-hidden="true"></span>${R.REASONS[k].label}</li>`).join('');
      body = `<div class="r2d-empty"><span data-icon="archive" aria-hidden="true"></span><h2>No archived maps</h2><p>A map moves here when its issue closes, every ticket is done, or nothing changes for 30 days. You can also archive one from its card. GitHub is never changed.</p><ul class="r2-kinds">${kinds}</ul><button type="button" class="ghost" data-view="active" style="margin-top: 12px">Back to active maps</button></div>`;
    } else if (list.length === 0) {
      body = `<p class="wf-none" role="status">No archived maps match “${esc(s.query)}”.</p>`;
    } else {
      const groups = R.REASON_ORDER.map((k) => {
        const items = list.filter((m) => m.archive.reason === k);
        if (items.length === 0) return '';
        const r = R.REASONS[k];
        return `<div class="r2d-group" role="group" aria-label="${r.label}">${items.map(option).join('')}</div>`;
      }).join('');
      const selected = byNumber(s.selected);
      body = `<div class="r2d-split"><div class="r2d-list"><div class="r2d-listbox" role="listbox" aria-label="Archived maps, grouped by why they are archived">${groups}</div><p class="r2d-hint"><kbd>↑</kbd> <kbd>↓</kbd> browse · <kbd>Enter</kbd> open without restoring</p></div>${selected ? detail(selected) : ''}</div>`;
    }
    return `<div class="sheet"><div class="wf-repo-page">${head}${banner}${body}</div></div>`;
  }

  function mapPage(m) {
    let card = '';
    if (m.archive) {
      const r = R.REASONS[m.archive.reason];
      const paused = m.autoMap ? "it isn't watched and Auto map stays paused" : "it isn't watched";
      card = `<section class="floatbox r2d-float" aria-labelledby="r2d-float-h"><div class="r2d-float-h" id="r2d-float-h"><span data-icon="archive" aria-hidden="true"></span><b>Archived</b><span class="sep" aria-hidden="true">·</span><span class="r2-reason"><span data-icon="${r.icon}" aria-hidden="true"></span>${r.label}</span></div><p>${esc(r.why(m))} Opening it keeps it archived: ${paused}.</p>${s.error ? errorBanner() : ''}<div class="r2d-acts">${restoreButton(m, true)}<button type="button" class="ghost" data-view="${s.from}">${s.from === 'archived' ? 'Archived maps' : 'Active maps'}</button></div></section>`;
    } else if (s.restored === m.number) {
      card = `<section class="floatbox r2d-float" role="status"><div class="r2d-float-h"><span data-icon="check" aria-hidden="true"></span><b>Restored</b></div><p>${m.open ? `Back in your active maps; ${m.autoMap ? 'watching and Auto map resume' : 'watching resumes'}.` : 'Back in your active maps. It stays unwatched until its issue reopens.'}</p><div class="r2d-acts"><button type="button" class="ghost" data-view="active">Active maps</button></div></section>`;
    }
    return `<h1 class="sr-only" tabindex="-1">Map #${m.number}: ${esc(m.title)}${m.archive ? ' (archived)' : ''}</h1><div class="r2d-mapwrap${card ? ' has-card' : ''}">${card}${R.mapBoard(m)}</div>`;
  }

  function archivedTreeRow() {
    const n = R.archived(s.maps).length;
    const on = s.view === 'archived';
    return `<li><a class="row r2-tree-archive${on ? ' is-on' : ''}" href="#" data-view="archived"${on ? ' aria-current="page"' : ''}><span data-icon="archive" aria-hidden="true"></span><span class="grow">Archived maps</span><span class="r2-tree-count">${n}</span></a></li>`;
  }

  function render(focus) {
    const m = s.view === 'map' ? byNumber(s.opened) : null;
    nav.innerHTML = R.sidebar({ maps: s.maps, current: m ? m.number : null, archivedRow: archivedTreeRow() });
    if (m) topbar.innerHTML = R.mapTopbar(m, m.archive ? '<span class="r2-scope-badge"><span data-icon="archive" aria-hidden="true"></span>Archived</span>' : '');
    else topbar.innerHTML = R.repoTopbar(s.view === 'archived' ? 'Archived maps' : '');
    main.innerHTML = m ? mapPage(m) : s.view === 'archived' ? archivedPage() : activePage();
    Kit.fillIcons(document);
    if (s.arrived !== null) {
      main.querySelector(`#r2g-opt-${s.arrived}`)?.classList.add('is-arrived');
      s.arrived = null;
    }
    if (focus) {
      const el = typeof focus === 'string' ? document.querySelector(focus) : focus();
      el?.focus();
      if (el?.id === 'r2-search') el.setSelectionRange(el.value.length, el.value.length);
    }
  }

  function go(view, focus, selected) {
    s.view = view;
    s.query = '';
    s.error = null;
    s.restored = null;
    if (selected !== undefined) s.selected = selected;
    window.scrollTo?.(0, 0);
    render(focus ?? 'h1');
  }

  function open(n) {
    if (s.view !== 'map') s.from = s.view;
    s.opened = n;
    s.view = 'map';
    s.error = null;
    s.restored = null;
    window.scrollTo?.(0, 0);
    render('h1');
  }

  function select(n, focus = true) {
    if (s.view === 'active') s.activeSelected = n;
    else s.selected = n;
    s.error = null;
    render(focus ? `#${s.view === 'active' ? 'r2g' : 'r2d'}-opt-${n}` : null);
    if (focus && window.matchMedia?.('(max-width: 820px)').matches) main.querySelector('.r2d-detail')?.scrollIntoView({ block: 'start' });
  }

  function archive(n) {
    if (s.pending !== null) return;
    const before = [...main.querySelectorAll('[role="option"]')].map((el) => Number(el.dataset.select));
    const index = before.indexOf(n);
    s.pending = n;
    s.error = null;
    render(`[data-archive="${n}"]`);
    R.save(s.fixture === 'save-error', (ok) => {
      if (!ok) {
        s.pending = null;
        s.error = { kind: 'archive', number: n };
        return render('[data-retry]');
      }
      R.leave(main.querySelector(`#r2g-opt-${n}`), () => {
        byNumber(n).archive = { reason: 'manual', since: R.NOW_ISO };
        s.pending = null;
        const remaining = before.filter((number) => number !== n);
        s.activeSelected = remaining[Math.min(index, remaining.length - 1)] ?? null;
        render(() => {
          return main.querySelector('[role="option"][aria-selected="true"]') ?? main.querySelector('.r2d-door');
        });
        R.toast(`Archived #${n}. GitHub is unchanged.`, { label: 'View', run: () => go('archived', `#r2d-opt-${n}`, n) });
      });
    });
  }

  function restore(n) {
    if (s.pending !== null) return;
    const onMap = s.view === 'map';
    const order = R.archived(s.maps).filter((m) => R.matches(m, s.query));
    const grouped = R.REASON_ORDER.flatMap((k) => order.filter((m) => m.archive.reason === k)).map((m) => m.number);
    const index = grouped.indexOf(n);
    s.pending = n;
    s.error = null;
    render(`[data-restore="${n}"]`);
    R.save(s.fixture === 'save-error', (ok) => {
      if (!ok) {
        s.pending = null;
        s.error = { kind: 'restore', number: n };
        return render('[data-retry]');
      }
      R.leave(onMap ? null : main.querySelector(`#r2d-opt-${n}`), () => {
        const m = byNumber(n);
        m.archive = null;
        s.pending = null;
        if (onMap) {
          s.restored = n;
          render(() => main.querySelector('.r2d-float .ghost'));
          return;
        }
        const rest = grouped.filter((x) => x !== n);
        s.selected = rest[Math.min(index, rest.length - 1)] ?? null;
        render(() => (s.selected ? document.getElementById(`r2d-opt-${s.selected}`) : main.querySelector('h1')));
        R.toast(R.restoredMessage(m), { label: 'Show', run: () => { s.arrived = n; s.activeSelected = n; go('active', `#r2g-opt-${n}`); } });
      });
    });
  }

  function retry() {
    const error = s.error;
    s.error = null;
    if (s.fixture === 'save-error' || s.fixture === 'error') {
      s.fixture = 'normal';
      document.getElementById('fixture').value = 'normal';
    }
    if (error?.kind === 'archive') return archive(error.number);
    if (error?.kind === 'restore') return restore(error.number);
    render('h1');
  }

  document.addEventListener('click', (event) => {
    const el = event.target.closest('[data-view],[data-open],[data-archive],[data-restore],[data-select],[data-retry]');
    if (!el) return;
    event.preventDefault();
    if (el.getAttribute('aria-disabled') === 'true') return;
    const d = el.dataset;
    if (d.view) go(d.view, d.view === 'archived' && s.view === 'map' && s.opened ? `#r2d-opt-${s.opened}` : 'h1', d.view === 'archived' && s.view === 'map' ? s.opened : undefined);
    else if (d.open) open(Number(d.open));
    else if (d.archive) archive(Number(d.archive));
    else if (d.restore) restore(Number(d.restore));
    else if (d.select) select(Number(d.select));
    else if ('retry' in d) retry();
  });

  main.addEventListener('keydown', (event) => {
    const opt = event.target.closest('[role="option"]');
    if (!opt) return;
    const all = [...main.querySelectorAll('[role="option"]')].map((el) => Number(el.dataset.select));
    const i = all.indexOf(Number(opt.dataset.select));
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: all.length - 1 }[event.key];
    if (event.key === 'Enter') {
      event.preventDefault();
      open(all[i]);
    } else if (to !== undefined) {
      event.preventDefault();
      const n = all[Math.max(0, Math.min(all.length - 1, to))];
      if (s.view === 'active') s.activeSelected = n;
      else s.selected = n;
      render(`#${s.view === 'active' ? 'r2g' : 'r2d'}-opt-${n}`);
    }
  });

  main.addEventListener('input', (event) => {
    if (event.target.id !== 'r2-search') return;
    s.query = event.target.value;
    render('#r2-search');
  });

  R.tools((fixture) => { const view = s.view === 'map' ? 'archived' : s.view; reset(fixture); s.view = view; render(); }, () => { reset(); render('h1'); });
  render();
})();
