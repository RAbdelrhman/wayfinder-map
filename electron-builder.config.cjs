const arch = process.env.WAYFINDER_BUILD_ARCH === 'arm64' ? 'arm64' : 'x64';

module.exports = {
  appId: 'com.rabdelrhman.wayfinder',
  productName: 'Wayfinder',
  asar: true,
  compression: 'maximum',
  directories: {
    output: `release/${arch}`,
  },
  files: ['dist/**/*', 'package.json'],
  // electron-updater is bundled into dist/desktop.cjs and kept out of `dependencies` so the CLI package
  // installs nothing. builder reads that field to pick the update-info format, so name it here.
  electronUpdaterCompatibility: '>=2.16',
  extraResources: [{ from: '.generated/Wayfinder.ico', to: 'Wayfinder.ico' }],
  win: {
    icon: '.generated/Wayfinder.ico',
    target: [{ target: 'nsis', arch: [arch] }],
    artifactName: `Wayfinder-\${version}-${arch}-Setup.\${ext}`,
    verifyUpdateCodeSignature: false,
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Wayfinder',
    uninstallDisplayName: 'Wayfinder',
    deleteAppDataOnUninstall: false,
  },
  publish: {
    provider: 'github',
    owner: 'RAbdelrhman',
    repo: 'wayfinder-map',
    channel: `latest-${arch}`,
  },
};
