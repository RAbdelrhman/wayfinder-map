import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const eslint = new ESLint();

beforeAll(async () => {
  await eslint.calculateConfigForFile('src/ui/lintProbe.ts');
}, 30_000);

describe('HTML injection lint boundary', () => {
  it.each([
    'el.innerHTML = x;',
    'el.outerHTML = x;',
    'el.innerHTML += x;',
    "el['innerHTML'] = x;",
    "el['outerHTML'] = x;",
    "el.insertAdjacentHTML('beforeend', x);",
    "el['insertAdjacentHTML']('beforeend', x);",
    'const insert = el.insertAdjacentHTML;',
    'document.write(x);',
    "document['write'](x);",
    'window.document.write(x);',
  ])('rejects %s in production code, tests, and scripts', async (code) => {
    for (const filePath of ['src/ui/lintProbe.ts', 'src/ui/lintProbe.test.ts', 'scripts/lintProbe.mjs']) {
      const results = await eslint.lintText(code, { filePath });
      expect(results[0]?.messages.filter((message) => message.ruleId === 'no-restricted-syntax')).toEqual([
        expect.objectContaining({ severity: 2, message: expect.stringContaining('src/ui/trustedHtml.ts') }),
      ]);
    }
  });

  it('permits direct HTML injection only in the sink module', async () => {
    const results = await eslint.lintText('el.innerHTML = x; el.insertAdjacentHTML("beforeend", x);', { filePath: 'src/ui/trustedHtml.ts' });
    expect(results[0]?.messages.filter((message) => message.ruleId === 'no-restricted-syntax')).toEqual([]);
  });

  it('permits HTML reads and calls to the trusted sink', async () => {
    const results = await eslint.lintText('setTrustedHtml(el, el.innerHTML); insertTrustedHtml(el, "beforeend", x);', { filePath: 'src/ui/lintProbe.ts' });
    expect(results[0]?.messages.filter((message) => message.ruleId === 'no-restricted-syntax')).toEqual([]);
  });
});
