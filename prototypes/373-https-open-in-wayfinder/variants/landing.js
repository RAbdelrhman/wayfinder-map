/* #373 landing page. Everything shown comes from the link's own path and query: no fetch, no GitHub data, no "opened" state. */
(function () {
  var HOST = 'https://wayfinder-links-pearl.vercel.app';
  // Real IDs: repo RAbdelrhman/wayfinder-map, map #217, ticket #373, and #359's board at a commit that touched it.
  var LINKS = {
    repo: '/open/repo/R_kgDOUfX94g',
    map: '/open/map/I_kwDOUfX94s8AAAABU1Jndg',
    ticket: '/open/ticket/I_kwDOUfX94s8AAAABbH5m2w',
    'proto-new': '/open/prototype/I_kwDOUfX94s8AAAABbH5m2w?canvas=prototypes%2F373-https-open-in-wayfinder%2Findex.html',
    'proto-rev': '/open/prototype/I_kwDOUfX94s8AAAABaeouwA?canvas=prototypes%2F359-prototype-unreadable-followed-maps-on-the-phone%2Findex.html&rev=f713a5ff54ea7965e9e00494844cce89797e8510&page=option-a',
    // Cut off when pasted: a prototype link without its canvas.
    invalid: '/open/prototype/I_kwDOUfX94s8AAAABbH5m2w',
  };
  var NOUN = { repo: 'repository', map: 'map', ticket: 'ticket', prototype: 'prototype' };
  var LABEL = { repo: 'Repository', map: 'Map', ticket: 'Ticket', prototype: 'Prototype' };
  var ICON = {
    repo: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/>',
    map: '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="12" r="2"/><circle cx="6" cy="18" r="2"/><path d="M8 6.5 16 11M8 17.5l8-4.5"/>',
    ticket: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h5"/>',
    prototype: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M8 13h3M8 16h6"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
  };
  // The app icon, from assets/wayfinder-icon.svg.
  var MARK = '<svg class="lp-mark" viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="112" fill="#0d1117"/><circle cx="256" cy="256" r="156" fill="#10151c" stroke="#30363d" stroke-width="24"/><path d="M164 348 224 224l124-60-60 124z" fill="#f0f6fc"/><path d="m224 224 124-60-60 124z" fill="#1f6feb"/><circle cx="256" cy="256" r="24" fill="#0d1117" stroke="#79c0ff" stroke-width="12"/></svg>';

  function icon(name) {
    return '<svg class="lp-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + '</svg>';
  }
  function esc(text) {
    return String(text).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; });
  }

  // A stand-in for the parser Sol already built: kind, id, and a prototype's canvas/rev/page/item.
  function parse(path) {
    var url = new URL(path, HOST);
    var parts = url.pathname.split('/');
    var kind = parts[2];
    if (parts.length !== 4 || !NOUN[kind] || !parts[3]) return null;
    var link = { kind: kind, id: decodeURIComponent(parts[3]), app: 'wayfinder://' + kind + '/' + parts[3] + url.search };
    if (kind === 'prototype') {
      link.canvas = url.searchParams.get('canvas');
      if (!link.canvas) return null;
      link.rev = url.searchParams.get('rev');
      link.page = url.searchParams.get('page');
      link.item = url.searchParams.get('item');
    }
    return link;
  }

  var FALLBACK = 'Nothing opened? <button type="button" class="lp-link" data-to="Wayfinder downloads">Install or update Wayfinder</button>, then try again.';

  function optionA(link) {
    if (!link) {
      return '<section class="lp-card" aria-labelledby="t">' + MARK +
        '<p class="lp-kind lp-kind-bad">' + icon('alert') + 'Link not recognized</p>' +
        '<h1 id="t">This link can’t be opened</h1>' +
        '<p class="lp-sub">It may have been cut off. Ask for the link again.</p></section>';
    }
    var sub = '';
    if (link.kind === 'prototype') {
      sub = '<p class="lp-sub">' + (link.rev ? 'Version ' + esc(link.rev.slice(0, 7)) : 'Newest version') +
        (link.page ? ' · page ' + esc(link.page) : '') + (link.item ? ' · ' + esc(link.item) : '') + '</p>';
    }
    return '<section class="lp-card" aria-labelledby="t">' + MARK +
      '<p class="lp-kind">' + icon(link.kind) + LABEL[link.kind] + '</p>' +
      '<h1 id="t">Open this ' + NOUN[link.kind] + ' in Wayfinder</h1>' + sub +
      '<button type="button" class="primary lp-open" data-to="' + esc(link.app) + '">Open in Wayfinder</button>' +
      '<p class="lp-fallback">' + FALLBACK + '</p></section>';
  }

  function optionB(link) {
    var head = '<header class="lp-top">' + MARK + '<span>Wayfinder</span></header>';
    if (!link) {
      return head + '<section class="lp-plain" aria-labelledby="t">' +
        '<h1 id="t">This link can’t be opened</h1>' +
        '<p class="lp-sub">It isn’t a complete Wayfinder link. It may have been cut off; ask for it again.</p></section>';
    }
    var rows = [['Kind', '<span class="lp-kind-inline">' + icon(link.kind) + LABEL[link.kind] + '</span>']];
    if (link.kind === 'prototype') {
      rows.push(['Version', link.rev ? '<code>' + esc(link.rev.slice(0, 7)) + '</code>' : 'Newest']);
      if (link.page) rows.push(['Page', '<code>' + esc(link.page) + '</code>']);
      if (link.item) rows.push(['Item', '<code>' + esc(link.item) + '</code>']);
    }
    rows.push(['ID', '<code>' + esc(link.id) + '</code>']);
    return head + '<section class="lp-plain" aria-labelledby="t">' +
      '<h1 id="t">Open in Wayfinder</h1>' +
      '<dl class="lp-facts">' + rows.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('') + '</dl>' +
      '<button type="button" class="primary lp-open" data-to="' + esc(link.app) + '">Open in Wayfinder</button>' +
      '<p class="lp-fallback">' + FALLBACK + '</p></section>';
  }

  var q = new URLSearchParams(location.search);
  var o = q.get('o') === 'B' ? 'B' : 'A';
  var link = parse(LINKS[q.get('d')] || LINKS.map);
  document.body.classList.add('lp', 'lp-' + o);
  document.getElementById('app').innerHTML = o === 'A' ? optionA(link) : optionB(link);
})();
