import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function read(relativePath: string): Promise<string> {
  return readFile(join(root, relativePath), 'utf8');
}

describe('in-app canvas launch (#215)', () => {
  it('presents the in-app canvas in the README with its screenshots', async () => {
    const readme = await read('README.md');

    expect(readme).toContain('## The in-app canvas');
    expect(readme).not.toMatch(/opens? full size in a new tab/);
    for (const [, image = ''] of readme.matchAll(/!\[[^\]]*\]\((docs\/images\/[^)]+)\)/g)) {
      await expect(access(join(root, image))).resolves.toBeUndefined();
    }
    expect(readme).toContain('docs/images/in-app-canvas-pin.png');
  });

  it('puts a Highlights section ahead of Features in the release notes', async () => {
    const config = JSON.parse(await read('release-please-config.json')) as {
      packages: Record<string, { 'changelog-sections'?: { type: string; section: string; hidden?: boolean }[] }>;
    };
    const sections = config.packages['.']?.['changelog-sections'] ?? [];

    expect(sections[0]).toEqual({ type: 'highlight', section: 'Highlights' });
    const shown = sections.filter((s) => !s.hidden).map((s) => s.type);
    expect(shown.slice(0, 3)).toEqual(['highlight', 'feat', 'feature']);
    expect(shown).toEqual(expect.arrayContaining(['fix', 'perf', 'revert']));
  });
});
