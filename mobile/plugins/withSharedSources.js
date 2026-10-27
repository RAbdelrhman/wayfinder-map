const { withAppBuildGradle } = require('expo/config-plugins');

const marker = '// wayfinder-shared-bundle-inputs';
/** @param {string} contents @returns {string} */
function patchAppBuildGradle(contents) {
  if (contents.includes(marker)) return contents;
  return `${contents}\n${marker}
// Metro watches ../src, and Gradle must also invalidate its embedded JS bundle when those files change.
tasks.configureEach { task ->
    if (task.name.startsWith('createBundle') && task.name.endsWith('JsAndAssets')) {
        task.inputs.dir(rootProject.file('../../src'))
            .withPathSensitivity(org.gradle.api.tasks.PathSensitivity.RELATIVE)
    }
}
`;
}

/** @type {import('expo/config-plugins').ConfigPlugin} */
const withSharedSources = (config) => withAppBuildGradle(config, (mod) => {
  if (mod.modResults.language !== 'groovy') throw new Error('Wayfinder shared bundle inputs require a Groovy Android app build file.');
  mod.modResults.contents = patchAppBuildGradle(mod.modResults.contents);
  return mod;
});
module.exports = withSharedSources;
module.exports.patchAppBuildGradle = patchAppBuildGradle;
