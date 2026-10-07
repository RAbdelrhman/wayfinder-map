import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('root lint CI coverage', () => {
  it.each(['mobile.yml', 'release-windows.yml'])('gates each root install in %s with lint before typecheck', (name) => {
    const workflow = readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');
    const lines = workflow.split(/\r?\n/);
    const installs = lines.flatMap((line, index) => line.includes('run: bun install --frozen-lockfile --ignore-scripts') ? [index] : []);
    expect(installs.length).toBeGreaterThan(0);
    for (const index of installs) {
      expect(lines[index + 1]?.trim()).toBe('- run: bun run lint');
      expect(lines[index + 2]?.trim()).toBe('- run: bun run typecheck');
    }
  });

  it('runs PR checks for every directory and config used by root lint', () => {
    const workflow = readFileSync(new URL('../.github/workflows/mobile.yml', import.meta.url), 'utf8');
    const triggers = workflow.slice(0, workflow.indexOf('\npermissions:'));
    for (const path of ['src/**', 'scripts/**', 'package.json', 'bun.lockb', 'eslint.config.mjs']) {
      expect(triggers.split(`- '${path}'`)).toHaveLength(3);
    }
  });
});
