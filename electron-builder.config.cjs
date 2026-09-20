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
  extraResources: [{ from: '.generated/Wayfinder.ico', to: 'Wayfinder.ico' }],
  win: {
    icon: '.generated/Wayfinder.ico',
    target: [{ target: 'nsis', arch: [arch] }],
    artifactName: `Wayfinder-\${version}-${arch}-Setup.\${ext}`,
    verifyUpdateCodeSignature: true,
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
