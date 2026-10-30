const { withAppBuildGradle } = require('expo/config-plugins');

const marker = '// wayfinder-shared-bundle-inputs';
/** @param {string} contents @returns {string} */
function patchAppBuildGradle(contents) {
  const configuration = `${marker}
// Metro watches ../src, and Gradle must also invalidate its embedded JS bundle when those files change.
tasks.configureEach { task ->
    if (task.name.startsWith('createBundle') && task.name.endsWith('JsAndAssets')) {
        // Gradle's worker cap does not limit Metro's separate Node worker pool.
        task.extraPackagerArgs.addAll(['--max-workers', '2'])
        task.inputs.dir(rootProject.file('../../src'))
            .withPathSensitivity(org.gradle.api.tasks.PathSensitivity.RELATIVE)
        // Expo inlines .env and process environment values. Always rebundle to avoid stale sign-in configuration.
        task.outputs.upToDateWhen { false }
    }
}
`;
  if (contents.includes(marker)) {
    return contents.replace(/\/\/ wayfinder-shared-bundle-inputs[\s\S]*?\r?\n}\r?\n?/, configuration);
  }
  return `${contents}\n${configuration}`;
}

/** @type {import('expo/config-plugins').ConfigPlugin} */
const withSharedSources = (config) => withAppBuildGradle(config, (mod) => {
  if (mod.modResults.language !== 'groovy') throw new Error('Wayfinder shared bundle inputs require a Groovy Android app build file.');
  mod.modResults.contents = patchAppBuildGradle(mod.modResults.contents);
  return mod;
});
module.exports = withSharedSources;
module.exports.patchAppBuildGradle = patchAppBuildGradle;
