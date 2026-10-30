// Metro only watches the app folder by default; the shared map logic lives in ../src.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, '../src')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules'), ...(config.resolver.nodeModulesPaths ?? [])];
// Desktop ESM imports name .js outputs; Metro consumes their TypeScript sources.
const sharedRoot = path.resolve(__dirname, '../src') + path.sep;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (context.originModulePath.startsWith(sharedRoot) && moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    return context.resolveRequest(context, moduleName.slice(0, -3), platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
