// Metro only watches the app folder by default; the shared map logic lives in ../src.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, '../src')];

module.exports = config;
