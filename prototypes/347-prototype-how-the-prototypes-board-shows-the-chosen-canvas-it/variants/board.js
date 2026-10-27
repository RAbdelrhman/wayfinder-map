/*
  #347: the map's Prototypes board, drawn with the app's own classes (src/ui/styles.css) and real data
  (board-data.js). ?o= picks the option (today, A, B, C, D); ?s= picks a state inside it.
  Every frame and button says where it would open, through Kit's data-to toast.
*/
(function () {
  const q = new URLSearchParams(location.search);
  const option = q.get('o') || 'today';
  const state = q.get('s') || 'board';
  const esc = Kit.esc;
  const data = window.BOARD;

  Kit.icons.check = '<path d="M20 6 9 17l-5-5"/>';
  Kit.icons.play = '<path d="M7 4v16l13-8z" fill="currentColor"/>';
  Kit.icons.refresh = '<path d="M20 11a8 8 0 0 0-14.9-3.8L3 9.5"/><path d="M3 4v5.5h5.5"/><path d="M4 13a8 8 0 0 0 14.9 3.8L21 14.5"/><path d="M21 20v-5.5h-5.5"/>';
  Kit.icons.hand = '<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>';
  Kit.icons.chev = '<path d="m6 9 6 6 6-6"/>';
  Kit.icons.right = '<path d="m9 6 6 6-6 6"/>';
  Kit.icons.arrow = '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>';
  Kit.icons.map = '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>';
  Kit.icons.table = '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/>';
  Kit.icons.beaker = '<path d="M9.5 3h5"/><path d="M10.8 3v6.4L5.5 17.9A2 2 0 0 0 7.2 21h9.6a2 2 0 0 0 1.7-3.1L13.2 9.4V3"/><path d="M7.8 15h8.4"/>';
  Kit.icons.layers = '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>';

  const roundText = (round) => (typeof round === 'number' ? `Round ${round}` : round);
  const where = (card, item, pageTitle, round) =>
    `the #${card.ticket} canvas at ${roundText(round)} · ${pageTitle} › ${item.id}`;
  const shotFor = (name) => `../assets/shots/${name}.jpg`;
  const DISPOSITION = { keep: 'Kept', change: 'Changed', combine: 'Combined' };

  /* One picture of one canvas item, in the app's .wf-frame. */
  function frame(item, extra) {
    return `<span class="wf-frame p-shot${item.phone ? ' is-phone' : ''}${extra || ''}"><img class="decision-variant-image" src="${shotFor(item.shot)}" alt="" /><span class="tag">${esc(item.id)}</span></span>`;
  }

  function statusChip(card, text) {
    if (card.state === 'building') return '<span class="chip" style="--accent: var(--state-blocked)"><span data-icon="refresh" aria-hidden="true"></span>Being built</span>';
    return `<span class="chip" style="--accent: var(--state-done)"><span data-icon="check" aria-hidden="true"></span>${esc(text)}</span>`;
  }

  function head(card, chipText, actions) {
    const accent = card.state === 'building' ? '--state-blocked' : '--state-done';
    return `<section class="wf-node wf-proto is-${card.state}" style="--accent: var(${accent})">
      <div class="h">${statusChip(card, chipText)}<button type="button" class="wf-proto-title" data-to="#${card.ticket} on the map">#${card.ticket} ${esc(card.title)}</button>
      <time class="when">${esc(card.date)}</time><span class="acts">${actions}</span></div>`;
  }

  const canvasButton = (card, label) =>
    `<button type="button" class="ghost" data-to="the #${card.ticket} canvas on its first page"><span data-icon="play" aria-hidden="true"></span>${label || 'Canvas'}</button>`;

  const latest = (card) => card.rounds[card.rounds.length - 1];

  /* ---------- Today: src/ui/prototypeBoard.ts as it renders these tickets now ---------- */
  function today(card) {
    const variants = card.rounds.flatMap((r) => r.items).filter((i) => /^[A-Z]{1,2}$/.test(i.id)).sort((a, b) => a.id.localeCompare(b.id));
    const picked = card.todayPicked;
    const chip = card.state === 'decided' ? (picked.length ? `Picked ${picked.join(' + ')}` : 'Decided') : '';
    const strip = variants.slice(0, 8).map((v) => {
      const isPicked = picked.includes(v.id);
      const cls = isPicked ? ' is-picked' : picked.length ? ' is-dim' : '';
      return `<a class="wf-var decision-variant${cls}" role="listitem" href="#" data-to="the variant page alone (variants/…html), outside the canvas">${frame(v)}<span class="lbl">${isPicked ? '<span data-icon="check" aria-hidden="true"></span>' : ''}${esc(`${v.id} · ${v.name}`)}</span></a>`;
    }).join('');
    return `${head(card, chip, canvasButton(card))}
      <p class="gist">${esc(card.todayGist)}</p>
      <div class="wf-strip" role="list">${strip}</div></section>`;
  }

  /* ---------- A · Chosen first: one big chosen item, earlier rounds behind a disclosure ---------- */
  function optionA(card) {
    if (!card.chosen) {
      const r = latest(card);
      return `${head(card, '', canvasButton(card))}
        <p class="gist">${roundText(r.round)} · ${esc(r.pageTitle)} · ${r.items.length} options, none chosen yet.</p>
        <div class="wf-strip" role="list">${r.items.map((i) => `<a class="wf-var" role="listitem" href="#" data-to="${esc(where(card, i, r.pageTitle, r.round))}">${frame(i)}<span class="lbl">${esc(`${i.id} · ${i.name}`)}</span></a>`).join('')}</div></section>`;
    }
    const c = card.chosen;
    const earlier = card.rounds.filter((r) => !r.items.some((i) => i.chosen));
    const open = state === 'earlier' && card.ticket === 225;
    const earlierCount = earlier.reduce((n, r) => n + r.items.length, 0);
    const also = c.also.map((a) => `<a class="pa-also" href="#" data-to="${esc(where(card, a, c.pageTitle, c.round))}">${frame({ ...a, phone: c.phone })}<span>${esc(a.name)}</span></a>`).join('');
    const earlierHtml = open
      ? `<div class="pa-earlier">${earlier.map((r) => `<div class="pa-round"><span class="eyebrow">${roundText(r.round)} · ${esc(r.pageTitle)}</span><div class="pa-row">${r.items.map((i) => `<a class="wf-var is-dim" href="#" data-to="${esc(where(card, i, r.pageTitle, r.round))}">${frame(i)}<span class="lbl">${esc(`${i.id} · ${i.name}`)}</span><span class="p-disp">${i.disposition ? `${DISPOSITION[i.disposition]} into ${esc(i.into)}` : 'Not chosen'}</span></a>`).join('')}</div>${(r.alsoPages || []).map((p) => `<span class="p-mutedline">Also on page “${esc(p.pageTitle)}”: ${p.ids.join(', ')} in dark</span>`).join('')}</div>`).join('')}</div>`
      : '';
    return `${head(card, `Chosen ${c.id} · ${roundText(c.round)}`, canvasButton(card, 'All rounds'))}
      <div class="pa-body">
        <a class="pa-hero" href="#" data-to="${esc(where(card, c, c.pageTitle, c.round))}" aria-label="Open the chosen item, ${esc(c.id)}, ${roundText(c.round)}">${frame(c, ' is-picked')}</a>
        <div class="pa-text">
          <span class="eyebrow">Chosen · ${roundText(c.round)} · ${esc(c.pageTitle)}</span>
          <h3>${esc(c.id)} · ${esc(c.name)}</h3>
          <p class="gist">${esc(c.why)}</p>
          <p class="p-mutedline">Built from ${c.basedOn.join(', ')}${c.basedOn.length ? ` (${roundText(card.rounds[Math.max(0, card.rounds.length - 2)].round)})` : ''}</p>
          <div class="pa-actions"><button type="button" class="primary" data-to="${esc(where(card, c, c.pageTitle, c.round))}"><span data-icon="play" aria-hidden="true"></span>Open ${esc(c.id)}</button>
          <button type="button" class="ghost pa-toggle" aria-expanded="${open}" data-to="${open ? 'collapse earlier rounds' : 'expand earlier rounds'}"><span data-icon="${open ? 'chev' : 'right'}" aria-hidden="true"></span>${earlier.length} earlier round${earlier.length === 1 ? '' : 's'} · ${earlierCount} options</button></div>
          <div class="pa-alsos"><span class="p-mutedline">Also part of the choice${c.alsoCount > c.also.length ? ` (${c.alsoCount} items)` : ''}</span><div class="pa-alsorow">${also}</div></div>
        </div>
      </div>${earlierHtml}</section>`;
  }

  /* ---------- B · Round rail: every round in order, lineage arrows, the chosen one lit ---------- */
  function optionB(card) {
    const focused = state === 'focus' && card.ticket === 163;
    const chip = card.chosen ? `Chosen ${card.chosen.id} · ${roundText(card.chosen.round)}` : '';
    const cols = card.rounds.map((r, idx) => {
      const isLast = idx === card.rounds.length - 1;
      const items = r.items.map((i) => {
        const cls = i.chosen ? ' is-picked' : card.chosen ? ' is-dim' : '';
        const label = i.chosen ? 'Chosen' : i.disposition ? DISPOSITION[i.disposition] : card.chosen ? 'Not chosen' : 'Open';
        const tip = focused && i.chosen ? `<span class="pb-tip" role="tooltip">Opens ${esc(roundText(r.round))} · ${esc(r.pageTitle)} › ${esc(i.id)}</span>` : '';
        return `<a class="wf-var pb-item${cls}${focused && i.chosen ? ' is-focus' : ''}" href="#" data-to="${esc(where(card, i, r.pageTitle, r.round))}">${frame(i)}<span class="lbl">${i.chosen ? '<span data-icon="check" aria-hidden="true"></span>' : ''}${esc(i.id)} · ${esc(i.name)}</span><span class="p-disp${i.chosen ? ' is-chosen' : ''}">${label}${i.into ? ` → ${esc(i.into)}` : ''}</span>${tip}</a>`;
      }).join('');
      const more = (r.alsoPages || []).map((p) => `<span class="p-mutedline">+ page “${esc(p.pageTitle)}”, ${p.ids.join(', ')}</span>`).join('');
      return `<div class="pb-col${isLast ? ' is-last' : ''}" style="--n:${r.items.length}"><span class="pb-round">${roundText(r.round)}<span> · ${esc(r.pageTitle)}</span></span><div class="pb-items">${items}</div>${more}</div>${isLast ? '' : '<span class="pb-arrow" aria-hidden="true" data-icon="arrow"></span>'}`;
    }).join('');
    const gist = card.chosen ? card.chosen.why : `${roundText(latest(card).round)} · ${latest(card).items.length} options, none chosen yet.`;
    return `${head(card, chip, canvasButton(card))}<p class="gist">${esc(gist)}</p><div class="pb-rail" role="list">${cols}</div></section>`;
  }

  /* ---------- C · Today's strip, one round at a time, with a round switcher ---------- */
  function optionC(card) {
    const showRound1 = state === 'round1' && card.ticket === 225;
    const chosenRound = card.rounds.find((r) => r.items.some((i) => i.chosen)) || latest(card);
    const r = showRound1 ? card.rounds[0] : chosenRound;
    const tabs = card.rounds.length < 2 ? '' : `<div class="segmented pc-rounds" role="tablist" aria-label="Rounds for #${card.ticket}">${[...card.rounds].reverse().map((x) => `<button type="button" role="tab" class="seg${x === r ? ' is-on' : ''}" aria-selected="${x === r}" data-to="${esc(roundText(x.round))} in this card">${esc(roundText(x.round))}${x.items.some((i) => i.chosen) ? ' <span data-icon="check" aria-hidden="true"></span>' : ''}</button>`).join('')}</div>`;
    const items = r.items.concat(r === chosenRound && card.chosen ? card.chosen.also.map((a) => ({ ...a, phone: card.chosen.phone, disposition: 'keep', sub: true })) : []);
    const anyChosen = r.items.some((i) => i.chosen);
    const strip = items.slice(0, 4).map((i) => {
      const cls = i.chosen ? ' is-picked' : anyChosen && !i.sub ? ' is-dim' : '';
      return `<a class="wf-var decision-variant${cls}" role="listitem" href="#" data-to="${esc(where(card, i, r.pageTitle, r.round))}">${frame(i)}<span class="lbl">${i.chosen ? '<span data-icon="check" aria-hidden="true"></span>' : ''}${esc(`${i.id} · ${i.name}`)}</span>${!anyChosen && i.disposition ? `<span class="p-disp">${DISPOSITION[i.disposition]} into ${esc(i.into)}</span>` : ''}</a>`;
    }).join('');
    const chip = card.chosen ? `Chosen ${card.chosen.id} · ${roundText(card.chosen.round)}` : '';
    const sub = `${roundText(r.round)} · ${esc(r.pageTitle)}${(r.alsoPages || []).map((p) => ` · also on “${esc(p.pageTitle)}”`).join('')}`;
    return `${head(card, chip, canvasButton(card))}
      <p class="gist">${esc(card.chosen ? card.chosen.why : 'Still being built.')}</p>
      <div class="pc-bar"><span class="p-mutedline">${sub}</span>${tabs}</div>
      <div class="wf-strip" role="list">${strip}</div></section>`;
  }

  /* ---------- D · Decision line: a compact row per prototype, the chosen item named in words ---------- */
  function optionD(card) {
    const expanded = state === 'open' && card.ticket === 163;
    const c = card.chosen;
    const r = latest(card);
    const line = c
      ? `<a class="pd-pick" href="#" data-to="${esc(where(card, c, c.pageTitle, c.round))}"><span data-icon="check" aria-hidden="true"></span><strong>${esc(c.id)} · ${esc(c.name)}</strong><span class="p-mutedline">${roundText(c.round)} · ${esc(c.pageTitle)}</span></a>`
      : `<span class="p-mutedline">${roundText(r.round)} · ${esc(r.pageTitle)} · ${r.items.map((i) => esc(i.id)).join(', ')} open</span>`;
    const path = card.rounds.map((x) => {
      const lead = x.items.find((i) => i.chosen || i.disposition === 'keep' || i.disposition === 'change' || i.disposition === 'combine') || x.items[0];
      return `<span class="pd-step${x.items.some((i) => i.chosen) ? ' is-chosen' : ''}">${esc(roundText(x.round))} <b>${x.items.map((i) => esc(i.id)).join(' ')}</b></span>`;
    }).join('<span class="pd-sep" aria-hidden="true">›</span>');
    const thumb = c ? `<a class="pd-thumb" href="#" data-to="${esc(where(card, c, c.pageTitle, c.round))}">${frame(c, ' is-picked')}</a>` : `<span class="pd-thumb">${frame(r.items[0])}</span>`;
    const detail = expanded
      ? `<div class="pd-detail">${card.rounds.map((x) => x.items.map((i) => `<a class="wf-var${i.chosen ? ' is-picked' : ' is-dim'}" href="#" data-to="${esc(where(card, i, x.pageTitle, x.round))}">${frame(i)}<span class="lbl">${esc(i.id)} · ${esc(roundText(x.round))}</span></a>`).join('')).join('')}</div>`
      : '';
    return `<section class="wf-node wf-proto pd-row is-${card.state}" style="--accent: var(${card.state === 'building' ? '--state-blocked' : '--state-done'})">
      ${thumb}
      <div class="pd-main"><div class="h">${statusChip(card, c ? 'Chosen' : '')}<button type="button" class="wf-proto-title" data-to="#${card.ticket} on the map">#${card.ticket} ${esc(card.title)}</button><time class="when">${esc(card.date)}</time></div>
        <div class="pd-line">${line}</div>
        <div class="pd-path"><button type="button" class="pd-expand" aria-expanded="${expanded}" data-to="${expanded ? 'collapse' : 'expand'} every round"><span data-icon="${expanded ? 'chev' : 'right'}" aria-hidden="true"></span></button>${path}</div>
      </div>
      <span class="acts">${canvasButton(card)}</span>
      ${detail}
    </section>`;
  }

  const RENDER = { today, A: optionA, B: optionB, C: optionC, D: optionD };
  const render = RENDER[option] || today;
  document.getElementById('board').innerHTML = data.cards.map(render).join('');
  document.body.classList.add(`opt-${option}`);
  Kit.fillIcons(document.body);
})();
