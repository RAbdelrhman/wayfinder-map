import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

/** The stylesheet without comments or string contents, so only its structure is left. */
function structure(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, '""');
}

/** Top-level rules and at-rules, whitespace-normalised. */
function topLevelBlocks(css: string): string[] {
  const blocks: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        blocks.push(css.slice(start, index + 1).replace(/\s+/g, ' ').trim());
        start = index + 1;
      }
    }
  }
  return blocks;
}

/** The custom properties declared in the first block that opens with `selector`. */
function tokens(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No block for ${selector}`);
  const body = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{3,6})\s*;/gi)].map((match) => [match[1] ?? '', match[2] ?? '']));
}

function luminance(hex: string): number {
  const full = hex.length === 4 ? `#${[...hex.slice(1)].map((digit) => digit + digit).join('')}` : hex;
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((offset) => {
    const channel = parseInt(full.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

describe('styles.css', () => {
  it('keeps text tokens at WCAG AA (4.5:1) on both surfaces in every theme', async () => {
    const css = await readFile(new URL('./styles.css', import.meta.url), 'utf8');
    const light = tokens(css, '.viz-root');
    const themes = {
      light,
      'dark (system)': { ...light, ...tokens(css, ":root:where(:not([data-theme='light'])) .viz-root") },
      'dark (chosen)': { ...light, ...tokens(css, ":root[data-theme='dark'] .viz-root") },
    };
    const failures: string[] = [];
    for (const [theme, values] of Object.entries(themes)) {
      const pairs: [string, string][] = [
        ...['--text-muted', '--accent-text', '--state-failed', '--handoff-pr-ready', '--handoff-needs-you'].flatMap((text): [string, string][] => [
          [text, '--surface-1'],
          [text, '--plane'],
        ]),
        ['--on-accent', '--accent-fill'],
      ];
      for (const [fg, bg] of pairs) {
        const ratio = contrast(values[fg] ?? '', values[bg] ?? '');
        if (!(ratio >= 4.5)) failures.push(`${theme}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('closes every block, so no rule is swallowed by an unclosed media query', async () => {
    const css = structure(await readFile(new URL('./styles.css', import.meta.url), 'utf8'));
    let depth = 0;
    let lowest = 0;
    for (const char of css) {
      if (char === '{') depth += 1;
      if (char === '}') depth -= 1;
      lowest = Math.min(lowest, depth);
    }
    expect({ lowest, depth }).toEqual({ lowest: 0, depth: 0 });
  });

  it('never puts an at-rule inside a selector list, which browsers drop', async () => {
    const preludes = topLevelBlocks(structure(await readFile(new URL('./styles.css', import.meta.url), 'utf8'))).map((block) => block.slice(0, block.indexOf('{')).trim());
    expect(preludes.filter((prelude) => prelude.includes('@') && !prelude.startsWith('@'))).toEqual([]);
  });

  it('does not repeat a rule block word for word', async () => {
    const blocks = topLevelBlocks(structure(await readFile(new URL('./styles.css', import.meta.url), 'utf8')));
    const repeated = blocks.filter((block, index) => blocks.indexOf(block) !== index);
    expect(repeated).toEqual([]);
  });
});
