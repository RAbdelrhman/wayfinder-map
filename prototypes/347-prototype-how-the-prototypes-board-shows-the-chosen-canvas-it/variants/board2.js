/*
  #347 Round 2: the four Round 1 directions (A2–D2) made interactive and run against eight kinds of choice
  (board2-data.js). ?o=A|B|C|D picks the direction; ?case=<ticket> starts on one card.
  Everything that would leave the board says where it would open, through Kit's data-to toast.
  State lives in this page only (no storage), so a reload starts over.
*/
(function () {
  const q = new URLSearchParams(location.search);
  const option = (q.get('o') || 'A').toUpperCase();
  const esc = Kit.esc;
  const cards = window.BOARD2.cards;

  Object.assign(Kit.icons, {
    check: '<path d="M20 6 9 17l-5-5"/>',
    play: '<path d="M7 4v16l13-8z" fill="currentColor"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.9-3.8L3 9.5"/><path d="M3 4v5.5h5.5"/><path d="M4 13a8 8 0 0 0 14.9 3.8L21 14.5"/><path d="M21 20v-5.5h-5.5"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7"/><path d="M12 17h.01"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/>',
    beaker: '<path d="M9.5 3h5"/><path d="M10.8 3v6.4L5.5 17.9A2 2 0 0 0 7.2 21h9.6a2 2 0 0 0 1.7-3.1L13.2 9.4V3"/><path d="M7.8 15h8.4"/>',
  });

  /* ---------- Reading a card ---------- */
  const roundText = (r) => (typeof r === 'number' ? `Round ${r}` : r || '');
  const shotFor = (name) => `../assets/shots/${name}.jpg`;

  // Every item, with its round and page title attached, keyed by its canvas link.
  function index(card) {
    if (card._index) return card._index;
    const list = [];
    card.rounds.forEach((r, ri) => r.pages.forEach((p) => p.items.forEach((i) => list.push({ ...i, round: r.round, ri, pageTitle: p.title }))));
    const byKey = new Map(list.map((i) => [i.key, i]));
    card.also.forEach((a) => { if (!byKey.has(a.key)) byKey.set(a.key, { ...a, pageTitle: pageTitle(card, a.page), isAlso: true }); });
    card._index = { list, byKey };
    return card._index;
  }
  function pageTitle(card, page) {
    for (const r of card.rounds) for (const p of r.pages) if (p.page === page) return p.title;
    return page;
  }
  const get = (card, key) => index(card).byKey.get(key);
  const picks = (card) => card.picks.map((p) => ({ ...get(card, p.key), q: p.q }));
  const isPicked = (card, key) => card.picks.some((p) => p.key === key);
  const children = (card, key) => index(card).list.filter((i) => (i.from || []).includes(key));
  const where = (card, i) => `the #${card.ticket} canvas at ${[roundText(i.round), i.pageTitle].filter(Boolean).join(' · ')} › ${i.id}`;
  const roundOfKey = (card, key) => get(card, key).ri;

  function lineage(card, key) {
    const seen = new Set([key]);
    const up = (k) => (get(card, k)?.from || []).forEach((f) => { if (!seen.has(f)) { seen.add(f); up(f); } });
    const down = (k) => children(card, k).forEach((c) => { if (!seen.has(c.key)) { seen.add(c.key); down(c.key); } });
    up(key); down(key);
    return seen;
  }

  // What happened to an item, in words, from the canvas's own record.
  function outcome(card, i) {
    if (isPicked(card, i.key)) return { text: 'Chosen', cls: 'is-chosen' };
    const into = children(card, i.key).map((c) => c.id);
    const intoText = into.length ? ` into ${into.join(', ')}` : '';
    if (i.disp === 'keep') return { text: `Kept${intoText}`, cls: 'is-kept' };
    if (i.disp === 'change') return { text: `Changed${intoText}`, cls: '' };
    if (i.disp === 'combine') return { text: `Combined${intoText}`, cls: '' };
    if (i.disp === 'not') return { text: 'Not chosen', cls: '' };
    if (card.state === 'decided' || card.state === 'unrecorded') return { text: 'No outcome recorded', cls: 'is-none' };
    return { text: 'Open', cls: 'is-none' };
  }

  /* ---------- Page state: one object, re-rendered on every change ---------- */
  const S = { show: q.get('case') || 'all', hero: {}, earlier: {}, q: {}, round: {}, page: {}, more: {}, withAlso: {}, dFilter: 'all', dOpen: {}, dStep: {} };

  /* ---------- Shared pieces ---------- */
  function frame(i, extra) {
    if (!i.shot) return `<span class="wf-frame p-shot p-noshot${extra || ''}"><span class="decision-variant-fallback">No picture on the canvas</span><span class="tag">${esc(i.id)}</span></span>`;
    return `<span class="wf-frame p-shot${i.phone ? ' is-phone' : ''}${extra || ''}"><img class="decision-variant-image" src="${shotFor(i.shot)}" alt="" /><span class="tag">${esc(i.id)}</span></span>`;
  }
  function chip(card) {
    const ps = picks(card);
    if (card.state === 'decided') {
      const text = ps.length > 1 ? `${ps.length} choices` : `Chosen ${ps[0].id} · ${roundText(ps[0].round)}`;
      return `<span class="chip" style="--accent: var(--state-frontier)"><span data-icon="check" aria-hidden="true"></span>${esc(text)}</span>`;
    }
    if (card.state === 'unrecorded') return '<span class="chip p-chip-unknown" style="--accent: var(--text-muted)"><span data-icon="help" aria-hidden="true"></span>Closed · no pick recorded</span>';
    if (card.state === 'waiting') return '<span class="chip" style="--accent: var(--state-claimed)"><span data-icon="hand" aria-hidden="true"></span>Waiting on your pick</span>';
    return '<span class="chip" style="--accent: var(--state-blocked)"><span data-icon="refresh" aria-hidden="true"></span>Being built</span>';
  }
  const accent = (card) => ({ decided: '--state-frontier', unrecorded: '--text-muted', waiting: '--state-claimed', building: '--state-blocked' })[card.state];
  const canvasButton = (card, label) => `<button type="button" class="ghost" data-to="the #${card.ticket} canvas on its first page"><span data-icon="play" aria-hidden="true"></span>${esc(label || 'Canvas')}</button>`;
  function head(card, actions) {
    return `<div class="h">${chip(card)}<button type="button" class="wf-proto-title" data-to="#${card.ticket} on the map">#${card.ticket} ${esc(card.title)}</button><time class="when">${esc(card.date)}</time><span class="acts">${actions}</span></div>`;
  }
  const kindTag = (card) => `<span class="p-case" title="Prototype label, not part of the design">${esc(card.kind)} · map #${card.map}</span>`;
  function section(card, inner, extraCls) {
    const waiting = card.state === 'waiting' ? ' is-waiting' : '';
    return `<section class="wf-node wf-proto p2-card is-${card.state}${waiting}${extraCls || ''}" data-card="${card.ticket}" style="--accent: var(${accent(card)})">${kindTag(card)}${inner}</section>`;
  }
  const varLink = (card, i, cls, lbl, extra) =>
    `<a class="wf-var${cls || ''}" href="#" data-to="${esc(where(card, i))}" data-key="${esc(i.key)}" data-fkey="${card.ticket}:${esc(i.key)}">${frame(i, isPicked(card, i.key) ? ' is-picked' : '')}<span class="lbl">${isPicked(card, i.key) ? '<span data-icon="check" aria-hidden="true"></span>' : ''}${esc(lbl || `${i.id} · ${i.name}`)}</span>${extra || ''}</a>`;
  const disp = (card, i) => { const o = outcome(card, i); return `<span class="p-disp ${o.cls}">${esc(o.text)}</span>`; };
  const btn = (act, card, label, attrs) => `<button type="button" class="${(attrs && attrs.cls) || 'ghost'}" data-act="${act}" data-card="${card.ticket}"${attrs && attrs.arg != null ? ` data-arg="${esc(attrs.arg)}"` : ''}${attrs && attrs.extra ? ` ${attrs.extra}` : ''} data-fkey="${card.ticket}:${act}:${esc(attrs && attrs.arg != null ? attrs.arg : '')}">${label}</button>`;
  const latestRound = (card) => card.rounds[card.rounds.length - 1];
  const roundItems = (r) => r.pages.flatMap((p) => p.items);
  const countItems = (rounds) => rounds.reduce((n, r) => n + roundItems(r).length, 0);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  /* ---------- A2 · Chosen first ---------- */
  function optionA(card) {
    const ps = picks(card);
    if (!ps.length) return undecidedA(card);
    const qName = card.questions ? S.q[card.ticket] || ps[0].q : null;
    const pick = qName ? ps.find((p) => p.q === qName) : ps[0];
    const heroKey = S.hero[card.ticket] && get(card, S.hero[card.ticket]) ? S.hero[card.ticket] : pick.key;
    const hero = get(card, heroKey);
    const heroIsPick = heroKey === pick.key;
    const open = !!S.earlier[card.ticket];

    const tabs = card.questions
      ? `<div class="segmented p2-qtabs" role="tablist" aria-label="Questions on #${card.ticket}">${ps.map((p) => `<button type="button" role="tab" class="seg${p.q === qName ? ' is-on' : ''}" aria-selected="${p.q === qName}" data-act="q" data-card="${card.ticket}" data-arg="${esc(p.q)}" data-fkey="${card.ticket}:q:${esc(p.q)}">${esc(p.q)} <b>${esc(p.id)}</b></button>`).join('')}</div>`
      : '';
    const fromLine = (pick.from || []).length
      ? `<p class="p-mutedline p2-from">Built from ${pick.from.map((k) => { const s = get(card, k); return btn('reveal', card, `${esc(s.id)}`, { cls: 'p2-link', arg: k }); }).join(', ')} · ${esc(roundText(get(card, pick.from[0]).round))}${upstream(card, pick)}</p>`
      : `<p class="p-mutedline p2-from">Chosen as first drawn, in ${esc(roundText(pick.round))}.</p>`;
    const alsoItems = [pick, ...card.also.map((a) => get(card, a.key))];
    const thumbs = (card.questions ? ps : alsoItems.length > 1 ? alsoItems : [])
      .map((i) => `<button type="button" class="pa-also p2-thumb${i.key === heroKey ? ' is-on' : ''}" data-act="${card.questions ? 'q' : 'hero'}" data-card="${card.ticket}" data-arg="${esc(card.questions ? i.q : i.key)}" aria-pressed="${i.key === heroKey}" data-fkey="${card.ticket}:thumb:${esc(i.key)}">${frame(i)}<span>${esc(card.questions ? `${i.q} · ${i.id}` : i.key === pick.key ? `${i.id} · the pick` : i.name)}${i.round !== pick.round ? ` <em>${esc(roundText(i.round))}</em>` : ''}</span></button>`).join('');
    const alsoLabel = card.questions ? 'Every choice on this canvas' : `Also part of the choice${card.alsoCount > card.also.length ? ` · showing ${card.also.length} of ${card.alsoCount}` : ''}`;
    const earlierRounds = card.rounds.map((r) => ({ ...r, pages: r.pages.map((p) => ({ ...p, items: p.items.filter((i) => !isPicked(card, i.key) && (!qName || i.q === qName)) })).filter((p) => p.items.length) })).filter((r) => r.pages.length);
    const notChosenCount = countItems(earlierRounds);
    const eyebrow = heroIsPick
      ? `${qName ? `${esc(qName)} · ` : ''}Chosen · ${esc(roundText(hero.round))} · ${esc(hero.pageTitle)}`
      : `Part of the choice · ${esc(roundText(hero.round))} · ${esc(hero.pageTitle)}`;

    const body = `${tabs}<div class="pa-body">
        <a class="pa-hero" href="#" data-to="${esc(where(card, hero))}" aria-label="Open ${esc(hero.id)}, ${esc(roundText(hero.round))}" data-fkey="${card.ticket}:hero">${frame(hero, heroIsPick ? ' is-picked' : ' is-part')}</a>
        <div class="pa-text">
          <span class="eyebrow">${eyebrow}</span>
          <h3>${esc(hero.id)} · ${esc(hero.name)}</h3>
          <p class="gist">${esc(heroIsPick ? card.why : `Shown with ${pick.id}: ${hero.name}.`)}</p>
          ${fromLine}
          <div class="pa-actions"><button type="button" class="primary" data-to="${esc(where(card, hero))}"><span data-icon="play" aria-hidden="true"></span>Open ${esc(hero.id)}</button>
          ${heroIsPick ? '' : btn('hero', card, `Back to ${esc(pick.id)}`, { arg: pick.key })}
          ${notChosenCount ? btn('earlier', card, `<span data-icon="${open ? 'chev' : 'right'}" aria-hidden="true"></span>${open ? 'Hide' : 'Show'} the other ${plural(notChosenCount, 'item')}`, { extra: `aria-expanded="${open}"` }) : ''}</div>
          ${thumbs ? `<div class="pa-alsos"><span class="p-mutedline">${alsoLabel}</span><div class="pa-alsorow p2-alsorow">${thumbs}</div></div>` : ''}
          ${card.repeats ? `<p class="p-mutedline p2-repeat">Same IDs elsewhere: ${esc(card.repeats)}</p>` : ''}
        </div>
      </div>${open ? earlierA(card, earlierRounds) : ''}`;
    return section(card, head(card, canvasButton(card, 'All rounds')) + body);
  }
  function upstream(card, pick) {
    const src = get(card, pick.from[0]);
    if (!src || !(src.from || []).length) return '';
    const ids = src.from.map((k) => get(card, k).id);
    return ` ← ${ids.join(', ')} · ${roundText(get(card, src.from[0]).round)}${(src.from.length && get(card, src.from[0]).from) ? ' ← …' : ''}`;
  }
  function earlierA(card, rounds) {
    const flash = S.flash && S.flash.card === card.ticket ? S.flash.key : null;
    return `<div class="pa-earlier">${rounds.map((r) => `<div class="pa-round">${r.pages.map((p) => `<span class="eyebrow">${esc([roundText(r.round), p.title].filter(Boolean).join(' · '))}</span><div class="pa-row">${p.items.map((i) => varLink(card, { ...i, round: r.round, pageTitle: p.title }, ` is-dim${flash === i.key ? ' is-flash' : ''}`, null, disp(card, i))).join('')}</div>`).join('')}</div>`).join('')}</div>`;
  }
  function undecidedA(card) {
    const r = latestRound(card);
    const older = card.rounds.slice(0, -1);
    const open = !!S.earlier[card.ticket];
    const items = roundItems(r);
    const pages = r.pages.length > 1 ? ` on ${r.pages.length} pages (${r.pages.map((p) => p.title).join(', ')})` : ` · ${r.pages[0].title}`;
    const lead = card.state === 'unrecorded'
      ? card.why
      : `${roundText(r.round)}${pages} · ${plural(items.length, 'option')}, none chosen yet.`;
    const strip = r.pages.map((p) => `${r.pages.length > 1 ? `<span class="eyebrow p2-pagehead">${esc(p.title)}</span>` : ''}<div class="wf-strip p2-strip" role="list">${p.items.map((i) => varLink(card, { ...i, round: r.round, pageTitle: p.title }, '')).join('')}</div>`).join('');
    const earlierBtn = older.length ? btn('earlier', card, `<span data-icon="${open ? 'chev' : 'right'}" aria-hidden="true"></span>${plural(older.length, 'earlier round')} · ${plural(countItems(older), 'option')}`, { extra: `aria-expanded="${open}"` }) : '';
    const unknown = card.state === 'unrecorded' ? `<p class="p-mutedline p2-unknown">${pages.replace(/^ on /, 'On ')} · ${plural(items.length, 'item')}${items.some((i) => !i.shot) ? `, ${items.filter((i) => !i.shot).length} without a picture` : ''}. The board does not guess a pick from the closing comment.</p>` : '';
    return section(card, `${head(card, canvasButton(card))}<p class="gist">${esc(lead)}</p>${unknown}${strip}${earlierBtn ? `<div class="pa-actions p2-under">${earlierBtn}</div>` : ''}${open ? earlierA(card, older) : ''}`);
  }

  /* ---------- B2 · Round rail ---------- */
  function optionB(card) {
    const withAlso = !!S.withAlso[card.ticket];
    const alsoBtn = card.also.length ? btn('also', card, `${withAlso ? 'Hide' : 'Show'} the rest of the choice (${card.also.length})`, { extra: `aria-pressed="${withAlso}"` }) : '';
    const lead = card.state === 'decided' ? card.why : card.state === 'unrecorded' ? card.why : `${roundText(latestRound(card).round)} · ${plural(roundItems(latestRound(card)).length, 'option')}, none chosen yet.`;
    const cell = (i) => varLink(card, i, `${isPicked(card, i.key) ? ' is-picked' : ''} pb-item${i.isAlso ? ' is-part' : ''}`, `${i.id} · ${i.name}`, `<span class="p-disp ${i.isAlso ? 'is-kept' : outcome(card, i).cls}">${esc(i.isAlso ? 'Part of the choice' : outcome(card, i).text)}</span>`);
    const alsoIn = (ri, page) => (withAlso ? card.also.filter((a) => a.page === page && !card.rounds[ri].pages.some((p) => p.items.some((x) => x.key === a.key))).map((a) => get(card, a.key)) : []);

    let rail;
    if (card.questions) {
      // One lane per question, one column per round.
      const cols = card.rounds.map((r, ri) => `<div class="pb2-colhead" style="grid-column:${ri + 2}">${esc(roundText(r.round))}<span> · ${esc(r.pages.map((p) => p.title).join(', '))}</span></div>`).join('');
      const lanes = card.questions.map((qn, qi) => `<div class="pb2-lane" style="grid-row:${qi + 2}">${esc(qn)}</div>${card.rounds.map((r, ri) => {
        const its = r.pages.flatMap((p) => p.items.filter((i) => i.q === qn).map((i) => ({ ...i, round: r.round, ri, pageTitle: p.title })));
        return `<div class="pb2-cell" style="grid-row:${qi + 2};grid-column:${ri + 2}">${its.map(cell).join('') || '<span class="p-mutedline">—</span>'}</div>`;
      }).join('')}`).join('');
      rail = `<div class="pb2-grid" style="--cols:${card.rounds.length}">${cols}${lanes}</div>`;
    } else {
      rail = card.rounds.map((r, ri) => {
        const last = ri === card.rounds.length - 1;
        const groups = r.pages.map((p) => {
          const its = p.items.map((i) => ({ ...i, round: r.round, ri, pageTitle: p.title })).concat(alsoIn(ri, p.page));
          return `<div class="pb2-page">${r.pages.length > 1 || !r.round ? `<span class="pb2-pagename">${esc(p.title)}</span>` : ''}<div class="pb-items">${its.map(cell).join('')}</div></div>`;
        }).join('');
        const extra = card.also.filter((a) => withAlso && card.rounds[ri].round === a.round && !r.pages.some((p) => p.page === a.page));
        const extraHtml = extra.length ? `<div class="pb2-page"><span class="pb2-pagename">${esc(pageTitle(card, extra[0].page))}</span><div class="pb-items">${extra.map((a) => cell(get(card, a.key))).join('')}</div></div>` : '';
        return `<div class="pb-col pb2-col">${r.round ? `<span class="pb-round">${esc(roundText(r.round))}<span> · ${esc(r.pages.map((p) => p.title).join(' + '))}</span></span>` : '<span class="pb-round"><span>No round labels</span></span>'}<div class="pb2-pages">${groups}${extraHtml}</div></div>${last ? '' : '<span class="pb-arrow" aria-hidden="true" data-icon="arrow"></span>'}`;
      }).join('');
      rail = `<div class="pb-rail pb2-rail" role="list" data-rail="${card.ticket}">${rail}</div>`;
    }
    const tip = '<p class="p-mutedline p2-hint">Hover or focus a picture to trace what it came from and what came of it.</p>';
    return section(card, `${head(card, `${alsoBtn}${canvasButton(card)}`)}<p class="gist">${esc(lead)}</p>${rail}${card.rounds.length > 1 || card.also.length ? tip : ''}`);
  }

  /* ---------- C2 · One round at a time ---------- */
  function optionC(card) {
    const ps = picks(card);
    const qName = card.questions ? S.q[card.ticket] || ps[0].q : null;
    const pick = qName ? ps.find((p) => p.q === qName) : ps[0];
    const defaultRound = pick ? pick.ri : card.rounds.length - 1;
    const ri = S.round[card.ticket] ?? defaultRound;
    const r = card.rounds[ri];
    const pi = Math.min(S.page[card.ticket] ?? (pick && ri === pick.ri ? r.pages.findIndex((p) => p.page === pick.page) : 0), r.pages.length - 1);
    const p = r.pages[pi];
    let items = p.items.filter((i) => !qName || i.q === qName).map((i) => ({ ...i, round: r.round, ri, pageTitle: p.title }));
    const onPickRound = pick && items.some((i) => i.key === pick.key);
    if (onPickRound && !qName) items = [items.find((i) => i.key === pick.key), ...items.filter((i) => i.key !== pick.key), ...card.also.filter((a) => a.round === r.round).map((a) => ({ ...get(card, a.key), isAlso: true }))];
    const more = !!S.more[card.ticket];
    const shown = more ? items : items.slice(0, 4);

    const qTabs = card.questions ? `<div class="segmented pc-rounds" role="tablist" aria-label="Questions">${ps.map((x) => `<button type="button" role="tab" class="seg${x.q === qName ? ' is-on' : ''}" aria-selected="${x.q === qName}" data-act="cq" data-card="${card.ticket}" data-arg="${esc(x.q)}" data-fkey="${card.ticket}:cq:${esc(x.q)}">${esc(x.q)}</button>`).join('')}</div>` : '';
    const rTabs = card.rounds.length > 1 ? `<div class="segmented pc-rounds" role="tablist" aria-label="Rounds for #${card.ticket}">${card.rounds.map((x, xi) => ({ x, xi })).reverse().map(({ x, xi }) => {
      const has = card.picks.some((pk) => roundOfKey(card, pk.key) === xi && (!qName || pk.q === qName));
      return `<button type="button" role="tab" class="seg${xi === ri ? ' is-on' : ''}" aria-selected="${xi === ri}" data-act="round" data-card="${card.ticket}" data-arg="${xi}" data-fkey="${card.ticket}:round:${xi}">${esc(roundText(x.round) || 'Pages')}${has ? ' <span data-icon="check" aria-hidden="true"></span>' : ''}</button>`;
    }).join('')}</div>` : '';
    const pTabs = r.pages.length > 1 ? `<div class="segmented pc-rounds p2-pages" role="tablist" aria-label="Pages in ${esc(roundText(r.round) || 'this canvas')}">${r.pages.map((x, xi) => `<button type="button" role="tab" class="seg${xi === pi ? ' is-on' : ''}" aria-selected="${xi === pi}" data-act="page" data-card="${card.ticket}" data-arg="${xi}" data-fkey="${card.ticket}:page:${xi}">${esc(x.title)}</button>`).join('')}</div>` : '';
    const strip = shown.map((i) => {
      const chosen = isPicked(card, i.key);
      const cls = chosen ? ' is-picked' : onPickRound && !i.isAlso ? ' is-dim' : '';
      return varLink(card, i, ` decision-variant${cls}`, `${i.id} · ${i.name}`, `<span class="p-disp ${i.isAlso ? 'is-kept' : outcome(card, i).cls}">${esc(i.isAlso ? 'Part of the choice' : outcome(card, i).text)}</span>`);
    }).join('');
    const moreBtn = items.length > 4 ? btn('more', card, more ? 'Show 4' : `+${items.length - 4} more on this page`, { extra: `aria-expanded="${more}"` }) : '';
    const where1 = [roundText(r.round), p.title].filter(Boolean).join(' · ');
    const lead = card.state === 'decided' ? card.why : card.state === 'unrecorded' ? card.why : card.state === 'waiting' ? 'Waiting on your pick.' : 'Still being built.';
    const jump = pick && ri !== pick.ri ? btn('round', card, `Back to ${esc(roundText(pick.round))} ✓`, { arg: pick.ri, cls: 'ghost p2-small' }) : '';
    return section(card, `${head(card, canvasButton(card))}<p class="gist">${esc(lead)}</p>
      ${qTabs ? `<div class="pc-bar">${qTabs}</div>` : ''}
      <div class="pc-bar"><span class="p-mutedline">Showing ${esc(where1)} · ${plural(items.length, 'item')}${card.lettersRepeatAcrossPages && r.pages.length > 1 ? ' · A, B and C appear on both pages' : ''}</span>${jump}${pTabs}${rTabs}</div>
      <div class="wf-strip" role="list">${strip}</div>${moreBtn ? `<div class="pa-actions p2-under">${moreBtn}</div>` : ''}`);
  }

  /* ---------- D2 · Decision line ---------- */
  function optionD(card) {
    const ps = picks(card);
    const open = !!S.dOpen[card.ticket];
    const step = S.dStep[card.ticket];
    let line;
    if (ps.length > 1) line = ps.map((x) => `<a class="pd-pick" href="#" data-to="${esc(where(card, x))}"><span data-icon="check" aria-hidden="true"></span><span class="p-mutedline">${esc(x.q)}</span><strong>${esc(x.id)}</strong></a>`).join('<span class="pd-sep" aria-hidden="true">·</span>');
    else if (ps.length) line = `<a class="pd-pick" href="#" data-to="${esc(where(card, ps[0]))}"><span data-icon="check" aria-hidden="true"></span><strong>${esc(ps[0].id)} · ${esc(ps[0].name)}</strong><span class="p-mutedline">${esc(roundText(ps[0].round))} · ${esc(ps[0].pageTitle)}${card.also.length ? ` · +${card.alsoCount} with it` : ''}</span></a>`;
    else if (card.state === 'unrecorded') line = `<span class="pd-unknown"><span data-icon="help" aria-hidden="true"></span>No pick recorded</span><span class="p-mutedline">${plural(index(card).list.length, 'item')} on ${plural(card.rounds[0].pages.length, 'page')}, none marked</span>`;
    else { const r = latestRound(card); line = `<span class="p-mutedline">${esc(roundText(r.round))} · ${esc(r.pages[0].title)} · ${roundItems(r).map((i) => esc(i.id)).join(', ')} ${card.state === 'waiting' ? 'waiting on you' : 'being built'}</span>`; }
    const path = card.rounds.map((x, xi) => {
      const chosen = card.picks.some((pk) => roundOfKey(card, pk.key) === xi);
      const ids = roundItems(x).filter((i) => !/-/.test(i.id) || isPicked(card, i.key) || i.disp).map((i) => `<b class="${isPicked(card, i.key) ? 'is-chosen' : ''}">${esc(i.id)}</b>`).join(' ');
      return `<button type="button" class="pd-step p2-step${chosen ? ' is-chosen' : ''}${open && step === xi ? ' is-on' : ''}" data-act="dstep" data-card="${card.ticket}" data-arg="${xi}" data-fkey="${card.ticket}:dstep:${xi}">${esc(roundText(x.round) || x.pages.map((p) => p.title).join(' + '))} ${ids}</button>`;
    }).join('<span class="pd-sep" aria-hidden="true">›</span>');
    const thumbItem = ps[0] || roundItems(latestRound(card)).map((i) => get(card, i.key)).find((i) => i.shot) || index(card).list[0];
    const thumb = `<a class="pd-thumb" href="#" data-to="${esc(where(card, thumbItem))}">${frame(thumbItem, ps.length ? ' is-picked' : '')}</a>`;
    const rounds = open ? (step == null ? card.rounds.map((r, ri) => ({ r, ri })) : [{ r: card.rounds[step], ri: step }]) : [];
    const detail = open ? `<div class="pd-detail p2-detail">${rounds.map(({ r, ri }) => r.pages.map((p) => `<div class="p2-dgroup"><span class="eyebrow">${esc([roundText(r.round), p.title].filter(Boolean).join(' · '))}</span><div class="p2-drow">${p.items.map((i) => varLink(card, { ...i, round: r.round, ri, pageTitle: p.title }, isPicked(card, i.key) ? ' is-picked' : ps.length ? ' is-dim' : '', `${i.id} · ${i.name}`, disp(card, i))).join('')}</div></div>`).join('')).join('')}${step != null ? btn('dall', card, 'Show every round', { cls: 'ghost p2-small' }) : ''}</div>` : '';
    return `<section class="wf-node wf-proto pd-row p2-card is-${card.state}${card.state === 'waiting' ? ' is-waiting' : ''}" data-card="${card.ticket}" style="--accent: var(${accent(card)})">${kindTag(card)}
      ${thumb}
      <div class="pd-main"><div class="h">${chip(card)}<button type="button" class="wf-proto-title" data-to="#${card.ticket} on the map">#${card.ticket} ${esc(card.title)}</button><time class="when">${esc(card.date)}</time></div>
        <div class="pd-line">${line}</div>
        <div class="pd-path"><button type="button" class="pd-expand" aria-expanded="${open}" aria-label="${open ? 'Hide' : 'Show'} every item" data-act="dopen" data-card="${card.ticket}" data-fkey="${card.ticket}:dopen:"><span data-icon="${open ? 'chev' : 'right'}" aria-hidden="true"></span></button>${path}</div>
      </div>
      <span class="acts">${canvasButton(card)}</span>
      ${detail}
    </section>`;
  }
  function dFilterBar(list) {
    const groups = [['all', 'All', list.length], ['chosen', 'Chosen', list.filter((c) => c.state === 'decided').length], ['open', 'Not chosen yet', list.filter((c) => c.state !== 'decided').length]];
    return `<div class="p2-dfilter"><div class="segmented" role="tablist" aria-label="Filter prototypes">${groups.map(([k, label, n]) => `<button type="button" role="tab" class="seg${S.dFilter === k ? ' is-on' : ''}" aria-selected="${S.dFilter === k}" data-act="dfilter" data-arg="${k}" data-fkey="dfilter:${k}">${label} <span class="p2-count">${n}</span></button>`).join('')}</div></div>`;
  }

  /* ---------- Render, events, focus ---------- */
  const RENDER = { A: optionA, B: optionB, C: optionC, D: optionD };
  const board = document.getElementById('board');
  function render() {
    const focused = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fkey : null;
    let list = cards.filter((c) => S.show === 'all' || String(c.ticket) === S.show);
    let html = '';
    if (option === 'D') {
      html = dFilterBar(list);
      list = list.filter((c) => S.dFilter === 'all' || (S.dFilter === 'chosen') === (c.state === 'decided'));
    }
    board.innerHTML = html + list.map(RENDER[option]).join('');
    Kit.fillIcons(board);
    if (focused) { const el = board.querySelector(`[data-fkey="${CSS.escape(focused)}"]`); if (el) el.focus({ preventScroll: true }); }
    board.querySelectorAll('[data-rail]').forEach((rail) => { if (!rail.dataset.scrolled) { rail.scrollLeft = rail.scrollWidth; rail.dataset.scrolled = '1'; } });
    const flashed = board.querySelector('.is-flash');
    if (flashed) { flashed.scrollIntoView({ block: 'nearest' }); S.flash = null; }
  }
  const cardOf = (el) => cards.find((c) => String(c.ticket) === el.dataset.card);

  board.addEventListener('click', (event) => {
    const el = event.target.closest('[data-act]');
    if (!el) return;
    event.preventDefault();
    const card = cardOf(el);
    const t = card && card.ticket;
    const arg = el.dataset.arg;
    switch (el.dataset.act) {
      case 'hero': S.hero[t] = arg; break;
      case 'q': S.q[t] = arg; S.hero[t] = null; S.flash = null; break;
      case 'earlier': S.earlier[t] = !S.earlier[t]; break;
      case 'reveal': S.earlier[t] = true; S.flash = { card: t, key: arg }; break;
      case 'also': S.withAlso[t] = !S.withAlso[t]; break;
      case 'cq': S.q[t] = arg; S.round[t] = undefined; S.page[t] = undefined; S.more[t] = false; break;
      case 'round': S.round[t] = Number(arg); S.page[t] = undefined; S.more[t] = false; break;
      case 'page': S.page[t] = Number(arg); S.more[t] = false; break;
      case 'more': S.more[t] = !S.more[t]; break;
      case 'dopen': S.dOpen[t] = !S.dOpen[t]; S.dStep[t] = undefined; break;
      case 'dstep': { const n = Number(arg); const same = S.dOpen[t] && S.dStep[t] === n; S.dOpen[t] = !same; S.dStep[t] = same ? undefined : n; break; }
      case 'dall': S.dStep[t] = undefined; break;
      case 'dfilter': S.dFilter = arg; break;
      default: return;
    }
    render();
  });

  // B2: trace lineage on hover and focus, without re-rendering.
  function trace(target, on) {
    const a = target.closest && target.closest('.pb-item[data-key]');
    if (!a) return;
    const sec = a.closest('[data-card]');
    const card = cards.find((c) => String(c.ticket) === sec.dataset.card);
    sec.querySelectorAll('.p2-tip').forEach((t) => t.remove());
    sec.querySelectorAll('.pb-item').forEach((n) => n.classList.remove('is-lineage', 'is-faded', 'is-focus'));
    sec.classList.toggle('is-tracing', on);
    if (!on) return;
    const set = lineage(card, a.dataset.key);
    sec.querySelectorAll('.pb-item[data-key]').forEach((n) => n.classList.add(set.has(n.dataset.key) ? 'is-lineage' : 'is-faded'));
    a.classList.add('is-focus');
    const i = get(card, a.dataset.key);
    const tip = document.createElement('span');
    tip.className = 'pb-tip p2-tip';
    tip.setAttribute('role', 'tooltip');
    tip.textContent = `Opens ${[roundText(i.round), i.pageTitle].filter(Boolean).join(' · ')} › ${i.id}${set.size > 1 ? ` · ${set.size - 1} linked` : ''}`;
    a.append(tip);
  }
  if (option === 'B') {
    board.addEventListener('mouseover', (e) => trace(e.target, true));
    board.addEventListener('mouseout', (e) => { if (!e.relatedTarget || !e.target.closest('.pb-item')?.contains(e.relatedTarget)) trace(e.target, false); });
    board.addEventListener('focusin', (e) => trace(e.target, true));
    board.addEventListener('focusout', (e) => trace(e.target, false));
  }

  // Prototype-only control: which cards to show.
  const pick = document.getElementById('p2-case');
  pick.innerHTML = `<option value="all">All ${cards.length} cards</option>${cards.map((c) => `<option value="${c.ticket}">#${c.ticket} · ${esc(c.kind)}</option>`).join('')}`;
  pick.value = S.show;
  pick.addEventListener('change', () => { S.show = pick.value; render(); });

  document.body.classList.add(`opt-${option}`, 'p2');
  render();
})();
