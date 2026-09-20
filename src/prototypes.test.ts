import { describe, expect, it } from 'vitest';

import { isHtml, isSelfContained, parsePrototypeFilePath, prototypeFileUrl, prototypeTicketNumber } from './prototypes.js';

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
