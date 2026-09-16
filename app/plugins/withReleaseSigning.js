// Signs release builds with the keystore given in env vars; falls back to the debug key locally.
// METAKAI_KEYSTORE (path), METAKAI_KEYSTORE_PASSWORD, METAKAI_KEY_ALIAS, METAKAI_KEY_PASSWORD
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_CONFIG = `
        release {
            if (System.getenv('METAKAI_KEYSTORE')) {
                storeFile file(System.getenv('METAKAI_KEYSTORE'))
                storePassword System.getenv('METAKAI_KEYSTORE_PASSWORD')
                keyAlias System.getenv('METAKAI_KEY_ALIAS')
                keyPassword System.getenv('METAKAI_KEY_PASSWORD')
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (gradle.includes("METAKAI_KEYSTORE")) return cfg;
    gradle = gradle.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
      "$1signingConfig System.getenv('METAKAI_KEYSTORE') ? signingConfigs.release : signingConfigs.debug",
    );
    gradle = gradle.replace(/signingConfigs\s*\{/, (m) => `${m}${RELEASE_CONFIG}`);
    cfg.modResults.contents = gradle;
    return cfg;
  });
};
