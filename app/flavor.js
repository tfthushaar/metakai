// Which build this is. Metakai ships two from one source tree:
//   standard  Play Store and GitHub releases. Sign-in, notifications, GPS and the barcode scanner
//             use Google Play services, Firebase and ML Kit.
//   foss      F-Droid and the free-software APK. None of that is installed or linked; free
//             replacements in foss-modules/ and the *.foss.ts(x) files stand in for it.
const fs = require('fs');
const path = require('path');

/** Packages that bring in Google Play services, Firebase or ML Kit. */
const PROPRIETARY = ['@react-native-google-signin/google-signin', 'expo-camera', 'expo-location', 'expo-notifications', 'expo-task-manager'];

const installed = (name) => fs.existsSync(path.join(__dirname, 'node_modules', name));

/**
 * METAKAI_FLAVOR=foss or standard decides. Without it, a tree that doesn't have the proprietary
 * packages installed (F-Droid removes them before building) is the free build.
 */
function isFoss() {
  const chosen = process.env.METAKAI_FLAVOR;
  if (chosen) return chosen === 'foss';
  return installed('expo') && PROPRIETARY.every((name) => !installed(name));
}

module.exports = { isFoss, PROPRIETARY };
