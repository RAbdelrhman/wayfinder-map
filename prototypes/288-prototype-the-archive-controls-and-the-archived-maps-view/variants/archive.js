/* In-memory fixtures only. No production calls or saved preferences. */
(() => {
  const initial = [
    { number: 236, title: 'Help new users understand Wayfinder', description: 'Learn the journey from a goal to a map and a ready-ticket hand-off.', progress: '12 of 16 tickets done', reason: null, date: '' },
    { number: 210, title: 'Review canvas options together', description: 'Make visual decisions together before building them.', progress: '3 of 8 tickets done', reason: null, date: '' },
    { number: 121, title: 'Watch maps and stay up to date', description: 'See changes as tickets move toward the destination.', progress: '18 of 18 tickets done', reason: 'Closed', date: 'Oct 12, 2026' },
    { number: 208, title: 'Bring notifications into one inbox', description: 'One place for the work that needs your attention.', progress: '9 of 9 tickets done', reason: 'Finished', date: 'Oct 10, 2026' },
    { number: 165, title: 'Explore parallel hand-offs', description: 'Find a useful rhythm for starting work on ready tickets.', progress: '4 of 10 tickets done', reason: 'Idle 30 days', date: 'Oct 8, 2026' },
    { number: 134, title: 'Improve repository navigation', description: 'Keep repositories and their maps easy to find.', progress: '6 of 11 tickets done', reason: 'Archived by you', date: 'Oct 6, 2026' },
  ];
  let maps = initial.map((map) => ({ ...map }));
  let view = 'active';
  let opened = null;
  let query = '';
  let fixture = 'normal';
  let saveError = false;
  const option = document.body.dataset.option;
  const root = document.getElementById('main');
  const esc = Kit.esc;
  const button = (action, text, map, primary = false) => `<button class="${primary ? 'primary' : 'ghost'}" data-action="${action}"${map ? ` data-number="${map.number}" aria-label="${text} map #${map.number}: ${esc(map.title)}"` : ''}>${text}</button>`;
  const archived = () => fixture === 'empty' ? [] : maps.filter((map) => map.reason);
  const reason = (map) => `<span class="reason">${esc(map.reason)}</span><span class="meta">Archived ${esc(map.date)}</span>`;
  const error = () => saveError ? `<div class="error" role="alert"><p>Couldn't save your archive preference. This map hasn't moved.</p>${button('retry-save', 'Try again')}</div>` : '';
  function render(focus) {
    const isArchive = view === 'archive';
    const map = maps.find((item) => item.number === opened);
    if (view === 'map' && map) {
      root.innerHTML = `${button('back', map.reason ? 'Back to Archived maps' : 'Back to active maps')}<p class="eyebrow">RAbdelrhman / wayfinder-map · #${map.number}</p><h1 tabindex="-1">${esc(map.title)}</h1>${error()}${map.reason ? `<section class="notice" aria-label="Archive status"><div class="grow"><strong>Archived · ${esc(map.reason)}</strong><p>Opening this map keeps it archived. Restore returns it to your active maps.</p></div>${button('restore', 'Restore', map)}</section>` : `<div class="toolbar"><span>${esc(map.progress)}</span>${button('archive-map', 'Archive', map)}</div>`}<p class="lede">${esc(map.description)}</p><h2>Tickets</h2><div class="tickets">${['Describe the destination', 'Build the agreed flow', 'Verify the journey'].map((title, i) => `<article class="ticket"><span class="meta">#${i + 1} · ${map.reason === 'Finished' || map.reason === 'Closed' ? 'Done' : 'Ready'}</span><h3>${title}</h3><span class="meta">Task</span></article>`).join('')}</div><p class="meta">Prototype ticket preview. Opening did not change this map's archive state.</p>`;
    } else {
      const source = isArchive ? archived() : maps.filter((item) => !item.reason);
      const visible = source.filter((item) => `#${item.number} ${item.title}`.toLowerCase().includes(query.toLowerCase()));
      root.innerHTML = `${option === 'B' && isArchive ? button('active', 'Back to active maps') : ''}<p class="eyebrow">RAbdelrhman / wayfinder-map</p><h1 tabindex="-1">${isArchive ? 'Archived maps' : 'Your maps'}</h1><p class="lede">${isArchive ? 'Archived for your account. Open a map to view it, or restore it to your active maps. GitHub is unchanged.' : 'Your destinations and the tickets that get you there.'}</p><div class="toolbar">${option === 'A' ? `<nav class="switch" aria-label="Map lists"><button class="ghost" data-action="active" aria-pressed="${!isArchive}">Active <span class="meta">${maps.filter((item) => !item.reason).length}</span></button><button class="ghost" data-action="archive" aria-pressed="${isArchive}">Archived maps <span class="meta">${archived().length}</span></button></nav>` : isArchive ? '<span class="meta">Most recently archived first</span>' : button('archive', `Archived maps (${archived().length})`)}<input id="search" type="search" aria-label="Search ${isArchive ? 'archived' : 'active'} maps" placeholder="Search ${isArchive ? 'archived' : 'active'} maps" value="${esc(query)}"></div>${error()}${fixture === 'error' ? `<div class="error" role="alert"><p>Couldn't refresh your maps. Showing the last available list.</p>${button('retry', 'Try again')}</div>` : ''}${fixture === 'loading' ? '<p role="status" aria-busy="true">Loading maps…</p>' : visible.length ? isArchive && option === 'A' ? `<ul class="archive-list">${visible.map((item) => `<li class="archive-row"><div><h2><span class="num">#${item.number}</span> ${esc(item.title)}</h2>${reason(item)}</div><div class="actions">${button('open', 'Open', item, true)}${button('restore', 'Restore', item)}</div></li>`).join('')}</ul>` : `<div class="${isArchive ? 'archive-grid' : 'maps'}">${visible.map((item) => `<article class="map-card"><span class="eyebrow">Map · #${item.number}</span><h2>${esc(item.title)}</h2><p>${esc(item.description)}</p>${isArchive ? `<p>${reason(item)}</p>` : ''}<footer><span class="meta grow">${esc(item.progress)}</span>${button(isArchive ? 'restore' : 'archive-map', isArchive ? 'Restore' : 'Archive', item)}${button('open', 'Open', item, true)}</footer></article>`).join('')}</div>` : `<section class="empty"><h2>${query ? 'No maps match your search' : isArchive ? 'No archived maps' : 'No active maps'}</h2><p>${query ? 'Try a different map name or number.' : isArchive ? 'Maps you archive and maps archived automatically will appear here.' : 'Your maps are in Archived maps. Open one there, or restore it.'}</p></section>`}`;
    }
    if (focus) root.querySelector(focus)?.focus();
  }
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target || target.disabled) return;
    const action = target.dataset.action;
    const map = maps.find((item) => item.number === Number(target.dataset.number));
    if (action === 'active' || action === 'archive' || action === 'back') {
      view = action === 'back' ? maps.find((item) => item.number === opened)?.reason ? 'archive' : 'active' : action;
      query = ''; saveError = false; render('h1');
    } else if (action === 'open' && map) {
      opened = map.number; view = 'map'; render('h1');
    } else if ((action === 'archive-map' || action === 'restore') && map) {
      if (fixture === 'save-error') { saveError = true; render('[data-action="retry-save"]'); return; }
      map.reason = action === 'archive-map' ? 'Archived by you' : null;
      map.date = action === 'archive-map' ? 'Oct 14, 2026' : '';
      saveError = false;
      Kit.toast(action === 'archive-map' ? `Archived #${map.number} for you. GitHub is unchanged.` : `Restored #${map.number} to your active maps.`);
      render(view === 'map' ? 'h1' : '[data-action="archive"]');
    } else if (action === 'retry' || action === 'retry-save') {
      fixture = 'normal'; saveError = false; document.getElementById('fixture').value = 'normal'; render('h1');
    }
  });
  root.addEventListener('input', (event) => {
    if (event.target.id !== 'search') return;
    query = event.target.value;
    render('#search');
  });
  document.getElementById('fixture').addEventListener('change', (event) => { fixture = event.target.value; saveError = false; render(); });
  document.getElementById('reset').addEventListener('click', () => { maps = initial.map((map) => ({ ...map })); view = 'active'; opened = null; query = ''; fixture = 'normal'; saveError = false; document.getElementById('fixture').value = 'normal'; render('h1'); });
  render();
})();
