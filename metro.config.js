const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname, { isCSSEnabled: true });

if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

module.exports = config;
