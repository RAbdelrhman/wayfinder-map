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

describe('styles.css', () => {
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

  it('does not repeat a rule block word for word', async () => {
    const blocks = topLevelBlocks(structure(await readFile(new URL('./styles.css', import.meta.url), 'utf8')));
    const repeated = blocks.filter((block, index) => blocks.indexOf(block) !== index);
    expect(repeated).toEqual([]);
  });
});
