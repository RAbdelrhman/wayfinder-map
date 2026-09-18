import { describe, expect, it } from 'vitest';

import { listItemCount, renderMarkdown } from './markdown.js';

describe('renderMarkdown', () => {
  it('renders bold lead-ins in a bullet list', () => {
    expect(renderMarkdown('- **Remembering state.** Recent repos.\n- **Accounts.** Several.')).toBe(
      '<ul><li><strong>Remembering state.</strong> Recent repos.</li><li><strong>Accounts.</strong> Several.</li></ul>',
    );
  });

  it('joins wrapped lines into one paragraph and splits on blank lines', () => {
    expect(renderMarkdown('one\ntwo\n\nthree')).toBe('<p>one two</p><p>three</p>');
  });

  it('folds an indented continuation into the list item above it', () => {
    expect(renderMarkdown('- first\n  still first\n- second')).toBe('<ul><li>first still first</li><li>second</li></ul>');
  });

  it('renders headings, numbered lists and task boxes', () => {
    expect(renderMarkdown('## Parent\n1. a\n2. b')).toBe('<h4>Parent</h4><ol><li>a</li><li>b</li></ol>');
    expect(renderMarkdown('- [ ] todo\n- [x] done')).toBe('<ul><li>☐ todo</li><li>☑ done</li></ul>');
  });

  it('leaves code spans and fences alone', () => {
    expect(renderMarkdown('run `**not bold**` now')).toBe('<p>run <code>**not bold**</code> now</p>');
    expect(renderMarkdown('```\n<b>x</b>\n```')).toBe('<pre><code>&lt;b&gt;x&lt;/b&gt;</code></pre>');
  });

  it('escapes html and only links http urls', () => {
    expect(renderMarkdown('<img src=x onerror=alert(1)>')).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>');
    expect(renderMarkdown('[a](https://x.dev/p) [b](javascript:alert(1))')).toBe(
      '<p><a href="https://x.dev/p" target="_blank" rel="noreferrer">a</a> [b](javascript:alert(1))</p>',
    );
  });
});

describe('listItemCount', () => {
  it('counts bullets and numbered items only', () => {
    expect(listItemCount('intro\n- a\n- b\n1. c')).toBe(3);
    expect(listItemCount('just prose')).toBe(0);
  });
});
