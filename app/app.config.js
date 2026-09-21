// Adds build values that come from environment variables (app/.env) to app.json, and drops what the
// free-software build can't use (see flavor.js).
const { isFoss, PROPRIETARY } = require('./flavor');

const pluginName = (plugin) => (Array.isArray(plugin) ? plugin[0] : plugin);

module.exports = ({ config }) => {
  // Google Sign-In on iOS needs the reversed iOS OAuth client ID as a URL scheme.
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  let plugins = config.plugins.map((plugin) =>
    plugin === '@react-native-google-signin/google-signin' && iosClientId
      ? [plugin, { iosUrlScheme: `com.googleusercontent.apps.${iosClientId.replace('.apps.googleusercontent.com', '')}` }]
      : plugin,
  );
  if (!isFoss()) return { ...config, plugins };

  plugins = plugins.filter((plugin) => !PROPRIETARY.includes(pluginName(plugin)));

  // The free build signs in to Google in a browser tab, which comes back to the app on the OAuth
  // client's own URL scheme (com.googleusercontent.apps.<client id>).
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_NATIVE_CLIENT_ID || iosClientId;
  const intentFilters = [...(config.android?.intentFilters ?? [])];
  if (clientId) {
    intentFilters.push({
      action: 'VIEW',
      category: ['DEFAULT', 'BROWSABLE'],
      data: [{ scheme: `com.googleusercontent.apps.${clientId.replace('.apps.googleusercontent.com', '')}` }],
    });
  }
  return { ...config, plugins, android: { ...config.android, intentFilters } };
};
