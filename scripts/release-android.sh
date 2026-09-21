#!/usr/bin/env bash
# Builds a signed Play Store bundle (.aab) and a sideloadable APK into dist/.
# Needs the Android SDK and the upload key in ~/.metakai-signing (metakai-release.jks, credentials.txt).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SIGNING="${METAKAI_SIGNING_DIR:-$HOME/.metakai-signing}"

# shellcheck disable=SC1091
. "$SIGNING/credentials.txt"
export METAKAI_KEYSTORE="$SIGNING/metakai-release.jks"
export METAKAI_KEYSTORE_PASSWORD="$ANDROID_KEYSTORE_PASSWORD"
export METAKAI_KEY_ALIAS="$ANDROID_KEY_ALIAS"
export METAKAI_KEY_PASSWORD="$ANDROID_KEY_PASSWORD"
if [ -z "${ANDROID_HOME:-}" ]; then
  if [ -n "${LOCALAPPDATA:-}" ]; then export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"; else export ANDROID_HOME="$HOME/Library/Android/sdk"; fi
fi

cd "$ROOT/app"
# .env.local holds local test settings that must never reach a release.
if [ -e .env.local ]; then
  echo "app/.env.local exists and would be bundled into the release. Move it out first." >&2
  exit 1
fi

# This is the standard build, with Google Play services. The free-software one is scripts/release-foss.sh.
unset METAKAI_FLAVOR
node ../scripts/flavor.mjs standard

VERSION="$(node -p "require('./app.json').expo.version")"
npx expo prebuild --platform android --clean --no-install
(cd android && ./gradlew bundleRelease assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a)

mkdir -p "$ROOT/dist"
cp android/app/build/outputs/bundle/release/app-release.aab "$ROOT/dist/metakai-$VERSION.aab"
cp android/app/build/outputs/apk/release/app-release.apk "$ROOT/dist/metakai-$VERSION.apk"
echo "Built dist/metakai-$VERSION.aab and dist/metakai-$VERSION.apk"
