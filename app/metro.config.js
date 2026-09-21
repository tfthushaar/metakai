const { getDefaultConfig } = require('expo/metro-config');

const { isFoss } = require('./flavor');

const config = getDefaultConfig(__dirname);

if (isFoss()) {
  // In the free build, google.foss.ts beside google.ts replaces it, and so on for every *.foss.ts(x).
  config.resolver.sourceExts = ['foss.ts', 'foss.tsx', ...config.resolver.sourceExts];
  config.cacheVersion = 'foss';
}

module.exports = config;
