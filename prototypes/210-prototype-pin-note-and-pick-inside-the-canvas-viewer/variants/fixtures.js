/*
  Shared, project-specific data and helpers for the two pin/note/pick directions.
  Classic script, loaded after ../kit/kit.js. No storage, no fetch, no network: the
  "post" actions only render the comment that would be posted. See shell.css for why
  tokens are mirrored rather than linked.
*/
window.WF = (() => {
  const esc = (window.Kit && window.Kit.esc) || ((s) => String(s ?? ''));

  // Icons on a 24px grid, currentColor. Registered with Kit so data-icon works too.
  const icons = {
    beaker:
      '<path d="M9.5 3h5"/><path d="M10.8 3v6.4L5.5 17.9A2 2 0 0 0 7.2 21h9.6a2 2 0 0 0 1.7-3.1L13.2 9.4V3"/><path d="M7.8 15h8.4"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    pin: '<path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/>',
    note: '<path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/>',
    pick: '<path d="M5 21V3"/><path d="M5 3h11l-2 4 2 4H5"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>',
    pencil: '<path d="M12 20h9"/><path d="M16.5 3.4a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
    logo: '<path d="m15.5 8.5-2 5-5 2 2-5z"/><circle cx="12" cy="12" r="9"/>',
  };
  if (window.Kit) Object.assign(window.Kit.icons, icons);
  const icon = (name, cls) =>
    `<svg class="i${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? ''}</svg>`;

  // The canvas being reviewed inside the viewer. Its options are preserved as-is;
  // feedback never rewrites them.
  const data = {
    title: 'Onboarding',
    branch: 'prototype/198-onboarding',
    github: 'https://github.com/RAbdelrhman/wayfinder-map/tree/prototype/198-onboarding',
    prototypeTicket: 210, // canvas feedback (pins + notes) posts here
    pickTicket: 211, // the pick posts here (the existing "Pick in #N" path)
    page: { id: 'flows', title: 'Flows' },
    options: [
      { id: 'calm', name: 'Calm', variant: 'calm' },
      { id: 'bold', name: 'Bold', variant: 'bold' },
    ],
    reviewer: { login: 'ramon', initials: 'RA' },
  };

  // How each wrapper source changes what the viewer can do (from docs/design/in-app-canvas-viewer.md).
  const SOURCES = {
    engine: {
      label: 'Engine',
      note: 'Full bridge. Pins land on an option and are stored option-relative.',
      canPin: true,
      optionRelative: true,
      inCanvasPick: true,
      viewOnly: false,
    },
    dom: {
      label: 'DOM (older canvas)',
      note: 'No engine hook. The wrapper reads the option and the hit frame from the DOM; pins still land on an option.',
      banner: 'Older canvas — read from the page',
      canPin: true,
      optionRelative: true,
      inCanvasPick: true,
      viewOnly: false,
    },
    page: {
      label: 'Plain page / snapshot',
      note: 'No engine. Pins are page-level; the option comes from the viewer’s variant list.',
      banner: 'Snapshot — page-level pins, option from the viewer',
      canPin: true,
      optionRelative: false,
      inCanvasPick: true,
      viewOnly: false,
    },
    none: {
      label: 'No wrapper (view only)',
      note: 'The bridge never answered. Pins and the in-canvas pick are off; "Pick in #211" still works.',
      banner: 'View only — the feedback bridge didn’t load',
      canPin: false,
      optionRelative: false,
      inCanvasPick: false,
      viewOnly: true,
    },
  };

  const optionName = (id) => data.options.find((o) => o.id === id)?.name ?? id;
  const pct = (f) => Math.round(f * 100) + '%';

  // Fresh state for a direction. Pins: { n, option|null, fx, fy, note }.
  const newState = () => ({
    size: 'full',
    source: 'engine',
    presenting: data.options[0].id, // which option is open full-size, or null for the board
    pins: [],
    optionNote: '',
    pick: null, // { option, note }
    posted: null, // set to { feedback, pick } once "posted"
  });

  const anchorLabel = (pin, source) => {
    if (SOURCES[source].optionRelative && pin.option) return `${optionName(pin.option)} · ${pct(pin.fx)}, ${pct(pin.fy)}`;
    return `${data.page.title} page · ${pct(pin.fx)}, ${pct(pin.fy)}`;
  };

  // The #210 feedback comment (pins + option note), as it would post. No network.
  const feedbackCommentHtml = (st) => {
    const src = SOURCES[st.source];
    const byOption = {};
    for (const pin of st.pins) {
      const key = src.optionRelative && pin.option ? pin.option : '_page';
      (byOption[key] = byOption[key] || []).push(pin);
    }
    const groups = Object.entries(byOption)
      .map(([key, pins]) => {
        const head =
          key === '_page'
            ? `On the <strong>${esc(data.page.title)}</strong> page`
            : `Option <strong>${esc(optionName(key))}</strong> (<code>${esc(key)}</code>)`;
        const items = pins
          .map((p) => `<li><span class="meta">${esc(src.optionRelative && p.option ? pct(p.fx) + ', ' + pct(p.fy) : pct(p.fx) + ', ' + pct(p.fy))}</span> ${esc(p.note || '(no note)')}</li>`)
          .join('');
        return `<p>Page: ${esc(data.page.title)} (${esc(data.page.id)})</p><p>${head}</p><ol>${items}</ol>`;
      })
      .join('');
    const optionNote = st.optionNote.trim() ? `<p><strong>Overall</strong></p><ul><li>${esc(st.optionNote.trim())}</li></ul>` : '';
    const pinCount = st.pins.length;
    return commentCard(
      `#${data.prototypeTicket}`,
      `<h4>Canvas feedback — ${esc(data.title)} <span class="badge">${pinCount} pin${pinCount === 1 ? '' : 's'}</span></h4>${groups || '<p>No pins.</p>'}${optionNote}<p class="meta">Source: ${esc(src.label)} · ${esc(data.branch)}</p>`,
    );
  };

  // The #211 pick comment (option id/name/note + pins on that option).
  const pickCommentHtml = (st) => {
    if (!st.pick) return '';
    const onThis = st.pins.filter((p) => !SOURCES[st.source].optionRelative || p.option === st.pick.option);
    const name = optionName(st.pick.option);
    const noteLine = st.pick.note && st.pick.note.trim() ? `<p>${esc(st.pick.note.trim())}</p>` : '';
    const pinLine = onThis.length
      ? `<p class="meta">${onThis.length} pin${onThis.length === 1 ? '' : 's'} on this option — see #${data.prototypeTicket}.</p>`
      : `<p class="meta">No pins on this option — see #${data.prototypeTicket}.</p>`;
    return commentCard(
      `#${data.pickTicket}`,
      `<h4>Pick: ${esc(name)} <code>${esc(st.pick.option)}</code></h4>${noteLine}${pinLine}` +
      (onThis.length ? `<p>Page: ${esc(data.page.title)} (${esc(data.page.id)})</p><ol>${onThis.map((p) => `<li>Option: <code>${esc(st.pick.option)}</code>; ${SOURCES[st.source].optionRelative ? 'option' : 'page'} location: ${pct(p.fx)}, ${pct(p.fy)}; ${esc(p.note || '(no note)')}</li>`).join('')}</ol>` : ''),
    );
  };

  const commentCard = (ticket, bodyHtml) =>
    `<article class="ghcomment"><header class="ghc-head"><span class="ghc-av">${esc(data.reviewer.initials)}</span><span class="ghc-who">${esc(data.reviewer.login)}</span><span>commented on <a class="ghc-link" data-to="${esc(ticket)}" href="#">${esc(ticket)}</a> · just now</span></header><div class="ghc-body">${bodyHtml}</div></article>`;

  // A pin marker (filled teardrop + number) for the canvas overlay.
  const pinMarker = (n, active) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z"/></svg><span class="num">${n}</span>`;

  return { esc, icon, icons, data, SOURCES, optionName, pct, newState, anchorLabel, feedbackCommentHtml, pickCommentHtml, pinMarker };
})();
