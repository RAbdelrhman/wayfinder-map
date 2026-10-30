import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

it.skipIf(process.platform !== 'win32')('rejects a long native build root before invoking build tools', () => {
  const root = mkdtempSync(join(tmpdir(), 'wayfinder-native-path-that-exceeds-the-windows-limit-'));
  try {
    mkdirSync(join(root, 'scripts'));
    copyFileSync(resolve('scripts/build-mobile-android.ps1'), join(root, 'scripts/build-mobile-android.ps1'));
    expect(() => execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts/build-mobile-android.ps1')], { stdio: 'pipe' })).toThrow('Android native builds need a real checkout path');
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 30_000);

it.skipIf(process.platform !== 'win32')(
  'retains distinct APKs, records failed installations, and refuses source changes',
  () => {
    const root = mkdtempSync(join(tmpdir(), 'wayfinder-archive-'));
    try {
      const scripts = join(root, 'scripts');
      const mobile = join(root, 'mobile');
      const apkDir = join(mobile, 'android/app/build/outputs/apk/release');
      mkdirSync(scripts, { recursive: true });
      mkdirSync(apkDir, { recursive: true });
      copyFileSync(
        resolve('scripts/build-mobile-android.ps1'),
        join(scripts, 'build-mobile-android.ps1'),
      );
      writeFileSync(
        join(mobile, 'app.json'),
        JSON.stringify({
          expo: {
            version: '1.1.0',
            android: { package: 'test.wayfinder', versionCode: 2 },
          },
        }),
      );
      writeFileSync(
        join(apkDir, 'app-release.apk'),
        'test APK, never installed',
      );
      writeFileSync(join(root, '.gitignore'), 'mobile/.env.*\n');
      writeFileSync(join(mobile, '.env.production.local'), 'EXPO_PUBLIC_TEST_VALUE=before\n');
      for (const args of [
        ['init', '--quiet'],
        [
          '-c',
          'user.name=Test',
          '-c',
          'user.email=test@example.com',
          'commit',
          '--allow-empty',
          '-m',
          'test',
        ],
      ]) {
        execFileSync('git', args, { cwd: root, stdio: 'pipe' });
      }
      const testScript = join(root, 'exercise.ps1');
      writeFileSync(
        testScript,
        `
$ErrorActionPreference = 'Stop'
# Reproduce an unavailable Get-FileHash command, as seen in Windows CI.
function global:Get-FileHash { throw 'Get-FileHash is unavailable in this test host' }
$archive = Join-Path $PSScriptRoot 'archive'
& (Join-Path $PSScriptRoot 'scripts/build-mobile-android.ps1') -SkipBuild -OutputDirectory $archive
function global:adb { $global:LASTEXITCODE = 1 }
try {
  & (Join-Path $PSScriptRoot 'scripts/build-mobile-android.ps1') -SkipBuild -OutputDirectory $archive -DeviceSerial 'mock-failure'
  throw 'Expected installation failure'
} catch {
  if ($_.Exception.Message -notlike 'Phone installation failed*') { throw }
}
$buildGitExe = (Get-Command git).Source
$script:sourceReads = 0
function global:git {
  if ($args -contains 'rev-parse') {
    $script:sourceReads++
    if ($script:sourceReads -eq 2) {
      if ($script:changeProductionEnv) { Add-Content -LiteralPath (Join-Path $PSScriptRoot 'mobile/.env.production.local') -Value 'EXPO_PUBLIC_TEST_VALUE=after' }
      else { Add-Content -LiteralPath (Join-Path $PSScriptRoot 'mobile/app.json') -Value ' ' }
    }
  }
  & $buildGitExe @args
}
try {
  & (Join-Path $PSScriptRoot 'scripts/build-mobile-android.ps1') -SkipBuild -OutputDirectory $archive
  throw 'Expected changed-source refusal'
} catch {
  if ($_.Exception.Message -notlike 'Source changed during the build*') { throw }
}
$script:sourceReads = 0
$script:changeProductionEnv = $true
try {
  & (Join-Path $PSScriptRoot 'scripts/build-mobile-android.ps1') -SkipBuild -OutputDirectory $archive
  throw 'Expected changed-production-env refusal'
} catch {
  if ($_.Exception.Message -notlike 'Source changed during the build*') { throw }
}
`,
      );
      execFileSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', testScript],
        { cwd: root, stdio: 'pipe' },
      );
      const archive = join(root, 'archive');
      const manifests = readdirSync(archive)
        .filter((file) => file.endsWith('.json'))
        .map(
          (file) =>
            JSON.parse(
              readFileSync(join(archive, file), 'utf8').replace(/^\uFEFF/, ''),
            ) as {
              apk: string;
              buildId: string;
              installationStatus: string;
              installedAt: string | null;
              sha256: string;
            },
        );
      expect(
        readdirSync(archive).filter((file) => file.endsWith('.apk')),
      ).toHaveLength(2);
      expect(new Set(manifests.map((manifest) => manifest.buildId)).size).toBe(
        2,
      );
      expect(
        manifests.map((manifest) => manifest.installationStatus).sort(),
      ).toEqual(['failed', 'not-attempted']);
      for (const manifest of manifests) {
        expect(readFileSync(manifest.apk, 'utf8')).toBe(
          'test APK, never installed',
        );
        expect(manifest.installedAt).toBeNull();
        expect(manifest.sha256).toBe(
          createHash('sha256').update(readFileSync(manifest.apk)).digest('hex'),
        );
      }
    } finally {
      // mkdtemp creates this exact isolated child of the OS temp directory.
      if (resolve(root).startsWith(resolve(tmpdir()) + '\\'))
        rmSync(root, { recursive: true, force: true });
    }
  },
  30_000,
);
