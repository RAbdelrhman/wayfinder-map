import { describe, expect, it } from 'vitest';
import { patchAppBuildGradle } from '../../plugins/withSharedSources';

describe('shared native bundle inputs', () => {
  it('makes the generated Android bundle task track repository shared sources', () => {
    const result = patchAppBuildGradle('apply plugin: "com.android.application"\n');
    expect(result).toContain("task.name.startsWith('createBundle')");
    expect(result).toContain("task.name.endsWith('JsAndAssets')");
    expect(result).toContain("task.inputs.dir(rootProject.file('../../src'))");
    expect(result).toContain('PathSensitivity.RELATIVE');
  });
  it('does not append a second configuration on repeated prebuilds', () => {
    const first = patchAppBuildGradle('original\n');
    expect(patchAppBuildGradle(first)).toBe(first);
  });
});
