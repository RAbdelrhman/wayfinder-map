import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('Home stylesheet sections', () => {
  it('closes the progress streak icon rule before the navigation styles', async () => {
    const styles = await readFile(new URL('./styles.css', import.meta.url), 'utf8');

    expect(styles).toMatch(/\.progress-streak \.i\s*\{[^{}]*\}\s*\/\* ---------- shared navigation shell ---------- \*\//);
  });
});
