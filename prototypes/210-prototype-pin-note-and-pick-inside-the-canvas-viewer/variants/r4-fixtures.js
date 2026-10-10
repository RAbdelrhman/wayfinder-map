/* Sample data and the two GitHub comment formats every direction posts. */
Object.assign(Kit.icons, {
  beaker: '<path d="M9 3h6"/><path d="M10 3v6.5L4.6 18.4A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.4-2.6L14 9.5V3"/><path d="M7.5 15h9"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  full: '<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/>',
  pane: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M13 4v16"/>',
  float: '<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="11.5" y="11.5" width="6.5" height="5.5" rx="1"/>',
  pin: '<path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  note: '<path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.5-5.6A8.5 8.5 0 1 1 21 12z"/><path d="M9 11h6M9 14h4"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
  alert: '<path d="m12 3 9 16H3z"/><path d="M12 9v4M12 17h.01"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  send: '<path d="M21 3 10 14"/><path d="M21 3 14 21l-4-7-7-4z"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
});

window.P210 = (() => {
  const canvas = {
    title: 'Home, repository and Prototypes',
    branch: 'prototype/42-home-redesign',
    sha: '9f2c1ab',
    protoTicket: { number: 42, title: 'Prototype: Home, repository and Prototypes' },
    pickTicket: { number: 43, title: 'Pick a direction for Home, repository and Prototypes' },
    page: { id: 'home', title: 'Home' },
    options: [
      { id: 'A', name: 'Greeting', img: '../../canvas/assets/protos/43-A.jpg' },
      { id: 'B', name: 'Split hero', img: '../../canvas/assets/protos/43-B.jpg' },
      { id: 'C', name: 'Dense list', img: '../../canvas/assets/protos/43-C.jpg' },
    ],
    board: '../../canvas/assets/protos/39-board.jpg',
    snapshot: { file: 'prototype-snapshot.html', img: '../../canvas/assets/protos/17.jpg' },
  };
  const samplePins = () => [
    { option: 'B', fx: 0.34, fy: 0.3, note: 'The hero card is too tall: the next ticket drops below the fold.' },
    { option: 'B', fx: 0.84, fy: 0.16, note: 'Keep the Trail · Hexes · Bar switch.' },
    { option: 'C', fx: null, fy: null, note: 'Too dense to scan at this size.' },
  ];
  const samplePick = () => ({ option: 'B', note: "B, with C's denser In flight list." });

  const opt = (id) => canvas.options.find((o) => o.id === id);
  const pct = (n) => `${Math.round(n * 100)}%`;
  /** How a pin's place is written out. `kind` is the bridge source: engine/dom, page (snapshot) or none. */
  const where = (p) => {
    if (p.fx === null || p.fx === undefined) return 'whole option';
    const at = `${pct(p.fx)} across, ${pct(p.fy)} down`;
    if (p.kind === 'page') return `${at} of the page`;
    if (p.kind === 'window') return `≈ ${at} of the viewer window`;
    return at;
  };
  const label = (p) => {
    if (p.kind === 'page') return `\`${canvas.snapshot.file}\` · option **${p.option}** (from Wayfinder's variant list)`;
    const o = opt(p.option);
    return `**${o.id} · ${o.name}**`;
  };
  const head = (kind) =>
    kind === 'page'
      ? `\`${canvas.branch}\` @ \`${canvas.sha}\` · snapshot`
      : `\`${canvas.branch}\` @ \`${canvas.sha}\` · page **${canvas.page.title}**`;
  const data = (p) => ({
    page: p.kind === 'page' ? canvas.snapshot.file : canvas.page.id,
    option: p.option,
    x: p.fx === null || p.fx === undefined ? null : +p.fx.toFixed(3),
    y: p.fy === null || p.fy === undefined ? null : +p.fy.toFixed(3),
    ...(p.kind === 'window' ? { approximate: true } : {}),
    note: p.note,
  });

  /** The comment on the prototype ticket: every pin and note, in order. */
  function notesComment(pins, kind = 'dom') {
    const lines = pins.map((p, i) => `${i + 1}. ${label({ kind, ...p })}, ${where({ kind, ...p })}: ${p.note || '_(no note)_'}`);
    const json = JSON.stringify({ branch: canvas.branch, sha: canvas.sha, pins: pins.map((p) => data({ kind, ...p })) });
    return `### Canvas notes from Wayfinder\n${head(kind)}\n\n${lines.join('\n')}\n\n<!-- wayfinder:notes v1 ${json} -->`;
  }
  /** The comment on the pick (grilling) ticket: option ID, name, note and the pins on that option. */
  function pickComment(pick, pins, kind = 'dom') {
    const o = opt(pick.option);
    const mine = pins.filter((p) => p.option === pick.option);
    const quote = pick.note ? `\n> ${pick.note}\n` : '\n_No note._\n';
    const list = mine.length
      ? `\nPins on ${o.id}:\n${mine.map((p, i) => `${i + 1}. ${where({ kind, ...p })}: ${p.note || '_(no note)_'}`).join('\n')}\n`
      : '';
    const json = JSON.stringify({
      option: o.id,
      name: o.name,
      page: kind === 'page' ? canvas.snapshot.file : canvas.page.id,
      branch: canvas.branch,
      sha: canvas.sha,
      note: pick.note || null,
      pins: mine.map((p) => data({ kind, ...p })),
    });
    return `### Pick: ${o.id} · ${o.name}\nOption \`${o.id}\` · ${head(kind)}\n${quote}${list}\nPosted from Wayfinder's canvas viewer. #${canvas.pickTicket.number} stays open until the grilling session records the decision.\n\n<!-- wayfinder:pick v1 ${json} -->`;
  }

  /** Just enough Markdown for the two formats above, so previews look like GitHub will. */
  function render(md) {
    const inline = (t) =>
      Kit.esc(t)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/_\(([^)]+)\)_|_([^_]+)_/g, (_, a, b) => `<em>${a ? `(${a})` : b}</em>`)
        .replace(/(^|[^&\w])#(\d+)/g, '$1<a href="#" data-to="GitHub issue #$2">#$2</a>');
    const out = [];
    let list = null;
    for (const line of md.split('\n')) {
      if (line.startsWith('<!--')) continue;
      const item = /^\d+\. (.*)$/.exec(line);
      if (item) {
        list ??= [];
        list.push(`<li>${inline(item[1])}</li>`);
        continue;
      }
      if (list) {
        out.push(`<ol>${list.join('')}</ol>`);
        list = null;
      }
      if (line.startsWith('### ')) out.push(`<h3>${inline(line.slice(4))}</h3>`);
      else if (line.startsWith('> ')) out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
      else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
    }
    if (list) out.push(`<ol>${list.join('')}</ol>`);
    return out.join('');
  }

  /** A comment as it will look (or looks) on GitHub, with a Markdown view of the exact text. */
  function commentCard(ticket, md, { posted = false, id = '' } = {}) {
    return `<article class="p210-gh" aria-label="${posted ? 'Posted' : 'Comment'} on #${ticket.number}">
      <header class="p210-gh-head"><span class="p210-gh-av" aria-hidden="true">R</span><span><b>ramon</b> ${posted ? 'commented just now' : 'will comment'} on <a href="#" data-to="GitHub issue #${ticket.number}">#${ticket.number}</a> <span class="p210-gh-t">${Kit.esc(ticket.title)}</span></span>
      ${posted ? `<a class="ghost p210-sm" href="#" data-to="GitHub issue #${ticket.number}"><span data-icon="external"></span>Open</a>` : ''}</header>
      <div class="p210-gh-tabs segmented" role="group" aria-label="Preview of the comment on #${ticket.number}"><button type="button" class="seg is-on" aria-pressed="true" data-view="rendered" data-card="${id}">Preview</button><button type="button" class="seg" aria-pressed="false" data-view="markdown" data-card="${id}">Markdown</button></div>
      <div class="p210-gh-body" data-body="${id}">${render(md)}</div>
      <pre class="p210-gh-md" data-md="${id}" hidden>${Kit.esc(md)}</pre>
    </article>`;
  }

  return { canvas, samplePins, samplePick, opt, notesComment, pickComment, render, commentCard, where };
})();
