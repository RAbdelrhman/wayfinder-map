import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('root lint CI coverage', () => {
  it.each(['ci.yml', 'release-windows.yml'])('gates each root install in %s with lint before typecheck', (name) => {
    const workflow = readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');
    const lines = workflow.split(/\r?\n/);
    const installs = lines.flatMap((line, index) => line.includes('run: bun install --frozen-lockfile --ignore-scripts') ? [index] : []);
    expect(installs.length).toBeGreaterThan(0);
    for (const index of installs) {
      expect(lines[index + 1]?.trim()).toBe('- run: bun run lint');
      expect(lines[index + 2]?.trim()).toBe('- run: bun run typecheck');
    }
  });

  it('runs root PR checks without path filters or mobile working-directory defaults', () => {
    const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
    const triggers = workflow.slice(0, workflow.indexOf('\npermissions:'));
    expect(triggers).toMatch(/^ {2}pull_request:\s*$/m);
    expect(triggers).toContain('branches: [main]');
    expect(triggers).not.toMatch(/^\s*paths(?:-ignore)?:/m);
    expect(workflow).not.toContain('working-directory:');
  });
});
