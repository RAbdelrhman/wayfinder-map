import { describe, expect, it } from 'vitest';

import { PROTOTYPE_HOST_VERSION, PROTOTYPE_SNAPSHOT_FILE, canvasEntries, isHtml, isSelfContained, parsePrototypeFilePath, pickPreview, prototypeFileUrl, prototypePageUrl, prototypeTicketNumber, unlistedCanvasBoards } from './prototypes.js';

it('addresses cached files by SHA and viewer rendition, keeping relative assets in that prefix', () => {
  const sha = 'a'.repeat(40);
  const url = prototypeFileUrl('octo/one', 'prototype/207', 'prototypes/canvas/index.html', sha);
  expect(url).toContain(`/${sha}/${PROTOTYPE_HOST_VERSION}/`);
  const asset = new URL('canvas.js', 'http://localhost' + url).pathname;
  expect(parsePrototypeFilePath(asset)).toEqual({ repo: 'octo/one', branch: 'prototype/207', sha, renderVersion: PROTOTYPE_HOST_VERSION, file: 'prototypes/canvas/canvas.js' });
  expect(parsePrototypeFilePath(url.replace(`/${PROTOTYPE_HOST_VERSION}/`, '/'))).toEqual({ repo: 'octo/one', branch: 'prototype/207', sha, file: 'prototypes/canvas/index.html' });
});

it('keeps runtime page parameters out of the GitHub file path', () => {
  const url = prototypePageUrl('o/r', 'prototype/163', 'variants/inbox.html?sheet=1&v=C#tab-2', 'a'.repeat(40));
  const parsed = new URL(url, 'http://localhost');
  expect(parsed.search).toBe('?sheet=1&v=C');
  expect(parsed.hash).toBe('#tab-2');
  expect(parsePrototypeFilePath(parsed.pathname)?.file).toBe('variants/inbox.html');
});

describe('prototypeTicketNumber', () => {
  it('reads the ticket number off a conventional branch', () => {
    expect(prototypeTicketNumber('prototype/8-home-page')).toBe(8);
    expect(prototypeTicketNumber('prototype/17')).toBe(17);
  });

  it('ignores branches off the convention', () => {
    expect(prototypeTicketNumber('prototype/home-page')).toBeNull();
    expect(prototypeTicketNumber('prototype/8x-home')).toBeNull();
    expect(prototypeTicketNumber('wayfinder/8-home-page')).toBeNull();
  });
});

describe('isHtml', () => {
  it('picks out HTML files and nothing else', () => {
    expect(isHtml('docs/proto/flow.html')).toBe(true);
    expect(isHtml('INDEX.HTM')).toBe(true);
    expect(isHtml('src/app.ts')).toBe(false);
  });
});

describe('isSelfContained', () => {
  it('accepts a page that carries its own script and styles', () => {
    expect(isSelfContained('<html><style>b{}</style><script>go()</script></html>')).toBe(true);
  });

  it('accepts relative assets, which resolve under the branch', () => {
    expect(isSelfContained('<script type="module" src="./flow.js"></script>')).toBe(true);
  });

  it('rejects a page pulling assets from the app root, which are not on the branch', () => {
    expect(isSelfContained('<script type="module" src="/prototype.js"></script>')).toBe(false);
    expect(isSelfContained('<link rel="stylesheet" href="/styles.css" />')).toBe(false);
  });
});

describe('prototype file paths', () => {
  it('round-trips a repository, branch and nested file through the URL', () => {
    const url = prototypeFileUrl('RAbdelrhman/wayfinder-map', 'prototype/8-home page', 'docs/a b/index.html');
    expect(url).toBe('/proto/RAbdelrhman/wayfinder-map/prototype%2F8-home%20page/docs/a%20b/index.html');
    expect(parsePrototypeFilePath(url)).toEqual({
      repo: 'RAbdelrhman/wayfinder-map',
      branch: 'prototype/8-home page',
      file: 'docs/a b/index.html',
    });
  });

  it('refuses branches outside prototype/', () => {
    expect(parsePrototypeFilePath('/proto/owner/repo/main/index.html')).toBeNull();
    expect(parsePrototypeFilePath('/proto/owner/repo/wayfinder%2F8-x/index.html')).toBeNull();
  });

  it('refuses a path that names no repository', () => {
    expect(parsePrototypeFilePath('/proto/prototype%2F8-x/index.html')).toBeNull();
    expect(parsePrototypeFilePath('/proto/owner/..%2Frepo/prototype%2F8-x/index.html')).toBeNull();
  });

  it('refuses paths that climb out or name no file', () => {
    expect(parsePrototypeFilePath('/proto/owner/repo/prototype%2F8-x/../secret')).toBeNull();
    expect(parsePrototypeFilePath('/proto/owner/repo/prototype%2F8-x/%2E%2E/secret')).toBeNull();
    expect(parsePrototypeFilePath('/proto/owner/repo/prototype%2F8-x')).toBeNull();
    expect(parsePrototypeFilePath('/proto/owner/repo/prototype%2F8-x/')).toBeNull();
    expect(parsePrototypeFilePath('/proto/owner/repo/prototype%2F%E0/x.html')).toBeNull();
  });
});

describe('unlistedCanvasBoards', () => {
  it('discovers independent boards after only variants or assets change', () => {
    expect(unlistedCanvasBoards(['prototypes/home/variants/a.html', 'prototypes/home/assets/a.png', 'prototypes/onboarding/config.js']))
      .toEqual(['prototypes/home/index.html', 'prototypes/onboarding/index.html']);
  });
  it('finds a canvas board the diff left out because only its config changed', () => {
    expect(unlistedCanvasBoards(['prototypes/canvas/config.js', 'prototypes/canvas/variants/a.html'])).toEqual(['prototypes/canvas/index.html']);
    expect(unlistedCanvasBoards(['config.js'])).toEqual(['index.html']);
  });

  it('skips boards the diff already lists, and files that only end in config.js', () => {
    expect(unlistedCanvasBoards(['prototypes/canvas/config.js', 'prototypes/canvas/index.html'])).toEqual([]);
    expect(unlistedCanvasBoards(['src/vite-config.js'])).toEqual([]);
  });
});

describe('pickPreview', () => {
  it('keeps independent board URLs and prefers the current task over an inherited legacy board', () => {
    const boards = ['prototypes/canvas/index.html', 'prototypes/8-home/index.html'];
    const files = boards.flatMap((board) => [board, board.replace('index.html', 'config.js')]);
    expect(canvasEntries(boards, files)).toEqual(boards);
    expect(pickPreview(true, boards, files, boards[1])).toBe(boards[1]);
    expect(pickPreview(false, boards, files, 'missing/index.html')).toBe(boards[0]);
    expect(new Set(boards.map((board) => prototypeFileUrl('octo/repo', 'prototype/8-home', board))).size).toBe(2);
  });
  it('leads with the saved snapshot, which runs without the app', () => {
    expect(pickPreview(true, ['docs/flow.html'])).toBe(PROTOTYPE_SNAPSHOT_FILE);
  });

  it('falls back to the first standalone page on the branch', () => {
    expect(pickPreview(false, ['docs/flow.html', 'docs/other.html'])).toBe('docs/flow.html');
  });

  it('has nothing to show when neither exists', () => {
    expect(pickPreview(false, [])).toBeNull();
  });

  it('opens a design canvas board before anything else', () => {
    const openable = ['docs/notes.html', 'prototypes/canvas/index.html', 'prototypes/canvas/variants/a.html'];
    const files = [...openable, 'prototypes/canvas/config.js', 'prototypes/canvas/canvas.js'];
    expect(pickPreview(true, openable, files)).toBe('prototypes/canvas/index.html');
    expect(pickPreview(false, ['index.html'], ['index.html', 'config.js'])).toBe('index.html');
  });

  it('treats an index.html without a canvas config beside it as an ordinary page', () => {
    expect(pickPreview(false, ['docs/a.html', 'site/index.html'], ['docs/a.html', 'site/index.html', 'config.js'])).toBe('docs/a.html');
  });
});
