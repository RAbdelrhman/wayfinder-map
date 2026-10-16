import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Window } from 'happy-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const script = readFileSync(new URL('../../prototypes/314-prototype-an-in-viewer-confirmation-after-posting-canvas-feedbac/variants/viewer.js', import.meta.url), 'utf8');
const windows: Window[] = [];

function mount(query: string) {
  const window = new Window({ url: `http://localhost/viewer.html?${query}` });
  windows.push(window);
  const document = window.document;
  for (const id of ['viewer', 'live']) {
    const element = document.createElement('div');
    element.id = id;
    document.body.append(element);
  }
  runInNewContext(script, {
    document,
    location: window.location,
    URLSearchParams,
    setTimeout: vi.fn(),
    Kit: {
      esc: (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
      toast: vi.fn(),
    },
  });
  return document;
}

afterEach(async () => {
  await Promise.all(windows.splice(0).map(window => window.happyDOM.abort()));
});

describe('#314 confirmation prototype regressions', () => {
  it('rejects raw query markup before building the trusted prototype HTML', () => {
    const payload = '<img src=x onerror="alert(1)"><script>alert(1)</script>';
    const query = new URLSearchParams(Object.fromEntries(['dir', 'state', 'size', 'thread', 't3', 'fail', 't3fail'].map(key => [key, payload])));
    const document = mount(query.toString());
    expect(document.querySelector('script, [onerror]')).toBeNull();
    expect(document.body.textContent).not.toContain(payload);
    expect(document.getElementById('viewer')?.className).toContain('p314-dir-A');
    expect(document.querySelector('[data-act="post"]')?.textContent).toContain('Post to GitHub');
  });

  for (const direction of ['A', 'B', 'C', 'B2', 'B3']) {
    for (const size of ['full', 'pane']) {
      it(`${direction} ${size} explains failure and offers one retry with recoverable notes`, () => {
        const document = mount(`dir=${direction}&size=${size}&state=failed`);
        const retries = [...document.querySelectorAll('button')].filter(button => button.textContent?.trim() === 'Try again');
        expect(retries).toHaveLength(1);
        expect(document.querySelector('[role="alert"], #p314-pop')?.textContent).toContain('Your 3 notes are still here');
        expect(document.body.textContent).toContain('Overall I like A better.');
        expect(document.body.textContent).toContain('The box has too much space on the left.');
        expect(document.body.textContent).toContain('I like this look; open the change dialog when you click the letter.');
        expect(document.body.textContent).toContain('Check #292');
        retries[0]!.click();
        const post = document.querySelector('[data-act="post"]');
        expect(post?.hasAttribute('disabled')).toBe(true);
        expect(post?.getAttribute('aria-busy')).toBe('true');
      });
    }
  }

  for (const direction of ['B', 'B2', 'B3']) {
    it(`${direction} requires confirmation before a second post`, () => {
      const document = mount(`dir=${direction}&state=repost`);
      expect(document.querySelector('dialog')?.open).toBe(true);
      expect(document.querySelector('[data-act="dlg-cancel"]')?.hasAttribute('autofocus')).toBe(true);
      expect(document.body.textContent).toContain('Post these notes again?');
      [...document.querySelectorAll('button')].find(button => button.dataset.act === 'dlg-post')!.click();
      expect(document.querySelector('dialog')).toBeNull();
      expect(document.querySelector('[data-act="post"]')?.getAttribute('aria-busy')).toBe('true');
    });
  }
});
