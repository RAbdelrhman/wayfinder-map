/*
  Option C: one list, two views. The repository page keeps its map cards; Archive sits where
  Settle sits today. A two-way switch replaces the collapsed Settled section: Archived maps is
  the same page showing a list where every row says why the map is there and how it comes back.
  In-memory fixtures only.
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
      fixture, view: 'active', opened: null, from: 'active', query: '', reason: 'all', pending: null, error: null, restored: null, bump: false,
    };
  }
  reset();

  const byNumber = (n) => s.maps.find((m) => m.number === n);
  const loading = () => s.fixture === 'loading';

  function archiveButton(m) {
    const busy = s.pending === m.number;
    return `<button type="button" class="ghost" data-archive="${m.number}" aria-label="${esc(`Archive map #${m.number}: ${m.title}`)}" title="Move to Archived maps for your account. The issue on GitHub is not changed."${busy ? ' aria-disabled="true" aria-busy="true"' : ''}>${busy ? '<span class="r2-spin" aria-hidden="true"></span>Archiving…' : '<span data-icon="archive" aria-hidden="true"></span>Archive'}</button>`;
  }

  function restoreButton(m, primary = false) {
    const busy = s.pending === m.number;
    return `<button type="button" class="${primary ? 'primary' : 'ghost'}" data-restore="${m.number}" aria-label="${esc(`Restore map #${m.number}: ${m.title}`)}" title="${m.open ? `Return to your active maps until you archive it again. ${m.autoMap ? 'Watching and Auto map resume' : 'Watching resumes'}.` : 'Return to your active maps until you archive it again. Watching resumes only if the issue reopens.'}"${busy ? ' aria-disabled="true" aria-busy="true"' : ''}>${busy ? '<span class="r2-spin" aria-hidden="true"></span>Restoring…' : '<span data-icon="restore" aria-hidden="true"></span>Restore'}</button>`;
  }

  function errorBanner() {
    if (s.error) {
      const m = byNumber(s.error.number);
      const what = s.error.kind === 'archive' ? `Couldn't archive #${m.number}. It's still in your active maps.` : `Couldn't restore #${m.number}. It's still archived.`;
      return `<div class="r2-alert" role="alert"><span data-icon="alert" aria-hidden="true"></span><span class="grow"><b>${esc(what)}</b> Your archive choices couldn't be saved on this computer.</span><button type="button" class="ghost" data-retry>Try again</button></div>`;
    }
    if (s.fixture === 'error') {
      return `<div class="r2-alert is-stale" role="alert"><span data-icon="alert" aria-hidden="true"></span><span class="grow"><b>Couldn't refresh from GitHub.</b> Showing your maps from 2 minutes ago; nothing has moved between lists.</span><button type="button" class="ghost" data-retry><span data-icon="refresh" aria-hidden="true"></span>Try again</button></div>`;
    }
    return '';
  }

  function tabs(nActive, nArchived) {
    const tab = (view, label, n, icon) => {
      const on = s.view === view;
      return `<button type="button" role="tab" class="seg${on ? ' is-on' : ''}" id="r2c-tab-${view}" data-view="${view}" aria-selected="${on}" aria-controls="r2c-panel" tabindex="${on ? 0 : -1}">${icon ? `<span data-icon="${icon}" aria-hidden="true"></span>` : ''}${label}<span class="badge${view === 'archived' && s.bump ? ' is-bumped' : ''}">${loading() ? '–' : n}</span></button>`;
    };
    return `<div class="segmented r2c-tabs" role="tablist" aria-label="Map lists">${tab('active', 'Active maps', nActive)}${tab('archived', 'Archived maps', nArchived, 'archive')}</div>`;
  }

  function activePanel(list, total) {
    if (loading()) return `<div class="wf-maps" role="status" aria-label="Loading active maps">${R.mapCardSkeleton().repeat(2)}</div>`;
    if (total === 0) {
      return `<div class="r2c-empty"><span data-icon="archive" aria-hidden="true"></span><h2>Every map here is archived</h2><p>Open one from Archived maps to look at it, or restore it to bring it back here.</p><button type="button" class="ghost" data-view="archived">See Archived maps</button></div>`;
    }
    if (list.length === 0) return `<p class="wf-none" role="status">No active maps match “${esc(s.query)}”.</p>`;
    return `<div class="wf-maps">${list.map((m) => R.mapCard(m, archiveButton)).join('')}</div>`;
  }

  function row(m) {
    const r = R.REASONS[m.archive.reason];
    const chip = m.running > 0 ? `<span class="chip" style="--accent: var(--state-frontier)"><span data-icon="bolt" aria-hidden="true"></span>${m.running} running</span>` : '';
    return `<li class="r2-row" data-row="${m.number}">
      <div class="r2c-thumb" aria-hidden="true">${R.graphSvg(m)}</div>
      <div class="r2c-main">
        <h3><span class="num">#${m.number}</span> ${esc(m.title)}</h3>
        <p class="r2c-why"><span class="r2-reason"><span data-icon="${r.icon}" aria-hidden="true"></span>${r.label}</span><span>${esc(r.why(m))}</span><span class="r2c-when">Archived <time datetime="${m.archive.since}">${R.ago(m.archive.since)}</time></span></p>
        <p class="r2c-back"><span data-icon="${m.archive.reason === 'manual' ? 'person' : 'refresh'}" aria-hidden="true"></span>${esc(r.back)}</p>
      </div>
      <div class="r2c-acts">${chip}${restoreButton(m)}<button type="button" class="ghost" data-open="${m.number}" aria-label="${esc(`Open map #${m.number}: ${m.title}. It stays archived.`)}">Open<span data-icon="arrow" aria-hidden="true"></span></button></div>
    </li>`;
  }

  function archivedPanel(all) {
    const intro = `<p class="r2c-intro"><span data-icon="info" aria-hidden="true"></span><span><b>Archived for your account only.</b> The issues on GitHub are unchanged. Archived maps aren't watched and Auto map pauses; hand-offs already running keep going.</span></p>`;
    if (loading()) {
      const skeleton = `<li class="r2-row" aria-hidden="true"><div class="r2c-thumb"></div><div class="r2c-main"><h3>${R.bone('55%')}</h3><p class="r2c-why">${R.bone('80%')}</p><p class="r2c-back">${R.bone('45%')}</p></div><div class="r2c-acts"><span class="wf-bone is-button" style="--w: 84px"></span></div></li>`;
      return `${intro}<ul class="r2c-ledger" role="status" aria-label="Loading archived maps">${skeleton.repeat(3)}</ul>`;
    }
    if (all.length === 0) {
      const kinds = R.REASON_ORDER.map((k) => `<li><span data-icon="${R.REASONS[k].icon}" aria-hidden="true"></span>${R.REASONS[k].label}</li>`).join('');
      return `<div class="r2c-empty"><span data-icon="archive" aria-hidden="true"></span><h2>No archived maps</h2><p>A map moves here when its issue closes, every ticket is done, or nothing changes for 30 days. You can also archive one yourself. GitHub is never changed.</p><ul class="r2-kinds">${kinds}</ul></div>`;
    }
    const counts = {};
    for (const m of all) counts[m.archive.reason] = (counts[m.archive.reason] ?? 0) + 1;
    if (s.reason !== 'all' && !counts[s.reason]) s.reason = 'all';
    const filter = (key, label, n, icon) => `<button type="button" class="r2c-filter" data-reason="${key}" aria-pressed="${s.reason === key}">${icon ? `<span data-icon="${icon}" aria-hidden="true"></span>` : ''}${label} <span class="n">${n}</span></button>`;
    const filters = `<div class="r2c-reasons" role="group" aria-label="Show archived maps by reason">${filter('all', 'All', all.length)}${R.REASON_ORDER.filter((k) => counts[k]).map((k) => filter(k, R.REASONS[k].label, counts[k], R.REASONS[k].icon)).join('')}</div>`;
    const list = all.filter((m) => (s.reason === 'all' || m.archive.reason === s.reason) && R.matches(m, s.query));
    const body = list.length === 0 ? `<p class="wf-none" role="status">No archived maps match “${esc(s.query)}”.</p>` : `<ul class="r2c-ledger" aria-label="Archived maps, most recently archived first">${list.map(row).join('')}</ul>`;
    return intro + filters + body;
  }

  function repoPage() {
    const active = R.active(s.maps);
    const archived = R.archived(s.maps);
    const onArchived = s.view === 'archived';
    const shownActive = active.filter((m) => R.matches(m, s.query));
    const meta = loading() ? R.bone('170px') : `${active.length} active · ${archived.length} archived`;
    return `<div class="sheet"><div class="wf-repo-page">
      <header class="wf-head">${R.repoBadge()}<div class="grow"><h1 tabindex="-1">wayfinder-map</h1><p>RAbdelrhman/wayfinder-map · ${meta}</p></div></header>
      ${errorBanner()}
      <div class="wf-filters">${tabs(active.length, archived.length)}<label class="search"><span data-icon="lens" aria-hidden="true"></span><span class="sr-only">Filter ${onArchived ? 'archived' : 'active'} maps</span><input id="r2-search" type="search" placeholder="Filter ${onArchived ? 'archived' : 'active'} maps" autocomplete="off" value="${esc(s.query)}"></label></div>
      <section id="r2c-panel" role="tabpanel" aria-labelledby="r2c-tab-${onArchived ? 'archived' : 'active'}">${onArchived ? archivedPanel(archived) : activePanel(shownActive, active.length)}</section>
    </div></div>`;
  }

  function mapPage(m) {
    let strip = '';
    if (m.archive) {
      const r = R.REASONS[m.archive.reason];
      strip = `<section class="r2c-strip" aria-label="Archive status"><span data-icon="archive" aria-hidden="true"></span><p class="grow"><span class="r2-reason"><span data-icon="${r.icon}" aria-hidden="true"></span>Archived · ${r.label}</span>${esc(r.why(m))} Opening it keeps it archived, so it isn't watched${m.autoMap ? ' and Auto map stays paused' : ''}.</p><div class="acts"><button type="button" class="ghost" data-view="${s.from}"><span data-icon="back" aria-hidden="true"></span>${s.from === 'archived' ? 'Archived maps' : 'Active maps'}</button>${restoreButton(m, true)}</div></section>`;
    } else if (s.restored === m.number) {
      strip = `<section class="r2c-strip is-restored" role="status"><span data-icon="check" aria-hidden="true"></span><p class="grow"><b>Restored.</b> ${m.open ? `Back in your active maps; ${m.autoMap ? 'watching and Auto map resume' : 'watching resumes'}.` : 'Back in your active maps. It stays unwatched until its issue reopens.'}</p><div class="acts"><button type="button" class="ghost" data-view="active"><span data-icon="back" aria-hidden="true"></span>Active maps</button></div></section>`;
    }
    const error = errorBanner();
    return `<h1 class="sr-only" tabindex="-1">Map #${m.number}: ${esc(m.title)}${m.archive ? ' (archived)' : ''}</h1>${strip}${error ? `<div style="padding: 12px 18px 0">${error}</div>` : ''}${R.mapBoard(m)}`;
  }

  function render(focus) {
    const m = s.view === 'map' ? byNumber(s.opened) : null;
    nav.innerHTML = R.sidebar({ maps: s.maps, current: m ? m.number : null });
    topbar.innerHTML = m ? R.mapTopbar(m, m.archive ? '<span class="r2-scope-badge"><span data-icon="archive" aria-hidden="true"></span>Archived</span>' : '') : R.repoTopbar();
    main.innerHTML = m ? mapPage(m) : repoPage();
    Kit.fillIcons(document);
    s.bump = false;
    if (focus) {
      const el = typeof focus === 'string' ? document.querySelector(focus) : focus();
      el?.focus();
      if (el?.id === 'r2-search') el.setSelectionRange(el.value.length, el.value.length);
    }
  }

  function go(view, focus) {
    s.view = view;
    s.query = '';
    s.error = null;
    s.restored = null;
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

  function archive(n) {
    if (s.pending !== null) return;
    const before = [...main.querySelectorAll('[data-archive]')].map((el) => Number(el.dataset.archive));
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
      R.leave(main.querySelector(`[data-map-card="${n}"]`), () => {
        const m = byNumber(n);
        m.archive = { reason: 'manual', since: R.NOW_ISO };
        s.pending = null;
        s.bump = true;
        render(() => {
          const left = [...main.querySelectorAll('[data-archive]')];
          return left[Math.min(index, left.length - 1)] ?? document.getElementById('r2c-tab-archived');
        });
        R.toast(`Archived #${n} for you. GitHub is unchanged.`, { label: 'Restore', run: () => restore(n) });
      });
    });
  }

  function restore(n) {
    if (s.pending !== null) return;
    const onMap = s.view === 'map';
    const before = [...main.querySelectorAll('[data-restore]')].map((el) => Number(el.dataset.restore));
    const index = before.indexOf(n);
    s.pending = n;
    s.error = null;
    render(`[data-restore="${n}"]`);
    R.save(s.fixture === 'save-error', (ok) => {
      if (!ok) {
        s.pending = null;
        s.error = { kind: 'restore', number: n };
        return render('[data-retry]');
      }
      R.leave(onMap ? null : main.querySelector(`[data-row="${n}"]`), () => {
        const m = byNumber(n);
        m.archive = null;
        s.pending = null;
        if (onMap) s.restored = n;
        render(() => {
          if (onMap) return document.querySelector('.r2c-strip.is-restored .ghost');
          const left = [...main.querySelectorAll('[data-restore]')];
          return left[Math.min(Math.max(index, 0), left.length - 1)] ?? document.getElementById('r2c-tab-active');
        });
        if (!onMap) R.toast(R.restoredMessage(m), s.view === 'archived' ? { label: 'Show', run: () => go('active', () => main.querySelector(`[data-map-card="${n}"] h2 a`)) } : null);
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
    const el = event.target.closest('[data-view],[data-open],[data-archive],[data-restore],[data-reason],[data-retry]');
    if (!el) {
      const rowEl = event.target.closest('.r2-row');
      if (rowEl && !event.target.closest('button, a')) open(Number(rowEl.dataset.row));
      return;
    }
    event.preventDefault();
    if (el.getAttribute('aria-disabled') === 'true') return;
    const d = el.dataset;
    if (d.view) {
      const fromTab = el.getAttribute('role') === 'tab';
      if (fromTab && s.view === d.view) return;
      go(d.view, fromTab ? `#r2c-tab-${d.view}` : 'h1');
    } else if (d.open) open(Number(d.open));
    else if (d.archive) archive(Number(d.archive));
    else if (d.restore) restore(Number(d.restore));
    else if (d.reason) {
      s.reason = d.reason;
      render(`[data-reason="${d.reason}"]`);
    } else if ('retry' in d) retry();
  });

  main.addEventListener('keydown', (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' || (event.key !== 'End' && tab.dataset.view === 'archived') ? 'active' : 'archived';
    if (next !== s.view) go(next, `#r2c-tab-${next}`);
  });

  main.addEventListener('input', (event) => {
    if (event.target.id !== 'r2-search') return;
    s.query = event.target.value;
    render('#r2-search');
  });

  R.tools((fixture) => { const view = s.view === 'map' ? 'active' : s.view; reset(fixture); s.view = view; render(); }, () => { reset(); render('h1'); });
  render();
})();
