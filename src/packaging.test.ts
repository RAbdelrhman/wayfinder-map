import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function read(relativePath: string): Promise<string> {
  return readFile(join(root, relativePath), 'utf8');
}

describe('Windows packaging contract', () => {
  it('keeps the installer metadata and bundled runtime assets together', async () => {
    const packageJson = JSON.parse(await read('package.json')) as {
      main?: string;
      files?: string[];
      scripts?: Record<string, string>;
    };
    const builder = await read('electron-builder.config.cjs');

    expect(packageJson.main).toBe('dist/desktop.cjs');
    expect(packageJson.files).toEqual(expect.arrayContaining(['dist/cli.js', 'dist/ui']));
    expect(packageJson.scripts?.['package:win']).toBe('node scripts/package-win.mjs');
    expect(packageJson.scripts?.['smoke:win']).toBe('node scripts/smoke-win.mjs');
    expect(builder).toContain("productName: 'Wayfinder'");
    expect(builder).toContain("appId: 'com.rabdelrhman.wayfinder'");
    expect(builder).toContain("files: ['dist/**/*', 'package.json']");
    expect(builder).toContain("icon: '.generated/Wayfinder.ico'");
    expect(builder).toContain('createStartMenuShortcut: true');
    expect(builder).toContain("shortcutName: 'Wayfinder'");
    expect(builder).toContain("uninstallDisplayName: 'Wayfinder'");
    expect(builder).toContain('artifactSuffix');
  });

  it('builds both supported architectures, smoke-tests the installed app, and publishes checksums', async () => {
    const workflow = await read('.github/workflows/release-windows.yml');
    const smoke = await read('scripts/smoke-win.mjs');

    expect(workflow).toContain('arch: [x64, arm64]');
    expect(workflow).toContain('bun run package:win -- ${{ matrix.arch }}');
    expect(workflow).toContain('bun run smoke:win -- ${{ matrix.arch }}');
    expect(workflow).toContain('SHA256SUMS-*.txt');
    expect(workflow).toContain('softprops/action-gh-release@v2');
    expect(workflow).toContain('WIN_CSC_LINK');
    expect(workflow).toContain("prerelease: ${{ contains(github.ref_name, '-') }}");
    expect(smoke).toContain('WAYFINDER_SMOKE_FILE');
    expect(smoke).toContain("marker.route !== '/' || marker.homeStatus !== 200");
    expect(smoke).toContain('Wayfinder left its loopback server listening');
  });
});
