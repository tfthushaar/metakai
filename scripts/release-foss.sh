#!/usr/bin/env bash
# Builds the free-software APK (no Google Play services, Firebase or ML Kit) into dist/, the way F-Droid
# builds it: from a clean copy of what is committed, with the Google-backed packages taken out and every
# Expo module compiled from source. Commit first: uncommitted changes are not in the build.
# Needs the Android SDK. Signs with the upload key in ~/.metakai-signing when there is one, otherwise
# with the debug key, which installs fine but isn't for release.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SIGNING="${METAKAI_SIGNING_DIR:-$HOME/.metakai-signing}"
WORK="${METAKAI_FOSS_DIR:-${TMPDIR:-/tmp}/metakai-foss}"
ARCHITECTURES="${METAKAI_FOSS_ARCHITECTURES:-arm64-v8a,armeabi-v7a,x86_64}"

if [ -f "$SIGNING/credentials.txt" ]; then
  # shellcheck disable=SC1091
  . "$SIGNING/credentials.txt"
  export METAKAI_KEYSTORE="$SIGNING/metakai-release.jks"
  export METAKAI_KEYSTORE_PASSWORD="$ANDROID_KEYSTORE_PASSWORD"
  export METAKAI_KEY_ALIAS="$ANDROID_KEY_ALIAS"
  export METAKAI_KEY_PASSWORD="$ANDROID_KEY_PASSWORD"
else
  echo "No signing key in $SIGNING: the APK will be signed with the debug key." >&2
  unset METAKAI_KEYSTORE
fi
if [ -z "${ANDROID_HOME:-}" ]; then
  if [ -n "${LOCALAPPDATA:-}" ]; then export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"; else export ANDROID_HOME="$HOME/Library/Android/sdk"; fi
fi
export EXPO_NO_TELEMETRY=1
unset METAKAI_FLAVOR

if [ -n "$(git -C "$ROOT" status --porcelain --untracked-files=no -- . ':!docs/app' ':!docs/404.html')" ]; then
  echo "There are uncommitted changes, and they won't be in this build. Commit them first." >&2
  exit 1
fi

rm -rf "$WORK"
mkdir -p "$WORK"
git -C "$ROOT" archive HEAD | tar -x -C "$WORK"
cd "$WORK/app"

VERSION="$(node -p "require('./app.json').expo.version")"
node ../scripts/flavor.mjs foss --remove-packages --from-source
npm ci --no-audit --no-fund
npx expo prebuild --platform android --clean --no-install
(cd android && ./gradlew assembleRelease "-PreactNativeArchitectures=$ARCHITECTURES")

APK="$(ls android/app/build/outputs/apk/release/*.apk | head -1)"
node ../scripts/check-foss-apk.mjs "$APK"
mkdir -p "$ROOT/dist"
cp "$APK" "$ROOT/dist/metakai-$VERSION-foss.apk"
rm -rf "$WORK"
echo "Built dist/metakai-$VERSION-foss.apk"
