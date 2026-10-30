import { describe, expect, it } from 'vitest';
import { patchAppBuildGradle } from '../../plugins/withSharedSources';

describe('shared native bundle inputs', () => {
  it('makes the generated Android bundle task track repository shared sources', () => {
    const result = patchAppBuildGradle(
      'apply plugin: "com.android.application"\n',
    );
    expect(result).toContain("task.name.startsWith('createBundle')");
    expect(result).toContain("task.name.endsWith('JsAndAssets')");
    expect(result).toContain("task.inputs.dir(rootProject.file('../../src'))");
    expect(result).toContain('PathSensitivity.RELATIVE');
    expect(result).toContain('task.outputs.upToDateWhen { false }');
    expect(result).toContain("task.extraPackagerArgs.addAll(['--max-workers', '2'])");
  });
  it('does not append a second configuration on repeated prebuilds', () => {
    const first = patchAppBuildGradle('original\n');
    expect(patchAppBuildGradle(first)).toBe(first);
  });
  it('upgrades an older generated configuration during prebuild', () => {
    const old =
      'original\n// wayfinder-shared-bundle-inputs\ntasks.configureEach { task ->\n    if (true) {\n    }\n}\n// later plugin\n';
    const result = patchAppBuildGradle(old);
    expect(result).toContain('task.outputs.upToDateWhen { false }');
    expect(result).toContain('// later plugin');
    expect(result.match(/wayfinder-shared-bundle-inputs/g)).toHaveLength(1);
  });
});
