import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const eslint = new ESLint();
const sinkRules = new Set(['no-restricted-syntax', 'html-sinks/no-computed-injection']);

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
    'el[`innerHTML`] = x;',
    'el[`outerHTML`] = x;',
    'el[`innerHTML`] += x;',
    'el[`inn\\u0065rHTML`] = x;',
    'el[`inner${"HTML"}`] = x;',
    'el[`outer${"HTML"}`] = x;',
    'el[`inner${"HTML"}`] += x;',
    'const suffix = "HTML"; el[`inner${suffix}`] = x;',
    'el["inner" + "HTML"] = x;',
    'const key = "inner" + "HTML"; el[key] = x;',
    "el.insertAdjacentHTML('beforeend', x);",
    "el['insertAdjacentHTML']('beforeend', x);",
    'el[`insertAdjacentHTML`]("beforeend", x);',
    'const insert = el[`insertAdjacentHTML`];',
    'el[`insertAdjacent${"HTML"}`]("beforeend", x);',
    'const key = "insertAdjacentHTML"; const insert = el[key];',
    'const insert = el.insertAdjacentHTML;',
    'document.write(x);',
    "document['write'](x);",
    'document[`write`](x);',
    'window.document.write(x);',
    'window.document[`write`](x);',
    'document[`wr${"ite"}`](x);',
    'window.document[`wr${"ite"}`](x);',
    'window[`doc${"ument"}`][`wr${"ite"}`](x);',
    'window["document"]["write"](x);',
  ])('rejects %s in production code, tests, and scripts', async (code) => {
    for (const filePath of ['src/ui/lintProbe.ts', 'src/ui/lintProbe.test.ts', 'scripts/lintProbe.mjs']) {
      const results = await eslint.lintText(code, { filePath });
      expect(results[0]?.messages.filter((message) => sinkRules.has(message.ruleId ?? ''))).toEqual([
        expect.objectContaining({ severity: 2, message: expect.stringContaining('src/ui/trustedHtml.ts') }),
      ]);
    }
  });

  it('permits direct HTML injection only in the sink module', async () => {
    const results = await eslint.lintText('el.innerHTML = x; el.insertAdjacentHTML("beforeend", x); el[`innerHTML`] = x; el[`insertAdjacentHTML`]("beforeend", x); el[`inner${"HTML"}`] = x; document[`wr${"ite"}`](x);', { filePath: 'src/ui/trustedHtml.ts' });
    expect(results[0]?.messages.filter((message) => sinkRules.has(message.ruleId ?? ''))).toEqual([]);
  });

  it('permits HTML reads and calls to the trusted sink', async () => {
    const results = await eslint.lintText('setTrustedHtml(el, el.innerHTML); setTrustedHtml(el, el[`innerHTML`]); setTrustedHtml(el, el[`inner${"HTML"}`]); el[`text${"Content"}`] = x; insertTrustedHtml(el, "beforeend", x);', { filePath: 'src/ui/lintProbe.ts' });
    expect(results[0]?.messages.filter((message) => sinkRules.has(message.ruleId ?? ''))).toEqual([]);
  });
});
