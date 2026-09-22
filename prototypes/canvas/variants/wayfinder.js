/*
  Fake data, icons and shared behaviour for the /new-map flows (#44). Project-specific: the
  canvas and kit.js know nothing about it. Load after ../kit/kit.js. PROTOTYPE, throw away.
*/
window.FIXTURES = {
  login: 'ramon',
  recents: ['RAbdelrhman/wayfinder-map', 'RAbdelrhman/podcontrol', 'entelech/ecpl-lockstep'],
  repositories: {
    'RAbdelrhman/wayfinder-map': {
      clone: { status: 'ready', path: 'C:\\Users\\ramon\\code\\wayfinder-map' },
      maps: [
        { number: 35, title: 'Redesign Home and Start a new map', done: 4, total: 24 },
        { number: 14, title: 'Installable desktop app with the CLI still available', done: 9, total: 11 },
      ],
    },
    'RAbdelrhman/podcontrol': {
      clone: { status: 'choose', candidates: ['C:\\Users\\ramon\\code\\podcontrol', 'D:\\work\\podcontrol-old'] },
      maps: [{ number: 3, title: 'Offline playlists', done: 11, total: 17 }],
    },
    'entelech/ecpl-lockstep': {
      clone: { status: 'missing', candidates: [] },
      maps: [],
    },
    'RAbdelrhman/pdfbuilder': {
      clone: { status: 'ready', path: 'C:\\Users\\ramon\\code\\pdfbuilder' },
      maps: [{ number: 1, title: 'Template editor', done: 9, total: 12 }],
    },
  },
  tickets: {
    42: { number: 42, title: 'How should navigation show where you are and where you can go?', map: 35, state: 'frontier', assignee: null },
    52: { number: 52, title: 'Redesign the Home view', map: 35, state: 'blocked', assignee: null },
    61: { number: 61, title: 'Crash when the clone path has a space in it', map: null, state: 'frontier', assignee: null },
  },
  models: [
    // The same three tiers as a ticket's "Run as", each with its default model from Settings.
    { id: 'simple', label: 'Simple', detail: 'Small, well-scoped changes', model: 'Sonnet 5 · medium' },
    { id: 'mid', label: 'Mid', detail: 'Most tickets', model: 'Opus 5 · high' },
    { id: 'hard', label: 'Hard', detail: 'Research, design, gnarly bugs', model: 'Fable 5 · xhigh' },
  ],
};

// Wayfinder's own icons, from src/ui/icons.ts.
Object.assign(Kit.icons, {
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  home: '<path d="m3 10.5 9-7 9 7"/><path d="M5.5 9.2V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  repo: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v18H6.5A1.5 1.5 0 0 1 5 19.5z"/><path d="M5 16.5A1.5 1.5 0 0 1 6.5 15H19"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  play: '<path d="M7 4v16l13-8z" fill="currentColor"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  folder:
    '<path d="M4 20a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5l2 2.5h8a1 1 0 0 1 1 1V10"/><path d="m3.6 19.6 2.3-7.2a1 1 0 0 1 1-.7h13.5a1 1 0 0 1 1 1.3l-2 6.3a1 1 0 0 1-1 .7H4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
  list: '<path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/><path d="M8.5 6H20"/><path d="M8.5 12H20"/><path d="M8.5 18H20"/>',
  graph: '<rect x="3" y="4" width="7" height="6" rx="1.5"/><rect x="14" y="14" width="7" height="6" rx="1.5"/><path d="M10 7h1.5a2.5 2.5 0 0 1 2.5 2.5V14"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  ticket: '<circle cx="12" cy="12" r="7.4"/><path d="M8.6 12h6.8"/>',
});

/** Shared behaviour for the flows. Everything is in memory; nothing leaves the page. */
window.NM = (() => {
  const F = window.FIXTURES;
  const esc = Kit.esc;
  const icon = Kit.icon;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const short = (repo) => repo.split('/')[1] ?? repo;
  const known = (repo) => F.repositories[repo] ?? null;

  /** A repo's identity square, like chrome.ts draws it. */
  function repoMark(repo) {
    const hues = [212, 145, 28, 280, 350, 190];
    const hue = hues[[...repo].reduce((sum, c) => sum + c.charCodeAt(0), 0) % hues.length];
    return `<span class="nm-mark" style="--hue:${hue}">${esc(short(repo).slice(0, 1).toUpperCase())}</span>`;
  }

  /** Where T3 Code would run: 'checking' first, then the fixture's answer. Unknown repos have no clone. */
  async function workspace(repo) {
    await wait(450);
    return known(repo)?.clone ?? { status: 'missing', candidates: [] };
  }

  /** Parse "#42", "42" or an issue URL into a fixture ticket, or null. */
  function parseTicket(text) {
    const match = /^\s*(?:#?(\d+)|https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/(\d+))\s*$/.exec(text);
    if (!match) return null;
    const number = Number(match[1] ?? match[2]);
    return F.tickets[number] ?? { number, title: 'An issue outside the fixtures', map: null, state: 'frontier', assignee: null };
  }

  const STATE = { frontier: 'Next up', blocked: 'Blocked', claimed: 'Claimed', done: 'Done' };

  function ticketCard(ticket) {
    return `<div class="nm-ticket">
      <span class="nm-dot" style="--c:var(--state-${ticket.state})"></span>
      <span class="grow"><strong>#${ticket.number} ${esc(ticket.title)}</strong>
        <small>${STATE[ticket.state]}${ticket.map ? ` · on map #${ticket.map}` : ' · not on a map'} · ${ticket.assignee ? `@${esc(ticket.assignee)}` : 'unclaimed'}</small></span>
    </div>`;
  }

  /**
   * The clone line: one row that says where T3 Code will run, and lets you fix it in place.
   * Calls onReady(path) when a clone is settled.
   */
  function cloneLine(el, repo, onReady) {
    let state = 'checking';
    let info = null;
    const paint = () => {
      if (!repo) {
        el.innerHTML = '';
        return;
      }
      if (state === 'checking') {
        el.innerHTML = `<div class="nm-clone is-checking"><span class="nm-spin"></span><span class="grow">Looking for a local clone of ${esc(short(repo))}…</span></div>`;
      } else if (info.status === 'ready') {
        el.innerHTML = `<div class="nm-clone is-ready">${icon('check')}<span class="grow">Runs in <code>${esc(info.path)}</code></span>
          <button type="button" class="linkish" data-act="change">Change</button></div>`;
      } else if (info.status === 'choose') {
        el.innerHTML = `<div class="nm-clone is-choose">${icon('folder')}<span class="grow">Found ${info.candidates.length} clones. Which one should T3 Code use?</span></div>
          <div class="nm-clone-pick">${info.candidates
            .map((path, i) => `<label class="nm-radio"><input type="radio" name="clone-${el.id}" value="${esc(path)}" ${i === 0 ? 'checked' : ''}/><code>${esc(path)}</code></label>`)
            .join('')}
            <div class="nm-row"><button type="button" class="primary" data-act="use">Use this clone</button>
            <button type="button" class="ghost" data-act="browse">${icon('folder')}Another folder…</button></div></div>`;
      } else {
        el.innerHTML = `<div class="nm-clone is-missing">${icon('alert')}<span class="grow">No local clone of ${esc(short(repo))} yet. T3 Code needs one to work in.</span></div>
          <div class="nm-clone-pick"><div class="nm-row"><button type="button" class="primary" data-act="browse">${icon('folder')}Choose a folder…</button>
          <button type="button" class="ghost" data-act="clone">Clone it for me</button></div>
          <p class="nm-hint">You can still copy the prompt and run it yourself.</p></div>`;
      }
      Kit.fillIcons(el);
    };
    const settle = (path) => {
      info = { status: 'ready', path };
      paint();
      onReady(path);
    };
    el.onclick = (event) => {
      const act = event.target.closest('[data-act]')?.dataset.act;
      if (act === 'use') settle(el.querySelector('input:checked').value);
      if (act === 'browse') settle(`C:\\Users\\ramon\\code\\${short(repo)}`);
      // "Clone it for me" asks where, every time; nothing is remembered.
      if (act === 'clone') {
        el.innerHTML = `<div class="nm-clone is-choose">${icon('folder')}<span class="grow">Where should the clone go?</span></div>
          <div class="nm-clone-pick"><div class="nm-row"><code class="nm-where grow">C:\\Users\\ramon\\code\\${esc(short(repo))}</code>
          <button type="button" class="ghost" data-act="where">Change…</button></div>
          <div class="nm-row"><button type="button" class="primary" data-act="clone-here">Clone here</button>
          <button type="button" class="linkish" data-act="back">Back</button></div></div>`;
        Kit.fillIcons(el);
      }
      if (act === 'where') Kit.toast('Would open a folder picker');
      if (act === 'back') paint();
      if (act === 'clone-here') {
        const path = el.querySelector('.nm-where').textContent;
        el.innerHTML = `<div class="nm-clone is-checking"><span class="nm-spin"></span><span class="grow">Cloning ${esc(repo)} into <code>${esc(path)}</code>…</span></div>`;
        setTimeout(() => settle(path), 900);
      }
      if (act === 'change') {
        info = { status: 'choose', candidates: [info.path, `D:\\work\\${short(repo)}`] };
        onReady(null);
        paint();
      }
    };
    onReady(null);
    paint();
    // Only the latest ask for this element counts.
    const ask = (el.nmAsk = (el.nmAsk ?? 0) + 1);
    if (repo)
      workspace(repo).then((answer) => {
        if (ask !== el.nmAsk) return;
        state = 'done';
        info = answer;
        paint();
        if (answer.status === 'ready') onReady(answer.path);
      });
  }

  /** A combobox over the fixture repos plus anything typed as owner/name. Calls onPick(repo|null). */
  function repoPicker(input, menu, onPick) {
    const all = () => [...new Set([...F.recents, ...Object.keys(F.repositories)])];
    const valid = (text) => (/^[\w.-]+\/[\w.-]+$/.test(text.trim()) ? text.trim() : null);
    const show = () => {
      const q = input.value.trim().toLowerCase();
      const hits = all().filter((r) => r.toLowerCase().includes(q));
      menu.innerHTML = hits.map((r) => `<li role="option" data-repo="${esc(r)}">${repoMark(r)}<span class="grow">${esc(r)}</span>${F.recents.includes(r) ? '<small>recent</small>' : ''}</li>`).join('');
      menu.hidden = hits.length === 0;
    };
    input.addEventListener('focus', show);
    input.addEventListener('input', () => {
      show();
      onPick(valid(input.value));
    });
    input.addEventListener('blur', () => setTimeout(() => (menu.hidden = true), 150));
    menu.addEventListener('mousedown', (event) => {
      const repo = event.target.closest('[data-repo]')?.dataset.repo;
      if (!repo) return;
      input.value = repo;
      menu.hidden = true;
      onPick(repo);
    });
  }

  /**
   * The moment of handing off, then a result that stays on the page until you leave.
   * kind: 'map' | 'ticket'. Resolves when the fake thread has started.
   */
  async function handOff(el, { kind, repo, clone, subject, model }) {
    const steps = [
      'Writing the prompt',
      `Opening a worktree in ${short(repo)}`,
      kind === 'map' ? 'Starting the planning thread' : `Starting work on #${subject}`,
    ];
    const paint = (done) =>
      (el.innerHTML = `<div class="nm-result is-working" role="status">
        <div class="nm-result-head"><span class="nm-spin"></span><strong>Handing off to T3 Code…</strong></div>
        <ol class="nm-steps">${steps.map((s, i) => `<li class="${i < done ? 'is-done' : i === done ? 'is-now' : ''}">${i < done ? icon('check') : '<span class="nm-bullet"></span>'}${esc(s)}</li>`).join('')}</ol></div>`);
    for (let i = 0; i < steps.length; i += 1) {
      paint(i);
      await wait(550);
    }
    const branch = kind === 'map' ? 'wayfinder/new-map-draft-mode' : `wayfinder/${subject}-ticket`;
    el.innerHTML = resultHtml({ kind, repo, clone, subject, model, branch });
    Kit.fillIcons(el);
  }

  function resultHtml({ kind, repo, clone, subject, model, branch }) {
    const title = kind === 'map' ? 'Planning thread started' : `#${subject} is with T3 Code`;
    const next =
      kind === 'map'
        ? 'T3 Code is interviewing you about the goal. Answer there; the map shows up in Wayfinder once the issues exist.'
        : 'T3 Code claimed the ticket and is working in its own worktree. It will open a PR when it is done.';
    return `<div class="nm-result is-done" role="status">
      <div class="nm-result-head">${icon('check')}<strong>${esc(title)}</strong><span class="nm-when">just now</span></div>
      <p>${esc(next)}</p>
      <dl class="nm-facts">
        <dt>Repository</dt><dd>${esc(repo)}</dd>
        <dt>Worktree</dt><dd><code>${esc(clone)}</code></dd>
        <dt>Branch</dt><dd><code>${esc(branch)}</code></dd>
        <dt>Model</dt><dd>${esc(model)}</dd>
      </dl>
      <div class="nm-row">
        <a class="primary" href="#" data-to="the thread in T3 Code">${icon('external')}Open in T3 Code</a>
        <button type="button" class="ghost" onclick="Kit.toast('Copied the prompt')">${icon('copy')}Copy prompt</button>
        <span class="grow"></span>
        <a class="linkish" href="#" data-to="${kind === 'map' ? 'Home, where this thread is listed as in flight' : `map #35 with #${subject} highlighted`}">${kind === 'map' ? 'Back to Home' : 'Back to the map'}</a>
      </div>
    </div>`;
  }

  return { esc, icon, wait, short, known, repoMark, workspace, parseTicket, ticketCard, cloneLine, repoPicker, handOff, resultHtml };
})();
