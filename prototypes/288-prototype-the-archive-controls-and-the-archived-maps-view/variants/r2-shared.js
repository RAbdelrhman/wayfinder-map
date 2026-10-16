/*
  Round 2 (#288): fixtures and drawing helpers shared by options C and D.
  In-memory only: no GitHub calls, no saved preferences. Markup reuses the app's real
  classes (wf-map, wf-counts, node, segmented, navigation, toast) from src/ui/styles.css.
*/
window.R2 = (() => {
  const esc = Kit.esc;

  Object.assign(Kit.icons, {
    check: '<path d="M20 6 9 17l-5-5"/>',
    lock: '<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    person: '<path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="7" r="4"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    back: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
    lens: '<circle cx="11" cy="11" r="6.4"/><path d="m20 20-4.4-4.4"/>',
    bolt: '<path d="M13 2 4.5 13.5H12L11 22l8.5-11.5H12z"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.9-3.5L3 10"/><path d="M3 4v6h6"/><path d="M4 13a8 8 0 0 0 14.9 3.5L21 14"/><path d="M21 20v-6h-6"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>',
    beaker: '<path d="M9 3h6M10 3v6L4.5 19a1.3 1.3 0 0 0 1.2 2h12.6a1.3 1.3 0 0 0 1.2-2L14 9V3"/><path d="M7 15h10"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"/><path d="M10 13h4"/>',
    restore: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h3M19 9v10a1 1 0 0 1-1 1h-3"/><path d="m9 15 3-3 3 3M12 12v9"/>',
    closed: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5.5"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4.5L17 13H5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    alert: '<path d="m12 3 9 16H3z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
  });

  /** The fixture's clock: every "ago" is measured from here, so screenshots stay stable. */
  const NOW = Date.parse('2026-10-15T12:00:00Z');
  const NOW_ISO = '2026-10-15T12:00:00Z';

  const STATE = {
    frontier: { label: 'next', long: 'Next up', v: '--state-frontier', icon: 'arrow' },
    claimed: { label: 'claimed', long: 'Claimed', v: '--state-claimed', icon: 'person' },
    blocked: { label: 'blocked', long: 'Blocked', v: '--state-blocked', icon: 'lock' },
    done: { label: 'done', long: 'Done', v: '--state-done', icon: 'check' },
  };
  const STATE_ORDER = ['frontier', 'claimed', 'blocked', 'done'];
  const PROGRESS_ORDER = ['done', 'claimed', 'frontier', 'blocked'];

  /** The four kinds of archive from docs/design/map-archive.md, in the order the contract resolves overlaps. */
  const REASONS = {
    manual: {
      label: 'Archived by you',
      short: 'By you',
      icon: 'person',
      why: () => 'You archived this map.',
      back: 'Stays archived until you restore it, even if a ticket reopens.',
      rule: 'Stays until you restore it.',
      returns: 'Only when you restore it, even if a ticket reopens.',
    },
    closed: {
      label: 'Closed',
      short: 'Closed',
      icon: 'closed',
      why: (map) => {
        const open = map.tickets.filter((t) => t.state !== 'done').length;
        return open === 0 ? 'The map issue is closed on GitHub.' : `The map issue is closed on GitHub, with ${open} ticket${open === 1 ? '' : 's'} still open.`;
      },
      back: 'Comes back if the map issue reopens.',
      rule: 'The map issue is closed on GitHub.',
      returns: 'If the map issue reopens, or when you restore it.',
    },
    finished: {
      label: 'Finished',
      short: 'Finished',
      icon: 'flag',
      why: (map) => `All ${map.tickets.length} tickets are done.`,
      back: 'Comes back if a ticket reopens or an open ticket is added.',
      rule: 'Every ticket on the map is done.',
      returns: 'If a ticket reopens or an open ticket is added, or when you restore it.',
    },
    idle: {
      label: 'Idle 30 days',
      short: 'Idle',
      icon: 'clock',
      why: (map) => `Nothing on the map or its tickets has changed since ${day(map.lastChange)}.`,
      back: 'Comes back as soon as something on it changes.',
      rule: 'Nothing changed for 30 days.',
      returns: 'As soon as something on it changes, or when you restore it.',
    },
  };
  const REASON_ORDER = ['manual', 'closed', 'finished', 'idle'];

  const t = (number, title, state, col, row, deps = []) => ({ number, title, state, col, row, deps });

  const INITIAL = [
    {
      number: 251, title: 'Show running hand-offs on Home', open: true, visibility: 'private', running: 1, needsYou: 1, autoMap: true,
      destination: 'Home shows every running hand-off and what it needs from you, so nothing stalls unseen.',
      archive: null, lastChange: '2026-10-15',
      tickets: [
        t(252, 'Decide what a hand-off card shows', 'done', 0, 0), t(253, 'Read hand-off status on Home', 'done', 0, 1),
        t(254, 'Group hand-offs by what they need', 'done', 1, 0, [252, 253]), t(255, 'Prototype the Home hand-off lane', 'claimed', 1, 1, [253]),
        t(256, 'Link a card to its T3 thread', 'frontier', 2, 0, [254]), t(257, 'Show CI and review state on a card', 'frontier', 2, 1, [254, 255]),
        t(258, 'Build the approved lane', 'blocked', 3, 0, [256, 257]),
      ],
    },
    {
      number: 236, title: 'Help new users understand Wayfinder', open: true, visibility: 'public', running: 0, needsYou: 0, autoMap: false,
      destination: 'A new user goes from a goal to a map to a ready-ticket hand-off without reading the docs.',
      archive: null, lastChange: '2026-10-14',
      tickets: [
        t(237, 'Interview three first-time users', 'done', 0, 0), t(238, 'Map the first ten minutes', 'done', 0, 1),
        t(239, 'Write the empty Home copy', 'done', 1, 0, [237]), t(240, 'Explain a map in one picture', 'done', 1, 1, [238]),
        t(244, 'Prototype the first-run tour', 'done', 1, 2, [238]), t(245, 'Pick the tour layout', 'done', 2, 0, [244, 239]),
        t(246, 'Build the first-run tour', 'done', 2, 1, [245, 240]), t(247, 'Show a sample map', 'claimed', 3, 0, [246]),
        t(248, 'Hand off a sample ticket', 'frontier', 3, 1, [246]), t(249, 'Measure tour completion', 'blocked', 4, 0, [247, 248]),
      ],
    },
    {
      number: 210, title: 'Review canvas options together', open: true, visibility: 'private', running: 0, needsYou: 0, autoMap: false,
      destination: 'Ramon and an agent pick a visual direction on one canvas before anything gets built.',
      archive: null, lastChange: '2026-10-12',
      tickets: [
        t(211, 'Serve canvases in the viewer', 'done', 0, 0), t(212, 'Present one option full size', 'done', 0, 1),
        t(213, 'Record Keep, Change or Combine', 'done', 1, 0, [211, 212]), t(214, 'Pin a note to an option', 'frontier', 1, 1, [212]),
        t(215, 'Compare two rounds', 'frontier', 2, 0, [213]), t(216, 'Send feedback to the thread', 'blocked', 2, 1, [213, 214]),
        t(217, 'Show approved layouts on the map', 'blocked', 3, 0, [215, 216]), t(218, 'Retire the legacy board', 'blocked', 3, 1, [216]),
      ],
    },
    {
      number: 134, title: 'Improve repository navigation', open: true, visibility: 'private', running: 1, needsYou: 0, autoMap: true,
      destination: 'Every repository and its maps are two clicks from anywhere in the app.',
      archive: { reason: 'manual', since: '2026-10-13T09:20:00Z' }, lastChange: '2026-10-13',
      tickets: [
        t(135, 'Audit how people switch repositories', 'done', 0, 0), t(136, 'Sketch the sidebar tree', 'done', 0, 1),
        t(137, 'Remember expanded repositories', 'done', 1, 0, [136]), t(138, 'Add the repository switcher', 'done', 1, 1, [135, 136]),
        t(139, 'Show map rings in the tree', 'done', 1, 2, [136]), t(140, 'Jump to any map with Ctrl K', 'claimed', 2, 0, [138]),
        t(141, 'Keep the tree scrolled to you', 'done', 2, 1, [137]), t(142, 'Collapse the sidebar to a rail', 'frontier', 2, 2, [139]),
        t(143, 'Search tickets from the jump menu', 'frontier', 3, 0, [140]), t(144, 'Recent maps on top', 'blocked', 3, 1, [140, 141]),
        t(145, 'Keyboard map for the tree', 'blocked', 4, 0, [143, 144]),
      ],
    },
    {
      number: 121, title: 'Watch maps and stay up to date', open: false, visibility: 'private', running: 0, needsYou: 0, autoMap: false,
      destination: 'Changes to a map show up in the app without a manual refresh.',
      archive: { reason: 'closed', since: '2026-10-10T16:05:00Z' }, lastChange: '2026-10-10',
      tickets: [
        t(122, 'Poll each open map with an ETag', 'done', 0, 0), t(123, 'Back off on rate limits', 'done', 0, 1),
        t(124, 'Diff tickets into map events', 'done', 1, 0, [122]), t(125, 'Persist the last snapshot', 'done', 1, 1, [122, 123]),
        t(126, 'Read PR and check state', 'done', 2, 0, [124]), t(127, 'Notify on newly ready tickets', 'done', 2, 1, [124, 125]),
        t(128, 'Show a live dot on the map', 'done', 3, 0, [126, 127]), t(129, 'Watch followed maps', 'frontier', 3, 1, [127]),
        t(130, 'Pause watching on battery', 'frontier', 4, 0, [128]),
      ],
    },
    {
      number: 208, title: 'Bring notifications into one inbox', open: true, visibility: 'public', running: 0, needsYou: 0, autoMap: false,
      destination: 'One inbox for everything that needs you, across every map.',
      archive: { reason: 'finished', since: '2026-10-07T11:40:00Z' }, lastChange: '2026-10-07',
      tickets: [
        t(219, 'List the alerts people miss', 'done', 0, 0), t(220, 'Merge alerts with map events', 'done', 1, 0, [219]),
        t(221, 'Lock the inbox across tabs', 'done', 1, 1, [219]), t(222, 'Native toasts on desktop', 'done', 2, 0, [220]),
        t(223, 'Badge the dock icon', 'done', 2, 1, [220, 221]), t(224, 'Mark all as read', 'done', 3, 0, [222]),
        t(225, 'Per-kind notification settings', 'done', 3, 1, [223]), t(226, 'Clear on open', 'done', 4, 0, [224]),
        t(227, 'Inbox keyboard shortcuts', 'done', 4, 1, [225]),
      ],
    },
    {
      number: 165, title: 'Explore parallel hand-offs', open: true, visibility: 'private', running: 0, needsYou: 0, autoMap: false,
      destination: 'Several ready tickets start at once without stepping on each other.',
      archive: { reason: 'idle', since: '2026-10-01T00:00:00Z' }, lastChange: '2026-09-01',
      tickets: [
        t(166, 'Measure hand-off collisions', 'done', 0, 0), t(167, 'Cap concurrent hand-offs', 'done', 0, 1),
        t(168, 'Plan a batch against the cap', 'done', 1, 0, [166, 167]), t(169, 'Separate worktrees per ticket', 'done', 1, 1, [167]),
        t(170, 'Stop on usage limits', 'frontier', 2, 0, [168]), t(171, 'Show a batch in progress', 'frontier', 2, 1, [168]),
        t(172, 'Retry one failed hand-off', 'frontier', 2, 2, [169]), t(173, 'Let Auto map start batches', 'blocked', 3, 0, [170, 171]),
        t(174, 'Tune the cap per model', 'blocked', 3, 1, [170]), t(175, 'Document the rhythm', 'blocked', 4, 0, [173, 174]),
      ],
    },
  ];

  const fresh = () => JSON.parse(JSON.stringify(INITIAL));

  function day(iso) {
    return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  /** "today", "2 days ago", "2 weeks ago": the same scale the repository page uses for Settled today. */
  function ago(iso) {
    const days = Math.floor(Math.max(0, NOW - Date.parse(iso)) / 86_400_000);
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 14) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} month${days < 60 ? '' : 's'} ago`;
  }

  const active = (maps) => maps.filter((m) => m.archive === null).sort((a, b) => Number(b.open) - Number(a.open) || b.number - a.number);
  const archived = (maps) => maps.filter((m) => m.archive !== null).sort((a, b) => b.archive.since.localeCompare(a.archive.since) || b.number - a.number);
  const matches = (map, query) => `#${map.number} ${map.title}`.toLowerCase().includes(query.trim().toLowerCase());

  function counts(map) {
    const out = { frontier: 0, claimed: 0, blocked: 0, done: 0 };
    for (const ticket of map.tickets) out[ticket.state] += 1;
    return out;
  }

  function countsHtml(map) {
    const c = counts(map);
    return `<div class="wf-counts" aria-label="Ticket counts">${STATE_ORDER.filter((s) => c[s] > 0)
      .map((s) => `<span style="--c: var(${STATE[s].v})"><i aria-hidden="true"></i>${c[s]} ${STATE[s].long.toLowerCase()}</span>`)
      .join('')}</div>`;
  }

  /** The 16px progress ring the sidebar tree and map switcher draw for a map. */
  function ring(map) {
    const c = counts(map);
    const total = map.tickets.length;
    const r = 6;
    const circ = 2 * Math.PI * r;
    let offset = 0;
    const arcs = PROGRESS_ORDER.filter((s) => c[s] > 0)
      .map((s) => {
        const length = (circ * c[s]) / total;
        const gap = total > 1 && c[s] < total ? 1.1 : 0;
        const arc = `<circle cx="8" cy="8" r="${r}" fill="none" stroke="var(${STATE[s].v})" stroke-width="2.4" stroke-dasharray="${Math.max(0, length - gap).toFixed(2)} ${circ.toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"/>`;
        offset += length;
        return arc;
      })
      .join('');
    return `<span class="mini-ring" aria-hidden="true"><svg viewBox="0 0 16 16" width="16" height="16">${arcs}</svg></span>`;
  }

  /** Layout units shared by the miniature graph and the opened map, so a map keeps its shape everywhere. */
  const COL = 260;
  const ROW = 96;
  const NODE_W = 210;
  const NODE_H = 72;
  const BAR = 44;
  const pos = (ticket) => ({ x: ticket.col * COL, y: ticket.row * ROW });

  function edgePaths(map, barOnly) {
    const byNumber = new Map(map.tickets.map((ticket) => [ticket.number, ticket]));
    return map.tickets
      .flatMap((ticket) =>
        ticket.deps.map((dep) => {
          const from = byNumber.get(dep);
          if (!from) return '';
          const a = pos(from);
          const b = pos(ticket);
          const x1 = a.x + NODE_W;
          const y1 = a.y + NODE_H / 2;
          const x2 = b.x;
          const y2 = b.y + NODE_H / 2;
          const mid = (x1 + x2) / 2;
          return `<path d="M${x1} ${y1}C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}"${barOnly ? '' : ''}/>`;
        }),
      )
      .join('');
  }

  function extent(map) {
    const cols = Math.max(...map.tickets.map((ticket) => ticket.col)) + 1;
    const rows = Math.max(...map.tickets.map((ticket) => ticket.row)) + 1;
    return { width: (cols - 1) * COL + NODE_W, height: (rows - 1) * ROW + NODE_H };
  }

  /** The repository page's miniature: every ticket as a slim bar in its state colour, same as miniGraphSvg. */
  function graphSvg(map, extraClass = '') {
    const { width, height } = extent(map);
    const pad = 48;
    const nodes = map.tickets
      .map((ticket) => {
        const p = pos(ticket);
        const v = STATE[ticket.state].v;
        const fill = ticket.state === 'done' ? 'var(--surface-1)' : `color-mix(in srgb, var(${v}) 30%, var(--surface-1))`;
        return `<rect x="${p.x}" y="${p.y + (NODE_H - BAR) / 2}" width="${NODE_W}" height="${BAR}" rx="12" style="fill:${fill};stroke:var(${v})"/>`;
      })
      .join('');
    return `<svg class="mini-graph ${extraClass}" viewBox="${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g class="mini-graph-edges">${edgePaths(map)}</g><g class="mini-graph-nodes">${nodes}</g></svg>`;
  }

  const nextTicket = (map) => map.tickets.find((ticket) => ticket.state === 'frontier');

  function visibility(map) {
    return `<p class="wf-visibility"><span class="wf-author">by RAbdelrhman</span>${map.visibility === 'public' ? '<span class="wf-vis-label">Public</span>' : '<span class="wf-vis-label"><span data-icon="lock" aria-hidden="true"></span>Private</span> <span class="wf-vis-note">Private in Wayfinder only. If the repository is public, this issue can still be read on GitHub.</span>'}</p>`;
  }

  const runningChip = (map) => (map.running > 0 ? `<span class="chip" style="--accent: var(--state-frontier)"><span data-icon="bolt" aria-hidden="true"></span>${map.running} running in T3 Code</span>` : '');

  /** The real repository card (src/ui/repositoryView.ts mapCard), with the option's Archive control where Settle sits today. */
  function mapCard(map, archiveControl) {
    const next = nextTicket(map);
    const label = `Open map #${map.number}: ${map.title}`;
    const done = map.tickets.filter((ticket) => ticket.state === 'done').length;
    const lead = !map.open
      ? `<span class="grow">Closed on GitHub · ${done} of ${map.tickets.length} tickets done</span>`
      : `<span class="grow">${next === undefined ? 'Nothing next up' : `<span class="chip" style="--accent: var(--state-frontier)"><span data-icon="arrow" aria-hidden="true"></span>next</span> <a href="#" data-to="ticket #${next.number}">#${next.number} ${esc(next.title)}</a>`}</span>`;
    const needs = map.needsYou > 0 ? `<a class="chip needs-you-chip" href="#" data-to="the ticket that needs you"><span data-icon="bell" aria-hidden="true"></span>${map.needsYou} needs you</a>` : '';
    return `<article class="wf-node wf-map${map.open ? '' : ' is-closed'}" data-map-card="${map.number}" style="--accent: var(${map.open ? '--state-claimed' : '--state-done'})">
      <a class="graph" href="#" data-open="${map.number}" aria-label="${esc(label)}" tabindex="-1">${graphSvg(map)}</a>
      <div class="txt">
        <p class="eyebrow">Map · #${map.number}${map.open ? '' : ' · closed'}</p>
        <h2><a href="#" data-open="${map.number}">${esc(map.title)}</a></h2>
        <p class="dest">${esc(map.destination)}</p>
        ${visibility(map)}
        ${countsHtml(map)}
        <div class="row2">${lead}${needs}${runningChip(map)}${archiveControl(map)}<a class="primary" href="#" data-open="${map.number}" aria-label="${esc(label)}">Open<span data-icon="arrow" aria-hidden="true"></span></a></div>
      </div>
    </article>`;
  }

  function mapCardSkeleton() {
    const bone = (w) => `<span class="wf-bone" style="--w: ${w}">&nbsp;</span>`;
    return `<div class="wf-node wf-map is-skeleton" aria-hidden="true"><div class="graph"></div><div class="txt"><p class="eyebrow">${bone('90px')}</p><h2>${bone('60%')}</h2><p class="dest">${bone('95%')}<br>${bone('70%')}</p><div class="wf-counts">${bone('64px')}${bone('72px')}${bone('56px')}</div><div class="row2"><span class="grow">${bone('45%')}</span><span class="wf-bone is-button" style="--w: 74px"></span></div></div></div>`;
  }

  const bone = (w) => `<span class="wf-bone" style="--w: ${w}">&nbsp;</span>`;

  const repoBadge = (size = 'is-lg') => `<span class="repo-icon-badge ${size} r2-mono" aria-hidden="true">W</span>`;

  /** The app's sidebar (src/ui/navigation.ts): archived maps stay out of the tree unless one is the page you are on. */
  function sidebar({ maps, current, archivedRow = '' }) {
    const shown = maps.filter((m) => m.archive === null || m.number === current);
    const rows = shown
      .sort((a, b) => b.number - a.number)
      .map((m) => {
        const on = m.number === current;
        return `<li><a class="row${on ? ' is-on' : ''}" href="#" data-open="${m.number}"${on ? ' aria-current="page"' : ''}>${ring(m)}<span class="grow">#${m.number} ${esc(m.title)}</span>${m.archive ? '<span class="r2-tree-tag" title="Archived">Archived</span>' : ''}</a></li>`;
      })
      .join('');
    return `<div class="side">
      <div class="side-head"><span class="logo"><span data-icon="compass" aria-hidden="true"></span></span><b>Wayfinder</b></div>
      <div class="side-actions"><a class="primary" href="#" data-to="New map"><span data-icon="plus" aria-hidden="true"></span>New map</a><button type="button" class="search" data-to="Jump to"><span data-icon="lens" aria-hidden="true"></span><span class="ph">Jump to…</span><kbd>Ctrl K</kbd></button></div>
      <div class="tree">
        <p class="tree-label">Repositories</p>
        <ul class="nav-tree">
          <li class="nav-repo"><div class="row is-trail"><span class="twist is-open" aria-hidden="true" data-icon="right"></span><a class="row-link" href="#" data-view="active">${repoBadge('')}<span class="grow">wayfinder-map</span></a></div>
            <ul class="kids">${rows}${archivedRow}</ul></li>
          <li class="nav-repo"><div class="row"><span class="twist" aria-hidden="true" data-icon="right"></span><a class="row-link" href="#" data-to="t3code">${'<span class="repo-icon-badge r2-mono is-alt" aria-hidden="true">T</span>'}<span class="grow">t3code</span></a></div></li>
          <li class="nav-repo"><div class="row"><span class="twist" aria-hidden="true" data-icon="right"></span><a class="row-link" href="#" data-to="dotfiles">${'<span class="repo-icon-badge r2-mono is-alt2" aria-hidden="true">D</span>'}<span class="grow">dotfiles</span></a></div></li>
        </ul>
      </div>
      <div class="nav-footer"><span class="r2-avatar" aria-hidden="true">R</span><span class="nav-account-label grow">RAbdelrhman</span><a class="iconbtn" href="#" data-to="Settings" aria-label="Settings"><span data-icon="gear" aria-hidden="true"></span></a></div>
    </div>`;
  }

  /** The map page's top bar: repository / map, then the Map, Table and Prototypes views. */
  function mapTopbar(map, badge = '') {
    return `<nav class="nav-map-scopes" aria-label="Map location"><button type="button" class="scope is-quiet" data-view="active" aria-label="Repository wayfinder-map">${repoBadge('is-sm')}<span class="t">wayfinder-map</span></button><span class="crumb-sep" aria-hidden="true">/</span><span class="scope r2-scope">${ring(map)}<span class="t">#${map.number} ${esc(map.title)}</span>${badge}</span></nav>
      <span class="topbar-spacer"></span>
      <nav class="segmented nav-map-tabs" aria-label="Map views"><a class="seg is-on" href="#" aria-current="page"><span data-icon="map" aria-hidden="true"></span><span class="seg-label">Map</span></a><a class="seg" href="#" data-to="Table view"><span data-icon="table" aria-hidden="true"></span><span class="seg-label">Table</span></a><a class="seg" href="#" data-to="Prototypes"><span data-icon="beaker" aria-hidden="true"></span><span class="seg-label">Prototypes</span></a></nav>`;
  }

  function repoTopbar(title) {
    return `<nav class="nav-map-scopes" aria-label="Location"><button type="button" class="scope is-quiet" data-view="active" aria-label="Repository wayfinder-map">${repoBadge('is-sm')}<span class="t">RAbdelrhman/wayfinder-map</span></button>${title ? `<span class="crumb-sep" aria-hidden="true">/</span><span class="scope r2-scope"><span data-icon="archive" aria-hidden="true"></span><span class="t">${esc(title)}</span></span>` : ''}</nav><span class="topbar-spacer"></span>`;
  }

  /** The opened map: its tickets where the map page puts them, as the real ticket nodes. */
  function mapBoard(map) {
    const { width, height } = extent(map);
    const pad = 40;
    const nodes = map.tickets
      .map((ticket) => {
        const p = pos(ticket);
        const s = STATE[ticket.state];
        return `<button type="button" class="node${ticket.state === 'done' ? ' is-done' : ''}" data-to="ticket #${ticket.number}" style="left:${p.x + pad}px;top:${p.y + pad}px;width:${NODE_W}px;height:${NODE_H}px;--accent: var(${s.v})"><span class="node-top"><span class="glyph" aria-hidden="true">T</span><span class="num">#${ticket.number}</span><span class="chip"><span data-icon="${s.icon}" aria-hidden="true"></span>${s.label}</span></span><span class="r2-node-title">${esc(ticket.title)}</span></button>`;
      })
      .join('');
    return `<div class="r2-board" role="region" aria-label="Ticket graph for map #${map.number}"><div class="r2-graph" style="width:${width + pad * 2}px;height:${height + pad * 2}px"><svg class="r2-edges" width="${width + pad * 2}" height="${height + pad * 2}" aria-hidden="true"><g transform="translate(${pad} ${pad})">${edgePaths(map)}</g></svg>${nodes}</div></div>`;
  }

  /** What archiving pauses and what keeps running, per docs/design/map-archive.md "Background activity". */
  function whileArchived(map) {
    const items = [`<li><span data-icon="eyeOff" aria-hidden="true"></span>Not watched for changes</li>`];
    if (map.autoMap) items.push(`<li><span data-icon="pause" aria-hidden="true"></span>Auto map paused; your setting is kept</li>`);
    if (map.running > 0) items.push(`<li><span data-icon="bolt" aria-hidden="true"></span>${map.running} hand-off still running in T3 Code and tracked</li>`);
    return items.join('');
  }

  /** What Restore leads to: a closed map comes back but stays unwatched until its issue reopens. */
  function restoredMessage(map) {
    return map.open ? `Restored #${map.number}. It stays active until you archive it again.` : `Restored #${map.number}. It stays active, unwatched until its issue reopens.`;
  }

  /** The app's toast, with one optional action. */
  let toastTimer;
  function toast(message, action) {
    let el = document.getElementById('r2-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'r2-toast';
      el.className = 'toast r2-toast';
      el.setAttribute('role', 'status');
      document.body.append(el);
    }
    el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
    el.hidden = false;
    if (action) el.querySelector('button').addEventListener('click', () => { el.hidden = true; action.run(); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), action ? 6000 : 3200);
  }

  /** Saving a choice takes a moment; the save-error fixture fails it. Tests set R2_SAVE_DELAY = 0. */
  function save(fails, done) {
    const delay = window.R2_SAVE_DELAY ?? 550;
    if (delay === 0) return done(!fails);
    setTimeout(() => done(!fails), delay);
  }

  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;

  /** Play an exit on an element, then continue. Instant when motion is reduced or saves are instant. */
  function leave(el, then) {
    if (!el || (window.R2_SAVE_DELAY ?? 550) === 0 || reducedMotion()) return then();
    el.classList.add('is-leaving');
    setTimeout(then, 230);
  }

  /** Wire the shared prototype bar: preview state and reset. */
  function tools(onChange, onReset) {
    const select = document.getElementById('fixture');
    select.addEventListener('change', () => onChange(select.value));
    document.getElementById('reset').addEventListener('click', () => {
      select.value = 'normal';
      onReset();
    });
  }

  return {
    NOW_ISO, STATE, REASONS, REASON_ORDER, fresh, day, ago, active, archived, matches, counts, countsHtml, ring, graphSvg,
    mapCard, mapCardSkeleton, bone, sidebar, mapTopbar, repoTopbar, mapBoard, whileArchived, restoredMessage, toast, save, leave, tools, repoBadge,
  };
})();
