// Adds build values that come from environment variables (app/.env) to app.json.
module.exports = ({ config }) => {
  // Google Sign-In on iOS needs the reversed iOS OAuth client ID as a URL scheme.
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const plugins = config.plugins.map((plugin) =>
    plugin === '@react-native-google-signin/google-signin' && iosClientId
      ? [plugin, { iosUrlScheme: `com.googleusercontent.apps.${iosClientId.replace('.apps.googleusercontent.com', '')}` }]
      : plugin,
  );
  return { ...config, plugins };
};
